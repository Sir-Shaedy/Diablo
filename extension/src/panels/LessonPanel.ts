/**
 * Lesson Panel — Full-width editor tab displaying AI-generated lessons.
 *
 * Rich HTML content with embedded quizzes, Solidity code examples,
 * and interactive answer checking.
 */

import * as vscode from "vscode";

export interface LessonData {
  topic: string;
  depth: string;
  finding_count: number;
  content_html: string;
  quiz: QuizData[];
  sources: SourceData[];
}

interface QuizData {
  question: string;
  code_snippet: string;
  options: string[];
  correct_index: number;
  explanation: string;
}

interface SourceData {
  title: string;
  firm: string;
  protocol: string;
  impact: string;
  link: string;
}

export class LessonPanel {
  public static readonly viewType = "diablo.lessonView";
  private static _panels: Map<string, LessonPanel> = new Map();
  private readonly _panel: vscode.WebviewPanel;
  private _disposed = false;

  private constructor(
    panel: vscode.WebviewPanel,
    private readonly _extensionUri: vscode.Uri
  ) {
    this._panel = panel;
    this._panel.onDidDispose(() => this.dispose());
  }

  static show(extensionUri: vscode.Uri, lesson: LessonData): LessonPanel {
    const key = lesson.topic;

    const existing = LessonPanel._panels.get(key);
    if (existing && !existing._disposed) {
      existing._panel.reveal(vscode.ViewColumn.One);
      return existing;
    }

    const panel = vscode.window.createWebviewPanel(
      LessonPanel.viewType,
      `${lesson.topic}`,
      vscode.ViewColumn.One,
      { enableScripts: true }
    );

    const instance = new LessonPanel(panel, extensionUri);
    instance._panel.webview.html = instance._getHtml(lesson);
    LessonPanel._panels.set(key, instance);

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

  private _getHtml(lesson: LessonData): string {
    const nonce = this._nonce();
    const sourcesHtml = lesson.sources
      .map(
        (s) =>
          `<tr>
            <td style="font-weight:600">${this._esc(s.title).slice(0, 60)}</td>
            <td>${this._esc(s.firm)}</td>
            <td>${this._esc(s.protocol)}</td>
            <td>${this._severityBadge(s.impact)}</td>
            <td>${s.link ? `<a href="#" class="source-link" data-link="${this._escAttr(s.link)}">Open</a>` : ""}</td>
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
      max-width: 960px;
      margin: 0 auto;
    }

    /* Header */
    .lesson-header {
      border-bottom: 2px solid var(--vscode-editorWidget-border, #333);
      padding-bottom: 16px;
      margin-bottom: 24px;
    }
    .lesson-header h1 {
      font-size: 24px;
      margin-bottom: 8px;
    }
    .lesson-meta {
      display: flex;
      gap: 16px;
      font-size: 13px;
      color: var(--vscode-descriptionForeground, #888);
    }
    .lesson-meta .badge {
      display: inline-block;
      padding: 2px 10px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 600;
    }
    .badge-quick { background: rgba(59,130,246,0.15); color: #60a5fa; }
    .badge-standard { background: rgba(245,158,11,0.15); color: #fbbf24; }
    .badge-deep { background: rgba(220,38,38,0.15); color: #f87171; }

    /* Content */
    .lesson-content h2 {
      font-size: 20px;
      margin: 28px 0 12px;
      color: var(--vscode-foreground);
      border-bottom: 1px solid var(--vscode-editorWidget-border, #333);
      padding-bottom: 6px;
    }
    .lesson-content h3 {
      font-size: 16px;
      margin: 20px 0 8px;
      color: var(--vscode-foreground);
    }
    .lesson-content p { margin: 8px 0; font-size: 14px; }
    .lesson-content ul, .lesson-content ol {
      margin: 8px 0 8px 20px;
      font-size: 14px;
    }
    .lesson-content li { margin: 4px 0; }
    .lesson-content strong { color: #fbbf24; }

    /* Code blocks — !important overrides AI-generated inline styles */
    pre, .lesson-content pre, .quiz-question pre {
      background: #1e1e2e !important;
      color: #cdd6f4 !important;
      padding: 14px 18px !important;
      border-radius: 6px;
      overflow-x: auto;
      font-size: 13px;
      line-height: 1.5;
      margin: 12px 0;
      border: 1px solid var(--vscode-editorWidget-border, #333) !important;
    }
    code, .lesson-content code, .quiz-question code {
      font-family: var(--vscode-editor-font-family, 'Menlo', monospace);
      font-size: 13px;
      color: #cdd6f4 !important;
    }
    .lesson-content pre *, .quiz-question pre *, .lesson-content code * {
      color: #cdd6f4 !important;
      background: transparent !important;
    }
    .lesson-content :not(pre) > code {
      background: #1e1e2e !important;
      color: #cdd6f4 !important;
      padding: 2px 6px;
      border-radius: 3px;
    }

    /* Quiz */
    .quiz-question {
      background: rgba(139,92,246,0.06);
      border: 1px solid rgba(139,92,246,0.2);
      border-radius: 8px;
      padding: 16px 20px;
      margin: 16px 0;
    }
    .lesson-content .quiz-question,
    .lesson-content .quiz-question * {
      color: var(--vscode-foreground, #d4d4d4) !important;
      background-image: none !important;
    }
    .lesson-content .quiz-question pre,
    .lesson-content .quiz-question code {
      color: #cdd6f4 !important;
    }
    .quiz-question h4, .quiz-question p:first-child {
      font-size: 14px;
      font-weight: 600;
      margin-bottom: 10px;
    }
    .quiz-option {
      display: block;
      padding: 8px 14px;
      margin: 4px 0;
      border-radius: 6px;
      border: 1px solid var(--vscode-editorWidget-border, #444);
      cursor: pointer;
      transition: all 0.15s;
      font-size: 13px;
      color: var(--vscode-foreground, #d4d4d4) !important;
      background: rgba(255,255,255,0.03) !important;
    }
    .quiz-option:hover {
      border-color: var(--vscode-focusBorder, #007acc);
      background: rgba(0,122,204,0.08);
    }
    .quiz-option.correct {
      border-color: #22c55e;
      background: rgba(34,197,94,0.12);
    }
    .quiz-option.incorrect {
      border-color: #ef4444;
      background: rgba(239,68,68,0.08);
    }
    .quiz-option.disabled {
      pointer-events: none;
      opacity: 0.7;
    }
    .quiz-explanation {
      display: none;
      margin-top: 10px;
      padding: 10px 14px;
      background: rgba(139,92,246,0.08);
      border-radius: 6px;
      font-size: 13px;
      line-height: 1.6;
    }
    .quiz-explanation.visible { display: block; }

    /* Quiz score */
    .quiz-score-bar {
      background: rgba(139,92,246,0.1);
      border: 1px solid rgba(139,92,246,0.3);
      border-radius: 8px;
      padding: 12px 16px;
      margin: 16px 0;
      text-align: center;
      font-size: 14px;
      font-weight: 600;
    }
    .quiz-score-bar .score-num {
      font-size: 28px;
      color: #a78bfa;
    }
    .quiz-score-bar .score-label {
      font-size: 12px;
      color: var(--vscode-descriptionForeground, #888);
      margin-top: 4px;
    }
    .quiz-progress {
      height: 6px; border-radius: 3px;
      background: rgba(255,255,255,0.08);
      margin-top: 8px; overflow: hidden;
    }
    .quiz-progress-fill {
      height: 100%; border-radius: 3px;
      background: linear-gradient(90deg, #a78bfa, #22c55e);
      transition: width 0.4s ease;
    }

    /* Sources table */
    .sources-section {
      margin-top: 32px;
      border-top: 2px solid var(--vscode-editorWidget-border, #333);
      padding-top: 16px;
    }
    .sources-section h2 {
      font-size: 16px;
      margin-bottom: 12px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
    }
    th {
      text-align: left;
      padding: 6px 8px;
      border-bottom: 1px solid var(--vscode-editorWidget-border, #444);
      color: var(--vscode-descriptionForeground, #888);
      font-weight: 600;
    }
    td {
      padding: 6px 8px;
      border-bottom: 1px solid var(--vscode-editorWidget-border, #333);
    }
    a {
      color: var(--vscode-textLink-foreground, #4fc1ff);
      text-decoration: none;
    }
    a:hover { text-decoration: underline; }

    /* Severity badges */
    .sev { padding: 2px 8px; border-radius: 4px; font-size: 10px; font-weight: 700; }
    .sev-high { background: rgba(220,38,38,0.15); color: #f87171; }
    .sev-medium { background: rgba(245,158,11,0.15); color: #fbbf24; }
    .sev-low { background: rgba(59,130,246,0.15); color: #60a5fa; }
  </style>
</head>
<body>
  <div class="lesson-header">
    <h1>${this._esc(lesson.topic)}</h1>
    <div class="lesson-meta">
      <span class="badge badge-${lesson.depth}">${lesson.depth.toUpperCase()}</span>
      <span>${lesson.finding_count} real findings analyzed</span>
      <span>${lesson.quiz.length} quiz questions</span>
    </div>
  </div>

  <div class="lesson-content">
    ${lesson.content_html}
  </div>

  <div class="sources-section">
    <h2>Source Findings</h2>
    <table>
      <thead>
        <tr>
          <th>Finding</th>
          <th>Firm</th>
          <th>Protocol</th>
          <th>Severity</th>
          <th>Link</th>
        </tr>
      </thead>
      <tbody>
        ${sourcesHtml}
      </tbody>
    </table>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    document.querySelectorAll('a.source-link').forEach((a) => {
      a.addEventListener('click', (e) => {
        e.preventDefault();
        const url = a.dataset.link;
        if (url) vscode.postMessage({ type: 'openLink', url });
      });
    });

    // Interactive quiz with score tracking
    let totalQuiz = document.querySelectorAll('.quiz-question').length;
    let answered = 0;
    let correctCount = 0;

    // Create score bar
    const scoreBar = document.createElement('div');
    scoreBar.className = 'quiz-score-bar';
    scoreBar.style.display = 'none';
    scoreBar.innerHTML = '<div class="score-num">0 / ' + totalQuiz + '</div><div class="score-label">Questions answered</div><div class="quiz-progress"><div class="quiz-progress-fill" style="width:0%"></div></div>';
    const firstQ = document.querySelector('.quiz-question');
    if (firstQ && firstQ.parentNode) firstQ.parentNode.insertBefore(scoreBar, firstQ);
    if (totalQuiz > 0) scoreBar.style.display = 'block';

    document.querySelectorAll('.quiz-question').forEach((q) => {
      const correctIdx = parseInt(q.dataset.correct || '0');
      const options = q.querySelectorAll('.quiz-option');
      const explanation = q.querySelector('.quiz-explanation');

      options.forEach((opt, idx) => {
        opt.addEventListener('click', () => {
          // Disable all options
          options.forEach(o => o.classList.add('disabled'));

          answered++;
          if (idx === correctIdx) {
            opt.classList.add('correct');
            correctCount++;
          } else {
            opt.classList.add('incorrect');
            if (options[correctIdx]) options[correctIdx].classList.add('correct');
          }

          if (explanation) explanation.classList.add('visible');

          // Update score bar
          const pct = Math.round((answered / totalQuiz) * 100);
          scoreBar.querySelector('.score-num').textContent = correctCount + ' / ' + totalQuiz;
          if (answered === totalQuiz) {
            const grade = Math.round((correctCount / totalQuiz) * 100);
            scoreBar.querySelector('.score-label').textContent = 'Quiz complete! Score: ' + grade + '%';
            if (grade < 60) scoreBar.querySelector('.score-label').textContent += ' Review the material above';
          } else {
            scoreBar.querySelector('.score-label').textContent = answered + ' of ' + totalQuiz + ' answered';
          }
          scoreBar.querySelector('.quiz-progress-fill').style.width = pct + '%';
        });
      });
    });
  </script>
</body>
</html>`;
  }

  private _severityBadge(impact: string): string {
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
