"""
Test suite for Gemini 3.8 Flash capability optimizations.

Validates the 4 Capability Maximization Pillars:
1. Dynamic thinking_level routing (task-aware and environment-overridden).
2. Flattened & pruned prompt scaffolding (clean schema execution).
3. Thought signature and thinking token preservation in telemetry sanitizers.
4. Expanded output token ceilings (up to 64K / 65,536) & generous HTTP timeouts (120s).
"""

import os
from unittest.mock import patch
import pytest
from google.genai import types

from app.core.config import Settings
from app.utils.llm_utils import (
    EXCLUDED_TELEMETRY_KEYS,
    get_gemini_thinking_level,
    build_agent_generation_config,
)
from app.services.claim_extractor import ClaimExtractor
from app.services.analysis_service import AnalysisService
from app.services.content_classifier import PreClassifierService
from app.services.alethiology_service import AlethiologyService
from redteam.judge import create_llm_judge_agent


class TestGeminiOptimizationSettings:
    """Validate Settings configuration fields and bounds for Gemini 3.8 Flash."""

    def test_default_settings_values(self):
        with patch.dict(os.environ, {}, clear=True):
            s = Settings(_env_file=None, GCP_PROJECT="test-project")
            assert s.GEMINI_THINKING_LEVEL == "high"
            assert s.GEMINI_MAX_OUTPUT_TOKENS == 65536
            assert s.GEMINI_HTTP_TIMEOUT == 120.0

    def test_thinking_level_validation(self):
        with patch.dict(os.environ, {}, clear=True):
            # Valid levels
            for level in ("minimal", "low", "medium", "high", "HIGH", "LOW"):
                s = Settings(_env_file=None, GCP_PROJECT="test-project", GEMINI_THINKING_LEVEL=level)
                assert s.GEMINI_THINKING_LEVEL == level.strip().lower()

            # Invalid level
            with pytest.raises(ValueError, match="GEMINI_THINKING_LEVEL"):
                Settings(_env_file=None, GCP_PROJECT="test-project", GEMINI_THINKING_LEVEL="ultra")

    def test_output_tokens_and_timeout_bounds(self):
        with patch.dict(os.environ, {}, clear=True):
            with pytest.raises(ValueError, match="GEMINI_MAX_OUTPUT_TOKENS"):
                Settings(_env_file=None, GCP_PROJECT="test-project", GEMINI_MAX_OUTPUT_TOKENS=500)

            with pytest.raises(ValueError, match="GEMINI_HTTP_TIMEOUT"):
                Settings(_env_file=None, GCP_PROJECT="test-project", GEMINI_HTTP_TIMEOUT=5.0)


class TestDynamicThinkingLevelRouting:
    """Validate dynamic thinking_level resolution across task categories and env flags."""

    def test_analytical_floor_resists_blanket_env_downgrade(self):
        with patch.dict(os.environ, {"GEMINI_THINKING_LEVEL": "low"}):
            # Analytical tasks must strictly resist downgrade and enforce HIGH
            assert get_gemini_thinking_level(model="gemini-3.8-flash", task_type="extractor") == "high"
            assert get_gemini_thinking_level(model="gemini-3.8-flash", task_type="analysis") == "high"
            assert get_gemini_thinking_level(model="gemini-3.8-flash", task_type="alethiology") == "high"
            assert get_gemini_thinking_level(model="gemini-3.8-flash", task_type="judge") == "high"
            # Router and unclassified tasks properly adopt the env override
            assert get_gemini_thinking_level(model="gemini-3.8-flash", task_type="router") == "low"

    def test_router_ceiling_resists_high_env_override(self):
        with patch.dict(os.environ, {"GEMINI_THINKING_LEVEL": "high"}):
            # Router tasks must strictly enforce LOW even when general env is HIGH to protect latency
            assert get_gemini_thinking_level(model="gemini-3.8-flash", task_type="router") == "low"
            assert get_gemini_thinking_level(model="gemini-3.8-flash", task_type="micro_task") == "low"
            assert get_gemini_thinking_level(model="gemini-3.8-flash", task_type="classifier") == "low"

    def test_analytical_floor_strictly_non_bypassable(self):
        with patch.dict(os.environ, {"GEMINI_THINKING_LEVEL": "minimal"}):
            for task in ["extractor", "analysis", "alethiology", "judge", "evaluator"]:
                assert get_gemini_thinking_level(model="gemini-3.8-flash", task_type=task) == "high"

    def test_router_and_micro_task_routing(self):
        with patch.dict(os.environ, {}, clear=True):
            # Micro-tasks and routers should bypass deep thinking to preserve speed and low latency
            assert get_gemini_thinking_level(model="gemini-3.8-flash", task_type="router") == "low"
            assert get_gemini_thinking_level(model="gemini-3.8-flash", task_type="micro_task") == "low"
            assert get_gemini_thinking_level(model="gemini-3.8-flash", task_type="classifier") == "low"

    def test_deep_reasoning_task_routing(self):
        with patch.dict(os.environ, {}, clear=True):
            # Heavy reasoning tasks default to HIGH for Gemini 3.8 Flash
            assert get_gemini_thinking_level(model="gemini-3.8-flash", task_type="extractor") == "high"
            assert get_gemini_thinking_level(model="gemini-3.8-flash", task_type="analysis") == "high"
            assert get_gemini_thinking_level(model="gemini-3.8-flash", task_type="alethiology") == "high"
            assert get_gemini_thinking_level(model="gemini-3.8-flash", task_type="judge") == "high"
            assert get_gemini_thinking_level(model="gemini-3.8-flash", task_type="evaluator") == "high"


