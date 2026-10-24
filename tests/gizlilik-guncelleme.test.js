// Hukuki metin güncellemesi (24 Ekim): profil fotoğrafı/kulüp/şehir, Telegram
// bildirimleri, R2 dosya saklama ve öğretici tur kaydı metinlerde anılır;
// sürümler güncel; ana sayfada dört metne bağlantı; kayıt kutusunda gizlilik.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const oku = d => fs.readFileSync(path.join(__dirname, '..', d), 'utf8');

test('Aydınlatma Metni: profil bilgileri, Telegram aktarımı, R2 ve bildirim amacı (TR + EN)', () => {
  const h = oku('aydinlatma-metni.html');
  assert.match(h, /<li><strong>Profil:<\/strong> isteğe bağlı profil fotoğrafı, kulüp ve şehir bilgisi<\/li>/);
  assert.match(h, /<tr><td>Telegram<\/td><td>[^<]*yeni kayıt[^<]*<\/td><td>Yurt dışı<\/td><\/tr>/);
  assert.match(h, /Cloudflare<\/td><td>[^<]*R2[^<]*<\/td>/);
  assert.match(h, /<tr><td>Yeni kayıt ve antrenör notlarını Derin Record’a anında bildirmek<\/td>/);
  assert.match(h, /<strong>Profile:<\/strong>/);
  assert.match(h, /<td>Telegram<\/td><td>[^<]*new sign-up/);
  assert.match(h, /Yürürlük tarihi: 24 Ekim 2026 · Sürüm: 2026-10-24/);
});

test('Gizlilik Politikası: yeni veriler, tarayıcı kaydı ve Telegram (TR + EN), sürüm', () => {
  const h = oku('gizlilik-politikasi.html');
  assert.match(h, /profil fotoğrafı, kulüp ve şehir/);
  assert.match(h, /Öğretici tur bilgisi/);
  assert.match(h, /Telegram/);
  assert.match(h, /profile photo, club and city/);
  assert.match(h, /Yürürlük tarihi: 24 Ekim 2026 · Sürüm: 2026-10-24/);
});

test('Çerez Politikası: öğretici tur kaydı tabloda, sürüm', () => {
  const h = oku('cerez-politikasi.html');
  assert.match(h, /<th>Öğretici tur bilgisi<\/th>/);
  assert.match(h, /Yürürlük tarihi: 24 Ekim 2026 · Sürüm: 2026-10-24/);
});

test('kayıtta kabul edilen Aydınlatma sürümü sayfayla aynı; kayıt kutusunda Gizlilik bağlantısı', () => {
  const a = oku('auth.js');
  assert.match(a, /const AYDINLATMA_SURUM = '2026-10-24';/);
  assert.ok(a.includes('href="gizlilik-politikasi.html"'));
});

test('ana sayfanın altında dört hukuki metne bağlantı', () => {
  const f = oku('index.html').match(/<footer id="iletisim">[\s\S]*?<\/footer>/)[0];
  ['gizlilik-politikasi', 'aydinlatma-metni', 'kullanici-sozlesmesi', 'cerez-politikasi'].forEach(s => assert.match(f, new RegExp(`href="${s}\\.html"`), s));
});
