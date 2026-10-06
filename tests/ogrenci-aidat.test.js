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

// ---------- Ayın sonuna doğru başlayan ----------

test('ayın 21\'inden sonra başlayanın o ay aidatı açılmaz', () => {
  const ogr = [
    { id: 'a1', ad: 'Yeni Başlayan', aylik_tutar: 3200, aktif: true, baslama: '2026-10-28' },
    { id: 'a2', ad: 'Sınır Günü', aylik_tutar: 3200, aktif: true, baslama: '2026-10-21' },
    { id: 'a3', ad: 'Bir Gün Önce', aylik_tutar: 3200, aktif: true, baslama: '2026-10-20' },
    { id: 'a4', ad: 'Ay Başında', aylik_tutar: 3200, aktif: true, baslama: '2026-10-03' },
    { id: 'a5', ad: 'Geçen Ay Başladı', aylik_tutar: 3200, aktif: true, baslama: '2026-09-27' },
    { id: 'a6', ad: 'Tarihsiz', aylik_tutar: 3200, aktif: true }
  ];
  const h = O.aylikAidatlar(ogr, [], AY);
  assert.deepEqual(h.kayitlar.map(k => k.ogrenci_id), ['a3', 'a4', 'a5', 'a6'],
    'ayın 21\'i ve sonrası düşer; geçen ay başlayan etkilenmez');
  assert.equal(h.gecBaslayan, 2, 'geç başlayanlar ayrı sayılmalı');
  assert.equal(h.atlanan, 0, 'geç başlama "kaydı var" sayılmamalı');
  assert.equal(h.toplam, 3200 * 4, 'toplam geç başlayanı içermemeli');
});

test('geç başlama sınırı her ay aynı gündür, kısa ayda kaymaz', () => {
  assert.equal(O.AIDAT_GEC_BASLAMA_GUN, 21, 'sınır stüdyo kararı: 21');
  // Şubat: 21 her ay var, kısa ay bir gün kaydırmamalı.
  const sub = [
    { id: 'a1', aylik_tutar: 100, aktif: true, baslama: '2027-02-20' },
    { id: 'a2', aylik_tutar: 100, aktif: true, baslama: '2027-02-21' }
  ];
  const h = O.aylikAidatlar(sub, [], { yil: 2027, ay: 2 });
  assert.deepEqual(h.kayitlar.map(k => k.ogrenci_id), ['a1']);
  assert.equal(h.gecBaslayan, 1);
});

test('gecBasladi yalnız aidat ayının 21\'i ve sonrasını sayar', () => {
  assert.equal(O.gecBasladi('2026-10-28', '2026-10'), true);
  assert.equal(O.gecBasladi('2026-10-21', '2026-10'), true);
  assert.equal(O.gecBasladi('2026-10-20', '2026-10'), false);
  assert.equal(O.gecBasladi('2026-09-25', '2026-10'), false, 'başka ayın tarihi karışmamalı');
  assert.equal(O.gecBasladi('2027-01-05', '2026-10'), false, 'ileri tarih geç başlama değil');
  assert.equal(O.gecBasladi(null, '2026-10'), false);
  assert.equal(O.gecBasladi('', '2026-10'), false);
  assert.equal(O.gecBasladi('28.10.2026', '2026-10'), false, 'bozuk biçim geç başlama saymaz');
});

test('geç başlayan atlanınca ekran sebebini söyler', () => {
  const gec = [{ id: 'a1', aylik_tutar: 3200, aktif: true, baslama: '2026-10-28' }];
  // Hepsi geç başladı: kayıt yok, düğme yerine sebep basılır (yoksa ekran boş
  // kalır ve "öğrenci kaybolmuş" gibi görünür).
  const h = O.aidatDugmesi(gec, [], AY);
  assert.ok(h.includes('ogr-aidat-tamam'), 'kayıt yoksa düğme değil açıklama basılır');
  assert.ok(!h.includes('ogr-aidat-dugme'), 'oluşturulacak kayıt yokken düğme çıkmaz');
  assert.ok(h.includes('sonra başladı'), 'sebep yazılmalı: ' + h);

  // Karışık liste: düğme var, geç başlayan sayısı yanında yazar.
  const karisik = gec.concat([{ id: 'a2', aylik_tutar: 1800, aktif: true, baslama: '2026-10-02' }]);
  const k = O.aidatDugmesi(karisik, [], AY);
  assert.ok(k.includes('ogr-aidat-dugme'));
  assert.ok(k.includes('1 öğrenci ayın 21\'inden sonra başladı'), 'not düğme yanında: ' + k);
  assert.ok(k.includes('1.800 ₺'), 'geç başlayan toplamı şişirmemeli');
});

