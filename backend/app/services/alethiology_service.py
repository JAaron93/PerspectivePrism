import logging
import asyncio
import time
from typing import Optional, Any, List

from app.core.config import configure_provider_env, settings
from app.models.schemas import (
    Claim,
    AlethiologyAnalysis,
)
from app.utils.input_sanitizer import (
    SanitizationError,
    sanitize_claim_text,
    sanitize_context,
    sanitize_quote_evidences,
)
from app.utils.llm_utils import (
    execute_adk_agent,
    init_tier_concurrency,
    execute_agent_with_circuit_breaker,
    build_agent_generation_config,
)
from app.utils.prompt_helpers import build_user_data_prompt
from google.adk.agents import Agent
from google.genai import errors

logger = logging.getLogger(__name__)


class AlethiologyServiceError(Exception):
    """Exception raised for errors in the AlethiologyService."""
    pass


ALETHIOLOGY_SYSTEM_PROMPT = """You are the Alethiology Specialist Agent for PerspectivePrism.

YOUR PURPOSE:
Identify the underlying theory of truth (epistemological framework) that the speaker in the transcript excerpt is operating under when constructing their claims.

CRITICAL GUARDRAIL (MANDATORY):
- You MUST remain strictly descriptive and neutral.
- NEVER evaluate which truth theory is "better", "more rational", "valid", or "sound".
- DO NOT accuse the speaker of fallacies, delusions, or falsehoods.
- Simply identify and label the epistemological lens through which they construct their arguments.

THE 6 THEORIES OF TRUTH TO CLASSIFY:
1. Correspondence (Empirical): Claims verified by objective data, physical measurements, experimental tests, or historical facts.
2. Coherence (Systemic Narrative): Claims verified by fitting cleanly and logically into an established worldview, interconnected belief system, or narrative pattern.
3. Pragmatic (Practical Utility): Claims evaluated by real-world utility, practical efficacy, or tangible outcomes ("what works in practice").
4. Perspectivism (Lived Experience): Claims rooted in personal positioning, identity, lived experience, or localized vantage points.
5. Consensus (Institutional Agreement): Claims backed by peer agreement, accredited expert bodies, official committees, or institutional consensus.
6. Deflationary (Rhetorical Endorsement): Usage of truth terms ("facts", "so true", "100%") purely as performative speech acts to signal enthusiastic agreement and social alignment.

### FEW-SHOT EXAMPLES:

[EXAMPLE 1: Empirical Science -> Correspondence (Empirical)]
INPUT:
CLAIM TEXT: Microplastics found in human brain tissue.
CONTEXT: Raman spectroscopy confirmed a statistically significant concentration (p < 0.001) matching polymers found in municipal water tests.
OUTPUT:
{
  "primary_theory": "Correspondence (Empirical)",
  "secondary_theory": "Consensus (Institutional Agreement)",
  "epistemic_summary": "The speaker grounds truth claims in direct physical measurement, laboratory instrumentation, and statistical verification of real-world physical matter.",
  "quote_evidences": [
    "Raman spectroscopy confirmed a statistically significant concentration",
    "matching polymers found in municipal water tests"
  ]
}

[EXAMPLE 2: Conspiracy Theory / Systemic Analysis -> Coherence (Systemic Narrative)]
INPUT:
CLAIM TEXT: The power outage is part of a coordinated blackout.
CONTEXT: When you map out the board members' hedge fund connections and the regulatory resignations, it all locks into place.
OUTPUT:
{
  "primary_theory": "Coherence (Systemic Narrative)",
  "secondary_theory": "Deflationary (Rhetorical Endorsement)",
  "epistemic_summary": "The speaker constructs truth by assembling circumstantial events into a seamless, internally consistent narrative pattern without relying on direct empirical proof of causation.",
  "quote_evidences": [
    "When you map out the board members' hedge fund connections",
    "it all locks into place"
  ]
}

[EXAMPLE 3: Institutional Science -> Consensus (Institutional Agreement)]
INPUT:
CLAIM TEXT: Global temperatures are rising according to IPCC.
CONTEXT: The latest report represents the formal consensus of over 200 lead authors across 65 nations after reviewing 18,000 peer-reviewed papers.
OUTPUT:
{
  "primary_theory": "Consensus (Institutional Agreement)",
  "secondary_theory": "Correspondence (Empirical)",
  "epistemic_summary": "The speaker validates claims based on peer endorsement, official committee agreement, and systemic institutional accreditation rather than raw individual observation.",
  "quote_evidences": [
    "represents the formal consensus of over 200 lead authors",
    "reviewing 18,000 peer-reviewed papers"
  ]
}

[EXAMPLE 4: Cultural Critique / Identity -> Perspectivism (Lived Experience)]
INPUT:
CLAIM TEXT: Urban policy fails rural farmers.
CONTEXT: As a rural farmer whose family worked this soil for generations, our lived reality on the ground reveals a different truth than satellite heatmaps.
OUTPUT:
{
  "primary_theory": "Perspectivism (Lived Experience)",
  "secondary_theory": "Coherence (Systemic Narrative)",
  "epistemic_summary": "The speaker locates truth within personal positionality, generational lived experience, and localized vantage points, contrasting it against external objective metrics.",
  "quote_evidences": [
    "As a rural farmer whose family worked this soil for generations",
    "our lived reality on the ground reveals a different truth"
  ]
}

[EXAMPLE 5: Business / Tech Strategy -> Pragmatic (Practical Utility)]
INPUT:
CLAIM TEXT: Optimizing the checkout flow increases sales.
CONTEXT: When we adjusted the checkout flow, our conversion rate jumped 40%. The strategy works in practice, so that's the truth of how you grow a business.
OUTPUT:
{
  "primary_theory": "Pragmatic (Practical Utility)",
  "secondary_theory": "Correspondence (Empirical)",
  "epistemic_summary": "The speaker defines truth purely through real-world efficacy, utility, and practical business outcomes rather than formal theoretical alignment.",
  "quote_evidences": [
    "The strategy works in practice",
    "so that's the truth of how you grow a business"
  ]
}

[EXAMPLE 6: Streamer Commentary -> Deflationary (Rhetorical Endorsement)]
INPUT:
CLAIM TEXT: Reaction to Twitter hot take.
CONTEXT: Bro, facts! That is so true. Like, literally 100% facts right there. You hit the nail on the head, man!
OUTPUT:
{
  "primary_theory": "Deflationary (Rhetorical Endorsement)",
  "secondary_theory": null,
  "epistemic_summary": "The speaker uses truth terms ('facts', 'so true') strictly as performative speech acts to signal enthusiastic agreement and social alignment rather than asserting an epistemological claim.",
  "quote_evidences": [
    "Bro, facts! That is so true",
    "literally 100% facts right there"
  ]
}
"""


