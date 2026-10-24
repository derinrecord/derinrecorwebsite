// Antrenör Projelerim'de not yazınca Telegram'a bildirim (24 Ekim).
// Mevcut şube alarmı altyapısını (radio_bildirim_ayari + radio_telegram_gonder)
// kullanır; izin (RLS) değiştirmez, site koduna dokunmaz.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const sql = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'antrenor-notu-telegram.sql'), 'utf8').replace(/--[^\n]*/g, '');
const fn = (sql.match(/create or replace function public\.proje_notu_bildir\(\)[\s\S]*?\$\$;/) || [''])[0];

test('not yazıldığı anda çalışan tetikleyici kurulur', () => {
  assert.ok(fn, 'proje_notu_bildir fonksiyonu olmalı');
  assert.match(sql, /create trigger proje_notu_bildir_tetik\s+after insert on public\.project_feedback\s+for each row execute function public\.proje_notu_bildir\(\)/);
  assert.match(fn, /security definer/);
});

test('yalnız antrenör notu: sistem mesajı ve yönetici notu bildirim göndermez', () => {
  assert.match(fn, /if new\.kind is distinct from 'note' then\s+return new;/);
  assert.match(fn, /select p\.role::text, p\.full_name into v_rol, v_ad from public\.profiles p where p\.id = new\.author_id/);
  assert.match(fn, /if v_rol = 'admin' then\s+return new;/);
});

test('mevcut Telegram ayarını ve gönderim yardımcısını kullanır; ayar kapalıysa susar', () => {
  assert.match(fn, /from public\.radio_bildirim_ayari where id = 1/);
  assert.match(fn, /not v_ayar\.acik/);
  assert.match(fn, /public\.radio_telegram_gonder\(v_ayar\.token, v_ayar\.chat_id, v_metin\)/);
});

test('mesaj: antrenör, proje, parça, zaman, not ya da sesli not, bağlantı', () => {
  assert.match(fn, /ANTRENÖR NOTU/);
  assert.match(fn, /v_proje/);
  assert.match(fn, /v_parca/);
  assert.match(fn, /new\.start_sec/);
  assert.match(fn, /Sesli not bıraktı/);
  assert.match(fn, /left\(btrim\(coalesce\(new\.body, ''\)\), 300\)/);
  assert.match(fn, /derinrecord\.com\/my-projects\.html/);
  assert.match(fn, /Europe\/Istanbul/);
});

test('bildirim hatası not kaydını asla engellemez', () => {
  assert.match(fn, /exception when others then\s+return new;/);
});

test('izin (politika) değiştirmez', () => {
  assert.ok(!/policy/i.test(sql));
  assert.ok(!/grant|revoke all/i.test(sql.replace(/revoke execute on function public\.proje_notu_bildir\(\)[^;]*;/, '')));
});