test('eksik bağlamda toplu aidat çökmez', () => {
  const bos = { kayitlar: [], atlanan: 0, gecBaslayan: 0, toplam: 0 };
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

// ---------- Elden alınan tahsilat ----------

// Elden işareti tek kurala bağlıdır: nakit para ele geçtiği anda tahsilat hem
// "alındı" hem "elden" olur. İşareti kaldırmak yalnız elden bilgisini siler;
// alınmış parayı borca çevirmez.
test('elden işareti ödenmişliği de yazar, kaldırırken tahsilatı bozmaz', () => {
  assert.deepEqual(O.eldenCevir({ elden: false, bitti: false }), { elden: true, bitti: true });
  assert.deepEqual(O.eldenCevir({}), { elden: true, bitti: true });
  assert.deepEqual(O.eldenCevir({ elden: true, bitti: true }), { elden: false });
  assert.ok(!('bitti' in O.eldenCevir({ elden: true, bitti: true })),
    'işaret kaldırılırken bitti geri alınmamalı');
});

test('ödeme satırında elden düğmesi işaretsizken de basılır', () => {
  const kapali = O.odemeSatiri({
    id: 'k1', tur: 'odeme', gun: '2026-10-03', metin: 'Ekim aidatı', tutar: 2500, bitti: false
  });
  assert.ok(kapali.includes('data-act="ogrenci-odeme-elden"'), 'düğme her satırda olmalı');
  assert.ok(kapali.includes('aria-pressed="false"'), 'durum ekran okuyucuya yazılmalı');
  assert.ok(!kapali.includes('ogr-elden secili'), 'işaretsiz satır dolu görünmemeli');

  const acik = O.odemeSatiri({
    id: 'k1', tur: 'odeme', gun: '2026-10-03', metin: 'Ekim aidatı', tutar: 2500, bitti: true, elden: true
  });
  assert.ok(acik.includes('ogr-elden secili'), 'işaretli satırda düğme dolu olmalı');
  assert.ok(acik.includes('aria-pressed="true"'));
  assert.ok(/class="plan-satir ogr-odeme[^"]*elden/.test(acik), 'satır elden diye işaretlenmeli');
});

test('elden toplamı ayın ödemeler başlığında ayrı yazılır', () => {
  const kayitlar = [
    { id: 'k1', ogrenci_id: 'o1', tur: 'odeme', gun: '2026-10-03', tutar: 2500, bitti: true, elden: true },
    { id: 'k2', ogrenci_id: 'o1', tur: 'odeme', gun: '2026-10-10', tutar: 500, bitti: true, elden: false },
    { id: 'k3', ogrenci_id: 'o1', tur: 'odeme', gun: '2026-10-20', tutar: 900, bitti: false, elden: false }
  ];
  const oz = O.odemeOzeti(kayitlar, 'o1', 2026, 10);
  assert.equal(oz.tahsil, 3000, 'havale de tahsildir');
  assert.equal(oz.elden, 2500, 'yalnız elden alınan kısım sayılmalı');
  assert.equal(oz.bekleyen, 900, 'elden bekleyeni etkilememeli');
  const d = O.ogrenciDetay(OGR[0], kayitlar, { ogrenciAcik: 'o1' }, AY);
  assert.ok(d.includes('2.500 ₺ elden'), 'başlıkta elden toplamı görünmeli');
});

test('satır çipi ayın tamamı elden ödendiyse elden der', () => {
  const hepsi = O.ogrenciSatiri(OGR[0], {}, [
    { id: 'k1', ogrenci_id: 'o1', tur: 'odeme', gun: '2026-10-03', tutar: 2500, bitti: true, elden: true }
  ], AY);
  assert.ok(hepsi.includes('2.500 ₺ ödendi · elden'), 'tamamı elden ödenmişse yazılmalı');
  // Kısmen elden bir ay çipte "elden" demez: yönetici çipe bakıp hepsini
  // nakit sanmamalı.
  const karisik = O.ogrenciSatiri(OGR[0], {}, [
    { id: 'k1', ogrenci_id: 'o1', tur: 'odeme', gun: '2026-10-03', tutar: 2000, bitti: true, elden: true },
    { id: 'k2', ogrenci_id: 'o1', tur: 'odeme', gun: '2026-10-04', tutar: 500, bitti: true, elden: false }
  ], AY);
  assert.ok(!karisik.includes('elden'), 'kısmen elden ödeme çipe yazılmamalı');
});

test('geçen ay elden ödenmişse çip yine elden der', () => {
  const h = O.ogrenciSatiri(OGR[0], {}, [
    { id: 'k1', ogrenci_id: 'o1', tur: 'odeme', gun: '2026-09-15', tutar: 2500, bitti: true, elden: true }
  ], AY);
  assert.ok(h.includes('Eylül ödendi · 2.500 ₺ · elden'));
});

test('panel elden eylemini karşılar, işaret kaldırılınca elden düşer', () => {
  const m = panelKaynak.match(/async function ogrenciOdemeElden\([\s\S]*?\n  \}/);
  assert.ok(m, 'ogrenciOdemeElden bulunmalı');
  assert.ok(m[0].includes('OG.eldenCevir('), 'kural modülden gelmeli');
  assert.ok(m[0].includes("ogrenciKayitYaz('guncelle'"), 'satır güncellenmeli');
  assert.ok(/case 'ogrenci-odeme-elden': return ogrenciOdemeElden\(id\);/.test(panelKaynak),
    'eylem panelde karşılanmalı');
  // Ödendi işareti kaldırılınca elden de düşer; yoksa "elden ama ödenmemiş"
  // diye tutarsız bir satır kalırdı.
  const isaret = panelKaynak.match(/case 'ogrenci-odeme-isaret': \{[\s\S]*?\n      \}/);
  assert.ok(isaret, 'ödendi işareti hâlâ karşılanmalı');
  assert.ok(isaret[0].includes('elden: kayit.bitti ? false : !!kayit.elden'),
    'işaret kaldırılınca elden temizlenmeli');
  // Güncelleme beyaz listesi elden'ı taşımalı; taşımasa yazma sessizce düşerdi.
  assert.ok(/'elden', 'odeme_gunu'\]\s*\.forEach/.test(panelKaynak),
    'elden güncelleme listesinde olmalı');
});

