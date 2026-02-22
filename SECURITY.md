# Security Policy

## Supported Versions

This project is under active development. Security fixes are applied to the latest `main` branch first.

## Reporting a Vulnerability

Please do **not** open a public GitHub issue for security-sensitive findings.

Report privately by contacting the maintainers with:

1. A clear description of the issue
2. Impact and severity assessment
3. Reproduction steps or PoC
4. Suggested remediation (if available)

If you have encrypted disclosure preferences, include your public key details in the initial message and we will coordinate accordingly.

## Disclosure Process

1. We acknowledge receipt as quickly as possible.
2. We validate and triage the report.
3. We patch and test the fix.
4. We publish a coordinated advisory/changelog entry.

## Scope Notes

- Never commit API keys or secrets to the repository.
- Backend runs locally by default; treat `.env` as sensitive.
- Third-party AI providers can impose data policy constraints; review provider privacy settings before use.
