import json
import logging
from typing import List
from urllib.parse import parse_qs, urlparse

from app.core.config import settings
from app.models.schemas import Claim, Transcript, TranscriptSegment
from app.utils.input_sanitizer import wrap_user_data
from openai import AsyncOpenAI
from youtube_transcript_api import YouTubeTranscriptApi



logger = logging.getLogger(__name__)


class ClaimExtractor:
    def __init__(self):
        self.provider = settings.LLM_PROVIDER.lower()

        if self.provider == "openai":
            if not settings.LLM_API_KEY or settings.LLM_API_KEY.strip() == "":
                raise ValueError(
                    "LLM_API_KEY is not configured. Please set it in your .env file."
                )
            self.client = AsyncOpenAI(api_key=settings.LLM_API_KEY)
            self.model = settings.LLM_MODEL

        else:
            raise ValueError(f"Unsupported LLM_PROVIDER: {self.provider}")

    async def _call_llm(self, prompt: str, system_prompt: str = None) -> str:
        """Provider-agnostic LLM call that returns JSON string."""
        if self.provider == "openai":
            messages = []
            if system_prompt:
                messages.append({"role": "system", "content": system_prompt})
            messages.append({"role": "user", "content": prompt})

            response = await self.client.chat.completions.create(
                model=self.model,
                messages=messages,
                response_format={"type": "json_object"},
                timeout=60.0,
            )
            return response.choices[0].message.content



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
        # 1. Prepare transcript text with timestamps for the LLM
        # We'll chunk it if it's too long, but for MVP we'll try to process a significant portion.
        # We'll format it as: [00:00] Text...

        formatted_transcript = ""
        for seg in transcript.segments:
            # Simple timestamp formatting MM:SS
            minutes = int(seg.start // 60)
            seconds = int(seg.start % 60)
            timestamp = f"[{minutes:02d}:{seconds:02d}]"
            formatted_transcript += f"{timestamp} {seg.text}\n"

        # Increase limit for Hyperbolic acceleration (larger context windows)
        if len(formatted_transcript) > 100000:
            formatted_transcript = formatted_transcript[:100000] + "\n...[TRUNCATED]..."

        # 2. Construct Prompt
        prompt = f"""You are an expert content analyst. Your task is to analyze the following video transcript and extract the key claims made by the speaker.

INSTRUCTIONS:
1. Identify distinct, verifiable claims or strong arguments.
2. Ignore filler, introductions, questions, or purely descriptive text.
3. For each claim, provide:
   - The exact text of the claim (or a concise summary if the speaker is verbose).
   - The start and end timestamps (approximate) based on the transcript markers.
   - The context (surrounding text) to help understand the claim.
4. Extract all distinct and verifiable claims.
5. Output valid JSON.

{wrap_user_data(formatted_transcript, "TRANSCRIPT")}

OUTPUT FORMAT (JSON):
{{
    "claims": [
        {{
            "text": "string",
            "start_time": float (in seconds, convert MM:SS to seconds),
            "end_time": float (in seconds),
            "context": "string"
        }}
    ]
}}"""

        try:
            content = await self._call_llm(
                prompt=prompt,
                system_prompt="You are a helpful assistant that extracts claims from transcripts.",
            )
            if not content:
                return []

            data = json.loads(content)
            claims_data = data.get("claims", [])

            claims = []
            for i, item in enumerate(claims_data):
                # Validate required fields
                try:
                    # Validate text: must be non-empty string
                    text = item.get("text", "")
                    if not isinstance(text, str) or not text.strip():
                        logger.warning(
                            f"Skipping claim at index {i}: missing or empty 'text' field",
                            extra={"claim_index": i, "missing_fields": ["text"]},
                        )
                        continue

                    # Validate start_time: must be numeric or castable to float
                    start_time_raw = item.get("start_time")
                    if start_time_raw is None:
                        logger.warning(
                            f"Skipping claim at index {i}: missing 'start_time' field",
                            extra={"claim_index": i, "missing_fields": ["start_time"]},
                        )
                        continue

                    try:
                        start_time = float(start_time_raw)
                    except (ValueError, TypeError):
                        logger.warning(
                            f"Skipping claim at index {i}: 'start_time' is not numeric",
                            extra={
                                "claim_index": i,
                                "error_type": "invalid_type",
                                "field": "start_time",
                            },
                        )
                        continue

                    # Validate end_time: must be numeric or castable to float
                    end_time_raw = item.get("end_time")
                    if end_time_raw is None:
                        logger.warning(
                            f"Skipping claim at index {i}: missing 'end_time' field",
                            extra={"claim_index": i, "missing_fields": ["end_time"]},
                        )
                        continue

                    try:
                        end_time = float(end_time_raw)
                    except (ValueError, TypeError):
                        logger.warning(
                            f"Skipping claim at index {i}: 'end_time' is not numeric",
                            extra={
                                "claim_index": i,
                                "error_type": "invalid_type",
                                "field": "end_time",
                            },
                        )
                        continue

                    # Optional context: default to empty string
                    context = item.get("context", "")
                    if not isinstance(context, str):
                        context = ""

                    # All validations passed, create Claim
                    claims.append(
                        Claim(
                            id=f"claim_{i}",
                            text=text.strip(),
                            timestamp_start=start_time,
                            timestamp_end=end_time,
                            context=context,
                        )
                    )

                except Exception as e:
                    # Catch any unexpected errors during claim construction
                    logger.warning(
                        f"Unexpected error creating claim at index {i}: {e}",
                        extra={"claim_index": i, "error": str(e)},
                    )
                    continue

            return claims
        except Exception as e:
            logger.error(f"Error extracting claims with LLM: {e}")
            # Return error claim (fallback)
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
