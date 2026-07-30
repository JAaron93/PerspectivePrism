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
            mock_settings.tier_max_concurrency = 10

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
            mock_settings.tier_max_concurrency = 10

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
            mock_settings.LLM_MODEL = "gemini-3.1-flash-lite"
            mock_settings.BACKUP_LLM_MODEL = "gemini-3.1-flash-lite"
            mock_settings.GEMINI_TIER = "paid"
            mock_settings.tier_max_concurrency = 10

            service = AnalysisService(settings=mock_settings)

            assert service.perspective_agent_primary.model == "gemini-3.1-flash-lite"

    def test_custom_model_name_override_parameter(self):
        """Should override settings when model_name parameter is passed directly to constructor."""
        with patch.dict("os.environ", {}, clear=True), patch("app.services.analysis_service.settings") as mock_settings:
            mock_settings.effective_gcp_project = ""
            mock_settings.GCP_PROJECT = ""
            mock_settings.GOOGLE_CLOUD_PROJECT = ""
            mock_settings.GEMINI_API_KEY = "sk-test-valid-key-123"
            mock_settings.LLM_API_KEY = ""
            mock_settings.LLM_MODEL = "gemini-3.5-flash-lite"
            mock_settings.BACKUP_LLM_MODEL = "gemini-3.1-flash-lite"
            mock_settings.GEMINI_TIER = "paid"
            mock_settings.tier_max_concurrency = 10

            service = AnalysisService(model_name="gemini-3.1-flash-lite", settings=mock_settings)

            assert service.perspective_agent_primary.model == "gemini-3.1-flash-lite"

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
            assert "Example:" in error_message
            assert "GCP_PROJECT=my-gcp-project-id" in error_message or "GEMINI_API_KEY=AIzaSy..." in error_message

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
            mock_settings.tier_max_concurrency = 10

            AnalysisService(settings=mock_settings)

            assert "GOOGLE_CLOUD_PROJECT" not in os.environ
            assert "GCP_PROJECT" not in os.environ
            assert "GOOGLE_GENAI_USE_VERTEXAI" not in os.environ

    def test_gemini_tier_stored_and_semaphore_created(self):
        """Should store gemini_tier and create a tier-aware concurrency semaphore."""
        import asyncio
        with patch.dict("os.environ", {}, clear=True), patch("app.services.analysis_service.settings") as mock_settings:
            mock_settings.effective_gcp_project = ""
            mock_settings.GCP_PROJECT = ""
            mock_settings.GOOGLE_CLOUD_PROJECT = ""
            mock_settings.GEMINI_API_KEY = "sk-test-valid-key-123"
            mock_settings.LLM_API_KEY = ""
            mock_settings.LLM_MODEL = "gemini-3.5-flash-lite"
            mock_settings.BACKUP_LLM_MODEL = "gemini-3.1-flash-lite"
            mock_settings.GEMINI_TIER = "paid"
            mock_settings.tier_max_concurrency = 10

            service = AnalysisService(settings=mock_settings)

            assert service.gemini_tier == "paid"
            assert isinstance(service._llm_semaphore, asyncio.Semaphore)
            assert service._llm_semaphore._value == 10

    def test_free_tier_creates_throttled_semaphore(self):
        """Free tier should create a semaphore with value 2 to throttle API calls."""
        import asyncio
        with patch.dict("os.environ", {}, clear=True), patch("app.services.analysis_service.settings") as mock_settings:
            mock_settings.effective_gcp_project = ""
            mock_settings.GCP_PROJECT = ""
            mock_settings.GOOGLE_CLOUD_PROJECT = ""
            mock_settings.GEMINI_API_KEY = "sk-test-valid-key-123"
            mock_settings.LLM_API_KEY = ""
            mock_settings.LLM_MODEL = "gemini-3.5-flash-lite"
            mock_settings.BACKUP_LLM_MODEL = "gemini-3.1-flash-lite"
            mock_settings.GEMINI_TIER = "free"
            mock_settings.tier_max_concurrency = 2

            service = AnalysisService(settings=mock_settings)

            assert service.gemini_tier == "free"
            assert service._llm_semaphore._value == 2

    def test_invalid_tier_concurrency_defaults_safely(self):
        """Invalid or non-positive tier_max_concurrency should safely default or clamp to >= 1."""
        with patch.dict("os.environ", {}, clear=True), patch("app.services.analysis_service.settings") as mock_settings:
            mock_settings.effective_gcp_project = ""
            mock_settings.GCP_PROJECT = ""
            mock_settings.GOOGLE_CLOUD_PROJECT = ""
            mock_settings.GEMINI_API_KEY = "sk-test-valid-key-123"
            mock_settings.LLM_API_KEY = ""
            mock_settings.LLM_MODEL = "gemini-3.5-flash-lite"
            mock_settings.BACKUP_LLM_MODEL = "gemini-3.1-flash-lite"
            mock_settings.GEMINI_TIER = "paid"
            mock_settings.tier_max_concurrency = "invalid-non-numeric"

            service = AnalysisService(settings=mock_settings)

            assert service._llm_semaphore._value == 4

    def test_settings_tier_max_concurrency_property(self):
        """Settings.tier_max_concurrency should return correct limit per tier."""
        from app.core.config import Settings
        cfg_paid = Settings(GEMINI_TIER="paid")
        assert cfg_paid.tier_max_concurrency == 10

        cfg_standard = Settings(GEMINI_TIER="standard")
        assert cfg_standard.tier_max_concurrency == 4

        cfg_free = Settings(GEMINI_TIER="free")
        assert cfg_free.tier_max_concurrency == 2

