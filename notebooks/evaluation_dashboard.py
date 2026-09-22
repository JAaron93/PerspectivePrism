import marimo

__generated_with = "0.24.2"
app = marimo.App(
    width="full",
    app_title="Perspective Prism - Component Evaluation & Benchmarking Dashboard",
)


# ---------------------------------------------------------------------------
# CELL 1 — Imports
# ---------------------------------------------------------------------------

@app.cell
def __():
    import json
    import os
    from datetime import datetime
    from pathlib import Path

    import altair as alt
    import marimo as mo

    return Path, alt, datetime, json, mo, os


# ---------------------------------------------------------------------------
# CELL 2 — Dashboard Header
# ---------------------------------------------------------------------------

@app.cell
def __(mo):
    mo.md(
        "**Dashboard Header** — Renders the project title, technology stack badges, "
        "and a Mermaid flowchart showing all five analysis pipeline stages and the eval quality flywheel."
    )


@app.cell
def __(mo):
    header = mo.md(
        r"""
        # 🔮 Perspective Prism: Component Evaluation & Benchmarking Dashboard

        [![Google ADK 2.0](https://img.shields.io/badge/Framework-Google%20ADK%202.0-4285F4?logo=google)](https://github.com/google/adk)
        [![Gemini 3.8 Flash](https://img.shields.io/badge/Model-Gemini%203.8%20Flash-34A853?logo=googlegemini)](https://deepmind.google/technologies/gemini/)
        [![GCP Vertex AI](https://img.shields.io/badge/Runtime-GCP%20Vertex%20AI%20Mode-EA4335?logo=googlecloud)](https://cloud.google.com/vertex-ai)
        [![agents-cli](https://img.shields.io/badge/Eval%20Tooling-agents--cli%20v1.0.0-FBBC05)](https://github.com/google)
        [![marimo](https://img.shields.io/badge/Notebook-marimo%20v0.24.2-10B981)](https://marimo.io)

        ---

        ### 🎯 Executive Overview & Pipeline Architecture
        **Perspective Prism** analyzes YouTube video transcripts for factual assertions, multi-perspective stance, framing bias, and epistemic truth profiling:
        1. **PreClassifier Service**: Evaluates transcript domain suitability and triggers fast-path routing.
        2. **Claim Extractor Agent**: Extracts verifiable factual claims with exact video timestamps via Gemini Structured Outputs.
        3. **Perspective & Stance Analysis**: Gathers frozen search snippets across 4 distinct viewpoints (*Scientific*, *Journalistic*, *Partisan Left*, *Partisan Right*).
        4. **Bias & Deception Service**: Quantifies framing manipulation, sourcing omissions, sensationalism, and computes deception severity (0–10).
        5. **Alethiology Service**: Assesses claim veracity across 6 classical philosophical truth theories (*Correspondence (Empirical)*, *Coherence (Systemic Narrative)*, *Pragmatic (Practical Utility)*, *Perspectivism (Lived Experience)*, *Consensus (Institutional Agreement)*, *Deflationary (Rhetorical Endorsement)*).

        ```mermaid
        flowchart LR
            subgraph Ingestion["1. Ingestion & Screening"]
                YT["YouTube Video Transcript"] --> PreClass["PreClassifier Service\n(Fast-Path Filter)"]
                PreClass -->|Analysable| Extractor["ClaimExtractor Agent\n(ADK 2.0 Structured)"]
            end
            subgraph MultiPerspective["2. Multi-Perspective Stance Engine"]
                Extractor --> Search["4-Perspective Search Engine"]
                Search --> Sci["Scientific"]
                Search --> Jour["Journalistic"]
                Search --> Left["Partisan Left"]
                Search --> Right["Partisan Right"]
            end
            subgraph TruthAndBias["3. Bias & Epistemic Profiling"]
                Sci & Jour & Left & Right --> Bias["Bias & Deception Service\n(Deception Score 0-10)"]
                Bias --> Aleth["Alethiology Service\n(6 Truth Theories)"]
                Aleth --> Synthesis["Truth Profile Assessment"]
            end
            subgraph EvalFlywheel["4. Quality Flywheel (agents-cli)"]
                Synthesis -.-> EvalTraces["Eval Traces & Golden Fixtures\n(150 Golden Cases)"]
                EvalTraces -.-> AgentsCLI["agents-cli eval grade / compare"]
                AgentsCLI -.-> Dashboard["Marimo Interactive Dashboard"]
            end
        ```
        """
    )
    return (header,)


# ---------------------------------------------------------------------------
# CELL 3 — Data Loader
# ---------------------------------------------------------------------------

@app.cell
def __(mo):
    mo.md(
        "**Data Loader** — Resolves the project root directory and reads all five golden datasets, "
        "offline eval summaries (`summary_*.json`), agents-cli grade results (`results_*.json`), "
        "and raw evaluation traces (`run_*.json`) from `backend/artifacts/`."
    )


