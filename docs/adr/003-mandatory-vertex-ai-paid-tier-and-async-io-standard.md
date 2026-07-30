# ADR 003: Mandatory 100% GCP Vertex AI Mode (Paid Tier) & Async I/O Standard

## Context
Perspective Prism analyzes YouTube video transcripts across four distinct perspectives (**Scientific**, **Journalistic**, **Partisan Left**, and **Partisan Right**) using a multi-agent AI system. 

Previously, the system supported a dual-authentication model allowing both Google AI Studio API Key mode (`GEMINI_API_KEY`, `LLM_API_KEY`) and GCP Vertex AI Mode. However, Google AI Studio's free tier rate limit of 15 Requests Per Minute (RPM) and low concurrency throttles (2 concurrent calls) produced severe bottlenecks during multi-perspective analysis, causing frequent 429 rate-limit errors and slow stream chunk rendering in the Chrome Extension side panel.

Furthermore, several legacy utilities and transcript retrieval functions used blocking synchronous network I/O, which risked freezing Python's single-threaded `asyncio` event loop in FastAPI backend contexts.

## Decision
We have decided to enforce **100% GCP Vertex AI Mode (Paid Tier via Gemini Enterprise Agent Platform)** using GCP billing credits (300+ RPM high-throughput quota) and standardize **Strict Async I/O & Non-Blocking Event Loop** across the entire codebase.

Specifically, this decision enforces:
1. **Permanent Removal of Google AI Studio Key Mode & Free Tier**:
   - `GEMINI_API_KEY`, `LLM_API_KEY`, `BACKUP_LLM_API_KEY`, and legacy key fallback paths are permanently removed from `config.py`, service layer constructors (`ClaimExtractor`, `AnalysisService`), `.env.example`, diagnostic tooling (`verify_environment.py`), and test suites.
   - All backend initializations strictly require `GCP_PROJECT` (or `GOOGLE_CLOUD_PROJECT`) and run in `vertexai=True` mode using Application Default Credentials (ADC) or GCP Workload Identity.
   - `GEMINI_TIER` is locked to `"paid"` (10 max concurrent calls / 300+ RPM quota via GCP billing credits).

2. **Mandatory Async I/O & Non-Blocking Event Loop**:
   - All network I/O operations (LLM model calls, Google Custom Search API queries, YouTube transcript retrieval) MUST use non-blocking `async`/`await` patterns.
   - LLM model calls use the Google GenAI SDK's `client.aio` surface (e.g. `await client.aio.models.generate_content(...)`).
   - Web search queries use `httpx.AsyncClient`.
   - Blocking synchronous library calls (such as `YouTubeTranscriptApi.fetch()`) MUST be offloaded to worker threads via `await asyncio.to_thread(...)`.
   - Diagnostic tools (`verify_environment.py`) use `async def` and `asyncio.run()` to align with project async standards.

3. **PR Review Agent Governance & Compliance Rules**:
   - `.qodo.yaml` extra instructions and `pr_compliance_checklist.yaml` rules (`vertex-ai-mode-mandatory-paid-tier`, `strict-async-non-blocking-io`) mandate 100% GCP Vertex AI Mode and non-blocking async I/O. Any PR reintroducing AI Studio keys, free-tier rate limits, or synchronous blocking network calls will be flagged as a critical rule violation.

## Consequences
* **Positive:** High-throughput 300+ RPM quota eliminates 429 rate-limit errors and enables fast parallel multi-perspective analysis.
* **Positive:** Non-blocking async I/O protects FastAPI event loop responsiveness, guaranteeing smooth SSE stream chunk rendering in the Chrome Extension side panel.
* **Positive:** Qodo PR review agent automatically enforces Vertex AI Mode and async I/O rules across all incoming pull requests.
* **Negative:** Local development setup strictly requires GCP billing account setup (`GCP_PROJECT`) and local ADC authentication (`gcloud auth application-default login`).
