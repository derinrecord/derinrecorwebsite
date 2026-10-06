// Haftalık gün sayısı + aylık tutar ve "<Ay> aidatlarını oluştur" testleri.
//
// Fiyat haftada kaç gün gelindiğine göre değişiyor: tutar öğrencide elle
// tutulur, tarife diye bir şey yok. Toplu aidat, tutarı yazılmış aktif
// öğrenciler için ayın kayıtlarını açar; o ay kaydı olanı atlar.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const O = require('../ogrenciler.js');

const AY = { yil: 2026, ay: 10, bugun: '2026-10-05' };

const OGR = [
  { id: 'o1', ad: 'Elif Yılmaz', gun_sayisi: 3, aylik_tutar: 2500, aktif: true },
  { id: 'o2', ad: 'Mert Demir', gun_sayisi: 2, aylik_tutar: 1800, aktif: true },
  { id: 'o3', ad: 'Zeynep Ak', gun_sayisi: 2, aylik_tutar: null, aktif: true },
  { id: 'o4', ad: 'Eski Öğrenci', gun_sayisi: 3, aylik_tutar: 2500, aktif: false }
];

// ---------- Koşul bilgisi satırda ----------

test('gün sayısı ve aylık tutar satırda nötr rozet olarak görünür', () => {
  const h = O.ogrenciSatiri(OGR[0], {}, [], AY);
  assert.ok(h.includes('<i class="p">Haftada 3 gün</i>'), 'haftalık gün yazılmalı');
  assert.ok(h.includes('<i class="p">Aylık 2.500 ₺</i>'), 'aylık tutar yazılmalı');
  assert.ok(h.includes('ogr-cip'), 'rozetler özet çipinde durmalı');
});

test('yalnız yazılmış koşul bilgisi rozet olur', () => {
  // o3'ün gün sayısı var, tutarı henüz yazılmamış: ikisi bağımsız alan.
  const h = O.ogrenciSatiri(OGR[2], {}, [], AY);
  assert.ok(h.includes('Haftada 2 gün'));
  assert.ok(!h.includes('Aylık'), 'tutar yazılmamışsa basılmamalı');
  const bos = O.ogrenciSatiri({ id: 'o9', ad: 'Boş' }, {}, [], AY);
  assert.ok(!bos.includes('Haftada') && !bos.includes('Aylık'));
  assert.ok(!bos.includes('ogr-cip'), 'hiç bilgi yokken çip çıkmamalı');
});

test('koşul bilgisi kaydı olmayan öğrencide de görünür', () => {
  // Satır çipleri eskiden yalnız hareket olunca çıkıyordu; gün/tutar artık
  // kayıttan bağımsız, o yüzden tek başına da görünmeli.
  const h = O.ogrenciSatiri({ id: 'o9', ad: 'Yeni', gun_sayisi: 2, aylik_tutar: 1000 }, {}, [], AY);
  assert.ok(h.includes('Haftada 2 gün'));
  assert.ok(h.includes('Aylık 1.000 ₺'));
});

// ---------- Tarife: gün sayısı tutarı doldurur ----------
// Kursa haftanın 3 günü gelen 4.100 ₺, 2 günü gelen 3.200 ₺ ödüyor. Tutar
// yine elle değiştirilebilir; tarife yalnız formu doldurur.

test('tarife gün sayısına göre tutarı verir', () => {
  assert.deepEqual(O.TARIFE, { 2: 3200, 3: 4100 });
  assert.equal(O.tarifeTutar(2), 3200);
  assert.equal(O.tarifeTutar('3'), 4100, 'form değeri metin gelir');
  // Tarifede olmayan gün sayısı serbest kalmalı: tutar otomatik dolmaz.
  assert.equal(O.tarifeTutar(1), null);
  assert.equal(O.tarifeTutar(4), null);
  assert.equal(O.tarifeTutar(''), null);
  assert.equal(O.tarifeTutar(null), null);
});

