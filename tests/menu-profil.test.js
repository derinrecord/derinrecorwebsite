// PROFİLİM (27 Ekim): ızgaradaki yan menüden HESABIM paneline taşındı. Panelin
// en üstünde, kaset etiketi gibi (krem, pembe sert gölge), düz. Her sayfada,
// telefonda ve bilgisayarda aynı yerde.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const oku = d => fs.readFileSync(path.join(__dirname, '..', d), 'utf8');

test('HESABIM panelinin ilk bağlantısı PROFİLİM ve yalnız bir kez', () => {
  const a = oku('auth.js');
  assert.match(a, /\.account-menu-links'\)\.innerHTML = `<a href="profilim\.html" class="menu-profil">PROFİLİM<\/a>\$\{state\.profile/);
  assert.equal((a.match(/href="profilim\.html"/g) || []).length, 1);
});

test('ızgaradaki yan menüde artık PROFİLİM yok', () => {
  assert.doesNotMatch(oku('index.html'), /nav-profil|data-profil-baglanti/);
  assert.doesNotMatch(oku('mobil.css'), /nav-profil/);
});

test('kaset etiketi görünümü, eğik değil', () => {
  const k = oku('auth.css').match(/\.account-menu-links a\.menu-profil\{([^}]*)\}/)[1];
  assert.match(k, /background:#f4f1e9/);
  assert.match(k, /box-shadow:4px 4px 0 var\(--pink,#cb2468\)/);
  assert.doesNotMatch(k, /rotate/);
});

test('ÖĞRETİCİ, PROFİLİM etiketinin altına eklenir', () => {
  assert.match(oku('ogretici.js'), /const profil = liste\.querySelector\('\.menu-profil'\);\s*if \(profil\) profil\.after\(a\); else liste\.prepend\(a\);/);
});

test('İngilizce karşılığı var', () => {
  assert.match(oku('dil.js'), /'nav\.profilim': 'MY PROFILE'/);
});
