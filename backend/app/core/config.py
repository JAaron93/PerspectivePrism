import json

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env")

    PROJECT_NAME: str = "Perspective Prism MVP"
    OPENAI_API_KEY: str = ""
    OPENAI_MODEL: str = "gpt-3.5-turbo"  # Default model, can be overridden via .env
    GEMINI_API_KEY: str = ""
    GEMINI_MODEL: str = "gemini-pro"
    LLM_PROVIDER: str = "openai"  # "openai" or "gemini"
    GOOGLE_API_KEY: str = ""
    GOOGLE_CSE_ID: str = ""
    GOOGLE_SEARCH_TIMEOUT: float = (
        10.0  # Timeout in seconds for Google Search API requests
    )
    GOOGLE_SEARCH_MAX_CONCURRENT: int = 3  # Max concurrent Google Search API requests
    SEARCH_PROVIDER: str = "google"
    BACKEND_CORS_ORIGINS: list[str] | str = [
        "http://localhost:5173",
        "http://localhost:3000",
    ]
    CHROME_EXTENSION_IDS: list[str] = [
        "amnjngnkcgooljnblcejpmkdhpikcdlp",  # Default local dev ID
    ]

    @field_validator("BACKEND_CORS_ORIGINS", mode="before")
    @classmethod
    def parse_cors_origins(cls, v: str | list[str]) -> list[str]:
        # If already a list, return immediately
        if isinstance(v, list):
            return v

        # If string, check if it's JSON
        if isinstance(v, str):
            # JSON array or object
            if v.startswith("[") or v.startswith("{"):
                try:
                    parsed = json.loads(v)
                except (json.JSONDecodeError, ValueError) as e:
                    raise ValueError(
                        f"BACKEND_CORS_ORIGINS: invalid JSON - {e}. "
                        f"Offending value: {v}"
                    ) from e

                if not isinstance(parsed, list):
                    raise ValueError(
                        f"BACKEND_CORS_ORIGINS: JSON parsed value must be a list, "
                        f"got {type(parsed).__name__}: {v}"
                    )
                return parsed

            # Comma-separated string
            return [i.strip() for i in v.split(",")]

        # Invalid type
        raise ValueError(
            f"BACKEND_CORS_ORIGINS: expected list or string, "
            f"got {type(v).__name__}: {v}"
        )


settings = Settings()
