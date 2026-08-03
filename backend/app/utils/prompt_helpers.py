"""
Prompt formatting helper utilities.
"""

from typing import Dict, Union

USER_DATA_START = "===USER DATA START==="
USER_DATA_END = "===USER DATA END==="


def build_user_data_prompt(
    data: Union[str, Dict[str, str]],
    instruction: str
) -> str:
    """
    Builds a prompt string with static/context data wrapped at the absolute beginning
    inside untrusted user data delimiters, followed by instructions.
    
    Args:
        data: User data as a pre-formatted string or dictionary of labeled fields.
        instruction: Directive instruction for the LLM.
        
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

    return (
        f"{USER_DATA_START}\n"
        f"{content_block}\n"
        f"{USER_DATA_END}\n"
        f"{instruction}"
    )
