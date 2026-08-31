# Architecture Design: Prompt-Injection Red Team for the Transcript-to-Gemini Pipeline

## Executive Summary

This document specifies the architecture of a **prompt-injection red-team harness** for Perspective Prism's LLM pipeline. Every Gemini call in this system consumes attacker-influenceable text — YouTube transcripts, LLM-extracted claim fields, and Google Search evidence snippets. This spec defines a repeatable, two-mode evaluation harness that (1) deterministically probes the sanitization layer offline, and (2) optionally fires a payload corpus through the real ADK 2.0 agents to measure end-to-end injection success, producing regression-trackable reports.

The harness **audits existing controls; it does not replace them**. Hardening work discovered by red-teaming is captured as a fast-track remediation section.

---

## 1. Threat Model & Injection Surface

### 1.1 Data Flow Diagram

```mermaid
graph TD
    subgraph Attacker-Influenceable Inputs
        T[YouTube Transcript<br/>crafted narration / auto-captions]
        S[Google Search Snippets<br/>SEO-poisoned pages]
    end

    subgraph FastAPI Backend
        SAN[input_sanitizer.py<br/>+ prism_sanitizer_rs]
        CE[ClaimExtractor<br/>ExtractorAgent]
        PA[PerspectiveAnalysis<br/>perspective_agent]
        BA[BiasAnalysis<br/>bias_agent]
    end

    subgraph Gemini 3.x via Vertex AI
        M1[gemini-3.5-flash-lite primary]
        M2[gemini-3.1-flash-lite backup]
    end

    T -->|Stage 1: direct injection| SAN
    SAN -->|delimited prompt| CE --> M1
    CE -->|Stage 2: second-order<br/>claim.text + claim.context| SAN
    S -->|Stage 3: evidence injection| SAN
    SAN --> PA --> M1
    SAN --> BA --> M1
    CE -.->|fallback| M2
    PA -.->|fallback| M2
```

### 1.2 Injection Stages

| Stage | Vector | Entry point in code | Attacker control |
|---|---|---|---|
| **S1: Direct** | Crafted transcript narration or auto-caption payload | `ClaimExtractor.extract_claims()` → `sanitize_input(formatted_transcript, 100000)` | Full text control (video author uploads spoken payload) |
| **S2: Second-order** | Payload survives extraction into `claim.text` / `claim.context`, re-enters prompts at analysis stage | `AnalysisService.analyze_perspective()` / `analyze_bias_and_deception()` | Indirect — payload must survive extraction verbatim enough |
| **S3: Evidence** | SEO-poisoned pages whose title/snippet carry a payload | `sanitize_evidence_text(f"- {e.title}: {e.snippet}")` | Full text control over published page content |

### 1.3 Injection Goals (what success looks like for an attacker)

1. **Assessment manipulation** — force `deception_rating`, `stance`, or `confidence` values (e.g., launder a deceptive video to `Likely True`).
2. **Instruction drift** — make an agent adopt a persona, ignore its rubric, or emit off-task content.
3. **Delimiter escape** — break out of the `===USER DATA START/END===` section and inject fake instructions.
4. **Data exfiltration** — leak system prompt content or canary values into output fields surfaced to the UI.
5. **Denial of service** — trigger mass sanitization rejections (false positives) or error-claim floods.

---

## 2. Current Defenses (Evidence-Based Assessment)

Audited from source (`app/utils/input_sanitizer.py`, `app/services/claim_extractor.py`, `app/services/analysis_service.py`, `app/utils/prompt_helpers.py`):

| Control | Location | Strength | Suspected weakness (to be proven/disproven by red team) |
|---|---|---|---|
| Regex denylist (15 patterns) | `prism_sanitizer_rs.contains_suspicious_patterns` | Blocks naive English payloads | Paraphrase, non-English, homoglyphs, split payloads, case tricks |
| Control-char rejection | `prism_sanitizer_rs.contains_control_characters` | Blocks zero-width/invisible chars | Unicode normalization edge cases (NFC lookalikes are not control chars) |
| Special-char escaping | `prism_sanitizer_rs.escape_special_characters` | Protects quote structure | Does **not** neutralize `=` runs — delimiter forgery may survive |
| Length truncation | `truncate_text` (100k for transcripts) | Limits payload size | Payloads can sit beyond truncation boundary or forge `...[TRUNCATED]...` |
| `===USER DATA===` delimiters | `build_user_data_prompt` | Clear data/instruction boundary | **Static strings — forgeable from inside transcript content** |
| Data-first, instruction-last ordering | `build_user_data_prompt` | Reduces naive injection | Not a guarantee against embedded instructions |
| Pydantic `output_schema` | all ADK agents | Structure cannot be escaped | String field *content* is still attacker-influenceable |
| Structured error claims | sanitizer-failure paths | No crash on rejection | Rejection itself is a DoS vector for legitimate transcripts quoting attack phrases |

**Key hypothesis to test (H1):** a transcript containing literal `===USER DATA END===` followed by forged instructions escapes the delimited section, because neither the Rust sanitizer nor escaping neutralizes delimiter text.

**Key hypothesis to test (H2):** the English-only denylist is bypassable by paraphrase and non-English payloads, allowing S1/S3 injection to reach Gemini.

---

## 3. Red-Team Harness Architecture

### 3.1 Component Diagram

