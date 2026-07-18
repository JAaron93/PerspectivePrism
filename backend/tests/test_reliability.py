import pytest
from unittest.mock import AsyncMock, MagicMock, patch
import time
from app.services.analysis_service import AnalysisService, AnalysisServiceError
from google.genai import errors
from app.main import app
from httpx import AsyncClient, ASGITransport

# Fixture to initialize AnalysisService with mocks
@pytest.fixture
def analysis_service_mock():
    with patch("app.services.analysis_service.settings") as mock_settings:
        mock_settings.GEMINI_API_KEY = "sk-primary"
        mock_settings.LLM_API_KEY = ""
        mock_settings.LLM_MODEL = "gemini-3.5-flash"
        mock_settings.BACKUP_LLM_MODEL = "gemini-3.1-flash-lite"
        mock_settings.CIRCUIT_BREAKER_FAIL_THRESHOLD = 3
        mock_settings.CIRCUIT_BREAKER_RESET_TIMEOUT = 10


        service = AnalysisService()
        
        # Mock _run_agent_direct
        service._run_agent_direct = AsyncMock()
        
        yield service


@pytest.mark.asyncio
async def test_fallback_success(analysis_service_mock):
    """Test that we fall back to backup agent when primary transiently fails."""
    service = analysis_service_mock
    
    # Create mock transient APIError
    transient_error = errors.ClientError(429, "Rate limit exceeded", None)
    
    # Setup _run_agent_direct to fail for primary (first call) and succeed for backup (second call)
    mock_result = MagicMock()
    mock_result.stance = "Support"
    mock_result.confidence = 0.9
    mock_result.explanation = "Backup works"
    
    async def mock_run(agent, user_prompt, output_key, is_backup=False):
        if is_backup:
            return mock_result
        raise transient_error
        
    service._run_agent_direct.side_effect = mock_run

    # Execute
    result = await service._run_agent_with_fallback(
        service.perspective_agent_primary,
        service.perspective_agent_backup,
        "test prompt",
        "perspective_result",
    )
    
    # Verify
    assert result == mock_result
    assert service._run_agent_direct.call_count == 2
    assert service.cb_failures == 1


@pytest.mark.asyncio
async def test_circuit_breaker_trips(analysis_service_mock):
    """Test that circuit breaker trips after threshold failures."""
    service = analysis_service_mock
    transient_error = errors.ClientError(429, "Rate limit exceeded", None)
    
    mock_result = MagicMock()
    
    async def mock_run(agent, user_prompt, output_key, is_backup=False):
        if is_backup:
            return mock_result
        raise transient_error
        
    service._run_agent_direct.side_effect = mock_run

    # Generate enough failures to trip CB (Threshold is 3)
    for _ in range(3):
        await service._run_agent_with_fallback(
            service.perspective_agent_primary,
            service.perspective_agent_backup,
            "test",
            "perspective_result",
        )

    assert service.cb_open is True
    assert service.cb_failures >= 3
    
    # Next call should NOT try primary (is_backup=True is used directly)
    service._run_agent_direct.reset_mock()
    
    await service._run_agent_with_fallback(
        service.perspective_agent_primary,
        service.perspective_agent_backup,
        "test",
        "perspective_result",
    )
    
    # Should only call backup once, skipping primary
    service._run_agent_direct.assert_called_once_with(
        service.perspective_agent_backup,
        "test",
        "perspective_result",
        is_backup=True,
    )


@pytest.mark.asyncio
async def test_circuit_breaker_half_open_success(analysis_service_mock):
    """Test transition from Open -> Half-Open -> Closed on success."""
    service = analysis_service_mock
    service.cb_open = True
    service.cb_failures = 3
    service.cb_last_failure_time = time.time() - 20 # 20 seconds ago (Timeout is 10)
    
    mock_result = MagicMock()
    service._run_agent_direct.return_value = mock_result
    
    # Execute
    result = await service._run_agent_with_fallback(
        service.perspective_agent_primary,
        service.perspective_agent_backup,
        "test",
        "perspective_result",
    )
    
    assert result == mock_result
    # Should have called primary direct since half-open
    service._run_agent_direct.assert_called_once_with(
        service.perspective_agent_primary,
        "test",
        "perspective_result",
    )
    
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
    
    transient_error = errors.ClientError(429, "Rate limit exceeded", None)
    mock_result = MagicMock()
    
    async def mock_run(agent, user_prompt, output_key, is_backup=False):
        if is_backup:
            return mock_result
        raise transient_error
        
    service._run_agent_direct.side_effect = mock_run
    
    # Execute
    result = await service._run_agent_with_fallback(
        service.perspective_agent_primary,
        service.perspective_agent_backup,
        "test",
        "perspective_result",
    )
    
    assert result == mock_result
    
    # Verify State: Should be OPEN again
    assert service.cb_open is True
    assert service.cb_half_open is False
    assert service.cb_failures >= 3 
    assert abs(service.cb_last_failure_time - time.time()) < 1.0


@pytest.mark.asyncio
async def test_analyze_perspective_uses_fallback(analysis_service_mock):
    """Test that high-level analyze_perspective method uses fallback correctly."""
    service = analysis_service_mock
    transient_error = errors.ClientError(429, "Rate limit exceeded", None)
    
    mock_llm_result = MagicMock()
    mock_llm_result.stance = "Support"
    mock_llm_result.confidence = 0.9
    mock_llm_result.explanation = "Backup works"
    
    async def mock_run(agent, user_prompt, output_key, is_backup=False):
        if is_backup:
            return mock_llm_result
        raise transient_error
        
    service._run_agent_direct.side_effect = mock_run
    
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
        from app.main import analysis_service
        monkeypatch.setattr(analysis_service, "cb_failures", 0)
        monkeypatch.setattr(analysis_service, "cb_open", False)
        
        # 1. Healthy State (default)
        response = await ac.get("/health/llm")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        assert data["circuit_breaker_open"] is False
        
        # 2. Simulate Degraded State (Open Circuit)
        from app.main import analysis_service
        monkeypatch.setattr(analysis_service, "cb_open", True)
        
        response = await ac.get("/health/llm")
        data = response.json()
        assert data["status"] == "degraded"
        assert "Circuit breaker OPEN" in data["message"]
        assert data["circuit_breaker_open"] is True

