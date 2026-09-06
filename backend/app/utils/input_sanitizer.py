"""
Input sanitization utility to prevent prompt injection attacks.

This module provides functions to sanitize user inputs before they are
interpolated into LLM prompts, protecting against prompt injection attacks.
"""

import re
import secrets
import unicodedata
from typing import Optional, Any, Dict, Iterable, List

# Constants for delimited sections
USER_DATA_START = "===USER DATA START==="
USER_DATA_END = "===USER DATA END==="

# Maximum lengths for different input types
MAX_CLAIM_LENGTH = 5000
MAX_EVIDENCE_LENGTH = 10000
MAX_CONTEXT_LENGTH = 2000
MAX_PERSPECTIVE_LENGTH = 50
MAX_METADATA_FIELD_LENGTH = 1000
MAX_CATEGORY_LENGTH = 100
MAX_QUOTE_LENGTH = 1500

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

try:
    import prism_sanitizer_rs
    from prism_sanitizer_rs import SanitizationError, PySanitizationError
    HAS_RUST_SANITIZER = True
except ImportError:
    HAS_RUST_SANITIZER = False

    class SanitizationError(ValueError):
        """Raised when input fails sanitization checks."""
        pass

    PySanitizationError = SanitizationError


def contains_control_characters(text: str) -> bool:
    """Check if text contains control characters (except common whitespace)."""
    if HAS_RUST_SANITIZER:
        return prism_sanitizer_rs.contains_control_characters(text)
    for char in text:
        if char in ('\t', '\n', '\r'):
            continue
        if unicodedata.category(char).startswith('C'):
            return True
    return False


def contains_suspicious_patterns(text: str) -> bool:
    """Check if text contains patterns commonly used in injection attacks."""
    if HAS_RUST_SANITIZER:
        return prism_sanitizer_rs.contains_suspicious_patterns(text)
    return any(re.search(pat, text, re.IGNORECASE) for pat in SUSPICIOUS_PATTERNS)


def escape_special_characters(text: str) -> str:
    """
    Escape special characters that could break prompt structure.
    
    This escapes quotes and other characters while preserving readability.
    Newlines are normalized rather than escaped to maintain text flow.
    """
    if HAS_RUST_SANITIZER:
        return prism_sanitizer_rs.escape_special_characters(text)
    text = text.replace("\r\n", "\n").replace('\r', "\n")
    text = text.replace('\\', "\\\\")
    text = text.replace('"', "\\\"")
    text = text.replace('\'', "\\'")
    text = text.replace('{', "\\{")
    text = text.replace('}', "\\}")
    return text



def truncate_text(text: str, max_length: int) -> str:
    """
    Truncate text to max_length, adding ellipsis if truncated.
    
    Handles the edge case where truncation might leave a trailing backslash
    that would escape the ellipsis characters.
    """
    if len(text) <= max_length:
        return text
    if max_length <= 0:
        return ""
    if max_length < 3:
        return text[:max_length]
    
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
    if not isinstance(max_length, int) or max_length < 0:
        raise SanitizationError(f"{field_name} max_length must be non-negative")
    
    if HAS_RUST_SANITIZER:
        try:
            return prism_sanitizer_rs.sanitize_input(
                text,
                max_length,
                allow_suspicious_patterns,
                allow_control_chars,
            )
        except (SanitizationError, ValueError) as e:
            err_msg = str(e)
            if "cannot be empty" in err_msg:
                raise SanitizationError(f"{field_name} cannot be empty") from None
            elif "contains invalid control characters" in err_msg:
                raise SanitizationError(f"{field_name} contains invalid control characters") from None
            elif "suspicious patterns" in err_msg or "prompt injection" in err_msg:
                raise SanitizationError(
                    f"{field_name} contains patterns that may indicate a prompt injection attempt"
                ) from None
            else:
                if err_msg.startswith("input "):
                    err_msg = f"{field_name} " + err_msg[6:]
                raise SanitizationError(err_msg) from None

    # Fallback to pure-Python implementation
    text = text.strip()
    text = unicodedata.normalize("NFKC", text)
    
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


def sanitize_metadata_field(
    text: Optional[str],
    field_name: str = "Metadata field",
    max_length: int = MAX_METADATA_FIELD_LENGTH
) -> str:
    """Sanitize client-extracted YouTube metadata string."""
    if not text:
        return ""
    return sanitize_input(
        text,
        max_length=max_length,
        field_name=field_name,
        allow_suspicious_patterns=False,
        allow_control_chars=False
    )


def sanitize_category_string(category: Optional[str]) -> str:
    """Sanitize YouTube category name."""
    if not category:
        return ""
    return sanitize_input(
        category,
        max_length=MAX_CATEGORY_LENGTH,
        field_name="Category name",
        allow_suspicious_patterns=False,
        allow_control_chars=False
    )


def sanitize_quote_evidence(quote: str) -> str:
    """Sanitize exact transcript quote evidence."""
    return sanitize_input(
        quote,
        max_length=MAX_QUOTE_LENGTH,
        field_name="Quote evidence",
        allow_suspicious_patterns=False,
        allow_control_chars=False
    )


