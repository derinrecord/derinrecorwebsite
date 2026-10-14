// 2026-10-14: Sohbet sitede gizlendi (Derin'in isteği), veriler silinmedi.
// Müzik Araştır istekleri artık yöneticinin BİLDİRİMLER sayfasında onaylanır.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const KOK = path.join(__dirname, '..');
const oku = y => fs.readFileSync(path.join(KOK, y), 'utf8');

test('hesap menüsünde SOHBET bağlantısı yok', () => {
  const auth = oku('auth.js');
  assert.ok(!auth.includes('href="chat.html"'), 'menüde chat.html olmamalı');
  assert.ok(!/>SOHBET</.test(auth), 'menüde SOHBET yazısı olmamalı');
});

test('BİLDİRİMLER yalnız yönetici menüsünde', () => {
  const auth = oku('auth.js');
  const satir = auth.split('\n').find(s => s.includes("account-menu-links').innerHTML"));
  const [yonetici, antrenor] = satir.split("' : '");
  assert.ok(yonetici.includes('href="bildirimler.html"'), 'yönetici menüsünde olmalı');
  assert.ok(!antrenor.includes('bildirimler.html'), 'antrenör menüsünde olmamalı');
});

test('sohbet sayfası ana sayfaya yönlenir ama dosyalar silinmedi', () => {
  const chat = oku('chat.html');
  assert.ok(chat.includes("location.replace('index.html')"));
  ['chat.js', 'chat-crypto.js', 'chat.css', 'supabase/sohbet.sql'].forEach(d =>
    assert.ok(fs.existsSync(path.join(KOK, d)), d + ' durmalı'));
});

test('hiçbir site sayfası sohbete bağlantı vermez', () => {
  fs.readdirSync(KOK).filter(d => d.endsWith('.html') && d !== 'chat.html').forEach(d =>
    assert.ok(!oku(d).includes('href="chat.html"'), d + ' → chat.html bağlantısı olmamalı'));
});

test('bildirimler sayfası yönetici kontrolü yapar ve isteği onaylar', () => {
  const js = oku('bildirimler.js');
  assert.ok(js.includes("profile?.role !== 'admin'"), 'yönetici kontrolü olmalı');
  assert.ok(js.includes("from('music_projects').insert"), 'onay proje oluşturmalı');
  assert.ok(js.includes('research_project_id: proj.data.id'), 'istek onaylandı diye işaretlenmeli');
  assert.ok(js.includes('escapeHtml'), 'kullanıcı verisi kaçırılmalı');
  assert.ok(!/\.delete\(/.test(js), 'bildirimler sayfası hiçbir şey silmemeli');
  const html = oku('bildirimler.html');
  assert.ok(html.includes('bildirimler.js') && html.includes('auth.js'));
});

test('müzik isteği sayfası artık sohbetten bahsetmez', () => {
  const js = oku('music-request-page.js');
  assert.ok(!js.includes('Derin sohbette'), 'kullanıcıya sohbet yazısı gösterilmemeli');
});

test('bildirim kartı parça linkini yalnız http(s) ise basar', () => {
  const js = oku('bildirimler.js');
  assert.ok(js.includes('guvenliLink'), 'javascript: gibi bağlantılar engellenmeli');
});
