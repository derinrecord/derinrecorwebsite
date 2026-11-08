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

  // A · ayna çubuklar: üstte çubuk, altta soluk yansıma; oran (0–1) kadarı sarı.
  function dalgaSvg(tepe, oran, kimlik) {
    var t = Array.isArray(tepe) && tepe.length ? tepe : new Array(60).fill(18);
    var w = 3, g = 1.4, H = 60, orta = 40, W = t.length * (w + g), id = 'mvA-' + kimlik;
    var parca = '';
    t.forEach(function (v, i) {
      var x = (i * (w + g)).toFixed(1), h = Math.max(1.5, v / 100 * 38), cal = oran > 0 && i / t.length < oran;
      parca += '<rect x="' + x + '" y="' + (orta - h).toFixed(1) + '" width="' + w + '" height="' + h.toFixed(1) + '" rx="1.2" fill="' + (cal ? 'url(#' + id + ')' : '#5a5760') + '"/>';
      parca += '<rect x="' + x + '" y="' + (orta + 1.5) + '" width="' + w + '" height="' + (h * 0.42).toFixed(1) + '" rx="1.2" fill="' + (cal ? '#e8d15a' : '#5a5760') + '" opacity=".35"/>';
    });
    var ibre = oran > 0 ? '<rect class="mv-ibre" x="' + (oran * W).toFixed(1) + '" y="0" width="1.5" height="' + H + '" fill="#fff"/>' : '';
    return '<svg class="mv-dalga" viewBox="0 0 ' + W.toFixed(1) + ' ' + H + '" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="' + id + '" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#ffe680"/><stop offset="1" stop-color="#e0a92c"/></linearGradient></defs>' + parca + ibre + '</svg>';
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

  function zamanYazi(sn) {
    sn = Math.max(0, Math.floor(Number(sn) || 0));
    return Math.floor(sn / 60) + ':' + String(sn % 60).padStart(2, '0');
  }

  var api = { DEMO_SANIYE: DEMO_SANIYE, TURLER: TURLER, SIRA: SIRA, grupla: grupla, ayar: ayar, acikTurler: acikTurler, VARSAYILAN: VARSAYILAN, ilkDolu: ilkDolu, saatYazi: saatYazi, tepeler: tepeler, dalgaSvg: dalgaSvg, teklifMetni: teklifMetni, zamanYazi: zamanYazi };
  if (typeof window !== 'undefined') window.DerinMekanVitrini = api;
  if (typeof module !== 'undefined') module.exports = api;
})();