@app.cell
def __(Path, json):
    # Locate project root reliably
    _current = Path.cwd()
    _candidates = [
        _current,
        _current.parent,
        Path(__file__).resolve().parent.parent if "__file__" in globals() else _current,
    ]
    _root = _current
    for _cand in _candidates:
        if (_cand / "backend" / "app" / "evals" / "datasets").is_dir():
            _root = _cand
            break

    datasets_dir = _root / "backend" / "app" / "evals" / "datasets"
    eval_results_dir = _root / "backend" / "artifacts" / "eval_results"
    grade_results_dir = _root / "backend" / "artifacts" / "grade_results"
    traces_dir = _root / "backend" / "artifacts" / "traces"

    # Load 5 Golden Datasets
    _dataset_map = {
        "PreClassifier": "pre_classifier_golden.json",
        "Claim Extractor": "claim_extractor_golden.json",
        "Perspective & Stance": "perspective_stance_golden.json",
        "Bias & Deception": "bias_deception_golden.json",
        "Alethiology": "alethiology_golden.json",
    }
    golden_datasets = {}
    for _name, _filename in _dataset_map.items():
        _p = datasets_dir / _filename
        if _p.is_file():
            try:
                with open(_p, "r", encoding="utf-8") as _f:
                    golden_datasets[_name] = json.load(_f)
            except Exception:
                golden_datasets[_name] = []
        else:
            golden_datasets[_name] = []

    # Load Eval Summary Results
    eval_summaries = {}
    if eval_results_dir.is_dir():
        for _p in sorted(eval_results_dir.glob("summary_*.json"), reverse=True):
            try:
                with open(_p, "r", encoding="utf-8") as _f:
                    eval_summaries[_p.name] = json.load(_f)
            except Exception:
                pass

    # Load Graded Results
    grade_results = {}
    if grade_results_dir.is_dir():
        for _p in sorted(grade_results_dir.glob("results_*.json"), reverse=True):
            try:
                with open(_p, "r", encoding="utf-8") as _f:
                    grade_results[_p.name] = json.load(_f)
            except Exception:
                pass

    # Load Trace Datasets
    traces_data = {}
    if traces_dir.is_dir():
        for _p in sorted(traces_dir.glob("run_*.json"), reverse=True):
            try:
                with open(_p, "r", encoding="utf-8") as _f:
                    traces_data[_p.name] = json.load(_f)
            except Exception:
                pass

    return (
        datasets_dir,
        eval_results_dir,
        eval_summaries,
        golden_datasets,
        grade_results,
        grade_results_dir,
        traces_data,
        traces_dir,
    )


# ---------------------------------------------------------------------------
# CELL 4 — Executive KPI Cards
# ---------------------------------------------------------------------------

@app.cell
def __(mo):
    mo.md(
        "**Executive KPI Cards** — Computes headline metrics (total golden fixtures, benchmark run counts, "
        "latest topline score) from loaded data and renders them as a horizontal stat card strip."
    )


@app.cell
def __(eval_summaries, golden_datasets, grade_results, mo):
    _total_cases = sum(len(_v) for _v in golden_datasets.values())
    _num_summaries = len(eval_summaries)
    _num_grades = len(grade_results)

    _latest_score_str = "N/A"
    if eval_summaries:
        _first_summary = next(iter(eval_summaries.values()))
        _totals = _first_summary.get("aggregation", {}).get("totals", {})
        _score = _totals.get("overall_mean_score")
        if _score is not None:
            _latest_score_str = f"{_score * 100:.1f}%"

    kpi_cards = mo.hstack(
        [
            mo.stat(
                value=f"{_total_cases}",
                label="Golden Benchmark Fixtures",
                caption="Across 5 pipeline stages",
            ),
            mo.stat(
                value=f"{_num_summaries}",
                label="Benchmark Runs",
                caption="Offline & Live trace runs",
            ),
            mo.stat(
                value=f"{_num_grades}",
                label="Graded Runs (agents-cli)",
                caption="LLM-as-a-judge evaluations",
            ),
            mo.stat(
                value=_latest_score_str,
                label="Latest Topline Score",
                caption="Overall mean pass accuracy",
            ),
            mo.stat(
                value="Gemini 3.8 Flash",
                label="Primary Evaluator Model",
                caption="Zero-Throttling GCP Vertex AI",
            ),
        ],
        justify="space-between",
    )

    executive_view = mo.vstack(
        [
            mo.md("### 📊 Key Performance Indicators"),
            kpi_cards,
            mo.md("---"),
        ]
    )
    return (executive_view, kpi_cards)


# ---------------------------------------------------------------------------
# CELL 5 — Navigation Guide
# ---------------------------------------------------------------------------

@app.cell
def __(mo):
    mo.md(
        "**Navigation Guide** — Renders a section-by-section orientation card so colleagues "
        "can find the right panel at a glance, especially useful in read-only `marimo run` app mode."
    )


@app.cell
def __(mo):
    nav_guide = mo.callout(
        mo.md(
            """
            ### 🗺️ How to Use This Dashboard

            This notebook has **6 interactive sections** — scroll down or jump straight to the one you need:

            | # | Section | What you can do |
            |---|---------|-----------------|
            | 1 | 📊 **Key Performance Indicators** | Headline stats: total golden cases, runs, latest topline score |
            | 2 | 📈 **Score Trend Over Time** | Line chart of overall & per-component scores across all eval runs |
            | 3 | 🗃️ **Golden Dataset Explorer** | Browse the 5 golden fixtures datasets with dataset-specific charts |
            | 4 | 📈 **Benchmark Run Explorer** | Per-run CI error bars, component breakdown matrix, token & cost stats |
            | 5 | ⚖️ **Grade & A/B Comparison** | agents-cli LLM-as-a-judge scores, side-by-side A/B run comparison |
            | 6 | 🔍 **Case-Level Trace Inspector** | Drill into individual eval cases: raw prompt, model response, metadata |

            > **Tip:** All dropdowns are reactive — changing a selection instantly re-renders the charts below it.
            """
        ),
        kind="info",
    )
    return (nav_guide,)


# ---------------------------------------------------------------------------
# CELL 6 — Score Trend: data builder
# ---------------------------------------------------------------------------

@app.cell
def __(mo):
    mo.md(
        "**Score Trend: Data Builder** — Parses timestamps and extracts `overall_mean_score` plus "
        "per-component scores from every loaded summary file to build the chronological trend dataset."
    )


