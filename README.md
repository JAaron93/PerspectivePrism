# Perspective Prism MVP

An advanced AI agent that processes YouTube video transcripts to analyze claims across multiple perspectives, detect bias and potential deception, and output a rich "truth profile" per claim.

![Perspective Prism Banner](assets/perspective-prism-16-9.png)

## 🧐 Problem Statement

In the age of algorithmic feeds, users are often trapped in filter bubbles where they only encounter information that reinforces their existing beliefs. Misinformation spreads rapidly on video platforms like YouTube, where verifying claims requires significant effort (cross-referencing sources, checking scientific consensus, etc.). Most users simply don't have the time or expertise to fact-check every video they watch.

## 💡 Solution Statement

Perspective Prism is an AI agent that acts as an automated, multi-perspective fact-checker. It analyzes YouTube video transcripts to identify verifiable claims, retrieves supporting or refuting evidence from trusted sources, evaluates bias and credibility, and presents a comprehensive "Truth Profile" to help users make informed decisions about the content they consume.

## 🏗️ Architecture

[See detailed architecture](architecture.md)

![Perspective Prism Architecture](assets/img_1764592936221.png)
Perspective Prism operates as a pipeline of specialized sub-agents:

1.  **Claim Extractor**: Uses an LLM to parse YouTube transcripts and identify distinct, verifiable claims.
2.  **Evidence Retriever**: Dynamically queries the Google Custom Search API to find external evidence.
3.  **Analysis Engine**: Synthesizes the claim and retrieved evidence to determine support/refutation and detects bias.
4.  **Truth Profiler**: Aggregates these insights into a user-friendly "Truth Profile".

## 🔄 Conclusion

Perspective Prism addresses the core problem of filter bubbles and misinformation by automating the fact-checking process that most users don't have time to perform manually. When a user submits a YouTube video URL, the system retrieves the video's transcript and initiates a sophisticated multi-agent workflow. The **Claim Extractor** agent uses large language models to intelligently parse the transcript, identifying specific claims that can be verified rather than opinions or subjective statements. Each extracted claim is then passed to the **Evidence Retriever** agent, which conducts targeted searches across trusted external sources using the Google Custom Search API. The **Analysis Engine** synthesizes this evidence with the original claim, evaluating the degree of support or refutation while simultaneously detecting logical fallacies, emotional manipulation tactics, and other bias indicators. Finally, the **Truth Profiler** aggregates these multi-perspective analyses into a comprehensive report that presents users with a balanced view—showing not just whether claims are true or false, but _how_ different perspectives (scientific, journalistic, partisan) interpret the same information. This automated pipeline transforms hours of manual research into seconds of computational analysis, empowering users to escape their filter bubbles and make informed decisions about the content they consume.

## 💎 Why This Matters

In an era where video content increasingly shapes public opinion and political discourse, the ability to quickly verify claims and detect bias is not just convenient—it's essential for a healthy democracy. Perspective Prism democratizes access to multi-perspective fact-checking, a capability typically reserved for professional journalists and researchers. By surfacing bias indicators and presenting evidence from multiple viewpoints, the system helps users develop critical thinking skills and resist manipulation. The project demonstrates how AI agents can be harnessed not to replace human judgment, but to augment it with comprehensive, rapid analysis that would be impractical to conduct manually.

## Value Statement

I used Perspective Prism to analyze claims from a political commentary video, discovering that 3 out of 7 major claims lacked credible supporting evidence and exhibited strong emotional manipulation tactics. Armed with this Truth Profile, I was able to disuade an acquaintance from taking the video's claims at face value, which would have otherwise reinforced their existing beliefs.

**Future Enhancements**: With additional development time, I plan to apply comprehensive quality assurance to the Chrome extension, including:

- **Advanced Accessibility Features**
  - Arrow key navigation for claims (Up/Down to navigate, Left/Right to expand/collapse)
  - ClaimNavigator class with screen reader announcements
  - ARIA live regions for dynamic state updates
  - Home/End key support for first/last claim navigation

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

We include a benchmark script to evaluate the agent's performance on a set of test videos.
Run the evaluation:

```bash
python .benchmarks/evaluate_agents.py
```

This script measures:

- **Success Rate**: Percentage of successful analyses.
- **Latency**: Time taken for extraction and analysis.
- **Output Quality**: Basic validation of the generated Truth Profile.

