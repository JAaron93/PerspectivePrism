"""
Executable Gherkin BDD step definitions for the analysis job lifecycle.
Covers request validation, unknown-job lookup, MAX_CLAIMS_PER_ANALYSIS
truncation, and the 1-hour TTL purge.
"""
import asyncio
import uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock

import pytest
from pytest_bdd import given, scenarios, then, when

from app.main import (
    analysis_service,
    claim_extractor,
    content_classifier,
    evidence_retriever,
    jobs,
    purge_expired_jobs,
)
from app.models.schemas import (
    AlethiologyAnalysis,
    BiasAnalysis,
    Claim,
    ContentEligibilityResult,
    Evidence,
    JobStatus,
    PerspectiveAnalysis,
    PerspectiveType,
    Transcript,
    TranscriptSegment,
)
from app.core.config import settings
from tests.bdd.conftest import call_endpoint, run_job_to_completion

pytestmark = [pytest.mark.bdd]

scenarios("../features/job_lifecycle/job_validation.feature")

ALL_PERSPECTIVES = [
    PerspectiveType.SCIENTIFIC,
    PerspectiveType.JOURNALISTIC,
    PerspectiveType.PARTISAN_LEFT,
    PerspectiveType.PARTISAN_RIGHT,
]

_TRANSCRIPT_TEXT = (
    "The senator argued that the new infrastructure bill would curb inflation, "
    "but opposition analysts disputed the projected economic impact."
)


def _make_transcript():
    return Transcript(
        video_id="NPRNewsPolicyBriefing",
        segments=[TranscriptSegment(text=_TRANSCRIPT_TEXT, start=0.0, duration=30.0)],
        full_text=_TRANSCRIPT_TEXT,
    )


def _make_claims(count):
    return [
        Claim(
            id=f"claim_{i}",
            text=f"The infrastructure bill allocates {500 + i} billion dollars over ten years.",
            timestamp_start=float(i * 10),
            timestamp_end=float(i * 10 + 8),
            context=_TRANSCRIPT_TEXT,
        )
        for i in range(count)
    ]


def _make_evidence():
    return {
        p: [
            Evidence(
                url=f"https://example.com/{p.value.lower().replace(' ', '-')}-report",
                title=f"{p.value} report",
                snippet="Analysts reviewed the bill's projected impact.",
                source="example.com",
                perspective=p,
            )
        ]
        for p in ALL_PERSPECTIVES
    }


@pytest.fixture
def lifecycle(bdd, monkeypatch):
    """Offline mock stack so submitted jobs complete without network or LLM access."""
    monkeypatch.setattr(claim_extractor, "get_transcript", AsyncMock(return_value=_make_transcript()))
    monkeypatch.setattr(content_classifier, "classify_video", AsyncMock(return_value=ContentEligibilityResult(
        is_analysable=True,
        confidence_score=0.95,
        detected_category="Political Commentary",
        disclaimer_title="",
        disclaimer_message="",
        key_topics_found=["infrastructure"],
    )))

    async def _extract_claims(transcript):
        return _make_claims(bdd.claim_count)

    monkeypatch.setattr(claim_extractor, "extract_claims", AsyncMock(side_effect=_extract_claims))
    monkeypatch.setattr(evidence_retriever, "retrieve_evidence", AsyncMock(return_value=_make_evidence()))

    async def _analyze_perspective(claim, perspective, evidence_list):
        return PerspectiveAnalysis(
            perspective=perspective,
            stance="Support",
            confidence=0.8,
            explanation="Mocked perspective analysis.",
            evidence=evidence_list,
        )

    monkeypatch.setattr(analysis_service, "analyze_perspective", AsyncMock(side_effect=_analyze_perspective))
    monkeypatch.setattr(
        analysis_service, "analyze_bias_and_deception",
        AsyncMock(return_value=BiasAnalysis(deception_rating=1.0, deception_rationale="Mocked.")),
    )
    monkeypatch.setattr(
        analysis_service, "analyze_alethiology",
        AsyncMock(return_value=AlethiologyAnalysis(
            primary_theory="Correspondence (Empirical)",
            epistemic_summary="The speaker grounds claims in legislative records.",
            quote_evidences=["allocates 500 billion dollars"],
        )),
    )
    return bdd


