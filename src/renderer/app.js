import { makeXtream, parseXtreamFromM3uUrl } from './lib/xtream.js';
import { parseM3U, groupByCategory } from './lib/m3u.js';
import * as store from './lib/store.js';

const state = {
  profile: null, xt: null,
  section: 'live',
  catOrder: [],        // [{id,name}]
  groups: new Map(),   // catId -> items[]
  allItems: [],        // düz arama havuzu
  search: '',
  nowKey: null,
  _observer: null,
  _lastPlay: null,
};

const $ = (s) => document.querySelector(s);
const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
const SECTION_TITLES = { live: 'Canlı TV', movie: 'Filmler', series: 'Diziler', fav: 'Listem' };

// ================= LOGIN =================
function initLogin() {
  document.querySelectorAll('.tab').forEach((t) =>
    t.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach((x) => x.classList.remove('active'));
      t.classList.add('active');
      document.querySelector('.tabs').dataset.active = t.dataset.tab;
      $('#form-xtream').classList.toggle('hidden', t.dataset.tab !== 'xtream');
      $('#form-m3u').classList.toggle('hidden', t.dataset.tab !== 'm3u');
    })
  );

  const pwToggle = document.querySelector('.pw-toggle');
  if (pwToggle) pwToggle.addEventListener('click', () => {
    const inp = document.querySelector('input[name="password"]');
    inp.type = inp.type === 'password' ? 'text' : 'password';
    pwToggle.style.color = inp.type === 'text' ? 'var(--accent-2)' : '';
  });

  $('#form-xtream').addEventListener('submit', (e) => {
    e.preventDefault();
    const f = e.target;
    connectProfile({
      id: 'xt_' + (f.host.value + f.username.value).replace(/\W+/g, '').slice(0, 24),
      label: f.label.value.trim() || f.username.value,
      type: 'xtream',
      host: f.host.value.trim().replace(/\/+$/, ''),
      username: f.username.value.trim(),
      password: f.password.value.trim(),
    }, true);
  });

  $('#form-m3u').addEventListener('submit', (e) => {
    e.preventDefault();
    const f = e.target;
    const url = f.url.value.trim();
    const xt = parseXtreamFromM3uUrl(url);
    let profile;
    if (xt) {
      profile = { id: 'xt_' + (xt.host + xt.username).replace(/\W+/g, '').slice(0, 24), label: f.label.value.trim() || xt.username, type: 'xtream', ...xt };
      setStatus('m3u_plus linki Xtream olarak algılandı…');
    } else {
      profile = { id: 'm3u_' + url.replace(/\W+/g, '').slice(0, 24), label: f.label.value.trim() || 'M3U Playlist', type: 'm3u', url };
    }
    connectProfile(profile, true);
  });
}

async function renderProfiles() {
  const box = $('#profiles');
  box.innerHTML = '';
  const profiles = await store.getProfiles();
  if (!profiles.length) return;
  box.appendChild(el('div', 'profiles-head', 'Kayıtlı profiller'));
  for (const p of profiles) {
    const row = el('div', 'profile-row');
    const label = el('div', 'p-label', p.label);
    const type = el('span', 'p-type', p.type);
    const connect = el('button', 'p-connect', '→'); connect.title = 'Bağlan';
    const del = el('button', 'p-del', '✕'); del.title = 'Sil';
    connect.addEventListener('click', () => connectProfile(p, false));
    let armed = false;
    del.addEventListener('click', async () => {
      if (!armed) { armed = true; del.textContent = 'Sil?'; del.classList.add('confirm'); setTimeout(() => { if (armed) { armed = false; del.textContent = '✕'; del.classList.remove('confirm'); } }, 2500); return; }
      await store.removeProfile(p.id); renderProfiles();
    });
    row.append(label, type, connect, del);
    box.appendChild(row);
  }
}

function setStatus(msg, kind = '') { const s = $('#login-status'); s.textContent = msg || ''; s.className = 'login-status ' + kind; }

// ================= BAĞLAN =================
async function connectProfile(profile, isNew) {
  setStatus('Bağlanılıyor…');
  document.querySelectorAll('.btn-primary, .p-connect').forEach((b) => (b.disabled = true));
  try {
    if (profile.type === 'xtream') {
      const xt = makeXtream(profile);
      const info = await xt.info();
      if (!info || !info.user_info || info.user_info.auth === 0) throw new Error('Kullanıcı adı / şifre reddedildi.');
      state.xt = xt;
      const ui = info.user_info;
      state._userInfo = ui;
      const exp = ui.exp_date ? new Date(ui.exp_date * 1000).toLocaleDateString('tr-TR') : '—';
      setStatus(`Bağlandı ✓ (bitiş ${exp})`, 'ok');
    } else {
      const r = await window.api.fetchText(profile.url);
      if (!r.ok) throw new Error(r.error || 'M3U indirilemedi');
      state._m3u = parseM3U(r.text);
      if (!state._m3u.length) throw new Error('M3U boş / ayrıştırılamadı');
      state.xt = null;
      setStatus(`Yüklendi ✓ ${state._m3u.length} öğe`, 'ok');
    }
    state.profile = profile;
    await store.saveProfile(profile);
    enterApp();
  } catch (e) {
    setStatus('Hata: ' + (e.message || e), 'err');
  } finally {
    document.querySelectorAll('.btn-primary, .p-connect').forEach((b) => (b.disabled = false));
  }
}

// ================= UYGULAMA =================
function enterApp() {
  $('#login').classList.add('hidden');
  $('#app').classList.remove('hidden');
  $('#profile-name').textContent = state.profile.label;
  renderAccountPanel();
  setSection('live');
}

