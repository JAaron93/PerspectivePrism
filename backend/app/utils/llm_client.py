import asyncio
import logging
import time
from typing import Optional, Callable, Awaitable
from openai import AsyncOpenAI

logger = logging.getLogger(__name__)

class LLMClient:
    def __init__(self, settings=None):
        if settings is None:
            from app.core.config import settings as default_settings
            settings = default_settings
        self.settings = settings
        
        self.provider = self.settings.LLM_PROVIDER.lower()

        if self.provider != "openai":
            raise ValueError(
                f"Unsupported LLM_PROVIDER: {self.provider}. Use 'openai'"
            )

        # Check if settings are mock or real
        api_key = self.settings.LLM_API_KEY
        if not isinstance(api_key, str) or not api_key.strip():
            raise ValueError(
                "LLM_API_KEY is not configured. Please set it in your .env file. "
                "Example: LLM_API_KEY=sk-..."
            )

        base_url = getattr(self.settings, "LLM_BASE_URL", None)
        if not isinstance(base_url, str):
            base_url = "https://api.openai.com/v1"

        self.client = AsyncOpenAI(
            api_key=api_key,
            base_url=base_url
        )
        self.model = self.settings.LLM_MODEL if isinstance(self.settings.LLM_MODEL, str) else "gpt-3.5-turbo"
        self.backup_model = self.settings.BACKUP_LLM_MODEL if isinstance(self.settings.BACKUP_LLM_MODEL, str) else "gpt-4o"

        # Initialize Backup Client if configured
        self.backup_client = None
        backup_api_key = self.settings.BACKUP_LLM_API_KEY
        if isinstance(backup_api_key, str) and backup_api_key.strip():
            backup_base_url = getattr(self.settings, "BACKUP_LLM_BASE_URL", None)
            if not isinstance(backup_base_url, str):
                backup_base_url = "https://api.openai.com/v1"
                
            self.backup_client = AsyncOpenAI(
                api_key=backup_api_key,
                base_url=backup_base_url
            )
            self.backup_model = self.settings.BACKUP_LLM_MODEL
            logger.info("Backup LLM client initialized.")

        # Circuit Breaker State
        self.cb_failures = 0
        self.cb_last_failure_time = 0
        self.cb_open = False
        self.cb_half_open = False
        self._cb_lock = asyncio.Lock()

    async def call_llm(self, prompt: str, system_prompt: str = None, timeout: float = 60.0) -> str:
        """Provider-agnostic LLM call that returns JSON string."""
        if self.provider == "openai":
            messages = []
            if system_prompt:
                messages.append({"role": "system", "content": system_prompt})
            messages.append({"role": "user", "content": prompt})

            return await self.execute_with_fallback(
                messages=messages,
                response_format={"type": "json_object"},
                timeout=timeout
            )

    async def execute_with_fallback(
        self,
        messages: list,
        response_format: dict = None,
        primary_callable: Optional[Callable[[], Awaitable[str]]] = None,
        timeout: float = 60.0
    ) -> str:
        """
        Executes LLM call with Circuit Breaker and Fallback logic.
        """
        # 1. Check Circuit Breaker State (Locked)
        use_backup = False
        is_half_open_probe = False
        
        async with self._cb_lock:
            # Check if OPEN
            if self.cb_open:
                # Check for RESET timeout
                reset_timeout = self.settings.CIRCUIT_BREAKER_RESET_TIMEOUT
                if not isinstance(reset_timeout, (int, float)):
                    reset_timeout = 60
                    
                if time.time() - self.cb_last_failure_time > reset_timeout:
                    logger.info("Circuit breaker reset timeout expired. Transitioning to HALF-OPEN state.")
                    self.cb_open = False
                    self.cb_half_open = True
                    is_half_open_probe = True
                    # Allowed to proceed as probe
                else:
                    # Still OPEN and not ready to reset
                    use_backup = True

            # If HALF-OPEN, we allow the request (it's the probe)
            elif self.cb_half_open:
                logger.info("Circuit breaker HALF-OPEN. Sending probe request to primary...")
                is_half_open_probe = True

        # 2. Executing Action (Unlocked IO)
        if use_backup:
            if self.backup_client:
                logger.warning("Circuit breaker OPEN. Using backup provider.")
                return await self._call_backup_provider(messages, response_format, timeout=timeout)
            else:
                raise Exception("Circuit breaker OPEN and no backup provider configured.")

        # 3. Try Primary Provider (Closed or Half-Open Probe)
        try:
            content = ""
            if primary_callable:
                content = await primary_callable()
            else:
                response = await self.client.chat.completions.create(
                    model=self.model,
                    messages=messages,
                    response_format=response_format,
                    timeout=timeout,
                )
                content = response.choices[0].message.content
            
            # 4. Primary Success - Update State (Locked)
            async with self._cb_lock:
                if is_half_open_probe:
                    logger.info("Probe request successful. Closing circuit breaker.")
                    self.cb_half_open = False
                    self.cb_failures = 0
                elif self.cb_failures > 0:
                    # If we were closed but had some failures, reset them on success
                    logger.info("Primary provider recovered. Resetting failure count.")
                    self.cb_failures = 0
            
            return content

        except Exception as e:
            # 5. Handle Failure - Update State (Locked)
            current_use_backup = False
            
            async with self._cb_lock:
                self.cb_last_failure_time = time.time()
                
                if is_half_open_probe:
                    logger.error(f"Probe request FAILED: {str(e)}. Re-opening circuit breaker.")
                    self.cb_open = True
                    self.cb_half_open = False
                    # failures count remains high (or could be incremented)
                else:
                    self.cb_failures += 1
                    logger.error(f"Primary provider failed (Count: {self.cb_failures}): {str(e)}")

                    fail_threshold = self.settings.CIRCUIT_BREAKER_FAIL_THRESHOLD
                    if not isinstance(fail_threshold, int):
                        fail_threshold = 5
                        
                    if self.cb_failures >= fail_threshold:
                        self.cb_open = True
                        logger.critical("Circuit breaker TRIPPED. Switching to backup provider.")
                
                # Check if we should fallback NOW (if we just tripped it or it was already open/failed)
                # If we are here, primary failed. If we have backup, we should use it.
                if self.backup_client:
                    current_use_backup = True

            # 6. Fallback (Unlocked IO)
            if current_use_backup:
                logger.info("Falling back to backup provider...")
                return await self._call_backup_provider(messages, response_format, timeout=timeout)
            
            raise e  # Propagate if no backup

    async def _call_backup_provider(self, messages: list, response_format: dict = None, timeout: float = 60.0) -> str:
        try:
            response = await self.backup_client.chat.completions.create(
                model=self.backup_model,
                messages=messages,
                response_format=response_format,
                timeout=timeout,
            )
            return response.choices[0].message.content
        except Exception as e:
            logger.error(f"Backup provider ALSO failed: {str(e)}")
            raise e
