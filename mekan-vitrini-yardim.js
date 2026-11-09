// Mekân vitrini (8 Kasım 2026) · saf yardımcılar. Node'da sınanır; tarayıcıda
// window.DerinMekanVitrini. Mekân sayfasındaki çalma listesi demoları ve radyo
// panelindeki ses dalgası hesabı bunları kullanır.
(function () {
  'use strict';

  var DEMO_SANIYE = 60;
  var TURLER = {
    kafe: { ad: 'Kafe', ikon: '☕', renk: ['#e8d15a', '#2b2118'] },
    restoran: { ad: 'Restoran', ikon: '🍽', renk: ['#cb2468', '#1a1214'] },
    otel: { ad: 'Otel', ikon: '🛎', renk: ['#7fe3ff', '#16202b'] },
    magaza: { ad: 'Mağaza', ikon: '🛍', renk: ['#ff2f96', '#2a1530'] }
  };
  var SIRA = ['kafe', 'restoran', 'otel', 'magaza'];

  function grupla(listeler) {
    var g = {};
    SIRA.forEach(function (k) { g[k] = []; });
    (listeler || []).forEach(function (l) {
      if (l && g[l.tur] && Array.isArray(l.parcalar) && l.parcalar.length) g[l.tur].push(l);
    });
    SIRA.forEach(function (k) {
      g[k].sort(function (a, b) { return (a.sira || 0) - (b.sira || 0) || String(a.ad).localeCompare(String(b.ad), 'tr'); });
    });
    return g;
  }

  function ilkDolu(g) {
    for (var i = 0; i < SIRA.length; i++) if (g[SIRA[i]] && g[SIRA[i]].length) return SIRA[i];
    return null;
  }

  function saatYazi(l) {
    return l && l.baslangic && l.bitis ? l.baslangic + '–' + l.bitis : 'TÜM GÜN';
  }

  // Ses örneklerinden (kanal dizileri) n adet 0–100 tepe değeri.
  function tepeler(kanallar, n) {
    n = n || 120;
    var uzun = 0;
    (kanallar || []).forEach(function (k) { uzun = Math.max(uzun, k.length); });
    var ham = [];
    for (var i = 0; i < n; i++) {
      var bas = Math.floor(i * uzun / n), son = Math.max(bas + 1, Math.floor((i + 1) * uzun / n)), m = 0;
      (kanallar || []).forEach(function (k) {
        for (var j = bas; j < son && j < k.length; j++) { var v = Math.abs(k[j]); if (v > m) m = v; }
      });
      ham.push(m);
    }
    var tepe = Math.max.apply(null, ham.concat([0]));
    return ham.map(function (v) { return tepe > 0 ? Math.max(4, Math.round(v / tepe * 100)) : 4; });
  }

  // Dalga (9 Kasım): Projelerim sayfasındaki gibi Ableton tarzı. Panel her
  // şarkının ilk 60 saniyesini DALGA_NOKTA dilime böler; her dilimde sesin en üst
  // ve en alt değeri tutulur ([üst, alt, üst, alt, …], -100..100). Çizim bu iki
  // konturdan dolu, tırtıklı gerçek şekildir. Eski biçimler (120/400 tepe) sık
  // çizgiyle çizilir; panel kaydederken onları yeniler.
  var DALGA_NOKTA = 600;
  function dalgaTam(d) { return Array.isArray(d) && d.length === DALGA_NOKTA * 2; }

  function ustAlt(kanallar, n) {
    n = n || DALGA_NOKTA;
    var uzun = 0;
    (kanallar || []).forEach(function (k) { uzun = Math.max(uzun, k.length); });
    var ust = [], alt = [], tepe = 0;
    for (var i = 0; i < n; i++) {
      var bas = Math.floor(i * uzun / n), son = Math.max(bas + 1, Math.floor((i + 1) * uzun / n)), mx = -Infinity, mn = Infinity;
      (kanallar || []).forEach(function (k) {
        for (var j = bas; j < son && j < k.length; j++) { var v = k[j]; if (v > mx) mx = v; if (v < mn) mn = v; }
      });
      if (mx === -Infinity) { mx = 0; mn = 0; }
      ust.push(mx); alt.push(mn);
      tepe = Math.max(tepe, Math.abs(mx), Math.abs(mn));
    }
    var sonuc = [];
    for (var m = 0; m < n; m++) {
      var u = tepe > 0 ? Math.round(ust[m] / tepe * 100) : 0, a = tepe > 0 ? Math.round(alt[m] / tepe * 100) : 0;
      if (u < a) { var t = u; u = a; a = t; }
      sonuc.push(u + 0, a + 0);
    }
    return sonuc;
  }

  // Klip görünümü (Projelerim / Ableton gibi): renkli zemin, koyu dalga, ince
  // zaman çizgileri; çalınmış kısmın zemini bir ton koyulaşır.
  var KLIP_RENKLERI = {
    lavanta: { zemin: '#9a8bd0', calan: '#8577bb', dalga: '#121314', izgara: 'rgba(10,12,14,.16)', ibre: '#ffffff' },
    altin: { zemin: '#d8bb2c', calan: '#bea323', dalga: '#121314', izgara: 'rgba(10,12,14,.16)', ibre: '#ffffff' },
    gece: { zemin: '#1c1f26', calan: '#3a3524', dalga: '#ece6d6', izgara: 'rgba(244,241,233,.08)', ibre: '#e8d15a' }
  };

  function dalgaSvg(tepe, oran, kimlik, klip) {
    var K = klip && KLIP_RENKLERI[klip];
    var H = 60, orta = 30, yari = K ? 29 : 28, W, govde;
    if (dalgaTam(tepe)) {
      // Tek kapalı şekil: üst kontur soldan sağa, alt kontur sağdan sola.
      var n = tepe.length / 2, ustY = [], altY = [];
      W = n;
      for (var i = 0; i < n; i++) {
        var u = orta - tepe[2 * i] / 100 * yari, a = orta - tepe[2 * i + 1] / 100 * yari;
        if (a - u < 0.7) { var o = (a + u) / 2; u = o - 0.35; a = o + 0.35; }
        ustY.push(u); altY.push(a);
      }
      var d = 'M0 ' + ustY[0].toFixed(1);
      for (var x = 0; x < n; x++) d += 'L' + (x + 0.5) + ' ' + ustY[x].toFixed(1);
      d += 'L' + n + ' ' + ustY[n - 1].toFixed(1) + 'L' + n + ' ' + altY[n - 1].toFixed(1);
      for (var y = n - 1; y >= 0; y--) d += 'L' + (y + 0.5) + ' ' + altY[y].toFixed(1);
      d += 'L0 ' + altY[0].toFixed(1) + 'Z';
      govde = function (renk, ek) { return '<path d="' + d + '" fill="' + renk + '"' + (ek || '') + '/>'; };
    } else {
      var t = Array.isArray(tepe) && tepe.length ? tepe : new Array(120).fill(18), yol = '';
      W = t.length;
      t.forEach(function (v, i) {
        var h = Math.max(0.6, Math.min(100, Number(v) || 0) / 100 * yari), xx = (i + 0.5).toFixed(1);
        yol += 'M' + xx + ' ' + (orta - h).toFixed(2) + 'V' + (orta + h).toFixed(2);
      });
      govde = function (renk, ek) { return '<path d="' + yol + '" stroke="' + renk + '" stroke-width="0.82" fill="none"' + (ek || '') + '/>'; };
    }
    if (K) {
      var cxK = (oran > 0 ? Math.min(1, oran) : 0) * W, izgara = '';
      for (var z = 1; z < 12; z++) izgara += '<rect x="' + (z * W / 12).toFixed(1) + '" y="0" width="' + (W / 900).toFixed(2) + '" height="' + H + '" fill="' + K.izgara + '"/>';
      return '<svg class="mv-dalga mv-klip" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" aria-hidden="true">'
        + '<rect x="0" y="0" width="' + W + '" height="' + H + '" fill="' + K.zemin + '"/>'
        + (cxK > 0 ? '<rect x="0" y="0" width="' + cxK.toFixed(1) + '" height="' + H + '" fill="' + K.calan + '"/>' : '')
        + izgara + govde(K.dalga)
        + (cxK > 0 ? '<rect class="mv-ibre" x="' + cxK.toFixed(1) + '" y="0" width="' + (W / 380).toFixed(2) + '" height="' + H + '" fill="' + K.ibre + '"/>' : '')
        + '</svg>';
    }
    var gri = govde('#6a6772');
    if (!(oran > 0)) return '<svg class="mv-dalga" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" aria-hidden="true">' + gri + '</svg>';
    var g = 'mvG-' + kimlik, k = 'mvK-' + kimlik, cx = Math.min(1, oran) * W;
    return '<svg class="mv-dalga" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" aria-hidden="true"><defs>'
      + '<linearGradient id="' + g + '" gradientUnits="userSpaceOnUse" x1="0" x2="0" y1="' + (orta - yari) + '" y2="' + (orta + yari) + '"><stop offset="0" stop-color="#ffe680"/><stop offset=".5" stop-color="#f0c94a"/><stop offset="1" stop-color="#e0a92c"/></linearGradient>'
      + '<clipPath id="' + k + '"><rect x="0" y="0" width="' + cx.toFixed(1) + '" height="' + H + '"/></clipPath></defs>'
      + gri + govde('url(#' + g + ')', ' clip-path="url(#' + k + ')"')
      + '<rect class="mv-ibre" x="' + cx.toFixed(1) + '" y="0" width="' + (W / 450).toFixed(2) + '" height="' + H + '" fill="#fff"/></svg>';
  }

  // Bölüm yazıları ve mekân türleri yöneticinin panelden düzenlediği ayardan gelir;
  // boş bırakılan alan varsayılana döner.
  var VARSAYILAN = {
    ust: 'MEKAN DEMOLARI', baslik: 'Mekanınızı seçin,', vurgu: 'sesini dinleyin.',
    aciklama: 'Her mekan türü için gün dilimlerine göre hazırlanmış çalma listeleri. Bir listeyi açın, mekanınızda nasıl duyulacağını dinleyin.'
  };
  function ayar(a) {
    a = a || {};
    var bos = function (v) { return v == null || String(v).trim() === ''; };
    var sonuc = {};
    Object.keys(VARSAYILAN).forEach(function (k) { sonuc[k] = bos(a[k]) ? VARSAYILAN[k] : String(a[k]).trim(); });
    sonuc.turler = {};
    SIRA.forEach(function (k) {
      var t = (a.turler && a.turler[k]) || {};
      sonuc.turler[k] = { ad: bos(t.ad) ? TURLER[k].ad : String(t.ad).trim(), ikon: bos(t.ikon) ? TURLER[k].ikon : String(t.ikon).trim(), renk: TURLER[k].renk, acik: t.acik !== false };
    });
    return sonuc;
  }
  function acikTurler(a) { return SIRA.filter(function (k) { return a.turler[k].acik; }); }

  function teklifMetni(l) {
    var tur = (l && l.turAd) || (TURLER[l && l.tur] ? TURLER[l.tur].ad : '');
    return 'Mekân demosu: ' + (tur ? tur + ' · ' : '') + (l && l.ad ? l.ad : '') + ' — bu sesi istiyorum.';
  }

  // Ana sayfadan /coffee teklif formuna gider; form notu bu satırla dolar.
  function teklifAdresi(l) {
    return '/coffee?demo=' + encodeURIComponent(teklifMetni(l)) + '#cf-note';
  }

  function zamanYazi(sn) {
    sn = Math.max(0, Math.floor(Number(sn) || 0));
    return Math.floor(sn / 60) + ':' + String(sn % 60).padStart(2, '0');
  }

  var api = { DEMO_SANIYE: DEMO_SANIYE, TURLER: TURLER, SIRA: SIRA, grupla: grupla, ayar: ayar, acikTurler: acikTurler, VARSAYILAN: VARSAYILAN, ilkDolu: ilkDolu, saatYazi: saatYazi, tepeler: tepeler, dalgaSvg: dalgaSvg, DALGA_NOKTA: DALGA_NOKTA, dalgaTam: dalgaTam, ustAlt: ustAlt, KLIP_RENKLERI: KLIP_RENKLERI, teklifMetni: teklifMetni, teklifAdresi: teklifAdresi, zamanYazi: zamanYazi };
  if (typeof window !== 'undefined') window.DerinMekanVitrini = api;
  if (typeof module !== 'undefined') module.exports = api;
})();
