import pytest
import asyncio
from unittest.mock import AsyncMock, patch, MagicMock
from fastapi.testclient import TestClient

from app.main import app, jobs, jobs_lock
from app.models.schemas import (
    VideoRequest,
    VideoMetadata,
    Transcript,
    TranscriptSegment,
    Claim,
    Evidence,
    PerspectiveType,
    PerspectiveAnalysis,
    BiasAnalysis,
    AlethiologyAnalysis,
    ContentEligibilityResult,
)
from app.services.claim_extractor import (
    TranscriptUnavailableError,
    TranscriptRetrievalError,
)


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture(autouse=True)
def clear_jobs():
    jobs.clear()
    yield
    jobs.clear()


@pytest.mark.asyncio
async def test_job_ineligible_video_early_exit(client):
    """
    Track 4: An ineligible video (e.g. Music without captions) triggers early exit,
    completing the job with an empty claims list and populated eligibility disclaimer.
    """
    request_data = {
        "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        "force_override": False,
        "metadata": {
            "title": "Never Gonna Give You Up",
            "channel_name": "Rick Astley",
            "category_name": "Music",
            "tags": ["pop", "music"],
            "description_snippet": "Official music video."
        }
    }

    # Simulate missing captions / empty transcript
    with patch("app.main.claim_extractor.get_transcript", new_callable=AsyncMock) as mock_get_trans, \
         patch("app.main.claim_extractor.extract_claims", new_callable=AsyncMock) as mock_extract:

        mock_get_trans.return_value = Transcript(
            video_id="dQw4w9WgXcQ",
            segments=[],
            full_text=""
        )

        response = client.post("/analyze/jobs", json=request_data)
        assert response.status_code == 200
        job_id = response.json()["job_id"]

        # Wait briefly for background task execution
        for _ in range(20):
            await asyncio.sleep(0.05)
            status_resp = client.get(f"/analyze/jobs/{job_id}")
            assert status_resp.status_code == 200
            data = status_resp.json()
            if data["status"] in ("completed", "failed"):
                break

        assert data["status"] == "completed"
        assert data["result"] is not None
        assert data["result"]["eligibility"] is not None
        assert data["result"]["eligibility"]["is_analysable"] is False
        assert data["result"]["eligibility"]["confidence_score"] == 1.0
        assert data["result"]["eligibility"]["disclaimer_title"] == "No Spoken Commentary Found"
        assert data["result"]["claims"] == []
        mock_extract.assert_not_called()


@pytest.mark.asyncio
async def test_job_force_override_bypasses_pre_classifier(client):
    """
    Track 4: When force_override is True, the pre-classifier gate is bypassed
    and full claim extraction and parallel analysis run even for Music category videos.
    """
    request_data = {
        "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        "force_override": True,
        "metadata": {
            "title": "Never Gonna Give You Up",
            "channel_name": "Rick Astley",
            "category_name": "Music",
            "tags": ["pop"],
            "description_snippet": "Music video."
        }
    }

    sample_transcript = Transcript(
        video_id="dQw4w9WgXcQ",
        segments=[TranscriptSegment(text="A full commitment is what I am thinking of", start=10.0, duration=3.0)],
        full_text="A full commitment is what I am thinking of"
    )
    sample_claim = Claim(
        id="claim_0",
        text="A full commitment is what I am thinking of",
        timestamp_start=10.0,
        timestamp_end=13.0,
        context="Lyrics discussing relational commitments"
    )
    sample_perspective = PerspectiveAnalysis(
        perspective=PerspectiveType.SCIENTIFIC,
        stance="Ambiguous",
        confidence=0.5,
        explanation="Subjective statement",
        evidence=[]
    )
    sample_bias = BiasAnalysis(
        deception_rating=0.0,
        deception_rationale="No deception detected"
    )
    sample_alethiology = AlethiologyAnalysis(
        primary_theory="Perspectivism (Lived Experience)",
        secondary_theory=None,
        epistemic_summary="The speaker grounds truth in subjective personal experience.",
        quote_evidences=["A full commitment is what I am thinking of"]
    )

    with patch("app.main.claim_extractor.get_transcript", new_callable=AsyncMock, return_value=sample_transcript), \
         patch("app.main.claim_extractor.extract_claims", new_callable=AsyncMock, return_value=[sample_claim]), \
         patch("app.main.evidence_retriever.retrieve_evidence", new_callable=AsyncMock, return_value={}), \
         patch("app.main.analysis_service.analyze_perspective", new_callable=AsyncMock, return_value=sample_perspective), \
         patch("app.main.analysis_service.analyze_bias_and_deception", new_callable=AsyncMock, return_value=sample_bias), \
         patch("app.main.analysis_service.analyze_alethiology", new_callable=AsyncMock, return_value=sample_alethiology), \
         patch("app.main.content_classifier.classify_video", new_callable=AsyncMock) as mock_classify:

        response = client.post("/analyze/jobs", json=request_data)
        assert response.status_code == 200
        job_id = response.json()["job_id"]

        for _ in range(30):
            await asyncio.sleep(0.05)
            status_resp = client.get(f"/analyze/jobs/{job_id}")
            data = status_resp.json()
            if data["status"] in ("completed", "failed"):
                break

        assert data["status"] == "completed"
        # Pre-classifier must NOT have been called due to force_override
        mock_classify.assert_not_called()
        assert len(data["result"]["claims"]) == 1
        claim_res = data["result"]["claims"][0]
        assert claim_res["truth_profile"]["alethiology"]["primary_theory"] == "Perspectivism (Lived Experience)"


