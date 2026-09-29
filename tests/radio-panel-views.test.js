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

test('yan menüde bölümler ve sayıları görünür', () => {
  const html = V.nav(durum({ nav: 'musteri', sub: 'markalar' }), {
    players: 4, folders: 3, announcements: 2, brands: 1, playlists: 1, requests: 7, olaySorun: 3
  }, { ad: 'Derin Record', alt: 'yonetici@ornek.test', basHarf: 'DR' });

  ['subeler', 'klasorler', 'anonslar', 'markalar', 'listeler', 'abonelikler', 'talepler'].forEach(sub => {
    assert.ok(html.includes(`data-sub="${sub}"`), `${sub} menüde olmalı`);
  });
  // Canlı durum tek satır: yayın başlatma, sağlık ve geçmiş artık o bölümün
  // sekmeleridir, menüde ayrı satır açmaz.
  ['yayin', 'saglik', 'gecmis'].forEach(sub => {
    assert.ok(!html.includes(`data-nav="canli" data-sub="${sub}"`), `${sub} ayrı menü satırı olmamalı`);
  });
  assert.ok(html.includes('Şubeler, yayın başlat, sağlık'), 'menü satırı bölümün içeriğini söylemeli');
  assert.ok(html.includes('>4</span>'), 'şube sayısı menüde görünmeli');
  assert.ok(html.includes('>7</span>'), 'talep sayısı menüde görünmeli');
  // Aktif menü yalnızca bölüm + alt bölüm birlikte eşleşince işaretlenir.
  const aktifler = html.split('nav-item active').length - 1;
  assert.equal(aktifler, 1);
});

// Bölüm sekmeleri: Canlı durumun dört ekranı tek bölümün içinde durur.
test('canlı durum ekranları sekmeden açılır, sayaçlar sekmede okunur', () => {
  const sekmeli = V.gorunum(durum({}), D, ui).html;
  assert.ok(sekmeli.includes('class="tabs"'), 'Canlı durum sekme çubuğu çizilmeli');
  ['subeler', 'yayin', 'saglik', 'gecmis'].forEach(sub => {
    assert.ok(sekmeli.includes(`data-sub="${sub}"`), `${sub} sekmesi olmalı`);
  });
  assert.ok(sekmeli.includes('Şubeler'), 'ilk sekme şube listesi');

  // Sekme seçilince o ekran çizilir; çubuk yerinde kalır.
  const yayin = V.gorunum(durum({ sub: 'yayin' }), D, ui).html;
  assert.ok(yayin.includes('id="yayin-marka"'), 'Yayın başlat ekranı sekmeden gelir');
  assert.ok(yayin.includes('class="tabs"'), 'sekme çubuğu her ekranda kalır');
  assert.ok(!yayin.includes('ŞU AN ÇALAN'), 'sekmeler birbirinin içeriğini taşımaz');

  const saglik = V.gorunum(durum({ sub: 'saglik' }), D, ui).html;
  assert.ok(saglik.includes('class="tabs"'));
  const gecmis = V.gorunum(durum({ sub: 'gecmis' }), D, ui).html;
  assert.ok(gecmis.includes('class="tabs"'));
});

test('canlı durum şube bağlantısını, çalan akışı ve kilidi gösterir', () => {
  const { html } = V.gorunum(durum({}), D, ui);
  assert.ok(html.includes('BAĞLI'));
  assert.ok(html.includes('▶ ÇALIYOR'));
  assert.ok(html.includes('KİLİTLİ'));
  assert.ok(html.includes('Sabah Açılış'), 'markaya atanmış kaynak adı görünmeli');
  assert.ok(html.includes('09:00–22:00'), 'yayın saatleri görünmeli');
});

// Panel artık gerçekten çalan parçayı gösterebiliyor; ama bu bilgi oynatıcının
// bildirimine bağlı. Bildirim yoksa veya bayatsa markaya atanmış kaynağa düşmeli
// ve canlı bilginin tazeliği ekranda yazmalı.
test('yayın sütunu çalan parçayı gösterir, bildirim yoksa kaynağa düşer', () => {
  const simdi2 = Date.now();
  const k = { ad: 'Öğleden sonra akışı', tip: 'klasör' };
  const taze = new Date(simdi2 - 5000).toISOString();
  const bayat = new Date(simdi2 - 600000).toISOString();
  const canli = { is_playing: true, last_seen_at: taze };

  const calan = V.yayinHucresi({ ...canli, now_title: 'Kalabalık Caddesi', now_at: taze }, k, simdi2);
  assert.ok(calan.includes('Kalabalık Caddesi'), 'bildirilen parça görünmeli');
  assert.ok(calan.includes('▶ ÇALIYOR'));
  assert.ok(calan.includes('Öğleden sonra akışı'), 'bağlam için kaynak da yazılmalı');

  // Bildirim yok (kurulum eski): kaynak adına düşer, kaynağı tekrar etmez.
  const bildirimsiz = V.yayinHucresi(canli, k, simdi2);
  assert.ok(bildirimsiz.includes('Öğleden sonra akışı'));
  assert.equal(bildirimsiz.match(/Öğleden sonra akışı/g).length, 1, 'kaynak bir kez yazılmalı');

  // Bayat bildirim gösterilmemeli: cihaz kapanınca eski parça yazılı kalmaz.
  const bayatHucre = V.yayinHucresi({ ...canli, now_title: 'Eski Parça', now_at: bayat }, k, simdi2);
  assert.ok(!bayatHucre.includes('Eski Parça'), 'bayat parça adı gösterilmemeli');
  assert.ok(bayatHucre.includes('Öğleden sonra akışı'));

  // Duraklatılmışken ses akmıyor; parça adı iddia edilmemeli.
  const durmus = V.yayinHucresi({ ...canli, is_playing: false, now_title: 'Kalabalık Caddesi', now_at: taze }, k, simdi2);
  assert.ok(!durmus.includes('Kalabalık Caddesi'));
  assert.ok(durmus.includes('DURAKLATILDI'));

  // Çevrimdışı şubede hiçbir şey iddia edilmez.
  const kapali = V.yayinHucresi({ is_playing: true, last_seen_at: null, now_title: 'Kalabalık Caddesi', now_at: taze }, k, simdi2);
  assert.ok(!kapali.includes('▶ ÇALIYOR'));
  assert.ok(!kapali.includes('Kalabalık Caddesi'));
});

test('canlı durum ekranı sütunu ve tazeliği doğru yazar', () => {
  const { html } = V.gorunum(durum({}), D, ui);
  assert.ok(html.includes('ŞU AN ÇALAN'));
  assert.match(html, /\d+ sn önce/, 'canlı bilginin tazeliği yazılmalı');
  assert.ok(html.includes('▶ ÇALIYOR'));

  // Ses vermeyen ama bağlı şube "duraklatıldı" görünür.
  const duraklatilmis = V.gorunum(durum({}), {
    ...D, players: [{ ...D.players[0], is_playing: false }]
  }, ui).html;
  assert.ok(duraklatilmis.includes('DURAKLATILDI'));
  assert.ok(!duraklatilmis.includes('▶ ÇALIYOR'));

  // Çevrimdışı şubede yayın hücresi susar; bağlantı durumunu DURUM sütunu yazar.
  const cevrimdisi = V.gorunum(durum({}), {
    ...D, players: [{ ...D.players[0], last_seen_at: null, is_playing: true }]
  }, ui).html;
  assert.ok(cevrimdisi.includes('ÇEVRİMDIŞI'));
  assert.ok(!cevrimdisi.includes('▶ ÇALIYOR'), 'bayat kayıt canlı sayılmamalı');
});

