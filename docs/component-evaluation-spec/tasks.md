# Component-Level Agent-as-a-Judge Evaluation Implementation Tasks

## Track 1: Evaluation Dependencies & Golden Fixtures

> [!TIP]
> **PARALLEL EXECUTION**: Tasks in Track 1 define data contracts, manifests, and test corpora. They can be created in parallel with Track 2 (Security Sanitization) and Track 3 (Telemetry Infrastructure).

- [ ] **T1.1: Verify & Lock Evaluation Dependencies in Manifests**
  - **Description**: Verify `backend/requirements.txt` and `backend/pyproject.toml` explicitly declare all required evaluation packages (`google-adk>=2.4.0`, `google-genai>=2.9.0`, `pydantic>=2.13.0`, `opentelemetry-api>=1.20.0`, `opentelemetry-sdk>=1.20.0`). Add `tabulate>=0.9.0` for console reporting without unapproved external SDKs.
  - **Dependencies**: None
  - **Traceability**: NFR1, Zero-Drift Invariant

- [ ] **T1.2: Author Pre-Classifier Golden Dataset**
  - **Description**: Create `backend/app/evals/datasets/pre_classifier_golden.json` containing minimum 30 diverse test cases with metadata, transcript previews, and annotated target eligibility (`is_analysable`, `expected_category`) targeting `PreClassifierService`. Include edge cases for political satire, political AMVs with debate audio, technical documentaries, and mechanical gaming speedruns.
  - **Dependencies**: None
  - **Traceability**: FR1, US1, NFR3

- [ ] **T1.3: Author Claim Extractor Golden Dataset**
  - **Description**: Create `backend/app/evals/datasets/claim_extractor_golden.json` containing 15 full video transcript segments and corresponding gold-standard claims with start/end timestamps and qualifying context.
  - **Dependencies**: None
  - **Traceability**: FR2, US1, NFR3

- [ ] **T1.4: Author Perspective Stance Golden Dataset**
  - **Description**: Create `backend/app/evals/datasets/perspective_stance_golden.json` containing 40 test cases across the 4 perspectives (Scientific, Journalistic, Partisan Left, Partisan Right) with claims, frozen search snippets, gold stances (`SUPPORTS`, `REFUTES`, `AMBIGUOUS`), and hallucination bait annotations.
  - **Dependencies**: None
  - **Traceability**: FR3, US2, NFR3

- [ ] **T1.5: Author Bias & Deception Golden Dataset**
  - **Description**: Create `backend/app/evals/datasets/bias_deception_golden.json` containing 25 annotated claims with gold standard deception ratings ($0.0$ to $10.0$), framing bias indicators, and omission annotations.
  - **Dependencies**: None
  - **Traceability**: FR4, NFR3

- [ ] **T1.6: Author Alethiology Epistemic Golden Dataset**
  - **Description**: Create `backend/app/evals/datasets/alethiology_golden.json` containing 30 philosophical and rhetorical excerpts evenly distributed across all 6 canonical truth theories (Correspondence, Coherence, Pragmatic, Perspectivism, Consensus, Deflationary).
  - **Dependencies**: None
  - **Traceability**: FR5, US3, NFR3

---

## Track 2: Security Sanitization & Zero-Trust Judge Defense

> [!TIP]
> **PARALLEL EXECUTION**: Track 2 can be developed concurrently with Track 1 and Track 3.

- [ ] **T2.1: Implement Structural Delimitation and Tag Neutralizer**
  - **Description**: In `backend/app/evals/security/eval_sanitizer.py`, implement `sanitize_eval_input()` to strip instruction delimiters (`[INST]`, `[/INST]`, `<<SYS>>`, `<</SYS>>`, `<|im_start|>`, `<|im_end|>`) and regex-neutralize scoring directives attempting to force judge verdicts (`\b(assign|give|set|rate|award|score|force)\b.*?\b(maximum|highest|perfect|5|10)\b`). Wrap untrusted outputs in per-request random nonces (`===JUDGE DATA <nonce> START/END===`) and `<untrusted_model_output>` XML sandboxes.
  - **Dependencies**: None
  - **Traceability**: FR14, FR15

