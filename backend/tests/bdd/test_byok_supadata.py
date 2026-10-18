"""
Executable Gherkin BDD scenario step definitions for BYOK Supadata Transcript Integration.
Covers US2, US3, US5, and US6 acceptance criteria.
"""
import asyncio
import os
from unittest.mock import AsyncMock, MagicMock

import httpx
import pytest
from httpx import ASGITransport, AsyncClient
from pytest_bdd import given, parsers, scenarios, then, when

from app.main import app, claim_extractor, jobs, settings
from app.services.claim_extractor import SupadataKeyRequiredError

pytestmark = [pytest.mark.bdd]

scenarios("../features/byok_supadata")


@pytest.fixture
def bdd_ctx(monkeypatch):
    """Context object holding scenario state across Given, When, and Then steps."""
    class Context:
        def __init__(self):
            self.headers = {}
            self.payload = {
                "url": "https://www.youtube.com/watch?v=PBSNewsHour_ClimatePolicy",
                "force_override": True,
            }
            self.job_id = None
            self.status_data = None
            self.captured_supadata_key = None
            self.supadata_headers = {}
            self.supadata_called = False
            self.mock_supadata_status = 200
            self.mock_supadata_content = [
                {"text": "Sample BDD transcript", "offset": 0, "duration": 2500}
            ]
            self.youtube_api_attempted = False
            self.caught_exception = None
            self.last_key_sent = None

    ctx = Context()

    # Intercept outbound httpx.AsyncClient.get to mock Supadata REST API
    real_get = httpx.AsyncClient.get

    async def mock_get(client_self, url, *args, **kwargs):
        url_str = str(url)
        if "supadata.ai" in url_str:
            ctx.supadata_called = True
            ctx.supadata_headers = kwargs.get("headers", {})
            mock_resp = MagicMock(spec=httpx.Response)
            mock_resp.status_code = ctx.mock_supadata_status
            if ctx.mock_supadata_status == 200:
                mock_resp.json.return_value = {"content": ctx.mock_supadata_content}
                mock_resp.text = '{"content": [{"text": "Sample BDD transcript", "offset": 0, "duration": 2500}]}'
            else:
                mock_resp.json.return_value = {"error": f"HTTP {ctx.mock_supadata_status}"}
                mock_resp.text = f'{{"error": "HTTP {ctx.mock_supadata_status}"}}'
            return mock_resp
        return await real_get(client_self, url, *args, **kwargs)

    monkeypatch.setattr(httpx.AsyncClient, "get", mock_get)

    # Intercept ClaimExtractor.get_transcript to spy on supadata_key argument
    real_get_transcript = claim_extractor.get_transcript

    async def spy_get_transcript(video_id, **kwargs):
        ctx.captured_supadata_key = kwargs.get("supadata_key")
        return await real_get_transcript(video_id, **kwargs)

    monkeypatch.setattr(claim_extractor, "get_transcript", spy_get_transcript)

    # Mock extract_claims to avoid requiring Vertex AI credentials in BDD suite
    monkeypatch.setattr(claim_extractor, "extract_claims", AsyncMock(return_value=[]))

    # Intercept YouTubeTranscriptApi.fetch to observe fallback path
    from youtube_transcript_api import YouTubeTranscriptApi

    def mock_fetch(self, video_id, *args, **kwargs):
        ctx.youtube_api_attempted = True
        mock_item = MagicMock()
        mock_item.text = "Local fallback transcript"
        mock_item.start = 0.0
        mock_item.duration = 5.0
        return [mock_item]

    monkeypatch.setattr(YouTubeTranscriptApi, "fetch", mock_fetch)

    return ctx


# ============================================================================
# Given Steps
# ============================================================================

@given("the backend receives a POST to /analyze/jobs")
def step_backend_receives_post(bdd_ctx):
    # Base setup for submitting analysis jobs
    pass


@given(parsers.parse('the request header "{header_name}" is "{header_val}"'))
def step_set_request_header(bdd_ctx, header_name, header_val):
    bdd_ctx.headers[header_name] = header_val
    if header_name == "X-Supadata-Key":
        bdd_ctx.last_key_sent = header_val


@given('no "X-Supadata-Key" header is present')
def step_no_key_header(bdd_ctx):
    bdd_ctx.headers.pop("X-Supadata-Key", None)


@given('no "X-Supadata-Key" header is present in the request')
def step_no_key_header_alt(bdd_ctx):
    bdd_ctx.headers.pop("X-Supadata-Key", None)


@given('the backend receives a POST to /analyze/jobs without an "X-Supadata-Key" header')
def step_post_without_key_header(bdd_ctx):
    bdd_ctx.headers.pop("X-Supadata-Key", None)


@given(parsers.parse('settings.SUPADATA_API_KEY is configured as "{key}"'))
def step_set_settings_supadata_api_key(monkeypatch, bdd_ctx, key):
    monkeypatch.setattr(settings, "SUPADATA_API_KEY", key)
    monkeypatch.setattr(claim_extractor.settings, "SUPADATA_API_KEY", key)
    bdd_ctx.last_key_sent = key


@given('settings.SUPADATA_API_KEY is ""')
def step_empty_settings_supadata_api_key(monkeypatch):
    monkeypatch.setattr(settings, "SUPADATA_API_KEY", "")
    monkeypatch.setattr(claim_extractor.settings, "SUPADATA_API_KEY", "")