// ---------- Ödemenin yapıldığı gün ----------

// Kaydın günü aidatın ayını söyler (toplu kayıtlar ayın 1'ine düşer), ödeme
// günü ise paranın ele geçtiği gündür; geç ödemede ikisi ayrışır.
test('ödeme günü boşken bugünle dolar, yazılmış güne dokunulmaz', () => {
  assert.deepEqual(O.odemeGunu({ odeme_gunu: null }, '2026-10-14'), { odeme_gunu: '2026-10-14' });
  assert.deepEqual(O.odemeGunu({}, '2026-10-14'), { odeme_gunu: '2026-10-14' });
  assert.deepEqual(O.odemeGunu({ odeme_gunu: '2026-10-03' }, '2026-10-14'), {},
    'elle girilmiş günün üstüne yazılmamalı');
  // Bozuk "bugün" kayda geçmez: geçersiz tarih yazmaktansa alan boş kalsın.
  assert.deepEqual(O.odemeGunu({}, ''), {});
  assert.deepEqual(O.odemeGunu({}, '14.10.2026'), {});
  assert.deepEqual(O.odemeGunu(null, '2026-10-14'), {});
});

test('ödeme günü satırda yalnız kaydın gününden farklıysa yazılır', () => {
  assert.equal(O.odemeGunuNotu({ gun: '2026-10-01', odeme_gunu: '2026-10-14' }), ' · ödendi 14 Ekim');
  assert.equal(O.odemeGunuNotu({ gun: '2026-10-01', odeme_gunu: '2026-10-01' }), '',
    'aynı gün iki kez yazılmamalı');
  assert.equal(O.odemeGunuNotu({ gun: '2026-10-01' }), '');
  const h = O.odemeSatiri({
    id: 'k1', tur: 'odeme', gun: '2026-10-01', metin: 'Ekim aidatı', tutar: 2500,
    bitti: true, odeme_gunu: '2026-10-14'
  });
  assert.ok(h.includes('1 Ekim · ödendi 14 Ekim'), 'aidat ayı ve ödeme günü birlikte okunmalı');
});

