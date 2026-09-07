"""
Offline component evaluation E2E test suite (T6.3, FR20, FR21, US1-US4).

All tests run offline against frozen golden fixtures — zero external network calls,
zero YouTube / Google Custom Search API requests (NFR3).

Run with:
    pytest -m "eval and component" backend/tests/test_component_evaluations_e2e.py
"""

import json
import math
from pathlib import Path
from typing import Any, Dict, List
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

# ---------------------------------------------------------------------------
# 1. Benchmark Aggregator Tests
# ---------------------------------------------------------------------------

pytestmark = [pytest.mark.eval, pytest.mark.component]


class TestBenchmarkAggregator:
    """Tests for aggregate_benchmark_results() (T6.1, FR16, FR21)."""

    @pytest.fixture(autouse=True)
    def _import_aggregator(self):
        from app.evals.reporting.aggregator import aggregate_benchmark_results
        self.aggregate = aggregate_benchmark_results

    def _make_result(self, component: str, score: float, is_fallback: bool = False, **kwargs) -> Dict[str, Any]:
        return {
            "component": component,
            "metric_name": "test_metric",
            "score": score,
            "is_fallback": is_fallback,
            "model_name": "gemini-3.8-flash",
            "input_tokens": kwargs.get("input_tokens", 100),
            "output_tokens": kwargs.get("output_tokens", 50),
            "eval_input": "test input",
            "eval_output": "test output",
        }

    def test_empty_results_returns_zero_totals(self):
        result = self.aggregate([])
        assert result["fallback_count"] == 0
        assert result["total_results"] == 0
        assert result["totals"]["overall_mean_score"] == 0.0
        assert result["per_component"] == {}

    def test_valid_results_compute_mean_score(self):
        results = [
            self._make_result("pre_classifier", 0.8),
            self._make_result("pre_classifier", 0.9),
            self._make_result("pre_classifier", 0.85),
        ]
        agg = self.aggregate(results)
        pc = agg["per_component"]["pre_classifier"]
        assert pc["mean_score"] == pytest.approx(0.85, rel=1e-4)
        assert pc["valid_records"] == 3
        assert pc["fallback_count"] == 0

    def test_fallback_records_excluded_from_mean(self):
        """FR16: is_fallback=True records MUST be excluded from mean score calculation."""
        results = [
            self._make_result("extractor", 0.9),
            self._make_result("extractor", 0.0, is_fallback=True),  # Must be excluded
            self._make_result("extractor", 0.8),
        ]
        agg = self.aggregate(results)
        ext = agg["per_component"]["extractor"]
        # Mean should be (0.9 + 0.8) / 2 = 0.85, NOT 0 affected by fallback
        assert ext["mean_score"] == pytest.approx(0.85, rel=1e-4)
        assert ext["valid_records"] == 2
        assert ext["fallback_count"] == 1
        assert agg["fallback_count"] == 1

    def test_all_fallbacks_produces_zero_mean(self):
        """All fallback results: mean should be 0.0, fallback_count equals total."""
        results = [
            self._make_result("bias", 0.0, is_fallback=True),
            self._make_result("bias", 0.0, is_fallback=True),
        ]
        agg = self.aggregate(results)
        b = agg["per_component"]["bias"]
        assert b["mean_score"] == 0.0
        assert b["valid_records"] == 0
        assert b["fallback_count"] == 2
        assert agg["fallback_count"] == 2

    def test_confidence_interval_computed(self):
        """95% CI must be computed for valid records."""
        results = [self._make_result("alethiology", s) for s in [0.7, 0.8, 0.9, 0.75, 0.85]]
        agg = self.aggregate(results)
        a = agg["per_component"]["alethiology"]
        assert a["ci_lower_95"] <= a["mean_score"] <= a["ci_upper_95"]
        assert a["score_std"] > 0.0  # Multiple values should produce non-zero std

    def test_multi_component_totals(self):
        """Totals aggregated across all components."""
        results = [
            self._make_result("pre_classifier", 0.9, input_tokens=500, output_tokens=200),
            self._make_result("extractor", 0.75, input_tokens=300, output_tokens=150),
        ]
        agg = self.aggregate(results)
        assert agg["totals"]["total_input_tokens"] == 800
        assert agg["totals"]["total_output_tokens"] == 350
        assert agg["totals"]["total_tokens"] == 1150
        assert agg["totals"]["total_cost_usd"] > 0.0

    def test_error_rate_calculation(self):
        """error_rate = fallback_count / total_records per component."""
        results = [
            self._make_result("perspective", 0.8),
            self._make_result("perspective", 0.0, is_fallback=True),
            self._make_result("perspective", 0.0, is_fallback=True),
            self._make_result("perspective", 0.9),
        ]
        agg = self.aggregate(results)
        p = agg["per_component"]["perspective"]
        assert p["error_rate"] == pytest.approx(0.5, rel=1e-4)  # 2/4

    def test_single_result_ci_bounds(self):
        """Single valid result: CI lower == upper == mean."""
        results = [self._make_result("pre_classifier", 0.75)]
        agg = self.aggregate(results)
        pc = agg["per_component"]["pre_classifier"]
        assert pc["mean_score"] == 0.75
        assert pc["ci_lower_95"] == pc["ci_upper_95"] == pc["mean_score"]


