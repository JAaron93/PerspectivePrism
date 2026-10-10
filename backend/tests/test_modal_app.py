"""Tests for Modal deployment entrypoint and cross-cloud health verification."""

import os
import stat
import tempfile
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app


def test_bootstrap_gcp_credentials_creates_file(monkeypatch, tmp_path):
    """Verifies _bootstrap_gcp_credentials writes credentials with mode 0600."""
    import modal_app

    dummy_sa_json = '{"type": "service_account", "project_id": "test-prism-project"}'
    monkeypatch.setenv("GCP_SERVICE_ACCOUNT_JSON", dummy_sa_json)
    
    test_target_file = tmp_path / "gcp_sa.json"
    monkeypatch.setattr(modal_app, "SA_CREDENTIALS_PATH", test_target_file)

    path_created = modal_app._bootstrap_gcp_credentials()

    assert path_created == str(test_target_file)
    assert test_target_file.exists()
    assert test_target_file.read_text(encoding="utf-8") == dummy_sa_json
    assert os.environ.get("GOOGLE_APPLICATION_CREDENTIALS") == str(test_target_file)

    # Check file permissions (0o600: read/write for owner only)
    file_stat = test_target_file.stat()
    file_perms = stat.S_IMODE(file_stat.st_mode)
    assert file_perms == 0o600


def test_bootstrap_gcp_credentials_noop_when_missing(monkeypatch):
    """Verifies _bootstrap_gcp_credentials gracefully returns None when env var is unset."""
    import modal_app

    monkeypatch.delenv("GCP_SERVICE_ACCOUNT_JSON", raising=False)
    result = modal_app._bootstrap_gcp_credentials()
    assert result is None


def test_modal_app_configuration():
    """Verifies modal.App name, image, and ASGI function configuration parameters."""
    import modal
    import modal_app

    assert modal_app.app.name == "perspective-prism-backend"
    assert hasattr(modal_app, "fastapi_app")
    assert isinstance(modal_app.image, modal.Image)
    assert (
        modal_app.fastapi_app._is_web_endpoint()
        if callable(modal_app.fastapi_app._is_web_endpoint)
        else modal_app.fastapi_app._is_web_endpoint is True
    )
    assert modal_app.SA_CREDENTIALS_PATH == Path("/tmp/gcp_sa.json")

    # Verify attached Modal secret binding
    spec = getattr(modal_app.fastapi_app, "_spec_", None)
    if spec is None:
        spec = getattr(modal_app.fastapi_app, "spec", None)
    secrets = getattr(spec, "secrets", [])
    secret_names = [getattr(s, "name", getattr(s, "_name", None)) for s in secrets]
    assert "perspective-prism-gcp-secrets" in secret_names



@pytest.mark.asyncio
async def test_health_llm_probe_default_passive():
    """Verifies GET /health/llm defaults to passive check without calling count_tokens."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        with patch("app.utils.llm_utils.get_genai_client") as mock_get_client:
            response = await ac.get("/health/llm")
            assert response.status_code == 200
            data = response.json()
            assert "probe" not in data
            mock_get_client.assert_not_called()


@pytest.mark.asyncio
async def test_health_llm_probe_success():
    """Verifies GET /health/llm?probe=true executes token counting ping successfully."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        mock_client = MagicMock()
        mock_token_resp = MagicMock()
        mock_token_resp.total_tokens = 4
        mock_client.aio.models.count_tokens = AsyncMock(return_value=mock_token_resp)

        with patch("app.utils.llm_utils.get_genai_client", return_value=mock_client):
            response = await ac.get("/health/llm?probe=true")
            assert response.status_code == 200
            data = response.json()
            assert data["status"] == "healthy"
            assert "probe" in data
            assert data["probe"]["success"] is True
            assert data["probe"]["total_tokens"] == 4
            mock_client.aio.models.count_tokens.assert_awaited_once()


