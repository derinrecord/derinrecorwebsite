// Geri bildirim paneli (24 Ekim, Derin): "Element ara", "Hareket / geçiş" ve
// "Element ayrıntısı" alanları görünmez. Hareket arka planda ilk seçenek
// (genel) olarak kaydedilir; eski notlar ve kayıt biçimi değişmez.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const oku = d => fs.readFileSync(path.join(__dirname, '..', d), 'utf8');

test('FIG seçicide üç alan gizli bir kutuda', () => {
  const f = oku('fig-catalog.js');
  assert.match(f, /<div class="fig-secim" hidden style="display:none"><label>Element ara<input class="element-search"[\s\S]*?name="fig-detail"[^>]*><\/label><\/div>/);
});

test('FIG dışı branşlarda da Hareket / geçiş görünmez', () => {
  assert.match(oku('feedback.js'), /<div class="movement-picker"><label hidden style="display:none">Hareket \/ geçiş<select name="movement">/);
});
