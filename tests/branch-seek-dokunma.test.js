// Branş demo sayfalarındaki ilerleme çubuğu (.seek) telefonda parmakla
// tutulabilmeli: tıklanabilir alan en az 40px yüksek olmalı. Görünen çizgi
// ince kalır; bunu ayrı bir "track" kuralı çizer.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const KOK = path.join(__dirname, '..');
const oku = y => fs.readFileSync(path.join(KOK, y), 'utf8');
const css = oku('branch.css');

test('.seek dokunma alanı en az 40px yüksek', () => {
  const kural = css.match(/\.seek\{width:100%[^}]*\}/);
  assert.ok(kural, '.seek ana kuralı bulunamadı');
  const h = kural[0].match(/height:(\d+)px/);
  assert.ok(h && Number(h[1]) >= 40, 'yükseklik 40px altında: ' + kural[0]);
});

test('ince görünen çizgi track kuralıyla çiziliyor', () => {
  assert.match(css, /\.seek::-webkit-slider-runnable-track\{[^}]*height:5px/);
  assert.match(css, /\.seek::-moz-range-track\{[^}]*height:5px/);
});

test('demo sayfaları güncel branch.css sürümünü yüklüyor', () => {
  for (const s of ['aerobik.html', 'akrobatik.html', 'artistik.html', 'ritmik.html']) {
    assert.match(oku(s), /href="branch\.css\?v=\d+"/, s + ' ?v= eksik');
  }
});
