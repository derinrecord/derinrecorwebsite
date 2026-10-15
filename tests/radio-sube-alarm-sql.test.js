// Yayın alarmı SQL'i: erişim alarmına dokunmaz, yalnız durum değişince mesaj atar.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const sql = fs.readFileSync(require.resolve('../supabase/radio-sube-alarm.sql'), 'utf8').replace(/--[^\n]*/g, '');

test('yayın alarmı ayrı tetikleyiciyle kurulur, erişim alarmı değişmez', () => {
  assert.match(sql, /create trigger radio_alarm_tetik/);
  assert.ok(!sql.includes('radio_bildirim_gonder'), 'mevcut erişim alarmı fonksiyonu yeniden yazılmaz');
  assert.ok(!/policy|drop table|radio_ping/i.test(sql));
});

test('aynı alarm tekrar mesaj atmaz; susma dakikada bir denetlenir', () => {
  assert.ok(sql.includes('alarm_tur is not distinct from new.kind'), 'aynı alarmda yeni mesaj yok');
  assert.match(sql, /cron\.schedule\('radio-sessiz-denetle', '\* \* \* \* \*'/);
  assert.ok(sql.includes("interval '3 minutes'") && sql.includes("interval '3 days'"));
  assert.match(sql, /revoke all on function public\.radio_sessiz_denetle\(\) from public, anon, authenticated/);
});
