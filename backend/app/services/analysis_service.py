import logging
import asyncio
import time
from typing import Dict, List, Optional, Any

from app.core.config import settings
from app.models.schemas import (
    BiasAnalysis,
    Claim,
    Evidence,
    PerspectiveAnalysis,
    PerspectiveType,
    PerspectiveAnalysisLLMOutput,
)
from app.utils.input_sanitizer import (
    SanitizationError,
    sanitize_claim_text,
    sanitize_context,
    sanitize_evidence_text,
    sanitize_perspective_value,
    wrap_user_data,
)
from app.utils.llm_utils import get_validated_api_key, execute_adk_agent
from app.utils.prompt_helpers import build_user_data_prompt
from google.adk.agents import Agent
from google.genai import errors

logger = logging.getLogger(__name__)


class AnalysisServiceError(Exception):
    """Exception raised for errors in the AnalysisService."""
    pass


class PerspectiveAnalysisAgent(Agent):
    pass


class BiasAnalysisAgent(Agent):
    pass


class AnalysisService:
    def __init__(self, model_name: str | None = None):
        self.api_key = get_validated_api_key(settings)

        # Expose backup_client for health check compatibility
        self.backup_client = True if settings.BACKUP_LLM_MODEL else None

        self.perspective_agent_primary = PerspectiveAnalysisAgent(
            name="perspective_agent_primary",
            model=model_name or settings.LLM_MODEL,
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
        )

        self.perspective_agent_backup = PerspectiveAnalysisAgent(
            name="perspective_agent_backup",
            model=settings.BACKUP_LLM_MODEL,
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
        )

        self.bias_agent_primary = BiasAnalysisAgent(
            name="bias_agent_primary",
            model=model_name or settings.LLM_MODEL,
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
        )

        self.bias_agent_backup = BiasAnalysisAgent(
            name="bias_agent_backup",
            model=settings.BACKUP_LLM_MODEL,
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
        )

        # Circuit Breaker State
        self.cb_failures = 0
        self.cb_last_failure_time = 0
        self.cb_open = False
        self.cb_half_open = False
        self._cb_lock = asyncio.Lock()

    async def _run_agent_direct(self, agent: Agent, user_prompt: str, output_key: str, is_backup: bool = False) -> Any:
        """Delegates to the shared execute_adk_agent helper, resolving the output schema from output_key."""
        schema_map = {
            "perspective_result": PerspectiveAnalysisLLMOutput,
            "bias_result": BiasAnalysis,
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
        use_backup = False
        
        async with self._cb_lock:
            if self.cb_open:
                if time.time() - self.cb_last_failure_time > settings.CIRCUIT_BREAKER_RESET_TIMEOUT:
                    logger.info("Circuit breaker reset timeout expired. Transitioning to HALF-OPEN.")
                    self.cb_open = False
                    self.cb_half_open = True
                else:
                    use_backup = True
            elif self.cb_half_open:
                logger.info("Circuit breaker HALF-OPEN. Sending probe request to primary...")

        if use_backup:
            logger.warning("Circuit breaker OPEN. Using backup provider.")
            try:
                return await self._run_agent_direct(agent_backup, user_prompt, output_key, is_backup=True)
            except Exception as e:
                raise AnalysisServiceError(f"Fallback to backup failed: {e}") from e

        try:
            result = await self._run_agent_direct(agent_primary, user_prompt, output_key)
            async with self._cb_lock:
                if self.cb_half_open:
                    logger.info("Probe request successful. Closing circuit breaker.")
                    self.cb_half_open = False
                    self.cb_failures = 0
                elif self.cb_failures > 0:
                    logger.info("Primary provider recovered. Resetting failure count.")
                    self.cb_failures = 0
            return result

        except Exception as e:
            is_transient = isinstance(e, errors.APIError) and e.code in (429, 500, 502, 503, 504)
            
            if not is_transient:
                logger.error(f"Non-transient error in primary agent: {e}")
                raise e

            current_use_backup = False
            async with self._cb_lock:
                self.cb_last_failure_time = time.time()
                if self.cb_half_open:
                    logger.error(f"Probe request FAILED: {e}. Re-opening circuit breaker.")
                    self.cb_open = True
                    self.cb_half_open = False
                else:
                    self.cb_failures += 1
                    logger.error(f"Primary provider failed (Count: {self.cb_failures}): {e}")
                    if self.cb_failures >= settings.CIRCUIT_BREAKER_FAIL_THRESHOLD:
                        self.cb_open = True
                        logger.critical("Circuit breaker TRIPPED. Switching to backup provider.")
                current_use_backup = True

            if current_use_backup:
                logger.warning("Primary failed with transient error. Falling back to backup agent...")
                try:
                    return await self._run_agent_direct(agent_backup, user_prompt, output_key, is_backup=True)
                except Exception as backup_err:
                    logger.error(f"Backup provider ALSO failed: {backup_err}")
                    raise AnalysisServiceError(f"Primary and backup providers both failed. Backup error: {backup_err}") from backup_err

            raise e



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
        user_prompt = build_user_data_prompt(
            f"CLAIM: {sanitized_claim}\nPERSPECTIVE: {sanitized_perspective}\nEVIDENCE:\n{sanitized_evidence}",
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
        user_prompt = build_user_data_prompt(
            f"CLAIM TEXT: {sanitized_claim}\nCONTEXT: {sanitized_context if sanitized_context else 'No context provided'}",
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
            logger.exception("Error in bias analysis for claim '%s'", claim.text[:50])
            return BiasAnalysis(
                deception_rating=0.0, deception_rationale="Analysis failed."
            )

