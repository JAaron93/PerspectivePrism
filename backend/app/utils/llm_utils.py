import time
import asyncio
import logging
import os
from typing import Any, Optional, Set, Callable, Awaitable, Tuple, Dict
from google.adk.agents import Agent
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.genai import types
from google.genai import errors
from app.core.config import configure_provider_env

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

ANALYTICAL_TASK_TYPES: frozenset[str] = frozenset({
    "extractor", "analysis", "alethiology", "evaluator", "judge"
})
ROUTER_TASK_TYPES: frozenset[str] = frozenset({
    "micro_task", "router", "classifier"
})


def get_gemini_thinking_level(
    model: Optional[str] = None,
    default: Optional[str] = None,
    *,
    task_type: Optional[str] = None,
    settings: Optional[Any] = None,
) -> Optional[str]:
    """
    Resolves dynamic thinking level for Gemini models based on env, task category, and model capabilities.
    For analytical tasks ('extractor', 'analysis', 'alethiology', 'judge', 'evaluator'),
    strictly enforces 'high' to protect reasoning capabilities unless explicitly downgraded via
    GEMINI_ALLOW_ANALYTICAL_DOWNGRADE=true.
    """
    allow_downgrade_env = os.getenv("GEMINI_ALLOW_ANALYTICAL_DOWNGRADE", "").strip().lower() == "true"
    allow_downgrade_settings = getattr(settings, "GEMINI_ALLOW_ANALYTICAL_DOWNGRADE", False)
    allow_downgrade = allow_downgrade_env or bool(allow_downgrade_settings)

    # 1. Enforce strict analytical floor: analytical agents must never be throttled below HIGH
    # unless an explicit downgrade flag is set (e.g. for specialized test fixtures)
    if task_type in ANALYTICAL_TASK_TYPES and not allow_downgrade:
        return "high"

    # 2. Explicit environment variable override for non-analytical tasks (or when downgrade allowed)
    env_level = os.getenv("GEMINI_THINKING_LEVEL")
    if env_level and str(env_level).strip():
        return str(env_level).strip().lower()

    if default is not None:
        return default

    # 3. Bypass deep thinking for micro-tasks, routers, and guardrail classifiers
    if task_type in ROUTER_TASK_TYPES:
        return "low"

    # 4. Settings configuration override if explicitly configured
    settings_level = getattr(settings, "GEMINI_THINKING_LEVEL", None)
    if settings_level and str(settings_level).strip():
        return str(settings_level).strip().lower()

    # 5. Default to HIGH for autonomous agents, deep extraction, analysis, and evaluators
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
    Enforces mandatory Zero-Throttling floors (65,536 tokens, 120s timeout, HIGH thinking)
    for analytical tasks unless GEMINI_ALLOW_ANALYTICAL_DOWNGRADE=true is set.
    """
    allow_downgrade_env = os.getenv("GEMINI_ALLOW_ANALYTICAL_DOWNGRADE", "").strip().lower() == "true"
    allow_downgrade_settings = getattr(settings, "GEMINI_ALLOW_ANALYTICAL_DOWNGRADE", False)
    allow_downgrade = allow_downgrade_env or bool(allow_downgrade_settings)
    is_analytical = task_type in ANALYTICAL_TASK_TYPES

    resolved_level_str = thinking_level or get_gemini_thinking_level(
        model=model,
        task_type=task_type,
        settings=settings,
    )
    if is_analytical and not allow_downgrade:
        resolved_level_str = "high"

    # Determine max output tokens
    if max_output_tokens is None:
        if task_type in ROUTER_TASK_TYPES:
            max_output_tokens = 2048
        else:
            raw_tokens = getattr(settings, "GEMINI_MAX_OUTPUT_TOKENS", 65536)
            try:
                max_output_tokens = int(raw_tokens)
            except (ValueError, TypeError):
                max_output_tokens = 65536

    # Enforce analytical floor for output tokens
    if is_analytical and not allow_downgrade:
        max_output_tokens = max(max_output_tokens, 65536)

    # Determine HTTP timeout
    if http_timeout is None:
        raw_timeout = getattr(settings, "GEMINI_HTTP_TIMEOUT", 120.0)
        try:
            http_timeout = float(raw_timeout)
        except (ValueError, TypeError):
            http_timeout = 120.0

    # Enforce analytical floor for HTTP timeout
    if is_analytical and not allow_downgrade:
        http_timeout = max(http_timeout, 120.0)

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


_TRANSIENT_HTTP_CODES: frozenset[int] = frozenset({429, 500, 502, 503, 504})


def init_tier_concurrency(
    settings: Any,
    service_name: str = "Service",
    configure_fn: Optional[Callable[[Any], Dict[str, str]]] = None,
) -> Tuple[Dict[str, str], int, asyncio.Semaphore]:
    """
    Configures provider environment, extracts max concurrency for the tier,
    instantiates an asyncio.Semaphore, and logs initialization info.

    Returns:
        tuple of (provider_info, max_concurrency, semaphore)
    """
    if configure_fn is None:
        configure_fn = configure_provider_env
    provider_info = configure_fn(settings)
    max_concurrent_raw = getattr(settings, "tier_max_concurrency", 4)
    try:
        max_concurrent = max(1, int(max_concurrent_raw))
    except (ValueError, TypeError):
        max_concurrent = 4
    semaphore = asyncio.Semaphore(max_concurrent)
    logger.info(
        "%s initialized with GEMINI_TIER=%s (max_concurrency=%d)",
        service_name,
        provider_info.get("tier"),
        max_concurrent
    )
    return provider_info, max_concurrent, semaphore



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


async def execute_agent_with_circuit_breaker(
    service_state: Any,
    run_direct_fn: Callable[..., Awaitable[Any]],
    agent_primary: Agent,
    agent_backup: Agent,
    user_prompt: str,
    output_key: str,
    service_name: str,
    error_cls: type[Exception],
) -> Any:
    """
    Standardized circuit breaker execution loop with single-probe half-open locking,
    transient API error detection, threshold trips, and automatic fallback to backup agent.

    Args:
        service_state: Instance holding cb_open, cb_half_open, cb_probing, cb_failures,
                       cb_last_failure_time, and _cb_lock.
        run_direct_fn: Async callable executing the agent within concurrency semaphore.
        agent_primary: Primary ADK Agent.
        agent_backup: Backup ADK Agent.
        user_prompt: Prompt string.
        output_key: Key in session state.
        service_name: Logging prefix (e.g. 'Pre-classifier', 'Alethiology', 'Analysis').
        error_cls: Exception class to raise on double-failure or backup error.

    Returns:
        The agent execution result.
    """
    settings = getattr(service_state, "settings", None) or globals().get("settings")
    reset_timeout = getattr(settings, "CIRCUIT_BREAKER_RESET_TIMEOUT", 60)
    fail_threshold = getattr(settings, "CIRCUIT_BREAKER_FAIL_THRESHOLD", 3)

    use_backup = False
    is_probe = False

    async with service_state._cb_lock:
        if service_state.cb_open:
            if time.time() - service_state.cb_last_failure_time > reset_timeout:
                logger.info("%s circuit breaker reset timeout expired. Transitioning to HALF-OPEN.", service_name)
                service_state.cb_open = False
                service_state.cb_half_open = True
                service_state.cb_probing = True
                is_probe = True
            else:
                use_backup = True
        elif service_state.cb_half_open:
            if not service_state.cb_probing:
                logger.info("%s circuit breaker HALF-OPEN. Acquiring probe ownership for primary...", service_name)
                service_state.cb_probing = True
                is_probe = True
            else:
                use_backup = True

    if use_backup:
        logger.warning("%s circuit breaker OPEN/PROBING. Using backup provider.", service_name)
        try:
            return await run_direct_fn(agent_backup, user_prompt, output_key, is_backup=True)
        except Exception as e:
            raise error_cls(f"Fallback to backup failed: {e}") from e

    try:
        result = await run_direct_fn(agent_primary, user_prompt, output_key)
        async with service_state._cb_lock:
            if is_probe:
                logger.info("%s probe request successful. Closing circuit breaker.", service_name)
                service_state.cb_half_open = False
                service_state.cb_probing = False
                service_state.cb_failures = 0
            elif not service_state.cb_open and not service_state.cb_half_open and service_state.cb_failures > 0:
                logger.info("%s primary provider recovered. Resetting failure count.", service_name)
                service_state.cb_failures = 0
        return result

    except Exception as e:
        is_transient = isinstance(e, errors.APIError) and e.code in _TRANSIENT_HTTP_CODES

        if not is_transient:
            logger.error("Non-transient error in %s agent: %s", service_name.lower(), e)
            async with service_state._cb_lock:
                if is_probe:
                    service_state.cb_open = True
                    service_state.cb_half_open = False
                    service_state.cb_probing = False
            raise e

        current_use_backup = False
        async with service_state._cb_lock:
            service_state.cb_last_failure_time = time.time()
            if is_probe:
                logger.error("%s probe request FAILED: %s. Re-opening circuit breaker.", service_name, e)
                service_state.cb_open = True
                service_state.cb_half_open = False
                service_state.cb_probing = False
            elif not service_state.cb_open and not service_state.cb_half_open:
                service_state.cb_failures += 1
                logger.error("%s primary provider failed (Count: %d): %s", service_name, service_state.cb_failures, e)
                if service_state.cb_failures >= fail_threshold:
                    service_state.cb_open = True
                    logger.critical("%s circuit breaker TRIPPED. Switching to backup provider.", service_name)
            current_use_backup = True

        if current_use_backup:
            logger.warning("%s primary failed with transient error. Falling back to backup agent...", service_name)
            try:
                return await run_direct_fn(agent_backup, user_prompt, output_key, is_backup=True)
            except Exception as backup_err:
                if "Budget exhausted" in str(backup_err):
                    raise backup_err
                logger.error("%s backup provider ALSO failed: %s", service_name, backup_err)
                raise error_cls(
                    f"Primary and backup providers both failed. Backup error: {backup_err}"
                ) from backup_err

        raise e
