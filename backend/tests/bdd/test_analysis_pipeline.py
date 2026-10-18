"""
Executable Gherkin BDD step definitions for the end-to-end analysis pipeline.
Covers full orchestration, verdict computation, incremental result publishing,
and honest failure reporting.
"""
from unittest.mock import AsyncMock

import pytest
from pytest_bdd import given, parsers, scenarios, then, when

from app.main import analysis_service, claim_extractor, content_classifier, evidence_retriever
from app.models.schemas import (
    AlethiologyAnalysis,
    BiasAnalysis,
    Claim,
    ContentEligibilityResult,
    Evidence,
    PerspectiveAnalysis,
    PerspectiveType,
    Transcript,
    TranscriptSegment,
)
from tests.bdd.conftest import run_job_to_completion

pytestmark = [pytest.mark.bdd]

scenarios("../features/analysis_pipeline")

ALL_PERSPECTIVES = [
    PerspectiveType.SCIENTIFIC,
    PerspectiveType.JOURNALISTIC,
    PerspectiveType.PARTISAN_LEFT,
    PerspectiveType.PARTISAN_RIGHT,
]
SUPPORTING_STANCES = {
    PerspectiveType.SCIENTIFIC: "Support",
    PerspectiveType.JOURNALISTIC: "Support",
    PerspectiveType.PARTISAN_LEFT: "Refute",
    PerspectiveType.PARTISAN_RIGHT: "Ambiguous",
}
REFUTING_STANCES = {
    PerspectiveType.SCIENTIFIC: "Refute",
    PerspectiveType.JOURNALISTIC: "Ambiguous",
    PerspectiveType.PARTISAN_LEFT: "Refute",
    PerspectiveType.PARTISAN_RIGHT: "Support",
}

_TRANSCRIPT_TEXT = (
    "The new infrastructure bill allocates 500 billion dollars over ten years. "
    "Independent analysts dispute the projected job growth figures."
)


def _make_transcript(video_id="NPRNewsPolicyBriefing"):
    return Transcript(
        video_id=video_id,
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
                title=f"{p.value} report on infrastructure spending",
                snippet="Analysts reviewed the bill's projected impact.",
                source="example.com",
                perspective=p,
            )
        ]
        for p in ALL_PERSPECTIVES
    }


def _eligible_result():
    return ContentEligibilityResult(
        is_analysable=True,
        confidence_score=0.95,
        detected_category="Political Commentary",
        disclaimer_title="",
        disclaimer_message="",
        key_topics_found=["infrastructure"],
    )


def _alethiology_result():
    return AlethiologyAnalysis(
        primary_theory="Correspondence (Empirical)",
        epistemic_summary="The speaker grounds claims in budget documents.",
        quote_evidences=["allocates 500 billion dollars"],
    )


@pytest.fixture
def pipeline(bdd, monkeypatch):
    """Installs the offline mock stack for the analysis pipeline and returns the context."""
    monkeypatch.setattr(
        claim_extractor, "get_transcript",
        AsyncMock(return_value=_make_transcript()),
    )
    monkeypatch.setattr(
        content_classifier, "classify_video",
        AsyncMock(return_value=_eligible_result()),
    )
    async def _extract_claims(transcript):
        return _make_claims(bdd.claim_count)

    monkeypatch.setattr(
        claim_extractor, "extract_claims",
        AsyncMock(side_effect=_extract_claims),
    )
    monkeypatch.setattr(
        evidence_retriever, "retrieve_evidence",
        AsyncMock(return_value=_make_evidence()),
    )

    async def _analyze_perspective(claim, perspective, evidence_list):
        return PerspectiveAnalysis(
            perspective=perspective,
            stance=bdd.stances[perspective],
            confidence=0.8,
            explanation="Mocked perspective analysis.",
            evidence=evidence_list,
        )

    async def _analyze_bias(claim):
        if bdd.capture_snapshot:
            from tests.bdd.conftest import snapshot_sole_job_result

            bdd.snapshots.append(snapshot_sole_job_result())
        return BiasAnalysis(
            deception_rating=bdd.deception_rating,
            deception_rationale="Mocked bias analysis.",
        )

    monkeypatch.setattr(analysis_service, "analyze_perspective", AsyncMock(side_effect=_analyze_perspective))
    monkeypatch.setattr(analysis_service, "analyze_bias_and_deception", AsyncMock(side_effect=_analyze_bias))
    monkeypatch.setattr(analysis_service, "analyze_alethiology", AsyncMock(return_value=_alethiology_result()))
    return bdd


# ============================================================================
# Given Steps
# ============================================================================

