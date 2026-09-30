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
  // Sınır 5: 129 tam sınırda kalır, 130 bir adım öteye geçer.
  assert.equal(H.tempo({ bpm: 124 }, { bpm: 129 }).tip, 'yakın hız');
  assert.equal(H.tempo({ bpm: 124 }, { bpm: 130 }).tip, 'hız kayması');
  assert.equal(H.tempo({ bpm: 124 }, { bpm: 136 }).tip, 'hız kayması');
  assert.equal(H.tempo({ bpm: 124 }, { bpm: 62 }).tip, 'yarım/çift tempo');
  assert.equal(H.tempo({ bpm: 124 }, { bpm: 95 }).tip, 'uyumsuz hız');
  assert.equal(H.tempo({ bpm: null }, { bpm: 124 }).tip, 'bilinmiyor');
  assert.equal(H.tempo({ bpm: 124 }, { bpm: 95 }).ceza, H.HIZ_COK_CEZA);
  assert.equal(H.tempo({ bpm: 124 }, { bpm: 130 }).ceza, H.HIZ_AYIR_CEZA);
});

test('ton uyumlu olsa da hız farkı 5 BPM`i aşan çift yan yana sayılmaz', () => {
  const a = parca('a', '8A', 124);
  assert.equal(H.yanYana(a, parca('b', '9A', 129)), true, '5 BPM sınırda kalır');
  assert.equal(H.yanYana(a, parca('b', '9A', 130)), false, '6 BPM sınırı aşar');
  // Yarım/çift tempo bilinçli tercih: kural onu engellemez (124 ↔ 62).
  assert.equal(H.yanYana(a, parca('b', '9A', 62)), true);
  // Ton tutmuyorsa hız ne olursa olsun yan yana gelmez.
  assert.equal(H.yanYana(a, parca('b', '2B', 124)), false);
  // Hız bilinmiyorsa eksik veri ihlal sayılmaz; sıralama kilitlenmesin.
  assert.equal(H.yanYana(parca('a', '8A', null), parca('b', '9A', 124)), true);
  // Geçiş listesi de aynı kararı taşır.
  assert.equal(H.gecisler([a, parca('b', '9A', 129)])[0].yanYana, true);
  assert.equal(H.gecisler([a, parca('b', '9A', 130)])[0].yanYana, false);
  assert.equal(H.gecisler([a, parca('b', '2B', 124)])[0].yanYana, false);
});

test('sıralayıcı ton uyumlu ama hızı uzak çifti ayırır, kaçınılmazsa köprü önerir', () => {
  // a ile b komşu ton (8A → 9A) ama 10 BPM uzak. c araya girince iki komşuluk da
  // hız sınırına yaklaşıyor; motor a-b'yi yan yana koymamalı.
  const a = parca('a', '8A', 120), b = parca('b', '9A', 130), c = parca('c', '10A', 120);
  const sira = H.autoOrder([a, b, c]);
  const adlar = sira.map(t => t.id).join(' → ');
  const uzaklik = Math.abs(sira.findIndex(t => t.id === 'a') - sira.findIndex(t => t.id === 'b'));
  assert.notEqual(uzaklik, 1, 'a ile b yan yana gelmemeli: ' + adlar);
  assert.equal(H.zincirPuanu(sira), enIyiPuan([a, b, c]), 'yine en iyi diziliş: ' + adlar);

  // Başka çare yoksa (iki parçalık set) yan yana gelirler; ekran bunu söyleyip
  // araya girecek parçanın tonunu ve hızını verir.
  const tek = H.gecisler([a, b])[0];
  assert.equal(tek.yanYana, false);
  assert.equal(tek.seviye, 'zorlama');
  assert.ok(tek.sorunlar.some(s => /ton uyumlu ama 10 BPM fark/.test(s)), tek.sorunlar.join(', '));
  const k = H.kopru(a, b);
  assert.equal(k.tekParca, true, '120–130 arası tek köprüyle kapanır');
  assert.ok(Math.abs(k.bpmMin - 120) <= 5 && Math.abs(k.bpmMin - 130) <= 5,
    'köprü hızı iki komşuyu da tutmalı: ' + k.bpmMin);
  assert.ok(k.tonlar.length, 'köprü tonu önerilmeli: ' + k.tonlar.join(', '));
});

