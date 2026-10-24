// Ana sayfa demo kasetleri (24 Ekim): alt yazı branştaki gerçek demolardan
// otomatik gelir — hiç yoksa YAKINDA, tek demoysa adı, birden çoksa "N DEMO".
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

test('alt yazı: 0 → YAKINDA, 1 → adı, çok → N DEMO', () => {
  assert.equal(C.altYazi([]), 'YAKINDA');
  assert.equal(C.altYazi(['Horon Kafkas']), 'Horon Kafkas', 'büyük harfe kaset çizilirken çevrilir');
  assert.equal(C.altYazi(['a', 'b', 'c']), '3 DEMO');
});

test('katalog başlıkları demolarla güncellenir; bilinmeyen bağlantı dokunulmaz', () => {
  const katalog = [
    { branch: 'Ritmik', title: 'YAKINDA', link_url: 'ritmik.html' },
    { branch: 'Akrobatik', title: '2 DEMO', link_url: 'akrobatik.html' },
    { branch: 'Çocuk Fitness', title: 'YAKINDA', link_url: 'cocuk-fitness.html' },
    { branch: 'Özel', title: 'ELLE', link_url: 'https://ornek.com' }
  ];
  const demolar = [{ brans: 'ritmik', baslik: 'Horon Kafkas' }, { brans: 'akrobatik', baslik: 'WP Acro' }, { brans: 'ritmik', baslik: 'Kuğu' }];
  assert.deepEqual(C.basliklariGuncelle(katalog, demolar).map(k => k.title), ['2 DEMO', 'WP Acro', 'YAKINDA', 'ELLE']);
});

test('sayfa demo listesini okur', () => {
  assert.match(fs.readFileSync(path.join(__dirname, '..', 'demo-catalog.js'), 'utf8'), /from\('demo_parcalari'\)\.select\('brans,baslik'\)/);
});

test('her branş kasetinin zemini kendi renginde (A · renkli kart zemini)', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'demo-cassette.css'), 'utf8');
  const renk = { aerobik: '#fe4b6a', akrobatik: '#f1ece1', artistik: '#3fc1c9', ritmik: '#ab6ee7', 'cocuk-fitness': '#9be15d' };
  for (const [b, r] of Object.entries(renk)) assert.match(css, new RegExp(`\\.cassette-card\\.renk-${b}\\{background:${r}\\}`), b);
  assert.match(fs.readFileSync(path.join(__dirname, '..', 'demo-catalog.js'), 'utf8'), /class="cassette-card\$\{b \? ' renk-' \+ b : ''\}"/);
  const h = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  ['aerobik', 'akrobatik', 'artistik', 'ritmik', 'cocuk-fitness'].forEach(b => assert.match(h, new RegExp(`class="cassette-card renk-${b}" href="${b}\\.html"`), b));
});
