// Aşama 4 testleri: klasör ay özeti, borç/devamsızlık rozetleri ve uyarı
// süzgeçleri. Kaynak: ogrenciler.js (saf modül) + panel ve CSS bağlanması.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const O = require('../ogrenciler.js');

const AY = { yil: 2026, ay: 10, bugun: '2026-10-05' };

const OGRENCILER = [
  { id: 'o1', ad: 'Elif Yılmaz', veli: 'Ayşe', telefon: '0531', notlar: '' },
  { id: 'o2', ad: 'Mert Demir', veli: 'Ali', telefon: '0532', notlar: '' },
  { id: 'o3', ad: 'Zeynep Ak', veli: '', telefon: '', notlar: '' }
];

const KAYIT = [
  // o1: Ekim'de üç gün geldi, aidatı ödendi; Ağustos'tan devreden açık borcu var.
  { id: 'k1', ogrenci_id: 'o1', tur: 'katilim', gun: '2026-10-01', durum: 'geldi' },
  { id: 'k2', ogrenci_id: 'o1', tur: 'katilim', gun: '2026-10-02', durum: 'geldi' },
  { id: 'k3', ogrenci_id: 'o1', tur: 'katilim', gun: '2026-10-07', durum: 'geldi' },
  { id: 'p1', ogrenci_id: 'o1', tur: 'odeme', gun: '2026-10-03', metin: 'Ekim aidatı', tutar: 2000, bitti: true },
  { id: 'p2', ogrenci_id: 'o1', tur: 'odeme', gun: '2026-08-10', metin: 'Ağustos aidatı', tutar: 900, bitti: false },
  // o2: Ekim'de üç gün gelmedi (eşik), aidatı hâlâ ödenmedi.
  { id: 'k4', ogrenci_id: 'o2', tur: 'katilim', gun: '2026-10-01', durum: 'gelmedi' },
  { id: 'k5', ogrenci_id: 'o2', tur: 'katilim', gun: '2026-10-02', durum: 'gelmedi' },
  { id: 'k6', ogrenci_id: 'o2', tur: 'katilim', gun: '2026-10-05', durum: 'gelmedi' },
  { id: 'p3', ogrenci_id: 'o2', tur: 'odeme', gun: '2026-10-04', metin: 'Ekim aidatı', tutar: 1500, bitti: false },
  // o3: Ekim'de hiç kaydı yok; Eylül işareti Ekim özetine girmemeli.
  { id: 'k7', ogrenci_id: 'o3', tur: 'katilim', gun: '2026-09-30', durum: 'geldi' }
];

// ---------- Borç ----------
// Borç ay sınırı tanımaz: geçen aydan devreden aidat da açık borçtur.

test('borç özeti tüm ödenmemiş kayıtları toplar', () => {
  assert.deepEqual(O.borcOzeti(KAYIT, 'o1'), { tutar: 900, adet: 1 });
  assert.deepEqual(O.borcOzeti(KAYIT, 'o2'), { tutar: 1500, adet: 1 });
  assert.deepEqual(O.borcOzeti(KAYIT, 'o3'), { tutar: 0, adet: 0 });
  assert.deepEqual(O.borcOzeti(null, 'o1'), { tutar: 0, adet: 0 });
});

test('borç tutarı olmayan kaydı sıfır sayar', () => {
  const k = [{ id: 'x', ogrenci_id: 'o1', tur: 'odeme', gun: '2026-10-01', metin: '', tutar: null, bitti: false }];
  assert.equal(O.borcOzeti(k, 'o1').tutar, 0);
  assert.equal(O.borcOzeti(k, 'o1').adet, 1, 'kayıt sayısı tutardan bağımsız sayılır');
});

// ---------- Dikkat ----------

test('dikkat özeti borcu ve ayın devamsızlığını ayırır', () => {
  const d1 = O.dikkatOzeti(KAYIT, OGRENCILER[0], AY);
  assert.equal(d1.borc, 900);
  assert.equal(d1.borcAdet, 1);
  assert.equal(d1.gelmedi, 0);

  const d2 = O.dikkatOzeti(KAYIT, OGRENCILER[1], AY);
  assert.equal(d2.borc, 1500);
  assert.equal(d2.gelmedi, 3);
});

