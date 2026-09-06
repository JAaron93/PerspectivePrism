"""TDD unit tests for Native Quantitative Evaluation Runners (FR6, FR7, NFR2, NFR4)."""

import json
import math
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from app.evals.runners.quantitative_runner import (
    calculate_timestamp_iou,
    calculate_classification_metrics,
    calculate_error_metrics,
    run_pre_classifier_eval,
    run_claim_timestamp_iou_eval,
)
from app.evals.runners.pairwise_runner import (
    run_pairwise_model_benchmark,
    PairwiseBenchmarkResult,
)
from app.evals.judges.rubrics import PairwiseJudgmentRubric


# ==============================================================================
# 1. Timestamp Intersection-over-Union (IoU) Tests (FR6)
# ==============================================================================

class TestTimestampIoU:
    """Unit tests for calculate_timestamp_iou metric algorithm."""

    def test_identical_intervals(self):
        iou = calculate_timestamp_iou(pred_start=10.0, pred_end=25.0, gold_start=10.0, gold_end=25.0)
        assert pytest.approx(iou, rel=1e-5) == 1.0

    def test_disjoint_intervals(self):
        iou = calculate_timestamp_iou(pred_start=0.0, pred_end=5.0, gold_start=10.0, gold_end=15.0)
        assert iou == 0.0

    def test_partial_overlap(self):
        # pred: [0, 10], gold: [5, 15]
        # intersection: [5, 10] -> 5.0
        # union: [0, 15] -> 15.0
        # IoU: 5/15 = 1/3
        iou = calculate_timestamp_iou(pred_start=0.0, pred_end=10.0, gold_start=5.0, gold_end=15.0)
        assert pytest.approx(iou, rel=1e-4) == 1.0 / 3.0

    def test_nested_intervals(self):
        # pred: [2, 8], gold: [0, 10]
        # intersection: 6.0, union: 10.0 -> IoU: 0.6
        iou = calculate_timestamp_iou(pred_start=2.0, pred_end=8.0, gold_start=0.0, gold_end=10.0)
        assert pytest.approx(iou, rel=1e-4) == 0.6

    def test_touching_boundary_intervals(self):
        # pred: [0, 5], gold: [5, 10] -> 0 overlap
        iou = calculate_timestamp_iou(pred_start=0.0, pred_end=5.0, gold_start=5.0, gold_end=10.0)
        assert iou == 0.0

    def test_inverted_timestamps_handled_safely(self):
        # Inverted start and end should not raise exception
        iou = calculate_timestamp_iou(pred_start=10.0, pred_end=5.0, gold_start=0.0, gold_end=5.0)
        assert iou == 0.0

    def test_zero_duration_intervals(self):
        iou = calculate_timestamp_iou(pred_start=5.0, pred_end=5.0, gold_start=5.0, gold_end=5.0)
        assert iou == 0.0


class TestClaimTimestampIoUEval:
    """Unit tests for run_claim_timestamp_iou_eval."""

    def test_empty_claims(self):
        res = run_claim_timestamp_iou_eval([], [])
        assert res["mean_iou"] == 0.0
        assert res["matched_claims"] == 0

    def test_matching_claims(self):
        extracted = [
            {"text": "Claim 1", "start": 0.0, "end": 10.0},
            {"text": "Claim 2", "start": 20.0, "end": 30.0},
        ]
        gold = [
            {"text": "Claim 1", "start": 0.0, "end": 10.0},
            {"text": "Claim 2", "start": 22.0, "end": 30.0},
        ]
        res = run_claim_timestamp_iou_eval(extracted, gold, iou_threshold=0.5)
        assert res["matched_claims"] == 2
        assert res["precision_at_iou"] == 1.0
        assert res["recall_at_iou"] == 1.0
        assert res["mean_iou"] > 0.8


# ==============================================================================
# 2. Classification Metrics Tests (FR6)
# ==============================================================================

