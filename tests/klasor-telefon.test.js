// Yayın klasörleri tablosu telefonda kart olur: AÇ ve SİL düğmeleri yana
// kaydırmadan görünür, her bilginin başında küçük etiketi durur.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const V = require('../radyo-panel-views.js');

const D = {
  brands: [], players: [], broadcast: [{ brand_id: 'b1', folder_id: 'f1', playlist_id: null }],
  announcements: [], playlists: [], playlistTracks: [], coffeeAttempts: [], subscriptions: [], plans: [], requests: [],
  folders: [{ id: 'f1', name: 'Sabah Açılış', description: 'Yumuşak giriş', cover_path: null, shuffle: true }],
  tracks: [{ id: 't1', folder_id: 'f1', title: 'Parça', storage_path: 'f1/a.mp3', sort_order: 0, duration_sec: 120, cover_path: null }]
};
const ui = { cover: p => p, ses: p => p, anons: p => p, playerBase: () => '', brandUrl: s => s,
  accept: () => '.mp3', desteklenenler: () => 'mp3', parcaNotu: () => '', now: () => Date.now(), saglikSonuc: () => null };

test('klasör tablosu telefon kartı sınıfını ve etiketleri taşır', () => {
  const html = V.gorunum({ nav: 'icerik', sub: 'klasorler', openFolder: null, openBrand: null, openPlaylist: null, q: '' }, D, ui).html;
  assert.ok(html.includes('<table class="klasor-kart">'));
  for (const e of ['İçerik', 'Durum', 'Çalma']) assert.ok(html.includes(`data-etiket="${e}"`), e);
});

test('telefonda klasör tablosu yana kaymaz', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'radyo-panel.css'), 'utf8');
  assert.match(css, /table\.klasor-kart\{min-width:0\}/);
  assert.match(css, /\.klasor-kart thead\{display:none\}/);
  assert.match(css, /\.klasor-kart tbody tr\{display:grid/);
});