@app.cell
def __(datetime, eval_summaries, mo):
    _trend_rows = []
    for _fname, _summary in eval_summaries.items():
        _ts_str = _summary.get("run_timestamp", "")
        try:
            _dt = datetime.strptime(_ts_str, "%Y%m%d_%H%M%S")
            _run_label = _dt.strftime("%b %d %H:%M")
        except ValueError:
            _run_label = _ts_str

        _agg = _summary.get("aggregation", {})
        _totals = _agg.get("totals", {})
        _overall = _totals.get("overall_mean_score")

        if _overall is not None:
            _trend_rows.append({
                "run": _run_label,
                "sort_key": _ts_str,
                "component": "Overall",
                "score": round(_overall, 4),
                "fallback_count": _agg.get("fallback_count", 0),
                "total_results": _agg.get("total_results", 0),
            })

        for _comp, _cinfo in _agg.get("per_component", {}).items():
            _trend_rows.append({
                "run": _run_label,
                "sort_key": _ts_str,
                "component": _comp,
                "score": round(_cinfo.get("mean_score", 0.0), 4),
                "fallback_count": _cinfo.get("fallback_count", 0),
                "total_results": _cinfo.get("total_records", 0),
            })

    _trend_rows.sort(key=lambda r: r["sort_key"])

    _all_components = ["Overall"] + sorted(
        {r["component"] for r in _trend_rows if r["component"] != "Overall"}
    )
    trend_scope_selector = mo.ui.multiselect(
        options=_all_components,
        value=["Overall"],
        label="Show trend lines for:",
    )

    trend_rows = _trend_rows
    return trend_rows, trend_scope_selector


# ---------------------------------------------------------------------------
# CELL 7 — Score Trend: chart renderer
# ---------------------------------------------------------------------------

@app.cell
def __(mo):
    mo.md(
        "**Score Trend: Chart Renderer** — Filters the trend dataset by the selected components and "
        "renders an Altair line-and-point chart showing score evolution across all evaluation runs."
    )


@app.cell
def __(alt, mo, trend_rows, trend_scope_selector):
    _selected = trend_scope_selector.value or ["Overall"]
    _filtered = [r for r in trend_rows if r["component"] in _selected]

    if not _filtered:
        trend_view = mo.vstack([
            mo.md("### 📈 Score Trend Over Time"),
            trend_scope_selector,
            mo.md("*No benchmark summaries found — run `python -m app.evals.cli` to generate data.*"),
            mo.md("---"),
        ])
    else:
        # Collect the ordered run labels so Altair sorts chronologically
        _run_order = list(dict.fromkeys(r["run"] for r in trend_rows))

        _line = (
            alt.Chart(alt.Data(values=_filtered))
            .mark_line(point=True, strokeWidth=2)
            .encode(
                x=alt.X("run:O", title="Evaluation Run", sort=_run_order),
                y=alt.Y(
                    "score:Q",
                    title="Mean Evaluation Score",
                    scale=alt.Scale(domain=[0, 1]),
                    axis=alt.Axis(format="%"),
                ),
                color=alt.Color("component:N", title="Component / Scope"),
                tooltip=[
                    "run:N",
                    "component:N",
                    "score:Q",
                    "fallback_count:Q",
                    "total_results:Q",
                ],
            )
        )

        _points = (
            alt.Chart(alt.Data(values=_filtered))
            .mark_point(filled=True, size=80)
            .encode(
                x=alt.X("run:O", sort=_run_order),
                y=alt.Y("score:Q", scale=alt.Scale(domain=[0, 1])),
                color=alt.Color("component:N"),
                tooltip=[
                    "run:N",
                    "component:N",
                    "score:Q",
                    "fallback_count:Q",
                    "total_results:Q",
                ],
            )
        )

        _chart = (_line + _points).properties(
            title="Score Trend Across All Evaluation Runs",
            width=700,
            height=300,
        )

        # Summary table: latest score per component
        _latest_by_comp: dict = {}
        for _r in trend_rows:
            _latest_by_comp[_r["component"]] = _r

        _summary_table = [
            {
                "Component": comp,
                "Latest Score": f"{info['score'] * 100:.1f}%",
                "Fallbacks": info["fallback_count"],
                "Total Results": info["total_results"],
                "Latest Run": info["run"],
            }
            for comp, info in sorted(_latest_by_comp.items())
        ]

        trend_view = mo.vstack(
            [
                mo.md("### 📈 Score Trend Over Time"),
                trend_scope_selector,
                _chart,
                mo.md("#### Latest Score per Component"),
                mo.ui.table(_summary_table, page_size=10),
                mo.md("---"),
            ]
        )
    return (trend_view,)


# ---------------------------------------------------------------------------
# CELL 8 — Dataset Selector
# ---------------------------------------------------------------------------

@app.cell
def __(mo):
    mo.md(
        "**Dataset Selector** — Creates the dropdown control for switching between the five golden "
        "evaluation datasets; the selection reactively updates all charts and tables in the section below."
    )


@app.cell
def __(golden_datasets, mo):
    dataset_selector = mo.ui.dropdown(
        options=list(golden_datasets.keys()),
        value="PreClassifier",
        label="Select Golden Evaluation Dataset:",
    )
    return (dataset_selector,)


# ---------------------------------------------------------------------------
# CELL 6 — Golden Dataset Explorer
# ---------------------------------------------------------------------------

@app.cell
def __(mo):
    mo.md(
        "**Golden Dataset Explorer** — Renders dataset-specific Altair bar charts (category distribution, "
        "stance breakdown, deception histogram, truth theory frequency, etc.) plus a searchable paginated "
        "raw-fixtures table for whichever dataset is selected in the dropdown above."
    )