test('düzenleme formunda ödeme günü alanı değeriyle açılır', () => {
  const h = O.odemeSatiri({
    id: 'k1', tur: 'odeme', gun: '2026-10-01', metin: 'Ekim aidatı', tutar: 2500,
    bitti: true, odeme_gunu: '2026-10-14'
  }, 'k1');
  assert.ok(/data-ogrenci-odeme-duzenle="odeme_gunu" type="date"/.test(h),
    'gün seçici tarayıcıdan gelmeli');
  assert.ok(h.includes('value="2026-10-14"'), 'mevcut gün alana yazılmalı');
  // Gün yokken alan boş kalır: kaydın gününü oraya kopyalamak yanlış bilgi olurdu.
  const bos = O.odemeSatiri({ id: 'k2', tur: 'odeme', gun: '2026-10-01', metin: 'Ek gelir', tutar: 100 }, 'k2');
  assert.ok(!bos.includes('value="2026-10-01"'), 'ödeme günü uydurulmamalı');
});

test('panel ödeme gününü yazar, işaret konarken boşsa bugünü doldurur', () => {
  assert.ok(/'odeme_gunu'\]\s*\.forEach/.test(panelKaynak), 'güncelleme listesi ödeme gününü taşımalı');
  assert.ok(/odeme_gunu: tarihOku\(tarihKutu \? tarihKutu\.value : ''\)/.test(panelKaynak),
    'düzenleme formu günü okuyup yazmalı');
  assert.ok(/if \(!kayit\.bitti && OG && OG\.odemeGunu\)/.test(panelKaynak),
    'ödendi işareti konarken gün doldurulmalı');
  assert.ok(/Object\.assign\(degisim, OG\.odemeGunu\(kayit, bugunIso\(\)\)\)/.test(panelKaynak),
    'elden işareti de günü doldurmalı');
  const sql = fs.readFileSync(require.resolve('../supabase/ogrenciler.sql'), 'utf8');
  assert.match(sql, /add column if not exists odeme_gunu date;/);
  assert.match(sql, /check \(odeme_gunu is null or tur = 'odeme'\)/, 'gün yalnız ödemede anlamlı olmalı');
});

// ---------- Gecikme ----------

const GEC = [
  { id: 'o1', ad: 'Elif Yılmaz' },
  { id: 'o2', ad: 'Mert Demir' }
];

test('gecikme vade sonundan sonra gelen ödemelerden hesaplanır', () => {
  const g = O.gecikmeOzeti(GEC, [
    { id: 'k1', ogrenci_id: 'o1', tur: 'odeme', gun: '2026-10-01', tutar: 2500, bitti: true, odeme_gunu: '2026-11-08' },
    { id: 'k2', ogrenci_id: 'o2', tur: 'odeme', gun: '2026-10-01', tutar: 1800, bitti: true, odeme_gunu: '2026-11-12' },
    // Ay içinde ödenen, günü girilmemiş ve ödenmemiş kayıtlar gecikme sayılmaz.
    { id: 'k3', ogrenci_id: 'o2', tur: 'odeme', gun: '2026-10-01', tutar: 500, bitti: true, odeme_gunu: '2026-10-31' },
    { id: 'k4', ogrenci_id: 'o1', tur: 'odeme', gun: '2026-10-01', tutar: 900, bitti: true },
    { id: 'k5', ogrenci_id: 'o1', tur: 'odeme', gun: '2026-10-05', tutar: 900, bitti: false, odeme_gunu: '2026-11-25' }
  ], AY);
  assert.equal(g.adet, 2, 'yalnız gerçekten geç gelenler');
  assert.equal(g.toplam, 20, 'vadeden sonra: 8 + 12 gün');
  assert.equal(g.ortalama, 10);
  assert.equal(g.en.ad, 'Mert Demir', 'en çok geciken yazılmalı');
  assert.equal(g.en.gun, 12);
});