class TestClassificationMetrics:
    """Unit tests for precision, recall, F1, and accuracy computations."""

    def test_perfect_binary_classification(self):
        y_true = [True, False, True, True, False]
        y_pred = [True, False, True, True, False]
        metrics = calculate_classification_metrics(y_true, y_pred)

        assert metrics["accuracy"] == 1.0
        assert metrics["precision"] == 1.0
        assert metrics["recall"] == 1.0
        assert metrics["f1_score"] == 1.0
        assert metrics["tp"] == 3
        assert metrics["fp"] == 0
        assert metrics["fn"] == 0
        assert metrics["tn"] == 2

    def test_all_wrong_binary_classification(self):
        y_true = [True, True, True]
        y_pred = [False, False, False]
        metrics = calculate_classification_metrics(y_true, y_pred)

        assert metrics["accuracy"] == 0.0
        assert metrics["precision"] == 0.0
        assert metrics["recall"] == 0.0
        assert metrics["f1_score"] == 0.0

    def test_mixed_multiclass_metrics(self):
        y_true = ["A", "B", "C", "A", "B"]
        y_pred = ["A", "B", "A", "A", "C"]
        metrics = calculate_classification_metrics(y_true, y_pred)

        assert metrics["accuracy"] == 3 / 5
        assert 0.0 <= metrics["macro_f1"] <= 1.0

    def test_empty_lists_handled(self):
        metrics = calculate_classification_metrics([], [])
        assert metrics["accuracy"] == 0.0
        assert metrics["f1_score"] == 0.0


# ==============================================================================
# 3. Continuous Error Metrics Tests (FR4, FR6)
# ==============================================================================

class TestErrorMetrics:
    """Unit tests for MAE, MSE, and RMSE on continuous scores (e.g. deception rating)."""

    def test_perfect_predictions(self):
        y_true = [2.5, 7.0, 9.0]
        y_pred = [2.5, 7.0, 9.0]
        metrics = calculate_error_metrics(y_true, y_pred)

        assert metrics["mae"] == 0.0
        assert metrics["mse"] == 0.0
        assert metrics["rmse"] == 0.0

    def test_known_deviations(self):
        y_true = [1.0, 2.0, 3.0]
        y_pred = [2.0, 3.0, 4.0]
        metrics = calculate_error_metrics(y_true, y_pred)

        assert metrics["mae"] == 1.0
        assert metrics["mse"] == 1.0
        assert metrics["rmse"] == 1.0


# ==============================================================================
# 4. Pointwise Pre-Classifier Runner Tests (FR6, T5.1)
# ==============================================================================

class TestPreClassifierPointwiseRunner:
    """Tests for run_pre_classifier_eval against golden dataset fixtures."""

    @pytest.mark.asyncio
    async def test_run_pre_classifier_eval_with_mock_service(self):
        mock_service = MagicMock()
        mock_result = MagicMock()
        mock_result.is_analysable = True
        mock_result.category = "Political / News"
        mock_result.deterministic_fast_path = True
        mock_service.classify_video = AsyncMock(return_value=mock_result)

        test_dataset = [
            {
                "video_id": "test_1",
                "title": "Senate Hearing on AI Policy",
                "channel_name": "C-SPAN",
                "category_id": "25",
                "category_name": "News & Politics",
                "is_analysable": True,
                "expected_category": "Political / News",
            },
            {
                "video_id": "test_2",
                "title": "Speedrun Mario Kart",
                "channel_name": "Gamer123",
                "category_id": "20",
                "category_name": "Gaming",
                "is_analysable": False,
                "expected_category": "Gaming Walkthrough / Speedrun",
            },
        ]

        with patch("app.evals.runners.quantitative_runner._load_pre_classifier_dataset", return_value=test_dataset):
            results = await run_pre_classifier_eval(service=mock_service, limit=2)

            assert "accuracy" in results
            assert "f1_score" in results
            assert "fast_path_short_circuit_rate" in results
            assert results["total_samples"] == 2
            assert results["fast_path_short_circuit_rate"] == 1.0


# ==============================================================================
# 5. Pairwise Model Benchmark Runner with Position Flipping Tests (FR7, T5.2)
# ==============================================================================