test('tarifeden gelen tutar ayırt edilir, el yazısı korunur', () => {
  assert.equal(O.tarifeMi('3200'), true);
  assert.equal(O.tarifeMi(4100), true);
  assert.equal(O.tarifeMi(' 3200 '), true);
  // Elle yazılmış bir tutar tarife değeri taşımıyorsa üstüne yazılmaz.
  assert.equal(O.tarifeMi('3500'), false);
  assert.equal(O.tarifeMi('3.200'), false, 'biçimli yazım el yazısı sayılır');
  assert.equal(O.tarifeMi(''), false);
  assert.equal(O.tarifeMi(null), false);
});

// ---------- Form alanları ----------

test('ekleme ve düzenleme formları gün sayısı ile tutarı taşır', () => {
  const duzenle = O.ogrenciSatiri(OGR[0], { ogrenciDuzenle: 'o1' }, [], AY);
  assert.ok(duzenle.includes('data-ogrenci-duzenle="gun_sayisi"'));
  assert.ok(duzenle.includes('data-ogrenci-duzenle="aylik_tutar"'));
  assert.ok(duzenle.includes('value="3"'), 'gün sayısı dolu gelmeli');
  assert.ok(duzenle.includes('value="2500"'), 'tutar dolu gelmeli');
  const yeni = O.ogrenciListesi([], [], { ogrenciYeni: true }, AY);
  assert.ok(yeni.includes('data-ogrenci-gir="gun_sayisi"'));
  assert.ok(yeni.includes('data-ogrenci-gir="aylik_tutar"'));
});

test('gün sayısı alanı datalist ile hazır seçenek sunar', () => {
  // <select> serbest girişi kapatırdı; sayı alanı + datalist hem 2/3/4
  // seçeneğini hem elle girişi bırakır.
  assert.deepEqual(O.GUN_SECENEKLERI, [2, 3, 4]);
  const form = O.ogrenciListesi([], [], { ogrenciYeni: true }, AY);
  const m = form.match(/list="([^"]+)"/);
  assert.ok(m, 'sayı alanı bir datalist\'e bağlanmalı');
  const takvim = O.ogrenciTakvimi(OGR, [], {}, AY);
  assert.ok(takvim.includes(`<datalist id="${m[1]}">`), 'datalist sayfada bir kez basılmalı');
  O.GUN_SECENEKLERI.forEach(n => {
    assert.ok(takvim.includes(`<option value="${n}">`), n + ' hazır seçenek olmalı');
  });
});

// ---------- Toplu aidat hesabı ----------

test('aidat yalnız tutarı olan aktif öğrenciler için üretilir', () => {
  const h = O.aylikAidatlar(OGR, [], AY);
  assert.deepEqual(h.kayitlar.map(k => k.ogrenci_id), ['o1', 'o2']);
  assert.equal(h.toplam, 4300);
  assert.equal(h.atlanan, 0);
  // o3'ün tutarı yok, o4 pasif: ikisi de kayıt üretmemeli.
  assert.ok(!h.kayitlar.some(k => k.ogrenci_id === 'o3' || k.ogrenci_id === 'o4'));
});

test('aidat kaydı ayın ilk gününe ve ödenmemiş olarak yazılır', () => {
  const k = O.aylikAidatlar(OGR, [], AY).kayitlar[0];
  assert.deepEqual(k, {
    ogrenci_id: 'o1', tur: 'odeme', gun: '2026-10-01',
    metin: 'Ekim aidatı', tutar: 2500, bitti: false
  });
});

test('aktif alanı tanımsız öğrenci aktif sayılır', () => {
  // Eski satırlarda aktif alanı hiç yazılmamış olabilir; onlar pasif sayılırsa
  // aidat sessizce eksik açılırdı.
  const h = O.aylikAidatlar([{ id: 'x', aylik_tutar: 100 }], [], AY);
  assert.equal(h.kayitlar.length, 1);
  assert.equal(h.toplam, 100);
});

