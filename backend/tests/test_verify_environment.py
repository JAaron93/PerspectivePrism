"""
Unit tests for environment verifier (verify_environment.py) and burst test script.
"""

import os
from pathlib import Path
import sys
from unittest.mock import AsyncMock, MagicMock, patch
import pytest

# Ensure root directory is on sys.path for importing root verify_environment module
root_dir = str(Path(__file__).resolve().parents[2])
if root_dir not in sys.path:
    sys.path.insert(0, root_dir)

from verify_environment import verify_environment
from scripts.burst_test import run_burst_test


class TestVerifyEnvironment:
    """Tests for the root verify_environment.py diagnostic tool in 100% GCP Vertex AI Mode."""

    @pytest.mark.asyncio
    async def test_verify_environment_vertex_mode_success(self):
        """Should succeed in Vertex AI mode with mock Client."""
        env_vars = {
            "GCP_PROJECT": "test-gcp-project",
            "GCP_LOCATION": "us-central1",
            "GEMINI_TIER": "paid",
        }
        with patch.dict("os.environ", env_vars, clear=True):
            mock_client = MagicMock()
            mock_client.aio.models.generate_content = AsyncMock()
            mock_client.aio.models.generate_content.return_value.text = "VERIFIED_OK"
            with patch("google.genai.Client", return_value=mock_client):
                result = await verify_environment()
                assert result is True

    @pytest.mark.asyncio
    async def test_verify_environment_gcp_project_precedence(self):
        """Should prefer GCP_PROJECT over GOOGLE_CLOUD_PROJECT when both are set."""
        env_vars = {
            "GCP_PROJECT": "primary-gcp-project",
            "GOOGLE_CLOUD_PROJECT": "secondary-gcp-project",
            "GCP_LOCATION": "us-central1",
            "GEMINI_TIER": "paid",
        }
        with patch.dict("os.environ", env_vars, clear=True):
            mock_client_cls = MagicMock()
            mock_client = MagicMock()
            mock_client.aio.models.generate_content = AsyncMock()
            mock_client.aio.models.generate_content.return_value.text = "VERIFIED_OK"
            mock_client_cls.return_value = mock_client
            with patch("google.genai.Client", mock_client_cls):
                result = await verify_environment()
                assert result is True
                mock_client_cls.assert_called_once_with(
                    vertexai=True,
                    project="primary-gcp-project",
                    location="us-central1",
                )

    @pytest.mark.asyncio
    async def test_verify_environment_missing_gcp_project_fails(self):
        """Should return False when GCP_PROJECT is missing."""
        with patch.dict("os.environ", {}, clear=True):
            result = await verify_environment()
            assert result is False

    @pytest.mark.asyncio
    async def test_verify_environment_handles_env_read_error(self, capsys):
        """Should log warning to sys.stderr on env file read error and continue."""
        from verify_environment import _read_env_file_sync
        with patch("pathlib.Path.is_file", return_value=True), patch("builtins.open", side_effect=PermissionError("Permission denied")):
            _read_env_file_sync()
            captured = capsys.readouterr()
            assert "Unable to read environment file" in captured.err
            assert "Permission denied" in captured.err

    def test_verify_environment_fallback_to_root_env_when_backend_env_blank(self):
        """Should fall back to root .env if backend/.env exists but has a blank GCP_PROJECT."""
        from verify_environment import _read_env_file_sync, Path
        
        backend_content = "PROJECT_NAME=Perspective Prism MVP\nGCP_PROJECT=\n"
        root_content = "GCP_PROJECT=root-gcp-project\n"

        def mock_open_file(filepath, *args, **kwargs):
            path_str = str(filepath)
            if "backend" in path_str:
                from io import StringIO
                return StringIO(backend_content)
            else:
                from io import StringIO
                return StringIO(root_content)

        with patch.dict("os.environ", {}, clear=True), \
             patch("pathlib.Path.is_file", return_value=True), \
             patch("builtins.open", side_effect=mock_open_file):
            _read_env_file_sync()
            assert os.environ.get("GCP_PROJECT") == "root-gcp-project"

    @pytest.mark.asyncio
    async def test_burst_test_mock_execution(self):
        """Should execute mocked parallel burst test cleanly."""
        env_vars = {
            "GCP_PROJECT": "test-gcp-project",
            "GEMINI_TIER": "paid",
        }
        with patch.dict("os.environ", env_vars, clear=True):
            # Run a small 5-request burst test with 0s delay
            await run_burst_test(concurrency_count=5, mock_delay=0.0)
