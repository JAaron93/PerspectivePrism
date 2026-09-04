# Rust Native Core Engine & Latency Optimization Tasks Specification

## Execution Plan & Track Overview

This task breakdown organizes the implementation of the Rust Native Core Engine into five granular, test-driven tracks. Tracks 2, 3, and 4 can be developed with high parallelism once Track 1 establishes the updated crate dependencies and linker configurations.

```
┌────────────────────────────────────────────────────────────────────────┐
│                        TRACK DEPENDENCY GRAPH                          │
├────────────────────────────────────────────────────────────────────────┤
│ Track 1: Cargo Infrastructure & Dependencies                           │
│   │                                                                    │
│   ├──> Track 2: Candidate A — Unified Sanitizer Pipeline (FR-1)       │
│   │                                                                    │
│   ├──> Track 3: Candidate B — Aho-Corasick Fast-Path Classifier (FR-2) │
│   │                                                                    │
│   ├──> Track 4: Candidate C — Native Transcript Processor (FR-3)      │
│   │                                                                    │
│   └──> Track 5: Candidate D — Prompt Nonce & Delimiter Guard (FR-4)    │
│                                                                        │
│ All Tracks (2, 3, 4, 5) ─────────────────────────────────────────────> │
│   │                                                                    │
│   └──> Track 6: End-to-End Benchmarking, Full Suite & ADR             │
└────────────────────────────────────────────────────────────────────────┘
```

---

## Track 1: Cargo Infrastructure & Linker Safety

> [!IMPORTANT]
> All tasks in Track 1 must complete before proceeding to Tracks 2, 3, or 4.

### Task 1.1: Update `Cargo.toml` with Crates & Feature-Gated `extension-module`
- **Description**: Add `unicode-normalization` and `aho-corasick` to `backend/prism_sanitizer_rs/Cargo.toml`. Feature-gate `pyo3/extension-module` under the `extension-module` feature so `cargo test --no-default-features` runs cleanly without macOS linker errors.
- **Traceability**: `NFR-3`
- **Dependencies**: None
- **Acceptance Criteria**:
  - `Cargo.toml` includes `unicode-normalization = "0.1.24"` and `aho-corasick = "1.1.3"`.
  - `default = ["extension-module"]` is declared.
  - `cargo check --no-default-features` passes.
- **Status**: `[STATUS: COMPLETED]`

### Task 1.2: Native Rust Test Harness Setup
- **Description**: Establish the native unit testing module inside `backend/prism_sanitizer_rs/src/lib.rs` configured to run with `cargo test --no-default-features`.
- **Traceability**: `NFR-3`
- **Dependencies**: Task 1.1
- **Acceptance Criteria**:
  - Existing Rust tests (`test_contains_control_characters`, `test_contains_suspicious_patterns`, `test_escape_special_characters`) execute and pass under `cargo test --no-default-features`.
- **Status**: `[STATUS: COMPLETED]`

---

## Track 2: Candidate A — Full-Pipeline Unified Sanitizer

> [!TIP]
> **PARALLEL EXECUTION**: Can be implemented in parallel with Track 3 and Track 4 once Track 1 is complete.

### Task 2.1: Write Rust Unit Tests for Unified `sanitize_input` (TDD)
- **Description**: Add unit tests in Rust covering empty strings, NFKC character normalization, control character rejection, suspicious prompt injection rejection, quote/brace/backslash escaping, and trailing backslash-safe truncation.
- **Traceability**: `US-1`, `FR-1.1`, `FR-1.2`, `FR-1.3`, `FR-1.4`
- **Dependencies**: Track 1
- **Acceptance Criteria**:
  - Failing unit tests written in `backend/prism_sanitizer_rs/src/lib.rs`.
- **Status**: `[STATUS: COMPLETED]`

### Task 2.2: Implement `sanitize_input` and Truncation in Rust
- **Description**: Implement `sanitize_input` in Rust using `unicode_normalization`, byte-level control checks, Aho-Corasick pattern matching, single-pass escaping, and backslash-safe truncation.
- **Traceability**: `FR-1.1`, `FR-1.3`, `FR-1.4`
- **Dependencies**: Task 2.1
- **Acceptance Criteria**:
  - All unit tests in Task 2.1 pass via `cargo test --no-default-features`.
- **Status**: `[STATUS: COMPLETED]`

