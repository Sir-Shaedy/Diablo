"""
Learning Module — AI-powered lesson generation and quiz engine.

Fetches real Solodit findings, synthesises them into structured
lessons with the White Mage persona, and generates quizzes from
real code snippets.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from backend.core.ai_provider import AIProvider
from backend.core.solodit_client import Finding, SoloditClient

logger = logging.getLogger(__name__)

_PROMPTS_DIR = Path(__file__).resolve().parent.parent / "prompts"

# Depth → how many findings to fetch
_DEPTH_MAP = {
    "quick": 5,
    "standard": 20,
    "deep": 50,
}


@dataclass
class QuizQuestion:
    """A single quiz question."""

    question: str
    code_snippet: str
    options: list[str]
    correct_index: int
    explanation: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "question": self.question,
            "code_snippet": self.code_snippet,
            "options": self.options,
            "correct_index": self.correct_index,
            "explanation": self.explanation,
        }


@dataclass
class Lesson:
    """A generated lesson."""

    topic: str
    depth: str
    finding_count: int
    content_html: str
    quiz: list[QuizQuestion] = field(default_factory=list)
    sources: list[dict[str, str]] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "topic": self.topic,
            "depth": self.depth,
            "finding_count": self.finding_count,
            "content_html": self.content_html,
            "quiz": [q.to_dict() for q in self.quiz],
            "sources": self.sources,
        }


class LearningModule:
    """Generates AI-driven security lessons backed by Solodit findings."""

    def __init__(
        self,
        client: SoloditClient | None = None,
        ai: AIProvider | None = None,
    ) -> None:
        self._client = client or SoloditClient()
        self._ai = ai or AIProvider()
        self._personality = self._load_prompt("personality.md")
        self._lesson_template = self._load_prompt("lesson_template.md")

    async def generate_lesson(
        self,
        topic: str,
        depth: str = "standard",
        quiz_count: int = 5,
    ) -> Lesson:
        """Generate a complete lesson on *topic*.

        Steps:
        1. Fetch findings from Solodit matching the topic
        2. Build context from titles + content
        3. Generate structured lesson via AI
        4. Parse quiz questions from AI output
        """
        page_size = _DEPTH_MAP.get(depth, 20)

        # 1 — Fetch real findings
        result = await self._client.search(
            keywords=topic,
            impact=["HIGH", "MEDIUM"],
            quality_score=3,
            page_size=page_size,
        )

        if not result.findings:
            return Lesson(
                topic=topic,
                depth=depth,
                finding_count=0,
                content_html=self._no_findings_html(topic),
            )

        # 2 — Build context block from findings
        context_block = self._build_context(result.findings)
        sources = [
            {
                "title": f.title,
                "firm": f.firm_name,
                "protocol": f.protocol_name,
                "impact": f.impact,
                "link": f.source_link or f.github_link,
            }
            for f in result.findings
        ]

        # 3 — Generate lesson
        lesson_prompt = self._lesson_template.replace("{topic}", topic)
        lesson_prompt = lesson_prompt.replace("{finding_count}", str(len(result.findings)))
        lesson_prompt = lesson_prompt.replace("{quiz_count}", str(quiz_count))

        user_prompt = (
            f"{lesson_prompt}\n\n"
            f"## Findings Data\n\n{context_block}\n\n"
            f"Generate the lesson now. Format the output as HTML that can be "
            f"rendered in a VS Code webview. Use <h2>, <h3>, <pre><code>, <ul>, <li> etc. "
            f"For quiz questions, wrap each in a <div class=\"quiz-question\" data-correct=\"INDEX\"> "
            f"with <div class=\"quiz-option\" data-index=\"N\"> for each option."
        )

        content_html = await self._ai.generate(
            system_prompt=self._personality,
            user_prompt=user_prompt,
            temperature=0.7,
            max_tokens=8192,
        )
        content_html = self._postprocess_lesson_html(content_html)

        # 4 — Parse quiz from HTML
        quiz = self._parse_quiz(content_html)

        return Lesson(
            topic=topic,
            depth=depth,
            finding_count=len(result.findings),
            content_html=content_html,
            quiz=quiz,
            sources=sources,
        )

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
        """Convert findings into a text block for the AI."""
        parts: list[str] = []
        for i, f in enumerate(findings, 1):
            content_preview = (f.content[:800] + "...") if len(f.content) > 800 else f.content
            parts.append(
                f"### Finding {i}: {f.title}\n"
                f"- **Firm:** {f.firm_name}\n"
                f"- **Protocol:** {f.protocol_name}\n"
                f"- **Severity:** {f.impact}\n"
                f"- **Quality:** {'★' * f.quality_score}\n"
                f"- **Tags:** {', '.join(f.tags)}\n\n"
                f"{content_preview}\n"
            )
        return "\n---\n".join(parts)

    @staticmethod
    def _parse_quiz(html: str) -> list[QuizQuestion]:
        """Extract quiz questions from AI-generated HTML.

        Looks for <div class="quiz-question" data-correct="N"> blocks.
        Falls back to empty list if AI didn't follow format exactly.
        """
        questions: list[QuizQuestion] = []

        # Find quiz question blocks
        q_pattern = re.compile(
            r'<div\s+class="quiz-question"[^>]*data-correct="(\d+)"[^>]*>(.*?)</div>\s*(?=<div\s+class="quiz-question"|$)',
            re.DOTALL,
        )

        for match in q_pattern.finditer(html):
            raw_correct = int(match.group(1))
            block = match.group(2)

            # Extract question text (first <p> or <h4>)
            q_text_m = re.search(r"<(?:p|h4)[^>]*>(.*?)</(?:p|h4)>", block, re.DOTALL)
            question = q_text_m.group(1).strip() if q_text_m else "Question"

            # Extract code snippet
            code_m = re.search(r"<pre><code[^>]*>(.*?)</code></pre>", block, re.DOTALL)
            code = code_m.group(1).strip() if code_m else ""

            # Extract options
            opt_pattern = re.compile(
                r'<div\s+class="quiz-option"[^>]*>(.*?)</div>', re.DOTALL
            )
            options = [m.group(1).strip() for m in opt_pattern.finditer(block)]

            if options:
                # Extract explanation
                exp_m = re.search(
                    r'<div\s+class="quiz-explanation"[^>]*>(.*?)</div>', block, re.DOTALL
                )
                explanation = exp_m.group(1).strip() if exp_m else ""
                correct_idx = LearningModule._normalize_correct_index(
                    raw_correct=raw_correct,
                    options_count=len(options),
                    block_html=block,
                    explanation_html=explanation,
                )

                questions.append(
                    QuizQuestion(
                        question=question,
                        code_snippet=code,
                        options=options,
                        correct_index=correct_idx,
                        explanation=explanation,
                    )
                )

        return questions

    @staticmethod
    def _postprocess_lesson_html(html: str) -> str:
        """Normalize generated lesson HTML for stable rendering."""
        out = html

        # Replace empty code blocks so the user never sees blank code sections.
        out = re.sub(
            r"<pre[^>]*>\s*<code[^>]*>\s*</code>\s*</pre>",
            "<pre><code>// Source snippet unavailable in finding body.</code></pre>",
            out,
            flags=re.IGNORECASE | re.DOTALL,
        )

        # Normalize quiz indices to zero-based for frontend click handling.
        q_pattern = re.compile(
            r'(<div\s+class="quiz-question"[^>]*data-correct=")(\d+)(".*?>)(.*?</div>\s*)(?=<div\s+class="quiz-question"|$)',
            re.DOTALL,
        )

        def _fix_q(match: re.Match[str]) -> str:
            head_a, raw_s, head_b, block = match.groups()
            options_count = len(
                re.findall(r'<div\s+class="quiz-option"[^>]*>.*?</div>', block, re.DOTALL)
            )
            raw_correct = int(raw_s)
            normalized = LearningModule._normalize_correct_index(
                raw_correct=raw_correct,
                options_count=options_count,
                block_html=block,
                explanation_html=block,
            )
            return f"{head_a}{normalized}{head_b}{block}"

        out = q_pattern.sub(_fix_q, out)
        return out

    @staticmethod
    def _normalize_correct_index(
        *,
        raw_correct: int,
        options_count: int,
        block_html: str,
        explanation_html: str,
    ) -> int:
        """Normalize model-provided quiz answer index to zero-based."""
        if options_count <= 0:
            return 0

        # Prefer explicit letter hints if the model provides them (Answer: B).
        letter_m = re.search(
            r"(?:answer|correct)\s*[:\-]\s*([A-D])",
            f"{block_html} {explanation_html}",
            re.IGNORECASE,
        )
        if letter_m:
            idx = ord(letter_m.group(1).upper()) - ord("A")
            if 0 <= idx < options_count:
                return idx

        # Common case from LLMs: 1-based index.
        if 1 <= raw_correct <= options_count:
            return raw_correct - 1

        # Already zero-based.
        if 0 <= raw_correct < options_count:
            return raw_correct

        # Last-resort clamp.
        return max(0, min(raw_correct, options_count - 1))

    @staticmethod
    def _no_findings_html(topic: str) -> str:
        return (
            f'<div style="text-align:center;padding:40px;">'
            f'<h2>No findings found</h2>'
            f'<p>Solodit returned no results for "<strong>{topic}</strong>".</p>'
            f'<p>Try a more specific term like "reentrancy in DEX" or "ERC4626 inflation".</p>'
            f'</div>'
        )
