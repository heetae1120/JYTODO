import { app, BrowserWindow, Menu, Tray, Notification, nativeImage, ipcMain, shell, dialog, powerMonitor, session } from 'electron';
import express from 'express';
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { randomBytes } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Store } from '../server/store.js';
import { createApp } from '../server/app.js';
import { DesktopAlarms } from './alarms.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const testData = !app.isPackaged && process.env.JYTODO_DESKTOP_DATA;
if (testData) app.setPath('userData', testData);
if (!app.requestSingleInstanceLock()) { app.quit(); } else {
  let window, tray, server, store, timer, quitting = false;
  let origin;
  const notifications = new Set();
  // The single-file launcher extracts its child into a temporary directory.
  // Register the original launcher, never that temporary child, for auto start.
  const loginItem = () => ({ path: process.env.PORTABLE_EXECUTABLE_FILE || process.execPath, args: [] });
  app.setAppUserModelId('com.jytodo.desktop');
  app.on('second-instance', () => showWindow());
  app.on('activate', () => showWindow());
  // Closing a window is handled below. Explicit tray/menu Exit quits completely.
  app.on('window-all-closed', () => { if (!tray) app.quit(); });
  app.on('before-quit', () => {
    quitting = true; clearInterval(timer);
    for (const notification of notifications) notification.close();
    tray?.destroy(); server?.close(); store?.close(); store = null;
  });
  function showWindow() {
    if (!window || window.isDestroyed()) return;
    if (window.isMinimized()) window.restore();
    window.show(); window.focus();
  }
  function showNotification(title, body) {
    if (!Notification.isSupported()) return;
    const notification = new Notification({ title, body, icon: join(root, 'desktop/icon.png'), silent: false });
    notifications.add(notification);
    notification.on('click', showWindow);
    notification.on('close', () => notifications.delete(notification));
    notification.on('failed', () => notifications.delete(notification));
    notification.show();
  }
  function trusted(event) {
    if (event.sender !== window?.webContents || event.senderFrame?.url?.split('/').slice(0,3).join('/') !== origin) throw new Error('허용되지 않은 요청입니다.');
  }
  app.whenReady().then(async () => {
  try {
    const dataDirectory = app.getPath('userData');
    mkdirSync(dataDirectory, { recursive: true, mode: 0o700 });
    const configPath = join(dataDirectory, 'integration.env');
    if (!existsSync(configPath)) writeFileSync(configPath, '# JYTODO integrations. Edit locally, save, then restart JYTODO. Never share this file.\nGOOGLE_CLIENT_ID=\nGOOGLE_CLIENT_SECRET=\nSLACK_WEBHOOK_URL=\n', { mode: 0o600 });
    const localConfig = parseEnv(readFileSync(configPath, 'utf8'));
    const config = {};
    // Only integration credentials can be read from this user-editable file.
    for (const name of ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'SLACK_WEBHOOK_URL']) config[name] = localConfig[name] || process.env[name] || '';
    const port = Number(process.env.JYTODO_DESKTOP_PORT || 43127);
    if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('프로그램 포트 설정을 확인해 주세요.');
    origin = `http://127.0.0.1:${port}`;
    config.APP_URL = origin;
    config.DESKTOP_API_TOKEN = randomBytes(32).toString('hex');
    config.DESKTOP_MODE = true;
    store = new Store(join(dataDirectory, 'jytodo.sqlite'));
    // Electron's network stack uses the OS proxy and supported HTTPS trust chain.
    const { net } = await import('electron');
    const { app: backend, integrations } = createApp(store, config, (url, options) => net.fetch(String(url), options));
    backend.use(express.static(join(root, 'dist')));
    backend.get('/{*path}', (req, res) => res.sendFile(join(root, 'dist/index.html')));
    server = await new Promise((resolve, reject) => {
      const listener = backend.listen(port, '127.0.0.1', () => resolve(listener));
      listener.once('error', reject);
    });
    // Attach a random per-launch API capability only to this local app's requests.
    // It never reaches the renderer or any external origin.
    session.defaultSession.webRequest.onBeforeSendHeaders({ urls: [`${origin}/*`] }, (details, callback) => {
      const headers = { ...details.requestHeaders };
      if (new URL(details.url).origin === origin) headers.Authorization = `Bearer ${config.DESKTOP_API_TOKEN}`;
      callback({ requestHeaders: headers });
    });
    session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => callback(false));
    window = new BrowserWindow({
      title: 'JYTODO', width: 1380, height: 940, minWidth: 980, minHeight: 700,
      backgroundColor: '#f6f7f9', show: false, icon: join(root, 'desktop/icon.png'),
      webPreferences: { preload: join(root, 'desktop/preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false, devTools: !app.isPackaged },
    });
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.webContents.on('will-navigate', (event, target) => {
      const url = new URL(target);
      if (url.origin === origin && url.pathname === '/api/google/connect') {
        event.preventDefault(); shell.openExternal(target);
      } else if (url.origin !== origin) event.preventDefault();
    });
    window.webContents.on('will-redirect', (event, target) => { if (new URL(target).origin !== origin) event.preventDefault(); });
    window.on('close', event => {
      if (!quitting && tray && !tray.isDestroyed()) { event.preventDefault(); window.hide(); }
    });
    const trayImage = nativeImage.createFromPath(join(root, 'desktop/icon.png')).resize({ width: 20, height: 20 });
    try {
      tray = new Tray(trayImage); tray.setToolTip('JYTODO · 예약 알림 대기 중');
      tray.setContextMenu(Menu.buildFromTemplate([
        { label: 'JYTODO 열기', click: showWindow },
        { label: '데이터·연동 설정 폴더', click: () => shell.openPath(dataDirectory) },
        { type: 'separator' }, { label: '완전히 종료', click: () => app.quit() },
      ]));
      tray.on('click', showWindow); tray.on('double-click', showWindow);
    } catch { tray = null; }
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      { label: '프로그램', submenu: [{ label: '창 숨기기', click: () => tray ? window.hide() : window.minimize() }, { label: '완전히 종료', accelerator: 'Control+Q', click: () => app.quit() }] },
      { label: '보기', submenu: [{ role: 'resetZoom', label: '기본 크기' }, { role: 'zoomIn', label: '확대' }, { role: 'zoomOut', label: '축소' }] },
      { label: '편집', submenu: [{ role:'undo',label:'실행 취소' },{ role:'redo',label:'다시 실행' },{ type:'separator' },{ role:'cut',label:'잘라내기' },{ role:'copy',label:'복사' },{ role:'paste',label:'붙여넣기' },{ role:'selectAll',label:'전체 선택' }] },
    ]));
    ipcMain.handle('desktop:settings', event => { trusted(event); return { autoLaunch: process.platform === 'win32' && app.isPackaged ? app.getLoginItemSettings(loginItem()).openAtLogin : false, autoLaunchSupported: process.platform === 'win32' && app.isPackaged, nativeNotifications: Notification.isSupported(), tray: Boolean(tray) }; });
    ipcMain.handle('desktop:auto-launch', (event, enabled) => {
      trusted(event);
      if (typeof enabled !== 'boolean' || process.platform !== 'win32' || !app.isPackaged) throw new Error('Windows 실행 파일에서 설정할 수 있습니다.');
      app.setLoginItemSettings({ openAtLogin: enabled, ...loginItem() });
      return app.getLoginItemSettings(loginItem()).openAtLogin;
    });
    ipcMain.handle('desktop:open-data-folder', event => { trusted(event); return shell.openPath(dataDirectory); });
    ipcMain.handle('desktop:test-notification', event => { trusted(event); showNotification('JYTODO 알림 확인', '예약 시간이 되면 프로그램 창과 Windows 알림으로 알려드립니다.'); return Notification.isSupported(); });
    const alarms = new DesktopAlarms(store, task => {
      showWindow();
      const date = new Intl.DateTimeFormat('ko-KR', { dateStyle:'medium', timeStyle:'short' }).format(new Date(task.dueAt));
      showNotification('JYTODO · 할 일 알림', `${task.title}\n${date}`);
    });
    await window.loadURL(origin);
    showWindow();
    const tick = () => {
      if (!store || quitting) return;
      try { alarms.tick(); } catch (error) { console.error('Desktop alarm delivery failed:', error.message); }
      integrations.deliverSlack().catch(() => {});
    };
    timer = setInterval(tick, 1000);
    powerMonitor.on('resume', tick);
    tick();
  } catch (error) {
    dialog.showErrorBox('JYTODO를 시작하지 못했습니다', error.code === 'EADDRINUSE' ? '프로그램 포트(43127)가 사용 중입니다. 이미 실행 중인 JYTODO를 확인하거나 다른 프로그램을 종료한 뒤 다시 실행해 주세요.' : error.message);
    app.quit();
  }
  });
}