function renderAccountPanel() {
  const dd = $('#profile-dropdown');
  dd.querySelector('.acct-info')?.remove();
  const ui = state._userInfo;
  if (!ui) return;
  const exp = ui.exp_date ? new Date(ui.exp_date * 1000).toLocaleDateString('tr-TR') : '—';
  const active = String(ui.status).toLowerCase() === 'active';
  const box = el('div', 'acct-info');
  box.innerHTML =
    `<div class="acct-name">${escapeHtml(state.profile.label)}</div>` +
    `<div class="acct-row"><span>Durum</span><b class="${active ? 'ok' : 'warn'}">${escapeHtml(ui.status || '—')}</b></div>` +
    `<div class="acct-row"><span>Bitiş</span><b>${exp}</b></div>` +
    `<div class="acct-row"><span>Bağlantı</span><b>${escapeHtml(ui.active_cons || '0')} / ${escapeHtml(ui.max_connections || '?')}</b></div>`;
  dd.prepend(box);
}

function initApp() {
  document.querySelectorAll('.nav-link').forEach((b) =>
    b.addEventListener('click', () => setSection(b.dataset.section))
  );

  // navbar arka planı scroll'da koyulaşsın
  $('#app').addEventListener('scroll', (e) => {
    $('#navbar').classList.toggle('scrolled', e.target.scrollTop > 60);
  });

  // arama — büyütece/kutuya tıkla → aç + odaklan
  const searchWrap = document.querySelector('.search-wrap');
  searchWrap.addEventListener('click', () => { searchWrap.classList.add('open'); $('#search').focus(); });
  $('#search').addEventListener('focus', () => searchWrap.classList.add('open'));
  $('#search').addEventListener('blur', () => { if (!$('#search').value) searchWrap.classList.remove('open'); });
  let to;
  $('#search').addEventListener('input', (e) => {
    clearTimeout(to);
    to = setTimeout(() => { state.search = e.target.value.trim().toLowerCase(); state.search ? renderSearch() : renderCurrentView(); }, 200);
  });
  // Esc ile aramayı kapat/temizle
  $('#search').addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.target.value = ''; state.search = ''; e.target.blur(); searchWrap.classList.remove('open'); renderCurrentView(); }
  });

  // profil menüsü
  $('#profile-btn').addEventListener('click', (e) => { e.stopPropagation(); $('#profile-dropdown').classList.toggle('hidden'); });
  document.addEventListener('click', () => $('#profile-dropdown').classList.add('hidden'));
  $('#btn-logout').addEventListener('click', () => {
    closePlayer();
    state.profile = null; state.xt = null; state._m3u = null;
    $('#app').classList.add('hidden'); $('#login').classList.remove('hidden');
    setStatus(''); renderProfiles();
  });

  // hero
  $('#hero-play').addEventListener('click', () => {
    const it = state._heroItem; if (!it) return;
    if (state.section === 'movie') startPlay(it, state.xt.vodUrl(it.id, (it.raw && it.raw.container_extension) || 'mp4'), false);
    else onSelect(it); // dizi → detay (bölüm seç)
  });
  $('#hero-info').addEventListener('click', () => { if (state._heroItem) onSelect(state._heroItem); });

  // detay sayfası
  $('#dt-back').addEventListener('click', closeDetail);
  $('#dt-fav').addEventListener('click', toggleDetailFav);
  $('#dt-trailer').addEventListener('click', () => { if (state._detailTrailer) window.api.openExternal(state._detailTrailer); });
  $('#dt-plot').addEventListener('click', () => $('#dt-plot').classList.toggle('expanded'));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !$('#detail').classList.contains('hidden') && $('#player-overlay').classList.contains('hidden')) closeDetail();
  });

  // oynatıcı paneli
  $('#btn-close-player').addEventListener('click', closePlayer);
  $('.po-backdrop').addEventListener('click', closePlayer);
  $('#btn-fav').addEventListener('click', toggleNowFavorite);
  $('#btn-retry').addEventListener('click', () => { if (state._lastPlay) startPlay(state._lastPlay.it, state._lastPlay.url, state._lastPlay.isLive); });

  // transport → mpv
  $('#btn-playpause').addEventListener('click', () => window.mpv.command(['cycle', 'pause']));
  $('#btn-back10').addEventListener('click', () => window.mpv.command(['seek', -10]));
  $('#btn-fwd10').addEventListener('click', () => window.mpv.command(['seek', 10]));
  $('#btn-mute').addEventListener('click', () => window.mpv.command(['cycle', 'mute']));
  $('#btn-fs').addEventListener('click', () => window.mpv.command(['cycle', 'fullscreen']));
  $('#tp-seek').addEventListener('input', (e) => { if (!state._isLive) window.mpv.set('percent-pos', +e.target.value / 10); });

  // track + hız seçiciler → mpv
  $('#sel-audio').addEventListener('change', (e) => window.mpv.set('aid', e.target.value));
  $('#sel-sub').addEventListener('change', (e) => window.mpv.set('sid', e.target.value));
  $('#sel-quality').addEventListener('change', (e) => window.mpv.set('vid', e.target.value));
  $('#sel-speed').addEventListener('change', (e) => window.mpv.set('speed', parseFloat(e.target.value)));
  $('#btn-loadsub').addEventListener('click', async () => {
    const p = await window.mpv.pickSubtitle();
    if (p) window.mpv.addSub(p);
  });

  // mpv olayları
  window.mpv.onEvent(onMpvEvent);

  document.addEventListener('keydown', (e) => {
    const open = !$('#player-overlay').classList.contains('hidden');
    if (e.key === 'Escape' && open) return closePlayer();
    if (!open) return;
    if (e.target.tagName === 'SELECT' || e.target.tagName === 'INPUT') return;
    if (e.key === ' ') { e.preventDefault(); window.mpv.command(['cycle', 'pause']); }
    else if (e.key === 'ArrowRight' && !state._isLive) window.mpv.command(['seek', 10]);
    else if (e.key === 'ArrowLeft' && !state._isLive) window.mpv.command(['seek', -10]);
    else if (e.key.toLowerCase() === 'm') window.mpv.command(['cycle', 'mute']);
    else if (e.key.toLowerCase() === 'f') window.mpv.command(['cycle', 'fullscreen']);
    else if (e.key.toLowerCase() === 'l') toggleNowFavorite();
  });
}

