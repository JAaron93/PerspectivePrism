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
    """Verifies modal.App name and ASGI function configuration parameters."""
    import modal_app

    assert modal_app.app.name == "perspective-prism-backend"
    assert hasattr(modal_app, "fastapi_app")


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
    """Verifies GET /health/llm?probe=true handles live connectivity failures gracefully."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        mock_client = MagicMock()
        mock_client.aio.models.count_tokens = AsyncMock(side_effect=RuntimeError("Vertex AI unreachable"))

        with patch("app.utils.llm_utils.get_genai_client", return_value=mock_client):
            response = await ac.get("/health/llm?probe=true")
            assert response.status_code == 200
            data = response.json()
            assert data["status"] == "unhealthy"
            assert data["probe"]["success"] is False
            assert "Vertex AI unreachable" in data["probe"]["error"]
            assert "Live Vertex AI probe failed" in data["message"]


def test_modal_fastapi_app_factory():
    """Verifies fastapi_app factory calls credential bootstrapping and returns FastAPI app."""
    import modal_app

    with patch.object(modal_app, "_bootstrap_gcp_credentials") as mock_bootstrap:
        fastapi_inst = modal_app.fastapi_app.local()
        mock_bootstrap.assert_called_once()
        assert fastapi_inst is not None
        assert hasattr(fastapi_inst, "routes")

