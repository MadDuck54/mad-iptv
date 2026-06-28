const { app, BrowserWindow, ipcMain, session, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { Mpv } = require('./mpv');

let mainWindow;
let mpv;

// IPTV afiş/logo sunucularının çoğu bozuk SSL sertifikası kullanır → görseller yüklensin
app.commandLine.appendSwitch('ignore-certificate-errors');

function dataFile() {
  return path.join(app.getPath('userData'), 'store.json');
}

function readStore() {
  try {
    return JSON.parse(fs.readFileSync(dataFile(), 'utf8'));
  } catch {
    return {};
  }
}

function writeStore(obj) {
  try {
    fs.writeFileSync(dataFile(), JSON.stringify(obj, null, 2), 'utf8');
    return true;
  } catch (e) {
    return false;
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0b0d12',
    title: 'Mad-IPTV',
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // IPTV sunucuları çoğunlukla http + cross-origin; yerel kişisel oynatıcı için gevşetiyoruz
      webSecurity: false,
      allowRunningInsecureContent: true,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  // [GEÇİCİ] tasarımı görebilmek için periyodik ekran görüntüsü
  if (process.env.MADIPTV_SHOT) {
    const [sec, action, query] = process.env.MADIPTV_SHOT.split(':');
    if (['movie', 'series', 'fav'].includes(sec)) {
      // bağlantı tamamlanana kadar bekle, sonra sekmeye geç (oynak connect süresine dayanıklı)
      setTimeout(() => mainWindow.webContents.executeJavaScript(
        `(()=>{let n=0;const t=setInterval(()=>{const b=document.querySelector('[data-section=${sec}]');const onApp=!document.getElementById('app').classList.contains('hidden');if(b&&onApp){b.click();clearInterval(t);}if(++n>40)clearInterval(t);},500);})()`
      ).catch(() => {}), 6000);
    }
    if (action === 'detail') {
      setTimeout(() => mainWindow.webContents.executeJavaScript(`document.querySelector('#rows .ncard:not(.skel)')?.click()`).catch(() => {}), 14000);
    }
    if (action === 'hover') {
      // ilk rayın ilk kartına hover'ı simüle et (buton örtüşmesini görmek için)
      setTimeout(() => mainWindow.webContents.executeJavaScript(
        `(()=>{const c=document.querySelector('#rows .rail .ncard:not(.skel)');if(c){c.style.transform='scale(1.10) translateY(-4px)';c.style.zIndex='12';const t=c.querySelector('.thumb');if(t){t.style.outline='3px solid rgba(255,255,255,.92)';t.style.boxShadow='0 18px 40px rgba(0,0,0,.55)';}}})()`
      ).catch(() => {}), 16000);
    }
    if (action === 'search' && query) {
      setTimeout(() => mainWindow.webContents.executeJavaScript(
        `(()=>{const s=document.querySelector('#search');s.value=${JSON.stringify(query)};s.dispatchEvent(new Event('input',{bubbles:true}));})()`
      ).catch(() => {}), 14000);
    }
    if (action === 'csearch' && query) {
      // GERÇEK etkileşim: büyütece tıkla → odak/aç → yaz
      setTimeout(() => mainWindow.webContents.executeJavaScript(
        `(()=>{const w=document.querySelector('.search-wrap');w.dispatchEvent(new MouseEvent('click',{bubbles:true}));` +
        `const s=document.querySelector('#search');const focused=document.activeElement===s;const open=w.classList.contains('open');` +
        `s.value=${JSON.stringify(query)};s.dispatchEvent(new Event('input',{bubbles:true}));` +
        `return {focused,open};})()`
      ).then(r => fs.writeFileSync('/tmp/madiptv-searchtest.json', JSON.stringify(r))).catch(() => {}), 14000);
    }
    setInterval(async () => {
      // pencereyi öne getir → capturePage bayat kare yerine güncel frame versin
      try { mainWindow.showInactive(); } catch {}
      try { const img = await mainWindow.webContents.capturePage(); fs.writeFileSync('/tmp/madiptv-shot.png', img.toPNG()); } catch {}
    }, 2500);
  }
}

// --- IPC: ana süreçte fetch → CORS yok ---
ipcMain.handle('net:fetchText', async (_e, url) => {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'IPTVLocal/0.1 (Electron)' },
      redirect: 'follow',
    });
    if (!res.ok) return { ok: false, status: res.status, error: `HTTP ${res.status}` };
    const text = await res.text();
    return { ok: true, status: res.status, text };
  } catch (e) {
    return { ok: false, error: String(e && e.message ? e.message : e) };
  }
});

ipcMain.handle('net:fetchJson', async (_e, url) => {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'IPTVLocal/0.1 (Electron)' },
      redirect: 'follow',
    });
    if (!res.ok) return { ok: false, status: res.status, error: `HTTP ${res.status}` };
    const data = await res.json();
    return { ok: true, status: res.status, data };
  } catch (e) {
    return { ok: false, error: String(e && e.message ? e.message : e) };
  }
});

ipcMain.handle('store:get', async () => readStore());
ipcMain.handle('store:set', async (_e, obj) => writeStore(obj));
ipcMain.handle('open:external', async (_e, url) => { try { await shell.openExternal(url); return true; } catch { return false; } });

// --- mpv köprüsü ---
function ensureMpv() {
  if (!mpv) {
    mpv = new Mpv((ev) => { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('mpv:event', ev); });
  }
  return mpv;
}
ipcMain.handle('mpv:available', async () => ensureMpv().available());
ipcMain.handle('mpv:load', async (_e, url) => { await ensureMpv().load(url); return true; });
ipcMain.handle('mpv:command', async (_e, args) => { ensureMpv().command(args); return true; });
ipcMain.handle('mpv:set', async (_e, prop, value) => { ensureMpv().set(prop, value); return true; });
ipcMain.handle('mpv:get', async (_e, prop) => ensureMpv().get(prop));
ipcMain.handle('mpv:stop', async () => { if (mpv) mpv.stop(); return true; });
ipcMain.handle('mpv:addSub', async (_e, filePath) => { ensureMpv().command(['sub-add', filePath, 'select']); return true; });
ipcMain.handle('dialog:subtitle', async () => {
  const r = await dialog.showOpenDialog(mainWindow, {
    title: 'Altyazı dosyası seç',
    filters: [{ name: 'Altyazı', extensions: ['srt', 'ass', 'ssa', 'sub', 'vtt'] }],
    properties: ['openFile'],
  });
  return r.canceled ? null : r.filePaths[0];
});

app.whenReady().then(() => {
  // Bazı IPTV sunucuları User-Agent / referer kontrolü yapar; mixed-content engelini de kaldır
  session.defaultSession.webRequest.onBeforeSendHeaders((details, cb) => {
    cb({ requestHeaders: details.requestHeaders });
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('before-quit', () => { if (mpv) mpv.quit(); });

app.on('window-all-closed', () => {
  if (mpv) mpv.quit();
  if (process.platform !== 'darwin') app.quit();
});
