// Ana sayfa demo rafı (9 Kasım 2026). Branş kasetleri yana kaydırılan bir raf;
// kasete tıklanınca altında o branşın demo listesi açılır: her şarkıda sarı
// çubuk dalga (DerinMekanVitrini.cubukSvg), süre ve oynat; ekranın altında çalar.
// Şarkılar branş sayfasındaki demolarla aynıdır (demo_parcalari). Mekân
// demolarıyla aynı anda çalmaz ('derin:calar' olayı).
(() => {
  'use strict';

  // ---- Saf yardımcılar (Node'da sınanır) ----
  const BRANSLAR = ['aerobik', 'akrobatik', 'artistik', 'ritmik', 'cocuk-fitness'];
  const BRANS_AD = { aerobik: 'AEROBİK', akrobatik: 'AKROBATİK', artistik: 'ARTİSTİK', ritmik: 'RİTMİK', 'cocuk-fitness': 'ÇOCUK FITNESS' };
  const guvenliAdres = u => /^https:\/\/[^\s"'<>]+$/i.test(String(u || '').trim()) ? String(u).trim() : '';
  const siraliMi = (a, b) => (Number(a.sira) || 0) - (Number(b.sira) || 0)
    || String(a.created_at || '').localeCompare(String(b.created_at || ''));
  function grupla(demolar) {
    const g = {};
    BRANSLAR.forEach(b => { g[b] = []; });
    (demolar || []).forEach(d => { if (d && g[d.brans] && guvenliAdres(d.medya_url)) g[d.brans].push(d); });
    BRANSLAR.forEach(b => g[b].sort(siraliMi));
    return g;
  }
  function bransBul(sinif, href) {
    const m = /(?:^|\s)renk-([a-z-]+)/.exec(String(sinif || ''));
    if (m && BRANSLAR.includes(m[1])) return m[1];
    const l = /^\/?([a-z-]+)\.html(?:[#?].*)?$/i.exec(String(href || '').trim());
    return l && BRANSLAR.includes(l[1].toLowerCase()) ? l[1].toLowerCase() : null;
  }
  if (typeof module !== 'undefined') module.exports = { BRANSLAR, BRANS_AD, grupla, bransBul, guvenliAdres };
  if (typeof document === 'undefined') return;

  const MV = window.DerinMekanVitrini;
  const bolum = document.getElementById('demolar');
  const grid = bolum && bolum.querySelector('.cassette-grid');
  if (!MV || !grid) return;

  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const CAL = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z" fill="currentColor"/></svg>';
  const DUR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h4v14H7zM13 5h4v14h-4z" fill="currentColor"/></svg>';
  const ONCEKI = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 5h2v14H6zM20 5v14L9 12z" fill="currentColor"/></svg>';
  const SONRAKI = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 5h2v14h-2zM4 5v14l11-7z" fill="currentColor"/></svg>';

  const durum = { gruplar: null, brans: null, sira: -1, oran: 0, kapali: false };
  const ses = new Audio();
  ses.preload = 'none';

  const liste = document.createElement('div');
  liste.className = 'dr-liste';
  liste.hidden = true;
  grid.after(liste);

  const calar = document.createElement('div');
  calar.className = 'mv-calar dr-calar';
  calar.setAttribute('role', 'region');
  calar.setAttribute('aria-label', 'Branş demosu çalar');
  calar.innerHTML = '<div class="mini dr-mini"></div><div class="bilgi"><h4></h4><p></p></div>'
    + `<button class="yan" data-dr="onceki" aria-label="Önceki">${ONCEKI}</button><button class="ana" data-dr="calar" aria-label="Çal / durdur">${CAL}</button><button class="yan" data-dr="sonraki" aria-label="Sonraki">${SONRAKI}</button>`
    + '<div class="mv-d" data-dr="sar" aria-label="Demoda ilerle"></div>'
    + '<a class="teklif" href="#iletisim"><span class="uzun">BENZERİNİ </span>İSTİYORUM</a>';
  document.body.append(calar);

  const parcalar = () => (durum.gruplar && durum.brans ? durum.gruplar[durum.brans] : []);
  const sureOf = d => d.sure || (d === parcalar()[durum.sira] && isFinite(ses.duration) ? Math.round(ses.duration) : 0);
  const dalga = (d, oran, adet, gecen) => MV.cubukSvg(d.dalga, oran, 'sari', adet)
    + (gecen != null ? `<span class="mv-zs" data-dr-z>${MV.zamanYazi(gecen)}</span>` : '')
    + (sureOf(d) ? `<span class="mv-zg">${MV.zamanYazi(sureOf(d))}</span>` : '');

  function listeCiz() {
    const b = durum.brans;
    document.querySelectorAll('#demolar .cassette-card').forEach(c => c.setAttribute('aria-expanded', String(bransBul(c.className, c.getAttribute('href')) === b)));
    grid.classList.toggle('dr-secili', !!b);
    if (!b) { liste.hidden = true; return; }
    const ps = parcalar(), href = `${b}.html`;
    liste.hidden = false;
    const kart = document.querySelector(`#demolar .renk-${b}`);
    liste.style.setProperty('--r', (kart && getComputedStyle(kart).getPropertyValue('--r').trim()) || '#e8d15a');
    okKoy(kart);
    liste.innerHTML = `<i class="dr-ok" aria-hidden="true"></i><div class="mv-liste"><div class="mv-liste-bas"><span><i class="dr-kaset" aria-hidden="true"></i>${esc(BRANS_AD[b])} KASETİ · ${ps.length ? ps.length + ' DEMO' : 'YAKINDA'}</span><a class="dr-git" href="${href}">BRANŞ SAYFASI →</a></div>`
      + (ps.length ? ps.map((d, i) => {
        const aktif = i === durum.sira, calan = aktif && !ses.paused;
        return `<div class="mv-s" ${aktif ? 'aria-current="true"' : ''}><span class="no dr-no"><i class="dr-kaset" aria-hidden="true"></i><small>${esc(BRANS_AD[b])}</small>${String(i + 1).padStart(2, '0')}</span><strong>${esc(String(d.baslik || '').toLocaleUpperCase('tr-TR'))}</strong><div class="mv-d">${dalga(d, aktif ? durum.oran : 0, 150, aktif ? ses.currentTime || 0 : null)}</div><span class="sure">${sureOf(d) ? MV.zamanYazi(sureOf(d)) : ''}</span><button class="mv-cal" type="button" data-dr-sarki="${i}" aria-label="${esc(d.baslik)} ${calan ? 'durdur' : 'çal'}">${calan ? DUR : CAL}</button></div>`;
      }).join('') : '<p class="dr-bos">Bu branşın demoları yakında burada. Şimdilik branş sayfasına göz atabilirsin.</p>')
      + '</div>';
  }

  // Listenin üstündeki ok seçili kasetin ortasına gelir (raf kaydırılınca da).
  function okKoy(kart) {
    kart = kart || (durum.brans && document.querySelector(`#demolar .renk-${durum.brans}`));
    if (!kart || liste.hidden) return;
    const k = kart.getBoundingClientRect(), l = liste.getBoundingClientRect();
    const x = Math.max(24, Math.min(l.width - 24, k.left + k.width / 2 - l.left));
    liste.style.setProperty('--ok-x', x + 'px');
  }
  grid.addEventListener('scroll', () => okKoy(), { passive: true });
  window.addEventListener('resize', () => okKoy());

  function calarGuncelle() {
    const d = parcalar()[durum.sira];
    if (!d) return;
    calar.querySelector('h4').textContent = String(d.baslik || '').toLocaleUpperCase('tr-TR');
    calar.querySelector('p').textContent = BRANS_AD[durum.brans] + ' · demo';
    calar.querySelector('.dr-mini').style.setProperty('--r', liste.style.getPropertyValue('--r'));
    calar.querySelector('.ana').innerHTML = ses.paused ? CAL : DUR;
    calar.querySelector('[data-dr="sar"]').innerHTML = dalga(d, durum.oran, window.innerWidth < 700 ? 110 : 220, ses.currentTime || 0);
    if (durum.kapali) return; // başka çalar başladı: bu kapalı kalır
    calar.classList.add('acik');
    document.body.classList.add('mv-calar-acik');
  }

  function cal(i) {
    const d = parcalar()[i];
    if (!d) return;
    durum.sira = i; durum.oran = 0;
    ses.src = guvenliAdres(d.medya_url);
    ses.currentTime = 0;
    ses.play().catch(() => {});
    listeCiz(); calarGuncelle();
  }
  function sonraki(yon) {
    const i = durum.sira + yon;
    if (i >= 0 && i < parcalar().length) cal(i); else { ses.pause(); listeCiz(); calarGuncelle(); }
  }

  let sonCizim = 0;
  ses.addEventListener('timeupdate', () => {
    durum.oran = ses.duration ? Math.min(1, ses.currentTime / ses.duration) : 0;
    calar.querySelectorAll('[data-dr-z]').forEach(z => { z.textContent = MV.zamanYazi(ses.currentTime); });
    const simdi = Date.now();
    if (simdi - sonCizim > 400) {
      sonCizim = simdi; calarGuncelle();
      const kutu = liste.querySelector('.mv-s[aria-current="true"] .mv-d'), d = parcalar()[durum.sira];
      if (kutu && d) kutu.innerHTML = dalga(d, durum.oran, 150, ses.currentTime);
    }
  });
  ses.addEventListener('ended', () => sonraki(1));
  ses.addEventListener('play', () => {
    durum.kapali = false;
    document.dispatchEvent(new CustomEvent('derin:calar', { detail: { kaynak: 'brans' } }));
    listeCiz(); calarGuncelle();
  });
  ses.addEventListener('pause', () => { listeCiz(); calarGuncelle(); });
  ses.addEventListener('loadedmetadata', () => { listeCiz(); calarGuncelle(); });
  // Mekân demosu başlarsa bu çalar susar ve kapanır.
  document.addEventListener('derin:calar', e => {
    if (e.detail && e.detail.kaynak === 'brans') return;
    durum.kapali = true;
    ses.pause();
    calar.classList.remove('acik');
  });

  // Kasete tıklayınca branş sayfasına gitmek yerine liste açılır (veri yüklendiyse).
  grid.addEventListener('click', e => {
    const kart = e.target.closest('.cassette-card');
    if (!kart || !durum.gruplar || e.metaKey || e.ctrlKey) return;
    const b = bransBul(kart.className, kart.getAttribute('href'));
    if (!b) return;
    e.preventDefault();
    durum.brans = durum.brans === b ? null : b;
    if (durum.brans !== b || !parcalar().length) { /* liste kapandı ya da boş */ }
    listeCiz();
    if (durum.brans) liste.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });
  liste.addEventListener('click', e => {
    const t = e.target.closest('[data-dr-sarki]');
    if (!t) return;
    const i = Number(t.dataset.drSarki);
    const ayni = parcalar()[i] && ses.src === guvenliAdres(parcalar()[i].medya_url);
    if (i === durum.sira && ayni && !ses.paused) ses.pause();
    else if (i === durum.sira && ayni) ses.play().catch(() => {});
    else cal(i);
  });
  calar.addEventListener('click', e => {
    const t = e.target.closest('[data-dr]');
    if (!t) return;
    const n = t.dataset.dr;
    if (n === 'calar') { ses.paused ? ses.play().catch(() => {}) : ses.pause(); }
    else if (n === 'onceki') sonraki(-1);
    else if (n === 'sonraki') sonraki(1);
    else if (n === 'sar' && ses.duration) {
      const r = t.getBoundingClientRect();
      ses.currentTime = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * ses.duration;
    }
  });

  async function yukle() {
    try {
      const auth = window.DerinAuth && await window.DerinAuth.ready;
      const client = auth && auth.client;
      if (!client) return;
      let r = await client.from('demo_parcalari').select('id,brans,baslik,medya_url,medya_tur,sira,created_at,dalga,sure');
      if (r.error) r = await client.from('demo_parcalari').select('id,brans,baslik,medya_url,medya_tur,sira,created_at'); // dalga sütunu henüz yoksa
      if (r.error) return; // tablo yoksa kasetler eskisi gibi branş sayfasına gider
      durum.gruplar = grupla(r.data);
    } catch (e) { /* bağlantı yoksa kasetler eskisi gibi çalışır */ }
  }
  yukle();
})();
