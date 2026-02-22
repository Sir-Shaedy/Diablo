/**
 * Diablo — VS Code Extension Entry Point.
 *
 * Registers the three sidebar webview panels (Dictionary, Academy, Scout),
 * the right-click context menu commands, and auto-starts the backend server.
 */

import * as vscode from "vscode";
import * as cp from "child_process";
import * as path from "path";
import { DictionaryViewProvider } from "./panels/DictionaryPanel";
import { AcademyViewProvider } from "./panels/AcademyPanel";
import { ScoutViewProvider } from "./panels/ScoutPanel";
import { FindingDetailPanel } from "./panels/FindingDetailPanel";

const BACKEND_URL = "http://127.0.0.1:8391";
const HEALTH_ENDPOINT = `${BACKEND_URL}/health`;

let backendProcess: cp.ChildProcess | null = null;
let statusBarItem: vscode.StatusBarItem;

export function activate(context: vscode.ExtensionContext) {
  // -- Status Bar ---------------------------------------------------------

  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    100
  );
  statusBarItem.text = "$(shield) Diablo";
  statusBarItem.tooltip = "Diablo Backend Status";
  statusBarItem.command = "diablo.startBackend";
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  // -- Sidebar Panels -----------------------------------------------------

  const dictionaryProvider = new DictionaryViewProvider(
    context.extensionUri,
    BACKEND_URL
  );
  const academyProvider = new AcademyViewProvider(
    context.extensionUri,
    BACKEND_URL
  );
  const scoutProvider = new ScoutViewProvider(
    context.extensionUri,
    BACKEND_URL
  );

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      "diablo.dictionaryView",
      dictionaryProvider
    ),
    vscode.window.registerWebviewViewProvider(
      "diablo.academyView",
      academyProvider
    ),
    vscode.window.registerWebviewViewProvider(
      "diablo.scoutView",
      scoutProvider
    )
  );

  // -- Commands -----------------------------------------------------------

  context.subscriptions.push(
    vscode.commands.registerCommand("diablo.lookupSelection", () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        return;
      }
      const selection = editor.document.getText(editor.selection);
      if (selection) {
        dictionaryProvider.searchFromCommand(selection);
      }
    }),

    vscode.commands.registerCommand("diablo.analyzeFile", () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        return;
      }
      const content = editor.document.getText();
      scoutProvider.analyzeFromCommand(content);
    }),

    vscode.commands.registerCommand("diablo.startBackend", () => {
      startBackend(context);
    }),

    vscode.commands.registerCommand("diablo.stopBackend", () => {
      stopBackend();
    })
  );

  // -- Selection Listener (Context-Aware Pitfall) ---------------------------
  let pitfallTimer: ReturnType<typeof setTimeout> | null = null;
  let lastPitfallSelection = "";
  let lastPitfallRequestAt = 0;
  const PITFALL_COOLDOWN_MS = 2500;

  context.subscriptions.push(
    vscode.window.onDidChangeTextEditorSelection((e) => {
      const editor = e.textEditor;
      if (!editor) {
        return;
      }

      // Only trigger for Solidity files
      const langId = editor.document.languageId;
      if (langId !== "solidity" && !editor.document.fileName.endsWith(".sol")) {
        return;
      }

      const selection = editor.document.getText(editor.selection);
      if (!selection || selection.length < 3 || selection.length > 2000) {
        return;
      }

      // Avoid re-triggering for the same selection
      if (selection === lastPitfallSelection) {
        return;
      }
      lastPitfallSelection = selection;

      // Debounce — wait 800ms of no changes before triggering
      if (pitfallTimer) {
        clearTimeout(pitfallTimer);
      }
      pitfallTimer = setTimeout(() => {
        const now = Date.now();
        if (now - lastPitfallRequestAt < PITFALL_COOLDOWN_MS) {
          return;
        }
        lastPitfallRequestAt = now;

        // Get surrounding code context (±15 lines around selection)
        const startLine = Math.max(0, editor.selection.start.line - 15);
        const endLine = Math.min(
          editor.document.lineCount - 1,
          editor.selection.end.line + 15
        );
        const surroundingRange = new vscode.Range(
          startLine,
          0,
          endLine,
          editor.document.lineAt(endLine).text.length
        );
        const surroundingCode = editor.document.getText(surroundingRange);
        const filename = editor.document.fileName.split("/").pop() || "";

        dictionaryProvider.analyzePitfall(selection, surroundingCode, filename);
      }, 800);
    })
  );

  // -- Auto-start backend -------------------------------------------------
  autoStartBackend(context);
}

