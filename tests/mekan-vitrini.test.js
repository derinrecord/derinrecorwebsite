const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const oku = d => fs.readFileSync(path.join(__dirname, '..', d), 'utf8');
const MV = require('../mekan-vitrini-yardim.js');

const L = (tur, ad, sira = 0, extra = {}) => Object.assign({ id: ad, tur, ad, sira, baslangic: '07:00', bitis: '12:00', parcalar: [{ ad: 'a', yol: 'x.mp3' }] }, extra);

test('grupla: dört mekân türü sabit sırada; boş tür boş liste; parçasız liste görünmez', () => {
  const g = MV.grupla([L('otel', 'Lobi'), L('kafe', 'Sabah'), L('kafe', 'Öğle', 1), L('kafe', 'Boş', 2, { parcalar: [] }), L('bilinmez', 'X')]);
  assert.deepEqual(Object.keys(g), ['kafe', 'restoran', 'otel', 'magaza']);
  assert.deepEqual(g.kafe.map(l => l.ad), ['Sabah', 'Öğle']);
  assert.equal(g.restoran.length, 0);
  assert.equal(g.otel.length, 1);
});

test('ilkDolu: liste olan ilk mekân türü seçilir', () => {
  assert.equal(MV.ilkDolu(MV.grupla([L('otel', 'Lobi')])), 'otel');
  assert.equal(MV.ilkDolu(MV.grupla([])), null);
});

test('saatYazi', () => {
  assert.equal(MV.saatYazi({ baslangic: '07:00', bitis: '12:00' }), '07:00–12:00');
  assert.equal(MV.saatYazi({ baslangic: null, bitis: null }), 'TÜM GÜN');
});

test('tepeler: ses örneklerinden 0–100 arası, en yüksek 100, en düşük 4', () => {
  const n = 1000, a = new Float32Array(n);
  for (let i = 0; i < n; i++) a[i] = (i < 500 ? 0.1 : 0.8) * Math.sin(i);
  const t = MV.tepeler([a], 20);
  assert.equal(t.length, 20);
  assert.equal(Math.max(...t), 100);
  assert.ok(Math.min(...t) >= 4);
  assert.ok(t[2] < t[15], 'sessiz bölüm alçak, yüksek bölüm yüksek');
  assert.deepEqual(MV.tepeler([new Float32Array(100)], 10), new Array(10).fill(4));
});

test('dalgaSvg: ayna çubuk; çalan kısım sarı, ibre yalnız çalarken', () => {
  const s = MV.dalgaSvg([10, 50, 100, 30], 0.5, 'k1');
  assert.match(s, /^<svg/);
  assert.equal((s.match(/<rect /g) || []).length, 4 * 2 + 1);
  assert.match(s, /url\(#mvA-k1\)/);
  assert.doesNotMatch(MV.dalgaSvg([10, 50], 0, 'k2'), /class="mv-ibre"/);
  assert.match(MV.dalgaSvg(null, 0, 'k3'), /<svg/);
});

test('teklifMetni ve zamanYazi', () => {
  assert.equal(MV.teklifMetni({ tur: 'kafe', ad: 'Sabah Açılış' }), 'Mekân demosu: Kafe · Sabah Açılış — bu sesi istiyorum.');
  assert.equal(MV.zamanYazi(65), '1:05');
  assert.equal(MV.DEMO_SANIYE, 60);
});

test('SQL: yalnız sütun + güvenli fonksiyon; marka adı dönmez; RLS değişmez', () => {
  const s = oku('supabase/mekan-vitrini.sql');
  assert.match(s, /add column if not exists vitrin_goster/);
  assert.match(s, /add column if not exists dalga smallint\[\]/);
  assert.match(s, /function public\.mekan_vitrini\(\)/);
  assert.match(s, /security definer/);
  assert.doesNotMatch(s, /create policy|drop policy|brands b|b\.name/);
});

test('mekân sayfası: bölüm başlığın altında, betikler yüklü', () => {
  const h = oku('coffee.html');
  assert.ok(h.indexOf('id="mekan-vitrini"') > h.indexOf('KENDİ SESİ') && h.indexOf('id="mekan-vitrini"') < h.indexOf('class="cf-grid"'));
  assert.match(h, /mekan-vitrini-yardim\.js\?v=\d+/);
  assert.match(h, /mekan-vitrini\.js\?v=\d+/);
  const j = oku('mekan-vitrini.js');
  assert.match(j, /rpc\('mekan_vitrini'\)/);
  assert.match(j, /DEMO_SANIYE/);
});
