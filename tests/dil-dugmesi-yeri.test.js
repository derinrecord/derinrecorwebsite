// Dil düğmesi (EN/TR) başlık şeridinin dışına taşmasın (24 Ekim hatası).
// Ana sayfada başlık iki satırlı: düğme logonun ALTINDA durur. İç sayfalarda
// başlık tek satır: düğme altta kalırsa şeridin dışına sarkar → logonun
// YANINA geçer (sağda yer yoksa soluna). Logosuz sayfalarda (radyo paneli,
// MP3 dönüştürücü) telefonda sayfanın dibine düşmez, köşede sabit durur.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const kaynak = fs.readFileSync(path.join(__dirname, '..', 'dil.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '..', 'dil.css'), 'utf8');

// Saf karar fonksiyonunu kaynaktan çıkarıp sına.
const govde = kaynak.match(/function dugmeYeri\(o\) \{[\s\S]*?\n  \}/);
assert.ok(govde, 'dil.js içinde dugmeYeri(o) olmalı');
const dugmeYeri = new Function(govde[0] + '; return dugmeYeri;')();

const baslik = { top: 13, bottom: 85, left: 50, right: 1230 };

test('ana sayfada (uzun başlık) düğme logonun altında kalır', () => {
  assert.equal(dugmeYeri({ baslik: { top: 15, bottom: 145, left: 50, right: 1230 },
    logo: { top: 28, bottom: 63, left: 73, right: 166 }, altUst: 97, altAlt: 125, genislik: 38 }), 'alt');
});

test('iç sayfada alttaki düğme şeritten taşar → logonun sağına geçer', () => {
  assert.equal(dugmeYeri({ baslik, logo: { top: 27, bottom: 62, left: 600, right: 688 }, altUst: 96, altAlt: 124, genislik: 38 }), 'sag');
});

test('logo sağ kenardaysa (yer yok) soluna geçer', () => {
  assert.equal(dugmeYeri({ baslik, logo: { top: 27, bottom: 62, left: 1117, right: 1205 }, altUst: 96, altAlt: 124, genislik: 38 }), 'sol');
});

test('telefonda başlığın içine sığan alt yerleşim korunur', () => {
  assert.equal(dugmeYeri({ baslik: { top: 9, bottom: 84, left: 9, right: 381 },
    logo: { top: 14, bottom: 46, left: 213, right: 283 }, altUst: 51, altAlt: 75, genislik: 34 }), 'alt');
});

test('dil.js yerleşimi yüklenince ve pencere boyutu değişince yeniden ölçer', () => {
  assert.match(kaynak, /const yerlestir = \(\) => \{/);
  assert.match(kaynak, /addEventListener\('resize', yerlestir/);
  assert.match(kaynak, /sarma\.classList\.toggle\('dil-yan-sag', yer === 'sag'\)/);
  assert.match(kaynak, /sarma\.classList\.toggle\('dil-yan-sol', yer === 'sol'\)/);
  // Test ortamında (sahte DOM) ölçüm yoksa sessizce atlanır.
  assert.match(kaynak, /typeof dugme\.getBoundingClientRect !== 'function'/);
});

test('CSS: yan yerleşimlerde düğme logonun dikey ortasında, logoyu kaydırmadan', () => {
  assert.match(css, /\.dil-sarma\.dil-yan-sag \.dil-dugme \{[^}]*left: calc\(100% \+ 10px\)[^}]*top: 50%[^}]*transform: translateY\(-50%\)/);
  assert.match(css, /\.dil-sarma\.dil-yan-sol \.dil-dugme \{[^}]*left: auto[^}]*right: calc\(100% \+ 10px\)/);
  // Telefonda statik kural yan yerleşimi bozmasın.
  assert.match(css, /@media \(max-width: 760px\) \{[\s\S]*\.dil-sarma\.dil-yan-sag \.dil-dugme,\s*\.dil-sarma\.dil-yan-sol \.dil-dugme \{\s*position: absolute;/);
});

test('CSS: logosuz sayfada telefonda düğme sayfanın dibine düşmez, köşede sabit kalır', () => {
  assert.match(css, /@media \(max-width: 760px\) \{[\s\S]*\.dil-dugme\.dil-dugme-sabit \{\s*position: fixed;\s*top: auto;\s*bottom: 16px;\s*left: 16px;/);
});

test('EN/TR düğmesi yalnız ana sayfada: index.html işaretli, diğer sayfalar değil', () => {
  const sayfalar = fs.readdirSync(path.join(__dirname, '..')).filter(f => f.endsWith('.html'));
  const isaretli = sayfalar.filter(f => /<html[^>]*\sdata-dil-dugme[\s>]/.test(fs.readFileSync(path.join(__dirname, '..', f), 'utf8')));
  assert.deepEqual(isaretli, ['index.html']);
  assert.match(kaynak, /if \(document\.documentElement\.hasAttribute\('data-dil-dugme'\)\) dugmeKur\(\);/);
});
