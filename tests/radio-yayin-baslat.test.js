const test = require('node:test');
const assert = require('node:assert/strict');

const V = require('../radyo-panel-views.js');

const ANAHTAR = n => 'a1b2c3d4-e5f6-4a7b-8c9d-' + String(n).padStart(12, '0');
const simdi = Date.now();
const iso = ms => new Date(simdi + ms).toISOString();

// Marka genelinde bir klasör yayında; Nişantaşı şubesi kendi listesiyle ondan
// ayrılmış. Yayın başlatma ekranı bu iki durumu birlikte göstermeli.
const D = {
  brands: [
    { id: 'b1', name: 'Mokka Coffee', slug: 'mokka-coffee', access_code: 'K', is_active: true },
    { id: 'b2', name: 'Pasif Kahve', slug: 'pasif', access_code: 'K', is_active: false }
  ],
  folders: [{ id: 'f1', name: 'Öğleden Sonra', description: null, cover_path: null, shuffle: true }],
  tracks: [
    { id: 't0', folder_id: 'f1', title: 'Sabah Işığı', storage_path: 'f1/a.wav', sort_order: 0, duration_sec: 180, cover_path: null },
    { id: 't1', folder_id: 'f1', title: 'İkinci Parça', storage_path: 'f1/b.wav', sort_order: 1, duration_sec: 120, cover_path: null }
  ],
  players: [
    {
      id: 'p1', brand_id: 'b1', label: 'Alsancak', player_key: ANAHTAR(1), last_seen_at: iso(-30000),
      open_time: '09:00:00', close_time: '22:00:00', bound_device_id: null, bound_at: null,
      first_ip: null, last_ip: null, last_ip_at: null, is_playing: false
    },
    {
      id: 'p2', brand_id: 'b1', label: 'Karşıyaka', player_key: ANAHTAR(2), last_seen_at: null,
      open_time: null, close_time: null, bound_device_id: null, bound_at: null,
      first_ip: null, last_ip: null, last_ip_at: null, is_playing: false
    },
    {
      id: 'p9', brand_id: 'b2', label: 'Başka Marka Şubesi', player_key: ANAHTAR(9), last_seen_at: null,
      open_time: null, close_time: null, bound_device_id: null, bound_at: null,
      first_ip: null, last_ip: null, last_ip_at: null, is_playing: false
    }
  ],
  broadcast: [{ brand_id: 'b1', folder_id: 'f1', playlist_id: null, updated_at: iso(-600000) }],
  playerBroadcast: [{ player_id: 'p1', folder_id: null, playlist_id: 'l1', updated_at: iso(-300000) }],
  announcements: [],
  playlists: [{ id: 'l1', brand_id: 'b1', name: 'Sabah Akışı', description: null, cover_path: null, shuffle: false, created_at: iso(-600000) }],
  playlistTracks: [
    { id: 'x0', playlist_id: 'l1', track_id: 't0', sort_order: 0 },
    { id: 'x1', playlist_id: 'l1', track_id: 't1', sort_order: 1 }
  ],
  coffeeAttempts: [], subscriptions: [], plans: [], requests: []
};

const ui = {
  cover: p => p, ses: p => p, anons: p => p,
  playerBase: () => 'https://ornek.test/radyo.html?key=',
  brandUrl: s => 'https://ornek.test/coffee/' + s,
  accept: () => '.mp3,.wav', desteklenenler: () => 'mp3, wav', parcaNotu: () => '',
  now: () => simdi
};

const durum = yayin => ({
  nav: 'canli', sub: 'yayin', openFolder: null, openBrand: null, openPlaylist: null, q: '', yayin
});

test('yayın başlatma ekranı dört adımı sırayla sorar, eksik seçimde yayın başlatmaz', () => {
  const html = V.yayinView(durum({}), D, ui);

  ['1 · MARKA', '2 · ŞUBE', '3 · KAYNAK', '4 · BAŞLANGIÇ PARÇASI'].forEach(adim => {
    assert.ok(html.includes(adim), adim + ' sorusu ekranda olmalı');
  });
  assert.ok(html.includes('— bütün şubeler (marka geneli) —'), 'şube seçmeden marka geneli seçilebilmeli');
  assert.ok(html.includes('YAYINI BAŞLAT'), 'yayını başlatan düğme olmalı');
  assert.ok(html.includes('Önce markayı seçin.'), 'eksik seçim sessiz kalmamalı');
  // Marka seçilmeden alt adımlar kapalıdır: yanlış sırayla yayın kurulamasın.
  assert.match(html, /id="yayin-sube"[^>]*disabled/);
  assert.match(html, /id="yayin-kaynak"[^>]*disabled/);
});

test('marka seçilince yalnız o markanın şubeleri ve kaynakları gelir', () => {
  const html = V.yayinView(durum({ brandId: 'b1' }), D, ui);

  assert.ok(!/id="yayin-sube"[^>]*disabled/.test(html), 'marka seçilince şube adımı açılmalı');
  assert.ok(html.includes('Alsancak') && html.includes('Karşıyaka'), 'markanın şubeleri listelenmeli');
  assert.ok(!html.includes('Başka Marka Şubesi'), 'başka markanın şubesi listelenmemeli');
  assert.ok(html.includes('value="folder:f1"'), 'yayın klasörleri sunulmalı');
  assert.ok(html.includes('value="playlist:l1"'), 'markanın listeleri sunulmalı');
  assert.ok(html.includes('value="playlist:l1" selected') === false);
  assert.ok(html.includes('Yayın kaynağını (klasör ya da liste) seçin.'));
});

test('seçimler yapılınca özet ne çalacağını yazar', () => {
  const html = V.yayinView(durum({
    brandId: 'b1', playerId: 'p1', kaynak: 'folder:f1', parcaId: 't1'
  }), D, ui);

  assert.ok(html.includes('<b>Mokka Coffee</b> · Alsancak'), 'marka ve şube özette yazılmalı');
  assert.ok(html.includes('<b>Öğleden Sonra</b>'), 'kaynak özette yazılmalı');
  assert.ok(html.includes('“İkinci Parça” parçasından başlar'), 'başlangıç parçası özette yazılmalı');
  assert.ok(html.includes('value="t1" selected'), 'seçilen parça kutuda seçili gelmeli');
  assert.ok(html.includes('2 parça · yayın bu seçimle başlar'));
  assert.ok(!html.includes('Önce markayı seçin.'));
});

test('şube seçilmezse yayın marka geneline verilir ve baştan başlar', () => {
  const html = V.yayinView(durum({ brandId: 'b1', kaynak: 'playlist:l1' }), D, ui);

  assert.ok(html.includes('<b>Mokka Coffee</b> · bütün şubeler'));
  assert.ok(html.includes('<b>Sabah Akışı</b>'));
  assert.ok(html.includes('baştan başlar'), 'parça seçilmediyse baştan başlar');
});

test('mevcut durum tablosu marka genelini ve şubeye özel yayını ayırır', () => {
  const html = V.yayinView(durum({ brandId: 'b1' }), D, ui);

  assert.ok(html.includes('Öğleden Sonra'), 'marka geneli kaynağı görünmeli');
  assert.ok(html.includes('CANLI KLASÖR'), 'marka geneli canlı işareti olmalı');
  assert.ok(html.includes('ŞUBEYE ÖZEL'), 'genelden ayrılan şube işaretlenmeli');
  assert.ok(html.includes('data-act="branch-open" data-id="p1"'), 'şube satırına gidilebilmeli');
  assert.ok(html.includes('Pasif Kahve') && html.includes('YAYIN VERİLMEZ'), 'pasif marka yayın veremez');
});
