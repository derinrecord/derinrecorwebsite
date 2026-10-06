const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const O = require('../ogrenciler.js');

// ---------- Gün ve ay hesabı ----------
// Ayın gün sayısı UTC'den okunur: yerel saat dilimi ayın son gününü bir
// önceki güne kaydırmasın (plan-takvim.js ile aynı kural).

test('ayın gün sayısı, artık yıl dahil', () => {
  assert.equal(O.ayGunSayisi(2026, 10), 31);
  assert.equal(O.ayGunSayisi(2026, 2), 28);
  assert.equal(O.ayGunSayisi(2028, 2), 29);
  assert.equal(O.ayGunSayisi(2026, 4), 30);
});

test('gün kısa etiketi gün + ay adı', () => {
  assert.equal(O.gunKisa('2026-10-05'), '5 Ekim');
  assert.equal(O.gunKisa('2026-01-31'), '31 Ocak');
});

// ---------- Yoklama döngüsü ----------
// Tek düğme dört hâl arasında döner; dördüncü basış işareti kaldırır.

test('yoklama işareti dört hâl arasında döner', () => {
  assert.equal(O.katilimSonraki(''), 'geldi');
  assert.equal(O.katilimSonraki(null), 'geldi');
  assert.equal(O.katilimSonraki('geldi'), 'gelmedi');
  assert.equal(O.katilimSonraki('gelmedi'), 'mazeret');
  assert.equal(O.katilimSonraki('mazeret'), '', 'dördüncü basış işareti silmeli');
  assert.equal(O.katilimEtiket('gelmedi'), 'Gelmedi');
  assert.equal(O.katilimEtiket(null), 'İşaretsiz');
});

// ---------- Yoklama verisi ----------

const KAYIT = [
  { id: 'k1', ogrenci_id: 'o1', tur: 'katilim', gun: '2026-10-01', durum: 'geldi' },
  { id: 'k2', ogrenci_id: 'o1', tur: 'katilim', gun: '2026-10-06', durum: 'gelmedi' },
  { id: 'k3', ogrenci_id: 'o1', tur: 'katilim', gun: '2026-10-08', durum: 'mazeret' },
  { id: 'k4', ogrenci_id: 'o1', tur: 'katilim', gun: '2026-09-30', durum: 'geldi' },
  { id: 'k5', ogrenci_id: 'o2', tur: 'katilim', gun: '2026-10-01', durum: 'geldi' },
  { id: 'p1', ogrenci_id: 'o1', tur: 'odeme', gun: '2026-10-03', metin: 'Ekim aidatı', tutar: 2000, bitti: true },
  { id: 'p2', ogrenci_id: 'o1', tur: 'odeme', gun: '2026-10-20', metin: 'Kasım aidatı', tutar: 1500, bitti: false },
  { id: 'p3', ogrenci_id: 'o1', tur: 'odeme', gun: '2026-09-15', metin: 'Eylül aidatı', tutar: 2000, bitti: true }
];
const AY = { yil: 2026, ay: 10, bugun: '2026-10-05' };
const OGR = { id: 'o1', ad: 'Elif Yılmaz', veli: 'Ayşe', telefon: '0531', notlar: '' };

test('kayıtlar öğrenciye ve türe göre süzülür', () => {
  assert.equal(O.ogrenciKayitlari(KAYIT, 'o1', 'katilim').length, 4);
  assert.equal(O.ogrenciKayitlari(KAYIT, 'o1', 'odeme').length, 3);
  assert.equal(O.ogrenciKayitlari(KAYIT, 'o2', 'katilim').length, 1);
  assert.equal(O.ogrenciKayitlari(null, 'o1').length, 0);
});

test('günün işareti okunur, işaretsiz gün null', () => {
  assert.equal(O.katilimDurum(KAYIT, 'o1', '2026-10-06'), 'gelmedi');
  assert.equal(O.katilimDurum(KAYIT, 'o1', '2026-10-07'), null);
  // Başka öğrencinin aynı gündeki işareti karışmamalı.
  assert.equal(O.katilimDurum(KAYIT, 'o2', '2026-10-06'), null);
});

test('aylık yoklama özeti yalnız o ayı sayar', () => {
  const oz = O.katilimOzeti(KAYIT, 'o1', 2026, 10);
  assert.deepEqual(oz, { geldi: 1, gelmedi: 1, mazeret: 1, toplam: 3 });
  // 30 Eylül kaydı Ekim özetine girmemeli.
  assert.equal(O.katilimOzeti(KAYIT, 'o1', 2026, 9).geldi, 1);
  assert.equal(O.katilimOzeti(KAYIT, 'o1', 2026, 9).toplam, 1);
});

// ---------- Ödeme verisi ----------

test('ödemeler yeni tarih başta sıralanır', () => {
  assert.deepEqual(O.ogrenciOdemeleri(KAYIT, 'o1').map(x => x.id), ['p2', 'p1', 'p3']);
  assert.equal(O.ogrenciOdemeleri(KAYIT, 'o2').length, 0);
});