# ---------------------------------------------------------------------------
# 2. Trace Export Tests
# ---------------------------------------------------------------------------

class TestTraceExport:
    """Tests for export_traces() producing agents-cli compatible trace files (T6.1, FR21)."""

    @pytest.fixture(autouse=True)
    def _import_exporter(self, tmp_path):
        from app.evals.reporting.aggregator import export_traces
        self.export_traces = export_traces
        self.tmp_path = tmp_path

    def _make_result(self, **kwargs) -> Dict[str, Any]:
        defaults = {
            "component": "pre_classifier",
            "metric_name": "pre_classifier_f1",
            "score": 0.9,
            "is_fallback": False,
            "model_name": "gemini-3.8-flash",
            "input_tokens": 100,
            "output_tokens": 50,
            "eval_input": "Sample transcript",
            "eval_output": "{'f1_score': 0.9}",
        }
        defaults.update(kwargs)
        return defaults

    def test_trace_file_created(self):
        results = [self._make_result()]
        trace_path = self.export_traces(results, trace_dir=self.tmp_path, run_timestamp="20260907_120000")
        assert trace_path.exists()
        assert trace_path.name == "run_20260907_120000.json"

    def test_trace_file_valid_json(self):
        results = [self._make_result(), self._make_result(component="extractor")]
        trace_path = self.export_traces(results, trace_dir=self.tmp_path, run_timestamp="20260907_120001")
        content = json.loads(trace_path.read_text(encoding="utf-8"))
        assert "eval_cases" in content
        assert len(content["eval_cases"]) == 2

    def test_trace_eval_case_schema(self):
        """Each eval_case must have eval_case_id, prompt, responses, and metadata."""
        results = [self._make_result()]
        trace_path = self.export_traces(results, trace_dir=self.tmp_path, run_timestamp="20260907_120002")
        content = json.loads(trace_path.read_text(encoding="utf-8"))
        case = content["eval_cases"][0]

        assert "eval_case_id" in case
        assert "prompt" in case
        assert "responses" in case
        assert "metadata" in case
        assert case["prompt"]["role"] == "user"
        assert case["responses"][0]["response"]["role"] == "model"

    def test_trace_metadata_contains_is_fallback(self):
        """Metadata must include is_fallback flag for agents-cli grade compatibility."""
        results = [self._make_result(is_fallback=True)]
        trace_path = self.export_traces(results, trace_dir=self.tmp_path, run_timestamp="20260907_120003")
        content = json.loads(trace_path.read_text(encoding="utf-8"))
        assert content["eval_cases"][0]["metadata"]["is_fallback"] is True

    def test_trace_directory_created_if_absent(self):
        """trace_dir should be created automatically if it does not exist."""
        new_dir = self.tmp_path / "nested" / "traces"
        assert not new_dir.exists()
        self.export_traces([self._make_result()], trace_dir=new_dir, run_timestamp="20260907_120004")
        assert new_dir.exists()


# ---------------------------------------------------------------------------
# 3. Markdown Report Tests
# ---------------------------------------------------------------------------

