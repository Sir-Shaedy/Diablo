/**
 * Scout (Ghost Auditor) Sidebar Panel.
 *
 * File selector → documentation checkboxes → depth → generate report.
 * Communicates with the Python backend at POST /scout.
 */

import * as vscode from "vscode";
import { getWebviewHtml } from "../utils/webview";

export class ScoutViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "diablo.scoutView";
  private _view?: vscode.WebviewView;

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly _backendUrl: string
  ) {}

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };

    webviewView.webview.html = this._getHtml(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(async (msg) => {
      if (msg.type === "openLink") {
        vscode.env.openExternal(vscode.Uri.parse(msg.url));
      } else if (msg.type === "pickFile") {
        const uri = await vscode.window.showOpenDialog({
          canSelectMany: false,
          filters: { Solidity: ["sol"] },
        });
        if (uri && uri[0]) {
          const content = await vscode.workspace.fs.readFile(uri[0]);
          webviewView.webview.postMessage({
            type: "fileSelected",
            path: uri[0].fsPath,
            content: Buffer.from(content).toString("utf8"),
          });
        }
      } else if (msg.type === "useEditor") {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
          webviewView.webview.postMessage({
            type: "analyzeContent",
            content: editor.document.getText(),
            path: editor.document.fileName,
          });
        } else {
          vscode.window.showWarningMessage("No active editor open.");
        }
      } else if (msg.type === "openReport") {
        const { ReportPanel } = require("./ReportPanel");
        ReportPanel.show(this._extensionUri, msg.report);
      }
    });
  }

  /** Triggered by the "Diablo: Analyze Current File" command. */
  analyzeFromCommand(content: string) {
    if (this._view) {
      this._view.show(true);
      this._view.webview.postMessage({
        type: "analyzeContent",
        content,
      });
    }
  }

  private _getHtml(webview: vscode.Webview): string {
    const body = /*html*/ `
      <h2>Scout <span class="muted" style="text-transform: none; font-weight: 400;">(Ghost Auditor)</span></h2>

      <div style="margin-bottom: 8px;">
        <label class="muted">Target Contract:</label>
        <div style="display: flex; gap: 6px; margin-top: 4px;">
          <input type="text" id="filePath" placeholder="Select a .sol file…" readonly style="flex: 1;" />
          <button class="btn btn-secondary" id="pickBtn">Browse</button>
        </div>
      </div>

      <div style="margin-bottom: 8px;">
        <label class="muted">Or paste the current editor file:</label>
        <button class="btn btn-secondary" id="useEditorBtn" style="margin-top: 4px; width: 100%;">
          Use Active Editor
        </button>
      </div>

      <div class="spacer"></div>

      <div>
        <label class="muted">Analysis Depth:</label>
        <div style="display: flex; gap: 6px; margin-top: 4px;">
          <span class="pill pill-low depth-pill" data-depth="quick">Quick</span>
          <span class="pill pill-medium depth-pill active" data-depth="standard">Standard</span>
          <span class="pill pill-high depth-pill" data-depth="deep">Deep</span>
        </div>
      </div>

      <div class="spacer"></div>

      <button class="btn btn-primary" id="generateBtn" style="width: 100%;" disabled>Generate Report</button>

      <div class="spacer"></div>
      <div id="status"></div>

      <script nonce="">
        const vscode = acquireVsCodeApi();
        const BACKEND = "${this._backendUrl}";
        const filePathEl = document.getElementById("filePath");
        const generateBtn = document.getElementById("generateBtn");
        const statusEl = document.getElementById("status");
        let fileContent = "";
        let selectedDepth = "standard";

        // Depth pills
        document.querySelectorAll(".depth-pill").forEach((pill) => {
          pill.addEventListener("click", () => {
            document.querySelectorAll(".depth-pill").forEach((p) => p.classList.remove("active"));
            pill.classList.add("active");
            selectedDepth = pill.dataset.depth;
          });
        });

        // File picker
        document.getElementById("pickBtn").addEventListener("click", () => {
          vscode.postMessage({ type: "pickFile" });
        });

        // Use active editor
        document.getElementById("useEditorBtn").addEventListener("click", () => {
          vscode.postMessage({ type: "useEditor" });
        });

        // Generate report
        generateBtn.addEventListener("click", async () => {
          if (!fileContent) return;
          generateBtn.disabled = true;
          statusEl.innerHTML = '<div class="loading">Analyzing contract…<br><span class="muted">Cross-referencing with Solodit + AI synthesis (20-60s)</span></div>';

          try {
            const resp = await fetch(BACKEND + "/scout", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                file_content: fileContent,
                depth: selectedDepth,
              }),
            });

            if (!resp.ok) {
              let detail = "Backend returned " + resp.status;
              try {
                const errData = await resp.json();
                if (errData.detail) detail = errData.detail;
              } catch (_) {}
              throw new Error(detail);
            }
            const data = await resp.json();

            const sev = data.severity_breakdown || {};
            statusEl.innerHTML =
              '<div class="summary-box">Report generated.<br>' +
              '<span style="color:#f87171">' + (sev.HIGH || 0) + ' High</span> · ' +
              '<span style="color:#fbbf24">' + (sev.MEDIUM || 0) + ' Medium</span> · ' +
              '<span style="color:#60a5fa">' + (sev.LOW || 0) + ' Low</span> · ' +
              data.findings_count + ' findings</div>';
            // Open report in editor tab
            vscode.postMessage({ type: "openReport", report: data });
          } catch (err) {
            const errMsg = (err instanceof Error) ? err.message : "Cannot reach backend. Make sure backend is running.";
            statusEl.innerHTML =
              '<div class="error-msg">' + escHtml(errMsg) + '</div>';
          } finally {
            generateBtn.disabled = false;
          }
        });

        // Handle messages from extension
        window.addEventListener("message", (event) => {
          const msg = event.data;
          if (msg.type === "fileSelected") {
            filePathEl.value = msg.path.split("/").pop();
            fileContent = msg.content;
            generateBtn.disabled = false;
          } else if (msg.type === "analyzeContent") {
            filePathEl.value = (msg.path || "Active editor").split("/").pop();
            fileContent = msg.content;
            generateBtn.disabled = false;
          }
        });

        function escHtml(s) {
          const d = document.createElement("div");
          d.textContent = s || "";
          return d.innerHTML;
        }
      </script>
    `;

    return getWebviewHtml(webview, this._extensionUri, "Diablo Scout", body);
  }
}
