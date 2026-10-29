// Derin Record — site açılış introsu (yalnız ana sayfa, oturumda bir kez).
// Akış: kapı (▶ DİNLEYEREK GİR / GEÇ) -> 8 sn intro + ses imzası -> logo, sayfadaki kaset logosunun yerine konar.
// Tarayıcılar ziyaretçi dokunmadan ses çaldırmaz; bu yüzden önce kapı gelir.
// Aramadan gelen, site içinden dönen, # bölüm bağlantısıyla gelen ve botlar introyu görmez.
// Deneme / tekrar izleme: derinrecord.com/?intro=1   (kapatmak için ?intro=0)
(() => {
  'use strict';
  const ANAHTAR = 'derin-intro-goruldu';
  const VARSAYILAN = 'A';
  const SECENEKLER = ['A', 'B', 'C'];
  const SURE = 8;
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

  window.DerinIntro = { gosterilsinMi, secenekBul };
  if (typeof document === 'undefined') return;

  // ---------------- yardımcılar ----------------
  const kis = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  const ara = (t, a, b) => kis((t - a) / (b - a));
  const kar = (a, b, p) => a + (b - a) * p;
  const cikis = p => 1 - Math.pow(1 - kis(p), 3);
  const icdis = p => { p = kis(p); return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2; };
  const geri = p => { p = kis(p); const c = 1.70158; return 1 + (c + 1) * Math.pow(p - 1, 3) + c * Math.pow(p - 1, 2); };
  const vur = (t, z, d) => (t < z ? 0 : Math.exp(-(t - z) / d));
  const sans = i => { const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x); };

  // Logo katmanlarının yerleri (logo kutusu 1760 x 1460 birim)
  const LOGO = { w: 1760, h: 1460 };
  const KAT = {
    kaset: [241, 29, 1298, 700], kasetTam: [240, 28, 1304, 847], bant: [37, 729, 1687, 365],
    derin: [400, 730, 960, 319], record: [70, 1139, 1379, 281], nokta: [1500, 1200, 166, 177]
  };
  const HARF = [[0, 206], [206, 210], [416, 253], [669, 274], [943, 211], [1154, 225]];
  const MAKARA = [[637, 473], [1144, 426]];
  const LOGO_IC = [1405.8, 1525.6, 3436.5, 2850.8];   // assets/logo.png (6250 kare) içinde aynı logo
  const SARI = '#cfb138';

  const dil = (() => {
    try {
      const p = new URLSearchParams(location.search).get('dil');
      if (/^(tr|en)$/.test(p)) return p;
      const k = localStorage.getItem('derin-dil');
      if (/^(tr|en)$/.test(k)) return k;
    } catch (e) { /* gizli mod */ }
    return 'tr';
  })();
  const YAZI = dil === 'en'
    ? { gir: 'ENTER WITH SOUND', not: '8-second intro with sound', gec: 'SKIP', kelime: ['STAGE', 'SCREEN', 'SPACE'] }
    : { gir: 'DİNLEYEREK GİR', not: '8 saniyelik sesli intro', gec: 'GEÇ', kelime: ['SAHNE', 'PERDE', 'MEKÂN'] };

  let secenek = VARSAYILAN, kok = null, el = {}, G = null, ctx = null;
  let durum = 'yok', t0 = 0, raf = 0, ses = null, sesAdres = '', blobAdres = '';

  // ---------------- karar (head içinde, eşzamanlı) ----------------
  let oturum = false;
  try { oturum = sessionStorage.getItem(ANAHTAR) === '1'; } catch (e) { /* gizli mod */ }
  const karar = gosterilsinMi({
    yol: location.pathname, arama: location.search, hash: location.hash, oturum,
    referans: document.referrer, koken: location.origin, ajan: navigator.userAgent
  });
  if (!karar) return;
  secenek = secenekBul(location.search);
  // <body> açılır açılmaz çalışır: kapı, sayfanın geri kalanı yüklenirken hemen görünür.
  if (document.body) guvenli(ac)();
  else {
    document.documentElement.classList.add('dintro-bekle');
    document.addEventListener('DOMContentLoaded', () => guvenli(ac)(), { once: true });
  }

  // Bir hata olursa intro sessizce kalkar, site normal açılır.
  function acil() {
    try { cancelAnimationFrame(raf); if (kok) kok.remove(); if (ses) ses.pause(); } catch (e) { /* yok */ }
    kok = null; durum = 'bitti';
    document.documentElement.classList.remove('dintro-acik', 'dintro-bekle');
  }
  function guvenli(f) { return (...a) => { try { return f(...a); } catch (e) { acil(); } }; }

  // ---------------- kurulum ----------------
  function kur() {
    const k = document.createElement('div');
    k.id = 'derin-intro';
    k.className = 'dintro dintro-' + secenek;
    k.setAttribute('role', 'dialog');
    k.setAttribute('aria-modal', 'true');
    k.setAttribute('aria-label', 'Derin Record intro');
    k.setAttribute('data-dil-yok', '');
    const harfler = HARF.map((_, i) => `<i class="dintro-harf" data-i="${i}"></i>`).join('');
    const makara = '<svg class="dintro-makara" viewBox="-50 -50 100 100" aria-hidden="true"><circle r="47" fill="#0b0b0d"/><circle r="27" fill="#bc225c"/>' +
      [0, 60, 120, 180, 240, 300].map(a => `<rect x="-5" y="-29" width="10" height="13" rx="2" fill="#0b0b0d" transform="rotate(${a})"/>`).join('') +
      '<circle r="9" fill="#0b0b0d"/></svg>';
    k.innerHTML = `
      <div class="dintro-zemin"></div>
      <canvas class="dintro-tuval" aria-hidden="true"></canvas>
      <div class="dintro-logo" aria-hidden="true">
        <div class="dintro-kirp"><div class="dintro-kaset-kap">
          ${secenek === 'A' ? '<img class="dintro-kaset-tam" src="assets/intro/kaset-tam.webp" alt="" decoding="async">' : ''}
          <img class="dintro-kaset" src="assets/intro/kaset.webp" alt="" decoding="async">
          ${secenek === 'A' ? makara + makara : ''}
        </div></div>
        <div class="dintro-bant"><i class="dintro-isik"></i></div>
        <img class="dintro-derin" src="assets/intro/derin.webp" alt="" decoding="async">
        ${harfler}
        <img class="dintro-nokta" src="assets/intro/nokta.webp" alt="" decoding="async">
      </div>
      <div class="dintro-kelime" aria-hidden="true"></div>
      <span class="dintro-rec" aria-hidden="true">REC</span>
      <i class="dintro-yarik" aria-hidden="true"></i>
      <div class="dintro-kapi">
        <button type="button" class="dintro-oynat">
          <span class="dintro-daire"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8.2 5.2v13.6L19 12z" fill="currentColor"/></svg></span>
          <span class="dintro-etiket">${YAZI.gir}</span>
          <span class="dintro-not">${YAZI.not}</span>
        </button>
      </div>
      <button type="button" class="dintro-gec">${YAZI.gec}</button>`;
    return k;
  }

  function ac(onizleme) {
    if (kok || durum === 'bitti' || document.getElementById('derin-intro')) return;
    kok = kur();
    document.body.appendChild(kok);
    const q = s => kok.querySelector(s), qa = s => [...kok.querySelectorAll(s)];
    el = {
      zemin: q('.dintro-zemin'), tuval: q('.dintro-tuval'), logo: q('.dintro-logo'), kirp: q('.dintro-kirp'),
      kap: q('.dintro-kaset-kap'), kaset: q('.dintro-kaset'), kasetTam: q('.dintro-kaset-tam'), makara: qa('.dintro-makara'),
      bant: q('.dintro-bant'), derin: q('.dintro-derin'), harf: qa('.dintro-harf'), nokta: q('.dintro-nokta'),
      isik: q('.dintro-isik'), kelime: q('.dintro-kelime'), rec: q('.dintro-rec'), yarik: q('.dintro-yarik'),
      kapi: q('.dintro-kapi'), oynat: q('.dintro-oynat'), gec: q('.dintro-gec')
    };
    ctx = el.tuval.getContext('2d');
    document.documentElement.classList.add('dintro-acik');
    document.documentElement.classList.remove('dintro-bekle');
    durum = 'kapi';
    try { sessionStorage.setItem(ANAHTAR, '1'); } catch (e) { /* gizli mod */ }
    olc();
    kare(-1);
    addEventListener('resize', olc);
    if (onizleme) return;
    sesHazirla();
    el.oynat.addEventListener('click', guvenli(baslat));
    el.gec.addEventListener('click', () => kapat(true));
    document.addEventListener('keydown', tus);
    document.addEventListener('visibilitychange', gizlenince);
    try { el.oynat.focus({ preventScroll: true }); } catch (e) { /* eski tarayıcı */ }
  }

  function olc() {
    if (!kok) return;
    const vw = innerWidth, vh = innerHeight;
    const lw = Math.round(Math.min(vw * 0.82, 640, vh * 0.6 * LOGO.w / LOGO.h));
    const lh = lw * LOGO.h / LOGO.w;
    const lx = (vw - lw) / 2;
    const ly = (vh - lh) / 2 - (secenek === 'A' ? lh * 0.05 : 0);
    const k = lw / LOGO.w;
    G = Object.assign(G || {}, { vw, vh, lw, lh, lx, ly, k });
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    el.tuval.width = Math.round(vw * dpr); el.tuval.height = Math.round(vh * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const kutu = (e, [x, y, w, h]) => { if (!e) return; Object.assign(e.style, { left: x * k + 'px', top: y * k + 'px', width: w * k + 'px', height: h * k + 'px' }); };
    Object.assign(el.logo.style, { left: lx + 'px', top: ly + 'px', width: lw + 'px', height: lh + 'px' });
    Object.assign(el.kirp.style, { left: 0, top: 0, width: lw + 'px', height: (secenek === 'B' ? KAT.bant[1] * k : lh) + 'px' });
    Object.assign(el.kap.style, { left: 0, top: 0, width: lw + 'px', height: lh + 'px' });
    kutu(el.kaset, KAT.kaset); kutu(el.kasetTam, KAT.kasetTam); kutu(el.bant, KAT.bant);
    kutu(el.derin, KAT.derin); kutu(el.nokta, KAT.nokta);
    const [rx, ry, rw, rh] = KAT.record;
    el.harf.forEach((h, i) => {
      const [hx, hw] = HARF[i];
      kutu(h, [rx + hx, ry, hw, rh]);
      h.style.backgroundSize = `${rw * k}px ${rh * k}px`;
      h.style.backgroundPosition = `${-hx * k}px 0`;
    });
    const R = 50;
    el.makara.forEach((m, i) => kutu(m, [MAKARA[i][0] - R, MAKARA[i][1] - R, 2 * R, 2 * R]));
    el.kelime.style.fontSize = Math.round(Math.min(vw * 0.15, 150, vh * 0.15)) + 'px';
  }

  // ---------------- ses ----------------
  function sesHazirla() {
    sesAdres = `assets/intro/imza-${secenek}.mp3`;
    ses = new Audio();
    ses.preload = 'auto';
    try {
      fetch(sesAdres).then(r => (r.ok ? r.blob() : null)).then(b => {
        if (!b || durum !== 'kapi' || ses.src) return;
        blobAdres = URL.createObjectURL(b);
        ses.src = blobAdres;
        ses.load();
      }).catch(() => {});
    } catch (e) { /* fetch yok */ }
  }

  function baslat() {
    if (durum !== 'kapi') return;
    durum = 'bekliyor';
    kok.classList.add('bekliyor');
    let basladi = false;
    const git = () => {
      if (basladi || durum !== 'bekliyor') return;
      basladi = true;
      durum = 'oynuyor';
      kok.classList.add('oynuyor');
      t0 = performance.now() - (ses && !ses.paused ? ses.currentTime * 1000 : 0);
      raf = requestAnimationFrame(dongu_);
    };
    try {
      if (!ses.src) ses.src = sesAdres;
      ses.addEventListener('playing', git, { once: true });
      const p = ses.play();
      if (p && p.catch) p.catch(git);          // ses çalınamazsa sessiz devam
    } catch (e) { git(); }
    setTimeout(() => { if (!basladi) { try { ses.pause(); } catch (e) { /* yok */ } git(); } }, 2500);
  }

  function dongu() {
    if (durum !== 'oynuyor') return;
    let t = (performance.now() - t0) / 1000;
    if (ses && !ses.paused && ses.currentTime > 0 && Math.abs(ses.currentTime - t) > 0.12) {
      t0 = performance.now() - ses.currentTime * 1000; t = ses.currentTime;
    }
    kare(t);
    if (t >= 7.9) return bitir();
    raf = requestAnimationFrame(dongu_);
  }
  const dongu_ = guvenli(dongu);

  function tus(e) { if (e.key === 'Escape') kapat(true); }
  function gizlenince() { if (document.hidden && durum === 'oynuyor') kapat(true); }

  function kapat(hizli) {
    if (!kok || durum === 'bitti') return;
    if (hizli) {
      try { ses && ses.pause(); } catch (e) { /* yok */ }
      kok.classList.add('kapaniyor');
      durum = 'bitti';
      setTimeout(bitir, 320);
    } else bitir();
  }

  function bitir() {
    cancelAnimationFrame(raf);
    durum = 'bitti';
    removeEventListener('resize', olc);
    document.removeEventListener('keydown', tus);
    document.removeEventListener('visibilitychange', gizlenince);
    if (kok) { kok.remove(); kok = null; }
    document.documentElement.classList.remove('dintro-acik', 'dintro-bekle');
    if (ses) ses.addEventListener('ended', () => { if (blobAdres) URL.revokeObjectURL(blobAdres); }, { once: true });
  }

  // ---------------- kare çizimi ----------------
  function stil(e, tr, op) {
    if (!e) return;
    e.style.transform = tr;
    e.style.opacity = op;
  }

  function kare(t) {
    const kapiAcik = t < 0;
    kok.classList.toggle('oynuyor', !kapiAcik || durum === 'oynuyor');
    // kapı çıkışı
    const kc = kapiAcik ? 1 : 1 - cikis(ara(t, 0, 0.3));
    el.kapi.style.opacity = kc;
    el.kapi.style.visibility = kc > 0.01 ? 'visible' : 'hidden';
    el.oynat.style.transform = kapiAcik ? '' : `scale(${1 - 0.35 * cikis(ara(t, 0, 0.25))})`;
    el.gec.style.opacity = kapiAcik ? 1 : 0.55 * ara(t, 0.8, 1.3) * (1 - ara(t, 6.2, 6.5));
    ctx.clearRect(0, 0, G.vw, G.vh);
    if (kapiAcik) {
      el.logo.style.opacity = 0; el.kelime.style.opacity = 0; el.rec.style.opacity = 0;
      el.zemin.style.opacity = 1;
      return;
    }
    let yerel;
    if (secenek === 'A') yerel = kareA(t);
    else if (secenek === 'B') yerel = kareB(t);
    else yerel = kareC(t);
    const u = ucus(t, yerel);
    el.logo.style.opacity = u.o;
    el.logo.style.transform = `translate(${u.x}px,${u.y}px) rotate(${u.r}deg) scale(${u.s})`;
    el.zemin.style.opacity = 1 - 0.15 * ara(t, 6.6, 7.05) - 0.85 * icdis(ara(t, 7.05, 7.6));
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

  function ucus(t, y) {
    const sonuc = { x: y.x || 0, y: y.y || 0, s: y.s == null ? 1 : y.s, r: y.r || 0, o: y.o == null ? 1 : y.o };
    if (t < 6.4) { G.hedef = undefined; return sonuc; }
    if (G.hedef === undefined) G.hedef = heroHedef();
    const p = icdis(ara(t, 6.4, 7.15));
    if (!G.hedef) {
      sonuc.s *= 1 - 0.08 * p;
      sonuc.o *= 1 - ara(t, 7.05, 7.6);
      return sonuc;
    }
    const H = G.hedef;
    const mx = G.lx + G.lw / 2, my = G.ly + G.lh / 2;
    sonuc.x = kar(sonuc.x, H.cx - mx, p);
    sonuc.y = kar(sonuc.y, H.cy - my, p);
    sonuc.s = kar(sonuc.s, H.w / G.lw, p);
    sonuc.r = kar(sonuc.r, H.aci, p);
    sonuc.o *= 1 - ara(t, 7.5, 7.85);
    return sonuc;
  }

  // Ortak: RECORD harfleri ve nokta
  const HARF_ZAMAN = [3.0, 3.0, 3.25, 3.25, 3.5, 3.5];

  // ================= A · KASET =================
  const A_KICK = [2.0, 2.75, 3.0, 3.75, 4.0, 4.75, 5.0, 5.75, 6.0];
  const A_SNARE = [2.5, 3.5, 4.5, 5.5];
  const A_HAT = [];
  for (const b of [2.0, 4.0]) for (let s = 0; s < 16; s += 2) A_HAT.push(b + s * 0.125 + (s % 4 === 2 ? 0.018 : 0));
  const A_NOTA = [[3.0, 0.25], [3.25, 0.45], [3.5, 0.6], [3.75, 0.7], [4.5, 0.66], [5.5, 0.7], [5.75, 0.66], [6.0, 0.6]];

  function makaraAcisi(t) {
    const W = 600;   // derece / sn
    if (t < 0.15) return 0;
    if (t < 1.15) { const p = t - 0.15; return W * (p * p - p * p * p / 3); }
    const s1 = W * (2 / 3);
    if (t < 6.4) return s1 + W * (t - 1.15);
    const s2 = s1 + W * (6.4 - 1.15);
    const q = ara(t, 6.4, 7.15);
    return s2 + W * 0.75 * (1 - Math.pow(1 - q, 3)) / 3;
  }

  function kareA(t) {
    const { lw, lh, k } = G;
    const kick = A_KICK.reduce((a, z) => a + vur(t, z, 0.11), 0);
    // kaset: ekran ortasında belirir, bant hızlanır; vuruşta (2.0) yerine çıkar
    const gir = ara(t, 0.1, 0.6);
    const tasin = cikis(ara(t, 2.0, 2.32));
    const bekle = icdis(ara(t, 1.5, 1.95)) * (1 - tasin);
    const kx = (lw / 2 - (KAT.kasetTam[0] + KAT.kasetTam[2] / 2) * k) * (1 - tasin);
    const ky = (lh / 2 - (KAT.kasetTam[1] + KAT.kasetTam[3] / 2) * k) * (1 - tasin);
    const ks = kar(0.86, 1, geri(gir)) * kar(1.35, 1, tasin) * (1 + 0.05 * bekle) * (1 + 0.012 * kick * tasin);
    const kr = kar(-4, 0, cikis(gir));
    stil(el.kap, `translate(${kx}px,${ky}px) rotate(${kr}deg) scale(${ks})`, cikis(gir));
    const gec = ara(t, 2.25, 2.37);
    if (el.kasetTam) el.kasetTam.style.opacity = 1 - gec;
    el.kaset.style.opacity = gec;
    const aci = makaraAcisi(t);
    el.makara.forEach(m => stil(m, `rotate(${aci}deg)`, 1 - ara(t, 7.0, 7.3)));
    // bant: soldan sağa çarpar; DERİN damgası 2.5'te
    const bw = cikis(ara(t, 2.0, 2.22));
    el.bant.style.clipPath = `inset(0 ${(1 - bw) * 100}% 0 0)`;
    el.bant.style.transform = `translateY(${3 * vur(t, 2.5, 0.05) * lh / 300}px)`;
    el.bant.style.opacity = t >= 2.0 ? 1 : 0;
    const dm = ara(t, 2.5, 2.62);
    stil(el.derin, `scale(${1 + 0.28 * (1 - cikis(dm))})`, t >= 2.5 ? Math.min(1, dm * 4) : 0);
    harfler(t, 'A');
    nokta(t);
    // ekolayzer (logonun altında)
    if (t >= 2.0 && t < 7.0) ekolayzer(t);
    // genel: 6.0'da vuruş, ışık geçişi
    isikGecisi(t, 6.0, 0.6);
    const s = 1 + 0.035 * vur(t, 6.0, 0.18);
    return { s };
  }

  function harfler(t, tur) {
    el.harf.forEach((h, i) => {
      const z = HARF_ZAMAN[i];
      const p = ara(t, z, z + 0.22);
      if (tur === 'B') {
        h.style.transformOrigin = '50% 100%';
        stil(h, `scaleY(${geri(p)})`, t >= z ? Math.min(1, p * 5) : 0);
      } else {
        stil(h, `translateY(${(1 - geri(p)) * 40}%)`, t >= z ? Math.min(1, p * 4) : 0);
      }
    });
  }

  function nokta(t) {
    const p = ara(t, 3.75, 4.05);
    const parla = 0.35 + 0.65 * vur(t, 3.75, 0.5) + 0.25 * (0.5 + 0.5 * Math.cos((t - 3.75) * Math.PI * 4)) * ara(t, 4.0, 4.3);
    stil(el.nokta, `scale(${geri(p)})`, t >= 3.75 ? 1 : 0);
    el.nokta.style.filter = `drop-shadow(0 0 ${Math.round(4 + 14 * parla)}px rgba(247,8,17,${(0.25 + 0.5 * parla).toFixed(2)}))`;
  }

  function isikGecisi(t, z, d) {
    const p = ara(t, z, z + d);
    el.isik.style.opacity = p > 0 && p < 1 ? Math.sin(p * Math.PI) * 0.85 : 0;
    el.isik.style.transform = `translateX(${kar(-30, 130, p)}%) skewX(-18deg)`;
  }

  function ekolayzer(t) {
    const { lx, ly, lw, lh } = G;
    const N = 28, gen = lw * 0.62, x0 = lx + (lw - gen) / 2, taban = ly + lh * 1.1, hMax = lh * 0.13;
    const ac_ = cikis(ara(t, 2.0, 2.3)) * (1 - ara(t, 6.4, 6.8));
    if (ac_ <= 0) return;
    ctx.fillStyle = SARI;
    const ad = gen / N;
    for (let i = 0; i < N; i++) {
      const f = i / (N - 1);
      let v = 0.08 + 0.05 * Math.sin(t * 9 + i * 1.7);
      for (const z of A_KICK) v += Math.pow(1 - f, 1.6) * 0.9 * vur(t, z, 0.13);
      for (const z of A_SNARE) v += Math.exp(-((f - 0.5) ** 2) / 0.04) * 0.7 * vur(t, z, 0.12);
      for (const z of A_HAT) v += f * f * 0.35 * vur(t, z, 0.05);
      for (const [z, f0] of A_NOTA) v += Math.exp(-((f - f0) ** 2) / 0.008) * 0.55 * vur(t, z, 0.4);
      v = kis(v * (0.8 + 0.4 * sans(i))) * ac_;
      const h = Math.max(2, v * hMax);
      ctx.globalAlpha = 0.9;
      ctx.fillRect(x0 + i * ad + ad * 0.2, taban - h, ad * 0.6, h);
    }
    ctx.globalAlpha = 1;
  }

  // ================= B · DALGA (kayıt) =================
  const B_ARP = [0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1.0, 1.125, 1.25, 1.375, 1.5, 1.625, 1.75, 1.875];
  const B_KICK = [2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0, 5.5, 6.0];

  function bGenlik(t) {   // kaydedilen sesin zarfı (0..1)
    let v = 0.05 + 0.25 * ara(t, 0.25, 2.0);
    B_ARP.forEach((z, k) => { v += (0.35 + 0.45 * k / 13) * vur(t, z, 0.12); });
    return kis(v);
  }

  function kareB(t) {
    const { vw, lx, ly, lw, lh, k } = G;
    const bx = lx + KAT.bant[0] * k, by = ly + KAT.bant[1] * k, bw = KAT.bant[2] * k, bh = KAT.bant[3] * k;
    const cy = by + bh / 2;
    const x0 = vw * 0.13, x1 = vw * 0.93;
    // REC noktası (soldaki başlangıç) ve 3.75'te logodaki yerine uçuşu
    const nW = KAT.nokta[2] * k;
    const basX = x0 - nW * 0.9 - (lx + KAT.nokta[0] * k), basY = cy - nW / 2 - (ly + KAT.nokta[1] * k);
    const u = icdis(ara(t, 3.75, 4.1));
    const yay = -Math.sin(u * Math.PI) * lh * 0.35;
    const nx = basX * (1 - u), ny = basY * (1 - u) + yay;
    const goz = t < 3.75 ? 0.6 + 0.4 * Math.cos(t * Math.PI * 3) : 1;
    stil(el.nokta, `translate(${nx}px,${ny}px) scale(${geri(ara(t, 0.03, 0.25)) * (t < 3.75 ? 0.62 : kar(0.62, 1, u))})`, (t >= 0.03 ? 1 : 0) * goz);
    el.nokta.style.filter = `drop-shadow(0 0 ${Math.round(6 + 10 * goz)}px rgba(247,8,17,.55))`;
    el.rec.style.opacity = ara(t, 0.1, 0.3) * (1 - ara(t, 1.9, 2.1)) * goz;
    el.rec.style.transform = `translate(${x0 + nW * 0.05}px,${cy - nW * 0.95}px)`;
    el.rec.style.fontSize = Math.max(10, Math.round(nW * 0.32)) + 'px';
    // kayıt dalgası
    const N = Math.max(48, Math.round((x1 - x0) / 6));
    const cizgi = cikis(ara(t, 0.2, 0.55));
    const bas = ara(t, 0.3, 1.95);
    const cok = cikis(ara(t, 2.0, 2.25));
    const hMax = Math.min(lh * 0.42, 150);
    if (t < 2.3) {
      // taban çizgisi
      ctx.globalAlpha = 0.35 * (1 - cok);
      ctx.fillStyle = SARI;
      const cw = (x1 - x0) * cizgi;
      ctx.fillRect((x0 + x1) / 2 - cw / 2, cy - 0.75, cw, 1.5);
      ctx.globalAlpha = 1;
      const ad = (x1 - x0) / N;
      for (let i = 0; i < N; i++) {
        const f = i / (N - 1);
        if (f > bas && cok === 0) break;
        const tz = 0.3 + 1.65 * f;
        let h = hMax * bGenlik(tz) * (0.55 + 0.45 * sans(i + 3)) * (1 + 0.2 * ara(t, 1.9, 2.0));
        h = Math.max(2, h);
        let x = x0 + i * ad, w = ad * 0.55;
        if (cok > 0) {
          x = kar(x, bx + i * (bw / N), cok);
          w = kar(w, bw / N + 0.6, cok);
          h = kar(h, bh, cok);
        }
        ctx.fillStyle = SARI;
        ctx.fillRect(x, cy - h / 2, w, h);
      }
      // yazma kafası
      if (bas > 0 && bas < 1) {
        const hx = x0 + (x1 - x0) * bas;
        ctx.fillStyle = 'rgba(244,241,233,.9)';
        ctx.fillRect(hx - 1, cy - hMax * 0.6, 2, hMax * 1.2);
      }
    }
    el.bant.style.clipPath = 'none';
    el.bant.style.opacity = t >= 2.25 ? 1 : 0;
    el.bant.style.transform = `scale(${1 + 0.03 * vur(t, 2.25, 0.12)})`;
    // DERİN tarama ile görünür
    const dp = ara(t, 2.4, 2.66);
    el.derin.style.clipPath = `inset(0 ${(1 - dp) * 100}% 0 0)`;
    stil(el.derin, 'none', t >= 2.4 ? 1 : 0);
    if (dp > 0 && dp < 1) {
      const sx = lx + (KAT.derin[0] + KAT.derin[2] * dp) * k;
      ctx.fillStyle = 'rgba(244,241,233,.85)';
      ctx.fillRect(sx - 1.5, by - 4, 3, bh + 8);
    }
    // kaset bandın arkasından yükselir
    const kp = ara(t, 2.75, 3.2);
    stil(el.kap, `translateY(${(1 - geri(kp)) * lh * 0.52}px)`, t >= 2.75 ? 1 : 0);
    el.kaset.style.opacity = 1;
    harfler(t, 'B');
    // logonun altında canlı dalga
    if (t >= 4.0 && t < 6.9) altDalga(t);
    isikGecisi(t, 6.0, 0.6);
    return { s: 1 + 0.03 * vur(t, 6.0, 0.2) };
  }

  function altDalga(t) {
    const { lx, ly, lw, lh } = G;
    const N = 64, gen = lw * 0.8, x0 = lx + (lw - gen) / 2, cy = ly + lh * 1.05, hMax = lh * 0.07;
    const g = cikis(ara(t, 4.0, 4.3)) * (1 - ara(t, 6.4, 6.8));
    const kick = B_KICK.reduce((a, z) => a + vur(t, z, 0.12), 0);
    ctx.fillStyle = SARI;
    ctx.globalAlpha = 0.85 * g;
    const ad = gen / N;
    for (let i = 0; i < N; i++) {
      const f = i / (N - 1);
      const zarf = Math.sin(f * Math.PI);
      const h = Math.max(1.5, hMax * zarf * (0.25 + 0.75 * kick) * (0.5 + 0.5 * sans(i + Math.floor(t * 12) * 7)));
      ctx.fillRect(x0 + i * ad, cy - h / 2, ad * 0.55, h);
    }
    ctx.globalAlpha = 1;
  }

  // ================= C · SİNEMATİK =================
  const C_VURUS = [0.4, 1.5, 2.6];

  function kareC(t) {
    const { vw, vh, lw, lh } = G;
    const ortX = vw / 2, ortY = vh / 2;
    // kelimeler
    let kelime = -1;
    C_VURUS.forEach((z, i) => { if (t >= z && t < z + 1.1) kelime = i; });
    if (kelime >= 0) {
      const z = C_VURUS[kelime];
      if (el.kelime.dataset.i !== String(kelime)) {
        el.kelime.dataset.i = kelime;
        el.kelime.innerHTML = `${YAZI.kelime[kelime]}<b>.</b>`;
      }
      const g = ara(t, z, z + 0.06), c = ara(t, z + 0.78, z + 1.05);
      el.kelime.style.opacity = g * (1 - c);
      el.kelime.style.letterSpacing = `${kar(0.24, 0.02, cikis(ara(t, z, z + 0.9)))}em`;
      el.kelime.style.transform = `translateY(-50%) scale(${kar(1.12, 1, cikis(ara(t, z, z + 0.3))) * (1 + 0.04 * c)})`;
      el.kelime.style.filter = `blur(${(c * 8).toFixed(1)}px)`;
    } else el.kelime.style.opacity = 0;
    // ışık patlamaları
    const parla = C_VURUS.reduce((a, z) => a + 0.32 * vur(t, z, 0.22), 0) + 0.5 * vur(t, 4.0, 0.35) + 0.12 * vur(t, 6.2, 0.4);
    const yuk = icdis(ara(t, 2.95, 4.0));
    if (parla > 0.005 || (t > 2.9 && t < 4.1)) {
      const r = Math.max(vw, vh) * 0.7;
      const gr = ctx.createRadialGradient(ortX, ortY, 0, ortX, ortY, r);
      gr.addColorStop(0, `rgba(255,236,190,${kis(parla + 0.18 * yuk * (t < 4 ? 1 : 0))})`);
      gr.addColorStop(0.35, `rgba(203,36,104,${kis(parla * 0.35)})`);
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gr;
      ctx.fillRect(0, 0, vw, vh);
    }
    // yükseliş: ortada ince ışık yarığı
    if (t > 2.9 && t < 4.15) {
      const gYar = yuk * (1 - ara(t, 4.0, 4.15));
      const yh = 1 + 3 * yuk;
      const g2 = ctx.createLinearGradient(0, 0, vw, 0);
      g2.addColorStop(0, 'rgba(255,240,210,0)');
      g2.addColorStop(0.5, `rgba(255,240,210,${0.9 * gYar})`);
      g2.addColorStop(1, 'rgba(255,240,210,0)');
      ctx.fillStyle = g2;
      ctx.fillRect(0, ortY - yh / 2, vw, yh);
    }
    tozlar(t);
    // logo: 4.0'da ışıkla soldan sağa açılır
    const ac_ = cikis(ara(t, 4.0, 4.45));
    el.logo.style.clipPath = t < 4.0 ? 'inset(0 100% 0 0)' : ac_ < 1 ? `inset(0 ${(1 - ac_) * 100}% 0 0)` : 'none';
    const yg = t >= 3.98 && ac_ < 1 ? Math.sin(Math.PI * kis((t - 3.98) / 0.5)) : 0;
    el.yarik.style.opacity = yg;
    el.yarik.style.height = lh * 1.25 + 'px';
    el.yarik.style.transform = `translate(${G.lx + lw * ac_ - 3}px,${G.ly - lh * 0.125}px)`;
    [el.kap, el.bant, el.derin, el.nokta, ...el.harf].forEach(e => stil(e, 'none', 1));
    el.bant.style.clipPath = 'none';
    el.nokta.style.filter = 'drop-shadow(0 0 8px rgba(247,8,17,.45))';
    isikGecisi(t, 4.0, 0.45);
    if (t > 4.6) isikGecisi(t, 5.0, 0.7);
    const s = (1 + 0.035 * ara(t, 4.0, 6.4)) * (1 + 0.02 * vur(t, 4.0, 0.25) + 0.012 * vur(t, 6.2, 0.3));
    return { s, o: t >= 4.0 ? 1 : 0 };
  }

  function tozlar(t) {
    const { vw, vh } = G;
    const N = 90, ortX = vw / 2, ortY = vh / 2;
    const parla = C_VURUS.reduce((a, z) => a + vur(t, z, 0.5), 0) + 1.5 * vur(t, 4.0, 0.8);
    const cek = icdis(ara(t, 2.95, 4.0)) * (1 - ara(t, 4.0, 4.05));
    const pat = t >= 4.0 ? 1 - Math.exp(-(t - 4.0) / 0.35) : 0;
    const son = 1 - ara(t, 6.4, 6.9);
    for (let i = 0; i < N; i++) {
      let x = sans(i) * vw, y = sans(i + 101) * vh;
      x += Math.sin(t * 0.4 + i) * 12 + t * (sans(i + 7) - 0.5) * 18;
      y += -t * (6 + sans(i + 13) * 14);
      y = ((y % vh) + vh) % vh;
      x = kar(x, ortX, cek * 0.85); y = kar(y, ortY, cek * 0.85);
      if (pat > 0) { const dx = x - ortX, dy = y - ortY; x += dx * pat * 0.6; y += dy * pat * 0.6; }
      const a = (0.12 + 0.4 * sans(i + 51)) * (0.5 + 0.9 * Math.min(1.5, parla)) * son;
      ctx.fillStyle = `rgba(255,236,200,${kis(a)})`;
      const r = 0.6 + 1.6 * sans(i + 77);
      ctx.fillRect(x, y, r, r);
    }
  }

  // Önizleme (video çekimi): t < 0 kapı, t >= 0 intro
  window.DerinIntro.onizle = (t, sec) => {
    if (!kok) { if (sec) secenek = sec; ac(true); }
    if (t < 0) {
      durum = 'kapi';
      kok.classList.remove('oynuyor');
      kok.classList.toggle('basili', t > -0.14);
    } else { durum = 'onizleme'; kok.classList.remove('basili'); }
    kare(t);
  };
  window.DerinIntro.SURE = SURE;
})();
