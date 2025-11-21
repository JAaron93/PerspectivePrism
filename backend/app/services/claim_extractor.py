import re
import json
import logging
from typing import List
from urllib.parse import urlparse, parse_qs
from youtube_transcript_api import YouTubeTranscriptApi
from openai import AsyncOpenAI
from app.core.config import settings
from app.models.schemas import Transcript, TranscriptSegment, Claim
from app.utils.input_sanitizer import wrap_user_data, sanitize_context

logger = logging.getLogger(__name__)

class ClaimExtractor:
    def __init__(self):
        self.client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
        self.model = settings.OPENAI_MODEL

    def extract_video_id(self, url: str) -> str:
        """
        Extracts the video ID from a YouTube URL.
        """
        parsed_url = urlparse(url)
        if parsed_url.hostname == 'youtu.be':
            video_id = parsed_url.path[1:]
            if not video_id:
                raise ValueError("Invalid YouTube URL")
            return video_id
        if parsed_url.hostname in ('www.youtube.com', 'youtube.com'):
            if parsed_url.path == '/watch':
                p = parse_qs(parsed_url.query)
                if 'v' not in p or not p['v'] or not p['v'][0]:
                    raise ValueError("Invalid YouTube URL")
                return p['v'][0]
            if parsed_url.path[:7] == '/embed/':
                parts = parsed_url.path.split('/')
                if len(parts) < 3 or not parts[2]:
                    raise ValueError("Invalid YouTube URL")
                return parts[2]
            if parsed_url.path[:3] == '/v/':
                parts = parsed_url.path.split('/')
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
            segments = [
                TranscriptSegment(
                    text=item['text'],
                    start=item['start'],
                    duration=item['duration']
                ) for item in fetched_transcript
            ]
            
            full_text = " ".join([s.text for s in segments])
            return Transcript(video_id=video_id, segments=segments, full_text=full_text)
        except Exception as e:
            logger.error(f"Failed to fetch transcript for {video_id}: {e}")
            raise Exception(f"Failed to fetch transcript: {str(e)}")

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
        
        # Truncate to ~12000 chars (approx 3000 tokens) to be safe with context window + output
        # A 10 min video is usually around 1500 words / 7-8k chars.
        if len(formatted_transcript) > 12000:
            formatted_transcript = formatted_transcript[:12000] + "\n...[TRUNCATED]..."

        # 2. Construct Prompt
        prompt = f"""You are an expert content analyst. Your task is to analyze the following video transcript and extract the key claims made by the speaker.

INSTRUCTIONS:
1. Identify distinct, verifiable claims or strong arguments.
2. Ignore filler, introductions, questions, or purely descriptive text.
3. For each claim, provide:
   - The exact text of the claim (or a concise summary if the speaker is verbose).
   - The start and end timestamps (approximate) based on the transcript markers.
   - The context (surrounding text) to help understand the claim.
4. Extract between 3 and 7 most important claims.
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
            response = await self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": "You are a helpful assistant that extracts claims from transcripts."},
                    {"role": "user", "content": prompt}
                ],
                response_format={"type": "json_object"},
                temperature=0.3
            )
            
            content = response.choices[0].message.content
            if not content:
                return []
                
            data = json.loads(content)
            claims_data = data.get("claims", [])
            
            claims = []
            for i, item in enumerate(claims_data):
                claims.append(Claim(
                    id=f"claim_{i}",
                    text=item.get("text", ""),
                    timestamp_start=item.get("start_time"),
                    timestamp_end=item.get("end_time"),
                    context=item.get("context", "")
                ))
            
            return claims

        except Exception as e:
            logger.error(f"Error extracting claims with LLM: {e}")
            # Fallback to heuristic if LLM fails? 
            # For now, return empty list or re-raise. 
            # Let's return a basic fallback claim to not break the app.
            return [Claim(
                id="fallback_1",
                text="Error extracting claims. Please try again.",
                timestamp_start=0.0,
                timestamp_end=0.0,
                context="Extraction failed."
            )]
