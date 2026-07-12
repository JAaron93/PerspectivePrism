# Product Overview

Perspective Prism is an AI-powered analysis tool that processes YouTube video transcripts to evaluate claims across multiple perspectives. The system extracts claims from videos, retrieves evidence from various sources, and generates comprehensive "truth profiles" that include:

- Multi-perspective analysis (Scientific, Journalistic, Partisan Left/Right)
- Bias and deception detection (logical fallacies, emotional manipulation)
- Confidence scoring and supporting evidence
- Overall assessment per claim

## Delivery Surfaces

The product ships as three components:

1. **Backend API** — Python/FastAPI service that orchestrates the full analysis pipeline (transcript fetch → claim extraction → evidence retrieval → LLM analysis). Exposes an async job API; clients submit a YouTube URL and poll for incremental results.

2. **Web Frontend** — React/TypeScript SPA for standalone use, connecting directly to the backend API.

3. **Chrome Extension** — Manifest V3 browser extension that integrates the analysis directly into the YouTube watch page. Injects a side panel UI alongside the video player.

## Security

The product emphasizes security with built-in input sanitization to prevent prompt injection attacks and ensure safe LLM interactions. All user-supplied content is sanitized before being forwarded to LLM providers.
