import json
from typing import Self

from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env")

    PROJECT_NAME: str = "Perspective Prism MVP"
    LLM_API_KEY: str = ""
    LLM_BASE_URL: str = "https://api.openai.com/v1"
    LLM_MODEL: str = "gpt-3.5-turbo"  # Default model, can be overridden via .env
    
    # Backup / Fallback Configuration
    BACKUP_LLM_API_KEY: str = ""
    BACKUP_LLM_BASE_URL: str = "https://api.openai.com/v1"
    BACKUP_LLM_MODEL: str = "gpt-4o"
    
    # Reliability Settings
    CIRCUIT_BREAKER_FAIL_THRESHOLD: int = 5
    CIRCUIT_BREAKER_RESET_TIMEOUT: int = 60  # seconds

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

    # Deception Analysis Thresholds (valid range: 0.0 to 10.0)
    DECEPTION_THRESHOLD_HIGH: float = 7.0
    DECEPTION_THRESHOLD_MODERATE: float = 5.0

    @model_validator(mode="after")
    def validate_deception_thresholds(self) -> Self:
        """Validate deception threshold values are logically consistent and within range.

        Ensures:
        - Both thresholds are within the valid 0-10 score range
        - DECEPTION_THRESHOLD_HIGH is strictly greater than DECEPTION_THRESHOLD_MODERATE

        Raises:
            ValueError: If thresholds are outside valid range or not properly ordered.
        """
        low = self.DECEPTION_THRESHOLD_MODERATE
        high = self.DECEPTION_THRESHOLD_HIGH

        # Validate range bounds (0 to 10)
        if not (0.0 <= low <= 10.0):
            raise ValueError(
                f"DECEPTION_THRESHOLD_MODERATE must be between 0 and 10, got {low}"
            )
        if not (0.0 <= high <= 10.0):
            raise ValueError(
                f"DECEPTION_THRESHOLD_HIGH must be between 0 and 10, got {high}"
            )

        # Validate ordering: HIGH must be strictly greater than MODERATE
        if high <= low:
            raise ValueError(
                f"DECEPTION_THRESHOLD_HIGH ({high}) must be strictly greater than "
                f"DECEPTION_THRESHOLD_MODERATE ({low})"
            )

        return self

    @model_validator(mode="after")
    def validate_circuit_breaker_settings(self) -> Self:
        """Validate circuit breaker configuration values.

        Ensures:
        - CIRCUIT_BREAKER_FAIL_THRESHOLD is at least 1
        - CIRCUIT_BREAKER_RESET_TIMEOUT is at least 1

        Raises:
            ValueError: If settings are non-positive.
        """
        threshold = self.CIRCUIT_BREAKER_FAIL_THRESHOLD
        timeout = self.CIRCUIT_BREAKER_RESET_TIMEOUT

        if threshold < 1:
            raise ValueError(
                f"CIRCUIT_BREAKER_FAIL_THRESHOLD must be at least 1, got {threshold}"
            )
        if timeout < 1:
            raise ValueError(
                f"CIRCUIT_BREAKER_RESET_TIMEOUT must be at least 1, got {timeout}"
            )

        return self

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