// ---------- mpv olay işleyici ----------
function fmtTime(s) {
  if (!s || s < 0) return '0:00';
  s = Math.floor(s); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(sec).padStart(2, '0');
}

function onMpvEvent(ev) {
  if (ev.event === 'prop') {
    if (ev.name === 'track-list') populateTracks(ev.data || []);
    else if (ev.name === 'pause') $('#btn-playpause').textContent = ev.data ? '▶' : '⏸';
    else if (ev.name === 'duration') { state._dur = ev.data || 0; if (!state._isLive) $('#tp-dur').textContent = fmtTime(state._dur); }
    else if (ev.name === 'time-pos') {
      const pos = ev.data || 0;
      $('#tp-cur').textContent = fmtTime(pos);
      if (!state._seeking && state._dur > 0 && !state._isLive) $('#tp-seek').value = Math.round((pos / state._dur) * 1000);
      // Devam İzle ilerlemesini ~5sn'de bir kaydet
      if (state._recentKey && state._dur > 0 && Math.abs(pos - (state._lastSavedPos || 0)) >= 5) {
        state._lastSavedPos = pos;
        store.setRecentProgress(state._recentKey, pos, state._dur);
      }
    }
    else if (ev.name === 'pause-for-cache') { setNpStatus(ev.data ? 'Tamponlanıyor…' : ''); }
  } else if (ev.event === 'file-loaded') {
    setNpStatus(''); $('#po-error').classList.add('hidden');
    // kaldığın yerden devam
    if (state._resumeTo > 5) { window.mpv.command(['seek', state._resumeTo, 'absolute']); state._resumeTo = 0; }
  } else if (ev.event === 'end-file') {
    if (ev.reason === 'error') {
      if (!state._retried && state._lastPlay) {
        state._retried = true;
        setNpStatus('Bağlantı koptu, yeniden deneniyor…');
        setTimeout(() => { const p = state._lastPlay; if (p) startPlay(p.it, p.url, p.isLive, p.recentEntry, state._lastSavedPos || p.resumeFrom); }, 2000);
      } else {
        showPlayError('Yayın açılamadı — sunucu yanıt vermedi veya bağlantı sınırın (max_connections) dolu olabilir.');
      }
    }
  }
}

function setNpStatus(msg, err) { const s = $('#np-status'); s.textContent = msg || ''; s.className = 'np-status' + (err ? ' err' : ''); }
function showPlayError(msg) { $('#po-error-msg').textContent = msg; $('#po-error').classList.remove('hidden'); setNpStatus('Hata', true); }

function populateTracks(tracks) {
  const audio = tracks.filter((t) => t.type === 'audio');
  const subs = tracks.filter((t) => t.type === 'sub');
  const vids = tracks.filter((t) => t.type === 'video');

  const fill = (sel, list, extra) => {
    const cur = sel.value;
    sel.innerHTML = '';
    if (extra) sel.appendChild(new Option(extra.label, extra.value));
    for (const t of list) {
      const parts = [];
      if (t.lang) parts.push(t.lang);
      if (t.title) parts.push(t.title);
      if (t.type === 'video' && t['demux-h']) parts.push(`${t['demux-h']}p`);
      if (t.codec) parts.push(t.codec);
      const label = (parts.join(' · ') || `#${t.id}`);
      const opt = new Option(label, t.id);
      if (t.selected) opt.selected = true;
      sel.appendChild(opt);
    }
    return list.length;
  };

  const aWrap = $('#sel-audio').closest('.trk');
  const sWrap = $('#sel-sub').closest('.trk');
  const qWrap = $('#sel-quality').closest('.trk');

  const aCount = fill($('#sel-audio'), audio);
  fill($('#sel-sub'), subs, { label: 'Kapalı', value: 'no' });
  const qCount = fill($('#sel-quality'), vids);

  // tek seçenekliyse menüyü soluklaştır ama gizleme (kullanıcı görsün)
  aWrap.style.opacity = aCount > 1 ? '1' : '.5';
  qWrap.style.opacity = qCount > 1 ? '1' : '.5';
  sWrap.style.opacity = subs.length ? '1' : '.7';
}

// ---------- bölüm yükle ----------
async function setSection(section) {
  state.section = section;
  state.search = ''; $('#search').value = '';
  document.querySelectorAll('.nav-link').forEach((b) => b.classList.toggle('active', b.dataset.section === section));
  $('#app').scrollTop = 0;
  $('#rows').classList.remove('live-mode');
  $('#rows').innerHTML = '<div class="rows-empty">Yükleniyor…</div>';
  $('#hero').classList.add('hidden');

  if (section === 'fav') return loadFav();
  if (state.profile.type === 'm3u') return loadM3u(section);
  return loadXtream(section);
}

function loadM3u(section) {
  const kind = section;
  const src = state._m3u.filter((i) => i.kind === kind || (kind === 'live' && i.kind === 'live'));
  const pool = (src.length ? src : state._m3u).map((it) => ({ ...it, catId: it.group, rawName: it.name }));
  const grouped = groupByCategory(pool);
  state.catOrder = grouped.map((g) => ({ id: g.group, name: g.group }));
  const groups = new Map();
  const all = [];
  for (const g of grouped) {
    let list = g.items.map((it) => ({ ...it, catId: g.group, rawName: it.rawName || it.name }));
    if (kind === 'live') list = dedupeLive(list);
    groups.set(g.group, list);
    for (const x of list) all.push(x);
  }
  state.groups = groups;
  state.allItems = all;
  renderCurrentView();
}

