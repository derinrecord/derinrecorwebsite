// Bildirim sayacı: yöneticinin menüsündeki BİLDİRİMLER bağlantısında ve HESABIM
// düğmesinde onay bekleyen Müzik Araştır isteklerinin sayısı görünür.
// Derin'in isteği (2026-10-14): "bildirim düştüğünde kutucukta 1, artık kaç tane varsa".
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const KOK = path.join(__dirname, '..');
const oku = y => fs.readFileSync(path.join(KOK, y), 'utf8');

test('menüdeki BİLDİRİMLER bağlantısında sayaç yeri var, antrenör menüsünde yok', () => {
  const auth = oku('auth.js');
  const satir = auth.split('\n').find(s => s.includes("account-menu-links').innerHTML"));
  const [yonetici, antrenor] = satir.split("' : '");
  assert.match(yonetici, /href="bildirimler\.html">BİLDİRİMLER<span class="bildirim-sayac" data-bildirim-sayac hidden><\/span><\/a>/);
  assert.ok(!antrenor.includes('data-bildirim-sayac'));
});

test('sayaç metni: 0 → gizli, 1..99 → sayı, 100+ → 99+', () => {
  const window = { addEventListener() {}, dispatchEvent() {} };
  const document = { readyState: 'complete', querySelector: () => null, addEventListener() {}, body: { classList: { toggle() {}, remove() {} } } };
  const kod = oku('auth.js');
  vm.runInNewContext(kod, { window, document, CustomEvent: class {}, Promise, setTimeout, clearTimeout, setInterval, clearInterval, requestAnimationFrame: f => f() });
  const yazi = window.DerinAuth._sayacYazisi;
  assert.equal(typeof yazi, 'function');
  assert.equal(yazi(0), '');
  assert.equal(yazi(1), '1');
  assert.equal(yazi(7), '7');
  assert.equal(yazi(99), '99');
  assert.equal(yazi(100), '99+');
  assert.equal(yazi(null), '');
});

test('bildirimler sayfası onaydan sonra sayacı tazeler', () => {
  assert.ok(oku('bildirimler.js').includes("new CustomEvent('derin:bildirim-yenile')"));
});

test('yalnız onay bekleyen istekler sayılır (aynı etiket, alıcı yönetici)', () => {
  const auth = oku('auth.js');
  assert.ok(auth.includes(".is('research_project_id', null)"), 'onaylananlar sayılmamalı');
  assert.ok(auth.includes("'%[Müzik araştırma isteği%'"), 'bildirimler.js ile aynı etiket');
  assert.ok(auth.includes("count: 'exact', head: true"), 'yalnız sayı istenmeli (veri indirilmez)');
});
