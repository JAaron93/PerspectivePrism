import pytest
from unittest.mock import AsyncMock, MagicMock, patch
import time
from app.services.analysis_service import AnalysisService
from app.main import app
from httpx import AsyncClient, ASGITransport

# Fixture to initialize AnalysisService with mocks
@pytest.fixture
def analysis_service_mock():
    # Use yield to keep the patch active during the test execution
    with patch("app.services.analysis_service.settings") as mock_settings:
        # Configure settings to enable backup
        mock_settings.LLM_PROVIDER = "openai"
        mock_settings.LLM_API_KEY = "sk-primary"
        mock_settings.LLM_BASE_URL = "https://primary.api"
        mock_settings.LLM_MODEL = "gpt-primary"
        mock_settings.BACKUP_LLM_API_KEY = "sk-backup"
        mock_settings.BACKUP_LLM_BASE_URL = "https://backup.api"
        mock_settings.BACKUP_LLM_MODEL = "gpt-backup"
        mock_settings.CIRCUIT_BREAKER_FAIL_THRESHOLD = 3
        mock_settings.CIRCUIT_BREAKER_RESET_TIMEOUT = 10


        service = AnalysisService()
        
        # Mock the API clients
        service.client = AsyncMock()
        service.backup_client = AsyncMock()
        
        yield service

def create_mock_response(content: str):
    """Helper to create a proper mock response structure."""
    mock_resp = MagicMock()
    choice = MagicMock()
    choice.message.content = content
    mock_resp.choices = [choice]
    return mock_resp

@pytest.mark.asyncio
async def test_fallback_success(analysis_service_mock):
    """Test that we fall back to backup provider when primary fails."""
    service = analysis_service_mock
    
    # Setup Primary to fail
    service.client.chat.completions.create.side_effect = Exception("Primary Database Connection Error")
    
    # Setup Backup to succeed
    service.backup_client.chat.completions.create.return_value = create_mock_response('{"status": "success"}')

    # Execute
    result = await service._call_llm("test prompt")
    
    # Verify
    assert result == '{"status": "success"}'
    assert service.client.chat.completions.create.call_count == 1
    assert service.backup_client.chat.completions.create.call_count == 1
    assert service.cb_failures == 1  # Should have incremented failures

@pytest.mark.asyncio
async def test_circuit_breaker_trips(analysis_service_mock):
    """Test that circuit breaker trips after threshold failures."""
    service = analysis_service_mock
    
    # Setup Primary to fail always
    service.client.chat.completions.create.side_effect = Exception("Continuous Error")
    
    # Setup Backup to succeed
    service.backup_client.chat.completions.create.return_value = create_mock_response('{"status": "backup"}')

    # Generate enough failures to trip CB (Threshold is 3)
    for _ in range(3):
        await service._call_llm("test")

    assert service.cb_open is True
    assert service.cb_failures >= 3
    
    # Next call should NOT try primary (mock call count should not increase)
    primary_call_count_before = service.client.chat.completions.create.call_count
    await service._call_llm("test") 
    primary_call_count_after = service.client.chat.completions.create.call_count
    
    assert primary_call_count_after == primary_call_count_before
    # Backup should still be called
    assert service.backup_client.chat.completions.create.call_count == 4

@pytest.mark.asyncio
async def test_circuit_breaker_half_open_success(analysis_service_mock):
    """Test transition from Open -> Half-Open -> Closed on success."""
    service = analysis_service_mock
    service.cb_open = True
    service.cb_failures = 3
    service.cb_last_failure_time = time.time() - 20 # 20 seconds ago (Timeout is 10)
    
    # Setup Primary to SUCCEED now (Probe succeeds)
    service.client.chat.completions.create.side_effect = None
    service.client.chat.completions.create.return_value = create_mock_response('{"status": "recovered"}')
    
    # Execute
    result = await service._call_llm("test")
    
    assert result == '{"status": "recovered"}'
    
    # Verify State: Should be CLOSED and failures reset
    assert service.cb_open is False
    assert service.cb_half_open is False
    assert service.cb_failures == 0

@pytest.mark.asyncio
async def test_circuit_breaker_half_open_failure(analysis_service_mock):
    """Test transition from Open -> Half-Open -> Open on failure."""
    service = analysis_service_mock
    service.cb_open = True
    service.cb_failures = 3
    service.cb_last_failure_time = time.time() - 20
    
    # Setup Primary to FAIL (Probe fails)
    service.client.chat.completions.create.side_effect = Exception("Still Broken")
    
    # Setup Backup to succeed
    service.backup_client.chat.completions.create.return_value = create_mock_response('{"status": "backup"}')
    
    # Execute
    result = await service._call_llm("test")
    
    assert result == '{"status": "backup"}'
    
    # Verify State: Should be OPEN again
    assert service.cb_open is True
    assert service.cb_half_open is False
    # Failures might remain high
    assert service.cb_failures >= 3 
    # Just to be sure, verify last_failure_time updated (approximately now)
    assert abs(service.cb_last_failure_time - time.time()) < 1.0


@pytest.mark.asyncio
async def test_analyze_perspective_uses_fallback(analysis_service_mock):
    """Test that high-level analyze_perspective method uses fallback correctly."""
    service = analysis_service_mock
    
    # Fail Primary
    service.client.chat.completions.create.side_effect = Exception("Fail")
    
    # Succeed Backup with valid JSON for PerspectiveAnalysis
    service.backup_client.chat.completions.create.return_value = create_mock_response(
        '{"stance": "Support", "confidence": 0.9, "explanation": "Backup works"}'
    )
    
    from app.models.schemas import Claim, PerspectiveType, Evidence
    claim = Claim(id="c1", text="Earth is round", timestamp_start=0, timestamp_end=1)
    perspective = PerspectiveType.SCIENTIFIC
    evidence = [Evidence(url="http://sci.com", title="Science", snippet="It is round", source="Nature", perspective=PerspectiveType.SCIENTIFIC)]
    
    result = await service.analyze_perspective(claim, perspective, evidence)
    
    assert result.stance == "Support"
    assert result.explanation == "Backup works"

@pytest.mark.asyncio
async def test_health_check_endpoints(monkeypatch):
    """Test the /health/llm endpoint."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        
        # 1. Healthy State (default)
        response = await ac.get("/health/llm")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        assert data["circuit_breaker_open"] is False
        
        # 2. Simulate Degraded State (Open Circuit)
        # Use monkeypatch to safely set attributes on the global analysis_service
        # State is automatically restored after the test
        from app.main import analysis_service
        monkeypatch.setattr(analysis_service, "cb_open", True)
        monkeypatch.setattr(analysis_service, "backup_client", MagicMock())
        
        response = await ac.get("/health/llm")
        data = response.json()
        assert data["status"] == "degraded"
        assert "Circuit breaker OPEN" in data["message"]
