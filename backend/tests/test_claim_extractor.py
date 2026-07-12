import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from app.models.schemas import Transcript, TranscriptSegment, ClaimsOutput, ExtractedClaim
from app.services.claim_extractor import ClaimExtractor


@pytest.mark.asyncio
async def test_claim_extraction_with_mocked_llm():
    # Mock settings to avoid API key validation error during init
    with patch("app.services.claim_extractor.settings") as mock_settings:
        mock_settings.GEMINI_API_KEY = "sk-mock-key"
        mock_settings.LLM_API_KEY = ""
        mock_settings.LLM_MODEL = "gemini-3.5-flash"

        extractor = ClaimExtractor()

        # Mock the ADK Runner and InMemorySessionService
        with patch("app.services.claim_extractor.Runner") as mock_runner_class, \
             patch("app.services.claim_extractor.InMemorySessionService") as mock_session_service_class:

            mock_session_service = MagicMock()
            mock_session_service_class.return_value = mock_session_service
            mock_session_service.create_session = AsyncMock()

            mock_session = MagicMock()
            mock_session.state = {
                "claims_result": ClaimsOutput(
                    claims=[
                        ExtractedClaim(
                            text="Climate change is real",
                            start_time=3.5,
                            end_time=7.7,
                            context="Here we discuss...",
                        )
                    ]
                )
            }
            mock_session_service.get_session = AsyncMock(return_value=mock_session)

            mock_runner = MagicMock()
            mock_runner_class.return_value = mock_runner

            async def mock_run_async(*args, **kwargs):
                yield MagicMock(error_code=None)

            mock_runner.run_async = mock_run_async

            # Mock transcript data
            mock_segments = [
                TranscriptSegment(text="Intro", start=0.0, duration=3.5),
                TranscriptSegment(text="Climate change is real", start=3.5, duration=4.2),
            ]
            mock_transcript = Transcript(
                video_id="test_id",
                segments=mock_segments,
                full_text="Intro Climate change is real",
            )

            # Test extraction
            claims = await extractor.extract_claims(mock_transcript)

            assert len(claims) == 1
            assert claims[0].text == "Climate change is real"
            assert claims[0].timestamp_start == 3.5
            assert claims[0].timestamp_end == 7.7


@pytest.mark.asyncio
async def test_claim_extraction_error_handling():
    # Mock settings
    with patch("app.services.claim_extractor.settings") as mock_settings:
        mock_settings.GEMINI_API_KEY = "sk-mock-key"
        mock_settings.LLM_API_KEY = ""
        mock_settings.LLM_MODEL = "gemini-3.5-flash"

        extractor = ClaimExtractor()

        # Mock the ADK Runner to raise an exception
        with patch("app.services.claim_extractor.Runner") as mock_runner_class, \
             patch("app.services.claim_extractor.InMemorySessionService") as mock_session_service_class:

            mock_session_service = MagicMock()
            mock_session_service_class.return_value = mock_session_service
            mock_session_service.create_session = AsyncMock()

            mock_runner = MagicMock()
            mock_runner_class.return_value = mock_runner

            async def mock_run_async_error(*args, **kwargs):
                # Yielding an event with error_code
                event = MagicMock()
                event.error_code = "API_ERROR"
                event.error_message = "API Error"
                yield event

            mock_runner.run_async = mock_run_async_error

            # Mock transcript data
            mock_segments = [
                TranscriptSegment(text="Intro", start=0.0, duration=3.5),
            ]
            mock_transcript = Transcript(video_id="test_id", segments=mock_segments, full_text="Intro")

            # Test extraction
            claims = await extractor.extract_claims(mock_transcript)

            assert len(claims) == 1
            assert claims[0].id == "error_claim"
            assert claims[0].metadata["status"] == "error"
            assert claims[0].metadata["code"] == "llm_extraction_failed"
            assert "API Error" in claims[0].metadata["details"]


@pytest.mark.asyncio
async def test_claim_extraction_multiple_claims():
    # Mock settings to avoid API key validation error during init
    with patch("app.services.claim_extractor.settings") as mock_settings:
        mock_settings.GEMINI_API_KEY = "sk-mock-key"
        mock_settings.LLM_API_KEY = ""
        mock_settings.LLM_MODEL = "gemini-3.5-flash"

        extractor = ClaimExtractor()

        # Mock a response with 5 claims
        claims_list = []
        for i in range(5):
            claims_list.append(
                ExtractedClaim(
                    text=f"Claim {i}",
                    start_time=float(i * 10),
                    end_time=float(i * 10 + 5),
                    context=f"Context for claim {i}",
                )
            )

        with patch("app.services.claim_extractor.Runner") as mock_runner_class, \
             patch("app.services.claim_extractor.InMemorySessionService") as mock_session_service_class:

            mock_session_service = MagicMock()
            mock_session_service_class.return_value = mock_session_service
            mock_session_service.create_session = AsyncMock()

            mock_session = MagicMock()
            mock_session.state = {"claims_result": ClaimsOutput(claims=claims_list)}
            mock_session_service.get_session = AsyncMock(return_value=mock_session)

            mock_runner = MagicMock()
            mock_runner_class.return_value = mock_runner

            async def mock_run_async(*args, **kwargs):
                yield MagicMock(error_code=None)

            mock_runner.run_async = mock_run_async

            # Mock transcript data
            mock_segments = [
                TranscriptSegment(text="Test transcript", start=0.0, duration=3.5),
            ]
            mock_transcript = Transcript(
                video_id="test_id",
                segments=mock_segments,
                full_text="Test transcript",
            )

            # Test extraction
            claims = await extractor.extract_claims(mock_transcript)

            assert len(claims) == 5
            for i in range(5):
                assert claims[i].text == f"Claim {i}"
                assert claims[i].timestamp_start == float(i * 10)
                assert claims[i].timestamp_end == float(i * 10 + 5)

