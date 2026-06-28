// Oynatıcı sarmalayıcı: URL'ye göre hls.js / mpegts.js / native seçer.
// hls.js ve mpegts.js global olarak index.html'de <script> ile yüklenir.

let activeHls = null;
let activeMpegts = null;

export function detectType(url) {
  const u = url.split('?')[0].toLowerCase();
  if (u.endsWith('.m3u8')) return 'hls';
  if (u.endsWith('.ts')) return 'mpegts';
  if (u.endsWith('.mp4') || u.endsWith('.mkv') || u.endsWith('.mov') || u.endsWith('.avi')) return 'native';
  // uzantısız canlı yayın → büyük ihtimal mpegts
  return 'mpegts';
}

export function destroyPlayer(video) {
  if (activeHls) { try { activeHls.destroy(); } catch {} activeHls = null; }
  if (activeMpegts) { try { activeMpegts.destroy(); } catch {} activeMpegts = null; }
  if (video) {
    try { video.pause(); } catch {}
    video.removeAttribute('src');
    try { video.load(); } catch {}
  }
}

// Okunabilir hata mesajı üret
function humanError(detail) {
  const d = String(detail || '').toLowerCase();
  if (d.includes('403') || d.includes('forbidden')) return 'Erişim reddedildi — bağlantı sınırın (max_connections) dolu olabilir.';
  if (d.includes('404')) return 'Yayın bulunamadı (404).';
  if (d.includes('network') || d.includes('timeout') || d.includes('exception')) return 'Bağlantı hatası — sunucu yanıt vermedi.';
  if (d.includes('media') || d.includes('decode')) return 'Bu yayın formatı oynatılamadı.';
  return 'Yayın açılamadı.';
}

// isLive: canlı yayında buffer/latency ayarları farklı
// handlers: { onLoading(), onPlaying(), onError(msg) }
export function play(video, url, { isLive = true, onLoading, onPlaying, onError } = {}) {
  destroyPlayer(video);
  const type = detectType(url);
  const loading = () => onLoading && onLoading();
  const playing = () => onPlaying && onPlaying();
  const fail = (detail) => onError && onError(humanError(detail), detail);

  loading();
  video.addEventListener('playing', playing, { once: false });
  video.addEventListener('error', () => fail('media error'), { once: true });

  if (type === 'hls') {
    if (window.Hls && window.Hls.isSupported()) {
      const hls = new window.Hls({
        lowLatencyMode: isLive,
        enableWorker: true,
        backBufferLength: isLive ? 30 : 90,
      });
      activeHls = hls;
      hls.loadSource(url);
      hls.attachMedia(video);
      hls.on(window.Hls.Events.MANIFEST_PARSED, () => video.play().catch(() => {}));
      hls.on(window.Hls.Events.ERROR, (_e, data) => {
        if (data.fatal) fail(`${data.type}/${data.details}`);
      });
      return { engine: 'hls' };
    }
    video.src = url;
    video.play().catch(() => {});
    return { engine: 'native-hls' };
  }

  if (type === 'mpegts') {
    if (window.mpegts && window.mpegts.isSupported()) {
      const player = window.mpegts.createPlayer(
        { type: 'mpegts', isLive, url },
        { enableWorker: true, liveBufferLatencyChasing: isLive, lazyLoad: false }
      );
      activeMpegts = player;
      player.attachMediaElement(video);
      player.load();
      player.play().catch(() => {});
      player.on(window.mpegts.Events.ERROR, (t2, detail) => fail(`${t2}/${detail}`));
      return { engine: 'mpegts' };
    }
    video.src = url;
    video.play().catch(() => {});
    return { engine: 'native-fallback' };
  }

  // native
  video.src = url;
  video.play().catch(() => fail('native play rejected'));
  return { engine: 'native' };
}