test('aidat kendi ayı içinde ödenirse gecikme sayılmaz', () => {
  // Stüdyo aidatı ay içinde topluyor: ayın 1'i açılış günü, vade değil.
  const ay = [
    ['2026-10-01', '2026-10-02'],
    ['2026-10-01', '2026-10-28'],
    ['2026-10-31', '2026-10-31'],
    ['2026-09-01', '2026-09-30'],
    ['2026-02-01', '2026-02-28']
  ].map(([gun, odeme_gunu], i) => ({
    id: 'g' + i, ogrenci_id: 'o1', tur: 'odeme', gun: gun, bitti: true, odeme_gunu: odeme_gunu
  }));
  assert.equal(O.gecikmeGecmisi(ay, 'o1'), null, 'ay içi ödemeler geçmişe girmemeli');
  assert.equal(O.gecikmeOzeti(GEC, ay, AY).adet, 0, 'ay içi ödeme şeride yazılmamalı');
});

test('vade kaydın ayının son günüdür, kısa ve artık yılda kaymaz', () => {
  assert.equal(O.vadeSonu('2026-10-01'), '2026-10-31');
  assert.equal(O.vadeSonu('2026-11-15'), '2026-11-30');
  assert.equal(O.vadeSonu('2026-02-01'), '2026-02-28', 'Şubat 28 gün');
  assert.equal(O.vadeSonu('2024-02-01'), '2024-02-29', 'artık yıl Şubat 29');
  assert.equal(O.vadeSonu(null), null);
  assert.equal(O.vadeSonu('bozuk'), null);

  // Gecikme vadeden sayılır: "Ekim aidatı 6 Kasım'da ödendi" 6 gündür, 36 değil.
  assert.equal(O.gecikmeGunu('2026-10-01', '2026-11-06'), 6);
  assert.equal(O.gecikmeGunu('2026-10-01', '2026-10-31'), 0, 'ayın son günü hâlâ zamanında');
  assert.equal(O.gecikmeGunu('2026-10-01', '2026-11-01'), 1);
  assert.equal(O.gecikmeGunu('2026-02-01', '2026-03-01'), 1, 'Şubat vadesi 28');
  assert.equal(O.gecikmeGunu('2026-10-01', null), 0, 'ödenmemiş gecikme değil');
  assert.equal(O.gecikmeGunu(null, '2026-11-01'), 0);
});

test('gecikme yalnız kaydın ayına bakar, erken ödeme gecikme değildir', () => {
  const kayitlar = [
    { id: 'k1', ogrenci_id: 'o1', tur: 'odeme', gun: '2026-09-01', tutar: 2500, bitti: true, odeme_gunu: '2026-09-20' },
    { id: 'k2', ogrenci_id: 'o1', tur: 'odeme', gun: '2026-10-01', tutar: 2500, bitti: true, odeme_gunu: '2026-09-28' }
  ];
  assert.equal(O.gecikmeOzeti(GEC, kayitlar, AY).adet, 0, 'başka ayın ve erken ödemenin gecikmesi yok');
  // Aynı öğrenci için Eylül aidatı Ekim'de ödenirse gecikme Eylül'e yazılır.
  const eylul = [{ id: 'k3', ogrenci_id: 'o1', tur: 'odeme', gun: '2026-09-01', tutar: 2500, bitti: true, odeme_gunu: '2026-10-12' }];
  assert.equal(O.gecikmeOzeti(GEC, eylul, AY).adet, 0, 'Ekim görünümünde Eylül gecikmesi görünmez');
  assert.equal(O.gecikmeOzeti(GEC, eylul, { yil: 2026, ay: 9 }).en.gun, 12);
  // Ay bilgisi olmadan hesap yapılmaz (sayfa boş çizilirken patlamasın).
  assert.equal(O.gecikmeOzeti(GEC, kayitlar, {}).adet, 0);
  assert.equal(O.gecikmeOzeti(null, null, AY).adet, 0);
  assert.equal(O.gunFarki('2026-10-01', '2026-10-19'), 18);
  assert.equal(O.gunFarki('', '2026-10-19'), 0);
});

