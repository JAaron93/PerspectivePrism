import logging
import asyncio
import time
from typing import List, Any, Optional

from app.core.config import configure_provider_env, settings
from app.models.schemas import (
    AlethiologyAnalysis,
    BiasAnalysis,
    Claim,
    Evidence,
    PerspectiveAnalysis,
    PerspectiveType,
    PerspectiveAnalysisLLMOutput,
)
from app.services.alethiology_service import AlethiologyService
from app.utils.input_sanitizer import (
    SanitizationError,
    sanitize_claim_text,
    sanitize_context,
    sanitize_evidence_text,
    sanitize_perspective_value,
)
from app.utils.llm_utils import (
    execute_adk_agent,
    init_tier_concurrency,
    execute_agent_with_circuit_breaker,
    build_agent_generation_config,
)
from app.utils.prompt_helpers import (
    build_user_data_prompt,
    contains_delimiter_forgery,
)
from google.adk.agents import Agent
from google.genai import errors

logger = logging.getLogger(__name__)


class AnalysisServiceError(Exception):
    """Exception raised for errors in the AnalysisService."""
    pass


class AnalysisService:
    def __init__(self, model_name: str | None = None, settings: Any = None):
        self.settings = settings or globals().get("settings")
        provider_info, max_concurrent, self._llm_semaphore = init_tier_concurrency(
            self.settings, service_name="AnalysisService", configure_fn=configure_provider_env
        )
        self.gcp_project = provider_info["project"]
        self.gcp_location = provider_info["location"]
        self.gemini_tier = provider_info["tier"]
        self.max_concurrency = max_concurrent

        backup_model = getattr(self.settings, "BACKUP_LLM_MODEL", "gemini-3.1-flash-lite")
        primary_model = model_name or getattr(self.settings, "LLM_MODEL", "gemini-3.8-flash")

        # Expose backup_client for health check compatibility
        self.backup_client = True if backup_model else None

        self.alethiology_service = AlethiologyService(model_name=primary_model, settings=self.settings)

        self.perspective_agent_primary = Agent(
            name="perspective_agent_primary",
            model=primary_model,
            instruction=(
                "You are an objective analyst. Your task is to analyze a claim based on evidence from a specific perspective.\n\n"
                "INSTRUCTIONS:\n"
                "1. Read the claim and evidence provided in the USER DATA section below\n"
                "2. Based ONLY on the provided evidence, determine if this perspective SUPPORTS, REFUTES, or is AMBIGUOUS regarding the claim\n"
                "3. Provide a confidence score (0.0 to 1.0) and a brief explanation\n"
                "4. Output your analysis in the specified JSON format"
            ),
            output_schema=PerspectiveAnalysisLLMOutput,
            output_key="perspective_result",
            generate_content_config=build_agent_generation_config(
                model=primary_model,
                task_type="analysis",
                settings=self.settings,
            ),
        )

        self.perspective_agent_backup = Agent(
            name="perspective_agent_backup",
            model=backup_model,
            instruction=(
                "You are an objective analyst. Your task is to analyze a claim based on evidence from a specific perspective.\n\n"
                "INSTRUCTIONS:\n"
                "1. Read the claim and evidence provided in the USER DATA section below\n"
                "2. Based ONLY on the provided evidence, determine if this perspective SUPPORTS, REFUTES, or is AMBIGUOUS regarding the claim\n"
                "3. Provide a confidence score (0.0 to 1.0) and a brief explanation\n"
                "4. Output your analysis in the specified JSON format"
            ),
            output_schema=PerspectiveAnalysisLLMOutput,
            output_key="perspective_result",
            generate_content_config=build_agent_generation_config(
                model=backup_model,
                task_type="analysis",
                settings=self.settings,
            ),
        )

        self.bias_agent_primary = Agent(
            name="bias_agent_primary",
            model=primary_model,
            instruction=(
                "You are a bias and deception analyst. Your task is to analyze text for various forms of bias and potential deception.\n\n"
                "INSTRUCTIONS:\n"
                "1. Read the claim and context provided in the USER DATA section below\n"
                "2. Evaluate the following aspects:\n"
                "   - Framing Bias (loaded language, emotional appeals)\n"
                "   - Sourcing Bias (if sources are mentioned)\n"
                "   - Omission Bias (cherry-picking)\n"
                "   - Sensationalism (clickbait style)\n"
                "   - Deception Rating (0-10, where 10 is highly deceptive/intentional lie)\n"
                "3. Output your analysis in the specified JSON format"
            ),
            output_schema=BiasAnalysis,
            output_key="bias_result",
            generate_content_config=build_agent_generation_config(
                model=primary_model,
                task_type="analysis",
                settings=self.settings,
            ),
        )

        self.bias_agent_backup = Agent(
            name="bias_agent_backup",
            model=backup_model,
            instruction=(
                "You are a bias and deception analyst. Your task is to analyze text for various forms of bias and potential deception.\n\n"
                "INSTRUCTIONS:\n"
                "1. Read the claim and context provided in the USER DATA section below\n"
                "2. Evaluate the following aspects:\n"
                "   - Framing Bias (loaded language, emotional appeals)\n"
                "   - Sourcing Bias (if sources are mentioned)\n"
                "   - Omission Bias (cherry-picking)\n"
                "   - Sensationalism (clickbait style)\n"
                "   - Deception Rating (0-10, where 10 is highly deceptive/intentional lie)\n"
                "3. Output your analysis in the specified JSON format"
            ),
            output_schema=BiasAnalysis,
            output_key="bias_result",
            generate_content_config=build_agent_generation_config(
                model=backup_model,
                task_type="analysis",
                settings=self.settings,
            ),
        )

        # Circuit Breaker State
        self.cb_failures = 0
        self.cb_last_failure_time = 0
        self.cb_open = False
        self.cb_half_open = False
        self.cb_probing = False
        self._cb_lock = asyncio.Lock()

    async def _run_agent_direct(self, agent: Agent, user_prompt: str, output_key: str, is_backup: bool = False) -> Any:
        """Acquires the tier-aware semaphore then delegates to the shared execute_adk_agent helper."""
        async with self._llm_semaphore:
            schema_map = {
                "perspective_result": PerspectiveAnalysisLLMOutput,
                "bias_result": BiasAnalysis,
                "alethiology_result": AlethiologyAnalysis,
            }
            return await execute_adk_agent(
                agent=agent,
                user_prompt=user_prompt,
                output_key=output_key,
                output_schema=schema_map.get(output_key),
                is_backup=is_backup,
            )

    async def _run_agent_with_fallback(
        self,
        agent_primary: Agent,
        agent_backup: Agent,
        user_prompt: str,
        output_key: str,
    ) -> Any:
        return await execute_agent_with_circuit_breaker(
            service_state=self,
            run_direct_fn=self._run_agent_direct,
            agent_primary=agent_primary,
            agent_backup=agent_backup,
            user_prompt=user_prompt,
            output_key=output_key,
            service_name="Analysis",
            error_cls=AnalysisServiceError,
        )



    async def analyze_perspective(
        self, claim: Claim, perspective: PerspectiveType, evidence_list: List[Evidence]
    ) -> PerspectiveAnalysis:
        """
        Analyzes a claim from a specific perspective using the retrieved evidence.
        """
        if not evidence_list:
            return PerspectiveAnalysis(
                perspective=perspective,
                stance="Unknown",
                confidence=0.0,
                explanation="No evidence found from this perspective.",
                evidence=[],
            )

        # Sanitize all user inputs
        try:
            sanitized_claim = sanitize_claim_text(claim.text)
            sanitized_perspective = sanitize_perspective_value(perspective.value)
            sanitized_evidence = "\n".join(
                [
                    sanitize_evidence_text(f"- {e.title}: {e.snippet}")
                    for e in evidence_list
                ]
            )
        except SanitizationError as e:
            logger.error(
                "Sanitization error in perspective analysis for %s: %s",
                perspective.value,
                e,
            )
            return PerspectiveAnalysis(
                perspective=perspective,
                stance="Error",
                confidence=0.0,
                explanation="Input validation failed.",
                evidence=evidence_list,
            )

        # Build prompt with static/context data at the absolute start
        perspective_data = f"CLAIM: {sanitized_claim}\nPERSPECTIVE: {sanitized_perspective}\nEVIDENCE:\n{sanitized_evidence}"
        if contains_delimiter_forgery(perspective_data):
            logger.warning("Delimiter forgery detected in perspective input; isolating via dynamic prompt nonce guard")

        user_prompt = build_user_data_prompt(
            perspective_data,
            "Please analyze this claim from the specified perspective based on the evidence."
        )

        try:
            result = await self._run_agent_with_fallback(
                agent_primary=self.perspective_agent_primary,
                agent_backup=self.perspective_agent_backup,
                user_prompt=user_prompt,
                output_key="perspective_result",
            )

            return PerspectiveAnalysis(
                perspective=perspective,
                stance=result.stance,
                confidence=result.confidence,
                explanation=result.explanation,
                evidence=evidence_list,
            )

        except Exception as e:
            if "Budget exhausted" in str(e) or (e.__cause__ and "Budget exhausted" in str(e.__cause__)):
                raise e
            logger.exception("Error in perspective analysis for %s", perspective.value)
            return PerspectiveAnalysis(
                perspective=perspective,
                stance="Error",
                confidence=0.0,
                explanation="Analysis failed.",
                evidence=evidence_list,
            )

    async def analyze_bias_and_deception(self, claim: Claim) -> BiasAnalysis:
        """
        Analyzes the claim text for bias and potential deception.
        """
        try:
            # Sanitize all user inputs
            sanitized_claim = sanitize_claim_text(claim.text)
            sanitized_context = sanitize_context(claim.context)

        except SanitizationError as e:
            logger.error(
                "Sanitization error in bias analysis for claim '%s': %s",
                claim.text[:50],
                e,
            )
            return BiasAnalysis(
                deception_rating=0.0,
                deception_rationale="Input validation failed.",
            )

        # Build prompt with static/context data at the absolute start
        bias_data = f"CLAIM TEXT: {sanitized_claim}\nCONTEXT: {sanitized_context if sanitized_context else 'No context provided'}"
        if contains_delimiter_forgery(bias_data):
            logger.warning("Delimiter forgery detected in bias analysis input; isolating via dynamic prompt nonce guard")

        user_prompt = build_user_data_prompt(
            bias_data,
            "Please analyze this claim and context for bias and deception."
        )

        try:
            result = await self._run_agent_with_fallback(
                agent_primary=self.bias_agent_primary,
                agent_backup=self.bias_agent_backup,
                user_prompt=user_prompt,
                output_key="bias_result",
            )

            return BiasAnalysis(
                framing_bias=result.framing_bias,
                sourcing_bias=result.sourcing_bias,
                omission_bias=result.omission_bias,
                sensationalism=result.sensationalism,
                deception_rating=result.deception_rating,
                deception_rationale=result.deception_rationale,
            )

        except Exception as e:
            if "Budget exhausted" in str(e) or (e.__cause__ and "Budget exhausted" in str(e.__cause__)):
                raise e
            logger.exception("Error in bias analysis for claim '%s'", claim.text[:50])
            return BiasAnalysis(
                deception_rating=0.0, deception_rationale="Analysis failed."
            )

    async def analyze_alethiology(self, claim: Claim) -> Optional[AlethiologyAnalysis]:
        """
        Analyzes the implicit theory of truth (epistemological framework) of a claim.
        """
        return await self.alethiology_service.analyze_alethiology(claim)