async function loadXtream(section) {
  try {
    let cats, streams;
    if (section === 'live') { [cats, streams] = await Promise.all([state.xt.liveCategories(), state.xt.liveStreams('')]); }
    else if (section === 'movie') { [cats, streams] = await Promise.all([state.xt.vodCategories(), state.xt.vodStreams('')]); }
    else { [cats, streams] = await Promise.all([state.xt.seriesCategories(), state.xt.seriesList('')]); }

    state.catOrder = (cats || []).map((c) => ({ id: String(c.category_id), name: c.category_name }));
    const items = (streams || []).map((x) => mapXtreamItem(x, section));
    const groups = new Map();
    for (const it of items) { if (!groups.has(it.catId)) groups.set(it.catId, []); groups.get(it.catId).push(it); }
    if (section === 'live') {
      // kalite varyantlarını (SD/HD/FHD) kategori içinde tek kanalda topla
      const all = [];
      for (const [cat, list] of groups) { const d = dedupeLive(list); groups.set(cat, d); for (const x of d) all.push(x); }
      state.allItems = all;
    } else {
      state.allItems = items;
    }
    state.groups = groups;
    renderCurrentView();
  } catch (e) {
    $('#rows').innerHTML = `<div class="rows-empty">İçerik alınamadı: ${e.message}</div>`;
  }
}

function mapXtreamItem(x, section) {
  const isSeries = section === 'series';
  const raw = x.name || x.title || 'İsimsiz';
  return {
    id: isSeries ? x.series_id : x.stream_id,
    name: cleanName(raw),
    rawName: raw,
    logo: x.stream_icon || x.cover || '',
    epgId: x.epg_channel_id || '',
    kind: section,
    catId: String(x.category_id || '0'),
    raw: x,
  };
}

// ---- Kanal adı temizleme + kalite varyantı gruplama ----
// "TR: ", "TR| ", "|TR| ", "TR - " gibi ülke öneklerini sök
function cleanName(raw) {
  return String(raw || '')
    .replace(/^\s*[|[(]?\s*(tr|tür?k(iye)?|turkey)\s*[)\]|:\-–—❘]+\s*/i, '')
    .replace(/\s+/g, ' ').trim() || String(raw || '').trim();
}
// kalite/etiket token'larını at → karşılaştırma için taban ad
// NOT: 4K/UHD soyulmaz (TRT 4K, beIN 4K gibi kanal kimliğidir) — sadece SD/HD/FHD
const QUAL_RE = /\b(fhd|full\s?hd|hd|sd|hevc|h\.?265|h\.?264|1080p?|720p?|480p?)\b|\((?:[^)]*(?:kalite|maç|mac|yedek|backup|test)[^)]*)\)/gi;
function baseName(raw) {
  return cleanName(raw).toLowerCase()
    .replace(QUAL_RE, ' ')
    .replace(/[^a-z0-9çğıöşü ]/gi, ' ')
    .replace(/\s+/g, ' ').trim();
}
function qualityRank(raw) {
  const s = String(raw).toLowerCase();
  if (/\b(uhd|4k)\b/.test(s)) return 5;
  if (/\bf(ull\s?)?hd\b|1080|yüksek kalite|yuksek kalite/.test(s)) return 4;
  if (/\bhd\b|720/.test(s)) return 3;
  if (/\bsd\b|480/.test(s)) return 1;
  return 2;
}
// ekranda gösterilecek temiz ad (önek + kalite eki yok)
function cleanDisplay(raw) {
  let s = cleanName(raw)
    .replace(/\s*\((?:[^)]*(?:kalite|maç|mac|yedek|backup|test)[^)]*)\)/gi, '')
    .replace(/\s+\b(fhd|full\s?hd|hd|sd|hevc|h\.?265|h\.?264|1080p?|720p?|480p?)\b\s*$/gi, '')
    .replace(/\s+\b(fhd|full\s?hd|hd|sd)\b/gi, ' ')
    .replace(/\s+/g, ' ').trim();
  return s || cleanName(raw);
}
// kategori içindeki kalite varyantlarını tek kanalda topla (en iyi kaliteyi temsilci yap)
function dedupeLive(list) {
  const groups = new Map();
  for (const it of list) {
    const b = baseName(it.rawName || it.name) || (it.rawName || it.name);
    if (!groups.has(b)) groups.set(b, []);
    groups.get(b).push(it);
  }
  const out = [];
  for (const vars of groups.values()) {
    vars.sort((a, z) => qualityRank(z.rawName || z.name) - qualityRank(a.rawName || a.name));
    const best = vars[0];
    out.push({ ...best, name: cleanDisplay(best.rawName || best.name), variants: vars });
  }
  return out;
}

// ---------- render: raylar ----------
function renderSection() {
  const rows = $('#rows');
  if (state._observer) { state._observer.disconnect(); state._observer = null; }
  rows.innerHTML = '';
  rows.classList.remove('with-hero');
  rows.classList.remove('live-mode');

  const poster = state.section === 'movie' || state.section === 'series';

  // hero (film/dizi'de, kapağı olan ilk öğe)
  const heroItem = state.allItems.find((i) => i.logo);
  if (poster && heroItem) { showHero(heroItem); rows.classList.add('with-hero'); }
  else $('#hero').classList.add('hidden');

  const cats = state.catOrder.filter((c) => (state.groups.get(c.id) || []).length);
  if (!cats.length) { rows.innerHTML = '<div class="rows-empty">Bu bölümde içerik yok.</div>'; return; }

  const obs = new IntersectionObserver((entries) => {
    for (const en of entries) {
      if (en.isIntersecting) { populateRail(en.target); obs.unobserve(en.target); }
    }
  }, { root: $('#app'), rootMargin: '400px 0px' });
  state._observer = obs;

  for (const c of cats) {
    const rail = el('section', 'rail');
    rail.appendChild(el('h2', 'rail-title', c.name));
    const scroller = el('div', 'rail-scroller');
    const track = el('div', 'rail-track');
    track.dataset.catId = c.id;
    // iskelet
    for (let i = 0; i < 6; i++) { const sk = el('div', 'ncard skel' + (poster ? ' poster' : '')); sk.appendChild(el('div', 'thumb')); track.appendChild(sk); }
    const left = el('div', 'rail-arrow left', '‹');
    const right = el('div', 'rail-arrow right', '›');
    left.addEventListener('click', () => track.scrollBy({ left: -track.clientWidth * 0.85, behavior: 'smooth' }));
    right.addEventListener('click', () => track.scrollBy({ left: track.clientWidth * 0.85, behavior: 'smooth' }));
    scroller.append(left, track, right);
    rail.appendChild(scroller);
    rows.appendChild(rail);
    obs.observe(scroller);
  }

  if (poster) addContinueRail();
}

