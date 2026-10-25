// Öğretici mod (24 Ekim): antrenöre Projelerim ve branş demo sayfalarında
// adım adım tur. İlk girişte kendiliğinden açılır (antrenör), sonra menüdeki
// ÖĞRETİCİ ile tekrar başlatılır. Yönetici ve ziyaretçiye kendiliğinden açılmaz.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const oku = d => fs.readFileSync(path.join(__dirname, '..', d), 'utf8');
const O = require('../ogretici.js');
const TUR = require('../ogretici-turlar.js');

test('görüldü anahtarı tura ve kişiye özel', () => {
  assert.equal(O.gorulduAnahtari('projelerim', 'u-1'), 'derin-ogretici:projelerim:u-1');
});

test('kendiliğinden açılma: giriş yapmış antrenör ya da yönetici, daha önce görmediyse (25 Ekim: yönetici de)', () => {
  assert.equal(O.kendiligindenAcilsin({ rol: 'coach', gorduMu: false }), true);
  assert.equal(O.kendiligindenAcilsin({ rol: 'coach', gorduMu: true }), false);
  assert.equal(O.kendiligindenAcilsin({ rol: 'admin', gorduMu: false }), true);
  assert.equal(O.kendiligindenAcilsin({ rol: 'admin', gorduMu: true }), false);
  assert.equal(O.kendiligindenAcilsin({ rol: null, gorduMu: false }), false);
});

test('balon yeri: hedefin altına sığarsa alta, sığmazsa üste; ekrandan taşmaz', () => {
  const ekran = { gen: 1280, yuk: 800 };
  const balon = { gen: 320, yuk: 160 };
  assert.deepEqual(O.balonYeri({ top: 100, left: 200, width: 300, height: 50 }, balon, ekran), { top: 164, left: 200, yon: 'alt' });
  assert.deepEqual(O.balonYeri({ top: 600, left: 1100, width: 150, height: 80 }, balon, ekran), { top: 426, left: 944, yon: 'ust' });
  assert.equal(O.balonYeri({ top: 100, left: -50, width: 30, height: 30 }, balon, ekran).left, 16);
});

test('adım listesi: hedefi bulunmayan ya da görünmeyen adımlar atlanır', () => {
  const adimlar = [{ hedef: '.a' }, { hedef: '.yok' }, { hedef: '.gizli' }, { hedef: null }];
  const bul = s => ({ '.a': { gorunur: true }, '.gizli': { gorunur: false } }[s] || null);
  assert.deepEqual(O.gecerliAdimlar(adimlar, bul).map(a => a.hedef), ['.a', null]);
});

test('turlar: Projelerim, parça odası ve branş sayfası; her adımda TR ve EN metin', () => {
  assert.deepEqual(Object.keys(TUR).sort(), ['brans', 'proje-detay', 'projelerim']);
  for (const [ad, adimlar] of Object.entries(TUR)) {
    assert.ok(adimlar.length >= 3, ad);
    adimlar.forEach((a, i) => { assert.ok(a.baslik.tr && a.baslik.en && a.metin.tr && a.metin.en, `${ad} #${i}`); });
  }
  const hedefler = a => TUR[a].map(x => x.hedef);
  assert.ok(hedefler('projelerim').includes('.proj-track'));
  assert.ok(hedefler('proje-detay').includes('.td-addbtn'));
  assert.ok(hedefler('proje-detay').includes('.td-tools'));
  assert.ok(hedefler('brans').includes('.player-controls'));
  assert.ok(hedefler('brans').includes('.feedback .wave-wrap'));
});

test('sayfalar öğreticiyi yükler', () => {
  for (const s of ['my-projects.html', 'aerobik.html', 'akrobatik.html', 'artistik.html', 'ritmik.html', 'cocuk-fitness.html']) {
    const h = oku(s);
    assert.match(h, /<script src="ogretici-turlar\.js\?v=\d+"><\/script><script src="ogretici\.js\?v=\d+" data-sayfa="(projelerim|brans)"><\/script>/, s);
    assert.match(h, /ogretici\.css\?v=\d+/, s);
  }
});

test('menüye ÖĞRETİCİ eklenir; Esc ile kapanır; görüldü bilgisi saklanır', () => {
  const j = oku('ogretici.js');
  assert.match(j, /ÖĞRETİCİ/);
  assert.match(j, /e\.key === 'Escape'/);
  assert.match(j, /localStorage\.setItem\(gorulduAnahtari\(/);
});
