/**
 * Shared utilities for Diablo webview panels.
 *
 * Provides common HTML scaffolding, styles, and a typed
 * fetch wrapper for backend communication.
 */

import * as vscode from "vscode";

/** Build a consistent HTML page for any webview panel. */
export function getWebviewHtml(
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
  title: string,
  bodyContent: string
): string {
  const nonce = getNonce();

  // Replace placeholder nonce="" in script tags with the actual nonce
  const nonceBody = bodyContent.replace(/nonce=""/g, `nonce="${nonce}"`);

  return /*html*/ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta
    http-equiv="Content-Security-Policy"
    content="default-src 'none';
             style-src ${webview.cspSource} 'unsafe-inline';
             script-src 'nonce-${nonce}';
             connect-src http://127.0.0.1:8391;"
  />
  <title>${title}</title>
  <style>
    :root {
      --diablo-surface-1: color-mix(in srgb, var(--vscode-editor-background) 82%, #0b1118 18%);
      --diablo-surface-2: color-mix(in srgb, var(--vscode-editor-background) 74%, #101826 26%);
      --diablo-border: color-mix(in srgb, var(--vscode-panel-border) 70%, #35506f 30%);
      --diablo-accent: color-mix(in srgb, var(--vscode-focusBorder) 60%, #4ec9ff 40%);
      --diablo-muted: var(--vscode-descriptionForeground);
    }

    /* ── Reset & Base ─────────────────────────────────── */
    *,
    *::before,
    *::after {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      background:
        radial-gradient(1200px 300px at -20% -12%, rgba(78, 201, 255, 0.08), transparent 45%),
        radial-gradient(1100px 260px at 120% -8%, rgba(87, 203, 131, 0.07), transparent 40%),
        var(--vscode-sideBar-background);
      padding: 12px;
      line-height: 1.5;
    }

    /* ── Typography ───────────────────────────────────── */
    h2 {
      font-size: 13px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--vscode-sideBarSectionHeader-foreground);
      margin-bottom: 10px;
    }

    a {
      color: var(--vscode-textLink-foreground);
      text-decoration: none;
    }
    a:hover {
      text-decoration: underline;
    }

    /* ── Form Elements ────────────────────────────────── */
    input[type="text"],
    textarea,
    select {
      width: 100%;
      padding: 6px 10px;
      border: 1px solid var(--vscode-input-border);
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border-radius: 4px;
      font-size: 13px;
      font-family: var(--vscode-font-family);
      outline: none;
    }
    input:focus,
    textarea:focus {
      border-color: var(--vscode-focusBorder);
    }

    /* ── Buttons ──────────────────────────────────────── */
    .btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 14px;
      border: none;
      border-radius: 4px;
      font-size: 13px;
      font-family: var(--vscode-font-family);
      cursor: pointer;
      transition: opacity 0.15s;
    }
    .btn:hover {
      opacity: 0.85;
    }
    .btn-primary {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
    }
    .btn-secondary {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }
    .btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    /* ── Severity Pills ───────────────────────────────── */
    .severity-filter {
      display: flex;
      gap: 6px;
      margin: 8px 0 12px;
      flex-wrap: wrap;
    }
    .pill {
      padding: 3px 10px;
      border-radius: 12px;
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
      border: 1px solid transparent;
      transition: all 0.15s;
      user-select: none;
    }
    .pill.active {
      border-color: var(--vscode-focusBorder);
    }
    .pill-high {
      background: rgba(220, 38, 38, 0.15);
      color: #f87171;
    }
    .pill-medium {
      background: rgba(245, 158, 11, 0.15);
      color: #fbbf24;
    }
    .pill-low {
      background: rgba(59, 130, 246, 0.15);
      color: #60a5fa;
    }
    .pill-gas {
      background: rgba(107, 114, 128, 0.15);
      color: #9ca3af;
    }

    /* ── Finding Cards ────────────────────────────────── */
    .finding-card {
      padding: 10px 12px;
      margin-bottom: 8px;
      border-radius: 6px;
      background: var(--diablo-surface-1);
      border: 1px solid var(--diablo-border);
      border-left: 3px solid transparent;
      transition: background 0.15s, border-color 0.15s;
    }
    .finding-card:hover {
      background: var(--diablo-surface-2);
      border-color: var(--diablo-accent);
    }
    .finding-card.high {
      border-left-color: #ef4444;
    }
    .finding-card.medium {
      border-left-color: #f59e0b;
    }
    .finding-card.low {
      border-left-color: #3b82f6;
    }
    .finding-card .title {
      font-weight: 600;
      font-size: 13px;
      margin-bottom: 4px;
    }
    .finding-card .meta {
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
    }
    .finding-card .tags {
      margin-top: 4px;
      display: flex;
      gap: 4px;
      flex-wrap: wrap;
    }
    .tag {
      font-size: 10px;
      padding: 1px 6px;
      border-radius: 3px;
      background: rgba(78, 201, 255, 0.12);
      color: #82d8ff;
    }

    /* ── Pagination ───────────────────────────────────── */
    .pagination {
      display: flex;
      justify-content: center;
      align-items: center;
      gap: 8px;
      margin-top: 12px;
      font-size: 12px;
    }
    .pagination button {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
      border: none;
      padding: 4px 10px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
    }

    /* ── Utility ──────────────────────────────────────── */
    .spacer {
      height: 12px;
    }
    .muted {
      color: var(--vscode-descriptionForeground);
      font-size: 12px;
    }
    .loading {
      text-align: center;
      padding: 20px 0;
      color: var(--vscode-descriptionForeground);
    }
    .error-msg {
      background: rgba(220, 38, 38, 0.1);
      color: #f87171;
      padding: 8px 12px;
      border-radius: 4px;
      font-size: 12px;
      border: 1px solid rgba(220, 38, 38, 0.26);
    }
    .summary-box {
      background: rgba(78, 201, 255, 0.08);
      border: 1px solid rgba(78, 201, 255, 0.24);
      border-radius: 6px;
      padding: 10px 12px;
      margin-bottom: 12px;
      font-size: 12px;
      line-height: 1.6;
    }
    .quality-stars {
      color: #fbbf24;
      letter-spacing: 1px;
    }
    .hidden {
      display: none;
    }
  </style>
</head>
<body>
  ${nonceBody}
</body>
</html>`;
}

function getNonce(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < 32; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}
