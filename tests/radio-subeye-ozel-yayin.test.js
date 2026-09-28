const test = require('node:test');
const assert = require('node:assert/strict');

const V = require('../radyo-panel-views.js');

const ANAHTAR = n => 'a1b2c3d4-e5f6-4a7b-8c9d-' + String(n).padStart(12, '0');
const simdi = Date.now();
const iso = ms => new Date(simdi + ms).toISOString();

// Marka genel yayını bir klasör (Gece Kuşu); Nişantaşı şubesi kendisine liste
// atanmış olduğu için ondan ayrılır, Alsancak genel yayında kalır.
const D = {
  brands: [{ id: 'b1', name: 'Mokka Coffee', slug: 'mokka-coffee', access_code: 'KOD', is_active: true }],
  folders: [
    { id: 'f1', name: 'Sabah Açılış', description: null, cover_path: null, shuffle: true },
    { id: 'f2', name: 'Gece Kuşu', description: null, cover_path: null, shuffle: true }
  ],
  tracks: [
    { id: 't1', folder_id: 'f2', title: 'Gece Parçası', storage_path: 'f2/gece.mp3', sort_order: 0, duration_sec: 180, cover_path: null }
  ],
  players: [
    {
      id: 'p1', brand_id: 'b1', label: 'Nişantaşı', player_key: ANAHTAR(1), last_seen_at: iso(-30000),
      open_time: '09:00:00', close_time: '22:00:00', bound_device_id: null, bound_at: null,
      first_ip: null, last_ip: null, last_ip_at: null, is_playing: true,
      now_title: 'Akşam Parçası', now_at: iso(-20000), now_playlist_id: 'l1', now_playlist_name: 'Akşam Akışı'
    },
    {
      id: 'p2', brand_id: 'b1', label: 'Alsancak', player_key: ANAHTAR(2), last_seen_at: iso(-30000),
      open_time: '09:00:00', close_time: '22:00:00', bound_device_id: null, bound_at: null,
      first_ip: null, last_ip: null, last_ip_at: null, is_playing: true,
      now_title: 'Gece Parçası', now_at: iso(-20000), now_playlist_id: null, now_playlist_name: null
    }
  ],
  broadcast: [{ brand_id: 'b1', folder_id: 'f2', playlist_id: null, shuffle: true, updated_at: iso(-3 * 3600000) }],
  playerBroadcast: [{ player_id: 'p1', folder_id: null, playlist_id: 'l1', updated_at: iso(-3600000) }],
  announcements: [],
  playlists: [{ id: 'l1', brand_id: 'b1', name: 'Akşam Akışı', description: null, cover_path: null, shuffle: false, created_at: iso(-5 * 86400000) }],
  playlistTracks: [{ id: 'x1', playlist_id: 'l1', track_id: 't1', sort_order: 0 }],
  coffeeAttempts: [],
  subscriptions: [{
    id: 's1', brand_id: 'b1', plan_id: 'pl1', branch_count: 2, status: 'active',
    trial_ends_at: null, current_start: iso(-20 * 86400000), current_end: iso(10 * 86400000)
  }],
  plans: [{ id: 'pl1', name: 'Profesyonel', monthly_price: 1000, per_branch: true, sort_order: 1 }],
  requests: []
};

const ui = {
  cover: p => '/kapak/' + p,
  ses: p => '/ses/' + p,
  anons: p => '/anons/' + p,
  playerBase: () => 'https://ornek.test/radyo.html?key=',
  brandUrl: slug => 'https://ornek.test/coffee/' + slug,
  accept: () => '.mp3,.wav',
  desteklenenler: () => 'mp3, wav',
  parcaNotu: () => '45 MB üzeri parçalara bölünür',
  now: () => Date.now()
};

const durum = ek => Object.assign({ nav: 'canli', sub: 'subeler', openFolder: null, openBrand: null, openPlaylist: null, q: '' }, ek);

const secici = (html, id) => {
  const eslesme = html.match(new RegExp('<select id="' + id + '"[\\s\\S]*?</select>'));
  return eslesme ? eslesme[0] : '';
};

