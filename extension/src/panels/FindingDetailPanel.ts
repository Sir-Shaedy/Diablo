/**
 * Finding Detail Panel.
 *
 * Opens a full-width editor tab showing the complete content
 * of a Solodit finding — severity, metadata, and full report.
 */

import * as vscode from "vscode";

/** Data shape posted from the sidebar. */
export interface FindingData {
  title: string;
  impact: string;
  content: string;
  firm_name: string;
  protocol_name: string;
  quality_score: number;
  source_link: string;
  github_link: string;
  tags: string[];
}

export class FindingDetailPanel {
  public static readonly viewType = "diablo.findingDetail";
  private static _panels: Map<string, FindingDetailPanel> = new Map();
  private readonly _panel: vscode.WebviewPanel;
  private _disposed = false;

  private constructor(
    panel: vscode.WebviewPanel,
    private readonly _extensionUri: vscode.Uri
  ) {
    this._panel = panel;
    this._panel.onDidDispose(() => this.dispose());
  }

  /** Open or focus a finding detail tab. */
  static show(
    extensionUri: vscode.Uri,
    finding: FindingData
  ): FindingDetailPanel {
    const key = finding.title;

    // Reuse existing panel for same finding
    const existing = FindingDetailPanel._panels.get(key);
    if (existing && !existing._disposed) {
      existing._panel.reveal(vscode.ViewColumn.One);
      return existing;
    }

    const panel = vscode.window.createWebviewPanel(
      FindingDetailPanel.viewType,
      `${finding.impact}: ${finding.title.slice(0, 50)}`,
      vscode.ViewColumn.One,
      { enableScripts: true }
    );

    const instance = new FindingDetailPanel(panel, extensionUri);
    instance._panel.webview.html = instance._getHtml(finding);
    FindingDetailPanel._panels.set(key, instance);

    panel.webview.onDidReceiveMessage((msg) => {
      if (msg.type === "openLink") {
        vscode.env.openExternal(vscode.Uri.parse(msg.url));
      }
    });

    return instance;
  }

  dispose() {
    this._disposed = true;
    this._panel.dispose();
  }

  private _getHtml(f: FindingData): string {
    const nonce = this._nonce();
    const impactColor: Record<string, string> = {
      HIGH: "#ef4444",
      MEDIUM: "#f59e0b",
      LOW: "#3b82f6",
      GAS: "#6b7280",
    };
    const color = impactColor[f.impact] || "#9ca3af";
    const stars = "★".repeat(Math.round(f.quality_score));
    const tags = f.tags
      .map(
        (t) =>
          `<span style="background:rgba(78,201,255,0.12);color:#82d8ff;padding:2px 8px;border-radius:4px;font-size:12px;">${this._esc(t)}</span>`
      )
      .join(" ");

    // Render content as-is (it may contain markdown-like formatting)
    const contentHtml = this._renderContent(f.content);

    return /*html*/ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <meta
    http-equiv="Content-Security-Policy"
    content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';"
  />
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: var(--vscode-font-family, 'Segoe UI', sans-serif);
      color: var(--vscode-foreground, #d4d4d4);
      background: var(--vscode-editor-background, #1e1e1e);
      padding: 24px 40px;
      line-height: 1.7;
      max-width: 900px;
      margin: 0 auto;
    }

    /* Badge */
    .severity-badge {
      display: inline-block;
      padding: 4px 14px;
      border-radius: 6px;
      font-weight: 700;
      font-size: 13px;
      letter-spacing: 0.5px;
      color: #fff;
      background: ${color};
    }

    h1 {
      font-size: 22px;
      font-weight: 600;
      margin: 16px 0 12px;
      line-height: 1.3;
    }

    .meta-row {
      display: flex;
      gap: 16px;
      flex-wrap: wrap;
      align-items: center;
      margin-bottom: 8px;
      font-size: 13px;
      color: var(--vscode-descriptionForeground, #888);
    }
    .meta-row strong {
      color: var(--vscode-foreground, #d4d4d4);
    }
    .stars { color: #fbbf24; letter-spacing: 1px; }

    .tags-row {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
      margin-bottom: 20px;
    }

    .links {
      display: flex;
      gap: 12px;
      margin-bottom: 24px;
    }
    .links a {
      color: var(--vscode-textLink-foreground, #4fc1ff);
      text-decoration: none;
      font-size: 13px;
    }
    .links a:hover { text-decoration: underline; }

    hr {
      border: none;
      border-top: 1px solid var(--vscode-editorWidget-border, #333);
      margin: 16px 0;
    }

    .content {
      font-size: 14px;
      white-space: pre-wrap;
      word-wrap: break-word;
    }
    .content code {
      background: var(--vscode-textCodeBlock-background, #2d2d2d);
      padding: 2px 6px;
      border-radius: 3px;
      font-size: 13px;
    }
    .content pre {
      background: var(--vscode-textCodeBlock-background, #2d2d2d);
      padding: 12px 16px;
      border-radius: 6px;
      overflow-x: auto;
      font-size: 13px;
      line-height: 1.5;
      margin: 12px 0;
    }
  </style>
</head>
<body>
  <span class="severity-badge">${this._esc(f.impact)}</span>
  <h1>${this._esc(f.title)}</h1>

  <div class="meta-row">
    <span>Firm: <strong>${this._esc(f.firm_name)}</strong></span>
    <span>Protocol: <strong>${this._esc(f.protocol_name)}</strong></span>
    <span class="stars">${stars}</span>
  </div>

  <div class="tags-row">${tags}</div>

  <div class="links">
    ${f.source_link ? `<a href="#" class="detail-link" data-link="${this._escAttr(f.source_link)}">Source Report</a>` : ""}
    ${f.github_link ? `<a href="#" class="detail-link" data-link="${this._escAttr(f.github_link)}">GitHub</a>` : ""}
  </div>

  <hr/>

  <div class="content">${contentHtml}</div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    document.querySelectorAll('a.detail-link').forEach((a) => {
      a.addEventListener('click', (e) => {
        e.preventDefault();
        const url = a.dataset.link;
        if (url) vscode.postMessage({ type: 'openLink', url });
      });
    });
  </script>
</body>
</html>`;
  }

  private _renderContent(raw: string): string {
    if (!raw) {
      return '<span style="color:#888">No content available for this finding.</span>';
    }
    // Basic markdown-like rendering
    let html = this._esc(raw);

    // Code blocks: ```...```
    html = html.replace(/```(\w*)\n([\s\S]*?)```/g, "<pre><code>$2</code></pre>");

    // Inline code: `...`
    html = html.replace(/`([^`]+)`/g, "<code>$1</code>");

    // Bold: **...**
    html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");

    // Headers: ## ...
    html = html.replace(/^### (.+)$/gm, '<h3 style="margin:16px 0 8px;font-size:16px;">$1</h3>');
    html = html.replace(/^## (.+)$/gm, '<h2 style="margin:20px 0 8px;font-size:18px;">$1</h2>');

    return html;
  }

  private _esc(s: string): string {
    return s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  private _escAttr(s: string): string {
    return s.replace(/'/g, "\\'").replace(/"/g, "&quot;");
  }

  private _nonce(): string {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let out = "";
    for (let i = 0; i < 32; i++) out += chars.charAt(Math.floor(Math.random() * chars.length));
    return out;
  }
}
