from app.core.config import Settings
import os

# Mock env for reproduction
os.environ["BACKEND_CORS_ORIGINS"] = '"http://localhost:5173,http://localhost:3000"'

try:
    s = Settings()
    print("Settings loaded successfully")
    print(s.BACKEND_CORS_ORIGINS)
except Exception as e:
    print(f"Error loading settings: {e}")