```mermaid
graph LR
    subgraph .benchmarks/redteam/
        C[(Payload Corpus<br/>payloads/*.yaml)]
        DR[Deterministic Runner<br/>sanitizer probe]
        LR[Live Runner<br/>ADK agent probe]
        J[Judge Layer<br/>canary + heuristic + LLM judge]
        R[Reporter<br/>JSON + Markdown + baseline diff]
    end

    subgraph backend
        SAN[input_sanitizer]
        AG[ExtractorAgent /<br/>perspective / bias agents]
    end

    C --> DR --> SAN
    C --> LR --> AG --> J --> R
    DR --> R
```

### 3.2 Components

* **Payload Corpus** (`payloads/*.yaml`): versioned YAML files, one per taxonomy category. Each payload carries `id`, `stage` (S1/S2/S3), `technique`, `payload`, `expected` (blocked | passes-but-safe | detected-live), and `severity`. A separate **legitimate corpus** contains real-world-style journalism transcripts that MUST NOT be rejected (false-positive guard).
* **Deterministic Runner**: executes payloads through `sanitize_input` / `contains_suspicious_patterns` with **zero network calls**. Classifies each as blocked or passed-through; passed payloads are additionally checked for delimiter-forgery survival and Unicode-normalization tricks.
* **Live Runner**: opt-in mode (`--live`, requires `GCP_PROJECT` Vertex AI env per AGENTS.md invariants). Feeds passed payloads into the real `ClaimExtractor` / `AnalysisService` agents with mocked transcript/evidence fixtures. Concurrency capped by the existing tier-aware semaphore; per-run call budget enforced (default 100 calls) to protect quota.
* **Judge Layer** (three tiers, cheapest first):
  1. **Canary check** — system instructions carry a random per-run canary token; any canary in output = exfiltration success.
  2. **Heuristic check** — did output adopt demanded values (e.g., injected `deception_rating: 0`), personas, or off-schema content in string fields?
  3. **LLM judge** — `gemini-3.5-flash-lite` judges ambiguous outputs ("did this analysis follow its rubric or the embedded instruction?"), itself wrapped in USER DATA delimiters and schema-constrained.
* **Reporter**: emits `redteam-report.json` + Markdown summary with per-category pass/block/success rates, diffs against the stored baseline (`redteam-baseline.json`), and fails CI only on **regressions** (new bypasses vs baseline), never on absolute counts.

### 3.3 Execution Modes

| Mode | Command | Network | Quota | Runs in CI |
|---|---|---|---|---|
| Deterministic | `pytest -m redteam` | None | None | Yes |
| Live | `python -m redteam.run --live --budget 100` | Vertex AI | Capped | No (manual/nightly) |

---

## 4. Payload Taxonomy

| Category | Code | Description |
|---|---|---|
| Direct imperative | `PI-DIR` | "Ignore previous instructions…" variants |
| Paraphrase evasion | `PI-PAR` | Semantic equivalents avoiding denylist phrases |
| Delimiter forgery | `PI-DLM` | Embedded `===USER DATA END===` + forged instructions |
| Role assumption | `PI-ROL` | "You are now…", persona hijack |
| Output manipulation | `PI-OUT` | Demands for specific scores/stances/assessments |
| Exfiltration | `PI-EXF` | Attempts to surface system prompt / canary |
| Unicode/homoglyph | `PI-UNI` | Lookalike characters, full-width Latin, confusables |
| Multilingual | `PI-MUL` | Payloads in non-English languages |
| Split payload | `PI-SPL` | Instructions fragmented across transcript segments |
| Truncation games | `PI-TRN` | Payloads at/after the 100k boundary; forged `[TRUNCATED]` markers |
| Encoding tricks | `PI-ENC` | Base64/hex-encoded instruction blobs asking for decode |
| Legitimate controls | `LEG` | Journalism transcripts quoting attack phrases — must pass |

---

## 5. Constraints & Invariants

* **Vendor lock-in**: live mode and LLM judge use Gemini 3.x exclusively (`gemini-3.5-flash-lite` / `gemini-3.1-flash-lite`) via ADK 2.0 / `google-genai` in Vertex AI mode. No other providers or SDKs.
* **No new dependencies** beyond `pytest`/`pytest-asyncio` already in `backend/requirements.txt`; corpus format is YAML (add `pyyaml` only if not transitively available).
* **Quota discipline**: live runs enforce a hard call budget and reuse the tier-aware semaphore. Deterministic mode must remain the CI default.
* **Sanitizer bypass findings are confidential-grade**: reports MUST NOT include copy-paste-ready payloads in artifacts committed to the public repo — payloads live in the corpus (already in-repo) but reports reference payload IDs only.
* **Zero-drift**: harness code, corpus, and this spec's task statuses must remain in lockstep.

---

## 6. Fast-Track Hardening (design-time findings)

These two weaknesses are evident from code inspection and are included as remediation tasks rather than left for red-team discovery:

1. **Delimiter forgery (H1)**: replace static `===USER DATA START/END===` with a per-request random nonce delimiter (e.g., `===USER DATA a1b2c3 START===`) generated in `build_user_data_prompt`, since attacker text cannot guess the nonce.
2. **Unicode normalization**: apply NFKC normalization in the sanitizer *before* pattern matching so homoglyph/full-width variants collapse to their ASCII equivalents prior to denylist evaluation.
