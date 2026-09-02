"""
Reporting, baseline comparison, and metrics generation for prompt-injection red-team evaluations.

Adheres strictly to FR-4.1..4.4, NFR-4 (confidentiality: zero raw payload text in reports),
and AC-1, AC-5.
"""

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Union
from pydantic import BaseModel, ConfigDict, Field

from redteam.corpus import PayloadEntry, Stage, load_corpus
from redteam.probe import ProbeResult, ProbeStatus, run_probe
from redteam.live_probe import LiveProbeResult
from redteam.judge import JudgeResult, InjectionVerdict, JudgeTier


class RedTeamEntrySummary(BaseModel):
    model_config = ConfigDict(extra="allow", use_enum_values=True)

    payload_id: str = Field(..., description="Corpus-relative payload ID (no raw text)")
    category: str = Field(..., description="Taxonomy category (e.g., PI-DIR, PI-DLM, LEG)")
    stage: Stage = Field(..., description="Injection stage (S1, S2, S3)")
    probe_status: ProbeStatus = Field(..., description="Sanitization outcome: blocked, bypassed, or error")
    delimiter_forgery_survived: bool = Field(default=False, description="Whether forged delimiter survived")
    live_executed: bool = Field(default=False, description="Whether an LLM call was executed in live mode")
    live_injection_success: Optional[bool] = Field(default=None, description="Whether injection succeeded in live mode")
    judge_deciding_tier: Optional[str] = Field(default=None, description="Deciding judge tier: canary, heuristic, llm_judge, none")
    error: Optional[str] = Field(default=None, description="Error message if blocked or failed")


class CategoryMetrics(BaseModel):
    model_config = ConfigDict(extra="allow")

    total: int = Field(default=0, description="Total payloads in category")
    blocked: int = Field(default=0, description="Count of blocked payloads")
    bypassed: int = Field(default=0, description="Count of bypassed payloads")
    error: int = Field(default=0, description="Count of error payloads")
    block_rate: float = Field(default=0.0, description="Percentage of payloads blocked (0.0 - 100.0)")
    bypass_rate: float = Field(default=0.0, description="Percentage of payloads bypassed (0.0 - 100.0)")
    delimiter_forgery_count: int = Field(default=0, description="Count of payloads with delimiter forgery survival")
    live_success_count: int = Field(default=0, description="Count of payloads with confirmed live injection success")


class DiffItem(BaseModel):
    model_config = ConfigDict(extra="allow")

    payload_id: str = Field(..., description="Payload ID")
    category: str = Field(..., description="Taxonomy category")
    baseline_status: str = Field(..., description="Previous baseline status")
    current_status: str = Field(..., description="Current evaluation status")
    change_type: str = Field(..., description="Classification: regression, improvement, new, unchanged")
    details: Optional[str] = Field(default=None, description="Context regarding the change")


class BaselineDiff(BaseModel):
    model_config = ConfigDict(extra="allow")

    has_regressions: bool = Field(default=False, description="True if any regression occurred relative to baseline")
    regressions: List[DiffItem] = Field(default_factory=list, description="List of regressed payloads")
    improvements: List[DiffItem] = Field(default_factory=list, description="List of improved/newly blocked payloads")
    new_payloads: List[DiffItem] = Field(default_factory=list, description="List of newly added payloads")
    unchanged: List[DiffItem] = Field(default_factory=list, description="List of unchanged payloads")
    summary: str = Field(default="", description="Human-readable diff summary")


class RedTeamReport(BaseModel):
    model_config = ConfigDict(extra="allow", use_enum_values=True)

    timestamp: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat(), description="ISO 8601 UTC timestamp")
    mode: str = Field(default="deterministic", description="Execution mode: deterministic or live")
    corpus_version: str = Field(default="1.0.0", description="Corpus version")
    total_payloads: int = Field(default=0, description="Total payloads evaluated")
    category_metrics: Dict[str, CategoryMetrics] = Field(default_factory=dict, description="Metrics per taxonomy category")
    payload_results: Dict[str, RedTeamEntrySummary] = Field(default_factory=dict, description="Summary result per payload ID (no raw text)")
    baseline_diff: Optional[BaselineDiff] = Field(default=None, description="Diff against committed baseline if provided")
    metadata: Dict[str, Any] = Field(default_factory=dict, description="Additional metadata (models, budget, etc.)")


