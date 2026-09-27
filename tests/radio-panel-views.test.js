const test = require('node:test');
const assert = require('node:assert/strict');

const V = require('../radyo-panel-views.js');

const GUN = 86400000;
const simdi = Date.now();
const iso = ms => new Date(simdi + ms).toISOString();

// Sunucu yayın anahtarını uuid olarak bekler; kurgular da gerçekçi olsun.
const ANAHTAR = n => 'a1b2c3d4-e5f6-4a7b-8c9d-' + String(n).padStart(12, '0');
const ANAHTAR_NISANTASI = ANAHTAR(1);
const ANAHTAR_KILITSIZ = ANAHTAR(4);
const ANAHTAR_ALSANCAK = ANAHTAR(8);
const ANAHTAR_ZEYTINLI = ANAHTAR(9);

const D = {
  brands: [{ id: 'b1', name: 'Mokka Coffee', slug: 'mokka-coffee', access_code: 'KOD', is_active: true }],
  folders: [{ id: 'f1', name: 'Sabah Açılış', description: 'Yumuşak giriş', cover_path: null, shuffle: true }],
  tracks: [{ id: 't1', folder_id: 'f1', title: '%C3%9Csk%C3%BCdar %26 Co', storage_path: 'f1/parca.wav', sort_order: 0, duration_sec: 185, cover_path: null }],
  players: [{
    id: 'p1', brand_id: 'b1', label: 'Nişantaşı', player_key: ANAHTAR_NISANTASI, last_seen_at: new Date().toISOString(),
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
  ['saglik', 'klasorler', 'anonslar', 'markalar', 'listeler', 'abonelikler', 'talepler'].forEach(sub => {
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
  assert.ok(html.includes('https://ornek.test/radyo.html?key=' + ANAHTAR_NISANTASI));
  assert.ok(html.includes('data-act="player-check"'), 'bağlantı sınaması düğmesi olmalı');
  assert.ok(html.includes('KİLİDİ SIFIRLA'));
  assert.ok(html.includes('ŞUBEYİ SİL'));
  assert.ok(html.includes('MİKROFONU AÇ'));
  // Kilitli şubede uyarı, kilitsiz şubede ne olacağı açıkça yazılmalı.
  assert.ok(html.includes('başka bir cihaza kilitli'));
  const kilitliDegil = V.subeCekmecesi('p4', Object.assign({}, D, {
    players: [{ id: 'p4', brand_id: 'b1', label: 'Kilit yok', player_key: ANAHTAR_KILITSIZ, bound_device_id: null, is_playing: false, last_seen_at: null }]
  }), ui);
  assert.ok(kilitliDegil.includes('ilk açıldığı cihaza kilitlenir'));
});

// Yayın zinciri: şube anahtarı → markanın canlı yayın kaydı → markanın aktif
// olması → kaynakta parça → abonelik. Kopuk halka "bu link tanınmadı" demektir.
test('yayın sağlığı zincirdeki kopuk halkayı bulur', () => {
  const p = D.players[0];
  assert.equal(V.saglikTani(p, D).seviye, 'iyi');

  const pasif = { ...D, brands: [{ ...D.brands[0], is_active: false }] };
  const pasifTani = V.saglikTani(p, pasif);
  assert.equal(pasifTani.seviye, 'kotu');
  assert.ok(pasifTani.sorunlar.some(s => s.includes('Marka pasif')));

  assert.ok(V.saglikTani(p, { ...D, broadcast: [] }).sorunlar.some(s => s.includes('Canlı yayın kaydı yok')));
  assert.ok(V.saglikTani(p, { ...D, broadcast: [{ brand_id: 'b1', folder_id: null, playlist_id: null }] })
    .sorunlar.some(s => s.includes('kaynak seçilmemiş')));
  assert.ok(V.saglikTani(p, { ...D, tracks: [], playlistTracks: [] }).sorunlar.some(s => s.includes('hiç parça yok')));
  assert.ok(V.saglikTani(p, { ...D, subscriptions: [] }).sorunlar.some(s => s.includes('Abonelik tanımlı değil')));
  assert.ok(V.saglikTani(p, { ...D, subscriptions: [{ ...D.subscriptions[0], current_end: iso(-2 * GUN) }] })
    .sorunlar.some(s => s.includes('süresi')));
  assert.ok(V.saglikTani({ ...p, player_key: '' }, D).sorunlar.some(s => s.includes('anahtarı boş')));
});

// Her sorunun yanında onu yerinde kapatan bir düzeltme adımı taşınır:
// ekran “ne eksik” derken aynı zamanda “nasıl düzeltilir” demeli.
test('her kopuk halka için düzeltme adımı üretilir', () => {
  const p = D.players[0];
  assert.equal(V.saglikTani(p, D).duzeltmeler.length, 0, 'sağlam şubede düzeltme çıkmaz');

  const pasif = V.saglikTani(p, { ...D, brands: [{ ...D.brands[0], is_active: false }] });
  assert.deepEqual(pasif.duzeltmeler.map(d => d.tip), ['marka-aktif']);

  const yayinsiz = V.saglikTani(p, { ...D, broadcast: [] });
  assert.deepEqual(yayinsiz.duzeltmeler.map(d => d.tip), ['kaynak']);

  const parcasiz = V.saglikTani(p, { ...D, tracks: [], playlistTracks: [] });
  assert.equal(parcasiz.duzeltmeler[0].tip, 'parca');
  assert.equal(parcasiz.duzeltmeler[0].hedef, '#/klasorler/f1', 'klasör kaynağında klasöre götürmeli');

  // Liste kaynağında düzeltme parça listesinin kendisine götürür.
  const listeD = {
    ...D,
    broadcast: [{ brand_id: 'b1', folder_id: null, playlist_id: 'l1' }],
    playlistTracks: []
  };
  assert.equal(V.saglikTani(p, listeD).duzeltmeler[0].hedef, '#/listeler/l1');

  assert.deepEqual(V.saglikTani(p, { ...D, subscriptions: [] }).duzeltmeler.map(d => d.tip), ['abonelik']);
  assert.deepEqual(V.saglikTani({ ...p, player_key: '' }, D).duzeltmeler.map(d => d.tip), ['anahtar']);
});

// Panel kopyaladığı bağlantıya güvenir; anahtar uuid değilse link "...?key=null"
// olur ve oynatıcı sunucuya hiç ulaşamaz. Bozuk anahtar bu yüzden boş anahtar
// gibi zincirin en başında anılır ve yenilenmesi önerilir.
test('bozuk anahtar boş anahtar gibi yakalanır ve yenilenmesi önerilir', () => {
  const bozuk = V.saglikTani({ ...D.players[0], player_key: 'null' }, D);
  assert.equal(bozuk.seviye, 'kotu');
  assert.ok(bozuk.sorunlar.some(s => s.includes('anahtarı bozuk')));
  assert.deepEqual(bozuk.duzeltmeler.map(d => d.tip), ['anahtar']);

  assert.equal(V.anahtarGecerli(ANAHTAR_NISANTASI), true);
  ['null', '', null, undefined, '1234'].forEach(deger =>
    assert.equal(V.anahtarGecerli(deger), false, String(deger) + ' geçersiz sayılmalı'));
});

test('sağlık ekranı düzeltme düğmelerini satıra basar', () => {
  const pasifD = {
    ...D,
    brands: [{ ...D.brands[0], is_active: false }],
    broadcast: [],
    subscriptions: []
  };
  const { html } = V.gorunum(durum({ nav: 'canli', sub: 'saglik' }), pasifD, ui);
  assert.ok(html.includes('data-act="saglik-fix"'));
  ['marka-aktif', 'kaynak', 'abonelik'].forEach(tip =>
    assert.ok(html.includes(`data-tip="${tip}"`), `${tip} düzeltmesi görünmeli`));
  assert.ok(html.includes('MARKAYI YAYINA AL'));
  assert.ok(html.includes('KAYNAK ATA'));
  assert.ok(html.includes('ABONELİK BAŞLAT'));
  assert.ok(html.includes('btn sm primary'), 'ilk düzeltme öne çıkmalı');
  // Sağlam şubede düzeltme düğmesi olmamalı.
  const saglam = V.gorunum(durum({ nav: 'canli', sub: 'saglik' }), D, ui).html;
  assert.ok(!saglam.includes('data-act="saglik-fix"'));
});

test('hiç bağlanmamış ama zinciri tam şube uyarı sayılır', () => {
  const hic = { ...D, players: [{ ...D.players[0], last_seen_at: null }] };
  const tani = V.saglikTani(hic.players[0], hic);
  assert.equal(tani.seviye, 'uyari');
  assert.equal(tani.sorunlar.length, 0);
  assert.equal(V.saglikOzet(hic).uyari, 1);
});

test('yayın sağlığı ekranı sorunlu şubeleri üste dizer', () => {
  const karisik = {
    ...D,
    brands: [
      { id: 'b1', name: 'Mokka Coffee', slug: 'mokka', is_active: false },
      { id: 'b2', name: 'Roast & Co', slug: 'roast', is_active: true }
    ],
    broadcast: [{ brand_id: 'b2', folder_id: 'f1', playlist_id: null }],
    subscriptions: [{ ...D.subscriptions[0], brand_id: 'b2' }],
    players: [
      { id: 'p9', brand_id: 'b2', label: 'Zeytinli', player_key: ANAHTAR_ZEYTINLI, last_seen_at: new Date().toISOString(), bound_device_id: null, is_playing: true },
      { id: 'p8', brand_id: 'b1', label: 'Alsancak', player_key: ANAHTAR_ALSANCAK, last_seen_at: null, bound_device_id: 'cihaz-9', is_playing: false }
    ]
  };
  const { html } = V.gorunum(durum({ nav: 'canli', sub: 'saglik' }), karisik, ui);
  assert.ok(html.includes('YAYIN SAĞLIĞI'));
  assert.ok(html.includes('data-act="saglik-denetle"'), 'sunucu doğrulama düğmesi olmalı');
  assert.ok(html.includes('YAYIN ÇALIŞMAZ'));
  assert.ok(html.includes('zincirde kopuk halka var'));
  assert.ok(html.includes('cihaza kilitli'), 'kilit durumu satırda görünmeli');
  assert.ok(html.indexOf('Alsancak') < html.indexOf('Zeytinli'), 'sorunlu şube üstte olmalı');
  assert.equal(V.saglikOzet(karisik).kotu, 1);
  assert.equal(V.saglikOzet(karisik).iyi, 1);
  assert.equal(V.saglikOzet({ ...karisik, players: [] }).kotu, 0);
});

test('sunucu doğrulamasının sonucu tabloda görünür', () => {
  const sonucli = { ...ui, saglikSonuc: id => (id === 'p1' ? { durum: 'iyi', metin: '3 parça gönderiyor' } : null) };
  const html = V.gorunum(durum({ nav: 'canli', sub: 'saglik' }), D, sonucli).html;
  assert.ok(html.includes('3 parça gönderiyor'));
  // Denetim çalıştırılmadıysa hücre boş kalmaz: "denenmedi" yazar.
  assert.ok(V.gorunum(durum({ nav: 'canli', sub: 'saglik' }), D, ui).html.includes('denenmedi'));
});

test('marka detayı markayı yayına alıp durdurmayı gösterir', () => {
  const aktif = V.gorunum(durum({ nav: 'musteri', sub: 'markalar', openBrand: 'b1' }), D, ui).html;
  assert.ok(aktif.includes('MARKA AKTİF'), 'aktif marka açıkça yazılmalı');
  assert.ok(aktif.includes('data-act="brand-active" data-id="b1"'));
  assert.ok(aktif.includes('MARKAYI DURDUR'));

  const pasifD = Object.assign({}, D, { brands: [{ ...D.brands[0], is_active: false }] });
  const pasif = V.gorunum(durum({ nav: 'musteri', sub: 'markalar', openBrand: 'b1' }), pasifD, ui).html;
  assert.ok(pasif.includes('MARKA PASİF'), 'pasif marka işaretlenmeli');
  assert.ok(pasif.includes('MARKAYI YAYINA AL'));
});

test('bağlantı sınaması düğmesi her şubede bulunmaz, yalnızca çekmecede olur', () => {
  const liste = V.gorunum(durum({}), D, ui).html;
  assert.ok(!liste.includes('BAĞLANTIYI SINA'), 'tabloda yer kaplamamalı');
  assert.ok(V.subeCekmecesi('p1', D, ui).includes('BAĞLANTIYI SINA'));
});