### Task 2.3: Export `PySanitizationError` in PyO3 Module
- **Description**: Declare a custom exception `PySanitizationError` inheriting from `PyValueError` in PyO3 and bind it to the Python module export.
- **Traceability**: `FR-1.2`
- **Dependencies**: Task 2.2
- **Acceptance Criteria**:
  - Python can import `SanitizationError` from `prism_sanitizer_rs`.
  - Raising `PySanitizationError` in Rust is caught as `SanitizationError` / `ValueError` in Python.
- **Status**: `[STATUS: COMPLETED]`

### Task 2.4: Update `app/utils/input_sanitizer.py` to Use Unified Rust Sanitizer
- **Description**: Update `sanitize_input()` in `backend/app/utils/input_sanitizer.py` to call `prism_sanitizer_rs.sanitize_input()` in a single FFI crossing, handling `field_name` formatting and maintaining pure-Python fallback.
- **Traceability**: `FR-1.5`, `NFR-2`, `NFR-4`
- **Dependencies**: Task 2.3
- **Acceptance Criteria**:
  - Python test suite `pytest tests/test_schemas_and_sanitizer.py tests/test_input_sanitizer.py tests/test_dry_spec_helpers.py` passes 100% green.
- **Status**: `[STATUS: COMPLETED]`

---

## Track 3: Candidate B — Aho-Corasick Deterministic Fast-Path Classifier

> [!TIP]
> **PARALLEL EXECUTION**: Can be implemented in parallel with Track 2 and Track 4 once Track 1 is complete.

### Task 3.1: Write Rust Unit Tests for `contains_political_keywords` (TDD)
- **Description**: Add unit tests in Rust verifying case-insensitive matching for political keywords ("president", "senate", "tax", "election", "supreme court") and non-matching benign words ("mario", "speedrun", "recipe", "piano").
- **Traceability**: `US-2`, `FR-2.1`, `FR-2.2`
- **Dependencies**: Track 1
- **Acceptance Criteria**:
  - Unit tests written and failing prior to implementation.
- **Status**: `[STATUS: PENDING]`

### Task 3.2: Implement Aho-Corasick Automaton in Rust
- **Description**: Implement `static POLITICAL_AUTOMA: Lazy<AhoCorasick>` compiling the 65+ political keywords with `ascii_case_insensitive(true)` and expose `contains_political_keywords(&str) -> bool`.
- **Traceability**: `FR-2.1`, `FR-2.2`, `NFR-1`
- **Dependencies**: Task 3.1
- **Acceptance Criteria**:
  - `cargo test --no-default-features` passes for keyword matching tests.
- **Status**: `[STATUS: PENDING]`

### Task 3.3: Integrate Rust Keyword Filter in `content_classifier.py`
- **Description**: Refactor `evaluate_deterministic_fast_path` in `backend/app/services/content_classifier.py` to delegate keyword checking to `prism_sanitizer_rs.contains_political_keywords()` across `title`, `channel_name`, `tags`, and `description_snippet`.
- **Traceability**: `FR-2.3`
- **Dependencies**: Task 3.2
- **Acceptance Criteria**:
  - `pytest tests/test_content_classifier.py` passes 100% green.
- **Status**: `[STATUS: PENDING]`

---

## Track 4: Candidate C — Native Transcript Segment Processor

> [!TIP]
> **PARALLEL EXECUTION**: Can be implemented in parallel with Track 2 and Track 3 once Track 1 is complete.

### Task 4.1: Write Rust Unit Tests for `format_and_sanitize_transcript` (TDD)
- **Description**: Add unit tests in Rust verifying segment timestamp formatting `[MM:SS] text\n`, buffer truncation at `max_length`, and control character / injection pattern rejection.
- **Traceability**: `US-3`, `FR-3.1`, `FR-3.2`, `FR-3.3`
- **Dependencies**: Track 1
- **Acceptance Criteria**:
  - Unit tests written and failing prior to implementation.
- **Status**: `[STATUS: PENDING]`

### Task 4.2: Implement `format_and_sanitize_transcript` in Rust
- **Description**: Implement `format_and_sanitize_transcript(segments: Vec<(f64, &str)>, max_length: usize) -> PyResult<String>` with pre-allocated buffer capacity and in-place timestamp formatting.
- **Traceability**: `FR-3.1`, `FR-3.2`, `FR-3.3`, `NFR-1`, `NFR-2`
- **Dependencies**: Task 4.1, Track 2 (utilizes unified sanitization logic)
- **Acceptance Criteria**:
  - `cargo test --no-default-features` passes for transcript formatting.
