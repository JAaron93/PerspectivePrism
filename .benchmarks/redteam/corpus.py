"""Payload corpus schema, loader, and validation for prompt-injection red-teaming."""

from enum import Enum
from pathlib import Path
from typing import Any, Dict, List, Optional, Union
import yaml
from pydantic import BaseModel, ConfigDict, Field, ValidationError


class Stage(str, Enum):
    S1 = "S1"
    S2 = "S2"
    S3 = "S3"


class ExpectedOutcome(str, Enum):
    BLOCKED = "blocked"
    PASSES_BUT_SAFE = "passes-but-safe"
    DETECTED_LIVE = "detected-live"
    ERROR = "error"


class Severity(str, Enum):
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"
    INFORMATIONAL = "informational"


class CorpusValidationError(Exception):
    """Raised when one or more payload entries fail schema or uniqueness validation."""
    pass


class PayloadEntry(BaseModel):
    model_config = ConfigDict(extra="allow", use_enum_values=True)

    id: str = Field(..., description="Globally unique and stable identifier (e.g., PI-DIR-001, LEG-001)")
    stage: Stage = Field(..., description="Injection stage entry point (S1: direct transcript, S2: claim, S3: evidence)")
    technique: str = Field(..., description="Name or description of the attack or control technique")
    payload: str = Field(..., description="Raw text payload string")
    expected: ExpectedOutcome = Field(..., description="Expected outcome: blocked, passes-but-safe, detected-live, or error")
    severity: Severity = Field(..., description="Severity level: critical, high, medium, low, informational")
    metadata: Optional[Dict[str, Any]] = Field(default=None, description="Optional metadata or annotations")


def get_default_payloads_dir() -> Path:
    """Returns the default directory for payload YAML files."""
    return Path(__file__).resolve().parent / "payloads"


def load_corpus(payloads_dir: Optional[Union[str, Path]] = None) -> List[PayloadEntry]:
    """
    Loads, validates, and returns all payload entries from YAML files in payloads_dir.
    
    Ensures all required fields are present, values conform to schema, and IDs are globally unique.
    Raises CorpusValidationError with offending file path and payload ID on failure.
    """
    if payloads_dir is None:
        target_dir = get_default_payloads_dir()
    else:
        target_dir = Path(payloads_dir)

    if not target_dir.exists():
        return []

    entries: List[PayloadEntry] = []
    seen_ids: Dict[str, Path] = {}

    yaml_files = sorted(list(target_dir.glob("*.yaml")) + list(target_dir.glob("*.yml")))

    for file_path in yaml_files:
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                raw_data = yaml.safe_load(f)
        except Exception as e:
            raise CorpusValidationError(f"In file '{file_path.name}': Failed to parse YAML: {e}") from e

        if raw_data is None:
            continue

        if not isinstance(raw_data, list):
            raise CorpusValidationError(
                f"In file '{file_path.name}': Expected top-level YAML list of payload entries, got {type(raw_data).__name__}"
            )

        for idx, item in enumerate(raw_data):
            if not isinstance(item, dict):
                raise CorpusValidationError(
                    f"In file '{file_path.name}', entry index {idx}: Expected mapping/dict for payload entry, got {type(item).__name__}"
                )

            payload_id = item.get("id", f"<missing-id-at-index-{idx}>")

            # Check required fields explicitly before or during validation to provide precise messages
            required_fields = ["id", "stage", "technique", "payload", "expected", "severity"]
            missing_fields = [f for f in required_fields if f not in item or item[f] is None]
            if missing_fields:
                raise CorpusValidationError(
                    f"In file '{file_path.name}', payload '{payload_id}': missing required field(s): {', '.join(missing_fields)}"
                )

            # Check ID uniqueness
            if payload_id in seen_ids:
                prev_file = seen_ids[payload_id]
                raise CorpusValidationError(
                    f"Duplicate payload ID '{payload_id}' in '{file_path.name}', previously defined in '{prev_file.name}'"
                )

            # Validate against Pydantic schema
            try:
                entry = PayloadEntry(**item)
            except ValidationError as ve:
                raise CorpusValidationError(
                    f"In file '{file_path.name}', payload '{payload_id}': schema validation failed: {ve}"
                ) from ve

            seen_ids[payload_id] = file_path
            entries.append(entry)

    return entries
