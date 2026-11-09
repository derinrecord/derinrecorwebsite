// Ana sayfa giriş sekmeleri (9 Kasım 2026): "Ne için müzik arıyorsunuz?" —
// Sporcu & antrenör / Mekân & işletme / Film & reklam; her sekme kendi başlığını,
// yazısını, düğmelerini ve kaset etiketini gösterir.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const oku = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const HS = require('../hero-sekme.js');

test('sekmeSec: kayıtlı sekme geçerliyse o, değilse sporcu', () => {
  assert.deepEqual(HS.SEKMELER, ['spor', 'mekan', 'film']);
  assert.equal(HS.sekmeSec('mekan'), 'mekan');
  assert.equal(HS.sekmeSec('film'), 'film');
  assert.equal(HS.sekmeSec(null), 'spor');
  assert.equal(HS.sekmeSec('<script>'), 'spor');
});

test('komsu: ok tuşlarıyla sekmeler arasında döner', () => {
  assert.equal(HS.komsu('spor', 1), 'mekan');
  assert.equal(HS.komsu('film', 1), 'spor');
  assert.equal(HS.komsu('spor', -1), 'film');
});

test('ana sayfa: üç sekme, üç pano, üç kaset etiketi; açılışta yalnız sporcu görünür', () => {
  const h = oku('index.html');
  const giris = h.slice(h.indexOf('<section class="hero"'), h.indexOf('</section>', h.indexOf('<section class="hero"')));
  assert.match(giris, /NE İÇİN MÜZİK ARIYORSUNUZ\?/);
  ['spor', 'mekan', 'film'].forEach(k => {
    assert.match(giris, new RegExp('role="tab"[^>]*data-hero-sekme="' + k + '"'));
    assert.match(giris, new RegExp('role="tabpanel"[^>]*data-hero-pano="' + k + '"'));
    assert.match(giris, new RegExp('data-hero-etiket="' + k + '"'));
  });
  assert.match(giris, /data-hero-sekme="spor"[^>]*aria-selected="true"|aria-selected="true"[^>]*data-hero-sekme="spor"/);
  assert.match(giris, /data-hero-pano="mekan"[^>]*hidden/);
  assert.match(giris, /data-hero-pano="film"[^>]*hidden/);
  assert.doesNotMatch(giris.match(/<div[^>]*data-hero-pano="spor"[^>]*>/)[0], /hidden/);
  assert.match(giris, /SAHNEDE<br \/><em>İZ<\/em> BIRAK\./);
  assert.match(giris, /MEKANINIZIN<br \/><em>KENDİ<\/em> SESİ\./);
  assert.match(giris, /PERDEYE<br \/><em>SES<\/em> VER\./);
  assert.match(giris, /href="#mekan-vitrini"[^>]*>DEMOLARI DİNLE/);
  assert.match(giris, /href="\/coffee"/);
  assert.match(giris, /href="#ses-tasarimi"/);
  assert.match(h, /hero-sekme\.js\?v=\d+/);
  assert.match(h, /hero-sekme\.css\?v=\d+/);
});

test('çeviri: yeni giriş yazılarının hepsinin İngilizcesi var', () => {
  const h = oku('index.html'), d = oku('dil.js');
  const giris = h.slice(h.indexOf('<section class="hero"'), h.indexOf('</section>', h.indexOf('<section class="hero"')));
  const anahtarlar = [...giris.matchAll(/data-i18n="([^"]+)"/g)].map(m => m[1]);
  assert.ok(anahtarlar.length >= 18);
  anahtarlar.forEach(k => assert.ok(d.includes("'" + k + "':"), 'İngilizcesi yok: ' + k));
});