- **Status**: `[STATUS: PENDING]`

### Task 4.3: Integrate Native Transcript Formatting into `ClaimExtractor`
- **Description**: Update `ClaimExtractor.extract_claims()` in `backend/app/services/claim_extractor.py` to format and sanitize transcript segments via `prism_sanitizer_rs.format_and_sanitize_transcript()`, with fallback to existing Python logic.
- **Traceability**: `FR-3.4`
- **Dependencies**: Task 4.2
- **Acceptance Criteria**:
  - `pytest tests/test_claim_extractor.py` passes 100% green.
- **Status**: `[STATUS: PENDING]`

---

## Track 5: Candidate D — Prompt Nonce & Delimiter Isolation Guard

> [!TIP]
> **PARALLEL EXECUTION**: Can be implemented in parallel with Tracks 2, 3, and 4 once Track 1 is complete.

### Task 5.1: Write Rust Unit Tests for `contains_delimiter_forgery` & `build_user_data_prompt` (TDD)
- **Description**: Add unit tests in Rust covering detection of `===USER DATA` in untrusted payloads, active closing delimiter collisions, and prompt assembly across custom, empty, and auto-generated nonces.
- **Traceability**: `US-4`, `FR-4.1`, `FR-4.2`, `FR-4.3`
- **Dependencies**: Track 1
- **Acceptance Criteria**:
  - Unit tests written and failing prior to implementation in `prism_sanitizer_rs`.
- **Status**: `[STATUS: PENDING]`

### Task 5.2: Implement Delimiter Check & Prompt Builder in Rust
- **Description**: Implement `contains_delimiter_forgery` and `build_user_data_prompt` in `prism_sanitizer_rs` with contiguous memory pre-allocation and secure hex nonce generation.
- **Traceability**: `FR-4.1`, `FR-4.2`, `FR-4.3`
- **Dependencies**: Task 5.1
- **Acceptance Criteria**:
  - `cargo test --no-default-features` passes for delimiter and prompt builder tests.
- **Status**: `[STATUS: PENDING]`

### Task 5.3: Integrate Native Prompt Wrapping into `prompt_helpers.py`
- **Description**: Update `build_user_data_prompt()` and `wrap_user_data()` in `backend/app/utils/prompt_helpers.py` and `backend/app/utils/input_sanitizer.py` to delegate to `prism_sanitizer_rs`, maintaining pure-Python fallback.
- **Traceability**: `FR-4.4`
- **Dependencies**: Task 5.2
- **Acceptance Criteria**:
  - `pytest tests/test_dry_spec_helpers.py tests/test_redteam_probe.py` passes 100% green.
- **Status**: `[STATUS: PENDING]`

---

## Track 6: End-to-End Benchmarking, Full Suite & Documentation

### Task 6.1: Build Native Extension & Run Comprehensive Test Suites
- **Description**: Compile the updated `prism_sanitizer_rs` in editable mode with toolchain binary on PATH and run the complete backend, extension, and frontend test suites.
- **Traceability**: `NFR-1`, `NFR-3`
- **Dependencies**: Tracks 2, 3, 4, 5
- **Acceptance Criteria**:
  - Full pytest suite (all 219+ tests) passes 100% green.
  - Extension Vitest suite passes 100% green.
- **Status**: `[STATUS: PENDING]`

### Task 6.2: Create Micro-Benchmark Script & Measure Latency Speedups
- **Description**: Create a benchmark script in `.benchmarks/` evaluating latency on 10k, 50k, and 100k character inputs comparing Python baseline vs native Rust execution.
- **Traceability**: `NFR-1`
- **Dependencies**: Task 6.1
- **Acceptance Criteria**:
  - Demonstrates >75% latency reduction on 100k character sanitization and sub-millisecond transcript processing.
- **Status**: `[STATUS: PENDING]`

### Task 6.3: Update Centralized Documentation & Record Architecture Decision (ADR 006)
- **Description**: Update `docs/helper_functions.md` with new native functions and document the architectural design as `docs/adr/006-rust-native-core-engine.md`.
- **Traceability**: Architecture Governance
- **Dependencies**: Task 6.2
- **Acceptance Criteria**:
  - `docs/helper_functions.md` reflects unified functions.
  - `docs/adr/006-rust-native-core-engine.md` committed.
- **Status**: `[STATUS: PENDING]`
