# ADR 002: Non-Greedy Rust Sanitizer Rewrite via PyO3

## Context
The application utilizes an `input_sanitizer.py` utility that runs on the hot path for all data arriving into the system. Due to the massive scale of some inputs (e.g. YouTube transcripts that can exceed 50,000 characters), the character-by-character loops and multiple sequential regex passes in Python lead to a severe CPU bottleneck. This bottleneck drastically increases latency for the end user and diminishes the overall responsiveness of the Perspective Prism Chrome extension.

We explored the possibility of rewriting large portions of the backend in a more performant language like Rust. However, replacing major frameworks (such as FastAPI, Google ADK for agent orchestrations, or data frameworks like pandas) incurs a massive development cost and significantly reduces the maintainability of the project for teams primarily skilled in Python. 

## Decision
We have decided to rewrite **only** the `input_sanitizer` logic as a compiled Rust extension using **PyO3** and **Maturin**, adopting a strict "90/10 to 95/5 rule." 

Specifically, this decision enforces:
1.  **Targeted "Hot Path" Porting Only:** The Rust footprint will be strictly constrained to between 5% and 10% of the overall codebase. Only computationally heavy utilities (string parsing, loop scanning, regex iteration) will be ported.
2.  **Mitigation of FFI Overhead:** Crossing the Foreign Function Interface (FFI) boundary between Python and Rust carries a serialization overhead (converting Python string primitives to Rust memory spaces). A "chatty" boundary, where application logic rapidly bounces between Python and Rust for minor tasks, would completely neutralize any performance gains. By passing the massive transcript *once* across the boundary for heavy monolithic processing and escaping, we ensure the compute savings exponentially outweigh the FFI serialization cost.
3.  **Strict Exception Parity:** The compiled PyO3 extension will map its internal errors natively to Python exceptions (e.g., throwing a PyO3-exposed `SanitizationError` with identical message text). This guarantees that existing `pytest` units, security cases, and BDD Gherkin tests continue to run unmodified, remaining entirely agnostic to the underlying compiled extension.

## Consequences
*   **Positive:** Latency on the hot path will decrease by an estimated 10x-50x for large string payloads.
*   **Positive:** The core Google ADK multi-agent orchestrations and web frameworks remain natively in Python, maximizing developer velocity for high-level business logic.
*   **Positive:** The existing Python test suite seamlessly covers the compiled code via native imports.
*   **Negative:** The CI/CD pipelines and local developer setup now strictly require the Rust toolchain (`cargo`, `rustc`) and `maturin` to compile the backend extensions.
*   **Negative:** Python developers attempting to edit the sanitization logic will need basic familiarity with Rust syntax and PyO3 bindings.
