// "NASIL ÇALIŞIR?" oku (24 Ekim): iPhone ↘ karakterini gri emoji gösteriyordu.
// Ok çizim (SVG) olarak durur, rengini yazının pembesinden (currentColor) alır.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const oku = d => fs.readFileSync(path.join(__dirname, '..', d), 'utf8');

test('ana sayfa ve İngilizce metinde ok çizim, emoji karakteri yok', () => {
  const h = oku('index.html');
  const satir = h.split('\n').find(s => s.includes('data-i18n="ana.cta2"'));
  assert.ok(!satir.includes('↘'), 'index.html');
  assert.match(satir, /<svg[^>]*aria-hidden="true"[^>]*>[\s\S]*stroke="currentColor"/);
  const d = oku('dil.js').split('\n').find(s => s.includes("'ana.cta2'"));
  assert.ok(!d.includes('↘'), 'dil.js');
  assert.match(d, /stroke="currentColor"/);
});
