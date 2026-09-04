"""Zero-trust evaluation input sanitizer and delimitation defense (FR14, FR15)."""

import re
import secrets
import unicodedata
from typing import Optional

# Canonical instruction delimiters targeted by prompt injection attacks
INSTRUCTION_DELIMITERS = [
    r"\[INST\]",
    r"\[/INST\]",
    r"<<SYS>>",
    r"<</SYS>>",
    r"<\|im_start\|>",
    r"<\|im_end\|>",
    r"\[SYS\]",
    r"\[/SYS\]",
    r"<\|system\|>",
    r"<\|user\|>",
    r"<\|assistant\|>",
]

# Combined case-insensitive regex for stripping instruction delimiters
DELIMITER_REGEX = re.compile(
    "|".join(INSTRUCTION_DELIMITERS),
    re.IGNORECASE,
)

# Imperative scoring directives attempting to force judge verdicts
_EVAL_VERBS = r"(?:assign|give|set|rate|award|score|force|yield|return|override)"
_EVAL_NOUNS = r"(?:score|scores|rating|ratings|grade|grades|verdict|verdicts|evaluation|eval|rubric|points?|marks?|stars?)"
_SCORE_VALUES = r"(?:maximum|highest|perfect|top|best|full|(?:[1-9]|10)(?:\s*/\s*(?:[1-9]|10))?)"

# 1. Verb + Evaluation Noun + Score Value (or Score Value + Evaluation Noun)
_PATTERN_VERB_NOUN_VALUE = (
    rf"\b{_EVAL_VERBS}\b[^.!?\n]{{0,35}}?(?:"
    rf"\b{_EVAL_NOUNS}\b[^.!?\n]{{0,25}}?\b{_SCORE_VALUES}\b|"
    rf"\b{_SCORE_VALUES}\b[^.!?\n]{{0,25}}?\b{_EVAL_NOUNS}\b(?:\s+\b{_EVAL_NOUNS}\b)?"
    rf")"
)
# 2. Verb + Explicit Ratio/Fractional Score (e.g. 5/5, 10/10, 5 out of 5)
_PATTERN_VERB_RATIO = (
    rf"\b{_EVAL_VERBS}\b[^.!?\n]{{0,35}}?\b(?:[1-9]|10)\s*(?:/|\bout\s+of\b)\s*(?:[1-9]|10)\b"
)
# 3. Force/Override + Superlative (e.g. FORCE PERFECT 10, override to maximum)
_PATTERN_FORCE_SUPERLATIVE = (
    r"\b(?:force|override)\b[^.!?\n]{0,25}?\b(?:perfect|maximum|highest)\b(?:\s*(?:10|5))?\b"
)

SCORING_DIRECTIVE_REGEX = re.compile(
    rf"({_PATTERN_VERB_NOUN_VALUE}|{_PATTERN_VERB_RATIO}|{_PATTERN_FORCE_SUPERLATIVE})",
    re.IGNORECASE,
)


def strip_instruction_delimiters(text: str) -> str:
    """Strips common LLM system/instruction prompt delimiters case-insensitively."""
    if not text:
        return text
    return DELIMITER_REGEX.sub("", text)


def neutralize_scoring_directives(text: str) -> str:
    """Neutralizes imperative directives attempting to force judge ratings."""
    if not text:
        return text
    return SCORING_DIRECTIVE_REGEX.sub("[REDACTED_SCORING_DIRECTIVE]", text)


def escape_xml_sandbox_tags(text: str, tag_name: str = "untrusted_model_output") -> str:
    """Escapes opening and closing sandbox container tags to prevent XML breakout."""
    if not text:
        return text

    escaped_open = f"&lt;{tag_name}&gt;"
    escaped_close = f"&lt;/{tag_name}&gt;"

    # Case-insensitive replacement of opening and closing tags matching tag_name
    open_tag_pattern = re.compile(rf"<{re.escape(tag_name)}\s*>", re.IGNORECASE)
    close_tag_pattern = re.compile(rf"</{re.escape(tag_name)}\s*>", re.IGNORECASE)

    text = close_tag_pattern.sub(escaped_close, text)
    text = open_tag_pattern.sub(escaped_open, text)
    return text


def wrap_in_nonce_sandbox(
    text: str,
    nonce: Optional[str] = None,
    tag_name: str = "untrusted_model_output",
) -> str:
    """Wraps untrusted evaluation content in a cryptographic nonce sandbox."""
    active_nonce = nonce if nonce else secrets.token_hex(8)
    return (
        f"===JUDGE DATA {active_nonce} START===\n"
        f"<{tag_name}>\n"
        f"{text}\n"
        f"</{tag_name}>\n"
        f"===JUDGE DATA {active_nonce} END==="
    )


def sanitize_eval_input(
    text: str,
    nonce: Optional[str] = None,
    tag_name: str = "untrusted_model_output",
) -> str:
    """
    Executes the full zero-trust sanitization pipeline on untrusted evaluator inputs:
    1. Unicode NFKC normalization.
    2. Stripping LLM instruction delimiters.
    3. Neutralizing imperative scoring directives.
    4. Escaping inner sandbox container tags to prevent XML breakout.
    5. Wrapping in cryptographic per-request nonce delimiters.
    """
    if not isinstance(text, str):
        raise TypeError(f"Expected string input, got {type(text).__name__}")

    normalized = unicodedata.normalize("NFKC", text)
    stripped = strip_instruction_delimiters(normalized)
    neutralized = neutralize_scoring_directives(stripped)
    escaped = escape_xml_sandbox_tags(neutralized, tag_name=tag_name)
    return wrap_in_nonce_sandbox(escaped, nonce=nonce, tag_name=tag_name)
