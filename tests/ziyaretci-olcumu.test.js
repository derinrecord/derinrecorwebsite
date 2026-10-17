// Ziyaretçi ölçümü yalnız herkese açık sayfalarda; panel, şube ekranı ve hesap sayfalarında yok.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const kok = path.join(__dirname, '..');
const oku = f => fs.readFileSync(path.join(kok, f), 'utf8');

const ACIK = ['index.html', 'aerobik.html', 'akrobatik.html', 'artistik.html', 'ritmik.html', 'cocuk-fitness.html',
  'ses-tasarimi.html', 'coffee.html', 'news.html', 'aydinlatma-metni.html', 'gizlilik-politikasi.html',
  'kullanici-sozlesmesi.html', 'cerez-politikasi.html'];
const KAPALI = ['radyo-yonetim.html', 'coffee-marka.html', 'admin.html', 'kullanicilar.html', 'bildirimler.html',
  'ajanlar.html', 'chat.html', 'my-projects.html', 'sifre-yenile.html'];

test('herkese açık sayfalar çerezsiz ölçüm kodunu yükler', () => {
  ACIK.forEach(f => assert.match(oku(f), /<script defer src="\/_vercel\/insights\/script\.js"><\/script>/, f));
});

test('panel, şube ekranı ve hesap sayfalarında ölçüm yok', () => {
  KAPALI.forEach(f => assert.ok(!oku(f).includes('_vercel/insights'), f));
});

test('çerez politikası ölçümü anlatır', () => {
  assert.ok(oku('cerez-politikasi.html').includes('Vercel Web Analytics'));
});
