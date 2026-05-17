const { app, BrowserWindow, Menu, ipcMain, dialog, shell, protocol, net } = require("electron");
const { pathToFileURL } = require("node:url");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const { spawn } = require("node:child_process");
const crypto = require("node:crypto");

// 显式启用高 DPI 支持，让 Chromium 在 Windows/Mac 高分屏上按 deviceScaleFactor 渲染锐利的位图
app.commandLine.appendSwitch("high-dpi-support", "1");
// Windows 上让字体走 DirectWrite 的「medium」hinting，避免默认 none 在 1x 屏出现轻微发糊
app.commandLine.appendSwitch("font-render-hinting", "medium");

// 自定义 protocol：tide-media://<absolute-windows-path-with-forward-slashes>
// renderer 用 <video src="tide-media:///F:/cluade/TideCanvas/work-img/concat-xxx.mp4"> 即可加载本地文件
// 必须在 app.whenReady() 前用 registerSchemesAsPrivileged 标记为 standard/secure/支持流，
// 否则 video 元素会拒绝该协议（CSP/range request/跨 origin 等问题）
protocol.registerSchemesAsPrivileged([
  { scheme: "tide-media", privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, bypassCSP: true, corsEnabled: true } },
]);

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

// 主进程取图（绕开渲染进程 CORS），返回 data:image/...;base64,... 形式
ipcMain.handle("tidecanvas-fetch-image-as-dataurl", async (_event, url) => {
  try {
    if (!url || typeof url !== "string") return { ok: false, error: "invalid url" };
    const res = await fetch(url, { method: "GET" });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const buf = Buffer.from(await res.arrayBuffer());
    const ct = res.headers.get("content-type") || "image/png";
    const dataUrl = `data:${ct};base64,${buf.toString("base64")}`;
    return { ok: true, dataUrl, size: buf.length, contentType: ct };
  } catch (error) {
    return { ok: false, error: error?.message || String(error) };
  }
});

// === 视频拼接（ffmpeg-static）===
// 入参: { urls: string[], outputDir?: string, outputName?: string }
// 流程: 下载 URL → 写到临时目录 → ffmpeg concat demuxer 重编码 → 输出到目标
// 返回: { ok, outputPath?, error? }
let _ffmpegPathCache = null;
function resolveFfmpegPath() {
  if (_ffmpegPathCache !== null) return _ffmpegPathCache;
  // 优先 @ffmpeg-installer/ffmpeg（走 npm registry，无需 GitHub 代理）
  try {
    const mod = require("@ffmpeg-installer/ffmpeg");
    if (mod && typeof mod.path === "string" && mod.path) {
      console.log("[ffmpeg] using @ffmpeg-installer/ffmpeg:", mod.path);
      _ffmpegPathCache = mod.path;
      return mod.path;
    }
  } catch (e) { /* fallthrough */ }
  // 备选：ffmpeg-static（导出的是路径字符串）
  try {
    const p = require("ffmpeg-static");
    if (typeof p === "string" && p) {
      console.log("[ffmpeg] using ffmpeg-static:", p);
      _ffmpegPathCache = p;
      return p;
    }
  } catch (e) { /* fallthrough */ }
  _ffmpegPathCache = "";
  return "";
}

