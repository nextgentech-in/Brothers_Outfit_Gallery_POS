const { app, BrowserWindow, Menu, net, safeStorage, session, shell } = require('electron');
const { readFile, writeFile, rm } = require('node:fs/promises');
const path = require('node:path');
const { mkdtempSync } = require('node:fs');
const { tmpdir } = require('node:os');

const origin = 'https://brothers-outfit-gallery-pos.vercel.app';
const routes = new Set(['/', '/login', '/enroll', '/pos', '/dashboard', '/products',
  '/inventory', '/orders', '/customers', '/credit', '/whatsapp', '/suppliers', '/reports', '/security', '/sync']);
const types = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html',
  '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.csv': 'text/csv', '.webmanifest': 'application/manifest+json' };
const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const csp = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' https: data:; connect-src 'self'; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'";
const smoke = !app.isPackaged && process.argv.includes('--desktop-smoke');
let simulateUnreachableApi = false;
if (smoke) app.setPath('userData', mkdtempSync(path.join(tmpdir(), 'brothers-pos-smoke-')));

if (!app.requestSingleInstanceLock()) app.quit();
else {
  let window;
  app.on('second-instance', () => { if (window?.isMinimized()) window.restore(); window?.focus(); });
  app.on('window-all-closed', () => app.quit());
  app.whenReady().then(async () => {
    const browser = session.fromPartition('persist:brothers-pos');
    const root = app.isPackaged ? path.join(process.resourcesPath, 'pos-ui') : path.join(__dirname, '..', 'dist');
    const offlineIdentity = path.join(app.getPath('userData'), 'offline-identity');
    let canSaveIdentity = true;

    await browser.protocol.handle('https', async request => {
      const url = new URL(request.url);
      if (url.origin !== origin) {
        if (request.method !== 'GET' || request.destination !== 'image') return new Response(null, { status: 403 });
        return net.fetch(url.href, { credentials: 'omit', bypassCustomProtocolHandlers: true });
      }
      if (url.pathname.startsWith('/api/')) {
        if (url.pathname === '/api/desktop/status') return json({ desktop: true });
        const isIdentity = url.pathname === '/api/auth/me';
        if (url.pathname === '/api/auth/logout' || url.pathname === '/api/auth/login') {
          canSaveIdentity = false;
          await rm(offlineIdentity, { force: true });
        }
        let response;
        try {
          if (simulateUnreachableApi) throw new Error('Simulated offline connection');
          response = await browser.fetch(request, {
            credentials: 'include', redirect: 'manual', bypassCustomProtocolHandlers: true,
            signal: AbortSignal.timeout(request.method === 'GET' ? 8_000 : 90_000)
          });
        } catch {
          if (url.pathname === '/api/auth/logout') {
            await browser.cookies.remove(origin, '__Host-bo_session');
            return json({ success: true });
          }
          if (isIdentity && safeStorage.isEncryptionAvailable()) {
            try {
              const [cookie] = await browser.cookies.get({ url: origin, name: '__Host-bo_session' });
              const saved = JSON.parse(safeStorage.decryptString(await readFile(offlineIdentity)));
              if (cookie && saved.cookie === cookie.value && saved.until > Date.now()) {
                return json({ ...saved.identity, desktopOffline: true, offlineUntil: saved.until });
              }
            } catch { /* Offline access requires a recent successful sign-in. */ }
          }
          return json({ error: 'POS server unavailable. Check the connection and try again.', desktopOffline: true }, 503);
        }
        if (url.pathname === '/api/auth/login' && response.ok) canSaveIdentity = true;
        if (isIdentity && response.status === 401) await rm(offlineIdentity, { force: true });
        if (isIdentity && response.ok && canSaveIdentity && safeStorage.isEncryptionAvailable()) {
          try {
            const [cookie] = await browser.cookies.get({ url: origin, name: '__Host-bo_session' });
            const identity = await response.clone().json();
            if (cookie && identity.uid && canSaveIdentity) {
              const until = Math.min(Date.now() + 8 * 3600_000, (cookie.expirationDate || 0) * 1000);
              await writeFile(offlineIdentity, safeStorage.encryptString(JSON.stringify({ identity, until, cookie: cookie.value })));
            }
          } catch { /* Online access still works when local storage is unavailable. */ }
        }
        return response;
      }
      if (request.method !== 'GET') return new Response(null, { status: 405 });
      const file = routes.has(url.pathname) ? 'index.html' : url.pathname.slice(1);
      if (!/^(assets\/[\w.-]+\.(js|css|svg|jpg)|favicon\.svg|storefront\.jpg|purchase-template\.csv|manifest\.webmanifest|index\.html)$/.test(file)) {
        return new Response(null, { status: 404 });
      }
      try {
        return new Response(await readFile(path.join(root, file)), {
          headers: { 'Content-Type': types[path.extname(file)], 'Content-Security-Policy': csp, 'X-Content-Type-Options': 'nosniff' }
        });
      } catch { return new Response(null, { status: 404 }); }
    });
    browser.setPermissionRequestHandler((_content, _permission, callback) => callback(false));
    browser.setPermissionCheckHandler(() => false);
    window = new BrowserWindow({ show: !smoke, width: 1440, height: 940, minWidth: 900, minHeight: 670,
      title: 'Brothers Outfit POS', webPreferences: { session: browser, sandbox: true, contextIsolation: true, nodeIntegration: false } });
    window.webContents.on('will-navigate', (event, href) => {
      if (new URL(href).origin !== origin) event.preventDefault();
    });
    window.webContents.setWindowOpenHandler(({ url }) => {
      const target = new URL(url);
      if (target.origin === origin && /^\/api\/public\/bills\//.test(target.pathname) ||
          target.protocol === 'https:' && ['wa.me', 'web.whatsapp.com'].includes(target.hostname) ||
          target.protocol === 'sms:') void shell.openExternal(url).catch(() => {});
      return { action: 'deny' };
    });
    Menu.setApplicationMenu(Menu.buildFromTemplate([{ label: 'POS', submenu: [
      { label: 'Open device invitation…', click: () => void window.loadURL(origin + '/login?desktop-pair=1') },
      { role: 'reload' }, { role: 'quit' }
    ] }]));
    await window.loadURL(origin + (smoke ? '/login?desktop-pair=1' : '/'));
    if (smoke) {
      const csrf = await window.webContents.executeJavaScript(`(async () => {
        if (!document.querySelector('#desktop-invite')) throw Error('Bundled pairing screen did not render');
        const status = await fetch('/api/desktop/status').then(r => r.json());
        const csrf = await fetch('/api/auth/csrf').then(r => r.json());
        return status.desktop && typeof csrf.token === 'string';
      })()`);
      const cookies = await browser.cookies.get({ url: origin, name: '__Host-bo_csrf' });
      if (!csrf || !cookies.length) throw new Error('Hosted API or session cookies unavailable');
      browser.enableNetworkEmulation({ offline: true });
      simulateUnreachableApi = true;
      await window.loadURL(origin + '/login?desktop-pair=1');
      const offline = await window.webContents.executeJavaScript(`(async () => {
        const result = await fetch('/api/auth/csrf');
        if (!document.querySelector('#desktop-invite') || result.status !== 503) return false;
        return new Promise((resolve, reject) => {
          const request = indexedDB.open('desktop-smoke');
          request.onupgradeneeded = () => request.result.createObjectStore('records');
          request.onerror = () => reject(request.error);
          request.onsuccess = () => {
            const db = request.result;
            const transaction = db.transaction('records', 'readwrite');
            transaction.objectStore('records').put('fixture', 'id');
            transaction.oncomplete = () => { db.close(); resolve(true); };
            transaction.onabort = () => reject(transaction.error);
          };
        });
      })()`);
      if (!offline) throw new Error('Offline UI or local database unavailable');
      console.log('Bundled Windows UI, hosted API cookies and offline IndexedDB smoke tests passed.');
      app.exit(0);
    }
  }).catch(error => { console.error('Desktop startup failed:', error.message); app.exit(1); });
}
