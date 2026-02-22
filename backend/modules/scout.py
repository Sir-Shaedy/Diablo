"""
Scout Module — Ghost Auditor report generation.

Parses Solidity contracts, detects patterns, cross-references with
Solodit findings, and generates AI-synthesised security reports.
"""

from __future__ import annotations

import logging
import re
from html import escape
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from backend.core.ai_provider import AIProvider
from backend.core.function_analyzer import FunctionAnalyzer
from backend.core.solodit_client import Finding, SoloditClient
from backend.core.smart_search import SmartSearch

logger = logging.getLogger(__name__)

_PROMPTS_DIR = Path(__file__).resolve().parent.parent / "prompts"

# Depth → findings per detected pattern
_DEPTH_MAP = {
    "quick": 5,
    "standard": 20,
    "deep": 50,
}

# ERC detection patterns
_ERC_PATTERNS: dict[str, list[str]] = {
    "ERC20": [r"totalSupply", r"balanceOf", r"transfer\s*\(", r"approve\s*\(", r"transferFrom"],
    "ERC721": [r"ownerOf", r"safeTransferFrom", r"tokenURI", r"ERC721"],
    "ERC1155": [r"balanceOfBatch", r"safeBatchTransferFrom", r"ERC1155"],
    "ERC4626": [r"convertToShares", r"convertToAssets", r"maxDeposit", r"previewMint"],
}


@dataclass
class ContractInfo:
    """Parsed contract metadata."""

    name: str = ""
    ercs_detected: list[str] = field(default_factory=list)
    functions: list[dict[str, str]] = field(default_factory=list)
    imports: list[str] = field(default_factory=list)
    state_variables: list[str] = field(default_factory=list)
    external_calls: list[str] = field(default_factory=list)
    modifiers_used: list[str] = field(default_factory=list)
    loc: int = 0

    def to_dict(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "ercs_detected": self.ercs_detected,
            "functions": self.functions,
            "imports": self.imports,
            "state_variables": self.state_variables[:20],
            "external_calls": self.external_calls,
            "modifiers_used": self.modifiers_used,
            "loc": self.loc,
        }


@dataclass
class ScoutReport:
    """A generated Ghost Auditor report."""

    contract_name: str
    findings_count: int
    severity_breakdown: dict[str, int]
    contract_info: ContractInfo
    content_html: str
    matched_findings: list[dict[str, str]] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "contract_name": self.contract_name,
            "findings_count": self.findings_count,
            "severity_breakdown": self.severity_breakdown,
            "contract_info": self.contract_info.to_dict(),
            "content_html": self.content_html,
            "matched_findings": self.matched_findings,
        }


