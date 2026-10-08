const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const V = require('../radyo-panel-views.js');
const yonetim = fs.readFileSync(require.resolve('../radyo-yonetim.js'), 'utf8');
const sql = fs.readFileSync(require.resolve('../supabase/radio-telegram.sql'), 'utf8');

// Şube alarmı panelde görünüyordu ama panel kapalıyken kimse haber almıyordu.
// Bu dosya iki katmanı birden korur:
//   * panel → sunucudaki yönetici fonksiyonları (token nereden giriliyor)
//   * SQL → olay tetikleyicisi, gürültü kontrolü ve sırrın sınırları
// İkisi ayrı ayrı bozulabilir: ekran çizilir ama mesaj gitmez, ya da tam tersi.

test('panel Telegram ayarını sunucudaki yönetici fonksiyonlarına bağlar', () => {
  ['tg-kaydet', 'tg-sohbet', 'tg-test', 'tg-ac'].forEach(act =>
    assert.ok(yonetim.includes("'" + act + "'"), act + ' işi dinlenmeli'));

  ['radio_telegram_durum', 'radio_telegram_kaydet', 'radio_telegram_sohbet_bul',
    'radio_telegram_test', 'radio_telegram_ac'].forEach(fn =>
    assert.ok(yonetim.includes("'" + fn + "'"), fn + ' çağrılmalı'));

  assert.ok(yonetim.includes('[data-tg-token]'), 'token alanı kabloya bağlanmalı');
  assert.ok(yonetim.includes("D.kurulum['radio-telegram.sql']"), 'kurulum durumu yoklanmalı');
  assert.ok(V.KURULUM.some(x => x.anahtar === 'radio-telegram.sql'));
});

// Sır tarayıcıda ya da kodda durmaz: token yalnız kullanıcının yazdığı anda
// sunucuya gider, veritabanında kalır.
test('bot tokenı tarayıcıda saklanmaz, koda gömülmez', () => {
  assert.ok(!/localStorage[^\n]*token/i.test(yonetim), 'token tarayıcı deposuna yazılmamalı');
  assert.ok(!/[0-9]{8,}:[A-Za-z0-9_-]{30,}/.test(yonetim), 'koda token gömülmemeli');
  assert.ok(!/[0-9]{8,}:[A-Za-z0-9_-]{30,}/.test(sql), 'depodaki SQL gerçek token taşımamalı');
});

test('ayar tablosu dışarı kapalı, gönderim yardımcısı istemciye açık değil', () => {
  assert.match(sql, /alter table public\.radio_bildirim_ayari enable row level security/);
  assert.match(sql, /revoke all on public\.radio_bildirim_ayari from anon, authenticated/);
  // Yardımcı fonksiyon token'ı parametre olarak alır: açık kalsa herkes onu
  // kullanıp rastgele botlara mesaj atabilirdi.
  assert.match(sql, /revoke execute on function public\.radio_telegram_gonder/);
  assert.ok(!/create policy/i.test(sql), 'tabloyu açan bir politika yazılmamalı');
});

// Yalnız erişim denemeleri haber verir ve aynı şube aralık dolmadan mesaj almaz.
test('SQL yalnız erişim denemelerini yollar ve gürültüyü keser', () => {
  assert.match(sql, /if new\.kind not in \('kod-denemesi', 'paylasim-girisimi'\) then/);
  assert.match(sql, /after insert on public\.radio_player_events/);
  assert.ok(sql.includes('son_bildirim_at'), 'şube bazında son gönderim tutulmalı');
  assert.match(sql, /make_interval\(mins => v_ayar\.aralik_dk\)/, 'aralık ayarı uygulanmalı');
  assert.ok(sql.includes("'/sendMessage'"), 'Telegram sendMessage ucuna gidilmeli');
  // Ayar eksikse tetikleyici sessizce çıkar: kayıt yazılır, mesaj denenmez.
  assert.match(sql, /coalesce\(v_ayar\.token, ''\) = ''/);
});

// Bir kez yaşandı: durum fonksiyonu yanıt satırını `record` değişkende
// tutuyordu ve hiç mesaj gönderilmemişken (son_istek_id null) alanına
// dokunmak Postgres'te 55000 hatası veriyordu — panel bunu 500 olarak görüp
// "kurulum eksik" diyordu. Değişkenler tek tek tutulmalı.
test('durum fonksiyonu atanmamış record okumaz', () => {
  const blok = sql.slice(
    sql.indexOf('function public.radio_telegram_durum'),
    sql.indexOf('function public.radio_telegram_test'));
  assert.ok(blok.length > 100, 'durum fonksiyonu bulunmalı');
  assert.ok(!/v_yanit\s+record/.test(blok), 'record değişkeni kullanılmamalı');
  assert.match(blok, /v_yanit_var\s+boolean\s*:=\s*false/, 'yanıt var/yok bayrağı olmalı');
  assert.match(blok, /v_yanit_var\s*:=\s*found/, 'satır bulunamazsa bayrak düşmeli');
});

test('yönetici fonksiyonlarının hepsi is_admin ile korunur', () => {
  const kapilar = (sql.match(/if not public\.is_admin\(\) then/g) || []).length;
  const fonksiyonlar = (sql.match(/create or replace function public\.radio_telegram_\w+\(/g) || []).length;
  // radio_telegram_gonder istemcinin çağıramadığı iç yardımcıdır (revoke edilir),
  // bu yüzden kapı sayısı bir eksik olur.
  assert.ok(fonksiyonlar >= 5, 'beş yönetici fonksiyonu tanımlanmalı');
  assert.equal(kapilar, fonksiyonlar - 1, 'her istemci fonksiyonu is_admin ile korunmalı');
});
