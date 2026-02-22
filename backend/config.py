"""
Diablo Configuration.

Loads settings from environment variables with sensible defaults.
Supports OpenAI, Anthropic, and Google Gemini as AI providers.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

from dotenv import load_dotenv

# Load .env from project root
_PROJECT_ROOT = Path(__file__).resolve().parent.parent
load_dotenv(_PROJECT_ROOT / ".env")


def _auto_detect_provider() -> str:
    """Pick the best available provider based on which keys exist."""
    explicit = os.getenv("DIABLO_AI_PROVIDER", "").strip().lower()
    if explicit:
        return explicit

    # Auto-detect from available keys (priority: openrouter > gemini > openai > anthropic)
    if os.getenv("OPENROUTER_API_KEY"):
        return "openrouter"
    if os.getenv("GEMINI_API_KEY"):
        return "gemini"
    if os.getenv("OPENAI_API_KEY"):
        return "openai"
    if os.getenv("ANTHROPIC_API_KEY"):
        return "anthropic"
    return "gemini"  # default — free tier friendly


def _auto_detect_model(provider: str) -> str:
    """Pick default model for the detected provider."""
    explicit = os.getenv("DIABLO_AI_MODEL", "").strip()
    if explicit:
        return explicit

    return {
        "openrouter": "openai/gpt-oss-120b:free",
        "gemini": "gemini-2.0-flash",
        "openai": "gpt-4o-mini",
        "anthropic": "claude-sonnet-4-20250514",
    }.get(provider, "gemini-2.0-flash")


@dataclass(frozen=True)
class Config:
    """Immutable application configuration."""

    # Solodit
    cyfrin_api_key: str = field(
        default_factory=lambda: os.getenv("CYFRIN_API_KEY", "")
    )
    solodit_api_url: str = "https://solodit.cyfrin.io/api/v1/solodit/findings"

    # AI Provider (auto-detected if not explicit)
    ai_provider: str = field(default_factory=_auto_detect_provider)
    openai_api_key: str = field(
        default_factory=lambda: os.getenv("OPENAI_API_KEY", "")
    )
    anthropic_api_key: str = field(
        default_factory=lambda: os.getenv("ANTHROPIC_API_KEY", "")
    )
    gemini_api_key: str = field(
        default_factory=lambda: os.getenv("GEMINI_API_KEY", "")
    )
    openrouter_api_key: str = field(
        default_factory=lambda: os.getenv("OPENROUTER_API_KEY", "")
    )
    ai_model: str = field(default_factory=lambda: "")  # resolved post-init

    # Server
    host: str = field(default_factory=lambda: os.getenv("DIABLO_HOST", "127.0.0.1"))
    port: int = field(default_factory=lambda: int(os.getenv("DIABLO_PORT", "8391")))

    # Paths
    cache_dir: Path = field(
        default_factory=lambda: _PROJECT_ROOT / ".cache"
    )

    def __post_init__(self) -> None:
        # Resolve model after provider is known
        if not self.ai_model:
            object.__setattr__(self, "ai_model", _auto_detect_model(self.ai_provider))

    def validate(self) -> list[str]:
        """Return a list of missing-but-required config keys."""
        issues: list[str] = []
        if not self.cyfrin_api_key:
            issues.append("CYFRIN_API_KEY is not set")
        if self.ai_provider == "openai" and not self.openai_api_key:
            issues.append("OPENAI_API_KEY is not set")
        if self.ai_provider == "anthropic" and not self.anthropic_api_key:
            issues.append("ANTHROPIC_API_KEY is not set")
        if self.ai_provider == "gemini" and not self.gemini_api_key:
            issues.append("GEMINI_API_KEY is not set")
        if self.ai_provider == "openrouter" and not self.openrouter_api_key:
            issues.append("OPENROUTER_API_KEY is not set")
        return issues


# Singleton
config = Config()