@app.cell
def __(alt, dataset_selector, golden_datasets, mo):
    _name = dataset_selector.value
    _data = golden_datasets.get(_name, [])

    _desc_map = {
        "PreClassifier": (
            "**PreClassifier Golden Dataset** (32 records): Evaluates domain suitability, category classification, "
            "and short-circuit edge cases (e.g. ambient music, silent vlogs, poetry, gameplay) to avoid costly downstream extraction."
        ),
        "Claim Extractor": (
            "**Claim Extractor Golden Dataset** (16 records): Assesses factual claim extraction fidelity, timestamp precision, "
            "and segment alignment against gold-standard manual transcript annotations."
        ),
        "Perspective & Stance": (
            "**Perspective & Stance Golden Dataset** (40 records): Tests 4-perspective search grounding (Scientific, Journalistic, "
            "Partisan Left, Partisan Right) and evaluates resistance to adversarial hallucination bait."
        ),
        "Bias & Deception": (
            "**Bias & Deception Golden Dataset** (26 records): Calibrates deception severity scoring (0–10) and detects 4 specific "
            "bias typologies: Framing Bias, Sourcing Bias, Omission Bias, and Sensationalism."
        ),
        "Alethiology": (
            "**Alethiology Golden Dataset** (36 records): Validates philosophical truth profiling across 6 epistemic theories: "
            "Correspondence (Empirical), Coherence (Systemic Narrative), Pragmatic (Practical Utility), "
            "Perspectivism (Lived Experience), Consensus (Institutional Agreement), and Deflationary (Rhetorical Endorsement)."
        ),
    }

    _header_md = mo.md(
        f"""
        ### 🗃️ Golden Dataset Explorer: {_name}
        {_desc_map.get(_name, '')}
        """
    )

    _charts = []
    if _name == "PreClassifier":
        # Categories distribution
        _cat_counts = {}
        _analysable_counts = {"Analysable (True)": 0, "Non-Analysable (False)": 0}
        _edge_counts = {}
        for _item in _data:
            _c = _item.get("expected_category", "Unknown")
            _cat_counts[_c] = _cat_counts.get(_c, 0) + 1
            if _item.get("is_analysable"):
                _analysable_counts["Analysable (True)"] += 1
            else:
                _analysable_counts["Non-Analysable (False)"] += 1
            _e = _item.get("edge_case_type", "standard")
            _edge_counts[_e] = _edge_counts.get(_e, 0) + 1

        _c1_data = [{"category": k, "count": v} for k, v in _cat_counts.items()]
        _chart1 = (
            alt.Chart(alt.Data(values=_c1_data))
            .mark_bar(cornerRadiusTopLeft=4, cornerRadiusTopRight=4, color="#4285F4")
            .encode(
                x=alt.X("category:N", title="Expected Category", sort="-y"),
                y=alt.Y("count:Q", title="Sample Count"),
                tooltip=["category:N", "count:Q"],
            )
            .properties(title="PreClassifier Categories Distribution", width=380, height=260)
        )

        _c2_data = [{"status": k, "count": v} for k, v in _analysable_counts.items()]
        _chart2 = (
            alt.Chart(alt.Data(values=_c2_data))
            .mark_bar(cornerRadiusTopLeft=4, cornerRadiusTopRight=4, color="#34A853")
            .encode(
                x=alt.X("status:N", title="Analysability"),
                y=alt.Y("count:Q", title="Count"),
                tooltip=["status:N", "count:Q"],
            )
            .properties(title="Analysability Filtering", width=260, height=260)
        )

        _c3_data = [{"edge_type": k, "count": v} for k, v in _edge_counts.items()]
        _chart3 = (
            alt.Chart(alt.Data(values=_c3_data))
            .mark_bar(cornerRadiusTopLeft=4, cornerRadiusTopRight=4, color="#9C27B0")
            .encode(
                x=alt.X("edge_type:N", title="Edge Case Type", sort="-y"),
                y=alt.Y("count:Q", title="Count"),
                tooltip=["edge_type:N", "count:Q"],
            )
            .properties(title="Edge Case Type Breakdown", width=300, height=260)
        )

        _charts = [_chart1, _chart2, _chart3]

    elif _name == "Claim Extractor":
        _video_claims = []
        for _item in _data:
            _num_claims = len(_item.get("gold_claims", []))
            _vid = _item.get("video_id", "unknown")
            _video_claims.append({"video_id": _vid, "claims_count": _num_claims})

        _chart1 = (
            alt.Chart(alt.Data(values=_video_claims))
            .mark_bar(cornerRadiusTopLeft=4, cornerRadiusTopRight=4, color="#FBBC05")
            .encode(
                x=alt.X("video_id:N", title="Video ID", sort="-y"),
                y=alt.Y("claims_count:Q", title="Gold Claims Count"),
                tooltip=["video_id:N", "claims_count:Q"],
            )
            .properties(title="Gold Claims per Video Transcript", width=600, height=260)
        )
        _charts = [_chart1]

    elif _name == "Perspective & Stance":
        _stance_breakdown = []
        _bait_count = 0
        for _item in _data:
            _p = _item.get("perspective", "unknown")
            _s = _item.get("gold_stance", "unknown")
            _is_bait = _item.get("is_hallucination_bait", False)
            if _is_bait:
                _bait_count += 1
            _stance_breakdown.append({"perspective": _p, "gold_stance": _s, "count": 1})

        _chart1 = (
            alt.Chart(alt.Data(values=_stance_breakdown))
            .mark_bar()
            .encode(
                x=alt.X("perspective:N", title="Perspective"),
                y=alt.Y("count():Q", title="Number of Samples"),
                color=alt.Color(
                    "gold_stance:N",
                    title="Gold Stance",
                    scale=alt.Scale(
                        domain=["SUPPORTS", "REFUTES", "AMBIGUOUS"],
                        range=["#34A853", "#EA4335", "#FBBC05"],
                    ),
                ),
                tooltip=["perspective:N", "gold_stance:N", "count():Q"],
            )
            .properties(title="Gold Stance by Evaluation Perspective", width=550, height=260)
        )
        _charts = [_chart1]

    elif _name == "Bias & Deception":
        _scores = [{"deception_score": _item.get("gold_deception_score", 0)} for _item in _data]
        _bias_counts = {
            "Framing Bias": sum(1 for _item in _data if _item.get("framing_bias_present")),
            "Sourcing Bias": sum(1 for _item in _data if _item.get("sourcing_bias_present")),
            "Omission Bias": sum(1 for _item in _data if _item.get("omission_bias_present")),
            "Sensationalism": sum(1 for _item in _data if _item.get("sensationalism_present")),
        }
        _bias_data = [{"bias_type": k, "count": v} for k, v in _bias_counts.items()]

        _chart1 = (
            alt.Chart(alt.Data(values=_scores))
            .mark_bar(cornerRadiusTopLeft=4, cornerRadiusTopRight=4, color="#EA4335")
            .encode(
                x=alt.X("deception_score:Q", bin=alt.Bin(step=1), title="Gold Deception Score (0–10)"),
                y=alt.Y("count():Q", title="Number of Samples"),
            )
            .properties(title="Deception Score Distribution", width=360, height=260)
        )

        _chart2 = (
            alt.Chart(alt.Data(values=_bias_data))
            .mark_bar(cornerRadiusTopLeft=4, cornerRadiusTopRight=4, color="#FF6D01")
            .encode(
                x=alt.X("bias_type:N", title="Bias Dimension", sort="-y"),
                y=alt.Y("count:Q", title="Presence Count"),
                tooltip=["bias_type:N", "count:Q"],
            )
            .properties(title="Bias Typology Frequency", width=360, height=260)
        )
        _charts = [_chart1, _chart2]

    elif _name == "Alethiology":
        _theories = []
        for _item in _data:
            _pt = _item.get("primary_theory", "unknown")
            _st = _item.get("secondary_theory", "none")
            _theories.append({"primary_theory": _pt, "secondary_theory": _st})

        _chart1 = (
            alt.Chart(alt.Data(values=_theories))
            .mark_bar(cornerRadiusTopLeft=4, cornerRadiusTopRight=4, color="#9C27B0")
            .encode(
                x=alt.X("primary_theory:N", title="Primary Philosophical Truth Theory", sort="-y"),
                y=alt.Y("count():Q", title="Sample Count"),
                tooltip=["primary_theory:N", "count():Q"],
            )
            .properties(title="Epistemic Truth Theory Distribution", width=550, height=260)
        )
        _charts = [_chart1]

    # Create formatted table view
    _table_records = []
    for _idx, _item in enumerate(_data):
        _rec = {"#": _idx + 1}
        for _k, _v in _item.items():
            if isinstance(_v, list):
                _rec[_k] = f"[{len(_v)} items]"
            elif isinstance(_v, str) and len(_v) > 80:
                _rec[_k] = _v[:77] + "..."
            else:
                _rec[_k] = _v
        _table_records.append(_rec)

    _data_table = mo.ui.table(_table_records, page_size=8)

    dataset_explorer_view = mo.vstack(
        [
            _header_md,
            dataset_selector,
            mo.hstack(_charts, justify="start") if _charts else mo.md(""),
            mo.md(f"#### 📋 Raw Fixtures Table ({len(_data)} Total Records)"),
            _data_table,
            mo.md("---"),
        ]
    )
    return (dataset_explorer_view,)


