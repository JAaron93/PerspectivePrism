import pytest
from unittest.mock import patch, MagicMock, AsyncMock
from app.services.claim_extractor import ClaimExtractor
from app.models.schemas import Transcript, TranscriptSegment

@pytest.mark.asyncio
async def test_claim_extraction_with_mocked_llm():
    # Mock settings to avoid API key validation error during init
    with patch('app.services.claim_extractor.settings') as mock_settings:
        mock_settings.OPENAI_API_KEY = "sk-mock-key"
        mock_settings.OPENAI_MODEL = "gpt-3.5-turbo"
        
        extractor = ClaimExtractor()
        
        # Mock the OpenAI client
        mock_client = MagicMock()
        extractor.client = mock_client
        
        # Mock the chat completion response
        mock_response = MagicMock()
        mock_response.choices = [
            MagicMock(message=MagicMock(content='{"claims": [{"text": "Climate change is real", "start_time": 3.5, "end_time": 7.7, "context": "Here we discuss..."}]}'))
        ]
        mock_client.chat.completions.create = AsyncMock(return_value=mock_response)

        # Mock transcript data
        mock_segments = [
            TranscriptSegment(text="Intro", start=0.0, duration=3.5),
            TranscriptSegment(text="Climate change is real", start=3.5, duration=4.2),
        ]
        mock_transcript = Transcript(
            video_id="test_id",
            segments=mock_segments,
            full_text="Intro Climate change is real"
        )
        
        # Test extraction
        claims = await extractor.extract_claims(mock_transcript)
        
        assert len(claims) == 1
        assert claims[0].text == "Climate change is real"
        assert claims[0].timestamp_start == 3.5
