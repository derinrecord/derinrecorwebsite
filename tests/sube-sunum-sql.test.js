// Şube sunum ekranının okuma fonksiyonları: yalnız okur, her fonksiyon aynı
// kapıdan geçer (abonelik, cihaz kilidi, şube kodu).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const sql = fs.readFileSync(require.resolve('../supabase/sube-sunum.sql'), 'utf8');
const kod = sql.replace(/--[^\n]*/g, '');

const govde = ad => {
  const bas = kod.indexOf('create or replace function public.' + ad + '(');
  assert.ok(bas >= 0, ad + ' tanımlı olmalı');
  const ac = kod.indexOf('$$', bas);
  const kapa = kod.indexOf('$$', ac + 2);
  return kod.slice(ac, kapa);
};

test('üç okuma fonksiyonu tanımlı ve aynı kapıdan geçer', () => {
  ['sube_sunum_marka', 'sube_sunum_liste', 'sube_sunum_kapak'].forEach(ad => {
    const g = govde(ad);
    assert.ok(g.includes('radio_cihaz_uygun(p_player_key, p_device_id)'), ad + ': cihaz kilidi');
    assert.ok(g.includes('abonelik_gecerli'), ad + ': abonelik');
    assert.ok(g.includes('b.is_active'), ad + ': marka aktif');
    assert.ok(g.includes('p.player_code is null or p.bound_device_id is not null'), ad + ': şube kodu kapısı');
    assert.match(kod, new RegExp('grant execute on function public\\.' + ad + '\\(uuid, text\\) to anon'));
  });
});

test('dosya veri ya da yapı değiştirmez', () => {
  assert.ok(!/\b(insert|update|delete)\b/i.test(kod), 'yazma yok');
  assert.ok(!/\b(alter table|drop table|create policy|drop policy|truncate)\b/i.test(kod), 'yapı değişikliği yok');
  assert.ok(!/drop function/i.test(kod), 'mevcut fonksiyon düşürülmez');
});

test('şubeye özel liste ataması varsa yalnız onlar gelir', () => {
  const g = govde('sube_sunum_liste');
  assert.ok(g.includes('player_playlists'));
  assert.ok(g.includes('not h.ozel or pp.playlist_id is not null'));
});
