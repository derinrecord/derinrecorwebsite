// Ana sayfa açılış ekranı (29 Ekim): Spotify gibi sessiz, 3 saniye.
// Koyu ekranda Derin Record logosu görünür; site erken hazırsa tam 3 sn, geç kalırsa en fazla 3,6 sn.
// Yalnız ana sayfada, oturumda bir kez. Aramadan gelen, site içinden dönen,
// # bölüm bağlantısıyla gelen ve botlar açılışı görmez.
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

test('ana sayfaya ilk girişte açılış gösterilir (Instagram tarayıcısı dahil)', () => {
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

test('3 saniye: site erken hazırsa açılış tam 3 sn sürer; site geç kalırsa bekler ama en fazla 3,6 sn', () => {
  const D = yukle();
  for (const s of D.SECENEKLER) {
    assert.ok(Math.abs(D.cikisZamani(0.3, s) + D.CIKIS[s] - 3) < 1e-9, s + ' erken hazır: 3 sn');
    assert.ok(D.cikisZamani(99, s) + D.CIKIS[s] <= 3.6 + 1e-9, s + ' en fazla 3,6 sn');
    const orta = D.cikisZamani(0.3, s) + 0.2;
    assert.ok(Math.abs(D.cikisZamani(orta, s) - orta) < 1e-9, s + ' site biraz geç hazırsa onu bekler');
  }
});

test('sessiz ve kapısız: ses dosyası, DİNLEYEREK GİR ve GEÇ yok; dokunan hemen geçer', () => {
  const js = oku('intro.js');
  assert.doesNotMatch(js, /new Audio|\.mp3|DİNLEYEREK|dintro-gec/);
  assert.match(js, /kok\.addEventListener\('pointerdown', \(\) => kapat\(\)/);
  const dosyalar = fs.readdirSync(path.join(__dirname, '..', 'assets', 'intro'));
  assert.deepEqual(dosyalar.filter(d => /\.(mp3|wav|m4a)$/.test(d)), []);
});

test('ana sayfa: stil <head> içinde, betik <body> açılır açılmaz (açılış sayfa yüklenirken hemen görünsün)', () => {
  const html = oku('index.html');
  const bas = html.slice(0, html.indexOf('</head>'));
  assert.match(bas, /<link rel="stylesheet" href="intro\.css\?v=\d+" \/>/);
  assert.doesNotMatch(bas, /intro\.js/);
  assert.match(html, /<body>\s*<script src="intro\.js\?v=\d+"><\/script>/);
  for (const d of ['aerobik.html', 'my-projects.html', 'coffee.html', 'radyo-yonetim.html', 'ses-tasarimi.html']) {
    assert.doesNotMatch(oku(d), /intro\.js/, d);
  }
});

test('hata olursa açılış kalkar, site normal açılır', () => {
  const js = oku('intro.js');
  assert.match(js, /function acil\(\) \{/);
  assert.match(js, /if \(document\.body\) guvenli\(ac\)\(\);/);
});

test('betik yüklenir yüklenmez kurulur: döngü, kurulumdan önce hazır (sonradan tanımlı sabit kullanılmaz)', () => {
  const js = oku('intro.js');
  // ac() karar anında eşzamanlı çalışır; içinden çağrılan döngü hoisting'li fonksiyon olmalı
  assert.match(js, /function dongu_\(\) \{/);
  assert.doesNotMatch(js, /const dongu_ =/);
});

test('oturum anahtarı sessionStorage içinde tutulur', () => {
  assert.match(oku('intro.js'), /sessionStorage\.(getItem|setItem)\(ANAHTAR/);
});

test('logo dosyaları var ve küçük (hızlı açılsın)', () => {
  for (const d of ['logo-noktasiz.webp', 'logo-nokta.webp']) {
    const yol = path.join(__dirname, '..', 'assets', 'intro', d);
    assert.ok(fs.existsSync(yol), d);
    assert.ok(fs.statSync(yol).size < 60 * 1024, d + ' 60 KB altında');
  }
});
