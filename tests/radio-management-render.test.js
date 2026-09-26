const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const views = require('../radyo-panel-views.js');
const source = fs.readFileSync(require.resolve('../radyo-yonetim.js'), 'utf8');

// Panel 2026-09'da yeniden düzenlendi: ana sayfadaki 6 kart yerine her işin
// kendi menü girdisi var. Abonelikler ve Talepler ayrı ekranlar olarak kalmalı
// (biri müşteri sözleşmeleri, diğeri gelen başvurular).
test('abonelikler ve talepler ayrı menü girdileri olarak kalır', () => {
  const html = views.nav(
    { nav: 'musteri', sub: 'markalar' },
    { players: 0, folders: 0, announcements: 0, brands: 0, playlists: 0, requests: 0 },
    { ad: 'Yönetici', alt: '', basHarf: 'Y' }
  );

  const abonelikler = html.indexOf('data-sub="abonelikler"');
  const talepler = html.indexOf('data-sub="talepler"');
  assert.ok(abonelikler >= 0, 'Abonelikler menüde olmalı');
  assert.ok(talepler > abonelikler, 'Talepler ayrı bir girdi olmalı');
});

test('panel hem abonelik hem talep ekranını yönlendirir', () => {
  assert.match(source, /abonelikler: \{ nav: 'musteri', sub: 'abonelikler' \}/);
  assert.match(source, /talepler: \{ nav: 'musteri', sub: 'talepler' \}/);
});

test('panel sayfası görünüm modülünü ve stil dosyasını yükler', () => {
  const sayfa = fs.readFileSync(require.resolve('../radyo-yonetim.html'), 'utf8');
  assert.match(sayfa, /radyo-panel-views\.js/);
  assert.match(sayfa, /radyo-panel\.css/);
  assert.match(sayfa, /audio-file-types\.js/);
  // Bozuk HTML: script etiketi </html> sonrasına yazılmamalı.
  assert.ok(sayfa.trimEnd().endsWith('</html>'), 'dosya </html> ile bitmeli');
});