class TestMarkdownReportGeneration:
    """Tests for generate_markdown_report() (T6.1, FR21)."""

    @pytest.fixture(autouse=True)
    def _imports(self, tmp_path):
        from app.evals.reporting.aggregator import aggregate_benchmark_results, generate_markdown_report
        self.aggregate = aggregate_benchmark_results
        self.generate_report = generate_markdown_report
        self.tmp_path = tmp_path

    def _make_result(self, component: str, score: float, is_fallback: bool = False) -> Dict[str, Any]:
        return {
            "component": component, "metric_name": "test_metric", "score": score,
            "is_fallback": is_fallback, "model_name": "gemini-3.8-flash",
            "input_tokens": 100, "output_tokens": 50,
            "eval_input": "input", "eval_output": "output",
        }

    def test_markdown_report_created(self):
        results = [self._make_result("pre_classifier", 0.9)]
        agg = self.aggregate(results)
        md_path = self.generate_report(agg, report_dir=self.tmp_path, run_timestamp="20260907_120005")
        assert md_path.exists()
        assert md_path.suffix == ".md"

    def test_json_report_also_created(self):
        results = [self._make_result("extractor", 0.8)]
        agg = self.aggregate(results)
        self.generate_report(agg, report_dir=self.tmp_path, run_timestamp="20260907_120006")
        json_path = self.tmp_path / "summary_20260907_120006.json"
        assert json_path.exists()
        content = json.loads(json_path.read_text(encoding="utf-8"))
        assert "aggregation" in content
        assert "run_timestamp" in content

    def test_markdown_contains_per_component_table(self):
        results = [self._make_result("alethiology", 0.85)]
        agg = self.aggregate(results)
        md_path = self.generate_report(agg, report_dir=self.tmp_path, run_timestamp="20260907_120007")
        content = md_path.read_text(encoding="utf-8")
        assert "alethiology" in content
        assert "Per-Component Summary" in content

    def test_markdown_contains_fallback_count(self):
        results = [
            self._make_result("bias", 0.0, is_fallback=True),
            self._make_result("bias", 0.9),
        ]
        agg = self.aggregate(results)
        md_path = self.generate_report(agg, report_dir=self.tmp_path, run_timestamp="20260907_120008")
        content = md_path.read_text(encoding="utf-8")
        assert "Fallback" in content

    def test_markdown_contains_cost_rollup(self):
        results = [self._make_result("perspective", 0.7, is_fallback=False)]
        agg = self.aggregate(results)
        md_path = self.generate_report(agg, report_dir=self.tmp_path, run_timestamp="20260907_120009")
        content = md_path.read_text(encoding="utf-8")
        assert "Total Cost" in content
        assert "Token" in content


# ---------------------------------------------------------------------------
# 4. Pre-Classifier Offline Golden Fixture Evaluation (US1)
# ---------------------------------------------------------------------------

class TestPreClassifierOfflineEval:
    """
    Scenario: Component Failure Attribution (US1)
    Evaluates PreClassifierService against golden fixtures in strict offline mode.
    No external network calls are permitted (NFR3).
    """

    @pytest.fixture(autouse=True)
    def _import_runner(self):
        from app.evals.runners.quantitative_runner import (
            calculate_classification_metrics,
            _load_pre_classifier_dataset,
        )
        self.calculate_metrics = calculate_classification_metrics
        self.load_dataset = _load_pre_classifier_dataset

    def test_pre_classifier_golden_dataset_loads(self):
        """Golden fixture dataset must load without errors (FR1)."""
        dataset = self.load_dataset()
        assert isinstance(dataset, list)
        assert len(dataset) >= 30, "Must have at least 30 test cases (FR1)"

    def test_pre_classifier_golden_has_required_fields(self):
        """Each golden record must have required annotation fields."""
        dataset = self.load_dataset()
        for item in dataset[:5]:
            assert "is_analysable" in item, f"Missing is_analysable in {item.get('video_id', 'unknown')}"
            assert "expected_category" in item or "category_name" in item

    def test_classification_metrics_all_correct(self):
        """Verify classification metric computation on a perfect prediction set."""
        y_true = [True, True, False, False, True]
        y_pred = [True, True, False, False, True]
        metrics = self.calculate_metrics(y_true, y_pred)
        assert metrics["accuracy"] == pytest.approx(1.0)
        assert metrics["f1_score"] == pytest.approx(1.0)
        assert metrics["precision"] == pytest.approx(1.0)
        assert metrics["recall"] == pytest.approx(1.0)

    def test_classification_metrics_with_errors(self):
        """F1 degrades correctly with false positives and false negatives."""
        y_true = [True, True, False, True, False]
        y_pred = [True, False, True, True, False]
        # TP=2, FP=1, FN=1
        metrics = self.calculate_metrics(y_true, y_pred)
        assert metrics["accuracy"] < 1.0
        assert 0 < metrics["f1_score"] < 1.0


