// Önizleme (Preview) paneli bir seferde yalnızca kayıtlı HTML dosyasını sunar;
// sayfanın kardeş <script src="..."> istekleri 404 döner ve oynatıcı hiç
// başlamaz. Bu yüzden prova sayfalarını tarayıcıda gözle doğrulamak için önce
// tek dosyaya çevirmek gerekir. Betik bunu yapar.
//
// Kullanım:  node tests/onizleme-olustur.js <senaryo> [cikti]
// Örnek:     node tests/onizleme-olustur.js zincir-kopuk
// Çıktı bilinçli olarak tests/ altına yazılır: .vercelignore bu klasörü yayına
// almaz, böylece prova dosyası canlıya sızmaz.
const fs = require('fs');
const path = require('path');

const kok = path.join(__dirname, '..');
const oku = f => fs.readFileSync(path.join(kok, f), 'utf8');

const senaryo = process.argv[2] || 'zincir-kopuk';
const cikti = process.argv[3] || path.join('tests', 'onizleme.html');
const ciktiYolu = path.resolve(kok, cikti);

// "canli" modu Canlı durum ekranını örnek verilerle önizler: üç şube yan yana
// gelsin ki "çalıyor / duraklatıldı / çevrimdışı" ve tazelik yazısı gözle
// doğrulanabilsin.
if (senaryo === 'canli') {
  const V = require(path.join(kok, 'radyo-panel-views.js'));
  const simdi = Date.now();
  const snOnce = n => new Date(simdi - n * 1000).toISOString();
  const sube = (id, label, ek) => ({
    id, brand_id: 'b1', label, player_key: 'a1b2c3d4-e5f6-4a7b-8c9d-00000000000' + id.slice(1),
    last_seen_at: snOnce(8), open_time: '09:00:00', close_time: '22:00:00',
    bound_device_id: null, bound_at: null, first_ip: null, last_ip: '1.2.3.4',
    last_ip_at: snOnce(8), is_playing: true, ...ek
  });
  const D = {
    brands: [{ id: 'b1', name: 'Mokka Coffee', slug: 'mokka-coffee', access_code: 'K', is_active: true }],
    folders: [{ id: 'f1', name: 'Öğleden Sonra', cover_path: null, shuffle: true }],
    tracks: [{ id: 't1', folder_id: 'f1', title: 'Parça', storage_path: 'f1/a.wav', sort_order: 0, duration_sec: 180, cover_path: null }],
    players: [
      // Parça bildirimi yapıyor: gerçekten çalan parça görünmeli. Ayrıca
      // personel cihazdan başka bir liste seçmiş; atanmış kaynak (klasör)
      // yerine çalınan liste yazılmalı.
      sube('p1', 'Alsancak', {
        now_title: 'Kalabalık Caddesi', now_track_id: null, now_at: snOnce(8),
        now_playlist_id: 'l1', now_playlist_name: 'Sabah Akışı'
      }),
      // Bağlı ama duraklatılmış: parça adı iddia edilmemeli.
      sube('p2', 'Karşıyaka', { last_seen_at: snOnce(40), is_playing: false }),
      // Çevrimdışı: bayat kayıt canlı sanılmamalı.
      sube('p3', 'Bornova', { last_seen_at: snOnce(3600), is_playing: true }),
      // Bildirim yok (kurulum eski): kaynak adına düşmeli.
      sube('p4', 'Buca', { last_seen_at: snOnce(20), is_playing: true })
    ],
    broadcast: [{ brand_id: 'b1', folder_id: 'f1', playlist_id: null, updated_at: snOnce(600) }],
    announcements: [],
    playlists: [{ id: 'l1', brand_id: 'b1', name: 'Sabah Akışı', description: null, cover_path: null, shuffle: false, created_at: snOnce(600) }],
    playlistTracks: [], coffeeAttempts: [], subscriptions: [], plans: [], requests: []
  };
  const ui = {
    cover: p => p, ses: p => p, anons: p => p,
    playerBase: () => 'https://www.derinrecord.com/radyo.html?key=',
    brandUrl: s => 'https://www.derinrecord.com/coffee/' + s,
    accept: () => '.mp3,.wav', desteklenenler: () => 'mp3, wav', parcaNotu: () => '',
    now: () => simdi, saglikSonuc: () => null
  };
  const gorunum = V.gorunum({ nav: 'canli', sub: 'subeler', openFolder: null, openBrand: null, openPlaylist: null, q: '' }, D, ui);
  const sayfa3 = `<!doctype html>
<html lang="tr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Panel — canlı durum</title>
<style>
${oku('radyo-panel.css')}
body{background:#0b0b0d;padding:22px;display:block}
.panel{max-width:1080px;margin:0 auto}
</style>
</head>
<body><div class="panel">${gorunum.html}</div></body>
</html>`;
  fs.writeFileSync(ciktiYolu, sayfa3);
  console.log(path.relative(kok, ciktiYolu) + ' yazıldı · canlı durum');
  return;
}

// "pencere" modu oynatıcı yerine panel penceresini önizler: önizleme sunucusu
// tek dosya sunduğu için panel CSS'ini de satır içine alırız.
if (senaryo === 'pencere') {
  const V = require(path.join(kok, 'radyo-panel-views.js'));
  const link = 'https://www.derinrecord.com/radyo.html?key=a1b2c3d4-e5f6-4a7b-8c9d-0000000000aa';
  const pencereli = `<!doctype html>
<html lang="tr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Panel penceresi — dokunuşsuz kurulum</title>
<style>
${oku('radyo-panel.css')}
body{background:#0b0b0d;padding:26px}
.modal-wrap{display:flex}
</style>
</head>
<body>
<div class="modal-wrap open"><div class="modal">
  <h3>Dokunuşsuz yayın kurulumu — Alsancak</h3>
  <div class="modal-body">${V.kioskKurulum(link)}</div>
  <div class="modal-actions"><button class="btn" type="button">KAPAT</button></div>
</div></div>
</body>
</html>`;
  fs.writeFileSync(ciktiYolu, pencereli);
  console.log(path.relative(kok, ciktiYolu) + ' yazıldı · panel penceresi');
  return;
}

