/*
 * Filename: index.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { logLevel, parseLogLevel, setLogLevel } from "../core/logging.js";
import { app, BrowserWindow, dialog, screen, session } from "electron";
import { join } from "node:path";
import { createCore } from "../core/index.js";
import { scriptedCardProvider } from "../core/llm/scripted.js";
import { installFileLog } from "./log-file.js";
import { installLogRedaction } from "../core/redaction.js";
import type { Core } from "../core/index.js";
import { createEmbedWorker } from "./embed-worker.js";
import { FakeEmbedder } from "../core/retrieval/fake-embedder.js";
import { extractWithWorker } from "./extract-worker.js";
import { createHandlers } from "./ipc/handlers.js";
import { createRouter } from "./ipc/router.js";
import { DEV_CSP, isAppUrl, secureWebPreferences } from "./security.js";
import { MIN_SIZE, resolveBounds } from "./window-bounds.js";
import { WindowState } from "./window-state.js";
import { ipcMain } from "electron";

app.setName("mind");
// Tests (and `--user-data-dir`-style setups) isolate the profile through this variable.
const userDataOverride = process.env["MIND_USER_DATA_DIR"];
if (userDataOverride) app.setPath("userData", userDataOverride);

const devServerUrl = process.env["ELECTRON_RENDERER_URL"];
let mainWindow: BrowserWindow | null = null;
let core: Core | null = null;
let uninstallRedaction: (() => void) | null = null;

function createWindow(state: WindowState): BrowserWindow {
  const saved = state.saved;
  const { size, position } = resolveBounds(
    saved.bounds,
    screen.getAllDisplays().map((display) => display.bounds),
  );
  const window = new BrowserWindow({
    ...size,
    ...(position ?? {}),
    minWidth: MIN_SIZE.width,
    minHeight: MIN_SIZE.height,
    show: false,
    title: "MIND",
    webPreferences: secureWebPreferences(join(import.meta.dirname, "../preload/index.cjs")),
  });
  if (!position) window.center();
  if (saved.maximized) window.maximize();
  window.once("ready-to-show", () => window.show());
  window.on("close", () => {
    state.saveGeometry(window.getNormalBounds(), window.isMaximized());
  });
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event, url) => {
    if (!isAppUrl(url, devServerUrl)) event.preventDefault();
  });
  if (devServerUrl) {
    void window.loadURL(devServerUrl);
  } else {
    void window.loadFile(join(import.meta.dirname, "../renderer/index.html"));
  }
  return window;
}

function hardenSession(): void {
  const { defaultSession } = session;
  defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  defaultSession.setPermissionCheckHandler(() => false);
  if (!devServerUrl) return;
  // Files are covered by the CSP meta tag; this header covers any http response in development.
  defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: { ...details.responseHeaders, "Content-Security-Policy": [DEV_CSP] },
    });
  });
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
    mainWindow.webContents.send("window:focus-requested");
  });

  void app.whenReady().then(() => {
    hardenSession();
    const log = installFileLog(join(app.getPath("userData"), "logs", "mind.log"));
    setLogLevel(parseLogLevel(process.env["MIND_LOG_LEVEL"], "info"));
    log(
      `MIND ${app.getVersion()} started (electron ${process.versions.electron}, log level ${logLevel()})`,
    );
    process.on("uncaughtException", (error) => console.error("uncaught exception", error));
    process.on("unhandledRejection", (reason) => console.error("unhandled rejection", reason));
    const state = new WindowState();
    core = createCore({
      dataDir: process.env["MIND_DATA_DIR"] ?? app.getPath("userData"),
      extract: extractWithWorker,
      tessdataDir: join(app.getPath("userData"), "cache", "tessdata"),
      modelsDir: join(app.getPath("userData"), "cache", "models"),
      // Offline end-to-end runs use a model-free embedder; a packaged app downloads the real one.
      ...(process.env["MIND_E2E_FAKE_LLM"] === "1" &&
      process.env["MIND_E2E_REAL_EMBEDDINGS"] !== "1" &&
      !app.isPackaged
        ? { embedder: new FakeEmbedder({ ready: false }) }
        : { createEmbedWorker }),
      // Offline end-to-end runs only; a packaged app always talks to the real provider.
      ...(process.env["MIND_E2E_FAKE_LLM"] === "1" && !app.isPackaged
        ? { provider: scriptedCardProvider() }
        : {}),
      onTimeEvent: (event) => {
        mainWindow?.webContents.send("time:changed", event);
      },
      onJobEvent: (event) => {
        mainWindow?.webContents.send(`job:${event.type}`, event);
      },
    });
    uninstallRedaction = installLogRedaction(core.llm.secrets);
    const dispatch = createRouter(
      createHandlers(core, state, {
        appVersion: app.getVersion(),
        pickSavePath: async (defaultName) => {
          const options = {
            defaultPath: join(app.getPath("documents"), defaultName),
            filters: [{ name: "Backup do MIND", extensions: ["zip"] }],
          };
          const result = mainWindow
            ? await dialog.showSaveDialog(mainWindow, options)
            : await dialog.showSaveDialog(options);
          return result.canceled || !result.filePath ? null : result.filePath;
        },
        pickBackup: async () => {
          const options = {
            properties: ["openFile"] as "openFile"[],
            filters: [{ name: "Backup do MIND", extensions: ["zip"] }],
          };
          const result = mainWindow
            ? await dialog.showOpenDialog(mainWindow, options)
            : await dialog.showOpenDialog(options);
          return result.canceled ? null : (result.filePaths[0] ?? null);
        },
        pickFiles: async () => {
          const options = {
            properties: ["openFile", "multiSelections"] as ("openFile" | "multiSelections")[],
            filters: [
              { name: "Materiais", extensions: ["pdf", "docx", "md", "markdown", "txt"] },
              { name: "Todos os arquivos", extensions: ["*"] },
            ],
          };
          const result = mainWindow
            ? await dialog.showOpenDialog(mainWindow, options)
            : await dialog.showOpenDialog(options);
          return result.canceled ? [] : result.filePaths;
        },
      }),
    );
    ipcMain.handle("mind:invoke", (_event, channel: unknown, payload: unknown) =>
      dispatch(channel, payload),
    );
    mainWindow = createWindow(state);
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) mainWindow = createWindow(state);
    });
  });

  app.on("window-all-closed", () => {
    app.quit();
  });

  let closing = false;
  app.on("before-quit", (event) => {
    if (!core || closing) return;
    // Close the databases and stop the jobs before the process goes away.
    event.preventDefault();
    closing = true;
    uninstallRedaction?.();
    const closing_ = core.close();
    core = null;
    void closing_.finally(() => app.quit());
  });
}
