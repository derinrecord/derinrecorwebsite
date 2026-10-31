// Derin Record uygulaması (31 Ekim): site, App Store / Google Play uygulamasının içinde
// açıldığında bunu tarayıcı kimliğine eklenen "DerinRecordApp/1" imzasından anlar.
// Uygulamadaysa <html class="uygulama uygulama-android|uygulama-ios"> olur ve
// window.DerinApp = { uygulamada, platform } paylaşılır. Normal tarayıcıda hiçbir şey değişmez.
(function () {
  'use strict';

  function tani(ajan) {
    var s = String(ajan || '');
    if (!/DerinRecordApp\/\d+/.test(s)) return { uygulamada: false, platform: null };
    return { uygulamada: true, platform: /iPhone|iPad|iPod/.test(s) ? 'ios' : (/Android/.test(s) ? 'android' : null) };
  }

  if (typeof module !== 'undefined') module.exports = { tani: tani };
  if (typeof window === 'undefined') return;

  var durum = tani(navigator.userAgent);
  window.DerinApp = { uygulamada: durum.uygulamada, platform: durum.platform, tani: tani };
  if (durum.uygulamada) {
    document.documentElement.classList.add('uygulama');
    if (durum.platform) document.documentElement.classList.add('uygulama-' + durum.platform);
  }
})();