test('dikkat özeti bağlam verilmezse çökmez', () => {
  const d = O.dikkatOzeti(KAYIT, OGRENCILER[0], null);
  assert.equal(d.borc, 900, 'borç aydan bağımsız okunmalı');
  assert.equal(d.gelmedi, 0);
});

// ---------- Uyarı süzgeçleri ----------

test('odak sayaçları tüm listeyi sayar', () => {
  assert.deepEqual(O.odakSayilari(OGRENCILER, KAYIT, AY), { borc: 2, gelmedi: 1 });
});

test('süzgeç doğru öğrencileri bırakır', () => {
  assert.deepEqual(O.ogrenciOdakla(OGRENCILER, KAYIT, 'borc', AY).map(o => o.id), ['o1', 'o2']);
  assert.deepEqual(O.ogrenciOdakla(OGRENCILER, KAYIT, 'gelmedi', AY).map(o => o.id), ['o2']);
});

test('boş ve bilinmeyen süzgeç listeyi boşaltmaz', () => {
  // Eski bir sürümden kalan tanımsız bir değer listeyi boş göstermemeli.
  ['', null, undefined, 'sagma'].forEach(v => {
    assert.equal(O.ogrenciOdakla(OGRENCILER, KAYIT, v, AY).length, 3, String(v));
  });
});

test('süzgeç listeyi kopyalar, kaynağı bozmaz', () => {
  const kopya = O.ogrenciOdakla(OGRENCILER, KAYIT, '', AY);
  assert.notEqual(kopya, OGRENCILER);
  assert.equal(kopya.length, OGRENCILER.length);
});

test('iki süzgeç anahtarı dışa açılır', () => {
  assert.deepEqual(O.ODAK.map(o => o.anahtar), ['borc', 'gelmedi']);
  assert.equal(O.DEVAMSIZLIK_ESIK, 3);
});

// ---------- Klasör ay özeti ----------

test('klasör özeti takvimin ayını toplar', () => {
  const t = O.ogrenciToplam(OGRENCILER, KAYIT, 2026, 10);
  assert.deepEqual(t, {
    ogrenci: 3, geldi: 3, gelmedi: 3, mazeret: 0, tahsil: 2000, bekleyen: 1500
  });
  // Eylül: o3'ün 30 Eylül işareti oraya sayılır.
  assert.equal(O.ogrenciToplam(OGRENCILER, KAYIT, 2026, 9).geldi, 1);
  assert.equal(O.ogrenciToplam(OGRENCILER, KAYIT, 2026, 9).tahsil, 0);
});

test('özet satırı ay, öğrenci sayısı ve yoklama durumunu yazar', () => {
  const h = O.toplamSatiri(OGRENCILER, KAYIT, AY);
  assert.ok(h.includes('3 öğrenci'));
  assert.ok(h.includes('Ekim 2026'));
  assert.ok(h.includes('3 gelmedi'));
  // Para kalemleri gelir şeridinde yaşar; burada ikinci kez yazılmaz.
  assert.ok(!h.includes('₺'), 'tutar bu satırda tekrarlanmamalı');
});

test('özet satırı boş listede hiç basılmaz', () => {
  assert.equal(O.toplamSatiri([], KAYIT, AY), '');
  assert.equal(O.odakCubugu([], KAYIT, {}, AY), '');
});

test('sıfır olan kalem özet satırına yazılmaz', () => {
  const h = O.toplamSatiri([OGRENCILER[0]], KAYIT, AY);
  assert.ok(h.includes('1 öğrenci'));
  assert.ok(!h.includes('gelmedi'), 'hiç devamsızlık yokken yazılmamalı');
  assert.ok(!h.includes('bekleyen'), 'bekleyen ödeme yokken yazılmamalı');
  assert.ok(!h.includes('mazeret'), 'mazeret yokken yazılmamalı');
});

// ---------- Süzgeç düğmeleri ----------