class TestBuildAgentGenerationConfig:
    """Validate GenerateContentConfig construction with ThinkingConfig, ceilings, and timeouts."""

    def test_build_generation_config_defaults(self):
        with patch.dict(os.environ, {}, clear=True):
            cfg = build_agent_generation_config(model="gemini-3.8-flash", task_type="extractor")
            assert cfg is not None
            assert cfg.max_output_tokens == 65536
            assert cfg.thinking_config is not None
            assert cfg.thinking_config.thinking_level == types.ThinkingLevel.HIGH
            assert cfg.http_options is not None
            assert cfg.http_options.timeout == 120.0

    def test_build_generation_config_for_router(self):
        with patch.dict(os.environ, {}, clear=True):
            cfg = build_agent_generation_config(model="gemini-3.8-flash", task_type="router")
            assert cfg is not None
            assert cfg.max_output_tokens == 2048
            assert cfg.thinking_config is not None
            assert cfg.thinking_config.thinking_level == types.ThinkingLevel.LOW
            assert cfg.http_options.timeout == 120.0

    def test_build_generation_config_for_router_with_high_env(self):
        high_settings = Settings(
            _env_file=None,
            GCP_PROJECT="test-project",
            GEMINI_MAX_OUTPUT_TOKENS=65536,
            GEMINI_HTTP_TIMEOUT=120.0,
            GEMINI_THINKING_LEVEL="high",
        )
        with patch.dict(os.environ, {"GEMINI_THINKING_LEVEL": "high"}):
            cfg = build_agent_generation_config(
                model="gemini-3.8-flash",
                task_type="router",
                settings=high_settings,
            )
            assert cfg is not None
            # Must remain 2048 tokens and LOW thinking to preserve sub-second guardrail latency
            assert cfg.max_output_tokens == 2048
            assert cfg.thinking_config is not None
            assert cfg.thinking_config.thinking_level == types.ThinkingLevel.LOW

    def test_analytical_floors_enforced_against_low_settings(self):
        low_settings = Settings(
            _env_file=None,
            GCP_PROJECT="test-project",
            GEMINI_MAX_OUTPUT_TOKENS=2048,
            GEMINI_HTTP_TIMEOUT=15.0,
            GEMINI_THINKING_LEVEL="low",
        )
        with patch.dict(os.environ, {}, clear=True):
            # Analytical task MUST enforce 65,536 tokens, 120s timeout, and HIGH thinking
            cfg = build_agent_generation_config(
                model="gemini-3.8-flash",
                task_type="extractor",
                settings=low_settings,
            )
            assert cfg.max_output_tokens == 65536
            assert cfg.http_options.timeout == 120.0
            assert cfg.thinking_config.thinking_level == types.ThinkingLevel.HIGH

    def test_analytical_floors_strictly_non_bypassable_in_factory(self):
        # Even if explicit lower tokens, timeout, or thinking_level are passed, analytical floor enforces 65536, 120s, and HIGH
        cfg = build_agent_generation_config(
            model="gemini-3.8-flash",
            task_type="analysis",
            thinking_level="low",
            max_output_tokens=1024,
            http_timeout=10.0,
        )
        assert cfg.max_output_tokens == 65536
        assert cfg.http_options.timeout == 120.0
        assert cfg.thinking_config.thinking_level == types.ThinkingLevel.HIGH

    def test_explicit_overrides_for_non_analytical_tasks(self):
        cfg = build_agent_generation_config(
            model="gemini-3.8-flash",
            task_type="router",
            thinking_level="medium",
            max_output_tokens=4096,
            http_timeout=90.0,
        )
        assert cfg is not None
        assert cfg.max_output_tokens == 4096
        assert cfg.thinking_config.thinking_level == types.ThinkingLevel.MEDIUM
        assert cfg.http_options.timeout == 90.0


