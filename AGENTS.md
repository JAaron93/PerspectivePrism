# AGENTS.md

This file provides guidance to Software Engineering Agents (SEAs) when working with code in this repository.

# Project Overview

Perspective Prism MVP is a system designed to analyze YouTube video transcripts for claims, bias, and deception using a multi-perspective approach. It consists of three main components:

1.  **Backend**: A Python FastAPI application that orchestrates the analysis.
2.  **Frontend**: A React/TypeScript web application for user interaction.
3.  **Chrome Extension**: A browser extension to integrate the analysis directly into YouTube.

# Backend Development

The backend is located in the `backend/` directory. It uses Python 3.13+ and FastAPI.

## Setup
1.  Navigate to `backend/`.
2.  Create a virtual environment: `python3 -m venv venv`.
3.  Activate it: `source venv/bin/activate`.
4.  Install dependencies: `pip install -r requirements.txt`.
5.  Set up `.env` from `.env.example` (requires OpenAI and Google Search keys).

## Common Commands

*   **Run Server**: `uvicorn app.main:app --reload` (Starts on port 8000).
*   **Run Tests**: `pytest` (Runs the full suite).
*   **Run Specific Test**: `pytest tests/test_input_sanitizer.py`.

## Architecture & Key Files

*   `app/main.py`: Entry point for the FastAPI application.
*   `app/utils/input_sanitizer.py`: Critical security component for sanitizing LLM inputs.
*   `pyproject.toml`: Configuration for build and tests.

# Frontend Development

The frontend is located in the `frontend/` directory. It uses React 19, TypeScript, and Vite.

## Setup
1.  Navigate to `frontend/`.
2.  Install dependencies: `npm install`.
3.  Set up `.env` from `.env.example`.

## Common Commands

*   **Start Dev Server**: `npm run dev` (Starts on port 5173).
*   **Build for Production**: `npm run build`.
*   **Lint Code**: `npm run lint`.

# Chrome Extension

The extension is located in `chrome-extension/`.

*   **Stack**: Vanilla JavaScript, HTML, CSS.
*   **Testing**: Vitest + JSDOM for unit tests.
*   **Installation**: Load the `chrome-extension` directory as an "Unpacked extension" in Chrome's Developer Mode.

## Setup
1.  Navigate to `chrome-extension/`.
2.  Install dependencies: `npm install`.

## Common Commands
*   **Run Tests**: `npm test` (Runs Vitest unit tests).
*   **Run Coverage**: `npm run test:coverage`.
*   **Run Integration**: `npm run test:integration` (Playwright).

## Key Files
*   `content.js`: Main content script for UI injection and DOM manipulation.
*   `claim-navigator.js`: Handles keyboard navigation and accessibility (ClaimNavigator class).
*   `background.js`: Service worker for API coordination.
*   `manifest.json`: Extension configuration.

# System Architecture

The system follows a pipeline approach for analysis:

1.  **Claim Extraction**: Fetches YouTube transcripts and uses LLMs to identify key claims.
2.  **Evidence Retrieval**: Queries Google Custom Search to find evidence supporting or refuting claims from various perspectives (Scientific, Mainstream, Conspiratorial).
3.  **Analysis**: Uses LLMs to evaluate the claims against the retrieved evidence and detect bias/deception.
4.  **Result**: Generates a "Truth Profile" returned to the client.

## External Services
*   **YouTube Transcript API**: For fetching video text.
*   **Google Custom Search JSON API**: For verifying claims.
*   **OpenAI API**: For NLP tasks (extraction, analysis, bias detection).