@given("settings.SUPADATA_FALLBACK_LOCAL is True")
def step_fallback_local_true(monkeypatch):
    monkeypatch.setattr(settings, "SUPADATA_FALLBACK_LOCAL", True)
    monkeypatch.setattr(claim_extractor.settings, "SUPADATA_FALLBACK_LOCAL", True)


@given("settings.SUPADATA_FALLBACK_LOCAL is False")
def step_fallback_local_false(monkeypatch):
    monkeypatch.setattr(settings, "SUPADATA_FALLBACK_LOCAL", False)
    monkeypatch.setattr(claim_extractor.settings, "SUPADATA_FALLBACK_LOCAL", False)


@given(parsers.parse("the Supadata API returns HTTP {status_code:d} for the transcript request"))
def step_supadata_returns_http_status(bdd_ctx, status_code):
    bdd_ctx.mock_supadata_status = status_code
    bdd_ctx.headers.setdefault("X-Supadata-Key", "test-error-key")


@given("the Supadata API returns a valid transcript")
def step_supadata_returns_valid_transcript(bdd_ctx):
    bdd_ctx.mock_supadata_status = 200
    bdd_ctx.mock_supadata_content = [
        {"text": "Valid transcript for web frontend scenario", "offset": 0, "duration": 3000}
    ]


# ============================================================================
# When Steps
# ============================================================================

def _run_job_to_completion(bdd_ctx):
    """Executes a job submission and polls until completion via ASGITransport."""
    async def _action():
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            response = await ac.post("/analyze/jobs", json=bdd_ctx.payload, headers=bdd_ctx.headers)
            assert response.status_code == 200
            bdd_ctx.job_id = response.json()["job_id"]

            for _ in range(30):
                poll_resp = await ac.get(f"/analyze/jobs/{bdd_ctx.job_id}")
                assert poll_resp.status_code == 200
                data = poll_resp.json()
                if data.get("status") in ("completed", "failed"):
                    bdd_ctx.status_data = data
                    return
                await asyncio.sleep(0.15)
            bdd_ctx.status_data = data

    asyncio.run(_action())


@when("the analysis job is processed")
def step_when_job_processed(bdd_ctx):
    _run_job_to_completion(bdd_ctx)


@when("an analysis job is submitted and polled to completion")
def step_when_job_polled_to_completion(bdd_ctx):
    _run_job_to_completion(bdd_ctx)


@when("the analysis job is polled to completion")
def step_when_analysis_job_polled(bdd_ctx):
    _run_job_to_completion(bdd_ctx)


@when(parsers.parse('ClaimExtractor.get_transcript() is called for video "{video_id}"'))
def step_call_get_transcript_directly(bdd_ctx, video_id):
    async def _action():
        try:
            return await claim_extractor.get_transcript(video_id, supadata_key=bdd_ctx.headers.get("X-Supadata-Key"))
        except Exception as e:
            bdd_ctx.caught_exception = e

    asyncio.run(_action())


# ============================================================================
# Then Steps
# ============================================================================

@then(parsers.parse('ClaimExtractor.get_transcript() is called with supadata_key "{expected_key}"'))
def step_then_claim_extractor_key(bdd_ctx, expected_key):
    assert bdd_ctx.captured_supadata_key == expected_key


@then(parsers.parse('the Supadata API receives header "{header_name}" equal to "{header_val}"'))
def step_then_supadata_received_header(bdd_ctx, header_name, header_val):
    assert bdd_ctx.supadata_called, "Supadata API was expected to be called, but was not."
    assert bdd_ctx.supadata_headers.get(header_name) == header_val


@then("the key is not stored in os.environ or the jobs repository")
def step_then_key_not_stored(bdd_ctx):
    key = bdd_ctx.last_key_sent
    if key:
        # Check os.environ values
        for env_val in os.environ.values():
            assert key not in env_val, f"Key {key} leaked into os.environ!"
        # Check jobs dictionary
        job_record = jobs.get(bdd_ctx.job_id, {})
        assert key not in str(job_record), f"Key {key} leaked into jobs repository!"


@then(parsers.parse('GET /analyze/jobs/{{job_id}} returns status "{expected_status}"'))
def step_then_job_status(bdd_ctx, expected_status):
    assert bdd_ctx.status_data is not None, "Job status data was not captured."
    assert bdd_ctx.status_data.get("status") == expected_status


@then(parsers.parse('the response error_code is "{expected_code}"'))
def step_then_response_error_code(bdd_ctx, expected_code):
    assert bdd_ctx.status_data is not None, "Job status data was not captured."
    assert bdd_ctx.status_data.get("error_code") == expected_code


@then("the youtube-transcript-api fallback path is attempted")
def step_then_youtube_fallback_attempted(bdd_ctx):
    assert bdd_ctx.youtube_api_attempted, "youtube-transcript-api fallback was expected to be attempted."


@then("no Supadata HTTP request is dispatched")
def step_then_no_supadata_request(bdd_ctx):
    assert not bdd_ctx.supadata_called, "Supadata HTTP request should not have been dispatched."


@then("a SupadataKeyRequiredError exception is raised immediately")
def step_then_supadata_key_required_raised(bdd_ctx):
    assert isinstance(bdd_ctx.caught_exception, SupadataKeyRequiredError), (
        f"Expected SupadataKeyRequiredError, got {type(bdd_ctx.caught_exception)}"
    )


@then("no youtube-transcript-api fallback is attempted")
def step_then_no_youtube_fallback(bdd_ctx):
    assert not bdd_ctx.youtube_api_attempted, "youtube-transcript-api fallback should NOT have been attempted."
