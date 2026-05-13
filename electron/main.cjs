const { app, BrowserWindow, Menu, ipcMain, dialog, shell } = require("electron");
const fs = require("node:fs/promises");
const path = require("node:path");

// 显式启用高 DPI 支持，让 Chromium 在 Windows/Mac 高分屏上按 deviceScaleFactor 渲染锐利的位图
app.commandLine.appendSwitch("high-dpi-support", "1");
// Windows 上让字体走 DirectWrite 的「medium」hinting，避免默认 none 在 1x 屏出现轻微发糊
app.commandLine.appendSwitch("font-render-hinting", "medium");

const isDev = !app.isPackaged;
const devServerUrl = process.env.TIDECANVAS_DEV_SERVER_URL || "http://127.0.0.1:3000";
const shouldUseDevServer =
  isDev &&
  process.env.npm_lifecycle_event !== "electron:preview" &&
  process.env.TIDECANVAS_LOAD_DIST !== "1";

const closeConfirmPendingWindows = new WeakSet();
const confirmedCloseWindows = new WeakSet();

function getWindowFromEvent(event) {
  return BrowserWindow.fromWebContents(event.sender);
}

function resolveSavePath(targetPath) {
  const downloadsPath = app.getPath("downloads");
  const rawPath = String(targetPath || "").trim();

  if (!rawPath) {
    return path.join(downloadsPath, `tidecanvas-${Date.now()}`);
  }

  if (path.isAbsolute(rawPath)) {
    return rawPath;
  }

  const segments = rawPath.split(/[\\/]+/).filter(Boolean);
  if (segments[0]?.toLowerCase() === "downloads") {
    segments.shift();
  }

  const candidate = path.resolve(downloadsPath, ...segments);
  const relative = path.relative(downloadsPath, candidate);

  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    return path.join(downloadsPath, path.basename(rawPath));
  }

  return candidate;
}

ipcMain.handle("tidecanvas-get-default-download-path", async () => {
  return app.getPath("downloads");
});

ipcMain.handle("tidecanvas-select-directory", async (event) => {
  const targetWindow = getWindowFromEvent(event);
  const result = await dialog.showOpenDialog(targetWindow, {
    properties: ["openDirectory", "createDirectory"],
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  return result.filePaths[0];
});

ipcMain.handle("tidecanvas-save-file", async (_event, targetPath, data) => {
  try {
    const resolvedPath = resolveSavePath(targetPath);
    const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
    await fs.mkdir(path.dirname(resolvedPath), { recursive: true });
    await fs.writeFile(resolvedPath, buffer);
    return true;
  } catch (error) {
    console.error("[TideCanvas] Failed to save file:", error);
    return false;
  }
});

ipcMain.handle("tidecanvas-request-url", async (_event, payload) => {
  const controller = new AbortController();
  const timeout = Number(payload?.timeout || 60000);
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const method = String(payload?.method || "GET").toUpperCase();
    const headers = payload?.headers && typeof payload.headers === "object" ? { ...payload.headers } : {};
    const requestOptions = {
      method,
      headers,
      signal: controller.signal,
    };

    if (method !== "GET" && method !== "HEAD" && payload?.body) {
      if (payload?.isFormData) {
        const formData = new FormData();
        for (const entry of payload.body.entries || []) {
          if (entry.kind === "file") {
            const bytes = Buffer.from(entry.data || []);
            const blob = new Blob([bytes], { type: entry.type || "application/octet-stream" });
            formData.append(entry.key, blob, entry.name || "file");
          } else {
            formData.append(entry.key, String(entry.value ?? ""));
          }
        }
        requestOptions.body = formData;
      } else if (typeof payload.body === "string") {
        requestOptions.body = payload.body;
      } else {
        requestOptions.body = JSON.stringify(payload.body);
      }
    }

    const response = await fetch(payload.url, requestOptions);
    const text = await response.text();

    return {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      text,
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      statusText: error?.name === "AbortError" ? "AbortError" : "RequestError",
      text: error instanceof Error ? error.message : "Network request failed.",
    };
  } finally {
    clearTimeout(timeoutId);
  }
});

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1440,
    height: 940,
    minWidth: 1024,
    minHeight: 680,
    backgroundColor: "#f8fafc",
    title: "TideCanvas",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      zoomFactor: 1.0,
    },
  });

  mainWindow.setMenu(null);
  mainWindow.setMenuBarVisibility(false);

  mainWindow.on("close", async (event) => {
    if (confirmedCloseWindows.has(mainWindow)) {
      return;
    }

    event.preventDefault();
    if (closeConfirmPendingWindows.has(mainWindow)) {
      return;
    }

    closeConfirmPendingWindows.add(mainWindow);

    try {
      const { response } = await dialog.showMessageBox(mainWindow, {
        type: "question",
        buttons: ["取消", "退出"],
        defaultId: 0,
        cancelId: 0,
        noLink: true,
        title: "退出 TideCanvas",
        message: "确认要退出 TideCanvas 吗？",
        detail: "未保存的更改将会丢失。",
      });

      if (response === 1) {
        confirmedCloseWindows.add(mainWindow);
        mainWindow.close();
      }
    } finally {
      closeConfirmPendingWindows.delete(mainWindow);
    }
  });

  mainWindow.webContents.on("before-input-event", (event, input) => {
    const key = input.key.toLowerCase();
    const isDevToolsShortcut =
      input.key === "F12" ||
      (key === "i" && input.control && input.shift) ||
      (key === "i" && input.meta && input.alt);

    if (!isDevToolsShortcut) {
      return;
    }

    event.preventDefault();
    if (mainWindow.webContents.isDevToolsOpened()) {
      mainWindow.webContents.closeDevTools();
      return;
    }

    mainWindow.webContents.openDevTools({ mode: "detach" });
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  if (shouldUseDevServer) {
    mainWindow.loadURL(devServerUrl);
    return;
  }

  mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
