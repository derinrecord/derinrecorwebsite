const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const H = require('../harmonic-set.js');

const parca = (id, camelot, bpm, energy) => ({ id, title: id, camelot, bpm, energy });

// Kaba kuvvet: bütün dizilişleri deneyip en yüksek zincir puanını bulur.
// autoOrder'ın bulduğu sıra bundan kötü olamaz.
function enIyiPuan(liste) {
  const dizi = liste.slice();
  let en = -Infinity;
  const gez = (kalan, sira) => {
    if (!kalan.length) {
      const p = H.zincirPuanu(sira);
      if (p > en) en = p;
      return;
    }
    kalan.forEach((x, i) => {
      const yeni = kalan.slice();
      yeni.splice(i, 1);
      gez(yeni, sira.concat(x));
    });
  };
  gez(dizi, []);
  return en;
}

test('camelot anahtarı yalnız geçerli numara ve harfi kabul eder', () => {
  assert.deepEqual(H.parseKey('8A'), { n: 8, L: 'A' });
  assert.deepEqual(H.parseKey(' 12b '), { n: 12, L: 'B' });
  ['', '0A', '13A', '8C', 'A8', null, undefined, '8'].forEach(girdi => {
    assert.equal(H.parseKey(girdi), null, girdi + ' geçersiz sayılmalı');
  });
});

test('ton ilişkisi camelot çarkındaki standart geçişleri tanır', () => {
  assert.equal(H.relation('8A', '8A').tip, 'Aynı ton');
  assert.equal(H.relation('8A', '8B').tip, 'Paralel majör↔minör');
  assert.equal(H.relation('8A', '9A').tip, 'Enerji artışı (+1)');
  assert.equal(H.relation('9A', '8A').tip, 'Yumuşak iniş (−1)');
  assert.equal(H.relation('8A', '10A').tip, 'Enerji sıçraması (+2)');
  assert.equal(H.relation('8A', '3A').tip, 'Yükseltme (+7)');
  // Numara 12'den 1'e sarar.
  assert.equal(H.relation('12A', '1A').tip, 'Enerji artışı (+1)');
  // Uymayan çift "çalınmaz" değil, "köprü gerekir" demektir.
  assert.equal(H.relation('8A', '2B'), null);
  assert.equal(H.relation('8A', null), null);
});

test('tempo ölçüsü yarım/çift tempoyu kopukluk saymaz', () => {
  assert.equal(H.tempo({ bpm: 124 }, { bpm: 126 }).tip, 'aynı hız');
  assert.equal(H.tempo({ bpm: 124 }, { bpm: 129 }).tip, 'yakın hız');
  assert.equal(H.tempo({ bpm: 124 }, { bpm: 134 }).tip, 'hız kayması');
  assert.equal(H.tempo({ bpm: 124 }, { bpm: 62 }).tip, 'yarım/çift tempo');
  assert.equal(H.tempo({ bpm: 124 }, { bpm: 95 }).tip, 'uyumsuz hız');
  assert.equal(H.tempo({ bpm: null }, { bpm: 124 }).tip, 'bilinmiyor');
  assert.equal(H.tempo({ bpm: 124 }, { bpm: 95 }).ceza, 45);
});

test('puan ton ilişkisi yoksa sonsuz eksi, tempo kötüyse belirgin düşük', () => {
  assert.equal(H.score(parca('a', '8A', 120), parca('b', '2B', 120)), -Infinity);

  const yakin = H.score(parca('a', '8A', 120, 5), parca('b', '9A', 122, 6));
  // 10 BPM fark = hız kayması (ceza 14); 13 BPM zaten uyumsuz sınıra girer.
  const kayma = H.score(parca('a', '8A', 120, 5), parca('b', '9A', 130, 6));
  assert.ok(yakin > kayma, 'tempo yakınken puan yüksek olmalı');

  const kopuk = H.score(parca('a', '8A', 124, 5), parca('b', '9A', 95, 5));
  assert.ok(kopuk < kayma, 'uyumsuz tempo en dibe inmeli');

  // İki komşu arasında 6 BPM'lik pencere köprüyle kapanabilir.
  const bilanco = H.autoOrder([parca('x', '8A', 120, 5), parca('y', '9A', 121, 5)]);
  assert.ok(H.zincirPuanu(bilanco) > 0);
});

