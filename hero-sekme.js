// Ana sayfa giriş sekmeleri (9 Kasım 2026): "Ne için müzik arıyorsunuz?"
// Sporcu & antrenör / Mekân & işletme / Film & reklam. Bütün yazılar sayfada
// hazır durur (çeviri ve arama motorları için); sekme yalnız hangisinin
// görüneceğini seçer. Ziyaretçinin son seçimi tarayıcıda hatırlanır.
(function () {
  'use strict';

  var SEKMELER = ['spor', 'mekan', 'film'];
  var ANAHTAR = 'derin-hero-sekme';

  function sekmeSec(kayitli) { return SEKMELER.indexOf(kayitli) >= 0 ? kayitli : 'spor'; }
  function komsu(simdiki, yon) {
    var i = SEKMELER.indexOf(sekmeSec(simdiki));
    return SEKMELER[(i + yon + SEKMELER.length) % SEKMELER.length];
  }

  var api = { SEKMELER: SEKMELER, sekmeSec: sekmeSec, komsu: komsu };
  if (typeof module !== 'undefined') module.exports = api;
  if (typeof document === 'undefined') return;
  window.DerinHeroSekme = api;

  function goster(ad, odakla) {
    ad = sekmeSec(ad);
    document.querySelectorAll('[data-hero-sekme]').forEach(function (b) {
      var secili = b.dataset.heroSekme === ad;
      b.setAttribute('aria-selected', secili ? 'true' : 'false');
      b.tabIndex = secili ? 0 : -1;
      if (secili && odakla) b.focus();
    });
    document.querySelectorAll('[data-hero-pano]').forEach(function (p) { p.hidden = p.dataset.heroPano !== ad; });
    document.querySelectorAll('[data-hero-etiket]').forEach(function (e) { e.hidden = e.dataset.heroEtiket !== ad; });
    var hero = document.querySelector('.hero');
    if (hero) hero.dataset.sekme = ad;
  }

  function kur() {
    var kutu = document.querySelector('.hero-sekmeler');
    if (!kutu) return;
    var kayitli = null;
    try { kayitli = localStorage.getItem(ANAHTAR); } catch (e) { /* gizli pencere: varsayılan */ }
    goster(kayitli, false);
    kutu.addEventListener('click', function (e) {
      var b = e.target.closest('[data-hero-sekme]');
      if (!b) return;
      goster(b.dataset.heroSekme, false);
      try { localStorage.setItem(ANAHTAR, b.dataset.heroSekme); } catch (e2) { /* hatırlanmaz */ }
    });
    kutu.addEventListener('keydown', function (e) {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      e.preventDefault();
      var simdiki = (document.querySelector('[data-hero-sekme][aria-selected="true"]') || {}).dataset;
      var yeni = komsu(simdiki && simdiki.heroSekme, e.key === 'ArrowRight' ? 1 : -1);
      goster(yeni, true);
      try { localStorage.setItem(ANAHTAR, yeni); } catch (e3) { /* hatırlanmaz */ }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', kur);
  else kur();
})();
