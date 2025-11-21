# Perspective Prism MVP

An advanced AI agent that processes YouTube video transcripts to analyze claims across multiple perspectives, detect bias and potential deception, and output a rich "truth profile" per claim.

## 🚀 Features

- **Claim Extraction**: Automatically fetches and parses YouTube transcripts to identify key claims.
- **Multi-Perspective Analysis**: Evaluates claims against "Mainstream", "Scientific", and "Conspiratorial" viewpoints using Google Custom Search.
- **Bias & Deception Detection**: Uses LLMs to identify logical fallacies, emotional manipulation, and political bias.
- **Truth Profiling**: Generates a comprehensive report with confidence scores and supporting evidence.
- **🛡️ Robust Security**: Built-in input sanitization to prevent prompt injection attacks and ensure safe LLM interactions.

## 🛠️ Tech Stack

- **Backend**: FastAPI, Python 3.13, OpenAI API, Google Custom Search API
- **Frontend**: React, TypeScript, Vite, Tailwind CSS
- **Security**: Custom input sanitizer with pattern detection and strict length enforcement

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
