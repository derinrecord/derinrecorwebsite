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

test('dalgaSvg: sık, ortadan simetrik ince çizgiler; çalan kısım sarı katmanda kırpılır', () => {
  const s = MV.dalgaSvg([10, 50, 100, 30], 0.5, 'k1');
  assert.match(s, /^<svg/);
  assert.equal((s.match(/<path /g) || []).length, 2, 'gri katman + sarı katman');
  assert.equal((s.match(/M/g) || []).length, 4 * 2, 'her nokta iki katmanda birer çizgi');
  assert.match(s, /clip-path="url\(#mvK-k1\)"/);
  assert.match(s, /url\(#mvG-k1\)/);
  assert.match(s, /class="mv-ibre"/);
  // 100 değeri tam yüksekliğe yakın, ortadan iki yöne eşit açılır
  const orta = /M[\d.]+ ([\d.]+)V([\d.]+)/g; let m, cift = [];
  while ((m = orta.exec(s))) cift.push([+m[1], +m[2]]);
  cift.slice(0, 4).forEach(([y1, y2]) => assert.ok(Math.abs((y1 + y2) / 2 - 30) < 0.01));
  assert.doesNotMatch(MV.dalgaSvg([10, 50], 0, 'k2'), /class="mv-ibre"|clip-path/);
  assert.match(MV.dalgaSvg(null, 0, 'k3'), /<svg/);
});

test('ustAlt: Ableton gibi her dilimde en üst / en alt; -100..100, sırayla [üst, alt, …]', () => {
  const n = 1200, a = new Float32Array(n), b = new Float32Array(n);
  for (let i = 0; i < n; i++) { a[i] = (i < 600 ? 0.1 : 0.9) * Math.sin(i); b[i] = (i < 600 ? 0.05 : 0.5) * Math.sin(i); }
  const d = MV.ustAlt([a, b], 6);
  assert.equal(d.length, 12);
  assert.equal(Math.max(...d), 100);
  for (let i = 0; i < 6; i++) assert.ok(d[2 * i] >= d[2 * i + 1], 'üst alttan küçük olamaz');
  assert.ok(d[0] < d[10], 'sessiz bölüm alçak, yüksek bölüm yüksek');
  assert.ok(d[11] <= -50, 'alt kontur negatif');
  assert.deepEqual(MV.ustAlt([new Float32Array(60)], 3), [0, 0, 0, 0, 0, 0]);
});

test('dalgaTam: 600 dilimlik üst/alt dalga tam; eski biçimler yenilenir', () => {
  assert.equal(MV.DALGA_NOKTA, 600);
  assert.equal(MV.dalgaTam(new Array(1200).fill(5)), true);
  assert.equal(MV.dalgaTam(new Array(400).fill(5)), false);
  assert.equal(MV.dalgaTam(new Array(120).fill(5)), false);
  assert.equal(MV.dalgaTam(null), false);
});

test('dalgaSvg: tam dalga dolu kontur olarak çizilir (gri + kırpılmış sarı)', () => {
  const d = []; for (let i = 0; i < 600; i++) d.push(60, -40);
  const s = MV.dalgaSvg(d, 0.3, 'u1');
  assert.equal((s.match(/<path /g) || []).length, 2);
  assert.equal((s.match(/M/g) || []).length, 2, 'her katman tek kapalı şekil');
  assert.match(s, /Z"/);
  assert.match(s, /clip-path="url\(#mvK-u1\)"/);
  assert.match(s, /fill="url\(#mvG-u1\)"/);
  const g = MV.dalgaSvg(d, 0, 'u2');
  assert.equal((g.match(/<path /g) || []).length, 1);
});

test('cubukSvg: SoundCloud gibi alttan yükselen çubuklar; çalınan kısım sarı, kalanı açık gri', () => {
  const d = []; for (let i = 0; i < 600; i++) d.push(i < 300 ? 20 : 90, i < 300 ? -10 : -95);
  const s = MV.cubukSvg(d, 0.25, 'sari', 40);
  assert.equal((s.match(/<rect /g) || []).length, 40);
  assert.equal((s.match(/fill="#e8c548"/g) || []).length, 10, 'ilk %25 sarı');
  assert.equal((s.match(/fill="#e9e6df"/g) || []).length, 30);
  // hepsi alta dayalı: y + yükseklik = 60
  const r = /y="([\d.]+)" width="[\d.]+" height="([\d.]+)"/g; let m;
  while ((m = r.exec(s))) assert.ok(Math.abs(+m[1] + +m[2] - 60) < 0.11);
  const ilk = /height="([\d.]+)"/.exec(s)[1], son = /height="([\d.]+)"[^>]*\/><\/svg>/.exec(s)[1];
  assert.ok(+ilk < +son, 'sessiz yer alçak, yüksek yer uzun');
  assert.equal((MV.cubukSvg(d, 0, 'sari', 40).match(/#e8c548/g) || []).length, 0);
});

test('vitrin: satır ve oynatıcı sarı çubuk dalgayla; köşelerde geçen / demo süresi', () => {
  const j = oku('mekan-vitrini.js');
  assert.match(j, /MV\.cubukSvg\([^)]*'sari'/);
  assert.doesNotMatch(j, /MV\.dalgaSvg\(/);
  assert.match(j, /class="mv-zs"/);
  assert.match(j, /class="mv-zg"/);
  assert.match(oku('mekan-vitrini.css'), /\.mv-zs/);
});

test('SQL: klasörden yalnız seçili şarkılar; seçim yoksa hepsi; RLS değişmez', () => {
  const s = oku('supabase/mekan-vitrini-secim.sql');
  assert.match(s, /alter table public\.radio_folders\s+add column if not exists vitrin_parcalar uuid\[\]/);
  assert.match(s, /check \(dalga is null or cardinality\(dalga\) <= 1200\)/);
  assert.match(s, /f\.vitrin_parcalar is null or t\.id = any\(f\.vitrin_parcalar\)/);
  assert.doesNotMatch(s, /create policy|drop policy|disable row level/);
  assert.match(s, /grant execute on function public\.mekan_vitrini\(\) to anon, authenticated/);
});

test('panel: vitrin kutusunda şarkı kutucukları, hepsini seç / temizle; yalnız seçililere dalga', () => {
  const v = oku('radyo-panel-views.js');
  assert.match(v, /data-vt-parca=/);
  assert.match(v, /data-act="vt-hepsi"/);
  assert.match(v, /data-act="vt-temizle"/);
  const y = oku('radyo-yonetim.js');
  assert.match(y, /vitrin_parcalar/);
  assert.match(y, /case 'vt-hepsi'/);
  assert.match(y, /MV\.dalgaTam\(/);
  assert.match(y, /MV\.ustAlt\(/);
  assert.match(y, /MV\.DALGA_NOKTA/);
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
  assert.doesNotMatch(s, /on public\.(brand_playlists|radio_tracks|brands|brand_playlist_tracks) for|brands b|b\.name/);
});

test('ana sayfa: bölüm "KENDİ SESİ" kurumsal bölümünün hemen altında, betikler ve stil yüklü', () => {
  const h = oku('index.html');
  const yer = h.indexOf('id="mekan-vitrini"');
  assert.ok(yer > h.indexOf('id="kurumsal"') && yer < h.indexOf('id="ses-tasarimi"'));
  assert.match(h, /audio-file-types\.js\?v=\d+/);
  assert.match(h, /r2-depo\.js\?v=\d+/);
  assert.match(h, /mekan-vitrini-yardim\.js\?v=\d+/);
  assert.match(h, /mekan-vitrini\.js\?v=\d+/);
  assert.match(h, /mekan-vitrini\.css\?v=\d+/);
  const j = oku('mekan-vitrini.js');
  assert.match(j, /rpc\('mekan_vitrini'\)/);
  assert.match(j, /DEMO_SANIYE/);
});

test('mekân sayfası (/coffee): vitrin artık yalnız ana sayfada', () => {
  const h = oku('coffee.html');
  assert.doesNotMatch(h, /id="mekan-vitrini"/);
  assert.doesNotMatch(h, /mekan-vitrini\.js/);
});

test('BU SESİ İSTİYORUM: ana sayfadan /coffee formuna liste adıyla gider, form notu doldurur', () => {
  const l = { tur: 'kafe', turAd: 'Kafe', ad: 'Coffee & Jazz' };
  const u = MV.teklifAdresi(l);
  assert.ok(u.startsWith('/coffee?demo='));
  assert.ok(u.endsWith('#cf-note'));
  assert.equal(new URL(u, 'https://derinrecord.com').searchParams.get('demo'), MV.teklifMetni(l));
  const c = oku('coffee.js');
  assert.match(c, /URLSearchParams\(location\.search\)\.get\('demo'\)/);
  assert.match(oku('mekan-vitrini.js'), /teklifAdresi/);
});

test('SQL: klasörler de vitrine çıkar; yalnız sütun eklenir, RLS değişmez, klasör adı dönmez', () => {
  const s = oku('supabase/mekan-vitrini-klasor.sql');
  assert.match(s, /alter table public\.radio_folders\s+add column if not exists vitrin_goster/);
  assert.match(s, /from public\.radio_folders f\s+where f\.vitrin_goster/);
  assert.match(s, /union all/);
  assert.match(s, /where t\.folder_id = f\.id/);
  assert.doesNotMatch(s, /create policy|drop policy|disable row level/);
  assert.doesNotMatch(s, /'ad', f\.name|f\.name/);
  assert.match(s, /grant execute on function public\.mekan_vitrini\(\) to anon, authenticated/);
});

test('panel: klasör sayfasında SİTEDE GÖSTER; klasöre yazar, dalgaları çıkarır', () => {
  const v = oku('radyo-panel-views.js');
  assert.match(v, /'folder-vitrin'/);
  assert.ok(v.includes("vitrinPaneli(f, D, liste, 'klasor')"));
  assert.match(v, /mekan-vitrini-klasor\.sql/);
  const y = oku('radyo-yonetim.js');
  assert.match(y, /case 'folder-vitrin'/);
  assert.match(y, /from\('radio_folders'\)\.select\('id,vitrin_goster,vitrin_tur,vitrin_ad,vitrin_tarz,vitrin_sira'\)/);
  assert.match(y, /from\(tablo\)\.update\(guncel\)/);
});

test('yazılar yöneticiden: varsayılanla birleşir, boş alan varsayılana döner, kapalı tür gizlenir', () => {
  const a = MV.ayar({ baslik: 'Sesinizi bulun,', vurgu: '', turler: { otel: { ad: 'Butik Otel', ikon: '🏨', acik: true }, magaza: { acik: false } } });
  assert.equal(a.baslik, 'Sesinizi bulun,');
  assert.equal(a.vurgu, 'sesini dinleyin.');
  assert.equal(a.ust, 'MEKAN DEMOLARI');
  assert.equal(a.turler.otel.ad, 'Butik Otel');
  assert.equal(a.turler.otel.ikon, '🏨');
  assert.equal(a.turler.kafe.ad, 'Kafe');
  assert.deepEqual(MV.acikTurler(a), ['kafe', 'restoran', 'otel']);
  assert.deepEqual(MV.acikTurler(MV.ayar(null)), ['kafe', 'restoran', 'otel', 'magaza']);
});

test('SQL: yazı tablosu yalnız yöneticiye yazılır; vitrin yazıları da döndürür', () => {
  const s = oku('supabase/mekan-vitrini.sql');
  assert.match(s, /create table if not exists public\.mekan_vitrini_ayar/);
  assert.match(s, /on public\.mekan_vitrini_ayar for all using \(public\.is_admin\(\)\)/);
  assert.match(s, /'ayar'/);
  const p = oku('radyo-panel-views.js') + oku('radyo-yonetim.js');
  assert.match(p, /data-act="vitrin-yazilar"/);
  assert.match(p, /from\('mekan_vitrini_ayar'\)\.upsert/);
});
