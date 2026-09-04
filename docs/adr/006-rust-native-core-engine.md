# ADR 006: Expansion of Rust Native Core Engine (Unified Sanitizer, Aho-Corasick Fast-Path, Transcript Processor, and Delimiter Guard)

## Status
Accepted (Tracks 1–4 Implemented; Tracks 5–6 Pending)

## Context
Perspective Prism processes long-form YouTube video transcripts (up to 100,000 characters) and multi-field video metadata through a multi-perspective analysis pipeline. Under ADR 001, a compiled Rust extension (`prism_sanitizer_rs`) was introduced via PyO3 to handle low-level security string checks (`contains_control_characters`, `contains_suspicious_patterns`, and `escape_special_characters`).

However, as the system grew with the introduction of ADR 005 (Pre-Classification Gate & Alethiology Specialist Agent) and extended transcript coverage:
1. **Chatty FFI Roundtrips**: For every string sanitized in `input_sanitizer.py`, Python made three separate FFI round-trips across the PyO3 boundary, interleaved with Python-level Unicode normalization and a reverse-loop in `truncate_text`.
2. **Backtracking Regex in Pre-Classification**: `evaluate_deterministic_fast_path` evaluated 65+ political and socio-economic keywords against incoming video titles, channel names, tags, and descriptions using Python's backtracking `re` module.
3. **Quadratic String Allocations in Transcript Formatting**: `ClaimExtractor.extract_claims()` formatted thousands of transcript segments via repeated string concatenation (`+=`) in a Python loop before invoking sanitization.
4. **Adversarial Delimiter Forgery**: Delimiter injection attacks required separate Python substring scanning to verify that untrusted payloads did not forge `===USER DATA` closing delimiters.

## Decision
We have decided to expand `prism_sanitizer_rs` into a unified **Rust Native Core Engine** covering four targeted hot-path operations:

1. **Candidate A: Full-Pipeline Unified Sanitizer**:
   Consolidates whitespace trimming, Unicode NFKC normalization (`unicode-normalization` crate), control character scanning, suspicious pattern detection, character escaping, and backslash-aware ellipsis truncation into a single-pass native function `sanitize_input()`. This eliminates chatty FFI roundtrips, reducing the crossing to exactly **one call per string**.
2. **Candidate B: Aho-Corasick Multi-Pattern Classifier**:
   Compiles all 65+ political keywords into a static `AhoCorasick` deterministic finite automaton (DFA) once at startup. Matches all keywords simultaneously in linear time \(O(N)\) over raw UTF-8 bytes with zero backtracking, powering the zero-token fast-path filter.
3. **Candidate C: Native Vectorized Transcript Processor**:
   Pre-allocates buffer capacity and formats timestamp markers `[MM:SS] text\n` across thousands of segments in a single contiguous memory allocation, enforcing the 100,000-character bound natively.
4. **Candidate D: Prompt Nonce & Delimiter Isolation Guard**:
   Inlines delimiter forgery detection (`contains_delimiter_forgery()`) and provides native nonced prompt wrapping (`build_user_data_prompt()`) with zero intermediate string copying.

### The 90/10 Non-Greedy Guardrail (95/5 Actual)
The native Rust surface replaces $\approx 145$ Python LOC out of $\approx 2,870$ total backend LOC ($\approx 5.0\%$ of the codebase). Over **95%** of the codebase remains in pure Python: all FastAPI routers, background job locks, Google ADK 2.0 multi-agent orchestrators, Vertex AI sessions, and Pydantic validation schemas remain untouched.

## Consequences
* **Positive**: FFI roundtrips per string reduced by 66% (from 3 calls to 1).
* **Positive**: Transcript chunking latency on 100k-character payloads reduced from tens of milliseconds to sub-millisecond execution with zero quadratic memory allocations.
* **Positive**: Pre-classification zero-token fast path evaluates non-analytical content in microseconds via DFA cache-line scanning.
* **Positive**: 100% backward compatibility maintained via identical error classes (`SanitizationError`), character-exact exception messages, and pure-Python fallbacks.
* **Negative**: `Cargo.toml` introduces `unicode-normalization` and `aho-corasick` crate dependencies.
* **Negative**: Local builds require the Rust toolchain binary directory on `PATH`.
