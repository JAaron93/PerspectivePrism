# Perspective Prism

[![Chrome Extension CI](https://github.com/JAaron93/PerspectivePrism/actions/workflows/chrome-extension.yml/badge.svg)](https://github.com/JAaron93/PerspectivePrism/actions/workflows/chrome-extension.yml)

An advanced AI agent that processes YouTube video transcripts to analyze claims across multiple perspectives, detect bias and potential deception, and output a rich "truth profile" per claim.

![Perspective Prism Banner](assets/perspective-prism-16-9.png)

## 🧐 Problem Statement

In the age of algorithmic feeds, users are often trapped in filter bubbles where they only encounter information that reinforces their existing beliefs. Misinformation spreads rapidly on video platforms like YouTube, where verifying claims requires significant effort (cross-referencing sources, checking scientific consensus, etc.). Most users simply don't have the time or expertise to fact-check every video they watch.

## ✨ Solution Statement

Perspective Prism is an AI agent that acts as an automated, multi-perspective fact-checker. It analyzes YouTube video transcripts to identify verifiable claims, retrieves supporting or refuting evidence from trusted sources, evaluates bias and credibility, and presents a comprehensive "Truth Profile" to help users make informed decisions about the content they consume.

## 🏗️ Architecture

[See detailed architecture](architecture.md)

![Perspective Prism Architecture](assets/img_1764592936221.png)
Perspective Prism operates as a pipeline of specialized sub-agents:

1.  **Claim Extractor**: Uses an LLM to parse YouTube transcripts and identify distinct, verifiable claims.
2.  **Evidence Retriever**: Dynamically queries the Google Custom Search API to find external evidence.
3.  **Analysis Engine**: Synthesizes the claim and retrieved evidence to determine support/refutation and detects bias.
    *   **AI Engine**: Utilizes Gemini API (`gemini-3.5-flash`) via the `google-genai` SDK and the `google-adk` framework for structured outputs.
    *   **Reliability Layer**: Features a custom `google-genai` circuit breaker that automatically falls back to `gemini-3.1-flash-lite` during transient API errors (e.g. 429, 500, 503).
4.  **Truth Profiler**: Aggregates these insights into a user-friendly "Truth Profile".

### 🚀 High-Performance Analysis
Perspective Prism offers:
- **Enhanced Claim Analysis**: The system supports a configurable claim limit (default: **15 claims**) via the `MAX_CLAIMS_PER_ANALYSIS` setting, allowing flexibility based on video complexity and API constraints.
- **Extended Transcript Coverage**: Supports transcript processing up to 100k characters, enabling comprehensive analysis of long-form content (lectures, long-form podcasts, and documentaries).

## 🦾 Essential Tools and Utilities

The Perspective Prism multi-agent system is equipped with custom-built tools designed to ensure security, quality, and effectiveness throughout the analysis pipeline.

### Input Sanitizer (`input_sanitizer.py`)

A critical security tool that protects against Large Language Model (LLM) prompt injection attacks, backed by a high-performance compiled Rust extension (`prism_sanitizer_rs` integrated via PyO3 and Maturin). Before any user-provided data (YouTube URLs, transcript text, or claims) is interpolated into LLM prompts, the sanitizer performs comprehensive validation. It detects and blocks suspicious patterns like `ignore previous instructions`, `system:`, `<|im_start|>`, and other common injection techniques. The tool employs multiple defense layers: high-speed control character detection, regex pattern matching against a blocklist, character escaping, and length enforcement. Additionally, it wraps user data in clearly delimited sections using `===USER DATA START===` and `===USER DATA END===` markers to optimize Gemini's implicit context caching.

### Agent Evaluator (`evaluate_agents.py`)

A benchmarking framework that validates the entire analysis pipeline against a curated set of test videos containing verifiable factual claims. The evaluator measures three key performance metrics: **Success Rate** (percentage of successful analyses without errors), **Latency** (time breakdown for claim extraction vs. evidence analysis), and **Output Quality** (validation that Truth Profiles contain properly structured perspectives and bias indicators). It runs automated tests on videos spanning diverse topics—TED Talks on data science, Bill Gates' pandemic preparedness presentation, and NASA's Artemis program announcements—ensuring the system can handle scientific, public health, and engineering claims. The benchmark script integrates directly with the `ClaimExtractor`, `EvidenceRetriever`, and `AnalysisService` to measure end-to-end performance, providing detailed timing breakdowns and failure diagnostics to support continuous improvement.

### Evidence Retriever (`evidence_retriever.py`)

A sophisticated multi-perspective search tool that queries the Google Custom Search API to gather external evidence for each extracted claim. Rather than performing a single generic search, the Evidence Retriever executes **perspective-specific queries**—tailoring search terms to find scientific studies (`site:nih.gov OR site:nature.com`), journalistic sources (`site:nytimes.com OR site:reuters.com`), and partisan viewpoints. It handles API quota limits gracefully, implements exponential backoff retry logic for transient failures, and normalizes search results into a consistent format (title, snippet, URL). The retriever also performs relevance filtering, discarding results that don't contain claim-related keywords, ensuring the `AnalysisService` receives only high-quality evidence. This tool is essential for transforming subjective claims into fact-checkable assertions backed by authoritative external sources.

## 🏁 Conclusion

Perspective Prism addresses the core problem of filter bubbles and misinformation by automating the fact-checking process that most users don't have time to perform manually. When a user submits a YouTube video URL, the system retrieves the video's transcript and initiates a sophisticated multi-agent workflow. The **Claim Extractor** agent uses large language models to intelligently parse the transcript, identifying specific claims that can be verified rather than opinions or subjective statements. Each extracted claim is then passed to the **Evidence Retriever** agent, which conducts targeted searches across trusted external sources using the Google Custom Search API. The **Analysis Engine** synthesizes this evidence with the original claim, evaluating the degree of support or refutation while simultaneously detecting logical fallacies, emotional manipulation tactics, and other bias indicators. Finally, the **Truth Profiler** aggregates these multi-perspective analyses into a comprehensive report that presents users with a balanced view—showing not just whether claims are true or false, but _how_ different perspectives (scientific, journalistic, partisan) interpret the same information. This automated pipeline transforms hours of manual research into seconds of computational analysis, empowering users to escape their filter bubbles and make informed decisions about the content they consume.

## 💎 Why This Matters

In an era where video content increasingly shapes public opinion and political discourse, the ability to quickly verify claims and detect bias is not just convenient—it's essential for a healthy democracy. Perspective Prism democratizes access to multi-perspective fact-checking, a capability typically reserved for professional journalists and researchers. By surfacing bias indicators and presenting evidence from multiple viewpoints, the system helps users develop critical thinking skills and resist manipulation. The project demonstrates how AI agents can be harnessed not to replace human judgment, but to augment it with comprehensive, rapid analysis that would be impractical to conduct manually.

## 🗣️ Value Statement

I used Perspective Prism to analyze claims from a political commentary video, discovering that 3 out of 7 major claims lacked credible supporting evidence and exhibited strong emotional manipulation tactics. Armed with this Truth Profile, I was able to disuade an acquaintance from taking the video's claims at face value, which would have otherwise reinforced their existing beliefs.

**Future Enhancements**: With additional development time, I plan to apply comprehensive quality assurance to the Chrome extension, including:


- **Comprehensive Testing Strategy**
  - CI/CD pipeline with automated unit and integration tests on every commit
  - Manual testing across browser variants (Chrome, Brave, Edge) and YouTube layouts (desktop, mobile, Shorts, embedded)
  - Accessibility testing with screen readers (NVDA/JAWS) and keyboard-only navigation
  - Performance benchmarking (memory usage, page load impact, cache efficiency)

- **Structured Logging & Monitoring**
  - Privacy-safe logging utility that sanitizes URLs, tokens, and user data
  - Metrics tracking for selector success rates, cache hit/miss ratios, and API performance
  - Error aggregation for debugging production issues

- **Release Quality Validation**
  - Pre-release checklist requiring 100% test pass rate and manual QA completion
  - Build validation ensuring minified assets work correctly and package size is optimized
  - Store submission validation with up-to-date screenshots and privacy policy alignment
  - Performance targets: <10MB memory usage, <100ms page load impact, <5s cached analysis

## 📊 Agent Evaluation

We include a comprehensive evaluation suite integrated with **Weights & Biases Weave** to track agent performance, latency, and extraction quality across a curated set of test videos containing verifiable claims.

### Running the Evaluation
To run the evaluation, execute the benchmark script:

```bash
python .benchmarks/evaluate_agents.py
```

### Modes of Operation
* **Weights & Biases Weave Mode (Cloud)**: If Weights & Biases credentials are configured in your environment (e.g., `WANDB_API_KEY`, netrc, or global W&B settings), the script initializes Weave under the project name `"perspective-prism-evals"`. It logs full LLM trace details, latencies, and custom scores using Weave's `Model`, `Dataset`, and `Scorer` APIs.
* **Local Fallback Mode**: If no W&B credentials are found, the script automatically sets `WEAVE_DISABLED=true` to bypass cloud-logging. It runs a clean local fallback benchmarking loop in your terminal without displaying blocking login prompts, printing detailed per-video results and performance averages.

### Rate-Limit & Concurrency Configuration
The suite checks your Gemini API Tier via the `GEMINI_TIER` environment variable:
* **`GEMINI_TIER=free` (Default)**: Concurrency is restricted (`WEAVE_PARALLELISM=1`) and artificial sleep delays are injected to respect the Gemini free-tier 15 RPM rate limits.
* **`GEMINI_TIER=paid`**: Concurrency is optimized (`WEAVE_PARALLELISM=10`) for rapid evaluation execution.

## ☁️ Deployment Strategy

Perspective Prism's backend is designed to be deployed to **Modal Labs** using their serverless infrastructure. 

**Important Note on Capacity:** This project is primarily a **portfolio project**, not a commercial product. The backend relies on the $30/month free tier of compute credits provided by Modal Labs. Based on standard usage (1 claim analysis per user per day), this free tier can only handle around **~2,000 monthly users**. 

Since there are no funds allocated to scale this extension further, the extension is planned to fail gracefully. In a future release, if the monthly compute credits run out, the Chrome extension will detect the server exhaustion and display a message directing users to self-host the backend locally. You can find instructions on how to run it yourself in the [Setup & Installation](#setup-installation) section below.

## 🛠️ Tech Stack

- **Backend**: FastAPI, Python 3.13, Rust (`prism_sanitizer_rs` PyO3 extension)
- **AI/LLM**:
    - **Framework**: Agent Development Kit (ADK) 2.x
    - **Primary**: Gemini API (`gemini-3.5-flash` via `google-genai` SDK)
    - **Backup**: `gemini-3.1-flash-lite` with transient-error circuit breaker fallback
- **Search**: Google Custom Search API
- **Frontend**: React, TypeScript, Vite, Tailwind CSS
- **Security**: Rust-accelerated input sanitizer (`prism_sanitizer_rs` regex/control character validation)

## 📋 Prerequisites

- **Operating System**: macOS, Linux, or Windows (via WSL2)
- **Runtime & Toolchain**:
  - Python 3.10 or higher
  - Rust compiler (`cargo`, `rustc` via rustup) & `maturin` for compiling the input sanitizer
  - Node.js 18+ (LTS) or 20+
- **API Keys**:
  - **Gemini API Key**: Required for claim extraction and perspective analysis.
  - **Google Custom Search JSON API Key**: Required for evidence retrieval.
  - **Google Search Engine ID**: A programmable search engine configured to search the entire web (or specific trusted sites).
- **Browser**: Google Chrome, Brave, or Microsoft Edge (for the extension).

<a id="setup-installation"></a>
## ⚙️ Setup & Installation

### Backend

1. Navigate to the backend directory:

   ```bash
   cd backend
   ```

2. Create and activate a virtual environment:

   ```bash
   python3 -m venv venv
   source venv/bin/activate
   ```

3. Install dependencies:

   ```bash
   pip install -r requirements.txt
   ```

### 3. Environment Setup

Copy `.env.example` to `.env` in the `backend/` directory:

```bash
cp backend/.env.example backend/.env
```

To run the full analysis, you need to configure your Gemini API credentials in `.env`:

```env
GEMINI_API_KEY=your_gemini_api_key_here
LLM_PROVIDER=google
LLM_MODEL=gemini-3.5-flash
BACKUP_LLM_MODEL=gemini-3.1-flash-lite
```

Additional configuration:
   - `GOOGLE_API_KEY`: Google Custom Search JSON API key
   - `GOOGLE_CSE_ID`: Google Custom Search Engine ID
   - `CHROME_EXTENSION_IDS`: List of allowed extension IDs.

5. Run the server:
   ```bash
   uvicorn app.main:app --reload
   ```
   The API will be available at `http://localhost:8000`.

### Frontend

1. Navigate to the frontend directory:

   ```bash
   cd frontend
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Configure environment variables:
   Copy `.env.example` to `.env`:

   ```bash
   cp .env.example .env
   ```

   Ensure `VITE_API_URL` matches your backend URL (default: `http://localhost:8000`).

4. Run the development server:
   ```bash
   npm run dev
   ```
   The app will be available at `http://localhost:5173`.

### Chrome Extension

#### Development Setup (Unpacked)
1. Install extension development dependencies:
   ```bash
   cd chrome-extension
   npm install
   ```
2. Load the unpacked extension in Chrome:
   - Open Google Chrome and navigate to `chrome://extensions/`.
   - Enable **Developer mode** via the toggle switch in the top-right corner.
   - Click the **Load unpacked** button.
   - Select the `chrome-extension` directory from this repository.

#### Production Build & Packaging
For distribution or release testing, compile and package the extension:
1. Run the build script:
   ```bash
   cd chrome-extension
   npm run build
   ```
   This script minifies JavaScript (removing development `console.log` statements) and CSS files, creates a production-ready `dist/` directory, and bundles it into `perspective-prism-extension.zip`.
2. Load the production build:
   - Navigate to `chrome://extensions/`.
   - Click **Load unpacked** and select the `chrome-extension/dist` directory.

#### Backend CORS Integration
To allow the extension to communicate with your local Perspective Prism Backend:
1. Load the extension in Chrome and note its **Extension ID** (e.g., `amnjngnkcgooljnblcejpmkdhpikcdlp`).
2. Open `backend/app/core/config.py`.
3. Add the Extension ID to the `CHROME_EXTENSION_IDS` list:
   ```python
   CHROME_EXTENSION_IDS: list[str] = [
       "your-extension-id-here",
   ]
   ```
4. **Restart the backend server** to apply the configuration.

#### Configuration Options
Access settings by right-clicking the extension icon and selecting **Options**:
- **Backend URL**: Endpoint for the Perspective Prism backend (HTTPS required for external servers, HTTP allowed for localhost/127.0.0.1).
- **Cache Settings**: Enable/disable cache and configure the cache duration (defaults to 24 hours).
- **Privacy Notice & Consent**: Review the current privacy policy and grant or revoke analysis consent. Revoking consent instantly clears all local caches, aborts pending jobs, and deletes background alarms.

## 🧪 Testing

### Backend Tests
To run the backend test suite:
```bash
cd backend
# Run all tests
pytest

# Run specific reliability tests
pytest tests/test_reliability.py
```

### Chrome Extension Tests
The Chrome Extension has unit tests using Vitest and integration tests using Playwright.
```bash
cd chrome-extension
# Install testing dependencies
npm install

# Run unit tests
npm run test

# Run unit tests with coverage validation (requires 15% coverage)
npm run test:coverage

# Run Playwright end-to-end integration tests
npm run test:integration
```

## 🔧 Extended Troubleshooting

### Backend Issues

| Issue | Possible Cause | Solution |
| :--- | :--- | :--- |
| **401 Unauthorized** | Missing or invalid Gemini API Key | Check `.env` file. Ensure `GEMINI_API_KEY` is set and valid. |
| **429 Too Many Requests** | LLM/Google API quota exceeded | Check your API usage limits in the respective provider dashboards. |
| **500 Internal Server Error** | Unexpected backend crash | Check the terminal output where `uvicorn` is running for stack traces. |
| **CORS Error** | Frontend origin not allowed | Distinguish the request origin: For Chrome extension requests, add the extension ID to `CHROME_EXTENSION_IDS` in `.env` or `config.py`. For standalone web applications (e.g., React app), add the origin (e.g., `http://localhost:5173`) to `BACKEND_CORS_ORIGINS` in `.env` or `config.py`. |

### Extension Issues

| Issue | Possible Cause | Solution |
| :--- | :--- | :--- |
| **"Analysis Failed"** | Backend not reachable | Ensure backend is running at `http://localhost:8000`. Check `VITE_API_URL`. |
| **"No claims found"** | Transcript unavailable or poor quality | The video may be private, a livestream, lack captions, or have auto-generated captions with poor quality. Try another video. |
| **Button not showing** | Content script failed to inject | Refresh the YouTube page. Ensure the extension is enabled in `chrome://extensions/`. Check extension ID in `config.py`. |


### Common Fixes

1. **Restart the Backend**: Whenever you change `.env` or `config.py`.
2. **Reload Extension**: Click the refresh icon in `chrome://extensions/` after code changes.
3. **Clear Cache**: If the frontend behaves oddly, try Hard Reload (Cmd+Shift+R).

## 🔒 Privacy & Security

### Backend Input Sanitization
This project implements strict input sanitization to protect against Large Language Model (LLM) prompt injection attacks.
- **Pattern Matching**: Blocks known injection patterns (e.g., "Ignore previous instructions").
- **Delimiters**: Uses strict delimiters to separate user data from system instructions.
- **Validation**: Enforces length limits and character whitelisting.

See `backend/app/utils/input_sanitizer.py` for implementation details.

### Extension Data Handling
- **Minimal Transmission**: The extension transmits the full YouTube Video URL via the `url` field to the backend to retrieve the video transcript and perform claim extraction. Unrelated data such as browsing history, search queries, user identifiers, or personal information is never collected or transmitted.
- **Strict HTTPS**: All communications with external backends enforce HTTPS encryption. Cleartext HTTP is restricted to localhost (`127.0.0.1` and `localhost`).
- **Local Storage**: Analysis cache, settings, and statistics are stored locally within the browser context (`chrome.storage.local` and `chrome.storage.sync`).
- **No Third-Party Scripts**: The extension is self-contained and does not load third-party scripts, trackers, or analytics packages.

## 📁 Project Structure

The project is organized as follows:

- **backend/**: The main Python backend for the analysis system
  - `app/main.py`: Defines the FastAPI application and orchestrates the analysis pipeline
  - `app/services/`: Contains the individual agent services, each responsible for a specific task
    - `claim_extractor.py`: Extracts verifiable claims from YouTube video transcripts using LLMs
    - `evidence_retriever.py`: Queries Google Custom Search API to find external evidence for claims
    - `analysis_service.py`: Synthesizes evidence and analyzes claims from multiple perspectives
  - `app/models/`: Defines Pydantic data models for requests and responses
  - `app/utils/`: Contains utility modules (input sanitization, configuration)
    - `llm_client.py`: Centralized wrapper for OpenAI client operations and circuit breaker logic
    - `video_utils.py`: Extracts YouTube Video IDs from various URL formats
  - `tests/`: Integration and unit tests for the backend services
- **frontend/**: React + TypeScript + Vite frontend application
  - `src/`: Contains React components, API clients, and application logic
  - `src/components/`: Reusable UI components for displaying Truth Profiles
  - `src/services/`: API client for communicating with the backend
  - `src/utils/time.ts`: Time formatting utilities for video timestamps
- **.benchmarks/**: Contains the agent evaluation framework
  - `evaluate_agents.py`: Benchmark script measuring success rate, latency, and output quality
- **chrome-extension/**: YouTube Chrome Extension (Manifest V3) - Nearly Complete Implementation
  - **Core Components**:
    - `manifest.json`: Extension configuration with permissions, content scripts, and background service worker
    - `background.js`: Service worker handling message passing, API requests, and extension lifecycle
    - `content.js`: Injected script that detects YouTube videos, injects analysis button, and renders results panel
    - `client.js`: API client with async job polling, retry logic, cache management, and MV3 persistence
  - **UI Pages**:
    - `popup.html/js/css`: Extension popup showing analysis status and cache statistics
    - `options.html/js/css`: Settings page for backend URL configuration, cache controls, and privacy settings
    - `welcome.html/js/css`: Onboarding page for first-time users
    - `privacy.html`: Privacy policy with data handling disclosure
  - **Utilities**:
    - `config.js`: Configuration validation and management
    - `consent.js`: Privacy consent flow with versioning support
    - `quota-manager.js`: Chrome storage quota monitoring and LRU cache eviction
    - `metrics-tracker.js`: Performance metrics collection (cache hits, API latency)
    - `memory-monitor.js`: Memory profiling for extension performance
    - `panel-styles.js`: Shadow DOM styling for analysis panel (dark/light theme support)
    - `video-utils.js / video-utils-script.js`: Shared video URL validation and extraction logic
  - **Accessibility**:
    - `ClaimNavigator` class for keyboard navigation (Arrow keys, Home/End)
    - Screen reader announcements (ARIA live regions)
    - Roving tabindex focus management
  - **Testing Infrastructure**:
    - `tests/unit/`: Vitest unit tests for cache, config, and API client
    - `tests/integration/`: Integration tests for end-to-end flows
    - `tests/manual_qa/`: Manual QA test guides and regression scenarios
    - Multiple test HTML pages for component validation and performance benchmarking

## 🔄 Workflow

The Perspective Prism analysis pipeline follows this workflow:

1. **Input Validation**: User submits a YouTube video URL through the frontend. The backend validates the URL format and checks for required API credentials.

2. **Transcript Retrieval**: The **Claim Extractor** service extracts the video ID from the URL and fetches the video transcript using the YouTube Transcript API. If no transcript is available, the analysis fails gracefully with an error message.

3. **Claim Extraction**: The **Claim Extractor** uses the ADK 2.0 `ExtractorAgent` (Gemini) to parse the transcript and extract distinct, verifiable claims conforming to a strict Pydantic output schema. It places raw transcript text first within the required `===USER DATA START===` and `===USER DATA END===` untrusted-data delimiters to leverage implicit context caching.

4. **Evidence Gathering**: For each extracted claim, the **Evidence Retriever** performs targeted searches across multiple perspectives (scientific, journalistic, partisan left/right) using the Google Custom Search API. It collects relevant articles, studies, and sources for each perspective.

5. **Perspective & Bias Analysis**: The **Analysis Service** evaluates each claim against the retrieved evidence and context using ADK 2.0 `AnalysisAgent` instances. It analyzes the claim from each perspective (stance, confidence, explanation) and performs bias/deception detection (detecting fallacies, emotional appeals, and a deception rating). Moderate deception ratings downgrade the overall assessment, while high deception ratings trigger an immediate short-circuit to "Suspicious/Deceptive".

6. **Truth Profile Generation**: The system aggregates all perspective analyses and bias indicators into a comprehensive "Truth Profile" for each claim, showing users a balanced view across multiple viewpoints.

7. **Response**: The backend returns the complete analysis (video metadata, claims, and Truth Profiles) to the frontend, which renders an interactive UI displaying the results with expandable claims, color-coded confidence bars, and detailed evidence citations.
