"""
Prompt formatting helper utilities with dynamic nonce delimiters.
"""

import secrets
from typing import Dict, Optional, Tuple, Union

USER_DATA_START = "===USER DATA START==="
USER_DATA_END = "===USER DATA END==="


def generate_nonce(length: int = 8) -> str:
    """Generates a secure random hex nonce for delimiter isolation."""
    return secrets.token_hex(max(1, length // 2))


def get_user_data_delimiters(nonce: Optional[str] = None) -> Tuple[str, str]:
    """
    Returns start and end delimiters.
    
    If nonce is None, a fresh random nonce is generated:
        ===USER DATA <nonce> START===
        ===USER DATA <nonce> END===
    If nonce is empty string (""), static delimiters are returned:
        ===USER DATA START===
        ===USER DATA END===
    If a specific nonce is provided:
        ===USER DATA <nonce> START===
        ===USER DATA <nonce> END===
    """
    if nonce is None:
        nonce = generate_nonce()
        return f"===USER DATA {nonce} START===", f"===USER DATA {nonce} END==="
    elif nonce == "":
        return USER_DATA_START, USER_DATA_END
    else:
        return f"===USER DATA {nonce} START===", f"===USER DATA {nonce} END==="


def build_user_data_prompt(
    data: Union[str, Dict[str, str]],
    instruction: str,
    nonce: Optional[str] = None,
) -> str:
    """
    Builds a prompt string with static/context data wrapped at the absolute beginning
    inside dynamic untrusted user data delimiters with per-request random nonces,
    followed by instructions.
    
    Args:
        data: User data as a pre-formatted string or dictionary of labeled fields.
        instruction: Directive instruction for the LLM.
        nonce: Optional specific nonce string; if None, a fresh random nonce is generated.
        
    Returns:
        Formatted prompt string.
    """
    if isinstance(data, dict):
        formatted_fields = []
        for key, value in data.items():
            formatted_fields.append(f"{key}: {value}")
        content_block = "\n".join(formatted_fields)
    else:
        content_block = str(data)

    start_delim, end_delim = get_user_data_delimiters(nonce=nonce)

    return (
        f"{start_delim}\n"
        f"{content_block}\n"
        f"{end_delim}\n"
        f"{instruction}"
    )
