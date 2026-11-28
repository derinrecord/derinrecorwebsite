// 28 Kasım 2026: alarm takibinde süre sınırı yok (Derin: "her şey anlık görünsün").
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const sql = fs.readFileSync(require.resolve('../supabase/radio-alarm-surekli.sql'), 'utf8');
const govde = sql.split('\n').filter(s => !s.trim().startsWith('--')).join('\n');

test('sessiz denetimde 3 gün sınırı yok, duraklatılmış ekran kuralı duruyor', () => {
  assert.doesNotMatch(govde, /interval '3 days'/);
  assert.doesNotMatch(govde, /interval '12 hours'/);
  assert.match(govde, /and r\.is_playing\s+and r\.last_seen_at < now\(\) - interval '2 minutes'/);
  assert.match(govde, /where b\.is_active\s+and public\.abonelik_gecerli\(b\.id\)/);
});

test('günlük özet bağlı olmayan şubeleri adıyla yazar', () => {
  assert.match(govde, /Şu an bağlı olmayan/);
  assert.match(govde, /p\.last_seen_at <= now\(\) - interval '10 minutes'/);
  assert.match(govde, /revoke all on function public\.radio_gunluk_ozet\(\) from public, anon, authenticated/);
});
