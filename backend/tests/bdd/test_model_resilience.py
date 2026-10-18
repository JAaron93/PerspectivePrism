"""
Executable Gherkin BDD step definitions for primary-model resilience.
The real circuit-breaker loop (execute_agent_with_circuit_breaker) executes;
only the ADK agent execution seam in the analysis service namespace is patched
so failures and fallbacks are deterministic and offline.
"""
import time
from unittest.mock import AsyncMock

import pytest
from pytest_bdd import given, scenarios, then, when
from google.genai import errors

from app.core.config import settings
from app.main import analysis_service, claim_extractor, content_classifier, evidence_retriever
from app.models.schemas import (
    AlethiologyAnalysis,
    BiasAnalysis,
    Claim,
    ContentEligibilityResult,
    Evidence,
    PerspectiveAnalysisLLMOutput,
    PerspectiveType,
    Transcript,
    TranscriptSegment,
)
from tests.bdd.conftest import call_endpoint, run_job_to_completion

pytestmark = [pytest.mark.bdd]

scenarios("../features/model_resilience/circuit_breaker.feature")

ALL_PERSPECTIVES = [
    PerspectiveType.SCIENTIFIC,
    PerspectiveType.JOURNALISTIC,
    PerspectiveType.PARTISAN_LEFT,
    PerspectiveType.PARTISAN_RIGHT,
]

PRIMARY_EXPLANATION = "Primary model analysis."
BACKUP_EXPLANATION = "Backup model analysis."

_TRANSCRIPT_TEXT = (
    "The senator argued that the new infrastructure bill would curb inflation, "
    "but opposition analysts disputed the projected economic impact."
)


def _make_claims(count=1):
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


def _install_agent_seam(bdd, monkeypatch):
    """Patches app.services.analysis_service.execute_adk_agent.

    Dispatches on the seam call record: primary calls follow bdd.captured
    ["primary_mode"] ("fail_once" | "fail_always" | "never"); backup calls
    always succeed with a distinguishable explanation.
    """
    calls = {"primary": 0, "backup": 0}

    async def _agent(agent, user_prompt, output_key, output_schema=None, is_backup=False, **kwargs):
        if is_backup:
            calls["backup"] += 1
            return _output_for(output_key, BACKUP_EXPLANATION)
        calls["primary"] += 1
        if bdd.captured["primary_mode"] == "fail_always" or (
            bdd.captured["primary_mode"] == "fail_once" and calls["primary"] == 1
        ):
            raise errors.ClientError(429, "Rate limit exceeded", None)
        return _output_for(output_key, PRIMARY_EXPLANATION)

    monkeypatch.setattr("app.services.analysis_service.execute_adk_agent", AsyncMock(side_effect=_agent))
    bdd.captured["agent_calls"] = calls


def _output_for(output_key, explanation):
    if output_key == "perspective_result":
        return PerspectiveAnalysisLLMOutput(
            stance="Ambiguous" if explanation == BACKUP_EXPLANATION else "Support",
            confidence=0.8,
            explanation=explanation,
        )
    return BiasAnalysis(
        deception_rating=1.0,
        deception_rationale=explanation,
    )


@pytest.fixture
def resilience(bdd, monkeypatch):
    """Offline pipeline mock stack with the analysis LLM seam under scenario control."""
    bdd.captured["primary_mode"] = "never"
    monkeypatch.setattr(
        claim_extractor, "get_transcript",
        AsyncMock(return_value=Transcript(
            video_id="NPRNewsPolicyBriefing",
            segments=[TranscriptSegment(text=_TRANSCRIPT_TEXT, start=0.0, duration=30.0)],
            full_text=_TRANSCRIPT_TEXT,
        )),
    )
    monkeypatch.setattr(content_classifier, "classify_video", AsyncMock(return_value=ContentEligibilityResult(
        is_analysable=True,
        confidence_score=0.95,
        detected_category="Political Commentary",
        disclaimer_title="",
        disclaimer_message="",
        key_topics_found=["infrastructure"],
    )))
    monkeypatch.setattr(claim_extractor, "extract_claims", AsyncMock(return_value=_make_claims()))
    monkeypatch.setattr(evidence_retriever, "retrieve_evidence", AsyncMock(return_value=_make_evidence()))
    monkeypatch.setattr(analysis_service, "analyze_alethiology", AsyncMock(return_value=None))
    _install_agent_seam(bdd, monkeypatch)
    return bdd


# ============================================================================
# Given Steps
# ============================================================================

@given("a video whose primary model fails once with a transient error")
def given_transient_primary_failure(resilience):
    resilience.captured["primary_mode"] = "fail_once"


@given("a video whose primary model keeps failing with transient errors")
def given_persistent_primary_failures(resilience, monkeypatch):
    resilience.captured["primary_mode"] = "fail_always"
    monkeypatch.setattr(settings, "CIRCUIT_BREAKER_FAIL_THRESHOLD", 2)


@given("an open circuit breaker on the analysis service")
def given_open_circuit_breaker(resilience):
    analysis_service.cb_open = True
    analysis_service.cb_last_failure_time = time.time()


# ============================================================================
# When Steps
# ============================================================================

@when("the analysis job is submitted and runs to completion")
def when_job_runs_to_completion(resilience):
    run_job_to_completion(resilience)


# ============================================================================
# Then Steps
# ============================================================================

@then("the job completes successfully")
def then_job_completed(resilience):
    assert resilience.status_data is not None, "Job status was not captured."
    assert resilience.status_data["status"] == "completed", resilience.status_data


@then("the affected perspective was answered by the backup model")
def then_affected_perspective_backup(resilience):
    perspectives = resilience.status_data["result"]["claims"][0]["truth_profile"]["perspectives"]
    assert perspectives["Scientific"]["explanation"] == BACKUP_EXPLANATION, perspectives["Scientific"]
    assert perspectives["Journalistic"]["explanation"] == PRIMARY_EXPLANATION, perspectives["Journalistic"]


@then("every perspective was answered by the backup model")
def then_all_perspectives_backup(resilience):
    perspectives = resilience.status_data["result"]["claims"][0]["truth_profile"]["perspectives"]
    for p in ALL_PERSPECTIVES:
        assert perspectives[p.value]["explanation"] == BACKUP_EXPLANATION, perspectives[p.value]


@then("the primary model was never invoked")
def then_primary_never_invoked(resilience):
    calls = resilience.captured["agent_calls"]
    assert calls["primary"] == 0, calls
    assert calls["backup"] >= 1, calls


@then("the circuit breaker recovered to a healthy state")
def then_cb_recovered(resilience):
    response = call_endpoint("GET", "/health/llm")
    data = response.json()
    assert response.status_code == 200
    assert data["status"] == "healthy", data
    assert data["circuit_breaker_open"] is False, data
    assert data["features"]["failures_count"] == 0, data


@then("the circuit breaker is open on the health endpoint")
def then_cb_open_on_health(resilience):
    response = call_endpoint("GET", "/health/llm")
    data = response.json()
    assert response.status_code == 200
    assert data["status"] == "degraded", data
    assert data["circuit_breaker_open"] is True, data
    assert "backup provider" in data["message"], data
