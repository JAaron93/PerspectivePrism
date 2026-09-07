"""Benchmark Aggregator with Fallback Isolation & Trace Export (T6.1, FR16, FR21).

Computes per-component mean scores, confidence intervals, total token usage, and total
dollar cost from evaluation result records. Filters out is_fallback=True records before
calculating mean judge scores, exporting an explicit fallback_count.

Exports execution traces to artifacts/traces/run_<timestamp>.json in a schema compatible
with agents-cli eval grade and agents-cli eval compare, and writes structured Markdown and
JSON rollup reports to artifacts/eval_results/summary_<timestamp>.{md,json}.
"""

import json
import logging
import math
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from tabulate import tabulate

from app.evals.telemetry.tracer import MODEL_PRICING_PER_MILLION, DEFAULT_PRICING

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Default artifact output directories (relative to the backend/ working dir)
# ---------------------------------------------------------------------------
DEFAULT_TRACE_DIR = Path("artifacts/traces")
DEFAULT_REPORT_DIR = Path("artifacts/eval_results")


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _compute_confidence_interval(scores: List[float], confidence: float = 0.95) -> Dict[str, float]:
    """
    Computes a two-sided confidence interval for a list of float scores.

    Uses the t-approximation z=1.96 for large samples (>=30) or the
    conservative z=1.96 (95% CI) for smaller samples.

    Returns dict with keys: mean, std, se, lower, upper, n.
    """
    n = len(scores)
    if n == 0:
        return {"mean": 0.0, "std": 0.0, "se": 0.0, "lower": 0.0, "upper": 0.0, "n": 0}

    mean = sum(scores) / n
    if n == 1:
        return {"mean": round(mean, 4), "std": 0.0, "se": 0.0, "lower": round(mean, 4), "upper": round(mean, 4), "n": 1}

    variance = sum((s - mean) ** 2 for s in scores) / (n - 1)
    std = math.sqrt(variance)
    se = std / math.sqrt(n)
    z = 1.96  # 95% CI approximation
    lower = max(0.0, mean - z * se)
    upper = min(1.0, mean + z * se) if all(0.0 <= s <= 1.0 for s in scores) else mean + z * se

    return {
        "mean": round(mean, 4),
        "std": round(std, 4),
        "se": round(se, 4),
        "lower": round(lower, 4),
        "upper": round(upper, 4),
        "n": n,
    }


def _calculate_cost_from_tokens(model_name: str, input_tokens: int, output_tokens: int) -> float:
    """Computes approximate dollar cost from token counts."""
    pricing = MODEL_PRICING_PER_MILLION.get(model_name.lower(), DEFAULT_PRICING)
    input_cost = (input_tokens / 1_000_000.0) * pricing["input"]
    output_cost = (output_tokens / 1_000_000.0) * pricing["output"]
    return round(input_cost + output_cost, 8)


# ---------------------------------------------------------------------------
# Core aggregation
# ---------------------------------------------------------------------------

