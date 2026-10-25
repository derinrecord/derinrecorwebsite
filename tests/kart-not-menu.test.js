// Proje kartındaki NOTLAR (25 Ekim, Derin): parça klasöründeki gibi ⌄ menüsü
// → Düzenle / Sil. Yetki not-islemleri.js'ten (kendi notunu düzenler; siler:
// kendi notu ya da yönetici). Sistem ve sesli notlar düzenlenmez.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const j = fs.readFileSync(path.join(__dirname, '..', 'projects.js'), 'utf8');
const kart = j.slice(j.indexOf('function card(p){'), j.indexOf('function card(p){') + 9000);

test('kart notunda yetkiye göre ⌄ menüsü, Düzenle ve Sil', () => {
  assert.match(kart, /NotIslem\.yetki\(f,me,admin\)/);
  assert.match(kart, /class="not-menu-ac" data-knotmenu="\$\{safe\(f\.id\)\}"/);
  assert.match(kart, /data-knotduzenle="\$\{safe\(f\.id\)\}"/);
  assert.match(kart, /data-knotsil="\$\{safe\(f\.id\)\}"/);
  assert.match(kart, /data-knotyeni="\$\{safe\(f\.id\)\}"/);
  assert.match(kart, /f\.duzenlendi_at/);
});

test('liste kablolaması: düzenleme yalnız metni yazar, silme onay sorar ve tek satırı siler', () => {
  assert.match(j, /list\.querySelectorAll\('\[data-knotkaydet\]'\)[\s\S]{0,700}update\(\{body:sonuc\.metin\}\)\.eq\('id',id\)/);
  assert.match(j, /list\.querySelectorAll\('\[data-knotsil\]'\)[\s\S]{0,300}confirm\(/);
  assert.match(j, /list\.querySelectorAll\('\[data-knotsil\]'\)[\s\S]{0,600}delete\(\)\.eq\('id',id\)/);
});

test('menü dışına tıklayınca ya da Esc ile kapanır', () => {
  assert.match(j, /kartNotMenu=null/);
  assert.match(j, /key!=='Escape'[\s\S]{0,400}kartNotMenu/);
});
