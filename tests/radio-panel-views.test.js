const test = require('node:test');
const assert = require('node:assert/strict');

const V = require('../radyo-panel-views.js');

const GUN = 86400000;
const simdi = Date.now();
const iso = ms => new Date(simdi + ms).toISOString();

const D = {
  brands: [{ id: 'b1', name: 'Mokka Coffee', slug: 'mokka-coffee', access_code: 'KOD', is_active: true }],
  folders: [{ id: 'f1', name: 'Sabah Açılış', description: 'Yumuşak giriş', cover_path: null, shuffle: true }],
  tracks: [{ id: 't1', folder_id: 'f1', title: '%C3%9Csk%C3%BCdar %26 Co', storage_path: 'f1/parca.wav', sort_order: 0, duration_sec: 185, cover_path: null }],
  players: [{
    id: 'p1', brand_id: 'b1', label: 'Nişantaşı', player_key: 'dr-1', last_seen_at: new Date().toISOString(),
    open_time: '09:00:00', close_time: '22:00:00', bound_device_id: 'cihaz-1', bound_at: new Date().toISOString(),
    first_ip: null, last_ip: '1.2.3.4', last_ip_at: new Date().toISOString(), is_playing: true
  }],
  broadcast: [{ brand_id: 'b1', folder_id: 'f1', playlist_id: null }],
  announcements: [],
  playlists: [{ id: 'l1', brand_id: 'b1', name: 'Akşam Akışı', description: null, cover_path: null, shuffle: false, created_at: iso(-5 * GUN) }],
  playlistTracks: [
    { id: 'x1', playlist_id: 'l1', track_id: 't1', sort_order: 0 },
    { id: 'x2', playlist_id: 'l1', track_id: 't2', sort_order: 1 }
  ],
  coffeeAttempts: [{ id: 'a1', brand_id: 'b1', slug: 'mokka-coffee', success: false, ip: '9.9.9.9', created_at: iso(-3600000) }],
  subscriptions: [{
    id: 's1', brand_id: 'b1', plan_id: 'pl1', branch_count: 2, status: 'active',
    trial_ends_at: null, current_start: iso(-20 * GUN), current_end: iso(10 * GUN)
  }],
  plans: [{ id: 'pl1', name: 'Profesyonel', monthly_price: 1000, per_branch: true, sort_order: 1 }],
  requests: [{
    id: 'r1', company: 'Roast & Co', contact_name: 'Ali Veli', email: 'ali@roast.co', phone: '555',
    branch_count: 4, message: 'kurumsal radyo istiyoruz', status: 'new', created_at: iso(-2 * GUN)
  }]
};
D.tracks.push({ id: 't2', folder_id: 'f1', title: 'İkinci Parça', storage_path: 'f1/ikinci.mp3', sort_order: 1, duration_sec: 60, cover_path: null });

const ui = {
  cover: p => '/kapak/' + p,
  ses: p => '/ses/' + p,
  anons: p => '/anons/' + p,
  playerBase: () => 'https://ornek.test/radyo.html?key=',
  brandUrl: slug => 'https://ornek.test/coffee/' + slug,
  accept: () => '.mp3,.wav',
  desteklenenler: () => 'mp3, wav',
  parcaNotu: () => '45 MB üzeri parçalara bölünür',
  now: () => Date.now()
};

const durum = (ek) => Object.assign({ nav: 'canli', sub: 'subeler', openFolder: null, openBrand: null, openPlaylist: null, q: '' }, ek);

test('yan menüde yedi ayrı ekran ve sayıları görünür', () => {
  const html = V.nav(durum({ nav: 'musteri', sub: 'markalar' }), {
    players: 4, folders: 3, announcements: 2, brands: 1, playlists: 1, requests: 7
  }, { ad: 'Derin Record', alt: 'yonetici@ornek.test', basHarf: 'DR' });

  assert.ok(html.includes('data-nav="canli" data-sub="subeler"'), 'Canlı durum menüde olmalı');
  ['klasorler', 'anonslar', 'markalar', 'listeler', 'abonelikler', 'talepler'].forEach(sub => {
    assert.ok(html.includes(`data-sub="${sub}"`), `${sub} menüde olmalı`);
  });
  assert.ok(html.includes('>4</span>'), 'şube sayısı menüde görünmeli');
  assert.ok(html.includes('>7</span>'), 'talep sayısı menüde görünmeli');
  // Aktif menü yalnızca bölüm + alt bölüm birlikte eşleşince işaretlenir.
  const aktifler = html.split('nav-item active').length - 1;
  assert.equal(aktifler, 1);
});

test('canlı durum şube bağlantısını, çalan akışı ve kilidi gösterir', () => {
  const { html } = V.gorunum(durum({}), D, ui);
  assert.ok(html.includes('BAĞLI'));
  assert.ok(html.includes('▶ ÇALIYOR'));
  assert.ok(html.includes('KİLİTLİ'));
  assert.ok(html.includes('Sabah Açılış'), 'şubenin çaldığı kaynak adı görünmeli');
  assert.ok(html.includes('09:00–22:00'), 'yayın saatleri görünmeli');
});