// "sube" modu şube çekmecesini önizler: şubeye özel canlı yayın seçicisi ve
// yürürlükteki kaynağın nasıl okunduğu gözle doğrulanabilsin.
if (senaryo === 'sube') {
  const V = require(path.join(kok, 'radyo-panel-views.js'));
  const simdi = Date.now();
  const snOnce = n => new Date(simdi - n * 1000).toISOString();
  const D = {
    brands: [{ id: 'b1', name: 'Mokka Coffee', slug: 'mokka-coffee', access_code: 'K', is_active: true }],
    folders: [
      { id: 'f1', name: 'Öğleden Sonra', cover_path: null, shuffle: true },
      { id: 'f2', name: 'Sabah Açılış', cover_path: null, shuffle: true }
    ],
    tracks: [],
    // Şube kendisine liste atanmış: marka genel yayını klasör olsa da bu şube
    // "Sabah Akışı" listesini çalar.
    players: [{
      id: 'p1', brand_id: 'b1', label: 'Alsancak', player_key: 'a1b2c3d4-e5f6-4a7b-8c9d-0000000000aa',
      last_seen_at: snOnce(8), open_time: '09:00:00', close_time: '22:00:00',
      bound_device_id: 'cihaz-1', bound_at: snOnce(600), first_ip: null, last_ip: '88.240.10.1',
      last_ip_at: snOnce(8), is_playing: true, now_title: 'Kalabalık Caddesi', now_at: snOnce(8),
      now_playlist_id: 'l1', now_playlist_name: 'Sabah Akışı'
    }],
    broadcast: [{ brand_id: 'b1', folder_id: 'f1', playlist_id: null, updated_at: snOnce(600) }],
    playerBroadcast: [{ player_id: 'p1', folder_id: null, playlist_id: 'l1', updated_at: snOnce(300) }],
    announcements: [],
    playlists: [{ id: 'l1', brand_id: 'b1', name: 'Sabah Akışı', description: null, cover_path: null, shuffle: false, created_at: snOnce(600) }],
    playlistTracks: [], coffeeAttempts: [], subscriptions: [], plans: [], requests: []
  };
  const ui = {
    cover: p => p, ses: p => p, anons: p => p,
    playerBase: () => 'https://www.derinrecord.com/radyo.html?key=',
    brandUrl: s => 'https://www.derinrecord.com/coffee/' + s,
    accept: () => '.mp3,.wav', desteklenenler: () => 'mp3, wav', parcaNotu: () => '',
    now: () => simdi, saglikSonuc: () => null
  };
  const sayfa = `<!doctype html>
<html lang="tr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Panel — şube çekmecesi</title>
<style>
${oku('radyo-panel.css')}
body{background:#0b0b0d;padding:26px}
.drawer{position:static;transform:none;width:auto;max-width:560px;margin:0 auto;height:auto}
</style>
</head>
<body>
<aside class="drawer open" aria-hidden="false">
  <button class="btn sm drawer-close" type="button">KAPAT</button>
  ${V.subeCekmecesi('p1', D, ui)}
</aside>
</body>
</html>`;
  fs.writeFileSync(ciktiYolu, sayfa);
  console.log(path.relative(kok, ciktiYolu) + ' yazıldı · şube çekmecesi');
  return;
}

// "yayin" modu yayın başlatma ekranını önizler: dört adım, özet ve mevcut durum
// tablosu bir arada görünsün.
if (senaryo === 'yayin') {
  const V = require(path.join(kok, 'radyo-panel-views.js'));
  const simdi = Date.now();
  const snOnce = n => new Date(simdi - n * 1000).toISOString();
  const sube = (id, label, brandId) => ({
    id, brand_id: brandId, label, player_key: 'a1b2c3d4-e5f6-4a7b-8c9d-00000000000' + id.slice(1),
    last_seen_at: snOnce(12), open_time: '09:00:00', close_time: '22:00:00',
    bound_device_id: null, bound_at: null, first_ip: null, last_ip: null, last_ip_at: null, is_playing: false
  });
  const D = {
    brands: [
      { id: 'b1', name: 'Mokka Coffee', slug: 'mokka-coffee', access_code: 'K', is_active: true },
      { id: 'b2', name: 'Roast & Co', slug: 'roast-co', access_code: 'K', is_active: true }
    ],
    folders: [
      { id: 'f1', name: 'Öğleden Sonra', cover_path: null, shuffle: true },
      { id: 'f2', name: 'Sabah Açılış', cover_path: null, shuffle: true }
    ],
    tracks: [
      { id: 't0', folder_id: 'f1', title: 'Sabah Işığı', storage_path: 'f1/a.wav', sort_order: 0, cover_path: null },
      { id: 't1', folder_id: 'f1', title: 'Yavaş Yağmur', storage_path: 'f1/b.wav', sort_order: 1, cover_path: null },
      { id: 't2', folder_id: 'f1', title: 'Uzun Yol', storage_path: 'f1/c.wav', sort_order: 2, cover_path: null }
    ],
    players: [sube('p1', 'Alsancak', 'b1'), sube('p2', 'Karşıyaka', 'b1'), sube('p9', 'Merkez', 'b2')],
    broadcast: [{ brand_id: 'b1', folder_id: 'f2', playlist_id: null, updated_at: snOnce(900) }],
    playerBroadcast: [{ player_id: 'p1', folder_id: null, playlist_id: 'l1', updated_at: snOnce(300) }],
    announcements: [],
    playlists: [{ id: 'l1', brand_id: 'b1', name: 'Sabah Akışı', description: null, cover_path: null, shuffle: false, created_at: snOnce(600) }],
    playlistTracks: [], coffeeAttempts: [], subscriptions: [], plans: [], requests: []
  };
  const ui = {
    cover: p => p, ses: p => p, anons: p => p,
    playerBase: () => 'https://www.derinrecord.com/radyo.html?key=',
    brandUrl: s => 'https://www.derinrecord.com/coffee/' + s,
    accept: () => '.mp3,.wav', desteklenenler: () => 'mp3, wav', parcaNotu: () => '',
    now: () => simdi, saglikSonuc: () => null
  };
  const govde = V.yayinView({
    nav: 'canli', sub: 'yayin', openFolder: null, openBrand: null, openPlaylist: null, q: '',
    yayin: { brandId: 'b1', playerId: 'p2', kaynak: 'folder:f1', parcaId: 't1' }
  }, D, ui);
  const sayfa = `<!doctype html>
<html lang="tr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Panel — yayın başlat</title>
<style>
${oku('radyo-panel.css')}
body{background:#0b0b0d;padding:26px;display:block}
.panel{max-width:1080px;margin:0 auto}
</style>
</head>
<body><div class="panel">${govde}</div></body>
</html>`;
  fs.writeFileSync(ciktiYolu, sayfa);
  console.log(path.relative(kok, ciktiYolu) + ' yazıldı · yayın başlat');
  return;
}

