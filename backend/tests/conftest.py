import os

# Set default test environment variables if not already provided
os.environ.setdefault("GCP_PROJECT", "test-project")
os.environ.setdefault("GOOGLE_CLOUD_PROJECT", "test-project")
os.environ.setdefault("LLM_API_KEY", "dummy")
os.environ.setdefault("GOOGLE_API_KEY", "dummy")
os.environ.setdefault("GOOGLE_CSE_ID", "dummy")

import pytest


@pytest.fixture(autouse=True)
def reset_analysis_circuit_breaker():
    try:
        from app.main import analysis_service
        analysis_service.cb_failures = 0
        analysis_service.cb_open = False
    except Exception:
        pass
    yield
    try:
        from app.main import analysis_service
        analysis_service.cb_failures = 0
        analysis_service.cb_open = False
    except Exception:
        pass

