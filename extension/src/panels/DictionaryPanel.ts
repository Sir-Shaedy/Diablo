/**
 * Dictionary Sidebar Panel — Context-Aware Security Intelligence.
 *
 * Two modes:
 * 1. ACTIVE: Highlight code in .sol file → auto-triggers pitfall analysis
 *    → shows conversational "Common Pitfall" card with real audit findings
 * 2. SEARCH: Manual search input → severity filter → paginated findings
 *
 * Communicates with Python backend at POST /pitfall and POST /search.
 */

import * as vscode from "vscode";
import { getWebviewHtml } from "../utils/webview";

export class DictionaryViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "diablo.dictionaryView";
  private _view?: vscode.WebviewView;

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly _backendUrl: string
  ) {}

  /** Called by VS Code when the panel becomes visible. */
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

    // Handle messages from the webview
    webviewView.webview.onDidReceiveMessage((msg) => {
      if (msg.type === "openLink") {
        vscode.env.openExternal(vscode.Uri.parse(msg.url));
      } else if (msg.type === "viewFinding") {
        const { FindingDetailPanel } = require("./FindingDetailPanel");
        FindingDetailPanel.show(this._extensionUri, msg.finding);
      }
    });
  }

  /** Triggered by the right-click "Lookup on Solodit" command. */
  searchFromCommand(query: string) {
    if (this._view) {
      this._view.show(true);
      this._view.webview.postMessage({ type: "searchFor", query });
    }
  }

  /** Called when the user highlights code in a .sol file. */
  analyzePitfall(selection: string, surroundingCode: string, filename: string) {
    if (this._view) {
      this._view.show(true);
      this._view.webview.postMessage({
        type: "pitfallAnalyze",
        selection,
        surroundingCode,
        filename,
      });
    }
  }

  private _getHtml(webview: vscode.Webview): string {
    const body = /*html*/ `
      <style>
        /* -- Tab switcher -- */
        .tab-bar {
          display: flex; gap: 0; margin-bottom: 12px;
          border-bottom: 1px solid var(--vscode-panel-border, #333);
        }
        .tab-btn {
          flex: 1; padding: 8px 4px; text-align: center;
          background: transparent; border: none; color: var(--vscode-foreground);
          cursor: pointer; font-size: 12px; font-weight: 500;
          border-bottom: 2px solid transparent; transition: all 0.2s;
        }
        .tab-btn:hover { background: rgba(255,255,255,0.05); }
        .tab-btn.active {
          border-bottom-color: var(--vscode-focusBorder, #007fd4);
          color: var(--vscode-focusBorder, #007fd4);
        }
        .tab-content { display: none; }
        .tab-content.active { display: block; }

        /* -- Pitfall card styles -- */
        .pitfall-waiting {
          text-align: center; padding: 24px 16px;
          color: var(--muted-color, #888); font-size: 13px;
        }
        .pitfall-waiting .icon {
          width: 36px; height: 36px; margin: 0 auto 10px;
          border-radius: 50%; border: 1px solid var(--vscode-panel-border, #333);
          display: grid; place-items: center; font-size: 16px;
          color: var(--vscode-descriptionForeground, #888);
        }

        .pitfall-card {
          background: var(--vscode-editor-background);
          border: 1px solid var(--vscode-focusBorder, #007fd4);
          border-radius: 8px; overflow: hidden;
          margin-bottom: 12px;
        }
        .pitfall-alert {
          background: linear-gradient(135deg, #ff6b3520, #ff4b1520);
          padding: 10px 14px; font-weight: 600; font-size: 14px;
          border-bottom: 1px solid rgba(255,107,53,0.2);
          color: #ff8c5a;
        }
        .pitfall-body { padding: 12px 14px; font-size: 13px; line-height: 1.5; }
        .pitfall-body p { margin: 0 0 8px 0; }
        .pitfall-finding {
          background: rgba(0,0,0,0.2); border-radius: 6px;
          padding: 10px 12px; margin: 8px 0;
          border-left: 3px solid var(--vscode-focusBorder, #007fd4);
        }
        .finding-ref {
          font-size: 11px; font-weight: 600; color: #7eb8da;
          margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.3px;
        }
        .pitfall-fix {
          background: rgba(0,200,100,0.08); padding: 6px 10px;
          border-radius: 4px; margin-top: 8px; font-size: 12px;
          border-left: 3px solid #4caf50;
        }
        .pitfall-cta {
          padding: 10px 14px; font-size: 12px; font-weight: 500;
          background: rgba(0,127,212,0.08); color: #91c9e6;
          border-top: 1px solid rgba(0,127,212,0.15);
        }
        .pitfall-card pre {
          background: rgba(0,0,0,0.3); padding: 8px 10px;
          border-radius: 4px; font-size: 11px; overflow-x: auto;
          margin: 6px 0;
        }
        .pitfall-card code { font-family: var(--vscode-editor-font-family, monospace); }
        .fix-draft-wrap { margin-top: 12px; }
        .fix-draft-btn {
          width: 100%;
          padding: 8px 10px;
          border-radius: 6px;
          border: 1px solid rgba(78,201,255,0.35);
          background: rgba(78,201,255,0.1);
          color: #bfeaff;
          font-size: 12px;
          cursor: pointer;
        }
        .fix-draft-btn:hover { background: rgba(78,201,255,0.15); }
        .fix-draft-box {
          margin-top: 8px;
          border: 1px solid var(--vscode-panel-border, #333);
          background: rgba(255,255,255,0.02);
          border-radius: 8px;
          padding: 10px 12px;
          font-size: 12px;
        }
        .fix-draft-box h3 { font-size: 13px; margin: 8px 0 6px; }
        .fix-draft-box pre {
          background: rgba(0,0,0,0.25);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 6px;
          padding: 10px;
          overflow-x: auto;
        }

        /* -- Context badge -- */
        .context-badge {
          display: inline-flex; align-items: center; gap: 4px;
          background: rgba(0,127,212,0.15); color: #7eb8da;
          padding: 3px 8px; border-radius: 10px; font-size: 11px;
          margin: 2px 4px 2px 0;
        }

        /* -- Loading shimmer -- */
        @keyframes shimmer {
          0% { background-position: -200px 0; }
          100% { background-position: 200px 0; }
        }
        .pitfall-loading {
          padding: 16px;
        }
        .pitfall-loading .shimmer-line {
          height: 14px; border-radius: 4px; margin-bottom: 8px;
          background: linear-gradient(90deg, rgba(255,255,255,0.04) 25%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0.04) 75%);
          background-size: 200px 100%; animation: shimmer 1.5s infinite;
        }
        .pitfall-loading .shimmer-line:nth-child(1) { width: 80%; }
        .pitfall-loading .shimmer-line:nth-child(2) { width: 95%; }
        .pitfall-loading .shimmer-line:nth-child(3) { width: 70%; }
        .pitfall-loading .shimmer-line:nth-child(4) { width: 60%; height: 60px; }
      </style>

      <!-- Tab Bar -->
      <div class="tab-bar">
        <button class="tab-btn active" data-tab="insight">Insight</button>
        <button class="tab-btn" data-tab="search">Search</button>
      </div>

      <!-- Tab: Context Insight (Pitfall Cards) -->
      <div id="tab-insight" class="tab-content active">
        <div id="pitfallArea">
          <div class="pitfall-waiting">
            <div class="icon">i</div>
            <div><strong>Highlight code to analyze</strong></div>
            <div style="margin-top:4px;">Select a function name, pattern, or code block in a <code>.sol</code> file</div>
          </div>
        </div>
      </div>

      <!-- Tab: Manual Search -->
      <div id="tab-search" class="tab-content">
        <input
          type="text"
          id="searchInput"
          placeholder="Search Solodit… (e.g. reentrancy)"
        />

        <div class="severity-filter">
          <span class="pill pill-high active" data-severity="HIGH">HIGH</span>
          <span class="pill pill-medium active" data-severity="MEDIUM">MEDIUM</span>
          <span class="pill pill-low" data-severity="LOW">LOW</span>
          <span class="pill pill-gas" data-severity="GAS">GAS</span>
        </div>

        <div id="summaryBox" class="summary-box hidden"></div>
        <div id="results"></div>
        <div id="pagination" class="pagination hidden"></div>
        <div id="status" class="muted" style="text-align: center; margin-top: 8px;"></div>
      </div>

      <script nonce="">
        const vscode = acquireVsCodeApi();
        const BACKEND = "${this._backendUrl}";
        const pitfallArea = document.getElementById("pitfallArea");
        const resultsEl = document.getElementById("results");
        const paginationEl = document.getElementById("pagination");
        const statusEl = document.getElementById("status");
        const summaryEl = document.getElementById("summaryBox");
        const searchInput = document.getElementById("searchInput");
        let currentPage = 1;
        let lastQuery = "";
        let lastFindings = [];
        let lastPitfallInput = { selection: "", surroundingCode: "", filename: "" };

        // == Event Delegation (CSP blocks inline onclick) ====================
        document.addEventListener("click", function(e) {
          const el = e.target.closest("[data-action]");
          if (!el) return;
          const action = el.dataset.action;

          if (action === "view-finding") {
            const idx = parseInt(el.dataset.index, 10);
            const f = lastFindings[idx];
            if (f) vscode.postMessage({ type: "viewFinding", finding: f });
          }
          else if (action === "view-pitfall-finding") {
            const idx = parseInt(el.dataset.index, 10);
            const findings = pitfallArea._findings || [];
            const f = findings[idx];
            if (f) vscode.postMessage({ type: "viewFinding", finding: f });
          }
          else if (action === "page-prev") {
            if (currentPage > 1) doSearch(lastQuery, currentPage - 1);
          }
          else if (action === "page-next") {
            const tp = parseInt(el.dataset.totalPages, 10);
            if (currentPage < tp) doSearch(lastQuery, currentPage + 1);
          }
          else if (action === "generate-fix-draft") {
            doFixDraft();
          }
        });

        // -- Tab switching -----------------------------------------------------
        document.querySelectorAll(".tab-btn").forEach((btn) => {
          btn.addEventListener("click", () => {
            document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
            document.querySelectorAll(".tab-content").forEach((c) => c.classList.remove("active"));
            btn.classList.add("active");
            document.getElementById("tab-" + btn.dataset.tab).classList.add("active");
          });
        });

        // -- Severity filter pills -------------------------------------------
        document.querySelectorAll(".pill").forEach((pill) => {
          pill.addEventListener("click", () => {
            pill.classList.toggle("active");
            if (lastQuery) doSearch(lastQuery, 1);
          });
        });

        function getActiveSeverities() {
          return Array.from(document.querySelectorAll(".pill.active")).map(
            (p) => p.dataset.severity
          );
        }

        // -- Pitfall Analysis ------------------------------------------------
        let pitfallAbort = null;

        async function doPitfall(selection, surroundingCode, filename) {
          lastPitfallInput = { selection, surroundingCode, filename };
          if (pitfallAbort) pitfallAbort.abort();
          pitfallAbort = new AbortController();

          // Switch to insight tab
          document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
          document.querySelectorAll(".tab-content").forEach((c) => c.classList.remove("active"));
          document.querySelector('[data-tab="insight"]').classList.add("active");
          document.getElementById("tab-insight").classList.add("active");

          pitfallArea.innerHTML = '<div class="pitfall-loading">'
            + '<div style="font-size:12px;color:#888;margin-bottom:12px;">Analyzing: <code>' + escHtml(selection.substring(0, 60)) + '</code></div>'
            + '<div class="shimmer-line"></div>'
            + '<div class="shimmer-line"></div>'
            + '<div class="shimmer-line"></div>'
            + '<div class="shimmer-line"></div>'
            + '</div>';

          try {
            const resp = await fetch(BACKEND + "/pitfall", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ selection, surrounding_code: surroundingCode, filename }),
              signal: pitfallAbort.signal,
            });

            if (!resp.ok) {
              const err = await resp.json().catch(() => ({}));
              throw new Error(err.detail || "Backend returned " + resp.status);
            }

            const data = await resp.json();
            renderPitfall(data);
          } catch (err) {
            if (err.name === "AbortError") return;
            pitfallArea.innerHTML =
              '<div class="pitfall-waiting">'
              + '<div class="icon">!</div>'
              + '<div>' + escHtml(err.message) + '</div>'
              + '</div>';
          }
        }

        function renderPitfall(data) {
          const { has_pitfall, analysis, card_html, findings } = data;

          let html = '';

          // Context badges
          if (analysis) {
            html += '<div style="margin-bottom:10px;">';
            if (analysis.function_name) html += '<span class="context-badge">ƒ ' + escHtml(analysis.function_name) + '</span>';
            if (analysis.function_type) html += '<span class="context-badge">' + escHtml(analysis.function_type) + '</span>';
            if (analysis.protocol_type) html += '<span class="context-badge">' + escHtml(analysis.protocol_type) + '</span>';
            (analysis.risk_patterns || []).forEach(p => {
              html += '<span class="context-badge" style="background:rgba(255,100,50,0.15);color:#ff8c5a;">Risk: ' + escHtml(p) + '</span>';
            });
            html += '</div>';
          }

          if (has_pitfall && card_html) {
            html += card_html;
          } else {
            html += '<div class="pitfall-waiting">'
              + '<div class="icon">-</div>'
              + '<div><strong>No close match found</strong></div>'
              + '<div style="margin-top:4px;">No directly related audit findings were found for this exact selection.</div>'
              + '</div>';
          }

          // Show matching findings below the card (using data-action instead of onclick)
          if (findings && findings.length > 0) {
            html += '<div style="margin-top:12px;font-size:11px;color:#888;text-transform:uppercase;letter-spacing:0.5px;">Related Findings</div>';
            findings.forEach((f, i) => {
              const impact = (f.impact || "unknown").toLowerCase();
              html += '<div class="finding-card ' + impact + '" style="cursor:pointer;margin-top:6px;" data-action="view-pitfall-finding" data-index="' + i + '">';
              html += '  <div class="title" style="font-size:12px;">' + escHtml(f.title) + '</div>';
              html += '  <div class="meta">' + escHtml(f.firm_name) + ' · ' + escHtml(f.protocol_name) + '</div>';
              html += '</div>';
            });
          }

          html += '<div class="fix-draft-wrap">';
          html += '  <button class="fix-draft-btn" data-action="generate-fix-draft">Generate Fix Draft for Selection</button>';
          html += '  <div id="fixDraftArea"></div>';
          html += '</div>';

          pitfallArea.innerHTML = html;
          pitfallArea._findings = findings || [];
        }

        async function doFixDraft() {
          const fixArea = document.getElementById("fixDraftArea");
          if (!fixArea) return;
          if (!lastPitfallInput.selection) {
            fixArea.innerHTML = '<div class="error-msg">Highlight Solidity code first.</div>';
            return;
          }
          fixArea.innerHTML = '<div class="loading">Drafting patch...</div>';
          try {
            const resp = await fetch(BACKEND + "/fix-draft", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                selection: lastPitfallInput.selection,
                surrounding_code: lastPitfallInput.surroundingCode,
                filename: lastPitfallInput.filename,
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
            let refs = "";
            if (data.references && data.references.length) {
              refs = '<div style="margin-top:8px;font-size:11px;color:#9aa;">'
                + data.references.map(r => '[' + escHtml(r.id) + '] ' + escHtml(r.title)).join("<br>")
                + '</div>';
            }
            fixArea.innerHTML = '<div class="fix-draft-box">' + (data.draft_html || "") + refs + '</div>';
          } catch (err) {
            const errMsg = (err instanceof Error) ? err.message : "Failed to generate fix draft.";
            fixArea.innerHTML = '<div class="error-msg">' + escHtml(errMsg) + '</div>';
          }
        }

        // -- Search ----------------------------------------------------------
        searchInput.addEventListener("keydown", (e) => {
          if (e.key === "Enter" && searchInput.value.trim()) {
            lastQuery = searchInput.value.trim();
            doSearch(lastQuery, 1);
          }
        });

        async function doSearch(query, page) {
          currentPage = page;
          resultsEl.innerHTML = '<div class="loading">Searching…</div>';
          paginationEl.classList.add("hidden");
          summaryEl.classList.add("hidden");
          statusEl.textContent = "";

          try {
            const resp = await fetch(BACKEND + "/search", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                query,
                severity: getActiveSeverities(),
                page,
                page_size: 10,
                with_summary: page === 1,
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
            renderResults(data);
          } catch (err) {
            let errMsg = (err instanceof Error) ? err.message : "Cannot reach backend.";
            if (errMsg.toLowerCase().includes("failed to fetch")) {
              errMsg = 'Cannot reach backend at ' + BACKEND + '. Start "Diablo: Start Backend Server" and check DIABLO_PORT=8391.';
            }
            resultsEl.innerHTML =
              '<div class="error-msg">' + escHtml(errMsg) + '</div>';
          }
        }

        // -- Render search results (using data-action instead of onclick) ----
        function renderResults(data) {
          const { findings, total, page, total_pages, ai_summary } = data;

          if (ai_summary) {
            summaryEl.textContent = ai_summary;
            summaryEl.classList.remove("hidden");
          }

          if (!findings || findings.length === 0) {
            resultsEl.innerHTML = '<div class="muted">No findings found.</div>';
            return;
          }

          statusEl.textContent = total + " findings · page " + page + "/" + total_pages;
          lastFindings = findings;

          let html = "";
          findings.forEach((f, i) => {
            const impact = (f.impact || "unknown").toLowerCase();
            const stars = "★".repeat(Math.round(f.quality_score || 0));
            const tags = (f.tags || [])
              .slice(0, 3)
              .map((t) => '<span class="tag">' + t + "</span>")
              .join("");

            html += '<div class="finding-card ' + impact + '" style="cursor:pointer" data-action="view-finding" data-index="' + i + '">';
            html += '  <div class="title">' + escHtml(f.title) + "</div>";
            html += '  <div class="meta">';
            html += "    " + escHtml(f.firm_name) + " · " + escHtml(f.protocol_name);
            html += '    <span class="quality-stars"> ' + stars + "</span>";
            html += "  </div>";
            if (tags) html += '  <div class="tags">' + tags + "</div>";
            html += "</div>";
          });

          resultsEl.innerHTML = html;

          // Pagination (using data-action instead of onclick)
          if (total_pages > 1) {
            let pg = '<button data-action="page-prev"' + (page <= 1 ? " disabled" : "") + '>← Prev</button>';
            pg += "<span>" + page + " / " + total_pages + "</span>";
            pg += '<button data-action="page-next" data-total-pages="' + total_pages + '"' + (page >= total_pages ? " disabled" : "") + '>Next →</button>';
            paginationEl.innerHTML = pg;
            paginationEl.classList.remove("hidden");
          }
        }

        function escHtml(s) {
          const d = document.createElement("div");
          d.textContent = s || "";
          return d.innerHTML;
        }

        // -- Handle messages from extension -----------------------------------
        window.addEventListener("message", (event) => {
          const msg = event.data;
          if (msg.type === "searchFor") {
            document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
            document.querySelectorAll(".tab-content").forEach((c) => c.classList.remove("active"));
            document.querySelector('[data-tab="search"]').classList.add("active");
            document.getElementById("tab-search").classList.add("active");
            searchInput.value = msg.query;
            lastQuery = msg.query;
            doSearch(msg.query, 1);
          } else if (msg.type === "pitfallAnalyze") {
            doPitfall(msg.selection, msg.surroundingCode, msg.filename);
          }
        });
      </script>
    `;

    return getWebviewHtml(webview, this._extensionUri, "Diablo Dictionary", body);
  }
}
