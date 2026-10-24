// Profilim · saf yardımcılar (Node'da sınanır; tarayıcıda window.DerinProfil).
(function () {
  'use strict';

  var CIKTI = 256;

  // Fotoğrafın ortasından kare alan; çıktı en çok 256 piksel (küçük foto büyütülmez).
  function kareKirp(gen, yuk) {
    var kenar = Math.min(gen, yuk);
    return { sx: Math.round((gen - kenar) / 2), sy: Math.round((yuk - kenar) / 2), kenar: kenar, cikti: Math.min(CIKTI, kenar) };
  }

  // ---- Izgaralı ayar penceresi ----
  // F: ekrandaki kare çerçeve kenarı. ayar: { zoom (1–4), ox, oy } — fotoğrafın
  // sol üst köşesinin çerçeveye göre yeri (ekran pikseli, ≤ 0).
  var EN_BUYUK = 4;
  function olcek(gen, yuk, F, zoom) { return (F / Math.min(gen, yuk)) * zoom; }

  function sinirla(a, gen, yuk, F) {
    var zoom = Math.min(EN_BUYUK, Math.max(1, Number(a.zoom) || 1));
    var s = olcek(gen, yuk, F, zoom);
    var kx = F - gen * s, ky = F - yuk * s;
    return {
      zoom: zoom,
      ox: Math.round(Math.min(0, Math.max(kx, a.ox)) * 100) / 100 || 0,
      oy: Math.round(Math.min(0, Math.max(ky, a.oy)) * 100) / 100 || 0
    };
  }

  function baslangicAyar(gen, yuk, F) {
    var s = olcek(gen, yuk, F, 1);
    return sinirla({ zoom: 1, ox: (F - gen * s) / 2, oy: (F - yuk * s) / 2 }, gen, yuk, F);
  }

  // Büyütürken çerçevenin ortası (ya da verilen nokta) yerinde kalır.
  function zoomla(a, yeni, gen, yuk, F, mx, my) {
    if (mx == null) mx = F / 2;
    if (my == null) my = F / 2;
    var z = Math.min(EN_BUYUK, Math.max(1, yeni));
    var oran = olcek(gen, yuk, F, z) / olcek(gen, yuk, F, a.zoom);
    return sinirla({ zoom: z, ox: mx - (mx - a.ox) * oran, oy: my - (my - a.oy) * oran }, gen, yuk, F);
  }

  function ayarKirp(a, gen, yuk, F) {
    var s = olcek(gen, yuk, F, a.zoom);
    var kenar = Math.min(Math.round(F / s), gen, yuk);
    var sx = Math.min(gen - kenar, Math.max(0, Math.round(-a.ox / s)));
    var sy = Math.min(yuk - kenar, Math.max(0, Math.round(-a.oy / s)));
    return { sx: sx, sy: sy, kenar: kenar, cikti: Math.min(CIKTI, kenar) };
  }

  function fotoYolu(uid, zaman) {
    return uid + '/foto-' + zaman + '.jpg';
  }

  function resimMi(dosya) {
    return !!(dosya && /^image\//.test(dosya.type || ''));
  }

  function formKaydi(f) {
    f = f || {};
    var t = function (v) { return String(v == null ? '' : v).trim(); };
    var ad = t(f.ad), kulup = t(f.kulup), sehir = t(f.sehir), tel = t(f.telefon);
    if (!ad) return { hata: 'Ad soyad boş olamaz.' };
    if (ad.length > 80 || kulup.length > 80 || sehir.length > 60) return { hata: 'Bir alan çok uzun.' };
    if (tel && !/^\+?[0-9 ]{7,20}$/.test(tel)) return { hata: 'Telefon yalnız rakam, boşluk ve başta + içerebilir.' };
    return { kayit: { full_name: ad, kulup: kulup || null, sehir: sehir || null, phone: tel || null } };
  }

  function sifreHatasi(a, b) {
    if (String(a || '').length < 8) return 'Şifre en az 8 karakter olmalı.';
    if (a !== b) return 'İki şifre aynı değil.';
    return null;
  }

  function basHarf(ad, eposta) {
    var k = String(ad || '').trim() || String(eposta || '').trim();
    return k ? k.charAt(0).toLocaleUpperCase('tr-TR') : '?';
  }

  var api = { CIKTI: CIKTI, kareKirp: kareKirp, baslangicAyar: baslangicAyar, sinirla: sinirla, zoomla: zoomla, ayarKirp: ayarKirp, fotoYolu: fotoYolu, resimMi: resimMi, formKaydi: formKaydi, sifreHatasi: sifreHatasi, basHarf: basHarf };
  if (typeof window !== 'undefined') window.DerinProfil = api;
  if (typeof module !== 'undefined') module.exports = api;
})();