// "gecmis" modu Bağlantı geçmişi ekranını önizler: şu anki durum, taraf özeti,
// çalışma süresi, haftalık trend ve olay çizelgesi yan yana gelsin ki "sorun
// bizde mi kafede mi" okunuşu gözle doğrulanabilsin.
if (senaryo === 'gecmis') {
  const V = require(path.join(kok, 'radyo-panel-views.js'));
  const simdi = Date.now();
  const dkOnce = n => new Date(simdi - n * 60000).toISOString();
  // Olaylar İstanbul gün sınırına göre kurulur ve hep geçmişe düşer: önizleme
  // günün hangi saatinde açılırsa açılsın aynı geçmişi göstersin, gelecek saatli
  // bir olay "0 sn önce" diye okunmasın.
  const IST = 3 * 3600000;
  const gunBasi = t => Math.floor((t + IST) / 86400000) * 86400000 - IST;
  const bugun = gunBasi(simdi);
  const gunSaat = (geri, saat, dk) =>
    new Date(bugun - geri * 86400000 + (saat * 60 + (dk || 0)) * 60000).toISOString();
  const sube = (id, label, ek) => ({
    id, brand_id: 'b1', label, player_key: 'a1b2c3d4-e5f6-4a7b-8c9d-00000000000' + id.slice(1),
    last_seen_at: dkOnce(1), open_time: '09:00:00', close_time: '22:00:00',
    bound_device_id: 'cihaz-' + id, bound_at: dkOnce(600), first_ip: null,
    last_ip: '88.240.10.' + id.slice(1), last_ip_at: dkOnce(1),
    is_playing: true, now_title: null, now_at: null, now_playlist_id: null, now_playlist_name: null,
    ...ek
  });
  const D = {
    brands: [{ id: 'b1', name: 'Mokka Coffee', slug: 'mokka-coffee', access_code: 'KOD', is_active: true }],
    folders: [{ id: 'f1', name: 'Öğleden Sonra', cover_path: null, shuffle: true }],
    tracks: [{ id: 't1', folder_id: 'f1', title: 'Kalabalık Caddesi', storage_path: 'f1/a.wav', sort_order: 0, duration_sec: 214, cover_path: null }],
    players: [
      // Çalıyor: parça bildirimi taze.
      sube('p1', 'Nişantaşı', { now_title: 'Kalabalık Caddesi', now_at: dkOnce(0.2) }),
      // Kafe cihazdan durdurdu ve bir daha başlamadı: kesinti şeridi bunu gösterir.
      sube('p2', 'Alsancak', { is_playing: false, last_seen_at: dkOnce(3) }),
      // Çevrimdışı: zincir bizim tarafımızda kopuk.
      sube('p3', 'Kadıköy', { is_playing: false, last_seen_at: dkOnce(400), bound_device_id: null }),
      // Dün akşam kurulan yeni cihaz: trendde ölçüm ilk olayla başlar.
      sube('p4', 'Zeytinli', { now_title: 'Kalabalık Caddesi', now_at: dkOnce(0.3) })
    ],
    broadcast: [{ brand_id: 'b1', folder_id: 'f1', playlist_id: null }],
    announcements: [],
    playlists: [{ id: 'l1', brand_id: 'b1', name: 'Sabah Açılış', description: null, cover_path: null, shuffle: false }],
    playlistTracks: [],
    coffeeAttempts: [
      { id: 'c1', brand_id: 'b1', slug: 'mokka-coffee', success: false, ip: '88.240.10.9', created_at: gunSaat(1, 19, 35) },
      { id: 'c2', brand_id: 'b1', slug: 'mokka-coffee', success: true, ip: '88.240.10.9', created_at: gunSaat(1, 19, 40) }
    ],
    subscriptions: [{ id: 's1', brand_id: 'b1', plan_id: 'pl1', status: 'active', trial_ends_at: null, current_end: new Date(simdi + 20 * 86400000).toISOString() }],
    plans: [{ id: 'pl1', name: 'Profesyonel', monthly_price: 1000, per_branch: true, sort_order: 1 }],
    requests: [],
    olaylar: [
      // Nişantaşı: dün açıldı, kafede bir kez durduruldu, bir saat sonra döndü; o
      // saatten beri çalıyor. Takılma bir kez oldu ama yayın durmadı.
      { id: 'e1', player_id: 'p1', brand_id: 'b1', kind: 'acildi', detail: 'Chrome · macOS', at: gunSaat(1, 8, 55) },
      { id: 'e2', player_id: 'p1', brand_id: 'b1', kind: 'caliyor', detail: 'Kalabalık Caddesi · Sabah Açılış', at: gunSaat(1, 9, 0) },
      { id: 'e3', player_id: 'p1', brand_id: 'b1', kind: 'durakladi', detail: 'cihaz', at: gunSaat(1, 12, 0) },
      { id: 'e4', player_id: 'p1', brand_id: 'b1', kind: 'caliyor', detail: 'Kalabalık Caddesi · Sabah Açılış', at: gunSaat(1, 13, 0) },
      { id: 'e5', player_id: 'p1', brand_id: 'b1', kind: 'takildi', detail: 'Kalabalık Caddesi', at: gunSaat(1, 14, 10) },
      { id: 'e6', player_id: 'p1', brand_id: 'b1', kind: 'liste_degisti', detail: 'Öğleden Sonra', at: gunSaat(1, 15, 0) },
      // Alsancak: dün 18:00'de kafede durduruldu ve bir daha başlamadı → şerit.
      { id: 'e7', player_id: 'p2', brand_id: 'b1', kind: 'acildi', detail: 'Chrome · Windows', at: gunSaat(1, 8, 50) },
      { id: 'e8', player_id: 'p2', brand_id: 'b1', kind: 'caliyor', detail: 'Sabah Açılış', at: gunSaat(1, 9, 0) },
      { id: 'e9', player_id: 'p2', brand_id: 'b1', kind: 'durakladi', detail: 'cihaz', at: gunSaat(1, 18, 0) },
      // Kadıköy: üç gündür ses yok, yayın zinciri bizim tarafımızda kopuk.
      { id: 'e10', player_id: 'p3', brand_id: 'b1', kind: 'caliyor', detail: 'Sabah Açılış', at: gunSaat(4, 10, 0) },
      { id: 'e11', player_id: 'p3', brand_id: 'b1', kind: 'durakladi', detail: 'mesai-disi', at: gunSaat(4, 22, 0) },
      { id: 'e12', player_id: 'p3', brand_id: 'b1', kind: 'hata', detail: 'anahtar-yok', at: gunSaat(3, 15, 0) },
      // Zeytinli: dün akşam kuruldu, o saatten beri çalıyor.
      { id: 'e13', player_id: 'p4', brand_id: 'b1', kind: 'acildi', detail: 'Chrome · Android', at: gunSaat(1, 19, 55) },
      { id: 'e14', player_id: 'p4', brand_id: 'b1', kind: 'caliyor', detail: 'Kalabalık Caddesi', at: gunSaat(1, 20, 0) }
    ]
  };
  const ui = {
    cover: () => null, ses: p => p, anons: p => p,
    playerBase: () => 'https://www.derinrecord.com/radyo.html?key=',
    brandUrl: s => 'https://www.derinrecord.com/coffee/' + s,
    accept: () => '.mp3,.wav', desteklenenler: () => 'mp3, wav', parcaNotu: () => '',
    now: () => simdi, saglikSonuc: () => null
  };
  const durum = { nav: 'canli', sub: 'gecmis', openFolder: null, openBrand: null, openPlaylist: null, q: '' };
  const gorunum = V.gorunum(durum, D, ui);
  const sayfa = `<!doctype html>
<html lang="tr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Panel — bağlantı geçmişi</title>
<style>
${oku('radyo-panel.css')}
body{background:#0b0b0d;padding:22px;display:block}
.view{max-width:1080px;margin:0 auto}
</style>
</head>
<body>${V.uyariSeridi(D, ui)}<div class="view">${gorunum.html}</div></body>
</html>`;
  fs.writeFileSync(ciktiYolu, sayfa);
  console.log(path.relative(kok, ciktiYolu) + ' yazıldı · bağlantı geçmişi');
  return;
}

