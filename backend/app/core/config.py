import json
from typing import ClassVar, Self

from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env")

    PROJECT_NAME: str = "Perspective Prism MVP"
    LLM_MODEL: str = "gemini-3.8-flash"
    
    # Gemini 3.8 Flash Capability Optimization Settings
    GEMINI_THINKING_LEVEL: str = "high"
    GEMINI_MAX_OUTPUT_TOKENS: int = 65536
    GEMINI_HTTP_TIMEOUT: float = 120.0
    
    # Backup / Fallback Configuration
    BACKUP_LLM_MODEL: str = "gemini-3.1-flash-lite"
    
    # Reliability Settings
    CIRCUIT_BREAKER_FAIL_THRESHOLD: int = 3
    CIRCUIT_BREAKER_RESET_TIMEOUT: int = 60  # seconds

    # GCP Vertex AI Configuration (Exclusively uses GCP billing credits via Vertex AI)
    GCP_PROJECT: str = ""
    GOOGLE_CLOUD_PROJECT: str = ""
    GCP_LOCATION: str = "global"
    GEMINI_TIER: str = "paid"

    # Tier-based concurrency limits for LLM API calls.
    # Lock to 'paid' tier (GCP billing credits) for high-throughput quota (300+ RPM).
    TIER_CONCURRENCY_LIMITS: ClassVar[dict[str, int]] = {
        "paid": 10,
    }

    @property
    def effective_gcp_project(self) -> str:
        return (self.GCP_PROJECT or self.GOOGLE_CLOUD_PROJECT or "").strip()

    @property
    def tier_max_concurrency(self) -> int:
        """Returns the maximum concurrent LLM API calls allowed for the paid tier.
        
        Guarantees a positive integer >= 1.
        """
        val = self.TIER_CONCURRENCY_LIMITS.get(self.GEMINI_TIER, 10)
        try:
            val_int = int(val)
            return max(1, val_int)
        except (ValueError, TypeError):
            return 10

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
    MAX_CLAIMS_PER_ANALYSIS: int = 15

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

    @field_validator("MAX_CLAIMS_PER_ANALYSIS", mode="after")
    @classmethod
    def validate_max_claims(cls, v: int) -> int:
        if v < 1:
            raise ValueError(f"MAX_CLAIMS_PER_ANALYSIS must be at least 1, got {v}")
        return v

    @field_validator("GEMINI_TIER", mode="after")
    @classmethod
    def validate_gemini_tier(cls, v: str) -> str:
        tier = (v or "").strip().lower()
        if tier != "paid":
            raise ValueError(f"GEMINI_TIER must be 'paid' for GCP Vertex AI Mode, got '{v}'")
        return tier

    @field_validator("GEMINI_THINKING_LEVEL", mode="after")
    @classmethod
    def validate_thinking_level(cls, v: str) -> str:
        level = (v or "").strip().lower()
        if level not in {"minimal", "low", "medium", "high"}:
            raise ValueError(
                f"GEMINI_THINKING_LEVEL must be one of 'minimal', 'low', 'medium', 'high', got '{v}'"
            )
        return level

    @field_validator("GEMINI_MAX_OUTPUT_TOKENS", mode="after")
    @classmethod
    def validate_max_output_tokens(cls, v: int) -> int:
        if v < 1024:
            raise ValueError(
                f"GEMINI_MAX_OUTPUT_TOKENS must be at least 1024, got {v}"
            )
        return v

    @field_validator("GEMINI_HTTP_TIMEOUT", mode="after")
    @classmethod
    def validate_http_timeout(cls, v: float) -> float:
        if v < 10.0:
            raise ValueError(
                f"GEMINI_HTTP_TIMEOUT must be at least 10.0 seconds, got {v}"
            )
        return v

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


def configure_provider_env(active_settings=None) -> dict[str, str]:
    """Synchronizes LLM provider environment variables based on injected settings.

    Configures environment for GCP Vertex AI mode (Paid Tier) and purges any legacy AI Studio API keys.
    """
    import os

    cfg = active_settings if active_settings is not None else settings

    raw_gcp = getattr(cfg, "effective_gcp_project", "")
    gcp_project = raw_gcp.strip() if isinstance(raw_gcp, str) and raw_gcp.strip() else ""

    raw_loc = getattr(cfg, "GCP_LOCATION", "global")
    gcp_location = raw_loc.strip() if isinstance(raw_loc, str) and raw_loc.strip() else "global"

    if not gcp_project:
        os.environ.pop("GOOGLE_GENAI_USE_VERTEXAI", None)
        os.environ.pop("GCP_PROJECT", None)
        os.environ.pop("GOOGLE_CLOUD_PROJECT", None)
        os.environ.pop("GCP_LOCATION", None)
        os.environ.pop("GEMINI_API_KEY", None)
        os.environ.pop("LLM_API_KEY", None)
        raise ValueError(
            "GCP_PROJECT or GOOGLE_CLOUD_PROJECT is not configured. "
            "Google AI Studio Key Mode has been permanently removed; this project exclusively uses GCP Vertex AI Mode (Paid Tier). "
            "Please set GCP_PROJECT in your .env file. Example: GCP_PROJECT=my-gcp-project-id"
        )

    os.environ["GOOGLE_GENAI_USE_VERTEXAI"] = "true"
    os.environ["GCP_PROJECT"] = gcp_project
    os.environ["GCP_LOCATION"] = gcp_location
    os.environ["GEMINI_TIER"] = "paid"
    os.environ.pop("GEMINI_API_KEY", None)
    os.environ.pop("LLM_API_KEY", None)

    return {
        "mode": "vertex",
        "project": gcp_project,
        "location": gcp_location,
        "tier": "paid",
    }
