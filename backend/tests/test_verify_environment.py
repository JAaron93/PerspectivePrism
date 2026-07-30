"""
Unit tests for environment verifier (verify_environment.py) and burst test script.
"""

from pathlib import Path
import sys
from unittest.mock import MagicMock, patch
import pytest

# Ensure root directory is on sys.path for importing root verify_environment module
root_dir = str(Path(__file__).resolve().parents[2])
if root_dir not in sys.path:
    sys.path.insert(0, root_dir)

from verify_environment import verify_environment
from scripts.burst_test import run_burst_test


class TestVerifyEnvironment:
    """Tests for the root verify_environment.py diagnostic tool in 100% GCP Vertex AI Mode."""

    def test_verify_environment_vertex_mode_success(self):
        """Should succeed in Vertex AI mode with mock Client."""
        env_vars = {
            "GCP_PROJECT": "test-gcp-project",
            "GCP_LOCATION": "us-central1",
            "GEMINI_TIER": "paid",
        }
        with patch.dict("os.environ", env_vars, clear=True):
            mock_client = MagicMock()
            mock_client.models.generate_content.return_value.text = "VERIFIED_OK"
            with patch("google.genai.Client", return_value=mock_client):
                result = verify_environment()
                assert result is True

    def test_verify_environment_missing_gcp_project_fails(self):
        """Should return False when GCP_PROJECT is missing."""
        with patch.dict("os.environ", {}, clear=True):
            result = verify_environment()
            assert result is False

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