// Şube çekmecesinde de gerçekten çalan parça görünmeli; destek için gerekli.
test('şube çekmecesi çalan parçayı gösterir', () => {
  const simdi3 = Date.now();
  const html = V.subeCekmecesi('p1', {
    ...D, players: [{
      ...D.players[0], is_playing: true,
      now_title: 'Kalabalık Caddesi', now_at: new Date(simdi3 - 4000).toISOString()
    }]
  }, ui);
  assert.ok(html.includes('Kalabalık Caddesi'));
  assert.ok(html.includes('Şu an çalıyor'), 'etiket ne olduğunu söylemeli');
});

// Personel cihazdan markanın başka bir listesini seçtiğinde panel bunu artık
// görebiliyor: oynatıcı hangi listeyi çaldığını bildiriyor. Panelin işi bu
// bilgiyi dürüstçe yazmak: bayatsa susmak, adı güncel listeden okumak ve
// yönetimin atadığı kaynakla karıştırmamak.
test('cihazın çaldığı çalma listesi panelde görünür', () => {
  const simdi3 = Date.now();
  const taze = new Date(simdi3 - 6000).toISOString();
  const bayat = new Date(simdi3 - 600000).toISOString();
  const k = { ad: 'Sabah Açılış', tip: 'klasör' };   // yönetimin atadığı kaynak
  const canli = { is_playing: true, last_seen_at: taze };

  const hucre = V.yayinHucresi({
    ...canli, now_title: 'Kalabalık Caddesi', now_at: taze,
    now_playlist_id: 'l1', now_playlist_name: 'Akşam Akışı'
  }, k, simdi3, D);
  assert.ok(hucre.includes('çalınan liste'), 'cihazın çaldığı liste yazılmalı');
  assert.ok(hucre.includes('Akşam Akışı'));
  assert.ok(!hucre.includes('Sabah Açılış'), 'iki farklı cevap yan yana yazılmamalı');

  // Panel listeyi kendi elindeki güncel kayıttan okur: liste yeniden
  // adlandırıldığında cihaz eski adı bildirse de doğru ad görünür.
  const yenidenAdlandirilmis = V.yayinHucresi({
    ...canli, now_title: 'Kalabalık Caddesi', now_at: taze,
    now_playlist_id: 'l1', now_playlist_name: 'Eski Ad'
  }, k, simdi3, D);
  assert.ok(yenidenAdlandirilmis.includes('Akşam Akışı'));
  assert.ok(!yenidenAdlandirilmis.includes('Eski Ad'));

  // Panelde karşılığı olmayan bir liste (silinmiş) bildirildiyse oynatıcının
  // dediğiyle yetiniriz; uydurmaktansa cihazın bildirdiğini yazarız.
  const silinmis = V.yayinHucresi({
    ...canli, now_title: 'Kalabalık Caddesi', now_at: taze,
    now_playlist_id: 'yok-boyle-bir-liste', now_playlist_name: 'Kapanan Liste'
  }, k, simdi3, D);
  assert.ok(silinmis.includes('Kapanan Liste'));

  // Yönetim zaten o listeyi atamışsa aynı adı iki kez yazmayız.
  const ayni = V.yayinHucresi({
    ...canli, now_title: 'Kalabalık Caddesi', now_at: taze,
    now_playlist_id: 'l1', now_playlist_name: 'Akşam Akışı'
  }, { ad: 'Akşam Akışı', tip: 'liste' }, simdi3, D);
  assert.ok(!ayni.includes('çalınan liste'));
  assert.ok(ayni.includes('Akşam Akışı'));

  // Bildirim bayatsa (cihaz kapandı) hiçbir şey iddia edilmez.
  const bayatHucre = V.yayinHucresi({
    ...canli, now_title: 'Eski Parça', now_at: bayat,
    now_playlist_id: 'l1', now_playlist_name: 'Akşam Akışı'
  }, k, simdi3, D);
  assert.ok(!bayatHucre.includes('çalınan liste'));
  assert.ok(!bayatHucre.includes('Akşam Akışı'));
  assert.equal(V.calanListe({ ...canli, now_at: bayat, now_playlist_name: 'Akşam Akışı' }, D, simdi3), null);

  // Çevrimdışı cihaz için de susar.
  assert.equal(V.calanListe({
    is_playing: true, last_seen_at: null, now_at: taze, now_playlist_name: 'Akşam Akışı'
  }, D, simdi3), null);
});

// Listeyi marka sayfasından ve şube çekmecesinden de görebilmek gerekir:
// yönetici "şubeler gerçekten ne çalıyor" sorusunun cevabını tek ekranda arıyor.
test('marka sayfası ve şube çekmecesi personelin seçtiği listeyi yazar', () => {
  const simdi4 = Date.now();
  const taze = new Date(simdi4 - 6000).toISOString();
  const bildirimli = [{ ...D.players[0], is_playing: true, last_seen_at: taze,
    now_title: 'Kalabalık Caddesi', now_at: taze,
    now_playlist_id: 'l1', now_playlist_name: 'Akşam Akışı' }];

  const marka = V.gorunum(durum({ nav: 'musteri', sub: 'markalar', openBrand: 'b1' }),
    { ...D, players: bildirimli }, ui).html;
  assert.ok(marka.includes('FARKLI LİSTE'), 'şube satırında işaret olmalı');
  assert.ok(marka.includes('çalıyor: <b>Akşam Akışı</b>'));

  const cekmece = V.subeCekmecesi('p1', { ...D, players: bildirimli }, ui);
  assert.ok(cekmece.includes('başka bir liste seçmiş'), 'çekmece durumu açıkça söylemeli');
  assert.ok(cekmece.includes('Akşam Akışı'));
  assert.ok(cekmece.includes('Sabah Açılış'), 'atanmış kaynak da karşılaştırma için yazılmalı');

  // Yönetim tam olarak o listeyi atadıysa işaret çıkmaz: aynı bilgi tekrar edilmez.
  const ayniAtama = V.gorunum(durum({ nav: 'musteri', sub: 'markalar', openBrand: 'b1' }),
    { ...D, players: bildirimli, broadcast: [{ brand_id: 'b1', folder_id: null, playlist_id: 'l1' }] }, ui).html;
  assert.ok(!ayniAtama.includes('FARKLI LİSTE'));
});

