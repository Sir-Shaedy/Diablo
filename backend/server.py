"""
Diablo Backend Server.

FastAPI application exposing /search, /analyze, /learn, /scout endpoints.
The VS Code extension communicates with this over localhost.
"""

from __future__ import annotations

import logging
import re
from contextlib import asynccontextmanager
from html import escape as html_escape
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from backend.config import config
from backend.core.solodit_client import SoloditClient, SoloditError
from backend.core.smart_search import SmartSearch
from backend.core.function_analyzer import FunctionAnalyzer
from backend.core.ai_provider import AIProvider
from backend.modules.dictionary import DictionaryModule
from backend.modules.learning import LearningModule
from backend.modules.scout import ScoutModule

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Shared state (initialised on startup, torn down on shutdown)
# ---------------------------------------------------------------------------

_solodit: SoloditClient | None = None
_dictionary: DictionaryModule | None = None
_smart_search: SmartSearch | None = None
_ai: AIProvider | None = None
_learning: LearningModule | None = None
_scout: ScoutModule | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup / shutdown lifecycle."""
    global _solodit, _dictionary, _smart_search, _ai, _learning, _scout

    # Validate config
    issues = config.validate()
    if issues:
        for issue in issues:
            logger.warning("Config issue: %s", issue)

    _solodit = SoloditClient()
    _ai = AIProvider()
    _smart_search = SmartSearch(client=_solodit)
    _dictionary = DictionaryModule(client=_solodit, ai=_ai)
    _learning = LearningModule(client=_solodit, ai=_ai)
    _scout = ScoutModule(client=_solodit, ai=_ai)

    logger.info("Diablo backend started on %s:%s", config.host, config.port)
    yield

    # Cleanup
    if _solodit:
        await _solodit.close()
    logger.info("Diablo backend stopped")


# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------

app = FastAPI(
    title="Diablo",
    description="AI-Powered Smart Contract Security Intelligence",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # VS Code webview origin
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    """Return user-friendly JSON for common error classes."""
    msg = str(exc)
    status = 500

    # Rate-limit errors (Gemini, OpenAI, Anthropic)
    if "429" in msg or "RESOURCE_EXHAUSTED" in msg or "rate" in msg.lower():
        status = 429
        detail = "AI provider rate limit reached. Wait a moment and try again, or switch providers."
    elif "No endpoints found matching your data policy" in msg:
        status = 400
        detail = (
            "OpenRouter blocked this free model due to your privacy policy. "
            "In OpenRouter settings, allow free-model data policy publication "
            "or switch DIABLO_AI_MODEL to a non-free model."
        )
    elif "401" in msg or "403" in msg or "AuthenticationError" in msg:
        status = 401
        detail = "AI API key is invalid or missing. Check your .env file."
    elif "timeout" in msg.lower() or "timed out" in msg.lower():
        status = 504
        detail = "Request timed out. Try a smaller depth or simpler query."
    else:
        detail = f"Internal error: {msg[:200]}"

    return JSONResponse(status_code=status, content={"detail": detail})


# ---------------------------------------------------------------------------
# Request / Response schemas
# ---------------------------------------------------------------------------

class SearchRequest(BaseModel):
    query: str
    severity: list[str] | None = Field(default=None, examples=[["HIGH", "MEDIUM"]])
    page: int = 1
    page_size: int = 10
    with_summary: bool = False


class AnalyzeRequest(BaseModel):
    code: str
    context: str = ""
    page_size: int = 10


class LearnRequest(BaseModel):
    topic: str
    depth: str = "standard"  # quick | standard | deep
    quiz_count: int = 5


class ScoutRequest(BaseModel):
    file_content: str
    docs_content: str = ""
    depth: str = "standard"


class PitfallRequest(BaseModel):
    """Code selection from the editor for pitfall analysis."""
    selection: str  # The highlighted text
    surrounding_code: str = ""  # Optional: broader context around selection
    filename: str = ""


class FixDraftRequest(BaseModel):
    """Code selection from the editor for patch drafting."""
    selection: str
    surrounding_code: str = ""
    filename: str = ""


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "version": "0.1.0"}


@app.post("/search")
async def search(req: SearchRequest) -> dict[str, Any]:
    """Dictionary search — find Solodit findings by keyword."""
    if not _dictionary:
        raise HTTPException(503, "Backend not initialised")

    try:
        result = await _dictionary.search(
            query=req.query,
            severity=req.severity,
            page=req.page,
            page_size=req.page_size,
            with_summary=req.with_summary,
        )
        return result.to_dict()
    except SoloditError as exc:
        raise HTTPException(502, str(exc)) from exc


@app.post("/analyze")
async def analyze(req: AnalyzeRequest) -> dict[str, Any]:
    """Smart analysis — paste code, get context + relevant findings."""
    if not _smart_search:
        raise HTTPException(503, "Backend not initialised")

    try:
        ctx, result = await _smart_search.search_for_code(
            code=req.code,
            user_context=req.context,
            page_size=req.page_size,
        )
        return {
            "analysis": ctx.to_dict(),
            "total": result.total,
            "findings": [f.to_dict() for f in result.findings],
        }
    except SoloditError as exc:
        raise HTTPException(502, str(exc)) from exc


@app.post("/learn")
async def learn(req: LearnRequest) -> dict[str, Any]:
    """Generate a structured lesson on a topic with real Solodit findings."""
    if not _learning:
        raise HTTPException(503, "Backend not initialised")

    try:
        lesson = await _learning.generate_lesson(
            topic=req.topic,
            depth=req.depth,
            quiz_count=req.quiz_count,
        )
        return lesson.to_dict()
    except SoloditError as exc:
        raise HTTPException(502, str(exc)) from exc
    except Exception as exc:
        logger.exception("Lesson generation failed")
        raise HTTPException(500, f"Lesson generation failed: {exc}") from exc


@app.post("/scout")
async def scout(req: ScoutRequest) -> dict[str, Any]:
    """Ghost Auditor — analyse a contract against historical bugs."""
    if not _scout:
        raise HTTPException(503, "Backend not initialised")

    try:
        report = await _scout.generate_report(
            file_content=req.file_content,
            docs_content=req.docs_content,
            depth=req.depth,
        )
        return report.to_dict()
    except SoloditError as exc:
        raise HTTPException(502, str(exc)) from exc
    except Exception as exc:
        err_str = str(exc)
        logger.exception("Report generation failed")
        # Surface rate-limit errors clearly
        if "429" in err_str or "RESOURCE_EXHAUSTED" in err_str:
            raise HTTPException(
                429,
                "AI rate limit exceeded. Your Gemini free-tier quota is exhausted. "
                "Wait a minute and try again, or set OPENAI_API_KEY / ANTHROPIC_API_KEY in .env"
            ) from exc
        raise HTTPException(500, f"Report generation failed: {exc}") from exc


@app.post("/pitfall")
async def pitfall(req: PitfallRequest) -> dict[str, Any]:
    """Context-aware pitfall card — highlight code, get real audit intel."""
    if not _smart_search or not _ai:
        raise HTTPException(503, "Backend not initialised")

    # 1. Analyze BOTH selection and surrounding code separately
    analyzer = FunctionAnalyzer()

    # Selection analysis drives the primary query
    sel_ctx = analyzer.analyze(req.selection)

    # Surrounding code provides secondary context
    full_ctx = analyzer.analyze(req.surrounding_code) if req.surrounding_code else sel_ctx

    # Merge: selection wins for function_name, surrounding adds risk/protocol info
    ctx = sel_ctx
    if not ctx.function_name and full_ctx.function_name:
        ctx.function_name = full_ctx.function_name
    if not ctx.protocol_type and full_ctx.protocol_type:
        ctx.protocol_type = full_ctx.protocol_type
    # Add risk patterns from surrounding code, but don't let them dominate
    for rp in full_ctx.risk_patterns:
        if rp not in ctx.risk_patterns:
            ctx.risk_patterns.append(rp)

    # 2. Build query set — keep selection-specific intent first
    raw_selection = req.selection.strip()
    sel_name = re.sub(r"\(.*", "", raw_selection).strip()
    sel_name = sel_name.split()[-1] if sel_name.split() else sel_name
    sel_name = sel_name.lstrip("_")

    query_candidates: list[str] = []
    if sel_name:
        query_candidates.append(sel_name)
        query_candidates.append(f"{sel_name} vulnerability")
    if ctx.function_name and ctx.function_name.lower() != sel_name.lower():
        query_candidates.append(ctx.function_name)
    if ctx.function_type:
        query_candidates.append(ctx.function_type)
    if ctx.risk_patterns:
        query_candidates.extend(ctx.risk_patterns[:2])
    if ctx.suggested_keywords:
        query_candidates.extend(ctx.suggested_keywords[:3])
    if raw_selection and raw_selection != sel_name:
        query_candidates.append(raw_selection[:120])

    # Deduplicate and normalize order
    seen_queries: set[str] = set()
    unique_queries: list[str] = []
    for q in query_candidates:
        q = q.strip()
        if not q:
            continue
        k = q.lower()
        if k not in seen_queries:
            seen_queries.add(k)
            unique_queries.append(q)

    findings: list[dict[str, Any]] = []
    query_used = unique_queries[0] if unique_queries else raw_selection

    # 3. Search Solodit directly with curated queries and rank by relevance
    scored: list[tuple[int, dict[str, Any]]] = []
    seen_keys: set[str] = set()
    for query in unique_queries[:6]:
        try:
            result = await _solodit.search(
                keywords=query,
                impact=["HIGH", "MEDIUM"],
                quality_score=2,
                page_size=4,
            )
        except Exception as exc:
            logger.warning("Pitfall search failed for '%s': %s", query, exc)
            continue

        for f in result.findings:
            f_dict = f.to_dict()
            key = f_dict.get("slug") or f_dict.get("title", "")
            if key in seen_keys:
                continue
            seen_keys.add(key)
            score = _pitfall_relevance_score(f_dict, sel_name=sel_name, ctx=ctx)
            scored.append((score, f_dict))

    scored.sort(key=lambda it: it[0], reverse=True)
    findings = [f for _, f in scored[:5]]

    if not findings:
        return {
            "has_pitfall": False,
            "analysis": ctx.to_dict(),
            "card_html": "",
            "findings": [],
        }

    # 4. Generate conversational pitfall card via AI
    from pathlib import Path
    prompt_path = Path(__file__).parent / "prompts" / "pitfall_template.md"
    system_prompt = prompt_path.read_text()

    findings_text = ""
    for i, f in enumerate(findings[:3], 1):
        findings_text += f"\n--- Finding {i} ---\n"
        findings_text += f"Title: {f.get('title', '')}\n"
        findings_text += f"Firm: {f.get('firm_name', '')}\n"
        findings_text += f"Protocol: {f.get('protocol_name', '')}\n"
        findings_text += f"Severity: {f.get('impact', '')}\n"
        content = f.get("content", "")[:1500]
        findings_text += f"Content: {content}\n"

    user_prompt = f"""## User's Code Selection