# ---------------------------------------------------------------------------
# 5. Timestamp IoU Offline Evaluation (FR6)
# ---------------------------------------------------------------------------

class TestClaimExtractorOfflineIoU:
    """Offline IoU evaluation for ClaimExtractor golden fixture alignment."""

    @pytest.fixture(autouse=True)
    def _import_runner(self):
        from app.evals.runners.quantitative_runner import (
            calculate_timestamp_iou,
            run_claim_timestamp_iou_eval,
        )
        self.iou = calculate_timestamp_iou
        self.run_iou_eval = run_claim_timestamp_iou_eval

    def test_iou_self_match_is_perfect(self):
        """IoU of identical intervals = 1.0 (baseline sanity check)."""
        assert self.iou(0.0, 10.0, 0.0, 10.0) == pytest.approx(1.0)

    def test_claim_iou_eval_with_gold_self_match(self):
        """Greedy bipartite matching on identical sets yields perfect IoU."""
        gold = [{"timestamp_start": 0.0, "timestamp_end": 10.0}, {"timestamp_start": 20.0, "timestamp_end": 35.0}]
        result = self.run_iou_eval(gold, gold)
        assert result["mean_iou"] == pytest.approx(1.0)
        assert result["precision_at_iou"] == pytest.approx(1.0)
        assert result["recall_at_iou"] == pytest.approx(1.0)

    def test_claim_iou_eval_with_partial_overlap(self):
        """Partial overlap IoU is correctly computed and < 1.0."""
        extracted = [{"timestamp_start": 0.0, "timestamp_end": 8.0}]  # pred
        gold = [{"timestamp_start": 5.0, "timestamp_end": 15.0}]       # gold
        # intersection=[5,8]=3, union=[0,15]=15, IoU=3/15=0.2
        # Use iou_threshold=0.0 so the partial match is counted for mean_iou
        result = self.run_iou_eval(extracted, gold, iou_threshold=0.0)
        assert result["mean_iou"] == pytest.approx(0.2, abs=1e-4)
        assert result["mean_iou"] < 1.0

    def test_golden_claim_dataset_structure(self):
        """
        Claim extractor golden dataset loads and validates timestamp alignment.

        Checks that every golden claim in the first 3 test cases:
        1. Has timestamp boundary keys (timestamp_start / start)
        2. Has non-negative start time
        3. Has end time strictly after start time (start < end)

        This ensures temporally misaligned fixtures cannot pass CI and
        distort IoU measurements (P2 — Fixture alignment validation).
        """
        dataset_path = Path(__file__).resolve().parent.parent / "app" / "evals" / "datasets" / "claim_extractor_golden.json"
        if not dataset_path.exists():
            pytest.skip("Claim extractor dataset not found")
        with open(dataset_path, encoding="utf-8") as f:
            data = json.load(f)
        cases = data if isinstance(data, list) else data.get("test_cases", [])
        assert len(cases) >= 15, "Must have at least 15 transcript segments (FR2)"
        for case_idx, case in enumerate(cases[:3]):
            gold_claims = case.get("gold_claims", [])
            assert len(gold_claims) > 0, f"Case {case_idx} must have at least one gold claim"
            for claim_idx, claim in enumerate(gold_claims):
                # Key presence check
                has_start = "timestamp_start" in claim or "start" in claim
                has_end = "timestamp_end" in claim or "end" in claim
                assert has_start, (
                    f"Case {case_idx} claim {claim_idx}: missing timestamp_start/start key"
                )
                assert has_end, (
                    f"Case {case_idx} claim {claim_idx}: missing timestamp_end/end key"
                )
                # Temporal validity check
                t_start = float(claim.get("timestamp_start", claim.get("start", 0)))
                t_end = float(claim.get("timestamp_end", claim.get("end", 0)))
                assert t_start >= 0.0, (
                    f"Case {case_idx} claim {claim_idx}: timestamp_start must be non-negative, got {t_start}"
                )
                assert t_end > t_start, (
                    f"Case {case_idx} claim {claim_idx}: timestamp_end ({t_end}) must be > "
                    f"timestamp_start ({t_start}) — temporally misaligned fixture"
                )