// Yayını başlatmanın tek yolu "Yayın başlat" ekranıdır; şube çekmecesi ikinci
// bir başlatma yolu olmamalı. Çekmece yalnız bu şubede ne çaldığını gösterir ve
// yöneticiyi o ekrana taşır.
test('şube çekmecesi yayını başlatmaz, durumu gösterip yayın ekranına yollar', () => {
  const html = V.subeCekmecesi('p1', D, ui);

  assert.ok(html.includes('CANLI YAYIN'), 'çekmecede canlı yayın bölümü olmalı');
  assert.equal(secici(html, 'marka-kaynak'), '', 'marka geneli seçicisi çekmecede olmamalı');
  assert.equal(secici(html, 'sube-kaynak'), '', 'şubeye özel seçici çekmecede olmamalı');
  assert.ok(!html.includes('data-act="live-source"'), 'çekmeceden marka geneli yazılmamalı');
  assert.ok(!html.includes('data-act="player-source"'), 'çekmeceden şube yayını yazılmamalı');

  assert.ok(html.includes('ŞUBEYE ÖZEL'), 'genelden ayrılan şube işaretlenmeli');
  assert.ok(html.includes('Akşam Akışı'), 'bu şubede çalan kaynak yazılmalı');
  assert.ok(html.includes('data-act="yayin-ac" data-id="p1"'),
    'çekmece yayın başlat ekranına geçiş düğmesi taşımalı');

  const genelSube = V.subeCekmecesi('p2', D, ui);
  assert.ok(genelSube.includes('MARKA GENELİ'), 'özel kaynağı olmayan şube genel yayında görünmeli');
  assert.ok(genelSube.includes('Gece Kuşu'), 'genel yayındaki şube markanın kaynağını göstermeli');
});

test('canlı durumda her şube kendi yürürlükteki kaynağını gösterir', () => {
  const { html } = V.gorunum(durum({}), D, ui);

  assert.ok(html.includes('Akşam Akışı'), 'özel yayınlı şube kendi listesini göstermeli');
  assert.ok(html.includes('Gece Kuşu'), 'genel yayındaki şube markanın kaynağını göstermeli');
});

test('özel yayın, personelin liste seçimi uyarısını yanlış tetiklemez', () => {
  // Cihaz, kendisine atanan listenin aynısını bildiriyor: "farklı liste" demek
  // yanlış olurdu, çünkü şubenin atanmış kaynağı zaten o.
  const { html } = V.gorunum(durum({}), D, ui);
  assert.ok(!html.includes('FARKLI LİSTE'), 'aynı liste farklı liste diye yazılmamalı');
  assert.ok(V.subeCekmecesi('p1', D, ui).includes('Akşam Akışı'));
  assert.ok(!V.subeCekmecesi('p1', D, ui).includes('başka bir liste seçmiş'));
});

test('yayın sağlığı şube özel kaynağını yeterli sayar', () => {
  // Marka genelinde kaynak yok ama şubenin kendi kaynağı var: şube yayında.
  const markasiz = Object.assign({}, D, { broadcast: [] });
  const p1 = markasiz.players.find(p => p.id === 'p1');
  const p2 = markasiz.players.find(p => p.id === 'p2');

  const ozelTani = V.saglikTani(p1, markasiz, simdi);
  assert.ok(!ozelTani.sorunlar.some(s => s.includes('Canlı yayın kaydı yok')), 'özel kaynağı olan şube kopuk sayılmamalı');
  assert.equal(ozelTani.kaynak.ad, 'Akşam Akışı');

  const genelTani = V.saglikTani(p2, markasiz, simdi);
  assert.ok(genelTani.sorunlar.some(s => s.includes('Canlı yayın kaydı yok')), 'kaynaksız şube kopuk sayılmalı');
});

test('marka sayfası özel yayınlı şubeyi işaretler ve listeyi kullanımda sayar', () => {
  const { html } = V.gorunum(durum({ nav: 'musteri', sub: 'markalar', openBrand: 'b1' }), D, ui);

  assert.ok(html.includes('ÖZEL YAYIN'), 'şube satırında özel yayın işareti olmalı');
  assert.ok(html.includes('özel yayın: <b>Akşam Akışı</b>'), 'hangi kaynağın çaldığı yazılmalı');
  assert.ok(/data-act="list-open" data-id="l1"[\s\S]{0,700}YAYINDA/.test(html),
    'yalnız şubeye özel verilen liste de marka sayfasında yayında sayılmalı');

  const listeler = V.gorunum(durum({ nav: 'musteri', sub: 'listeler' }), D, ui).html;
  assert.ok(listeler.includes('1 ŞUBEDE'), 'liste ekranı kaç şubede çaldığını saymalı');
});
