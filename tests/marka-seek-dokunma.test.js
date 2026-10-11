// Müşteri sunumundaki (coffee-marka) ilerleme çubuğu telefonda parmakla
// tutulabilmeli: tıklanabilir alan en az 40px yüksek olmalı. Görünen çizgi
// ince kalır (2px); onu ayrı "track" kuralı çizer. glass.css'in genel input
// kutusu (çerçeve, zemin, bulanıklık) 40px'lik alana sızmamalı.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const KOK = path.join(__dirname, '..');
const oku = y => fs.readFileSync(path.join(KOK, y), 'utf8');
const css = oku('marka-sunum.css').replace(/\/\*[\s\S]*?\*\//g, '');

function govde(secici) {
  const i = css.indexOf(secici + '{');
  assert.ok(i >= 0, 'kural yok: ' + secici);
  return css.slice(i + secici.length + 1, css.indexOf('}', i)).replace(/\s+/g, ' ');
}

test('ilerleme çubuğunun dokunma alanı en az 40px', () => {
  const g = govde('.mk-prog input[type=range]');
  const h = g.match(/height:(\d+)px/);
  assert.match(g, /z-index:1/, "süre yazıları dokunmayı yutmasın");
  assert.ok(h && Number(h[1]) >= 40, 'yükseklik 40px altında: ' + g);
});

test('glass.css input kutusu çubuğa sızmıyor', () => {
  const g = govde('.mk-prog input[type=range]');
  assert.match(g, /background:transparent!important/);
  assert.match(g, /border:0!important/);
  assert.match(g, /backdrop-filter:none!important/);
});

test('görünen çizgi ince kalıyor (track kuralları)', () => {
  assert.match(govde('.mk-prog input[type=range]::-webkit-slider-runnable-track'), /height:2px/);
  assert.match(govde('.mk-prog input[type=range]::-moz-range-track'), /height:2px/);
});

test('sunum sayfası güncel marka-sunum.css sürümünü yüklüyor', () => {
  const m = oku('coffee-marka.html').match(/marka-sunum\.css\?v=(\d+)/);
  assert.ok(m && Number(m[1]) >= 24, 'marka-sunum.css ?v= eksik');
});
