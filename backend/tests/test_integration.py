import pytest
import asyncio
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.models.schemas import JobStatus
from unittest.mock import AsyncMock, patch

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
            Transcript, TranscriptSegment, Claim, PerspectiveType, PerspectiveAnalysis, Evidence,
            BiasAnalysis
        )
        
        def mock_get_transcript_malicious(*args, **kwargs):
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
        for _ in range(20):
            status_resp = await ac.get(f"/analyze/jobs/{job_id}")
            assert status_resp.status_code == 200
            status_data = status_resp.json()
            if status_data["status"] in (JobStatus.COMPLETED.value, JobStatus.FAILED.value):
                break
            await asyncio.sleep(0.5)
            
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
        
        def mock_get_transcript_valid(*args, **kwargs):
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
        
        for _ in range(20):
            status_resp = await ac.get(f"/analyze/jobs/{job_id}")
            assert status_resp.status_code == 200
            status_data = status_resp.json()
            if status_data["status"] in (JobStatus.COMPLETED.value, JobStatus.FAILED.value):
                break
            await asyncio.sleep(0.5)
            
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