```solidity
{req.selection}
```

## Code Analysis
- Function: {ctx.function_name or 'unknown'}
- Type: {ctx.function_type or 'unknown'}
- Protocol Type: {ctx.protocol_type or 'unknown'}
- Risk Patterns: {', '.join(ctx.risk_patterns) or 'none detected'}
- External Calls: {', '.join(ctx.external_calls[:5]) or 'none'}

## Matching Solodit Findings
{findings_text}

Generate the Pitfall Card HTML now."""

    try:
        card_html = await _ai.generate(
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            temperature=0.7,
            max_tokens=2048,
        )
    except Exception as exc:
        logger.warning("Pitfall AI generation failed: %s", exc)
        card_html = ""

    # Fallback: if AI failed but we have findings, render a simple card
    if not card_html and findings:
        card_html = _build_fallback_card(ctx, findings[:3])

    return {
        "has_pitfall": bool(findings),
        "analysis": ctx.to_dict(),
        "card_html": card_html,
        "findings": findings[:3],
        "query_used": query_used,
    }


@app.post("/fix-draft")
async def fix_draft(req: FixDraftRequest) -> dict[str, Any]:
    """Generate a concise patch draft for selected Solidity code."""
    if not _solodit or not _ai:
        raise HTTPException(503, "Backend not initialised")

    analyzer = FunctionAnalyzer()
    sel_ctx = analyzer.analyze(req.selection)
    full_ctx = analyzer.analyze(req.surrounding_code) if req.surrounding_code else sel_ctx
    ctx = sel_ctx
    if not ctx.function_name and full_ctx.function_name:
        ctx.function_name = full_ctx.function_name
    for rp in full_ctx.risk_patterns:
        if rp not in ctx.risk_patterns:
            ctx.risk_patterns.append(rp)

    raw_selection = req.selection.strip()
    sel_name = re.sub(r"\(.*", "", raw_selection).strip()
    sel_name = sel_name.split()[-1] if sel_name.split() else sel_name
    sel_name = sel_name.lstrip("_")

    query_candidates: list[str] = []
    if sel_name:
        query_candidates.extend([sel_name, f"{sel_name} vulnerability"])
    if ctx.function_type:
        query_candidates.append(ctx.function_type)
    query_candidates.extend(ctx.risk_patterns[:2])
    query_candidates.extend(ctx.suggested_keywords[:2])
    query_candidates = [q for i, q in enumerate(query_candidates) if q and q not in query_candidates[:i]]

    scored: list[tuple[int, dict[str, Any]]] = []
    seen_keys: set[str] = set()
    for query in query_candidates[:5]:
        try:
            result = await _solodit.search(
                keywords=query,
                impact=["HIGH", "MEDIUM"],
                quality_score=2,
                page_size=3,
            )
        except Exception as exc:
            logger.warning("Fix draft search failed for '%s': %s", query, exc)
            continue
        for f in result.findings:
            f_dict = f.to_dict()
            key = f_dict.get("slug") or f_dict.get("title", "")
            if key in seen_keys:
                continue
            seen_keys.add(key)
            scored.append((_pitfall_relevance_score(f_dict, sel_name=sel_name, ctx=ctx), f_dict))
    scored.sort(key=lambda x: x[0], reverse=True)
    findings = [f for _, f in scored[:3]]

    findings_text = ""
    refs = []
    for i, f in enumerate(findings, 1):
        ref = f"F{i}"
        refs.append(
            {
                "id": ref,
                "title": f.get("title", ""),
                "firm": f.get("firm_name", ""),
                "protocol": f.get("protocol_name", ""),
                "impact": f.get("impact", ""),
                "link": f.get("source_link", "") or f.get("github_link", ""),
            }
        )
        findings_text += (
            f"\n[{ref}] {f.get('title', '')}\n"
            f"Firm: {f.get('firm_name', '')}, Protocol: {f.get('protocol_name', '')}, Severity: {f.get('impact', '')}\n"
            f"Content: {(f.get('content', '') or '')[:1200]}\n"
        )

    system_prompt = (
        "You are a senior Solidity security engineer. Draft a minimal, auditable fix.\n"
        "Return ONLY HTML using sections: <h3>Risk</h3>, <h3>Patch Draft</h3>, <h3>Why</h3>, <h3>References</h3>.\n"
        "Rules: concise bullets, no emojis, no inline styles, cite references as [F1], [F2].\n"
        "If uncertain, mark assumptions explicitly."
    )
    user_prompt = (
        f"Filename: {req.filename or 'Unknown'}\n"
        f"Function: {ctx.function_name or sel_name or 'selection'}\n"
        f"Risk patterns: {', '.join(ctx.risk_patterns) or 'unknown'}\n\n"
        f"Selected Solidity:\n```solidity\n{req.selection[:4000]}\n```\n\n"
        f"Surrounding Solidity:\n```solidity\n{req.surrounding_code[:5000]}\n```\n\n"
        f"Historical references:\n{findings_text or 'No close references found.'}\n\n"
        "Produce a patch draft now."
    )

    try:
        draft_html = await _ai.generate(
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            temperature=0.2,
            max_tokens=1800,
        )
    except Exception as exc:
        logger.warning("Fix draft AI generation failed: %s", exc)
        draft_html = ""

    if not draft_html:
        fn = html_escape(ctx.function_name or sel_name or "selectedFunction")
        draft_html = (
            "<h3>Risk</h3><p>Potential accounting/state-order issue detected. Validate assumptions before merge.</p>"
            "<h3>Patch Draft</h3>"
            "<pre><code>"
            f"// Draft patch for {fn}\n"
            "// 1) Validate preconditions early\n"
            "// 2) Apply checks-effects-interactions ordering\n"
            "// 3) Add explicit state/accounting assertions\n"
            "</code></pre>"
            "<h3>Why</h3><ul><li>Reduces state desynchronization risk.</li></ul>"
            "<h3>References</h3><p>No close historical references available for this selection.</p>"
        )

    # final cleanup for readability/safety in webview
    draft_html = re.sub(r'\sstyle="[^"]*"', "", draft_html, flags=re.IGNORECASE)
    draft_html = re.sub(r"\sstyle='[^']*'", "", draft_html, flags=re.IGNORECASE)

    return {
        "analysis": ctx.to_dict(),
        "draft_html": draft_html,
        "references": refs,
        "query_used": query_candidates[0] if query_candidates else raw_selection,
    }


def _build_fallback_card(ctx, findings: list[dict]) -> str:
    """Build a simple HTML pitfall card when AI generation fails."""
    import html as html_mod

    func_label = ctx.function_name or "this code"
    risks = ", ".join(ctx.risk_patterns) if ctx.risk_patterns else "potential issues"

    items = ""
    for f in findings:
        title = html_mod.escape(f.get("title", "Unknown"))
        firm = html_mod.escape(f.get("firm_name", ""))
        protocol = html_mod.escape(f.get("protocol_name", ""))
        sev = html_mod.escape(f.get("impact", "MEDIUM"))
        sev_color = "#f87171" if sev == "HIGH" else "#fbbf24" if sev == "MEDIUM" else "#60a5fa"
        items += (
            f'<div style="background:rgba(255,255,255,0.04);border-radius:6px;'
            f'padding:10px 12px;margin-top:6px;">'
            f'<div style="font-weight:600;font-size:13px;">{title}</div>'
            f'<div style="font-size:11px;color:#888;margin-top:2px;">'
            f'{firm} · {protocol} · '
            f'<span style="color:{sev_color};font-weight:700;">{sev}</span>'
            f'</div></div>'
        )

    return (
        f'<div style="border-left:3px solid #fbbf24;padding:12px 14px;'
        f'background:rgba(251,191,36,0.06);border-radius:0 6px 6px 0;">'
        f'<div style="font-size:14px;font-weight:600;margin-bottom:6px;">'
        f'Potential issue found in {len(findings)} related audit finding(s)</div>'
        f'<div style="font-size:13px;color:#bbb;margin-bottom:10px;">'
        f'<code>{html_mod.escape(func_label)}</code> matches patterns related to '
        f'<strong>{html_mod.escape(risks)}</strong>. '
        f'Here are real audit findings from past security reviews:</div>'
        f'{items}</div>'
    )


def _pitfall_relevance_score(finding: dict[str, Any], *, sel_name: str, ctx) -> int:
    """Score findings so the top cards align with the highlighted selection."""
    title = (finding.get("title") or "").lower()
    content = (finding.get("content") or "").lower()
    tags = " ".join((finding.get("tags") or [])).lower()
    haystack = " ".join([title, tags, content[:1200]])

    score = 0
    if sel_name:
        sel = sel_name.lower()
        if sel in title:
            score += 80
        if sel in tags:
            score += 50
        if sel in haystack:
            score += 30
        # Common mapping for "balances" style selections
        if sel in {"balance", "balances", "_balances"} and any(
            token in haystack
            for token in (
                "accounting",
                "claim",
                "double",
                "share",
                "totalassets",
                "totalsupply",
                "rounding",
            )
        ):
            score += 35

    for risk in getattr(ctx, "risk_patterns", [])[:3]:
        if risk.lower() in haystack:
            score += 20

    sev = (finding.get("impact") or "").upper()
    if sev == "HIGH":
        score += 8
    elif sev == "MEDIUM":
        score += 4
    return score


# ---------------------------------------------------------------------------
# Entrypoint
# ---------------------------------------------------------------------------

def start() -> None:
    """Run the server directly with ``python -m backend.server``."""
    import uvicorn

    uvicorn.run(
        "backend.server:app",
        host=config.host,
        port=config.port,
        reload=True,
        log_level="info",
    )


if __name__ == "__main__":
    start()
