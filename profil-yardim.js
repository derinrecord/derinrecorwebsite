// Profilim · saf yardımcılar (Node'da sınanır; tarayıcıda window.DerinProfil).
(function () {
  'use strict';

  var CIKTI = 256;

  // Fotoğrafın ortasından kare alan; çıktı en çok 256 piksel (küçük foto büyütülmez).
  function kareKirp(gen, yuk) {
    var kenar = Math.min(gen, yuk);
    return { sx: Math.round((gen - kenar) / 2), sy: Math.round((yuk - kenar) / 2), kenar: kenar, cikti: Math.min(CIKTI, kenar) };
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

  var api = { CIKTI: CIKTI, kareKirp: kareKirp, fotoYolu: fotoYolu, resimMi: resimMi, formKaydi: formKaydi, sifreHatasi: sifreHatasi, basHarf: basHarf };
  if (typeof window !== 'undefined') window.DerinProfil = api;
  if (typeof module !== 'undefined') module.exports = api;
})();