def get_category_from_id(payload_id: str) -> str:
    """Extracts taxonomy category prefix from payload ID (e.g. 'PI-DIR-001' -> 'PI-DIR', 'LEG-001' -> 'LEG')."""
    if "-" in payload_id:
        return payload_id.rsplit("-", 1)[0]
    return "UNKNOWN"


def diff_against_baseline(
    current_payload_results: Dict[str, RedTeamEntrySummary],
    baseline_data: Dict[str, Any],
) -> BaselineDiff:
    """
    Diffs current evaluation results against a baseline dataset.
    
    Identifies:
    - Regressions: Payload previously blocked is now bypassed/error, or previously benign now has live success.
    - Improvements: Payload previously bypassed is now blocked, or delimiter forgery no longer survives.
    - New: Payload not present in baseline.
    """
    baseline_results = baseline_data.get("payload_results", {})
    regressions: List[DiffItem] = []
    improvements: List[DiffItem] = []
    new_payloads: List[DiffItem] = []
    unchanged: List[DiffItem] = []

    for payload_id, current in current_payload_results.items():
        category = current.category
        if payload_id not in baseline_results:
            new_payloads.append(
                DiffItem(
                    payload_id=payload_id,
                    category=category,
                    baseline_status="none",
                    current_status=str(current.probe_status),
                    change_type="new",
                    details="Payload not present in previous baseline",
                )
            )
            continue

        base_raw = baseline_results[payload_id]
        base_status = base_raw.get("probe_status") if isinstance(base_raw, dict) else getattr(base_raw, "probe_status", None)
        base_forgery = base_raw.get("delimiter_forgery_survived", False) if isinstance(base_raw, dict) else getattr(base_raw, "delimiter_forgery_survived", False)
        base_live_success = base_raw.get("live_injection_success", False) if isinstance(base_raw, dict) else getattr(base_raw, "live_injection_success", False)

        curr_status = str(current.probe_status)
        curr_forgery = current.delimiter_forgery_survived
        curr_live_success = bool(current.live_injection_success)

        is_regression = False
        is_improvement = False
        details = []

        # Check status regression / improvement
        if base_status == ProbeStatus.BLOCKED.value and curr_status != ProbeStatus.BLOCKED.value:
            is_regression = True
            details.append(f"Sanitizer regression: previously {base_status}, now {curr_status}")
        elif base_status != ProbeStatus.BLOCKED.value and curr_status == ProbeStatus.BLOCKED.value:
            is_improvement = True
            details.append(f"Sanitizer improvement: previously {base_status}, now {curr_status}")

        # Check delimiter forgery regression / improvement
        if not base_forgery and curr_forgery:
            is_regression = True
            details.append("Delimiter forgery now survives in prompt")
        elif base_forgery and not curr_forgery:
            is_improvement = True
            details.append("Delimiter forgery neutralized (no longer escapes)")

        # Check live injection regression / improvement
        if not base_live_success and curr_live_success:
            is_regression = True
            details.append("Live injection newly succeeded")
        elif base_live_success and not curr_live_success and current.live_executed:
            is_improvement = True
            details.append("Live injection newly defended")

        item = DiffItem(
            payload_id=payload_id,
            category=category,
            baseline_status=str(base_status),
            current_status=curr_status,
            change_type="regression" if is_regression else ("improvement" if is_improvement else "unchanged"),
            details="; ".join(details) if details else "No change in status",
        )

        if is_regression:
            regressions.append(item)
        elif is_improvement:
            improvements.append(item)
        else:
            unchanged.append(item)

    has_regressions = len(regressions) > 0
    summary = f"{len(regressions)} regressions, {len(improvements)} improvements, {len(new_payloads)} new payloads, {len(unchanged)} unchanged."

    return BaselineDiff(
        has_regressions=has_regressions,
        regressions=regressions,
        improvements=improvements,
        new_payloads=new_payloads,
        unchanged=unchanged,
        summary=summary,
    )