test('otomatik sıralama kaba kuvvetle bulunan en iyi diziyi yakalar', () => {
  const liste = [
    parca('a', '8A', 120, 4),
    parca('b', '9A', 122, 5),
    parca('c', '10A', 124, 6),
    parca('d', '10B', 124, 5),
    parca('e', '8A', 118, 3)
  ];
  const sira = H.autoOrder(liste);
  assert.equal(sira.length, 5, 'her parça dizide kalmalı');
  assert.equal(new Set(sira.map(t => t.id)).size, 5, 'parça tekrar etmemeli');
  assert.equal(H.zincirPuanu(sira), enIyiPuan(liste), 'bulunan dizi en iyiden kötü olamaz');
});

test('sıralama tonu olmayan parçayı dışarıda bırakır, sırasını korur', () => {
  const tonsuz1 = { id: 'n1', title: 'n1', camelot: null, bpm: 120 };
  const tonsuz2 = { id: 'n2', title: 'n2', camelot: 'yok', bpm: 120 };
  const sira = H.autoOrder([parca('a', '8A', 120, 5), tonsuz1, tonsuz2, parca('b', '9A', 121, 5)]);
  assert.deepEqual(sira.map(t => t.id), ['a', 'b', 'n1', 'n2']);
});

test('sıralama ulaşılamayan parçayı uca atar, bağlanabilen ikiliyi bozmaz', () => {
  // 4B setteki hiçbir parçaya bağlanmıyor; bu yüzden tek kopuk geçiş
  // kaçınılmaz. Ölçülen şey kopukluğun yokluğu değil, yeridir: motor
  // bağlanabilen ikiliyi (8A → 8B) koruyup kopukluğu zincirin ucuna koyar.
  const sira = H.autoOrder([
    parca('a', '8A', 120, 5),
    parca('kopuk', '4B', 120, 5),
    parca('b', '8B', 120, 5)
  ]);
  const adlar = sira.map(t => t.id).join(' → ');
  assert.deepEqual(sira.map(t => t.id), ['a', 'b', 'kopuk'], 'sıra: ' + adlar);
  const gecis = H.gecisler(sira);
  assert.equal(gecis[0].seviye, 'iyi', 'bağlanabilen geçiş bozulmamalı: ' + adlar);
  assert.equal(gecis.filter(g => g.seviye === 'uyumsuz').length, 1,
    'tek kopukluk, o da ulaşılamayan parçaya giden geçiş olmalı: ' + adlar);
  assert.equal(gecis[gecis.length - 1].sonraki.id, 'kopuk', 'kopukluk uçta olmalı: ' + adlar);
  assert.ok(gecis[gecis.length - 1].sorunlar.includes('ton uyumsuz'));
});

test('geçişler üç seviyede okunur ve sorunu adıyla yazar', () => {
  const iyi = H.gecisler([parca('a', '8A', 120, 5), parca('b', '9A', 121, 6)])[0];
  assert.equal(iyi.seviye, 'iyi');
  assert.equal(iyi.iliski.tip, 'Enerji artışı (+1)');
  assert.equal(iyi.hiz.tip, 'aynı hız');
  assert.deepEqual(iyi.sorunlar, []);

  const zorlama = H.gecisler([parca('a', '8A', 120, 5), parca('b', '10A', 127, 5)])[0];
  assert.equal(zorlama.seviye, 'zorlama');
  assert.ok(zorlama.sorunlar.includes('ton geçişi zorlama'));
  assert.ok(zorlama.sorunlar.includes('tempo kayması'));

  const uyumsuz = H.gecisler([parca('a', '8A', 124, 5), parca('b', '4B', 95, 5)])[0];
  assert.equal(uyumsuz.seviye, 'uyumsuz');
  assert.ok(uyumsuz.sorunlar.includes('ton uyumsuz'));
  assert.ok(uyumsuz.sorunlar.includes('tempo uyumsuz'));
});

