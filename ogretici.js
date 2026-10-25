// Öğretici mod (24 Ekim) — adım adım tur motoru.
// Hedef öğenin çevresi aydınlanır, yanında kısa açıklama balonu çıkar:
// GERİ / İLERİ / ATLA. Antrenöre ve yöneticiye ilk girişte kendiliğinden açılır (her tur bir
// kez, "görüldü" bilgisi bu tarayıcıda saklanır); menüdeki ÖĞRETİCİ ile her
// zaman yeniden başlatılır. Adımlar: ogretici-turlar.js.
(function () {
  'use strict';

  // ---------- Saf yardımcılar (Node'da sınanır) ----------
  var KENAR = 16, ARALIK = 14;

  function gorulduAnahtari(tur, uid) { return 'derin-ogretici:' + tur + ':' + uid; }

  // Antrenör ve yönetici (25 Ekim: Derin yönetici de görsün istedi); ziyaretçi hayır.
  function kendiligindenAcilsin(o) { return (o.rol === 'coach' || o.rol === 'admin') && !o.gorduMu; }

  // Balon hedefin altına sığıyorsa alta, sığmıyorsa üste; yatayda ekrandan taşmaz.
  function balonYeri(h, b, e) {
    var alt = h.top + h.height + ARALIK;
    var ust = h.top - ARALIK - b.yuk;
    var yon = (alt + b.yuk <= e.yuk - KENAR || ust < KENAR) ? 'alt' : 'ust';
    var left = Math.min(Math.max(h.left, KENAR), Math.max(KENAR, e.gen - KENAR - b.gen));
    return { top: Math.round(yon === 'alt' ? alt : ust), left: Math.round(left), yon: yon };
  }

  function gecerliAdimlar(adimlar, bul) {
    return adimlar.filter(function (a) {
      if (!a.hedef) return true;
      var h = bul(a.hedef);
      return !!(h && h.gorunur);
    });
  }

  var api = { gorulduAnahtari: gorulduAnahtari, kendiligindenAcilsin: kendiligindenAcilsin, balonYeri: balonYeri, gecerliAdimlar: gecerliAdimlar };
  if (typeof module !== 'undefined') module.exports = api;
  if (typeof document === 'undefined') return;

  // ---------- Sayfa ----------
  var BETIK = document.currentScript;
  var SAYFA = BETIK && BETIK.dataset.sayfa; // 'projelerim' | 'brans'
  var TURLAR = window.DerinOgreticiTurlar || {};
  var dil = function () { return document.documentElement.getAttribute('data-dil') === 'en' ? 'en' : 'tr'; };
  var L = function (tr, en) { return dil() === 'en' ? en : tr; };
  var uid = null, rol = null, aktif = null;

  function depoOku(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function depoYaz(k) { try { localStorage.setItem(gorulduAnahtari(k, uid || 'misafir'), '1'); } catch (e) { /* gizli pencere: tur yine çalışır */ } }
  function gorduMu(tur) { return depoOku(gorulduAnahtari(tur, uid || 'misafir')) === '1'; }

  function bul(sec) {
    var el = document.querySelector(sec);
    if (!el) return null;
    var st = getComputedStyle(el);
    return { el: el, gorunur: el.getClientRects().length > 0 && st.visibility !== 'hidden' && st.display !== 'none' };
  }

  function kur() {
    var kok = document.createElement('div');
    kok.className = 'og-kok';
    kok.innerHTML = '<div class="og-perde"></div><div class="og-isik" hidden></div>'
      + '<div class="og-balon" role="dialog" aria-modal="true" aria-live="polite">'
      + '<p class="og-sayac"></p><h3 class="og-baslik"></h3><p class="og-metin"></p>'
      + '<div class="og-dugmeler"><button type="button" class="og-atla"></button>'
      + '<span class="og-bosluk"></span><button type="button" class="og-geri"></button>'
      + '<button type="button" class="og-ileri"></button></div></div>';
    document.body.append(kok);
    return kok;
  }

  function baslat(tur) {
    if (aktif) bitir(false);
    var tanim = TURLAR[tur];
    if (!tanim) return;
    var adimlar = gecerliAdimlar(tanim, bul);
    if (!adimlar.length) return;
    var kok = kur();
    aktif = { tur: tur, adimlar: adimlar, i: 0, kok: kok };
    kok.querySelector('.og-atla').textContent = L('ATLA', 'SKIP');
    kok.querySelector('.og-atla').onclick = function () { bitir(true); };
    kok.querySelector('.og-geri').onclick = function () { git(aktif.i - 1); };
    kok.querySelector('.og-ileri').onclick = function () { aktif.i >= aktif.adimlar.length - 1 ? bitir(true) : git(aktif.i + 1); };
    document.addEventListener('keydown', tus);
    window.addEventListener('resize', yerlestir);
    window.addEventListener('scroll', yerlestir, true);
    document.body.classList.add('og-acik');
    git(0);

    function git(i) {
      aktif.i = Math.max(0, Math.min(i, aktif.adimlar.length - 1));
      var a = aktif.adimlar[aktif.i], d = dil();
      kok.querySelector('.og-sayac').textContent = (aktif.i + 1) + ' / ' + aktif.adimlar.length;
      kok.querySelector('.og-baslik').textContent = a.baslik[d];
      kok.querySelector('.og-metin').textContent = a.metin[d];
      kok.querySelector('.og-geri').textContent = L('GERİ', 'BACK');
      kok.querySelector('.og-geri').hidden = aktif.i === 0;
      kok.querySelector('.og-ileri').textContent = aktif.i === aktif.adimlar.length - 1 ? L('BİTİR', 'FINISH') : L('İLERİ', 'NEXT');
      var h = a.hedef && bul(a.hedef);
      aktif.hedefEl = h && h.gorunur ? h.el : null;
      if (aktif.hedefEl) aktif.hedefEl.scrollIntoView({ block: 'center', behavior: 'smooth' });
      yerlestir();
      setTimeout(yerlestir, 380);
      kok.querySelector('.og-ileri').focus({ preventScroll: true });
    }
    aktif.git = git;
  }

  function yerlestir() {
    if (!aktif) return;
    var kok = aktif.kok, isik = kok.querySelector('.og-isik'), balon = kok.querySelector('.og-balon');
    var e = { gen: window.innerWidth, yuk: window.innerHeight };
    var dar = e.gen < 600;
    kok.classList.toggle('og-ortada', !aktif.hedefEl);
    if (!aktif.hedefEl) {
      isik.hidden = true;
      balon.style.top = balon.style.left = '';
      balon.className = 'og-balon og-orta';
      return;
    }
    var r = aktif.hedefEl.getBoundingClientRect(), p = 8;
    isik.hidden = false;
    isik.style.top = (r.top - p) + 'px'; isik.style.left = (r.left - p) + 'px';
    isik.style.width = (r.width + p * 2) + 'px'; isik.style.height = (r.height + p * 2) + 'px';
    if (dar) {
      // Telefonda balon ekranın alt ya da üst kenarına yaslanır; hedef kapanmasın.
      balon.className = 'og-balon og-serit ' + (r.top + r.height / 2 > e.yuk / 2 ? 'og-ustte' : 'og-altta');
      balon.style.top = balon.style.left = '';
      return;
    }
    var bb = balon.getBoundingClientRect();
    var y = balonYeri({ top: r.top - p, left: r.left - p, width: r.width + p * 2, height: r.height + p * 2 }, { gen: bb.width || 340, yuk: bb.height || 170 }, e);
    balon.className = 'og-balon og-' + y.yon;
    balon.style.top = y.top + 'px'; balon.style.left = y.left + 'px';
  }

  function tus(e) {
    if (!aktif) return;
    if (e.key === 'Escape') bitir(true);
    else if (e.key === 'ArrowRight') aktif.i >= aktif.adimlar.length - 1 ? bitir(true) : aktif.git(aktif.i + 1);
    else if (e.key === 'ArrowLeft') aktif.git(aktif.i - 1);
  }

  function bitir(gorduOlarak) {
    if (!aktif) return;
    if (gorduOlarak) depoYaz(aktif.tur);
    aktif.kok.remove();
    document.removeEventListener('keydown', tus);
    window.removeEventListener('resize', yerlestir);
    window.removeEventListener('scroll', yerlestir, true);
    document.body.classList.remove('og-acik');
    aktif = null;
  }

  // Projelerim'de parça odası açıksa onun turu, değilse sayfanın turu.
  function sayfaTuru() {
    if (SAYFA === 'projelerim') {
      var d = bul('.track-detail');
      return d && d.gorunur ? 'proje-detay' : 'projelerim';
    }
    return SAYFA;
  }

  // ---------- Menüde ÖĞRETİCİ ----------
  function menuyeEkle() {
    var liste = document.querySelector('.account-menu-links');
    if (!liste || liste.querySelector('[data-ogretici]')) return;
    var a = document.createElement('a');
    a.href = '#'; a.dataset.ogretici = ''; a.textContent = L('ÖĞRETİCİ', 'TUTORIAL');
    a.onclick = function (e) {
      e.preventDefault();
      var menu = document.querySelector('.account-menu');
      if (menu) { menu.classList.remove('open'); menu.hidden = true; }
      document.body.classList.remove('account-menu-open');
      setTimeout(function () { baslat(sayfaTuru()); }, 120);
    };
    liste.prepend(a);
  }

  function bekle(sec, sure) {
    return new Promise(function (tamam) {
      var bas = Date.now();
      (function bak() {
        var h = bul(sec);
        if (h && h.gorunur) return tamam(true);
        if (Date.now() - bas > sure) return tamam(false);
        setTimeout(bak, 300);
      })();
    });
  }

  function kendiliginden(tur) {
    if (aktif || !kendiligindenAcilsin({ rol: rol, gorduMu: gorduMu(tur) })) return;
    baslat(tur);
  }

  async function basla() {
    if (!SAYFA) return;
    new MutationObserver(menuyeEkle).observe(document.body, { childList: true, subtree: true });
    menuyeEkle();
    var st = null;
    try { st = window.DerinAuth && await window.DerinAuth.ready; } catch (e) { st = null; }
    uid = st && st.user ? st.user.id : null;
    rol = st && st.profile ? st.profile.role : null;
    if (!uid) return;
    if (SAYFA === 'projelerim') {
      if (await bekle('.proj-track, .proj-card', 10000)) setTimeout(function () { kendiliginden('projelerim'); }, 500);
      // Parça odası ilk kez açılınca onun turu.
      var bekliyor = false;
      new MutationObserver(function () {
        if (bekliyor || aktif || sayfaTuru() !== 'proje-detay' || gorduMu('proje-detay')) return;
        bekliyor = true;
        setTimeout(function () { bekliyor = false; if (sayfaTuru() === 'proje-detay') kendiliginden('proje-detay'); }, 900);
      }).observe(document.body, { childList: true, subtree: true });
    } else {
      if (await bekle('.feedback, .feedback-access', 8000)) setTimeout(function () { kendiliginden('brans'); }, 500);
    }
  }

  window.DerinOgretici = { baslat: baslat, bitir: bitir };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', basla); else basla();
})();
