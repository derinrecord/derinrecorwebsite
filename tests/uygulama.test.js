// Uygulama (31 Ekim): site, Derin Record uygulamasının içinde açıldığını tarayıcı kimliğindeki
// "DerinRecordApp/1" imzasından anlar. Normal tarayıcıda hiçbir şey değişmez.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const KOK = path.join(__dirname, '..');
const oku = d => fs.readFileSync(path.join(KOK, d), 'utf8');
const A = require('../uygulama.js');

test('uygulama imzası tanınır', () => {
  assert.deepEqual(A.tani('Mozilla/5.0 (Linux; Android 14) Chrome/120 DerinRecordApp/1'), { uygulamada: true, platform: 'android' });
  assert.deepEqual(A.tani('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) DerinRecordApp/1'), { uygulamada: true, platform: 'ios' });
  assert.deepEqual(A.tani('Mozilla/5.0 (Linux; Android 14) Chrome/120'), { uygulamada: false, platform: null });
  assert.deepEqual(A.tani(''), { uygulamada: false, platform: null });
  assert.deepEqual(A.tani(undefined), { uygulamada: false, platform: null });
});

test("her sayfa uygulama.js'i auth.js'ten önce yükler", () => {
  for (const f of fs.readdirSync(KOK).filter(f => f.endsWith('.html') && !f.endsWith('-prova.html'))) {
    const s = oku(f); if (!s.includes('src="auth.js')) continue;
    const u = s.indexOf('uygulama.js?v=');
    assert.ok(u > -1 && u < s.indexOf('src="auth.js'), f);
  }
});

// ---------- Menü (Task 2): uygulamada yönetici sayfalarından yalnız Radyo Yönetimi ----------
const vm = require('node:vm');
function authYukle() {
  const window = { addEventListener() {}, dispatchEvent() {} };
  const document = { readyState: 'complete', querySelector: () => null, addEventListener() {}, body: { classList: { toggle() {}, remove() {} } } };
  vm.runInNewContext(oku('auth.js'), { window, document, CustomEvent: class {}, Promise, setTimeout, clearTimeout, setInterval, clearInterval, requestAnimationFrame: f => f() });
  return window.DerinAuth;
}
const TAM = ['profilim.html', 'kullanicilar.html', 'bildirimler.html', 'taleplerim.html', 'radyo-yonetim.html', 'ajanlar.html', 'harmonic-mixer.html', 'music-request.html', 'mp3-donusturucu.html', 'my-projects.html', 'energy-map.html', 'license.html'];

test('uygulamada yönetici yalnız radyo yönetimini görür', () => {
  const m = authYukle()._menuSuz(TAM, 'admin', true);
  assert.ok(m.includes('radyo-yonetim.html'));
  for (const h of ['kullanicilar.html', 'bildirimler.html', 'taleplerim.html', 'ajanlar.html', 'harmonic-mixer.html', 'mp3-donusturucu.html']) assert.ok(!m.includes(h), h);
  for (const h of ['profilim.html', 'music-request.html', 'my-projects.html', 'energy-map.html', 'license.html']) assert.ok(m.includes(h), h);
});

test('tarayıcıda menü hiç değişmez', () => {
  assert.deepEqual(authYukle()._menuSuz(TAM, 'admin', false), TAM);
});

test('antrenör uygulamada radyo görmez; kendi menüsü aynı kalır', () => {
  const antrenor = ['profilim.html', 'music-request.html', 'my-projects.html', 'energy-map.html', 'license.html'];
  const S = authYukle()._menuSuz;
  assert.deepEqual(S(antrenor, 'coach', true), antrenor);
  assert.ok(!S(['radyo-yonetim.html', ...antrenor], 'coach', true).includes('radyo-yonetim.html'));
});

test('menü çizilince uygulamadaysa süzülür', () => {
  assert.match(oku('auth.js'), /window\.DerinApp\?\.uygulamada[\s\S]{0,200}_menuSuz|menuyuUygulamayaGoreSuz\(menu\)/);
});