# ---------------------------------------------------------------------------
# CELL 7 — Benchmark Run Selector
# ---------------------------------------------------------------------------

@app.cell
def __(mo):
    mo.md(
        "**Benchmark Run Selector** — Creates the dropdown for choosing which offline benchmark run "
        "(`summary_*.json`) to display; the selection reactively re-renders the run analysis section below."
    )


@app.cell
def __(eval_summaries, mo):
    _summary_options = list(eval_summaries.keys())
    _default_summary = _summary_options[0] if _summary_options else None
    run_selector = mo.ui.dropdown(
        options=_summary_options,
        value=_default_summary,
        label="Select Benchmark Evaluation Run (summary_*.json):",
    )
    return (run_selector,)


# ---------------------------------------------------------------------------
# CELL 8 — Benchmark Run Explorer
# ---------------------------------------------------------------------------

@app.cell
def __(mo):
    mo.md(
        "**Benchmark Run Explorer** — Visualises per-component mean scores with 95% confidence interval "
        "error bars, run-level token usage and cost stats, and a full component breakdown matrix for the "
        "selected run."
    )


@app.cell
def __(alt, eval_summaries, mo, run_selector):
    _sel_run = run_selector.value
    if not _sel_run or _sel_run not in eval_summaries:
        run_explorer_view = mo.md("*No benchmark evaluation summaries found.*")
    else:
        _summary = eval_summaries[_sel_run]
        _timestamp = _summary.get("run_timestamp", _sel_run)
        _agg = _summary.get("aggregation", {})
        _totals = _agg.get("totals", {})
        _per_comp = _agg.get("per_component", {})

        _score_val = _totals.get("overall_mean_score", 0.0)
        _total_res = _agg.get("total_results", 0)
        _valid_res = _totals.get("valid_result_count", 0)
        _fallback_cnt = _agg.get("fallback_count", 0)
        _tokens_cnt = _totals.get("total_tokens", 0)
        _cost_val = _totals.get("total_cost_usd", 0.0)

        _run_stats = mo.hstack(
            [
                mo.stat(
                    value=f"{_score_val * 100:.1f}%",
                    label="Overall Mean Score",
                    caption=f"{_valid_res}/{_total_res} valid results",
                ),
                mo.stat(
                    value=f"{_fallback_cnt}",
                    label="Fallback Count",
                    caption="Circuit-breaker / fallback records",
                ),
                mo.stat(
                    value=f"{_tokens_cnt:,}",
                    label="Total Tokens",
                    caption="Incurred during evaluation",
                ),
                mo.stat(
                    value=f"${_cost_val:.4f}",
                    label="Estimated Cost (USD)",
                    caption="Vertex AI Pricing",
                ),
            ],
            justify="space-between",
        )

        # Build Altair Bar Chart with 95% Confidence Intervals
        _comp_chart_data = []
        _table_data = []
        for _cname, _cinfo in _per_comp.items():
            _m_score = round(_cinfo.get("mean_score", 0.0), 4)
            _ci_low = round(_cinfo.get("ci_lower_95", 0.0), 4)
            _ci_high = round(_cinfo.get("ci_upper_95", 0.0), 4)
            _comp_chart_data.append({
                "component": _cname,
                "mean_score": _m_score,
                "ci_lower": _ci_low,
                "ci_upper": _ci_high,
            })
            _table_data.append({
                "Component": _cname,
                "Valid Records": _cinfo.get("valid_records", 0),
                "Total Records": _cinfo.get("total_records", 0),
                "Fallbacks": _cinfo.get("fallback_count", 0),
                "Error Rate": f"{_cinfo.get('error_rate', 0.0) * 100:.1f}%",
                "Mean Score": f"{_m_score * 100:.1f}%",
                "95% CI Range": f"[{_ci_low * 100:.1f}% – {_ci_high * 100:.1f}%]",
            })

        _bars = (
            alt.Chart(alt.Data(values=_comp_chart_data))
            .mark_bar(cornerRadiusTopLeft=4, cornerRadiusTopRight=4)
            .encode(
                x=alt.X("component:N", title="Pipeline Component"),
                y=alt.Y("mean_score:Q", title="Mean Evaluation Score", scale=alt.Scale(domain=[0, 1])),
                color=alt.Color("component:N", legend=None),
                tooltip=["component:N", "mean_score:Q", "ci_lower:Q", "ci_upper:Q"],
            )
        )

        _errors = (
            alt.Chart(alt.Data(values=_comp_chart_data))
            .mark_errorbar(color="#202124", thickness=2)
            .encode(
                x=alt.X("component:N"),
                y=alt.Y("ci_lower:Q"),
                y2=alt.Y2("ci_upper:Q"),
            )
        )

        _ci_chart = (_bars + _errors).properties(
            title=f"Component Evaluation Scores with 95% Confidence Intervals (Run: {_timestamp})",
            width=650,
            height=300,
        )

        run_explorer_view = mo.vstack(
            [
                mo.md(f"### 📈 Benchmark Run Analysis: `{_sel_run}`"),
                run_selector,
                _run_stats,
                _ci_chart,
                mo.md("#### 📊 Component Breakdown Matrix"),
                mo.ui.table(_table_data, page_size=10),
                mo.md("---"),
            ]
        )
    return (run_explorer_view,)


