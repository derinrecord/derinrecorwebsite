// Ana sayfa açılış ekranı (29 Ekim): Spotify gibi sessiz, 4 saniye, koyu ekrandan yavaşça belirerek (fade in). Derin'in seçimi üçünün birleşimi:
// logo yavaşça yakınlaşır ve sarı bandın üstünden ışık geçer (A), kırmızı nokta REC ışığı gibi
// yavaşça yanıp söner (C), sonunda sitedeki kaset logosunun yerine oturur (B).
// Site erken hazırsa tam 4 sn, geç kalırsa en fazla 4,6 sn.
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

test('4 saniye: site erken hazırsa açılış tam 4 sn sürer; site geç kalırsa bekler ama en fazla 4,6 sn', () => {
  const D = yukle();
  assert.ok(Math.abs(D.cikisZamani(0.3) + D.CIKIS - 4) < 1e-9, 'erken hazır: 4 sn');
  assert.ok(D.cikisZamani(99) + D.CIKIS <= 4.6 + 1e-9, 'en fazla 4,6 sn');
  const orta = D.cikisZamani(0.3) + 0.2;
  assert.ok(Math.abs(D.cikisZamani(orta) - orta) < 1e-9, 'site biraz geç hazırsa onu bekler');
});

test('tek açılış kaldı: A/B/C seçenek harfleri yok', () => {
  const D = yukle();
  assert.equal(D.SECENEKLER, undefined);
  assert.equal(goster({ arama: '?intro=B', oturum: true }), false);
  assert.doesNotMatch(oku('intro.js'), /secenek/);
});

test('REC ışığı yavaş yanıp söner (saniyede bir), uçuştan önce yanık kalır', () => {
  const { recIsigi } = yukle();
  assert.equal(recIsigi(0.6), 0);          // logo belirirken kapalı
  assert.equal(recIsigi(1.2), 1);          // ilk yanış
  assert.equal(recIsigi(1.6), 0);          // söner
  assert.equal(recIsigi(2.0), 1);          // yeniden yanar
  assert.equal(recIsigi(2.45), 0);         // söner
  for (const t of [2.9, 3.3, 3.9]) assert.equal(recIsigi(t), 1, 'sonda yanık: ' + t);
  // eskisinden yavaş: her yanış ve sönüş en az 0,3 sn sürer
  let onceki = recIsigi(0), degisim = 0, uzunluk = 0, enKisa = Infinity;
  for (let t = 0.01; t < 2.7; t += 0.01) {
    const v = recIsigi(t) > 0.5 ? 1 : 0;
    if (v !== onceki) { if (degisim > 0) enKisa = Math.min(enKisa, uzunluk); degisim++; uzunluk = 0; onceki = v; }
    uzunluk += 0.01;
  }
  assert.ok(enKisa >= 0.3, 'en kısa yanış/sönüş: ' + enKisa.toFixed(2));
  assert.ok(degisim <= 5, 'en fazla 3 yanış: ' + degisim);
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

test('fade in: logo koyu ekrandan yaklaşık 1 sn içinde yavaşça belirir', () => {
  assert.match(oku('intro.js'), /const gir = ara\(t, 0\.05, 1\.05\);/);
});

test('uygulamada (DerinRecordApp) açılışın ilk sayfasında gelen yerden bağımsız gösterilir; oturumda bir kez', () => {
  const ajan = 'Mozilla/5.0 (Linux; Android 14; wv) AppleWebKit/537.36 Version/4.0 Chrome/120 Mobile Safari/537.36 DerinRecordApp/1';
  assert.equal(goster({ ajan, referans: 'https://derinrecord.com/' }), true);
  assert.equal(goster({ ajan, referans: 'https://www.derinrecord.com/', koken: 'https://www.derinrecord.com' }), true);
  assert.equal(goster({ ajan, oturum: true }), false);
  assert.equal(goster({ ajan, yol: '/aerobik.html' }), false);
  assert.equal(goster({ ajan, arama: '?intro=0' }), false);
});

test('?intro=tani: açılış zorla gösterilir ve teşhis kutusu çizilir (Derin\'in telefonunda intro çıkmadı, 31 Ekim)', () => {
  assert.equal(goster({ arama: '?intro=tani', oturum: true, referans: 'https://www.google.com/' }), true);
  const k = oku('intro.js');
  assert.match(k, /intro=tani|'tani'/);
  assert.match(k, /dintro-tani/);
  assert.match(k, /sonHata/);
});