test('ödeme özeti tahsili ve bekleyeni ayırır', () => {
  const oz = O.odemeOzeti(KAYIT, 'o1', 2026, 10);
  assert.equal(oz.tahsil, 2000);
  assert.equal(oz.bekleyen, 1500);
  assert.equal(oz.adet, 2);
  // Eylül tahsilatı Ekim özetine karışmamalı.
  assert.equal(O.odemeOzeti(KAYIT, 'o1', 2026, 9).tahsil, 2000);
  assert.equal(O.odemeOzeti(KAYIT, 'o1', 2026, 9).adet, 1);
});

// ---------- İkinci takvim: ay ızgarası ----------
// Yoklama artık öğrenci satırındaki aylık şeritten değil, takvimin gün
// hücresinden işaretleniyor. Izgara marka takvimiyle aynı kuralı izler:
// 42 kutu, pazartesi başlangıcı, ay dışı komşu günlerle dolu.

test('ay ızgarası 42 kutu, pazartesi başlangıcı', () => {
  const h = O.aylikOgrenciIzgara(2026, 10);
  assert.equal(h.length, 42);
  // 1 Ekim 2026 perşembe: ızgara 28 Eylül pazartesiyle başlar.
  assert.equal(h[0].iso, '2026-09-28');
  assert.equal(h[0].ayIcinde, false);
  assert.equal(h[3].iso, '2026-10-01');
  assert.equal(h[3].ayIcinde, true);
  assert.equal(h[41].iso, '2026-11-08');
  assert.equal(h[41].ayIcinde, false);
});

test('gün katılımı listedeki öğrenciler üzerinden sayılır', () => {
  const iki = [OGR, { id: 'o2', ad: 'Mert' }];
  assert.deepEqual(O.gunKatilim(iki, KAYIT, '2026-10-06'), { geldi: 0, gelmedi: 1, mazeret: 0 });
  assert.deepEqual(O.gunKatilim(iki, KAYIT, '2026-10-01'), { geldi: 2, gelmedi: 0, mazeret: 0 });
  assert.deepEqual(O.gunKatilim(iki, KAYIT, '2026-10-07'), { geldi: 0, gelmedi: 0, mazeret: 0 });
  assert.deepEqual(O.gunKatilim(iki, KAYIT, '2026-10-08'), { geldi: 0, gelmedi: 0, mazeret: 1 });
  // Listede olmayan öğrencinin kaydı sayıya girmemeli: yoksa 1 öğrencili
  // listede "2/1 geldi" gibi imkânsız bir rozet çıkardı.
  assert.deepEqual(O.gunKatilim([OGR], KAYIT, '2026-10-01'), { geldi: 1, gelmedi: 0, mazeret: 0 });
  assert.deepEqual(O.gunKatilim([], KAYIT, '2026-10-01'), { geldi: 0, gelmedi: 0, mazeret: 0 });
});

test('gün hücresi gelen sayısını ve gelmeyeni taşır', () => {
  const iki = [OGR, { id: 'o2', ad: 'Mert' }];
  const h = O.ogrHucre({ iso: '2026-10-06', gunNo: 6, ayIcinde: true }, iki, KAYIT, {}, AY);
  assert.ok(h.includes('eksik'), 'gelmeyen varsa hücre eksik işaretlenmeli');
  assert.ok(h.includes('<i class="rozet">0/2</i>'), 'rozet gelen/toplam yazmalı');
  assert.ok(h.includes('<i class="y">1×</i>'), 'gelmeyen sayısı hücrede görünmeli');
  assert.ok(h.includes('data-act="ogrenci-gun" data-id="2026-10-06"'));
  assert.ok(h.includes('1 gelmedi'), 'ekran okuyucuya gelmeyen söylenmeli');
});

test('herkes gelince hücre tam işaretlenir', () => {
  const tek = [{ id: 'o1', ad: 'Elif Yılmaz' }];
  const h = O.ogrHucre({ iso: '2026-10-01', gunNo: 1, ayIcinde: true }, tek, KAYIT, {}, AY);
  assert.ok(h.includes('tam'));
  assert.ok(!h.includes('eksik'));
  assert.ok(h.includes('<i class="rozet">1/1</i>'));
});

test('işaretsiz gün boş rozet taşır, bugün çerçevelenir', () => {
  const h = O.ogrHucre({ iso: '2026-10-05', gunNo: 5, ayIcinde: true }, [OGR], KAYIT, {}, AY);
  assert.ok(h.includes('isaretsiz'));
  assert.ok(!h.includes('rozet'));
  assert.ok(h.includes('bugun'));
  assert.ok(h.includes('yoklama yapılmadı'), 'ekran okuyucuya gün durumu söylenmeli');
});

test('seçili gün hücresi açık işaretlenir', () => {
  const h = O.ogrHucre({ iso: '2026-10-06', gunNo: 6, ayIcinde: true }, [OGR], KAYIT,
    { ogrenciGun: '2026-10-06' }, AY);
  assert.ok(h.includes('acik'));
  assert.ok(h.includes('aria-pressed="true"'));
});

