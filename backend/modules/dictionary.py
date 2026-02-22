"""
Dictionary Module.

Quick-lookup: take a query string, search Solodit,
optionally summarise the top findings with AI.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any

from backend.core.ai_provider import AIProvider
from backend.core.solodit_client import SearchResult, SoloditClient

logger = logging.getLogger(__name__)


@dataclass
class DictionaryResult:
    """Returned by a dictionary lookup."""

    query: str
    search_result: SearchResult
    ai_summary: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "query": self.query,
            "total": self.search_result.total,
            "page": self.search_result.page,
            "total_pages": self.search_result.total_pages,
            "findings": [f.to_dict() for f in self.search_result.findings],
            "ai_summary": self.ai_summary,
        }


_SUMMARY_SYSTEM = (
    "You are Diablo, a sharp smart-contract security expert. "
    "Given a set of audit findings, write a 3-4 sentence executive summary "
    "of the vulnerability pattern. Mention which protocols were affected "
    "and the typical impact. Be direct and precise."
)


class DictionaryModule:
    """Handles dictionary-style lookups against Solodit."""

    def __init__(
        self,
        client: SoloditClient | None = None,
        ai: AIProvider | None = None,
    ) -> None:
        self._client = client or SoloditClient()
        self._ai = ai or AIProvider()

    async def search(
        self,
        query: str,
        *,
        severity: list[str] | None = None,
        page: int = 1,
        page_size: int = 10,
        with_summary: bool = False,
    ) -> DictionaryResult:
        """Search Solodit and optionally generate an AI summary."""
        result = await self._client.search(
            keywords=query,
            impact=severity or ["HIGH", "MEDIUM"],
            quality_score=1,
            page=page,
            page_size=page_size,
        )

        ai_summary: str | None = None
        if with_summary and result.findings:
            titles = "\n".join(
                f"- [{f.impact}] {f.title} ({f.firm_name} / {f.protocol_name})"
                for f in result.findings[:10]
            )
            try:
                ai_summary = await self._ai.generate(
                    system_prompt=_SUMMARY_SYSTEM,
                    user_prompt=f"Query: {query}\n\nTop findings:\n{titles}",
                    max_tokens=300,
                )
            except Exception as exc:
                # Never fail search results because summary generation failed.
                logger.warning("Dictionary AI summary failed for '%s': %s", query, exc)
                ai_summary = None

        return DictionaryResult(
            query=query,
            search_result=result,
            ai_summary=ai_summary,
        )
