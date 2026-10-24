// Yeni kayıt → Telegram (24 Ekim): biri hesap açınca Derin'e mesaj gider.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const sql = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'kayit-telegram.sql'), 'utf8').replace(/--[^\n]*/g, '');

test('profil satırı açılınca tetiklenir; kaydı asla engellemez', () => {
  assert.match(sql, /create trigger yeni_kayit_bildir_tetik\s+after insert on public\.profiles/);
  assert.match(sql, /exception when others then\s+return new;/);
  assert.match(sql, /security definer/);
  assert.match(sql, /revoke execute on function public\.yeni_kayit_bildir\(\) from public, anon, authenticated/);
});

test('mevcut Telegram ayarını kullanır, kapalıysa göndermez; yönetici kaydı bildirilmez', () => {
  assert.match(sql, /from public\.radio_bildirim_ayari where id = 1/);
  assert.match(sql, /not v_ayar\.acik/);
  assert.match(sql, /new\.role::text = 'admin'/);
  assert.match(sql, /public\.radio_telegram_gonder\(v_ayar\.token, v_ayar\.chat_id, v_metin\)/);
});

test('mesaj: başlık, ad, e-posta, telefon, kullanıcılar bağlantısı, İstanbul saati', () => {
  assert.match(sql, /YENİ KAYIT/);
  assert.match(sql, /from auth\.users u where u\.id = new\.id/);
  assert.match(sql, /derinrecord\.com\/kullanicilar\.html/);
  assert.match(sql, /at time zone 'Europe\/Istanbul'/);
});

test('hiçbir izin kuralı değişmez', () => {
  assert.doesNotMatch(sql, /(create|alter|drop) policy/i);
});
