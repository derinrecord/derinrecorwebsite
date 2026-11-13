// Yarışma duyurusu (13 Kasım 2026): Akrobatik Cimnastik Federasyon Kupası
// (13–15 Kasım, İstanbul Sancaktepe). Ana sayfada MÜZİĞİNİ OLUŞTUR'un altında şerit
// (bitince kendiliğinden gizlenir) + Haberler sayfasında en üstte kart.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const oku = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const HS = require('../hero-sekme.js');
const ADRES = 'https://www.tcf.gov.tr/faaliyetler/akrobatik-cimnastik-federasyon-kupasi/';

test('suresiDoldu: bitiş gününün sonuna kadar görünür (İstanbul saatiyle)', () => {
  assert.equal(HS.suresiDoldu('2026-11-15', new Date('2026-11-14T09:00:00Z')), false);
  assert.equal(HS.suresiDoldu('2026-11-15', new Date('2026-11-15T20:59:00Z')), false); // İstanbul 23:59
  assert.equal(HS.suresiDoldu('2026-11-15', new Date('2026-11-15T21:01:00Z')), true);  // İstanbul 16 Kasım 00:01
  assert.equal(HS.suresiDoldu('', new Date()), false);
});

test('ana sayfa: sporcu panelinde, MÜZİĞİNİ OLUŞTUR\'un altında yarışma şeridi', () => {
  const h = oku('index.html');
  const pano = h.slice(h.indexOf('data-hero-pano="spor"'), h.indexOf('data-hero-pano="mekan"'));
  const cta = pano.indexOf('data-i18n="ana.cta1"'), serit = pano.indexOf('class="hero-yarisma"');
  assert.ok(cta > 0 && serit > cta, 'şerit düğmenin altında');
  assert.match(pano, new RegExp('href="' + ADRES.replace(/[.?]/g, '\\$&') + '"[^>]*target="_blank"[^>]*rel="noreferrer"'));
  assert.match(pano, /data-bitis="2026-11-15"/);
  assert.match(oku('hero-sekme.js'), /\[data-bitis\]/);
  assert.match(oku('hero-sekme.css'), /\.hero-yarisma/);
});

test('haberler: en üstte akrobatik kartı', () => {
  const h = oku('news.html');
  const izgara = h.slice(h.indexOf('<section class="news-grid">'));
  const ilk = izgara.slice(0, izgara.indexOf('</article>'));
  assert.match(ilk, /Akrobatik Cimnastik Federasyon Kupası/);
  assert.ok(ilk.includes('href="' + ADRES + '"'));
});

test('çeviri: yeni yazıların İngilizcesi var', () => {
  const d = oku('dil.js');
  for (const k of ['ana.yarisma.etiket', 'ana.yarisma.metin', 'haber.akro.etiket', 'haber.akro.baslik', 'haber.akro.metin', 'haber.akro.link']) assert.ok(d.includes("'" + k + "':"), k);
});
