"""OpenTelemetry GenAI Semantic Conventions and Cloud Trace exporter for evaluations (FR17, FR18, FR19)."""

import os
import logging
from contextlib import contextmanager
from typing import Any, Dict, Generator, Optional

from opentelemetry import trace
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import (
    BatchSpanProcessor,
    SimpleSpanProcessor,
)
from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter

logger = logging.getLogger(__name__)

# Standard GenAI Semantic Attribute Keys (OpenTelemetry GenAI Conventions)
GEN_AI_SYSTEM = "gen_ai.system"
GEN_AI_REQUEST_MODEL = "gen_ai.request.model"
GEN_AI_EVALUATION_METRIC = "gen_ai.evaluation.metric_name"
GEN_AI_EVALUATION_SCORE = "gen_ai.evaluation.score"
GEN_AI_USAGE_INPUT_TOKENS = "gen_ai.usage.input_tokens"
GEN_AI_USAGE_OUTPUT_TOKENS = "gen_ai.usage.output_tokens"
TOTAL_COST = "total_cost"

# Gemini Pricing per 1M tokens (USD)
# (Used for precise per-span cost accounting under Vertex AI mode)
MODEL_PRICING_PER_MILLION: Dict[str, Dict[str, float]] = {
    "gemini-3.5-flash-lite": {"input": 0.075, "output": 0.30},
    "gemini-3.1-flash-lite": {"input": 0.075, "output": 0.30},
    "gemini-3.8-flash": {"input": 0.15, "output": 0.60},
}
DEFAULT_PRICING = {"input": 0.15, "output": 0.60}

_TRACER_INITIALIZED = False
_IN_MEMORY_EXPORTER: Optional[InMemorySpanExporter] = None


def calculate_token_cost(model_name: str, input_tokens: int, output_tokens: int) -> float:
    """Calculates approximate USD dollar cost for given token usage."""
    pricing = MODEL_PRICING_PER_MILLION.get(model_name.lower(), DEFAULT_PRICING)
    input_cost = (input_tokens / 1_000_000.0) * pricing["input"]
    output_cost = (output_tokens / 1_000_000.0) * pricing["output"]
    return round(input_cost + output_cost, 8)


def init_eval_telemetry(disable_cloud_trace: Optional[bool] = None) -> trace.Tracer:
    """
    Initializes OpenTelemetry Tracer with Cloud Trace or local fallback exporter.
    Precedence:
    1. disable_cloud_trace argument if provided.
    2. DISABLE_CLOUD_TRACE environment variable ('true', '1', 'yes').
    3. Fallback to InMemorySpanExporter if CloudTraceSpanExporter is unavailable.
    """
    global _TRACER_INITIALIZED, _IN_MEMORY_EXPORTER

    if disable_cloud_trace is None:
        env_val = os.getenv("DISABLE_CLOUD_TRACE", "false").strip().lower()
        disable_cloud_trace = env_val in ("true", "1", "yes")

    provider = trace.get_tracer_provider()
    if not isinstance(provider, TracerProvider):
        provider = TracerProvider()
        trace.set_tracer_provider(provider)

    _IN_MEMORY_EXPORTER = InMemorySpanExporter()

    if disable_cloud_trace:
        logger.info("Cloud Trace disabled via DISABLE_CLOUD_TRACE; using local in-memory fallback exporter.")
        provider.add_span_processor(SimpleSpanProcessor(_IN_MEMORY_EXPORTER))
    else:
        try:
            from opentelemetry.exporter.cloud_trace import CloudTraceSpanExporter

            cloud_exporter = CloudTraceSpanExporter()
            provider.add_span_processor(BatchSpanProcessor(cloud_exporter))
            logger.info("OpenTelemetry GenAI exporter initialized with Google Cloud Trace native export.")
        except (ImportError, Exception) as exc:
            logger.warning(
                "Could not initialize CloudTraceSpanExporter (%s). Emitting local fallback spans without raising.",
                exc,
            )
            provider.add_span_processor(SimpleSpanProcessor(_IN_MEMORY_EXPORTER))

    _TRACER_INITIALIZED = True
    return trace.get_tracer("perspective_prism.evals")


def get_eval_tracer() -> trace.Tracer:
    """Returns the configured evaluation tracer singleton."""
    global _TRACER_INITIALIZED
    if not _TRACER_INITIALIZED:
        return init_eval_telemetry()
    return trace.get_tracer("perspective_prism.evals")


def get_in_memory_spans() -> list:
    """Helper to inspect captured spans during unit tests."""
    if _IN_MEMORY_EXPORTER is not None:
        return _IN_MEMORY_EXPORTER.get_finished_spans()
    return []


def clear_in_memory_spans() -> None:
    """Helper to reset in-memory span buffer between test runs."""
    if _IN_MEMORY_EXPORTER is not None:
        _IN_MEMORY_EXPORTER.clear()


@contextmanager
def record_eval_span(
    metric_name: str,
    model_name: str,
    score: Optional[float] = None,
    input_tokens: int = 0,
    output_tokens: int = 0,
    extra_attributes: Optional[Dict[str, Any]] = None,
) -> Generator[trace.Span, None, None]:
    """
    Context manager that creates an OpenTelemetry GenAI evaluation span
    and populates semantic attributes and cost accounting upon exit.
    """
    tracer = get_eval_tracer()
    span_name = f"eval.{metric_name}"
    with tracer.start_as_current_span(span_name) as span:
        cost = calculate_token_cost(model_name, input_tokens, output_tokens)

        span.set_attribute(GEN_AI_SYSTEM, "vertex_ai")
        span.set_attribute(GEN_AI_REQUEST_MODEL, model_name)
        span.set_attribute(GEN_AI_EVALUATION_METRIC, metric_name)
        if score is not None:
            span.set_attribute(GEN_AI_EVALUATION_SCORE, float(score))
        span.set_attribute(GEN_AI_USAGE_INPUT_TOKENS, input_tokens)
        span.set_attribute(GEN_AI_USAGE_OUTPUT_TOKENS, output_tokens)
        span.set_attribute(TOTAL_COST, cost)

        if extra_attributes:
            for k, v in extra_attributes.items():
                span.set_attribute(k, v)

        yield span
