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

test('özet satırı ay, sayı ve tutarları yazar', () => {
  const h = O.toplamSatiri(OGRENCILER, KAYIT, AY);
  assert.ok(h.includes('3 öğrenci'));
  assert.ok(h.includes('Ekim 2026'));
  assert.ok(h.includes('2.000 ₺ tahsil'));
  assert.ok(h.includes('1.500 ₺ bekleyen'));
  assert.ok(h.includes('3 gelmedi'));
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

// ---------- Klasör gövdesi ----------

const OGR = [OGRENCILER[0]];

test('klasör özet ve süzgeci listeyle birlikte basar', () => {
  const h = O.ogrenciBolumu(OGRENCILER, KAYIT, {}, AY);
  assert.ok(h.includes('ogr-toplam'));
  assert.ok(h.includes('ogr-suzgec'));
  assert.ok(h.includes('Elif Yılmaz'));
  assert.ok(h.includes('Mert Demir'));
  assert.ok(h.includes('Zeynep Ak'));
});

test('süzgeç seçiliyken liste o öğrencilere iner', () => {
  const h = O.ogrenciBolumu(OGRENCILER, KAYIT, { ogrenciOdak: 'borc' }, AY);
  assert.ok(h.includes('Elif Yılmaz'));
  assert.ok(h.includes('Mert Demir'));
  assert.ok(!h.includes('Zeynep Ak'), 'borçsuz öğrenci süzgeçte görünmemeli');
});

test('arama ile süzgeç birlikte çalışır', () => {
  const h = O.ogrenciBolumu(OGRENCILER, KAYIT, { ogrenciOdak: 'borc', ogrenciAra: 'mert' }, AY);
  assert.ok(h.includes('Mert Demir'));
  assert.ok(!h.includes('Elif Yılmaz'), 'arama dışında kalan borçlu da elenmeli');
});

test('süzgeçte kimse kalmazsa sebebi yazılır', () => {
  const h = O.ogrenciBolumu([OGRENCILER[0]], KAYIT, { ogrenciOdak: 'gelmedi' }, AY);
  assert.ok(h.includes('Bu süzgeçte öğrenci yok.'));
});

test('süzgeç yokken boş liste mesajı eskisi gibi', () => {
  assert.ok(O.ogrenciBolumu([], [], {}, AY).includes('Henüz öğrenci yok.'));
  assert.ok(O.ogrenciBolumu([], [], { ogrenciAra: 'elif' }, AY).includes('Aramayla eşleşen öğrenci yok.'));
});

test('boş klasörde özet ve süzgeç düğmeleri çıkmaz', () => {
  const h = O.ogrenciBolumu([], [], {}, AY);
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

// ---------- Takvime bağlanma ----------

const P = require('../plan-takvim.js');
const UI = { now: () => Date.parse('2026-10-05T09:00:00Z') };
global.window = Object.assign(global.window || {}, { DerinOgrenci: O });

test('takvim klasör özetini öğrenci verisinden hesaplar', () => {
  const D = {
    brands: [], plans: [], subscriptions: [], planItems: [],
    ogrenciler: OGRENCILER, ogrenciKayitlari: KAYIT
  };
  const h = P.takvimView({ planYil: 2026, planAy: 10 }, D, UI);
  assert.ok(h.includes('ogr-toplam'), 'ay özeti takvimde görünmeli');
  assert.ok(h.includes('2.000 ₺ tahsil'));
  assert.ok(h.includes('900 ₺ devir'));
  assert.ok(h.includes('Gelmedi ≥ 3 <b>1</b>'));
});

test('takvim ayı değişince özet de o aya döner', () => {
  const D = {
    brands: [], plans: [], subscriptions: [], planItems: [],
    ogrenciler: OGRENCILER, ogrenciKayitlari: KAYIT
  };
  const h = P.takvimView({ planYil: 2026, planAy: 9 }, D, UI);
  assert.ok(h.includes('Eylül 2026'));
  assert.ok(!h.includes('2.000 ₺ tahsil'), 'Ekim tahsilatı Eylül özetine girmemeli');
});

test('süzgeç durumu takvimden geçer', () => {
  const D = {
    brands: [], plans: [], subscriptions: [], planItems: [],
    ogrenciler: OGRENCILER, ogrenciKayitlari: KAYIT
  };
  const h = P.takvimView({ planYil: 2026, planAy: 10, ogrenciOdak: 'gelmedi' }, D, UI);
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
