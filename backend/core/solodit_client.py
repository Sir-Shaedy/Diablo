"""
Solodit API Client.

Handles authentication, searching, rate limiting, and pagination
against the Solodit/Cyfrin findings API.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any

import httpx

from backend.config import config

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Data models
# ---------------------------------------------------------------------------

@dataclass
class Finding:
    """A single Solodit finding."""

    title: str
    impact: str
    content: str
    firm_name: str
    protocol_name: str
    quality_score: float
    source_link: str
    github_link: str
    tags: list[str]
    slug: str

    @classmethod
    def from_api(cls, raw: dict[str, Any]) -> Finding:
        """Parse a finding from the Solodit API response."""
        tags: list[str] = []
        for tag_obj in raw.get("issues_issuetagscore", []):
            tag_name = tag_obj.get("tags_tag", {}).get("title", "")
            if tag_name:
                tags.append(tag_name)

        return cls(
            title=raw.get("title", "Untitled"),
            impact=raw.get("impact", "UNKNOWN"),
            content=raw.get("content", ""),
            firm_name=raw.get("firm_name", "Unknown"),
            protocol_name=raw.get("protocol_name", "Unknown"),
            quality_score=raw.get("quality_score", 0),
            source_link=raw.get("source_link", ""),
            github_link=raw.get("github_link", ""),
            tags=tags,
            slug=raw.get("slug", ""),
        )

    def to_dict(self) -> dict[str, Any]:
        """Serialize for JSON responses."""
        return {
            "title": self.title,
            "impact": self.impact,
            "content": self.content,
            "firm_name": self.firm_name,
            "protocol_name": self.protocol_name,
            "quality_score": self.quality_score,
            "source_link": self.source_link,
            "github_link": self.github_link,
            "tags": self.tags,
            "slug": self.slug,
        }


@dataclass
class SearchResult:
    """Paginated search result from Solodit."""

    findings: list[Finding]
    total: int
    page: int
    total_pages: int
    rate_limit_remaining: int | None = None


# ---------------------------------------------------------------------------
# Client
# ---------------------------------------------------------------------------

class SoloditClient:
    """Async HTTP client for the Solodit findings API."""

    def __init__(self, api_key: str | None = None) -> None:
        self._api_key = api_key or config.cyfrin_api_key
        self._base_url = config.solodit_api_url
        self._client = httpx.AsyncClient(timeout=30)

    # -- public API ---------------------------------------------------------

    async def search(
        self,
        keywords: str = "",
        *,
        impact: list[str] | None = None,
        tags: list[str] | None = None,
        firms: list[str] | None = None,
        protocol_category: list[str] | None = None,
        quality_score: int = 1,
        sort_field: str = "Quality",
        sort_direction: str = "Desc",
        page: int = 1,
        page_size: int = 20,
    ) -> SearchResult:
        """Search Solodit findings with filters."""
        filters: dict[str, Any] = {
            "sortField": sort_field,
            "sortDirection": sort_direction,
            "qualityScore": quality_score,
        }
        if keywords:
            filters["keywords"] = keywords
        if impact:
            filters["impact"] = impact
        if tags:
            filters["tags"] = [{"value": t} for t in tags]
        if firms:
            filters["firms"] = [{"value": f} for f in firms]
        if protocol_category:
            filters["protocolCategory"] = [{"value": c} for c in protocol_category]

        payload = {"page": page, "pageSize": page_size, "filters": filters}

        response = await self._client.post(
            self._base_url,
            headers={
                "Content-Type": "application/json",
                "X-Cyfrin-API-Key": self._api_key,
            },
            json=payload,
        )

        if response.status_code == 401:
            raise SoloditAuthError("Invalid or missing CYFRIN_API_KEY")
        if response.status_code == 429:
            raise SoloditRateLimitError("Rate limit exceeded — wait and retry")
        response.raise_for_status()

        data = response.json()
        metadata = data.get("metadata", {})
        raw_findings = data.get("findings", [])

        result = SearchResult(
            findings=[Finding.from_api(f) for f in raw_findings],
            total=metadata.get("totalResults", 0),
            page=page,
            total_pages=metadata.get("totalPages", 1),
        )

        if "rateLimit" in data:
            result.rate_limit_remaining = data["rateLimit"].get("remaining")

        return result

    async def get_finding(self, slug: str) -> Finding | None:
        """Fetch a single finding by slug."""
        # Use a keyword search scoped to the slug as a workaround
        result = await self.search(keywords=slug, page_size=1)
        return result.findings[0] if result.findings else None

    async def close(self) -> None:
        """Shut down the HTTP client."""
        await self._client.aclose()


# ---------------------------------------------------------------------------
# Exceptions
# ---------------------------------------------------------------------------

class SoloditError(Exception):
    """Base Solodit error."""

class SoloditAuthError(SoloditError):
    """Authentication failure."""

class SoloditRateLimitError(SoloditError):
    """Rate limit exceeded."""
