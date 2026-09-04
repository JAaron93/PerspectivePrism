# Component-Level Agent-as-a-Judge Evaluation Requirements

## 1. Glossary & System Conventions

- **Component-Level Evaluation**: An evaluation harness that isolates an individual agent or pipeline stage from upstream and downstream components by supplying frozen reference inputs and rating outputs against stage-specific ground truth.
- **Agent-as-a-Judge**: An evaluation pattern powered by **Google ADK 2.0** (`google.adk.agents.Agent`) where an autonomous reasoning agent evaluates model outputs against structured Pydantic rubrics via `execute_adk_agent()`, replacing naive single-turn LLM string judges.
- **Declared-Stack Quantitative Evaluation Runner**: High-performance, native evaluation runners using the **Google GenAI SDK** (`google-genai>=2.9.0`) in GCP Vertex AI mode and standard metric algorithms providing standardized pointwise, pairwise, and trajectory metrics.
- **Faithfulness / Groundedness**: The degree to which an agent's reasoning and stance strictly derive from the supplied context/evidence, without hallucinating external facts or leaking prior parametric memory.
- **Descriptive Neutrality**: The invariant governing epistemic evaluation where an evaluator objectively identifies *how* truth is structured without expressing normative, moral, or validity judgments.
- **Zero-Trust Judge Delimitation**: Security patterns that sandbox and sanitize untrusted evaluation inputs within explicit XML blocks and per-request random nonces, neutralizing instruction overrides or scoring directives before passing data to an evaluation agent.
- **Implicit Context Caching**: Automatic GCP Vertex AI token discount (up to 90%) achieved by maintaining static prefix tokens (system instructions, rubrics, few-shot examples) above 32,768 tokens.
- **Zero-Drift Invariant**: The requirement that specifications, data models, evaluation scripts, manifests, and telemetry remain in 100% synchronous lockstep with the declared repository environment.

---

## 2. Functional Requirements (FR)

### Track 1: Golden Fixture Datasets & Component Contracts

- **FR1 - Pre-Classifier Golden Dataset**: The system MUST provide `backend/app/evals/datasets/pre_classifier_golden.json` containing minimum 30 diverse test cases with annotations for:
  - YouTube metadata (`title`, `channel_name`, `category_id`, `category_name`, `tags`, `description_snippet`).
  - Spoken transcript preview (empty or text snippet).
  - Target eligibility (`is_analysable: bool`, `expected_category: str`).
  - Edge-case categories: Political Satire, Political AMVs with spoken audio, Documentaries in Education/Tech, Mechanical Gaming Speedruns, and Captionless Political Streams evaluated against `PreClassifierService`.
- **FR2 - Claim Extractor Golden Dataset**: The system MUST provide `backend/app/evals/datasets/claim_extractor_golden.json` containing minimum 15 full video transcript segments and corresponding human-verified gold claims with start/end timestamps and qualifying context.
- **FR3 - Perspective Stance Golden Dataset**: The system MUST provide `backend/app/evals/datasets/perspective_stance_golden.json` containing minimum 40 test cases covering the 4 perspectives (Scientific, Journalistic, Partisan Left, Partisan Right) with:
  - Distinct claim statements.
  - Frozen search evidence snippets (supporting, refuting, contradictory, ambiguous, or irrelevant).
  - Ground-truth stance (`SUPPORTS`, `REFUTES`, `AMBIGUOUS`).
  - Strict grounding annotations (flagging potential prior knowledge hallucinations).
- **FR4 - Bias & Deception Golden Dataset**: The system MUST provide `backend/app/evals/datasets/bias_deception_golden.json` containing minimum 25 annotated claims with gold standard deception ratings ($0.0$ to $10.0$), framing bias indicators, and omission annotations.
- **FR5 - Alethiology Golden Dataset**: The system MUST provide `backend/app/evals/datasets/alethiology_golden.json` containing minimum 30 philosophical and rhetorical excerpts evenly distributed across all 6 canonical truth theories:
  1. `Correspondence (Empirical)`
  2. `Coherence (Systemic Narrative)`
  3. `Pragmatic (Practical Utility)`
  4. `Perspectivism (Lived Experience)`
  5. `Consensus (Institutional Agreement)`
  6. `Deflationary (Rhetorical Endorsement)`

---

### Track 2: Native Quantitative Evaluation Runners

