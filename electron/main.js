/**
 * Electron main process for Rule #1 Investor
 *
 * On launch:
 *   1. Starts FastAPI backend (uvicorn) if port 8000 is not already listening
 *   2. Starts Next.js dev server if port 3000 is not already listening
 *   3. Waits for both to be ready
 *   4. Opens a BrowserWindow at http://localhost:3000
 *   5. Kills spawned children on quit
 */

const { app, BrowserWindow, shell, Menu, nativeImage } = require("electron");
const { spawn } = require("child_process");
const path = require("path");
const http = require("http");
const net = require("net");

// ── Child processes spawned by us ────────────────────────────
let backendProcess = null;
let frontendProcess = null;
let mainWindow = null;

// ── Helpers ───────────────────────────────────────────────────

/**
 * Check whether a TCP port is already listening (no connection made to it).
 */
function isPortListening(port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ port, host: "127.0.0.1" });
    socket.once("connect", () => { socket.destroy(); resolve(true); });
    socket.once("error", () => { socket.destroy(); resolve(false); });
  });
}

/**
 * Verify a port is serving HTTP (Next.js / FastAPI) — not just TCP open.
 * Returns true if we get any HTTP response (even 404).
 */
function isHttpUp(port, path_ = "/", timeoutMs = 3000) {
  return new Promise((resolve) => {
    const req = http.get(
      { hostname: "127.0.0.1", port, path: path_, timeout: timeoutMs },
      (res) => { res.resume(); resolve(true); }
    );
    req.on("error", () => resolve(false));
    req.on("timeout", () => { req.destroy(); resolve(false); });
  });
}

/**
 * Poll a port until it accepts connections or timeout expires.
 */
function waitForPort(port, timeoutMs = 90_000) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    const poll = () => {
      isHttpUp(port).then((up) => {
        if (up) return resolve();
        if (Date.now() >= deadline) return reject(new Error(`Port ${port} not ready after ${timeoutMs}ms`));
        setTimeout(poll, 800);
      });
    };
    poll();
  });
}

// ── Process launchers ─────────────────────────────────────────

function startBackend() {
  const cwd = path.join(__dirname, "..", "backend");
  // Use `python -m uvicorn` so it picks up the virtualenv if active
  backendProcess = spawn(
    "python",
    ["-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "8000"],
    { cwd, shell: true, stdio: "inherit" }
  );
  backendProcess.on("error", (err) =>
    console.error("[Electron] Backend spawn error:", err.message)
  );
  backendProcess.on("exit", (code) => {
    if (code !== 0) console.warn("[Electron] Backend exited with code", code);
  });
  console.log("[Electron] Backend process started (PID", backendProcess.pid, ")");
}

function startFrontend() {
  const cwd = path.join(__dirname, "..", "frontend");
  frontendProcess = spawn("npm", ["run", "dev", "--", "--port", "3000"], {
    cwd,
    shell: true,
    stdio: "inherit",
    env: { ...process.env, PORT: "3000" },
  });
  frontendProcess.on("error", (err) =>
    console.error("[Electron] Frontend spawn error:", err.message)
  );
  console.log("[Electron] Frontend process started (PID", frontendProcess.pid, ")");
}

// ── BrowserWindow ─────────────────────────────────────────────

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1024,
    minHeight: 680,
    backgroundColor: "#09090b", // matches Tailwind zinc-950
    show: false,
    title: "Rule #1 Investor",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
    },
  });

  // Open all <a target="_blank"> links in the default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.loadURL("http://localhost:3000");

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
    mainWindow.focus();
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  // Minimal menu (removes default Electron menu clutter)
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: "App",
        submenu: [
          { label: "Reload", accelerator: "CmdOrCtrl+R", click: () => mainWindow?.reload() },
          { label: "DevTools", accelerator: "CmdOrCtrl+Shift+I", click: () => mainWindow?.webContents.toggleDevTools() },
          { type: "separator" },
          { label: "Quit", accelerator: "CmdOrCtrl+Q", click: () => app.quit() },
        ],
      },
    ])
  );
}

// ── Loading overlay window ────────────────────────────────────

function createLoadingWindow() {
  const win = new BrowserWindow({
    width: 420,
    height: 260,
    frame: false,
    resizable: false,
    center: true,
    backgroundColor: "#09090b",
    webPreferences: { nodeIntegration: true, contextIsolation: false },
  });
  win.loadURL(`data:text/html,
    <html>
    <head>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          background: #09090b; color: #fafafa;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          display: flex; flex-direction: column;
          align-items: center; justify-content: center;
          height: 100vh; gap: 20px;
          -webkit-app-region: drag;
        }
        .logo { font-size: 2rem; font-weight: 800; letter-spacing: -1px; }
        .logo span { color: #3b82f6; }
        .sub { font-size: 0.8rem; color: #71717a; letter-spacing: 0.05em; text-transform: uppercase; }
        .spinner {
          width: 32px; height: 32px;
          border: 3px solid #27272a;
          border-top-color: #3b82f6;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        .status { font-size: 0.75rem; color: #52525b; }
      </style>
    </head>
    <body>
      <div class="logo">Rule <span>#1</span> Investor</div>
      <div class="sub">R1 Screener Edition</div>
      <div class="spinner"></div>
      <div class="status" id="s">Starting services…</div>
      <script>
        const { ipcRenderer } = require('electron');
        ipcRenderer.on('status', (_, msg) => document.getElementById('s').textContent = msg);
      </script>
    </body>
    </html>
  `);
  return win;
}

// ── App lifecycle ─────────────────────────────────────────────

app.whenReady().then(async () => {
  const loadingWin = createLoadingWindow();
  const send = (msg) => {
    console.log("[Electron]", msg);
    if (!loadingWin.isDestroyed()) loadingWin.webContents.send("status", msg);
  };

  try {
    // Backend
    const backendUp = await isHttpUp(8000, "/scanner/patterns");
    if (!backendUp) {
      send("Starting backend…");
      startBackend();
      send("Waiting for backend (port 8000)…");
      await waitForPort(8000, 60_000);
    } else {
      send("Backend already running ✓");
    }

    // Frontend — check HTTP, not just TCP (avoids false positive when
    // a rogue process holds port 3000 but isn't Next.js)
    const frontendUp = await isHttpUp(3000);
    if (!frontendUp) {
      // Also kill any leftover .next/dev/lock so Next.js can start cleanly
      const { execSync } = require("child_process");
      try {
        const lockPath = path.join(__dirname, "..", "frontend", ".next", "dev", "lock");
        const fs = require("fs");
        if (fs.existsSync(lockPath)) fs.unlinkSync(lockPath);
      } catch (_) {}

      send("Starting frontend…");
      startFrontend();
      send("Waiting for frontend (port 3000)…");
      await waitForPort(3000, 90_000);
    } else {
      send("Frontend already running ✓");
    }

    send("Opening app…");
    await new Promise((r) => setTimeout(r, 400)); // brief pause for smoothness

    createWindow();
    if (!loadingWin.isDestroyed()) loadingWin.close();
  } catch (err) {
    send("Error: " + err.message);
    console.error("[Electron] Startup failed:", err);
    // Keep loading window open for the user to see the error
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on("will-quit", () => {
  // Kill child processes we own (don't kill externally-started servers)
  if (backendProcess && !backendProcess.killed) {
    console.log("[Electron] Stopping backend process…");
    backendProcess.kill();
  }
  if (frontendProcess && !frontendProcess.killed) {
    console.log("[Electron] Stopping frontend process…");
    frontendProcess.kill();
  }
});