# ---------------------------------------------------------------------------
# CELL 9 — Grade & A/B Selectors
# ---------------------------------------------------------------------------

@app.cell
def __(mo):
    mo.md(
        "**Grade & A/B Selectors** — Creates three dropdowns: one for choosing the primary graded run to "
        "inspect, and a baseline/candidate pair for the head-to-head A/B comparison chart below."
    )


@app.cell
def __(grade_results, mo):
    _grade_options = list(grade_results.keys())
    _default_cand = _grade_options[0] if _grade_options else None
    _default_base = _grade_options[-1] if _grade_options else None

    grade_selector = mo.ui.dropdown(
        options=_grade_options,
        value=_default_cand,
        label="Select Graded Evaluation Run (results_*.json):",
    )
    baseline_selector = mo.ui.dropdown(
        options=_grade_options,
        value=_default_base,
        label="A/B Baseline Run:",
    )
    candidate_selector = mo.ui.dropdown(
        options=_grade_options,
        value=_default_cand,
        label="A/B Candidate Run:",
    )
    return baseline_selector, candidate_selector, grade_selector


# ---------------------------------------------------------------------------
# CELL 10 — agents-cli Grade & A/B Comparison View
# ---------------------------------------------------------------------------

@app.cell
def __(mo):
    mo.md(
        "**Grade & A/B Comparison View** — Plots agents-cli LLM-as-a-judge rubric scores for the selected "
        "graded run, then renders a side-by-side grouped bar chart comparing baseline vs. candidate metrics "
        "with delta percentages and improvement/regression verdicts."
    )