export function deactivate() {
  stopBackend();
}

// ---------------------------------------------------------------------------
// Backend Process Management
// ---------------------------------------------------------------------------

async function autoStartBackend(
  context: vscode.ExtensionContext
): Promise<void> {
  // First check if backend is already running
  const isRunning = await checkHealth();
  if (isRunning) {
    setStatus("connected");
    return;
  }

  // Try to auto-start
  startBackend(context);
}

function startBackend(context: vscode.ExtensionContext): void {
  if (backendProcess) {
    vscode.window.showInformationMessage("Diablo backend is already running.");
    return;
  }

  // Find the project root (backend/ is sibling to extension/)
  const extensionRoot = context.extensionUri.fsPath;
  const projectRoot = path.resolve(extensionRoot, "..");

  setStatus("starting");

  const pythonPath = vscode.workspace
    .getConfiguration("diablo")
    .get<string>("pythonPath", "python3");

  backendProcess = cp.spawn(
    pythonPath,
    ["-m", "uvicorn", "backend.server:app", "--host", "127.0.0.1", "--port", "8391"],
    {
      cwd: projectRoot,
      env: { ...process.env },
      stdio: ["ignore", "pipe", "pipe"],
    }
  );

  const outputChannel = vscode.window.createOutputChannel("Diablo Backend");

  backendProcess.stdout?.on("data", (data: Buffer) => {
    outputChannel.appendLine(data.toString().trim());
  });

  backendProcess.stderr?.on("data", (data: Buffer) => {
    outputChannel.appendLine(data.toString().trim());
  });

  backendProcess.on("error", (err) => {
    setStatus("error");
    vscode.window
      .showErrorMessage(
        `Failed to start Diablo backend: ${err.message}. Is Python installed?`,
        "Open Output"
      )
      .then((choice) => {
        if (choice) {
          outputChannel.show();
        }
      });
    backendProcess = null;
  });

  backendProcess.on("exit", (code) => {
    if (code !== 0 && code !== null) {
      setStatus("error");
      outputChannel.appendLine(`Backend exited with code ${code}`);
    } else {
      setStatus("offline");
    }
    backendProcess = null;
  });

  // Poll for health every second, up to 15 seconds
  pollHealth(15);
}

function stopBackend(): void {
  if (backendProcess) {
    backendProcess.kill("SIGTERM");
    backendProcess = null;
    setStatus("offline");
    vscode.window.showInformationMessage("Diablo backend stopped.");
  }
}

async function checkHealth(): Promise<boolean> {
  try {
    // Use Node's built-in http for a lightweight check
    return await new Promise((resolve) => {
      const http = require("http");
      const req = http.get(HEALTH_ENDPOINT, { timeout: 2000 }, (res: any) => {
        resolve(res.statusCode === 200);
      });
      req.on("error", () => resolve(false));
      req.on("timeout", () => {
        req.destroy();
        resolve(false);
      });
    });
  } catch {
    return false;
  }
}

async function pollHealth(maxSeconds: number): Promise<void> {
  for (let i = 0; i < maxSeconds; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    const ok = await checkHealth();
    if (ok) {
      setStatus("connected");
      vscode.window.showInformationMessage("Diablo backend connected.");
      return;
    }
  }
  setStatus("error");
  vscode.window
    .showWarningMessage(
      "Diablo backend did not respond. Check the Output panel.",
      "Open Output"
    )
    .then((choice) => {
      if (choice) {
        const ch = vscode.window.createOutputChannel("Diablo Backend");
        ch.show();
      }
    });
}

function setStatus(state: "starting" | "connected" | "error" | "offline") {
  switch (state) {
    case "starting":
      statusBarItem.text = "$(sync~spin) Diablo";
      statusBarItem.tooltip = "Starting backend…";
      statusBarItem.backgroundColor = undefined;
      break;
    case "connected":
      statusBarItem.text = "$(shield) Diablo";
      statusBarItem.tooltip = "Backend connected";
      statusBarItem.backgroundColor = undefined;
      break;
    case "error":
      statusBarItem.text = "$(warning) Diablo";
      statusBarItem.tooltip = "Backend offline — click to start";
      statusBarItem.backgroundColor = new vscode.ThemeColor(
        "statusBarItem.errorBackground"
      );
      break;
    case "offline":
      statusBarItem.text = "$(circle-slash) Diablo";
      statusBarItem.tooltip = "Backend stopped — click to start";
      statusBarItem.backgroundColor = undefined;
      break;
  }
}