function renderCurrentView() {
  if (state.section === 'fav') return loadFav();
  renderCategoryView();
}

// TÜM bölümler — sol kategori listesi + seçili kategorinin içerik ızgarası
// live → landscape kanal kartı, movie/series → afiş (2:3)
async function renderCategoryView() {
  if (state._observer) { state._observer.disconnect(); state._observer = null; }
  $('#hero').classList.add('hidden');
  const rows = $('#rows');
  const sec = state.section;
  const poster = sec === 'movie' || sec === 'series';
  rows.classList.remove('with-hero');
  rows.classList.add('live-mode');
  rows.innerHTML = '';

  const realCats = state.catOrder.filter((c) => (state.groups.get(c.id) || []).length);
  if (!realCats.length) { rows.classList.remove('live-mode'); rows.innerHTML = '<div class="rows-empty">İçerik yok.</div>'; return; }

  // "Devam İzle" sanal kategorisi (film/dizi)
  let recent = [];
  if (poster) {
    recent = (await store.getRecent(state.profile.id))
      .filter((r) => r.section === sec && r.pos > 30 && (!r.dur || r.pos / r.dur < 0.92));
    if (sec !== state.section) return; // bölüm değişti
  }
  const cats = [...(recent.length ? [{ id: '__recent', name: '▶ Devam İzle', recent: true }] : []), ...realCats];

  const view = el('div', 'live-view');
  const side = el('aside', 'cat-list');
  side.appendChild(el('div', 'cat-list-head', 'Kategoriler'));
  const grid = el('div', 'chan-grid' + (poster ? ' poster-grid' : ''));
  const btns = [];

  // sayfalama (büyük kategoriler için scroll'da yükle)
  const PAGE = 120;
  let pageItems = [], pageIdx = 0;
  const renderMore = () => {
    const slice = pageItems.slice(pageIdx, pageIdx + PAGE);
    for (const it of slice) {
      if (it.__recent) {
        const prog = it.dur ? it.pos / it.dur : 0;
        const ci = { id: it.id, name: it.name, logo: it.logo, kind: sec, raw: { container_extension: it.container } };
        grid.appendChild(makeCard(ci, poster, prog, () => resumeRecent(it)));
      } else {
        grid.appendChild(makeCard(it, poster));
      }
    }
    pageIdx += slice.length;
  };
  grid.addEventListener('scroll', () => {
    if (pageIdx < pageItems.length && grid.scrollTop + grid.clientHeight >= grid.scrollHeight - 500) renderMore();
  });

  const showCat = (c, btn) => {
    btns.forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    state._liveCat = c.id;
    pageItems = c.recent ? recent.map((r) => ({ ...r, __recent: true })) : (state.groups.get(c.id) || []);
    pageIdx = 0;
    grid.innerHTML = '';
    const head = el('div', 'chan-head');
    head.appendChild(el('h2', null, c.name));
    head.appendChild(el('span', 'ch-count', `${pageItems.length} ${poster ? 'içerik' : 'kanal'}`));
    grid.appendChild(head);
    renderMore();
    grid.scrollTop = 0;
  };

  for (const c of cats) {
    const btn = el('button', 'cat-item' + (c.recent ? ' cat-recent' : ''));
    btn.appendChild(el('span', 'ci-name', c.name));
    const cnt = c.recent ? recent.length : (state.groups.get(c.id) || []).length;
    btn.appendChild(el('span', 'ci-count', String(cnt)));
    btn.addEventListener('click', () => showCat(c, btn));
    btns.push(btn);
    side.appendChild(btn);
  }
  view.append(side, grid);
  rows.appendChild(view);

  const idx = Math.max(0, cats.findIndex((c) => c.id === state._liveCat));
  btns[idx].click();
}

// "Devam İzle" rayı — film/dizi bölümlerinde yarıda kalanlar (landscape + progress)
async function addContinueRail() {
  const sec = state.section;
  const recent = (await store.getRecent(state.profile.id))
    .filter((r) => r.section === sec && r.pos > 30 && (!r.dur || r.pos / r.dur < 0.92));
  if (state.section !== sec || !recent.length) return;
  if ($('#rows .rail-continue')) return;

  const rail = el('section', 'rail rail-continue');
  rail.appendChild(el('h2', 'rail-title', 'Devam İzle'));
  const scroller = el('div', 'rail-scroller');
  const track = el('div', 'rail-track');
  for (const r of recent) {
    const it = { id: r.id, name: r.name, logo: r.logo, kind: sec, raw: { container_extension: r.container } };
    const prog = r.dur ? r.pos / r.dur : 0;
    track.appendChild(makeCard(it, false, prog, () => resumeRecent(r)));
  }
  const left = el('div', 'rail-arrow left', '‹');
  const right = el('div', 'rail-arrow right', '›');
  left.addEventListener('click', () => track.scrollBy({ left: -track.clientWidth * 0.85, behavior: 'smooth' }));
  right.addEventListener('click', () => track.scrollBy({ left: track.clientWidth * 0.85, behavior: 'smooth' }));
  scroller.append(left, track, right);
  rail.appendChild(scroller);
  $('#rows').prepend(rail);
}

function resumeRecent(r) {
  const it = { id: r.id, name: r.name, logo: r.logo, kind: r.section, raw: { container_extension: r.container } };
  startPlay(it, r.url, false, { ...r }, r.pos || 0);
}

function populateRail(scroller) {
  const track = scroller.querySelector('.rail-track');
  const catId = track.dataset.catId;
  const items = (state.groups.get(catId) || []).slice(0, 40);
  const poster = state.section === 'movie' || state.section === 'series';
  track.innerHTML = '';
  for (const it of items) track.appendChild(makeCard(it, poster));
}

