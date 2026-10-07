// Derin Record ↔ öğrenci takvimi ayrılığının kalıcı kaydı.
//
// Öğrenci uygulaması 2026-10-07'de bu depodan tamamen çıkarıldı (klasör,
// testleri, şeması, önizlemeleri dahil). Bu test geri dönüşe izin vermez:
// ne öğrenci adına bir dosya/klasör, ne sayfa bağlantısı, ne de panellerde
// öğrenci menüsü/stili belirir. Uygulamanın kendisi ve verisi bu repoda
// DEĞİLDİR; yalnız masaüstündeki tek dosya panelde ve kendi Supabase
// projesinde yaşar.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const KOK = path.join(__dirname, '..');
const oku = y => fs.readFileSync(path.join(KOK, y), 'utf8');

test('kök dizinde öğrenci adına dosya veya klasör yok', () => {
  const kok = fs.readdirSync(KOK);
  const iz = kok.filter(d => /ogrenci/i.test(d));
  assert.deepEqual(iz, [], 'öğrenci izi olmamalı: ' + iz.join(', '));
});

test('site sayfaları öğrenci işine bağlanmaz', () => {
  const sayfalar = fs.readdirSync(KOK).filter(d => d.endsWith('.html'));
  assert.ok(sayfalar.length > 0, 'site sayfaları duruyor olmalı');
  sayfalar.forEach(d => {
    const icerik = oku(d);
    ['ogrenciler.html', 'ogrenci-takvimi', 'ogrenciler.js', 'ogrenci-panel.js'].forEach(yasak =>
      assert.ok(!icerik.includes(yasak), d + ' → ' + yasak + ' geçmemeli'));
  });
});

test('hesap ve panel kodunda öğrenci bağlantısı yok', () => {
  ['auth.js', 'script.js', 'admin.js', 'radyo-yonetim.js', 'plan-takvim.js',
    'radyo-panel-views.js', 'config.js'].forEach(d => {
    const icerik = oku(d);
    ['ogrenciler.html', 'ogrenci-takvimi', 'ogrenciler.js'].forEach(yasak =>
      assert.ok(!icerik.includes(yasak), d + ' → ' + yasak + ' geçmemeli'));
  });
  // Gizli anahtar kuralı ayrıca sürüyor: öğrenci işi çıksa da bu değişmez.
  assert.ok(!/sb_secret|service_role\s*:|eyJhbGciOi/i.test(oku('config.js')),
    'config.js secret anahtar içermemeli');
});

test('panel yan menüsünde Öğrenciler satırı yok', () => {
  // 2026-10-07 ayrılışında nav satırı silinmiş ama menü metni için kalıcı
  // koruma bırakılmamıştı; boşluk kapatıldı.
  const views = oku('radyo-panel-views.js');
  assert.ok(!views.includes('Yoklama, borç ve ödeme'),
    'menü alt başlığı kalmamalı');
  assert.ok(!views.includes('data-sub="ogrenciler"'),
    'Öğrenciler nav satırı kalmamalı');
  assert.ok(!/oge\('plan',\s*'ogrenciler'/.test(views),
    'plan menüsünde öğrenci ogesi olmamalı');
  // Menüde kalan tek PLAN satırı Takvim olmalı.
  assert.ok(views.includes("oge('plan', 'takvim'"), 'Takvim satırı kalmalı');
  // Bütün sayfa/panel kaynaklarında da iz sürülür.
  fs.readdirSync(KOK)
    .filter(d => /\.(js|html)$/.test(d))
    .forEach(d => assert.ok(!oku(d).includes('Yoklama, borç ve ödeme'),
      d + ' öğrenci menü metni taşımamalı'));
});

test('panel stilinde öğrenci sınıfı kalmadı', () => {
  const css = oku('radyo-panel.css');
  assert.ok(!/ogr-|ogrenci|öğrenci/i.test(css),
    'radyo-panel.css öğrenci stilleri taşımamalı');
  // Plan takvimi stilleri bu dosyadan silinmemiş olmalı: öğrenci temizliği
  // plan panelini bozarak yapılmamalı.
  ['.plan-izgara', '.plan-satir', '.plan-odeme-liste', '.plan-trend-liste'].forEach(p =>
    assert.ok(css.includes(p), p + ' stilleri kalmalı'));
});
