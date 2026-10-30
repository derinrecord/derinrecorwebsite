// Ana sayfa demo kasetleri: alt yazı branştaki gerçek demolardan otomatik gelir.
// 30 Ekim: branş listesinde İLK SIRADAKİ demonun adı yazar (sıra: sira, sonra eklenme);
// hiç demo yoksa YAKINDA.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const C = require('../demo-catalog.js');

test('branş anahtarı bağlantıdan çıkar', () => {
  assert.equal(C.bransAnahtari('ritmik.html'), 'ritmik');
  assert.equal(C.bransAnahtari('/cocuk-fitness.html#x'), 'cocuk-fitness');
  assert.equal(C.bransAnahtari('https://ornek.com/a.html'), null);
});

test('alt yazı: demo yoksa YAKINDA, varsa listedeki ilk şarkının adı', () => {
  assert.equal(C.altYazi([]), 'YAKINDA');
  assert.equal(C.altYazi(['Horon Kafkas']), 'Horon Kafkas', 'büyük harfe kaset çizilirken çevrilir');
  assert.equal(C.altYazi(['a', 'b', 'c']), 'a');
});

test('katalog başlıkları demolarla güncellenir; bilinmeyen bağlantı dokunulmaz', () => {
  const katalog = [
    { branch: 'Ritmik', title: 'YAKINDA', link_url: 'ritmik.html' },
    { branch: 'Akrobatik', title: '2 DEMO', link_url: 'akrobatik.html' },
    { branch: 'Çocuk Fitness', title: 'YAKINDA', link_url: 'cocuk-fitness.html' },
    { branch: 'Özel', title: 'ELLE', link_url: 'https://ornek.com' }
  ];
  const demolar = [
    { brans: 'ritmik', baslik: 'Horon Kafkas', sira: 20, created_at: '2026-10-01' },
    { brans: 'akrobatik', baslik: 'WP Acro', sira: 10, created_at: '2026-10-01' },
    { brans: 'ritmik', baslik: 'Kuğu', sira: 10, created_at: '2026-10-05' },
    { brans: 'akrobatik', baslik: 'Sonra', sira: 10, created_at: '2026-10-09' }
  ];
  assert.deepEqual(C.basliklariGuncelle(katalog, demolar).map(k => k.title), ['Kuğu', 'WP Acro', 'YAKINDA', 'ELLE'],
    'en küçük sira ilk; eşitse önce eklenen');
});

test('sayfa demo listesini okur', () => {
  assert.match(fs.readFileSync(path.join(__dirname, '..', 'demo-catalog.js'), 'utf8'), /from\('demo_parcalari'\)\.select\('brans,baslik,sira,created_at'\)/);
});

test('her branş kasetinin zemini kendi renginde (A · renkli kart zemini)', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'demo-cassette.css'), 'utf8');
  const renk = { aerobik: '#fe4b6a', akrobatik: '#f1ece1', artistik: '#3fc1c9', ritmik: '#ab6ee7', 'cocuk-fitness': '#9be15d' };
  for (const [b, r] of Object.entries(renk)) assert.match(css, new RegExp(`\\.cassette-card\\.renk-${b}\\{background:${r}\\}`), b);
  assert.match(fs.readFileSync(path.join(__dirname, '..', 'demo-catalog.js'), 'utf8'), /class="cassette-card\$\{b \? ' renk-' \+ b : ''\}"/);
  const h = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  ['aerobik', 'akrobatik', 'artistik', 'ritmik', 'cocuk-fitness'].forEach(b => assert.match(h, new RegExp(`class="cassette-card renk-${b}" href="${b}\\.html"`), b));
});