test('kullanıcıdan gelen metin kaçırılır (XSS)', () => {
  const kotu = { ...D, brands: [{ id: 'b1', name: '<img src=x onerror=alert(1)>', slug: 'x' }] };
  const { html } = V.gorunum(durum({ nav: 'musteri', sub: 'markalar' }), kotu, ui);
  assert.ok(!html.includes('<img src=x onerror'), 'ham etiket basılmamalı');
  assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'));
});

test('klasör detayı parçaları sıralanabilir satır olarak çizer ve adları çözer', () => {
  const { html } = V.gorunum(durum({ nav: 'icerik', sub: 'klasorler', openFolder: 'f1' }), D, ui);
  assert.ok(html.includes('draggable="true"'), 'satırlar sürüklenebilir olmalı');
  assert.ok(html.includes('data-path="f1/parca.wav"'), 'silme için depo yolu taşınmalı');
  assert.ok(html.includes('Üsküdar &amp; Co'), 'URL kodlu ad çözülüp kaçırılmalı');
  assert.ok(html.includes('3:05'), 'parça süresi mm:ss gösterilmeli');
  assert.ok(html.includes('PARÇA YÜKLE'));
});

test('arama yalnızca satırları süzer, sayıyı bozmaz', () => {
  const { html } = V.gorunum(durum({ nav: 'icerik', sub: 'klasorler', openFolder: 'f1', q: 'eslesmez' }), D, ui);
  assert.ok(html.includes('PARÇALAR (2)'), 'klasördeki parça sayısı toplam kalmalı');
  assert.ok(html.includes('Aramayla eşleşen parça yok'), 'boş sonuç durumu gösterilmeli');
});

test('abonelik ekranı paket, şube ve kalan günü hesaplar', () => {
  const { html } = V.gorunum(durum({ nav: 'musteri', sub: 'abonelikler' }), D, ui);
  assert.ok(html.includes('Profesyonel'));
  assert.ok(html.includes('Aktif'));
  assert.ok(html.includes('10 gün kaldı'));
  assert.ok(html.includes('2.000 TL/ay'), 'şube sayısıyla çarpılmış tutar görünmeli');
  assert.ok(html.includes('data-ab-plan="b1"'));
});

test('talep ekranı durum seçeneklerini ve başvuru bilgisini gösterir', () => {
  const { html } = V.gorunum(durum({ nav: 'musteri', sub: 'talepler' }), D, ui);
  assert.ok(html.includes('Roast &amp; Co'));
  assert.ok(html.includes('ali@roast.co'));
  assert.ok(html.includes('4 şube'));
  ['new', 'contacted', 'closed'].forEach(s => assert.ok(html.includes(`value="${s}"`), `${s} durumu olmalı`));
  assert.ok(html.includes('MARKAYA ÇEVİR'));
});

test('çalma listesi detayı sıra düğmelerini uçlarda kapatır', () => {
  const { html } = V.gorunum(durum({ nav: 'musteri', sub: 'listeler', openPlaylist: 'l1' }), D, ui);
  assert.ok(html.includes('+ ŞARKI EKLE'));
  const ilkSatir = html.slice(html.indexOf('data-kayit="x1"'), html.indexOf('data-kayit="x2"'));
  assert.ok(ilkSatir.includes('data-act="ptrack-up"') && ilkSatir.includes('disabled'), 'ilk satırda yukarı kapalı olmalı');
  assert.ok(html.includes('AKIŞ (2)'));
});

test('boş veri dostça karşılanır', () => {
  const bos = { brands: [], folders: [], tracks: [], players: [], broadcast: [], announcements: [], playlists: [], playlistTracks: [], coffeeAttempts: [], subscriptions: [], plans: [], requests: [] };
  assert.ok(V.gorunum(durum({}), bos, ui).html.includes('Eşleşen şube yok'));
  assert.ok(V.gorunum(durum({ nav: 'icerik', sub: 'klasorler' }), bos, ui).html.includes('Henüz klasör yok'));
  assert.ok(V.gorunum(durum({ nav: 'musteri', sub: 'talepler' }), bos, ui).html.includes('Henüz talep yok'));
  assert.ok(V.gorunum(durum({ nav: 'musteri', sub: 'markalar' }), bos, ui).html.includes('Henüz marka yok'));
});

test('şube çekmecesi yayın linkini ve bakım düğmelerini taşır', () => {
  const html = V.subeCekmecesi('p1', D, ui);
  assert.ok(html.includes('https://ornek.test/radyo.html?key=dr-1'));
  assert.ok(html.includes('KİLİDİ SIFIRLA'));
  assert.ok(html.includes('ŞUBEYİ SİL'));
  assert.ok(html.includes('MİKROFONU AÇ'));
});
