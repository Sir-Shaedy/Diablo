# Contributing

Thanks for contributing to Diablo.

## Development Setup

1. Create and activate a Python virtual environment.
2. Install backend and dev dependencies:

```bash
pip install -e ".[dev]"
```

3. Install extension dependencies:

```bash
cd extension
npm install
```

## Run Locally

From repository root:

```bash
python3 -m backend.server
```

In another terminal:

```bash
cd extension
code --extensionDevelopmentPath=. .
```

## Quality Checks

Backend:

```bash
python3 -m compileall backend
python3 -m pytest backend/tests -q
```

Extension:

```bash
npm --prefix extension run compile
```

## Contribution Guidelines

1. Open an issue first for major changes.
2. Keep PRs focused and small.
3. Add tests for behavior changes (especially parser/rendering logic).
4. Update docs (`README.md`) when behavior or setup changes.
5. Avoid committing secrets (`.env`, API keys, private tokens).

## Code Style

- Python: use Ruff defaults configured in `pyproject.toml`.
- TypeScript: keep strict typing and avoid inline event handlers in webviews.

## Pull Request Checklist

1. Code compiles and tests pass locally.
2. New behavior has tests.
3. Docs updated.
4. No secrets in diff.