test('ay dışı hücre soluklaşır', () => {
  const h = O.ogrHucre({ iso: '2026-09-28', gunNo: 28, ayIcinde: false }, [OGR], KAYIT, {}, AY);
  assert.ok(h.includes('disari'));
});

// ---------- İkinci takvim: gün yoklaması ----------
// Bir günün yoklaması BÜTÜN öğrencileri tek listede gösterir: sınıfı toplu
// işaretlemek için gün gün gezinmek gerekmesin.

test('gün yoklaması bütün öğrencileri tek listede basar', () => {
  const h = O.gunYoklama('2026-10-06', [OGR, { id: 'o2', ad: 'Mert' }], KAYIT, {}, AY);
  assert.equal((h.match(/data-act="ogrenci-katilim"/g) || []).length, 2);
  assert.ok(h.includes('data-id="o1:2026-10-06:gelmedi"'), 'mevcut durum düğmede taşınmalı');
  assert.ok(h.includes('data-id="o2:2026-10-06:"'), 'işaretsiz öğrenci boş durum taşımalı');
  assert.ok(h.includes('class="ogr-durum gelmedi"'), 'durum düğmesi renklenmeli');
  assert.ok(h.includes('class="ogr-durum yok"'), 'işaretsiz durum ayrı sınıf taşımalı');
  assert.ok(h.includes('Gelmedi') && h.includes('İşaretsiz'), 'düğme durumun adını yazmalı');
});

test('gün yoklaması gün başlığını ve özeti yazar', () => {
  const h = O.gunYoklama('2026-10-06', [OGR, { id: 'o2', ad: 'Mert' }], KAYIT, {}, AY);
  assert.ok(h.includes('6 Ekim 2026 · Sal'), 'gün başlığı tarih ve hafta günü taşımalı');
  assert.ok(h.includes('1/2 işaretli'));
  assert.ok(h.includes('1 gelmedi'));
  assert.ok(h.includes('data-act="ogrenci-gun-kapat"'), 'panel kapatılabilmeli');
});

test('gün yoklaması arama süzgecini uygular', () => {
  const h = O.gunYoklama('2026-10-06', [OGR, { id: 'o2', ad: 'Mert' }], KAYIT,
    { ogrenciAra: 'mert' }, AY);
  assert.equal((h.match(/data-act="ogrenci-katilim"/g) || []).length, 1);
  assert.ok(h.includes('Mert'));
  assert.ok(!h.includes('Elif'), 'süzgeç dışı öğrenci listede olmamalı');
});

test('öğrenci yoksa gün yoklaması yol gösterir', () => {
  const h = O.gunYoklama('2026-10-06', [], [], {}, AY);
  assert.ok(h.includes('Henüz öğrenci yok.'));
  assert.ok(h.includes('data-act="ogrenci-gun-kapat"'), 'boş gün de kapanabilmeli');
});

// ---------- Eksik yoklama uyarısı ----------
// Stüdyonun hangi günler çalıştığı ayrı bir ayar değil; kalıp işaretlerin
// kendisinden çıkarılıyor. Uyarı yalnız geçmişte kalan işaretsiz ders
// günlerini söyler.

const KALIP = [
  { id: 'x1', ogrenci_id: 'o1', tur: 'katilim', gun: '2026-10-01', durum: 'geldi' },
  { id: 'x2', ogrenci_id: 'o1', tur: 'katilim', gun: '2026-10-06', durum: 'gelmedi' },
  { id: 'x3', ogrenci_id: 'o1', tur: 'katilim', gun: '2026-10-08', durum: 'geldi' }
];

test('eksik yoklama yalnız işaretsiz ders günlerini bulur', () => {
  // Kalıp salı + perşembe. 1, 6, 8 işaretli; 13 ve 15 işaretsiz.
  assert.deepEqual(O.eksikYoklamalar([OGR], KALIP, { yil: 2026, ay: 10, bugun: '2026-10-20' }),
    ['2026-10-13', '2026-10-15']);
});

test('bugün eksik sayılmaz, ertesi gün girer', () => {
  const ay = bugun => ({ yil: 2026, ay: 10, bugun: bugun });
  // Kalıpta 1, 6 ve 8 Ekim işaretli; 13 Ekim (salı) işaretsiz. Bugün 13'ü
  // gösterirken gün hâlâ sürüyor olabilir: uyarıya girmez.
  assert.deepEqual(O.eksikYoklamalar([OGR], KALIP, ay('2026-10-13')), []);
  // Ertesi gün aynı gün eksik sayılır.
  assert.deepEqual(O.eksikYoklamalar([OGR], KALIP, ay('2026-10-14')), ['2026-10-13']);
  // Ayın ilk gününde geçmiş gün yoktur.
  assert.deepEqual(O.eksikYoklamalar([OGR], KALIP, ay('2026-10-01')), []);
});

