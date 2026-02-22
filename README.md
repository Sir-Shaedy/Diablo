# Diablo - AI-Powered Security Intelligence

> 50,000+ real audit findings in-editor, with auditable outputs and patch-first guidance.

Diablo is a VS Code extension + local backend for smart contract security research, learning, and review.

## Self-Hosted by Default

Diablo runs on your machine by default:

- VS Code webviews call a local FastAPI backend at `127.0.0.1:8391`
- Your source code is processed locally first
- External calls are only made to providers you configure (`Cyfrin/Solodit`, optional AI provider)

No managed Diablo cloud service is required.

## Core Features

### Dictionary

- Search 50k+ Solodit findings by keyword + severity
- Context-aware Insight from selected Solidity code (`/pitfall`)
- **Fix Draft mode** for selected function-level patch suggestions (`/fix-draft`)
- Finding detail panel with source links and metadata

### Academy

- Topic-based lessons grounded in real findings
- Quiz generation with normalized answer indexing
- Rendering guardrails for malformed AI HTML and empty code blocks

### Scout (Ghost Auditor)

- Parses contract structure (functions, ERC signals, modifiers, external calls)
- Cross-references historical findings by risk patterns
- Generates concise reports with **Evidence Map** citations (`[F1]`, `[F2]`, ...)
- Sanitizes style-heavy AI output for readability in VS Code themes

## Verified Output Behavior

- Empty generated code blocks are replaced with explicit placeholders
- Quiz correctness indexing is normalized to avoid false misses
- AI-generated report HTML is post-processed for readability and auditability
- Dictionary search remains available even if AI summary generation fails

## Installation (Recommended Path)

### Requirements

- Python 3.10+
- Node.js 18+
- VS Code 1.85+

### 1. Clone and prepare backend

```bash
cd Diablo
python3 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
```

### 2. Configure environment

Create `.env` in repo root:

```env
# Required
CYFRIN_API_KEY=your_cyfrin_key

# Optional AI providers (set at least one)
OPENROUTER_API_KEY=sk-or-v1-...
GEMINI_API_KEY=...
OPENAI_API_KEY=...
ANTHROPIC_API_KEY=...

# Optional overrides
DIABLO_AI_PROVIDER=openrouter
DIABLO_AI_MODEL=openai/gpt-oss-120b:free
DIABLO_HOST=127.0.0.1
DIABLO_PORT=8391
```

### 3. Install extension dependencies

```bash
cd extension
npm install
npm run compile
```

### 4. Run backend from repo root

```bash
cd /path/to/Diablo
source .venv/bin/activate
python3 -m backend.server
```

### 5. Launch extension host

```bash
cd extension
code --extensionDevelopmentPath=. .
```

## Installation Troubleshooting

### `ModuleNotFoundError: No module named 'backend'`

You started Python from `extension/`. Start backend from repo root:

```bash
cd Diablo
python3 -m backend.server
```

### `Failed to fetch` in Dictionary/Scout

Backend is unreachable.

1. Confirm backend is running on `127.0.0.1:8391`
2. Confirm `DIABLO_PORT` matches extension target port
3. Restart backend and reload VS Code window

### OpenRouter 404 data policy error

If using free models and you see policy-related 404, enable matching privacy toggles in OpenRouter settings for free endpoints/publication policy, or switch to a non-free model.

### Rate-limit errors (429)

- Wait for quota reset
- Switch provider/model in `.env`
- Reduce request frequency/depth

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check |
| `/search` | POST | Search Solodit findings |
| `/analyze` | POST | Analyze code with context-aware search |
| `/learn` | POST | Generate AI lesson with quizzes |
| `/scout` | POST | Generate security audit report |
| `/pitfall` | POST | Context-aware pitfall card from selected code |
| `/fix-draft` | POST | Patch draft suggestions for selected Solidity code |

## Privacy and Data Flow

Diablo is self-hosted by default, but provider calls still transmit data to configured services:

1. `Cyfrin/Solodit`: finding search queries and filters
2. AI provider (optional): prompt content used for summaries/reports/lessons/fix drafts

Review provider-specific privacy/data policies before production use.

## Open Source Docs

- `LICENSE` (MIT)
- `SECURITY.md`
- `CONTRIBUTING.md`

## Dependency License Compatibility

Current direct dependencies are generally permissive (MIT/BSD/Apache-style ecosystems), but you should verify in your exact lock state before each release.

Backend check (installed env):

```bash
python3 -m pip install pip-licenses
python3 -m piplicenses --format=markdown
```

Extension check (Node deps):

```bash
npx license-checker --summary --production
```

## Packaging

```bash
cd extension
npm run package
code --install-extension diablo-0.1.0.vsix
```

## License

MIT
