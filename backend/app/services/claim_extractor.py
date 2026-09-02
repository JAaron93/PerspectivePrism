import asyncio
import logging
from typing import Any, List

from app.core.config import configure_provider_env, settings
from app.models.schemas import Claim, Transcript, TranscriptSegment, ClaimsOutput
from app.utils.input_sanitizer import sanitize_input, SanitizationError
from app.utils.video_utils import extract_video_id
from app.utils.llm_utils import execute_adk_agent
from app.utils.prompt_helpers import build_user_data_prompt
from youtube_transcript_api import YouTubeTranscriptApi
from youtube_transcript_api._errors import (
    TranscriptsDisabled,
    NoTranscriptFound,
)
from google.adk.agents import Agent

logger = logging.getLogger(__name__)


class TranscriptUnavailableError(Exception):
    """Raised when a video explicitly lacks captions (e.g. disabled or none found)."""
    pass


class TranscriptRetrievalError(Exception):
    """Raised when transcript retrieval fails due to transient network, API, or rate-limit errors."""
    pass


class ClaimExtractor:
    def __init__(self, model_name: str | None = None, settings: Any = None):
        self.settings = settings or globals().get("settings")
        provider_info = configure_provider_env(self.settings)

        self.gcp_project = provider_info["project"]
        self.gcp_location = provider_info["location"]
        self.gemini_tier = provider_info["tier"]

        self.agent = Agent(
            name="extractor_agent",
            model=model_name or getattr(self.settings, "LLM_MODEL", "gemini-3.5-flash-lite"),
            instruction=(
                "You are an expert content analyst. Your task is to analyze the video transcript "
                "provided in the USER DATA section and extract the key claims made by the speaker.\n\n"
                "INSTRUCTIONS:\n"
                "1. Identify distinct, verifiable claims or strong arguments.\n"
                "2. Ignore filler, introductions, questions, or purely descriptive text.\n"
                "3. For each claim, provide:\n"
                "   - The exact text of the claim (or a concise summary if the speaker is verbose).\n"
                "   - The start and end timestamps (approximate) based on the transcript markers.\n"
                "   - The context (surrounding text) to help understand the claim.\n"
                "4. Extract up to 50 of the most significant and verifiable claims, prioritizing those with strong factual assertions."
            ),
            output_schema=ClaimsOutput,
            output_key="claims_result",
        )

    def extract_video_id(self, url: str) -> str:
        """
        Delegates to the shared extract_video_id utility.
        """
        return extract_video_id(url)

    async def get_transcript(self, video_id: str) -> Transcript:
        """
        Fetches the transcript for a given video ID asynchronously without blocking the event loop.
        """
        try:
            api = YouTubeTranscriptApi()
            # Fetch transcript offloaded to worker thread
            fetched_transcript = await asyncio.to_thread(api.fetch, video_id)

            # Convert to our schema
            segments = []
            for item in fetched_transcript:
                try:
                    # FetchedTranscriptSnippet objects have .text, .start, .duration attributes
                    segments.append(
                        TranscriptSegment(
                            text=item.text if hasattr(item, 'text') else "",
                            start=item.start if hasattr(item, 'start') else 0.0,
                            duration=item.duration if hasattr(item, 'duration') else 0.0,
                        )
                    )
                except (KeyError, TypeError) as e:
                    logger.warning(f"Skipping malformed transcript segment: {e}")
                    continue

            full_text = " ".join([s.text for s in segments])
            return Transcript(video_id=video_id, segments=segments, full_text=full_text)
        except (TranscriptsDisabled, NoTranscriptFound) as e:
            logger.info(f"No transcripts available for video {video_id}: {e}")
            raise TranscriptUnavailableError(f"Transcripts unavailable: {str(e)}") from e
        except Exception as e:
            logger.error(f"Failed to fetch transcript for {video_id}: {e}")
            raise TranscriptRetrievalError(f"Failed to fetch transcript: {str(e)}") from e

    async def extract_claims(self, transcript: Transcript) -> List[Claim]:
        """
        Extracts claims from the transcript using an LLM.
        Scans the transcript to identify meaningful claims.
        """
        formatted_transcript = ""
        for seg in transcript.segments:
            minutes = int(seg.start // 60)
            seconds = int(seg.start % 60)
            timestamp = f"[{minutes:02d}:{seconds:02d}]"
            formatted_transcript += f"{timestamp} {seg.text}\n"

        # Increase limit for Gemini context caching (larger context windows)
        if len(formatted_transcript) > 100000:
            formatted_transcript = formatted_transcript[:100000] + "\n...[TRUNCATED]..."

        try:
            sanitized_transcript = sanitize_input(
                formatted_transcript,
                max_length=100000,
                field_name="Transcript",
                allow_suspicious_patterns=False,
                allow_control_chars=False
            )
        except SanitizationError as e:
            logger.error(f"Sanitization error in claim extraction: {e!s}")
            return [
                Claim(
                    id="error_claim",
                    text="Error: Transcript failed sanitization check",
                    timestamp_start=0.0,
                    timestamp_end=0.0,
                    context="Transcript failed sanitization validation checks.",
                    metadata={
                        "status": "error",
                        "code": "sanitization_failed",
                        "message": "Transcript failed sanitization validation checks.",
                    }
                )
            ]

        user_prompt = build_user_data_prompt(
            sanitized_transcript,
            "Please extract key claims from this transcript according to your instructions."
        )

        try:
            result = await execute_adk_agent(
                agent=self.agent,
                user_prompt=user_prompt,
                output_key="claims_result",
                output_schema=ClaimsOutput,
            )

            if result is None:
                raise Exception("Agent execution failed to populate claims_result after both attempts.")

            if not result.claims:
                return []

            claims = []
            for i, item in enumerate(result.claims):
                claims.append(
                    Claim(
                        id=f"claim_{i}",
                        text=item.text.strip(),
                        timestamp_start=item.start_time,
                        timestamp_end=item.end_time,
                        context=item.context,
                    )
                )

            logger.info(f"Successfully extracted {len(claims)} claims.")
            return claims

        except Exception as e:
            if "Budget exhausted" in str(e):
                raise e
            logger.error(f"Error extracting claims with LLM: {e}")
            return [
                Claim(
                    id="error_claim",
                    text="Error: Unable to extract claims from video transcript",
                    timestamp_start=0.0,
                    timestamp_end=0.0,
                    context="An error occurred during claim extraction. Please try again.",
                    metadata={
                        "status": "error",
                        "code": "llm_extraction_failed",
                        "message": "Unable to extract claims from transcript",
                        "details": f"{type(e).__name__}: {str(e)}",
                    },
                )
            ]