test('süzgeç düğmeleri sayılarını taşır', () => {
  const h = O.odakCubugu(OGRENCILER, KAYIT, {}, AY);
  assert.ok(h.includes('data-act="ogrenci-odak"'));
  assert.ok(/Tümü <b>3<\/b>/.test(h), 'tümü sayısı tüm listeyi göstermeli');
  assert.ok(/Borçlular <b>2<\/b>/.test(h));
  assert.ok(/Gelmedi ≥ 3 <b>1<\/b>/.test(h));
});

test('varsayılanda yalnız Tümü seçili', () => {
  const h = O.odakCubugu(OGRENCILER, KAYIT, {}, AY);
  assert.equal((h.match(/secili/g) || []).length, 1, 'tek düğme seçili olmalı');
  assert.ok(/data-id=""[^>]*aria-pressed="true"/.test(h), 'Tümü seçili olmalı');
  assert.ok(/data-id="borc"[^>]*aria-pressed="false"/.test(h));
});

test('seçili süzgeç işaretlenir ve sayaç korunur', () => {
  const h = O.odakCubugu(OGRENCILER, KAYIT, { ogrenciOdak: 'borc' }, AY);
  assert.ok(/data-id="borc"[^>]*aria-pressed="true"/.test(h), 'borç süzgeci seçili olmalı');
  assert.ok(h.includes('ogr-odak secili'));
  assert.ok(/Borçlular <b>2<\/b>/.test(h), 'sayaç süzgeç seçiliyken de görünmeli');
});

test('sıfır sonuçlu süzgeç düğmesi soluk basılır', () => {
  // Yalnız borçlu olmayan bir liste: "Gelmedi ≥ 3" düğmesi sıfır sayar.
  const h = O.odakCubugu([OGRENCILER[0]], KAYIT, {}, AY);
  assert.ok(/Gelmedi ≥ 3 <b>0<\/b>/.test(h));
  assert.ok(/ogr-odak bos/.test(h));
});

// ---------- Satır rozetleri ----------

test('devreden borç satırda ayrı rozet olur', () => {
  const h = O.ogrenciSatiri(OGRENCILER[0], {}, KAYIT, AY);
  assert.ok(h.includes('<i class="b">900 ₺ devir</i>'), 'aydan devreden borç ayrı yazılmalı');
});

test('ayın bekleyeni devir rozetine iki kez yazılmaz', () => {
  // o2'nin tek açık kaydı bu ayın aidatı: "bekliyor" çipinde görünür, ayrıca
  // "devir" diye tekrarlanmamalı.
  const h = O.ogrenciSatiri(OGRENCILER[1], {}, KAYIT, AY);
  assert.ok(h.includes('1.500 ₺ bekliyor'));
  assert.ok(!h.includes('devir'), 'aynı tutar iki kez yazılmamalı');
});

test('eşiği aşan devamsızlık vurgulanır', () => {
  const h = O.ogrenciSatiri(OGRENCILER[1], {}, KAYIT, AY);
  assert.ok(h.includes('<i class="y d">3 gelmedi</i>'), 'eşik üstü ayrı renkte olmalı');
  const az = O.ogrenciSatiri({ id: 'o9', ad: 'Az' }, {}, [
    { id: 'z1', ogrenci_id: 'o9', tur: 'katilim', gun: '2026-10-01', durum: 'gelmedi' }
  ], AY);
  assert.ok(az.includes('<i class="y">1 gelmedi</i>'), 'eşik altı normal renkte kalmalı');
  assert.ok(!az.includes('class="y d"'));
});

// ---------- Geçen ayın ödemesi ----------
// Satır çipleri ay sınırı tanır: tutar yalnız ekrandaki ay için toplanır.
// Geçen ay ödeyen öğrenci bu yüzden "hiç ödememiş" gibi okunuyordu; son
// ödenmiş ayın adı satırda ayrı bir çiple yazılır.

