/**
 * Report Panel — Full-width editor tab for Ghost Auditor reports.
 *
 * Displays AI-generated security reports with severity breakdown,
 * contract analysis, and matched Solodit findings.
 */

import * as vscode from "vscode";

export interface ReportData {
  contract_name: string;
  findings_count: number;
  severity_breakdown: { HIGH: number; MEDIUM: number; LOW: number };
  contract_info: {
    name: string;
    ercs_detected: string[];
    functions: { name: string; params: string; modifiers: string }[];
    imports: string[];
    external_calls: string[];
    modifiers_used: string[];
    loc: number;
  };
  content_html: string;
  matched_findings: {
    title: string;
    firm: string;
    protocol: string;
    impact: string;
    link: string;
  }[];
}

export class ReportPanel {
  public static readonly viewType = "diablo.reportView";
  private static _panels: Map<string, ReportPanel> = new Map();
  private readonly _panel: vscode.WebviewPanel;
  private _disposed = false;

  private constructor(
    panel: vscode.WebviewPanel,
    private readonly _extensionUri: vscode.Uri
  ) {
    this._panel = panel;
    this._panel.onDidDispose(() => this.dispose());
  }

  static show(extensionUri: vscode.Uri, report: ReportData): ReportPanel {
    const key = report.contract_name;

    const existing = ReportPanel._panels.get(key);
    if (existing && !existing._disposed) {
      existing._panel.reveal(vscode.ViewColumn.One);
      return existing;
    }

    const panel = vscode.window.createWebviewPanel(
      ReportPanel.viewType,
      `${report.contract_name} — Audit`,
      vscode.ViewColumn.One,
      { enableScripts: true }
    );

    const instance = new ReportPanel(panel, extensionUri);
    instance._panel.webview.html = instance._getHtml(report);
    ReportPanel._panels.set(key, instance);

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

  private _getHtml(report: ReportData): string {
    const nonce = this._nonce();
    const sev = report.severity_breakdown;
    const info = report.contract_info;

    const functionsHtml = info.functions
      .slice(0, 20)
      .map(
        (f) =>
          `<tr>
          <td><code>${this._esc(f.name)}</code></td>
          <td style="font-size:11px;color:#888">${this._esc(f.params).slice(0, 80)}</td>
          <td style="font-size:11px;color:#888">${this._esc(f.modifiers).slice(0, 60)}</td>
        </tr>`
      )
      .join("");

    const matchedHtml = report.matched_findings
      .map(
        (f) =>
          `<tr>
          <td>${this._esc(f.title).slice(0, 60)}</td>
          <td>${this._esc(f.firm)}</td>
          <td>${this._esc(f.protocol)}</td>
          <td>${this._sevBadge(f.impact)}</td>
          <td>${f.link ? `<a href="#" class="report-link" data-link="${this._escAttr(f.link)}">Open</a>` : ""}</td>
        </tr>`
      )
      .join("");

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
      max-width: 1000px;
      margin: 0 auto;
    }
    .report-header {
      border-bottom: 2px solid var(--vscode-editorWidget-border, #333);
      padding-bottom: 16px;
      margin-bottom: 24px;
    }
    .report-header h1 { font-size: 24px; margin-bottom: 8px; }
    .severity-summary {
      display: flex; gap: 12px; margin-top: 10px;
    }
    .severity-chip {
      padding: 6px 14px; border-radius: 6px;
      font-size: 13px; font-weight: 600;
    }
    .chip-high { background: rgba(220,38,38,0.15); color: #f87171; }
    .chip-medium { background: rgba(245,158,11,0.15); color: #fbbf24; }
    .chip-low { background: rgba(59,130,246,0.15); color: #60a5fa; }

    .contract-info {
      background: rgba(139,92,246,0.06);
      border: 1px solid rgba(139,92,246,0.2);
      border-radius: 8px;
      padding: 16px 20px;
      margin-bottom: 24px;
    }
    .contract-info h3 { font-size: 15px; margin-bottom: 10px; }
    .info-grid {
      display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
      gap: 8px; font-size: 13px;
    }
    .info-item { display: flex; flex-direction: column; }
    .info-label { color: var(--vscode-descriptionForeground, #888); font-size: 11px; }
    .info-value { font-weight: 600; }
    .erc-badge {
      display: inline-block; padding: 2px 8px; border-radius: 4px;
      font-size: 11px; font-weight: 600;
      background: rgba(34,197,94,0.12); color: #4ade80; margin: 2px;
    }

    .report-content h2 {
      font-size: 20px; margin: 28px 0 12px;
      border-bottom: 1px solid var(--vscode-editorWidget-border, #333);
      padding-bottom: 6px;
    }
    .report-content, .report-content * {
      color: var(--vscode-foreground, #d4d4d4);
    }
    .report-content h3 { font-size: 16px; margin: 20px 0 8px; }
    .report-content p { margin: 8px 0; font-size: 14px; }
    .report-content ul, .report-content ol { margin: 8px 0 8px 20px; font-size: 14px; }
    .report-content li { margin: 4px 0; }
    .report-content strong { color: #fbbf24; }
    .report-content pre {
      background: var(--vscode-textCodeBlock-background, #2d2d2d);
      padding: 14px 18px; border-radius: 6px; overflow-x: auto;
      font-size: 13px; line-height: 1.5; margin: 12px 0;
      border: 1px solid var(--vscode-editorWidget-border, #333);
    }
    .report-content code {
      font-family: var(--vscode-editor-font-family, 'Menlo', monospace);
      font-size: 13px;
      color: #dbeafe;
    }
    .report-content :not(pre) > code {
      background: var(--vscode-textCodeBlock-background, #2d2d2d);
      padding: 2px 6px; border-radius: 3px;
    }
    table { width: 100%; border-collapse: collapse; font-size: 12px; margin: 8px 0 16px; }
    th {
      text-align: left; padding: 6px 8px;
      border-bottom: 1px solid var(--vscode-editorWidget-border, #444);
      color: var(--vscode-descriptionForeground, #888); font-weight: 600;
    }
    td { padding: 6px 8px; border-bottom: 1px solid var(--vscode-editorWidget-border, #333); }
    a { color: var(--vscode-textLink-foreground, #4fc1ff); text-decoration: none; }
    a:hover { text-decoration: underline; }
    .sev { padding: 2px 8px; border-radius: 4px; font-size: 10px; font-weight: 700; }
    .sev-high { background: rgba(220,38,38,0.15); color: #f87171; }
    .sev-medium { background: rgba(245,158,11,0.15); color: #fbbf24; }
    .sev-low { background: rgba(59,130,246,0.15); color: #60a5fa; }

    .ref-section {
      margin-top: 32px; border-top: 2px solid var(--vscode-editorWidget-border, #333);
      padding-top: 16px;
    }
    .ref-section h2 { font-size: 16px; margin-bottom: 12px; }
  </style>
</head>
<body>
  <div class="report-header">
    <h1>${this._esc(report.contract_name)} — Security Report</h1>
    <div class="severity-summary">
      <span class="severity-chip chip-high">${sev.HIGH} High</span>
      <span class="severity-chip chip-medium">${sev.MEDIUM} Medium</span>
      <span class="severity-chip chip-low">${sev.LOW} Low</span>
      <span style="margin-left:auto;font-size:13px;color:#888">
        ${report.findings_count} findings cross-referenced
      </span>
    </div>
  </div>

  <div class="contract-info">
    <h3>Contract Analysis</h3>
    <div class="info-grid">
      <div class="info-item">
        <span class="info-label">Contract</span>
        <span class="info-value">${this._esc(info.name || "Unknown")}</span>
      </div>
      <div class="info-item">
        <span class="info-label">Lines of Code</span>
        <span class="info-value">${info.loc}</span>
      </div>
      <div class="info-item">
        <span class="info-label">Functions</span>
        <span class="info-value">${info.functions.length}</span>
      </div>
      <div class="info-item">
        <span class="info-label">External Calls</span>
        <span class="info-value">${info.external_calls.length}</span>
      </div>
      <div class="info-item">
        <span class="info-label">ERCs Detected</span>
        <span class="info-value">
          ${info.ercs_detected.length > 0 ? info.ercs_detected.map((e) => `<span class="erc-badge">${this._esc(e)}</span>`).join("") : "None"}
        </span>
      </div>
      <div class="info-item">
        <span class="info-label">Modifiers</span>
        <span class="info-value">${info.modifiers_used.join(", ") || "None"}</span>
      </div>
    </div>

    ${info.functions.length > 0 ? `
    <div style="margin-top:12px;">
      <details>
        <summary style="cursor:pointer;font-size:13px;color:#888;">Show ${info.functions.length} functions</summary>
        <table style="margin-top:8px;">
          <thead>
            <tr><th>Function</th><th>Parameters</th><th>Modifiers</th></tr>
          </thead>
          <tbody>${functionsHtml}</tbody>
        </table>
      </details>
    </div>
    ` : ""}
  </div>

  <div class="report-content">
    ${report.content_html}
  </div>

  <div class="ref-section">
    <h2>Cross-Referenced Solodit Findings</h2>
    <table>
      <thead>
        <tr><th>Finding</th><th>Firm</th><th>Protocol</th><th>Severity</th><th>Link</th></tr>
      </thead>
      <tbody>${matchedHtml}</tbody>
    </table>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    document.querySelectorAll('a.report-link').forEach((a) => {
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

  private _sevBadge(impact: string): string {
    const cls = impact === "HIGH" ? "sev-high" : impact === "MEDIUM" ? "sev-medium" : "sev-low";
    return `<span class="sev ${cls}">${this._esc(impact)}</span>`;
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
