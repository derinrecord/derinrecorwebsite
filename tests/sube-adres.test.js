// Şube linki (/coffee/s/<anahtar>) mevcut müşteri sunumu ekranını açar;
// ayrı bir sunum sayfası yoktur.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const vercel = JSON.parse(fs.readFileSync(require.resolve('../vercel.json'), 'utf8'));
const sayfa = fs.readFileSync(require.resolve('../coffee-marka.html'), 'utf8');

test('şube adresi sunum ekranına yönlenir ve marka adresinden önce gelir', () => {
  const kurallar = vercel.rewrites.map(r => r.source);
  const sube = vercel.rewrites.find(r => r.source === '/coffee/s/:key');
  assert.ok(sube, '/coffee/s/:key yönlendirmesi olmalı');
  assert.equal(sube.destination, '/coffee-marka.html');
  assert.ok(kurallar.indexOf('/coffee/s/:key') < kurallar.indexOf('/coffee/:slug'));
});

test('ayrı sunum sayfası yok, sunum betiği sürümlü yüklenir', () => {
  assert.ok(!fs.existsSync(require.resolve('../vercel.json').replace('vercel.json', 'sunum.html')));
  assert.match(sayfa, /coffee-marka\.js\?v=\d+/);
});