class TestPairwiseModelRunner:
    """Tests for run_pairwise_model_benchmark with 50% position flipping and 4x sampling."""

    @pytest.mark.asyncio
    async def test_pairwise_runner_position_flipping_eliminates_bias(self):
        # We test that when Model A is consistently judged better, Model A win rate is 100%
        # regardless of whether Model A was shown as Candidate 1 or Candidate 2.
        test_items = [
            {"prompt": "Analyze climate claims in transcript segment.", "criteria": "Accuracy and depth."}
        ]

        async def mock_judge(candidate_1_text, candidate_2_text, criteria, is_flipped, **kwargs):
            # If is_flipped is False, Candidate 1 is Model A. Candidate 1 is better.
            # If is_flipped is True, Candidate 2 is Model A. Candidate 2 is better.
            winner = "candidate_2" if is_flipped else "candidate_1"
            return PairwiseJudgmentRubric(
                winner=winner,
                confidence_score=0.9,
                comparative_rationale="The superior model provided much deeper empirical reasoning.",
            )

        with patch("app.evals.runners.pairwise_runner._generate_candidate_output", new_callable=AsyncMock) as mock_gen, \
             patch("app.evals.runners.pairwise_runner._judge_pairwise_candidates", side_effect=mock_judge):

            mock_gen.side_effect = lambda model, prompt, **kw: f"Output from {model}"

            result = await run_pairwise_model_benchmark(
                test_items=test_items,
                model_a="gemini-3.5-flash-lite",
                model_b="gemini-3.8-flash",
                multi_sample_count=4,
            )

            assert isinstance(result, PairwiseBenchmarkResult)
            # Model A was better in both forward and reversed presentation -> 100% win rate
            assert result.model_a_win_rate == 1.0
            assert result.model_b_win_rate == 0.0
            assert result.tie_rate == 0.0
            assert result.total_comparisons == 8  # 1 item * 2 flips * 4 samples = 8

    @pytest.mark.asyncio
    async def test_pairwise_runner_detects_pure_positional_bias(self):
        # When a judge always votes for "candidate_1" regardless of content
        test_items = [{"prompt": "Test prompt", "criteria": "Criteria"}]

        async def biased_judge(*args, **kwargs):
            return PairwiseJudgmentRubric(
                winner="candidate_1",  # Always prefers Candidate 1
                confidence_score=0.8,
                comparative_rationale="Always picking candidate 1 due to positional bias.",
            )

        with patch("app.evals.runners.pairwise_runner._generate_candidate_output", new_callable=AsyncMock) as mock_gen, \
             patch("app.evals.runners.pairwise_runner._judge_pairwise_candidates", side_effect=biased_judge):

            mock_gen.side_effect = lambda model, prompt, **kw: f"Output from {model}"

            result = await run_pairwise_model_benchmark(
                test_items=test_items,
                model_a="gemini-3.5-flash-lite",
                model_b="gemini-3.8-flash",
                multi_sample_count=2,
            )

            # Because 50% flips were run, Model A won 50% (when in pos 1) and Model B won 50% (when in pos 1)
            assert result.model_a_win_rate == 0.5
            assert result.model_b_win_rate == 0.5
            # Positional bias score should be high (Candidate 1 was chosen 100% of the time)
            assert result.positional_bias_score == 1.0

    @pytest.mark.asyncio
    async def test_pairwise_runner_isolates_fallback_ties_from_metrics(self):
        """Verify that fallback judgments (e.g. timeouts, quota) do not inflate ties or dilute win rates."""
        test_items = [{"prompt": "Analyze claims.", "criteria": "Accuracy."}]

        call_count = 0

        async def fallback_intermittent_judge(*args, **kwargs):
            nonlocal call_count
            call_count += 1
            # Return fallback on odd calls, valid judgment on even calls
            if call_count % 2 == 1:
                return PairwiseJudgmentRubric(
                    winner="tie",
                    confidence_score=0.0,
                    comparative_rationale="Fallback error timeout.",
                    is_fallback=True,
                )
            else:
                return PairwiseJudgmentRubric(
                    winner="candidate_1",
                    confidence_score=0.9,
                    comparative_rationale="Candidate 1 is superior.",
                    is_fallback=False,
                )

        with patch("app.evals.runners.pairwise_runner._generate_candidate_output", new_callable=AsyncMock) as mock_gen, \
             patch("app.evals.runners.pairwise_runner._judge_pairwise_candidates", side_effect=fallback_intermittent_judge):

            mock_gen.side_effect = lambda model, prompt, **kw: f"Output from {model}"

            result = await run_pairwise_model_benchmark(
                test_items=test_items,
                model_a="gemini-3.5-flash-lite",
                model_b="gemini-3.8-flash",
                multi_sample_count=2,
            )

            # Total = 1 item * 2 flips * 2 samples = 4 comparisons
            assert result.total_comparisons == 4
            # Exactly 2 were fallbacks
            assert result.fallback_count == 2
            assert result.valid_comparisons == 2
            # Fallbacks must NOT be counted in ties
            assert result.ties == 0
            assert result.tie_rate == 0.0
            # Valid comparisons (2) had candidate_1 winning each time (1 win for Model A, 1 win for Model B due to flip)
            assert result.model_a_wins == 1
            assert result.model_b_wins == 1
            assert result.model_a_win_rate == 0.5
            assert result.model_b_win_rate == 0.5

    @pytest.mark.asyncio
    async def test_pairwise_runner_internal_functions_sanitize_and_configure(self):
        """Verify _generate_candidate_output and _judge_pairwise_candidates sanitize inputs and use generation floors."""
        from app.evals.runners.pairwise_runner import _generate_candidate_output, _judge_pairwise_candidates

        mock_client = MagicMock()
        mock_response = MagicMock()
        mock_response.text = json.dumps({
            "winner": "candidate_1",
            "confidence_score": 0.95,
            "comparative_rationale": "High quality reasoning.",
            "is_fallback": False,
        })
        mock_client.aio.models.generate_content = AsyncMock(return_value=mock_response)

        with patch("app.evals.runners.pairwise_runner.get_genai_client", return_value=mock_client), \
             patch("app.evals.runners.pairwise_runner.sanitize_context", side_effect=lambda x, **kw: f"[CLEAN]{x}") as mock_sanitize_context, \
             patch("app.evals.runners.pairwise_runner.sanitize_candidate_output", side_effect=lambda x, **kw: f"[CLEAN]{x}") as mock_sanitize_cand:

            # Test candidate generation
            candidate_out = await _generate_candidate_output("gemini-3.5-flash-lite", "Raw <script>alert(1)</script> prompt")
            mock_sanitize_context.assert_called_with("Raw <script>alert(1)</script> prompt")
            assert mock_client.aio.models.generate_content.called
            gen_call_kwargs = mock_client.aio.models.generate_content.call_args.kwargs
            assert gen_call_kwargs["model"] == "gemini-3.5-flash-lite"
            assert "[CLEAN]" in gen_call_kwargs["contents"]
            assert gen_call_kwargs["config"] is not None
            assert gen_call_kwargs["config"].max_output_tokens >= 65536

            # Test judge invocation
            mock_client.aio.models.generate_content.reset_mock()
            mock_sanitize_context.reset_mock()
            mock_sanitize_cand.reset_mock()

            rubric = await _judge_pairwise_candidates(
                candidate_1_text="Text 1 <script>",
                candidate_2_text="Text 2",
                criteria="Accuracy",
                judge_model="gemini-3.8-flash",
            )
            assert rubric.winner == "candidate_1"
            assert rubric.is_fallback is False
            # Verify sanitize_candidate_output was called on candidate 1 and 2
            assert mock_sanitize_cand.call_count == 2
            # Verify sanitize_context was called on criteria
            assert mock_sanitize_context.call_count == 1
            judge_call_kwargs = mock_client.aio.models.generate_content.call_args.kwargs
            assert judge_call_kwargs["model"] == "gemini-3.8-flash"
            assert judge_call_kwargs["config"] is not None
            assert judge_call_kwargs["config"].max_output_tokens >= 65536
            assert judge_call_kwargs["config"].http_options.timeout >= 120.0

    @pytest.mark.asyncio
    async def test_judge_pairwise_candidates_does_not_truncate_candidate_over_2000_chars(self):
        """Verify candidate outputs are not truncated at 2000 chars by the context sanitizer."""
        from app.evals.runners.pairwise_runner import sanitize_candidate_output

        long_candidate = ("Detailed analytical finding about economics. " * 100).strip()  # ~4500 chars
        assert len(long_candidate) > 2000
        clean = sanitize_candidate_output(long_candidate)
        assert len(clean) == len(long_candidate)
        assert not clean.endswith("...")

    @pytest.mark.asyncio
    async def test_pairwise_runner_catches_sanitization_error_as_fallback(self):
        """Verify that when candidate content triggers SanitizationError, it is caught as fallback."""
        from app.evals.runners.pairwise_runner import _judge_pairwise_candidates
        from app.utils.input_sanitizer import SanitizationError

        with patch("app.evals.runners.pairwise_runner.sanitize_candidate_output", side_effect=SanitizationError("Prompt injection")):
            rubric = await _judge_pairwise_candidates(
                candidate_1_text="Adversarial content",
                candidate_2_text="Normal content",
                criteria="Accuracy",
            )
            assert rubric.winner == "tie"
            assert rubric.is_fallback is True
            assert "Prompt injection" in rubric.comparative_rationale

    @pytest.mark.asyncio
    async def test_pairwise_runner_candidate_generation_failure_marks_fallback(self):
        """Verify that when candidate generation fails, all item comparisons are marked as fallbacks without polluting win/tie rates."""
        test_items = [{"prompt": "Generate claim analysis", "criteria": "Accuracy"}]

        with patch("app.evals.runners.pairwise_runner._generate_candidate_output", side_effect=RuntimeError("Quota exceeded on model A")):
            result = await run_pairwise_model_benchmark(
                test_items=test_items,
                model_a="gemini-3.5-flash-lite",
                model_b="gemini-3.8-flash",
                multi_sample_count=2,
            )

            assert result.total_comparisons == 4  # 1 item * 2 flips * 2 samples
            assert result.fallback_count == 4
            assert result.valid_comparisons == 0
            assert result.model_a_wins == 0
            assert result.model_b_wins == 0
            assert result.ties == 0
            assert result.model_a_win_rate == 0.0
            assert result.model_b_win_rate == 0.0
            assert result.tie_rate == 0.0
            assert all(d["is_fallback"] is True for d in result.details)
            assert all("Quota exceeded" in d.get("rationale", "") for d in result.details)

    def test_normalize_content_category(self):
        """Verify category normalization maps diverse vocabularies to consistent evaluation classes."""
        from app.evals.runners.quantitative_runner import normalize_content_category

        assert normalize_content_category("Political Commentary") == "News & Politics"
        assert normalize_content_category("News & Politics") == "News & Politics"
        assert normalize_content_category("Political Satire & Comedy") == "Satire / Parody"
        assert normalize_content_category("Satire / Parody") == "Satire / Parody"
        assert normalize_content_category("Gameplay Walkthrough") == "Gaming"
        assert normalize_content_category("Gaming") == "Gaming"
        assert normalize_content_category("Music / Non-Speech Media") == "Music & Entertainment"
        assert normalize_content_category("ASML EUV Semiconductor Tech") == "Science & Technology"
        assert normalize_content_category("Academic Lecture on Economics") == "Education & Science"
        assert normalize_content_category("Vegan Recipe Tutorial") == "Lifestyle & Cooking"
        assert normalize_content_category("Gaming Tutorial") == "Gaming"
        assert normalize_content_category("Speedrun Tutorial") == "Gaming"
        assert normalize_content_category("Painting Tutorial") == "Lifestyle & Art"
        assert normalize_content_category("Documentary Essay") == "Science & Technology"
        assert normalize_content_category("Political Commentary (No Captions)") == "Raw Video Footage"
        assert normalize_content_category("Raw Video Footage") == "Raw Video Footage"
        assert normalize_content_category("Silent B-Roll: City Hall Press") == "Raw Video Footage"
        assert normalize_content_category("") == "Unknown"

    def test_sanitize_candidate_output_preserves_over_65k_characters(self):
        """Verify candidate outputs exceeding 65,536 characters are preserved without truncation."""
        from app.evals.runners.pairwise_runner import sanitize_candidate_output

        huge_candidate = ("Comprehensive analytical reasoning with evidence. " * 2000).strip()  # ~100,000 chars
        assert len(huge_candidate) > 65536
        clean = sanitize_candidate_output(huge_candidate)
        assert len(clean) == len(huge_candidate)
        assert not clean.endswith("...")

    def test_sanitize_candidate_output_preserves_heavily_escaped_characters(self):
        """Verify candidate outputs containing dense quotes and backslashes do not truncate after escaping expansion."""
        from app.evals.runners.pairwise_runner import sanitize_candidate_output

        # Generate text with dense quotes and braces that expands heavily upon escaping
        dense_quotes_candidate = ('"key": "value with quotes and evidence", ' * 2500).strip()
        clean = sanitize_candidate_output(dense_quotes_candidate)
        assert not clean.endswith("...")
        # Verify length after escaping is strictly larger than original without any truncation ellipsis
        assert len(clean) >= len(dense_quotes_candidate)

    def test_sanitize_candidate_output_preserves_nfkc_expanded_characters(self):
        """Verify candidate outputs with NFKC-expanding compatibility characters do not truncate."""
        from app.evals.runners.pairwise_runner import sanitize_candidate_output

        # \uFDFA is the Arabic ligature Sallallahou Alayhe Wasallam which expands from 1 to 18 characters under NFKC
        nfkc_candidate = ("Finding with ligature \uFDFA and details. " * 500).strip()
        clean = sanitize_candidate_output(nfkc_candidate)
        assert not clean.endswith("...")
        assert len(clean) > len(nfkc_candidate)



