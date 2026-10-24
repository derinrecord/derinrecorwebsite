// HESABIM düğmesinde profil fotoğrafı (24 Ekim, Derin seçti: B — solda,
// köşesi yuvarlak kare). Foto yoksa baş harf; Profilim'de değişince yenilenir.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const oku = d => fs.readFileSync(path.join(__dirname, '..', d), 'utf8');
const a = oku('auth.js');

test('profil foto yolu okunur, gizli kovadan süreli bağlantı alınır', () => {
  assert.match(a, /select\('id,full_name,role,avatar_path'\)/);
  assert.match(a, /storage\.from\('profil-foto'\)\.createSignedUrl\(/);
});

test('düğme: solda foto (ya da baş harf), yanında HESABIM', () => {
  assert.match(a, /button\.classList\.add\('hb-fotolu'\)/);
  assert.match(a, /className = 'hb-foto'/);
  assert.match(a, /dataset\.harf = /);
  assert.match(a, /button\.append\(foto, document\.createTextNode\(dilMetni\('hesap\.hesabim', 'HESABIM'\)\)\)/);
  assert.match(a, /button\.classList\.remove\('hb-fotolu'\)/);
});

test('Profilim fotoğrafı değişince düğme yenilenir', () => {
  assert.match(a, /addEventListener\('derin:profilfoto'/);
  const p = oku('profilim.js');
  assert.equal((p.match(/new CustomEvent\('derin:profilfoto'\)/g) || []).length, 2, 'yükle ve kaldır');
});

test('kare foto stili: 30px, 10px köşe', () => {
  const c = oku('auth.css');
  assert.match(c, /\.account-button \.hb-foto\{[^}]*width:30px;height:30px;[^}]*border-radius:10px/);
  assert.match(c, /\.account-button \.hb-foto\[data-harf\]::before\{content:attr\(data-harf\)/);
});
