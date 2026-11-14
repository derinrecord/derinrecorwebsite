// Ödemelerim (14 Kasım): HESABIM → ÖDEMELERİM; müşteri satın aldığı parçaları,
// tutarları ve ödeme durumlarını görür. Parçaya bağlantı Projelerim'de doğrudan açar.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const oku = d => fs.readFileSync(path.join(__dirname, '..', d), 'utf8');

test('HESABIM menüsünde herkese ÖDEMELERİM', () => {
  assert.ok(oku('auth.js').includes('<a href="odemelerim.html" class="menu-odemelerim">ÖDEMELERİM</a>'));
});

test('sayfa: oturum, R2 ve satın alma yardımcıları yüklü', () => {
  const h = oku('odemelerim.html');
  for (const b of ['config.js', 'auth.js?v=20261114b', 'r2-depo.js?v=2', 'satin-alma.js?v=14', 'odemelerim.js?v=2']) assert.ok(h.includes(`src="${b}"`), b);
  assert.match(h, /<meta name="robots" content="noindex">/);
});

test('yalnız satın alması olan parçalar; tutar KDV dahil; durumlar; canlı', () => {
  const j = oku('odemelerim.js');
  assert.match(j, /\.not\('satin_alma_durum', 'is', null\)/);
  assert.match(j, /KDV dahil/);
  assert.match(j, /Ödeme bekleniyor/);
  assert.match(j, /Ödendi/);
  assert.match(j, /my-projects\.html\?parca=/);
  assert.match(j, /table: 'project_tracks'/);
  assert.match(j, /const kacis = /);
});

test('Projelerim ?parca= bağlantısıyla parçayı doğrudan açar', () => {
  const j = oku('projects.js');
  assert.match(j, /get\('parca'\)/);
  assert.match(j, /openTrackDetail\(tr,p\); break;/);
});

test('SATIN AL basılmadan müşteriye fiyat/IBAN/dekont kutusu gösterilmez', () => {
  const j = oku('projects.js');
  assert.match(j, /if\(!detail\.odemeGoster\)return '';/);
  assert.match(j, /detail\.odemeGoster=true;/);
  assert.match(oku('odemelerim.js'), /\$\{parcaLink\}&odeme=1/);
});
