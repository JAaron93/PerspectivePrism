import pytest
import asyncio
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.models.schemas import JobStatus

async def _poll_until_done(ac: AsyncClient, job_id: str) -> dict:
    for _ in range(20):
        status_resp = await ac.get(f"/analyze/jobs/{job_id}")
        assert status_resp.status_code == 200
        status_data = status_resp.json()
        if status_data["status"] in (JobStatus.COMPLETED.value, JobStatus.FAILED.value):
            return status_data
        await asyncio.sleep(0.5)
    return status_data

@pytest.mark.asyncio
async def test_integration_outbound_schema_and_sanitization(monkeypatch):
    """
    Integration test to verify:
    1. Outbound schema registration and returned payload shape.
    2. Input sanitization logic protects all LLM calls (via Rust layer).
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # Mock get_transcript to return a transcript with control characters
        from app.main import claim_extractor, analysis_service, evidence_retriever
        from app.models.schemas import (
            Transcript, TranscriptSegment, PerspectiveType, PerspectiveAnalysis, BiasAnalysis
        )
        
        async def mock_get_transcript_malicious(*args, **kwargs):
            return Transcript(
                video_id="malicious_vid",
                segments=[TranscriptSegment(text="This has a control character \x00 in it", start=0.0, duration=10.0)],
                full_text="This has a control character \x00 in it"
            )
            
        async def mock_retrieve_evidence(*args, **kwargs):
            return {PerspectiveType.SCIENTIFIC: []}
            
        async def mock_analyze_perspective(*args, **kwargs):
            return PerspectiveAnalysis(perspective=PerspectiveType.SCIENTIFIC, stance="Support", confidence=0.9, explanation="Valid", evidence=[])
            
        async def mock_analyze_bias(*args, **kwargs):
            return BiasAnalysis(deception_rating=2.0, deception_rationale="Low deception")
            
        monkeypatch.setattr(claim_extractor, "get_transcript", mock_get_transcript_malicious)
        monkeypatch.setattr(evidence_retriever, "retrieve_evidence", mock_retrieve_evidence)
        monkeypatch.setattr(analysis_service, "analyze_perspective", mock_analyze_perspective)
        monkeypatch.setattr(analysis_service, "analyze_bias_and_deception", mock_analyze_bias)
        
        # We need to disable the background task processing lock or just wait for it to fail.
        response = await ac.post("/analyze/jobs", json={"url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"})
        assert response.status_code == 200
        data = response.json()
        assert "job_id" in data
        job_id = data["job_id"]
        
        # Poll for completion
        status_data = await _poll_until_done(ac, job_id)
            
        # The job should have COMPLETED but the claim should be an error claim because extract_claims swallows exceptions
        assert status_data["status"] == JobStatus.COMPLETED.value
        assert len(status_data["result"]["claims"]) == 1
        assert "Transcript failed sanitization check" in status_data["result"]["claims"][0]["claim_text"]

@pytest.mark.asyncio
async def test_integration_successful_schema_payload(monkeypatch):
    """
    Integration test to verify successful outbound schema registration and returned payload shape.
    """
    # Mock LLM and Custom Search
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        from app.main import claim_extractor, analysis_service, evidence_retriever
        from app.models.schemas import (
            Transcript, TranscriptSegment, Claim, PerspectiveType, PerspectiveAnalysis, Evidence,
            BiasAnalysis
        )
        
        async def mock_get_transcript_valid(*args, **kwargs):
            return Transcript(
                video_id="valid_vid",
                segments=[TranscriptSegment(text="This is a valid claim.", start=0.0, duration=10.0)],
                full_text="This is a valid claim."
            )
        
        async def mock_extract_claims_valid(*args, **kwargs):
            return [Claim(id="c1", text="This is a valid claim.", timestamp_start=0.0, timestamp_end=10.0, context="None")]
            
        async def mock_retrieve_evidence(*args, **kwargs):
            return {
                PerspectiveType.SCIENTIFIC: [Evidence(url="http://example.com", title="Title", snippet="Snippet", source="Source", perspective=PerspectiveType.SCIENTIFIC)]
            }
            
        async def mock_analyze_perspective(*args, **kwargs):
            return PerspectiveAnalysis(perspective=PerspectiveType.SCIENTIFIC, stance="Support", confidence=0.9, explanation="Valid", evidence=[])
            
        async def mock_analyze_bias(*args, **kwargs):
            return BiasAnalysis(deception_rating=2.0, deception_rationale="Low deception")
            
        monkeypatch.setattr(claim_extractor, "get_transcript", mock_get_transcript_valid)
        monkeypatch.setattr(claim_extractor, "extract_claims", mock_extract_claims_valid)
        monkeypatch.setattr(evidence_retriever, "retrieve_evidence", mock_retrieve_evidence)
        monkeypatch.setattr(analysis_service, "analyze_perspective", mock_analyze_perspective)
        monkeypatch.setattr(analysis_service, "analyze_bias_and_deception", mock_analyze_bias)
        
        response = await ac.post("/analyze/jobs", json={"url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"})
        assert response.status_code == 200
        job_id = response.json()["job_id"]
        
        status_data = await _poll_until_done(ac, job_id)
            
        assert status_data["status"] == JobStatus.COMPLETED.value
        
        # Verify schema
        result = status_data["result"]
        assert result is not None
        assert "video_id" in result
        assert "claims" in result
        assert len(result["claims"]) == 1
        claim_analysis = result["claims"][0]
        assert "claim_text" in claim_analysis
        assert "truth_profile" in claim_analysis
        assert claim_analysis["truth_profile"]["overall_assessment"] in ["Likely True", "Likely False", "Mixed", "Suspicious/Deceptive"]


def test_build_chrome_extension_regex():
    """
    Unit test to verify build_chrome_extension_regex correctly builds
    dynamic CORS regex for allowed extension IDs.
    """
    from app.main import build_chrome_extension_regex

    assert build_chrome_extension_regex([]) is None
    assert build_chrome_extension_regex(["abc"]) == r"chrome-extension://(abc)"
    assert build_chrome_extension_regex(["abc", "def123"]) == r"chrome-extension://(abc|def123)"


# ============================================================================
# Track 1 & Track 5: Header Threading, Caplog & Structured Error Code Integration Tests
# ============================================================================

@pytest.mark.asyncio
async def test_integration_x_supadata_key_forwarding(monkeypatch, caplog):
    """Verify X-Supadata-Key header is passed to get_transcript, not logged, and not stored in jobs."""
    import logging
    from app.main import claim_extractor, jobs
    from app.models.schemas import Transcript, TranscriptSegment
    from unittest.mock import AsyncMock

    caplog.set_level(logging.DEBUG)

    captured_kwargs = {}

    async def mock_get_transcript(video_id, **kwargs):
        captured_kwargs.update(kwargs)
        return Transcript(
            video_id=video_id,
            segments=[TranscriptSegment(text="Key test transcript", start=0.0, duration=5.0)],
            full_text="Key test transcript",
        )

    monkeypatch.setattr(claim_extractor, "get_transcript", mock_get_transcript)
    monkeypatch.setattr(claim_extractor, "extract_claims", AsyncMock(return_value=[]))

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        response = await ac.post(
            "/analyze/jobs",
            json={"url": "https://www.youtube.com/watch?v=PBSNewsHour_ClimatePolicy", "force_override": True},
            headers={"X-Supadata-Key": "integration-test-key"},
        )
        assert response.status_code == 200
        job_id = response.json()["job_id"]

        status_data = await _poll_until_done(ac, job_id)
        assert status_data["status"] in ("completed", "failed")

        # Verify key was passed to get_transcript
        assert captured_kwargs.get("supadata_key") == "integration-test-key"

        # Verify key was never stored in jobs{}
        job_record = jobs.get(job_id, {})
        assert "integration-test-key" not in str(job_record)

        # Verify key does not appear in any log output captured by caplog
        assert "integration-test-key" not in caplog.text


@pytest.mark.asyncio
async def test_integration_supadata_quota_exhausted_error_code(monkeypatch):
    """Verify SupadataQuotaExhaustedError results in failed job with SUPADATA_QUOTA_EXHAUSTED error_code."""
    from app.main import claim_extractor
    from app.services.claim_extractor import SupadataQuotaExhaustedError

    async def mock_get_transcript(video_id, **kwargs):
        raise SupadataQuotaExhaustedError("Supadata monthly transcript quota reached.")

    monkeypatch.setattr(claim_extractor, "get_transcript", mock_get_transcript)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        response = await ac.post(
            "/analyze/jobs",
            json={"url": "https://www.youtube.com/watch?v=PBSNewsHour_ClimatePolicy"},
            headers={"X-Supadata-Key": "quota-key-123"},
        )
        assert response.status_code == 200
        job_id = response.json()["job_id"]

        status_data = await _poll_until_done(ac, job_id)
        assert status_data["status"] == "failed"
        assert status_data.get("error_code") == "SUPADATA_QUOTA_EXHAUSTED"
        assert "quota" in status_data.get("error", "").lower()


@pytest.mark.asyncio
async def test_integration_supadata_quota_exhausted_e2e_http_mock(monkeypatch):
    """
    End-to-end integration test verifying that when Supadata returns HTTP 402,
    the job fails with SUPADATA_QUOTA_EXHAUSTED error code via the real ClaimExtractor.
    """
    import httpx
    from unittest.mock import MagicMock

    mock_resp = MagicMock()
    mock_resp.status_code = 402

    real_get = httpx.AsyncClient.get

    async def mock_get(self, url, *args, **kwargs):
        if "supadata.ai" in str(url):
            return mock_resp
        return await real_get(self, url, *args, **kwargs)

    monkeypatch.setattr(httpx.AsyncClient, "get", mock_get)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        response = await ac.post(
            "/analyze/jobs",
            json={"url": "https://www.youtube.com/watch?v=PBSNewsHour_ClimatePolicy", "force_override": True},
            headers={"X-Supadata-Key": "exhausted-key-e2e"},
        )
        assert response.status_code == 200
        job_id = response.json()["job_id"]

        status_data = await _poll_until_done(ac, job_id)
        assert status_data["status"] == "failed"
        assert status_data.get("error_code") == "SUPADATA_QUOTA_EXHAUSTED"
        assert "quota" in status_data.get("error", "").lower()


@pytest.mark.asyncio
async def test_integration_supadata_key_required_error_code(monkeypatch):
    """Verify SupadataKeyRequiredError results in failed job with SUPADATA_KEY_REQUIRED error_code."""
    from app.main import claim_extractor
    from app.services.claim_extractor import SupadataKeyRequiredError

    async def mock_get_transcript(video_id, **kwargs):
        raise SupadataKeyRequiredError("No Supadata API key provided and local fallback is disabled.")

    monkeypatch.setattr(claim_extractor, "get_transcript", mock_get_transcript)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        response = await ac.post(
            "/analyze/jobs",
            json={"url": "https://www.youtube.com/watch?v=PBSNewsHour_ClimatePolicy"},
        )
        assert response.status_code == 200
        job_id = response.json()["job_id"]

        status_data = await _poll_until_done(ac, job_id)
        assert status_data["status"] == "failed"
        assert status_data.get("error_code") == "SUPADATA_KEY_REQUIRED"
        assert "no supadata api key provided" in status_data.get("error", "").lower()


@pytest.mark.asyncio
async def test_integration_supadata_missing_key_e2e_rejection(monkeypatch):
    """
    End-to-end integration test verifying that when no key is provided and local fallback
    is disabled, the job fails with SUPADATA_KEY_REQUIRED error code via real ClaimExtractor.
    """
    from app.main import claim_extractor

    monkeypatch.setattr(claim_extractor.settings, "SUPADATA_FALLBACK_LOCAL", False)
    monkeypatch.setattr(claim_extractor.settings, "SUPADATA_API_KEY", "")

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        response = await ac.post(
            "/analyze/jobs",
            json={"url": "https://www.youtube.com/watch?v=PBSNewsHour_ClimatePolicy", "force_override": True},
        )
        assert response.status_code == 200
        job_id = response.json()["job_id"]

        status_data = await _poll_until_done(ac, job_id)
        assert status_data["status"] == "failed"
        assert status_data.get("error_code") == "SUPADATA_KEY_REQUIRED"
        assert "no supadata api key provided" in status_data.get("error", "").lower()



