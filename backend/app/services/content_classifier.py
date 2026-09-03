import re
import time
import asyncio
import logging
import unicodedata
from typing import Optional, Any, List

from app.core.config import configure_provider_env, settings
from app.models.schemas import (
    ContentEligibilityResult,
    VideoMetadata,
)
from app.utils.input_sanitizer import (
    SanitizationError,
    sanitize_input,
    sanitize_video_metadata,
)
from app.utils.llm_utils import (
    execute_adk_agent,
    init_tier_concurrency,
    execute_agent_with_circuit_breaker,
)
from app.utils.prompt_helpers import (
    build_user_data_prompt,
    format_classifier_user_data,
)
from google.adk.agents import Agent
from google.genai import errors

logger = logging.getLogger(__name__)


class PreClassifierServiceError(Exception):
    """Exception raised for errors in the PreClassifierService."""
    pass


POLITICAL_KEYWORDS = [
    "election", "electoral", "politics", "political", "policy", "policies",
    "senator", "senate", "congress", "congressional", "president", "presidential",
    "candidate", "vote", "voting", "voter", "ballot", "democrat", "democratic",
    "republican", "gop", "court", "supreme court", "scotus", "judge", "justice",
    "ruling", "law", "lawsuit", "legislation", "legislative", "bill", "statute",
    "amendment", "constitution", "constitutional", "war", "conflict", "military",
    "sanction", "sanctions", "treaty", "economy", "economic", "inflation",
    "recession", "gdp", "tax", "taxes", "taxation", "tariff", "tariffs",
    "strike", "union", "protest", "protests", "protester", "riot", "scandal",
    "corruption", "geopolitics", "geopolitical", "foreign policy", "propaganda",
    "ideology", "activism", "activist", "lobbying", "lobbyist"
]

# Compile keyword regex for fast boundary-aware pattern matching
_KEYWORD_PATTERN = re.compile(
    r'\b(' + '|'.join(re.escape(kw) for kw in POLITICAL_KEYWORDS) + r')\b',
    re.IGNORECASE
)


def evaluate_deterministic_fast_path(
    category_name: Optional[str],
    transcript_preview: Optional[str],
    metadata: Optional[VideoMetadata]
) -> Optional[ContentEligibilityResult]:
    """
    Deterministic zero-token fast path filter for non-analytical content.
    Returns ContentEligibilityResult only when:
      1. Spoken captions are absent/empty.
      2. YouTube category is Music or Gaming.
      3. Metadata contains NO political or socio-economic keywords.
    Otherwise returns None to route to LLM evaluation.
    """
    # 1. Transcript must be absent or empty
    if transcript_preview and transcript_preview.strip():
        return None

    # 2. Category must be strictly Music or Gaming (normalized via NFKC)
    cat_norm = unicodedata.normalize("NFKC", (category_name or "")).strip().lower()
    if cat_norm not in {"music", "gaming"}:
        return None

    # 3. Check metadata for political / socio-economic keywords using NFKC normalization
    if metadata:
        if metadata.title and _KEYWORD_PATTERN.search(unicodedata.normalize("NFKC", metadata.title)):
            return None
        if metadata.channel_name and _KEYWORD_PATTERN.search(unicodedata.normalize("NFKC", metadata.channel_name)):
            return None
        if metadata.tags:
            for tag in metadata.tags:
                if tag and _KEYWORD_PATTERN.search(unicodedata.normalize("NFKC", tag)):
                    return None
        if metadata.description_snippet and _KEYWORD_PATTERN.search(unicodedata.normalize("NFKC", metadata.description_snippet)):
            return None

    category_label = "Music / Non-Speech Media" if cat_norm == "music" else "Gaming / Non-Speech Media"

    return ContentEligibilityResult(
        is_analysable=False,
        confidence_score=1.0,
        detected_category=category_label,
        disclaimer_title="No Spoken Commentary Found",
        disclaimer_message=(
            "This video contains no speech captions and belongs to an entertainment/music category "
            "with no socio-political discourse in its metadata. Perspective Prism requires spoken "
            "claims to analyze."
        ),
        key_topics_found=[],
    )