// "kapaklar" modu Yayın klasörleri ekranını önizler: satır içi "KAPAK YOK"
// uyarıları ve yerleşmiş kapakların görünümü gözle doğrulanabilsin.
if (senaryo === 'kapaklar') {
  const V = require(path.join(kok, 'radyo-panel-views.js'));
  const simdi = Date.now();
  const gunOnce = n => new Date(simdi - n * 86400000).toISOString();
  // Gerçek bir depo yerine küçük bir SVG: önizlemede kapaklar yerinde görünsün.
  const sahteKapak = renk => 'data:image/svg+xml,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" fill="' + renk + '"/></svg>');
  const D = {
    brands: [{ id: 'b1', name: 'Mokka Coffee', slug: 'mokka-coffee', access_code: 'K', is_active: true }],
    folders: [
      { id: 'f1', name: 'Sabah Açılış', description: 'Yumuşak giriş', cover_path: 'klasorler/f1.jpg', shuffle: true },
      { id: 'f2', name: 'Öğle Molası', description: 'Kahve arası', cover_path: null, shuffle: false }
    ],
    tracks: [
      { id: 't1', folder_id: 'f1', title: 'Kalabalık Caddesi', storage_path: 'f1/a.wav', sort_order: 0, duration_sec: 214, cover_path: 'tracks/t1.jpg' },
      { id: 't2', folder_id: 'f1', title: 'Sabah Rüzgârı', storage_path: 'f1/b.wav', sort_order: 1, duration_sec: 187, cover_path: null },
      { id: 't3', folder_id: 'f2', title: 'Öğle Molası', storage_path: 'f2/c.mp3', sort_order: 0, duration_sec: 165, cover_path: null },
      { id: 't4', folder_id: 'f2', title: 'İkindi Kahvesi', storage_path: 'f2/d.mp3', sort_order: 1, duration_sec: 203, cover_path: null }
    ],
    players: [], broadcast: [], announcements: [], coffeeAttempts: [], subscriptions: [], plans: [], requests: [],
    playlists: [
      { id: 'l1', brand_id: 'b1', name: 'Sabah Akışı', description: 'Açılış listesi', cover_path: null, shuffle: false, created_at: gunOnce(5) },
      { id: 'l2', brand_id: 'b1', name: 'Akşam Akışı', description: null, cover_path: 'listeler/l2.jpg', shuffle: false, created_at: gunOnce(9) }
    ],
    playlistTracks: [
      { id: 'x1', playlist_id: 'l1', track_id: 't1', sort_order: 0 },
      { id: 'x2', playlist_id: 'l1', track_id: 't3', sort_order: 1 },
      { id: 'x3', playlist_id: 'l2', track_id: 't2', sort_order: 0 }
    ]
  };
  const ui = {
    cover: p => (/^data:/.test(p) ? p : sahteKapak(p.includes('listeler') ? '#c98b3b' : '#3b6bc9')),
    ses: p => p, anons: p => p,
    playerBase: () => 'https://www.derinrecord.com/radyo.html?key=',
    brandUrl: s => 'https://www.derinrecord.com/coffee/' + s,
    accept: () => '.mp3,.wav', desteklenenler: () => 'mp3, wav', parcaNotu: () => '',
    now: () => simdi, saglikSonuc: () => null
  };
  const gorunum = V.gorunum({ nav: 'icerik', sub: 'klasorler', openFolder: null, openBrand: null, openPlaylist: null, q: '' }, D, ui);
  const sayfa4 = `<!doctype html>
<html lang="tr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Panel — yayın klasörleri ve kapaklar</title>
<style>
${oku('radyo-panel.css')}
body{background:#0b0b0d;padding:22px;display:block}
.view{max-width:1080px;margin:0 auto}
</style>
</head>
<body><div class="view">${gorunum.html}</div></body>
</html>`;
  fs.writeFileSync(ciktiYolu, sayfa4);
  console.log(path.relative(kok, ciktiYolu) + ' yazıldı · yayın klasörleri ve kapaklar');
  return;
}

// "marka" modu marka panelini (coffee-marka) önizler: erişim kodunun kilidi ve
// sunumun kendisi. Sayfa yalnız okur ve listeleri gösterir; hangi listelerin
// çalacağını yönetim belirler. Gerçek sayfa gömülür, yalnız sunucu taklit edilir.
if (senaryo === 'marka') {
  const gom = dosya => 'data:text/css;base64,' + Buffer.from(oku(dosya)).toString('base64');
  const sayfaHam = oku('coffee-marka.html');
  const taklit = `
<script>window.DERIN_CONFIG = { supabaseUrl: 'https://prova.test', supabasePublishableKey: 'prova' };</script>
<script>
// ---- Sunucu taklidi: marka paneli yalnız bu uçlarla konuşur ---------------
(() => {
  const COD = 'PROVA';
  const MARKA = {
    brand_id: 'b1', name: 'Brew Lab', slug: 'onizleme-marka.html',
    tagline: 'Üçüncü nesil kahve, ölçülü ritim.', accent_color: '#e8d15a',
    roast_profile: null, tasting_notes: []
  };
  // Kapaklar: sunumun görsel zenginliği (liste kapağı, kahraman arka planı,
  // alt çubuk) önizlemede görünsün diye her listeye yol veriyoruz; gerçek
  // görsel yerine satır içi SVG üretilir, prova ağa çıkmaz.
  const P_LISTELER = [
    { id: 'l1', name: 'Sabah Akışı', cover_path: 'onizleme/l1.svg' },
    { id: 'l2', name: 'Berber Kuşağı', cover_path: 'onizleme/l2.svg' },
    { id: 'l3', name: 'Spor Salonu — Enerji', cover_path: 'onizleme/l3.svg' },
    { id: 'l4', name: 'Akşam Kapanış — Lo-fi', cover_path: 'onizleme/l4.svg' }
  ];
  const P_TRACK = {
    l1: ['Filtre Sabah', 'Uzun Yol'], l2: ['Keskin Makas', 'Tıraş Ritmi'],
    l3: ['Isınma', 'Sprint'], l4: ['Sokak Sessiz', 'Kapanış']
  };
  const kapakSvg = yol => 'data:image/svg+xml;utf8,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="360" height="360">' +
    '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">' +
    '<stop offset="0" stop-color="#5f4d24"/><stop offset="1" stop-color="#141416"/>' +
    '</linearGradient></defs><rect width="360" height="360" fill="url(#g)"/>' +
    '<circle cx="180" cy="180" r="64" fill="none" stroke="#e8d15a" stroke-opacity=".5" stroke-width="3"/>' +
    '<circle cx="180" cy="180" r="13" fill="#e8d15a" fill-opacity=".7"/></svg>');
  const satir = (pl) => P_TRACK[pl.id].map((t, i) => ({
    playlist_id: pl.id, name: pl.name, cover_path: pl.cover_path, created_at: '2026-09-01T09:00:00Z',
    track_id: 't-' + pl.id + '-' + i, title: t, storage_path: pl.id + '/p' + i + '.wav',
    track_cover: null, duration_sec: 200 + i * 10, sort_order: i
  }));
  const listeSatirlari = [].concat(...P_LISTELER.map(satir));

  window.supabase = {
    createClient: () => ({
      rpc(ad, p) {
        if (ad === 'coffee_brand_auth') {
          return Promise.resolve(p.p_code === COD
            ? { data: [MARKA], error: null }
            : { data: [], error: null });
        }
        if (ad === 'coffee_brand_liste') return Promise.resolve({ data: listeSatirlari, error: null });
        return Promise.resolve({ data: [], error: null });
      },
      storage: { from: () => ({ getPublicUrl: p => ({ data: { publicUrl: p ? kapakSvg(p) : '' } }) }) },
      from: () => ({
        select: () => ({ eq: () => ({ order: () => ({ then: r => r({ data: [], error: null }) }) }) })
      })
    })
  };
  // Önizlemede gerçek R2'ye çıkılmaz: kapak yerel SVG, ses kapalı.
  window.DerinR2 = {
    adres: (kova, p) => (p ? (kova === 'radio-covers' ? kapakSvg(p) : '') : null),
    yukle: () => Promise.resolve({ error: { message: 'Önizleme: yazma kapalı.' } }),
    sil: () => Promise.resolve({ error: null })
  };
})();
</script>`;

  // Filigran da tek dosyaya gömülür: önizleme kardeş varlıkları yükleyemez.
  const filigran = 'data:image/png;base64,' + fs.readFileSync(path.join(kok, 'assets/kaset-filigran.png')).toString('base64');
  const markaJs = oku('coffee-marka.js').split('/assets/kaset-filigran.png').join(filigran);

  let gomulu = sayfaHam
    .replace(/(href)="\/branch\.css(?:\?[^"]*)?"/, '$1="' + gom('branch.css') + '"')
    .replace(/(href)="\/auth\.css(?:\?[^"]*)?"/, '$1="' + gom('auth.css') + '"')
    .replace(/(href)="\/glass\.css(?:\?[^"]*)?"/, '$1="' + gom('glass.css') + '"')
    .replace(/(href)="\/marka-sunum\.css(?:\?[^"]*)?"/, '$1="' + gom('marka-sunum.css') + '"')
    .replace(/<script src="\/config\.js"><\/script>/, '<script>window.DERIN_CONFIG = { supabaseUrl: \'https://prova.test\', supabasePublishableKey: \'prova\' };<\/script>')
    .replace(/<script src="https:\/\/cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js@[^"]+"><\/script>/, '')
    // r2-depo.js önizlemeye gömülmez; sahte DerinR2'yi zaten taklit bloğu kurar.
    .replace(/<script src="\/r2-depo\.js\?v=[^"]+"><\/script>\n?/, '')
    .replace(/<script src="\/coffee-marka\.js\?v=[^"]+"><\/script>/, taklit + '\n<script>\n' + markaJs + '\n</script>');

  // Gömme sessizce boşa düşerse prova stilsiz/sunucusuz açılır; bunun yerine dur.
  ['branch.css', 'auth.css', 'glass.css', 'marka-sunum.css', 'coffee-marka.js'].forEach(dis => {
    if (gomulu.includes('"/' + dis) || gomulu.includes('src="/' + dis)) {
      throw new Error(dis + ' gömülmedi: prova sayfasının etiketi değişmiş, onizleme-olustur.js marka modunu güncelleyin');
    }
  });
  if (!gomulu.includes('coffee_brand_liste')) throw new Error('sunucu taklidi gömülmedi');
  if (!gomulu.includes('data:image/png;base64,')) throw new Error('filigran satır içine alınmadı');
  fs.writeFileSync(ciktiYolu, gomulu);
  console.log(path.relative(kok, ciktiYolu) + ' yazıldı · marka paneli · ' + gomulu.length + ' bayt');
  return;
}