def aggregate_benchmark_results(results: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Aggregates benchmark evaluation results per component.

    Records with is_fallback=True are excluded from mean score calculations but
    are counted and reported in fallback_count and error_rate.

    Args:
        results: List of result dicts, each containing at minimum:
            - component (str): Pipeline stage name (e.g. "pre_classifier").
            - score (float): Primary numeric evaluation metric (0.0–1.0 or wider).
            - is_fallback (bool): Whether this result used heuristic fallback.
            - model_name (str, optional): Model used for this evaluation.
            - input_tokens (int, optional): Input token count.
            - output_tokens (int, optional): Output token count.
            - metric_name (str, optional): Metric identifier.

    Returns:
        Dict with keys:
            - per_component (dict): Per-component statistics dicts.
            - totals (dict): Aggregate totals across all components.
            - fallback_count (int): Number of fallback records across all components.
            - total_results (int): Total number of result records.
    """
    if not results:
        return {
            "per_component": {},
            "totals": {
                "total_input_tokens": 0,
                "total_output_tokens": 0,
                "total_tokens": 0,
                "total_cost_usd": 0.0,
                "overall_mean_score": 0.0,
                "valid_result_count": 0,
            },
            "fallback_count": 0,
            "total_results": 0,
        }

    # Group by component
    components: Dict[str, List[Dict[str, Any]]] = {}
    for record in results:
        comp = str(record.get("component", "unknown"))
        components.setdefault(comp, []).append(record)

    per_component: Dict[str, Dict[str, Any]] = {}
    global_valid_scores: List[float] = []
    global_input_tokens = 0
    global_output_tokens = 0
    global_cost = 0.0
    global_fallback_count = 0

    for comp_name, comp_results in components.items():
        valid_records = [r for r in comp_results if not r.get("is_fallback", False)]
        fallback_records = [r for r in comp_results if r.get("is_fallback", False)]

        fallback_count = len(fallback_records)
        total_count = len(comp_results)
        error_rate = round(fallback_count / total_count, 4) if total_count > 0 else 0.0

        valid_scores = [float(r["score"]) for r in valid_records if "score" in r]
        ci = _compute_confidence_interval(valid_scores)

        comp_input_tokens = sum(int(r.get("input_tokens", 0)) for r in comp_results)
        comp_output_tokens = sum(int(r.get("output_tokens", 0)) for r in comp_results)
        comp_tokens = comp_input_tokens + comp_output_tokens

        # Cost per component (aggregate all records' model-based costs)
        comp_cost = 0.0
        for r in comp_results:
            model = str(r.get("model_name", "gemini-3.8-flash"))
            comp_cost += _calculate_cost_from_tokens(
                model,
                int(r.get("input_tokens", 0)),
                int(r.get("output_tokens", 0)),
            )

        per_component[comp_name] = {
            "component": comp_name,
            "total_records": total_count,
            "valid_records": len(valid_records),
            "fallback_count": fallback_count,
            "error_rate": error_rate,
            "mean_score": ci["mean"],
            "score_std": ci["std"],
            "score_se": ci["se"],
            "ci_lower_95": ci["lower"],
            "ci_upper_95": ci["upper"],
            "total_input_tokens": comp_input_tokens,
            "total_output_tokens": comp_output_tokens,
            "total_tokens": comp_tokens,
            "total_cost_usd": round(comp_cost, 8),
        }

        global_valid_scores.extend(valid_scores)
        global_input_tokens += comp_input_tokens
        global_output_tokens += comp_output_tokens
        global_cost += comp_cost
        global_fallback_count += fallback_count

    overall_mean = round(sum(global_valid_scores) / len(global_valid_scores), 4) if global_valid_scores else 0.0

    return {
        "per_component": per_component,
        "totals": {
            "total_input_tokens": global_input_tokens,
            "total_output_tokens": global_output_tokens,
            "total_tokens": global_input_tokens + global_output_tokens,
            "total_cost_usd": round(global_cost, 8),
            "overall_mean_score": overall_mean,
            "valid_result_count": len(global_valid_scores),
        },
        "fallback_count": global_fallback_count,
        "total_results": len(results),
    }


# ---------------------------------------------------------------------------
# Trace export (agents-cli eval grade / compare compatible)
# ---------------------------------------------------------------------------

def export_traces(
    results: List[Dict[str, Any]],
    trace_dir: Optional[Path] = None,
    run_timestamp: Optional[str] = None,
) -> Path:
    """
    Exports individual evaluation execution traces to a JSON file formatted
    to match the schema expected by `agents-cli eval grade` and `agents-cli eval compare`.

    The trace file follows the EvaluationDataset schema:
        {
          "eval_cases": [
            {
              "eval_case_id": "<component>_<idx>",
              "prompt": {"role": "user", "parts": [{"text": "<eval_input>"}]},
              "responses": [{"response": {"role": "model", "parts": [{"text": "<eval_output>"}]}}],
              "metadata": { ... per-result metadata ... }
            }
          ]
        }

    Args:
        results: Raw evaluation result records.
        trace_dir: Directory to write trace file into.
        run_timestamp: ISO timestamp string for unique file naming.

    Returns:
        Path to the written trace file.
    """
    trace_out_dir = trace_dir or DEFAULT_TRACE_DIR
    trace_out_dir = Path(trace_out_dir)
    trace_out_dir.mkdir(parents=True, exist_ok=True)

    ts = run_timestamp or datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    trace_path = trace_out_dir / f"run_{ts}.json"

    eval_cases = []
    for idx, record in enumerate(results):
        component = str(record.get("component", "unknown"))
        eval_input = str(record.get("eval_input", ""))
        eval_output = str(record.get("eval_output", ""))
        case_id = f"{component}_{idx}"

        eval_case: Dict[str, Any] = {
            "eval_case_id": case_id,
            "prompt": {
                "role": "user",
                "parts": [{"text": eval_input}],
            },
            "responses": [
                {
                    "response": {
                        "role": "model",
                        "parts": [{"text": eval_output}],
                    }
                }
            ],
            "metadata": {
                "component": component,
                "metric_name": record.get("metric_name", ""),
                "score": record.get("score"),
                "is_fallback": bool(record.get("is_fallback", False)),
                "model_name": record.get("model_name", ""),
                "input_tokens": record.get("input_tokens", 0),
                "output_tokens": record.get("output_tokens", 0),
            },
        }
        eval_cases.append(eval_case)

    trace_payload = {"eval_cases": eval_cases}
    trace_path.write_text(json.dumps(trace_payload, indent=2, ensure_ascii=False), encoding="utf-8")
    logger.info("Exported %d evaluation traces to %s", len(eval_cases), trace_path)
    return trace_path


# ---------------------------------------------------------------------------
# Report generation (Markdown + JSON)
# ---------------------------------------------------------------------------

def generate_markdown_report(
    aggregation: Dict[str, Any],
    report_dir: Optional[Path] = None,
    run_timestamp: Optional[str] = None,
    component_filter: Optional[str] = None,
) -> Path:
    """
    Generates a structured Markdown rollup report from aggregated benchmark results.

    Writes to artifacts/eval_results/summary_<timestamp>.md.

    Args:
        aggregation: Output from aggregate_benchmark_results().
        report_dir: Output directory for report files.
        run_timestamp: ISO timestamp string for unique file naming.
        component_filter: Optional component name for labelling single-component runs.

    Returns:
        Path to the written Markdown report.
    """
    report_out_dir = report_dir or DEFAULT_REPORT_DIR
    report_out_dir = Path(report_out_dir)
    report_out_dir.mkdir(parents=True, exist_ok=True)

    ts = run_timestamp or datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    md_path = report_out_dir / f"summary_{ts}.md"
    json_path = report_out_dir / f"summary_{ts}.json"

    totals = aggregation.get("totals", {})
    per_component = aggregation.get("per_component", {})
    fallback_count = aggregation.get("fallback_count", 0)
    total_results = aggregation.get("total_results", 0)

    scope_label = f" — `{component_filter}`" if component_filter else " — All Components"

    # -------------------------------------------------------------------
    # Console table (also embedded in markdown)
    # -------------------------------------------------------------------
    table_rows = []
    for comp_name, comp_stats in per_component.items():
        table_rows.append([
            comp_name,
            comp_stats["valid_records"],
            comp_stats["fallback_count"],
            f"{comp_stats['mean_score']:.4f}",
            f"[{comp_stats['ci_lower_95']:.4f}, {comp_stats['ci_upper_95']:.4f}]",
            f"{comp_stats['total_tokens']:,}",
            f"${comp_stats['total_cost_usd']:.6f}",
        ])

    table_headers = ["Component", "Valid", "Fallbacks", "Mean Score", "95% CI", "Tokens", "Cost (USD)"]
    console_table = tabulate(table_rows, headers=table_headers, tablefmt="github")

    # -------------------------------------------------------------------
    # Markdown report body
    # -------------------------------------------------------------------
    lines = [
        f"# PerspectivePrism Benchmark Evaluation Report{scope_label}",
        f"",
        f"> **Run Timestamp**: `{ts}`  ",
        f"> **Total Results**: {total_results}  ",
        f"> **Fallback Records Excluded**: {fallback_count}  ",
        f"> **Overall Mean Score (Valid Records)**: `{totals.get('overall_mean_score', 0.0):.4f}`",
        f"",
        f"---",
        f"",
        f"## Per-Component Summary",
        f"",
        console_table,
        f"",
        f"---",
        f"",
        f"## Token Usage & Cost Rollup",
        f"",
        f"| Metric | Value |",
        f"| --- | --- |",
        f"| Total Input Tokens | {totals.get('total_input_tokens', 0):,} |",
        f"| Total Output Tokens | {totals.get('total_output_tokens', 0):,} |",
        f"| Total Tokens | {totals.get('total_tokens', 0):,} |",
        f"| Total Cost (USD) | ${totals.get('total_cost_usd', 0.0):.6f} |",
        f"",
        f"---",
        f"",
        f"## Component Detail",
        f"",
    ]

    for comp_name, comp_stats in per_component.items():
        lines += [
            f"### `{comp_name}`",
            f"",
            f"- **Valid Records**: {comp_stats['valid_records']} / {comp_stats['total_records']}",
            f"- **Fallback Records**: {comp_stats['fallback_count']} (Error Rate: {comp_stats['error_rate']:.2%})",
            f"- **Mean Score**: `{comp_stats['mean_score']:.4f}` ± `{comp_stats['score_std']:.4f}` (SE: `{comp_stats['score_se']:.4f}`)",
            f"- **95% Confidence Interval**: [`{comp_stats['ci_lower_95']:.4f}`, `{comp_stats['ci_upper_95']:.4f}`]",
            f"- **Tokens**: {comp_stats['total_input_tokens']:,} in / {comp_stats['total_output_tokens']:,} out",
            f"- **Cost**: ${comp_stats['total_cost_usd']:.6f}",
            f"",
        ]

    lines += [
        f"---",
        f"",
        f"*Generated by `backend/app/evals/reporting/aggregator.py` — PerspectivePrism Evaluation Harness.*",
        f"",
    ]

    md_content = "\n".join(lines)
    md_path.write_text(md_content, encoding="utf-8")
    logger.info("Markdown benchmark report written to %s", md_path)

    # -------------------------------------------------------------------
    # JSON report
    # -------------------------------------------------------------------
    json_report = {
        "run_timestamp": ts,
        "component_filter": component_filter,
        "aggregation": aggregation,
    }
    json_path.write_text(json.dumps(json_report, indent=2, ensure_ascii=False), encoding="utf-8")
    logger.info("JSON benchmark report written to %s", json_path)

    return md_path


def print_console_summary(aggregation: Dict[str, Any]) -> None:
    """Prints a formatted tabulate summary table to stdout."""
    per_component = aggregation.get("per_component", {})
    totals = aggregation.get("totals", {})
    fallback_count = aggregation.get("fallback_count", 0)

    table_rows = []
    for comp_name, comp_stats in per_component.items():
        table_rows.append([
            comp_name,
            comp_stats["valid_records"],
            comp_stats["fallback_count"],
            f"{comp_stats['mean_score']:.4f}",
            f"[{comp_stats['ci_lower_95']:.4f}, {comp_stats['ci_upper_95']:.4f}]",
            f"{comp_stats['total_tokens']:,}",
            f"${comp_stats['total_cost_usd']:.6f}",
        ])

    table_headers = ["Component", "Valid", "Fallbacks", "Mean Score", "95% CI", "Tokens", "Cost (USD)"]
    print(tabulate(table_rows, headers=table_headers, tablefmt="simple"))
    print()
    print(
        f"  Overall Mean Score : {totals.get('overall_mean_score', 0.0):.4f}"
        f" | Total Cost: ${totals.get('total_cost_usd', 0.0):.6f}"
        f" | Fallbacks: {fallback_count}"
        f" | Total Tokens: {totals.get('total_tokens', 0):,}"
    )
