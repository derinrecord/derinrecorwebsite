// Telefon yan menüsü (24 Ekim): en üstte PROFİLİM, kaset etiketi gibi (krem,
// pembe sert gölge) ama eğik değil. Yalnız giriş yapmış kişiye görünür.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const oku = d => fs.readFileSync(path.join(__dirname, '..', d), 'utf8');

test('ana sayfa menüsünün ilk bağlantısı PROFİLİM, başta gizli', () => {
  const nav = oku('index.html').match(/<nav id="nav">([\s\S]*?)<\/nav>/)[1];
  const ilk = nav.match(/<a [^>]*>[^<]*<\/a>/)[0];
  assert.match(ilk, /href="profilim\.html"/);
  assert.match(ilk, /class="nav-profil"/);
  assert.match(ilk, /data-profil-baglanti/);
  assert.match(ilk, /\shidden[\s>]/);
  assert.match(ilk, />PROFİLİM</);
});

test('auth.js: giriş yapınca görünür, çıkınca gizlenir', () => {
  const a = oku('auth.js');
  assert.match(a, /\[data-profil-baglanti\]'\)\.forEach\(a => \{ a\.hidden = !\(configured && state\.user\); \}\)/);
});

test('kaset etiketi görünümü, eğik değil; gizliyken gerçekten gizli; bilgisayarda yok', () => {
  const css = oku('mobil.css');
  const k = css.split('@media (max-width: 760px)')[1].match(/\.site-header nav a\.nav-profil \{([^}]*)\}/)[1];
  assert.match(k, /background: #f4f1e9 !important/);
  assert.match(k, /box-shadow: 4px 4px 0 var\(--pink, #cb2468\) !important/);
  assert.match(k, /transform: none !important/);
  assert.match(css, /\.site-header nav a\.nav-profil\[hidden\] \{\s*display: none !important/);
  const masaustu = css.split('@media (max-width: 760px)')[0];
  assert.match(masaustu, /\.site-header nav a\.nav-profil \{ display: none !important; \}/);
});

test('İngilizce karşılığı var', () => {
  assert.match(oku('dil.js'), /'nav\.profilim': 'MY PROFILE'/);
});
