const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const O = require('../ogrenciler.js');

// Klasör artık takvimin ayını ve bugününü de alıyor (yoklama şeridi ve ödeme
// özeti takvimde görünen ayı izler). Testler tek yerden bu bağlamı veriyor.
const AY = { yil: 2026, ay: 10, bugun: '2026-10-05' };
const bolum = (liste, s, kayitlar) => O.ogrenciBolumu(liste, kayitlar || [], s, AY);

// ---------- Arama ----------
// Liste ad, veli ve telefonda aranır; harf büyüklüğünden bağımsız, Türkçe
// yerelle ("İ"→"i" doğru çevrilmeli).

test('arama boşken tüm liste döner', () => {
  const l = [
    { id: '1', ad: 'Elif', veli: 'Ayşe', telefon: '531' },
    { id: '2', ad: 'Mert', veli: 'Ali', telefon: '532' }
  ];
  assert.equal(O.ogrenciFiltrele(l, '').length, 2);
  assert.equal(O.ogrenciFiltrele(l, null).length, 2);
});

test('arama ad, veli ve telefonda eşleşir', () => {
  const l = [
    { id: '1', ad: 'Elif', veli: 'Ayşe Yılmaz', telefon: '0531' },
    { id: '2', ad: 'Mert', veli: 'Ali', telefon: '0532' }
  ];
  assert.deepEqual(O.ogrenciFiltrele(l, 'elif').map(x => x.id), ['1']);
  assert.deepEqual(O.ogrenciFiltrele(l, 'yılmaz').map(x => x.id), ['1']);
  assert.deepEqual(O.ogrenciFiltrele(l, '0532').map(x => x.id), ['2']);
});

test('arama Türkçe büyüklükten bağımsız', () => {
  const l = [{ id: '1', ad: 'İpek', veli: '', telefon: '' }];
  assert.deepEqual(O.ogrenciFiltrele(l, 'ipek').map(x => x.id), ['1']);
  assert.deepEqual(O.ogrenciFiltrele(l, 'İPEK').map(x => x.id), ['1']);
});

// ---------- Klasör görünümü ----------
// Klasör DOM'a dokunmaz, HTML metni döndürür. Böylece burada sınanabiliyor.

test('klasör arama, ekle düğmesi ve satırları basar', () => {
  const h = bolum([
    { id: '1', ad: 'Elif', veli: 'Ayşe', telefon: '0531', notlar: '' }
  ], {});
  assert.ok(h.includes('data-act="ogrenci-ara"'), 'arama kutusu olmalı');
  assert.ok(h.includes('data-act="ogrenci-yeni"'), 'ekle düğmesi olmalı');
  assert.ok(h.includes('Elif'), 'ad görünmeli');
  assert.ok(h.includes('Ayşe'), 'veli görünmeli');
  assert.ok(h.includes('data-act="ogrenci-duzenle" data-id="1"'), 'düzenle düğmesi olmalı');
  assert.ok(h.includes('data-act="ogrenci-sil" data-id="1"'), 'sil düğmesi olmalı');
});

test('boş listede davet metni çıkar', () => {
  const h = bolum([], {});
  assert.ok(h.includes('Henüz öğrenci yok'));
  const aranmis = bolum([], { ogrenciAra: 'elif' });
  assert.ok(aranmis.includes('eşleşen öğrenci yok'));
});

test('ekleme formu açıkken dört alan ve ekle düğmesi basılır', () => {
  const h = bolum([], { ogrenciYeni: true });
  ['ad', 'veli', 'telefon', 'notlar'].forEach(a =>
    assert.ok(h.includes(`data-ogrenci-gir="${a}"`), a + ' alanı olmalı'));
  assert.ok(h.includes('data-act="ogrenci-kaydet"'), 'ekle düğmesi olmalı');
  assert.ok(h.includes('data-act="ogrenci-yeni-kapat"'), 'vazgeç düğmesi olmalı');
});

test('düzenlenen satır yerinde form olur', () => {
  const h = bolum([
    { id: '1', ad: 'Elif', veli: 'Ayşe', telefon: '0531', notlar: 'esnek' },
    { id: '2', ad: 'Mert', veli: '', telefon: '', notlar: '' }
  ], { ogrenciDuzenle: '1' });
  assert.ok(h.includes('data-ogrenci-duzenle="ad"'), 'düzenleme alanları olmalı');
  assert.ok(h.includes('data-act="ogrenci-duzenle-kaydet" data-id="1"'), 'kaydet düğmesi olmalı');
  assert.ok(h.includes('data-act="ogrenci-duzenle-kapat"'), 'vazgeç düğmesi olmalı');
  assert.ok(h.includes('data-act="ogrenci-duzenle" data-id="2"'), 'diğer satırda düzenle düğmesi kalmalı');
  assert.ok(!h.includes('data-act="ogrenci-duzenle" data-id="1"'), 'düzenlenen satırda düğme basılmamalı');
});

