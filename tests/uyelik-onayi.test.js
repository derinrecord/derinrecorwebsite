// Üyelik onayı: kayıt formunda zorunlu sözleşme kutusu; kabul sürümü ve zamanı hesaba yazılır.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const auth = fs.readFileSync(require.resolve('../auth.js'), 'utf8');

test('kayıt formunda zorunlu sözleşme onay kutusu var', () => {
  assert.match(auth, /<label class="auth-onay"><input type="checkbox" name="onay" required>/);
  assert.ok(auth.includes('href="kullanici-sozlesmesi.html"') && auth.includes('href="aydinlatma-metni.html"'));
});

test('kutu işaretlenmeden kayıt yapılmaz; kabul bilgisi kayda yazılır', () => {
  assert.match(auth, /if \(signup && !form\.get\('onay'\)\) \{/);
  assert.match(auth, /sozlesme_surum: SOZLESME_SURUM, aydinlatma_surum: AYDINLATMA_SURUM, kabul_at:/);
  const sozlesme = fs.readFileSync(require.resolve('../kullanici-sozlesmesi.html'), 'utf8');
  const surum = (auth.match(/const SOZLESME_SURUM = '([^']+)'/) || [])[1];
  assert.ok(sozlesme.includes('Sürüm: ' + surum), 'sürüm sözleşme sayfasındakiyle aynı olmalı');
});