class ScoutModule:
    """Ghost Auditor — analyses contracts against 50K+ real findings."""

    def __init__(
        self,
        client: SoloditClient | None = None,
        ai: AIProvider | None = None,
    ) -> None:
        self._client = client or SoloditClient()
        self._ai = ai or AIProvider()
        self._analyzer = FunctionAnalyzer()
        self._smart_search = SmartSearch(client=self._client)
        self._personality = self._load_prompt("personality.md")
        self._report_template = self._load_prompt("scout_template.md")

    async def generate_report(
        self,
        file_content: str,
        docs_content: str = "",
        depth: str = "standard",
    ) -> ScoutReport:
        """Generate a full security report for a Solidity file.

        Steps:
        1. Parse the contract (extract functions, detect ERCs, find patterns)
        2. Analyze code context with FunctionAnalyzer
        3. Search Solodit for each detected risk pattern
        4. Build context from matched findings
        5. Generate AI report
        """
        page_size = _DEPTH_MAP.get(depth, 20)

        # 1 — Parse contract
        info = self._parse_contract(file_content)

        # 2 — Analyze code context
        code_ctx = self._analyzer.analyze(file_content)

        # 3 — Cross-reference: search for each risk + function type
        all_findings: list[Finding] = []
        search_queries: list[str] = []

        # Build queries from detected risks
        for risk in code_ctx.risk_patterns:
            search_queries.append(risk)
        if code_ctx.function_type:
            search_queries.append(f"{code_ctx.function_type} vulnerability")
        if code_ctx.protocol_type:
            search_queries.append(f"{code_ctx.protocol_type} exploit")
        for erc in info.ercs_detected:
            search_queries.append(f"{erc} vulnerability")

        # Deduplicate and limit
        seen_queries: set[str] = set()
        unique_queries: list[str] = []
        for q in search_queries:
            q_lower = q.lower()
            if q_lower not in seen_queries:
                seen_queries.add(q_lower)
                unique_queries.append(q)

        # Fetch findings for each query
        per_query_size = max(3, page_size // max(len(unique_queries), 1))
        seen_titles: set[str] = set()

        for query in unique_queries[:8]:  # cap at 8 queries to avoid too many API calls
            try:
                result = await self._client.search(
                    keywords=query,
                    impact=["HIGH", "MEDIUM"],
                    quality_score=3,
                    page_size=per_query_size,
                )
                for f in result.findings:
                    if f.title not in seen_titles:
                        seen_titles.add(f.title)
                        all_findings.append(f)
            except Exception as e:
                logger.warning("Scout search failed for '%s': %s", query, e)

        # 4 — Build context
        context_block = self._build_context(all_findings[:page_size])
        matched = [
            {
                "id": f"F{i}",
                "title": f.title,
                "firm": f.firm_name,
                "protocol": f.protocol_name,
                "impact": f.impact,
                "link": f.source_link or f.github_link,
            }
            for i, f in enumerate(all_findings[:page_size], 1)
        ]

        # 5 — Generate AI report
        report_prompt = self._report_template.replace(
            "{finding_count}", str(len(all_findings[:page_size]))
        )

        contract_summary = (
            f"Contract: {info.name or 'Unknown'}\n"
            f"Lines of code: {info.loc}\n"
            f"ERCs detected: {', '.join(info.ercs_detected) or 'None'}\n"
            f"Functions: {len(info.functions)}\n"
            f"External calls: {len(info.external_calls)}\n"
            f"Risks detected: {', '.join(code_ctx.risk_patterns) or 'None'}\n"
            f"Function type: {code_ctx.function_type or 'None'}\n"
            f"Protocol type: {code_ctx.protocol_type or 'None'}\n"
        )

        docs_section = ""
        if docs_content.strip():
            docs_section = f"\n## Project Documentation\n\n{docs_content[:3000]}\n"

        user_prompt = (
            f"{report_prompt}\n\n"
            f"## Contract Code\n\n```solidity\n{file_content[:6000]}\n```\n\n"
            f"## Contract Analysis\n\n{contract_summary}\n"
            f"{docs_section}\n"
            f"## Historical Findings Data\n\n{context_block}\n\n"
            f"Generate the report now. Format the output as HTML that can be "
            f"rendered in a VS Code webview. Use <h2>, <h3>, <pre><code>, <ul>, <li>, <table> etc."
        )

        content_html = await self._ai.generate(
            system_prompt=self._personality,
            user_prompt=user_prompt,
            temperature=0.5,
            max_tokens=8192,
        )
        content_html = self._postprocess_report_html(content_html, matched)

        # Severity breakdown
        severity_counts: dict[str, int] = {"HIGH": 0, "MEDIUM": 0, "LOW": 0}
        for f in all_findings[:page_size]:
            sev = f.impact.upper()
            if sev in severity_counts:
                severity_counts[sev] += 1

        return ScoutReport(
            contract_name=info.name or "Analyzed Contract",
            findings_count=len(all_findings[:page_size]),
            severity_breakdown=severity_counts,
            contract_info=info,
            content_html=content_html,
            matched_findings=matched,
        )

    # ------------------------------------------------------------------
    # Contract Parsing
    # ------------------------------------------------------------------

    def _parse_contract(self, code: str) -> ContractInfo:
        """Extract structured information from Solidity code."""
        info = ContractInfo(loc=len(code.splitlines()))

        # Contract name
        name_match = re.search(r"contract\s+(\w+)", code)
        if name_match:
            info.name = name_match.group(1)

        # Imports
        info.imports = re.findall(r'import\s+[{"]([^"};]+)', code)

        # State variables
        state_re = re.compile(
            r"^\s+(?:mapping|uint|int|address|bool|bytes|string|IERC\w+)\S*\s+"
            r"(?:public|private|internal|immutable|constant)?\s*(\w+)",
            re.MULTILINE,
        )
        info.state_variables = [m.group(1) for m in state_re.finditer(code)][:30]

        # Functions
        func_re = re.compile(
            r"function\s+(\w+)\s*\(([^)]*)\)\s*((?:external|public|internal|private|view|pure|payable|virtual|override|returns\s*\([^)]*\)|\s)*)",
            re.MULTILINE,
        )
        for m in func_re.finditer(code):
            info.functions.append({
                "name": m.group(1),
                "params": m.group(2).strip(),
                "modifiers": m.group(3).strip(),
            })

        # External calls
        call_re = re.compile(r"(\w+)\.(call|delegatecall|staticcall|transfer|send)\s*[({]")
        info.external_calls = list(set(
            f"{m.group(1)}.{m.group(2)}" for m in call_re.finditer(code)
        ))

        # Modifiers
        mod_re = re.compile(r"modifier\s+(\w+)")
        info.modifiers_used = [m.group(1) for m in mod_re.finditer(code)]

        # ERC detection
        for erc_name, patterns in _ERC_PATTERNS.items():
            matches = sum(1 for p in patterns if re.search(p, code))
            if matches >= 2:  # need at least 2 pattern matches
                info.ercs_detected.append(erc_name)

        return info

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _load_prompt(name: str) -> str:
        path = _PROMPTS_DIR / name
        if path.exists():
            return path.read_text(encoding="utf-8")
        logger.warning("Prompt file not found: %s", path)
        return ""

    @staticmethod
    def _build_context(findings: list[Finding]) -> str:
        parts: list[str] = []
        for i, f in enumerate(findings, 1):
            content_preview = (f.content[:600] + "...") if len(f.content) > 600 else f.content
            parts.append(
                f"### [F{i}] {f.title}\n"
                f"- **Firm:** {f.firm_name}\n"
                f"- **Protocol:** {f.protocol_name}\n"
                f"- **Severity:** {f.impact}\n"
                f"- **Tags:** {', '.join(f.tags)}\n\n"
                f"{content_preview}\n"
            )
        return "\n---\n".join(parts)

    @staticmethod
    def _postprocess_report_html(html: str, matched: list[dict[str, str]]) -> str:
        """Normalize generated report HTML for readability and evidence traceability."""
        out = html

        # Remove model-injected inline styling that can make text unreadable in dark themes.
        out = re.sub(r'\sstyle="[^"]*"', "", out, flags=re.IGNORECASE)
        out = re.sub(r"\sstyle='[^']*'", "", out, flags=re.IGNORECASE)

        # Ensure code blocks are never blank.
        out = re.sub(
            r"<pre[^>]*>\s*<code[^>]*>\s*</code>\s*</pre>",
            "<pre><code>// Patch/example unavailable in generated output.</code></pre>",
            out,
            flags=re.IGNORECASE | re.DOTALL,
        )

        # Append an explicit evidence map for auditable references.
        if matched:
            evidence_rows = "".join(
                "<tr>"
                f"<td>{escape(f.get('id', ''))}</td>"
                f"<td>{escape(f.get('title', ''))}</td>"
                f"<td>{escape(f.get('firm', ''))}</td>"
                f"<td>{escape(f.get('protocol', ''))}</td>"
                f"<td>{escape(f.get('impact', ''))}</td>"
                "</tr>"
                for f in matched[:8]
            )
            out += (
                "<h2>Evidence Map</h2>"
                "<p>Use citation IDs (for example, [F1]) to trace each claim to a real finding.</p>"
                "<table><thead><tr><th>ID</th><th>Finding</th><th>Firm</th>"
                "<th>Protocol</th><th>Severity</th></tr></thead>"
                f"<tbody>{evidence_rows}</tbody></table>"
            )
        return out
