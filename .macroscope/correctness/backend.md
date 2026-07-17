---
include:
  - "backend/**/*"
---

FastAPI + Python 3.13 backend. Key context:
- All user-supplied content must be sanitized via app/utils/input_sanitizer.py
  before being forwarded to any LLM. Flag any path that bypasses this.
- Analysis runs as async background tasks (POST /analyze/jobs → poll GET
  /analyze/jobs/{job_id}). The in-memory job store is intentional for MVP scope.
  Do not suggest replacing it with Redis, Celery, or a database.
- AnalysisService has a circuit breaker for LLM provider failures. Respect
  this pattern when reviewing error handling in that service.
- Four analysis perspectives are in use: Scientific, Journalistic,
  Partisan Left, Partisan Right. Flag any hardcoded strings that deviate.
- Configuration lives in pydantic-settings (app/core/config.py). Do not
  suggest moving to a different config system.
- Do not suggest adding authentication/authorization — this API is consumed
  by the frontend and chrome extension in a personal-use context.
