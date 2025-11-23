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
│   │   └── utils/       # Utility functions (input sanitization)
│   ├── tests/           # Test suite
│   ├── main.py          # FastAPI application entry point
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
└── .kiro/               # Kiro IDE configuration
    └── steering/        # AI assistant steering rules
```

## Architecture Patterns

### Backend
- **Service Layer Pattern**: Business logic separated into service classes (`ClaimExtractor`, `EvidenceRetriever`, `AnalysisService`)
- **Dependency Injection**: Services initialized at app startup and injected into routes
- **Async/Await**: Extensive use of async operations for concurrent API calls
- **Pydantic Models**: Strong typing and validation for all data structures
- **Security First**: All user inputs sanitized through `input_sanitizer.py` before LLM processing

### Frontend
- **Component-Based**: Single-page React application
- **Type Safety**: TypeScript for all components
- **Environment Configuration**: Vite environment variables for API endpoints

## Key Conventions

### Python (Backend)
- Use async/await for I/O operations
- All user inputs must be sanitized before LLM processing (see `app/utils/input_sanitizer.py`)
- Use structured logging with `logging` module
- Pydantic models for all request/response schemas
- Exception handling: catch specific exceptions, log details server-side, return generic errors to client
- Configuration via `pydantic-settings` and `.env` files

### TypeScript (Frontend)
- Functional components with hooks
- Interface definitions for all API response types
- Environment variables prefixed with `VITE_`
- Error handling with try/catch and user-friendly error messages

### Testing
- Backend tests in `backend/tests/` directory
- Test files prefixed with `test_`
- Use pytest fixtures for reusable test setup
- Async tests use `pytest-asyncio`