test('puan ton ilişkisi yoksa sonsuz eksi, tempo kötüyse belirgin düşük', () => {
  assert.equal(H.score(parca('a', '8A', 120), parca('b', '2B', 120)), -Infinity);

  const yakin = H.score(parca('a', '8A', 120, 5), parca('b', '9A', 122, 6));
  // 10 BPM fark = hız kayması; ceza ton kazancından büyük olduğu için bu
  // komşuluk kârlı çıkmaz (13 BPM zaten uyumsuz sınıra girer).
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

test('tonu olmayan parça yerel puana girmez, hız sırasına yerleşir', () => {
  // Yerel puana giremezler (komşuluk her yerde kopuk) ama tempoları var: setin
  // yayını bozmasınlar diye hız sırasındaki yerlerine konur.
  const tonsuz1 = { id: 'n1', title: 'n1', camelot: null, bpm: 120 };
  const tonsuz2 = { id: 'n2', title: 'n2', camelot: 'yok', bpm: 126 };
  const sira = H.autoOrder([parca('a', '8A', 118, 5), tonsuz1, tonsuz2, parca('b', '9A', 124, 5)]);
  assert.deepEqual(sira.map(t => t.id), ['a', 'n1', 'b', 'n2'],
    '118 → 120 → 124 → 126: eğri zikzak yapmamalı');
  // Hızı bilinmeyen parça listenin sonunda kalır.
  const bilinmez = { id: 'x', title: 'x', camelot: null, bpm: null };
  const sonrasi = H.autoOrder([parca('a', '8A', 120, 5), parca('b', '9A', 121, 5), bilinmez]);
  assert.equal(sonrasi[sonrasi.length - 1].id, 'x');
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

test('set yayı ölçülür: inişler, zirvenin yeri ve yarı ortalamaları', () => {
  const duz = H.yay([parca('a', '8A', 100), parca('b', '9A', 110), parca('c', '10A', 120)]);
  assert.equal(duz.yukselen, true);
  assert.equal(duz.inisSayi, 0);
  assert.equal(duz.ilk, 100);
  assert.equal(duz.son, 120);
  assert.equal(duz.zirve.id, 'c');
  assert.equal(duz.zirveYeri, 2);
  assert.equal(duz.puan, 0, 'düzgün yükselen set yaydan ceza yemez');

  // Geriye düşen adım: 20 BPM'lik iniş sayılır ve cezalanır.
  const zikzak = H.yay([parca('a', '8A', 120), parca('b', '9A', 100), parca('c', '10A', 130)]);
  assert.equal(zikzak.inisSayi, 1);
  assert.equal(zikzak.inisToplam, 20);
  assert.equal(zikzak.yukselen, false);
  assert.ok(H.inisCeza(parca('a', '8A', 120), parca('b', '9A', 100)) > 0);

  // 2 BPM'e kadar iniş "yumuşak iniş" sayılır, sorun değildir.
  assert.equal(H.yay([parca('a', '8A', 120), parca('b', '9A', 118)]).inisSayi, 0);
  assert.equal(H.yay([parca('a', '8A', 120), parca('b', '9A', 117)]).inisSayi, 1);
  // Aynı hızdaki set yaydan ceza yemez (zirvede eşitlik keyfi sırayı cezalandırmasın).
  assert.equal(H.yayPuanu([parca('a', '8A', 124), parca('b', '9A', 124), parca('c', '10A', 124)]), 0);
});

test('puan yön duyarlı: aynı çift yükselirken daha yüksek puan alır', () => {
  // Paralel ton: iki yönde de ton kazancı aynı, fark yalnız hızın yönünde.
  const yukari = H.score(parca('a', '8A', 122), parca('b', '8B', 128));
  const asagi = H.score(parca('a', '8B', 128), parca('b', '8A', 122));
  assert.ok(yukari > asagi, 'yükselen adım daha iyi: ' + yukari + ' > ' + asagi);
  const g = H.gecisler([parca('a', '8A', 128), parca('b', '9A', 122)])[0];
  assert.ok(g.inis && g.inis.dusus === 6, 'iniş kaydedilmeli');
  assert.ok(g.sorunlar.some(s => /hızdan yavaşa dönüş/.test(s)), g.sorunlar.join(', '));
  assert.equal(H.gecisler([parca('a', '8A', 122), parca('b', '9A', 128)])[0].inis, null);
});

test('sıralayıcı seti yavaştan hızlıya dizer', () => {
  // Aynı ton zinciri ters yönde de kurulabilir; yay terimi yavaştan hızlıya olanı
  // seçmeli: en yavaş parça başta, en hızlı parça sonda.
  const liste = [
    parca('hizli', '9A', 132, 6), parca('orta', '8A', 124, 5),
    parca('yavas', '8A', 112, 3), parca('kopuk', '4B', 100, 2)
  ];
  const sira = H.autoOrder(liste);
  const adlar = sira.map(t => t.id + '(' + t.bpm + ')').join(' → ');
  const y = H.yay(sira);
  assert.equal(y.inisSayi, 0, 'tek tek hız düşüşü olmamalı: ' + adlar);
  assert.equal(y.zirve.id, 'hizli', 'en hızlı parça sonda olmalı: ' + adlar);
  assert.equal(y.zirveYeri, sira.length - 1, adlar);
  assert.equal(sira[0].id, y.enYavas.id, 'en yavaş parça başta olmalı: ' + adlar);
  assert.equal(y.enYavas.id, 'kopuk', '100 BPM\'lik parça yürürlüğe girsin: ' + adlar);
  assert.equal(y.puan, 0, 'yay cezasız: ' + adlar);
  assert.equal(H.zincirPuanu(sira), enIyiPuan(liste), adlar);
});

test('hedef hız açıkken yakın hızlar sabitlenmiş sayılır', () => {
  const yakin = parca('a', '8A', 122), hizli = parca('b', '8A', 130);
  assert.equal(H.yanYana(yakin, hizli), false, 'hedef kapalıyken 8 BPM uzak');
  H.hizAyari({ hedef: 126, tolerans: 4 });
  try {
    assert.deepEqual(H.hizAyari(), { hedef: 126, tolerans: 4 });
    assert.equal(H.etkinBpm(yakin), 126, 'hedef civarı hedefe çekilir');
    assert.equal(H.etkinBpm(parca('c', '9A', 131)), 131, 'hedefin dışı kendi hızında kalır');
    assert.equal(H.etkinBpm(parca('c', '9A', null)), 0);
    assert.equal(H.hizBolumu(yakin), 'ana');
    assert.equal(H.hizBolumu(parca('c', '9A', 96)), 'giris');
    assert.equal(H.hizBolumu(parca('c', '9A', 131)), 'hizli');
    assert.equal(H.hizBolumu({ camelot: '9A', bpm: null }), null);
    assert.equal(H.sabitlenen(yakin), true);
    assert.equal(H.sabitlenen(parca('c', '9A', 133)), false);

    const t = H.tempo(yakin, hizli);
    assert.equal(t.fark, 0, 'sabitlenen çift arasında duyulur fark yok');
    assert.equal(t.hamFark, 8, 'gerçek fark yanında taşınır');
    assert.equal(t.tip, 'aynı hız');
    assert.equal(H.yanYana(yakin, hizli), true);
    assert.equal(H.inisCeza(yakin, hizli), 0, 'sabitlenen çift yay cezası yemez');

    // Köprü önerisi de hedef hız üzerinden verilir: kullanıcı zaten orada çalıyor.
    const k = H.kopru(yakin, parca('c', '9A', 131));
    assert.ok(Math.abs(k.bpmMin - 126) <= 5 && Math.abs(k.bpmMin - 131) <= 5,
      'köprü hızı hedefe göre: ' + k.bpmMin);
  } finally {
    H.hizAyari({ hedef: null });
  }
  assert.equal(H.hizAyari().hedef, null, 'test sonunda ayar nötre döner');
  assert.equal(H.etkinBpm(yakin), 122);
});

test('hedef hız açıkken set açılış → ana → hızlı bölüm diye dizilir', () => {
  const liste = [
    parca('kopuk', '4B', 96, 7), parca('yukselis', '10B', 126, 6), parca('sahil', '9B', 125, 5),
    parca('gece', '9A', 124, 5), parca('kapadokya', '8A', 122, 4),
    parca('hizli', '8A', 130, 6), parca('vardiya', '9A', 131, 6)
  ];
  H.hizAyari({ hedef: 126, tolerans: 4 });
  try {
    const sira = H.autoOrder(liste);
    const adlar = sira.map(t => t.id + '(' + H.hizBolumu(t) + ')' + t.bpm).join(' → ');
    const bolum = sira.map(t => ({ giris: 0, ana: 1, hizli: 2 })[H.hizBolumu(t)]);
    assert.ok(bolum.every((v, i) => i === 0 || v >= bolum[i - 1]), 'blok sırası bozulmamalı: ' + adlar);
    assert.equal(sira[0].id, 'kopuk', 'açılıştaki yavaş parça başta: ' + adlar);
    assert.equal(sira[sira.length - 1].id, 'vardiya', 'hızlı bölüm sonda: ' + adlar);
    const y = H.yay(sira);
    assert.equal(y.inisSayi, 0, 'tek tek hız düşüşü olmamalı (plato düz): ' + adlar);
    assert.equal(y.yukselen, true, adlar);
    assert.equal(y.son, 131, 'set hızlı bölümde kapanır: ' + adlar);
    // Sabitlenen komşular arasında hız farkı kalmadığı için geçişler "iyi".
    const iyi = H.gecisler(sira).filter(g => g.seviye === 'iyi').length;
    assert.ok(iyi >= 5, 'yalnız kopuk geçiş sorun olmalı: ' + adlar);
  } finally {
    H.hizAyari({ hedef: null });
  }
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

test('tarz etiketi tempo, enerji ve makamdan okunur', () => {
  assert.equal(H.tarzEtiketi({ bpm: 122, energy: 5 }), 'melodic house');
  assert.equal(H.tarzEtiketi({ bpm: 96, energy: 3 }), 'downtempo / lounge (sakin)');
  assert.equal(H.tarzEtiketi({ bpm: 140, energy: 8 }), 'yüksek enerji / tech (yoğun)');
  assert.equal(H.tarzEtiketi({ bpm: 112 }), 'organik deep house');
  assert.match(H.tarzEtiketi({ bpm: 122, energy: 5, makam: 'Hicaz' }), /^Anadolu elektronik · melodic house$/);
  assert.equal(H.tarzEtiketi({ bpm: null }), 'tempo bilinmiyor');
});

test('sanatçı profili katalogdaki parçalardan tarz imzası çıkarır', () => {
  const katalog = [
    { id: 'k1', artist: 'Mahmut Orhan', camelot: '8A', bpm: 122, energy: 4 },
    { id: 'k2', artist: 'Mahmut Orhan', camelot: '8A', bpm: 124, energy: 6, makam: 'Hicaz' },
    { id: 'k3', artist: 'Ilkay Sencan', camelot: '9A', bpm: 125, energy: 6 },
    { id: 'k4', artist: '  ', camelot: '9A', bpm: 120, energy: 5 }
  ];
  const profiller = H.sanatciProfilleri(katalog);
  assert.equal(profiller.length, 2, 'sanatçısı girilmemiş parça profil oluşturmaz');
  const m = profiller.find(x => x.sanatci === 'Mahmut Orhan');
  assert.equal(m.bpm, 123, 'ortalama hız');
  assert.equal(m.enerji, 5, 'ortalama enerji');
  assert.deepEqual(m.enCokTonlar, ['8A']);
  assert.equal(m.parcalar.length, 2);
  assert.match(m.tarz, /^Anadolu elektronik · melodic house$/);
});

test('katalogdan sete uyan sanatçılar hem ton hem hız süzgecinden geçer', () => {
  const set = [{ id: 's1', title: 'A', artist: 'Konuk', camelot: '8A', bpm: 122, energy: 5 }];
  const uyan = { id: 'k1', title: 'Uyan', artist: 'Mahmut Orhan', camelot: '8A', bpm: 124, energy: 5 };
  const hizUzak = { id: 'k2', title: 'Hız Uzak', artist: 'Hızlı', camelot: '8A', bpm: 140, energy: 5 };
  const tonUzak = { id: 'k3', title: 'Ton Uzak', artist: 'Uzak', camelot: '2B', bpm: 123, energy: 5 };
  assert.equal(H.settekiYeri(set, uyan).length, 1);
  assert.equal(H.settekiYeri(set, hizUzak).length, 0, 'ton uysa da 18 BPM uzak parça yan yana gelmez');
  assert.equal(H.settekiYeri(set, tonUzak).length, 0);
  // Sette olan parça kendi sanatçısını tekrar önermez; yalnız uyan sanatçı kalır.
  const oneriler = H.uyumluSanatcilar(set, [uyan, hizUzak, tonUzak].concat(set), 5);
  assert.deepEqual(oneriler.map(x => x.sanatci), ['Mahmut Orhan']);
  assert.deepEqual(oneriler[0].parcalar.map(t => t.id), ['k1']);
  assert.equal(oneriler[0].bpmMin, 124);
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

  // Sanatçı/tarz verilirse sorgu o tarza bağlanır: öneri parçanın tarzını taşır.
  assert.equal(
    H.oneriSorgusu({ sanatci: 'Mahmut Orhan', tarz: 'melodic house', tonlar: ['8A', '8B'], bpmMin: 118, bpmMax: 124 }),
    'Mahmut Orhan benzeri melodic house 8A 8B 118-124 BPM mix');
  assert.equal(H.oneriSorgusu({ sanatci: 'Mahmut Orhan' }), 'Mahmut Orhan benzeri mix');
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
