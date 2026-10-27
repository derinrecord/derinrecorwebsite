// Geçmişi temizle (27 Ekim): deneme markaları silinince sahipsiz kalan
// geçmiş (olay/alarm/kod) panelden silinebilir. Önce sayar, onayda yazar.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const oku = d => fs.readFileSync(path.join(__dirname, '..', d), 'utf8');

test('SQL: yalnız yönetici; sayma ve silme; RLS politikasına dokunmaz', () => {
  const sql = oku('supabase/radyo-gecmis-temizle.sql');
  assert.match(sql, /create or replace function public\.radyo_gecmis_temizle\(p_hedef text, p_turler text\[\], p_sil boolean default false\)/);
  assert.match(sql, /if not public\.is_admin\(\) then\s+raise exception/);
  assert.match(sql, /revoke execute on function public\.radyo_gecmis_temizle\(text, text\[\], boolean\) from public, anon;/);
  for (const t of ['radio_player_events', 'radio_alarm_kayit', 'coffee_access_attempts']) assert.ok(sql.includes('delete from public.' + t), t);
  assert.doesNotMatch(sql, /create policy|drop policy|alter policy|alter table/i);
  assert.doesNotMatch(sql, /delete from public\.(brands|brand_players|radio_tracks)/);
});

test('geçmiş ekranında temizle bölümü: silinmiş markalar, markalar, tümü; üç tür', () => {
  const src = oku('radyo-panel-views.js');
  assert.match(src, /\$\{gecmisTemizleBolum\(state, D\)\}/);
  assert.match(src, /<option value="silinmis">Silinmiş markalar/);
  assert.match(src, /<option value="hepsi">Tüm markalar<\/option>/);
  assert.match(src, /D\.brands\.map\(b => `<option value="\$\{esc\(b\.id\)\}">\$\{esc\(b\.name\)\}<\/option>`\)/);
  for (const t of ['olay', 'alarm', 'kod']) assert.match(src, new RegExp(`tur\\('${t}'`));
});

test('panel önce sayar, onay sorar, sonra siler', () => {
  const src = oku('radyo-yonetim.js');
  const bas = src.indexOf("case 'gecmis-temizle'");
  const blok = src.slice(bas, src.indexOf("case 'yayin-basla'", bas));
  assert.ok(bas > 0);
  const say = blok.indexOf('p_sil: false'), onay = blok.indexOf('onaySor('), sil = blok.indexOf('p_sil: true');
  assert.ok(say > 0 && onay > say && sil > onay, 'sıra: say → onay → sil');
  assert.match(blok, /kullanici\.adminMi/);
});

test('sürümler artırıldı', () => {
  const h = oku('radyo-yonetim.html');
  assert.match(h, /radyo-panel-views\.js\?v=99/);
  assert.match(h, /radyo-yonetim\.js\?v=20261027a/);
});
