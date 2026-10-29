// Derin Record — ana sayfa açılış ekranı (Spotify gibi sessiz, 3 saniye).
// Koyu ekranda logo belirir; site erken hazırsa açılış tam 3 sn sürer, geç kalırsa
// site hazır olana kadar bekler ama en fazla 3,6 sn.
// Yalnız ana sayfada, oturumda bir kez. Aramadan gelen, site içinden dönen,
// # bölüm bağlantısıyla gelen ve botlar açılışı görmez. Ekrana dokunan hemen geçer.
// Deneme / tekrar izleme: derinrecord.com/?intro=1   (kapatmak için ?intro=0)
(() => {
  'use strict';
  const ANAHTAR = 'derin-intro-goruldu';
  const VARSAYILAN = 'A';
  const SECENEKLER = ['A', 'B', 'C'];
  const TOPLAM = 3;                             // site erken hazırsa açılışın süresi (sn)
  const BEKLEME = 0.6;                          // site geç kalırsa en fazla bu kadar daha beklenir
  const CIKIS = { A: 0.45, B: 0.85, C: 0.45 };  // çıkış süreleri (sn)
  const ARAMA_MOTORU = /(^|\.)(google|bing|yandex|duckduckgo|yahoo|ecosia|baidu|naver|qwant|search\.brave)\./i;
  const BOT = /bot\b|bot\/|crawl|spider|slurp|lighthouse|headless/i;

  function gosterilsinMi(o) {
    const p = new URLSearchParams(o.arama || '');
    const zorla = (p.get('intro') || '').toUpperCase();
    if (zorla === '0') return false;
    if (zorla === '1' || SECENEKLER.includes(zorla)) return true;
    if (!/^\/(index\.html)?$/.test(o.yol || '')) return false;
    if (o.oturum) return false;
    if (o.hash && o.hash.length > 1) return false;
    if (BOT.test(o.ajan || '')) return false;
    if (o.referans) {
      try {
        const r = new URL(o.referans);
        if (o.koken && r.origin === o.koken) return false;
        if (ARAMA_MOTORU.test(r.hostname)) return false;
      } catch (e) { /* bozuk referans: yok say */ }
    }
    return true;
  }

  function secenekBul(arama) {
    const z = (new URLSearchParams(arama || '').get('intro') || '').toUpperCase();
    return SECENEKLER.includes(z) ? z : VARSAYILAN;
  }

  // Çıkışın başladığı an: toplam 3 sn olacak şekilde; site daha geç hazırsa onu bekler (en fazla +0,6 sn).
  const cikisZamani = (hazir, sec = VARSAYILAN) => {
    const enAz = TOPLAM - CIKIS[sec];
    return Math.min(enAz + BEKLEME, Math.max(enAz, hazir));
  };

  window.DerinIntro = { gosterilsinMi, secenekBul, cikisZamani, SECENEKLER, CIKIS };
  if (typeof document === 'undefined') return;

  // ---------------- yardımcılar ----------------
  const kis = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  const ara = (t, a, b) => kis((t - a) / (b - a));
  const kar = (a, b, p) => a + (b - a) * p;
  const cikis = p => 1 - Math.pow(1 - kis(p), 3);
  const icdis = p => { p = kis(p); return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2; };
  const geri = p => { p = kis(p); const c = 1.70158; return 1 + (c + 1) * Math.pow(p - 1, 3) + c * Math.pow(p - 1, 2); };

  const LOGO = { w: 1760, h: 1460 };
  const LOGO_IC = [1405.8, 1525.6, 3436.5, 2850.8];   // assets/logo.png (6250 kare) içinde aynı logo
  const sade = (() => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } })();

  let secenek = VARSAYILAN, kok = null, el = {}, G = null;
  let durum = 'yok', t0 = 0, raf = 0, hazir = Infinity, kilit = null;

  // ---------------- karar (<body> açılır açılmaz, eşzamanlı) ----------------
  let oturum = false;
  try { oturum = sessionStorage.getItem(ANAHTAR) === '1'; } catch (e) { /* gizli mod */ }
  const karar = gosterilsinMi({
    yol: location.pathname, arama: location.search, hash: location.hash, oturum,
    referans: document.referrer, koken: location.origin, ajan: navigator.userAgent
  });
  if (!karar) return;
  secenek = secenekBul(location.search);
  if (document.body) guvenli(ac)();
  else {
    document.documentElement.classList.add('dintro-bekle');
    document.addEventListener('DOMContentLoaded', () => guvenli(ac)(), { once: true });
  }

  // Bir hata olursa açılış sessizce kalkar, site normal açılır.
  function acil() {
    try { cancelAnimationFrame(raf); if (kok) kok.remove(); } catch (e) { /* yok */ }
    kok = null; durum = 'bitti';
    document.documentElement.classList.remove('dintro-acik', 'dintro-bekle');
  }
  function guvenli(f) { return (...a) => { try { return f(...a); } catch (e) { acil(); } }; }

  // ---------------- kurulum ----------------
  function ac(onizleme) {
    if (kok || durum === 'bitti' || document.getElementById('derin-intro')) return;
    kok = document.createElement('div');
    kok.id = 'derin-intro';
    kok.className = 'dintro dintro-' + secenek;
    kok.setAttribute('aria-hidden', 'true');
    kok.setAttribute('data-dil-yok', '');
    kok.innerHTML = `
      <div class="dintro-zemin"></div>
      <div class="dintro-logo">
        <img class="dintro-govde" src="assets/intro/logo-noktasiz.webp" alt="" decoding="async" fetchpriority="high">
        <img class="dintro-nokta" src="assets/intro/logo-nokta.webp" alt="" decoding="async">
        <div class="dintro-bant"><i class="dintro-isik"></i></div>
      </div>`;
    document.body.appendChild(kok);
    el = { zemin: kok.querySelector('.dintro-zemin'), logo: kok.querySelector('.dintro-logo'), nokta: kok.querySelector('.dintro-nokta'), isik: kok.querySelector('.dintro-isik') };
    document.documentElement.classList.add('dintro-acik');
    document.documentElement.classList.remove('dintro-bekle');
    durum = 'oynuyor';
    try { sessionStorage.setItem(ANAHTAR, '1'); } catch (e) { /* gizli mod */ }
    olc();
    kare(0);
    addEventListener('resize', olc);
    if (onizleme) return;
    kok.addEventListener('pointerdown', () => kapat(), { once: true });
    t0 = performance.now();
    hazirligiBekle();
    raf = requestAnimationFrame(dongu_);
  }

  // Sayfa hazır: belge okundu ve sayfadaki kaset logosu yüklendi.
  function hazirligiBekle() {
    const ol = () => { if (hazir === Infinity) hazir = (performance.now() - t0) / 1000; };
    const bak = () => {
      const img = document.querySelector('.hero-art img');
      if (!img || (img.complete && img.naturalWidth)) return ol();
      img.addEventListener('load', ol, { once: true });
      img.addEventListener('error', ol, { once: true });
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bak, { once: true });
    else bak();
  }

  function olc() {
    if (!kok) return;
    const vw = innerWidth, vh = innerHeight;
    const lw = Math.round(Math.min(vw * 0.6, 340, vh * 0.38 * LOGO.w / LOGO.h));
    const lh = lw * LOGO.h / LOGO.w;
    G = Object.assign(G || {}, { vw, vh, lw, lh, lx: (vw - lw) / 2, ly: (vh - lh) / 2 });
    Object.assign(el.logo.style, { left: G.lx + 'px', top: G.ly + 'px', width: lw + 'px', height: lh + 'px' });
    // ışık maskesi: logonun tamamı, bant kutusuna göre kaydırılmış
    const boy = `${lw}px ${lh}px`, yer = `${-lw * 37 / LOGO.w}px ${-lh * 729 / LOGO.h}px`;
    Object.assign(el.isik.parentNode.style, { webkitMaskSize: boy, maskSize: boy, webkitMaskPosition: yer, maskPosition: yer });
  }

  function dongu() {
    if (durum !== 'oynuyor') return;
    const t = (performance.now() - t0) / 1000;
    const bitis = kare(t);
    if (t >= bitis) return bitir();
    raf = requestAnimationFrame(dongu_);
  }
  // fonksiyon bildirimi: ac() betik başında eşzamanlı çalışırken de hazır olsun
  function dongu_() { try { dongu(); } catch (e) { acil(); } }

  function kapat() {
    if (!kok || durum === 'bitti') return;
    durum = 'bitti';
    cancelAnimationFrame(raf);
    kok.classList.add('kapaniyor');
    setTimeout(bitir, 260);
  }

  function bitir() {
    cancelAnimationFrame(raf);
    durum = 'bitti';
    removeEventListener('resize', olc);
    if (kok) { kok.remove(); kok = null; }
    document.documentElement.classList.remove('dintro-acik', 'dintro-bekle');
  }

  // ---------------- kare çizimi ----------------
  // t: açılıştan beri geçen süre (sn). Döndürdüğü değer: açılışın biteceği an.
  function kare(t) {
    const Tc = cikisZamani(hazir, secenek);
    if (kilit === null && t >= Tc) kilit = Tc;
    const T = kilit === null ? Tc : kilit;
    const gir = ara(t, 0.05, 0.45);
    let s = sade ? 1 : kar(0.92, 1, cikis(gir)) * (1 + 0.04 * ara(t, 0.45, T)), x = 0, y = 0, r = 0, o = cikis(gir), zemin = 1;
    let son = T + CIKIS[secenek];
    // A, B: sarı bandın üstünden bir ışık geçer
    if (secenek !== 'C' && !sade) {
      const p = ara(t, 1.0, 1.75);
      el.isik.style.opacity = p > 0 && p < 1 ? Math.sin(p * Math.PI) : 0;
      el.isik.style.transform = `translateX(${kar(-40, 420, p)}%) skewX(-20deg)`;
    }
    // C: kırmızı nokta kayıt ışığı gibi yanıp söner (0,6 / 1,1 / 1,6 sn'de yanar, sonra açık kalır)
    if (secenek === 'C') {
      const yan = sade ? t >= 0.6 : (t >= 0.6 && t < 0.85) || (t >= 1.1 && t < 1.35) || t >= 1.6;
      el.nokta.style.opacity = yan ? 1 : 0;
      const pop = t < 0.85 ? geri(ara(t, 0.6, 0.78)) : 1;
      el.nokta.style.transform = sade ? 'none' : `scale(${pop})`;
      el.nokta.style.filter = yan ? 'drop-shadow(0 0 8px rgba(247,8,17,.8))' : 'none';
    }
    if (t >= T) {
      if (secenek === 'B' && !sade && G.hedef === undefined) G.hedef = heroHedef();
      const H = secenek === 'B' && !sade ? G.hedef : null;
      if (H) {
        // logo karanlıkta yerine konar, sonra sayfa çevresinde belirir, en son logo devredilir
        const p = icdis(ara(t, T, T + 0.5));
        x = kar(0, H.cx - (G.lx + G.lw / 2), p);
        y = kar(0, H.cy - (G.ly + G.lh / 2), p);
        s = kar(s, H.w / G.lw, p);
        r = kar(0, H.aci, p);
        zemin = 1 - icdis(ara(t, T + 0.3, T + 0.65));
        o *= 1 - ara(t, T + 0.6, T + 0.85);
      } else {
        // logo önce kaybolur, sonra sayfa açılır (iki logo üst üste binmesin)
        if (!sade) s *= 1 + 0.06 * cikis(ara(t, T, T + 0.3));
        o *= 1 - cikis(ara(t, T, T + 0.25));
        zemin = 1 - icdis(ara(t, T + 0.1, T + 0.45));
        son = T + 0.45;
      }
    }
    el.logo.style.opacity = o;
    el.logo.style.transform = `translate(${x}px,${y}px) rotate(${r}deg) scale(${s})`;
    el.zemin.style.opacity = zemin;
    return son;
  }

  // Logonun sayfadaki kaset logosuna konacağı yer (.hero-art img). Görünmüyorsa null.
  function heroHedef() {
    const img = document.querySelector('.hero-art img');
    if (!img || !img.naturalWidth) return null;
    const r = img.getBoundingClientRect();
    if (r.width < 60 || r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) return null;
    let aci = 0;
    const sanat = img.closest('.hero-art');
    const m = sanat && getComputedStyle(sanat).transform;
    const v = m && m.match(/matrix\(([^)]+)\)/);
    if (v) { const [a, b] = v[1].split(',').map(Number); aci = Math.atan2(b, a); }
    const w = img.offsetWidth, h = img.offsetHeight;
    const s = Math.min(w / img.naturalWidth, h / img.naturalHeight);
    const ox = (w - img.naturalWidth * s) / 2, oy = (h - img.naturalHeight * s) / 2;
    const ks = img.naturalWidth / 6250;
    const lw = LOGO_IC[2] * ks * s, lh = LOGO_IC[3] * ks * s;
    const dx = ox + LOGO_IC[0] * ks * s + lw / 2 - w / 2;
    const dy = oy + LOGO_IC[1] * ks * s + lh / 2 - h / 2;
    return {
      cx: r.left + r.width / 2 + dx * Math.cos(aci) - dy * Math.sin(aci),
      cy: r.top + r.height / 2 + dx * Math.sin(aci) + dy * Math.cos(aci),
      w: lw, aci: aci * 180 / Math.PI
    };
  }

  // Önizleme (video çekimi): t anını, site 'hz' saniyede hazır olmuş gibi çizer.
  window.DerinIntro.onizle = (t, sec, hz = 0.8) => {
    if (!kok) { if (sec) secenek = sec; durum = 'yok'; ac(true); }
    hazir = hz;
    kilit = null;
    if (t < cikisZamani(hz, secenek)) G.hedef = undefined;
    return kare(t);
  };
})();