test('köprü parçası iki komşuya da bağlanan tonu ve kesişen hız aralığını verir', () => {
  const k = H.kopru(parca('a', '8A', 120, 5), parca('b', '8B', 124, 5));
  assert.ok(k.tonlar.length, 'en az bir köprü tonu olmalı');
  k.tonlar.forEach(ton => {
    assert.ok(H.relation('8A', ton), ton + ' önceki parçaya bağlanmalı');
    assert.ok(H.relation(ton, '8B'), ton + ' sonraki parçaya bağlanmalı');
  });
  assert.equal(k.tekParca, true);
  // 120 ve 124 arası: kesişim [118, 126] değil, komşuların toleransları kesişimi.
  assert.ok(k.bpmMin <= 124 && k.bpmMax >= 120, 'hedef hız iki komşuyu da tutmalı');

  // 70 BPM'lik fark tek parçayla kapanmaz.
  const uzak = H.kopru(parca('a', '8A', 100, 5), parca('b', '8B', 170, 5));
  assert.equal(uzak.tekParca, false);
  assert.match(uzak.not, /tek köprü ikisini de tutmaz/);
  assert.ok(uzak.bpmMin <= uzak.bpmMax, 'yine de bir hedef aralık verilmeli');
});

test('çıkış ve giriş tonları yönlü listelenir', () => {
  const cikis = H.cikilanTonlar(parca('a', '8A', 120, 5)).map(x => x.ton);
  const giris = H.girilenTonlar(parca('a', '8A', 120, 5)).map(x => x.ton);
  assert.ok(cikis.includes('9A') && cikis.includes('7A'), '8A\'dan +1 ve −1 komşulara çıkılır');
  assert.ok(giris.includes('7A') && giris.includes('9A'));
  // Yön önemli: 8A → 3A (+7) geçerli, tersi değil.
  assert.ok(cikis.includes('3A'));
  assert.ok(!giris.includes('3A'), '3A → 8A yükseltme değil');
  assert.equal(H.cikilanTonlar({ camelot: null }).length, 0);
  assert.equal(H.girilenTonlar({ camelot: 'yok' }).length, 0);
});

test('hız farkı büyükse köprü iki adıma bölünür: her adımın tonu ve hızı ayrı verilir', () => {
  const k = H.kopru(parca('a', '8A', 100, 5), parca('b', '8B', 170, 5));
  assert.equal(k.tekParca, false);
  assert.ok(k.ikiAdim, 'iki adımlı yol verilmeli');
  // Her adım kendi komşusunun hızına yakın olmalı.
  assert.ok(k.ikiAdim.birinci.bpmMin <= 100 && k.ikiAdim.birinci.bpmMax >= 100);
  assert.ok(k.ikiAdim.ikinci.bpmMin <= 170 && k.ikiAdim.ikinci.bpmMax >= 170);
  // Tonlar gerçekten zincir kurmalı: a → 1. köprü → 2. köprü → b
  k.ikiAdim.birinci.tonlar.forEach(ton => {
    assert.ok(H.relation('8A', ton), ton + ' önceki parçaya bağlanmalı');
  });
  k.ikiAdim.ikinci.tonlar.forEach(ton => {
    assert.ok(H.relation(ton, '8B'), ton + ' sonraki parçaya bağlanmalı');
  });
  assert.ok(k.ikiAdim.ornek.length, 'örnek zincir verilmeli');
  k.ikiAdim.ornek.forEach(o => {
    assert.ok(H.relation('8A', o.birinci) && H.relation(o.birinci, o.ikinci) && H.relation(o.ikinci, '8B'),
      o.birinci + ' → ' + o.ikinci + ' zinciri tutmalı');
  });
  // Tek köprü yettiğinde iki adım önerilmez.
  assert.equal(H.kopru(parca('a', '8A', 120, 5), parca('b', '8B', 124, 5)).ikiAdim, null);
});

