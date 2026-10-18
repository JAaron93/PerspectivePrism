"""
BDD conftest for executable Gherkin scenarios.
Imports and extends shared fixtures from root backend/tests/conftest.py.
"""
import asyncio
from dataclasses import dataclass, field

import httpx
import pytest
from httpx import ASGITransport, AsyncClient

from tests.conftest import reset_analysis_circuit_breaker

__all__ = [
    "reset_analysis_circuit_breaker",
    "BddContext",
    "bdd",
    "isolate_bdd_state",
    "run_job_to_completion",
    "call_endpoint",
    "install_url_scoped_httpx_mock",
    "snapshot_sole_job_result",
]

_CIRCUIT_BREAKER_ATTRS = ("cb_failures", "cb_open", "cb_half_open", "cb_probing", "cb_last_failure_time")


def _reset_bdd_state():
    import app.main as main_module

    main_module.jobs.clear()
    for owner_name in ("analysis_service", "content_classifier"):
        service = getattr(main_module, owner_name, None)
        if service is None:
            continue
        for attr in _CIRCUIT_BREAKER_ATTRS:
            if hasattr(service, attr):
                setattr(service, attr, 0 if attr == "cb_failures" else (0.0 if attr == "cb_last_failure_time" else False))
    alethiology = getattr(getattr(main_module, "analysis_service", None), "alethiology_service", None)
    if alethiology is not None:
        for attr in _CIRCUIT_BREAKER_ATTRS:
            if hasattr(alethiology, attr):
                setattr(alethiology, attr, 0 if attr == "cb_failures" else (0.0 if attr == "cb_last_failure_time" else False))


@pytest.fixture(autouse=True)
def isolate_bdd_state():
    """Full per-scenario isolation: job store plus every circuit-breaker owner's complete CB state."""
    _reset_bdd_state()
    yield
    _reset_bdd_state()


@dataclass
class BddContext:
    """Mutable scenario state shared across Given, When, and Then steps."""

    headers: dict = field(default_factory=dict)
    payload: dict = field(default_factory=lambda: {
        "url": "https://www.youtube.com/watch?v=NPRNewsPolicyBriefing",
        "force_override": False,
    })
    job_id: str | None = None
    status_data: dict | None = None
    last_response_status: int | None = None
    last_response_json: dict | None = None
    captured: dict = field(default_factory=dict)
    snapshots: list = field(default_factory=list)
    # Pipeline inputs a domain step module may customize per scenario.
    claim_count: int = 2
    capture_snapshot: bool = False
    stances: dict = field(default_factory=dict)
    deception_rating: float = 1.0


@pytest.fixture
def bdd():
    return BddContext()


def run_job_to_completion(ctx, max_polls=30, poll_interval=0.15):
    """Submits ctx.payload and polls GET /analyze/jobs/{id} until a terminal state."""

    async def _action():
        from app.main import app

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            response = await ac.post("/analyze/jobs", json=ctx.payload, headers=ctx.headers)
            ctx.last_response_status = response.status_code
            ctx.last_response_json = response.json()
            assert response.status_code == 200, response.text
            ctx.job_id = response.json()["job_id"]

            data = None
            for _ in range(max_polls):
                poll = await ac.get(f"/analyze/jobs/{ctx.job_id}")
                assert poll.status_code == 200
                data = poll.json()
                if data.get("status") in ("completed", "failed"):
                    break
                await asyncio.sleep(poll_interval)
            ctx.status_data = data

    asyncio.run(_action())


def call_endpoint(method, path, **kwargs):
    """Single-shot ASGI request helper (no polling) returning the httpx.Response."""

    async def _action():
        from app.main import app

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            return await ac.request(method, path, **kwargs)

    return asyncio.run(_action())


def install_url_scoped_httpx_mock(monkeypatch, url_marker, responder):
    """Intercepts httpx.AsyncClient.get only for URLs containing url_marker.

    All other URLs (including ASGI-internal routing) delegate to the real method.
    Returns a list of captured calls: {"url", "params", "headers"}.
    """
    real_get = httpx.AsyncClient.get
    calls = []

    async def mock_get(client_self, url, *args, **kwargs):
        if url_marker in str(url):
            calls.append({
                "url": str(url),
                "params": kwargs.get("params"),
                "headers": kwargs.get("headers"),
            })
            return await responder(client_self, url, *args, **kwargs)
        return await real_get(client_self, url, *args, **kwargs)

    monkeypatch.setattr(httpx.AsyncClient, "get", mock_get)
    return calls


def snapshot_sole_job_result():
    """Deep-copies the in-flight result of the only active job.

    ASGITransport runs BackgroundTasks inside the POST call, so polling can never
    observe mid-flight pipeline state; mocks capture snapshots at their invocation
    point instead. Requires exactly one in-flight job (guaranteed per scenario by
    the autouse job-store reset).
    """
    import app.main as main_module

    assert len(main_module.jobs) == 1, (
        f"Expected exactly one in-flight job, found {len(main_module.jobs)}"
    )
    job = next(iter(main_module.jobs.values()))
    result = job.get("result")
    return result.model_copy(deep=True) if result is not None else None
