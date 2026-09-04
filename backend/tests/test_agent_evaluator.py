import pytest
from unittest.mock import AsyncMock, MagicMock, patch


def test_evaluate_agents_imports_without_weave():
    """Verify evaluate_agents module can be imported with zero weave dependency."""
    import evaluate_agents
    assert hasattr(evaluate_agents, "PerspectivePrismPipeline")
    assert hasattr(evaluate_agents, "has_claims_scorer")
    assert hasattr(evaluate_agents, "pipeline_success_scorer")
    assert hasattr(evaluate_agents, "latency_scorer")


def test_scorers():
    """Verify evaluation metric scorers compute correct results."""
    from evaluate_agents import has_claims_scorer, pipeline_success_scorer, latency_scorer

    output_success = {
        "success": True,
        "claims_count": 3,
        "total_time": 12.5,
    }
    assert has_claims_scorer(output_success) == {"has_claims": True}
    assert pipeline_success_scorer(output_success) == {"success": True}
    assert latency_scorer(output_success) == {"latency_under_60s": True}

    output_fail = {
        "success": False,
        "claims_count": 0,
        "total_time": 65.0,
    }
    assert has_claims_scorer(output_fail) == {"has_claims": False}
    assert pipeline_success_scorer(output_fail) == {"success": False}
    assert latency_scorer(output_fail) == {"latency_under_60s": False}


@pytest.mark.asyncio
async def test_pipeline_predict_success():
    """Verify PerspectivePrismPipeline.predict succeeds with mocked services."""
    from evaluate_agents import PerspectivePrismPipeline

    pipeline = PerspectivePrismPipeline()

    mock_analysis = MagicMock()
    mock_analysis.stance = "Supported"
    mock_analysis.confidence = 0.88
    mock_analysis.explanation = "Well-supported by scientific consensus."

    with patch("evaluate_agents.ClaimExtractor") as mock_extractor_cls, \
         patch("evaluate_agents.EvidenceRetriever") as mock_retriever_cls, \
         patch("evaluate_agents.AnalysisService") as mock_analysis_cls:

        mock_extractor = MagicMock()
        mock_extractor.extract_video_id.return_value = "fake_id"
        mock_extractor.get_transcript.return_value = "fake transcript"
        mock_extractor.extract_claims = AsyncMock(return_value=[{"claim": "Test claim"}])
        mock_extractor_cls.return_value = mock_extractor

        mock_retriever = MagicMock()
        mock_retriever.retrieve_evidence = AsyncMock(return_value={})
        mock_retriever_cls.return_value = mock_retriever

        mock_analysis_svc = MagicMock()
        mock_analysis_svc.analyze_perspective = AsyncMock(return_value=mock_analysis)
        mock_analysis_cls.return_value = mock_analysis_svc

        result = await pipeline.predict("https://www.youtube.com/watch?v=dummy123")

        assert result["success"] is True
        assert result["claims_count"] == 1
        assert len(result["analyses"]) == 2
        assert result["error"] is None
