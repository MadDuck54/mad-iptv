// mpv kontrolcüsü — ayrı pencerede oynatır, JSON IPC ile kontrol edilir.
const { spawn } = require('child_process');
const net = require('net');
const fs = require('fs');
const path = require('path');
const os = require('os');

const { app } = require('electron');
const MPV_BIN = '/opt/homebrew/bin/mpv';
const SOCK = path.join(os.tmpdir(), 'madiptv-mpv.sock');
// uosc modern UI + ayarlar — dev'de proje kökünde, paketlenince Resources içinde
const CONFIG_DIR = app && app.isPackaged
  ? path.join(process.resourcesPath, 'mpv-config')
  : path.join(__dirname, '..', 'mpv-config');

class Mpv {
  constructor(onEvent) {
    this.onEvent = onEvent;     // (eventObj) => void  → renderer'a iletilir
    this.proc = null;
    this.sock = null;
    this.buf = '';
    this.reqId = 1;
    this.pending = new Map();
    this.ready = false;
  }

  available() { return fs.existsSync(MPV_BIN); }

  start() {
    if (this.proc) return Promise.resolve();
    try { fs.unlinkSync(SOCK); } catch {}
    this.proc = spawn(MPV_BIN, [
      `--config-dir=${CONFIG_DIR}`,   // uosc + mpv.conf (osc=no burada)
      '--idle=yes',
      '--force-window=immediate',
      '--no-terminal',
      '--keep-open=no',
      '--ontop=no',
      '--demuxer-max-bytes=64MiB',
      '--title=Mad-IPTV',
      '--autofit=68%',
      '--geometry=50%:50%',
      '--user-agent=Mozilla/5.0 (Macintosh) Mad-IPTV',
      `--input-ipc-server=${SOCK}`,
    ], { stdio: 'ignore' });

    this.proc.on('exit', () => { this.proc = null; this.sock = null; this.ready = false; this.onEvent({ event: 'mpv-exit' }); });

    return this._connect();
  }

  _connect(tries = 0) {
    return new Promise((resolve, reject) => {
      const attempt = (n) => {
        const s = net.connect(SOCK);
        s.on('connect', () => {
          this.sock = s; this.ready = true;
          s.on('data', (d) => this._onData(d));
          s.on('error', () => {});
          // izlenecek özellikler
          ['track-list', 'pause', 'time-pos', 'duration', 'eof-reached', 'core-idle', 'media-title', 'pause-for-cache']
            .forEach((p, i) => this._send({ command: ['observe_property', i + 1, p] }));
          resolve();
        });
        s.on('error', () => {
          if (n > 30) return reject(new Error('mpv IPC soketine bağlanılamadı'));
          setTimeout(() => attempt(n + 1), 100);
        });
      };
      attempt(tries);
    });
  }

  _onData(d) {
    this.buf += d.toString();
    let i;
    while ((i = this.buf.indexOf('\n')) >= 0) {
      const line = this.buf.slice(0, i); this.buf = this.buf.slice(i + 1);
      if (!line.trim()) continue;
      let m; try { m = JSON.parse(line); } catch { continue; }
      if (m.request_id && this.pending.has(m.request_id)) {
        this.pending.get(m.request_id)(m); this.pending.delete(m.request_id);
      } else if (m.event === 'property-change') {
        this.onEvent({ event: 'prop', name: m.name, data: m.data });
      } else if (m.event === 'end-file') {
        this.onEvent({ event: 'end-file', reason: m.reason, fileError: m.file_error });
      } else if (m.event === 'file-loaded') {
        this.onEvent({ event: 'file-loaded' });
        // güvence: track-list'i elle sorgulayıp ilet (değişim olayı atlanırsa)
        this.get('track-list').then((tl) => { if (Array.isArray(tl)) this.onEvent({ event: 'prop', name: 'track-list', data: tl }); });
      } else if (m.event) {
        this.onEvent({ event: m.event });
      }
    }
  }

  _send(obj) { if (this.sock) try { this.sock.write(JSON.stringify(obj) + '\n'); } catch {} }

  command(args) { this._send({ command: args }); }

  get(prop) {
    return new Promise((resolve) => {
      const id = this.reqId++;
      this.pending.set(id, (m) => resolve(m.error === 'success' ? m.data : null));
      this._send({ command: ['get_property', prop], request_id: id });
      setTimeout(() => { if (this.pending.has(id)) { this.pending.delete(id); resolve(null); } }, 3000);
    });
  }

  set(prop, value) { this._send({ command: ['set_property', prop, value] }); }

  async load(url) {
    // pencere/süreç yoksa (kapatılmışsa) yeniden başlat
    if (!this.proc || !this.ready) await this.start();
    this.command(['loadfile', url, 'replace']);
    this.set('pause', false);
  }

  stop() { this.command(['stop']); }

  quit() { if (this.proc) { this._send({ command: ['quit'] }); try { this.proc.kill(); } catch {} this.proc = null; this.ready = false; } }
}

module.exports = { Mpv, MPV_BIN };
