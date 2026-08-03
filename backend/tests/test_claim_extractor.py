import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from app.models.schemas import Transcript, TranscriptSegment, ClaimsOutput, ExtractedClaim
from app.services.claim_extractor import ClaimExtractor


@pytest.mark.asyncio
async def test_claim_extraction_with_mocked_llm():
    # Mock settings to avoid validation error during init
    with patch("app.services.claim_extractor.settings") as mock_settings:
        mock_settings.effective_gcp_project = "my-gcp-project"
        mock_settings.GCP_LOCATION = "global"
        mock_settings.GEMINI_TIER = "paid"
        mock_settings.LLM_MODEL = "gemini-3.5-flash-lite"

        extractor = ClaimExtractor(settings=mock_settings)

        # Mock the ADK Runner and InMemorySessionService in llm_utils (where they are now used)
        with patch("app.utils.llm_utils.Runner") as mock_runner_class, \
             patch("app.utils.llm_utils.InMemorySessionService") as mock_session_service_class:

            mock_session_service = MagicMock()
            mock_session_service_class.return_value = mock_session_service
            mock_session_service.create_session = AsyncMock()

            mock_session = MagicMock()
            mock_session.state = {
                "claims_result": ClaimsOutput(
                    claims=[
                        ExtractedClaim(
                            text="The Earth is an oblate spheroid.",
                            start_time=10.5,
                            end_time=15.0,
                            context="Discussion about planetary geometry.",
                        )
                    ]
                )
            }
            mock_session_service.get_session = AsyncMock(return_value=mock_session)

            mock_runner = MagicMock()
            mock_runner_class.return_value = mock_runner

            async def mock_run_async(*args, **kwargs):
                event = MagicMock()
                event.error_code = None
                yield event

            mock_runner.run_async = mock_run_async

            # Mock transcript data
            mock_segments = [
                TranscriptSegment(text="Welcome to the science lecture.", start=0.0, duration=3.5),
                TranscriptSegment(text="The Earth is an oblate spheroid.", start=10.5, duration=4.5),
            ]
            mock_transcript = Transcript(video_id="test_id", segments=mock_segments, full_text="Welcome...")

            # Test extraction
            claims = await extractor.extract_claims(mock_transcript)

            assert len(claims) == 1
            assert claims[0].text == "The Earth is an oblate spheroid."
            assert claims[0].timestamp_start == 10.5
            assert claims[0].timestamp_end == 15.0


@pytest.mark.asyncio
async def test_claim_extraction_llm_error_handling():
    # Mock settings
    with patch("app.services.claim_extractor.settings") as mock_settings:
        mock_settings.effective_gcp_project = "my-gcp-project"
        mock_settings.GCP_LOCATION = "global"
        mock_settings.GEMINI_TIER = "paid"
        mock_settings.LLM_MODEL = "gemini-3.5-flash-lite"

        extractor = ClaimExtractor(settings=mock_settings)

        # Mock the ADK Runner to raise an exception
        with patch("app.utils.llm_utils.Runner") as mock_runner_class, \
             patch("app.utils.llm_utils.InMemorySessionService") as mock_session_service_class:

            mock_session_service = MagicMock()
            mock_session_service_class.return_value = mock_session_service
            mock_session_service.create_session = AsyncMock()

            mock_runner = MagicMock()
            mock_runner_class.return_value = mock_runner

            async def mock_run_async_error(*args, **kwargs):
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
    # Mock settings to avoid validation error during init
    with patch("app.services.claim_extractor.settings") as mock_settings:
        mock_settings.effective_gcp_project = "my-gcp-project"
        mock_settings.GCP_LOCATION = "global"
        mock_settings.GEMINI_TIER = "paid"
        mock_settings.LLM_MODEL = "gemini-3.5-flash-lite"

        extractor = ClaimExtractor(settings=mock_settings)

        # Mock a response with 5 claims
        claims_list = []
        for i in range(5):
            claims_list.append(
                ExtractedClaim(
                    text=f"Claim {i}",
                    start_time=float(i * 10),
                    end_time=float(i * 10 + 5),
                    context=f"Context {i}"
                )
            )

        with patch("app.utils.llm_utils.Runner") as mock_runner_class, \
             patch("app.utils.llm_utils.InMemorySessionService") as mock_session_service_class:

            mock_session_service = MagicMock()
            mock_session_service_class.return_value = mock_session_service
            mock_session_service.create_session = AsyncMock()

            mock_session = MagicMock()
            mock_session.state = {"claims_result": ClaimsOutput(claims=claims_list)}
            mock_session_service.get_session = AsyncMock(return_value=mock_session)

            mock_runner = MagicMock()
            mock_runner_class.return_value = mock_runner

            async def mock_run_async(*args, **kwargs):
                event = MagicMock()
                event.error_code = None
                yield event

            mock_runner.run_async = mock_run_async

            mock_transcript = Transcript(
                video_id="multi_test",
                segments=[TranscriptSegment(text="Long text", start=0.0, duration=50.0)],
                full_text="Long text"
            )

            claims = await extractor.extract_claims(mock_transcript)

            assert len(claims) == 5
            for i, claim in enumerate(claims):
                assert claim.id == f"claim_{i}"
                assert claim.text == f"Claim {i}"


@pytest.mark.asyncio
async def test_get_transcript_execution():
    """Verify get_transcript executes asynchronously with mock YouTubeTranscriptApi."""
    with patch("app.services.claim_extractor.settings") as mock_settings:
        mock_settings.effective_gcp_project = "my-gcp-project"
        mock_settings.GCP_LOCATION = "global"
        mock_settings.GEMINI_TIER = "paid"
        mock_settings.LLM_MODEL = "gemini-3.5-flash-lite"

        extractor = ClaimExtractor(settings=mock_settings)

        mock_snippet = MagicMock()
        mock_snippet.text = "Hello world"
        mock_snippet.start = 0.0
        mock_snippet.duration = 5.0

        with patch("app.services.claim_extractor.YouTubeTranscriptApi") as mock_api_cls:
            mock_api = MagicMock()
            mock_api.fetch.return_value = [mock_snippet]
            mock_api_cls.return_value = mock_api

            transcript = await extractor.get_transcript("test_vid_123")

            assert transcript.video_id == "test_vid_123"
            assert len(transcript.segments) == 1
            assert transcript.segments[0].text == "Hello world"
            assert transcript.full_text == "Hello world"

