# Mad-IPTV

Yerel çalışan, açık kaynak IPTV oynatıcı (Electron). Xtream Codes ve M3U / M3U_PLUS destekler.

> **Not:** Bu uygulama yalnızca bir **oynatıcıdır**. Hiçbir içerik, kanal listesi veya
> abonelik içermez; kendi yasal Xtream/M3U bilgilerini sen girersin.

## Ön koşullar

- [Node.js](https://nodejs.org/) 18+
- [mpv](https://mpv.io/) — VOD/dizi oynatma motoru olarak kullanılır
  ```bash
  brew install mpv        # macOS (Apple Silicon: /opt/homebrew/bin/mpv)
  ```

## Çalıştırma

```bash
npm install            # ilk sefer
npm start              # uygulamayı aç
```

## Mac .app paketi üretmek

```bash
npm run dist           # dist/ altında paket
```

## Özellikler (v0.1)

- Xtream Codes (host + kullanıcı + şifre) **ve** M3U link ile bağlanma
- m3u_plus linkini otomatik Xtream'e çevirme (daha zengin veri)
- Canlı TV + kategoriler, Film (VOD), Dizi (sezon/bölüm)
- Arama, favoriler (yerel `store.json`), kayıtlı profiller
- EPG: oynatılan kanalın yakın program akışı (Xtream short_epg)
- Oynatma motoru otomatik: HLS → hls.js, MPEG-TS → mpegts.js, mp4 → native, VOD → mpv

## Mimari

```
src/
  main.js              Electron ana süreç — pencere + CORS'suz fetch köprüsü + store.json
  mpv.js               Harici mpv süreci kontrolü (JSON IPC)
  preload.js           Güvenli IPC API (window.api)
  renderer/
    index.html         Arayüz iskeleti
    styles.css         Tema
    app.js             UI kontrolcüsü (durum, login, grid, oynatma)
    lib/
      xtream.js        Xtream Codes API istemcisi
      m3u.js           M3U / m3u_plus ayrıştırıcı
      player.js        hls.js / mpegts.js / native seçici
      store.js         Favori + profil kalıcı depo
mpv-config/
  mpv.conf             Projeye özel mpv ayarları (global mpv'ye dokunmaz)
```

> İstersen mpv arayüzünü [uosc](https://github.com/tomasklaen/uosc) ile zenginleştirebilirsin:
> uosc'u `mpv-config/scripts/` altına kur ve `mpv.conf` içinde `osc=no` yap.

## Bilinen kısıtlar

- `.mkv` VOD Chromium'da oynamaz → mpv'ye düşer (bu yüzden mpv ön koşul).
- Abonelikte `max_connections` kaç ise aynı anda o kadar cihaz oynatabilir.
- `webSecurity:false` — yerel kişisel kullanım için CORS/mixed-content gevşetildi.

## Lisans

[MIT](LICENSE) © MadDuck54
