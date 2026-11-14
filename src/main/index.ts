/*
 * Filename: index.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { app, BrowserWindow, screen, session } from "electron";
import { join } from "node:path";
import { CONTRACT_VERSION } from "../core/contracts/index.js";
import { createRouter } from "./ipc/router.js";
import { CSP, isAppUrl, secureWebPreferences } from "./security.js";
import { MIN_SIZE, resolveBounds } from "./window-bounds.js";
import { WindowState } from "./window-state.js";
import { ipcMain } from "electron";

app.setName("mind");
// Tests (and `--user-data-dir`-style setups) isolate the profile through this variable.
const userDataOverride = process.env["MIND_USER_DATA_DIR"];
if (userDataOverride) app.setPath("userData", userDataOverride);

const devServerUrl = process.env["ELECTRON_RENDERER_URL"];
let mainWindow: BrowserWindow | null = null;

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
      responseHeaders: { ...details.responseHeaders, "Content-Security-Policy": [CSP] },
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
    const state = new WindowState();
    const dispatch = createRouter({
      "window:getState": () => ({ route: state.lastRoute, contractVersion: CONTRACT_VERSION }),
      "window:setLastRoute": ({ route }) => {
        state.lastRoute = route;
        return {};
      },
    });
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
}