test('gecikme şeridi yalnız gecikme varsa basılır', () => {
  const gec = [
    { id: 'k1', ogrenci_id: 'o1', tur: 'odeme', gun: '2026-10-01', tutar: 2500, bitti: true, odeme_gunu: '2026-11-05' }
  ];
  assert.equal(O.gecikmeSeridi(GEC, [], AY), '', 'gecikme yoksa şerit basılmamalı');
  // Ay içinde ödenen kayıt şeridi hiç açmamalı.
  const ayIci = [{ id: 'k2', ogrenci_id: 'o1', tur: 'odeme', gun: '2026-10-01', tutar: 2500, bitti: true, odeme_gunu: '2026-10-19' }];
  assert.equal(O.gecikmeSeridi(GEC, ayIci, AY), '', 'ay içi ödeme şerit açmamalı');
  const h = O.gecikmeSeridi(GEC, gec, AY);
  assert.ok(h.includes('1 ödeme geç geldi'));
  assert.ok(h.includes('ortalama <b>5 gün</b>'), 'ortalama gün yazılmalı');
  assert.ok(h.includes('Elif Yılmaz'), 'en çok geciken öğrenci yazılmalı');
  assert.ok(h.includes('ogr-gecikme'), 'şerit sınıfı olmalı');
});

test('gecikme şeridi gelir şeridinin altında, uyarının üstünde durur', () => {
  // Cuma kalıbı: 9 Ekim işaretli, 2 Ekim işaretsiz — uyarı da çıksın.
  const h = sayfa({}, [
    { id: 'p1', ogrenci_id: 'o1', tur: 'odeme', gun: '2026-10-01', tutar: 2500, bitti: true, odeme_gunu: '2026-11-05' },
    { id: 'y1', ogrenci_id: 'o1', tur: 'katilim', gun: '2026-10-09', durum: 'geldi' }
  ]);
  assert.ok(h.indexOf('ogr-gelir') < h.indexOf('ogr-gecikme'), 'para özeti önce okunmalı');
  assert.ok(h.indexOf('ogr-gecikme') < h.indexOf('ogr-uyari'), 'gecikme uyarıdan önce gelmeli');
});

test('öğrencinin gecikme geçmişi yıl verilmezse tüm ayları sayar', () => {
  const kayitlar = [
    { id: 'k1', ogrenci_id: 'o1', tur: 'odeme', gun: '2026-10-01', bitti: true, odeme_gunu: '2026-11-08' },
    { id: 'k2', ogrenci_id: 'o1', tur: 'odeme', gun: '2026-09-15', bitti: true, odeme_gunu: '2026-10-12' },
    // Başka öğrenci, ödenmemiş kayıt ve ay içi ödeme geçmişe girmez.
    { id: 'k3', ogrenci_id: 'o2', tur: 'odeme', gun: '2026-10-01', bitti: true, odeme_gunu: '2026-11-20' },
    { id: 'k4', ogrenci_id: 'o1', tur: 'odeme', gun: '2026-10-01', bitti: false, odeme_gunu: '2026-11-28' },
    { id: 'k5', ogrenci_id: 'o1', tur: 'odeme', gun: '2026-10-02', bitti: true, odeme_gunu: '2026-10-02' }
  ];
  const g = O.gecikmeGecmisi(kayitlar, 'o1');
  assert.equal(g.adet, 2, 'yalnız bu öğrencinin geç ödediği kayıtlar');
  assert.equal(g.toplam, 20, 'Ekim vadesi 31, Eylül vadesi 30: 8 + 12');
  assert.equal(g.ortalama, 10);
  assert.equal(O.gecikmeGecmisi(kayitlar, 'o2').adet, 1);
  assert.equal(O.gecikmeGecmisi(kayitlar, 'o3'), null, 'gecikmesi olmayanda boş döner');
  assert.equal(O.gecikmeGecmisi(null, 'o1'), null);
});

