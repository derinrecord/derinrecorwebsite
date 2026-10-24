// "MÜZİĞİNİ OLUŞTUR" düğmesi (24 Ekim, Derin seçti: "Kaset etiketi").
// Krem etiket, koyu yazı, hafif eğik, pembe sert gölge; yalnız ana sayfa kahraman alanında.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const oku = d => fs.readFileSync(path.join(__dirname, '..', d), 'utf8');

test('kaset etiketi stili yalnız kahraman düğmesine', () => {
  const css = oku('hero-clarity.css');
  const m = css.match(/\.hero-actions \.button-yellow\{([^}]*)\}/);
  assert.ok(m, 'kural var');
  assert.match(m[1], /background:#f4f1e9/);
  assert.match(m[1], /color:#17131a/);
  assert.match(m[1], /transform:rotate\(-2deg\)/);
  assert.match(m[1], /box-shadow:5px 5px 0 var\(--pink,#cb2468\)/);
  assert.match(css, /\.hero-actions \.button-yellow:hover[^{]*\{[^}]*translateY\(-3px\)/);
});

test('ana sayfa yeni sürümü yükler', () => {
  assert.match(oku('index.html'), /hero-clarity\.css\?v=2"/);
});
