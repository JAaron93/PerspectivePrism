"""
Input sanitization utility to prevent prompt injection attacks.

This module provides functions to sanitize user inputs before they are
interpolated into LLM prompts, protecting against prompt injection attacks.
"""

import re
import unicodedata
from typing import Optional

# Constants for delimited sections
USER_DATA_START = "===USER DATA START==="
USER_DATA_END = "===USER DATA END==="

# Maximum lengths for different input types
MAX_CLAIM_LENGTH = 5000
MAX_EVIDENCE_LENGTH = 10000
MAX_CONTEXT_LENGTH = 2000
MAX_PERSPECTIVE_LENGTH = 50

# Suspicious patterns that might indicate injection attempts
SUSPICIOUS_PATTERNS = [
    r'ignore\s+(previous|above|all)\s+instructions?',
    r'system\s*:',
    r'assistant\s*:',
    r'user\s*:',
    r'<\|im_start\|>',
    r'<\|im_end\|>',
    r'\[inst\]',
    r'\[/inst\]',
    r'###\s*instruction',
    r'###\s*response',
    r'```\s*system',
    r'forget\s+(everything|all|previous)',
    r'you\s+are\s+now',
    r'pretend\s+to\s+be',
    r'act\s+as\s+a',
]

class SanitizationError(ValueError):
    """Raised when input fails sanitization checks."""
    pass


def contains_control_characters(text: str) -> bool:
    """Check if text contains control characters (except common whitespace)."""
    for char in text:
        category = unicodedata.category(char)
        # Allow tab, newline, carriage return
        if char in ['\t', '\n', '\r']:
            continue
        # Reject other control characters
        if category.startswith('C'):
            return True
    return False


def contains_suspicious_patterns(text: str) -> bool:
    """Check if text contains patterns commonly used in injection attacks."""
    text_lower = text.lower()
    for pattern in SUSPICIOUS_PATTERNS:
        if re.search(pattern, text_lower):
            return True
    return False


def escape_special_characters(text: str) -> str:
    """
    Escape special characters that could break prompt structure.
    
    This escapes quotes and other characters while preserving readability.
    Newlines are normalized rather than escaped to maintain text flow.
    """
    # Normalize newlines
    text = text.replace('\r\n', '\n').replace('\r', '\n')
    
    # Escape backslashes first to avoid double-escaping
    text = text.replace('\\', '\\\\')
    
    # Escape quotes
    text = text.replace('"', '\\"')
    text = text.replace("'", "\\'")
    
    # Escape curly braces to prevent accidental template injection
    text = text.replace('{', '\\{')
    text = text.replace('}', '\\}')
    
    return text


def truncate_text(text: str, max_length: int) -> str:
    """
    Truncate text to max_length, adding ellipsis if truncated.
    
    Handles the edge case where truncation might leave a trailing backslash
    that would escape the ellipsis characters.
    """
    if len(text) <= max_length:
        return text
    
    # Calculate the cut point
    cut_point = max_length - 3
    truncated = text[:cut_point]
    
    # Count consecutive backslashes from the end
    backslash_count = 0
    for i in range(len(truncated) - 1, -1, -1):
        if truncated[i] == '\\':
            backslash_count += 1
        else:
            break
    
    # If odd number of backslashes at the end, the last one would escape the ellipsis
    # Shift the cut back by one to remove the problematic backslash
    if backslash_count % 2 == 1:
        truncated = truncated[:-1]
    
    return truncated + "..."


def sanitize_input(
    text: str,
    max_length: int,
    field_name: str = "input",
    allow_suspicious_patterns: bool = False,
    allow_control_chars: bool = False
) -> str:
    """
    Sanitize user input to prevent prompt injection.
    
    Args:
        text: The input text to sanitize
        max_length: Maximum allowed length
        field_name: Name of the field (for error messages)
        allow_suspicious_patterns: If False, reject inputs with suspicious patterns
        allow_control_chars: If False, reject inputs with control characters
        
    Returns:
        Sanitized text
        
    Raises:
        SanitizationError: If input fails validation
    """
    if not isinstance(text, str):
        raise SanitizationError(f"{field_name} must be a string")
    
    # Strip leading/trailing whitespace
    text = text.strip()
    
    if not text:
        raise SanitizationError(f"{field_name} cannot be empty")
    
    # Check for control characters
    if not allow_control_chars and contains_control_characters(text):
        raise SanitizationError(f"{field_name} contains invalid control characters")
    
    # Check for suspicious patterns
    if not allow_suspicious_patterns and contains_suspicious_patterns(text):
        raise SanitizationError(
            f"{field_name} contains patterns that may indicate a prompt injection attempt"
        )
    
    # Escape special characters
    text = escape_special_characters(text)
    
    # Truncate if needed (after escaping to ensure final length constraint)
    text = truncate_text(text, max_length)
    
    return text


def sanitize_claim_text(claim_text: str) -> str:
    """Sanitize claim text for use in prompts."""
    return sanitize_input(
        claim_text,
        max_length=MAX_CLAIM_LENGTH,
        field_name="Claim text",
        allow_suspicious_patterns=False,
        allow_control_chars=False
    )


def sanitize_perspective_value(perspective_value: str) -> str:
    """Sanitize perspective value for use in prompts."""
    return sanitize_input(
        perspective_value,
        max_length=MAX_PERSPECTIVE_LENGTH,
        field_name="Perspective value",
        allow_suspicious_patterns=False,
        allow_control_chars=False
    )


def sanitize_evidence_text(evidence_text: str) -> str:
    """Sanitize evidence text for use in prompts."""
    return sanitize_input(
        evidence_text,
        max_length=MAX_EVIDENCE_LENGTH,
        field_name="Evidence text",
        allow_suspicious_patterns=False,
        allow_control_chars=False
    )


def sanitize_context(context: Optional[str]) -> str:
    """Sanitize context text for use in prompts."""
    if not context:
        return ""
    return sanitize_input(
        context,
        max_length=MAX_CONTEXT_LENGTH,
        field_name="Context",
        allow_suspicious_patterns=False,
        allow_control_chars=False
    )


def wrap_user_data(data: str, label: str = "USER DATA") -> str:
    """
    Wrap user data in clearly delimited sections.
    
    This makes it clear to the LLM where user-provided data begins and ends,
    reducing the risk of prompt injection.
    """
    return f"{USER_DATA_START}\n{label}:\n{data}\n{USER_DATA_END}"
