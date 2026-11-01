// E-posta onayı (1 Kasım): Gizem Karayalçın kayıt düğmesine birkaç kez bastı; her kayıt yeni
// e-posta gönderip eskisini geçersiz yaptı, eski bağlantıya tıkladı, hatalar İngilizce kaldı.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const oku = d => fs.readFileSync(path.join(__dirname, '..', d), 'utf8');
function authYukle() {
  const window = { addEventListener() {}, dispatchEvent() {} };
  const document = { readyState: 'complete', querySelector: () => null, addEventListener() {}, body: { classList: { toggle() {}, remove() {} } } };
  vm.runInNewContext(oku('auth.js'), { window, document, CustomEvent: class {}, Promise, setTimeout, clearTimeout, setInterval, clearInterval, requestAnimationFrame: f => f(), URLSearchParams });
  return window.DerinAuth;
}

test('Supabase hataları anlaşılır Türkçeye çevrilir', () => {
  const H = authYukle()._hataMetni;
  assert.equal(H({ message: 'Invalid login credentials', code: 'invalid_credentials' }), 'E-posta ya da şifre yanlış.');
  assert.match(H({ message: 'Email not confirmed', code: 'email_not_confirmed' }), /henüz onaylanmamış/);
  assert.match(H({ message: 'email rate limit exceeded', code: 'over_email_send_rate_limit' }), /Çok sık denendi/);
  assert.match(H({ message: 'For security purposes, you can only request this after 59 seconds.', code: 'over_email_send_rate_limit' }), /Çok sık denendi/);
  assert.match(H({ message: 'User already registered', code: 'user_already_exists' }), /zaten kayıtlı/);
  assert.match(H({ message: 'Password should be at least 8 characters', code: 'weak_password' }), /en az 8/);
  assert.equal(H({ message: 'Bilinmeyen bir şey' }), 'Bilinmeyen bir şey');
});

test('adres çubuğundaki onay sonucu tanınır', () => {
  const A = authYukle()._adresDurumu;
  assert.equal(A('#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired'), 'eskimis');
  assert.equal(A('#access_token=abc&refresh_token=x&type=signup'), 'onaylandi');
  assert.equal(A('#demolar'), null);
  assert.equal(A(''), null);
});

test('kayıt: düğme kilitlenir, form kapanır, en son e-posta uyarısı, 60 sn bekleme', () => {
  const k = oku('auth.js');
  assert.match(k, /submit\.disabled = true/);
  assert.match(k, /En son gelen e-postayı aç/);
  assert.match(k, /YENIDEN_BEKLE = 60/);
  assert.match(k, /eskimisBaglanti\(\)/);
});