- **FR6 - Pointwise Quantitative Evaluation Runner**: The system MUST implement `backend/app/evals/runners/quantitative_runner.py` using native Python calculations and the `google-genai` SDK in GCP Vertex AI mode:
  - F1-score, accuracy, precision, and recall for `PreClassifierService`.
  - Timestamp Intersection-over-Union (IoU) calculation for `ClaimExtractor`.
  - Stance categorical accuracy for `AnalysisService`.
- **FR7 - Pairwise Model Benchmark Runner**: The evaluation suite MUST implement `backend/app/evals/runners/pairwise_runner.py` supporting pairwise model comparisons with position-flipping (50% reversed presentation order) and multi-sampling ($4\times$) to benchmark candidate models (e.g., `gemini-3.5-flash-lite` vs `gemini-3.8-flash`) while eliminating positional judge bias.
- **FR8 - Trajectory & Execution Path Evaluation**: The evaluation runner MUST support verifying execution paths and tool call sequences, calculating valid-to-total tool action ratios and required stage execution checks.

---

### Track 3: Google ADK 2.0 Agent-as-a-Judge Harnesses

- **FR9 - ADK 2.0 Autonomous Judge Configuration**: All qualitative evaluations MUST be executed using **Google ADK 2.0** (`google.adk.agents.Agent`) in GCP Vertex AI mode via `execute_adk_agent()`. Each judge agent MUST configure an explicit `output_key` matching the `output_key` parameter passed to `execute_adk_agent()` to ensure structured results are populated into session state. Naive single-turn unconstrained string completions are prohibited for qualitative judgment.
- **FR10 - Claim Extraction Recall & Verifiability Judge**: The system MUST implement `backend/app/evals/judges/claim_extraction_judge.py` using `ClaimExtractionRecallRubric` to measure:
  - Semantic claim recall (accounting for paraphrasing).
  - Verifiability precision (penalizing non-factual or purely rhetorical filler).
  - Hallucinated claim detection.
- **FR11 - Perspective Faithfulness & Groundedness Judge**: The system MUST implement `backend/app/evals/judges/perspective_faithfulness_judge.py` using `PerspectiveFaithfulnessRubric` to rate:
  - Evidence groundedness score ($1$ to $5$ scale).
  - Detection of external knowledge leakage not present in search snippets.
  - Logical validity of stance justifications.
- **FR12 - Alethiology Epistemic Neutrality Judge**: The system MUST implement `backend/app/evals/judges/alethiology_judge.py` using `AlethiologyEvaluationRubric` to rate:
  - Categorical 6-theory classification accuracy.
  - Descriptive neutrality score ($1$ to $5$ scale) asserting that no normative, pejorative, or moral judgments are expressed in the analysis.
- **FR13 - Strict Pydantic Schema & Session Key Enforcement**: All ADK evaluation agents MUST configure an explicit `output_key` matching caller invocation arguments and output strictly validated Pydantic models with `ConfigDict(extra="forbid")`.

---

### Track 4: Zero-Trust Delimitation & Adversarial Defense

- **FR14 - Structural XML & Nonce Sandboxing**: All inputs passed to evaluation judges (untrusted transcript text, model outputs, search snippets) MUST be enclosed in explicit XML containers (`<untrusted_model_output>`) and wrapped in per-request cryptographic nonces (`===JUDGE DATA <nonce> START/END===`).
- **FR15 - Directive & Scoring Override Neutralization**: The evaluation pre-processing pipeline MUST execute regex sanitization stripping:
  - System prompt delimiter tokens (`[INST]`, `[/INST]`, `<<SYS>>`, `<</SYS>>`, `<|im_start|>`, `<|im_end|>`).
  - Imperative scoring directives attempting to force judge verdicts (e.g., `assign 5/5`, `set score to maximum`, `ignore previous instructions`).
- **FR16 - Heuristic Fallback Isolation**: If an evaluation judge encounters a network timeout, rate limit, or structural parsing error, it MUST set `is_fallback: bool = True` in the evaluation result. Benchmark aggregation tables MUST isolate and exclude fallback results from genuine judge metric averages.

---

### Track 5: OpenTelemetry Cloud Trace & Observability

- **FR17 - OpenTelemetry GenAI Semantic Conventions**: All evaluation runners and judges MUST emit OpenTelemetry spans conformant to GenAI Semantic Conventions:
  - `gen_ai.system = "vertex_ai"`
  - `gen_ai.request.model = model_name`
  - `gen_ai.evaluation.metric_name = metric_name`
  - `gen_ai.evaluation.score = score_value`
  - `gen_ai.usage.input_tokens = tokens_in`
  - `gen_ai.usage.output_tokens = tokens_out`
  - `total_cost = calculated_cost`