test('kalıp dışı günler ve listede olmayan öğrenci uyarıya girmez', () => {
  // Pazartesi hiç işaretlenmemiş; kalıp çıkmadığı için pazartesiler eksik
  // sayılmamalı (tatil günü olabilir).
  assert.deepEqual(O.eksikYoklamalar([OGR], KALIP, { yil: 2026, ay: 10, bugun: '2026-10-20' })
    .filter(iso => O.haftaGunu(iso) === 0), [], 'pazartesi uyarıya girmemeli');
  // Başka listeye ait öğrencinin işareti kalıp kurmamalı.
  const baska = [{ id: 'y1', ogrenci_id: 'o9', tur: 'katilim', gun: '2026-10-01', durum: 'geldi' }];
  assert.deepEqual(O.eksikYoklamalar([OGR], baska, { yil: 2026, ay: 10, bugun: '2026-10-20' }), []);
});

test('ayda hiç işaret yoksa uyarı basılmaz', () => {
  const ay = { yil: 2026, ay: 10, bugun: '2026-10-20' };
  assert.deepEqual(O.eksikYoklamalar([OGR], [], ay), []);
  assert.equal(O.eksikSeridi([OGR], [], ay), '');
  assert.equal(O.eksikSeridi([], KALIP, ay), '', 'öğrenci yoksa uyarı da yok');
});

test('uyarı şeridi eksik günleri düğme olarak basar', () => {
  const h = O.eksikSeridi([OGR], KALIP, { yil: 2026, ay: 10, bugun: '2026-10-20' });
  assert.ok(h.includes('class="ogr-uyari"'));
  assert.ok(h.includes('2 ders günü işaretsiz'));
  assert.ok(h.includes('data-act="ogrenci-gun"') && h.includes('data-id="2026-10-13"'),
    'çip o günü açmalı');
  assert.ok(h.includes('13 Ekim'), 'gün okunur biçimde yazılmalı');
  assert.ok(h.includes('Sal'), 'hafta günü de görünmeli');
  assert.ok(h.includes('Güne bas, yoklamayı gir.'));
});

test('uyarı şeridi altı günü gösterip kalanı sayar', () => {
  const t = [
    { id: 'a', ogrenci_id: 'o1', tur: 'katilim', gun: '2026-10-01', durum: 'geldi' },
    { id: 'b', ogrenci_id: 'o1', tur: 'katilim', gun: '2026-10-05', durum: 'geldi' },
    { id: 'c', ogrenci_id: 'o1', tur: 'katilim', gun: '2026-10-06', durum: 'geldi' }
  ];
  // Kalıp pazartesi + salı + perşembe: 30 gün içinde 10 gün işaretsiz.
  const h = O.eksikSeridi([OGR], t, { yil: 2026, ay: 10, bugun: '2026-10-31' });
  assert.equal((h.match(/class="ogr-uyari-gun"/g) || []).length, 6, 'en çok altı gün gösterilmeli');
  assert.ok(h.includes('+4 gün'), 'kalan gün sayı olarak yazılmalı');
  assert.ok(h.includes('10 ders günü işaretsiz'));
});

test('uyarı şeridi sayfada başlığın altında durur', () => {
  // Kurgu günü 5 Ekim 2026. Cuma kalıbı (9 Ekim işaretli) 2 Ekim'i eksik
  // bırakır; sayfa açılınca uyarı görünmeli.
  const D = {
    brands: [], folders: [], tracks: [], players: [], broadcast: [], announcements: [],
    playlists: [], playlistTracks: [], coffeeAttempts: [], subscriptions: [], plans: [],
    requests: [], olaylar: [], kurulum: {},
    ogrenciler: [OGR],
    ogrenciKayitlari: [{ id: 'y1', ogrenci_id: 'o1', tur: 'katilim', gun: '2026-10-09', durum: 'geldi' }]
  };
  const h = V.gorunum({ nav: 'plan', sub: 'ogrenciler', ogrenciYil: 2026, ogrenciAy: 10,
    openFolder: null, openBrand: null, openPlaylist: null, q: '' }, D, UI).html;
  assert.ok(h.includes('class="ogr-uyari"'), 'sayfada uyarı görünmeli');
  assert.ok(h.includes('data-id="2026-10-02"'), 'çip eksik günü taşımalı');
  assert.ok(h.includes('class="ogr-takvim-bas"') && h.indexOf('ogr-uyari') > h.indexOf('ogr-takvim-bas'),
    'uyarı başlığın altında basılmalı');
  assert.ok(h.indexOf('ogr-uyari') < h.indexOf('ogr-izgara'), 'ızgara uyarının altında kalmalı');
});

test('detayda yoklama özeti var ama işaret yok', () => {
  const h = O.ogrenciDetay(OGR, KAYIT, {}, AY);
  assert.ok(h.includes('YOKLAMA'));
  assert.ok(h.includes('Ekim 2026'));
  assert.ok(h.includes('1 geldi'));
  assert.ok(h.includes('1 gelmedi'));
  assert.ok(h.includes('1 mazeret'));
  assert.ok(h.includes('öğrenci takviminden işaretlenir'), 'kullanıcı doğru yere yollanmalı');
  assert.ok(!h.includes('data-act="ogrenci-katilim"'), 'yoklama buradan işaretlenmez');
});