- [ ] **T2.2: TDD & BDD Unit Tests for Judge Sanitization**
  - **Description**: In `backend/tests/test_eval_sanitizer.py`, create unit tests and BDD Gherkin scenarios testing tag neutralization, scoring directive redaction, and XML escaping on malicious evaluation targets.
  - **Dependencies**: T2.1
  - **Traceability**: FR14, FR15

---

## Track 3: OpenTelemetry GenAI Telemetry & Cloud Trace Infrastructure

- [ ] **T3.1: Configure OpenTelemetry GenAI Exporter to Google Cloud Trace**
  - **Description**: In `backend/app/evals/telemetry/tracer.py`, configure OpenTelemetry GenAI Semantic Conventions (`gen_ai.system`, `gen_ai.request.model`, `gen_ai.evaluation.metric_name`, `gen_ai.evaluation.score`, `gen_ai.usage.input_tokens`, `gen_ai.usage.output_tokens`, `total_cost`) exporting directly to Google Cloud Trace using ADC. Implement `DISABLE_CLOUD_TRACE` flag precedence with local fallback span emission.
  - **Dependencies**: None
  - **Traceability**: FR17, FR18, FR19, NFR1

- [ ] **T3.2: TDD Unit Tests for OpenTelemetry Tracing**
  - **Description**: In `backend/tests/test_eval_telemetry.py`, verify that evaluation spans capture exact token usage metadata, compute accurate cost per token for Gemini models, and emit fallback spans when Cloud Trace is disabled.
  - **Dependencies**: T3.1
  - **Traceability**: FR17, FR19

---

## Track 4: Google ADK 2.0 Agent-as-a-Judge Implementations

> [!TIP]
> **PARALLEL EXECUTION**: Each judge in Track 4 can be implemented and tested concurrently once Track 1 (Datasets), Track 2 (Sanitization), and Track 3 (Telemetry) are established.

- [ ] **T4.1: Define Evaluation Pydantic Rubrics**
  - **Description**: In `backend/app/evals/judges/rubrics.py`, implement Pydantic models with `ConfigDict(extra="forbid")`:
    - `ClaimExtractionRecallRubric` (semantic recall, verifiability precision, hallucinated claims).
    - `PerspectiveFaithfulnessRubric` (groundedness score 1-5, stance correctness, hallucinated external facts).
    - `AlethiologyEvaluationRubric` (6-theory match, descriptive neutrality score 1-5, neutrality violations list).
    - Include `is_fallback: bool = False` across all rubric definitions.
  - **Dependencies**: None
  - **Traceability**: FR10, FR11, FR12, FR13, FR16

- [ ] **T4.2: Implement Claim Extraction Recall & Verifiability Judge**
  - **Description**: In `backend/app/evals/judges/claim_extraction_judge.py`, implement `evaluate_claim_extraction()` using Google ADK 2.0 `Agent(name="claim_extraction_judge", model="gemini-3.5-flash-lite", output_schema=ClaimExtractionRecallRubric)` executed via `execute_adk_agent()` in Vertex AI mode to evaluate extracted claims against gold references.
  - **Dependencies**: T1.3, T2.1, T3.1, T4.1
  - **Traceability**: FR9, FR10, US1

- [ ] **T4.3: Implement Perspective Faithfulness & Groundedness Judge**
  - **Description**: In `backend/app/evals/judges/perspective_faithfulness_judge.py`, implement `evaluate_perspective_faithfulness()` using Google ADK 2.0 `Agent` and `execute_adk_agent()` to audit stance adherence against search evidence and detect prior knowledge hallucinations.
  - **Dependencies**: T1.4, T2.1, T3.1, T4.1
  - **Traceability**: FR9, FR11, US2