test('bu ay kaydı olan öğrenci atlanır', () => {
  const kayit = [{ id: 'p1', ogrenci_id: 'o1', tur: 'odeme', gun: '2026-10-07', metin: 'Ekim aidatı', tutar: 2500, bitti: true }];
  const h = O.aylikAidatlar(OGR, kayit, AY);
  assert.deepEqual(h.kayitlar.map(k => k.ogrenci_id), ['o2']);
  assert.equal(h.atlanan, 1, 'atlanan ayrıca sayılmalı');
  assert.equal(h.toplam, 1800);
});

test('başka ayın kaydı aidatı engellemez', () => {
  const kayit = [{ id: 'p1', ogrenci_id: 'o1', tur: 'odeme', gun: '2026-09-05', metin: 'Eylül aidatı', tutar: 2500, bitti: true }];
  assert.deepEqual(O.aylikAidatlar(OGR, kayit, AY).kayitlar.map(k => k.ogrenci_id), ['o1', 'o2']);
  // Yoklama kaydı (katilim) ödeme sanılmamalı.
  const yoklama = [{ id: 'k1', ogrenci_id: 'o1', tur: 'katilim', gun: '2026-10-01', durum: 'geldi' }];
  assert.equal(O.aylikAidatlar(OGR, yoklama, AY).kayitlar.length, 2);
});

test('aynı ay için ikinci kez çalıştırma yeni kayıt açmaz', () => {
  const ilk = O.aylikAidatlar(OGR, [], AY);
  const ikinci = O.aylikAidatlar(OGR, ilk.kayitlar, AY);
  assert.equal(ikinci.kayitlar.length, 0, 'çift kayıt koruması');
  assert.equal(ikinci.atlanan, 2);
  assert.equal(ikinci.toplam, 0);
});

test('eksik bağlamda toplu aidat çökmez', () => {
  const bos = { kayitlar: [], atlanan: 0, toplam: 0 };
  assert.deepEqual(O.aylikAidatlar(OGR, [], null), bos);
  assert.deepEqual(O.aylikAidatlar(OGR, [], {}), bos);
  assert.deepEqual(O.aylikAidatlar([], [], AY), bos);
  assert.deepEqual(O.aylikAidatlar(null, null, AY), bos);
});

// ---------- Toplu aidat düğmesi ----------

test('aidat düğmesi kaç kayıt ve ne kadar tutacağını yazar', () => {
  const h = O.aidatDugmesi(OGR, [], AY);
  assert.ok(h.includes('data-act="ogrenci-aidat-olustur"'));
  assert.ok(h.includes('Ekim aidatlarını oluştur'), 'düğme görünen ayın adını taşımalı');
  assert.ok(h.includes('2 öğrenci'));
  assert.ok(h.includes('4.300 ₺'));
  assert.ok(!h.includes('zaten var'), 'atlanan yokken bu yazı çıkmamalı');
});

test('düğme görünen ayı adıyla söyler, "bu ay" demez', () => {
  // Ay geriye alınabiliyor (bkz. ogrenci-ay) ve kayıt GÖRÜNEN aya düşüyor.
  // "Bu ayın" yazsaydı Eylül'de basan yönetici Ekim'in aidatını açtığını
  // sanırdı; Eylül'e dönüp çalışmaya başlayan biri tam olarak bunu yaşar.
  const eylul = { yil: 2026, ay: 9 };
  const h = O.aidatDugmesi(OGR, [], eylul);
  assert.ok(h.includes('Eylül aidatlarını oluştur'), 'ay adı yazılmalı');
  assert.ok(!h.includes('Ekim'), 'görünmeyen ayın adı geçmemeli');
  assert.ok(!h.includes('Bu ayın'), '"bu ay" belirsizliği kalmamalı');
  assert.ok(!h.includes('bu ayın'), 'küçük harfli biçim de çıkmamalı');
});

test('atlanan varsa düğme yazısında söylenir', () => {
  const kayit = [{ id: 'p1', ogrenci_id: 'o1', tur: 'odeme', gun: '2026-10-03', metin: '', tutar: 2500, bitti: true }];
  const h = O.aidatDugmesi(OGR, kayit, AY);
  assert.ok(h.includes('1 öğrenci'), 'yalnız açılacak kayıt sayılmalı');
  assert.ok(h.includes('1.800 ₺'));
  assert.ok(h.includes('1 öğrencinin kaydı zaten var'));
});