// ---------- Ödeme satırı ----------

test('ödeme satırı tutarı, tarihi ve düğmeleri taşır', () => {
  const h = O.odemeSatiri(KAYIT[5], null);
  assert.ok(h.includes('Ekim aidatı'));
  assert.ok(h.includes('3 Ekim'));
  assert.ok(h.includes('2.000 ₺'));
  assert.ok(h.includes('class="plan-satir ogr-odeme bitti"'), 'ödendi işareti satırda görünmeli');
  assert.ok(h.includes('data-act="ogrenci-odeme-isaret" data-id="p1"'));
  assert.ok(h.includes('data-act="ogrenci-odeme-duzenle" data-id="p1"'));
  assert.ok(h.includes('data-act="ogrenci-odeme-sil" data-id="p1"'));
});

test('ödenmemiş satır işaretsiz ve vurgusuz', () => {
  const h = O.odemeSatiri(KAYIT[6], null);
  assert.ok(h.includes('class="plan-satir ogr-odeme"'));
  assert.ok(!h.includes('bitti'));
  assert.ok(h.includes('1.500 ₺'));
});

test('ödeme satırı yerinde düzenleme formuna dönüşür', () => {
  const h = O.odemeSatiri(KAYIT[5], 'p1');
  assert.ok(h.includes('duzenliyor'), 'düzenlenen satır işaretlenmeli');
  assert.ok(h.includes('data-ogrenci-odeme-duzenle="metin"'));
  assert.ok(h.includes('data-ogrenci-odeme-duzenle="tutar"'));
  assert.ok(h.includes('data-act="ogrenci-odeme-duzenle-kaydet" data-id="p1"'));
  assert.ok(h.includes('data-act="ogrenci-odeme-duzenle-kapat"'));
  assert.ok(!h.includes('data-act="ogrenci-odeme-sil"'), 'form açıkken satır düğmeleri basılmamalı');
});

// ---------- Öğrenci detayı ----------

test('detay iki bölüm basar: yoklama özeti ve ödemeler', () => {
  const h = O.ogrenciDetay(OGR, KAYIT, {}, AY);
  assert.ok(h.includes('ogr-detay'));
  assert.ok(h.includes('YOKLAMA'));
  assert.ok(h.includes('ÖDEMELER'));
  assert.ok(h.includes('data-act="ogrenci-odeme-yeni" data-id="o1"'), 'ödeme ekleme düğmesi olmalı');
  assert.ok(h.includes('2.000 ₺ tahsil'));
  assert.ok(h.includes('1.500 ₺ bekliyor'));
  assert.ok(!h.includes('data-act="ogrenci-katilim"'), 'yoklama buradan işaretlenmez');
});

test('ödeme ekleme formu açıkken alanlar basılır', () => {
  const h = O.ogrenciDetay(OGR, KAYIT, { ogrenciOdemeYeni: 'o1' }, AY);
  assert.ok(h.includes('data-ogrenci-odeme-gir="metin"'));
  assert.ok(h.includes('data-ogrenci-odeme-gir="tutar"'));
  assert.ok(h.includes('data-act="ogrenci-odeme-kaydet" data-id="o1"'));
  assert.ok(h.includes('data-act="ogrenci-odeme-kapat"'));
  assert.ok(!h.includes('data-act="ogrenci-odeme-yeni"'), 'düğme yerine form görünmeli');
});

test('ödeme kaydı olmayan öğrencide davet metni çıkar', () => {
  const h = O.ogrenciDetay({ id: 'o2', ad: 'Mert' }, KAYIT, {}, AY);
  assert.ok(h.includes('henüz ödeme kaydı yok'));
});

test('ödeme açıklaması kaçışlı basılır', () => {
  const k = [{ id: 'p9', ogrenci_id: 'o1', tur: 'odeme', gun: '2026-10-02', metin: '<b>x</b>', tutar: 10, bitti: false }];
  const h = O.odemeSatiri(k[0], null);
  assert.ok(!h.includes('<b>x</b>'), 'ham HTML basılmamalı');
  assert.ok(h.includes('&lt;b&gt;x&lt;/b&gt;'));
});

// ---------- Satır: katlanmış / açık ----------

test('katlanmış satırda ay özeti çipleri görünür', () => {
  const h = O.ogrenciSatiri(OGR, {}, KAYIT, AY);
  assert.ok(h.includes('aria-expanded="false"'));
  assert.ok(h.includes('ogr-cip'));
  assert.ok(h.includes('1 geldi'));
  assert.ok(h.includes('1 gelmedi'));
  assert.ok(h.includes('2.000 ₺ ödendi'));
  assert.ok(h.includes('1.500 ₺ bekliyor'));
  assert.ok(!h.includes('ogr-detay'), 'detay kapalıyken basılmamalı');
});

