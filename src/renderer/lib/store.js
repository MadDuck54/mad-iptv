// Yerel kalıcı ayar/favori deposu (ana süreçteki store.json'a yazar).

let cache = null;

export async function loadStore() {
  if (cache) return cache;
  cache = (await window.api.storeGet()) || {};
  if (!cache.favorites) cache.favorites = [];
  if (!cache.profiles) cache.profiles = [];
  if (!cache.recent) cache.recent = [];
  return cache;
}

async function persist() {
  await window.api.storeSet(cache);
}

export async function getProfiles() {
  await loadStore();
  return cache.profiles;
}

export async function saveProfile(profile) {
  await loadStore();
  // profile: {id, label, type:'xtream'|'m3u', host?, username?, password?, url?}
  const idx = cache.profiles.findIndex((p) => p.id === profile.id);
  if (idx >= 0) cache.profiles[idx] = profile;
  else cache.profiles.push(profile);
  cache.lastProfileId = profile.id;
  await persist();
}

export async function removeProfile(id) {
  await loadStore();
  cache.profiles = cache.profiles.filter((p) => p.id !== id);
  await persist();
}

export async function getLastProfile() {
  await loadStore();
  return cache.profiles.find((p) => p.id === cache.lastProfileId) || null;
}

// --- Favoriler (kanal anahtarı: type:profileId:streamId) ---
export async function isFavorite(key) {
  await loadStore();
  return cache.favorites.some((f) => f.key === key);
}

export async function toggleFavorite(entry) {
  await loadStore();
  const i = cache.favorites.findIndex((f) => f.key === entry.key);
  if (i >= 0) cache.favorites.splice(i, 1);
  else cache.favorites.push(entry);
  await persist();
  return i < 0; // true = artık favori
}

export async function getFavorites() {
  await loadStore();
  return cache.favorites;
}

// --- Devam İzle (recent) ---
export async function addRecent(entry) {
  await loadStore();
  cache.recent = cache.recent.filter((r) => r.key !== entry.key);
  cache.recent.unshift({ ...entry, ts: entry.ts || 0 });
  if (cache.recent.length > 24) cache.recent.length = 24;
  await persist();
}

export async function setRecentProgress(key, pos, dur) {
  await loadStore();
  const r = cache.recent.find((x) => x.key === key);
  if (!r) return;
  r.pos = pos; r.dur = dur;
  // bittiyse (>%92) listeden düş
  if (dur > 0 && pos / dur > 0.92) cache.recent = cache.recent.filter((x) => x.key !== key);
  await persist();
}

export async function getRecent(profileId) {
  await loadStore();
  return cache.recent.filter((r) => r.profileId === profileId);
}

export async function removeRecent(key) {
  await loadStore();
  cache.recent = cache.recent.filter((r) => r.key !== key);
  await persist();
}
