import os
import logging
from typing import Any, Optional
from google.adk.agents import Agent
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.genai import types
from google.genai import errors

logger = logging.getLogger(__name__)


def get_validated_api_key(settings_obj: Any) -> str:
    """
    Extracts and validates the Gemini/LLM API key from configuration settings,
    clearing stale auth env vars and setting os.environ['GEMINI_API_KEY'] for ADK
    model clients.

    Args:
        settings_obj: Settings instance to read credentials from. Must be provided
            explicitly — no module-level global fallback.

    Returns:
        The validated API key string.

    Raises:
        ValueError: If neither GEMINI_API_KEY nor LLM_API_KEY is configured as a
            non-empty string.
    """
    # Type-check raw values before use — MagicMock attributes in tests must not
    # reach strip() or os.environ assignment.
    raw_gemini = getattr(settings_obj, "GEMINI_API_KEY", None)
    raw_llm = getattr(settings_obj, "LLM_API_KEY", None)
    gemini_key = raw_gemini.strip() if isinstance(raw_gemini, str) else ""
    llm_key = raw_llm.strip() if isinstance(raw_llm, str) else ""
    api_key = gemini_key or llm_key

    if not api_key:
        raise ValueError(
            "LLM_API_KEY is not configured (GEMINI_API_KEY is also not configured). "
            "Please set one of them in your .env file. Example: GEMINI_API_KEY=AIzaSy..."
        )

    # Only mutate os.environ once we have a validated key — and only touch the two
    # API-key-mode vars. Vertex provider vars (GCP_PROJECT, GCP_LOCATION,
    # GOOGLE_GENAI_USE_VERTEXAI, etc.) are managed exclusively by configure_provider_env()
    # and must never be popped here, to avoid corrupting Vertex mode state on failure.
    os.environ.pop("LLM_API_KEY", None)
    os.environ["GEMINI_API_KEY"] = api_key
    return api_key


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
