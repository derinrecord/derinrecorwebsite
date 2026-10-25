// Telegram gönderimi yeniden deneme (25 Ekim): 24 Ekim günlük özeti Telegram'a
// bağlanırken 8 sn'de zaman aşımına düştü ve hiç tekrar denenmedi.
// Artık süre 20 sn; gönderilemeyen her mesaj 5 dk'da bir, en çok 3 kez yeniden denenir.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const sql = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'telegram-tekrar.sql'), 'utf8').replace(/--[^\n]*/g, '');

test('gönderim süresi 20 sn ve her gönderim kayda geçer', () => {
  assert.match(sql, /timeout_milliseconds := 20000/);
  assert.match(sql, /create table if not exists public\.radio_telegram_gonderim/);
  assert.match(sql, /insert into public\.radio_telegram_gonderim \(istek_id, chat_id, metin\)/);
  assert.match(sql, /returns bigint/);
});

test('kayıt tablosu yalnız sunucu içi: istemciye kapalı', () => {
  assert.match(sql, /alter table public\.radio_telegram_gonderim enable row level security/);
  assert.match(sql, /revoke all on public\.radio_telegram_gonderim from anon, authenticated/);
  assert.doesNotMatch(sql, /create policy/i);
});

test('yeniden deneme: 200 almayanlar, en çok 3 kez, 5 dakikada bir', () => {
  assert.match(sql, /create or replace function public\.radio_telegram_tekrar_dene\(\)/);
  assert.match(sql, /r\.status_code is distinct from 200/);
  assert.match(sql, /g\.deneme < 3/);
  assert.match(sql, /cron\.schedule\('radio-telegram-tekrar', '\*\/5 \* \* \* \*'/);
  assert.match(sql, /revoke execute on function public\.radio_telegram_tekrar_dene\(\) from public, anon, authenticated/);
});

test('yanıt kaydı silinmiş eski istekler tekrar gönderilmez (yanlışlıkla iki kez gitmesin)', () => {
  assert.match(sql, /join net\._http_response r on r\.id = g\.istek_id/);
  assert.match(sql, /g\.created_at > now\(\) - interval '5 hours'/);
});
