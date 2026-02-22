/**
 * Academy Sidebar Panel.
 *
 * Topic picker → lesson request → results displayed in editor tab.
 * Communicates with the Python backend at POST /learn.
 */

import * as vscode from "vscode";
import { getWebviewHtml } from "../utils/webview";

export class AcademyViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "diablo.academyView";
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

    webviewView.webview.onDidReceiveMessage((msg) => {
      if (msg.type === "openLink") {
        vscode.env.openExternal(vscode.Uri.parse(msg.url));
      } else if (msg.type === "openLesson") {
        const { LessonPanel } = require("./LessonPanel");
        LessonPanel.show(this._extensionUri, msg.lesson);
      }
    });
  }

  private _getHtml(webview: vscode.Webview): string {
    const body = /*html*/ `
      <h2>Academy</h2>

      <input
        type="text"
        id="topicInput"
        placeholder="What do you want to learn? (e.g. reentrancy in DEX)"
      />

      <div class="spacer"></div>

      <div style="display: flex; gap: 6px; align-items: center;">
        <select id="depthSelect" style="flex: 1;">
          <option value="quick">Quick (5 findings)</option>
          <option value="standard" selected>Standard (20 findings)</option>
          <option value="deep">Deep (50+ findings)</option>
        </select>
        <button class="btn btn-primary" id="startBtn">Learn</button>
      </div>

      <div class="spacer"></div>

      <div id="quickTopics">
        <div class="muted" style="margin-bottom: 6px;">Popular topics:</div>
        <div style="display: flex; gap: 4px; flex-wrap: wrap;">
          <span class="pill pill-high topic-pill" data-topic="reentrancy">Reentrancy</span>
          <span class="pill pill-medium topic-pill" data-topic="oracle manipulation">Oracle</span>
          <span class="pill pill-medium topic-pill" data-topic="flash loan attacks">Flash Loan</span>
          <span class="pill pill-low topic-pill" data-topic="access control vulnerabilities">Access Control</span>
          <span class="pill pill-high topic-pill" data-topic="ERC4626 vault inflation">Vault Inflation</span>
          <span class="pill pill-medium topic-pill" data-topic="price manipulation">Price Manipulation</span>
        </div>
      </div>

      <div class="spacer"></div>
      <div id="status"></div>

      <div class="spacer"></div>
      <div id="history" style="display:none;">
        <div class="muted" style="margin-bottom: 6px;">Lesson History:</div>
        <div id="historyList"></div>
      </div>

      <script nonce="">
        const vscode = acquireVsCodeApi();
        const BACKEND = "${this._backendUrl}";
        const topicInput = document.getElementById("topicInput");
        const depthSelect = document.getElementById("depthSelect");
        const startBtn = document.getElementById("startBtn");
        const statusEl = document.getElementById("status");

        // Quick topic pills
        document.querySelectorAll(".topic-pill").forEach((pill) => {
          pill.addEventListener("click", () => {
            topicInput.value = pill.dataset.topic;
          });
        });

        startBtn.addEventListener("click", () => {
          const topic = topicInput.value.trim();
          if (!topic) return;
          startLesson(topic);
        });

        topicInput.addEventListener("keydown", (e) => {
          if (e.key === "Enter") {
            const topic = topicInput.value.trim();
            if (topic) startLesson(topic);
          }
        });

        async function startLesson(topic) {
          startBtn.disabled = true;
          statusEl.innerHTML = '<div class="loading">Generating lesson on "' + escHtml(topic) + '"…<br><span class="muted">Fetching findings + AI synthesis (10-30s)</span></div>';

          try {
            const resp = await fetch(BACKEND + "/learn", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                topic,
                depth: depthSelect.value,
                quiz_count: 5,
              }),
            });

            if (!resp.ok) {
              let detail = "Backend returned " + resp.status;
              try {
                const err = await resp.json();
                if (err.detail) detail = err.detail;
              } catch (_) {}
              throw new Error(detail);
            }
            const data = await resp.json();

            if (data.finding_count === 0) {
              statusEl.innerHTML =
                '<div class="error-msg">No findings found for "' + escHtml(topic) + '". Try a different query.</div>';
            } else {
              statusEl.innerHTML =
                '<div class="summary-box">Lesson generated: ' + data.finding_count + ' findings analyzed, ' + data.quiz.length + ' quiz questions.</div>';
              // Open lesson in editor tab
              vscode.postMessage({ type: "openLesson", lesson: data });
              // Track in history
              addToHistory(topic, data.finding_count, data.depth);
            }
          } catch (err) {
            const errMsg = (err instanceof Error)
              ? err.message
              : "Cannot reach backend or AI provider.";
            statusEl.innerHTML =
              '<div class="error-msg">' + escHtml(errMsg) + '</div>';
          } finally {
            startBtn.disabled = false;
          }
        }

        function escHtml(s) {
          const d = document.createElement("div");
          d.textContent = s || "";
          return d.innerHTML;
        }

        function addToHistory(topic, findings, depth) {
          const historyEl = document.getElementById("history");
          const listEl = document.getElementById("historyList");
          historyEl.style.display = "block";
          const item = document.createElement("div");
          item.className = "finding-card low";
          item.style.cursor = "pointer";
          item.innerHTML = '<div class="title">' + topic + '</div>' +
            '<div class="meta">' + findings + ' findings · ' + depth + '</div>';
          item.addEventListener("click", () => {
            topicInput.value = topic;
            startLesson(topic);
          });
          listEl.prepend(item);
        }
      </script>
    `;

    return getWebviewHtml(webview, this._extensionUri, "Diablo Academy", body);
  }
}
