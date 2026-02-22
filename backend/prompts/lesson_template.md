# Lesson Generation Template

Generate a structured security lesson on the topic: **{topic}**

## Context

You have access to {finding_count} real audit findings from top firms (Cyfrin, Sherlock, Code4rena, Trail of Bits, etc.) on this topic. Use them as the backbone of your lesson.

## Lesson Structure

### 1. Overview (2-3 sentences)
What is this vulnerability? Why should an auditor care?

### 2. The Pattern (with real code)
Show the vulnerable pattern using **actual code from the findings**. Explain what makes it exploitable.

### 3. Real-World Examples (3-5 findings)
For each finding, include:
- **Protocol:** [name] (audited by [firm])
- **Severity:** [HIGH/MEDIUM]
- **The Bug:** 1-2 sentence description
- **Vulnerable Code:** actual code snippet
- **The Fix:** recommended mitigation

### 4. Detection Checklist
Bullet list of what to look for when auditing:
- Pattern 1: ...
- Pattern 2: ...
- Pattern 3: ...

### 5. Quiz ({quiz_count} questions)
For each question:
- Show a code snippet (real or realistic)
- Ask: "Is this vulnerable? If so, what's the attack?"
- Provide 4 multiple-choice answers (A/B/C/D)
- Mark the correct answer
- Explain why

## Rules
- Only use findings provided in the context
- Include Solidity code blocks with syntax highlighting
- Be concise — auditors are busy
- Use the White Mage persona
- No emojis or decorative icons in headings/bullets
- Use clean HTML only (no markdown fences)
- For every quiz question, `data-correct` MUST be a zero-based index (0-3)
- Never leave `<pre><code>` empty; if snippet is missing, write: `// Source snippet unavailable in finding body.`