test('açık satırda detay basılır, çipler yerini detayla paylaşmaz', () => {
  const h = O.ogrenciSatiri(OGR, { ogrenciAcik: 'o1' }, KAYIT, AY);
  assert.ok(h.includes('aria-expanded="true"'));
  assert.ok(h.includes('class="plan-satir ogrenci acik"'));
  assert.ok(h.includes('ogr-detay'));
  assert.ok(!h.includes('ogr-cip'), 'detay açıkken özet çipi tekrarlanmamalı');
});

test('kaydedilemeyen satırda yoklama ve ödeme açılmaz', () => {
  // Yerel satırın gerçek id'si yok; yoklama/ödeme yanlış satıra yazardı.
  const h = O.ogrenciSatiri({ id: 'yerel-1', ad: 'Elif', hata: 'ağ hatası' }, {}, KAYIT, AY);
  assert.ok(!h.includes('data-act="ogrenci-detay"'), 'detay oku olmamalı');
  assert.ok(!h.includes('data-act="ogrenci-duzenle"'), 'düzenleme olmamalı');
  assert.ok(h.includes('data-act="ogrenci-tekrar"'), 'tekrar dene olmalı');
});

test('özet yalnız o öğrencinin kayıtlarını sayar', () => {
  // o2'nin Ekim'de tek işareti var (1 Ekim, geldi). o1'in gelmedi/mazeret
  // işaretleri ve ödemeleri o2'nin satırına sızmamalı.
  const h = O.ogrenciSatiri({ id: 'o2', ad: 'Mert' }, {}, KAYIT, AY);
  assert.ok(h.includes('1 geldi'));
  assert.ok(!h.includes('gelmedi'), 'başka öğrencinin işareti görünmemeli');
  assert.ok(!h.includes('mazeret'));
  assert.ok(!h.includes('ödendi'), 'başka öğrencinin ödemesi görünmemeli');
});

test('işareti ve ödemesi olmayan öğrencide çip çıkmaz', () => {
  const h = O.ogrenciSatiri({ id: 'o9', ad: 'Yeni' }, {}, KAYIT, AY);
  assert.ok(!h.includes('ogr-cip'));
});

// ---------- Panele bağlanma: Plan → Öğrenciler ----------

const P = require('../plan-takvim.js');
const V = require('../radyo-panel-views.js');
const UI = { now: () => Date.parse('2026-10-05T09:00:00Z') };
global.window = Object.assign(global.window || {}, { DerinOgrenci: O, DerinPlan: P });

const ogrenciSayfasi = (ek, D) => V.gorunum(Object.assign({
  nav: 'plan', sub: 'ogrenciler', openFolder: null, openBrand: null, openPlaylist: null, q: ''
}, ek || {}), Object.assign({
  brands: [], folders: [], tracks: [], players: [], broadcast: [], announcements: [],
  playlists: [], playlistTracks: [], coffeeAttempts: [], subscriptions: [], plans: [],
  requests: [], olaylar: [], kurulum: {}
}, D || {}), UI).html;

test('öğrenci sayfası kayıtları takvime ve listeye taşır', () => {
  const D = { planItems: [], ogrenciler: [OGR], ogrenciKayitlari: KAYIT };
  const ay = ogrenciSayfasi({ ogrenciYil: 2026, ogrenciAy: 10 }, D);
  assert.ok(ay.includes('Elif Yılmaz'));
  assert.ok(ay.includes('2.000 ₺ ödendi'), 'ödeme özeti listede görünmeli');
  assert.ok(ay.includes('data-act="ogrenci-detay"'), 'satır açılabilmeli');
  // Gün kutusu yoklama durumunu taşır: 6 Ekim'de gelmeyen var.
  assert.ok(ay.includes('data-act="ogrenci-gun" data-id="2026-10-06"'));
  assert.ok(ay.includes('eksik'), 'gelmeyen gün kutuda işaretlenmeli');
  // Gün paneli ancak güne basılınca açılır ve öğrenci başına işaret taşır.
  assert.ok(!ay.includes('data-act="ogrenci-katilim"'), 'gün seçilmeden yoklama basılmamalı');
  const gun = ogrenciSayfasi({ ogrenciYil: 2026, ogrenciAy: 10, ogrenciGun: '2026-10-06' }, D);
  assert.ok(gun.includes('data-id="o1:2026-10-06:gelmedi"'), 'gün yoklaması sayfadan erişilebilmeli');
});

test('gün paneli seçilen ayın gününü açar', () => {
  const D = { planItems: [], ogrenciler: [OGR], ogrenciKayitlari: KAYIT };
  const h = ogrenciSayfasi({ ogrenciYil: 2026, ogrenciAy: 9, ogrenciGun: '2026-09-30' }, D);
  assert.ok(h.includes('Eylül 2026'), 'seçilen ay gösterilmeli');
  assert.ok(h.includes('30 Eylül 2026 · Çar'), 'gün paneli seçilen günü yazmalı');
  // 30 Eylül kaydı (k4) o günün yoklamasında görünmeli: kayıt hangi aydaysa
  // o günün panelinde çıkar.
  assert.ok(h.includes('data-id="o1:2026-09-30:geldi"'), 'o günün işareti gün panelinde olmalı');
  assert.ok(h.includes('1/1 işaretli'));
});

