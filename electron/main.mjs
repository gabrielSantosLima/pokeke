import { app, BrowserWindow, ipcMain, shell } from 'electron';
import electronUpdater from 'electron-updater';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createStaticServer } from '../server/http.mjs';
import { RoomManager, discoverRooms } from '../server/room-server.mjs';
import { isNewerVersion, isUpdaterSupported, resolveChannel } from './update-helpers.mjs';

const { autoUpdater } = electronUpdater;
const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const packageJson = require('../package.json');

const CHANNELS = {
  development: {
    name: 'Pokeke Dev',
    appUserModelId: 'Pokeke.Dev',
    userData: 'Pokeke-dev',
    icon: 'icon.png',
  },
  beta: {
    name: 'Pokeke Beta',
    appUserModelId: 'Pokeke.Beta',
    userData: 'Pokeke-beta',
    icon: 'icon.png',
  },
  production: {
    name: 'Pokeke',
    appUserModelId: 'Pokeke',
    userData: 'Pokeke',
    icon: 'icon.png',
  },
};

const APP_CHANNEL = resolveChannel({
  requested: process.env.POKEKE_CHANNEL,
  packageChannel: packageJson.channel,
  isPackaged: app.isPackaged,
  version: app.getVersion(),
});
const channelConfig = CHANNELS[APP_CHANNEL];
const RELEASES_URL = 'https://github.com/gabrielSantosLima/pokeke/releases';
const LATEST_RELEASE_API = 'https://api.github.com/repos/gabrielSantosLima/pokeke/releases/latest';
const ALL_RELEASES_API = 'https://api.github.com/repos/gabrielSantosLima/pokeke/releases?per_page=20';
const UPDATE_INTERVAL_MS = 6 * 60 * 60 * 1000;
const UPDATE_START_DELAY_MS = 4000;

app.setName(channelConfig.name);
app.setPath('userData', path.join(app.getPath('appData'), channelConfig.userData));

let window = null;
let httpServer = null;
let rooms = null;
let updateTimer = null;
let updateState = {
  state: 'idle',
  version: null,
  percent: 0,
  error: null,
  canInstall: false,
  manual: false,
  channel: APP_CHANNEL,
};

async function startHttpServer() {
  // A stable origin keeps localStorage (tutorial flag) across app launches.
  const preferred = Number(process.env.POKEKE_PORT) || 47821;
  for (let offset = 0; offset < 5; offset += 1) {
    try {
      return await createStaticServer({ root, port: preferred + offset, host: '0.0.0.0' });
    } catch (error) {
      if (error.code !== 'EADDRINUSE') throw error;
    }
  }
  return createStaticServer({ root, port: 0, host: '0.0.0.0' });
}

function sendUpdateState() {
  if (window && !window.isDestroyed()) {
    window.webContents.send('update:status', updateState);
  }
}

function setUpdateState(patch) {
  updateState = { ...updateState, ...patch };
  sendUpdateState();
}

function updaterSupported() {
  return isUpdaterSupported({
    channel: APP_CHANNEL,
    isPackaged: app.isPackaged,
    platform: process.platform,
    env: process.env,
  });
}

function applyUpdaterSettings() {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowPrerelease =
    APP_CHANNEL === 'beta' || app.getVersion().includes('-');
}

async function checkGithubLatest() {
  try {
    setUpdateState({ state: 'checking', error: null, manual: true });
    const url = APP_CHANNEL === 'beta' ? ALL_RELEASES_API : LATEST_RELEASE_API;
    const response = await fetch(url, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'Pokeke',
      },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    const releases = Array.isArray(payload) ? payload : [payload];
    const release = releases.find((entry) => !entry.draft && entry.tag_name);
    const latest = release ? String(release.tag_name).replace(/^v/, '') : '';
    if (latest && isNewerVersion(latest, app.getVersion())) {
      setUpdateState({
        state: 'available',
        version: latest,
        manual: true,
        error: null,
        canInstall: false,
      });
    } else {
      setUpdateState({ state: 'idle', version: null, manual: true, error: null });
    }
  } catch (error) {
    setUpdateState({ state: 'error', error: error.message, manual: true });
  }
}