// "kabuk" modu panelin bütün kabuğunu önizler: yan menü, üst çubuk ve seçili
// ekran birlikte. Sekmeli bölümlerin menüde tek satır mı birkaç satır mı
// olduğu ve hangi satırın işaretlendiği yalnız burada gözle görülür. Sayfa
// gerçek prova sayfasının kendisidir; yalnız css ve görünüm betiği satır içine
// alınır, böylece menü ve sekmeler tıklanabilir kalır.
if (senaryo === 'kabuk') {
  // Önizleme tek dosya olarak sunulur ve yanındaki dosyaları yükleyemez.
  const kacir = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const gomulu = oku('radyo-panel-prova.html')
    .replace(/(href)="auth\.css(?:\?[^"]*)?"/, '$1="data:text/css;base64,' + Buffer.from(oku('auth.css')).toString('base64') + '"')
    .replace(/(href)="radyo-panel\.css(?:\?[^"]*)?"/, '$1="data:text/css;base64,' + Buffer.from(oku('radyo-panel.css')).toString('base64') + '"')
    .replace(/<script src="radyo-panel-views\.js(?:\?[^"]*)?"><\/script>/, '<script>\n' + oku('radyo-panel-views.js') + '\n</script>')
    .replace(/<script src="plan-takvim\.js(?:\?[^"]*)?"><\/script>/, '<script>\n' + oku('plan-takvim.js') + '\n</script>');
  // Gömme sessizce boşa düşerse önizleme stilsiz/boş açılır; bunun yerine dur.
  ['auth.css', 'radyo-panel.css', 'radyo-panel-views.js', 'plan-takvim.js'].forEach(dis => {
    if (new RegExp('(?:href|src)="' + kacir(dis)).test(gomulu)) {
      throw new Error(dis + ' gömülmedi: prova sayfasının etiketi değişmiş, onizleme-olustur.js kabuk modunu güncelleyin');
    }
  });
  fs.writeFileSync(ciktiYolu, gomulu);
  console.log(path.relative(kok, ciktiYolu) + ' yazıldı · panel kabuğu');
  return;
}

