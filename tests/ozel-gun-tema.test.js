const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const T = require('../ozel-gun-tema.js');

// 26 Kasım 2026: şube ekranına özel gün süsleri (ekranın tasarımına dokunmadan).
test('tarihe göre doğru tema seçilir', () => {
  const t = (yil, ay, gun) => T.tarihTemasi({ yil, ay, gun });
  assert.equal(t(2026, 12, 20), 'yilbasi');
  assert.equal(t(2027, 1, 2), 'yilbasi');
  assert.equal(t(2027, 1, 3), null);
  assert.equal(t(2027, 2, 14), 'sevgililer');
  assert.equal(t(2027, 4, 23), 'cocuk');
  assert.equal(t(2027, 5, 19), 'genclik');
  assert.equal(t(2027, 5, 9), 'anneler');
  assert.equal(t(2027, 8, 30), 'zafer');
  assert.equal(t(2027, 10, 1), 'kahve');
  assert.equal(t(2027, 10, 29), 'cumhuriyet');
  assert.equal(t(2026, 11, 10), null, '10 Kasım süslenmez');
  assert.equal(T.ikinciPazar(2027), 9);
  assert.equal(T.ikinciPazar(2028), 14);
});

test('süs katmanı dokunmayı engellemez ve şube ekranına bağlıdır', () => {
  const kod = fs.readFileSync(require.resolve('../ozel-gun-tema.js'), 'utf8');
  assert.match(kod, /\.ot-kok\{position:fixed;inset:0;pointer-events:none/);
  assert.match(kod, /prefers-reduced-motion/);
  assert.match(fs.readFileSync(require.resolve('../coffee-marka.html'), 'utf8'), /ozel-gun-tema\.js\?v=1/);
});

test('yılbaşı seçenekleri tanımlı; geri sayım doğru', () => {
  assert.ok(T.TEMALAR['yilbasi-cam'] && T.TEMALAR['yilbasi-altin']);
  const s = T.TEMALAR['yilbasi-altin'].selam;
  assert.equal(s({ yil: 2026, ay: 12, gun: 26 }), 'Yeni yıla 6 gün · 2027');
  assert.equal(s({ yil: 2026, ay: 12, gun: 31 }), 'Yeni yıla son saatler · 2027');
  assert.equal(s({ yil: 2027, ay: 1, gun: 1 }), 'Mutlu Yıllar 2027');
});

test('zengin yılbaşı: arka katman içeriğin arkasında, kar başlıkları dokunmayı engellemez', () => {
  const kod = fs.readFileSync(require.resolve('../ozel-gun-tema.js'), 'utf8');
  assert.ok(T.TEMALAR['yilbasi-zengin'].tabela);
  assert.match(kod, /\.ot-arka\{position:fixed;inset:0;z-index:-1;pointer-events:none/);
  assert.match(kod, /\.ot-karli\{position:absolute;left:0;top:0;width:0;height:0;z-index:42;pointer-events:none\}/);
});
