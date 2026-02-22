"""
Solidity Function Analyzer.

Extracts searchable context (function type, protocol type, risk patterns)
from raw Solidity source code using regex heuristics.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field


# ---------------------------------------------------------------------------
# Pattern registries
# ---------------------------------------------------------------------------

FUNCTION_TYPE_PATTERNS: dict[str, str] = {
    # Vault
    r"deposit|stake|supply": "deposit",
    r"withdraw|unstake|redeem": "withdraw",
    r"mint": "mint",
    r"burn": "burn",
    # DEX
    r"swap": "swap",
    r"addLiquidity|add_liquidity": "add_liquidity",
    r"removeLiquidity|remove_liquidity": "remove_liquidity",
    # Lending
    r"borrow": "borrow",
    r"repay": "repay",
    r"liquidat": "liquidate",
    r"collateral": "collateral",
    # Token
    r"transfer|send": "transfer",
    r"approve": "approve",
    r"claim|harvest": "claim",
    r"balance|balances": "accounting",
    # Admin
    r"set|update|change": "admin",
    r"pause|unpause": "pause",
    r"initialize|init": "initialize",
}

PROTOCOL_TYPE_PATTERNS: dict[str, str] = {
    r"ERC4626|convertToShares|convertToAssets|previewDeposit|previewRedeem": "Vault",
    r"vault|Vault": "Vault",
    r"borrow|repay|liquidat|collateral|healthFactor|LTV": "Lending",
    r"Aave|Compound|Euler": "Lending",
    r"swap|getAmountOut|getAmountIn|reserves|k\s*=": "DEX",
    r"Uniswap|Curve|Balancer|SushiSwap": "DEX",
    r"addLiquidity|removeLiquidity|LP|liquidity": "DEX",
    r"stake|unstake|reward|rewardRate|earned": "Staking",
    r"bridge|cross.*chain|relay|message": "Bridge",
    r"oracle|price|latestRoundData|chainlink|getPrice": "Oracle",
    r"ERC721|ERC1155|tokenURI|ownerOf": "NFT",
}

# Maps regex → (tag_name, [search_keywords])
RISK_PATTERNS: dict[str, tuple[str, list[str]]] = {
    # Reentrancy
    r"\.call\{|\.call\(|\(bool\s+success": ("Reentrancy", ["reentrancy", "external call"]),
    r"transferFrom|safeTransferFrom|transfer\(": ("Reentrancy", ["token transfer", "reentrancy"]),
    # Oracle
    r"latestRoundData|getPrice|oracle": ("Oracle", ["oracle manipulation", "price"]),
    r"TWAP|twap": ("Oracle", ["TWAP", "time-weighted"]),
    # Math / Precision
    r"\/\s*\d+|mulDiv|\/\s*1e": ("Precision", ["precision loss", "rounding"]),
    r"unchecked\s*\{": ("Precision", ["overflow", "underflow"]),
    # Flash loans
    r"flashLoan|flash.*loan": ("Flash Loan", ["flash loan"]),
    # Access control
    r"onlyOwner|require\(msg\.sender|onlyRole": ("Access Control", ["access control"]),
    r"Ownable|AccessControl": ("Access Control", ["access control"]),
    # Slippage / MEV
    r"slippage|deadline|minAmount|amountOutMin": ("Slippage", ["slippage", "frontrunning"]),
    # Timestamp
    r"block\.timestamp|now": ("Timestamp", ["timestamp"]),
    # Delegatecall
    r"delegatecall": ("Delegatecall", ["delegatecall", "proxy"]),
    # Signature
    r"ecrecover|signature|ECDSA": ("Signature", ["signature", "replay"]),
    # Accounting / balance tracking
    r"\bbalance(?:s|Of)?\b|_balances\b|userBalance|totalBalance|pendingBalance": (
        "Balance Accounting",
        ["balance accounting", "state sync", "double claim", "incorrect accounting"],
    ),
    r"shareBalance|creatorBalance|ownerBalance|claimable|accrued|pending": (
        "Balance Accounting",
        ["claim accounting", "reward accounting", "balance desync"],
    ),
    r"totalSupply|totalAssets|convertToShares|convertToAssets": (
        "Balance Accounting",
        ["share accounting", "asset accounting", "vault accounting"],
    ),
}


# ---------------------------------------------------------------------------
# Data model
# ---------------------------------------------------------------------------

@dataclass
class CodeContext:
    """Structured context extracted from a Solidity snippet."""

    function_name: str = ""
    function_type: str = ""       # deposit, withdraw, swap, …
    protocol_type: str = ""       # Vault, Lending, DEX, …
    risk_patterns: list[str] = field(default_factory=list)
    external_calls: list[str] = field(default_factory=list)
    state_changes: list[str] = field(default_factory=list)
    suggested_tags: list[str] = field(default_factory=list)
    suggested_keywords: list[str] = field(default_factory=list)
    confidence: float = 0.0

    def to_dict(self) -> dict:
        return {
            "function_name": self.function_name,
            "function_type": self.function_type,
            "protocol_type": self.protocol_type,
            "risk_patterns": self.risk_patterns,
            "external_calls": self.external_calls,
            "state_changes": self.state_changes,
            "suggested_tags": self.suggested_tags,
            "suggested_keywords": self.suggested_keywords,
            "confidence": self.confidence,
        }


# ---------------------------------------------------------------------------
# Analyzer
# ---------------------------------------------------------------------------

class FunctionAnalyzer:
    """Extract searchable context from Solidity source via regex."""

    def analyze(self, code: str) -> CodeContext:
        ctx = CodeContext()

        # Function name
        m = re.search(r"function\s+(\w+)", code)
        if m:
            ctx.function_name = m.group(1)

        # Function type
        for pattern, func_type in FUNCTION_TYPE_PATTERNS.items():
            if re.search(pattern, code, re.IGNORECASE):
                ctx.function_type = func_type
                break

        # Protocol type
        for pattern, proto in PROTOCOL_TYPE_PATTERNS.items():
            if re.search(pattern, code, re.IGNORECASE):
                ctx.protocol_type = proto
                break

        # Risk patterns
        tags: set[str] = set()
        keywords: set[str] = set()
        for pattern, (tag, kws) in RISK_PATTERNS.items():
            if re.search(pattern, code, re.IGNORECASE):
                ctx.risk_patterns.append(tag)
                tags.add(tag)
                keywords.update(kws)

        # External calls
        for contract, method in re.findall(r"(\w+)\s*\.\s*(\w+)\s*\(", code):
            if contract not in {"msg", "block", "tx", "abi", "require", "assert"}:
                ctx.external_calls.append(f"{contract}.{method}")
        ctx.external_calls = ctx.external_calls[:10]

        # State changes
        state = re.findall(r"(\w+)\s*(?:=|\+=|-=|\*=|\/=)", code)
        ctx.state_changes = list(set(state))[:5]

        # Build search suggestions
        ctx.suggested_tags = list(tags)[:3]
        if ctx.function_type:
            keywords.add(ctx.function_type)
        if ctx.protocol_type:
            keywords.add(ctx.protocol_type.lower())
        ctx.suggested_keywords = list(keywords)[:5]

        # Confidence score
        c = 0.0
        if ctx.function_name:
            c += 0.1
        if ctx.function_type:
            c += 0.2
        if ctx.protocol_type:
            c += 0.3
        if ctx.risk_patterns:
            c += min(len(ctx.risk_patterns) * 0.1, 0.3)
        if ctx.external_calls:
            c += 0.1
        ctx.confidence = min(c, 1.0)

        return ctx
