// Yarışma takibi ve canlı yayın duyurusu (13–14 Kasım 2026).
// Federasyon takvimi her sabah okunur (supabase/yarismalar.sql), 2 gün kala Telegram'a
// haber gider; yönetici YARIŞMALAR sayfasında seçip yayınlar → ana sayfa şeridi
// (MÜZİĞİNİ OLUŞTUR'un altında) ve Haberler'in en üstü. Bitince kendiliğinden kalkar.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const oku = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const HS = require('../hero-sekme.js');
const YD = require('../yarisma-duyuru.js');
const YR = require('../yarismalar.js');
const SIMDI = new Date('2026-11-14T06:00:00Z'); // İstanbul 09:00

test('suresiDoldu: bitiş gününün sonuna kadar görünür (İstanbul saatiyle)', () => {
  assert.equal(HS.suresiDoldu('2026-11-15', new Date('2026-11-15T20:59:00Z')), false);
  assert.equal(HS.suresiDoldu('2026-11-15', new Date('2026-11-15T21:01:00Z')), true);
  assert.equal(HS.suresiDoldu('', new Date()), false);
});

test('gorunenler: yalnız yayında ve bitmemiş olanlar, başlangıca göre', () => {
  const l = YD.gorunenler([
    { id: 1, yayinda: true, bas: '2026-11-20', bit: '2026-11-22' },
    { id: 2, yayinda: true, bas: '2026-11-13', bit: '2026-11-15' },
    { id: 3, yayinda: false, bas: '2026-11-14', bit: '2026-11-16' },
    { id: 4, yayinda: true, bas: '2026-11-10', bit: '2026-11-13' }
  ], SIMDI);
  assert.deepEqual(l.map(y => y.id), [2, 1]);
});

test('tarihYazi ve etiket: sade Türkçe tarih; başladıysa CANLI YAYIN, başlamadıysa günüyle', () => {
  assert.equal(YD.tarihYazi('2026-11-13', '2026-11-15'), '13–15 Kasım');
  assert.equal(YD.tarihYazi('2026-11-30', '2026-12-02'), '30 Kasım – 2 Aralık');
  assert.equal(YD.tarihYazi('2026-11-21', '2026-11-21'), '21 Kasım');
  assert.equal(YD.etiket({ bas: '2026-11-13' }, SIMDI), 'CANLI YAYIN');
  assert.equal(YD.etiket({ bas: '2026-11-20' }, SIMDI), 'CANLI YAYIN · 20 KASIM');
});

test('şerit ve haber kartı: kaçışlı yazı, yalnız https bağlantı', () => {
  const y = { id: 'x', ad: '<b>Kupa</b>', sehir: 'İstanbul', brans: 'Akrobatik Cimnastik', bas: '2026-11-13', bit: '2026-11-15', link: 'https://www.tcf.gov.tr/faaliyetler/a/', canli_link: 'javascript:alert(1)' };
  const s = YD.seritHtml(y, SIMDI), h = YD.haberHtml(y, SIMDI);
  assert.ok(!s.includes('<b>Kupa') && s.includes('&lt;b&gt;Kupa'));
  assert.ok(!s.includes('javascript:') && s.includes('href="https://www.tcf.gov.tr/faaliyetler/a/"'), 'güvensiz yayın bağlantısı yerine federasyon sayfası');
  assert.ok(!h.includes('CANLI YAYIN · TIKLA'), 'güvensiz bağlantıda canlı yayın düğmesi çıkmaz');
  const h2 = YD.haberHtml(Object.assign({}, y, { canli_link: 'https://youtu.be/abc' }), SIMDI);
  assert.match(h2, /class="news-canli-dugme" href="https:\/\/youtu\.be\/abc" target="_blank" rel="noreferrer">CANLI YAYIN · TIKLA/);
  assert.match(s, /hy-lamba/);
});

