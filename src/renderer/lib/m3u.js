// Basit ama dayanıklı M3U / M3U_PLUS ayrıştırıcı.
// #EXTINF satırındaki tvg-* ve group-title özniteliklerini çıkarır.

export function parseM3U(text) {
  const lines = text.split(/\r?\n/);
  const items = [];
  let cur = null;

  for (let raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    if (line.startsWith('#EXTINF')) {
      cur = parseExtInf(line);
    } else if (line.startsWith('#EXTGRP')) {
      // #EXTGRP:Group adı — bazı playlistlerde grup ayrı satırda
      if (cur) cur.group = line.slice(8).trim() || cur.group;
    } else if (line.startsWith('#')) {
      // diğer yorum satırlarını yok say
      continue;
    } else if (cur) {
      cur.url = line;
      cur.id = cur.id || `${items.length}`;
      items.push(cur);
      cur = null;
    }
  }
  return items;
}

function parseExtInf(line) {
  // #EXTINF:-1 tvg-id="x" tvg-name="y" tvg-logo="z" group-title="G",Kanal Adı
  const commaIdx = line.indexOf(',');
  const attrsPart = commaIdx >= 0 ? line.slice(0, commaIdx) : line;
  const name = commaIdx >= 0 ? line.slice(commaIdx + 1).trim() : '';

  const attrs = {};
  const re = /([a-zA-Z0-9_-]+)="([^"]*)"/g;
  let m;
  while ((m = re.exec(attrsPart)) !== null) {
    attrs[m[1].toLowerCase()] = m[2];
  }

  return {
    id: attrs['tvg-id'] || '',
    name: attrs['tvg-name'] || name || 'İsimsiz',
    logo: attrs['tvg-logo'] || '',
    epgId: attrs['tvg-id'] || '',
    group: attrs['group-title'] || 'Diğer',
    url: '',
    kind: guessKind(attrs['group-title'] || '', name),
  };
}

// VOD/dizi mi canlı mı kabaca tahmin (M3U'da resmi ayrım yok)
function guessKind(group, name) {
  const g = (group + ' ' + name).toLowerCase();
  if (/\b(vod|movie|film|sinema)\b/.test(g)) return 'movie';
  if (/\b(series|dizi|season|sezon|episode|bölüm)\b/.test(g)) return 'series';
  return 'live';
}

// Kanalları gruba göre kümele → [{group, items:[...]}], alfabetik
export function groupByCategory(items) {
  const map = new Map();
  for (const it of items) {
    const g = it.group || 'Diğer';
    if (!map.has(g)) map.set(g, []);
    map.get(g).push(it);
  }
  return [...map.entries()]
    .map(([group, items]) => ({ group, items }))
    .sort((a, b) => a.group.localeCompare(b.group, 'tr'));
}
