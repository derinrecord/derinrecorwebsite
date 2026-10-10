const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const kok = path.join(__dirname, '..');
const oku = f => fs.readFileSync(path.join(kok, f), 'utf8');

// AJANLAR sayfası: Derin Record'un ajan sisteminin tanıtım sayfası (canlı veri yok).
test('AJANLAR bağlantısı yalnız yönetici menüsünde', () => {
  const auth = oku('auth.js');
  const satir = auth.split('\n').find(s => s.includes("account-menu-links').innerHTML"));
  const [yonetici, herkes] = satir.split("' : '");
  assert.ok(yonetici.includes('href="ajanlar.html"'), 'yönetici menüsünde olmalı');
  assert.ok(!herkes.includes('ajanlar.html'), 'antrenör menüsünde olmamalı');
});

test('AJANLAR sayfası arama motorlarına kapalı ve ajanları anlatır', () => {
  const html = oku('ajanlar.html');
  assert.match(html, /<meta name="robots" content="noindex,nofollow">/);
  ['Haftalık Instagram planı', 'Site bakım ajanı', 'Arayüz ajanı', 'Satış takibi', 'Marka iletişim kartı', 'Storyboard', 'Satış ajanı', 'Haftalık özet'].forEach(m =>
    assert.ok(html.includes(m), m));
  assert.ok(html.includes("'radyo-yonetim.html#/satis'"), 'satış ekranına bağlantı');
  assert.ok(html.includes('id="beyin"'), 'ortada beyin olmalı');
  ['Sosyal medya', 'Satış', 'Müşteri & yayın', 'Finans & rapor', 'Web & güvenlik', 'Prodüksiyon'].forEach(d =>
    assert.ok(html.includes(`ad: '${d}'`), d + ' departmanı'));
  assert.ok(html.includes('esc(m.not)') && html.includes('esc(d.ad)'), 'metinler kaçışlı basılmalı');
  assert.ok(html.includes('auth.js'), 'ortak hesap kabuğu yüklenmeli');
});

test('auth.js sürümü bütün sayfalarda aynı (önbellek eski menüyü göstermesin)', () => {
  const surumler = new Set();
  fs.readdirSync(kok).filter(f => f.endsWith('.html')).forEach(f => {
    const m = oku(f).match(/auth\.js\?v=(\w+)/);
    if (m) surumler.add(m[1]);
  });
  assert.equal(surumler.size, 1, [...surumler].join(','));
  assert.ok(!surumler.has('20261007'), 'menü değiştiği için sürüm artırılmalı');
});