test('gecikme notu kaydın yılına göre sınırlanır: geçen yıl bu yılı şişirmez', () => {
  const kayitlar = [
    { id: 'k1', ogrenci_id: 'o1', tur: 'odeme', gun: '2026-10-01', bitti: true, odeme_gunu: '2026-11-08' },
    // Geçen yılın gecikmesi: "bu yıl" notunda sayılmamalı.
    { id: 'k2', ogrenci_id: 'o1', tur: 'odeme', gun: '2025-12-01', bitti: true, odeme_gunu: '2026-01-12' },
    // Yıl, ödeme gününden değil kaydın kendi tarihinden okunur: Aralık
    // aidatı Ocak'ta ödense bile 2026'ya yazılır.
    { id: 'k3', ogrenci_id: 'o1', tur: 'odeme', gun: '2026-12-01', bitti: true, odeme_gunu: '2027-01-08' }
  ];
  assert.equal(O.gecikmeGecmisi(kayitlar, 'o1').adet, 3, 'yıl verilmezse tüm geçmiş');
  assert.equal(O.gecikmeGecmisi(kayitlar, 'o1', '2026').adet, 2, 'yıl verilince yalnız o yıl');
  assert.equal(O.gecikmeGecmisi(kayitlar, 'o1', 2026).adet, 2, 'sayı yıl da kabul edilir');
  assert.equal(O.gecikmeGecmisi(kayitlar, 'o1', '2024'), null, 'gecikmesi olmayan yıl boş döner');

  // 8 + 8 günün ortalaması 8; 2025'in 12 günü karışmamalı.
  assert.equal(O.gecikmeNotu(kayitlar, 'o1', '2026'),
    '<small class="ogr-gec-notu">bu yıl 2 kez geç ödedi · ortalama 8 gün</small>');
  assert.ok(O.gecikmeNotu(kayitlar, 'o1').includes('<small class="ogr-gec-notu">3 kez'),
    'yıl yoksa tüm geçmiş sayılır ve etiket "bu yıl" demez');

  // Yılı panelin "bugün"ü belirler; takvimde gezinmek notu değiştirmemeli.
  assert.equal(O.gecikmeYili(AY), '2026');
  assert.equal(O.gecikmeYili({ yil: 2025, bugun: '2026-10-05' }), '2026', 'gezilen yıl değil bugün');
  assert.equal(O.gecikmeYili({ bugun: '2027-03-01' }), '2027');
  assert.equal(O.gecikmeYili({}), null);
  assert.equal(O.gecikmeYili(null), null);
});

test('gecikme notu tek gecikmede sayıyı, çokluğunda ortalamayı yazar', () => {
  const tek = [{ id: 'k1', ogrenci_id: 'o1', tur: 'odeme', gun: '2026-10-01', bitti: true, odeme_gunu: '2026-11-06' }];
  assert.equal(O.gecikmeNotu(tek, 'o1'),
    '<small class="ogr-gec-notu">1 kez geç ödedi · 6 gün</small>');
  const cok = tek.concat([
    { id: 'k2', ogrenci_id: 'o1', tur: 'odeme', gun: '2026-09-15', bitti: true, odeme_gunu: '2026-10-12' }
  ]);
  assert.ok(O.gecikmeNotu(cok, 'o1').includes('2 kez geç ödedi · ortalama 9 gün'));
  assert.equal(O.gecikmeNotu([], 'o1'), '', 'gecikme yoksa not basılmamalı');

  // Not öğrenci satırında görünür, başka öğrencinin satırına taşmaz ve
  // panelin "bugün"ü varsa yıla sınırlanır ("bu yıl").
  const h = O.ogrenciSatiri({ id: 'o1', ad: 'Elif Yılmaz' }, {}, tek, AY);
  assert.ok(h.includes('bu yıl 1 kez geç ödedi · 6 gün'), 'satırda yıl sınırlı geçmiş yazılmalı');
  const bos = O.ogrenciSatiri({ id: 'o2', ad: 'Mert Demir' }, {}, tek, AY);
  assert.ok(!bos.includes('kez geç ödedi'), 'gecikmesi olmayan satırda not olmamalı');
  // "bugün" yoksa yıl sınırlanamaz; not yine basılır ama "bu yıl" demez.
  const toysuz = O.ogrenciSatiri({ id: 'o1', ad: 'Elif Yılmaz' }, {}, tek, {});
  assert.ok(toysuz.includes('1 kez geç ödedi · 6 gün') && !toysuz.includes('bu yıl'),
    'gün yoksa etiket yıl iddia etmemeli');
});