test('ana sayfa ve Haberler: yer tutucular ve betik; elle yazılmış eski şerit/kart kalktı', () => {
  const h = oku('index.html');
  const pano = h.slice(h.indexOf('data-hero-pano="spor"'), h.indexOf('data-hero-pano="mekan"'));
  assert.ok(pano.indexOf('data-yarisma-serit') > pano.indexOf('data-i18n="ana.cta1"'), 'şerit MÜZİĞİNİ OLUŞTUR\'un altında');
  assert.ok(!h.includes('class="hero-yarisma" href'), 'elle yazılmış şerit yok');
  assert.match(h, /yarisma-duyuru\.js\?v=\d+/);
  const n = oku('news.html');
  const izgara = n.slice(n.indexOf('<section class="news-grid">'));
  assert.ok(izgara.indexOf('data-yarisma-haber') < izgara.indexOf('<article'), 'Haberler\'in en üstünde');
  assert.match(n, /yarisma-duyuru\.js\?v=\d+/);
  assert.match(oku('yarisma-duyuru.js'), /\.eq\('yayinda', true\)\.gte\('bit', /);
  assert.match(oku('yarisma-duyuru.js'), /liste\.slice\(0, ENCOK_SERIT\)\.map\(/, 'aynı anda birden fazla yarışma alt alta');
  assert.match(oku('hero-sekme.css'), /\.hero-yarisma-kutu\{display:grid;gap:14px/);
});

test('YARIŞMALAR sayfası: yalnız yönetici; bağlantı denetimi; menüde yalnız yöneticiye', () => {
  assert.deepEqual(YR.formDenetle('', ''), { hata: 'Canlı yayın bağlantısını yaz.' });
  assert.ok(YR.formDenetle('javascript:alert(1)', '').hata);
  assert.ok(YR.formDenetle('https://x.com/a b', '').hata);
  assert.deepEqual(YR.formDenetle(' https://youtu.be/abc ', ' 10:00 '), { canli_link: 'https://youtu.be/abc', not_metni: '10:00' });
  assert.equal(YR.kalan({ bas: '2026-11-16', bit: '2026-11-16' }, SIMDI), '2 GÜN SONRA');
  assert.equal(YR.kalan({ bas: '2026-11-15', bit: '2026-11-16' }, SIMDI), 'YARIN');
  assert.equal(YR.kalan({ bas: '2026-11-13', bit: '2026-11-15' }, SIMDI), 'DEVAM EDİYOR');
  const j = oku('yarismalar.js');
  assert.match(j, /role !== 'admin'/);
  assert.match(j, /from\('yarismalar'\)\.update\(/);
  assert.match(j, /\.eq\('id', id\)\.select\('id'\)/);
  const a = oku('auth.js');
  assert.match(a, /state\.profile\?\.role === 'admin' \? '[^']*<a href="yarismalar\.html">YARIŞMALAR<\/a>/);
  assert.match(a, /'yarismalar\.html'\]/);
});

test('SQL: yalnız "Yarışma" satırları; 2 gün kala tek Telegram; izinler dar; her sabah 09:00', () => {
  const s = oku('supabase/yarismalar.sql');
  assert.match(s, /net\.http_get\(url := 'https:\/\/www\.tcf\.gov\.tr\/faaliyetler\/'/);
  assert.match(s, /btrim\(a\[2\]\) ilike 'yar%'/);
  assert.match(s, /bildirim_at is null and bas >= v_bugun and bas <= v_bugun \+ 2/);
  assert.match(s, /update public\.yarismalar set bildirim_at = now\(\)/);
  assert.match(s, /for select to anon, authenticated using \(yayinda\)/);
  assert.match(s, /for update to authenticated using \(public\.is_admin\(\)\) with check \(public\.is_admin\(\)\)/);
  assert.doesNotMatch(s, /for (insert|delete|all) to (anon|authenticated)/);
  assert.match(s, /revoke all on function public\.yarisma_tara_isle\(\) from public, anon/);
  assert.match(s, /cron\.schedule\('yarisma-tara-baslat', '0 6 \* \* \*'/);
  assert.match(s, /cron\.schedule\('yarisma-tara-isle', '5 6 \* \* \*'/);
  assert.doesNotMatch(s, /alter table public\.(profiles|demo_access|feedback_notes|radio_bildirim_ayari)/);
});
