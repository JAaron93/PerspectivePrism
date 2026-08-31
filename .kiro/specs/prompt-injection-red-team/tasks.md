# Implementation Tasks: Prompt-Injection Red Team for the Transcript-to-Gemini Pipeline

## Execution Tracks Overview

| Track | Scope | Dependencies |
|---|---|---|
| **A** | Payload corpus & taxonomy | None |
| **B** | Deterministic sanitizer probe harness | A |
| **C** | Live LLM injection probe + judge layer | A, B |
| **D** | Reporting, baseline regression, CI gate | B (C optional for reports) |
| **E** | Fast-track hardening (nonce delimiters, NFKC) | Independent |

> [!TIP] PARALLEL EXECUTION
> **Track A and Track E are fully independent — run them concurrently.** Track B starts as soon as the corpus schema (Task 1) lands; Track C and Track D can proceed in parallel once Track B's runner exists.

All tasks follow strict TDD: write the failing test first, verify failure, implement minimum code, re-verify. Run `pytest` after every task per project progressive-verification rules. Each task contains `- [ ]` subtask boxes: the executing agent checks each box as it completes the step, then flips the task's `[STATUS: ...]` marker to `COMPLETE`. Status markers MUST only be set to COMPLETE when every subtask box is checked and the repository artifact satisfies the description (zero-drift invariant).

---

## Track A: Payload Corpus & Taxonomy

### Task 1: Corpus schema, loader, and validation [STATUS: COMPLETE]
*Traceability: FR-1.1, FR-1.2, FR-1.4 · AC: —*
- [x] Write failing tests asserting (a) a valid YAML entry loads, (b) an entry missing `stage` raises with file name + payload id in the message, (c) duplicate ids across files raise; verify they fail.
- [x] Define the YAML payload schema (`id`, `stage`, `technique`, `payload`, `expected`, `severity`) as a Pydantic model in `.benchmarks/redteam/corpus.py`.
- [x] Implement loader that walks `.benchmarks/redteam/payloads/*.yaml` and yields validated entries; tests now pass.
- [x] Register `redteam` pytest marker in `backend/pyproject.toml` under `[tool.pytest.ini_options]`.
- [x] Run full `pytest` to confirm no regressions.
- **Dependencies:** none.

### Task 2: Author attack payload categories [STATUS: COMPLETE]
*Traceability: FR-1.3 · AC: AC-1 fixture*
- [x] Author ≥5 payloads each for `PI-DIR`, `PI-PAR`, `PI-ROL`, `PI-OUT`, `PI-EXF` with stage assignments (S1/S2/S3).
- [x] Author ≥5 payloads each for `PI-DLM`, `PI-SPL`, `PI-TRN`, `PI-ENC`; `PI-DLM` MUST include a transcript embedding literal `===USER DATA END===` + forged instructions (H1 test case).
- [x] Author ≥5 payloads each for `PI-UNI`, `PI-MUL` (homoglyphs, full-width, non-English languages).
- [x] Verify all entries pass the Task 1 loader validation; frame payloads as journalism/news-style transcript narration (project fixture rule).
- **Dependencies:** Task 1 (schema).

> [!TIP] PARALLEL EXECUTION
> Task 2 and Task 3 split by file set — two authors can work concurrently without conflicts.

### Task 3: Author legitimate control corpus [STATUS: COMPLETE]
*Traceability: FR-1.3, FR-2.3 · AC: AC-2 fixture*
- [x] Author ≥10 `LEG` entries: realistic news/science/policy transcript excerpts that quote attack-adjacent phrases ("ignore previous instructions", "system prompt", role-play quotes) in benign contexts.
- [x] Verify all entries pass the Task 1 loader validation and are tagged `expected: passes-but-safe`.
- **Dependencies:** Task 1 (schema).

---

## Track B: Deterministic Sanitizer Probe

### Task 4: Probe runner [STATUS: COMPLETE]
*Traceability: FR-2.1, FR-2.2, FR-2.4 · AC: AC-1, AC-2*
- [x] Write failing tests asserting per-payload classification (`blocked` / `bypassed` / `error`) and delimiter-forgery survival detection for a `PI-DLM` fixture; verify they fail.
- [x] Implement `.benchmarks/redteam/probe.py`: iterate corpus, call `sanitize_input` with stage-appropriate `max_length` (transcript 100000, claim 5000, evidence 10000), assemble final prompt via `build_user_data_prompt`, flag surviving forged delimiters; tests now pass.
- [x] Verify zero network calls (pure in-process) — no LLM/YouTube/Search I/O in probe execution.
- **Dependencies:** Task 1, Task 2.

### Task 5: Deterministic pytest suite [STATUS: COMPLETE]
*Traceability: FR-2.3, FR-2.4, NFR-1 · AC: AC-2*
- [x] Write failing tests runnable via `pytest -m redteam` from `backend/` that (a) execute the Task 4 probe over the full corpus, (b) fail the suite if any `LEG` payload is rejected, (c) complete under 60s; verify they fail.
- [x] Wire the suite to the probe and confirm `pytest -m redteam` passes with the current sanitizer; confirm full `pytest` shows no regressions.
- **Dependencies:** Task 3, Task 4.

---

## Track C: Live LLM Injection Probe & Judge