@app.cell
def __(
    alt,
    baseline_selector,
    candidate_selector,
    grade_results,
    grade_selector,
    mo,
):
    _sel_grade = grade_selector.value
    if not _sel_grade or _sel_grade not in grade_results:
        grades_view = mo.md("*No agents-cli evaluation grade results found.*")
    else:
        _grade_obj = grade_results[_sel_grade]
        _summary_metrics = _grade_obj.get("summary_metrics", [])

        _metric_chart_data = []
        _metric_table_data = []
        for _m in _summary_metrics:
            _mname = _m.get("metric_name", "")
            _mscore = round(_m.get("mean_score", 0.0), 4)
            _mstdev = round(_m.get("stdev_score", 0.0), 4)
            _metric_chart_data.append({
                "metric": _mname,
                "mean_score": _mscore,
                "stdev": _mstdev,
            })
            _metric_table_data.append({
                "Evaluation Rubric": _mname,
                "Mean Score": f"{_mscore * 100:.1f}%",
                "Std Dev": f"±{_mstdev * 100:.1f}%",
                "Total Cases": _m.get("num_cases_total", 0),
                "Valid Scored": _m.get("num_cases_valid", 0),
                "Errors": _m.get("num_cases_error", 0),
            })

        _grade_chart = (
            alt.Chart(alt.Data(values=_metric_chart_data))
            .mark_bar(cornerRadiusTopLeft=4, cornerRadiusTopRight=4, color="#34A853")
            .encode(
                x=alt.X("metric:N", title="Custom Pointwise Evaluation Metric"),
                y=alt.Y("mean_score:Q", title="LLM-as-a-Judge Score", scale=alt.Scale(domain=[0, 1])),
                tooltip=["metric:N", "mean_score:Q", "stdev:Q"],
            )
            .properties(
                title=f"agents-cli LLM-as-a-Judge Rubric Scores ({_sel_grade})",
                width=550,
                height=260,
            )
        )

        # A/B Comparison Logic
        _b_run = baseline_selector.value
        _c_run = candidate_selector.value
        _ab_data = []
        _deltas_table = []

        if _b_run in grade_results and _c_run in grade_results:
            _b_metrics = {m["metric_name"]: m.get("mean_score", 0.0) for m in grade_results[_b_run].get("summary_metrics", [])}
            _c_metrics = {m["metric_name"]: m.get("mean_score", 0.0) for m in grade_results[_c_run].get("summary_metrics", [])}

            for _mname in sorted(set(_b_metrics.keys()) & set(_c_metrics.keys())):
                _b_val = _b_metrics[_mname]
                _c_val = _c_metrics[_mname]
                _delta = _c_val - _b_val

                _ab_data.append({"metric": _mname, "run": "Baseline", "score": round(_b_val, 4)})
                _ab_data.append({"metric": _mname, "run": "Candidate", "score": round(_c_val, 4)})

                _delta_str = f"+{_delta * 100:.1f}%" if _delta > 0 else f"{_delta * 100:.1f}%"
                _deltas_table.append({
                    "Metric": _mname,
                    f"Baseline ({_b_run[:16]}...)": f"{_b_val * 100:.1f}%",
                    f"Candidate ({_c_run[:16]}...)": f"{_c_val * 100:.1f}%",
                    "Delta": _delta_str,
                    "Verdict": "📈 Improved" if _delta > 0.001 else ("📉 Regressed" if _delta < -0.001 else "⚖️ Parity"),
                })

        _ab_chart = (
            alt.Chart(alt.Data(values=_ab_data))
            .mark_bar(cornerRadiusTopLeft=3, cornerRadiusTopRight=3)
            .encode(
                x=alt.X("metric:N", title="Evaluation Metric"),
                y=alt.Y("score:Q", title="Judge Score", scale=alt.Scale(domain=[0, 1])),
                xOffset="run:N",
                color=alt.Color(
                    "run:N",
                    title="Evaluation Run",
                    scale=alt.Scale(domain=["Baseline", "Candidate"], range=["#9AA0A6", "#4285F4"]),
                ),
                tooltip=["metric:N", "run:N", "score:Q"],
            )
            .properties(title="A/B Run Comparison (Baseline vs. Candidate)", width=550, height=260)
        )

        grades_view = mo.vstack(
            [
                mo.md(f"### ⚖️ agents-cli Grade & A/B Run Comparison: `{_sel_grade}`"),
                grade_selector,
                _grade_chart,
                mo.ui.table(_metric_table_data, page_size=5),
                mo.md("#### 🔄 A/B Experiment Head-to-Head Comparison"),
                mo.hstack([baseline_selector, candidate_selector], justify="start"),
                _ab_chart,
                mo.ui.table(_deltas_table, page_size=5),
                mo.md("---"),
            ]
        )
    return (grades_view,)


# ---------------------------------------------------------------------------
# CELL 11 — Trace Inspector Selectors
# ---------------------------------------------------------------------------

@app.cell
def __(mo):
    mo.md(
        "**Trace Inspector Selectors** — Creates the trace-run dropdown, the component-filter dropdown, "
        "and a 'Show fallback cases only' checkbox used to instantly surface every ⚠️ case across all components."
    )


@app.cell
def __(mo, traces_data):
    _trace_options = list(traces_data.keys())
    _default_trace = _trace_options[0] if _trace_options else None

    trace_selector = mo.ui.dropdown(
        options=_trace_options,
        value=_default_trace,
        label="Select Trace Run (run_*.json):",
    )
    component_filter = mo.ui.dropdown(
        options=["All", "pre_classifier", "extractor", "perspective", "bias", "alethiology"],
        value="All",
        label="Filter Component:",
    )
    fallback_only = mo.ui.checkbox(label="⚠️ Show fallback cases only")
    return component_filter, fallback_only, trace_selector


# ---------------------------------------------------------------------------
# CELL 12 — Trace Cases Table Builder
# ---------------------------------------------------------------------------

@app.cell
def __(mo):
    mo.md(
        "**Trace Cases Table Builder** — Filters all evaluation cases from the selected trace file by "
        "component and optionally by fallback status, builds a per-case summary table (ID, score, "
        "fallback flag, model), and creates the single-case selector dropdown for the deep-dive below."
    )


