"""
Executable Gherkin BDD step definitions for the Pre-Classification Guardrail Gate.
Covers the deterministic fast path, LLM gate consultation, the conservative
ambiguity threshold, and the force-override bypass. The real PreClassifierService
logic runs; only the LLM agent seam is patched for offline determinism.
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

scenarios("../features/pre_classification_gate")

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


def _alethiology_result():
    return AlethiologyAnalysis(
        primary_theory="Correspondence (Empirical)",
        epistemic_summary="The speaker grounds claims in legislative records.",
        quote_evidences=["allocates 500 billion dollars"],
    )


def _install_gate_llm(bdd, monkeypatch, eligibility):
    """Patches the classifier's LLM agent seam; the real gate logic (fast path,
    sanitization, conservative threshold) still executes around it."""
    async def _gate_agent(agent, user_prompt, output_key, output_schema=None, is_backup=False, **kwargs):
        return eligibility

    gate_llm = AsyncMock(side_effect=_gate_agent)
    monkeypatch.setattr("app.services.content_classifier.execute_adk_agent", gate_llm)
    bdd.captured["gate_llm"] = gate_llm


@pytest.fixture
def gate(bdd, monkeypatch):
    """Offline mock stack for the downstream pipeline; the gate itself stays real."""
    monkeypatch.setattr(claim_extractor, "get_transcript", AsyncMock(return_value=_make_transcript()))

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
    monkeypatch.setattr(analysis_service, "analyze_alethiology", AsyncMock(return_value=_alethiology_result()))
    return bdd


# ============================================================================
# Given Steps
# ============================================================================

BENIGN_MUSIC_METADATA = {
    "title": "Lo-fi Study Beats Mix",
    "channel_name": "ChillStudyMusic",
    "category_name": "Music",
    "tags": [],
    "description_snippet": "Relaxing instrumental beats for studying and focus.",
}

POLITICAL_MUSIC_METADATA = {
    "title": "Election Night Debate Remix",
    "channel_name": "ChillStudyMusic",
    "category_name": "Music",
    "tags": [],
    "description_snippet": "Relaxing instrumental beats for studying and focus.",
}


@given("a captionless music video with benign metadata")
def given_captionless_music_video(gate, monkeypatch):
    from app.services.claim_extractor import TranscriptUnavailableError

    gate.payload["metadata"] = dict(BENIGN_MUSIC_METADATA)
    monkeypatch.setattr(
        claim_extractor, "get_transcript",
        AsyncMock(side_effect=TranscriptUnavailableError("Captions are disabled for this video.")),
    )


@given("a captionless music video with political keywords in its metadata")
def given_captionless_political_metadata(gate, monkeypatch):
    from app.services.claim_extractor import TranscriptUnavailableError

    gate.payload["metadata"] = dict(POLITICAL_MUSIC_METADATA)
    monkeypatch.setattr(
        claim_extractor, "get_transcript",
        AsyncMock(side_effect=TranscriptUnavailableError("Captions are disabled for this video.")),
    )
    _install_gate_llm(gate, monkeypatch, ContentEligibilityResult(
        is_analysable=False,
        confidence_score=0.95,
        detected_category="Political Commentary",
        disclaimer_title="Analysis Skipped",
        disclaimer_message="This video discusses political topics but lacks speech captions.",
        key_topics_found=["election"],
    ))


@given("a video the gate rejects with low confidence")
def given_low_confidence_rejection(gate, monkeypatch):
    _install_gate_llm(gate, monkeypatch, ContentEligibilityResult(
        is_analysable=False,
        confidence_score=0.4,
        detected_category="Unclear Content",
        disclaimer_title="Analysis Skipped",
        disclaimer_message="Could not determine suitability.",
        key_topics_found=[],
    ))


@given("a video the gate rejects with high confidence")
def given_high_confidence_rejection(gate, monkeypatch):
    _install_gate_llm(gate, monkeypatch, ContentEligibilityResult(
        is_analysable=False,
        confidence_score=0.95,
        detected_category="Culinary Tutorial",
        disclaimer_title="Analysis Skipped",
        disclaimer_message="This video is a cooking tutorial without socio-political claims.",
        key_topics_found=[],
    ))


@given("a music video submitted with force override")
def given_force_override_music_video(gate, monkeypatch):
    gate.payload["force_override"] = True
    gate.payload["metadata"] = dict(BENIGN_MUSIC_METADATA)
    classify_spy = AsyncMock(return_value=None)
    monkeypatch.setattr(content_classifier, "classify_video", classify_spy)
    gate.captured["classify_spy"] = classify_spy


# ============================================================================
# When Steps
# ============================================================================

@when("the analysis job is submitted and runs to completion")
def when_job_runs_to_completion(gate):
    run_job_to_completion(gate)


# ============================================================================
# Then Steps
# ============================================================================

@then("the job completes successfully")
def then_job_completed(gate):
    assert gate.status_data is not None, "Job status was not captured."
    assert gate.status_data["status"] == "completed", gate.status_data


@then("the video is reported as not analysable")
def then_not_analysable(gate):
    eligibility = gate.status_data["result"]["eligibility"]
    assert eligibility is not None
    assert eligibility["is_analysable"] is False, eligibility


@then("the video is reported as analysable")
def then_analysable(gate):
    eligibility = gate.status_data["result"]["eligibility"]
    assert eligibility is not None
    assert eligibility["is_analysable"] is True, eligibility


@then(parsers.parse('the disclaimer is titled "{title}"'))
def then_disclaimer_title(gate, title):
    eligibility = gate.status_data["result"]["eligibility"]
    assert eligibility["disclaimer_title"] == title, eligibility


@then(parsers.parse("the gate confidence is {confidence:g}"))
def then_gate_confidence(gate, confidence):
    eligibility = gate.status_data["result"]["eligibility"]
    assert eligibility["confidence_score"] == confidence, eligibility


@then("no claims were extracted")
def then_no_claims(gate):
    assert len(gate.status_data["result"]["claims"]) == 0, gate.status_data["result"]


@then(parsers.parse("the result contains {count:d} extracted claims"))
def then_result_contains_claims(gate, count):
    claims = gate.status_data["result"]["claims"]
    assert len(claims) == count, f"Expected {count} claims, got {len(claims)}"


@then("claim extraction was never invoked")
def then_claim_extraction_not_invoked(gate):
    claim_extractor.extract_claims.assert_not_called()


@then("the eligibility gate agent was consulted")
def then_gate_agent_consulted(gate):
    gate_llm = gate.captured.get("gate_llm")
    assert gate_llm is not None, "Gate LLM seam was not patched for this scenario."
    assert gate_llm.await_count >= 1, "The LLM gate agent was never consulted."


@then("the gate was bypassed entirely")
def then_gate_bypassed(gate):
    classify_spy = gate.captured.get("classify_spy")
    assert classify_spy is not None, "classify_video was not replaced with a spy."
    classify_spy.assert_not_called()
