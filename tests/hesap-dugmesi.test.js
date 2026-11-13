// Telefonda hesap düğmesi (13 Kasım 2026): bu cihazda daha önce kayıt olan ya da giriş
// yapan kişiye GİRİŞ YAP, hiç hesabı olmayana KAYIT OL gösterilir.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const oku = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

test('auth.js: cihazda hesap izi tutulur ve düğme kutusuna yazılır', () => {
  const a = oku('auth.js');
  assert.match(a, /const HESAP_IZI = 'derin-hesap-var'/);
  assert.match(a, /actions\.dataset\.hesap = hesapVarMi\(\) \? 'var' : 'yok'/);
  // giriş ya da kayıt başarılı olunca ve oturum açıkken iz bırakılır
  assert.ok((a.match(/hesapIziBirak\(\)/g) || []).length >= 2);
});

test('mobil.css: hesabı olmayana KAYIT OL, olana GİRİŞ YAP', () => {
  const c = oku('mobil.css');
  assert.match(c, /\.account-actions\[data-hesap="yok"\] \[data-login\]\s*\{\s*display:\s*none !important;/);
  assert.match(c, /\.account-actions\[data-hesap="yok"\] \.secondary\s*\{\s*display:\s*inline-flex !important;/);
});
