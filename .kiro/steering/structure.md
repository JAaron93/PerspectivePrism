# Project Structure

## Repository Layout

```
/
├── backend/              # Python FastAPI backend
│   ├── app/
│   │   ├── api/         # API route handlers (currently minimal)
│   │   ├── core/        # Core configuration (settings, config)
│   │   ├── models/      # Pydantic schemas and data models
│   │   ├── services/    # Business logic services
│   │   │   ├── analysis_service.py      # LLM-based analysis
│   │   │   ├── claim_extractor.py       # Claim extraction from transcripts
│   │   │   └── evidence_retriever.py    # Evidence gathering from search APIs
│   │   ├── utils/       # Utility functions (input sanitization)
│   │   └── main.py      # FastAPI application entry point
│   ├── tests/           # Test suite
│   ├── pyproject.toml   # Python project configuration
│   └── requirements.txt # Python dependencies
│
├── frontend/            # React TypeScript frontend
│   ├── src/
│   │   ├── assets/      # Static assets
│   │   ├── App.tsx      # Main application component
│   │   ├── App.css      # Application styles
│   │   └── main.tsx     # Application entry point
│   ├── public/          # Public static files
│   └── package.json     # Node.js dependencies and scripts
│
├── chrome-extension/    # Chrome browser extension (Manifest V3)
│   ├── icons/           # Extension icons (16, 48, 128px)
│   ├── tests/           # Vitest unit tests and Playwright integration tests
│   ├── content.js       # Content script: UI injection on YouTube pages
│   ├── claim-navigator.js # Keyboard navigation / accessibility
│   ├── background.js    # Service worker for API coordination
│   ├── client.js        # Backend API client
│   ├── config.js        # Extension configuration
│   ├── popup.html/js    # Browser action popup
│   ├── options.html/js  # Extension options page
│   ├── welcome.html/js  # Onboarding welcome page
│   ├── manifest.json    # Extension manifest
│   └── package.json     # Dev dependencies (Vitest, Playwright)
│
├── docs/
│   └── adr/             # Architecture Decision Records
│
├── walkthroughs/        # Developer walkthroughs and implementation guides
├── .benchmarks/         # Agent evaluation scripts
├── assets/              # Project-level assets (screenshots, logos)
├── AGENTS.md            # Guidance for software engineering agents
├── architecture.md      # High-level architecture documentation
└── .kiro/               # Kiro IDE configuration
    └── steering/        # AI assistant steering rules
```

## Architecture Patterns

### Backend
- **Service Layer Pattern**: Business logic separated into service classes (`ClaimExtractor`, `EvidenceRetriever`, `AnalysisService`)
- **Dependency Injection**: Services initialized at app startup and injected into routes
- **Async Job Queue**: Analysis runs as background tasks with an in-memory job store (keyed by UUID); clients poll `/analyze/jobs/{job_id}` for status and incremental results
- **Async/Await**: Extensive use of async operations for concurrent API calls
- **Pydantic Models**: Strong typing and validation for all data structures
- **Security First**: All user inputs sanitized through `input_sanitizer.py` before LLM processing
- **Circuit Breaker**: `AnalysisService` tracks LLM failures and can fall back to a backup provider

### Frontend
- **Component-Based**: Single-page React application
- **Type Safety**: TypeScript for all components
- **Environment Configuration**: Vite environment variables for API endpoints

### Chrome Extension
- **Manifest V3**: Uses service worker (`background.js`) instead of background pages
- **Content Script Pipeline**: `logging-utils-script.js` → `config-script.js` → `consent.js` → `claim-navigator.js` → `content.js` (injected in this order)
- **ES Modules**: Extension scripts use `type: "module"`
- **CORS**: Backend allowlists extension IDs via `CHROME_EXTENSION_IDS` env var

## Key Conventions

### Python (Backend)
- Use async/await for I/O operations
- All user inputs must be sanitized before LLM processing (see `app/utils/input_sanitizer.py`)
- Use structured logging with `logging` module
- Pydantic models for all request/response schemas
- Exception handling: catch specific exceptions, log details server-side, return generic errors to client
- Configuration via `pydantic-settings` and `.env` files
- Entry point is `backend/app/main.py` (run with `uvicorn app.main:app`)

### TypeScript (Frontend)
- Functional components with hooks
- Interface definitions for all API response types
- Environment variables prefixed with `VITE_`
- Error handling with try/catch and user-friendly error messages

### JavaScript (Chrome Extension)
- Vanilla JS with ES module syntax
- No build step — files are loaded directly by Chrome
- Shared utilities (`logging-utils.js`, `config.js`) have both a module version and a script version (`*-script.js`) for use in different contexts

### Testing
- Backend tests in `backend/tests/` — pytest, files prefixed with `test_`
- Use pytest fixtures for reusable test setup; async tests use `pytest-asyncio`
- Chrome extension unit tests in `chrome-extension/tests/` — Vitest + JSDOM
- Chrome extension integration tests — Playwright (`tests/integration/`)