test('uymayanlar komşusuna bağlanmayan parçayı ve sebebini bulur', () => {
  const set = [parca('a', '8A', 120, 5), parca('kopuk', '2B', 120, 5), parca('b', '9A', 120, 5)];
  const bulunan = H.uymayanlar(set);
  assert.equal(bulunan.length, 1);
  assert.equal(bulunan[0].parca.id, 'kopuk');
  assert.equal(bulunan[0].sira, 1);
  assert.match(bulunan[0].sebep, /setteki hiçbir parçaya/);

  // Tonu olmayan parça da sete giremez.
  const tonsuz = H.uymayanlar([parca('a', '8A', 120, 5), { id: 'x', camelot: null }]);
  assert.match(tonsuz[0].sebep, /Camelot tonu yok/);

  assert.deepEqual(H.uymayanlar([parca('a', '8A', 120, 5), parca('b', '9A', 121, 5)]), []);
});

test('setteki hiçbir parçaya bağlanmayan katalog parçası ayrılır', () => {
  const set = [parca('a', '8A', 120, 5), parca('b', '9A', 121, 5)];
  const katalog = [parca('uyan', '8B', 122, 5), parca('uymayan', '3B', 122, 5), parca('b', '9A', 121, 5)];
  const kalan = H.setDisiKalanlar(set, katalog).map(t => t.id);
  assert.deepEqual(kalan, ['uymayan'], 'sette olan ve uyan parça listelenmemeli');
});

test('uyumlu tonlar setteki parçalara en çok bağlanan anahtarları dizer', () => {
  const set = [parca('a', '8A', 120, 5), parca('b', '9A', 121, 5)];
  const tonlar = H.uyumluTonlar(set, 3).map(x => x.ton);
  assert.equal(tonlar.length, 3);
  tonlar.forEach(ton => {
    assert.ok(H.relation('8A', ton) || H.relation(ton, '8A'), ton + ' 8A ile bağlanmalı');
    assert.ok(H.relation('9A', ton) || H.relation(ton, '9A'), ton + ' 9A ile bağlanmalı');
  });
});

test('öneri bağlantısı ton ve hızı arama sorgusuna çevirir', () => {
  const sorgu = H.oneriSorgusu({ tonlar: ['8A', '8B'], bpmMin: 118, bpmMax: 124 });
  assert.equal(sorgu, '8A 8B 118-124 BPM mix');

  const l = H.aramaLinkleri(sorgu);
  assert.match(l.youtube, /^https:\/\/www\.youtube\.com\/results\?search_query=/);
  assert.match(l.spotify, /^https:\/\/open\.spotify\.com\/search\//);
  assert.ok(l.youtube.includes(encodeURIComponent(sorgu)), 'sorgu adrese kodlanmalı');
  assert.ok(l.spotify.includes(encodeURIComponent('118-124 BPM')));

  // Tek hız varsa aralık yazılmaz; hiç hız yoksa yalnız ton kalır.
  assert.equal(H.oneriSorgusu({ tonlar: ['8A'], bpmMin: 120, bpmMax: 120 }), '8A 120 BPM mix');
  assert.equal(H.oneriSorgusu({ tonlar: ['8A'] }), '8A mix');
});

test('ekran motoru kendi kopyasını taşımaz, ortak dosyayı kullanır', () => {
  const kok = path.join(__dirname, '..');
  const ekran = fs.readFileSync(path.join(kok, 'harmonic-mixer.js'), 'utf8');
  const sayfa = fs.readFileSync(path.join(kok, 'harmonic-mixer.html'), 'utf8');
  ['function autoOrder', 'function relation', 'function score'].forEach(eski =>
    assert.ok(!ekran.includes(eski), eski + ' artık motorda olmalı'));
  assert.ok(ekran.includes('window.DerinHarmonicSet'), 'ekran ortak motoru kullanmalı');
  assert.ok(ekran.includes('H.autoOrder') && ekran.includes('H.gecisler') && ekran.includes('H.kopru'),
    'sıralama, geçiş ve köprü hesabı motordan gelmeli');
  // Motor, ekrandan önce yüklenmeli; yoksa ekran boş açılır.
  assert.ok(sayfa.indexOf('harmonic-set.js') < sayfa.indexOf('harmonic-mixer.js'),
    'motor ekrandan önce yüklenmeli');
});