test('kaydedilemeyen satırda düzenle düğmesi çıkmaz', () => {
  const h = bolum([
    { id: 'yerel-1', ad: 'Elif', veli: '', telefon: '', notlar: '', hata: 'ağ hatası' }
  ], {});
  assert.ok(!h.includes('data-act="ogrenci-duzenle"'), 'hata satırında düzenleme olmamalı');
  assert.ok(h.includes('data-act="ogrenci-tekrar"'), 'tekrar dene olmalı');
  assert.ok(h.includes('kaydedilemedi — tekrar dene'), 'söz takvimle aynı olmalı');
});

test('kullanıcı girdisi kaçışlı basılır', () => {
  const h = bolum([
    { id: '1', ad: '<img src=x onerror=1>', veli: '', telefon: '', notlar: '' }
  ], {});
  assert.ok(!h.includes('<img src=x'), 'ham HTML basılmamalı');
  assert.ok(h.includes('&lt;img'), 'kaçışlı basılmalı');
});

// ---------- Takvime bağlanma ----------
// Öğrenciler takvim içinde ayrı bir klasör; panele yalnız birkaç satırla
// tanıtılıyor. Bu testler o bağlantının kopmadığını doğrular.

const P = require('../plan-takvim.js');
const UI = { now: () => Date.parse('2026-10-05T09:00:00Z') };

// takvimView modülü window üzerinden okur; node'da pencere yok, burada kurulur.
global.window = Object.assign(global.window || {}, { DerinOgrenci: O });

test('takvim yan panelinde ayrı ÖĞRENCİLER klasörü var', () => {
  const D = { brands: [], plans: [], subscriptions: [], planItems: [], ogrenciler: [] };
  const h = P.takvimView({ planYil: 2026, planAy: 10 }, D, UI);
  assert.ok(h.includes('ÖĞRENCİLER'), 'klasör başlığı olmalı');
  assert.ok(h.includes('data-act="plan-katla" data-id="ogrenciler"'), 'klasör katlanabilmeli');
  assert.ok(h.includes('data-act="ogrenci-ara"'), 'klasörde arama olmalı');
  assert.ok(h.includes('data-act="ogrenci-yeni"'), 'klasörde ekleme olmalı');
});

test('klasör katlıyken içeriği basılmaz', () => {
  const D = { brands: [], plans: [], subscriptions: [], planItems: [],
    ogrenciler: [{ id: '1', ad: 'Elif', veli: '', telefon: '', notlar: '' }] };
  const acik = P.takvimView({ planYil: 2026, planAy: 10, planKatli: [] }, D, UI);
  const katli = P.takvimView({ planYil: 2026, planAy: 10, planKatli: ['ogrenciler'] }, D, UI);
  assert.ok(acik.includes('Elif'), 'açık klasörde ad görünmeli');
  assert.ok(!katli.includes('Elif'), 'katlı klasörde satır basılmamalı');
});

test('öğrenci verisi yokken klasör boş açılır, takvim çalışır', () => {
  const h = P.takvimView({ planYil: 2026, planAy: 10 }, { brands: [], plans: [], subscriptions: [] }, UI);
  assert.ok(h.includes('ÖĞRENCİLER'), 'klasör yine de basılmalı');
  assert.ok(h.includes('data-act="plan-gun"'), 'takvim ızgarası çalışmalı');
});

// ---------- Panele bağlanma ----------

const panelKaynak = fs.readFileSync(require.resolve('../radyo-yonetim.js'), 'utf8');
const sayfaKaynak = fs.readFileSync(require.resolve('../radyo-yonetim.html'), 'utf8');

test('panel öğrenci verisini yüklüyor', () => {
  assert.ok(panelKaynak.includes("from('ogrenciler')"), 'ogrenciler sorgulanmalı');
  assert.ok(panelKaynak.includes('D.ogrenciler') || panelKaynak.includes('ogrenciler:'),
    'veri D.ogrenciler olarak taşınmalı');
  assert.ok(panelKaynak.includes("D.kurulum['ogrenciler.sql']"), 'kurulum bayrağı yazılmalı');
});

