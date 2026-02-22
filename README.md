# Diablo

AI-powered Solidity security intelligence in VS Code, backed by real audit findings.

<p align="center">
  <img src="extension/media/icon.svg" alt="Diablo logo" width="120" />
</p>

## So what can you do with Diablo really?

- **Dictionary + Insight**: Search 50k+ Solodit findings with severity filters. You can also highlight a Solidity function, variable, or code pattern and instantly get related historical risk context.
- **Academy**: Type any vulnerability topic and Diablo builds a mini study module from real historical reports, then tests understanding with graded quizzes.
- **Scout (Ghost Auditor)**: Analyze full contracts and generate concise audit-style reports with evidence IDs (`[F1]`, `[F2]`, ...). It breaks down contract parts, queries matching historical findings, and maps claims back to verifiable references.
- **Fix Draft**: Generate patch-first suggestions directly from selected functions, grounded in related findings.
- **Audit flow in one place**: Research, learn, analyze, and draft fixes without leaving VS Code.

## Self-Hosted by default

Diablo runs locally on your machine:

- Extension UI in VS Code
- Backend on `127.0.0.1:8391`
- Your configured APIs only (`Cyfrin` + optional AI provider)

No Diablo cloud backend is required.

---

## Fastest path (recommended for testers)

### Option A: clone + one command (recommended)

```bash
git clone https://github.com/Sir-Shaedy/Diablo.git
cd Diablo
./install.sh
```

(`./scripts/install-local.sh` works too.)

By now, you should see the Diablo symbol added to your VS Code activity bar (usually on the left panel). You can now open your Solidity repo and use Diablo there.

This script:

- creates `.venv` if missing
- installs backend package
- installs extension deps
- builds `.vsix`
- installs/updates Diablo extension

After this, add API keys in `.env`:

Create `.env` in repo root:

```env
CYFRIN_API_KEY=your_cyfrin_key

# choose at least one AI provider
OPENROUTER_API_KEY=sk-or-v1-...
# GEMINI_API_KEY=...
# OPENAI_API_KEY=...
# ANTHROPIC_API_KEY=...

DIABLO_AI_PROVIDER=openrouter
DIABLO_AI_MODEL=openai/gpt-oss-120b:free
DIABLO_HOST=127.0.0.1
DIABLO_PORT=8391
```

Then start backend:

```bash
cd Diablo
source .venv/bin/activate
python3 -m backend.server
```

In VS Code:

- Run `Diablo: Start Backend Server` (optional if already running manually)
- Open a `.sol` file
- Open Diablo views from Activity Bar container

### Option B: install from release asset only

If you do not want to build from source, install the prebuilt VSIX from Releases:

- https://github.com/Sir-Shaedy/Diablo/releases

```bash
code --install-extension /path/to/diablo-x.y.z.vsix --force
```

You still need backend + `.env` for features to work.

---

## Common errors (and exact fixes)

| Error | Cause | Fix |
|---|---|---|
| `ModuleNotFoundError: No module named backend` | Running backend from `extension/` | Run from repo root: `python3 -m backend.server` |
| `ModuleNotFoundError: No module named google` | `google-genai` missing in environment | Reinstall backend deps: `pip install -e .` |
| `ModuleNotFoundError: No module named anthropic` | `anthropic` missing in environment | Reinstall backend deps: `pip install -e .` |
| `Failed to fetch` in Dictionary/Scout | Backend unreachable | Confirm backend running on `127.0.0.1:8391`; restart backend; reload VS Code |
| OpenRouter 404 policy error | Free-model privacy toggle mismatch | Enable required OpenRouter privacy toggles for free endpoints/publication, or switch model |
| 429 rate-limit | Provider quota exhausted | wait/reset quota, switch provider/model, reduce depth |
| Extension not visible | Not installed in current VS Code target (WSL/local mismatch) | Reinstall `.vsix` in current target and reload window |

Quick backend health check:

```bash
curl http://127.0.0.1:8391/health
```

---

## Trust / safety notes

- Source code is fully open.
- You can build `.vsix` locally from source if you prefer.
- Release assets include checksums on GitHub release page.
- Never share your API keys publicly.

Optional local checksum verification:

```bash
sha256sum /path/to/diablo-x.y.z.vsix
```

---

## Build from source (advanced)

Use this if you want to modify the extension/backend yourself.

### Requirements

- Python 3.10+
- Node.js 18+
- VS Code 1.85+

### Setup

```bash
git clone https://github.com/Sir-Shaedy/Diablo.git
cd Diablo
python3 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
npm --prefix extension install
npm --prefix extension run compile
```

### Package extension manually

```bash
npm --prefix extension run package
code --install-extension extension/diablo-x.y.z.vsix --force
```

---

## API Endpoints

| Endpoint | Method | Description |
|---|---|---|
| `/health` | GET | Health check |
| `/search` | POST | Search Solodit findings |
| `/analyze` | POST | Context-aware code analysis |
| `/learn` | POST | Academy lesson generation |
| `/scout` | POST | Contract report generation |
| `/pitfall` | POST | Selection-based pitfall insight |
| `/fix-draft` | POST | Patch draft suggestions |

## Open source docs

- `LICENSE` (MIT)
- `SECURITY.md`
- `CONTRIBUTING.md`

## License

MIT

## Acknowledgments

Thanks to Cyfrin for giving us the opportunity to use the Solodit API for free. You guys rock.

I am not a cracked dev, so please feel free to contribute. If this project helps you, drop a star.