# ============================================================================
# Given Steps
# ============================================================================

@given("a submission with a non-YouTube URL")
def given_non_youtube_url(lifecycle):
    lifecycle.payload["url"] = "https://google.com/search?q=infrastructure+bill"


@given("a video yielding more claims than the configured limit")
def given_excess_claims(lifecycle, monkeypatch):
    monkeypatch.setattr(settings, "MAX_CLAIMS_PER_ANALYSIS", 2)
    lifecycle.claim_count = 4


@given("a completed job older than the retention window and a fresh job")
def given_stale_and_fresh_jobs(lifecycle):
    run_job_to_completion(lifecycle)
    assert lifecycle.status_data["status"] == "completed", lifecycle.status_data

    stale_id = lifecycle.job_id
    jobs[stale_id]["created_at"] = datetime.now(timezone.utc) - timedelta(hours=2)

    fresh_id = str(uuid.uuid4())
    jobs[fresh_id] = {
        "status": JobStatus.PENDING,
        "result": None,
        "error": None,
        "error_code": None,
        "created_at": datetime.now(timezone.utc),
    }
    lifecycle.captured["stale_id"] = stale_id
    lifecycle.captured["fresh_id"] = fresh_id


# ============================================================================
# When Steps
# ============================================================================

@when("the submission is sent")
def when_submission_sent(lifecycle):
    response = call_endpoint("POST", "/analyze/jobs", json=lifecycle.payload, headers=lifecycle.headers)
    lifecycle.last_response_status = response.status_code
    lifecycle.last_response_json = response.json() if response.status_code == 200 else None


@when("the status of an unknown job is requested")
def when_unknown_job_requested(lifecycle):
    response = call_endpoint("GET", f"/analyze/jobs/{uuid.uuid4()}")
    lifecycle.last_response_status = response.status_code


@when("the analysis job is submitted and runs to completion")
def when_job_runs_to_completion(lifecycle):
    run_job_to_completion(lifecycle)


@when("the purge routine runs")
def when_purge_runs(lifecycle):
    lifecycle.captured["purged_count"] = asyncio.run(purge_expired_jobs())


# ============================================================================
# Then Steps
# ============================================================================

@then("the API responds with HTTP 400")
def then_http_400(lifecycle):
    assert lifecycle.last_response_status == 400, lifecycle.last_response_status


@then("the API responds with HTTP 404")
def then_http_404(lifecycle):
    assert lifecycle.last_response_status == 404, lifecycle.last_response_status


@then("no job is created")
def then_no_job_created(lifecycle):
    assert len(jobs) == 0, jobs


@then("the job completes successfully")
def then_job_completed(lifecycle):
    assert lifecycle.status_data is not None, "Job status was not captured."
    assert lifecycle.status_data["status"] == "completed", lifecycle.status_data


@then("the result contains exactly 2 claims in submission order")
def then_claims_truncated_in_order(lifecycle):
    claims = lifecycle.status_data["result"]["claims"]
    assert len(claims) == 2, claims
    assert claims[0]["claim_text"] == "The infrastructure bill allocates 500 billion dollars over ten years.", claims
    assert claims[1]["claim_text"] == "The infrastructure bill allocates 501 billion dollars over ten years.", claims


@then("only the expired job is removed")
def then_only_expired_removed(lifecycle):
    assert lifecycle.captured["purged_count"] == 1, lifecycle.captured["purged_count"]
    assert lifecycle.captured["stale_id"] not in jobs
    assert lifecycle.captured["fresh_id"] in jobs
