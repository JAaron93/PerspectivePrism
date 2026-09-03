import logging
import os
from typing import Any, Optional, Set
from google.adk.agents import Agent
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.genai import types
from google.genai import errors

logger = logging.getLogger(__name__)

# Telemetry and trace sanitization exclusion set: thinking tokens & signatures must never be redacted
EXCLUDED_TELEMETRY_KEYS: Set[str] = {
    "tokens_used",
    "input_tokens",
    "output_tokens",
    "total_tokens",
    "thought",
    "thoughts",
    "thought_tokens",
    "thought_signature",
    "think",
    "reasoning",
}


def get_gemini_thinking_level(
    model: Optional[str] = None,
    default: Optional[str] = None,
    *,
    task_type: Optional[str] = None,
    settings: Optional[Any] = None,
) -> Optional[str]:
    """
    Resolves dynamic thinking level for Gemini models based on env, task category, and model capabilities.
    """
    # 1. Explicit environment variable override
    env_level = os.getenv("GEMINI_THINKING_LEVEL")
    if env_level and str(env_level).strip():
        return str(env_level).strip().lower()

    if default is not None:
        return default

    # 2. Bypass deep thinking for micro-tasks, routers, and guardrail classifiers
    if task_type in ("micro_task", "router", "classifier"):
        return "low"

    # 3. Settings configuration override if explicitly configured
    settings_level = getattr(settings, "GEMINI_THINKING_LEVEL", None)
    if settings_level and str(settings_level).strip():
        return str(settings_level).strip().lower()

    # 4. Default to HIGH for autonomous agents, deep extraction, analysis, and evaluators
    if model and ("3.8" in model or "flash" in model.lower()):
        return "high"

    return None


def build_agent_generation_config(
    model: Optional[str] = None,
    *,
    task_type: Optional[str] = None,
    settings: Optional[Any] = None,
    thinking_level: Optional[str] = None,
    max_output_tokens: Optional[int] = None,
    http_timeout: Optional[float] = None,
) -> types.GenerateContentConfig:
    """
    Builds a types.GenerateContentConfig for an ADK Agent configured with dynamic
    thinking levels, expanded output ceilings, and request HTTP timeout options.
    """
    resolved_level_str = thinking_level or get_gemini_thinking_level(
        model=model,
        task_type=task_type,
        settings=settings,
    )

    # Determine max output tokens
    if max_output_tokens is None:
        if task_type in ("micro_task", "router", "classifier"):
            max_output_tokens = 2048
        else:
            raw_tokens = getattr(settings, "GEMINI_MAX_OUTPUT_TOKENS", 65536)
            try:
                max_output_tokens = int(raw_tokens)
            except (ValueError, TypeError):
                max_output_tokens = 65536

    # Determine HTTP timeout
    if http_timeout is None:
        raw_timeout = getattr(settings, "GEMINI_HTTP_TIMEOUT", 120.0)
        try:
            http_timeout = float(raw_timeout)
        except (ValueError, TypeError):
            http_timeout = 120.0

    http_options = types.HttpOptions(timeout=http_timeout)

    thinking_config = None
    if resolved_level_str:
        lvl_enum = getattr(types.ThinkingLevel, resolved_level_str.upper(), types.ThinkingLevel.HIGH)
        thinking_config = types.ThinkingConfig(thinking_level=lvl_enum)

    return types.GenerateContentConfig(
        thinking_config=thinking_config,
        max_output_tokens=max_output_tokens,
        http_options=http_options,
    )




async def execute_adk_agent(
    agent: Agent,
    user_prompt: str,
    output_key: str,
    output_schema: Optional[Any] = None,
    is_backup: bool = False,
    max_attempts: int = 2,
) -> Any:
    """
    Executes an ADK Agent via InMemorySessionService and Runner with standardized error handling
    and retry logic.
    
    Args:
        agent: The ADK Agent instance to run.
        user_prompt: The prompt text to pass to the agent.
        output_key: The key in the session state containing the output result.
        output_schema: Optional Pydantic model class to validate and instantiate the output.
        is_backup: Whether this run is using a backup agent (suppresses retry prompt enrichment).
        max_attempts: Maximum number of execution attempts.
        
    Returns:
        The result object stored in session state under output_key.
    """
    session_service = InMemorySessionService()
    current_prompt = user_prompt
    last_err: Optional[Exception] = None

    for attempt in range(max_attempts):
        try:
            attempt_session_id = f"s_attempt_{attempt}"
            await session_service.create_session(app_name="app", user_id="user", session_id=attempt_session_id)
            runner = Runner(agent=agent, app_name="app", session_service=session_service)

            async for event in runner.run_async(
                user_id="user",
                session_id=attempt_session_id,
                new_message=types.Content(role="user", parts=[types.Part.from_text(text=current_prompt)]),
            ):
                if event.error_code:
                    try:
                        code_int = int(event.error_code)
                        response_json = {"error": {"message": event.error_message}}
                        if 400 <= code_int < 500:
                            raise errors.ClientError(code=code_int, response_json=response_json)
                        elif code_int >= 500:
                            raise errors.ServerError(code=code_int, response_json=response_json)
                        else:
                            raise errors.APIError(code=code_int, response_json=response_json)
                    except (ValueError, TypeError) as conversion_error:
                        raise errors.APIError(
                            code=500,
                            response_json={"error": {"message": f"{event.error_code}: {event.error_message}"}}
                        ) from conversion_error

            session = await session_service.get_session(app_name="app", user_id="user", session_id=attempt_session_id)
            result = session.state.get(output_key)
            if result is not None:
                if isinstance(result, dict) and output_schema is not None:
                    result = output_schema.model_validate(result)
                return result

        except errors.APIError as e:
            last_err = e
            logger.warning(f"Agent '{agent.name}' attempt {attempt + 1} failed: {e}")
            if attempt == 0 and not is_backup:
                current_prompt = (
                    f"{user_prompt}\n\n"
                    f"WARNING: The previous attempt failed with the following error: {e}. "
                    f"Please ensure you return a valid JSON object strictly matching the schema requirements."
                )
            else:
                raise e

    if last_err is not None:
        raise last_err
    raise Exception(f"Agent '{agent.name}' execution failed with no result in session state")
