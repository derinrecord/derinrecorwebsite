// Hesap menüsü telefonda krem kutu olmasın (24 Ekim hatası).
// styles.css telefon kuralı bütün <nav> öğelerine krem zemin + sağa yaslı
// mutlak konum veriyordu; hesap menüsünün bağlantı listesi de bir <nav>
// (.account-menu-links) olduğu için beyaz kutuya dönüşüyordu. auth.css bu
// listeyi genel nav kuralından bağımsız kılar.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const css = fs.readFileSync(path.join(__dirname, '..', 'auth.css'), 'utf8');

test('hesap menüsü bağlantı listesi genel nav kuralını ezer', () => {
  const m = css.match(/\.account-menu \.account-menu-links\{([^}]*)\}/);
  assert.ok(m, '.account-menu .account-menu-links kuralı olmalı');
  ['position:static', 'inset:auto', 'padding:0', 'background:none', 'color:inherit', 'box-shadow:none', 'border:0', 'transform:none', 'width:auto', 'height:auto']
    .forEach(k => assert.ok(m[1].includes(k), k));
});

test('kural tek sınıf + nav seçicisinden güçlü (styles.css "nav" kuralını yener)', () => {
  // .account-menu .account-menu-links = 2 sınıf; styles.css "nav" = 1 öğe.
  assert.ok(/\.account-menu \.account-menu-links\{/.test(css));
});