test('panel öğrenci eylemlerini karşılıyor', () => {
  ['ogrenci-yeni', 'ogrenci-yeni-kapat', 'ogrenci-kaydet', 'ogrenci-duzenle',
    'ogrenci-duzenle-kapat', 'ogrenci-duzenle-kaydet', 'ogrenci-sil', 'ogrenci-tekrar',
    'ogrenci-ara']
    .forEach(act => assert.ok(panelKaynak.includes(act), act + ' işlenmeli'));
});

test('ekleme iyimser: kayıt düşerse satır hata ile ekranda kalır', () => {
  assert.ok(panelKaynak.includes('ogrenciEkle'), 'ogrenciEkle bulunmalı');
  const m = panelKaynak.match(/async function ogrenciEkle\([\s\S]*?\n  \}/);
  assert.ok(m, 'ogrenciEkle gövdesi bulunmalı');
  assert.ok(/hata: null/.test(m[0]), 'satır hata alanıyla doğmalı');
  assert.ok(/yerel\.hata/.test(m[0]), 'başarısızlık satıra yazılmalı, kaybolmamalı');
});

test('güncelleme yalnız gönderilen alanları yazar', () => {
  const m = panelKaynak.match(/async function ogrenciYazDene\([\s\S]*?\n  \}/);
  assert.ok(m, 'ogrenciYazDene gövdesi bulunmalı');
  assert.ok(/'ad' in veri|'veli' in veri|a in veri/.test(m[0]), 'yalnız gönderilen alanlar yazılmalı');
});

test('öğrenci ekleme tarayıcı prompt() penceresi kullanmaz', () => {
  assert.ok(!/prompt\(/.test(panelKaynak), 'satır içi form kullanılmalı');
});

test('sayfa ogrenciler.js dosyasını yüklüyor ve dosya gerçekten var', () => {
  assert.ok(/ogrenciler\.js\?v=\d+/.test(sayfaKaynak), 'sürümlü script etiketi olmalı');
  const kok = require('node:path').dirname(require.resolve('../radyo-yonetim.html'));
  const yollar = [...sayfaKaynak.matchAll(/<script src="([^"]+)"/g)]
    .map(m => m[1])
    .filter(y => !/^https?:\/\//.test(y))
    .map(y => y.split('?')[0]);
  yollar.forEach(y => assert.ok(fs.existsSync(require('node:path').join(kok, y)), y + ' bulunamadı'));
});

// ---------- Yetki ----------
// Öğrenci listesi de yalnızca yöneticiye görünür: tek RLS kuralı, mevcut
// is_admin() üzerine. Yönetici olmayan oturum boş döner.

test('öğrenci SQL\'i yalnızca yöneticiye açık', () => {
  const sql = fs.readFileSync(require.resolve('../supabase/ogrenciler.sql'), 'utf8');
  assert.match(sql, /create table if not exists public\.ogrenciler/);
  assert.match(sql, /alter table public\.ogrenciler enable row level security/,
    'satır düzeyi güvenlik açık olmalı');
  assert.match(sql, /create policy "ogrenci: yalnizca yonetici" on public\.ogrenciler/);
  assert.match(sql, /create table if not exists public\.ogrenci_kayitlari/,
    'yoklama ve ödeme tablosu da bu dosyada kurulmalı');
  assert.match(sql, /alter table public\.ogrenci_kayitlari enable row level security/);
  assert.match(sql, /create policy "ogrenci kaydi: yalnizca yonetici" on public\.ogrenci_kayitlari/);
  assert.match(sql, /for all to authenticated\s*\n?\s*using \(public\.is_admin\(\)\) with check \(public\.is_admin\(\)\)/,
    'kural yalnızca is_admin() ile çalışmalı');
  assert.ok(!/to anon/.test(sql), 'tablo anon\'a açılmamalı');
  assert.ok(!/using \(true\)|using \(auth\.uid\(\) is not null\)/.test(sql),
    'herkese açık bir kural olmamalı');
  // Mevcut kurallara dokunulmamalı: plan tablosu için kural ya da
  // politika bu dosyada yok (adı açıklamada geçebilir, önemli olan kural).
  assert.ok(!/on public\.plan_maddeleri/.test(sql), 'plan tablosuna kural yazılmamalı');
  assert.ok(!/plan_maddeleri enable row level security/.test(sql), 'plan tablosunun RLS\'i ellememeli');
});
