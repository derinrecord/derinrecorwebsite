// Site açılış introsu (29 Ekim): yalnız ana sayfada, oturumda bir kez.
// Tarayıcılar dokunmadan ses çaldırmadığı için önce kapı: ▶ DİNLEYEREK GİR / GEÇ.
// Google'dan gelen, site içinden dönen, bölüm bağlantısıyla (#) gelen ve botlar introyu görmez.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const oku = d => fs.readFileSync(path.join(__dirname, '..', d), 'utf8');

function yukle() {
  const window = {};
  vm.runInNewContext(oku('intro.js'), { window, URL, URLSearchParams, Math, Number, String });
  return window.DerinIntro;
}

const temel = { yol: '/', arama: '', hash: '', oturum: false, referans: '', koken: 'https://derinrecord.com', ajan: 'Mozilla/5.0 (iPhone) Instagram 300.0' };
const goster = o => yukle().gosterilsinMi({ ...temel, ...o });

test('ana sayfaya ilk girişte intro gösterilir (Instagram tarayıcısı dahil)', () => {
  assert.equal(goster({}), true);
  assert.equal(goster({ yol: '/index.html' }), true);
});

test('diğer sayfalarda hiç gösterilmez', () => {
  for (const yol of ['/aerobik.html', '/my-projects.html', '/coffee', '/radyo-yonetim.html', '/ses-tasarimi.html']) {
    assert.equal(goster({ yol }), false, yol);
  }
});

test('aynı oturumda ikinci kez gösterilmez', () => {
  assert.equal(goster({ oturum: true }), false);
});

test('Google vb. aramadan gelene, site içinden dönene ve # bağlantısına gösterilmez', () => {
  assert.equal(goster({ referans: 'https://www.google.com/' }), false);
  assert.equal(goster({ referans: 'https://www.bing.com/search?q=derin+record' }), false);
  assert.equal(goster({ referans: 'https://derinrecord.com/aerobik.html' }), false);
  assert.equal(goster({ referans: 'https://l.instagram.com/' }), true);
  assert.equal(goster({ hash: '#iletisim' }), false);
});

test('arama motoru botlarına gösterilmez', () => {
  assert.equal(goster({ ajan: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)' }), false);
  assert.equal(goster({ ajan: 'Mozilla/5.0 (compatible; bingbot/2.0)' }), false);
});

test('?intro=1 her durumda açar, ?intro=0 kapatır (deneme ve tekrar izleme için)', () => {
  assert.equal(goster({ arama: '?intro=1', oturum: true, yol: '/' }), true);
  assert.equal(goster({ arama: '?intro=0' }), false);
});

test('ana sayfa: stil <head> içinde, betik <body> açılır açılmaz (kapı sayfa yüklenirken hemen görünsün)', () => {
  const html = oku('index.html');
  const bas = html.slice(0, html.indexOf('</head>'));
  assert.match(bas, /<link rel="stylesheet" href="intro\.css\?v=\d+" \/>/);
  assert.doesNotMatch(bas, /intro\.js/);
  assert.match(html, /<body>\s*<script src="intro\.js\?v=\d+"><\/script>/);
  for (const d of ['aerobik.html', 'my-projects.html', 'coffee.html', 'radyo-yonetim.html', 'ses-tasarimi.html']) {
    assert.doesNotMatch(oku(d), /intro\.js/, d);
  }
});

test('kapı: DİNLEYEREK GİR ve GEÇ, İngilizcesiyle', () => {
  const js = oku('intro.js');
  for (const s of ['DİNLEYEREK GİR', 'GEÇ', '8 saniyelik sesli intro', 'ENTER WITH SOUND', 'SKIP', '8-second intro with sound']) {
    assert.ok(js.includes(s), s);
  }
});

test('sekme arka plana geçerse ses durur ve intro kapanır; hata olursa site normal açılır', () => {
  const js = oku('intro.js');
  assert.match(js, /function gizlenince\(\) \{ if \(document\.hidden && durum === 'oynuyor'\) kapat\(true\); \}/);
  assert.match(js, /function acil\(\) \{/);
  assert.match(js, /if \(document\.body\) guvenli\(ac\)\(\);/);
});

test('oturum anahtarı sessionStorage içinde tutulur', () => {
  assert.match(oku('intro.js'), /sessionStorage\.(getItem|setItem)\(ANAHTAR/);
});

test('logo katmanları ve ses imzası dosyaları var', () => {
  for (const d of ['kaset.webp', 'derin.webp', 'record.webp', 'nokta.webp']) {
    assert.ok(fs.existsSync(path.join(__dirname, '..', 'assets', 'intro', d)), d);
  }
  const js = oku('intro.js');
  const ses = js.match(/assets\/intro\/(imza[^'"`]*\.mp3)/g) || [];
  assert.ok(ses.length > 0, 'ses dosyası adı intro.js içinde');
  for (const s of ses) assert.ok(fs.existsSync(path.join(__dirname, '..', s.replace(/\$\{[^}]+\}/, 'A'))), s);
});
