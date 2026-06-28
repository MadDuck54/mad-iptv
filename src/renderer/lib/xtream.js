// Xtream Codes API istemcisi.
// Tüm ağ çağrıları ana süreç üzerinden (CORS yok).

export function makeXtream({ host, username, password }) {
  // host: "http://ornek-sunucu.example.com:80" gibi
  const base = host.replace(/\/+$/, '');
  const auth = `username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`;

  const api = (action, extra = '') =>
    `${base}/player_api.php?${auth}${action ? `&action=${action}` : ''}${extra}`;

  async function getJson(url) {
    // Metni IPC ile al, parse'ı RENDERER'da yap — büyük listelerde (21k film, 7MB)
    // ana süreçten obje döndürmek structured-clone yüzünden asılıyor.
    const r = await window.api.fetchText(url);
    if (!r.ok) throw new Error(r.error || `HTTP ${r.status}`);
    try { return JSON.parse(r.text); } catch { throw new Error('Sunucudan geçersiz yanıt'); }
  }

  return {
    base,
    username,
    password,

    // Hesap + sunucu bilgisi (doğrulama için)
    async info() {
      return getJson(api(''));
    },

    // Canlı TV
    liveCategories() {
      return getJson(api('get_live_categories'));
    },
    liveStreams(categoryId) {
      return getJson(api('get_live_streams', categoryId ? `&category_id=${categoryId}` : ''));
    },

    // Film (VOD)
    vodCategories() {
      return getJson(api('get_vod_categories'));
    },
    vodStreams(categoryId) {
      return getJson(api('get_vod_streams', categoryId ? `&category_id=${categoryId}` : ''));
    },
    vodInfo(vodId) {
      return getJson(api('get_vod_info', `&vod_id=${vodId}`));
    },

    // Dizi
    seriesCategories() {
      return getJson(api('get_series_categories'));
    },
    seriesList(categoryId) {
      return getJson(api('get_series', categoryId ? `&category_id=${categoryId}` : ''));
    },
    seriesInfo(seriesId) {
      return getJson(api('get_series_info', `&series_id=${seriesId}`));
    },

    // EPG (kısa) — bir kanal için
    shortEpg(streamId, limit = 10) {
      return getJson(api('get_short_epg', `&stream_id=${streamId}&limit=${limit}`));
    },

    // Yayın URL'leri
    liveUrl(streamId, ext = 'ts') {
      return `${base}/live/${encodeURIComponent(username)}/${encodeURIComponent(password)}/${streamId}.${ext}`;
    },
    vodUrl(streamId, ext = 'mp4') {
      return `${base}/movie/${encodeURIComponent(username)}/${encodeURIComponent(password)}/${streamId}.${ext}`;
    },
    seriesUrl(streamId, ext = 'mp4') {
      return `${base}/series/${encodeURIComponent(username)}/${encodeURIComponent(password)}/${streamId}.${ext}`;
    },
  };
}

// m3u_plus linkinden host/user/pass çıkar (kolaylık)
export function parseXtreamFromM3uUrl(url) {
  try {
    const u = new URL(url);
    const username = u.searchParams.get('username');
    const password = u.searchParams.get('password');
    if (!username || !password) return null;
    const host = `${u.protocol}//${u.host}`;
    return { host, username, password };
  } catch {
    return null;
  }
}