const ODEMELI = [
  { id: 'e1', ogrenci_id: 'o5', tur: 'odeme', gun: '2026-09-01', metin: 'Eylül aidatı', tutar: 4100, bitti: true },
  { id: 'e2', ogrenci_id: 'o5', tur: 'odeme', gun: '2026-09-20', metin: 'ek ders', tutar: 500, bitti: true },
  // Aynı öğrencinin ekim aidatı henüz açık: satırda hem ödediği hem borcu
  // görünmeli, ikisi birbirini gizlememeli.
  { id: 'e3', ogrenci_id: 'o5', tur: 'odeme', gun: '2026-10-04', metin: 'Ekim aidatı', tutar: 4100, bitti: false },
  { id: 'e4', ogrenci_id: 'o6', tur: 'odeme', gun: '2026-10-03', metin: 'Ekim aidatı', tutar: 2000, bitti: true }
];

const O5 = { id: 'o5', ad: 'Geçen Ay Ödeyen' };
const O6 = { id: 'o6', ad: 'Bu Ay Ödeyen' };

test('son ödeme en yeni ödenmiş ayı ve o ayın toplamını verir', () => {
  const son = O.sonOdeme(ODEMELI, 'o5');
  assert.equal(son.ay, '2026-09', 'ekim kaydı ödenmemiş, eylül esas alınmalı');
  assert.equal(son.adet, 2);
  assert.equal(son.tutar, 4600, 'aynı ayın iki tahsilatı toplanmalı');
  assert.equal(O.sonOdeme(ODEMELI, 'o6').tutar, 2000);
  assert.equal(O.sonOdeme(ODEMELI, 'o9'), null, 'hiç ödemeyen için kayıt yok');
  assert.equal(O.sonOdeme(null, 'o5'), null);
});

test('geçen ay ödeyen öğrenci satırda ayıyla yazılır', () => {
  const h = O.ogrenciSatiri(O5, {}, ODEMELI, AY);
  assert.ok(h.includes('<i class="g">Eylül ödendi · 4.600 ₺</i>'), 'ödenmiş ay satırda görünmeli');
  assert.ok(h.includes('4.100 ₺ bekliyor'), 'açık borç yine ayrı yazılmalı');
});

test('ayın kendi tahsilatı varken geçen ayın çipi tekrarlanmaz', () => {
  const h = O.ogrenciSatiri(O6, {}, ODEMELI, AY);
  assert.ok(h.includes('2.000 ₺ ödendi'));
  assert.ok(!h.includes('Ekim ödendi'), 'aynı ay iki kez yazılmamalı');
  assert.ok(!h.includes('Eylül ödendi'), 'başka öğrencinin geçmişi sızmamalı');
});

test('hiç ödemeyen öğrencide ödendi çipi basılmaz', () => {
  const h = O.ogrenciSatiri({ id: 'o9', ad: 'Yeni' }, {}, ODEMELI, AY);
  assert.ok(!h.includes('ödendi'), 'ödeme yokken "ödendi" yazılmamalı');
});

// ---------- Klasör gövdesi ----------

const OGR = [OGRENCILER[0]];

test('klasör özet ve süzgeci listeyle birlikte basar', () => {
  const h = O.ogrenciListesi(OGRENCILER, KAYIT, {}, AY);
  assert.ok(h.includes('ogr-toplam'));
  assert.ok(h.includes('ogr-suzgec'));
  assert.ok(h.includes('Elif Yılmaz'));
  assert.ok(h.includes('Mert Demir'));
  assert.ok(h.includes('Zeynep Ak'));
});

test('süzgeç seçiliyken liste o öğrencilere iner', () => {
  const h = O.ogrenciListesi(OGRENCILER, KAYIT, { ogrenciOdak: 'borc' }, AY);
  assert.ok(h.includes('Elif Yılmaz'));
  assert.ok(h.includes('Mert Demir'));
  assert.ok(!h.includes('Zeynep Ak'), 'borçsuz öğrenci süzgeçte görünmemeli');
});

test('arama ile süzgeç birlikte çalışır', () => {
  const h = O.ogrenciListesi(OGRENCILER, KAYIT, { ogrenciOdak: 'borc', ogrenciAra: 'mert' }, AY);
  assert.ok(h.includes('Mert Demir'));
  assert.ok(!h.includes('Elif Yılmaz'), 'arama dışında kalan borçlu da elenmeli');
});