@pytest.mark.asyncio
async def test_job_eligible_video_populates_eligibility_and_alethiology(client):
    """
    Track 4: An eligible video passes pre-classification, extracts claims,
    and returns both eligibility and alethiology in the final payload.
    """
    request_data = {
        "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        "force_override": False,
        "metadata": {
            "title": "Senate Hearing on Environmental Regulations",
            "channel_name": "C-SPAN",
            "category_name": "News & Politics",
            "tags": ["senate", "policy"],
            "description_snippet": "Full testimony from regulatory panel."
        }
    }

    mock_eligibility = ContentEligibilityResult(
        is_analysable=True,
        confidence_score=0.98,
        detected_category="Political Hearing",
        disclaimer_title="",
        disclaimer_message="",
        key_topics_found=["environmental regulation", "senate"]
    )
    sample_transcript = Transcript(
        video_id="dQw4w9WgXcQ",
        segments=[TranscriptSegment(text="Carbon emissions dropped by 12 percent.", start=0.0, duration=4.0)],
        full_text="Carbon emissions dropped by 12 percent."
    )
    sample_claim = Claim(
        id="claim_0",
        text="Carbon emissions dropped by 12 percent.",
        timestamp_start=0.0,
        timestamp_end=4.0,
        context="Senate testimony on emissions metrics"
    )
    sample_perspective = PerspectiveAnalysis(
        perspective=PerspectiveType.SCIENTIFIC,
        stance="Support",
        confidence=0.92,
        explanation="Matches EPA dataset",
        evidence=[]
    )
    sample_bias = BiasAnalysis(
        deception_rating=1.0,
        deception_rationale="Minimal spin"
    )
    sample_alethiology = AlethiologyAnalysis(
        primary_theory="Correspondence (Empirical)",
        secondary_theory="Consensus (Institutional Agreement)",
        epistemic_summary="The speaker anchors claims in statistical data and physical emissions testing.",
        quote_evidences=["Carbon emissions dropped by 12 percent"]
    )

    with patch("app.main.content_classifier.classify_video", new_callable=AsyncMock, return_value=mock_eligibility), \
         patch("app.main.claim_extractor.get_transcript", new_callable=AsyncMock, return_value=sample_transcript), \
         patch("app.main.claim_extractor.extract_claims", new_callable=AsyncMock, return_value=[sample_claim]), \
         patch("app.main.evidence_retriever.retrieve_evidence", new_callable=AsyncMock, return_value={}), \
         patch("app.main.analysis_service.analyze_perspective", new_callable=AsyncMock, return_value=sample_perspective), \
         patch("app.main.analysis_service.analyze_bias_and_deception", new_callable=AsyncMock, return_value=sample_bias), \
         patch("app.main.analysis_service.analyze_alethiology", new_callable=AsyncMock, return_value=sample_alethiology):

        response = client.post("/analyze/jobs", json=request_data)
        assert response.status_code == 200
        job_id = response.json()["job_id"]

        for _ in range(30):
            await asyncio.sleep(0.05)
            status_resp = client.get(f"/analyze/jobs/{job_id}")
            data = status_resp.json()
            if data["status"] in ("completed", "failed"):
                break

        assert data["status"] == "completed"
        assert data["result"]["eligibility"]["is_analysable"] is True
        assert data["result"]["eligibility"]["detected_category"] == "Political Hearing"
        assert len(data["result"]["claims"]) == 1
        truth_profile = data["result"]["claims"][0]["truth_profile"]
        assert truth_profile["alethiology"]["primary_theory"] == "Correspondence (Empirical)"


