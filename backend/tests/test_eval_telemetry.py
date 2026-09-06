"""Unit tests for OpenTelemetry GenAI evaluation tracing and Cloud Trace fallback (T3.1, T3.2, FR17-FR19)."""

import pytest

from app.evals.telemetry.tracer import (
    calculate_token_cost,
    clear_in_memory_spans,
    get_in_memory_spans,
    init_eval_telemetry,
    record_eval_span,
    GEN_AI_SYSTEM,
    GEN_AI_REQUEST_MODEL,
    GEN_AI_EVALUATION_METRIC,
    GEN_AI_EVALUATION_SCORE,
    GEN_AI_USAGE_INPUT_TOKENS,
    GEN_AI_USAGE_OUTPUT_TOKENS,
    TOTAL_COST,
)


class TestEvalTelemetry:
    """Tests for GenAI semantic convention span creation and cost calculation."""

    def setup_method(self):
        clear_in_memory_spans()

    def test_calculate_token_cost(self):
        # gemini-3.5-flash-lite: input $0.075/1M, output $0.30/1M
        cost_lite = calculate_token_cost("gemini-3.5-flash-lite", 1_000_000, 1_000_000)
        assert pytest.approx(cost_lite, rel=1e-5) == 0.375

        # gemini-3.8-flash: input $0.15/1M, output $0.60/1M
        cost_flash = calculate_token_cost("gemini-3.8-flash", 1_000_000, 1_000_000)
        assert pytest.approx(cost_flash, rel=1e-5) == 0.75

        # 10k tokens calculation
        cost_small = calculate_token_cost("gemini-3.5-flash-lite", 10_000, 2_000)
        expected = (10_000 / 1e6 * 0.075) + (2_000 / 1e6 * 0.30)
        assert pytest.approx(cost_small, rel=1e-5) == expected

    def test_record_eval_span_captures_gen_ai_attributes(self):
        init_eval_telemetry(disable_cloud_trace=True)
        clear_in_memory_spans()

        with record_eval_span(
            metric_name="faithfulness",
            model_name="gemini-3.5-flash-lite",
            score=4.5,
            input_tokens=1500,
            output_tokens=300,
            extra_attributes={"custom.tag": "test_tag"},
        ):
            pass

        spans = get_in_memory_spans()
        assert len(spans) >= 1
        eval_span = spans[-1]

        attrs = eval_span.attributes
        assert attrs[GEN_AI_SYSTEM] == "vertex_ai"
        assert attrs[GEN_AI_REQUEST_MODEL] == "gemini-3.5-flash-lite"
        assert attrs[GEN_AI_EVALUATION_METRIC] == "faithfulness"
        assert pytest.approx(attrs[GEN_AI_EVALUATION_SCORE], rel=1e-5) == 4.5
        assert attrs[GEN_AI_USAGE_INPUT_TOKENS] == 1500
        assert attrs[GEN_AI_USAGE_OUTPUT_TOKENS] == 300
        assert attrs[TOTAL_COST] > 0.0
        assert attrs["custom.tag"] == "test_tag"

    def test_disable_cloud_trace_fallback_emits_local_spans_safely(self, monkeypatch):
        monkeypatch.setenv("DISABLE_CLOUD_TRACE", "true")
        tracer = init_eval_telemetry()
        assert tracer is not None

        clear_in_memory_spans()
        with record_eval_span(
            metric_name="claim_recall",
            model_name="gemini-3.8-flash",
            score=0.95,
        ):
            pass

        spans = get_in_memory_spans()
        assert len(spans) >= 1
        assert spans[-1].attributes[GEN_AI_EVALUATION_METRIC] == "claim_recall"
