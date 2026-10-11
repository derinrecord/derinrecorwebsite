// Marka bazlı sunum linki (/coffee/<slug> + erişim kodu) emekliye ayrıldı;
// her şube kendi linkini (/coffee/s/<uuid>) kullanır.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const V = require('../radyo-panel-views.js');
const yonetim = fs.readFileSync(require.resolve('../radyo-yonetim.js'), 'utf8');
const sayfa = fs.readFileSync(require.resolve('../coffee-marka.html'), 'utf8');

const D = {
  brands: [{ id: 'b1', name: 'Mokka Coffee', slug: 'mokka-coffee', access_code: 'KOD', is_active: true }],
  folders: [], tracks: [], players: [], broadcast: [], announcements: [],
  playlists: [], playlistTracks: [], coffeeAttempts: [], subscriptions: [], plans: [], requests: [],
  kurulum: { 'marka-kapagi.sql': true }
};
const ui = {
  cover: p => '/kapak/' + p, ses: p => '/ses/' + p, anons: p => '/anons/' + p,
  playerBase: () => 'https://ornek.test/coffee/s/',
  accept: () => '.mp3', desteklenenler: () => 'mp3', parcaNotu: () => '',
  now: () => Date.now(), saglikSonuc: () => null
};

test('marka çekmecesinde sunum linki bölümü yok', () => {
  const durum = { nav: 'musteri', sub: 'markalar', openBrand: 'b1' };
  const html = V.gorunum(durum, D, ui).html;
  assert.ok(html.includes('MARKA KAPAĞI'), 'görünüm gerçekten marka ayrıntısını çizmeli');
  assert.ok(!html.includes('MÜŞTERİ SUNUMU — LİNK VE ERİŞİM KODU'));
  assert.ok(!html.includes('brand-slug'));
  assert.ok(!html.includes('brand-code'));
});

test('yönetim betiği marka link/kod işlemlerini taşımaz', () => {
  assert.ok(!yonetim.includes("case 'brand-slug-set'"));
  assert.ok(!yonetim.includes("case 'brand-code-set'"));
  assert.ok(!yonetim.includes('brandUrl'));
});

test('eski marka linki katalog okumaz', () => {
  assert.ok(!/coffee-marka\.js/.test(sayfa), 'coffee-marka.js yüklenmemeli');
  assert.ok(!/supabase/i.test(sayfa), 'supabase betiği yüklenmemeli');
  assert.ok(!/config\.js/.test(sayfa), 'config.js yüklenmemeli');
  assert.ok(sayfa.includes('Bu link artık kullanılmıyor.'));
  assert.ok(sayfa.includes('Şubenize iletilen linki kullanın; yoksa Derin Record ile iletişime geçin.'));
  assert.match(sayfa, /<meta name="robots" content="noindex,nofollow">/);
});