- **FR18 - Cloud Trace Native Export**: Telemetry spans MUST export directly to Google Cloud Trace using Google Cloud Application Default Credentials (ADC). Third-party SaaS tracing tools (Weights & Biases, Weave, LangSmith, Phoenix) are strictly prohibited.
- **FR19 - Local Fallback Spans**: When Cloud Trace export is disabled via `DISABLE_CLOUD_TRACE=true`, the evaluation runner MUST emit local trace logs without raising runtime exceptions.

---

### Track 6: CI Integration & Benchmark Reporting

- **FR20 - Pytest Benchmark Configuration**: Evaluation suites MUST be callable via pytest using dedicated markers registered in `backend/pyproject.toml`:
  ```bash
  pytest -m "eval and component" backend/tests/
  ```
  allowing component evaluations to run separately from fast unit tests.
- **FR21 - Benchmark Report Rollup**: The evaluation harness MUST generate a structured benchmark report (`artifacts/eval_results/summary_<timestamp>.md` and `.json`) detailing:
  - Per-component pass rates, mean scores, and confidence intervals.
  - Detailed breakdown of faithfulness, neutrality, and claim recall.
  - Token consumption and dollar cost rollup.
  - Fallback counts and error rates.

---

## 3. Non-Functional Requirements (NFR)

- **NFR1 - Zero-SaaS Cloud-Native Invariant**: The evaluation suite MUST operate exclusively under GCP Vertex AI Mode with Application Default Credentials (`gcloud auth application-default login`), Google ADK 2.0, and Google GenAI SDK. No third-party API keys or external SaaS telemetry platforms are allowed.
- **NFR2 - Token Efficiency & Prefix Context Caching**: All evaluation prompts MUST maintain static prefixes (rubrics, instructions, few-shot examples) structured to qualify for Gemini Implicit Context Caching ($>32\text{k}$ prefix tokens, yielding 90% discount).
- **NFR3 - Execution Determinism & Fixture Freezing**: Component evaluations MUST be 100% reproducible offline using pre-recorded golden fixtures, requiring zero active calls to YouTube or Google Custom Search APIs during CI execution.
- **NFR4 - Concurrency & Quota Throttling**: Evaluation harnesses MUST obey `tier_max_concurrency` semaphore limits to avoid 429 quota exhaustion on Vertex AI evaluation runs.

---

## 4. User Stories & BDD Acceptance Criteria

### US1: Component Failure Attribution
**As a** backend engineer tuning the claim extraction prompt,  
**I want to** evaluate the `ClaimExtractor` agent against golden transcripts in isolation,  
**So that** I can measure claim recall and verifiability precision without triggering search or stance evaluation stages.

```gherkin
Scenario: Evaluating ExtractorAgent in isolation
  Given a golden transcript fixture with 12 verified factual assertions
  When the ExtractorAgent executes over the transcript
  And the ADK 2.0 ClaimExtractionJudge evaluates the output
  Then the judge produces a valid ClaimExtractionRecallRubric
  And the claim_recall_score is greater than or equal to 0.85
  And the verifiability_precision_score is greater than or equal to 0.90
  And zero external search queries are executed
```

### US2: Perspective Stance Faithfulness
**As an** AI reliability engineer,  
**I want to** ensure `PerspectiveAgent` never hallucinates stance based on prior model knowledge,  
**So that** users receive assessments strictly substantiated by retrieved search evidence.

```gherkin
Scenario: Detecting prior knowledge hallucination in stance analysis
  Given a controversial claim where popular consensus is TRUE
  And a retrieved search snippet that explicitly refutes or casts doubt on the claim
  When the PerspectiveAgent generates a perspective stance
  And the ADK 2.0 PerspectiveFaithfulnessJudge audits the stance and explanation
  Then the stance must be REFUTES or AMBIGUOUS
  And the evidence_groundedness_score must be 5
  And hallucinated_facts must be empty
```

### US3: Alethiology Descriptive Neutrality
**As a** philosophical framework designer,  
**I want to** evaluate the `AlethiologyService` for strict descriptive neutrality,  
**So that** non-empirical or fringe worldviews are classified accurately without judgmental language.

```gherkin
Scenario: Evaluating neutrality on systemic narrative coherence
  Given a transcript excerpt presenting a conspiratorial narrative
  When the AlethiologyService classifies the epistemic theory
  And the ADK 2.0 AlethiologyJudge evaluates the output
  Then the primary_theory must be "Coherence (Systemic Narrative)"
  And the descriptive_neutrality_score must be 5
  And neutrality_violations must be empty
```
