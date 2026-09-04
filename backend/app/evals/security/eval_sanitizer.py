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
_EVAL_NOUNS = r"(?:score|scores|rating|ratings|grade|grades|verdict|verdicts|evaluation|eval|rubric|stars?)"
_SCORE_VALUES = r"(?:maximum|highest|perfect|top|best|full|(?:[1-9]|10)(?:\s*/\s*(?:[1-9]|10))?)"

# Grammatical filler: determiners, prepositions, target qualifiers, colons
_TARGET_QUALIFIER = r"(?:this|that|the|it)?(?:\s+(?:claim|output|response|result|transcript|transcription|text))?"
_FILLER = rf"(?:\s+(?:a|an|the|{_TARGET_QUALIFIER}|as|to|of|for|on|with|is|be|should\s+be|must\s+be|immediately|promptly)\b|\s*[:=]\s*)*\s*"
_BETWEEN = r"(?:\s+(?:a|an|the|of|to|as|is|be|possible|immediately)\b|\s*[:=]\s*)*\s*"

# 1. Verb + Evaluation Noun + Score Value (e.g. set score to perfect, give a score of 5, rate score: 10)
_PATTERN_VERB_NOUN_VALUE = (
    rf"\b{_EVAL_VERBS}\b{_FILLER}"
    rf"\b{_EVAL_NOUNS}\b{_BETWEEN}"
    rf"\b{_SCORE_VALUES}\b"
)
# 2. Verb + Score Value + Evaluation Noun (e.g. give maximum score, force a 5 rating, yield top evaluation grade)
_PATTERN_VERB_VALUE_NOUN = (
    rf"\b{_EVAL_VERBS}\b{_FILLER}"
    rf"\b{_SCORE_VALUES}\b{_BETWEEN}"
    rf"\b{_EVAL_NOUNS}\b"
)
# 3. Verb + Ratio/Fractional Score (e.g. assign 5/5, rate this as 10/10, give 5 out of 5)
_PATTERN_VERB_RATIO = (
    rf"\b{_EVAL_VERBS}\b{_FILLER}"
    rf"\b(?:[1-9]|10)\s*(?:/|\bout\s+of\b)\s*(?:[1-9]|10)\b"
)
# 4. Award/Assign/Give/Yield Points (e.g. award 10 points, yield full points, assign 5 points to this output)
_PATTERN_VERB_POINTS = (
    rf"\b(?:award|assign|give|yield)\b{_FILLER}"
    rf"\b(?:full|maximum|highest|top|[1-9]|10)\b{_BETWEEN}"
    r"\bpoints?\b"
)
# 5. Force/Override + Superlative (e.g. FORCE PERFECT 10, override to maximum)
_PATTERN_FORCE_SUPERLATIVE = (
    rf"\b(?:force|override)\b{_FILLER}"
    r"\b(?:perfect|maximum|highest)\b(?:\s*(?:10|5))?\b"
)
# 6. Direct rate/score + single number in evaluation context (e.g. rate this claim as 5)
_PATTERN_RATE_DIRECT = (
    rf"\b(?:rate|score)\b\s+{_TARGET_QUALIFIER}\s+(?:as\s+|a\s+)?\b(?:[1-9]|10)\b"
)

SCORING_DIRECTIVE_REGEX = re.compile(
    rf"({_PATTERN_VERB_NOUN_VALUE}|{_PATTERN_VERB_VALUE_NOUN}|{_PATTERN_VERB_RATIO}|{_PATTERN_VERB_POINTS}|{_PATTERN_FORCE_SUPERLATIVE}|{_PATTERN_RATE_DIRECT})",
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