function makeCard(it, poster, progress, onClick) {
  const card = el('div', 'ncard' + (poster ? ' poster' : ''));
  card.dataset.key = itemKey(it);
  card.tabIndex = 0;
  if (itemKey(it) === state.nowKey) card.classList.add('playing');
  const thumb = el('div', 'thumb');
  if (poster) {
    if (it.logo) thumb.style.backgroundImage = `url("${it.logo}")`;
    else { thumb.classList.add('noart'); thumb.appendChild(el('div', 'poster-fallback', it.name)); }
  } else {
    if (it.logo) { const lg = el('div', 'logo'); lg.style.backgroundImage = `url("${it.logo}")`; thumb.appendChild(lg); }
    else thumb.appendChild(el('div', 'ph', '📺'));
  }
  if (progress > 0 && progress < 1) {
    const bar = el('div', 'progress'); const i = el('i'); i.style.width = Math.round(progress * 100) + '%'; bar.appendChild(i); thumb.appendChild(bar);
  }
  card.appendChild(thumb);
  card.appendChild(el('div', 'label', it.name));
  card.addEventListener('click', () => (onClick ? onClick() : onSelect(it)));
  card.addEventListener('keydown', (e) => { if (e.key === 'Enter') card.click(); });
  return card;
}

async function showHero(it) {
  state._heroItem = it;
  const sec = state.section;
  $('#hero').classList.remove('hidden');
  $('#hero-bg').style.backgroundImage = it.logo ? `url("${it.logo}")` : 'none';
  $('#hero-tag').textContent = SECTION_TITLES[sec];
  $('#hero-title').textContent = it.name;
  $('#hero-meta').innerHTML = '';
  $('#hero-plot').textContent = '';
  // backdrop + meta + özet (async zenginleştir)
  try {
    const d = sec === 'series' ? await state.xt.seriesInfo(it.id) : await state.xt.vodInfo(it.id);
    if (state.section !== sec || state._heroItem !== it) return; // bölüm değiştiyse iptal
    const info = (d && d.info) || {};
    const bd = (info.backdrop_path && info.backdrop_path[0]) || info.movie_image;
    if (bd) $('#hero-bg').style.backgroundImage = `url("${bd}")`;
    $('#hero-meta').innerHTML = buildMeta(info);
    $('#hero-plot').textContent = info.plot || info.description || '';
  } catch {}
}

// ---------- arama ----------
function renderSearch() {
  if (state._observer) { state._observer.disconnect(); state._observer = null; }
  $('#hero').classList.add('hidden');
  const rows = $('#rows');
  rows.classList.remove('with-hero');
  rows.classList.remove('live-mode');
  const poster = state.section === 'movie' || state.section === 'series';
  const matches = state.allItems.filter((i) => i.name.toLowerCase().includes(state.search)).slice(0, 120);
  rows.innerHTML = '';
  if (!matches.length) { rows.innerHTML = '<div class="rows-empty">Sonuç yok</div>'; return; }
  const grid = el('div', 'search-grid');
  for (const it of matches) grid.appendChild(makeCard(it, poster));
  rows.appendChild(grid);
}

// ---------- favoriler ----------
async function loadFav() {
  $('#hero').classList.add('hidden');
  const rows = $('#rows'); rows.classList.remove('with-hero');
  const favs = (await store.getFavorites()).filter((f) => f.profileId === state.profile.id);
  rows.innerHTML = '';
  if (!favs.length) { rows.innerHTML = '<div class="rows-empty">Listen boş. Oynatırken ★ ile ekle.</div>'; return; }
  const grid = el('div', 'search-grid');
  for (const f of favs) {
    const poster = f.section === 'movie' || f.section === 'series';
    const it = { id: f.id, name: f.name, logo: f.logo, kind: f.section, url: f.url, epgId: f.epgId, raw: { container_extension: f.container } };
    const card = makeCard(it, poster, 0, () => playFavorite(f));
    grid.appendChild(card);
  }
  rows.appendChild(grid);
}

// ================= SEÇİM & OYNATMA =================
function itemKey(it) { return `${state.profile.id}:${state.section}:${it.id || it.url}`; }

function onSelect(it) {
  // M3U'da meta yok → direkt oynat
  if (state.profile.type === 'm3u') return startPlay(it, it.url, it.kind === 'live');
  if (state.section === 'live') return startPlay(it, state.xt.liveUrl(it.id, 'ts'), true);
  if (state.section === 'movie') return openMovieDetail(it);
  if (state.section === 'series') return openSeriesDetail(it);
}

