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

  // Hangi sekme seçiliyse onun bölümü girişin hemen altına çıkar.
  var BOLUMLER = { spor: 'demolar', mekan: 'mekan-vitrini', film: 'ses-tasarimi' };
  // asil: sayfadaki ilk sıra (giriş başta). Seçilen bölüm girişten hemen sonraya
  // alınır, geri kalanlar eski sırasını korur.
  function sirala(asil, sekme) {
    var hedef = BOLUMLER[sekmeSec(sekme)], i = asil.indexOf(hedef);
    if (i < 1) return asil.slice();
    var yeni = asil.slice(); yeni.splice(i, 1);
    yeni.splice(1, 0, hedef);
    return yeni;
  }

  var api = { SEKMELER: SEKMELER, sekmeSec: sekmeSec, komsu: komsu, BOLUMLER: BOLUMLER, sirala: sirala };
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
    bolumleriDiz(ad);
    isaretKoy();
  }

  // Ana sayfadaki bölümlerin ilk sırası bir kez okunur; her seçimde o sıradan yeniden dizilir.
  var ilkSira = null;
  function bolumleriDiz(ad) {
    var hero = document.querySelector('.hero'), kap = hero && hero.parentNode;
    if (!kap) return;
    if (!ilkSira) ilkSira = Array.prototype.filter.call(kap.children, function (el) { return el.tagName === 'SECTION'; });
    var adlar = ilkSira.map(function (el) { return el === hero ? 'hero' : (el.id || ''); });
    if (adlar[0] !== 'hero') return;
    var son = hero;
    sirala(adlar, ad).slice(1).forEach(function (a) {
      var el = ilkSira[adlar.indexOf(a)];
      if (el && son.nextElementSibling !== el) son.after(el);
      son = el || son;
    });
  }

  // Sarı vurgu seçili sekmenin altına kayar (genişlik ve konum ölçülür).
  function isaretKoy() {
    var kutu = document.querySelector('.hero-sekmeler'), b = document.querySelector('[data-hero-sekme][aria-selected="true"]');
    if (!kutu || !b || !b.offsetWidth) return;
    kutu.style.setProperty('--hs-x', b.offsetLeft + 'px');
    kutu.style.setProperty('--hs-w', b.offsetWidth + 'px');
    kutu.classList.add('hs-hazir');
  }

  function kur() {
    var kutu = document.querySelector('.hero-sekmeler');
    if (!kutu) return;
    var kayitli = null;
    try { kayitli = localStorage.getItem(ANAHTAR); } catch (e) { /* gizli pencere: varsayılan */ }
    goster(kayitli, false);
    // Dil değişince ya da ekran boyu değişince yazı genişliği değişir: vurguyu yeniden ölç.
    if (window.ResizeObserver) new ResizeObserver(isaretKoy).observe(kutu);
    window.addEventListener('resize', isaretKoy);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(isaretKoy);
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
