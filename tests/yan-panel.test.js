// Telefon menüsü (24 Ekim, Derin seçti: "Apple tarzı yüzen cam panel").
// Kademeli çizgiye basınca sağdan kayan, kenarlardan boşluklu, dört köşesi
// yuvarlak cam panel açılır; açıkken WhatsApp/belge düğmeleri gizlenir.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const css = fs.readFileSync(path.join(__dirname, '..', 'mobil.css'), 'utf8');
const kural = sec => {
  const m = css.match(new RegExp(sec.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{([^}]*)\\}'));
  return m ? m[1] : '';
};

test('panel sağdan kayar: kapalıyken ekran dışında, açıkken yerinde', () => {
  const n = kural('  .site-header nav');
  assert.match(n, /transform: translateX\(calc\(100% \+ 24px\)\) !important/);
  assert.match(n, /left: auto !important/);
  assert.match(n, /transition: transform \.32s/);
  assert.match(kural('  .site-header nav.open'), /transform: translateX\(0\) !important/);
});

test('yüzen cam panel: kenarlardan boşluk, tam boy, 28px köşe', () => {
  const n = kural('  .site-header nav');
  assert.match(n, /right: 2px !important/);
  assert.match(n, /height: calc\(100dvh - 20px\) !important/);
  assert.match(n, /border-radius: 28px !important/);
  assert.match(n, /width: min\(78vw, 320px\) !important/);
});

test('menü açıkken sağ alttaki yüzen düğmeler gizlenir', () => {
  assert.match(kural('  body.menu-open .float-actions'), /opacity: 0 !important[^]*pointer-events: none !important/);
});
