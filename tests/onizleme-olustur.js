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

// "gecmis" modu Bağlantı geçmişi ekranını önizler: şu anki durum, taraf özeti ve
// olay çizelgesi yan yana gelsin ki "sorun bizde mi kafede mi" okunuşu gözle
// doğrulanabilsin.
if (senaryo === 'gecmis') {
  const V = require(path.join(kok, 'radyo-panel-views.js'));
  const simdi = Date.now();
  const dkOnce = n => new Date(simdi - n * 60000).toISOString();
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
      // Duraklatıldı: en son durma kaydı kafe tarafında.
      sube('p2', 'Alsancak', { is_playing: false, last_seen_at: dkOnce(3) }),
      // Çevrimdışı: cihaz saatlerdir kapalı.
      sube('p3', 'Kadıköy', { is_playing: false, last_seen_at: dkOnce(400), bound_device_id: null })
    ],
    broadcast: [{ brand_id: 'b1', folder_id: 'f1', playlist_id: null }],
    announcements: [],
    playlists: [{ id: 'l1', brand_id: 'b1', name: 'Sabah Açılış', description: null, cover_path: null, shuffle: false }],
    playlistTracks: [],
    coffeeAttempts: [
      { id: 'c1', brand_id: 'b1', slug: 'mokka-coffee', success: false, ip: '88.240.10.9', created_at: dkOnce(210) },
      { id: 'c2', brand_id: 'b1', slug: 'mokka-coffee', success: true, ip: '88.240.10.9', created_at: dkOnce(205) }
    ],
    subscriptions: [{ id: 's1', brand_id: 'b1', plan_id: 'pl1', status: 'active', trial_ends_at: null, current_end: new Date(simdi + 20 * 86400000).toISOString() }],
    plans: [{ id: 'pl1', name: 'Profesyonel', monthly_price: 1000, per_branch: true, sort_order: 1 }],
    requests: [],
    olaylar: [
      { id: 'e1', player_id: 'p1', brand_id: 'b1', kind: 'acildi', detail: 'Chrome · macOS', at: dkOnce(480) },
      { id: 'e2', player_id: 'p1', brand_id: 'b1', kind: 'caliyor', detail: 'Kalabalık Caddesi · Sabah Açılış', at: dkOnce(479) },
      { id: 'e3', player_id: 'p1', brand_id: 'b1', kind: 'liste_degisti', detail: 'Sabah Açılış', at: dkOnce(300) },
      { id: 'e4', player_id: 'p2', brand_id: 'b1', kind: 'acildi', detail: 'Chrome · Windows', at: dkOnce(290) },
      { id: 'e5', player_id: 'p2', brand_id: 'b1', kind: 'durakladi', detail: 'cihaz', at: dkOnce(60) },
      { id: 'e6', player_id: 'p2', brand_id: 'b1', kind: 'durakladi', detail: 'cihaz-gizli', at: dkOnce(45) },
      { id: 'e7', player_id: 'p1', brand_id: 'b1', kind: 'durakladi', detail: 'mesai-disi', at: dkOnce(1200) },
      { id: 'e8', player_id: 'p3', brand_id: 'b1', kind: 'hata', detail: 'anahtar-yok', at: dkOnce(700) },
      { id: 'e9', player_id: 'p1', brand_id: 'b1', kind: 'takildi', detail: 'Kalabalık Caddesi', at: dkOnce(200) },
      { id: 'e10', player_id: 'p3', brand_id: 'b1', kind: 'durakladi', detail: 'cihaz-kilidi', at: dkOnce(1400) }
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
<body><div class="view">${gorunum.html}</div></body>
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
const radyo = oku('radyo.js')
  .replace("new URLSearchParams(location.search).get('key')", "(new URLSearchParams(location.search).get('key') || '" + PROVA_ANAHTAR + "')");

// Dış bağımlılıkları çıkar: yapılandırma satır içine gömülür, CDN'e gidilmez.
sayfa = sayfa
  .replace(/<script src="config\.js"><\/script>\n?/, '')
  .replace(/<script src="https:\/\/cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js@[^"]+"><\/script>\n?/, '')
  // Sürüm damgası değişebilir; sabit metne bağlanmayalım.
  .replace(/<script src="radio-playlist-queue\.js\?v=[^"]+"><\/script>/, '<script>\n' + kuyruk + '\n</script>')
  .replace(/<script src="radyo\.js\?v=[^"]+"><\/script>/, '<script>\n' + radyo + '\n</script>');

// Senaryo seçimi: sorgu dizesi olmadan da çalışsın.
sayfa = sayfa.replace("|| 'ilk';", "|| '" + senaryo + "';");
sayfa = sayfa.replace(
  '<script>\n// ---- Sunucu taklidi',
  '<script>window.DERIN_CONFIG = { supabaseUrl: \'https://prova.test\', supabasePublishableKey: \'prova\' };</script>\n<script>\n// ---- Sunucu taklidi'
);

fs.writeFileSync(ciktiYolu, sayfa);
console.log(path.relative(kok, ciktiYolu) + ' yazıldı · senaryo=' + senaryo + ' · ' + sayfa.length + ' bayt');
['radyo.js', 'radio-playlist-queue.js', 'config.js'].forEach(dis => {
  if (sayfa.includes('src="' + dis)) throw new Error(dis + ' hâlâ dışarıdan yükleniyor');
});
if (!sayfa.includes('window.DERIN_CONFIG')) throw new Error('DERIN_CONFIG gömülmedi');
