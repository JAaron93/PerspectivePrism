import asyncio
import logging
import unicodedata
from typing import Any, List

from app.core.config import configure_provider_env, settings
from app.models.schemas import Claim, Transcript, TranscriptSegment, ClaimsOutput
from app.utils.input_sanitizer import (
    sanitize_input,
    SanitizationError,
    contains_control_characters,
    contains_suspicious_patterns,
    escape_special_characters,
)
from app.utils.video_utils import extract_video_id
from app.utils.llm_utils import execute_adk_agent, build_agent_generation_config
from app.utils.prompt_helpers import (
    build_user_data_prompt,
    contains_delimiter_forgery,
)
from youtube_transcript_api import YouTubeTranscriptApi
from youtube_transcript_api._errors import (
    TranscriptsDisabled,
    NoTranscriptFound,
)
from google.adk.agents import Agent

try:
    from prism_sanitizer_rs import format_and_sanitize_transcript
    HAS_RUST_TRANSCRIPT_PROCESSOR = True
except ImportError:
    HAS_RUST_TRANSCRIPT_PROCESSOR = False

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

        chosen_model = model_name or getattr(self.settings, "LLM_MODEL", "gemini-3.8-flash")
        self.agent = Agent(
            name="extractor_agent",
            model=chosen_model,
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
            generate_content_config=build_agent_generation_config(
                model=chosen_model,
                task_type="extractor",
                settings=self.settings,
            ),
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
        try:
            if HAS_RUST_TRANSCRIPT_PROCESSOR:
                segments_data = [(float(seg.start), str(seg.text)) for seg in transcript.segments]
                sanitized_transcript = format_and_sanitize_transcript(segments_data, max_length=100000)
            else:
                if not transcript.segments or all(not str(s.text).strip() for s in transcript.segments):
                    raise SanitizationError("Transcript cannot be empty")

                # Validate segments for control characters and suspicious patterns
                for seg in transcript.segments:
                    text = unicodedata.normalize("NFKC", str(seg.text))
                    if contains_control_characters(text):
                        raise SanitizationError("Transcript contains invalid control characters")
                    if contains_suspicious_patterns(text):
                        raise SanitizationError("Transcript contains patterns that may indicate a prompt injection attempt")

                formatted_parts = []
                total_len = 0
                max_len = 100000
                truncation_suffix = "\n...[TRUNCATED]..."
                suffix_len = len(truncation_suffix)

                for seg in transcript.segments:
                    minutes = int(seg.start // 60)
                    seconds = int(seg.start % 60)
                    escaped_text = escape_special_characters(unicodedata.normalize("NFKC", str(seg.text)))
                    line = f"[{minutes:02d}:{seconds:02d}] {escaped_text}\n"

                    if total_len + len(line) > max_len:
                        combined = "".join(formatted_parts) + line
                        if max_len >= suffix_len:
                            cut_point = max_len - suffix_len
                            truncated = combined[:cut_point]
                            # Strip odd trailing backslashes to avoid escaping suffix
                            backslash_count = 0
                            for c in reversed(truncated):
                                if c == "\\":
                                    backslash_count += 1
                                else:
                                    break
                            if backslash_count % 2 == 1:
                                truncated = truncated[:-1]
                            sanitized_transcript = truncated + truncation_suffix
                        else:
                            sanitized_transcript = combined[:max_len]
                        break
                    else:
                        formatted_parts.append(line)
                        total_len += len(line)
                else:
                    sanitized_transcript = "".join(formatted_parts)
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

        if contains_delimiter_forgery(sanitized_transcript):
            logger.warning("Delimiter forgery detected in transcript; isolating via dynamic prompt nonce guard")

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

