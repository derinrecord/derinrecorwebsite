// Proje bildirimleri (4 Kasım 2026): yönetici Projelerim'de bir iş yaptığında
// (parça, sürüm, aşama, not, yeni klasör, indirme izni) projenin sahibine giden
// telefon bildiriminin metni. Saf yardımcı: Node'da sınanır; tarayıcıda window.DerinProjeBildirim.
(function () {
  'use strict';

  var ASAMA = {
    pending: 'ONAY BEKLİYOR', approved: 'ONAYLANDI', started: 'BAŞLANDI',
    production: 'YAPIM SÜRECİNDE', finishing: 'BİTİM AŞAMASI', delivered: 'TESLİM EDİLDİ'
  };

  function kisalt(v, n) {
    var s = String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
    return s.length > n ? s.slice(0, n - 1) + '…' : s;
  }

  // tur: parca | surum | asama | not | proje | indirme
  function mesaj(tur, o) {
    o = o || {};
    var ad = kisalt(o.proje && o.proje.title, 60);
    if (!ad) return null;
    var parca = kisalt(o.parca, 50);
    var p = parca ? ' (' + parca + ')' : '';
    var m = {
      parca: ['🎵 Projene yeni parça eklendi', ad + p + ' · Dinlemek için dokun.'],
      surum: ['🔁 Yeni sürüm hazır', ad + p + ' için düzenlenmiş sürüm yüklendi.'],
      asama: ['📍 Projen yeni aşamada', ad + ' → ' + (ASAMA[o.asama] || kisalt(o.asama, 30))],
      not: ['💬 Derin Record not bıraktı', ad + p + ' · Notu okumak için dokun.'],
      proje: ['📁 Sana yeni proje açıldı', ad + ' · Projelerim\'de seni bekliyor.'],
      indirme: ['⬇️ Parçanı indirebilirsin', ad + p + ' artık indirilebilir.']
    }[tur];
    if (!m) return null;
    return { baslik: m[0], metin: m[1], adres: '/my-projects.html' };
  }

  var api = { mesaj: mesaj };
  if (typeof window !== 'undefined') window.DerinProjeBildirim = api;
  if (typeof module !== 'undefined') module.exports = api;
})();