PRE_CLASSIFIER_SYSTEM_PROMPT = """You are the Pre-Classification Guardrail Gate Agent for PerspectivePrism.

YOUR PURPOSE:
Analyze whether a YouTube video contains verifiable political, socio-economic, policy, legislative, historical, or factual discourse suitable for multi-perspective truth and bias analysis.

CRITICAL INSTRUCTIONS & SCHEMA:
- You must output valid JSON strictly conforming to the ContentEligibilityResult schema.
- `is_analysable`: Boolean indicating if the video contains analytical, political, or factual claims suitable for analysis.
- `confidence_score`: Float between 0.0 and 1.0 expressing confidence in this determination.
- `detected_category`: Concise 2-4 word descriptor of content type (e.g., 'Political Commentary', 'Music / Non-Speech Media', 'Political Satire & Comedy', 'Gameplay Walkthrough', 'Documentary Essay').
- `disclaimer_title`: Short user-facing title if `is_analysable` is False (e.g., 'Analysis Skipped', 'No Spoken Captions Available'), or empty string if True.
- `disclaimer_message`: Respectful 1-2 sentence explanation of why analysis was paused if `is_analysable` is False, or empty string if True.
- `key_topics_found`: Array of 0 to 5 key topics identified in the metadata or transcript.

EDGE-CASE FEW-SHOT CALIBRATIONS:

[EXAMPLE 1: Political Satire & Comedy -> is_analysable: true]
INPUT:
TITLE: The Daily Show: Politicians React to New Tax Bill
CHANNEL: The Daily Show
CATEGORY: Entertainment
TRANSCRIPT PREVIEW: Congress just passed a 500-page tax bill that nobody read...
OUTPUT:
{
  "is_analysable": true,
  "confidence_score": 0.95,
  "detected_category": "Political Satire & Comedy",
  "disclaimer_title": "",
  "disclaimer_message": "",
  "key_topics_found": ["tax legislation", "congress", "satire"]
}

[EXAMPLE 2: Political AMV / Meme Edit with Spoken Speech -> is_analysable: true]
INPUT:
TITLE: [AMV] Election 2024 Debate Remix
CHANNEL: AnimeEdits
CATEGORY: Film & Animation
TRANSCRIPT PREVIEW: The senator argued that trade tariffs would curb inflation, but the opposition stated it raises consumer costs...
OUTPUT:
{
  "is_analysable": true,
  "confidence_score": 0.92,
  "detected_category": "Political Debate Remix",
  "disclaimer_title": "",
  "disclaimer_message": "",
  "key_topics_found": ["tariffs", "inflation", "senate debate"]
}

[EXAMPLE 3: News-Adjacent Gaming Commentary -> is_analysable: true]
INPUT:
TITLE: Chill Geoguessr Stream! (Talking about recent Supreme Court ruling)
CHANNEL: GamerStreamer
CATEGORY: Gaming
TRANSCRIPT PREVIEW: While we guess this location in Brazil, let's talk about yesterday's major Supreme Court decision on executive power...
OUTPUT:
{
  "is_analysable": true,
  "confidence_score": 0.93,
  "detected_category": "Political Gaming Commentary",
  "disclaimer_title": "",
  "disclaimer_message": "",
  "key_topics_found": ["supreme court", "executive power", "commentary"]
}

[EXAMPLE 4: Captionless Video with Political Metadata -> is_analysable: false (Context-Aware)]
INPUT:
TITLE: Chill Geoguessr Stream! (Talking about recent Supreme Court ruling)
CHANNEL: GamerStreamer
CATEGORY: Gaming
TRANSCRIPT PREVIEW: NO TRANSCRIPT AVAILABLE
OUTPUT:
{
  "is_analysable": false,
  "confidence_score": 0.88,
  "detected_category": "Political Commentary (No Captions)",
  "disclaimer_title": "No Spoken Captions Available",
  "disclaimer_message": "This video discusses political topics but lacks speech captions required for automated claim analysis. You may use Force Override if captions become available.",
  "key_topics_found": ["supreme court", "commentary"]
}

[EXAMPLE 5: Mechanical Gaming Speedrun -> is_analysable: false]
INPUT:
TITLE: Super Mario 64 16-Star Speedrun in 14:52
CHANNEL: SpeedyRunner
CATEGORY: Gaming
TRANSCRIPT PREVIEW: Here we do the backwards long jump through the door to save 3 frames...
OUTPUT:
{
  "is_analysable": false,
  "confidence_score": 0.98,
  "detected_category": "Video Game Speedrun",
  "disclaimer_title": "Analysis Skipped",
  "disclaimer_message": "This video features video game speedrun mechanics and does not contain political discourse or verifiable public policy claims.",
  "key_topics_found": ["speedrun", "gaming"]
}

[EXAMPLE 6: Culinary / Tutorial -> is_analysable: false]
INPUT:
TITLE: Authentic Italian Carbonara Recipe
CHANNEL: ChefMario
CATEGORY: Howto & Style
TRANSCRIPT PREVIEW: Whisk two eggs with pecorino and black pepper, then cook the guanciale until crispy...
OUTPUT:
{
  "is_analysable": false,
  "confidence_score": 0.97,
  "detected_category": "Cooking & Culinary",
  "disclaimer_title": "Analysis Skipped",
  "disclaimer_message": "This video is a culinary tutorial and does not contain socio-political claims or policy debates.",
  "key_topics_found": ["cooking", "recipe"]
}
"""


