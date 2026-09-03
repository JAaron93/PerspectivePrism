"""
Test to verify GCP Vertex AI Mode initialization in AnalysisService.
"""

import asyncio
from unittest.mock import patch
import pytest

from app.services.analysis_service import AnalysisService


class TestAnalysisServiceInitialization:
    """Test AnalysisService initialization and validation in GCP Vertex AI Mode."""

    def test_initialization_with_gcp_project_vertex_ai(self):
        """Should initialize successfully with GCP_PROJECT in Vertex AI mode."""
        with patch.dict("os.environ", {}, clear=True), patch("app.services.analysis_service.settings") as mock_settings:
            mock_settings.effective_gcp_project = "my-gcp-project"
            mock_settings.GCP_LOCATION = "us-central1"
            mock_settings.LLM_MODEL = "gemini-3.8-flash"
            mock_settings.BACKUP_LLM_MODEL = "gemini-3.1-flash-lite"
            mock_settings.GEMINI_TIER = "paid"
            mock_settings.tier_max_concurrency = 10

            service = AnalysisService(settings=mock_settings)

            assert service.perspective_agent_primary is not None
            assert service.gcp_project == "my-gcp-project"
            assert service.gcp_location == "us-central1"
            assert service.perspective_agent_primary.model == "gemini-3.8-flash"

    def test_initialization_without_gcp_project_fails(self):
        """Should raise ValueError when GCP_PROJECT is missing."""
        with patch.dict("os.environ", {}, clear=True), patch("app.services.analysis_service.settings") as mock_settings:
            mock_settings.effective_gcp_project = ""
            mock_settings.GCP_PROJECT = ""
            mock_settings.GOOGLE_CLOUD_PROJECT = ""
            mock_settings.LLM_MODEL = "gemini-3.8-flash"
            mock_settings.BACKUP_LLM_MODEL = "gemini-3.1-flash-lite"
            mock_settings.GEMINI_TIER = "paid"

            with pytest.raises(ValueError) as exc_info:
                AnalysisService(settings=mock_settings)

            error_message = str(exc_info.value)
            assert "GCP_PROJECT" in error_message
            assert "Google AI Studio Key Mode has been permanently removed" in error_message

    def test_uses_custom_model_from_settings(self):
        """Should use custom model from settings when configured."""
        with patch.dict("os.environ", {}, clear=True), patch("app.services.analysis_service.settings") as mock_settings:
            mock_settings.effective_gcp_project = "my-gcp-project"
            mock_settings.GCP_LOCATION = "global"
            mock_settings.LLM_MODEL = "gemini-3.1-flash-lite"
            mock_settings.BACKUP_LLM_MODEL = "gemini-3.1-flash-lite"
            mock_settings.GEMINI_TIER = "paid"
            mock_settings.tier_max_concurrency = 10

            service = AnalysisService(settings=mock_settings)

            assert service.perspective_agent_primary.model == "gemini-3.1-flash-lite"

    def test_custom_model_name_override_parameter(self):
        """Should override settings when model_name parameter is passed directly to constructor."""
        with patch.dict("os.environ", {}, clear=True), patch("app.services.analysis_service.settings") as mock_settings:
            mock_settings.effective_gcp_project = "my-gcp-project"
            mock_settings.GCP_LOCATION = "global"
            mock_settings.LLM_MODEL = "gemini-3.8-flash"
            mock_settings.BACKUP_LLM_MODEL = "gemini-3.1-flash-lite"
            mock_settings.GEMINI_TIER = "paid"
            mock_settings.tier_max_concurrency = 10

            service = AnalysisService(model_name="gemini-3.1-flash-lite", settings=mock_settings)

            assert service.perspective_agent_primary.model == "gemini-3.1-flash-lite"

    def test_clears_stale_api_keys_from_environment(self):
        """Should pop legacy GEMINI_API_KEY and LLM_API_KEY from os.environ."""
        import os
        with patch.dict("os.environ", {"GEMINI_API_KEY": "stale-key-123", "LLM_API_KEY": "stale-key-456"}, clear=True), patch("app.services.analysis_service.settings") as mock_settings:
            mock_settings.effective_gcp_project = "my-gcp-project"
            mock_settings.GCP_LOCATION = "global"
            mock_settings.LLM_MODEL = "gemini-3.8-flash"
            mock_settings.BACKUP_LLM_MODEL = "gemini-3.1-flash-lite"
            mock_settings.GEMINI_TIER = "paid"
            mock_settings.tier_max_concurrency = 10

            AnalysisService(settings=mock_settings)

            assert "GEMINI_API_KEY" not in os.environ
            assert "LLM_API_KEY" not in os.environ
            assert os.environ.get("GOOGLE_GENAI_USE_VERTEXAI") == "true"

    def test_gemini_tier_stored_and_semaphore_created(self):
        """Should store gemini_tier and max_concurrency on service instance."""
        with patch.dict("os.environ", {}, clear=True), patch("app.services.analysis_service.settings") as mock_settings:
            mock_settings.effective_gcp_project = "my-gcp-project"
            mock_settings.GCP_LOCATION = "global"
            mock_settings.LLM_MODEL = "gemini-3.8-flash"
            mock_settings.BACKUP_LLM_MODEL = "gemini-3.1-flash-lite"
            mock_settings.GEMINI_TIER = "paid"
            mock_settings.tier_max_concurrency = 10

            service = AnalysisService(settings=mock_settings)

            assert service.gemini_tier == "paid"
            assert service.max_concurrency == 10
            assert isinstance(service._llm_semaphore, asyncio.Semaphore)

    @pytest.mark.asyncio
    async def test_semaphore_concurrency_behavior(self):
        """Should block (timeout) when attempting to acquire beyond max_concurrency."""
        with patch.dict("os.environ", {}, clear=True), patch("app.services.analysis_service.settings") as mock_settings:
            mock_settings.effective_gcp_project = "my-gcp-project"
            mock_settings.GCP_LOCATION = "global"
            mock_settings.LLM_MODEL = "gemini-3.8-flash"
            mock_settings.BACKUP_LLM_MODEL = "gemini-3.1-flash-lite"
            mock_settings.GEMINI_TIER = "paid"
            mock_settings.tier_max_concurrency = 2

            service = AnalysisService(settings=mock_settings)

            # Acquire max_concurrency times (2 times)
            await service._llm_semaphore.acquire()
            await service._llm_semaphore.acquire()

            # Attempt 3rd acquire should block and time out
            with pytest.raises(asyncio.TimeoutError):
                await asyncio.wait_for(service._llm_semaphore.acquire(), timeout=0.05)

    def test_settings_tier_max_concurrency_property(self):
        """Settings.tier_max_concurrency should return correct paid tier limit."""
        from app.core.config import Settings
        with patch.dict("os.environ", {}, clear=True):
            cfg_paid = Settings(_env_file=None, GCP_PROJECT="my-project", GEMINI_TIER="paid")
            assert cfg_paid.tier_max_concurrency == 10