test('kayıt tablosu yokken sayfa yine çalışır', () => {
  const h = ogrenciSayfasi({ ogrenciYil: 2026, ogrenciAy: 10, ogrenciGun: '2026-10-06' },
    { planItems: [], ogrenciler: [OGR] });
  assert.ok(h.includes('Elif Yılmaz'));
  assert.ok(h.includes('data-act="ogrenci-katilim"'), 'gün yoklaması işaretsiz de basılmalı');
  assert.ok(h.includes('Henüz işaret yok'));
  assert.ok(h.includes('data-act="ogrenci-gun" data-id="2026-10-05"'), 'ızgara bozulmamalı');
});

// ---------- Panele bağlanma ----------

const panelKaynak = fs.readFileSync(require.resolve('../radyo-yonetim.js'), 'utf8');

test('öğrenci sayfasının ürettiği her eylem panelde karşılanır', () => {
  // Ekranda basılan her düğmenin panelde bir karşılığı olmalı: eksik bir
  // case düğmeyi sessizce ölü bırakır (basılır, hiçbir şey olmaz).
  const h = ogrenciSayfasi({ ogrenciYil: 2026, ogrenciAy: 10, ogrenciGun: '2026-10-06',
    ogrenciAcik: 'o1' }, {
    planItems: [],
    ogrenciler: [{ id: 'o1', ad: 'Elif', veli: '', telefon: '', notlar: '' }],
    ogrenciKayitlari: KAYIT
  });
  const eylemler = [...new Set((h.match(/data-act="([a-z-]+)"/g) || [])
    .map(m => m.slice(10, -1)))];
  assert.ok(eylemler.length >= 8, 'ikinci takvim birkaç eylem üretmeli: ' + eylemler.length);
  eylemler.filter(a => a.indexOf('ogrenci') === 0).forEach(a => {
    // Düğmeler case ile, metin alanları input dinleyicisi ile karşılanır
    // (arama kutusu tıklanmaz, yazılır). İkisinden biri olmalı.
    const karlandi = panelKaynak.includes(`case '${a}':`)
      || panelKaynak.includes(`[data-act="${a}"]`);
    assert.ok(karlandi, a + ' eylemi panelde karşılanmıyor');
  });
});

test('ogrenciler.js panelden önce yükleniyor', () => {
  // Panel `window.DerinOgrenci`'yi IIFE başında okuyor. Sıra bozulursa
  // yoklama düğmesi sessizce hiçbir şey yapmaz ve klasör "modül yüklenemedi"
  // der. Script etiketleri dosya sırasıyla okunur — yorum satırlarındaki
  // dosya adları sayılmaz.
  [['../radyo-yonetim.html', true], ['../radyo-panel-prova.html', false]].forEach(([yol, panelVar]) => {
    const kaynak = fs.readFileSync(require.resolve(yol), 'utf8');
    const sira = [...kaynak.matchAll(/<script src="([^"]+)"/g)]
      .map(m => m[1].split('?')[0]);
    const o = sira.indexOf('ogrenciler.js');
    const p = sira.indexOf('plan-takvim.js');
    const y = sira.indexOf('radyo-yonetim.js');
    assert.ok(o !== -1, yol + ': ogrenciler.js yüklenmeli');
    assert.ok(p !== -1, yol + ': plan-takvim.js yüklenmeli');
    assert.ok(o < p, yol + ': ogrenciler.js plan-takvim.js\'ten önce olmalı');
    if (panelVar) assert.ok(p < y, yol + ': plan-takvim.js panelden önce olmalı');
  });
});

test('panel kayıtları veri paketine koyuyor', () => {
  assert.ok(panelKaynak.includes("from('ogrenci_kayitlari')"), 'kayıtlar sorgulanmalı');
  assert.ok(panelKaynak.includes('ogrenciKayitlari: ogrenciKayitlari.data || []'),
    'veri D.ogrenciKayitlari olarak taşınmalı');
  assert.ok(panelKaynak.includes('!ogrenciKayitlari.error'),
    'kurulum bayrağı iki tabloyu birlikte bildirmeli');
});

test('panel yoklama ve ödeme eylemlerini karşılıyor', () => {
  ['ogrenci-detay', 'ogrenci-katilim', 'ogrenci-odeme-yeni', 'ogrenci-odeme-kapat',
    'ogrenci-odeme-kaydet', 'ogrenci-odeme-isaret', 'ogrenci-odeme-duzenle',
    'ogrenci-odeme-duzenle-kapat', 'ogrenci-odeme-duzenle-kaydet', 'ogrenci-odeme-sil']
    .forEach(act => assert.ok(panelKaynak.includes(act), act + ' işlenmeli'));
});