test('süzgeçte kimse kalmazsa sebebi yazılır', () => {
  const h = O.ogrenciListesi([OGRENCILER[0]], KAYIT, { ogrenciOdak: 'gelmedi' }, AY);
  assert.ok(h.includes('Bu süzgeçte öğrenci yok.'));
});

test('süzgeç yokken boş liste mesajı eskisi gibi', () => {
  assert.ok(O.ogrenciListesi([], [], {}, AY).includes('Henüz öğrenci yok.'));
  assert.ok(O.ogrenciListesi([], [], { ogrenciAra: 'elif' }, AY).includes('Aramayla eşleşen öğrenci yok.'));
});

test('boş klasörde özet ve süzgeç düğmeleri çıkmaz', () => {
  const h = O.ogrenciListesi([], [], {}, AY);
  assert.ok(!h.includes('ogr-toplam'));
  assert.ok(!h.includes('ogr-suzgec'));
  assert.ok(h.includes('data-act="ogrenci-yeni"'), 'ekleme düğmesi yine durmalı');
});

// ---------- Detayda açık borç ----------

test('detay toplam açık borcu yazar', () => {
  const h = O.ogrenciDetay(OGRENCILER[0], KAYIT, {}, AY);
  assert.ok(h.includes('ogr-acik-borc'));
  assert.ok(h.includes('Toplam açık borç'));
  assert.ok(h.includes('900 ₺'));
});

test('borcu olmayan öğrencide açık borç satırı çıkmaz', () => {
  const h = O.ogrenciDetay(OGRENCILER[2], KAYIT, {}, AY);
  assert.ok(!h.includes('ogr-acik-borc'));
});

test('birden çok açık kayıt sayısıyla birlikte yazılır', () => {
  const k = [
    { id: 'a', ogrenci_id: 'o1', tur: 'odeme', gun: '2026-08-01', metin: '', tutar: 100, bitti: false },
    { id: 'b', ogrenci_id: 'o1', tur: 'odeme', gun: '2026-09-01', metin: '', tutar: 200, bitti: false }
  ];
  const h = O.ogrenciDetay(OGRENCILER[0], k, {}, AY);
  assert.ok(h.includes('300 ₺'));
  assert.ok(h.includes('2 kayıt'));
});

// ---------- Panele bağlanma: Plan → Öğrenciler ----------
// Özet ve süzgeçler öğrenci sayfasında yaşar; marka takvimi sayfasında
// öğrenciye dair hiçbir şey basılmaz.

const P = require('../plan-takvim.js');
const V = require('../radyo-panel-views.js');
const UI = { now: () => Date.parse('2026-10-05T09:00:00Z') };
global.window = Object.assign(global.window || {}, { DerinOgrenci: O, DerinPlan: P });

const ogrenciSayfasi = ek => V.gorunum(Object.assign({
  nav: 'plan', sub: 'ogrenciler', openFolder: null, openBrand: null, openPlaylist: null, q: ''
}, ek || {}), {
  brands: [], folders: [], tracks: [], players: [], broadcast: [], announcements: [],
  playlists: [], playlistTracks: [], coffeeAttempts: [], subscriptions: [], plans: [],
  requests: [], olaylar: [], planItems: [], kurulum: {},
  ogrenciler: OGRENCILER, ogrenciKayitlari: KAYIT
}, UI).html;

test('sayfa ay özetini öğrenci verisinden hesaplar', () => {
  const h = ogrenciSayfasi({ ogrenciYil: 2026, ogrenciAy: 10 });
  assert.ok(h.includes('ogr-toplam'), 'ay özeti sayfada görünmeli');
  // Para artık gelir şeridinde: ay özeti yoklama, şerit tutar taşır.
  assert.ok(h.includes('öğrenci geliri'), 'gelir şeridi sayfada görünmeli');
  assert.ok(h.includes('2.000 ₺'));
  assert.ok(h.includes('900 ₺ devir'));
  assert.ok(h.includes('Gelmedi ≥ 3 <b>1</b>'));
});