// "harmonik" modu Harmonik Set ekranını örnek katalogla önizler: giriş ve
// Supabase yoktur, gerçek harmonic-mixer.js sahte bir istemciyle çalışır. Böylece
// köprü önerileri, iki adımlı yol, uyumsuz parça paneli ve tempo eğrisi hesap
// açmadan gözle doğrulanabilir.
if (senaryo === 'harmonik') {
  // Katalogda bilinçli olarak: uyumlu bir çift, tonu olmayan bir parça,
  // setle bağlanamayan bir parça ve hızı uzak bir parça var.
  // Sanatçı adları bilinçli olarak gerçek: tarz önerisi paneli Deezer'ın benzer
  // sanatçı algoritmasını kullanıyor ve önizlemede gerçek sonuç göstermeli.
  const KATALOG = [
    { id: 't1', title: 'Kapadokya', artist: 'Mahmut Orhan', camelot: '8A', key_name: 'A minor', makam: 'Hicaz', bpm: 122, energy: 4, duration_sec: 305, audio_path: null },
    { id: 't2', title: 'Gece Treni', artist: 'Ilkay Sencan', camelot: '9A', key_name: 'E minor', makam: null, bpm: 124, energy: 5, duration_sec: 280, audio_path: null },
    { id: 't3', title: 'Kopuk Parça', artist: 'Konuk', camelot: '4B', key_name: 'F# major', makam: null, bpm: 96, energy: 7, duration_sec: 260, audio_path: null },
    { id: 't4', title: 'Sahil', artist: 'Boral Kibil', camelot: '9B', key_name: 'B major', makam: null, bpm: 125, energy: 5, duration_sec: 300, audio_path: null },
    { id: 't5', title: 'Yükseliş', artist: 'Hakan Akkus', camelot: '10B', key_name: 'D major', makam: null, bpm: 126, energy: 6, duration_sec: 290, audio_path: null },
    { id: 't6', title: 'Sabah Rüzgârı', artist: 'Mahmut Orhan', camelot: '8B', key_name: 'C major', makam: null, bpm: 123, energy: 5, duration_sec: 310, audio_path: null },
    { id: 't7', title: 'Tonu Girilmemiş', artist: 'Konuk', camelot: null, key_name: null, makam: null, bpm: 120, energy: 4, duration_sec: 240, audio_path: null },
    { id: 't8', title: 'Derin Bas', artist: 'Konuk', camelot: '5A', key_name: 'C minor', makam: null, bpm: 118, energy: 3, duration_sec: 270, audio_path: null },
    // Şunlar kuralı göstermek için: ikisi de 8A ama hızlı olan 130 BPM'de.
    // Motor aynı tona rağmen bu ikiliyi yan yana koymamalı; sığacak yer yoksa
    // köprü önerisini göstermeli.
    { id: 't9', title: 'Hızlı Vites', artist: 'Stoto', camelot: '8A', key_name: 'A minor', makam: null, bpm: 130, energy: 6, duration_sec: 275, audio_path: null },
    { id: 't10', title: 'Gece Vardiyası', artist: 'Sako Isoyan', camelot: '9A', key_name: 'E minor', makam: null, bpm: 131, energy: 6, duration_sec: 268, audio_path: null },
    // Hızlı bölümün kendi hedefi: 135'in üstündeki parçalar 145'te çalınır.
    // İkisi de ham hızı farklı olsa da motor onları aynı hızda saysın.
    { id: 't11', title: 'Zirve', artist: 'Mahmut Orhan', camelot: '8A', key_name: 'A minor', makam: null, bpm: 140, energy: 7, duration_sec: 285, audio_path: null },
    { id: 't12', title: 'Son Kuvvet', artist: 'Boral Kibil', camelot: '9A', key_name: 'E minor', makam: null, bpm: 152, energy: 8, duration_sec: 262, audio_path: null }
  ];
  const taklit = `<script>
// ---- Sunucu taklidi: auth.js ve Supabase yerine geçer, yalnız önizlemede.
(function () {
  const satirlar = ${JSON.stringify(KATALOG)};
  const yazmaKapali = { message: 'Önizleme: yazma kapalı.' };
  const tablo = () => ({
    select: () => ({ order: () => Promise.resolve({ data: satirlar, error: null }) }),
    insert: () => Promise.resolve({ data: null, error: yazmaKapali }),
    update: () => ({ eq: () => Promise.resolve({ data: null, error: yazmaKapali }) }),
    delete: () => ({ eq: () => Promise.resolve({ data: null, error: yazmaKapali }) })
  });
  const kova = {
    upload: () => Promise.resolve({ data: null, error: yazmaKapali }),
    remove: () => Promise.resolve({ data: null, error: null }),
    createSignedUrl: () => Promise.resolve({ data: null, error: { message: 'Önizleme: ses kapalı.' } })
  };
  window.DerinAuth = {
    ready: Promise.resolve(), configured: true, user: { id: 'onizleme' },
    profile: { role: 'admin' }, open: () => {},
    client: { from: tablo, storage: { from: () => kova } }
  };
  // Önizlemede ses kapalı; R2 adresleri üretilmez.
  window.DerinR2 = {
    adres: () => null,
    yukle: () => Promise.resolve({ error: yazmaKapali }),
    sil: () => Promise.resolve({ error: null })
  };
})();
</script>`;
  // Önce dağınık bir set kurulur: köprü kutuları ve uyumsuz panel hemen görünür.
  // Kullanıcı "MEVCUT SETİ YENİDEN DİZ" ile iyileştirilmiş sırayı kendi görür.
  const akis = `<script>
(function () {
  const bekle = ms => new Promise(r => setTimeout(r, ms));
  (async () => {
    for (let i = 0; i < 40 && !document.querySelector('[data-push]'); i++) await bekle(100);
    for (const id of ['t1', 't3', 't2', 't5', 't4', 't9', 't10', 't11', 't12']) {
      const b = document.querySelector('[data-push="' + id + '"]');
      if (b) b.click();
      await bekle(120);
    }
  })();
})();
</script>`;

  const gomulu = oku('harmonic-mixer.html')
    .replace('<link rel="stylesheet" href="branch.css">', '<style>\n' + oku('branch.css') + '\n</style>')
    .replace('<link rel="stylesheet" href="auth.css">', '<style>\n' + oku('auth.css') + '\n</style>')
    .replace(/<link rel="stylesheet" href="glass\.css\?v=[^\"]+">/, '<style>\n' + oku('glass.css') + '\n</style>')
    .replace(/<script src="config\.js"><\/script>\n?/, '')
    .replace(/<script src="https:\/\/cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js@[^\"]+"><\/script>\n?/, '')
    .replace(/<script src="auth\.js\?v=[^\"]+"><\/script>/, taklit)
    .replace(/<script src="audio-file-types\.js\?v=[^\"]+"><\/script>/, '<script>\n' + oku('audio-file-types.js') + '\n</script>')
    .replace(/<script src="harmonic-set\.js\?v=[^\"]+"><\/script>/, '<script>\n' + oku('harmonic-set.js') + '\n</script>')
    .replace(/<script src="harmonic-mixer\.js\?v=[^\"]+"><\/script>/, '<script>\n' + oku('harmonic-mixer.js') + '\n</script>' + akis)
    .replace(/<script src="harmonic-analyze\.js\?v=[^\"]+"><\/script>/, '<script>\n' + oku('harmonic-analyze.js') + '\n</script>')
    // Mixer bu yardımcıyı kullanmaz ve tek dosyalık önizlemede dışarıdan gelmez.
    .replace(/<script src="sortable-touch\.js\?v=[^\"]+"><\/script>\n?/, '');
  // Gömme sessizce boşa düşerse önizleme giriş ekranında kalır; bunun yerine dur.
  ['branch.css', 'auth.css', 'glass.css', 'audio-file-types.js', 'harmonic-set.js', 'harmonic-mixer.js', 'sortable-touch.js'].forEach(dis => {
    if (new RegExp('(?:href|src)="' + dis.replace(/\./g, '\\.')).test(gomulu)) {
      throw new Error(dis + ' gömülmedi: harmonic-mixer.html etiketi değişmiş, onizleme-olustur.js harmonik modunu güncelleyin');
    }
  });
  if (!gomulu.includes('window.DerinAuth = {')) throw new Error('giriş taklidi gömülmedi');
  if (!gomulu.includes('DerinHarmonicSet')) throw new Error('harmonic-set.js gömülmedi');
  if (!gomulu.includes('DerinAudioTypes')) throw new Error('audio-file-types.js gömülmedi');
  fs.writeFileSync(ciktiYolu, gomulu);
  console.log(path.relative(kok, ciktiYolu) + ' yazıldı · harmonik set önizlemesi');
  return;
}

