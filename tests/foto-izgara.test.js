// Profil fotoğrafı ızgaralı ayar penceresi (24 Ekim): sürükle + büyüt, sonra kırp.
// F = ekrandaki kare çerçevenin kenarı (piksel). ayar = { zoom, ox, oy }:
// fotoğrafın sol üst köşesinin çerçeveye göre yeri (ekran pikseli).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const P = require('../profil-yardim.js');
const oku = d => fs.readFileSync(path.join(__dirname, '..', d), 'utf8');

test('başlangıç: fotoğraf çerçeveyi doldurur ve ortalanır', () => {
  // 1200x800, F=300 → ölçek 300/800=0.375 → ekranda 450x300, ox=-75
  assert.deepEqual(P.baslangicAyar(1200, 800, 300), { zoom: 1, ox: -75, oy: 0 });
  assert.deepEqual(P.baslangicAyar(600, 900, 300), { zoom: 1, ox: 0, oy: -75 });
});

test('sınırlama: fotoğraf çerçevenin dışına kaçamaz, büyütme 1–4 arası', () => {
  assert.deepEqual(P.sinirla({ zoom: 1, ox: 50, oy: 10 }, 1200, 800, 300), { zoom: 1, ox: 0, oy: 0 });
  assert.deepEqual(P.sinirla({ zoom: 1, ox: -999, oy: -5 }, 1200, 800, 300), { zoom: 1, ox: -150, oy: 0 });
  assert.equal(P.sinirla({ zoom: 0.3, ox: 0, oy: 0 }, 800, 800, 300).zoom, 1);
  assert.equal(P.sinirla({ zoom: 9, ox: 0, oy: 0 }, 800, 800, 300).zoom, 4);
});

test('büyütme çerçevenin ortasını sabit tutar', () => {
  // 800x800, F=300, zoom 1→2: ekranda 600x600; orta (150,150) sabit → ox=oy=-150
  const a = P.zoomla({ zoom: 1, ox: 0, oy: 0 }, 2, 800, 800, 300);
  assert.deepEqual(a, { zoom: 2, ox: -150, oy: -150 });
});

test('kırpma: çerçevede görünen kısım kaynaktan alınır, çıktı en çok 256', () => {
  // başlangıç = eski ortadan kare kırpma ile aynı
  assert.deepEqual(P.ayarKirp(P.baslangicAyar(1200, 800, 300), 1200, 800, 300), { sx: 200, sy: 0, kenar: 800, cikti: 256 });
  // 800x800, zoom 2, ox=oy=-150 → ölçek 0.75 → sx=200, kenar=400
  assert.deepEqual(P.ayarKirp({ zoom: 2, ox: -150, oy: -150 }, 800, 800, 300), { sx: 200, sy: 200, kenar: 400, cikti: 256 });
  // küçük foto büyütülmez
  assert.equal(P.ayarKirp(P.baslangicAyar(100, 100, 300), 100, 100, 300).cikti, 100);
});

test('profilim.html: ızgaralı ayar penceresi, büyütme çubuğu, kaydet/vazgeç', () => {
  const h = oku('profilim.html');
  ['pf-ayar', 'pf-ayar-alan', 'pf-ayar-resim', 'pf-ayar-zoom', 'pf-ayar-kaydet', 'pf-ayar-vazgec'].forEach(id => assert.ok(h.includes(`id="${id}"`), id));
  assert.match(h, /class="pf-izgara"/);
  assert.match(h, /type="range"[^>]*id="pf-ayar-zoom"|id="pf-ayar-zoom"[^>]*type="range"/);
});

test('profilim.js: sürükleme ve iki parmak büyütme, kırpma ayardan yapılır', () => {
  const j = oku('profilim.js');
  assert.match(j, /pointerdown/);
  assert.match(j, /pointermove/);
  assert.match(j, /P\.ayarKirp\(/);
  assert.match(j, /P\.zoomla\(/);
  assert.match(j, /P\.sinirla\(/);
});
