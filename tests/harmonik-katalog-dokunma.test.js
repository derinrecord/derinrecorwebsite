// Harmonik set kataloğu: SETE EKLE ve SİL düğmeleri telefonda rahat basılır
// (en az 40px), yazı iki satıra bölünmez; SİL artık 21px'lik ince şerit değil.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const oku = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

test('katalog düğmeleri satır içi stil yerine sınıf kullanır', () => {
  const js = oku('harmonic-mixer.js');
  assert.match(js, /<button class="hm-mini hm-mini-ekle" data-push=/);
  assert.match(js, /<button class="hm-mini hm-mini-sil" data-del=/);
  assert.doesNotMatch(js, /data-push="\$\{t\.id\}" style=/);
  assert.doesNotMatch(js, /data-del="\$\{t\.id\}" style=/);
});

test('katalog düğmeleri tek satır ve en az 40px yükseklikte', () => {
  const html = oku('harmonic-mixer.html');
  assert.match(html, /\.hm-mini\{[^}]*min-height:40px/);
  assert.match(html, /\.hm-mini\{[^}]*white-space:nowrap/);
  assert.match(html, /harmonic-mixer\.js\?v=12/);
});

test('dar sütunda düğmeler parça adının altına iner, ad sıkışmaz', () => {
  const js = oku('harmonic-mixer.js');
  assert.match(js, /<span class="hm-eylem">\$\{keyChip\(t\)\}/);
  const html = oku('harmonic-mixer.html');
  assert.match(html, /\.hm-track:has\(\.hm-eylem\)\{flex-wrap:wrap\}/);
  assert.match(html, /\.hm-eylem\{[^}]*flex:1 1 100%/);
});