async function downloadToFile(url, destPath) {
  if (url.startsWith("file://")) {
    // file:// 本地文件，直接复制
    const localPath = decodeURIComponent(url.replace(/^file:\/\//, "").replace(/^\/(?=[A-Za-z]:)/, ""));
    await fs.copyFile(localPath, destPath);
    return;
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`下载失败 ${res.status}: ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await fs.writeFile(destPath, buf);
}

function runFfmpeg(ffmpegPath, args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath, args, { windowsHide: true });
    let stderr = "";
    proc.stderr.on("data", chunk => { stderr += chunk.toString(); });
    proc.on("error", err => reject(err));
    proc.on("close", code => {
      if (code === 0) resolve({ stderr });
      else reject(new Error(`ffmpeg exit ${code}\n${stderr.slice(-2000)}`));
    });
  });
}

ipcMain.handle("tidecanvas-concat-videos", async (_event, payload) => {
  const ffmpegPath = resolveFfmpegPath();
  if (!ffmpegPath) {
    return { ok: false, error: "ffmpeg binary 未找到。请安装：npm install @ffmpeg-installer/ffmpeg" };
  }

  const urls = Array.isArray(payload?.urls) ? payload.urls.filter(u => typeof u === "string" && u) : [];
  if (urls.length < 2) {
    return { ok: false, error: "至少需要 2 段视频才能拼接" };
  }

  const jobId = crypto.randomBytes(6).toString("hex");
  const tmpDir = path.join(os.tmpdir(), `tidecanvas-concat-${jobId}`);
  // 输出目录：开发期用项目根/work-img（方便查看），生产期降级到 userData/work-img（asar 不可写）
  const defaultOutputDir = app.isPackaged
    ? path.join(app.getPath("userData"), "work-img")
    : path.join(__dirname, "..", "work-img");
  const outputDir = String(payload?.outputDir || "").trim() || defaultOutputDir;
  const outputName = String(payload?.outputName || "").trim() || `concat-${jobId}.mp4`;
  const outputPath = path.isAbsolute(outputName)
    ? outputName
    : path.join(outputDir, outputName.endsWith(".mp4") ? outputName : `${outputName}.mp4`);
  console.log("[concat] outputDir =", outputDir);
  console.log("[concat] outputPath =", outputPath);

  try {
    await fs.mkdir(tmpDir, { recursive: true });
    await fs.mkdir(path.dirname(outputPath), { recursive: true });

    // 1. 下载所有视频到临时目录
    const localFiles = [];
    for (let i = 0; i < urls.length; i++) {
      const ext = ".mp4"; // 简化处理；ffmpeg 不靠扩展名识别格式
      const localPath = path.join(tmpDir, `seg-${i}${ext}`);
      console.log(`[concat] downloading #${i}:`, urls[i].slice(0, 80));
      await downloadToFile(urls[i], localPath);
      localFiles.push(localPath);
    }

    // 2. 写 concat list 文件
    // 不同源视频参数（分辨率/帧率/codec）大概率不一致，必须重编码，不能用 concat demuxer + -c copy
    // 改用 concat filter（filter_complex）拼接同时统一参数
    const inputs = [];
    localFiles.forEach(f => { inputs.push("-i", f); });

    // 构造 filter_complex: [0:v:0][0:a:0?][1:v:0][1:a:0?]...concat=n=N:v=1:a=1[v][a]
    // 简化版：要求每段都有视频流，音频用 0? 可选（如果某段无音频会报错，先按都有音频处理）
    const n = localFiles.length;
    const streams = [];
    for (let i = 0; i < n; i++) streams.push(`[${i}:v:0][${i}:a:0]`);
    const filter = `${streams.join("")}concat=n=${n}:v=1:a=1[outv][outa]`;

    const args = [
      "-y",
      ...inputs,
      "-filter_complex", filter,
      "-map", "[outv]",
      "-map", "[outa]",
      "-c:v", "libx264",
      "-preset", "veryfast",
      "-crf", "20",
      "-pix_fmt", "yuv420p",
      "-c:a", "aac",
      "-b:a", "192k",
      "-movflags", "+faststart",
      outputPath,
    ];

    console.log("[concat] ffmpeg", ffmpegPath, args.join(" "));
    try {
      await runFfmpeg(ffmpegPath, args);
    } catch (e) {
      // 重试：可能某段视频无音频流。退化为纯视频拼接。
      console.warn("[concat] 带音频拼接失败，退化为纯视频:", e.message.slice(0, 300));
      const streamsV = [];
      for (let i = 0; i < n; i++) streamsV.push(`[${i}:v:0]`);
      const filterV = `${streamsV.join("")}concat=n=${n}:v=1:a=0[outv]`;
      const argsV = [
        "-y",
        ...inputs,
        "-filter_complex", filterV,
        "-map", "[outv]",
        "-c:v", "libx264",
        "-preset", "veryfast",
        "-crf", "20",
        "-pix_fmt", "yuv420p",
        "-movflags", "+faststart",
        outputPath,
      ];
      await runFfmpeg(ffmpegPath, argsV);
    }

    return { ok: true, outputPath };
  } catch (error) {
    console.error("[concat] failed:", error);
    return { ok: false, error: error?.message || String(error) };
  } finally {
    // 清理临时目录
    fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
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
    // undici 的 "fetch failed" 一般会把真实原因放在 error.cause（含 code / errno / hostname）
    const cause = error && error.cause ? error.cause : null;
    const causeMsg = cause
      ? `${cause.code || cause.errno || cause.name || ""} ${cause.message || ""} ${cause.hostname ? `(host: ${cause.hostname})` : ""}`.trim()
      : "";
    const baseMsg = error instanceof Error ? error.message : "Network request failed.";
    const finalMsg = causeMsg ? `${baseMsg} | ${causeMsg}` : baseMsg;
    console.error("[main] requestUrl failed:", {
      url: payload && payload.url,
      method: payload && payload.method,
      message: baseMsg,
      cause: cause ? { code: cause.code, errno: cause.errno, hostname: cause.hostname, message: cause.message } : null,
    });
    return {
      ok: false,
      status: 0,
      statusText: error?.name === "AbortError" ? "AbortError" : "RequestError",
      text: finalMsg,
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
  // 注册 tide-media:// → 本地文件，流式 + 支持 Range（video 元素的 seek 依赖 Range）
  protocol.handle("tide-media", async (request) => {
    try {
      // URL 形如 tide-media:///F:/cluade/TideCanvas/work-img/concat-xxx.mp4
      const parsed = new URL(request.url);
      let filePath = decodeURIComponent(parsed.pathname);
      // Windows 下 pathname 会以 / 开头：'/F:/cluade/.../x.mp4'，去掉前导 / 得到绝对路径
      if (/^\/[A-Za-z]:\//.test(filePath)) filePath = filePath.slice(1);
      const fileUrl = pathToFileURL(filePath).toString();
      return await net.fetch(fileUrl, { headers: request.headers });
    } catch (e) {
      console.error("[tide-media] handler error:", e);
      return new Response(`tide-media error: ${e?.message || e}`, { status: 500 });
    }
  });

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