class TestThoughtPreservationKeys:
    """Validate thought token and signature preservation in telemetry sanitizers."""

    def test_excluded_telemetry_keys_contains_thinking_fields(self):
        required_keys = {
            "thought",
            "thoughts",
            "thought_tokens",
            "thought_signature",
            "think",
            "reasoning",
        }
        assert required_keys.issubset(EXCLUDED_TELEMETRY_KEYS)


class TestServiceAgentConfigurations:
    """Validate that all service agents instantiate with optimized generation configs."""

    @pytest.fixture
    def mock_settings(self):
        s = Settings(_env_file=None, GCP_PROJECT="test-project", GCP_LOCATION="global", GEMINI_TIER="paid")
        s.LLM_MODEL = "gemini-3.8-flash"
        s.BACKUP_LLM_MODEL = "gemini-3.1-flash-lite"
        return s

    def test_claim_extractor_agent_config(self, mock_settings):
        extractor = ClaimExtractor(settings=mock_settings)
        cfg = extractor.agent.generate_content_config
        assert cfg is not None
        assert cfg.max_output_tokens == 65536
        assert cfg.thinking_config is not None
        assert cfg.thinking_config.thinking_level == types.ThinkingLevel.HIGH
        assert cfg.http_options.timeout == 120.0

    def test_analysis_service_agents_config(self, mock_settings):
        service = AnalysisService(settings=mock_settings)
        for agent in (service.perspective_agent_primary, service.bias_agent_primary):
            cfg = agent.generate_content_config
            assert cfg is not None
            assert cfg.max_output_tokens == 65536
            assert cfg.thinking_config is not None
            assert cfg.thinking_config.thinking_level == types.ThinkingLevel.HIGH
            assert cfg.http_options.timeout == 120.0

    def test_content_classifier_agent_config(self, mock_settings):
        service = PreClassifierService(settings=mock_settings)
        cfg = service.pre_classifier_agent_primary.generate_content_config
        assert cfg is not None
        assert cfg.max_output_tokens == 2048
        assert cfg.thinking_config is not None
        assert cfg.thinking_config.thinking_level == types.ThinkingLevel.LOW
        assert cfg.http_options.timeout == 120.0

    def test_alethiology_service_agent_config(self, mock_settings):
        service = AlethiologyService(settings=mock_settings)
        cfg = service.alethiology_agent_primary.generate_content_config
        assert cfg is not None
        assert cfg.max_output_tokens == 65536
        assert cfg.thinking_config is not None
        assert cfg.thinking_config.thinking_level == types.ThinkingLevel.HIGH
        assert cfg.http_options.timeout == 120.0

    def test_redteam_judge_agent_config(self):
        judge_agent = create_llm_judge_agent(model_name="gemini-3.8-flash", nonce="test-nonce")
        assert judge_agent.model == "gemini-3.8-flash"
        cfg = judge_agent.generate_content_config
        assert cfg is not None
        assert cfg.max_output_tokens == 65536
        assert cfg.thinking_config is not None
        assert cfg.thinking_config.thinking_level == types.ThinkingLevel.HIGH
        assert cfg.http_options.timeout == 120.0
