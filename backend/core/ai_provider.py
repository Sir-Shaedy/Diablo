"""
AI Provider — Abstraction over OpenAI, Anthropic, and Google Gemini.

Provides a single ``generate()`` call that routes to the
configured provider. Supports streaming for interactive UX.
"""

from __future__ import annotations

import logging
import re
from typing import AsyncIterator

from backend.config import config

logger = logging.getLogger(__name__)


class AIProvider:
    """Unified interface for LLM calls — OpenAI, Anthropic, or Gemini."""

    def __init__(self) -> None:
        self._provider = config.ai_provider
        self._model = config.ai_model
        logger.info("AI Provider: %s (model: %s)", self._provider, self._model)

    async def generate(
        self,
        system_prompt: str,
        user_prompt: str,
        *,
        temperature: float = 0.7,
        max_tokens: int = 4096,
    ) -> str:
        """Generate a completion (non-streaming)."""
        if self._provider == "openai":
            result = await self._openai(system_prompt, user_prompt, temperature, max_tokens)
        elif self._provider == "anthropic":
            result = await self._anthropic(system_prompt, user_prompt, temperature, max_tokens)
        elif self._provider == "gemini":
            result = await self._gemini(system_prompt, user_prompt, temperature, max_tokens)
        elif self._provider == "openrouter":
            result = await self._openrouter(system_prompt, user_prompt, temperature, max_tokens)
        else:
            raise ValueError(f"Unknown AI provider: {self._provider}")
        return self._strip_fences(result)

    async def stream(
        self,
        system_prompt: str,
        user_prompt: str,
        *,
        temperature: float = 0.7,
        max_tokens: int = 4096,
    ) -> AsyncIterator[str]:
        """Stream a completion token-by-token."""
        if self._provider == "openai":
            async for chunk in self._openai_stream(
                system_prompt, user_prompt, temperature, max_tokens
            ):
                yield chunk
        elif self._provider == "anthropic":
            async for chunk in self._anthropic_stream(
                system_prompt, user_prompt, temperature, max_tokens
            ):
                yield chunk
        elif self._provider == "gemini":
            async for chunk in self._gemini_stream(
                system_prompt, user_prompt, temperature, max_tokens
            ):
                yield chunk
        elif self._provider == "openrouter":
            async for chunk in self._openrouter_stream(
                system_prompt, user_prompt, temperature, max_tokens
            ):
                yield chunk
        else:
            raise ValueError(f"Unknown AI provider: {self._provider}")

    # ------------------------------------------------------------------
    # Utilities
    # ------------------------------------------------------------------

    @staticmethod
    def _strip_fences(text: str) -> str:
        """Strip markdown code fences that LLMs often wrap HTML in."""
        stripped = text.strip()
        # Remove ```html ... ``` or ``` ... ```
        m = re.match(r"^```(?:html|xml)?\s*\n(.*?)\n?```\s*$", stripped, re.DOTALL)
        if m:
            return m.group(1).strip()
        return stripped

    # ------------------------------------------------------------------
    # OpenAI
    # ------------------------------------------------------------------

    async def _openai(
        self, system: str, user: str, temperature: float, max_tokens: int
    ) -> str:
        from openai import AsyncOpenAI

        client = AsyncOpenAI(api_key=config.openai_api_key)
        response = await client.chat.completions.create(
            model=self._model,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            temperature=temperature,
            max_tokens=max_tokens,
        )
        return response.choices[0].message.content or ""

    async def _openai_stream(
        self, system: str, user: str, temperature: float, max_tokens: int
    ) -> AsyncIterator[str]:
        from openai import AsyncOpenAI

        client = AsyncOpenAI(api_key=config.openai_api_key)
        stream = await client.chat.completions.create(
            model=self._model,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            temperature=temperature,
            max_tokens=max_tokens,
            stream=True,
        )
        async for chunk in stream:
            delta = chunk.choices[0].delta.content
            if delta:
                yield delta

    # ------------------------------------------------------------------
    # Anthropic
    # ------------------------------------------------------------------

    async def _anthropic(
        self, system: str, user: str, temperature: float, max_tokens: int
    ) -> str:
        import anthropic

        client = anthropic.AsyncAnthropic(api_key=config.anthropic_api_key)
        message = await client.messages.create(
            model=self._model,
            system=system,
            messages=[{"role": "user", "content": user}],
            temperature=temperature,
            max_tokens=max_tokens,
        )
        return message.content[0].text

    async def _anthropic_stream(
        self, system: str, user: str, temperature: float, max_tokens: int
    ) -> AsyncIterator[str]:
        import anthropic

        client = anthropic.AsyncAnthropic(api_key=config.anthropic_api_key)
        async with client.messages.stream(
            model=self._model,
            system=system,
            messages=[{"role": "user", "content": user}],
            temperature=temperature,
            max_tokens=max_tokens,
        ) as stream:
            async for text in stream.text_stream:
                yield text

    # ------------------------------------------------------------------
    # OpenRouter (OpenAI-compatible)
    # ------------------------------------------------------------------

    async def _openrouter(
        self, system: str, user: str, temperature: float, max_tokens: int
    ) -> str:
        from openai import AsyncOpenAI

        client = AsyncOpenAI(
            api_key=config.openrouter_api_key,
            base_url="https://openrouter.ai/api/v1",
        )
        response = await client.chat.completions.create(
            model=self._model,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            temperature=temperature,
            max_tokens=max_tokens,
            extra_body={"reasoning": {"enabled": True}},
        )
        return response.choices[0].message.content or ""

    async def _openrouter_stream(
        self, system: str, user: str, temperature: float, max_tokens: int
    ) -> AsyncIterator[str]:
        from openai import AsyncOpenAI

        client = AsyncOpenAI(
            api_key=config.openrouter_api_key,
            base_url="https://openrouter.ai/api/v1",
        )
        stream = await client.chat.completions.create(
            model=self._model,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            temperature=temperature,
            max_tokens=max_tokens,
            stream=True,
            extra_body={"reasoning": {"enabled": True}},
        )
        async for chunk in stream:
            delta = chunk.choices[0].delta.content
            if delta:
                yield delta

    # ------------------------------------------------------------------
    # Google Gemini
    # ------------------------------------------------------------------

    async def _gemini(
        self, system: str, user: str, temperature: float, max_tokens: int
    ) -> str:
        from google import genai
        from google.genai import types

        client = genai.Client(api_key=config.gemini_api_key)

        response = await client.aio.models.generate_content(
            model=self._model,
            contents=user,
            config=types.GenerateContentConfig(
                system_instruction=system,
                temperature=temperature,
                max_output_tokens=max_tokens,
            ),
        )
        return response.text or ""

    async def _gemini_stream(
        self, system: str, user: str, temperature: float, max_tokens: int
    ) -> AsyncIterator[str]:
        from google import genai
        from google.genai import types

        client = genai.Client(api_key=config.gemini_api_key)

        response = await client.aio.models.generate_content_stream(
            model=self._model,
            contents=user,
            config=types.GenerateContentConfig(
                system_instruction=system,
                temperature=temperature,
                max_output_tokens=max_tokens,
            ),
        )
        async for chunk in response:
            if chunk.text:
                yield chunk.text
