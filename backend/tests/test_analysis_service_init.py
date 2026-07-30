"""
Test to verify Gemini API key validation in AnalysisService.

This test ensures that the AnalysisService properly validates
the GEMINI_API_KEY / LLM_API_KEY configuration before initializing.
"""

from unittest.mock import patch

import pytest
from app.services.analysis_service import AnalysisService


class TestAnalysisServiceInitialization:
    """Test AnalysisService initialization and validation."""

    def test_initialization_with_gcp_project_vertex_ai(self):
        """Should initialize successfully with GCP_PROJECT in Vertex AI mode."""
        with patch.dict("os.environ", {}, clear=True), patch("app.services.analysis_service.settings") as mock_settings:
            mock_settings.effective_gcp_project = "my-gcp-project"
            mock_settings.GCP_LOCATION = "us-central1"
            mock_settings.GEMINI_API_KEY = ""
            mock_settings.LLM_API_KEY = ""
            mock_settings.LLM_MODEL = "gemini-3.5-flash-lite"
            mock_settings.BACKUP_LLM_MODEL = "gemini-3.1-flash-lite"
            mock_settings.GEMINI_TIER = "paid"

            service = AnalysisService(settings=mock_settings)

            assert service.perspective_agent_primary is not None
            assert service.gcp_project == "my-gcp-project"
            assert service.gcp_location == "us-central1"
            assert service.perspective_agent_primary.model == "gemini-3.5-flash-lite"

    def test_initialization_with_valid_api_key(self):
        """Should initialize successfully with valid API key."""
        with patch.dict("os.environ", {}, clear=True), patch("app.services.analysis_service.settings") as mock_settings:
            mock_settings.effective_gcp_project = ""
            mock_settings.GCP_PROJECT = ""
            mock_settings.GOOGLE_CLOUD_PROJECT = ""
            mock_settings.GEMINI_API_KEY = "sk-test-valid-key-123"
            mock_settings.LLM_API_KEY = ""
            mock_settings.LLM_MODEL = "gemini-3.5-flash-lite"
            mock_settings.BACKUP_LLM_MODEL = "gemini-3.1-flash-lite"
            mock_settings.GEMINI_TIER = "paid"

            service = AnalysisService(settings=mock_settings)

            assert service.perspective_agent_primary is not None
            assert service.perspective_agent_primary.model == "gemini-3.5-flash-lite"

    @pytest.mark.parametrize(
        "api_key,expected_substrings",
        [
            ("", ["Neither GCP_PROJECT", "GEMINI_API_KEY"]),
            ("   \n\t   ", ["Neither GCP_PROJECT", "GEMINI_API_KEY"]),
            (None, ["Neither GCP_PROJECT", "GEMINI_API_KEY"]),
        ],
    )
    def test_initialization_with_invalid_api_key(self, api_key, expected_substrings):
        """Should raise ValueError with invalid keys when GCP_PROJECT is omitted."""
        with patch.dict("os.environ", {}, clear=True), patch("app.services.analysis_service.settings") as mock_settings:
            mock_settings.effective_gcp_project = ""
            mock_settings.GCP_PROJECT = ""
            mock_settings.GOOGLE_CLOUD_PROJECT = ""
            mock_settings.GEMINI_API_KEY = ""
            mock_settings.LLM_API_KEY = api_key
            mock_settings.LLM_MODEL = "gemini-3.5-flash-lite"
            mock_settings.BACKUP_LLM_MODEL = "gemini-3.1-flash-lite"
            mock_settings.GEMINI_TIER = "paid"

            with pytest.raises(ValueError) as exc_info:
                AnalysisService(settings=mock_settings)

            error_message = str(exc_info.value)
            for expected_substring in expected_substrings:
                assert expected_substring in error_message

    def test_uses_custom_model_from_settings(self):
        """Should use custom model from settings when configured."""
        with patch.dict("os.environ", {}, clear=True), patch("app.services.analysis_service.settings") as mock_settings:
            mock_settings.effective_gcp_project = ""
            mock_settings.GCP_PROJECT = ""
            mock_settings.GOOGLE_CLOUD_PROJECT = ""
            mock_settings.GEMINI_API_KEY = "sk-test-valid-key-123"
            mock_settings.LLM_API_KEY = ""
            mock_settings.LLM_MODEL = "gemini-3.5-flash-lite"
            mock_settings.BACKUP_LLM_MODEL = "gemini-3.1-flash-lite"
            mock_settings.GEMINI_TIER = "paid"

            service = AnalysisService(settings=mock_settings)

            assert service.perspective_agent_primary.model == "gemini-3.5-flash-lite"

    def test_error_message_includes_example(self):
        """Error message should include helpful example."""
        with patch.dict("os.environ", {}, clear=True), patch("app.services.analysis_service.settings") as mock_settings:
            mock_settings.effective_gcp_project = ""
            mock_settings.GCP_PROJECT = ""
            mock_settings.GOOGLE_CLOUD_PROJECT = ""
            mock_settings.GEMINI_API_KEY = ""
            mock_settings.LLM_API_KEY = ""
            mock_settings.LLM_MODEL = "gemini-3.5-flash-lite"
            mock_settings.BACKUP_LLM_MODEL = "gemini-3.1-flash-lite"
            mock_settings.GEMINI_TIER = "paid"

            with pytest.raises(ValueError) as exc_info:
                AnalysisService(settings=mock_settings)

            error_message = str(exc_info.value)
            assert "GCP_PROJECT" in error_message or "GEMINI_API_KEY" in error_message

    def test_clears_stale_google_cloud_project_in_api_key_mode(self):
        """Should pop GOOGLE_CLOUD_PROJECT from os.environ when in API key mode."""
        import os
        with patch.dict("os.environ", {"GOOGLE_CLOUD_PROJECT": "stale-project-123", "GCP_PROJECT": "stale-gcp-456"}, clear=True), patch("app.services.analysis_service.settings") as mock_settings:
            mock_settings.effective_gcp_project = ""
            mock_settings.GCP_PROJECT = ""
            mock_settings.GOOGLE_CLOUD_PROJECT = ""
            mock_settings.GEMINI_API_KEY = "sk-test-valid-key-123"
            mock_settings.LLM_API_KEY = ""
            mock_settings.LLM_MODEL = "gemini-3.5-flash-lite"
            mock_settings.BACKUP_LLM_MODEL = "gemini-3.1-flash-lite"
            mock_settings.GEMINI_TIER = "paid"

            AnalysisService(settings=mock_settings)

            assert "GOOGLE_CLOUD_PROJECT" not in os.environ
            assert "GCP_PROJECT" not in os.environ
            assert "GOOGLE_GENAI_USE_VERTEXAI" not in os.environ