async function runUpdateCheck() {
  if (APP_CHANNEL === 'development') return;
  if (updaterSupported()) {
    try {
      await autoUpdater.checkForUpdates();
    } catch (error) {
      setUpdateState({ state: 'error', error: error.message });
    }
  } else if (app.isPackaged) {
    await checkGithubLatest();
  }
}

function setupUpdater() {
  const supported = updaterSupported();
  updateState = { ...updateState, manual: !supported };
  if (!app.isPackaged || APP_CHANNEL === 'development') return;

  if (supported) {
    applyUpdaterSettings();
    autoUpdater.on('checking-for-update', () => setUpdateState({ state: 'checking', error: null }));
    autoUpdater.on('update-available', (info) =>
      setUpdateState({
        state: 'available',
        version: info.version,
        manual: false,
        error: null,
        canInstall: false,
      }),
    );
    autoUpdater.on('update-not-available', () =>
      setUpdateState({
        state: 'idle',
        version: null,
        percent: 0,
        error: null,
        canInstall: false,
      }),
    );
    autoUpdater.on('download-progress', (progress) =>
      setUpdateState({
        state: 'downloading',
        percent: Math.round(progress.percent || 0),
      }),
    );
    autoUpdater.on('update-downloaded', (info) =>
      setUpdateState({
        state: 'downloaded',
        version: info.version,
        percent: 100,
        canInstall: true,
        error: null,
      }),
    );
    autoUpdater.on('error', (error) =>
      setUpdateState({ state: 'error', error: error.message, canInstall: false }),
    );
  }

  setTimeout(runUpdateCheck, UPDATE_START_DELAY_MS);
  updateTimer = setInterval(runUpdateCheck, UPDATE_INTERVAL_MS);
}

let ipcRegistered = false;

function registerIpc() {
  if (ipcRegistered) return;
  ipcRegistered = true;

  ipcMain.handle('app:info', () => ({
    name: app.getName(),
    version: app.getVersion(),
    channel: APP_CHANNEL,
    platform: process.platform,
    electron: process.versions.electron,
    port: httpServer.address().port,
  }));

  ipcMain.handle('lan:discover', () => discoverRooms({ timeoutMs: 1400 }));

  ipcMain.handle('room:create', (_event, config) => rooms.create(config || {}));
  ipcMain.handle('room:close', () => {
    rooms.closeRoom(true);
    return true;
  });
  ipcMain.handle('room:lobby', () => rooms.getLobby());

  ipcMain.handle('update:getState', () => updateState);
  ipcMain.handle('update:check', async () => {
    await runUpdateCheck();
    return updateState;
  });
  ipcMain.handle('update:install', () => {
    if (updateState.canInstall && updaterSupported()) autoUpdater.quitAndInstall();
  });
  ipcMain.handle('update:openRelease', () => shell.openExternal(RELEASES_URL));
}

async function createWindow() {
  if (!httpServer) {
    httpServer = await startHttpServer();
    rooms = new RoomManager();
    rooms.attach(httpServer);
  }
  registerIpc();

  window = new BrowserWindow({
    width: 1440,
    height: 1000,
    minWidth: 900,
    minHeight: 620,
    fullscreen: true,
    fullscreenable: true,
    backgroundColor: '#07110d',
    autoHideMenuBar: true,
    title: channelConfig.name,
    icon: path.join(root, 'build', channelConfig.icon),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  window.once('ready-to-show', () => {
    window.show();
    sendUpdateState();
  });
  window.loadURL(`http://127.0.0.1:${httpServer.address().port}/`);
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  window.on('closed', () => {
    window = null;
  });
}

app.whenReady().then(() => {
  app.setAppUserModelId(channelConfig.appUserModelId);
  createWindow()
    .then(() => setupUpdater())
    .catch((error) => {
      console.error('[pokeke] failed to start:', error);
      app.quit();
    });
});

app.on('window-all-closed', () => {
  if (process.platform === 'darwin') return;
  rooms?.shutdown();
  httpServer?.close();
  httpServer = null;
  rooms = null;
  clearInterval(updateTimer);
  app.quit();
});

app.on('before-quit', () => {
  rooms?.shutdown();
  httpServer?.close();
  clearInterval(updateTimer);
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
