import os
import logging
from typing import List
from urllib.parse import parse_qs, urlparse

from app.core.config import settings
from app.models.schemas import Claim, Transcript, TranscriptSegment, ClaimsOutput
from youtube_transcript_api import YouTubeTranscriptApi
from google.adk.agents import Agent
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.genai import types
from google.genai.errors import APIError, ClientError

logger = logging.getLogger(__name__)


class ExtractorAgent(Agent):
    pass


class ClaimExtractor:
    def __init__(self):
        self.api_key = (settings.GEMINI_API_KEY or settings.LLM_API_KEY or "").strip()
        if self.api_key:
            os.environ["GEMINI_API_KEY"] = self.api_key
        else:
            raise ValueError(
                "LLM_API_KEY is not configured (GEMINI_API_KEY is also not configured). Please set one of them in your .env file. "
                "Example: GEMINI_API_KEY=AIzaSy..."
            )

        self.agent = ExtractorAgent(
            name="extractor_agent",
            model=settings.LLM_MODEL,
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
        Extracts the video ID from a YouTube URL.
        """
        parsed_url = urlparse(url)
        if parsed_url.hostname == "youtu.be":
            video_id = parsed_url.path[1:]
            if not video_id:
                raise ValueError("Invalid YouTube URL")
            return video_id
        if parsed_url.hostname in ("www.youtube.com", "youtube.com"):
            if parsed_url.path == "/watch":
                p = parse_qs(parsed_url.query)
                if "v" not in p or not p["v"] or not p["v"][0]:
                    raise ValueError("Invalid YouTube URL")
                return p["v"][0]
            if parsed_url.path[:7] == "/embed/":
                parts = parsed_url.path.split("/")
                if len(parts) < 3 or not parts[2]:
                    raise ValueError("Invalid YouTube URL")
                return parts[2]
            if parsed_url.path[:3] == "/v/":
                parts = parsed_url.path.split("/")
                if len(parts) < 3 or not parts[2]:
                    raise ValueError("Invalid YouTube URL")
                return parts[2]
        raise ValueError("Invalid YouTube URL")

    def get_transcript(self, video_id: str) -> Transcript:
        """
        Fetches the transcript for a given video ID.
        """
        try:
            api = YouTubeTranscriptApi()
            # Get the transcript
            fetched_transcript = api.fetch(video_id)

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
        except Exception as e:
            logger.error(f"Failed to fetch transcript for {video_id}: {e}")
            raise Exception(f"Failed to fetch transcript: {str(e)}") from e

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

        from app.utils.input_sanitizer import sanitize_input, SanitizationError
        try:
            sanitized_transcript = sanitize_input(
                formatted_transcript,
                max_length=100000,
                field_name="Transcript",
                allow_suspicious_patterns=False,
                allow_control_chars=False
            )
        except SanitizationError as e:
            logger.error(f"Sanitization error in claim extraction: {e}")
            return [
                Claim(
                    id="error_claim",
                    text="Error: Transcript failed sanitization check",
                    timestamp_start=0.0,
                    timestamp_end=0.0,
                    context=f"Sanitization error: {str(e)}",
                    metadata={
                        "status": "error",
                        "code": "sanitization_failed",
                        "message": str(e),
                    }
                )
            ]

        # Reorder prompt so that the untrusted data is at the absolute start
        user_prompt = (
            f"===USER DATA START===\n"
            f"{sanitized_transcript}\n"
            f"===USER DATA END===\n"
            f"Please extract key claims from this transcript according to your instructions."
        )

        session_service = InMemorySessionService()
        attempts = 2
        result = None
        current_prompt = user_prompt

        try:
            for attempt in range(attempts):
                try:
                    attempt_session_id = f"s1_attempt_{attempt}"
                    await session_service.create_session(app_name="app", user_id="user", session_id=attempt_session_id)
                    runner = Runner(agent=self.agent, app_name="app", session_service=session_service)

                    async for event in runner.run_async(
                        user_id="user",
                        session_id=attempt_session_id,
                        new_message=types.Content(role="user", parts=[types.Part.from_text(text=current_prompt)]),
                    ):
                        if event.error_code:
                            raise Exception(f"{event.error_code}: {event.error_message}")

                    session = await session_service.get_session(app_name="app", user_id="user", session_id=attempt_session_id)
                    result = session.state.get("claims_result")
                    if result:
                        break
                except Exception as e:
                    logger.warning(f"Claim extraction attempt {attempt + 1} failed: {e}")
                    if attempt == 0:
                        current_prompt = (
                            f"{user_prompt}\n\n"
                            f"WARNING: The previous attempt failed with the following error: {e}. "
                            f"Please ensure you return a valid JSON object strictly matching the schema requirements."
                        )
                    else:
                        raise e

            if not result:
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