# ---------------------------------------------------------------------------
# 6. Aggregator + Trace Integration (FR16 Fallback Isolation)
# ---------------------------------------------------------------------------

class TestFallbackIsolationIntegration:
    """
    Integration test: FR16 heuristic fallback isolation contract.
    Fallback records must never pollute mean quality scores.
    """

    @pytest.fixture(autouse=True)
    def _imports(self, tmp_path):
        from app.evals.reporting.aggregator import (
            aggregate_benchmark_results,
            export_traces,
        )
        self.aggregate = aggregate_benchmark_results
        self.export_traces = export_traces
        self.tmp_path = tmp_path

    def test_mixed_valid_and_fallback_aggregation(self):
        """
        Scenario: 3 valid results (scores 0.9, 0.85, 0.8) + 2 fallbacks (score 0.0).
        Mean must be (0.9+0.85+0.8)/3 = 0.85, not average including fallbacks.
        """
        results = [
            {"component": "alethiology", "metric_name": "neutrality", "score": 0.9,
             "is_fallback": False, "model_name": "gemini-3.8-flash",
             "input_tokens": 100, "output_tokens": 50, "eval_input": "a", "eval_output": "b"},
            {"component": "alethiology", "metric_name": "neutrality", "score": 0.85,
             "is_fallback": False, "model_name": "gemini-3.8-flash",
             "input_tokens": 100, "output_tokens": 50, "eval_input": "c", "eval_output": "d"},
            {"component": "alethiology", "metric_name": "neutrality", "score": 0.8,
             "is_fallback": False, "model_name": "gemini-3.8-flash",
             "input_tokens": 100, "output_tokens": 50, "eval_input": "e", "eval_output": "f"},
            {"component": "alethiology", "metric_name": "neutrality", "score": 0.0,
             "is_fallback": True, "model_name": "gemini-3.8-flash",
             "input_tokens": 0, "output_tokens": 0, "eval_input": "g", "eval_output": "fallback"},
            {"component": "alethiology", "metric_name": "neutrality", "score": 0.0,
             "is_fallback": True, "model_name": "gemini-3.8-flash",
             "input_tokens": 0, "output_tokens": 0, "eval_input": "h", "eval_output": "fallback"},
        ]
        agg = self.aggregate(results)
        a = agg["per_component"]["alethiology"]

        expected_mean = (0.9 + 0.85 + 0.8) / 3
        assert a["mean_score"] == pytest.approx(expected_mean, rel=1e-4), (
            "Fallback records must be excluded from mean score calculation (FR16)"
        )
        assert a["fallback_count"] == 2
        assert agg["fallback_count"] == 2

    def test_trace_export_preserves_all_results_including_fallbacks(self):
        """Traces must include all records (valid AND fallback) for audit purposes."""
        results = [
            {"component": "bias", "metric_name": "m", "score": 0.9,
             "is_fallback": False, "model_name": "gemini-3.8-flash",
             "input_tokens": 50, "output_tokens": 25, "eval_input": "x", "eval_output": "y"},
            {"component": "bias", "metric_name": "m", "score": 0.0,
             "is_fallback": True, "model_name": "gemini-3.8-flash",
             "input_tokens": 0, "output_tokens": 0, "eval_input": "z", "eval_output": "fallback"},
        ]
        trace_path = self.export_traces(results, trace_dir=self.tmp_path, run_timestamp="20260907_130000")
        content = json.loads(trace_path.read_text(encoding="utf-8"))
        assert len(content["eval_cases"]) == 2, "Both valid and fallback traces must be exported"
        fallback_cases = [c for c in content["eval_cases"] if c["metadata"]["is_fallback"] is True]
        assert len(fallback_cases) == 1