test('yoklama iyimser: kayıt düşerse liste eski hâline döner', () => {
  // Tek hücreyi işaretleyen kullanıcı için doğru davranış sessiz kalmamak:
  // ekran gerçeğe döner ve hata söylenir.
  const m = panelKaynak.match(/async function ogrenciKatilimYaz\([\s\S]*?\n  \}/);
  assert.ok(m, 'ogrenciKatilimYaz gövdesi bulunmalı');
  assert.ok(/const onceki = /.test(m[0]), 'önceki liste saklanmalı');
  assert.ok(/D\.ogrenciKayitlari = liste/.test(m[0]), 'iyimser güncelleme yapılmalı');
  assert.ok(/D\.ogrenciKayitlari = onceki/.test(m[0]), 'başarısızlıkta eski liste geri gelmeli');
  assert.ok(/bildir\(/.test(m[0]), 'hata kullanıcıya söylenmeli');
});

test('ödeme ekleme tür ve gün yazar', () => {
  const m = panelKaynak.match(/async function ogrenciOdemeGir\([\s\S]*?\n  \}/);
  assert.ok(m, 'ogrenciOdemeGir gövdesi bulunmalı');
  assert.ok(/tur: 'odeme'/.test(m[0]), 'tür ödeme olmalı');
  assert.ok(/gun: bugunIso\(\)/.test(m[0]), 'gün bugünden gelmeli');
  assert.ok(/tutar: tutar/.test(m[0]), 'tutar yazılmalı');
});

test('ödeme formu kayıt düşerse açık kalır', () => {
  // Başarısızlıkta form kapanırsa yazılan tutar sessizce kaybolurdu.
  const m = panelKaynak.match(/async function ogrenciOdemeDuzenleKaydet\([\s\S]*?\n  \}/);
  assert.ok(m, 'ogrenciOdemeDuzenleKaydet bulunmalı');
  const kod = m[0].replace(/^\s*\/\/.*$/gm, '');
  assert.ok(/if \(hata\) \{ bildir\([\s\S]*?return; \}/.test(kod), 'hata dalı önce dönmeli');
  assert.ok(kod.indexOf('state.ogrenciOdemeDuzenle = null') > kod.indexOf('if (hata)'),
    'form yalnız başarıdan sonra kapanmalı');
});

test('öğrenci silinince açık detay da kapanır', () => {
  assert.ok(/case 'ogrenci-sil': \{[\s\S]*?state\.ogrenciAcik === id[\s\S]*?return ogrenciYaz\('sil'/.test(panelKaynak));
});

// ---------- Yetki ve bütünlük ----------

test('kayıt tablosu yalnız yöneticiye açık', () => {
  const sql = fs.readFileSync(require.resolve('../supabase/ogrenciler.sql'), 'utf8');
  assert.match(sql, /create table if not exists public\.ogrenci_kayitlari/);
  assert.match(sql, /alter table public\.ogrenci_kayitlari enable row level security/);
  assert.match(sql, /create policy "ogrenci kaydi: yalnizca yonetici" on public\.ogrenci_kayitlari\s*\n?\s*for all to authenticated\s*\n?\s*using \(public\.is_admin\(\)\) with check \(public\.is_admin\(\)\)/,
    'kural yalnızca is_admin() ile çalışmalı');
  assert.ok(!/to anon/.test(sql), 'tablo anon\'a açılmamalı');
});

test('günde tek yoklama veritabanında da tek', () => {
  const sql = fs.readFileSync(require.resolve('../supabase/ogrenciler.sql'), 'utf8');
  assert.match(sql, /create unique index if not exists ogrenci_katilim_gun_idx[\s\S]*?where tur = 'katilim'/);
});

test('öğrenci silinince kayıtları da gider', () => {
  const sql = fs.readFileSync(require.resolve('../supabase/ogrenciler.sql'), 'utf8');
  assert.match(sql, /references public\.ogrenciler\(id\) on delete cascade/,
    'sahipsiz yoklama kaydı kalmamalı');
});

test('tür ile alanların tutarlılığı veritabanında bağlanır', () => {
  const sql = fs.readFileSync(require.resolve('../supabase/ogrenciler.sql'), 'utf8');
  assert.match(sql, /constraint ogrenci_kayitlari_tur_ck check/);
  assert.match(sql, /tur = 'katilim' and durum in \('geldi', 'gelmedi', 'mazeret'\)/);
  assert.match(sql, /tur = 'odeme' and durum is null/);
});

test('SQL dosyası tekrar çalıştırılabilir kalır', () => {
  // Aşama 1 kurulmuş olsa da dosya bir kez daha çalıştırılabilsin diye her
  // adım korunuyor; bu, mevcut veriyi silmeden genişletmeyi mümkün kılar.
  const sql = fs.readFileSync(require.resolve('../supabase/ogrenciler.sql'), 'utf8');
  assert.ok(!/drop table/i.test(sql), 'tablo düşürülmemeli');
  assert.ok(!/delete from/i.test(sql), 'veri silinmemeli');
  const createTable = (sql.match(/create table(?! if not exists)/g) || []).length;
  assert.equal(createTable, 0, 'her create table "if not exists" olmalı');
});
