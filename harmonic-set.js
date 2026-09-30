// Harmonik set motoru: saf hesap, DOM yok.
//
// Burada kalan tek karar "hangi parça hangisinin ardından gelir" sorusudur.
// Üç ölçüte bakılır: Camelot ton ilişkisi, tempo (BPM) yakınlığı ve enerji
// akışı. Ton ilişkisi yoksa geçiş kopuktur; tempo farkı büyükse köprü parçası
// ya da hız kaydırması gerekir. Ekran bu dosyadaki sonuçları yalnız yazar.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.DerinHarmonicSet = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, () => {
  // Camelot anahtarı: <numara><harf>. A minör, B majör halkası.
  function parseKey(deger) {
    const m = /^(\d{1,2})([AB])$/i.exec(String(deger == null ? '' : deger).trim());
    if (!m) return null;
    const n = Number(m[1]);
    if (n < 1 || n > 12) return null;
    return { n, L: m[2].toUpperCase() };
  }

  const wrap = n => ((n - 1 + 12) % 12) + 1;

  const TUM_TONLAR = (() => {
    const liste = [];
    for (let n = 1; n <= 12; n++) liste.push(n + 'A', n + 'B');
    return liste;
  })();

  // Camelot çarkındaki standart geçişler. Uymayan çift null döner; bu "çalınmaz"
  // demek değil, "köprü ya da kaydırma gerekir" demektir.
  function relation(from, to) {
    const a = parseKey(from), b = parseKey(to);
    if (!a || !b) return null;
    if (a.n === b.n && a.L === b.L) return { tip: 'Aynı ton', sinif: 'ok', puan: 5 };
    if (a.n === b.n) return { tip: 'Paralel majör↔minör', sinif: 'ok', puan: 5 };
    if (a.L === b.L && wrap(a.n + 1) === b.n) return { tip: 'Enerji artışı (+1)', sinif: 'up', puan: 6 };
    if (a.L === b.L && wrap(a.n - 1) === b.n) return { tip: 'Yumuşak iniş (−1)', sinif: 'ok', puan: 4 };
    if (a.L === b.L && wrap(a.n + 2) === b.n) return { tip: 'Enerji sıçraması (+2)', sinif: 'up', puan: 2 };
    if (a.L === b.L && wrap(a.n + 7) === b.n) return { tip: 'Yükseltme (+7)', sinif: 'up', puan: 2 };
    return null;
  }

  // Tempo ölçüsü. Eşikler DJ pratiğinden: 3 BPM'e kadar fark duyulmaz, 5 BPM
  // perde kaydırmasıyla kapanır. 5 BPM'i aşan iki parça ton tutsa bile yan yana
  // konmaz: 6–12 BPM arası araya köprü ister, 12 BPM sonrası geçiş kendini belli
  // eder. Yarım/çift tempo (62 → 124) ayrı sayılır: kulakta kopukluk değildir.
  const HIZ_TOLERANS = 5;
  const HIZ_SINIR = 12;
  // Yan yana gelmemesi gereken çiftin cezası, en iyi ton geçişinin kazancından
  // (6 × 10 + 6 = 66) büyük olmalı. Böylece hız farkı 5 BPM'i aşan komşuluk
  // hiçbir zaman kârlı çıkmaz; sıralayıcı onu ancak başka çare yokken kabul
  // eder ve ekran köprü önerir.
  const HIZ_AYIR_CEZA = 70;
  const HIZ_COK_CEZA = 95;

  function tempo(a, b) {
    const x = Number(a && a.bpm) || 0, y = Number(b && b.bpm) || 0;
    if (!x || !y) return { fark: null, tip: 'bilinmiyor', ceza: 0 };
    const fark = Math.abs(x - y);
    if (fark <= 3) return { fark, tip: 'aynı hız', ceza: 0 };
    if (fark <= HIZ_TOLERANS) return { fark, tip: 'yakın hız', ceza: 3 };
    if (fark <= HIZ_SINIR) return { fark, tip: 'hız kayması', ceza: HIZ_AYIR_CEZA };
    const yarim = Math.min(Math.abs(x * 2 - y), Math.abs(x - y * 2));
    if (yarim <= 3) return { fark, tip: 'yarım/çift tempo', ceza: 6 };
    return { fark, tip: 'uyumsuz hız', ceza: HIZ_COK_CEZA };
  }

  // İki parça yan yana konabilir mi? Ton ilişkisi olmalı ve hız farkı 5 BPM'i
  // aşmamalı. Yarım/çift tempo kuralın dışında: 124 ile 62 yan yana gelebilir,
  // çünkü bu kopukluk değil bilinçli bir tercihtir. Hız bilinmiyorsa engel
  // konmaz; eksik veriyi ihlal saymak sıralamayı haksız yere kilitler.
  function yanYana(a, b) {
    if (!relation(a && a.camelot, b && b.camelot)) return false;
    const h = tempo(a, b);
    if (h.fark == null) return true;
    return h.fark <= HIZ_TOLERANS || h.tip === 'yarım/çift tempo';
  }

  // Set yayı (genel bakış). Yerel puan "bu iki parça uyar mı" der; setin eğrisini
  // görmez, çünkü tek tek bakıldığında 122 → 124 ile 124 → 122 eşit derecede
  // yakındır. Oysa set yavaştan hızlıya akmalı: adım adım hız düşüşü ve zirveyi
  // erken harcamak yayı bozar. Ölçüt O(n) kalır (sıralama yapılmaz).
  const INIS_TOLERANS = 2;   // 2 BPM'e kadar düşüş normal: "yumuşak iniş"
  const INIS_CEZA = 12;      // tolerans üstü her BPM için
  const YAY_CEZA = 3;        // ilk yarı ikinci yarıdan hızlıysa her BPM için
  const ZIRVE_CEZA = 10;     // zirveden sonra izin verilenden fazla parça başına
  const ZIRVE_PAYI = 0.2;    // setin en çok bu kadarı zirveden sonra gelebilir

  // Adım yönü: hızdan yavaşa dönmek yayı bozar. Tolerans içindeki küçük inişler
  // (aynı ton ilişkisindeki "yumuşak iniş" gibi) cezasız kalır.
  function inisCeza(a, b) {
    const x = Number(a && a.bpm) || 0, y = Number(b && b.bpm) || 0;
    if (!x || !y) return 0;
    const dusus = x - y;
    return dusus > INIS_TOLERANS ? (dusus - INIS_TOLERANS) * INIS_CEZA : 0;
  }

  const ortBpm = dizi => {
    const v = dizi.map(t => Number(t && t.bpm) || 0).filter(Boolean);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0;
  };

  // Zincirin tamamına bakışı: eğri yükseliyor mu, nerede geri düşüyor, zirve
  // nerede? Ekran bunu yazar; puanı da buradan türetilir ki ikisi ayrışmasın.
  function yay(set) {
    const sira = Array.isArray(set) ? set : [];
    const inisler = [];
    let inisToplam = 0;
    for (let i = 1; i < sira.length; i++) {
      const x = Number(sira[i - 1] && sira[i - 1].bpm) || 0;
      const y = Number(sira[i] && sira[i].bpm) || 0;
      if (!x || !y) continue;
      if (x - y > INIS_TOLERANS) {
        inisler.push({ sira: i, onceki: sira[i - 1], sonraki: sira[i], dusus: x - y });
        inisToplam += x - y;
      }
    }
    const yarim = Math.floor(sira.length / 2);
    const ilkYari = ortBpm(sira.slice(0, yarim));
    const ikinciYari = ortBpm(sira.slice(yarim));
    let zirve = sira[0] || null, zirveYeri = 0, enYavas = sira[0] || null, enYavasYeri = 0;
    sira.forEach((t, i) => {
      const v = Number(t && t.bpm) || 0;
      if (!v) return;
      // Zirvede eşitlik varsa en sondaki sayılır: aynı hızdaki parçaların
      // sırası keyfi olduğu için set yaydan haksız ceza yememeli.
      if (v >= (Number(zirve && zirve.bpm) || 0)) { zirve = t; zirveYeri = i; }
      if (v < (Number(enYavas && enYavas.bpm) || Infinity)) { enYavas = t; enYavasYeri = i; }
    });
    const sonrasi = sira.length - 1 - zirveYeri;
    const izinli = Math.floor(sira.length * ZIRVE_PAYI);
    const zirveCezasi = Math.max(0, sonrasi - izinli) * ZIRVE_CEZA;
    const yarimCezasi = Math.max(0, ilkYari - ikinciYari) * YAY_CEZA;
    // Ceza yokken -0 sızmasın: ekranda ve testte "0" olarak okunsun.
    const puan = zirveCezasi + yarimCezasi ? -(zirveCezasi + yarimCezasi) : 0;
    return {
      ilk: Number(sira[0] && sira[0].bpm) || null,
      son: Number(sira[sira.length - 1] && sira[sira.length - 1].bpm) || null,
      ilkYari: Math.round(ilkYari), ikinciYari: Math.round(ikinciYari),
      zirve, zirveYeri, zirveSonrasi: sonrasi, zirveCezasi,
      enYavas, enYavasYeri, yarimCezasi,
      inisler, inisSayi: inisler.length, inisToplam,
      yukselen: inisler.length === 0 && yarimCezasi === 0,
      puan
    };
  }

  const yayPuanu = sira => yay(sira).puan;

  // Tek geçişin puanı. Ton ilişkisi yoksa -Infinity: zincire hiç girmez. Puan
  // yön duyarlıdır: hızdan yavaşa dönmek "inisCeza" ile ayrıca düşer.
  function score(a, b) {
    const r = relation(a && a.camelot, b && b.camelot);
    if (!r) return -Infinity;
    let s = r.puan * 10 - tempo(a, b).ceza - inisCeza(a, b);
    const ea = Number(a && a.energy) || 0, eb = Number(b && b.energy) || 0;
    if (ea && eb) {
      const d = eb - ea;
      if (d >= 0 && d <= 2) s += 6;      // hafif yükseliş: setin en rahat akışı
      else if (d > 3) s -= 4;            // ani sıçrama kopukluk yaratır
      else if (d < -2) s -= 6;           // sert düşüş dinleyiciyi düşürür
    }
    return s;
  }

  // Zincir toplamı: kopuk geçiş sonsuz ceza yerine sabit büyük ceza alır ki
  // sıralayıcı iki kopuk zincirden az kopuk olanı seçebilsin.
  const KOPUK_CEZA = -300;
  const baglantiPuanu = (a, b) => {
    const p = score(a, b);
    return p === -Infinity ? KOPUK_CEZA : p;
  };
  // Zincir puanı = yerel geçişler + setin genel yayı. Genel terim olmadan
  // sıralayıcı aynı komşuluk puanlarıyla hem 96 → 131 hem 131 → 96 dizisini
  // kurabilir; yay terimi yavaştan hızlıya olanı seçtirir.
  const zincirPuanu = sira =>
    sira.slice(1).reduce((toplam, x, i) => toplam + baglantiPuanu(sira[i], x), 0)
    + yayPuanu(sira);

  // Açgözlü zincir + iki-opt iyileştirme. Tonu olmayan parçalar sıralamaya
  // girmez, sonunda kendi aralarındaki sırayı korur.
  function autoOrder(list) {
    const hepsi = Array.isArray(list) ? list.slice() : [];
    const tonlu = hepsi.filter(t => parseKey(t && t.camelot));
    const tonsuz = hepsi.filter(t => !parseKey(t && t.camelot));
    if (tonlu.length < 2) return hepsi;

    const greedy = start => {
      const kalan = tonlu.filter(t => t.id !== start.id);
      const sira = [start];
      while (kalan.length) {
        const son = sira[sira.length - 1];
        let enIyi = -Infinity, enIdx = 0;
        kalan.forEach((t, i) => {
          const p = baglantiPuanu(son, t);
          if (p > enIyi) { enIyi = p; enIdx = i; }
        });
        sira.push(kalan[enIdx]);
        kalan.splice(enIdx, 1);
      }
      return sira;
    };

    let en = greedy(tonlu[0]), enPuan = zincirPuanu(en);
    for (const baslangic of tonlu.slice(1)) {
      const deneme = greedy(baslangic), p = zincirPuanu(deneme);
      if (p > enPuan) { en = deneme; enPuan = p; }
    }

    // Yerel arama. Üç hamle denenir: iki parçanın yerini değiştirme (swap),
    // bir parçayı başka yere kaydırma (insertion) ve bir bölütü ters çevirme
    // (reversal). Zincir puanı simetrik değildir — 8A→9A ile 9A→8A aynı puanı
    // vermez — bu yüzden yön de aranır. Yalnız swap, açgözlü çözümün
    // yakınındaki yerel en iyide takılı kalıyordu; kaydırma ve ters çevirme
    // onu gerçek en iyiye taşır. Her kabul puanı kesin artırdığı için döngü
    // sonludur; tur sınırı yine de var.
    const n = en.length;
    // Kaydırma O(n²) deneme × O(n) puan = O(n³); uzun setlerde yalnız
    // swap/reversal koşar (canlı set ~30 parça, sınır rahat yetiyor).
    const kaydirmaVar = n <= 60;
    const dene = dizi => {
      const p = zincirPuanu(dizi);
      if (p > enPuan + 1e-9) { en = dizi; enPuan = p; return true; }
      return false;
    };
    for (let tur = 0; tur < 60; tur++) {
      let iyilesti = false;
      for (let i = 0; i < n - 1; i++) {
        for (let j = i + 1; j < n; j++) {
          const takas = en.slice();
          const gecici = takas[i];
          takas[i] = takas[j];
          takas[j] = gecici;
          if (dene(takas)) iyilesti = true;
          const ters = en.slice(0, i).concat(en.slice(i, j + 1).reverse(), en.slice(j + 1));
          if (dene(ters)) iyilesti = true;
        }
      }
      if (kaydirmaVar) {
        for (let i = 0; i < n; i++) {
          for (let j = 0; j < n; j++) {
            if (i === j) continue;
            const kaydir = en.slice();
            const tasinan = kaydir.splice(i, 1)[0];
            kaydir.splice(j, 0, tasinan);
            if (dene(kaydir)) iyilesti = true;
          }
        }
      }
      if (!iyilesti) break;
    }

    // Tonu olmayan parçalar yerel puana giremez (komşuluk her yerde kopuk), ama
    // tempoları var. Setin yayını bozmasınlar diye hız sırasına göre yerleştirilir:
    // her parça, kendisinden yavaş olanların hemen ardına girer.
    const sonuc = en.slice();
    tonsuz.forEach(t => {
      const v = Number(t && t.bpm) || 0;
      let yer = sonuc.length;
      if (v) {
        yer = sonuc.findIndex(x => (Number(x && x.bpm) || Infinity) > v);
        if (yer < 0) yer = sonuc.length;
      }
      sonuc.splice(yer, 0, t);
    });
    return sonuc;
  }

  // Her geçişin okunur hâli: seviye 'iyi' | 'zorlama' | 'uyumsuz'.
  function gecisler(set) {
    const sira = Array.isArray(set) ? set : [];
    const out = [];
    for (let i = 1; i < sira.length; i++) {
      const onceki = sira[i - 1], sonraki = sira[i];
      const iliski = relation(onceki && onceki.camelot, sonraki && sonraki.camelot);
      const hiz = tempo(onceki, sonraki);
      const sorunlar = [];
      if (!iliski) sorunlar.push('ton uyumsuz');
      else if (iliski.puan <= 2) sorunlar.push('ton geçişi zorlama');
      if (hiz.tip === 'uyumsuz hız') sorunlar.push('tempo uyumsuz');
      else if (hiz.tip === 'hız kayması') {
        sorunlar.push('tempo kayması');
        // Ton tutuyor da olsa bu iki parça yan yana konmamalı: sebebi tek
        // cümlede yazılır ki köprünün neden gerektiği okunabilsin.
        if (iliski) sorunlar.push('ton uyumlu ama ' + hiz.fark + ' BPM fark var');
      }
      // Yay yönü: set yavaştan hızlıya akmalı, bu adım geriye dönüyor.
      const dusus = (Number(onceki && onceki.bpm) || 0) - (Number(sonraki && sonraki.bpm) || 0);
      const inis = dusus > INIS_TOLERANS ? { dusus, ceza: inisCeza(onceki, sonraki) } : null;
      if (inis) sorunlar.push('hızdan yavaşa dönüş (' + dusus + ' BPM)');
      const seviye = (!iliski || hiz.tip === 'uyumsuz hız') ? 'uyumsuz'
        : ((iliski.puan <= 2 || hiz.tip === 'hız kayması' || inis) ? 'zorlama' : 'iyi');
      out.push({
        sira: i, onceki, sonraki, iliski, hiz, sorunlar, seviye, inis,
        // Komşuluk kuralı: ton uyumlu + hız farkı en çok 5 BPM.
        yanYana: yanYana(onceki, sonraki),
        puan: baglantiPuanu(onceki, sonraki)
      });
    }
    return out;
  }

  // İki komşuya da ton olarak bağlanan anahtarlar: köprü parçasının tonu.
  function kopruTonlari(a, b) {
    return TUM_TONLAR
      .map(ton => {
        const ra = relation(a && a.camelot, ton), rb = relation(ton, b && b.camelot);
        return (ra && rb) ? { ton, puan: ra.puan + rb.puan } : null;
      })
      .filter(Boolean)
      .sort((x, y) => y.puan - x.puan);
  }

  // Bir parçadan doğrudan çıkılabilen tonlar: iki köprü gerektiğinde ilk
  // köprünün tonu bunlardan biri olmalı (önceki parça ona bağlanır).
  function cikilanTonlar(parca) {
    return TUM_TONLAR
      .map(ton => {
        const r = relation(parca && parca.camelot, ton);
        return r ? { ton, puan: r.puan } : null;
      })
      .filter(Boolean)
      .sort((x, y) => y.puan - x.puan);
  }

  // Bir parçaya doğrudan bağlanan tonlar: son köprünün tonu bunlardan biri
  // olmalı (o ton sonraki parçaya bağlanır).
  function girilenTonlar(parca) {
    return TUM_TONLAR
      .map(ton => {
        const r = relation(ton, parca && parca.camelot);
        return r ? { ton, puan: r.puan } : null;
      })
      .filter(Boolean)
      .sort((x, y) => y.puan - x.puan);
  }

  // Aralarındaki hız farkı tek köprüyle kapanmayan iki parça için iki adımlı
  // yol: her köprü kendi komşusunun hızına yakın olur, tonları da iki yaka
  // arasında zincir kurmalı (a → 1. köprü → 2. köprü → b).
  function ikiAdimYolu(a, b) {
    const x = Number(a && a.bpm) || 0, y = Number(b && b.bpm) || 0;
    const cikis = cikilanTonlar(a), giris = girilenTonlar(b);
    if (!cikis.length || !giris.length) return null;
    const ornek = [];
    cikis.forEach(c => giris.forEach(g => {
      const ara = relation(c.ton, g.ton);
      if (ara) ornek.push({ birinci: c.ton, ikinci: g.ton, puan: c.puan + ara.puan + g.puan });
    }));
    ornek.sort((u, v) => v.puan - u.puan);
    const hiz = bpm => bpm ? { bpmMin: Math.round(bpm - HIZ_TOLERANS), bpmMax: Math.round(bpm + HIZ_TOLERANS) } : { bpmMin: null, bpmMax: null };
    return {
      birinci: { taraf: 'önceki', tonlar: cikis.slice(0, 3).map(c => c.ton), ...hiz(x) },
      ikinci: { taraf: 'sonraki', tonlar: giris.slice(0, 3).map(g => g.ton), ...hiz(y) },
      ornek: ornek.slice(0, 3)
    };
  }

  // Uymayan bir geçişe araya girecek parçanın tonu ve hızı. BPM aralığı iki
  // komşunun da toleransına giren kesişimdir; kesişim boşsa tek parça yetmez.
  function kopru(a, b) {
    const tonlar = kopruTonlari(a, b).map(x => x.ton).slice(0, 3);
    const x = Number(a && a.bpm) || 0, y = Number(b && b.bpm) || 0;
    let bpmMin = null, bpmMax = null, tekParca = true, not = '';
    if (x && y) {
      const alt = Math.min(x, y), ust = Math.max(x, y);
      bpmMin = Math.round(ust - HIZ_TOLERANS);
      bpmMax = Math.round(alt + HIZ_TOLERANS);
      if (bpmMin > bpmMax) {
        tekParca = false;
        const orta = Math.round((alt + ust) / 2);
        bpmMin = orta - 3;
        bpmMax = orta + 3;
        not = 'İki parça arasında ' + (ust - alt) + ' BPM var; tek köprü ikisini de tutmaz. '
          + 'Ya iki köprü kullan ya da bir ucu ' + orta + ' BPM civarına kaydır.';
      }
    }
    if (!tonlar.length) {
      not = not || 'Ton bilgisi eksik: iki parçanın da Camelot kodu girilmeli.';
    }
    // Tek parça yetmiyorsa iki adımın ton ve hızını ayrı ayrı ver.
    const ikiAdim = tekParca ? null : ikiAdimYolu(a, b);
    return { tonlar, bpmMin, bpmMax, tekParca, not, ikiAdim };
  }

  // Setteki parçalara en çok bağlanan anahtarlar: yeni parça ararken hangi
  // tonun işe yaradığını söyler.
  function uyumluTonlar(set, adet) {
    const sira = (Array.isArray(set) ? set : []).filter(t => parseKey(t && t.camelot));
    if (!sira.length) return [];
    return TUM_TONLAR
      .map(ton => ({
        ton,
        sayi: sira.filter(t => relation(t.camelot, ton) || relation(ton, t.camelot)).length
      }))
      .filter(x => x.sayi)
      .sort((a, b) => b.sayi - a.sayi)
      .slice(0, Number(adet) || 3);
  }

  // Setin içinde hiçbir parçaya ton olarak bağlanmayan parçalar: bunlar setin
  // neresine konursa konsun kopukluk yaratır. Yalnız komşusuna uymayan parça
  // buraya girmez; o geçişin sorunudur ve köprü önerisiyle çözülür.
  function uymayanlar(set) {
    const sira = Array.isArray(set) ? set : [];
    // Tek tonlu parça kalırsa (ötekilerin tonu yoksa) o parça "bağlanamıyor"
    // sayılmaz: kusur eksik ton bilgisindedir, o da ayrıca yazılır.
    const tonluSayi = sira.filter(t => parseKey(t && t.camelot)).length;
    const out = [];
    sira.forEach((t, i) => {
      if (!parseKey(t && t.camelot)) {
        out.push({ parca: t, sira: i, sebep: 'Camelot tonu yok' });
        return;
      }
      if (tonluSayi < 2) return;
      const bagli = sira.some((x, j) => j !== i
        && (relation(t.camelot, x.camelot) || relation(x.camelot, t.camelot)));
      if (!bagli) out.push({ parca: t, sira: i, sebep: 'setteki hiçbir parçaya ton olarak bağlanmıyor' });
    });
    return out;
  }

  // Setteki hiçbir parçaya ton olarak bağlanmayan katalog parçaları: sete
  // alınamazlar, yerlerine uyumlu bir parça gerekir.
  function setDisiKalanlar(set, katalog) {
    const sira = (Array.isArray(set) ? set : []).filter(t => parseKey(t && t.camelot));
    if (!sira.length) return [];
    const settekiIdler = new Set(sira.map(t => t.id));
    return (Array.isArray(katalog) ? katalog : [])
      .filter(t => parseKey(t && t.camelot) && !settekiIdler.has(t.id))
      .filter(t => !sira.some(s => relation(s.camelot, t.camelot) || relation(t.camelot, s.camelot)));
  }

  // Tarz etiketi. Katalogda tür alanı yok; tempo, enerji ve makam üçlüsünden
  // okunur. Etiket yalnız süs değil: dış servis aramasına da girer, böylece
  // öneri aynı tarzda kalsın (ör. "Mahmut Orhan benzeri melodic house").
  function tarzEtiketi(parca) {
    const bpm = Number(parca && parca.bpm) || 0;
    const enerji = Number(parca && parca.energy) || 0;
    const govde = !bpm ? 'tempo bilinmiyor'
      : bpm < 100 ? 'downtempo / lounge'
      : bpm < 115 ? 'organik deep house'
      : bpm < 125 ? 'melodic house'
      : bpm < 133 ? 'progressive house'
      : 'yüksek enerji / tech';
    const eki = enerji >= 7 ? ' (yoğun)' : (enerji && enerji <= 3 ? ' (sakin)' : '');
    return ((parca && parca.makam) ? 'Anadolu elektronik · ' : '') + govde + eki;
  }

  // Katalogdaki sanatçıların tarz imzası: parçalarından çıkan hız, enerji ve
  // ton eğilimi. "Mahmut Orhan tarzı nedir?" sorusunun elimizdeki veriyle
  // cevabı budur; dışarıdan hiçbir şey çekmeden hesaplanır.
  function sanatciProfilleri(katalog) {
    const harita = new Map();
    (Array.isArray(katalog) ? katalog : []).forEach(t => {
      const ad = String((t && t.artist) || '').trim();
      if (!ad) return;
      if (!harita.has(ad)) harita.set(ad, { sanatci: ad, parcalar: [], tonSayi: {}, makamlar: {}, bpmToplam: 0, bpmSayi: 0, enerjiToplam: 0, enerjiSayi: 0 });
      const p = harita.get(ad);
      p.parcalar.push(t);
      if (t.camelot) p.tonSayi[t.camelot] = (p.tonSayi[t.camelot] || 0) + 1;
      if (t.makam) p.makamlar[t.makam] = (p.makamlar[t.makam] || 0) + 1;
      if (Number(t.bpm)) { p.bpmToplam += Number(t.bpm); p.bpmSayi++; }
      if (Number(t.energy)) { p.enerjiToplam += Number(t.energy); p.enerjiSayi++; }
    });
    return [...harita.values()].map(p => {
      const bpm = p.bpmSayi ? Math.round(p.bpmToplam / p.bpmSayi) : null;
      const enerji = p.enerjiSayi ? Math.round(p.enerjiToplam / p.enerjiSayi) : null;
      const enCokTonlar = Object.entries(p.tonSayi).sort((a, b) => b[1] - a[1]).map(x => x[0]);
      const enCokMakam = Object.keys(p.makamlar)[0] || null;
      return {
        sanatci: p.sanatci, parcalar: p.parcalar, bpm, enerji, tonSayi: p.tonSayi,
        enCokTonlar, makamlar: Object.keys(p.makamlar),
        tarz: tarzEtiketi({ bpm, energy: enerji, makam: enCokMakam })
      };
    }).sort((a, b) => b.parcalar.length - a.parcalar.length) ;
  }

  // Bir parça setin neresine girebilir? Tonu uyan ve hızı 5 BPM içinde kalan
  // komşular listelenir; boş liste "bu parça sete girmez" demektir.
  function settekiYeri(set, parca) {
    return (Array.isArray(set) ? set : []).filter(s => s.id !== parca.id
      && (relation(s.camelot, parca.camelot) || relation(parca.camelot, s.camelot))
      && (yanYana(s, parca) || yanYana(parca, s)));
  }

  // Katalogdan, sete gerçekten girebilecek sanatçılar: her sanatçının setle hem
  // tonu hem hızı uyan parçaları varsa önerilir. Dışarıya çıkmadan "bu tarz
  // buraya uyar" diyebilmenin yolu.
  function uyumluSanatcilar(set, katalog, adet) {
    const sira = Array.isArray(set) ? set : [];
    const settekiIdler = new Set(sira.map(t => t && t.id));
    return sanatciProfilleri(katalog)
      .map(p => {
        const uyan = p.parcalar.filter(t => t && !settekiIdler.has(t.id) && settekiYeri(sira, t).length);
        if (!uyan.length) return null;
        const bpmlar = uyan.map(t => Number(t.bpm)).filter(Boolean);
        return {
          sanatci: p.sanatci, tarz: p.tarz, bpm: p.bpm, enerji: p.enerji,
          parcalar: uyan,
          enCokTonlar: p.enCokTonlar.filter(ton => uyan.some(t => t.camelot === ton)),
          bpmMin: bpmlar.length ? Math.min(...bpmlar) : null,
          bpmMax: bpmlar.length ? Math.max(...bpmlar) : null
        };
      })
      .filter(Boolean)
      .sort((a, b) => b.parcalar.length - a.parcalar.length)
      .slice(0, Number(adet) || 5);
  }

  // Dış servis anahtarı yok: öneri gerçek şarkı listesi değil, arama
  // bağlantısıdır. Sorgu ton + hız taşır, sonucu kullanıcı seçer. Sanatçı ve
  // tarz verilirse sorguya girer ("Mahmut Orhan benzeri melodic house …"),
  // böylece öneri parçanın tarzında kalır.
  function aramaLinkleri(sorgu) {
    const kod = encodeURIComponent(String(sorgu == null ? '' : sorgu).trim());
    return {
      youtube: 'https://www.youtube.com/results?search_query=' + kod,
      spotify: 'https://open.spotify.com/search/' + kod
    };
  }

  function oneriSorgusu(hedef) {
    const h = hedef || {};
    const ton = Array.isArray(h.tonlar) && h.tonlar.length ? h.tonlar.slice(0, 2).join(' ') : '';
    const hiz = (h.bpmMin && h.bpmMax)
      ? (h.bpmMin === h.bpmMax ? h.bpmMin + ' BPM' : h.bpmMin + '-' + h.bpmMax + ' BPM')
      : (h.bpm ? h.bpm + ' BPM' : '');
    const tarz = [h.sanatci ? String(h.sanatci) + ' benzeri' : '', h.tarz || ''].filter(Boolean).join(' ');
    return [tarz, ton, hiz].filter(Boolean).join(' ') + ' mix';
  }

  return {
    parseKey, relation, tempo, score, autoOrder, gecisler, yanYana, inisCeza,
    yay, yayPuanu, kopru, kopruTonlari, cikilanTonlar, girilenTonlar, uyumluTonlar,
    uymayanlar, setDisiKalanlar, aramaLinkleri, oneriSorgusu, zincirPuanu,
    tarzEtiketi, sanatciProfilleri, settekiYeri, uyumluSanatcilar,
    HIZ_TOLERANS, HIZ_SINIR, HIZ_AYIR_CEZA, HIZ_COK_CEZA, KOPUK_CEZA,
    INIS_TOLERANS, INIS_CEZA, ZIRVE_CEZA
  };
});
