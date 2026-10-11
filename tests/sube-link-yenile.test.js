const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const V = require('../radyo-panel-views.js');

const ANAHTAR = n => 'a1b2c3d4-e5f6-4a7b-8c9d-' + String(n).padStart(12, '0');
const ui = {
  cover: p => '/kapak/' + p, ses: p => '/ses/' + p, anons: p => '/anons/' + p,
  playerBase: () => 'https://ornek.test/radyo.html?key=',
  brandUrl: slug => 'https://ornek.test/coffee/' + slug,
  accept: () => '.mp3', desteklenenler: () => 'mp3', parcaNotu: () => '',
  now: () => Date.now()
};
const sube = ek => Object.assign({
  id: 'p1', brand_id: 'b1', label: 'Nişantaşı', player_key: ANAHTAR(1),
  player_code: null, bound_device_id: null, bound_at: null, is_playing: false, last_seen_at: null
}, ek);
const veri = p => ({
  brands: [{ id: 'b1', name: 'Mokka', slug: 'mokka', access_code: 'K', is_active: true }],
  folders: [], tracks: [], players: [p], broadcast: [], announcements: [],
  playlists: [], playlistTracks: [], coffeeAttempts: [], subscriptions: [], plans: [], requests: []
});

test('şube çekmecesinde YENİ LİNK ÜRET düğmesi her zaman var', () => {
  for (const p of [sube({}), sube({ bound_device_id: 'cihaz-1', bound_at: new Date().toISOString() })]) {
    const html = V.subeCekmecesi('p1', veri(p), ui);
    assert.ok(html.includes('data-act="player-link-yenile"'));
    assert.ok(html.includes('YENİ LİNK ÜRET'));
  }
});

test('kod düğmesinin adı YENİ KOD ÜRET', () => {
  const html = V.subeCekmecesi('p1', veri(sube({ player_code: 'K7M2-4QPD' })), ui);
  assert.ok(html.includes('YENİ KOD ÜRET'));
  assert.ok(!html.includes('KODU YENİLE'));
});

test('yeni link kilidi de sıfırlar', () => {
  assert.deepEqual(V.linkYenileAlanlari('u-1'), {
    player_key: 'u-1', bound_device_id: null, bound_at: null,
    first_ip: null, last_ip: null, last_ip_at: null
  });
});

test('yönetim yeni link vakasını yazar', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'radyo-yonetim.js'), 'utf8');
  assert.ok(src.includes("case 'player-link-yenile'"));
  assert.ok(src.includes('V.linkYenileAlanlari(crypto.randomUUID())'));
});
