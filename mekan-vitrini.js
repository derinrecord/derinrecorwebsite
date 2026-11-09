// Mekân vitrini (8 Kasım 2026; 9 Kasım'da ana sayfaya taşındı): yöneticinin radyo
// panelinde "sitede göster" diye işaretlediği klasör ve çalma listelerinin demoları. Her şarkıdan
// DEMO_SANIYE kadar çalar. Veri tek güvenli fonksiyondan gelir (mekan_vitrini);
// marka/şube bilgisi gelmez.
(() => {
  'use strict';
  const MV = window.DerinMekanVitrini;
  const kok = document.getElementById('mekan-vitrini');
  if (!MV || !kok || !window.supabase || !window.DERIN_CONFIG) return;

  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const CAL = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z" fill="currentColor"/></svg>';
  const DUR = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="5" width="4" height="14" fill="currentColor"/><rect x="14" y="5" width="4" height="14" fill="currentColor"/></svg>';
  const ONCEKI = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5v14M19 5L9 12l10 7z" stroke="currentColor" stroke-width="2" fill="currentColor"/></svg>';
  const SONRAKI = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17 5v14M5 5l10 7-10 7z" stroke="currentColor" stroke-width="2" fill="currentColor"/></svg>';

  const adres = (kova, yol) => (window.DerinR2 && window.DerinR2.adres(kova, yol)) || null;
  const ilkParca = yol => {
    const A = window.DerinAudioTypes;
    return A && A.parcalariCoz ? A.parcalariCoz(yol)[0].path : yol;
  };
  const kapakStil = (l, p) => {
    const yol = (p && p.kapak) || l.kapak;
    const u = yol && adres('radio-covers', yol);
    const r = (MV.TURLER[l.tur] || MV.TURLER.kafe).renk;
    return u ? `background-image:url('${esc(u)}')` : `background:radial-gradient(circle at 50% 62%,${r[0]} 26%,transparent 27%),linear-gradient(145deg,${r[1]},#111114)`;
  };

  // SoundCloud tarzı çubuk dalga (sarı); köşelerde geçen süre ve demo süresi.
  const DEMO_YAZI = MV.zamanYazi(MV.DEMO_SANIYE);
  const dalga = (veri, oran, adet, gecen) => MV.cubukSvg(veri, oran, 'sari', adet)
    + (gecen != null ? `<span class="mv-zs" data-mv-z="gecen">${MV.zamanYazi(gecen)}</span>` : '')
    + `<span class="mv-zg">${DEMO_YAZI}</span>`;
  const calarAdet = () => (window.innerWidth < 700 ? 110 : 220);

  const durum = { gruplar: null, tur: null, liste: null, sira: -1, oran: 0, ayar: MV.ayar(null), kapali: false };
  const turAd = k => durum.ayar.turler[k].ad;
  const ses = new Audio();
  ses.preload = 'none';

  const calar = document.createElement('div');
  calar.className = 'mv-calar';
  calar.setAttribute('role', 'region');
  calar.setAttribute('aria-label', 'Demo çalar');
  calar.innerHTML = '<div class="mini"></div><div class="bilgi"><h4></h4><p></p></div>'
    + `<button class="yan" data-mv="onceki" aria-label="Önceki">${ONCEKI}</button><button class="ana" data-mv="calar" aria-label="Çal / durdur">${CAL}</button><button class="yan" data-mv="sonraki" aria-label="Sonraki">${SONRAKI}</button>`
    + '<div class="mv-d" data-mv="sar" aria-label="Demoda ilerle"></div>'
    + '<a class="teklif" href="/coffee#cf-note" data-mv="teklif"><span class="uzun">BU SESİ </span>İSTİYORUM</a>';
  document.body.append(calar);

  function turlerHtml() {
    const acik = MV.acikTurler(durum.ayar);
    return '<div class="mv-tur" style="--mv-n:' + acik.length + '">' + acik.map(k => {
      const t = durum.ayar.turler[k], n = durum.gruplar[k].length;
      return `<button type="button" data-mv-tur="${k}" aria-pressed="${k === durum.tur}" ${n ? '' : 'disabled'} style="background:radial-gradient(circle at 85% 15%,${t.renk[0]}55,transparent 55%),linear-gradient(145deg,${t.renk[1]},#111114)"><i aria-hidden="true">${t.ikon}</i><div><b>${t.ad}</b><small>${n ? n + ' liste' : 'yakında'}</small></div></button>`;
    }).join('') + '</div>';
  }

  function listelerHtml() {
    const ls = durum.gruplar[durum.tur] || [];
    return '<div class="mv-listeler">' + ls.map(l => {
      const calan = durum.liste === l && !ses.paused;
      return `<div class="mv-k" role="button" tabindex="0" data-mv-liste="${esc(l.id)}" aria-pressed="${durum.liste === l}">
        <div class="mv-kp" style="${kapakStil(l)}"><button class="mv-cal" type="button" data-mv-listecal="${esc(l.id)}" aria-label="${esc(l.ad)} listesini ${calan ? 'durdur' : 'çal'}">${calan ? DUR : CAL}</button></div>
        <div><small>${esc(MV.saatYazi(l))}</small><h3>${esc(l.ad)}</h3><p>${l.tarz ? esc(l.tarz) + '<br>' : ''}${l.parcalar.length} şarkı · ${esc(turAd(l.tur))}</p></div></div>`;
    }).join('') + '</div>';
  }

  function sarkilarHtml() {
    const l = durum.liste;
    if (!l) return '';
    return `<div class="mv-liste"><div class="mv-liste-bas"><span>${esc(turAd(l.tur).toLocaleUpperCase('tr-TR'))} · ${esc(l.ad.toLocaleUpperCase('tr-TR'))}</span><em>${l.parcalar.length} ŞARKI · HER BİRİNDEN ${MV.DEMO_SANIYE / 60 === 1 ? '1 DK' : MV.DEMO_SANIYE + ' SN'}</em></div>`
      + l.parcalar.map((p, i) => {
        const aktif = i === durum.sira, calan = aktif && !ses.paused;
        return `<div class="mv-s" ${aktif ? 'aria-current="true"' : ''}><span class="no">${String(i + 1).padStart(2, '0')}</span><strong>${esc(p.ad)}</strong><div class="mv-d">${dalga(p.dalga, aktif ? durum.oran : 0, 150, aktif ? ses.currentTime || 0 : null)}</div><span class="sure">${p.sure ? MV.zamanYazi(p.sure) : ''}</span><button class="mv-cal" type="button" data-mv-sarki="${i}" aria-label="${esc(p.ad)} ${calan ? 'durdur' : 'çal'}">${calan ? DUR : CAL}</button></div>`;
      }).join('') + '</div>';
  }

  function ciz() {
    kok.querySelector('[data-mv-icerik]').innerHTML = turlerHtml() + listelerHtml() + sarkilarHtml();
  }

  function calarGuncelle() {
    const l = durum.liste, p = l && l.parcalar[durum.sira];
    if (!p) return;
    calar.querySelector('.mini').setAttribute('style', kapakStil(l, p));
    calar.querySelector('h4').textContent = p.ad;
    calar.querySelector('p').textContent = turAd(l.tur) + ' · ' + l.ad + ' listesi';
    calar.querySelector('.ana').innerHTML = ses.paused ? CAL : DUR;
    calar.querySelector('[data-mv="sar"]').innerHTML = dalga(p.dalga, durum.oran, calarAdet(), ses.currentTime || 0);
    if (durum.kapali) return; // başka çalar başladı: bu kapalı kalır
    calar.classList.add('acik');
    document.body.classList.add('mv-calar-acik');
  }

  function cal(l, i) {
    const p = l && l.parcalar[i];
    const u = p && adres('radio-audio', ilkParca(p.yol));
    if (!u) return;
    durum.liste = l; durum.sira = i; durum.oran = 0;
    ses.src = u;
    ses.currentTime = 0;
    ses.play().catch(() => {});
    ciz(); calarGuncelle();
  }

  function sonraki(yon) {
    const l = durum.liste;
    if (!l) return;
    const i = durum.sira + (yon || 1);
    if (i >= 0 && i < l.parcalar.length) cal(l, i);
    else { ses.pause(); ciz(); calarGuncelle(); }
  }

  let sonCizim = 0;
  ses.addEventListener('timeupdate', () => {
    if (ses.currentTime >= MV.DEMO_SANIYE) { sonraki(1); return; }
    durum.oran = Math.min(1, ses.currentTime / Math.min(MV.DEMO_SANIYE, ses.duration || MV.DEMO_SANIYE));
    calar.querySelectorAll('[data-mv-z="gecen"]').forEach(z => { z.textContent = MV.zamanYazi(ses.currentTime); });
    const simdi = Date.now();
    if (simdi - sonCizim > 400) { sonCizim = simdi; calarGuncelle(); const d = kok.querySelector('.mv-s[aria-current="true"] .mv-d'); if (d) d.innerHTML = dalga(durum.liste.parcalar[durum.sira].dalga, durum.oran, 150, ses.currentTime); }
  });
  ses.addEventListener('ended', () => sonraki(1));
  ses.addEventListener('play', () => {
    durum.kapali = false;
    document.dispatchEvent(new CustomEvent('derin:calar', { detail: { kaynak: 'mekan' } }));
    ciz(); calarGuncelle();
  });
  // Branş demosu başlarsa bu çalar susar ve kapanır (ikisi aynı anda çalmaz).
  document.addEventListener('derin:calar', e => {
    if (e.detail && e.detail.kaynak === 'mekan') return;
    durum.kapali = true;
    ses.pause();
    calar.classList.remove('acik');
  });
  ses.addEventListener('pause', () => { ciz(); calarGuncelle(); });

  function listeBul(id) {
    for (const k of MV.SIRA) { const l = durum.gruplar[k].find(x => String(x.id) === String(id)); if (l) return l; }
    return null;
  }

  kok.addEventListener('click', e => {
    const t = e.target.closest('[data-mv-tur],[data-mv-listecal],[data-mv-liste],[data-mv-sarki]');
    if (!t) return;
    if (t.dataset.mvTur) { durum.tur = t.dataset.mvTur; if (!durum.liste || durum.liste.tur !== durum.tur) durum.liste = durum.gruplar[durum.tur][0] || null; ciz(); return; }
    if (t.dataset.mvListecal) {
      e.stopPropagation();
      const l = listeBul(t.dataset.mvListecal);
      if (durum.liste === l && durum.sira >= 0 && !ses.paused) ses.pause();
      else if (durum.liste === l && durum.sira >= 0) ses.play().catch(() => {});
      else cal(l, 0);
      return;
    }
    if (t.dataset.mvListe) { const l = listeBul(t.dataset.mvListe); if (l !== durum.liste) { durum.liste = l; durum.sira = -1; } ciz(); return; }
    if (t.dataset.mvSarki != null) {
      const i = Number(t.dataset.mvSarki);
      if (i === durum.sira && !ses.paused) ses.pause();
      else if (i === durum.sira) ses.play().catch(() => {});
      else cal(durum.liste, i);
    }
  });
  kok.addEventListener('keydown', e => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[data-mv-liste]')) { e.preventDefault(); e.target.click(); }
  });

  calar.addEventListener('click', e => {
    const t = e.target.closest('[data-mv]');
    if (!t) return;
    const n = t.dataset.mv;
    if (n === 'calar') { ses.paused ? ses.play().catch(() => {}) : ses.pause(); }
    else if (n === 'onceki') sonraki(-1);
    else if (n === 'sonraki') sonraki(1);
    else if (n === 'sar') {
      const r = t.getBoundingClientRect();
      const oran = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
      ses.currentTime = oran * Math.min(MV.DEMO_SANIYE, ses.duration || MV.DEMO_SANIYE);
    } else if (n === 'teklif') {
      const not = document.getElementById('cf-note');
      if (!not && durum.liste) {
        // Ana sayfada form yok: /coffee formuna liste adıyla gidilir.
        e.preventDefault();
        ses.pause();
        location.href = MV.teklifAdresi(Object.assign({}, durum.liste, { turAd: turAd(durum.liste.tur) }));
        return;
      }
      if (not && durum.liste) {
        const satir = MV.teklifMetni(Object.assign({}, durum.liste, { turAd: turAd(durum.liste.tur) }));
        if (!not.value.includes(satir)) not.value = (not.value ? not.value.trim() + '\n' : '') + satir;
        setTimeout(() => { try { not.focus({ preventScroll: true }); } catch (x) {} }, 400);
      }
    }
  });

  function yazilariUygula() {
    const a = durum.ayar;
    const ust = kok.querySelector('.eyebrow'), h2 = kok.querySelector('#mv-baslik'), p = kok.querySelector('.mv-bas p');
    if (ust) ust.textContent = a.ust;
    if (h2) { h2.textContent = a.baslik; h2.append(document.createElement('br')); const s = document.createElement('span'); s.textContent = a.vurgu; h2.append(s); }
    if (p) p.textContent = a.aciklama;
  }

  async function yukle() {
    try {
      const c = window.supabase.createClient(window.DERIN_CONFIG.supabaseUrl, window.DERIN_CONFIG.supabasePublishableKey);
      const { data, error } = await c.rpc('mekan_vitrini');
      if (error) throw error;
      const listeler = Array.isArray(data) ? data : ((data && data.listeler) || []);
      durum.ayar = MV.ayar(data && !Array.isArray(data) ? data.ayar : null);
      // Yönetici bir mekân türünü kapattıysa o türün listeleri de gösterilmez.
      durum.gruplar = MV.grupla(listeler.filter(l => durum.ayar.turler[l.tur] && durum.ayar.turler[l.tur].acik));
      durum.tur = MV.ilkDolu(durum.gruplar);
      yazilariUygula();
      if (!durum.tur) { kok.hidden = true; return; } // henüz vitrine çıkarılmış liste yok
      durum.liste = durum.gruplar[durum.tur][0];
      kok.hidden = false;
      ciz();
    } catch (e) {
      kok.hidden = true; // vitrin açılamazsa sayfanın geri kalanı etkilenmez
    }
  }
  yukle();
})();
