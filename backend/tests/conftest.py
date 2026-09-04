import os

# Set default test environment variables if not already provided
os.environ.setdefault("GCP_PROJECT", "test-project")
os.environ.setdefault("GOOGLE_CLOUD_PROJECT", "test-project")
os.environ.setdefault("LLM_API_KEY", "dummy")
os.environ.setdefault("GOOGLE_API_KEY", "dummy")
os.environ.setdefault("GOOGLE_CSE_ID", "dummy")