- [ ] **T4.4: Implement Alethiology Epistemic Neutrality Judge**
  - **Description**: In `backend/app/evals/judges/alethiology_judge.py`, implement `evaluate_alethiology_neutrality()` using Google ADK 2.0 `Agent` and `execute_adk_agent()` to verify 6-theory classification accuracy and enforce strict descriptive neutrality (zero normative/pejorative slurs).
  - **Dependencies**: T1.6, T2.1, T3.1, T4.1
  - **Traceability**: FR9, FR12, US3

- [ ] **T4.5: TDD & BDD Tests for ADK Judges**
  - **Description**: In `backend/tests/test_adk_judges.py`, create mock-verified unit tests verifying rubric serialization, hallucination detection on ungrounded stances, and neutrality failure detection when biased language is intentionally injected into alethiology outputs.
  - **Dependencies**: T4.1, T4.2, T4.3, T4.4
  - **Traceability**: FR10, FR11, FR12, US1, US2, US3

---

## Track 5: Native Quantitative Evaluation Runners

- [ ] **T5.1: Implement Pointwise Quantitative Metric Runner**
  - **Description**: In `backend/app/evals/runners/quantitative_runner.py`, implement `run_pre_classifier_eval()` and `calculate_timestamp_iou()` using `google-genai` and native calculation routines to compute F1, precision, recall, and exact match on `PreClassifierService` results and extraction timestamp IoU.
  - **Dependencies**: T1.2, T3.1
  - **Traceability**: FR6, NFR4

- [ ] **T5.2: Implement Pairwise Model Benchmark Runner with Position Flipping**
  - **Description**: In `backend/app/evals/runners/pairwise_runner.py`, implement `run_pairwise_model_benchmark()` using `google-genai` with 50% presentation order flipping and $4\times$ multi-sampling to benchmark model candidate upgrades (e.g. `gemini-3.5-flash-lite` vs `gemini-3.8-flash`) eliminating positional judge bias.
  - **Dependencies**: T5.1
  - **Traceability**: FR7, NFR2

- [ ] **T5.3: TDD Unit Tests for Quantitative Eval Runners**
  - **Description**: In `backend/tests/test_quantitative_eval_runner.py`, test the execution of quantitative runners against mocked responses, ensuring metric aggregation tables and confusion matrices are formatted accurately.
  - **Dependencies**: T5.1, T5.2
  - **Traceability**: FR6, FR7

---

## Track 6: CI Pytest Integration, Benchmark CLI & Aggregation Reporting

- [ ] **T6.1: Implement Clean Benchmark Aggregator with Fallback Isolation**
  - **Description**: In `backend/app/evals/reporting/aggregator.py`, implement `aggregate_benchmark_results(results: list[dict]) -> dict` calculating mean scores, confidence intervals, total token usage, and total dollar cost. Filter out `is_fallback == True` records when computing mean judge scores and output explicit `fallback_count`.
  - **Dependencies**: T4.1, T5.1
  - **Traceability**: FR16, FR21

- [ ] **T6.2: Implement Benchmark CLI & Markdown Summary Generator**
  - **Description**: In `backend/app/evals/cli.py`, author a CLI utility `python -m app.evals.cli --component [pre_classifier|extractor|perspective|bias|alethiology|all]` that runs the evaluation matrix, writes markdown reports to `artifacts/eval_results/`, and prints console summary tables.
  - **Dependencies**: T6.1
  - **Traceability**: FR21

- [ ] **T6.3: Register Pytest Markers & End-to-End Suite Verification**
  - **Description**: Update the `[tool.pytest.ini_options]` section in `backend/pyproject.toml` with `eval: mark test as component-level evaluation benchmark`. Create `backend/tests/test_component_evaluations_e2e.py` executing offline component evaluations across all 5 stages using frozen golden datasets.
  - **Dependencies**: T1.2-T1.6, T4.2-T4.4, T5.1, T6.1
  - **Traceability**: FR20, FR21, US1, US2, US3