class AlethiologyService:
    def __init__(self, model_name: str | None = None, settings: Any = None):
        self.settings = settings or globals().get("settings")
        provider_info, max_concurrent, self._llm_semaphore = init_tier_concurrency(
            self.settings, service_name="AlethiologyService", configure_fn=configure_provider_env
        )
        self.gcp_project = provider_info["project"]
        self.gcp_location = provider_info["location"]
        self.gemini_tier = provider_info["tier"]
        self.max_concurrency = max_concurrent

        backup_model = getattr(self.settings, "BACKUP_LLM_MODEL", "gemini-3.1-flash-lite")
        primary_model = model_name or getattr(self.settings, "LLM_MODEL", "gemini-3.8-flash")

        self.backup_client = True if backup_model else None

        self.alethiology_agent_primary = Agent(
            name="alethiology_agent_primary",
            model=primary_model,
            instruction=ALETHIOLOGY_SYSTEM_PROMPT,
            output_schema=AlethiologyAnalysis,
            output_key="alethiology_result",
            generate_content_config=build_agent_generation_config(
                model=primary_model,
                task_type="alethiology",
                settings=self.settings,
            ),
        )

        self.alethiology_agent_backup = Agent(
            name="alethiology_agent_backup",
            model=backup_model,
            instruction=ALETHIOLOGY_SYSTEM_PROMPT,
            output_schema=AlethiologyAnalysis,
            output_key="alethiology_result",
            generate_content_config=build_agent_generation_config(
                model=backup_model,
                task_type="alethiology",
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

    async def _run_agent_direct(
        self,
        agent: Agent,
        user_prompt: str,
        output_key: str = "alethiology_result",
        is_backup: bool = False
    ) -> Any:
        async with self._llm_semaphore:
            return await execute_adk_agent(
                agent=agent,
                user_prompt=user_prompt,
                output_key=output_key,
                output_schema=AlethiologyAnalysis,
                is_backup=is_backup,
            )

    async def _run_agent_with_fallback(
        self,
        agent_primary: Agent,
        agent_backup: Agent,
        user_prompt: str,
        output_key: str = "alethiology_result",
    ) -> Any:
        return await execute_agent_with_circuit_breaker(
            service_state=self,
            run_direct_fn=self._run_agent_direct,
            agent_primary=agent_primary,
            agent_backup=agent_backup,
            user_prompt=user_prompt,
            output_key=output_key,
            service_name="Alethiology",
            error_cls=AlethiologyServiceError,
        )

    async def analyze_alethiology(self, claim: Claim) -> Optional[AlethiologyAnalysis]:
        """
        Analyzes the implicit theory of truth (epistemological framework) of a claim.
        Returns None if sanitization or analysis cannot be completed.
        """
        try:
            sanitized_claim = sanitize_claim_text(claim.text)
            sanitized_context = sanitize_context(claim.context)
        except SanitizationError as e:
            logger.error(
                "Sanitization error in alethiology analysis for claim '%s': %s",
                claim.text[:50],
                e,
            )
            return None

        user_prompt = build_user_data_prompt(
            f"CLAIM TEXT: {sanitized_claim}\nCONTEXT: {sanitized_context if sanitized_context else 'No context provided'}",
            "Please determine the underlying theory of truth the speaker operates on and output valid JSON matching the schema."
        )

        try:
            result: AlethiologyAnalysis = await self._run_agent_with_fallback(
                agent_primary=self.alethiology_agent_primary,
                agent_backup=self.alethiology_agent_backup,
                user_prompt=user_prompt,
                output_key="alethiology_result",
            )

            # Sanitize quote evidences before returning
            clean_quotes = sanitize_quote_evidences(result.quote_evidences)

            return AlethiologyAnalysis(
                primary_theory=result.primary_theory,
                secondary_theory=result.secondary_theory,
                epistemic_summary=result.epistemic_summary,
                quote_evidences=clean_quotes,
            )

        except Exception as e:
            if "Budget exhausted" in str(e) or (e.__cause__ and "Budget exhausted" in str(e.__cause__)):
                raise e
            logger.exception("Error in alethiology analysis for claim '%s'", claim.text[:50])
            return None
