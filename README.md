# Perspective Prism MVP

An advanced AI agent that processes YouTube video transcripts to analyze claims across multiple perspectives, detect bias and potential deception, and output a rich "truth profile" per claim.

![Perspective Prism Banner](assets/perspective-prism-16-9.png)

## 🧐 Problem Statement

In the age of algorithmic feeds, users are often trapped in filter bubbles where they only encounter information that reinforces their existing beliefs. Misinformation spreads rapidly on video platforms like YouTube, where verifying claims requires significant effort (cross-referencing sources, checking scientific consensus, etc.). Most users simply don't have the time or expertise to fact-check every video they watch.

## 💡 Solution Statement

Perspective Prism is an AI agent that acts as an automated, multi-perspective fact-checker. It analyzes YouTube video transcripts to identify verifiable claims, retrieves supporting or refuting evidence from trusted sources, evaluates bias and credibility, and presents a comprehensive "Truth Profile" to help users make informed decisions about the content they consume.

## 🏗️ Architecture

[See detailed architecture](architecture.md)

Perspective Prism operates as a pipeline of specialized sub-agents:

1.  **Claim Extractor**: Uses an LLM to parse YouTube transcripts and identify distinct, verifiable claims.
2.  **Evidence Retriever**: Dynamically queries the Google Custom Search API to find external evidence.
3.  **Analysis Engine**: Synthesizes the claim and retrieved evidence to determine support/refutation and detects bias.
4.  **Truth Profiler**: Aggregates these insights into a user-friendly "Truth Profile".

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
