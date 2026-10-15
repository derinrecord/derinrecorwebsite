// Alarm düzeni: toplu alarm, sorun sürerse alarm, şube başına sınır, test markası, günlük özet.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const sql = fs.readFileSync(require.resolve('../supabase/radio-alarm-duzeni.sql'), 'utf8').replace(/--[^\n]*/g, '');
const govde = ad => {
  const i = sql.indexOf('create or replace function public.' + ad + '(');
  assert.ok(i >= 0, ad + ' tanımlı olmalı');
  return sql.slice(i, sql.indexOf('end $$;', i));
};

test('tetikleyici Telegram\'a doğrudan yazmaz; gönderim dakikalık görevde', () => {
  assert.ok(!govde('radio_alarm_isle').includes('radio_telegram_gonder'));
  assert.match(sql, /select public\.radio_sessiz_denetle\(\); select public\.radio_alarm_gonder\(\);/);
});

test('sorun 3 dk sürerse alarm, 3+ şubede toplu mesaj, şube başına sınır yok', () => {
  const g = govde('radio_alarm_gonder');
  assert.ok(g.includes("p.alarm_at <= now() - interval '3 minutes'"));
  assert.ok(g.includes('array_length(v_liste, 1) >= 3'), 'toplu alarm');
  assert.ok(!g.includes('v_sayi') && !g.includes('SIK KOPAN') && !g.includes('alarm_sessiz_kadar'), 'şube başına sınır ve sessize alma yok');
});

test('düzeldi mesajı yalnız bildirilmiş ve 5 dk+ süren sorun için; günlük özet gece', () => {
  const t = govde('radio_alarm_isle');
  assert.ok(t.includes('v_sube.alarm_bildirildi and v_dk >= 5'));
  assert.match(sql, /cron\.schedule\('radio-gunluk-ozet', '10 21 \* \* \*'/);
});

test('test markası seçeneği yok (Derin istemedi)', () => {
  assert.ok(!/brands\s+add column if not exists test|b\.test|r\.test/.test(sql));
});

test('erişim alarmına, radio_ping\'e ve politikalara dokunmaz', () => {
  assert.ok(!/radio_bildirim_gonder|radio_bildirim_tetik|radio_ping|create policy|drop policy/i.test(sql));
  assert.match(sql, /alter table public\.radio_alarm_kayit enable row level security/);
});

test('panel alarm düzeni kurulumunu alarm_bildirildi sütunundan anlar', () => {
  const y = fs.readFileSync(require.resolve('../radyo-yonetim.js'), 'utf8');
  assert.match(y, /select\('alarm_bildirildi'\)\.limit\(1\)/);
  assert.match(y, /D\.kurulum\['radio-alarm-duzeni\.sql'\] = !duzen\.error/);
});