test('ay değişince özet de o aya döner, marka takvimi etkilenmez', () => {
  const h = ogrenciSayfasi({ ogrenciYil: 2026, ogrenciAy: 9, planYil: 2026, planAy: 10 });
  assert.ok(h.includes('Eylül 2026'), 'öğrenci ayı seçileni göstermeli');
  // Ay sınırı korunur: ekimde alınan 2.000 ₺ eylülün tahsilatı sayılmaz.
  // (Eski ölçek "2.000 ₺ geçmesin" idi; satır artık başka ayın ödemesini
  // ayını yazarak gösterdiği için ölçek tahsilat çipine daraltıldı.)
  assert.ok(!h.includes('2.000 ₺ ödendi'), 'Ekim tahsilatı Eylül tahsilatı sayılmamalı');
  assert.ok(h.includes('Ekim ödendi · 2.000 ₺'), 'başka ayın ödemesi ayı yazılarak görünür');
  assert.ok(!h.includes('öğrenci geliri'), 'Eylül parasız ay: gelir şeridi basılmamalı');
  // Marka sayfası kendi ayında kalır: aynı durumda takvim ekimi gösterir.
  const marka = V.gorunum({ nav: 'plan', sub: 'takvim', planYil: 2026, planAy: 10,
    openFolder: null, openBrand: null, openPlaylist: null, q: '' }, {
    brands: [], folders: [], tracks: [], players: [], broadcast: [], announcements: [],
    playlists: [], playlistTracks: [], coffeeAttempts: [], subscriptions: [], plans: [],
    requests: [], olaylar: [], planItems: [], kurulum: {}
  }, UI).html;
  assert.ok(marka.includes('EKİM 2026'));
  // Marka sayfasında öğrenciye dair tek iz olmamalı: ay özeti satırı ve
  // öğrenci listesi yalnız öğrenci sayfasında yaşar.
  assert.ok(!marka.includes('ogr-toplam'), 'öğrenci ay özeti marka sayfasına sızmamalı');
  assert.ok(!/öğrenci/i.test(marka), 'marka sayfası öğrenciden söz etmemeli');
});

test('süzgeç durumu sayfadan geçer', () => {
  const h = ogrenciSayfasi({ ogrenciYil: 2026, ogrenciAy: 10, ogrenciOdak: 'gelmedi' });
  assert.ok(h.includes('data-id="gelmedi"'));
  assert.ok(h.includes('ogr-odak secili'));
  assert.ok(!h.includes('Elif Yılmaz'), 'süzgeç dışı öğrenci satırı basılmamalı');
  assert.ok(h.includes('Mert Demir'));
});

// ---------- Panel ve stil bağlanması ----------

const panelKaynak = fs.readFileSync(require.resolve('../radyo-yonetim.js'), 'utf8');
const cssKaynak = fs.readFileSync(require.resolve('../radyo-panel.css'), 'utf8');
const jsKaynak = fs.readFileSync(require.resolve('../ogrenciler.js'), 'utf8');