test('işlevsiz düğme basılmaz', () => {
  // Tutarı yazılmış öğrenci yoksa düğme hiç çıkmaz.
  assert.equal(O.aidatDugmesi([OGR[2], OGR[3]], [], AY), '');
  assert.equal(O.aidatDugmesi([], [], AY), '');
});

test('hepsi oluşturulmuşsa düğme yerine bilgi yazılır', () => {
  const ilk = O.aylikAidatlar(OGR, [], AY);
  const h = O.aidatDugmesi(OGR, ilk.kayitlar, AY);
  assert.ok(h.includes('ogr-aidat-tamam'));
  assert.ok(h.includes('2 öğrencinin kaydı var'));
  assert.ok(h.includes('Ekim 2026'));
  assert.ok(!h.includes('data-act="ogrenci-aidat-olustur"'), 'yapacak iş kalmayınca düğme çıkmamalı');
});

test('aidat düğmesi listede basılır', () => {
  const h = O.ogrenciListesi(OGR, [], {}, AY);
  assert.ok(h.includes('data-act="ogrenci-aidat-olustur"'), 'liste gövdesinde düğme olmalı');
});

// ---------- Aylık gelir özeti ----------
// Tahsil edilen, bekleyen ve aidatı henüz açılmamış tutarlar tek şeritte.

test('gelir özeti ayın paralarını toplar', () => {
  const kayit = [
    { id: 'k1', ogrenci_id: 'o1', tur: 'katilim', gun: '2026-10-01', durum: 'geldi' },
    { id: 'p1', ogrenci_id: 'o1', tur: 'odeme', gun: '2026-10-03', tutar: 2500, bitti: true },
    { id: 'p2', ogrenci_id: 'o2', tur: 'odeme', gun: '2026-10-04', tutar: 1800, bitti: false },
    // Geçen ayın kaydı ve listede olmayan öğrencinin kaydı bu ayı etkilememeli.
    { id: 'p3', ogrenci_id: 'o2', tur: 'odeme', gun: '2026-09-04', tutar: 1800, bitti: false },
    { id: 'p4', ogrenci_id: 'o9', tur: 'odeme', gun: '2026-10-05', tutar: 999, bitti: true }
  ];
  const g = O.gelirOzeti(OGR, kayit, AY);
  // o1 2.500 + o2 1.800: o3'ün tutarı yok, o4 pasif.
  assert.equal(g.beklenen, 4300);
  assert.equal(g.tahsil, 2500);
  assert.equal(g.bekleyen, 1800);
  assert.equal(g.acilmamis, 0, 'ikisinin de bu ay kaydı var');
  assert.equal(g.adet, 2, 'yalnız bu ayın ve listedeki öğrencilerin kayıtları');
  // Yoklama kaydı para sayılmaz.
  assert.equal(O.gelirOzeti(OGR, [kayit[0]], AY).adet, 0);
});

test('hiç kayıt yokken aidatın tamamı açılmamış görünür', () => {
  const g = O.gelirOzeti(OGR, [], AY);
  assert.equal(g.beklenen, 4300);
  assert.equal(g.tahsil, 0);
  assert.equal(g.bekleyen, 0);
  assert.equal(g.acilmamis, 4300);
  assert.equal(g.adet, 0);
});

test('gelir şeridi kalemleri etiketleriyle yazar', () => {
  const h = O.gelirSeridi(OGR, [], AY);
  assert.ok(h.includes('class="ogr-gelir"'));
  assert.ok(h.includes('Ekim 2026 · öğrenci geliri'));
  assert.ok(h.includes('Beklenen aidat'));
  assert.ok(h.includes('Aidatı açılmamış'));
  assert.ok(h.includes('4.300 ₺'));
  assert.ok(!h.includes('Tahsil'), 'hiç tahsilat yokken kalem yazılmamalı');
});

