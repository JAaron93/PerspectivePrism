"""Deterministic sanitizer probe runner for prompt-injection red-teaming."""

from enum import Enum
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, ConfigDict, Field

from app.utils.input_sanitizer import (
    sanitize_input,
    SanitizationError,
    MAX_CLAIM_LENGTH,
    MAX_EVIDENCE_LENGTH,
)
from app.utils.prompt_helpers import build_user_data_prompt
from redteam.corpus import PayloadEntry, Stage


# Stage-appropriate maximum lengths
STAGE_MAX_LENGTHS: Dict[Stage, int] = {
    Stage.S1: 100000,  # Transcripts (100k chars)
    Stage.S2: MAX_CLAIM_LENGTH,     # Claims (5k chars)
    Stage.S3: MAX_EVIDENCE_LENGTH,  # Evidence snippets (10k chars)
}


class ProbeStatus(str, Enum):
    BLOCKED = "blocked"
    BYPASSED = "bypassed"
    ERROR = "error"


class ProbeResult(BaseModel):
    model_config = ConfigDict(extra="allow", use_enum_values=True)

    payload_id: str = Field(..., description="Unique payload ID from corpus")
    stage: Stage = Field(..., description="Injection stage (S1, S2, S3)")
    status: ProbeStatus = Field(..., description="Sanitization outcome: blocked, bypassed, or error")
    delimiter_forgery_survived: bool = Field(
        default=False,
        description="Whether a forged delimiter sequence in the payload survived sanitization into the prompt"
    )
    sanitized_text: Optional[str] = Field(
        default=None,
        description="Sanitized payload output if bypassed"
    )
    assembled_prompt: Optional[str] = Field(
        default=None,
        description="Final assembled prompt string with user data wrapper if bypassed"
    )
    error_message: Optional[str] = Field(
        default=None,
        description="Sanitization or system error message if blocked or errored"
    )
    metadata: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Optional execution metadata"
    )


def probe_payload(
    entry: PayloadEntry,
    default_instruction: str = "Extract all factual claims."
) -> ProbeResult:
    """
    Executes a single corpus payload through the deterministic sanitization layer.
    
    Zero-network invariant: Operates strictly in-process with no external LLM or API calls.
    """
    max_length = STAGE_MAX_LENGTHS.get(entry.stage, 100000)

    try:
        sanitized = sanitize_input(
            text=entry.payload,
            max_length=max_length,
            field_name=f"Payload {entry.id}",
            allow_suspicious_patterns=False,
            allow_control_chars=False,
        )
    except SanitizationError as se:
        return ProbeResult(
            payload_id=entry.id,
            stage=entry.stage,
            status=ProbeStatus.BLOCKED,
            error_message=str(se),
            delimiter_forgery_survived=False,
        )
    except Exception as exc:
        return ProbeResult(
            payload_id=entry.id,
            stage=entry.stage,
            status=ProbeStatus.ERROR,
            error_message=str(exc),
            delimiter_forgery_survived=False,
        )

    # Payload bypassed sanitization — construct prompt and check delimiter containment
    assembled_prompt = build_user_data_prompt(data=sanitized, instruction=default_instruction)
    
    # Check if a forged delimiter sequence survived sanitization
    # e.g., if the payload contained '===USER DATA END===' and it survived into sanitized text
    delimiter_forgery_survived = (
        "===USER DATA END===" in entry.payload and "===USER DATA END===" in sanitized
    )

    return ProbeResult(
        payload_id=entry.id,
        stage=entry.stage,
        status=ProbeStatus.BYPASSED,
        sanitized_text=sanitized,
        assembled_prompt=assembled_prompt,
        delimiter_forgery_survived=delimiter_forgery_survived,
    )


def run_probe(
    corpus: List[PayloadEntry],
    default_instruction: str = "Extract all factual claims."
) -> List[ProbeResult]:
    """
    Executes all payloads in the provided corpus through the deterministic sanitizer probe.
    """
    return [probe_payload(entry, default_instruction=default_instruction) for entry in corpus]