def build_report(
    results: Union[List[ProbeResult], List[LiveProbeResult]],
    corpus: List[PayloadEntry],
    baseline: Optional[Dict[str, Any]] = None,
    metadata: Optional[Dict[str, Any]] = None,
) -> RedTeamReport:
    """
    Constructs a RedTeamReport from deterministic ProbeResults or LiveProbeResults and corpus entries.
    
    Guarantees NFR-4 confidentiality: raw payload text is omitted entirely.
    """
    corpus_map = {entry.id: entry for entry in corpus}
    payload_results: Dict[str, RedTeamEntrySummary] = {}
    is_live = False

    for res in results:
        payload_id = res.payload_id
        entry = corpus_map.get(payload_id)
        stage = res.stage if hasattr(res, "stage") else (entry.stage if entry else Stage.S1)
        category = get_category_from_id(payload_id)

        if isinstance(res, LiveProbeResult):
            is_live = True
            live_executed = res.executed
            live_injection_success = False
            judge_deciding_tier = None

            if res.judge_result:
                jr = res.judge_result
                if isinstance(jr, JudgeResult):
                    live_injection_success = (jr.verdict == InjectionVerdict.SUCCESS)
                    judge_deciding_tier = jr.deciding_tier.value if hasattr(jr.deciding_tier, "value") else str(jr.deciding_tier)
                elif isinstance(jr, dict):
                    live_injection_success = (jr.get("verdict") == "success" or jr.get("verdict") == InjectionVerdict.SUCCESS.value)
                    tier = jr.get("deciding_tier")
                    judge_deciding_tier = tier.value if hasattr(tier, "value") else str(tier) if tier else None

            summary_entry = RedTeamEntrySummary(
                payload_id=payload_id,
                category=category,
                stage=stage,
                probe_status=res.probe_status,
                delimiter_forgery_survived=False,
                live_executed=live_executed,
                live_injection_success=live_injection_success if live_executed else None,
                judge_deciding_tier=judge_deciding_tier,
                error=res.error,
            )
        else:
            # Deterministic ProbeResult
            summary_entry = RedTeamEntrySummary(
                payload_id=payload_id,
                category=category,
                stage=stage,
                probe_status=res.status,
                delimiter_forgery_survived=res.delimiter_forgery_survived,
                live_executed=False,
                live_injection_success=None,
                judge_deciding_tier=None,
                error=res.error_message,
            )

        payload_results[payload_id] = summary_entry

    # Calculate per-category metrics
    category_metrics: Dict[str, CategoryMetrics] = {}
    categories = sorted(list(set(get_category_from_id(pid) for pid in payload_results.keys())))

    for cat in categories:
        cat_entries = [e for e in payload_results.values() if e.category == cat]
        total = len(cat_entries)
        blocked = sum(1 for e in cat_entries if e.probe_status == ProbeStatus.BLOCKED)
        bypassed = sum(1 for e in cat_entries if e.probe_status == ProbeStatus.BYPASSED)
        error = sum(1 for e in cat_entries if e.probe_status == ProbeStatus.ERROR)
        forgery = sum(1 for e in cat_entries if e.delimiter_forgery_survived)
        live_success = sum(1 for e in cat_entries if e.live_injection_success is True)

        block_rate = round((blocked / total) * 100.0, 2) if total > 0 else 0.0
        bypass_rate = round((bypassed / total) * 100.0, 2) if total > 0 else 0.0

        category_metrics[cat] = CategoryMetrics(
            total=total,
            blocked=blocked,
            bypassed=bypassed,
            error=error,
            block_rate=block_rate,
            bypass_rate=bypass_rate,
            delimiter_forgery_count=forgery,
            live_success_count=live_success,
        )

    baseline_diff = None
    if baseline:
        baseline_diff = diff_against_baseline(payload_results, baseline)

    return RedTeamReport(
        timestamp=datetime.now(timezone.utc).isoformat(),
        mode="live" if is_live else "deterministic",
        corpus_version="1.0.0",
        total_payloads=len(payload_results),
        category_metrics=category_metrics,
        payload_results=payload_results,
        baseline_diff=baseline_diff,
        metadata=metadata or {},
    )


