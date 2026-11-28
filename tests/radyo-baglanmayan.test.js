// 28 Kasım 2026: 12+ saattir bağlanmayan şube takipten düşmez, turuncu şeritte durur.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const V = require('../radyo-panel-views.js');

const simdi = Date.parse('2026-11-28T10:00:00Z');
const ui = { now: () => simdi };
const gunOnce = g => new Date(simdi - g * 86400000).toISOString();

test('12+ saattir bağlanmayan kurulu şube turuncu şeritte görünür', () => {
  const D = { brands: [{ id: 'b1', name: 'Mokka', is_active: true }],
    players: [{ id: 'p1', brand_id: 'b1', label: 'Selçuk', bound_device_id: 'c1', last_seen_at: gunOnce(5) }] };
  const h = V.uyariSeridi(D, ui);
  assert.ok(h.includes('uyari-serit baglanmayan'));
  assert.ok(h.includes('12+ SAATTİR BAĞLANMIYOR'));
  assert.ok(h.includes('Selçuk 5 gündür bağlanmıyor'));
  assert.ok(!h.includes('YAYIN DURDU'), 'aynı şube kırmızı şeritte tekrar edilmez');
  const D2 = { brands: D.brands, players: [{ ...D.players[0], last_seen_at: new Date(simdi - 14 * 3600000).toISOString() }] };
  assert.ok(V.uyariSeridi(D2, ui).includes('Selçuk 14 saattir bağlanmıyor'), '48 saatten kısa süre saatle yazılır');
});

test('durdurulmuş marka, kurulmamış ya da yeni görülen şube girmez', () => {
  const D = { brands: [{ id: 'b1', is_active: false }, { id: 'b2', is_active: true }],
    players: [
      { id: 'p1', brand_id: 'b1', label: 'Pasif', bound_device_id: 'c1', last_seen_at: gunOnce(9) },
      { id: 'p2', brand_id: 'b2', label: 'Kurulmamış', bound_device_id: null, last_seen_at: gunOnce(9) },
      { id: 'p3', brand_id: 'b2', label: 'Yeni', bound_device_id: 'c3', last_seen_at: gunOnce(0.3) }] };
  assert.ok(!V.uyariSeridi(D, ui).includes('BAĞLANMIYOR'));
});

test('haftalık Telegram hatırlatması: aktif marka, kurulu cihaz, 12 saat; Pazartesi 09:00', () => {
  const sql = fs.readFileSync(require.resolve('../supabase/radio-baglanmayan-sube.sql'), 'utf8');
  assert.match(sql, /where b\.is_active/);
  assert.match(sql, /p\.bound_device_id is not null/);
  assert.match(sql, /p\.last_seen_at <= now\(\) - interval '12 hours'/);
  assert.match(sql, /'radio-baglanmayan-hatirlat', '0 6 \* \* 1'/);
  assert.match(sql, /revoke all on function public\.radio_baglanmayan_hatirlat\(\) from public, anon, authenticated/);
});
