# Scout Report Template

Generate a concise, auditable security report for the provided smart contract.

## Context

You are analyzing a Solidity smart contract. You have access to:
- **Code analysis** with detected function types, protocol patterns, and risk indicators
- **{finding_count} real audit findings** from Solodit that match the code's patterns
- Optionally, project documentation provided by the user

## Report Structure

### 1. Executive Summary
- Contract name/type identified
- Key risk areas detected
- Number of potential issues found cross-referenced with historical bugs
- Keep this section to 4 bullet points max (no marketing language)

### 2. Code Analysis
- Protocol type detected (ERC20, ERC4626, DEX, Lending, etc.)
- Functions analyzed and their risk classifications
- External calls, state changes, and access control patterns

### 3. Findings (grouped by severity)
For each finding:
- **Risk Level:** CRITICAL / HIGH / MEDIUM / LOW / GAS
- **Title:** Descriptive vulnerability name
- **Location:** Function or pattern where risk was detected
- **Description:** What the vulnerability is and why it matters
- **Historical Evidence:** Reference to similar real bugs from Solodit
  - Protocol: [name], Firm: [auditor], Severity: [level], Citation: [F#]
  - Brief description of the historical bug
- **Recommendation:** Specific mitigation steps
- **Fix Draft:** Provide a minimal patch snippet for the vulnerable function (if possible)

### 4. Checklist Summary
| Check | Status | Details |
|-------|--------|---------|
| Reentrancy           | pass / warn | ... |
| Access Control       | pass / warn | ... |
| Integer Overflow     | pass / warn | ... |
| Oracle Dependency    | pass / warn | ... |
| Flash Loan Risk      | pass / warn | ... |
| ERC Compliance       | pass / warn | ... |

### 5. Recommendations
Prioritized list of actions the developer should take.

## Rules
- Only reference real findings from the provided Solodit data
- Be specific — cite function names and line patterns
- Be direct and technical; avoid stylistic prose or motivational language
- Every risk claim MUST include a citation like [F1], [F2], etc.
- Format as HTML for VS Code webview rendering
- No inline styles, no emojis, no markdown fences