def sanitize_quote_evidences(quotes: Optional[Iterable[str]]) -> List[str]:
    """
    Iterates over transcript quote evidence strings from the Alethiology agent,
    applies sanitize_quote_evidence(), and filters out any quotes that fail sanitization.

    Returns:
        List of sanitized quote evidence strings.
    """
    if not quotes:
        return []
    clean_quotes = []
    for quote in quotes:
        try:
            clean_quotes.append(sanitize_quote_evidence(quote))
        except SanitizationError:
            continue
    return clean_quotes


def sanitize_video_metadata(metadata: Optional[Any]) -> Dict[str, str]:
    """
    Sanitizes all string fields within a VideoMetadata object or returns clean empty strings.

    Returns:
        dict with keys: 'title', 'channel_name', 'category_name', 'description_snippet', 'tags'
    """
    if metadata is None:
        return {
            "title": "",
            "channel_name": "",
            "category_name": "",
            "description_snippet": "",
            "tags": "",
        }

    clean_title = sanitize_metadata_field(getattr(metadata, "title", None) or "", "Title")
    clean_channel = sanitize_metadata_field(getattr(metadata, "channel_name", None) or "", "Channel")
    clean_category = sanitize_category_string(getattr(metadata, "category_name", None) or "")
    clean_desc = sanitize_metadata_field(
        getattr(metadata, "description_snippet", None) or "",
        "Description",
        max_length=500
    )

    raw_tags = getattr(metadata, "tags", None) or []
    clean_tags = ", ".join(
        sanitize_metadata_field(tag, "Tag", max_length=100)
        for tag in raw_tags
    )

    return {
        "title": clean_title,
        "channel_name": clean_channel,
        "category_name": clean_category,
        "description_snippet": clean_desc,
        "tags": clean_tags,
    }


def neutralize_delimiter_forgery(text: str, label: str = "USER DATA", nonce: Optional[str] = None) -> str:
    """
    Neutralizes forged delimiter boundaries inside untrusted user data to prevent prompt breakout.
    """
    def replace_delim(m):
        bound = m.group(2) or "END"
        sub_nonce = m.group(1)
        if sub_nonce:
            return f"===USER DATA {sub_nonce.strip()} [NEUTRALIZED] {bound}==="
        else:
            return f"===USER DATA [NEUTRALIZED] {bound}==="

    pattern = r"===USER DATA(?:\s+([^\n=\[\]]+))?\s+(END|START)==="
    neutralized = re.sub(pattern, replace_delim, text)

    if label != "USER DATA":
        custom_pattern = rf"==={re.escape(label)}(?:\s+([^\n=\[\]]+))?\s+(END|START)==="
        def replace_custom(m):
            bound = m.group(2) or "END"
            sub_nonce = m.group(1)
            if sub_nonce:
                return f"==={label} {sub_nonce.strip()} [NEUTRALIZED] {bound}==="
            else:
                return f"==={label} [NEUTRALIZED] {bound}==="
        neutralized = re.sub(custom_pattern, replace_custom, neutralized)

    return neutralized


def wrap_user_data(data: str, label: str = "USER DATA", nonce: Optional[str] = None) -> str:
    """
    Wrap user data in clearly delimited sections with dynamic nonce delimiters.
    
    This makes it clear to the LLM where user-provided data begins and ends,
    reducing the risk of prompt injection and neutralizing delimiter forgery.
    """
    if HAS_RUST_SANITIZER:
        try:
            return prism_sanitizer_rs.wrap_user_data(data, label, nonce)
        except Exception:
            pass

    if nonce is None:
        active_nonce = secrets.token_hex(4)
        start_delim = f"==={label} {active_nonce} START==="
        end_delim = f"==={label} {active_nonce} END==="
    elif nonce == "":
        active_nonce = ""
        start_delim = f"==={label} START==="
        end_delim = f"==={label} END==="
    else:
        active_nonce = nonce
        start_delim = f"==={label} {active_nonce} START==="
        end_delim = f"==={label} {active_nonce} END==="

    if contains_delimiter_forgery(data, active_nonce) or re.search(r"===USER DATA(?:\s+([^\n=\[\]]+))?\s+(END|START)===", data):
        data = neutralize_delimiter_forgery(data, label, active_nonce)

    return f"{start_delim}\n{data}\n{end_delim}"


def contains_delimiter_forgery(text: str, nonce: Optional[str] = None) -> bool:
    """
    Check if text contains delimiter forgery attempts (such as ===USER DATA or
    matching active closing delimiters).
    """
    if HAS_RUST_SANITIZER:
        try:
            return prism_sanitizer_rs.contains_delimiter_forgery(text, nonce)
        except Exception:
            pass

    if "===USER DATA" in text:
        return True
    if nonce is not None:
        if nonce == "":
            return "===USER DATA END===" in text
        else:
            return f"===USER DATA {nonce} END===" in text
    return False


