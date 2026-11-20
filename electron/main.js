const { app, BrowserWindow, shell } = require('electron');
const path = require('path');
const http = require('http');

// Enforce single instance lock
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
  process.exit(0);
}

// Configuration
const PORT = process.env.PORT || 28989;
const SERVER_URL = `http://localhost:${PORT}`;
process.env.PORT = String(PORT);

try {
  const userData = app.getPath('userData');
  process.env.APP_STORAGE_DIR = app.isPackaged
    ? path.join(userData, 'storage')
    : path.join(__dirname, '..', 'storage');
} catch (_) {
  process.env.APP_STORAGE_DIR = path.join(__dirname, '..', 'storage');
}

let mainWindow = null;
let serverInstance = null;

/**
 * Wait for the backend HTTP server to become responsive before loading the window.
 */
function waitForServer(url, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    const check = () => {
      http.get(`${url}/api/health`, (res) => {
        if (res.statusCode === 200) {
          resolve(true);
        } else if (Date.now() - startTime > timeoutMs) {
          reject(new Error(`Server health check returned HTTP ${res.statusCode}`));
        } else {
          setTimeout(check, 300);
        }
      }).on('error', () => {
        if (Date.now() - startTime > timeoutMs) {
          reject(new Error(`Timeout waiting for server at ${url}`));
        } else {
          setTimeout(check, 300);
        }
      });
    };
    check();
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1080,
    minHeight: 700,
    title: 'FREE Dubber Pro',
    backgroundColor: '#080b13',
    icon: path.join(__dirname, '..', 'public', 'favicon.ico'),
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  let loadRetries = 0;
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    loadRetries++;
    if (loadRetries <= 10) {
      console.warn(`[ELECTRON] Page failed to load (${errorCode}: ${errorDescription}), retrying in 1s (${loadRetries}/10)...`);
      setTimeout(() => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.loadURL(SERVER_URL);
        }
      }, 1000);
    } else {
      mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`
        <body style="background:#080b13;color:#e2e8f0;font-family:system-ui,-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
          <div style="text-align:center;padding:30px;max-width:520px;background:#101726;border-radius:12px;border:1px solid #1e293b;box-shadow:0 10px 25px rgba(0,0,0,0.5);">
            <div style="font-size:48px;margin-bottom:12px;">⚠️</div>
            <h2 style="color:#f87171;margin:0 0 10px 0;font-size:20px;">Server Connection Error</h2>
            <p style="color:#94a3b8;font-size:14px;line-height:1.6;margin:0 0 20px 0;">Could not connect to FREE Dubber Pro backend (${errorDescription}). The server might still be initializing.</p>
            <button onclick="location.href='${SERVER_URL}'" style="padding:10px 24px;background:#3b82f6;color:#ffffff;border:none;border-radius:8px;cursor:pointer;font-weight:600;font-size:14px;">Retry Connection</button>
          </div>
        </body>
      `)}`);
    }
  });

  // Open external links (e.g. documentation, builds) in system default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http:') || url.startsWith('https:')) {
      if (!url.startsWith(SERVER_URL)) {
        shell.openExternal(url);
        return { action: 'deny' };
      }
    }
    return { action: 'allow' };
  });

  mainWindow.loadURL(SERVER_URL);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// When second instance is launched, focus on main window
app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.whenReady().then(async () => {
  try {
    const userDataPath = app.getPath('userData');
    process.env.APP_STORAGE_DIR = app.isPackaged
      ? path.join(userDataPath, 'storage')
      : path.join(__dirname, '..', 'storage');
    process.env.PORT = String(PORT);

    console.log('[ELECTRON] Starting FREE Dubber Pro Backend Server...');
    console.log('[ELECTRON] Storage directory set to:', process.env.APP_STORAGE_DIR);

    // Load Express app server
    serverInstance = require('../src/server');

    console.log('[ELECTRON] Waiting for server on', SERVER_URL);
    await waitForServer(SERVER_URL);

    console.log('[ELECTRON] Server ready, creating main window...');
    createWindow();
  } catch (err) {
    console.error('[ELECTRON:ERROR] Failed to start server:', err);
    // Still create window so error page or retry can be shown
    createWindow();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', () => {
  console.log('[ELECTRON] Cleaning up before quit...');
  if (serverInstance && typeof serverInstance.close === 'function') {
    try {
      serverInstance.close();
    } catch (_) {}
  }
});
