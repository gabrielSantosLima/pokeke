import { app, BrowserWindow, ipcMain, shell } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStaticServer } from '../server/http.mjs';
import { RoomManager, discoverRooms } from '../server/room-server.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

let window = null;
let httpServer = null;
let rooms = null;

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

async function createWindow() {
  httpServer = await startHttpServer();
  rooms = new RoomManager();
  rooms.attach(httpServer);

  ipcMain.handle('app:info', () => ({
    version: app.getVersion(),
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

  window = new BrowserWindow({
    width: 1440,
    height: 1000,
    minWidth: 900,
    minHeight: 620,
    backgroundColor: '#07110d',
    autoHideMenuBar: true,
    title: 'Pokeke',
    icon: path.join(root, 'build', 'icon.png'),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  window.once('ready-to-show', () => window.show());
  window.loadURL(`http://127.0.0.1:${httpServer.address().port}/`);
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  window.on('closed', () => {
    window = null;
  });
}

app.setName('Pokeke');

app.whenReady().then(() => {
  createWindow().catch((error) => {
    console.error('[pokeke] falha ao iniciar:', error);
    app.quit();
  });
});

app.on('window-all-closed', () => {
  rooms?.shutdown();
  httpServer?.close();
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  rooms?.shutdown();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