test('sıfır kalem şeride yazılmaz, parasız ayda şerit basılmaz', () => {
  const kayit = [{ id: 'p1', ogrenci_id: 'o1', tur: 'odeme', gun: '2026-10-01', tutar: 500, bitti: true }];
  const h = O.gelirSeridi([{ id: 'o1', ad: 'A', aktif: true }], kayit, AY);
  assert.ok(h.includes('Tahsil'), 'tahsilat kalemi olmalı');
  assert.ok(!h.includes('Beklenen aidat'), 'tutarı yazılı öğrenci yokken beklenen yazılmamalı');
  assert.ok(!h.includes('Aidatı açılmamış'));
  assert.ok(h.includes('1 ödeme kaydı'));
  // Ne tutar ne kayıt: şerit hiç basılmaz.
  assert.equal(O.gelirSeridi([{ id: 'o1', ad: 'A', aktif: true }], [], AY), '');
  assert.equal(O.gelirSeridi([], [], AY), '');
  assert.equal(O.gelirSeridi(OGR, [], {}), '', 'ay bilinmezse basılmamalı');
});

test('pasif öğrencinin tutarı beklenen gelire girmez', () => {
  const g = O.gelirOzeti([OGR[0], OGR[3]], [], AY);
  assert.equal(g.beklenen, 2500, 'pasif öğrenci beklenene sayılmamalı');
});

// ---------- Panele bağlanma ----------

const P = require('../plan-takvim.js');
const V = require('../radyo-panel-views.js');
const UI = { now: () => Date.parse('2026-10-05T09:00:00Z') };
global.window = Object.assign(global.window || {}, { DerinOgrenci: O, DerinPlan: P });

const sayfa = (ek, kayit) => V.gorunum(Object.assign({
  nav: 'plan', sub: 'ogrenciler', openFolder: null, openBrand: null, openPlaylist: null, q: '',
  ogrenciYil: 2026, ogrenciAy: 10
}, ek || {}), {
  brands: [], folders: [], tracks: [], players: [], broadcast: [], announcements: [],
  playlists: [], playlistTracks: [], coffeeAttempts: [], subscriptions: [], plans: [],
  requests: [], olaylar: [], planItems: [], kurulum: {},
  ogrenciler: OGR, ogrenciKayitlari: kayit || []
}, UI).html;

test('ayarlar öğrenci sayfasında görünür, aidat düğmesi basılır', () => {
  const h = sayfa();
  assert.ok(h.includes('Haftada 3 gün'));
  assert.ok(h.includes('Aylık 2.500 ₺'));
  assert.ok(h.includes('data-act="ogrenci-aidat-olustur"'));
});

test('kaydı olan ayda düğme yerine bilgi çıkar', () => {
  const h = sayfa({}, [
    { id: 'p1', ogrenci_id: 'o1', tur: 'odeme', gun: '2026-10-02', metin: '', tutar: 2500, bitti: false },
    { id: 'p2', ogrenci_id: 'o2', tur: 'odeme', gun: '2026-10-02', metin: '', tutar: 1800, bitti: false }
  ]);
  assert.ok(h.includes('ogr-aidat-tamam'));
  assert.ok(!h.includes('data-act="ogrenci-aidat-olustur"'));
});

test('gelir şeridi başlığın altında, uyarının üstünde durur', () => {
  // Cuma kalıbı: 9 Ekim işaretli, 2 Ekim işaretsiz — uyarı da çıksın.
  const h = sayfa({}, [
    { id: 'p1', ogrenci_id: 'o1', tur: 'odeme', gun: '2026-10-03', tutar: 2500, bitti: false },
    { id: 'y1', ogrenci_id: 'o1', tur: 'katilim', gun: '2026-10-09', durum: 'geldi' }
  ]);
  assert.ok(h.includes('class="ogr-gelir"'), 'gelir şeridi sayfada olmalı');
  assert.ok(h.includes('class="ogr-uyari"'), 'uyarı da olmalı');
  assert.ok(h.indexOf('ogr-takvim-bas') < h.indexOf('ogr-gelir'));
  assert.ok(h.indexOf('ogr-gelir') < h.indexOf('ogr-uyari'), 'para uyarıdan önce okunmalı');
  assert.ok(h.indexOf('ogr-uyari') < h.indexOf('ogr-izgara'));
});