// "ogrenci-suzgec" modu aynı klasörü uyarı süzgeci seçiliyken önizler:
// yalnız borçlu öğrenciler listelenir, süzgeç düğmesi ve rozetler görünür.
// "ogrenci-aidat" bu ayın ödemeleri henüz açılmamışken klasörü önizler:
// haftalık gün/aylık tutar rozetleri ve "bu ayın aidatlarını oluştur" düğmesi.
//
// "plan", "plan-gun" ve "plan-duzenle" modları Ödeme Takip Takvimi'ni
// (Plan → Takvim) örnek verilerle önizler. "plan" ay ızgarasını ve hücre içi
// detayları, "plan-gun" bir kareye girilince açılan gün sekmesini, "plan-duzenle"
// ise bir ödeme satırının yerinde düzenleme formunu gösterir. Takvim statiktir
// (tıklama yok); amaç yerleşimin ve renklerin gözle doğrulanması.
if (senaryo === 'plan' || senaryo === 'plan-gun' || senaryo === 'plan-duzenle'
  || senaryo === 'ogrenci' || senaryo === 'ogrenci-odeme' || senaryo === 'ogrenci-suzgec'
  || senaryo === 'ogrenci-uyari' || senaryo === 'ogrenci-aidat'
  || senaryo === 'ogrenci-yeni') {
  const P = require(path.join(kok, 'plan-takvim.js'));
  // Öğrenci klasörü modülü pencereden okur; node'da pencere yok, burada kurulur.
  global.window = Object.assign(global.window || {}, { DerinOgrenci: require(path.join(kok, 'ogrenciler.js')) });
  // Eksik yoklama senaryosu ayın ortasını gösterir: işaretsiz ders günleri
  // "geçmiş" sayılabilsin diye bugün ileri alınır.
  const simdi = senaryo === 'ogrenci-uyari'
    ? Date.parse('2026-10-20T09:00:00Z')
    : Date.parse('2026-10-05T09:00:00Z');
  const D = {
    brands: [{ id: 'b1', name: 'Chemex' }, { id: 'b2', name: 'starbucks' }, { id: 'b3', name: 'Uzak' }],
    plans: [
      { id: 'tek', monthly_price: 2000, per_branch: false },
      { id: 'zincir', monthly_price: 1500, per_branch: true }
    ],
    subscriptions: [
      { id: 's1', brand_id: 'b1', plan_id: 'tek', branch_count: 1, current_end: '2026-10-27T00:00:00Z', canceled_at: null },
      { id: 's2', brand_id: 'b2', plan_id: 'tek', branch_count: 1, current_end: '2026-11-28T00:00:00Z', canceled_at: '2026-09-26T00:00:00Z' },
      { id: 's3', brand_id: 'b3', plan_id: 'zincir', branch_count: 4, current_end: '2027-05-01T00:00:00Z', canceled_at: null }
    ],
    // Kareler boş kalmasın: birkaç güne iş, ödeme ve not serpiştirilir ki hücre
    // içi detaylar (tutar + ilk kaydın önizlemesi) gözle doğrulanabilsin.
    planItems: [
      { id: 'o1', gun: '2026-10-27', tur: 'odeme', marka: 'Chemex', tutar: 2000, bitti: true, metin: '', sira: 0 },
      { id: 'o2', gun: '2026-09-20', tur: 'odeme', marka: 'Uzak', tutar: 6000, bitti: false, metin: '', sira: 0 },
      { id: 'o3', gun: '2026-10-12', tur: 'odeme', marka: 'Ekipman — mikser', tutar: 1850, bitti: false, metin: '', sira: 0 },
      { id: 'o4', gun: '2026-10-05', tur: 'odeme', marka: 'Kira', tutar: 12500, bitti: true, metin: '', sira: 0 },
      { id: 'm1', gun: '2026-10-27', tur: 'madde', metin: 'Chemex faturasını gönder', bitti: true, sira: 0 },
      { id: 'm2', gun: '2026-10-27', tur: 'madde', metin: 'Kasım listesini güncelle', bitti: false, sira: 1 },
      { id: 'm3', gun: '2026-10-15', tur: 'madde', metin: 'Yeni şube sözleşmesi', bitti: false, sira: 0 },
      { id: 'm4', gun: '2026-10-20', tur: 'madde', metin: 'Radyo jingle yenile', bitti: true, sira: 0 },
      { id: 'n1', gun: '2026-10-27', tur: 'not', metin: 'Havale bekleniyor, dekont istendi.', bitti: false, sira: 0 }
    ],
    // Öğrenci klasörü boş kalmasın: iki satır örnek veri. Haftalık gün
    // sayısı ve aylık tutar elle yazılı (fiyat gün sayısına göre değişiyor).
    ogrenciler: [
      // Birinci öğrencide başlama tarihi var, ikincide yok: satırda tarih
      // etiketinin çıkıp çıkmaması gözle karşılaştırılabilsin.
      { id: 'og1', ad: 'Elif Yılmaz', veli: 'Ayşe Yılmaz', telefon: '0531 111 22 33', notlar: 'Salı-Perşembe', gun_sayisi: 3, aylik_tutar: 2500, baslama: '2026-02-12', aktif: true },
      { id: 'og2', ad: 'Mert Demir', veli: 'Ali Demir', telefon: '0532 444 55 66', notlar: '', gun_sayisi: 2, aylik_tutar: 1800, baslama: null, aktif: true }
    ],
    // Yoklama şeridi ve ödeme listesi gözle doğrulanabilsin diye karışık
    // işaretler: gelen, gelmeyen, mazeretli günler ve iki tahsilat.
    ogrenciKayitlari: [
      { id: 'ok1', ogrenci_id: 'og1', tur: 'katilim', gun: '2026-10-01', durum: 'geldi', metin: '', tutar: null, bitti: false },
      { id: 'ok2', ogrenci_id: 'og1', tur: 'katilim', gun: '2026-10-02', durum: 'geldi', metin: '', tutar: null, bitti: false },
      { id: 'ok3', ogrenci_id: 'og1', tur: 'katilim', gun: '2026-10-06', durum: 'gelmedi', metin: '', tutar: null, bitti: false },
      { id: 'ok4', ogrenci_id: 'og1', tur: 'katilim', gun: '2026-10-08', durum: 'mazeret', metin: '', tutar: null, bitti: false },
      { id: 'ok5', ogrenci_id: 'og1', tur: 'katilim', gun: '2026-10-09', durum: 'geldi', metin: '', tutar: null, bitti: false },
      { id: 'ok6', ogrenci_id: 'og2', tur: 'katilim', gun: '2026-10-01', durum: 'geldi', metin: '', tutar: null, bitti: false },
      // İkinci öğrenci eşiği aşan devamsızlıkla dursun: "Gelmedi ≥ 3" süzgeci
      // ve rozet rengi önizlemede görülsün.
      { id: 'ok7', ogrenci_id: 'og2', tur: 'katilim', gun: '2026-10-06', durum: 'gelmedi', metin: '', tutar: null, bitti: false },
      { id: 'ok8', ogrenci_id: 'og2', tur: 'katilim', gun: '2026-10-08', durum: 'gelmedi', metin: '', tutar: null, bitti: false },
      { id: 'ok9', ogrenci_id: 'og2', tur: 'katilim', gun: '2026-10-13', durum: 'gelmedi', metin: '', tutar: null, bitti: false },
      // Ekim aidatı elden alınmış: satırda dolu "elden" rozeti ve satır
      // çipinde "elden" eki bu kayıttan doğar.
      { id: 'om1', ogrenci_id: 'og1', tur: 'odeme', gun: '2026-10-03', metin: 'Ekim aidatı', tutar: 2000, bitti: true, elden: true },
      { id: 'om2', ogrenci_id: 'og1', tur: 'odeme', gun: '2026-10-20', metin: 'Kasım aidatı', tutar: 1500, bitti: false },
      { id: 'om3', ogrenci_id: 'og1', tur: 'odeme', gun: '2026-09-15', metin: 'Eylül aidatı', tutar: 2000, bitti: true },
      // Geçen aydan devreden açık borç: satırda "devir" rozeti çıkar.
      { id: 'om4', ogrenci_id: 'og1', tur: 'odeme', gun: '2026-08-10', metin: 'Ağustos aidatı', tutar: 900, bitti: false },
      { id: 'om5', ogrenci_id: 'og2', tur: 'odeme', gun: '2026-10-04', metin: 'Ekim aidatı', tutar: 1500, bitti: false }
    ]
  };
  // Eksik yoklama senaryosu seyrek işaret kullanır: kalıp perşembe + salı
  // kalır, aradaki ders günleri işaretsiz kalır ve uyarı şeridi görünür.
  if (senaryo === 'ogrenci-uyari') {
    const kalan = ['ok1', 'ok3', 'ok6', 'ok7', 'om1', 'om5'];
    D.ogrenciKayitlari = D.ogrenciKayitlari.filter(k => kalan.indexOf(k.id) !== -1);
  }
  // Aidat senaryosu: bu ayın ödemeleri henüz açılmamış. "Bu ayın aidatlarını
  // oluştur" düğmesi kaç kayıt açacağını yazar; geçen ayların borcu kalır ki
  // "devir" rozeti de görünsün.
  if (senaryo === 'ogrenci-aidat') {
    D.ogrenciKayitlari = D.ogrenciKayitlari
      .filter(k => !(k.tur === 'odeme' && String(k.gun).slice(0, 7) === '2026-10'));
  }
  const ui = { now: () => simdi };
  // Öğrenci senaryoları marka takviminin ay görünümünde durur; öğrenci işi
  // ALTINDAKİ ikinci takvimde yapılır. "ogrenci" bir günün yoklamasını
  // (bütün öğrenciler tek listede) ve listede açık bir öğrencinin ödemelerini,
  // "ogrenci-odeme" yerinde düzenleme formunu, "ogrenci-suzgec" ise borçlu
  // süzgecini gösterir.
  const ogrenciMi = senaryo === 'ogrenci' || senaryo === 'ogrenci-odeme'
    || senaryo === 'ogrenci-suzgec' || senaryo === 'ogrenci-uyari'
    || senaryo === 'ogrenci-aidat' || senaryo === 'ogrenci-yeni';
  const acikGun = (senaryo === 'plan' || ogrenciMi) ? null : '2026-10-27';
  const duzenle = senaryo === 'plan-duzenle' ? 'o1' : null;
  const state = { nav: 'plan', sub: 'takvim', planYil: 2026, planAy: 10, planAcikGun: acikGun, planDuzenle: duzenle, planKatli: [] };
  if (senaryo === 'ogrenci' || senaryo === 'ogrenci-odeme') {
    // İkinci takvimin ayı marka takviminden ayrı tutulur; örnekte ikisi de
    // ekim, ama ayrı alanlardan geliyor.
    state.ogrenciYil = 2026;
    state.ogrenciAy = 10;
    state.ogrenciGun = '2026-10-06';
    state.ogrenciAcik = 'og1';
    if (senaryo === 'ogrenci-odeme') state.ogrenciOdemeDuzenle = 'om3';
  }
  if (senaryo === 'ogrenci-suzgec') {
    state.ogrenciYil = 2026;
    state.ogrenciAy = 10;
    state.ogrenciOdak = 'borc';
    state.ogrenciAcik = 'og2';
  }
  if (senaryo === 'ogrenci-uyari' || senaryo === 'ogrenci-aidat'
    || senaryo === 'ogrenci-yeni') {
    state.ogrenciYil = 2026;
    state.ogrenciAy = 10;
  }
  // Ekleme formu: haftalık gün ve aylık tutar alanları, datalist seçenekleri
  // ve tarife ipucu burada görünür (panelde otomatik dolum JS ile çalışır).
  if (senaryo === 'ogrenci-yeni') state.ogrenciYeni = true;
  // Öğrenci senaryoları Plan → Öğrenciler sayfasının gövdesini basar (marka
  // takvimi ayrı sayfada kaldı); plan senaryoları marka takvimini.
  const O = require(path.join(kok, 'ogrenciler.js'));
  // Bugün kurgudan okunur; sabit yazılsaydı senaryonun tarihi ile ekrandaki
  // tarih ayrışır, eksik yoklama uyarısı hiç çıkmazdı.
  const kurguBugun = new Date(simdi).toISOString().slice(0, 10);
  const govde = ogrenciMi
    ? O.ogrenciTakvimi(D.ogrenciler, D.ogrenciKayitlari, state,
      { yil: state.ogrenciYil, ay: state.ogrenciAy, bugun: kurguBugun })
    : P.takvimView(state, D, ui);
  const SAHNE_BASLIKLARI = {
    plan: 'ödeme takip takvimi',
    'plan-duzenle': 'satır düzenleme',
    'plan-gun': 'gün sekmesi',
    ogrenci: 'öğrenci · yoklama ve ödeme',
    'ogrenci-odeme': 'öğrenci · ödeme düzenleme',
    'ogrenci-suzgec': 'öğrenci · uyarı süzgeci',
    'ogrenci-uyari': 'öğrenci · eksik yoklama',
    'ogrenci-aidat': 'öğrenci · aylık aidat',
    'ogrenci-yeni': 'öğrenci · ekleme formu'
  };
  const baslik = SAHNE_BASLIKLARI[senaryo] || 'gün sekmesi';
  const sayfa = `<!doctype html>
<html lang="tr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Panel — ${baslik}</title>
<style>
${oku('radyo-panel.css')}
body{background:#0b0b0d;padding:22px;display:block}
.view{max-width:1120px;margin:0 auto}
</style>
</head>
<body><div class="view">${govde}</div></body>
</html>`;
  fs.writeFileSync(ciktiYolu, sayfa);
  console.log(path.relative(kok, ciktiYolu) + ' yazıldı · ' + baslik);
  return;
}

