// Telefon menü simgesi (24 Ekim, Derin seçti: "cam kutu, kademeli çizgi").
// HESABIM ile aynı boy ve köşe; çizgiler uzundan kısaya, en alttaki pembe;
// açıkken çarpı. Görünmez "MENÜ" yazısı çizgileri itmesin diye yazı boyu 0.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const KOK = path.join(__dirname, '..');
const css = fs.readFileSync(path.join(KOK, 'mobil.css'), 'utf8');
const blok = (css.split('Menü simgesi: cam kutu')[1] || '').split('/* ----------')[0];

test('cam kutu: HESABIM ile aynı yükseklik ve köşe, yazı itmez', () => {
  assert.ok(blok, 'mobil.css içinde menü simgesi bölümü');
  assert.match(blok, /height: 44px !important/);
  assert.match(blok, /border-radius: 15px !important/);
  assert.match(blok, /backdrop-filter: blur\(8px\)/);
  assert.match(blok, /font-size: 0 !important/);
});

test('kademeli çizgiler: üst uzun, orta, alt kısa ve pembe; eski kaydırma kapalı', () => {
  assert.match(blok, /i::before \{[^}]*width: 24px[^}]*transform: none !important/);
  assert.match(blok, /i::after \{[^}]*width: 10px[^}]*background: var\(--pink, #cb2468\) !important/);
});

test('açıkken çarpı olur', () => {
  assert.match(blok, /\[aria-expanded="true"\] i::before \{[^}]*rotate\(45deg\)/);
  assert.match(blok, /\[aria-expanded="true"\] i::after \{[^}]*rotate\(-45deg\)/);
});

test('mobil.css sürümü bütün sayfalarda yenilendi', () => {
  const sayfalar = fs.readdirSync(KOK).filter(d => d.endsWith('.html'));
  sayfalar.forEach(s => {
    const h = fs.readFileSync(path.join(KOK, s), 'utf8');
    if (h.includes('mobil.css')) assert.match(h, /mobil\.css\?v=2"/, s);
  });
});
