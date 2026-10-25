const { app, BrowserWindow, Menu, Tray, nativeImage, shell, ipcMain } = require('electron');
const crypto = require('node:crypto');
const http = require('node:http');
const path = require('node:path');

const DEVELOPMENT_URL = process.env.ELECTRON_RENDERER_URL;
const APP_ID = 'com.todoenorden.desktop';
const DESKTOP_AUTH_PORT = 42813;
const WEB_LOGIN_URL = process.env.TODO_WEB_LOGIN_URL ?? 'http://localhost:8100/login';
const API_URL = process.env.TODO_API_URL ?? 'http://127.0.0.1:8080/api/v1';

let mainWindow;
let tray;
let quitting = false;
let authServer;
let authTimeout;

app.setAppUserModelId(APP_ID);

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => showMainWindow());
}

function applicationIconPath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'assets', 'icon.png');
  }
  return path.join(__dirname, '..', '..', 'frontend', 'src', 'assets', 'icon', 'favicon.png');
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    title: 'Todo en Orden',
    width: 1280,
    height: 820,
    minWidth: 940,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#0b0f17',
    icon: applicationIconPath(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.setMenuBarVisibility(false);
  mainWindow.once('ready-to-show', () => mainWindow?.show());

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    const rendererUrl = DEVELOPMENT_URL ?? 'app://todo-en-orden';
    if (url.startsWith(rendererUrl) || url.startsWith('file://')) return;
    event.preventDefault();
    void shell.openExternal(url);
  });

  mainWindow.on('close', (event) => {
    if (quitting) return;
    event.preventDefault();
    mainWindow?.hide();
  });

  mainWindow.on('closed', () => {
    mainWindow = undefined;
  });

  if (DEVELOPMENT_URL) {
    void mainWindow.loadURL(DEVELOPMENT_URL);
  } else {
    void mainWindow.loadFile(path.join(process.resourcesPath, 'renderer', 'index.html'));
  }
}

function createTray() {
  const image = nativeImage.createFromPath(applicationIconPath()).resize({ width: 20, height: 20 });
  tray = new Tray(image);
  tray.setToolTip('Todo en Orden');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Abrir Todo en Orden', click: () => showMainWindow() },
    { type: 'separator' },
    {
      label: 'Actualizar agenda',
      click: () => {
        showMainWindow();
        mainWindow?.webContents.send('desktop:refresh-agenda');
      },
    },
    { type: 'separator' },
    {
      label: 'Salir',
      click: () => {
        quitting = true;
        app.quit();
      },
    },
  ]));
  tray.on('click', () => showMainWindow());
}

function showMainWindow() {
  if (!mainWindow) createMainWindow();
  if (mainWindow?.isMinimized()) mainWindow.restore();
  mainWindow?.show();
  mainWindow?.focus();
}

function stopAuthServer() {
  if (authTimeout) clearTimeout(authTimeout);
  authTimeout = undefined;
  authServer?.close();
  authServer = undefined;
}

async function startBrowserLogin() {
  stopAuthServer();
  const nonce = crypto.randomBytes(32).toString('hex');

  await new Promise((resolve, reject) => {
    authServer = http.createServer((request, response) => {
      const requestUrl = new URL(request.url ?? '/', `http://127.0.0.1:${DESKTOP_AUTH_PORT}`);
      const allowedOrigin = 'http://localhost:8100';
      response.setHeader('Access-Control-Allow-Origin', allowedOrigin);
      response.setHeader('Vary', 'Origin');

      if (request.method === 'OPTIONS') {
        response.writeHead(204, {
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        });
        response.end();
        return;
      }

      if (request.method !== 'POST' || requestUrl.pathname !== '/session' || requestUrl.searchParams.get('nonce') !== nonce) {
        response.writeHead(404).end();
        return;
      }

      let body = '';
      request.setEncoding('utf8');
      request.on('data', (chunk) => {
        body += chunk;
        if (body.length > 100_000) request.destroy();
      });
      request.on('end', () => {
        try {
          const session = JSON.parse(body);
          if (!session?.token || !session?.user?.id || !session?.user?.email) throw new Error('Sesión incompleta');
          mainWindow?.webContents.send('desktop:auth-session', session);
          showMainWindow();
          response.writeHead(200, { 'Content-Type': 'application/json' });
          response.end(JSON.stringify({ ok: true }));
          setTimeout(() => stopAuthServer(), 250);
        } catch {
          response.writeHead(400, { 'Content-Type': 'application/json' });
          response.end(JSON.stringify({ ok: false }));
        }
      });
    });
    authServer.once('error', reject);
    authServer.listen(DESKTOP_AUTH_PORT, '127.0.0.1', resolve);
  });

  authTimeout = setTimeout(() => stopAuthServer(), 5 * 60_000);
  const loginUrl = new URL(WEB_LOGIN_URL);
  loginUrl.searchParams.set('desktop', '1');
  loginUrl.searchParams.set('port', String(DESKTOP_AUTH_PORT));
  loginUrl.searchParams.set('nonce', nonce);
  await shell.openExternal(loginUrl.toString());
}

async function apiRequest(_event, request) {
  const method = String(request?.method ?? 'GET').toUpperCase();
  const allowedMethods = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);
  const requestPath = String(request?.path ?? '');
  if (!allowedMethods.has(method) || !requestPath.startsWith('/') || requestPath.includes('://')) {
    throw new Error('Solicitud de API no permitida.');
  }

  const headers = { Accept: 'application/json' };
  if (request?.token) headers.Authorization = `Bearer ${request.token}`;
  if (request?.body !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch(`${API_URL}${requestPath}`, {
    method,
    headers,
    body: request?.body === undefined ? undefined : JSON.stringify(request.body),
  });
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { message: text };
  }
  return { ok: response.ok, status: response.status, body };
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  ipcMain.handle('desktop:start-google-login', () => startBrowserLogin());
  ipcMain.handle('desktop:api-request', apiRequest);
  createMainWindow();
  createTray();
});

app.on('activate', () => showMainWindow());

app.on('before-quit', () => {
  quitting = true;
  stopAuthServer();
});

app.on('window-all-closed', () => {
  // La aplicación permanece en la bandeja para recordatorios y sincronización.
});
