import asyncio
import json
import logging
import time

from typing import Dict, List, Optional, Callable, Awaitable


from app.core.config import settings
from app.models.schemas import (
    BiasAnalysis,
    Claim,
    Evidence,
    PerspectiveAnalysis,
    PerspectiveType,
)
from app.utils.input_sanitizer import (
    SanitizationError,
    sanitize_claim_text,
    sanitize_context,
    sanitize_evidence_text,
    sanitize_perspective_value,
    wrap_user_data,
)
from app.utils.llm_client import LLMClient



logger = logging.getLogger(__name__)


class AnalysisService:
    def __init__(self, llm_client: Optional[LLMClient] = None):
        self.llm_client = llm_client or LLMClient(settings=settings)

    @property
    def provider(self):
        return self.llm_client.provider

    @property
    def client(self):
        return self.llm_client.client

    @client.setter
    def client(self, value):
        self.llm_client.client = value

    @property
    def backup_client(self):
        return self.llm_client.backup_client

    @backup_client.setter
    def backup_client(self, value):
        self.llm_client.backup_client = value

    @property
    def model(self):
        return self.llm_client.model

    @model.setter
    def model(self, value):
        self.llm_client.model = value

    @property
    def backup_model(self):
        return self.llm_client.backup_model

    @backup_model.setter
    def backup_model(self, value):
        self.llm_client.backup_model = value

    @property
    def cb_failures(self):
        return self.llm_client.cb_failures

    @cb_failures.setter
    def cb_failures(self, value):
        self.llm_client.cb_failures = value

    @property
    def cb_last_failure_time(self):
        return self.llm_client.cb_last_failure_time

    @cb_last_failure_time.setter
    def cb_last_failure_time(self, value):
        self.llm_client.cb_last_failure_time = value

    @property
    def cb_open(self):
        return self.llm_client.cb_open

    @cb_open.setter
    def cb_open(self, value):
        self.llm_client.cb_open = value

    @property
    def cb_half_open(self):
        return self.llm_client.cb_half_open

    @cb_half_open.setter
    def cb_half_open(self, value):
        self.llm_client.cb_half_open = value

    async def _call_llm(self, prompt: str, system_prompt: str = None) -> str:
        """Wrapper to call centralized LLMClient."""
        return await self.llm_client.call_llm(prompt, system_prompt)



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
                explanation=f"Input validation failed: {str(e)}",
                evidence=evidence_list,
            )

        # Build prompt with clear separation between instructions and user data
        prompt = f"""You are an objective analyst. Your task is to analyze a claim based on evidence from a specific perspective.

INSTRUCTIONS:
1. Read the claim and evidence provided in the USER DATA section below
2. Based ONLY on the provided evidence, determine if this perspective SUPPORTS, REFUTES, or is AMBIGUOUS regarding the claim
3. Provide a confidence score (0.0 to 1.0) and a brief explanation
4. Output your analysis in the specified JSON format

{wrap_user_data(sanitized_claim, "CLAIM")}

{wrap_user_data(sanitized_perspective, "PERSPECTIVE")}

{wrap_user_data(sanitized_evidence, "EVIDENCE")}

OUTPUT FORMAT (JSON):
{{
    "stance": "Support" | "Refute" | "Ambiguous",
    "confidence": float,
    "explanation": "string"
}}"""

        try:
            content = await self._call_llm(prompt)
            result = json.loads(content)

            return PerspectiveAnalysis(
                perspective=perspective,
                stance=result.get("stance", "Ambiguous"),
                confidence=result.get("confidence", 0.0),
                explanation=result.get("explanation", "Failed to parse explanation."),
                evidence=evidence_list,
            )

        except Exception as e:
            logger.exception("Error in perspective analysis for %s", perspective.value)
            return PerspectiveAnalysis(
                perspective=perspective,
                stance="Error",
                confidence=0.0,
                explanation=f"Analysis failed: {str(e)}",
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
                deception_rationale=f"Input validation failed: {str(e)}",
            )

        # Build prompt with clear separation between instructions and user data
        prompt = f"""You are a bias and deception analyst. Your task is to analyze text for various forms of bias and potential deception.

INSTRUCTIONS:
1. Read the claim and context provided in the USER DATA section below
2. Evaluate the following aspects:
   - Framing Bias (loaded language, emotional appeals)
   - Sourcing Bias (if sources are mentioned)
   - Omission Bias (cherry-picking)
   - Sensationalism (clickbait style)
   - Deception Rating (0-10, where 10 is highly deceptive/intentional lie)
3. Output your analysis in the specified JSON format

{wrap_user_data(sanitized_claim, "CLAIM TEXT")}

{wrap_user_data(sanitized_context if sanitized_context else "No context provided", "CONTEXT")}

OUTPUT FORMAT (JSON):
{{
    "framing_bias": "string or null",
    "sourcing_bias": "string or null",
    "omission_bias": "string or null",
    "sensationalism": "string or null",
    "deception_rating": float,
    "deception_rationale": "string"
}}"""

        try:
            content = await self._call_llm(prompt)
            result = json.loads(content)

            return BiasAnalysis(
                framing_bias=result.get("framing_bias"),
                sourcing_bias=result.get("sourcing_bias"),
                omission_bias=result.get("omission_bias"),
                sensationalism=result.get("sensationalism"),
                deception_rating=result.get("deception_rating", 0.0),
                deception_rationale=result.get(
                    "deception_rationale", "No rationale provided."
                ),
            )

        except Exception as e:
            logger.exception("Error in bias analysis for claim '%s'", claim.text[:50])
            return BiasAnalysis(
                deception_rating=0.0, deception_rationale=f"Analysis failed: {str(e)}"
            )
