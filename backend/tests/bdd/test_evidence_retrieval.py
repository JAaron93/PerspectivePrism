"""
Executable Gherkin BDD step definitions for evidence retrieval.
Service-level acceptance scenarios against the real EvidenceRetriever with the
Google Custom Search HTTP seam mocked via URL-scoped interception.
"""
import asyncio

import httpx
import pytest
from pytest_bdd import given, scenarios, then, when

from app.core.config import settings
from app.main import evidence_retriever
from app.models.schemas import Claim, PerspectiveType
from tests.bdd.conftest import install_url_scoped_httpx_mock

pytestmark = [pytest.mark.bdd]

scenarios("../features/evidence_retrieval")

CSE_URL_MARKER = "googleapis.com"

_CSE_ITEM = {
    "link": "https://www.nature.com/articles/infrastructure-study",
    "title": "Nature analysis of infrastructure spending",
    "snippet": "Independent analysts reviewed the bill's projected impact.",
    "displayLink": "nature.com",
}


def _make_claim():
    return Claim(
        id="claim_0",
        text="The infrastructure bill allocates 500 billion dollars over ten years.",
        timestamp_start=0.0,
        timestamp_end=8.0,
    )


def _cse_responder(items):
    async def _responder(client_self, url, *args, **kwargs):
        return httpx.Response(
            200,
            json={"items": items},
            request=httpx.Request("GET", str(url)),
        )

    return _responder


# ============================================================================
# Given Steps
# ============================================================================

@given("a claim requiring evidence")
def given_claim_requiring_evidence(bdd):
    bdd.captured["claim"] = _make_claim()


# ============================================================================
# When Steps
# ============================================================================

@when("evidence is retrieved for the Scientific perspective")
def when_retrieve_scientific(bdd, monkeypatch):
    calls = install_url_scoped_httpx_mock(
        monkeypatch,
        CSE_URL_MARKER,
        _cse_responder([_CSE_ITEM]),
    )
    claim = bdd.captured["claim"]
    bdd.captured["result"] = asyncio.run(
        evidence_retriever.search_google(claim.text, PerspectiveType.SCIENTIFIC)
    )
    bdd.captured["calls"] = calls


@when("evidence is retrieved for both partisan perspectives")
def when_retrieve_partisan(bdd, monkeypatch):
    calls = install_url_scoped_httpx_mock(
        monkeypatch, CSE_URL_MARKER, _cse_responder([_CSE_ITEM])
    )
    claim = bdd.captured["claim"]
    bdd.captured["result"] = asyncio.run(
        evidence_retriever.retrieve_evidence(
            claim, [PerspectiveType.PARTISAN_LEFT, PerspectiveType.PARTISAN_RIGHT]
        )
    )
    bdd.captured["calls"] = calls


@when("the search provider rejects the request with HTTP 429")
def when_search_quota_exhausted(bdd, monkeypatch):
    async def _responder(client_self, url, *args, **kwargs):
        return httpx.Response(
            429,
            text='{"error": {"code": 429, "message": "Quota exceeded"}}',
            request=httpx.Request("GET", str(url)),
        )

    install_url_scoped_httpx_mock(monkeypatch, CSE_URL_MARKER, _responder)
    claim = bdd.captured["claim"]
    bdd.captured["result"] = asyncio.run(
        evidence_retriever.search_google(claim.text, PerspectiveType.SCIENTIFIC)
    )


@when("the search provider is unreachable")
def when_search_provider_unreachable(bdd, monkeypatch):
    async def _responder(client_self, url, *args, **kwargs):
        raise httpx.ConnectError("Connection refused")

    install_url_scoped_httpx_mock(monkeypatch, CSE_URL_MARKER, _responder)
    claim = bdd.captured["claim"]
    bdd.captured["result"] = asyncio.run(
        evidence_retriever.retrieve_evidence(
            claim,
            [
                PerspectiveType.SCIENTIFIC,
                PerspectiveType.JOURNALISTIC,
                PerspectiveType.PARTISAN_LEFT,
                PerspectiveType.PARTISAN_RIGHT,
            ],
        )
    )


