// Kafe oynatıcısındaki çalma listesi seçicisi: appearance:none tarayıcının
// açılır ok işaretini siliyor; personel kutunun bir seçici olduğunu anlamıyordu.
// Seçicinin kendi ok işareti olmalı ve yazı oka binmemeli.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'radyo.html'), 'utf8');
const kural = (html.match(/\.liste select\{[^}]*\}/) || [''])[0];

test('çalma listesi seçicisinde açılır ok işareti var', () => {
  assert.match(kural, /appearance:none/);
  assert.match(kural, /background-image:url\(/, 'ok işareti (arka plan görseli) yok');
  assert.match(kural, /background-position:right/);
});

test('seçici yazısı oka binmiyor', () => {
  const m = kural.match(/padding:\s*\d+px\s+(\d+)px\s+\d+px\s+\d+px/);
  assert.ok(m, 'sağ boşluk ayrı tanımlı değil');
  assert.ok(Number(m[1]) >= 40, 'sağ boşluk 40px altında');
});