// Tazelik metni kullanıcıya "bu bilgi ne kadar yeni" sorusunu yanıtlamalı.
test('son görülme süresi okunur biçimde yazılır', () => {
  const t = Date.now();
  assert.equal(V.goreli(new Date(t - 12000).toISOString(), t), '12 sn önce');
  assert.equal(V.goreli(new Date(t - 300000).toISOString(), t), '5 dk önce');
  assert.equal(V.goreli(new Date(t - 7200000).toISOString(), t), '2 sa önce');
  assert.equal(V.goreli(new Date(t - 3 * 86400000).toISOString(), t), '3 gün önce');
  assert.equal(V.goreli(null, t), '');
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

// Kapaklar elle yerleştirilir: yönetim indirdiği görseli kendi seçer. Pencerede
// seçilen görsel KAYDEDİLMEDEN önce görünmeli ki hangi görselin hangi parçaya
// gittiği karışmasın; mevcut kapak varsa kaldırma yolu da olmalı.
test('kapak penceresi görseli önizler, mevcut kapağı kaldırmayı sunar', () => {
  const bos = V.kapakPenceresi({ kapakUrl: null, alt: 'Kalabalık Caddesi', mevcutVar: false });
  assert.ok(bos.includes('id="kapak-file"'), 'görsel seçme alanı olmalı');
  assert.ok(bos.includes('id="kapak-onizleme"'), 'önizleme alanı olmalı');
  assert.ok(!bos.includes('KAPAĞI KALDIR'), 'kapak yokken kaldırma düğmesi çıkmaz');
  assert.ok(bos.includes('Kalabalık Caddesi'), 'pencerede hangi kaydın kapağı olduğu yazılmalı');

  const dolu = V.kapakPenceresi({ kapakUrl: '/kapak/tracks/a.jpg', alt: 'Kalabalık Caddesi', mevcutVar: true });
  assert.ok(dolu.includes('src="/kapak/tracks/a.jpg"'), 'mevcut kapak gösterilmeli');
  assert.ok(dolu.includes('data-act="kapak-sil"'), 'kaldırma düğmesi olmalı');
});

test('parça, liste ve klasör kapakları panelden yerleştirilebilir', () => {
  const klasor = V.gorunum(durum({ nav: 'icerik', sub: 'klasorler', openFolder: 'f1' }), D, ui).html;
  assert.ok(klasor.includes('data-act="track-img"'), 'parça satırında kapak düğmesi olmalı');
  assert.ok(klasor.includes('>KAPAK<'), 'düğme ne yaptığını söylemeli');
  assert.ok(klasor.includes('data-act="cover-open"'), 'klasör kapağı da aynı akışla yerleştirilmeli');
  assert.ok(!klasor.includes('id="cover-file"'), 'önizlemesiz eski dosya alanı kalkmalı');

  const liste = V.gorunum(durum({ nav: 'musteri', sub: 'listeler', openPlaylist: 'l1' }), D, ui).html;
  assert.ok(liste.includes('data-act="list-img"'), 'liste kapağı yerleştirilebilmeli');
  assert.ok(liste.includes('KAPAK YERLEŞTİR'), 'kapağı olmayan listede yerleştirme istenir');

  const kapakli = { ...D, playlists: [{ ...D.playlists[0], cover_path: 'listeler/l1.jpg' }] };
  const kapakliHtml = V.gorunum(durum({ nav: 'musteri', sub: 'listeler', openPlaylist: 'l1' }), kapakli, ui).html;
  assert.ok(kapakliHtml.includes('/kapak/listeler/l1.jpg'), 'yerleştirilmiş kapak görünmeli');
  assert.ok(kapakliHtml.includes('KAPAĞI DEĞİŞTİR'));
  // Liste listesinde de kapak simgesi görünmeli.
  assert.ok(V.gorunum(durum({ nav: 'musteri', sub: 'listeler' }), kapakli, ui).html
    .includes('/kapak/listeler/l1.jpg'));
});

// Liste adı yazımı sahaya çıkıyor (panelde, müşteri sunumunda ve personelin
// cihazındaki seçicide). Panelden düzeltilebilmesi için alan bulunmalı ve mevcut
// ad önceden dolu gelmeli.
test('liste detayı listeyi yeniden adlandırmayı sağlar', () => {
  const { html } = V.gorunum(durum({ nav: 'musteri', sub: 'listeler', openPlaylist: 'l1' }), D, ui);
  assert.ok(html.includes('data-act="list-rename"'), 'adı kaydet düğmesi olmalı');
  assert.match(html, /id="pl-name" value="Akşam Akışı"/, 'mevcut ad önceden yazılmalı');
  assert.ok(html.includes('LİSTE ADI'), 'alanın ne olduğu yazılmalı');
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

// Cihazı dokunuşsuz çalıştırma ayarı panelden verilir: komut şubenin gerçek
// linkiyle hazır gelmeli ki kimse elle birleştirmesin.
test('dokunuşsuz kurulum komutu şubenin linkiyle hazır verilir', () => {
  const link = 'https://ornek.test/radyo.html?key=' + ANAHTAR_NISANTASI;
  const html = V.kioskKurulum(link);
  assert.ok(html.includes(link), 'komut şubenin linkini içermeli');
  assert.ok(html.includes('--autoplay-policy=no-user-gesture-required'));
  assert.ok(html.includes('--kiosk'));
  assert.ok(/MACOS/i.test(html) && /WINDOWS/i.test(html), 'iki platform da anlatılmalı');
  // Komutlar kopyalanabilmeli.
  assert.equal((html.match(/data-act="copy"/g) || []).length, 2);
  // Ayarlanmazsa tek dokunuşun yettiği de yazmalı.
  assert.ok(html.includes('YAYINI BAŞLAT'));

  // Link HTML'e gömülürken kaçış yapılmalı, yoksa data-copy bozulur.
  assert.ok(V.kioskKurulum('https://x/radyo.html?key=a"b').includes('&quot;'));
});

// Şube çekmecesinde kurulum düğmesi bulunmalı, yoksa özellik görünmez.
test('şube çekmecesi dokunuşsuz kurulum düğmesi gösterir', () => {
  const html = V.subeCekmecesi('p1', D, ui);
  assert.ok(html.includes('data-act="player-kiosk"'));
  assert.ok(html.includes('DOKUNUŞSUZ KURULUM'));
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

// Marka sayfasının altındaki kayıt listeleri (anons geçmişi, sunum giriş
// denemeleri, şube bağlantı geçmişi) sayfayı uzatıyordu. Bölümler kapalı gelir;
// başlık ve tek satır özet yerinde kalır, liste istenince açılır ve açık kalan
// bölüm yeniden çizimde kapanmaz.
test('marka sayfasındaki geçmiş bölümleri katlanır', () => {
  const dolu = {
    ...D,
    announcements: [{
      id: 'an1', brand_id: 'b1', storage_path: 'b1/anons.webm',
      label: 'Kapanış anonsu', created_at: iso(-2 * GUN)
    }],
    olaylar: [{ id: 'ev1', brand_id: 'b1', player_id: 'p1', kind: 'durakladi', detail: 'yok-boyle-sebep', at: iso(-3600000) }]
  };
  const marka = ek => V.gorunum(
    durum(Object.assign({ nav: 'musteri', sub: 'markalar', openBrand: 'b1' }, ek)), dolu, ui).html;
  const kapali = marka({});

  ['anons', 'giris', 'olay'].forEach(k => assert.ok(
    kapali.includes(`data-act="katla" data-id="marka:b1:${k}"`), k + ' bölümü katlanabilmeli'));
  assert.ok(kapali.includes('>AÇ ▾<'), 'kapalı bölüm açma düğmesi taşımalı');
  assert.ok(!kapali.includes('data-katli="marka:b1:anons"'), 'kapalı bölümün tablosu çizilmemeli');
  assert.ok(!kapali.includes('data-act="anons-del"'), 'kapalı bölümün satırları görünmemeli');
  assert.ok(kapali.includes('MİKROFONU AÇ'), 'anons düğmesi katlıyken de erişilebilir kalmalı');
  assert.ok(kapali.includes('TÜM GEÇMİŞİ GEÇMİŞ EKRANINDA AÇ'), 'tüm geçmiş düğmesi katlıyken de durmalı');
  assert.ok(kapali.includes('Son anons'), 'katlıyken tek satır özet görünmeli');

  const acik = marka({ acik: { 'marka:b1:anons': true } });
  assert.ok(acik.includes('data-katli="marka:b1:anons"'), 'açılan bölümün tablosu çizilmeli');
  assert.ok(acik.includes('>KAPAT ▴<'), 'açık bölüm kapatma düğmesi taşımalı');
  assert.ok(acik.includes('data-act="anons-del"'), 'açık bölümde satırlar görünmeli');
  assert.ok(!acik.includes('data-katli="marka:b1:olay"'), 'diğer bölümler kapalı kalmalı');
});

// Yönetim yayın kaynağını durdurduğunda cihaz çalmaya devam eder. Bu, geçmişte
// okunur bir cümle olmalı; ham olay kodu ekrana düşmemeli ve yayın sürdüğü için
// "sorun" sayacına girmemeli.
test('kaynak durdurma olayı geçmişte okunur cümleyle görünür ve sorun sayılmaz', () => {
  const D2 = Object.assign({}, D, {
    olaylar: [{
      id: 'ev9', brand_id: 'b1', player_id: 'p1', kind: 'serbest',
      detail: 'Sabah Açılış', at: iso(-600000)
    }]
  });
  const html = V.gorunum(durum({ nav: 'canli', sub: 'gecmis' }), D2, ui).html;
  assert.ok(html.includes('Yayın kaynağı durduruldu, cihaz çalmaya devam ediyor'),
    'olay okunur cümleyle gösterilmeli');
  assert.ok(!html.includes('>serbest<'), 'ham olay kodu ekrana düşmemeli');

  const ozet = V.gecmisOzet(D2, ui, {});
  assert.equal(ozet.toplam, 1, 'olay özete girmeli');
  assert.equal(ozet.bizde + ozet.kafe, 0, 'yayın sürdüğü için sorun sayılmamalı');
  assert.equal(V.olaySorunSayi(D2), 0);
});

test('bağlantı sınaması düğmesi her şubede bulunmaz, yalnızca çekmecede olur', () => {
  const liste = V.gorunum(durum({}), D, ui).html;
  assert.ok(!liste.includes('BAĞLANTIYI SINA'), 'tabloda yer kaplamamalı');
  assert.ok(V.subeCekmecesi('p1', D, ui).includes('BAĞLANTIYI SINA'));
});

// Panel cihaz sayfasını açmaz: o sayfada da "YAYINI BAŞLAT" düğmesi olduğu için
// panelden açmak, aynı adı taşıyan ikinci bir başlatma yolu gibi görünüyordu.
// Link yalnız kopyalanır, şube cihazında açılır.
test('çekmece cihaz sayfasını açmaz, yayın linkini yalnız kopyalatır', () => {
  const html = V.subeCekmecesi('p1', D, ui);
  assert.ok(html.includes('data-act="copy"'), 'yayın linki kopyalanabilmeli');
  assert.ok(!html.includes('YAYINI AÇ'), 'cihaz sayfasını açan düğme bulunmamalı');
  assert.ok(!/href="[^"]*radyo\.html/.test(html), 'çekmeceden cihaz sayfasına bağlantı verilmemeli');
  assert.ok(html.includes('DOKUNUŞSUZ KURULUM'), 'dokunuşsuz kurulum yolu kalmalı');
});

// ---------- Eksik kapak işareti ----------
// Kapaklar sahada (oynatıcı ekranı, müşteri sunumu) görünür ve kaydın kendi
// sayfasından elle yerleştirilir. Panel ayrı bir denetim ekranı tutmaz; yalnızca
// eksik kapağı olan satırı işaretler ki kullanıcı kaydı ararken gözüyle bulsun.
const kapakVer = (kurgu, { tracks = true, playlists = true, folders = true } = {}) => ({
  ...kurgu,
  tracks: kurgu.tracks.map(t => ({ ...t, cover_path: tracks ? 'tracks/' + t.id + '.jpg' : null })),
  playlists: kurgu.playlists.map(p => ({ ...p, cover_path: playlists ? 'listeler/' + p.id + '.jpg' : null })),
  folders: kurgu.folders.map(f => ({ ...f, cover_path: folders ? 'klasorler/' + f.id + '.jpg' : null }))
});

test('panel ayrı bir kapak denetim ekranı göstermez', () => {
  const html = V.gorunum(durum({ nav: 'icerik', sub: 'klasorler' }), D, ui).html;
  assert.ok(!html.includes('KAPAK DENETİMİ'), 'denetim paneli kaldırıldı: kapak işi kaydın kendi sayfasında');
  assert.ok(!html.includes('KAPAK YERLEŞTİR'), 'toplu yerleştirme düğmesi çıkmaz');
  // Kapak penceresi hâlâ kullanılabilir olmalı (parça satırındaki düğme).
  assert.ok(V.gorunum(durum({ nav: 'icerik', openFolder: 'f1' }), D, ui).html.includes('data-act="track-img"'));
});

test('eksik kapak satırda işaretlenir, kapak yerleşince işaret kaybolur', () => {
  const klasorler = V.gorunum(durum({ nav: 'icerik', sub: 'klasorler' }), D, ui).html;
  assert.match(klasorler, /2 KAPAK YOK/, 'klasör satırı eksik parça sayısını yazmalı');

  const listeler = V.gorunum(durum({ nav: 'musteri', sub: 'listeler' }), D, ui).html;
  assert.match(listeler, /2 parça · 2 kapağı yok/, 'liste satırı eksik kapağı söylemeli');
  assert.match(listeler, /· kapağı yok/, 'kapağı olmayan liste kendini belli etmeli');

  const akis = V.gorunum(durum({ nav: 'musteri', sub: 'listeler', openPlaylist: 'l1' }), D, ui).html;
  assert.ok(akis.includes('2 KAPAK YOK'), 'liste akışı eksik kapağı sayar');

  const tam = V.gorunum(durum({ nav: 'icerik', sub: 'klasorler' }), kapakVer(D), ui).html;
  assert.ok(!tam.includes('KAPAK YOK'), 'kapağı yerleşmiş kayıt işaretlenmez');

  const menuler = { players: 1, folders: 1, announcements: 0, brands: 1, playlists: 1, requests: 0 };
  const kullanici = { ad: 'Yönetici', alt: '', basHarf: 'Y' };
  const rail = V.nav(durum({ nav: 'icerik', sub: 'klasorler' }), menuler, kullanici);
  assert.ok(rail.includes('Parçalar, sıra, kapak'), 'menü açıklaması sade kalmalı');
  assert.ok(!rail.includes('kapak eksik'), 'menüde kapak denetimi sayacı olmaz');
});

// ---------- BAĞLANTI GEÇMİŞİ ----------
// Kafenin oynatıcıyı açması, personelin liste seçmesi, yayının durması ve sunum
// kodunun girilmesi tek çizelgede okunur. Panelin asıl işi “yayın durdu”
// şikâyetini tarafa yazmak: biz mi durdurduk, kafe mi?
const OLAYLAR = [
  { id: 'e1', player_id: 'p1', brand_id: 'b1', kind: 'acildi', detail: 'Chrome · macOS', at: iso(-2 * 3600000) },
  { id: 'e2', player_id: 'p1', brand_id: 'b1', kind: 'liste_degisti', detail: 'Akşam Akışı', at: iso(-90 * 60000) },
  { id: 'e3', player_id: 'p1', brand_id: 'b1', kind: 'caliyor', detail: 'Kalabalık Caddesi · Akşam Akışı', at: iso(-85 * 60000) },
  { id: 'e4', player_id: 'p1', brand_id: 'b1', kind: 'durakladi', detail: 'cihaz', at: iso(-45 * 60000) },
  { id: 'e5', player_id: 'p1', brand_id: 'b1', kind: 'durakladi', detail: 'mesai-disi', at: iso(-30 * 60000) },
  { id: 'e6', player_id: 'p1', brand_id: 'b1', kind: 'hata', detail: 'anahtar-yok', at: iso(-25 * 60000) },
  { id: 'e7', player_id: null, brand_id: 'b1', kind: 'takildi', detail: 'eski olay', at: iso(-3 * GUN) }
];
const DOLAY = { ...D, olaylar: OLAYLAR };

test('geçmiş olayı okunur cümleye ve tarafa çevirir', () => {
  const kafe = V.olayBilgi({ kind: 'durakladi', detail: 'cihaz' });
  assert.equal(kafe.taraf, 'kafe');
  assert.equal(kafe.sorun, true);
  assert.match(kafe.ad, /cihazdan durduruldu/);

  const bizde = V.olayBilgi({ kind: 'durakladi', detail: 'mesai-disi' });
  assert.equal(bizde.taraf, 'bizde', 'mesai saati bizim ayarımız');
  assert.match(bizde.ad, /Yayın saati bitti/);
  assert.equal(V.olayBilgi({ kind: 'durakladi', detail: 'cihaz-kilidi' }).taraf, 'bizde');
  assert.equal(V.olayBilgi({ kind: 'durakladi', detail: 'liste-bos' }).taraf, 'bizde');

  const hata = V.olayBilgi({ kind: 'hata', detail: 'marka-pasif-veya-kaynak-yok' });
  assert.equal(hata.taraf, 'bizde');
  assert.match(hata.ek, /yayın kaynağı atanmamış/);
  assert.match(hata.ek, /marka-pasif-veya-kaynak-yok/, 'teşhis kodu sahadaki ekranla eşleşmeli');

  // Sebep kaydedilmemişse taraf iddia edilmez: yanlış tarafa yazmak, hiç
  // yazmamaktan kötüdür.
  const bilinmez = V.olayBilgi({ kind: 'durakladi', detail: 'bilinmeyen-sebep' });
  assert.equal(bilinmez.taraf, null);
  assert.equal(bilinmez.sorun, true);

  // Açılış, liste seçimi ve normal çalma bir arıza değildir.
  assert.equal(V.olayBilgi({ kind: 'acildi' }).sorun, false);
  assert.equal(V.olayBilgi({ kind: 'acildi' }).taraf, 'kafe');
  assert.equal(V.olayBilgi({ kind: 'caliyor' }).sorun, false);
  assert.equal(V.olayBilgi({ kind: 'devam' }).sorun, false);
});

test('özet yalnızca son 24 saatteki arızaları tarafa göre sayar', () => {
  const o = V.gecmisOzet(DOLAY, ui, { kodlar: true });
  assert.equal(o.kafe, 1, 'cihazdan durdurma kafe tarafında');
  assert.equal(o.bizde, 2, 'mesai ve kopuk zincir bizim tarafımızda');
  assert.equal(o.kod, 1, 'sunum kod girişi ayrı sayılır');
  assert.equal(o.yanlis, 1);
  assert.equal(o.toplam, 7, '24 saatten eski olay sayılmaz (6 olay + 1 kod)');
  assert.equal(V.olaySorunSayi(DOLAY), 3, 'menü rozeti son 24 saatteki arızayı gösterir');
  // Geçmiş tablosu hiç kurulmadıysa sayaç sıfır kalır, patlamaz.
  assert.equal(V.olaySorunSayi(D), 0);
});

test('bağlantı geçmişi ekranı şu anı, özeti ve çizelgeyi çizer', () => {
  const html = V.gorunum(durum({ nav: 'canli', sub: 'gecmis' }), DOLAY, ui).html;
  assert.ok(html.includes('BAĞLANTI GEÇMİŞİ'));
  assert.ok(html.includes('ŞU AN'), 'şu an çalıyor mu sorusu aynı ekranda cevaplanmalı');
  assert.ok(html.includes('BİZİM TARAF') && html.includes('KAFE TARAFI'));
  assert.ok(html.includes('▶ ÇALIYOR'), 'bağlı ve çalan şube görünmeli');
  assert.ok(html.includes('Kafede cihazdan durduruldu'));
  assert.ok(html.includes('Yayın saati bitti'));
  assert.ok(html.includes('Oynatıcı açıldı'));
  assert.ok(html.includes('Çalma listesi seçildi'));
  assert.ok(html.includes('Akşam Akışı'), 'personelin seçtiği liste adı geçmişte okunmalı');
  assert.ok(html.includes('Sunum kodu yanlış girildi'), 'kod girişleri aynı çizelgede görünür');
  assert.ok(html.includes('Mokka Coffee · Nişantaşı'), 'satır kafeyi ve şubeyi birlikte yazar');
  assert.ok(html.includes('yayın anahtarı sistemde bulunamadı'), 'teşhis kodu insan diline çevrilir');
});

test('geçmiş tablosu kurulmamışsa ekran kod girişleriyle çalışır', () => {
  const html = V.gorunum(durum({ nav: 'canli', sub: 'gecmis' }), D, ui).html;
  assert.ok(html.includes('BAĞLANTI GEÇMİŞİ'));
  assert.ok(html.includes('radio-baglanti-gecmisi.sql'), 'kurulum notu dürüstçe yazılmalı');
  assert.ok(html.includes('Sunum kodu yanlış girildi'), 'kod girişleri yine görünür');
  assert.ok(!html.includes('Oynatıcı açıldı'), 'oynatıcı olayı yoksa satır da olmaz');
});

test('geçmiş araması hem şubeyi hem olay satırlarını süzer', () => {
  const nisantasi = V.gorunum(durum({ nav: 'canli', sub: 'gecmis', q: 'Nişantaşı' }), DOLAY, ui).html;
  assert.ok(nisantasi.includes('Nişantaşı'));
  assert.ok(nisantasi.includes('Kafede cihazdan durduruldu'));

  const bos = V.gorunum(durum({ nav: 'canli', sub: 'gecmis', q: 'Kadıköy' }), DOLAY, ui).html;
  assert.ok(!bos.includes('Nişantaşı'), 'eşleşmeyen şube çizilmez');
  assert.ok(bos.includes('Kayıtlı olay yok'), 'eşleşmeyen olay satırı çizilmez');
});

// ---------- ÇALIŞMA SÜRESİ (kesinti kimin yüzünden) ----------
// Hesap şubenin yayın saatlerine bağlı olduğu için testin günün saatine göre
// değişmemesi şart: saati sabitliyoruz (İstanbul 15:00) ve olayları bu ana göre
// kuruyoruz.
const SABIT = Date.UTC(2026, 8, 26, 12, 0, 0);
const dkOnce = n => new Date(SABIT - n * 60000).toISOString();
const uiSabit = { ...ui, now: () => SABIT };
// Şube 11:40'ta açıldı, 12:00'de çalmaya başladı, 14:00'te cihazdan durduruldu.
const SABIT_OLAYLAR = [
  { id: 's1', player_id: 'p1', brand_id: 'b1', kind: 'acildi', detail: 'Chrome · macOS', at: dkOnce(200) },
  { id: 's2', player_id: 'p1', brand_id: 'b1', kind: 'caliyor', detail: 'Kalabalık Caddesi', at: dkOnce(180) },
  { id: 's3', player_id: 'p1', brand_id: 'b1', kind: 'durakladi', detail: 'cihaz', at: dkOnce(60) }
];
const SABIT_D = { ...D, olaylar: SABIT_OLAYLAR };

test('süreler sahada okunur biçimde yazılır', () => {
  assert.equal(V.sureMetni(45 * 1000), '45 sn');
  assert.equal(V.sureMetni(38 * 60000), '38 dk');
  assert.equal(V.sureMetni((2 * 60 + 14) * 60000), '2 sa 14 dk');
  assert.equal(V.sureMetni(120 * 60000), '2 sa');
  assert.equal(V.sureMetni(-5000), '0 sn', 'negatif süre 0 olmalı');
});

test('yayın saatleri dışındaki süre hesaba katılmaz', () => {
  const p = { open_time: '09:00:00', close_time: '22:00:00' };
  // İstanbul 20:00 → ertesi gün 12:00: yalnızca 20:00–22:00 ve 09:00–12:00.
  const toplam = V.mesaiParcalari(p, Date.UTC(2026, 8, 26, 17, 0, 0), Date.UTC(2026, 8, 27, 9, 0, 0))
    .reduce((t, [x, y]) => t + (y - x), 0);
  assert.equal(toplam, 5 * 3600000, 'kapanıştan sonra susan yayın kesinti sayılmaz');
  // Saat sınırı olmayan şubede gün boyu yayın beklenir.
  const serbest = V.mesaiParcalari({ open_time: null, close_time: null }, 0, 3600000);
  assert.equal(serbest.length, 1);
});

test('kesinti, durdurmayı kim yaptıysa ona yazılır', () => {
  const p = D.players[0];
  const k = V.kesintiHesap(SABIT_D, p, SABIT, 1);
  assert.equal(k.veriVar, true);
  assert.equal(k.caldi, 2 * 3600000, 'çalma 12:00–14:00 arası sayılır');
  assert.equal(k.kafe, 3600000, '14:00’te cihazdan durduruldu: 1 sa kafe tarafında');
  assert.equal(k.bizde, 0);
  assert.equal(k.beklenen, ((3 * 60 + 20) * 60000), 'ölçüm cihazın açıldığı andan başlar');
  assert.equal(k.yuzde, 60);
});

test('yayın zinciri kopuksa tüm süre bizim tarafımıza yazılır', () => {
  const p = D.players[0];
  const kopuk = { ...D, olaylar: [
    { id: 'k1', player_id: 'p1', brand_id: 'b1', kind: 'acildi', at: dkOnce(200) },
    { id: 'k2', player_id: 'p1', brand_id: 'b1', kind: 'hata', detail: 'anahtar-yok', at: dkOnce(120) }
  ] };
  const k = V.kesintiHesap(kopuk, p, SABIT, 1);
  assert.equal(k.caldi, 0);
  assert.equal(k.yuzde, 0, 'hiç çalmadıysa doluluk sıfır');
  assert.equal(k.bizde, 2 * 3600000, '13:00–15:00 arası kopukluk bizde');
  assert.equal(k.kafe, 0);
});

test('takılma ve çalınamayan dosya kesinti sayılmaz', () => {
  // Oynatıcı bu iki durumda hemen yeniden bağlanır; yayın durmuş değildir.
  const p = D.players[0];
  const takildi = { ...D, olaylar: [
    { id: 't1', player_id: 'p1', brand_id: 'b1', kind: 'acildi', at: dkOnce(200) },
    { id: 't2', player_id: 'p1', brand_id: 'b1', kind: 'takildi', detail: 'Kalabalık Caddesi', at: dkOnce(30) },
    { id: 't3', player_id: 'p1', brand_id: 'b1', kind: 'yuklenemedi', detail: 'Parça', at: dkOnce(20) }
  ] };
  const k = V.kesintiHesap(takildi, p, SABIT, 1);
  assert.equal(k.veriVar, false, 'çalma/durma kaydı yoksa hiçbir iddia edilmez');
  assert.equal(k.yuzde, null);
  assert.equal(V.kesintiHesap(D, p, SABIT, 1).veriVar, false, 'geçmiş tablosu yoksa da susar');
});

test('çalışma paneli doluluğu, kesintiyi ve tarafı yazar', () => {
  const html = V.gorunum(durum({ nav: 'canli', sub: 'gecmis' }), SABIT_D, uiSabit).html;
  assert.ok(html.includes('ÇALIŞMA SÜRESİ'));
  assert.ok(html.includes('DOLULUK') && html.includes('KESİNTİ'));
  assert.match(html, /%60/, 'doluluk yüzdesi yazılmalı');
  assert.ok(html.includes('kafede 1 sa'), 'kesintinin tarafı yazılmalı');
  assert.ok(html.includes('ölçüm: 3 sa 20 dk'));
  // Kayıt yoksa yüzde uydurulmaz.
  const bos = V.gorunum(durum({ nav: 'canli', sub: 'gecmis' }), D, uiSabit).html;
  assert.ok(bos.includes('kayıt yok'), 'geçmiş tablosu yokken “kayıt yok” denir');
  assert.ok(!/%\d/.test(bos.split('ÇALIŞMA SÜRESİ')[1].split('BAĞLANTI GEÇMİŞİ')[0]),
    'kayıt yokken yüzde yazılmaz');
});

test('şube çekmecesi 24 saatlik çalışma özetini cümleyle yazar', () => {
  const cekmece = V.subeCekmecesi('p1', SABIT_D, uiSabit);
  assert.ok(cekmece.includes('Son 24 saat: %60 çalıştı (3 sa 20 dk ölçüldü) · 1 sa kesinti (kafede 1 sa)'),
    'çekmecede tek cümlelik özet olmalı');
  assert.ok(V.subeCekmecesi('p1', D, uiSabit).includes('Son 24 saat için çalışma kaydı yok.'));
});

test('şube çekmecesi ve marka sayfası bağlantı geçmişini gösterir', () => {
  const cekmece = V.subeCekmecesi('p1', DOLAY, ui);
  assert.ok(cekmece.includes('BAĞLANTI GEÇMİŞİ'), 'çekmecede geçmiş bloğu olmalı');
  assert.ok(cekmece.includes('data-act="katla-yerel"'), 'çekmecede katlama seçeneği olmalı');
  // Geçmiş çekmecede kapalı gelir: satırlar HTML'de durur ama gizlidir, özet
  // satırı görünür kalır. Çekmece uzayıp şubenin asıl işini aşağı itmesin.
  assert.ok(cekmece.includes('<div data-yerel-katli hidden>'), 'geçmiş kapalı gelmeli');
  assert.ok(cekmece.includes('Kafede cihazdan durduruldu'));
  assert.ok(cekmece.includes('data-act="gecmis-ac"'), 'tüm geçmişe geçiş düğmesi olmalı');
  // Şube zaten belli: satırda “kim” sütununu tekrar etmeyiz.
  assert.ok(!cekmece.includes('Mokka Coffee · Nişantaşı'));

  // Marka sayfasında geçmiş bölümü kapalı gelir; satırlar bölüm açılınca çizilir
  // (özet satırı kapalıyken de “son 24 saatte ne oldu” bilgisini verir).
  const markaKapali = V.gorunum(durum({ nav: 'musteri', sub: 'markalar', openBrand: 'b1' }), DOLAY, ui).html;
  assert.ok(markaKapali.includes('ŞUBE BAĞLANTI GEÇMİŞİ'));
  assert.ok(!markaKapali.includes('Kafede cihazdan durduruldu'), 'katlı bölümün satırları çizilmez');

  const marka = V.gorunum(durum({
    nav: 'musteri', sub: 'markalar', openBrand: 'b1', acik: { 'marka:b1:olay': true }
  }), DOLAY, ui).html;
  assert.ok(marka.includes('data-katli="marka:b1:olay"'), 'açılan bölüm çizilmeli');
  assert.ok(marka.includes('Kafede cihazdan durduruldu'));
  // Şube geçmişi şube başına ayrı tabloda durur ve o tablolar kendi başlığını taşır.
  assert.ok(marka.includes('data-katli="marka:b1:sube:p1"'), 'şube geçmişi kendi tablosunda');
});

// Marka sayfasındaki şube geçmişi şube başına ayrı ve açılıp kapanabilir tablolara
// bölündü: tek uzun listede bütün şubelerin kayıtları karışıyordu. Kaydı olmayan
// şube de görünür (boş tablo), ama orada silinecek bir geçmiş yoktur.
test('marka geçmişi şube şube ayrı tablolarda açılıp kapanır', () => {
  const ikiSube = {
    ...DOLAY,
    players: [
      D.players[0],
      { ...D.players[0], id: 'p2', label: 'Kadıköy', player_key: ANAHTAR(9) }
    ]
  };
  const disAcik = durum({
    nav: 'musteri', sub: 'markalar', openBrand: 'b1', acik: { 'marka:b1:olay': true }
  });

  const html = V.gorunum(disAcik, ikiSube, ui).html;
  assert.ok(html.includes('data-katli="marka:b1:sube:p1"'), 'Nişantaşı tablosu çizilmeli');
  assert.ok(html.includes('data-katli="marka:b1:sube:p2"'), 'Kadıköy tablosu çizilmeli');
  // Şube adı tablonun başlığında; satırda bir de “kim” sütunu tekrar etmez.
  assert.ok(html.includes('<thead><tr><th>OLAY</th><th>TARAF</th><th>ZAMAN</th></tr></thead>'),
    'şube geçmişi satırlarında şube sütunu tekrarlanmamalı');
  assert.ok(html.includes('data-act="gecmis-del" data-id="p1"'), 'şube geçmişi silinebilmeli');
  assert.ok(!html.includes('data-act="gecmis-del" data-id="p2"'),
    'kaydı olmayan şubede silinecek geçmiş yok');
  assert.ok(html.includes('Bu şube için kayıt yok.'), 'boş şube boş görünmeli');
  assert.ok(html.includes('data-act="marka-gecmis-del" data-id="b1"'),
    'marka geneli geçmiş silinebilmeli');

  // Bir şube kapatılınca yalnız o tablo çizilmez; diğerleri açık kalır.
  const kapali = V.gorunum(Object.assign({}, disAcik, { kapali: { 'marka:b1:sube:p1': true } }), ikiSube, ui).html;
  assert.ok(!kapali.includes('data-katli="marka:b1:sube:p1"'), 'kapatılan tablo çizilmez');
  assert.ok(kapali.includes('data-katli="marka:b1:sube:p2"'), 'diğer tablo açık kalmalı');
});

// "Bağlantı geçmişi" sekmesindeki olay tablosu da katlanabilir. Ama burada tablo
// ekranın asıl içeriğidir: açık gelir, istenirse kapatılır (marka sayfasındaki
// bölümlerin tersine).
test('bağlantı geçmişi sekmesindeki tablo katlanabilir ve açık gelir', () => {
  const acik = V.gorunum(durum({ nav: 'canli', sub: 'gecmis' }), DOLAY, ui).html;
  assert.ok(acik.includes('data-act="katla-alt" data-id="gecmis:olaylar"'), 'katlama düğmesi olmalı');
  assert.ok(acik.includes('data-katli="gecmis:olaylar"'), 'tablo varsayılan açık gelmeli');
  assert.ok(acik.includes('Kafede cihazdan durduruldu'));

  const kapali = V.gorunum(durum({
    nav: 'canli', sub: 'gecmis', kapali: { 'gecmis:olaylar': true }
  }), DOLAY, ui).html;
  assert.ok(!kapali.includes('data-katli="gecmis:olaylar"'), 'kapatılınca tablo çizilmez');
  assert.ok(kapali.includes('data-act="katla-alt" data-id="gecmis:olaylar"'), 'düğme yerinde kalmalı');
});

// ---------- HAFTALIK TREND (gün gün doluluk) ----------
// Hafta boyu bakmak “bu şube bozuluyor mu, düzeliyor mu” sorusunu cevaplar.
// Saat sabit kaldığı için gün sınırları da sabittir: SABIT İstanbul 26 Eyl
// Cumartesi 15:00; gün başları İstanbul gece yarısıdır.
const TEST_GUN = 86400000;
// İstanbul saatiyle “geri. gün, saat:dk” anını ISO dizesine çevirir.
const istAn = (geri, saat, dk) => new Date(
  SABIT - geri * TEST_GUN - (900 - (saat * 60 + (dk || 0))) * 60000).toISOString();

// Dün 09:00'da başladı, dün 12:00'de kafede cihazdan durduruldu, bugün 09:30'da
// yeniden başladı ve hâlâ çalıyor.
const TREND_OLAYLAR = [
  { id: 'u1', player_id: 'p1', brand_id: 'b1', kind: 'acildi', detail: 'Chrome · macOS', at: istAn(1, 8, 55) },
  { id: 'u2', player_id: 'p1', brand_id: 'b1', kind: 'caliyor', detail: 'Sabah Açılış', at: istAn(1, 9, 0) },
  { id: 'u3', player_id: 'p1', brand_id: 'b1', kind: 'durakladi', detail: 'cihaz', at: istAn(1, 12, 0) },
  { id: 'u4', player_id: 'p1', brand_id: 'b1', kind: 'caliyor', detail: 'Sabah Açılış', at: istAn(0, 9, 30) }
];
const TREND_D = { ...D, olaylar: TREND_OLAYLAR };

test('gün etiketi bugünü, dünü ve tarihi ayırır', () => {
  assert.equal(V.gunEtiketi(SABIT, SABIT), 'Bugün');
  assert.equal(V.gunEtiketi(SABIT - TEST_GUN, SABIT), 'Dün');
  // Altı gün önce: 20 Eylül 2026 Pazar.
  assert.equal(V.gunEtiketi(SABIT - 6 * TEST_GUN, SABIT), 'Paz 20 Eyl');
  assert.equal(V.sonGunler(SABIT, 7).length, 7);
  assert.equal(V.sonGunler(SABIT, 7)[6], SABIT - 15 * 3600000, 'son sütun bugündür');
});

test('haftalık trend tek bir kesintiyi günlere böler', () => {
  const seri = V.gunlukSeri(TREND_D, D.players[0], SABIT, 7);
  assert.equal(seri.length, 7);
  const dun = seri[5], bugun = seri[6];

  // Dün: 09:00–12:00 çaldı, 12:00’de kafede durdu, gün kapanışına (22:00) kadar
  // susuz kaldı. Ölçüm ilk olayla başlar: 09:00 → 22:00 = 13 sa.
  assert.equal(dun.caldi, 3 * 3600000);
  assert.equal(dun.kafe, 10 * 3600000);
  assert.equal(dun.bizde, 0);
  assert.equal(dun.beklenen, 13 * 3600000);
  assert.equal(dun.yuzde, 23);

  // Bugün: aynı kesinti 09:00’a kadar sürdü, 09:30’da yayın döndü. Kesinti
  // ertesi güne de yazılır; yoksa “dün durdu, bugün temiz” gibi yanlış bir okuma
  // çıkardı.
  assert.equal(bugun.kafe, 30 * 60000);
  assert.equal(bugun.caldi, 5.5 * 3600000);
  assert.equal(bugun.beklenen, 6 * 3600000, 'bugün 09:00–15:00 arası ölçülür');
  assert.equal(bugun.yuzde, 92);

  // Cihazın kurulmadığı günler “kayıt yok” der; yüzde sıfır uydurulmaz.
  assert.equal(seri[0].veriVar, false);
  assert.equal(seri[0].yuzde, null);
  assert.equal(seri[0].beklenen, 0);
});

test('trend tablosu gün sütunlarını ve hafta toplamını çizer', () => {
  const html = V.gorunum(durum({ nav: 'canli', sub: 'gecmis' }), TREND_D, uiSabit).html;
  assert.ok(html.includes('HAFTALIK TREND'));
  assert.ok(html.includes('BUGÜN') && html.includes('DÜN'));
  assert.ok(html.includes('PAZ 20 EYL') && html.includes('PER 24 EYL'), 'gün sütunları tarihle yazılır');
  assert.ok(html.includes('7 GÜN'), 'hafta toplamı sütunu olmalı');
  assert.ok(html.includes('kafede 10 sa 30 dk'), 'haftanın kesintisi tarafa yazılır');
  assert.ok(html.includes('1 gün zayıf'), 'yüzde 90 altındaki gün sayısı okunur');

  // Kayıt yoksa trend tablosu yüzde uydurmaz: yalnızca “—” ve “kesinti yok”.
  const bos = V.gorunum(durum({ nav: 'canli', sub: 'gecmis' }), D, uiSabit).html;
  const trend = bos.split('HAFTALIK TREND')[1].split('BAĞLANTI GEÇMİŞİ')[0];
  assert.ok(!/%\d/.test(trend), 'geçmiş tablosu yoksa trendde yüzde yazılmaz');
});

// ---------- KESİNTİ UYARISI ----------
// Panel kendiliğinden haber vermeli: mesai içinde yayın durmuşsa “kontrol eder
// misin” diyen birini beklemeyiz. Ama her suskunluk uyarı değildir.
const SESSIZ_OLAYLAR = [
  { id: 'y1', player_id: 'p1', brand_id: 'b1', kind: 'acildi', detail: 'Chrome · macOS', at: istAn(1, 8, 55) },
  { id: 'y2', player_id: 'p1', brand_id: 'b1', kind: 'caliyor', detail: 'Sabah Açılış', at: istAn(1, 9, 0) },
  { id: 'y3', player_id: 'p1', brand_id: 'b1', kind: 'durakladi', detail: 'cihaz', at: istAn(1, 12, 0) }
];
const SESSIZ_D = { ...D, olaylar: SESSIZ_OLAYLAR };

test('mesai içinde susan şube uyarı üretir', () => {
  const sessiz = V.sessizSubeler(SESSIZ_D, SABIT);
  assert.equal(sessiz.length, 1);
  assert.equal(sessiz[0].p.id, 'p1');
  assert.equal(sessiz[0].taraf, 'kafe');
  // Sessizlik mesai içinde ölçülür: dün 12:00–22:00 (10 sa) + bugün 09:00–15:00.
  assert.equal(sessiz[0].sure, 16 * 3600000);
  assert.equal(V.sessizSayi(SESSIZ_D, SABIT), 1);

  const serit = V.uyariSeridi(SESSIZ_D, uiSabit);
  assert.ok(serit.includes('Nişantaşı 16 saattir sessiz'), 'süre cümlesi okunur olmalı');
  assert.ok(serit.includes('Kafede cihazdan durduruldu'), 'sebep ve taraf şeritte yazılır');
  assert.ok(serit.includes('data-act="branch-open" data-id="p1"'), 'şubeye tek dokunuşla gidilir');
  assert.ok(serit.includes('data-act="gecmis-ac"'), 'geçmişe geçiş düğmesi şeritte olmalı');

  // Uzun süre saniye/dakika karışmasın.
  assert.equal(V.sureCumle(45 * 1000), '45 saniyedir');
  assert.equal(V.sureCumle(42 * 60000), '42 dakikadır');
  assert.equal(V.sureCumle(2 * 3600000), '2 saattir');
  assert.equal(V.sureCumle((2 * 60 + 14) * 60000), '2 saat 14 dakikadır');
  // Günü aşan sessizlik “35 sa” diye okunmasın.
  assert.equal(V.sureCumle(26 * 3600000), '1 gün 2 saattir');
  assert.equal(V.sureCumle(48 * 3600000), '2 gündür');
  assert.equal(V.sureMetni(35 * 3600000), '1 gün 11 sa');
});

test('kısa suskunluk, mesai dışı ve kayıtsız şube uyarı üretmez', () => {
  // Yeni duran yayın: oynatıcı kendi kendine yeniden bağlanıyor olabilir.
  const yeni = { ...D, olaylar: [
    { id: 'n1', player_id: 'p1', brand_id: 'b1', kind: 'caliyor', at: istAn(0, 14, 45) },
    { id: 'n2', player_id: 'p1', brand_id: 'b1', kind: 'durakladi', detail: 'cihaz', at: istAn(0, 14, 55) }
  ] };
  assert.equal(V.sessizSubeler(yeni, SABIT).length, 0, 'dakikalık suskunluk uyarı değildir');
  assert.equal(V.uyariSeridi(yeni, uiSabit), '');

  // Kapanıştan sonra susan yayın haber değildir: şerit boş kalır.
  const gece = SABIT + 8 * 3600000; // İstanbul 23:00
  assert.equal(V.sessizSubeler(SESSIZ_D, gece).length, 0, 'mesai kapalıysa uyarı çıkmaz');
  assert.equal(V.sessizSubeler(SESSIZ_D, gece, 60000).length, 0);

  // Elde kayıt yokken susan cihaz “yayın durdu” diye bağırmaz.
  assert.equal(V.sessizSubeler(D, SABIT).length, 0);
  assert.equal(V.sessizSayi(D, SABIT), 0);
  assert.equal(V.uyariSeridi(D, uiSabit), '');
  // Çalıyorsa da uyarı yok.
  assert.equal(V.sessizSubeler(TREND_D, SABIT).length, 0, '09:30’da dönen yayın sessiz sayılmaz');
});

test('menüde sessiz şube rozeti kırmızı çizilir', () => {
  const kullanici = { ad: 'Yönetici', alt: '', basHarf: 'Y' };
  const temel = { players: 1, folders: 1, announcements: 0, brands: 1, playlists: 1, requests: 0 };
  const uyarili = V.nav(durum({}), { ...temel, olaySorun: null, sessiz: 2, players: 3 }, kullanici);
  assert.ok(uyarili.includes('class="say uyari">2</span>'), 'sessiz şube sayısı kırmızı rozette');
  assert.ok(uyarili.includes('class="say">3</span>'), 'şube sayısı da yerinde kalmalı');

  const sakin = V.nav(durum({}), { ...temel, olaySorun: null, sessiz: null }, kullanici);
  assert.ok(!sakin.includes('say uyari'), 'sessiz şube yokken rozet çizilmez');
});