let sayfa = oku('radyo-cihaz-prova.html');
const kuyruk = oku('radio-playlist-queue.js');
// Oynatıcı anahtarı yalnızca sorgu dizesinden okur; provada sorgu dizesi
// olmadığı için taklitte varsayılan anahtarı kullanırız. Anahtar geçerli bir
// uuid olmalı, yoksa oynatıcı onu bozuk sanıp hiç açılmaz.
const PROVA_ANAHTAR = 'a1b2c3d4-e5f6-4a7b-8c9d-0000000000aa';
let sayfaHam = fs.readFileSync(path.join(kok, 'radyo-cihaz-prova.html'), 'utf8');
if (!sayfaHam.includes("'" + PROVA_ANAHTAR + "'")) {
  throw new Error('prova sayfasının anahtarı değişmiş; buradaki PROVA_ANAHTAR ile eşleşmeli');
}
// Oynatıcının anahtar okuma satırı değişirse yama sessizce boşa düşer ve prova
// "şubeye özel link ile açılmalıdır" der; o yüzden önce varlığını doğrularız.
const ANAHTAR_SATIRI = "const key = url.get('key');";
const radyoHam = oku('radyo.js');
if (!radyoHam.includes(ANAHTAR_SATIRI)) {
  throw new Error('oynatıcının anahtar okuma satırı değişmiş: onizleme-olustur.js yamasını güncelleyin');
}
const radyo = radyoHam
  .replace(ANAHTAR_SATIRI, "const key = url.get('key') || '" + PROVA_ANAHTAR + "';");

// Dış bağımlılıkları çıkar: yapılandırma satır içine gömülür, CDN'e gidilmez.
sayfa = sayfa
  .replace(/<script src="config\.js"><\/script>\n?/, '')
  .replace(/<script src="https:\/\/cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js@[^"]+"><\/script>\n?/, '')
  // Sürüm damgası değişebilir; sabit metne bağlanmayalım.
  // Önizleme tek dosyadır, yanındaki r2-depo.js'i yükleyemez. Gerçek R2'ye de
  // çıkılmaz: adresler sahte önekle üretilir, ses zaten çalmaz.
  .replace(/<script src="r2-depo\.js\?v=[^"]+"><\/script>/,
    "<script>window.DerinR2 = { adres: function (kova, p) { return p ? 'prova://' + kova + '/' + p : null; } };</script>")
  .replace(/<script src="radio-playlist-queue\.js\?v=[^"]+"><\/script>/, '<script>\n' + kuyruk + '\n</script>')
  .replace(/<script src="radyo\.js\?v=[^"]+"><\/script>/, '<script>\n' + radyo + '\n</script>');

// Senaryo seçimi: sorgu dizesi olmadan da çalışsın.
sayfa = sayfa.replace("|| 'ilk';", "|| '" + senaryo + "';");
sayfa = sayfa.replace(
  '<script>\n// ---- Sunucu taklidi',
  '<script>window.DERIN_CONFIG = { supabaseUrl: \'https://prova.test\', supabasePublishableKey: \'prova\' };</script>\n<script>\n// ---- Sunucu taklidi'
);

// Önizleme tek dosya olarak servis edilir, yanındaki varlıkları yükleyemez;
// oynatıcının varsayılan kapak logosu bu yüzden satır içine alınır.
const LOGO_YOLU = 'assets/logo.png';
const LOGO_URL = "url('" + LOGO_YOLU + "')";
if (sayfa.includes(LOGO_URL)) {
  const logo = fs.readFileSync(path.join(kok, LOGO_YOLU)).toString('base64');
  sayfa = sayfa.split(LOGO_URL).join("url('data:image/png;base64," + logo + "')");
}

fs.writeFileSync(ciktiYolu, sayfa);
console.log(path.relative(kok, ciktiYolu) + ' yazıldı · senaryo=' + senaryo + ' · ' + sayfa.length + ' bayt');
['radyo.js', 'radio-playlist-queue.js', 'config.js'].forEach(dis => {
  if (sayfa.includes('src="' + dis)) throw new Error(dis + ' hâlâ dışarıdan yükleniyor');
});
if (!sayfa.includes('window.DERIN_CONFIG')) throw new Error('DERIN_CONFIG gömülmedi');
if (sayfaHam.includes('assets/logo.png') && !sayfa.includes('data:image/png;base64,')) {
  throw new Error('kapak logosu satır içine alınmadı');
}
