// Bağlantı geçmişi ekranı telefonda: tablolar 840px genişlikte kalıp panel
// yana kaydırıldığı için "ŞU AN" ve "OLAY" sütunları ekranın dışında
// kalıyordu (asıl bilgi görünmüyordu). Bu iki tablo telefonda kart olur.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const V = require('../radyo-panel-views.js');

const D = {
  brands: [{ id: 'b1', name: 'Mokka Coffee', slug: 'mokka', access_code: 'KOD', is_active: true }],
  folders: [], tracks: [], broadcast: [], announcements: [], playlists: [], playlistTracks: [],
  subscriptions: [], plans: [], requests: [],
  players: [{ id: 'p1', brand_id: 'b1', label: 'Nişantaşı', player_key: 'k', last_seen_at: new Date().toISOString(), is_playing: true }],
  coffeeAttempts: [{ id: 'a1', brand_id: 'b1', slug: 'mokka', success: true, ip: '1.1.1.1', created_at: new Date().toISOString() }]
};
const ui = { cover: p => p, ses: p => p, anons: p => p, playerBase: () => '', brandUrl: s => s,
  accept: () => '', desteklenenler: () => '', parcaNotu: () => '', now: () => Date.now() };
const html = V.gorunum({ nav: 'canli', sub: 'gecmis', openFolder: null, openBrand: null, openPlaylist: null, q: '' }, D, ui).html;

test('ŞU AN ve bağlantı geçmişi tabloları telefonda kart olabilecek sınıfı taşır', () => {
  const say = (html.match(/<table class="gecmis-kart">/g) || []).length;
  assert.equal(say, 2);
});

test('kart hücreleri sütun adını etiket olarak taşır', () => {
  ['Şu an', 'Son durma', 'Son bağlantı', 'Olay', 'Taraf', 'Zaman'].forEach(e =>
    assert.ok(html.includes(`data-etiket="${e}"`), e));
});

test('telefonda kart tablo yana kaydırma istemez', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'radyo-panel.css'), 'utf8');
  assert.match(css, /table\.gecmis-kart\{min-width:0\}/);
  assert.match(css, /\.gecmis-kart thead\{display:none\}/);
  assert.match(css, /\.gecmis-kart td\[data-etiket\]::before/);
});