class PreClassifierService:
    def __init__(self, model_name: str | None = None, settings: Any = None):
        self.settings = settings or globals().get("settings")
        provider_info, max_concurrent, self._llm_semaphore = init_tier_concurrency(
            self.settings, service_name="PreClassifierService", configure_fn=configure_provider_env
        )
        self.gcp_project = provider_info["project"]
        self.gcp_location = provider_info["location"]
        self.gemini_tier = provider_info["tier"]
        self.max_concurrency = max_concurrent

        backup_model = getattr(self.settings, "BACKUP_LLM_MODEL", "gemini-3.1-flash-lite")
        primary_model = model_name or getattr(self.settings, "LLM_MODEL", "gemini-3.5-flash-lite")

        self.backup_client = True if backup_model else None

        self.pre_classifier_agent_primary = Agent(
            name="pre_classifier_agent_primary",
            model=primary_model,
            instruction=PRE_CLASSIFIER_SYSTEM_PROMPT,
            output_schema=ContentEligibilityResult,
            output_key="pre_classifier_result",
        )

        self.pre_classifier_agent_backup = Agent(
            name="pre_classifier_agent_backup",
            model=backup_model,
            instruction=PRE_CLASSIFIER_SYSTEM_PROMPT,
            output_schema=ContentEligibilityResult,
            output_key="pre_classifier_result",
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
        output_key: str = "pre_classifier_result",
        is_backup: bool = False
    ) -> Any:
        async with self._llm_semaphore:
            return await execute_adk_agent(
                agent=agent,
                user_prompt=user_prompt,
                output_key=output_key,
                output_schema=ContentEligibilityResult,
                is_backup=is_backup,
            )

    async def _run_agent_with_fallback(
        self,
        agent_primary: Agent,
        agent_backup: Agent,
        user_prompt: str,
        output_key: str = "pre_classifier_result",
    ) -> Any:
        return await execute_agent_with_circuit_breaker(
            service_state=self,
            run_direct_fn=self._run_agent_direct,
            agent_primary=agent_primary,
            agent_backup=agent_backup,
            user_prompt=user_prompt,
            output_key=output_key,
            service_name="Pre-classifier",
            error_cls=PreClassifierServiceError,
        )

    async def classify_video(
        self,
        transcript_preview: Optional[str],
        metadata: Optional[VideoMetadata]
    ) -> ContentEligibilityResult:
        """
        Evaluates video metadata and transcript preview to determine analysis eligibility.
        Applies deterministic fast-path, ADK 2.0 LLM agent with circuit breaker, and
        conservative thresholding.
        """
        # 1. Deterministic Fast-Path Filter
        category_name = metadata.category_name if metadata else None
        fast_path = evaluate_deterministic_fast_path(
            category_name=category_name,
            transcript_preview=transcript_preview,
            metadata=metadata
        )
        if fast_path is not None:
            return fast_path

        # 2. Input Sanitization
        try:
            metadata_clean = sanitize_video_metadata(metadata)
            clean_preview = ""
            if transcript_preview and transcript_preview.strip():
                clean_preview = sanitize_input(
                    transcript_preview[:2000],
                    max_length=2000,
                    field_name="Transcript Preview",
                    allow_suspicious_patterns=False,
                    allow_control_chars=False
                )
        except SanitizationError as e:
            logger.warning("Sanitization rejected classifier input (%s); defaulting to eligible.", e)
            return ContentEligibilityResult(
                is_analysable=True,
                confidence_score=0.5,
                detected_category="Unverified Content",
                disclaimer_title="",
                disclaimer_message="",
                key_topics_found=[]
            )

        # 3. Build Prompt with Static Instructions & Nonce Delimiters
        user_prompt = build_user_data_prompt(
            format_classifier_user_data(metadata_clean, clean_preview),
            "Please determine if this video is eligible for claim and bias analysis according to the instructions and schema."
        )

        # 4. Run Agent with Fallback & Circuit Breaker
        try:
            result: ContentEligibilityResult = await self._run_agent_with_fallback(
                agent_primary=self.pre_classifier_agent_primary,
                agent_backup=self.pre_classifier_agent_backup,
                user_prompt=user_prompt,
                output_key="pre_classifier_result",
            )

            # 5. Conservative Ambiguity Threshold (FR4)
            # If is_analysable is False but confidence < 0.70, treat as ambiguous and default to True
            is_analysable = result.is_analysable
            if not is_analysable and result.confidence_score < 0.70:
                logger.info(
                    "Conservative threshold triggered: confidence %.2f < 0.70. Defaulting is_analysable to True.",
                    result.confidence_score
                )
                is_analysable = True

            return ContentEligibilityResult(
                is_analysable=is_analysable,
                confidence_score=result.confidence_score,
                detected_category=result.detected_category,
                disclaimer_title=result.disclaimer_title if not is_analysable else "",
                disclaimer_message=result.disclaimer_message if not is_analysable else "",
                key_topics_found=result.key_topics_found or []
            )

        except Exception as e:
            if "Budget exhausted" in str(e) or (e.__cause__ and "Budget exhausted" in str(e.__cause__)):
                raise e
            logger.exception("Error in pre-classifier evaluation; applying safe eligible fallback: %s", e)
            return ContentEligibilityResult(
                is_analysable=True,
                confidence_score=0.5,
                detected_category="Uncertain (Classifier Fallback)",
                disclaimer_title="",
                disclaimer_message="",
                key_topics_found=[]
            )