def test_invalid_video_url_returns_400(client):
    """Invalid video URL returns 400 Bad Request."""
    response = client.post("/analyze/jobs", json={"url": "https://google.com/search?q=test"})
    assert response.status_code == 400
    assert "Invalid video URL" in response.json()["detail"]


def test_job_not_found_returns_404(client):
    """Querying a non-existent job returns 404 Not Found."""
    response = client.get("/analyze/jobs/00000000-0000-0000-0000-000000000000")
    assert response.status_code == 404
    assert response.json()["detail"] == "Job not found"


@pytest.mark.asyncio
async def test_job_transcript_retrieval_failure_does_not_mask_as_missing_captions(client):
    """
    Greptile Review P1 Fix: When transcript retrieval fails due to a transient API or network error,
    the job MUST fail with an error rather than silently treating it as an absent transcript
    and prematurely completing with an inaccurate 'No Spoken Commentary Found' disclaimer.
    """
    request_data = {
        "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        "force_override": False,
        "metadata": {
            "title": "Some Music Video",
            "category_name": "Music",
            "tags": ["pop"],
        }
    }

    with patch("app.main.claim_extractor.get_transcript", new_callable=AsyncMock) as mock_get_trans:
        mock_get_trans.side_effect = TranscriptRetrievalError("Network timeout connecting to YouTube")

        response = client.post("/analyze/jobs", json=request_data)
        assert response.status_code == 200
        job_id = response.json()["job_id"]

        for _ in range(20):
            await asyncio.sleep(0.05)
            status_resp = client.get(f"/analyze/jobs/{job_id}")
            data = status_resp.json()
            if data["status"] in ("completed", "failed"):
                break

        assert data["status"] == "failed"
        assert "Network timeout" in data["error"]
        assert data["result"] is None


@pytest.mark.asyncio
async def test_job_transcript_unavailable_error_triggers_early_exit(client):
    """
    When captions are genuinely disabled or unavailable on a Music/Gaming video,
    TranscriptUnavailableError correctly routes to the deterministic gate for early exit.
    """
    request_data = {
        "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        "force_override": False,
        "metadata": {
            "title": "Instrumental Track",
            "category_name": "Music",
            "tags": ["instrumental"],
        }
    }

    with patch("app.main.claim_extractor.get_transcript", new_callable=AsyncMock) as mock_get_trans:
        mock_get_trans.side_effect = TranscriptUnavailableError("Transcripts disabled for video")

        response = client.post("/analyze/jobs", json=request_data)
        assert response.status_code == 200
        job_id = response.json()["job_id"]

        for _ in range(20):
            await asyncio.sleep(0.05)
            status_resp = client.get(f"/analyze/jobs/{job_id}")
            data = status_resp.json()
            if data["status"] in ("completed", "failed"):
                break

        assert data["status"] == "completed"
        assert data["result"]["eligibility"]["is_analysable"] is False
        assert data["result"]["eligibility"]["disclaimer_title"] == "No Spoken Commentary Found"
        assert data["result"]["claims"] == []