// ============ DETAY SAYFASI ============
function escapeHtml(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function pad2(n) { return String(n).padStart(2, '0'); }

function openDetail() { $('#detail').classList.remove('hidden'); $('.dt-scroll').scrollTop = 0; }
function closeDetail() { $('#detail').classList.add('hidden'); }

function showDetailBase(it) {
  openDetail();
  state._detail = { it };
  $('#dt-backdrop').style.backgroundImage = it.logo ? `url("${it.logo}")` : 'none';
  $('#dt-title').textContent = it.name;
  $('#dt-meta').innerHTML = '';
  $('#dt-plot').textContent = '';
  $('#dt-people').innerHTML = '';
  $('#dt-episodes').innerHTML = '';
  $('#dt-trailer').classList.add('hidden');
  $('#dt-play').textContent = '▶ Oynat';
  updateDetailFav(it);
}

function buildMeta(info) {
  const bits = [];
  const year = String(info.releasedate || info.release_date || '').slice(0, 4);
  if (year && /^\d{4}$/.test(year)) bits.push(`<span class="chip">${year}</span>`);
  if (info.duration) bits.push(`<span class="chip">${escapeHtml(info.duration)}</span>`);
  else if (info.episode_run_time) bits.push(`<span class="chip">${escapeHtml(info.episode_run_time)} dk</span>`);
  const r = parseFloat(info.rating);
  if (r > 0) bits.push(`<span class="chip rating">★ ${r.toFixed(1)}</span>`);
  if (info.genre) bits.push(`<span class="chip">${escapeHtml(info.genre)}</span>`);
  if (info.age) bits.push(`<span class="chip badge">${escapeHtml(info.age)}</span>`);
  return bits.join('<span class="dot"></span>');
}

function buildPeople(info) {
  const out = [];
  if (info.director) out.push(`<div><span class="lbl">Yönetmen:</span> <b>${escapeHtml(info.director)}</b></div>`);
  const cast = info.cast || info.actors;
  if (cast) out.push(`<div><span class="lbl">Oyuncular:</span> <b>${escapeHtml(cast)}</b></div>`);
  if (info.country) out.push(`<div><span class="lbl">Ülke:</span> <b>${escapeHtml(info.country)}</b></div>`);
  return out.join('');
}

function fillDetail({ backdrop, title, meta, plot, people, trailer }) {
  if (backdrop) $('#dt-backdrop').style.backgroundImage = `url("${backdrop}")`;
  if (title) $('#dt-title').textContent = title;
  $('#dt-meta').innerHTML = meta || '';
  $('#dt-plot').textContent = plot || '';
  $('#dt-people').innerHTML = people || '';
  state._detailTrailer = trailer && /^https?:/.test(trailer) ? trailer : (trailer ? `https://www.youtube.com/watch?v=${trailer}` : null);
  $('#dt-trailer').classList.toggle('hidden', !state._detailTrailer);
}

function setDetailPlay(fn, label) { const b = $('#dt-play'); b.onclick = fn; if (label) b.textContent = label; }

async function openMovieDetail(it) {
  showDetailBase(it);
  // liste verisinden hızlı meta
  const q = it.raw || {};
  $('#dt-meta').innerHTML = buildMeta(q);
  try {
    const d = await state.xt.vodInfo(it.id);
    const info = d.info || {}; const md = d.movie_data || {};
    fillDetail({
      backdrop: (info.backdrop_path && info.backdrop_path[0]) || info.movie_image || it.logo,
      title: info.name || it.name,
      meta: buildMeta(info),
      plot: info.plot || info.description || '',
      people: buildPeople(info),
      trailer: info.youtube_trailer,
    });
    const ext = md.container_extension || (it.raw && it.raw.container_extension) || 'mp4';
    const url = state.xt.vodUrl(it.id, ext);
    const land = (info.backdrop_path && info.backdrop_path[0]) || it.logo;
    const nm = info.name || it.name;
    setDetailPlay(() => startPlay({ ...it, name: nm }, url, false,
      { key: itemKey(it), section: 'movie', name: nm, logo: land, id: it.id, url, container: ext }));
  } catch (e) {
    const ext = (it.raw && it.raw.container_extension) || 'mp4';
    const url = state.xt.vodUrl(it.id, ext);
    setDetailPlay(() => startPlay(it, url, false,
      { key: itemKey(it), section: 'movie', name: it.name, logo: it.logo, id: it.id, url, container: ext }));
  }
}

async function openSeriesDetail(it) {
  showDetailBase(it);
  try {
    const d = await state.xt.seriesInfo(it.id);
    const info = d.info || {}; const episodes = d.episodes || {};
    fillDetail({
      backdrop: (info.backdrop_path && info.backdrop_path[0]) || info.cover || it.logo,
      title: info.name || it.name,
      meta: buildMeta(info),
      plot: info.plot || info.description || '',
      people: buildPeople(info),
      trailer: info.youtube_trailer,
    });
    renderEpisodes(it, episodes);
    const keys = Object.keys(episodes).sort((a, b) => +a - +b);
    if (keys.length && episodes[keys[0]].length) {
      const ep = episodes[keys[0]][0];
      setDetailPlay(() => playSeriesEp(it, ep), '▶ 1. Bölümü Oynat');
    }
  } catch (e) {
    $('#dt-plot').textContent = 'Bölüm bilgisi alınamadı: ' + (e.message || e);
  }
}

function renderEpisodes(it, episodes) {
  const box = $('#dt-episodes'); box.innerHTML = '';
  const keys = Object.keys(episodes).sort((a, b) => +a - +b);
  if (!keys.length) return;
  const top = el('div', 'dt-eptop');
  top.appendChild(el('h2', null, 'Bölümler'));
  const list = el('div', 'dt-eplist');
  const renderSeason = (k) => { list.innerHTML = ''; for (const ep of episodes[k]) list.appendChild(makeEpRow(it, ep, k)); };
  if (keys.length === 1) {
    top.appendChild(el('span', 'dt-season-label muted', 'Sezon ' + keys[0]));
  } else {
    const sel = el('select', 'dt-season');
    for (const k of keys) sel.appendChild(new Option('Sezon ' + k, k));
    sel.addEventListener('change', () => renderSeason(sel.value));
    top.appendChild(sel);
  }
  box.appendChild(top);
  box.appendChild(list);
  renderSeason(keys[0]);
}

function makeEpRow(it, ep, season) {
  const row = el('div', 'ep'); row.tabIndex = 0;
  const thumbUrl = (ep.info && (ep.info.movie_image || ep.info.cover_big)) || '';
  if (thumbUrl) { const th = el('div', 'epthumb'); th.style.backgroundImage = `url("${thumbUrl}")`; row.appendChild(th); }
  else row.appendChild(el('div', 'epnum', String(ep.episode_num)));
  const body = el('div', 'epbody');
  body.appendChild(el('div', 'eptitle', `${ep.episode_num}. ${ep.title || 'Bölüm'}`));
  const plot = (ep.info && ep.info.plot) || '';
  if (plot) body.appendChild(el('div', 'epplot', plot));
  row.appendChild(body);
  row.appendChild(el('div', 'epplay', '▶'));
  row.addEventListener('click', () => playSeriesEp(it, ep, season));
  row.addEventListener('keydown', (e) => { if (e.key === 'Enter') row.click(); });
  return row;
}

function playSeriesEp(it, ep, season) {
  const url = state.xt.seriesUrl(ep.id, ep.container_extension || 'mp4');
  const tag = `S${pad2(season || ep.season || 1)}B${pad2(ep.episode_num)}`;
  const nm = `${it.name} · ${tag}${ep.title ? ' · ' + ep.title : ''}`;
  const logo = (ep.info && ep.info.movie_image) || it.logo;
  startPlay({ ...it, name: nm }, url, false,
    { key: `${state.profile.id}:series:${it.id}:ep:${ep.id}`, section: 'series', name: nm, logo, id: it.id, url, seriesId: it.id, epId: ep.id });
}

async function updateDetailFav(it) {
  const on = await store.isFavorite(itemKey(it));
  const b = $('#dt-fav');
  b.classList.toggle('on', on);
  b.textContent = on ? '✓ Listemde' : '＋ Listeme Ekle';
}

async function toggleDetailFav() {
  const it = state._detail && state._detail.it; if (!it) return;
  const now = await store.toggleFavorite({
    key: itemKey(it), profileId: state.profile.id, section: state.section,
    name: it.name, logo: it.logo, id: it.id, url: it.url || '', epgId: it.epgId || '',
    container: it.raw && it.raw.container_extension,
  });
  const b = $('#dt-fav'); b.classList.toggle('on', now); b.textContent = now ? '✓ Listemde' : '＋ Listeme Ekle';
}

function openPlayer() { $('#player-overlay').classList.remove('hidden'); }

function closePlayer() {
  window.mpv.command(['quit']);   // mpv penceresini kapat
  $('#player-overlay').classList.add('hidden');
  $('#po-error').classList.add('hidden');
  state.nowKey = null; state._nowItem = null;
  document.querySelectorAll('.ncard').forEach((c) => c.classList.remove('playing'));
}

// Paneli hazırla + mpv'ye yükle
function loadInMpv(it, url, isLive) {
  state._lastPlay = { it, url, isLive };
  state._isLive = isLive;
  state._dur = 0;
  openPlayer();
  $('#po-error').classList.add('hidden');
  setNpStatus('Yükleniyor…');
  $('#now-title').textContent = it.name;
  $('#live-badge').classList.toggle('hidden', !isLive);
  // sanat görseli
  const art = $('#np-art');
  if (it.logo) { art.style.backgroundImage = `url("${it.logo}")`; art.classList.toggle('contain', isLive); }
  else { art.style.backgroundImage = 'none'; }
  // canlıda seek kapalı
  $('#tp-seek').disabled = isLive; $('#tp-seek').value = 0;
  $('#tp-cur').textContent = '0:00'; $('#tp-dur').textContent = isLive ? 'CANLI' : '0:00';
  $('#btn-back10').style.display = $('#btn-fwd10').style.display = isLive ? 'none' : '';
  // hız sıfırla (mpv hızı dosyalar arası korur)
  $('#sel-speed').value = '1'; window.mpv.set('speed', 1);
  // track menülerini sıfırla
  $('#sel-audio').innerHTML = '<option>—</option>';
  $('#sel-sub').innerHTML = '<option value="no">Kapalı</option>';
  $('#sel-quality').innerHTML = '<option>—</option>';
  window.mpv.load(url);
}

function startPlay(it, url, isLive, recentEntry, resumeFrom) {
  state.nowKey = itemKey(it);
  state._retried = false;
  state._resumeTo = resumeFrom || 0;
  state._recentKey = (!isLive && recentEntry) ? recentEntry.key : null;
  state._lastSavedPos = 0;
  document.querySelectorAll('.ncard').forEach((c) => c.classList.toggle('playing', c.dataset.key === state.nowKey));
  $('#now-epg').textContent = ''; $('#now-epg').className = 'now-epg';
  state._nowItem = it;
  loadInMpv(it, url, isLive);
  state._lastPlay = { it, url, isLive, recentEntry, resumeFrom: resumeFrom || 0 };
  refreshFavButton();
  if (isLive && state.xt && it.id) loadNowEpgByStream(it.id);
  if (!isLive && recentEntry) store.addRecent({ ...recentEntry, profileId: state.profile.id });
}

// ---------- EPG ----------
async function loadNowEpgByStream(streamId) {
  try { const data = await state.xt.shortEpg(streamId, 4); renderEpg(data && data.epg_listings); } catch {}
}
function renderEpg(listings) {
  if (!listings || !listings.length) return;
  const dec = (s) => { try { return atob(s); } catch { return s; } };
  const lines = listings.slice(0, 4).map((e) => {
    const start = e.start ? new Date(e.start.replace(' ', 'T')).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : '';
    return `${start}  ${dec(e.title)}`;
  });
  const box = $('#now-epg'); box.className = 'now-epg epg-text'; box.textContent = lines.join('\n');
}

// ---------- favori ----------
async function refreshFavButton() {
  const it = state._nowItem; if (!it) return;
  const on = await store.isFavorite(itemKey(it));
  const btn = $('#btn-fav'); btn.classList.toggle('on', on); btn.title = on ? 'Listemden çıkar' : 'Listeme ekle';
}
async function toggleNowFavorite() {
  const it = state._nowItem; if (!it) return;
  const now = await store.toggleFavorite({
    key: itemKey(it), profileId: state.profile.id, section: state.section,
    name: it.name, logo: it.logo, id: it.id, url: it.url || '', epgId: it.epgId || '',
    container: it.raw && it.raw.container_extension,
  });
  const btn = $('#btn-fav'); btn.classList.toggle('on', now); btn.title = now ? 'Listemden çıkar' : 'Listeme ekle';
}

function playFavorite(f) {
  const it = { id: f.id, name: f.name, logo: f.logo, kind: f.section, url: f.url, epgId: f.epgId, raw: { container_extension: f.container } };
  state.section = f.section;
  if (f.section === 'live') return startPlay(it, f.url || state.xt.liveUrl(f.id, 'ts'), true);
  if (f.url) return startPlay(it, f.url, false, { key: itemKey(it), section: f.section, name: f.name, logo: f.logo, id: f.id, url: f.url, container: f.container });
  if (f.section === 'movie') return openMovieDetail(it);
  if (f.section === 'series') return openSeriesDetail(it);
}

// ================= BOOT =================
async function boot() {
  initLogin();
  initApp();
  await renderProfiles();
  // otomatik bağlan: son kullanılan profil
  const last = await store.getLastProfile();
  if (last) connectProfile(last, false);
}
boot();
