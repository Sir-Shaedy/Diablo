"""
Smart Search — Context-aware Solodit querying.

Takes code context from FunctionAnalyzer and builds optimised
Solodit queries, returning ranked findings.
"""

from __future__ import annotations

from backend.core.function_analyzer import CodeContext, FunctionAnalyzer
from backend.core.solodit_client import SearchResult, SoloditClient

# Map protocol types to better Solodit search terms
_PROTOCOL_SEARCH_MAP: dict[str, str] = {
    "DEX": "amm",
    "Vault": "vault",
    "Lending": "lending",
    "Staking": "staking",
    "Bridge": "bridge",
    "Oracle": "oracle",
    "NFT": "nft",
}


class SmartSearch:
    """Analyse code and produce context-aware Solodit searches."""

    def __init__(self, client: SoloditClient | None = None) -> None:
        self._analyzer = FunctionAnalyzer()
        self._client = client or SoloditClient()

    async def search_for_code(
        self,
        code: str,
        user_context: str = "",
        *,
        page_size: int = 10,
    ) -> tuple[CodeContext, SearchResult]:
        """Analyse *code* and fetch matching Solodit findings.

        Parameters
        ----------
        code:
            Raw Solidity source (a function or whole file).
        user_context:
            Optional hint from the user, e.g. ``"ERC4626 vault"``.
        page_size:
            How many findings to fetch per query.
        """
        ctx = self._analyzer.analyze(code)

        # Enrich with user-supplied context
        if user_context:
            self._apply_user_context(ctx, user_context)

        # Build keyword string (max 3 terms)
        terms: list[str] = []
        if ctx.function_type:
            terms.append(ctx.function_type)
        if ctx.protocol_type:
            mapped = _PROTOCOL_SEARCH_MAP.get(ctx.protocol_type, ctx.protocol_type.lower())
            terms.append(mapped)
        if ctx.risk_patterns and len(terms) < 3:
            terms.append(ctx.risk_patterns[0].lower())

        # Fallback to suggested keywords
        if not terms and ctx.suggested_keywords:
            terms = ctx.suggested_keywords[:2]

        keywords = " ".join(terms[:3])

        result = await self._client.search(
            keywords=keywords,
            impact=["HIGH", "MEDIUM"],
            quality_score=2,
            page_size=page_size,
        )

        return ctx, result

    # ------------------------------------------------------------------

    @staticmethod
    def _apply_user_context(ctx: CodeContext, hint: str) -> None:
        """Override / enrich context with a user-supplied hint."""
        hint_lower = hint.lower()

        protocol_map = {
            "vault": "Vault",
            "erc4626": "Vault",
            "lending": "Lending",
            "borrow": "Lending",
            "aave": "Lending",
            "dex": "DEX",
            "swap": "DEX",
            "amm": "DEX",
            "uniswap": "DEX",
            "staking": "Staking",
            "stake": "Staking",
            "bridge": "Bridge",
            "cross-chain": "Bridge",
            "oracle": "Oracle",
            "price": "Oracle",
        }

        for key, proto in protocol_map.items():
            if key in hint_lower:
                ctx.protocol_type = proto
                break

        # Add user keywords
        extra = [w for w in hint.split() if len(w) > 2][:3]
        ctx.suggested_keywords.extend(extra)