@when("evidence is retrieved for all 4 perspectives concurrently")
def when_retrieve_all_concurrently(bdd, monkeypatch):
    in_flight = {"current": 0, "max": 0}

    async def _responder(client_self, url, *args, **kwargs):
        in_flight["current"] += 1
        in_flight["max"] = max(in_flight["max"], in_flight["current"])
        await asyncio.sleep(0)
        in_flight["current"] -= 1
        return httpx.Response(200, json={"items": [_CSE_ITEM]}, request=httpx.Request("GET", str(url)))

    install_url_scoped_httpx_mock(monkeypatch, CSE_URL_MARKER, _responder)
    claim = bdd.captured["claim"]
    bdd.captured["result"] = asyncio.run(
        evidence_retriever.retrieve_evidence(
            claim,
            [
                PerspectiveType.SCIENTIFIC,
                PerspectiveType.JOURNALISTIC,
                PerspectiveType.PARTISAN_LEFT,
                PerspectiveType.PARTISAN_RIGHT,
            ],
        )
    )
    bdd.captured["in_flight"] = in_flight


# ============================================================================
# Then Steps
# ============================================================================

@then("the search query is scoped to scientific domains only")
def then_query_scoped_scientific(bdd):
    query = bdd.captured["calls"][0]["params"]["q"]
    assert "site:nature.com" in query, query
    assert "site:who.int" in query, query
    assert "site:foxnews.com" not in query, query
    assert "site:msnbc.com" not in query, query


@then("the search results are mapped to evidence entries")
def then_results_mapped(bdd):
    evidence = bdd.captured["result"]
    assert len(evidence) == 1, evidence
    entry = evidence[0]
    assert entry.url == _CSE_ITEM["link"], entry
    assert entry.title == _CSE_ITEM["title"], entry
    assert entry.snippet == _CSE_ITEM["snippet"], entry
    assert entry.source == _CSE_ITEM["displayLink"], entry
    assert entry.perspective == PerspectiveType.SCIENTIFIC, entry


@then("the left-leaning search query is scoped to left-leaning domains only")
def then_query_scoped_left(bdd):
    queries = [call["params"]["q"] for call in bdd.captured["calls"]]
    left_queries = [q for q in queries if "site:msnbc.com" in q]
    assert left_queries, f"No left-leaning query captured: {queries}"
    for q in left_queries:
        assert "site:foxnews.com" not in q, q
        assert "site:nature.com" not in q, q


@then("the right-leaning search query is scoped to right-leaning domains only")
def then_query_scoped_right(bdd):
    queries = [call["params"]["q"] for call in bdd.captured["calls"]]
    right_queries = [q for q in queries if "site:foxnews.com" in q]
    assert right_queries, f"No right-leaning query captured: {queries}"
    for q in right_queries:
        assert "site:msnbc.com" not in q, q
        assert "site:nature.com" not in q, q


@then("each perspective's evidence carries its own perspective label")
def then_evidence_labels(bdd):
    result = bdd.captured["result"]
    left = result[PerspectiveType.PARTISAN_LEFT]
    right = result[PerspectiveType.PARTISAN_RIGHT]
    assert left and all(e.perspective == PerspectiveType.PARTISAN_LEFT for e in left), left
    assert right and all(e.perspective == PerspectiveType.PARTISAN_RIGHT for e in right), right


@then("the perspective receives a visible quota-exceeded notice")
def then_quota_notice(bdd):
    evidence = bdd.captured["result"]
    assert len(evidence) == 1, evidence
    notice = evidence[0]
    assert notice.title == "Search Quota Exceeded", notice
    assert notice.source == "System", notice
    assert notice.perspective == PerspectiveType.SCIENTIFIC, notice


@then("every perspective yields empty evidence and no error is raised")
def then_empty_evidence_all_perspectives(bdd):
    result = bdd.captured["result"]
    assert set(result.keys()) == {
        PerspectiveType.SCIENTIFIC,
        PerspectiveType.JOURNALISTIC,
        PerspectiveType.PARTISAN_LEFT,
        PerspectiveType.PARTISAN_RIGHT,
    }, result
    assert all(entries == [] for entries in result.values()), result


@then("no more than 3 searches are ever in flight at once")
def then_concurrency_capped(bdd):
    max_in_flight = bdd.captured["in_flight"]["max"]
    assert max_in_flight <= settings.GOOGLE_SEARCH_MAX_CONCURRENT, max_in_flight
    assert max_in_flight >= 2, f"Searches never ran concurrently (max {max_in_flight})"


@then("every perspective still receives its search results")
def then_all_perspectives_served(bdd):
    result = bdd.captured["result"]
    assert all(len(entries) == 1 for entries in result.values()), result