test('gecikme notunun stili var ve amber kalıyor', () => {
  assert.ok(jsKaynak.includes('ogr-gec-notu'), 'not JS\'te üretilmeli');
  // Satır kuralı (`.plan-satir.ogrenci .metin small`) rengi soluk yazıya
  // çevirdiği için notun seçicisi daha özgül olmalı; yoksa uyarı amberi
  // kaybolur (tam bu yüzden kaçtı, ölçümle yakalandı).
  assert.ok(/\.plan-satir\.ogrenci \.metin \.ogr-gec-notu\{[^}]*color:var\(--warn/.test(cssKaynak),
    'not amber renkte ve satır kuralından özgül olmalı');
});

test('gecikme şeridinin stili var', () => {
  assert.ok(jsKaynak.includes('ogr-gecikme'), 'şerit JS\'te üretilmeli');
  assert.ok(/\.ogr-gecikme\{/.test(cssKaynak), 'şerit kutusu stillenmeli');
  assert.ok(/\.ogr-gecikme-kalemler\{/.test(cssKaynak), 'kalem düzeni stillenmeli');
});

test('elden rozetinin stili var, şemada kolon olarak duruyor', () => {
  assert.ok(jsKaynak.includes('ogr-elden'), 'rozet JS\'te üretilmeli');
  assert.ok(/\.ogr-elden\{/.test(cssKaynak) && /\.ogr-elden\.secili\{/.test(cssKaynak),
    'rozetin iki hâli de stillenmeli');
  assert.ok(cssKaynak.includes('.plan-satir.ogr-odeme.elden'), 'elden satırı çerçevede belli olmalı');
  const sql = fs.readFileSync(require.resolve('../supabase/ogrenciler.sql'), 'utf8');
  assert.match(sql, /add column if not exists elden boolean not null default false;/);
  assert.match(sql, /check \(not elden or tur = 'odeme'\)/, 'elden yalnız ödemede anlamlı olmalı');
});

test('kolonlar şemada tekrar çalıştırılabilir biçimde eklenir', () => {
  const sql = fs.readFileSync(require.resolve('../supabase/ogrenciler.sql'), 'utf8');
  assert.match(sql, /alter table public\.ogrenciler add column if not exists gun_sayisi int;/);
  assert.match(sql, /alter table public\.ogrenciler add column if not exists aylik_tutar numeric;/);
  assert.ok(!/drop column/i.test(sql), 'mevcut veri düşürülmemeli');
  assert.match(sql, /alter table public\.ogrenciler add column if not exists baslama date;/);
});

test('başlama tarihi panele bağlı, okunur ve yazılır', () => {
  assert.ok(/'baslama'\]\s*\.forEach/.test(panelKaynak), 'güncelleme listesi başlamayı taşımalı');
  assert.ok(/const tarihOku = v => \{/.test(panelKaynak), 'tarih okuma yardımcısı olmalı');
  assert.ok(panelKaynak.includes('^\\d{4}-\\d{2}-\\d{2}$'), 'tarih biçimi doğrulanmalı');
  // Ekleme ve düzenleme formu tarihi okumalı; kaydedilemeyen satır yeniden
  // gönderilirken de taşınmalı (yoksa "tekrar dene" tarihi düşürürdü).
  assert.equal((panelKaynak.match(/baslama: tarihOku\(oku\('baslama'\)\)/g) || []).length, 2,
    'iki form da tarihi okumalı');
  assert.ok(/baslama: satir\.baslama/.test(panelKaynak), 'tekrar dene tarihi taşımalı');
  assert.ok(/baslama: null/.test(panelKaynak), 'yerel satır varsayılanı boş tarih olmalı');
});

test('iki panel sayfası aynı güncel sürümü yükler', () => {
  const surum = (yol, dosya) => {
    const k = fs.readFileSync(require.resolve(yol), 'utf8');
    const m = k.match(new RegExp(dosya.replace('.', '\\.') + '\\?v=([0-9]+)'));
    return m && m[1];
  };
  assert.equal(surum('../radyo-yonetim.html', 'ogrenciler.js'),
    surum('../radyo-panel-prova.html', 'ogrenciler.js'), 'modül sürümleri eşleşmeli');
  // Geç başlayan öğrenci kuralı JS'e girdi; damga da artmalı.
  assert.equal(surum('../radyo-yonetim.html', 'ogrenciler.js'), '20', 'sürüm artırılmalı');
  assert.equal(surum('../radyo-yonetim.html', 'radyo-panel.css'), '34', 'CSS sürümü artırılmalı');
  // Panel dosyası da damgalı: içeriği değişip damga artmadan kalırsa tarayıcı
  // eski kopyayı çalıştırır ve yeni alanı görmez (bir kez tam bu yüzden kaçtı).
  const panelSayfa = fs.readFileSync(require.resolve('../radyo-yonetim.html'), 'utf8');
  assert.match(panelSayfa, /radyo-yonetim\.js\?v=20261006a/, 'panel damgası artırılmalı');
});