test('panel süzgeç eylemini karşılar', () => {
  assert.ok(/case 'ogrenci-odak': \{[\s\S]*?state\.ogrenciOdak = state\.ogrenciOdak === id \? '' : \(id \|\| ''\)/.test(panelKaynak),
    'aynı düğmeye ikinci basış süzgeci kaldırmalı');
  assert.ok(/return ciz\(\);/.test(panelKaynak.match(/case 'ogrenci-odak': \{[\s\S]*?\n      \}/)[0]),
    'süzgeç değişince liste yeniden basılmalı');
});

test('üretilen her sınıfın stili var', () => {
  // Sınıf adı JS'te yazılıp CSS'te unutulursa süzgeç/özet biçimsiz kalır.
  ['ogr-toplam', 'ogr-suzgec', 'ogr-odak', 'ogr-acik-borc'].forEach(sinif => {
    assert.ok(jsKaynak.includes(sinif), sinif + ' üretilmeli');
    assert.ok(new RegExp('\\.' + sinif + '[{. :,]').test(cssKaynak), sinif + ' için CSS kuralı olmalı');
  });
  assert.ok(/\.ogr-odak\.secili\{/.test(cssKaynak), 'seçili süzgeç ayrı renkte olmalı');
  assert.ok(/\.ogr-cip i\.b\{/.test(cssKaynak), 'borç rozeti ayrı renkte olmalı');
});

test('ikinci takvim sınıflarının stili de var', () => {
  // İkinci takvim marka panelinden ayrı bir düzen; kutular, gün paneli ve
  // durum düğmeleri stilsiz kalırsa okunmaz hâle gelir.
  ['ogr-takvim', 'ogr-takvim-sarmal', 'ogr-takvim-ana', 'ogr-takvim-yan',
    'ogr-izgara', 'ogr-hucre', 'ogr-yoklama', 'ogr-yoklama-liste',
    'ogr-yoklama-satir', 'ogr-durum', 'ogr-gun-bas', 'ogr-takvim-ay',
    'ogr-uyari', 'ogr-uyari-gun', 'ogr-uyari-kalan'].forEach(sinif => {
    assert.ok(jsKaynak.includes(sinif), sinif + ' JS\'te üretilmeli');
    assert.ok(new RegExp('\\.' + sinif + '[{. :,]').test(cssKaynak), sinif + ' için CSS kuralı olmalı');
  });
  assert.ok(/\.ogr-hucre\.tam\{/.test(cssKaynak), 'herkes gelince kutu ayrı renkte olmalı');
  assert.ok(/\.ogr-hucre\.eksik\{/.test(cssKaynak), 'gelmeyen varsa kutu ayrı renkte olmalı');
  assert.ok(/\.ogr-durum\.gelmedi\{/.test(cssKaynak), 'durum düğmesi renklenmeli');
  // Dar ekranda ikinci takvim tek sütuna iner.
  assert.ok(/\.ogr-takvim-sarmal\{grid-template-columns:1fr\}/.test(cssKaynak),
    'dar ekranda tek sütun kuralı olmalı');
});

test('panel ikinci takvimin ay ve gün eylemlerini karşılar', () => {
  assert.ok(/case 'ogrenci-ay': \{[\s\S]*?state\.ogrenciYil = y;/.test(panelKaynak),
    'ay okları ikinci takvimin kendi ayını yazmalı');
  assert.ok(/case 'ogrenci-ay': \{[\s\S]*?state\.ogrenciGun = null;/.test(panelKaynak),
    'ay değişince açık gün kapanmalı');
  assert.ok(/case 'ogrenci-gun': \{[\s\S]*?state\.ogrenciGun = state\.ogrenciGun === id \? null : id;/.test(panelKaynak),
    'güne ikinci basış paneli kapatmalı');
  assert.ok(/case 'ogrenci-gun-kapat': \{[\s\S]*?state\.ogrenciGun = null;/.test(panelKaynak),
    'kapat düğmesi günü temizlemeli');
  // Ay durumu marka takviminden ayrı tutulmalı: aynı alan paylaşılırsa
  // öğrenci oku marka takvimini de kaydırırdı.
  assert.ok(!/case 'ogrenci-ay': \{[\s\S]*?state\.planYil = /.test(panelKaynak),
    'öğrenci ayı marka takviminin ayını değiştirmemeli');
});

test('iki panel sayfası aynı sürümü yükler', () => {
  // Prova sayfası ile gerçek panel aynı stili/modülü çekmezse biri eski kalır.
  const surum = (yol, dosya) => {
    const k = fs.readFileSync(require.resolve(yol), 'utf8');
    const m = k.match(new RegExp(dosya.replace('.', '\\.') + '\\?v=([0-9]+)'));
    return m && m[1];
  };
  assert.equal(surum('../radyo-yonetim.html', 'radyo-panel.css'),
    surum('../radyo-panel-prova.html', 'radyo-panel.css'), 'CSS sürümleri eşleşmeli');
  assert.equal(surum('../radyo-yonetim.html', 'ogrenciler.js'),
    surum('../radyo-panel-prova.html', 'ogrenciler.js'), 'modül sürümleri eşleşmeli');
});