const panelKaynak = fs.readFileSync(require.resolve('../radyo-yonetim.js'), 'utf8');
const cssKaynak = fs.readFileSync(require.resolve('../radyo-panel.css'), 'utf8');
const jsKaynak = fs.readFileSync(require.resolve('../ogrenciler.js'), 'utf8');

test('panel aidat eylemini onay penceresiyle karşılar', () => {
  const m = panelKaynak.match(/case 'ogrenci-aidat-olustur': \{[\s\S]*?\n      \}/);
  assert.ok(m, 'aidat eylemi panelde karşılanmalı');
  assert.ok(m[0].includes('OG.aylikAidatlar('), 'kayıtlar saf hesaptan gelmeli');
  assert.ok(m[0].includes('pencere({'), 'yıkıcı toplu işlem onay penceresinden geçmeli');
  assert.ok(m[0].includes('onOnay: () => ogrenciAidatOlustur('), 'onay yolu toplu kaydı çağırmalı');
  const yokKontrol = m[0].indexOf('if (!h.kayitlar.length)');
  assert.ok(yokKontrol !== -1 && yokKontrol < m[0].indexOf('pencere({'),
    'kayıt yokken onay penceresi açılmamalı');
});

test('toplu aidat tek istekte ve iyimser yazılır', () => {
  const m = panelKaynak.match(/async function ogrenciAidatOlustur\([\s\S]*?\n  \}/);
  assert.ok(m, 'ogrenciAidatOlustur bulunmalı');
  assert.ok(/ogrenciKayitYazDene\('ekle', h\.kayitlar\)/.test(m[0]),
    'bütün kayıtlar tek istekte gönderilmeli');
  assert.ok(/if \(kayitHatasi\)[\s\S]*?return;/.test(m[0]), 'hata dalı önce dönmeli');
  assert.ok(m[0].indexOf('await yenile()') > m[0].indexOf('if (kayitHatasi)'),
    'yeniden çizim yalnız başarıdan sonra olmalı');
  // Tarayıcının confirm'i kullanılmaz; panelin tek tip penceresi var.
  assert.ok(!/window\.confirm\(/.test(panelKaynak), 'tarayıcı confirm\'i kullanılmamalı');
});

test('panel gün sayısı ve tutarı okur, yazar', () => {
  const m = panelKaynak.match(/async function ogrenciYazDene\([\s\S]*?\n  \}/);
  assert.ok(m, 'ogrenciYazDene bulunmalı');
  assert.ok(m[0].includes("'gun_sayisi'") && m[0].includes("'aylik_tutar'"),
    'güncelleme iki alanı da yazmalı');
  ['ogrenciGirKaydet', 'ogrenciDuzenleKaydet'].forEach(fn => {
    const g = panelKaynak.match(new RegExp('(async )?function ' + fn + '\\([\\s\\S]*?\\n  \\}'));
    assert.ok(g, fn + ' bulunmalı');
    assert.ok(g[0].includes("oku('gun_sayisi')"), fn + ' gün sayısını okumalı');
    assert.ok(g[0].includes("oku('aylik_tutar')"), fn + ' tutarı okumalı');
  });
  // Sayı olmayan girdi sunucuya taşınmaz; boş alan null olur.
  assert.ok(/const sayiOku = /.test(panelKaynak));
  assert.ok(/return isFinite\(n\) \? n : null;/.test(panelKaynak));
});

test('formda tarife ipucu yazar, otomatik dolum panele bağlıdır', () => {
  // Tutar alanının ipucu tarifeyi söylemeli: otomatik dolum görünmez bir
  // davranış olduğu için kullanıcı rakamların nereden geldiğini görebilsin.
  const form = O.ogrenciListesi([], [], { ogrenciYeni: true }, AY);
  assert.ok(form.includes('3.200 ₺') && form.includes('4.100 ₺'), 'tarife ipucunda yazmalı');
  // Panel gün sayısı alanını dinler ve aylık tutarı doldurur; elle yazılmış
  // tutara dokunmaz.
  const m = panelKaynak.match(/function tarifeDoldur\([\s\S]*?\n  \}/);
  assert.ok(m, 'tarifeDoldur bulunmalı');
  assert.ok(m[0].includes('OG.tarifeTutar('), 'tutar tarifeden okunmalı');
  assert.ok(/if \(mevcut && !OG\.tarifeMi\(mevcut\)\) return;/.test(m[0]),
    'el yazısı tutarın üstüne yazılmamalı');
  assert.ok(/\[data-ogrenci-gir="gun_sayisi"\],\[data-ogrenci-duzenle="gun_sayisi"\]/.test(panelKaynak),
    'gün alanı input dinleyicisine bağlanmalı');
  assert.ok(/if \(gunAlan\) \{[\s\S]*?tarifeDoldur\(gunAlan\)/.test(panelKaynak),
    'dinleyici doğrudan dolum çağırmalı');
  // Gün alanı iki formda da aynı seçiciyle karşılanır.
  assert.ok(/const kip = gunAlan\.dataset\.ogrenciGir != null \? 'ogrenci-gir' : 'ogrenci-duzenle';/.test(panelKaynak),
    'ekleme ve düzenleme formu ayırt edilmeli');
});

test('gelir şeridi sınıflarının stili var', () => {
  ['ogr-gelir', 'ogr-gelir-kalemler'].forEach(sinif => {
    assert.ok(jsKaynak.includes(sinif), sinif + ' JS\'te üretilmeli');
    assert.ok(new RegExp('\\.' + sinif + '[{. :,]').test(cssKaynak), sinif + ' için CSS kuralı olmalı');
  });
  assert.ok(/\.ogr-gelir \.kalem\{/.test(cssKaynak), 'kalem düzeni stili olmalı');
  assert.ok(/\.ogr-gelir \.kalem b\.g\{/.test(cssKaynak), 'tahsil ayrı renkte olmalı');
});

test('yeni alanlar için stil var', () => {
  ['ogr-aidat', 'ogr-aidat-dugme', 'ogr-aidat-tamam'].forEach(sinif => {
    assert.ok(jsKaynak.includes(sinif), sinif + ' JS\'te üretilmeli');
    assert.ok(new RegExp('\\.' + sinif + '[{. :,]').test(cssKaynak), sinif + ' için CSS kuralı olmalı');
  });
  assert.ok(/\.ogr-cip i\.p\{/.test(cssKaynak), 'koşul rozeti ayrı renkte olmalı');
});

test('kolonlar şemada tekrar çalıştırılabilir biçimde eklenir', () => {
  const sql = fs.readFileSync(require.resolve('../supabase/ogrenciler.sql'), 'utf8');
  assert.match(sql, /alter table public\.ogrenciler add column if not exists gun_sayisi int;/);
  assert.match(sql, /alter table public\.ogrenciler add column if not exists aylik_tutar numeric;/);
  assert.ok(!/drop column/i.test(sql), 'mevcut veri düşürülmemeli');
});

test('iki panel sayfası aynı güncel sürümü yükler', () => {
  const surum = (yol, dosya) => {
    const k = fs.readFileSync(require.resolve(yol), 'utf8');
    const m = k.match(new RegExp(dosya.replace('.', '\\.') + '\\?v=([0-9]+)'));
    return m && m[1];
  };
  assert.equal(surum('../radyo-yonetim.html', 'ogrenciler.js'),
    surum('../radyo-panel-prova.html', 'ogrenciler.js'), 'modül sürümleri eşleşmeli');
  assert.equal(surum('../radyo-yonetim.html', 'ogrenciler.js'), '12', 'sürüm artırılmalı');
  assert.equal(surum('../radyo-yonetim.html', 'radyo-panel.css'), '29', 'CSS sürümü artırılmalı');
});