@app.cell
def __(component_filter, fallback_only, mo, trace_selector, traces_data):
    _sel_trace = trace_selector.value
    _filter_comp = component_filter.value
    _fallback_only = fallback_only.value

    _cases = []
    if _sel_trace and _sel_trace in traces_data:
        _raw_cases = traces_data[_sel_trace].get("eval_cases", [])
        for _c in _raw_cases:
            _meta = _c.get("metadata", {})
            _comp = _meta.get("component", "unknown")
            _is_fallback = _meta.get("is_fallback", False)
            if _filter_comp != "All" and _comp != _filter_comp:
                continue
            if _fallback_only and not _is_fallback:
                continue
            _cases.append(_c)

    _case_id_options = [_c.get("eval_case_id", f"case_{i}") for i, _c in enumerate(_cases)]
    _default_case_id = _case_id_options[0] if _case_id_options else None

    case_selector = mo.ui.dropdown(
        options=_case_id_options,
        value=_default_case_id,
        label="Inspect Detailed Case Trace:",
    )

    # Table of cases
    _table_cases = []
    for _c in _cases:
        _meta = _c.get("metadata", {})
        _table_cases.append({
            "Case ID": _c.get("eval_case_id"),
            "Component": _meta.get("component", ""),
            "Metric": _meta.get("metric_name", ""),
            "Score": f"{_meta.get('score', 0.0):.4f}",
            "Fallback": "⚠️ Fallback" if _meta.get("is_fallback") else "✅ Normal",
            "Model": _meta.get("model_name", ""),
        })

    trace_cases_table = mo.ui.table(_table_cases, page_size=10)
    return case_selector, trace_cases_table


# ---------------------------------------------------------------------------
# CELL 13 — Single-Case Trace Inspector
# ---------------------------------------------------------------------------

@app.cell
def __(mo):
    mo.md(
        "**Single-Case Trace Inspector** — Assembles the complete trace inspector view: the filterable "
        "cases summary table, a case-selector dropdown, and an expandable accordion showing the raw "
        "evaluation prompt, candidate model response, and full execution metadata for the chosen case."
    )


@app.cell
def __(
    case_selector,
    component_filter,
    fallback_only,
    mo,
    trace_cases_table,
    trace_selector,
    traces_data,
):
    _sel_trace = trace_selector.value
    _sel_case_id = case_selector.value

    _found_case = None
    if _sel_trace and _sel_trace in traces_data:
        for _c in traces_data[_sel_trace].get("eval_cases", []):
            if _c.get("eval_case_id") == _sel_case_id:
                _found_case = _c
                break

    if not _found_case:
        _detail_card = mo.md("*Select an individual evaluation case above to inspect its execution trace.*")
    else:
        _meta = _found_case.get("metadata", {})
        _prompt_parts = _found_case.get("prompt", {}).get("parts", [])
        _prompt_text = "\n".join(p.get("text", "") for p in _prompt_parts)

        _resp_parts = []
        for _r in _found_case.get("responses", []):
            for _p in _r.get("response", {}).get("parts", []):
                _resp_parts.append(_p.get("text", ""))
        _response_text = "\n".join(_resp_parts)

        _detail_card = mo.vstack(
            [
                mo.md(
                    f"""
                    #### 🔬 Inspection: Case `{_sel_case_id}`
                    - **Component**: `{_meta.get('component')}` | **Metric**: `{_meta.get('metric_name')}`
                    - **Score**: `{_meta.get('score', 0.0)}` | **Fallback**: `{_meta.get('is_fallback')}`
                    - **Model**: `{_meta.get('model_name')}` | **Tokens**: In `{_meta.get('input_tokens', 0)}` / Out `{_meta.get('output_tokens', 0)}`
                    """
                ),
                mo.accordion({
                    "📥 Evaluation Prompt / Input": mo.md(f"```json\n{_prompt_text}\n```"),
                    "📤 Candidate Model Response": mo.md(f"```json\n{_response_text}\n```"),
                    "🏷️ Execution Metadata": mo.md(f"```json\n{_meta}\n```"),
                }),
            ]
        )

    trace_inspector_view = mo.vstack(
        [
            mo.md(f"### 🔍 Case-Level Trace Inspector: `{_sel_trace}`"),
            mo.hstack([trace_selector, component_filter, fallback_only], justify="start"),
            trace_cases_table,
            mo.md("#### 🔎 Single-Case Deep Dive"),
            case_selector,
            _detail_card,
            mo.md("---"),
        ]
    )
    return (trace_inspector_view,)


# ---------------------------------------------------------------------------
# CELL 14 — Dashboard Layout Assembly
# ---------------------------------------------------------------------------

@app.cell
def __(mo):
    mo.md(
        "**Dashboard Layout Assembly** — Stacks all section views (header, navigation guide, KPIs, "
        "score trend, dataset explorer, run explorer, grade comparison, trace inspector) into the "
        "final full-width dashboard output."
    )


@app.cell
def __(
    dataset_explorer_view,
    executive_view,
    grades_view,
    header,
    mo,
    nav_guide,
    run_explorer_view,
    trace_inspector_view,
    trend_view,
):
    # Root dashboard assembly
    dashboard_layout = mo.vstack(
        [
            header,
            nav_guide,
            executive_view,
            trend_view,
            dataset_explorer_view,
            run_explorer_view,
            grades_view,
            trace_inspector_view,
            mo.md(
                r"""
                ---
                *Perspective Prism Evaluation Dashboard • Generated with marimo v0.24.2 • Zero-SaaS Cloud-Native Architecture*
                """
            ),
        ]
    )
    return (dashboard_layout,)


if __name__ == "__main__":
    app.run()