### Task 6: Live runner skeleton with safety rails [STATUS: PENDING]
*Traceability: FR-3.1, FR-3.4, FR-3.5, NFR-2, NFR-3, NFR-6 · AC: AC-4*
- [ ] Write failing tests asserting (a) `--live` without `GCP_PROJECT`/`GOOGLE_CLOUD_PROJECT` exits with configuration error before any LLM call, (b) budget counter aborts after N calls, (c) mocked transcript/evidence fixtures are used (no YouTube/Search I/O); verify they fail.
- [ ] Implement `.benchmarks/redteam/live_probe.py` reusing `ClaimExtractor` / `AnalysisService` with DI'd settings; respect the tier-aware semaphore; seed randomness; log model names + corpus version; tests now pass.
- [ ] Confirm all I/O is non-blocking `async`/`await` and only Gemini 3.x models are referenced.
- **Dependencies:** Task 4.

### Task 7: Judge layer (canary → heuristic → LLM judge) [STATUS: PENDING]
*Traceability: FR-3.2, FR-3.3, FR-3.4, NFR-5 · AC: AC-3*
- [ ] Write failing tests for canary detection on synthetic output and heuristic detection of demanded `deception_rating`/stance values and persona drift; verify they fail.
- [ ] Write failing test asserting the LLM judge is invoked only when tiers 1–2 are inconclusive (mock the judge model); verify it fails.
- [ ] Implement the three tiers; judge LLM call uses `gemini-3.5-flash-lite` with schema-constrained verdict output and candidate text wrapped in USER DATA delimiters; tests now pass.
- [ ] Record the deciding tier for every judged payload in the run results.
- **Dependencies:** Task 6.

> [!TIP] PARALLEL EXECUTION
> Track D (Tasks 8–9) can start once Task 5 exists; Tasks 6–7 proceed independently.

---

## Track D: Reporting, Baseline, CI Gate

### Task 8: Reporter & baseline diff [STATUS: PENDING]
*Traceability: FR-4.1–4.4, NFR-4 · AC: AC-1, AC-5*
- [ ] Write failing tests asserting (a) report JSON contains per-category rates keyed by payload id, (b) no raw payload text appears anywhere in report output, (c) diff against baseline classifies regressions vs improvements, (d) `--update-baseline` is the only write path and is never implicit; verify they fail.
- [ ] Implement `.benchmarks/redteam/report.py` (JSON + Markdown summary); tests now pass.
- [ ] Run the first full deterministic suite and commit the resulting `redteam-baseline.json`.
- **Dependencies:** Task 5.

### Task 9: CI gate wiring (review-only artifact) [STATUS: PENDING]
*Traceability: FR-5.1–5.3, US-3 · AC: AC-5*
- [ ] Draft the GitHub Actions job change (run `pytest -m redteam` in the backend CI job; fail on LEG rejection or baseline regression) as a written change proposal in this task's notes.
- [ ] Confirm no agent edits to `**/.github/workflows/**` per FR-5.3 and repository guardrails; hand the proposal to a human for application.
- **Dependencies:** Task 8.

---

## Track E: Fast-Track Hardening (design-time findings)

### Task 10: Nonce-delimited user data sections [STATUS: PENDING]
*Traceability: FR-6.1, FR-6.3 · AC: AC-6*
- [ ] Write failing test asserting `build_user_data_prompt` emits a fresh random delimiter per call and that a `PI-DLM` payload containing the old static delimiter remains contained inside the user-data section; verify it fails.
- [ ] Modify `app/utils/prompt_helpers.py` to generate per-request nonce delimiters; test passes.
- [ ] Update all call sites (`claim_extractor.py`, `analysis_service.py`); keep `input_sanitizer.wrap_user_data` consistent or remove it if superseded.
- [ ] Update/extend `backend/tests/test_prompt_helpers.py` (or equivalent); run full `pytest` and confirm no existing test regresses.
- **Dependencies:** none (independent of corpus work).

### Task 11: NFKC normalization before pattern matching [STATUS: PENDING]
*Traceability: FR-6.2, FR-6.3 · AC: —*
- [ ] Write failing tests asserting full-width and homoglyph variants of denylist phrases (e.g., full-width "ignore previous instructions", Cyrillic lookalikes) are caught after NFKC normalization, and that existing benign unicode text still passes; verify they fail.
- [ ] Decide layer: extend `prism_sanitizer_rs` (preferred, performance) or Python-side normalization in `sanitize_input` before the Rust call; implement; tests pass.
- [ ] Update corresponding unit tests (`tests/test_input_sanitizer.py`); run full `pytest` and confirm no regressions.
- **Dependencies:** none.

> [!NOTE]
> After Track E lands, re-run the deterministic suite and record changed bypass rates; update the baseline via the explicit `--update-baseline` command only, and note the delta in the PR description.

---

## Definition of Done

- [ ] All tracks complete with zero-drift status markers.
- [ ] `pytest -m redteam` passes in under 60s with zero network calls.
- [ ] At least one full live probe run executed against Vertex AI with results committed as baseline + report.
- [ ] H1 (delimiter forgery) and H2 (denylist bypass) hypotheses explicitly confirmed or refuted in the report.
- [ ] No `LEG` payload rejected; CI gate proposal documented for human application.
