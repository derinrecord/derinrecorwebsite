// Demo şarkılar · saf yardımcılar (Node'da sınanır; tarayıcıda window.DerinDemo).
// Branş sayfasındaki kasetler veritabanından (demo_parcalari) bu yardımcılarla çizilir.
(function () {
  'use strict';

  var TUR = {
    aerobik: 'AEROBİK CİMNASTİK',
    akrobatik: 'AKROBATİK CİMNASTİK',
    artistik: 'ARTİSTİK CİMNASTİK',
    ritmik: 'RİTMİK CİMNASTİK',
    'cocuk-fitness': 'ÇOCUK FITNESS'
  };
  // dil.js anahtarı (İngilizce karşılık için); çocuk fitness metin eşleşmesiyle çevrilir.
  var TUR_ANAHTAR = { aerobik: 'aerobik.tur', akrobatik: 'akrobatik.tur', artistik: 'artistik.tur', ritmik: 'ritmik.tur' };
  var VARSAYILAN_NOT = 'Demo track · Kaseti oynat ve ritmi hisset.';

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function sade(metin) {
    var harf = { 'ç': 'c', 'ğ': 'g', 'ı': 'i', 'i̇': 'i', 'ö': 'o', 'ş': 's', 'ü': 'u', 'â': 'a', 'î': 'i', 'û': 'u' };
    return String(metin || '').toLocaleLowerCase('tr-TR')
      .replace(/i̇|[çğıöşüâîû]/g, function (c) { return harf[c] || c; })
      .normalize('NFKD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }

  function demoAnahtari(brans, baslik, ek) {
    var govde = sade(baslik).slice(0, 50).replace(/-+$/g, '') || 'demo';
    return (brans + '-' + govde + '-' + ek).slice(0, 70);
  }

  function uzanti(ad) {
    var m = /\.([a-z0-9]{2,5})$/i.exec(String(ad || ''));
    return m ? m[1].toLowerCase() : '';
  }

  function dosyaTuru(dosya) {
    if (!dosya) return null;
    var tip = String(dosya.type || ''), u = uzanti(dosya.name);
    if (/^video\/mp4$/.test(tip) || u === 'mp4') return 'video';
    if (/^audio\//.test(tip) || ['wav', 'mp3', 'm4a', 'aac', 'flac', 'ogg', 'aif', 'aiff'].indexOf(u) >= 0) return 'audio';
    return null;
  }

  function r2Yolu(brans, demoKey, dosyaAdi) {
    return brans + '/' + demoKey + '.' + (uzanti(dosyaAdi) || 'bin');
  }

  // Yalnız https adresi ya da site içi yol; javascript:, //başka-site gibi şeyler boş döner.
  function guvenliAdres(v) {
    var s = String(v || '').trim();
    if (/^https:\/\/[^/]/i.test(s)) return s;
    if (/^(\.\/)?[\w-]+(\/[\w.%-]+)*\.[a-z0-9]{2,5}$/i.test(s)) return s;
    return '';
  }

  function kasetHtml(d, yonetici) {
    var id = 'demo-' + String(d.id).replace(/[^\w-]/g, '');
    var tur = TUR[d.brans] || '';
    var turAnahtar = TUR_ANAHTAR[d.brans];
    var adres = esc(guvenliAdres(d.medya_url));
    var baslik = String(d.baslik || '').toUpperCase();
    var medya = d.medya_tur === 'video'
      ? '<video id="' + id + '" preload="metadata" playsinline><source src="' + adres + '" type="video/mp4"></video>'
      : '<audio id="' + id + '" preload="metadata"><source src="' + adres + '"></audio>';
    return '<article class="track"' + (yonetici ? ' draggable="true"' : '') + ' data-demo-key="' + esc(d.demo_key) + '" data-demo-id="' + esc(d.id) + '">'
      + '<div class="cassette"><i></i><b>DERİN</b><em>RECORD</em><i></i></div>'
      + '<div class="track-info"><span class="track-type"' + (turAnahtar ? ' data-i18n="' + turAnahtar + '"' : '') + '>' + esc(tur) + '</span>'
      + '<h2 class="track-title">' + esc(baslik) + '</h2>'
      + '<p class="track-note">' + esc(d.not_metni || VARSAYILAN_NOT) + '</p>'
      + (yonetici ? '<div class="demo-kaset-dugmeler"><button type="button" class="demo-duzenle" data-demo-duzenle="' + esc(d.id) + '">DÜZENLE</button>'
        + '<button type="button" class="demo-sil" data-demo-sil="' + esc(d.id) + '">SİL</button></div>' : '')
      + '</div>'
      + '<div class="player-controls"><button class="play" data-media="#' + id + '" aria-label="Demoyu dinle" data-i18n-etiket="brans.dinle">▶</button>'
      + '<input class="seek" type="range" min="0" max="100" value="0" step="0.1" aria-label="' + esc(baslik) + ' içinde ilerle">'
      + '<span class="time">0:00 / --:--</span></div>'
      + medya + '</article>';
  }

  // Yönetici sürükleyip bırakır: demo, bırakıldığı kasetin yerine geçer
  // (aşağı taşınırsa onun altına, yukarı taşınırsa üstüne); hepsi 10, 20, 30… diye numaralanır.
  function siraTasi(liste, kaynakId, hedefId) {
    var i = -1, j = -1;
    for (var k = 0; k < liste.length; k++) { if (liste[k].id === kaynakId) i = k; if (liste[k].id === hedefId) j = k; }
    if (i < 0 || j < 0 || i === j) return null;
    var yeni = liste.slice();
    var tasinan = yeni.splice(i, 1)[0];
    yeni.splice(j, 0, tasinan);
    return yeni.map(function (x, n) { return { id: x.id, sira: (n + 1) * 10 }; });
  }

  // Düzenleme: ad 1–80, not en çok 160 karakter (tablodaki sınırlar); boş not → varsayılan yazı.
  function duzenlemeDenetle(baslik, not) {
    var b = String(baslik == null ? '' : baslik).trim();
    var n = String(not == null ? '' : not).trim();
    if (!b) return { hata: 'Demo adı boş olamaz.' };
    if (b.length > 80) return { hata: 'Demo adı en çok 80 harf olabilir.' };
    if (n.length > 160) return { hata: 'Kısa not en çok 160 harf olabilir.' };
    return { baslik: b, not_metni: n || null };
  }

  var api = { duzenlemeDenetle: duzenlemeDenetle, siraTasi: siraTasi, TUR: TUR, VARSAYILAN_NOT: VARSAYILAN_NOT, esc: esc, demoAnahtari: demoAnahtari, uzanti: uzanti, dosyaTuru: dosyaTuru, r2Yolu: r2Yolu, guvenliAdres: guvenliAdres, kasetHtml: kasetHtml };
  if (typeof window !== 'undefined') window.DerinDemo = api;
  if (typeof module !== 'undefined') module.exports = api;
})();