def generate_markdown_summary(report: RedTeamReport) -> str:
    """Generates an executive Markdown summary table and metrics report from a RedTeamReport."""
    lines = []
    lines.append(f"# Prompt-Injection Red-Team Evaluation Report ({report.mode.upper()})")
    lines.append("")
    lines.append(f"- **Timestamp:** `{report.timestamp}`")
    lines.append(f"- **Mode:** `{report.mode}`")
    lines.append(f"- **Corpus Version:** `{report.corpus_version}`")
    lines.append(f"- **Total Payloads Evaluated:** `{report.total_payloads}`")
    lines.append("")

    lines.append("## Category Breakdown")
    lines.append("")
    if report.mode == "live":
        lines.append("| Category | Total | Blocked (Sanitizer) | Bypassed (Sanitizer) | Live Injection Success | Block Rate |")
        lines.append("|---|---|---|---|---|---|")
        for cat, m in sorted(report.category_metrics.items()):
            lines.append(f"| **{cat}** | {m.total} | {m.blocked} | {m.bypassed} | {m.live_success_count} | {m.block_rate:.1f}% |")
    else:
        lines.append("| Category | Total | Blocked | Bypassed | Forgery Survived | Block Rate | Bypass Rate |")
        lines.append("|---|---|---|---|---|---|---|")
        for cat, m in sorted(report.category_metrics.items()):
            lines.append(f"| **{cat}** | {m.total} | {m.blocked} | {m.bypassed} | {m.delimiter_forgery_count} | {m.block_rate:.1f}% | {m.bypass_rate:.1f}% |")

    lines.append("")

    if report.baseline_diff:
        diff = report.baseline_diff
        lines.append("## Baseline Comparison")
        lines.append("")
        status_symbol = "❌ REGRESSIONS DETECTED" if diff.has_regressions else "✅ CLEAN (No Regressions)"
        lines.append(f"**Gate Status:** {status_symbol}")
        lines.append(f"- {diff.summary}")
        lines.append("")

        if diff.regressions:
            lines.append("### ⚠️ Regressions")
            for reg in diff.regressions:
                lines.append(f"- **{reg.payload_id}** ({reg.category}): {reg.details} (baseline: `{reg.baseline_status}`, current: `{reg.current_status}`)")
            lines.append("")

        if diff.improvements:
            lines.append("### 🛡️ Improvements")
            for imp in diff.improvements:
                lines.append(f"- **{imp.payload_id}** ({imp.category}): {imp.details}")
            lines.append("")

    return "\n".join(lines)


def save_report(report: RedTeamReport, output_path: Union[str, Path]) -> None:
    """Saves report to JSON file."""
    p = Path(output_path)
    p.parent.mkdir(parents=True, exist_ok=True)
    with open(p, "w", encoding="utf-8") as f:
        f.write(report.model_dump_json(indent=2))


def save_baseline(report: RedTeamReport, baseline_path: Union[str, Path]) -> None:
    """
    Explicitly saves or updates the baseline file from a RedTeamReport.
    
    FR-4.4: Only called on explicit user/CLI demand.
    """
    p = Path(baseline_path)
    p.parent.mkdir(parents=True, exist_ok=True)
    
    # Baseline format stores the report structure
    with open(p, "w", encoding="utf-8") as f:
        f.write(report.model_dump_json(indent=2))


def load_baseline(baseline_path: Union[str, Path]) -> Dict[str, Any]:
    """Loads baseline data from JSON file."""
    p = Path(baseline_path)
    if not p.exists():
        return {}
    with open(p, "r", encoding="utf-8") as f:
        return json.load(f)


def main():
    parser = argparse.ArgumentParser(description="Generate prompt-injection red-team reports and update baseline.")
    parser.add_argument("--report-file", default="redteam-report.json", help="Path to write JSON report")
    parser.add_argument("--markdown-file", default="redteam-report.md", help="Path to write Markdown summary")
    parser.add_argument("--baseline-file", default="redteam-baseline.json", help="Path to baseline file")
    parser.add_argument("--update-baseline", action="store_true", help="Explicitly update the baseline file with current results")
    parser.add_argument("--check-regression", action="store_true", help="Exit with non-zero code if regressions against baseline are detected")
    
    args = parser.parse_args()

    corpus = load_corpus()
    results = run_probe(corpus)

    baseline_data = load_baseline(args.baseline_file) if Path(args.baseline_file).exists() else None
    report = build_report(results=results, corpus=corpus, baseline=baseline_data)

    save_report(report, args.report_file)
    md_summary = generate_markdown_summary(report)
    with open(args.markdown_file, "w", encoding="utf-8") as f:
        f.write(md_summary)

    print(f"Report written to {args.report_file} and {args.markdown_file}")

    if args.update_baseline:
        save_baseline(report, args.baseline_file)
        print(f"Baseline updated at {args.baseline_file}")

    if args.check_regression and report.baseline_diff and report.baseline_diff.has_regressions:
        print(f"ERROR: {len(report.baseline_diff.regressions)} regressions detected against baseline!")
        sys.exit(1)


if __name__ == "__main__":
    main()
