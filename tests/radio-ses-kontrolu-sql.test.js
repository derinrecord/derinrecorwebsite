// Ses kontrolü SQL'i: yalnız sütun ekler ve kilitli cihazın yazdığı tek fonksiyonu kurar.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const sql = fs.readFileSync(require.resolve('../supabase/radio-ses-kontrolu.sql'), 'utf8').replace(/--[^\n]*/g, '');

test('ses kontrolü SQL dosyası yalnız sütun ve tek yazma fonksiyonu ekler', () => {
  assert.match(sql, /add column if not exists ses_seviyesi/);
  assert.match(sql, /create or replace function public\.radio_ses_bildir/);
  assert.ok(sql.includes('radio_cihaz_uygun(p_player_key, p_device_id)'), 'yalnız kilitli cihaz yazar');
  assert.ok(!/policy|drop table|delete from|radio_ping/i.test(sql), 'RLS, radio_ping ve veri silme yok');
  assert.match(sql, /grant execute on function public\.radio_ses_bildir\(uuid, text, integer, boolean\) to anon/);
});
