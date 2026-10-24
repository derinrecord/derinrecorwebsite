// Sarı hesap düğmesi (24 Ekim): giriş yapınca yalnız "HESABIM" yazar, isim yazmaz.
// Kimin giriş yaptığı açılan menünün başında görünmeye devam eder.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const a = fs.readFileSync(path.join(__dirname, '..', 'auth.js'), 'utf8');

test('hesap düğmesinde isim yok, yalnız HESABIM', () => {
  assert.match(a, /button\.textContent = dilMetni\('hesap\.hesabim', 'HESABIM'\);/);
  assert.doesNotMatch(a, /button\.textContent = `\$\{\(state\.profile\?\.full_name/);
});

test('açılan menüde isim görünmeye devam eder', () => {
  assert.match(a, /\.account-menu-name'\)\.textContent = state\.profile\?\.full_name/);
});
