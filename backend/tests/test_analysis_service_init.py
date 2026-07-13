"""
Test to verify OpenAI API key validation in AnalysisService.

This test ensures that the AnalysisService properly validates
the OPENAI_API_KEY configuration before initializing.
"""

from unittest.mock import patch

import pytest
from app.services.analysis_service import AnalysisService


class TestAnalysisServiceInitialization:
    """Test AnalysisService initialization and validation."""

    def test_initialization_with_valid_api_key(self):
        """Should initialize successfully with valid API key."""
        with patch("app.services.analysis_service.settings") as mock_settings:
            mock_settings.GEMINI_API_KEY = "sk-test-valid-key-123"
            mock_settings.LLM_API_KEY = ""
            mock_settings.LLM_MODEL = "gemini-3.5-flash"
            mock_settings.LLM_PROVIDER = "google"
            mock_settings.BACKUP_LLM_MODEL = "gemini-3.1-flash-lite"

            service = AnalysisService()

            assert service.perspective_agent_primary is not None
            assert service.perspective_agent_primary.model == "gemini-3.5-flash"

    @pytest.mark.parametrize(
        "api_key,expected_substrings",
        [
            ("", ["LLM_API_KEY is not configured", ".env file"]),
            ("   \n\t   ", ["LLM_API_KEY is not configured"]),
            (None, ["LLM_API_KEY is not configured"]),
        ],
    )
    def test_initialization_with_invalid_api_key(self, api_key, expected_substrings):
        """Should raise ValueError with invalid keys (empty, whitespace-only, or None)."""
        with patch("app.services.analysis_service.settings") as mock_settings:
            mock_settings.GEMINI_API_KEY = ""
            mock_settings.LLM_API_KEY = api_key
            mock_settings.LLM_MODEL = "gemini-3.5-flash"
            mock_settings.LLM_PROVIDER = "google"
            mock_settings.BACKUP_LLM_MODEL = "gemini-3.1-flash-lite"

            with pytest.raises(ValueError) as exc_info:
                AnalysisService()

            error_message = str(exc_info.value)
            for expected_substring in expected_substrings:
                assert expected_substring in error_message

    def test_uses_custom_model_from_settings(self):
        """Should use custom model from settings when configured."""
        with patch("app.services.analysis_service.settings") as mock_settings:
            mock_settings.GEMINI_API_KEY = "sk-test-valid-key-123"
            mock_settings.LLM_API_KEY = ""
            mock_settings.LLM_MODEL = "gemini-test-model"
            mock_settings.LLM_PROVIDER = "google"
            mock_settings.BACKUP_LLM_MODEL = "gemini-3.1-flash-lite"

            service = AnalysisService()

            assert service.perspective_agent_primary.model == "gemini-test-model"

    def test_error_message_includes_example(self):
        """Error message should include helpful example."""
        with patch("app.services.analysis_service.settings") as mock_settings:
            mock_settings.GEMINI_API_KEY = ""
            mock_settings.LLM_API_KEY = ""
            mock_settings.LLM_MODEL = "gemini-3.5-flash"
            mock_settings.LLM_PROVIDER = "google"
            mock_settings.BACKUP_LLM_MODEL = "gemini-3.1-flash-lite"

            with pytest.raises(ValueError) as exc_info:
                AnalysisService()

            error_message = str(exc_info.value)
            assert "Example" in error_message or "LLM_API_KEY" in error_message

