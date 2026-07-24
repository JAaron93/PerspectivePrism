# Tech Stack

## Backend
- **Framework**: FastAPI
- **Language**: Python 3.10+ (developed with 3.13)
- **Package Manager**: pip with virtual environments
- **Build System**: setuptools (pyproject.toml)
- **Testing**: pytest with pytest-asyncio
- **Key Libraries**:
  - `google-genai` & `google-adk` - Google Gemini LLM integration & Agent Development Kit 2.0
  - `prism_sanitizer_rs` - High-performance compiled Rust input sanitizer (PyO3)
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

## Chrome Extension
- **Stack**: Vanilla JavaScript (ES modules), HTML, CSS
- **Manifest**: Version 3
- **Testing**: Vitest 4.x + JSDOM (unit), Playwright (integration)
- **Key Files**:
  - `content.js` - UI injection and DOM manipulation on YouTube pages
  - `claim-navigator.js` - Keyboard navigation and accessibility (ClaimNavigator class)
  - `background.js` - Service worker for API coordination
  - `client.js` - Backend API client
  - `manifest.json` - Extension configuration

## External APIs
- Gemini API (`gemini-3.5-flash-lite` primary, `gemini-3.1-flash-lite` backup)
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

### Chrome Extension
```bash
# Setup
cd chrome-extension
npm install

# Run unit tests (single run)
npm test

# Run unit tests in watch mode
npm run test:watch

# Run with coverage
npm run test:coverage

# Run integration tests (Playwright)
npm run test:integration
```

To load the extension in Chrome: open `chrome://extensions`, enable Developer Mode, click "Load unpacked", and select the `chrome-extension/` directory.

## Configuration
- Backend: `.env` file in `backend/` directory (copy from `.env.example`)
- Frontend: `.env` file in `frontend/` directory (copy from `.env.example`)
- Required environment variables documented in respective `.env.example` files