@pytest.mark.asyncio
async def test_health_llm_probe_failure():
    """Verifies GET /health/llm?probe=true returns HTTP 503 with sanitized error on failure."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        mock_client = MagicMock()
        mock_client.aio.models.count_tokens = AsyncMock(side_effect=RuntimeError("Vertex AI unreachable"))

        with patch("app.utils.llm_utils.get_genai_client", return_value=mock_client):
            response = await ac.get("/health/llm?probe=true")
            assert response.status_code == 503
            data = response.json()
            assert data["status"] == "unhealthy"
            assert data["probe"]["success"] is False
            # Sanitized fixed text — raw provider details must NOT leak to callers.
            assert data["probe"]["error"] == "Live provider probe failed"
            assert data["message"] == "Live provider probe failed"
            assert "Vertex AI unreachable" not in data["probe"]["error"]


@pytest.mark.asyncio
async def test_health_llm_probe_auth_rejected_when_secret_mismatch(monkeypatch):
    """Verifies GET /health/llm?probe=true returns HTTP 401 when PROBE_SECRET is set and key is wrong."""
    monkeypatch.setattr("app.main.settings.PROBE_SECRET", "correct-secret")
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        response = await ac.get("/health/llm?probe=true", headers={"X-Probe-Key": "wrong-secret"})
        assert response.status_code == 401

        # No header at all also rejected
        response2 = await ac.get("/health/llm?probe=true")
        assert response2.status_code == 401


@pytest.mark.asyncio
async def test_health_llm_probe_auth_accepted_with_correct_key(monkeypatch):
    """Verifies GET /health/llm?probe=true is accepted when PROBE_SECRET matches X-Probe-Key."""
    monkeypatch.setattr("app.main.settings.PROBE_SECRET", "correct-secret")
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        mock_client = MagicMock()
        mock_token_resp = MagicMock()
        mock_token_resp.total_tokens = 4
        mock_client.aio.models.count_tokens = AsyncMock(return_value=mock_token_resp)

        with patch("app.utils.llm_utils.get_genai_client", return_value=mock_client):
            response = await ac.get(
                "/health/llm?probe=true",
                headers={"X-Probe-Key": "correct-secret"},
            )
            assert response.status_code == 200
            data = response.json()
            assert data["probe"]["success"] is True


def test_modal_fastapi_app_factory():
    """Verifies fastapi_app factory calls credential bootstrapping and returns FastAPI app."""
    import modal_app

    with patch.object(modal_app, "_bootstrap_gcp_credentials") as mock_bootstrap:
        fastapi_inst = modal_app.fastapi_app.local()
        mock_bootstrap.assert_called_once()
        assert fastapi_inst is not None
        assert hasattr(fastapi_inst, "routes")


def test_startup_google_api_key_ordering(monkeypatch):
    """Pins the cold-start key-ordering contract for GOOGLE_API_KEY.

    Regression guard for the auth isolation fix in configure_provider_env()
    (config.py:258-262). Verifies three invariants in sequence:

    1. Settings() captures GOOGLE_API_KEY into settings.GOOGLE_API_KEY while
       the key is still present in os.environ (as pydantic-settings requires).
    2. configure_provider_env() purges GOOGLE_API_KEY from os.environ so the
       google-genai SDK cannot enter Express Mode using the Custom Search key.
    3. The captured value on the Settings instance is unaffected by the pop —
       EvidenceRetriever.api_key = settings.GOOGLE_API_KEY remains valid.

    The test is fully isolated: it constructs a fresh Settings() from a
    controlled environment dict and passes it explicitly to
    configure_provider_env(), so neither the global `settings` singleton nor
    other tests are affected.
    """
    from app.core.config import Settings, configure_provider_env

    search_key = "test-custom-search-api-key-abc123"
    base_env = {
        "GCP_PROJECT": "test-prism-project",
        "GOOGLE_CLOUD_PROJECT": "test-prism-project",
        "GOOGLE_API_KEY": search_key,
        "GOOGLE_CSE_ID": "test-cse-id",
        "LLM_API_KEY": "dummy",
        "GEMINI_TIER": "paid",
    }

    # Patch os.environ for the duration of Settings() construction only.
    # monkeypatch restores the original environment after the test.
    for key, value in base_env.items():
        monkeypatch.setenv(key, value)

    # --- Invariant 1: Settings() captures the key while it is in os.environ ---
    fresh_settings = Settings()
    assert fresh_settings.GOOGLE_API_KEY == search_key, (
        "Settings() must capture GOOGLE_API_KEY from os.environ at construction time. "
        "If this fails, pydantic-settings did not read the env var before it was popped."
    )

    # --- Invariant 2: configure_provider_env() removes GOOGLE_API_KEY from os.environ ---
    configure_provider_env(active_settings=fresh_settings)
    assert os.environ.get("GOOGLE_API_KEY") is None, (
        "configure_provider_env() must pop GOOGLE_API_KEY from os.environ so the "
        "google-genai SDK cannot use it for Express Mode authentication against "
        "aiplatform.googleapis.com (which rejects Custom Search keys with "
        "API_KEY_SERVICE_BLOCKED / PERMISSION_DENIED)."
    )

    # --- Invariant 3: The captured Settings field is unaffected by the environ pop ---
    assert fresh_settings.GOOGLE_API_KEY == search_key, (
        "The pop of os.environ['GOOGLE_API_KEY'] must not mutate the already-constructed "
        "Settings instance. EvidenceRetriever.api_key = settings.GOOGLE_API_KEY must "
        "remain valid after configure_provider_env() runs."
    )