@given("an eligible news video with spoken commentary")
def given_eligible_news_video(pipeline):
    pipeline.stances = dict(SUPPORTING_STANCES)
    pipeline.deception_rating = 1.0


@given("an eligible news video whose evidence refutes the claim")
def given_refuting_news_video(pipeline):
    pipeline.stances = dict(REFUTING_STANCES)
    pipeline.deception_rating = 1.0


@given("an eligible news video with moderate deception signals")
def given_moderate_deception_video(pipeline):
    pipeline.stances = dict(SUPPORTING_STANCES)
    pipeline.deception_rating = 5.0


@given("an eligible news video with a single claim")
def given_single_claim_video(pipeline):
    pipeline.claim_count = 1
    pipeline.capture_snapshot = True
    pipeline.stances = dict(SUPPORTING_STANCES)
    pipeline.deception_rating = 1.0


@given("an eligible video whose captions cannot be retrieved")
def given_captions_unavailable(pipeline, monkeypatch):
    from app.services.claim_extractor import TranscriptUnavailableError

    monkeypatch.setattr(
        claim_extractor, "get_transcript",
        AsyncMock(side_effect=TranscriptUnavailableError("Captions are disabled for this video.")),
    )


@given("a video whose transcript service is temporarily unreachable")
def given_transcript_service_outage(pipeline, monkeypatch):
    from app.services.claim_extractor import TranscriptRetrievalError

    monkeypatch.setattr(
        claim_extractor, "get_transcript",
        AsyncMock(side_effect=TranscriptRetrievalError("Network timeout while contacting transcript service")),
    )


# ============================================================================
# When Steps
# ============================================================================

@when("the analysis job is submitted and runs to completion")
def when_job_runs_to_completion(pipeline):
    run_job_to_completion(pipeline)


# ============================================================================
# Then Steps
# ============================================================================

@then("the job completes successfully")
def then_job_completed(pipeline):
    assert pipeline.status_data is not None, "Job status was not captured."
    assert pipeline.status_data["status"] == "completed", pipeline.status_data


@then("the job fails")
def then_job_failed(pipeline):
    assert pipeline.status_data is not None, "Job status was not captured."
    assert pipeline.status_data["status"] == "failed", pipeline.status_data


@then(parsers.parse("the result contains {count:d} analyzed claims"))
def then_result_contains_claims(pipeline, count):
    claims = pipeline.status_data["result"]["claims"]
    assert len(claims) == count, f"Expected {count} claims, got {len(claims)}"


@then("each claim is analyzed from all 4 perspectives")
def then_claims_have_all_perspectives(pipeline):
    expected = {p.value for p in ALL_PERSPECTIVES}
    for claim in pipeline.status_data["result"]["claims"]:
        assert set(claim["truth_profile"]["perspectives"].keys()) == expected, claim


@then(parsers.parse('the overall assessment is "{verdict}"'))
def then_overall_assessment(pipeline, verdict):
    for claim in pipeline.status_data["result"]["claims"]:
        assert claim["truth_profile"]["overall_assessment"] == verdict, claim


@then("a mid-processing snapshot showed perspectives without a final verdict")
def then_snapshot_showed_partial_state(pipeline):
    assert pipeline.snapshots, "No mid-processing snapshot was captured."
    snapshot = pipeline.snapshots[-1]
    assert snapshot is not None
    claim = snapshot.claims[0]
    assert set(claim.truth_profile.perspectives.keys()) == {p.value for p in ALL_PERSPECTIVES}
    assert claim.truth_profile.overall_assessment == "Analyzing..."
    assert claim.truth_profile.bias_indicators.deception_score == 0.0


@then("the final result carries the computed verdict")
def then_final_result_has_verdict(pipeline):
    claim = pipeline.status_data["result"]["claims"][0]
    assert claim["truth_profile"]["overall_assessment"] == "Likely True"
    assert claim["truth_profile"]["bias_indicators"]["deception_score"] == 1.0


@then("the error explains that captions are required")
def then_error_mentions_captions(pipeline):
    error = pipeline.status_data["error"]
    assert error and "captions" in error.lower(), error


@then("the result is empty")
def then_result_is_empty(pipeline):
    assert pipeline.status_data["result"] is None, pipeline.status_data


@then("the error reflects the retrieval failure, not missing captions")
def then_error_reflects_outage(pipeline):
    error = pipeline.status_data["error"]
    assert error and "Network timeout" in error, error
    assert "captions" not in error.lower(), error


@then("the eligibility gate was never consulted")
def then_gate_not_consulted(pipeline):
    content_classifier.classify_video.assert_not_called()