## 🛠️ Tech Stack

- **Backend**: FastAPI, Python 3.13
- **AI/LLM**: OpenAI API, Google Gemini API (Bonus)
- **Search**: Google Custom Search API
- **Frontend**: React, TypeScript, Vite, Tailwind CSS
- **Security**: Custom input sanitizer with pattern detection

## 📋 Prerequisites

- Python 3.10+
- Node.js 18+ (LTS) or Node.js 20+ (recommended)
- OpenAI API Key
- Google Custom Search JSON API Key & Search Engine ID

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

4. Configure environment variables:
   Copy `.env.example` to `.env` and fill in your keys:

   ```bash
   cp .env.example .env
   ```

   Required variables:
   - `OPENAI_API_KEY`: Your OpenAI API key
   - `GOOGLE_API_KEY`: Google Custom Search JSON API key
   - `GOOGLE_CSE_ID`: Google Custom Search Engine ID
   - `BACKEND_CORS_ORIGINS`: List of allowed frontend origins (e.g., `["http://localhost:5173"]`)

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

## 🧪 Testing

The backend includes a comprehensive test suite, particularly for the security components.

To run the tests:

```bash
cd backend
# Run all tests
pytest

# Run specific security tests
pytest tests/test_input_sanitizer.py
```

## 🔒 Security

This project implements strict input sanitization to protect against Large Language Model (LLM) prompt injection attacks.

- **Pattern Matching**: Blocks known injection patterns (e.g., "Ignore previous instructions").
- **Delimiters**: Uses strict delimiters to separate user data from system instructions.
- **Validation**: Enforces length limits and character whitelisting.

See `backend/app/utils/input_sanitizer.py` for implementation details.

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
  - `tests/`: Integration and unit tests for the backend services
- **frontend/**: React + TypeScript + Vite frontend application
  - `src/`: Contains React components, API clients, and application logic
  - `src/components/`: Reusable UI components for displaying Truth Profiles
  - `src/services/`: API client for communicating with the backend
- **.benchmarks/**: Contains the agent evaluation framework
  - `evaluate_agents.py`: Benchmark script measuring success rate, latency, and output quality
- **chrome-extension/**: YouTube Chrome Extension (planned future enhancement)
  - Contains manifest, content scripts, background service worker, and UI components for browser integration

## 🔄 Workflow

The Perspective Prism analysis pipeline follows this workflow:

1. **Input Validation**: User submits a YouTube video URL through the frontend. The backend validates the URL format and checks for required API credentials.

2. **Transcript Retrieval**: The **Claim Extractor** service extracts the video ID from the URL and fetches the video transcript using the YouTube Transcript API. If no transcript is available, the analysis fails gracefully with an error message.

3. **Claim Extraction**: The **Claim Extractor** uses an LLM (OpenAI GPT) to parse the transcript and identify distinct, verifiable claims. It filters out opinions, questions, and subjective statements, focusing only on factual assertions that can be verified.

4. **Evidence Gathering**: For each extracted claim, the **Evidence Retriever** performs targeted searches across multiple perspectives (scientific, journalistic, partisan left/right) using the Google Custom Search API. It collects relevant articles, studies, and sources for each perspective.

5. **Perspective Analysis**: The **Analysis Service** synthesizes each claim with its gathered evidence. For each perspective, it determines:
   - **Assessment**: Whether the evidence supports, refutes, or is neutral toward the claim
   - **Confidence**: How strongly the evidence supports the assessment (0-100%)
   - **Supporting Evidence**: Specific sources and quotes backing the assessment

6. **Bias Detection**: The **Analysis Service** analyzes each claim for bias indicators, including:
   - Logical fallacies (ad hominem, straw man, false dichotomy, etc.)
   - Emotional manipulation tactics (fear-mongering, appeal to emotion)
   - Deception score (0-100 scale indicating likelihood of intentional misinformation)

7. **Truth Profile Generation**: The system aggregates all perspective analyses and bias indicators into a comprehensive "Truth Profile" for each claim, showing users a balanced view across multiple viewpoints.

8. **Response**: The backend returns the complete analysis (video metadata, claims, and Truth Profiles) to the frontend, which renders an interactive UI displaying the results with expandable claims, color-coded confidence bars, and detailed evidence citations.
