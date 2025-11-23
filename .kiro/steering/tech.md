# Tech Stack

## Backend
- **Framework**: FastAPI
- **Language**: Python 3.10+ (developed with 3.13)
- **Package Manager**: pip with virtual environments
- **Build System**: setuptools (pyproject.toml)
- **Testing**: pytest with pytest-asyncio
- **Key Libraries**:
  - `openai` - LLM integration
  - `youtube-transcript-api` - Transcript extraction
  - `httpx` - HTTP client for API calls
  - `pydantic` & `pydantic-settings` - Data validation and settings management
  - `beautifulsoup4` - HTML parsing

## Frontend
- **Framework**: React 19.2
- **Language**: TypeScript
- **Build Tool**: Vite 7.2
- **Package Manager**: npm
- **Styling**: CSS (custom)

## External APIs
- OpenAI API (GPT models for claim extraction and analysis)
- Google Custom Search API (evidence retrieval)
- YouTube Transcript API (transcript fetching)

## Common Commands

### Backend
```bash
# Setup
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Run development server
uvicorn app.main:app --reload

# Run tests
pytest
pytest tests/test_input_sanitizer.py  # Specific test file
```

### Frontend
```bash
# Setup
cd frontend
npm install

# Run development server
npm run dev

# Build for production
npm run build

# Lint
npm run lint

# Preview production build
npm run preview
```

## Configuration
- Backend: `.env` file in `backend/` directory (copy from `.env.example`)
- Frontend: `.env` file in `frontend/` directory (copy from `.env.example`)
- Required environment variables documented in respective `.env.example` files
