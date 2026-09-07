"""
Dual-Mode Benchmark CLI & Google agents-cli Orchestration Entrypoint (T6.2, FR21, FR22, FR23, US4).

Usage:
    python -m app.evals.cli --component [pre_classifier|extractor|perspective|bias|alethiology|all]
    python -m app.evals.cli --adk-eval [--config path/to/eval_config.yaml]

Modes:
    --component: Execute native component benchmarks using quantitative runners & ADK judge agents.
    --adk-eval:  Delegate to `agents-cli eval run` using eval_config.yaml. Falls back gracefully
                 to native component evaluation if agents-cli binary is absent from PATH (FR22).
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import os
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

# Ensure the backend package root is importable when run as __main__
_BACKEND_DIR = Path(__file__).resolve().parent.parent.parent.parent
if str(_BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(_BACKEND_DIR))

from app.evals.reporting.aggregator import (
    aggregate_benchmark_results,
    export_traces,
    generate_markdown_report,
    print_console_summary,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%SZ",
)
logger = logging.getLogger("app.evals.cli")

# Canonical component names
VALID_COMPONENTS = {"pre_classifier", "extractor", "perspective", "bias", "alethiology", "all"}

DEFAULT_EVAL_CONFIG = Path(__file__).resolve().parent.parent.parent / "tests" / "eval" / "eval_config.yaml"
DEFAULT_TRACE_DIR = Path("artifacts/traces")
DEFAULT_REPORT_DIR = Path("artifacts/eval_results")


# ---------------------------------------------------------------------------
# Native component runners
# ---------------------------------------------------------------------------

async def _run_pre_classifier_component(
    settings: Any,
    limit: Optional[int],
) -> List[Dict[str, Any]]:
    """
    Runs the native PreClassifier quantitative evaluation runner.

    NOTE: This performs live inference against Vertex AI. In offline CI (NFR3),
    credentials are unavailable, so any inference error is caught here and
    recorded as is_fallback=True without raising, to preserve benchmark integrity.
    """
    from app.evals.runners.quantitative_runner import run_pre_classifier_eval
    try:
        summary = await run_pre_classifier_eval(limit=limit, settings=settings)
        return [
            {
                "component": "pre_classifier",
                "metric_name": "pre_classifier_f1",
                "score": summary.get("f1_score", 0.0),
                "is_fallback": False,
                "model_name": "gemini-3.8-flash",
                "input_tokens": summary.get("total_input_tokens", 0),
                "output_tokens": summary.get("total_output_tokens", 0),
                "eval_input": "pre_classifier_golden.json",
                "eval_output": json.dumps(summary),
            }
        ]
    except Exception as exc:
        logger.warning(
            "PreClassifier live inference failed (%s). "
            "Recording is_fallback=True — no billable request was completed (NFR3).",
            exc,
        )
        return [
            {
                "component": "pre_classifier",
                "metric_name": "pre_classifier_f1",
                "score": 0.0,
                "is_fallback": True,
                "model_name": "gemini-3.8-flash",
                "input_tokens": 0,
                "output_tokens": 0,
                "eval_input": "pre_classifier_golden.json",
                "eval_output": f"Offline CI fallback: {str(exc)[:200]}",
            }
        ]



def _build_mock_extractor_results(limit: Optional[int]) -> List[Dict[str, Any]]:
    """
    Provides offline claim IoU baseline evaluation using golden fixture data.

    IMPORTANT: This function performs a self-consistency check (comparing golden claims
    against themselves) to verify the IoU computation pipeline is operational. Since
    the actual ClaimExtractor agent never runs, ALL records are marked is_fallback=True
    to correctly signal that real extractor performance was not measured. The self-match
    baseline score (IoU=1.0) is excluded from aggregated mean scores by the aggregator's
    fallback isolation logic (FR16).

    Live extractor benchmarking requires --adk-eval with a valid Vertex AI session.
    """
    from app.evals.runners.quantitative_runner import run_claim_timestamp_iou_eval
    try:
        dataset_path = Path(__file__).resolve().parent / "datasets" / "claim_extractor_golden.json"
        if not dataset_path.exists():
            logger.warning("Claim extractor golden dataset not found at %s; skipping.", dataset_path)
            return []

        with open(dataset_path, encoding="utf-8") as f:
            raw = json.load(f)
        cases = raw if isinstance(raw, list) else raw.get("test_cases", [])
        if limit:
            cases = cases[:limit]

        results = []
        for case in cases:
            gold_claims = case.get("gold_claims", [])
            # Self-consistency baseline: verifies IoU pipeline is intact.
            # is_fallback=True because the real extractor agent did not run.
            iou_result = run_claim_timestamp_iou_eval(gold_claims, gold_claims)
            results.append({
                "component": "extractor",
                "metric_name": "timestamp_iou",
                "score": iou_result.get("mean_iou", 0.0),
                "is_fallback": True,  # Real extractor did not run; self-match baseline only
                "model_name": "gemini-3.8-flash",
                "input_tokens": 0,
                "output_tokens": 0,
                "eval_input": case.get("video_id", "unknown"),
                "eval_output": json.dumps(iou_result),
            })
        return results
    except Exception as exc:
        logger.warning("Extractor offline evaluation failed (%s); recording as fallback.", exc)
        return [
            {
                "component": "extractor",
                "metric_name": "timestamp_iou",
                "score": 0.0,
                "is_fallback": True,
                "model_name": "gemini-3.8-flash",
                "input_tokens": 0,
                "output_tokens": 0,
                "eval_input": "claim_extractor_golden.json",
                "eval_output": f"Fallback: {str(exc)[:200]}",
            }
        ]


def _build_offline_results_for_component(component: str, limit: Optional[int]) -> List[Dict[str, Any]]:
    """
    Returns synthetic offline evaluation records for components that require live ADK judge calls.
    Used in offline-only CI mode where network calls are prohibited (NFR3).
    Each record maps to a golden fixture entry with placeholder judge scores.
    """
    dataset_map = {
        "perspective": ("datasets/perspective_stance_golden.json", "perspective_faithfulness", "perspective"),
        "bias": ("datasets/bias_deception_golden.json", "deception_calibration", "bias"),
        "alethiology": ("datasets/alethiology_golden.json", "alethiology_neutrality", "alethiology"),
    }

    if component not in dataset_map:
        return []

    dataset_rel, metric_name, comp_name = dataset_map[component]
    dataset_path = Path(__file__).resolve().parent / dataset_rel

    if not dataset_path.exists():
        logger.warning("Golden dataset for %s not found at %s; skipping.", component, dataset_path)
        return []

    try:
        with open(dataset_path, encoding="utf-8") as f:
            raw = json.load(f)
        cases = raw if isinstance(raw, list) else raw.get("test_cases", [])
        if limit:
            cases = cases[:limit]

        results = []
        for case in cases:
            results.append({
                "component": comp_name,
                "metric_name": metric_name,
                # Offline mode: score is 0.0 with is_fallback=True to indicate live judge was not run
                "score": 0.0,
                "is_fallback": True,
                "model_name": "gemini-3.8-flash",
                "input_tokens": 0,
                "output_tokens": 0,
                "eval_input": str(case.get("claim_text", case.get("claim", ""))),
                "eval_output": "offline_placeholder",
            })
        return results
    except Exception as exc:
        logger.warning("Offline evaluation setup failed for %s (%s).", component, exc)
        return []


async def _run_native_components(
    component: str,
    limit: Optional[int],
    trace_dir: Path,
    report_dir: Path,
    run_timestamp: str,
) -> int:
    """
    Executes native component evaluation runners and generates aggregated reports.
    Returns exit code (0 = success).
    """
    from app.core.config import settings

    results: List[Dict[str, Any]] = []

    components_to_run = (
        {"pre_classifier", "extractor", "perspective", "bias", "alethiology"}
        if component == "all"
        else {component}
    )

    if "pre_classifier" in components_to_run:
        logger.info("Running native PreClassifier evaluation...")
        try:
            pc_results = await _run_pre_classifier_component(settings, limit)
            results.extend(pc_results)
            logger.info("PreClassifier evaluation complete: %d records.", len(pc_results))
        except Exception as exc:
            logger.warning("PreClassifier evaluation failed (%s); recording fallback.", exc)
            results.append({
                "component": "pre_classifier",
                "metric_name": "pre_classifier_f1",
                "score": 0.0,
                "is_fallback": True,
                "model_name": "gemini-3.8-flash",
                "input_tokens": 0,
                "output_tokens": 0,
                "eval_input": "pre_classifier_golden.json",
                "eval_output": f"Fallback: {str(exc)[:200]}",
            })

    if "extractor" in components_to_run:
        logger.info("Running native ClaimExtractor IoU evaluation...")
        ext_results = _build_mock_extractor_results(limit)
        results.extend(ext_results)
        logger.info("ClaimExtractor evaluation complete: %d records.", len(ext_results))

    for offline_comp in ("perspective", "bias", "alethiology"):
        if offline_comp in components_to_run:
            logger.info(
                "Building offline golden fixture records for %s (live ADK judge calls require --adk-eval)...",
                offline_comp,
            )
            offline_results = _build_offline_results_for_component(offline_comp, limit)
            results.extend(offline_results)
            logger.info("%s offline records: %d.", offline_comp, len(offline_results))

    if not results:
        logger.warning("No evaluation results produced. Check golden dataset availability.")
        return 1

    # Aggregate and report
    aggregation = aggregate_benchmark_results(results)

    print()
    print("=" * 72)
    print(f"  PerspectivePrism Benchmark — {component.upper()} — {run_timestamp}")
    print("=" * 72)
    print_console_summary(aggregation)
    print()

    trace_path = export_traces(results, trace_dir=trace_dir, run_timestamp=run_timestamp)
    report_path = generate_markdown_report(
        aggregation,
        report_dir=report_dir,
        run_timestamp=run_timestamp,
        component_filter=component,
    )

    logger.info("Trace artifact: %s", trace_path)
    logger.info("Markdown report: %s", report_path)
    return 0



# ---------------------------------------------------------------------------
# agents-cli delegation
# ---------------------------------------------------------------------------

def _emit_agents_cli_success_artifacts(
    trace_dir: Path,
    report_dir: Path,
    run_timestamp: str,
    component: str,
) -> None:
    """
    Generates a delegation receipt trace and report when `agents-cli eval run`
    completes successfully (FR21).

    agents-cli writes its own native quality scores to its own output paths.
    This function produces:
      - An empty EvaluationDataset trace JSON (zero eval_cases) so that
        agents-cli eval grade / compare tools receive a structurally valid but
        empty file that does NOT inject fabricated quality scores.
      - A Markdown + JSON delegation receipt report documenting that evaluation
        was delegated and directing consumers to agents-cli's native output.

    This approach satisfies FR21 (artifacts always generated) without fabricating
    quality data that could mislead grade/compare pipelines or programmatic consumers.
    """
    trace_out_dir = Path(trace_dir)
    trace_out_dir.mkdir(parents=True, exist_ok=True)
    report_out_dir = Path(report_dir)
    report_out_dir.mkdir(parents=True, exist_ok=True)

    # Empty EvaluationDataset — structurally valid, zero eval_cases (no fabricated scores)
    trace_payload: Dict[str, Any] = {"eval_cases": []}
    trace_path = trace_out_dir / f"run_{run_timestamp}.json"
    trace_path.write_text(json.dumps(trace_payload, indent=2), encoding="utf-8")

    # Delegation receipt Markdown report
    md_lines = [
        f"# PerspectivePrism Benchmark — Delegation Receipt",
        f"",
        f"> **Run Timestamp**: `{run_timestamp}`",
        f"> **Component**: `{component}`",
        f"> **Mode**: `agents-cli eval run` (delegated)",
        f"",
        f"---",
        f"",
        f"## Evaluation Delegated to agents-cli",
        f"",
        f"This report is a delegation receipt only. Quality scores were computed by",
        f"`agents-cli eval run` and are available in agents-cli's own output files.",
        f"",
        f"This trace file (`run_{run_timestamp}.json`) contains zero `eval_cases` to",
        f"prevent fabricated scores from entering `agents-cli eval grade` or",
        f"`agents-cli eval compare` pipelines.",
        f"",
        f"---",
        f"*Generated by `backend/app/evals/reporting/cli.py` — PerspectivePrism Evaluation Harness.*",
    ]
    md_path = report_out_dir / f"summary_{run_timestamp}.md"
    md_path.write_text("\n".join(md_lines), encoding="utf-8")

    # JSON receipt
    json_receipt = {
        "run_timestamp": run_timestamp,
        "component_filter": component,
        "delegation_mode": "agents-cli",
        "eval_cases_count": 0,
        "note": (
            "Delegation receipt only. Quality scores are in agents-cli native output. "
            "No synthetic score records emitted to prevent grade/compare pipeline contamination."
        ),
    }
    json_path = report_out_dir / f"summary_{run_timestamp}.json"
    json_path.write_text(json.dumps(json_receipt, indent=2), encoding="utf-8")

    logger.info(
        "Delegation receipt artifacts emitted (empty trace, no fabricated scores) — "
        "trace: %s, report: %s. Quality scores are in agents-cli native output.",
        trace_path,
        md_path,
    )




def _run_adk_eval(
    config_path: Path,
    trace_dir: Path,
    report_dir: Path,
    run_timestamp: str,
    component: str,
    limit: Optional[int],
) -> int:
    """
    Delegates evaluation to `agents-cli eval run`. Falls back to native execution
    gracefully if the binary is absent from PATH (FR22).
    Returns exit code.
    """
    agents_cli_bin = shutil.which("agents-cli")

    if not agents_cli_bin:
        logger.warning(
            "⚠️  PURE-PYTHON FALLBACK: 'agents-cli' binary not found in PATH. "
            "Seamlessly routing to native component evaluation runner. "
            "Install with: uv tool install google-agents-cli"
        )
        return asyncio.run(
            _run_native_components(
                component=component,
                limit=limit,
                trace_dir=trace_dir,
                report_dir=report_dir,
                run_timestamp=run_timestamp,
            )
        )

    if not config_path.exists():
        logger.error("agents-cli eval config not found at %s", config_path)
        return 1

    cmd = [
        agents_cli_bin,
        "eval",
        "run",
        "--config",
        str(config_path),
    ]

    logger.info("Delegating to: %s", " ".join(cmd))

    try:
        proc = subprocess.run(cmd, check=False)
        if proc.returncode != 0:
            logger.error("agents-cli eval run exited with code %d; falling back to native runner.", proc.returncode)
            return asyncio.run(
                _run_native_components(
                    component=component,
                    limit=limit,
                    trace_dir=trace_dir,
                    report_dir=report_dir,
                    run_timestamp=run_timestamp,
                )
            )
        # agents-cli succeeded — emit our unified trace + report artifacts (FR21).
        # agents-cli writes its own output; we additionally produce a structured
        # summary so the caller always receives artifacts at the requested paths.
        logger.info("agents-cli eval run succeeded. Generating unified artifact reports...")
        _emit_agents_cli_success_artifacts(
            trace_dir=trace_dir,
            report_dir=report_dir,
            run_timestamp=run_timestamp,
            component=component,
        )
        return 0
    except Exception as exc:
        logger.error("agents-cli subprocess execution failed (%s); falling back to native runner.", exc)
        return asyncio.run(
            _run_native_components(
                component=component,
                limit=limit,
                trace_dir=trace_dir,
                report_dir=report_dir,
                run_timestamp=run_timestamp,
            )
        )


# ---------------------------------------------------------------------------
# CLI entrypoint
# ---------------------------------------------------------------------------

def build_argument_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="python -m app.evals.cli",
        description=(
            "PerspectivePrism Dual-Mode Benchmark CLI. "
            "Runs native component evaluations or delegates to agents-cli platform suite."
        ),
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )

    parser.add_argument(
        "--component",
        choices=sorted(VALID_COMPONENTS),
        default="all",
        help="Pipeline component to evaluate (default: all).",
    )
    parser.add_argument(
        "--adk-eval",
        action="store_true",
        help=(
            "Delegate evaluation to `agents-cli eval run` using eval_config.yaml. "
            "Falls back to native runner if agents-cli is not in PATH."
        ),
    )
    parser.add_argument(
        "--config",
        type=Path,
        default=DEFAULT_EVAL_CONFIG,
        help=f"Path to eval_config.yaml for agents-cli (default: {DEFAULT_EVAL_CONFIG}).",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Maximum number of test cases per dataset (useful for smoke testing).",
    )
    parser.add_argument(
        "--trace-dir",
        type=Path,
        default=DEFAULT_TRACE_DIR,
        help=f"Output directory for trace artifacts (default: {DEFAULT_TRACE_DIR}).",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=DEFAULT_REPORT_DIR,
        help=f"Output directory for report artifacts (default: {DEFAULT_REPORT_DIR}).",
    )

    return parser


def main(argv: Optional[List[str]] = None) -> int:
    parser = build_argument_parser()
    args = parser.parse_args(argv)

    run_timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")

    if args.adk_eval:
        return _run_adk_eval(
            config_path=args.config,
            trace_dir=args.trace_dir,
            report_dir=args.output_dir,
            run_timestamp=run_timestamp,
            component=args.component,
            limit=args.limit,
        )
    else:
        return asyncio.run(
            _run_native_components(
                component=args.component,
                limit=args.limit,
                trace_dir=args.trace_dir,
                report_dir=args.output_dir,
                run_timestamp=run_timestamp,
            )
        )


if __name__ == "__main__":
    sys.exit(main())
