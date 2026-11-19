// Derin Record — Müzik kataloğu ve şarkı başına lisans (19 Kasım 2026, 1. aşama)
//
// Derin'in istediği Soundstripe akışı: şarkı listesi (kapak, ad, sanatçı, dalga
// formu, süre, ruh hâli); satır açılınca Alternatif versiyonlar ve Stemler;
// sepet simgesinin üzerine gelince "Lisans al", tıklayınca sağdan lisans paneli
// (Kişisel / Dijital / Genişletilmiş / Tüm Medya + Özel teklif → iletişim).
// Ödeme ses efektleriyle aynı (supabase/muzik-lisans.sql): talep → havale +
// dekont → Derin onaylar → ana kayıt ve bütün versiyon/stemler indirilir.
(() => {
  'use strict';

  const SA = window.DerinSatinAlma;
  const R2 = window.DerinR2;
  const $ = (s, k) => (k || document).querySelector(s);
  const kacis = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const PLAY = '<svg width="16" height="16" viewBox="0 0 14 14" aria-hidden="true"><path d="M4 2v10l8-5z" fill="currentColor"/></svg>';
  const DUR = '<svg width="16" height="16" viewBox="0 0 14 14" aria-hidden="true"><path d="M3 2h3v10H3zM8 2h3v10H8z" fill="currentColor"/></svg>';
  const OK = '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 6l4.5 4.5L12.5 6" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/></svg>';
  const SEPET = '<svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 4h2.2l2.3 10.2a1.5 1.5 0 0 0 1.5 1.2h8.4a1.5 1.5 0 0 0 1.5-1.1L21 8H6.2" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/><circle cx="9.5" cy="19.5" r="1.4" fill="currentColor"/><circle cx="17" cy="19.5" r="1.4" fill="currentColor"/></svg>';
  const YENI_GUN = 30;
  // Sanatçı profil sayfası, sanatçının kimliğini bir söz (Promise) olarak bırakır.
  const SANATCI_SAYFASI = !!window.DerinMuzikSanatci;

  const d = {
    parcalar: [], versiyonlar: [], turler: [], satislar: [], indirmeler: [], odeme: {},
    filtre: { tur: '', ruh: '', sanatci: '' }, arama: '', sirala: 'yeni',
    acik: {}, sekme: {}, calan: null, panel: null
  };
  const ses = new Audio();
  ses.preload = 'none';

  const sureYaz = sn => { const s = Math.max(0, Math.round(Number(sn) || 0)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
  const fiyatYaz = n => (SA && SA.tutarGoster(n)) || '';
  const durumYaz = (m, h) => { const el = $('#mk-durum'); if (el) { el.textContent = m || ''; el.classList.toggle('hata', !!h); } };
  const kapakAdres = p => p.kapak_path ? R2.adres('muzik-onizleme', p.kapak_path) : 'assets/logo.png';

  // DAW tarzı dalga formu: kayıtlı tepe değerleri [üst, alt, üst, alt, …]
  // kutunun piksel genişliğine indirilir ve dolu bir şekil olarak çizilir
  // (Ableton'daki gibi üstü ve altı ayrı, ayrıntılı). Eski tek değerli kayıtlar
  // (≤ 600 sayı) simetrik çizilir.
  const dalgaVeri = {};
  function dalgaSvg(dalga, renk, W, H) {
    const v = Array.isArray(dalga) ? dalga : [];
    const cift = v.length > 600;
    const n = cift ? v.length / 2 : v.length;
    const orta = H / 2, ol = (H / 2 - 1) / 100;
    const ust = [], alt = [];
    for (let x = 0; x < W; x++) {
      let u = 0, a = 0;
      if (n) {
        const bas = Math.floor(x * n / W), son = Math.max(bas + 1, Math.floor((x + 1) * n / W));
        for (let i = bas; i < son && i < n; i++) {
          const uu = cift ? v[2 * i] : v[i], aa = cift ? v[2 * i + 1] : v[i];
          if (uu > u) u = uu; if (aa > a) a = aa;
        }
      }
      ust.push((orta - Math.max(0.6, u * ol)).toFixed(1));
      alt.push((orta + Math.max(0.6, a * ol)).toFixed(1));
    }
    let yol = 'M0 ' + ust[0];
    for (let x = 1; x < W; x++) yol += 'L' + x + ' ' + ust[x];
    for (let x = W - 1; x >= 0; x--) yol += 'L' + x + ' ' + alt[x];
    return `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-hidden="true"><path d="${yol}Z" fill="${renk}"/></svg>`;
  }
  function dalgaKutusu(anahtar, dalga, ad) {
    dalgaVeri[anahtar] = dalga;
    return `<button type="button" class="mk-dalga" data-sar="${anahtar}" aria-label="${kacis(ad)}: dinlemeye buradan başla"><span class="mk-taban"></span><span class="mk-ilerleme" data-ilerleme="${anahtar}"></span></button>`;
  }
  function dalgalariCiz() {
    document.querySelectorAll('.mk-dalga').forEach(k => {
      const W = Math.floor(k.clientWidth), H = Math.floor(k.clientHeight) || 48;
      if (!W) return;
      const v = dalgaVeri[k.dataset.sar];
      k.querySelector('.mk-taban').innerHTML = dalgaSvg(v, '#6f6c73', W, H);
      k.querySelector('.mk-ilerleme').innerHTML = dalgaSvg(v, '#f4f1e9', W, H);
    });
  }
  let boyutZaman;
  window.addEventListener('resize', () => { clearTimeout(boyutZaman); boyutZaman = setTimeout(dalgalariCiz, 150); });

  // ---------- Süzme ----------
  function secenekler(alan) {
    const say = {};
    d.parcalar.forEach(p => {
      const deger = alan === 'ruh' ? (p.ruh_hali || []) : [alan === 'tur' ? p.tur : p.sanatci];
      deger.filter(Boolean).forEach(x => { say[x] = (say[x] || 0) + 1; });
    });
    return Object.keys(say).sort((a, b) => a.localeCompare(b, 'tr')).map(ad => ({ ad, sayi: say[ad] }));
  }
  function suzulmus() {
    const q = d.arama.trim().toLocaleLowerCase('tr'), f = d.filtre;
    let l = d.parcalar.filter(p => (!f.tur || p.tur === f.tur) && (!f.ruh || (p.ruh_hali || []).includes(f.ruh)) && (!f.sanatci || p.sanatci === f.sanatci));
    if (q) l = l.filter(p => [p.ad, p.sanatci, p.tur, (p.ruh_hali || []).join(' '), (p.etiketler || []).join(' ')].join(' ').toLocaleLowerCase('tr').includes(q));
    const s = d.sirala;
    return l.slice().sort((a, b) =>
      s === 'ad' ? a.ad.localeCompare(b.ad, 'tr')
      : s === 'kisa' ? (Number(a.sure_sn) || 0) - (Number(b.sure_sn) || 0)
      : s === 'bpm' ? (Number(a.bpm) || 0) - (Number(b.bpm) || 0)
      : (a.sira - b.sira) || String(b.created_at).localeCompare(String(a.created_at)));
  }

  // ---------- Çizim ----------
  function filtreCiz() {
    const grup = (alan, baslik) => {
      const l = secenekler(alan);
      if (!l.length) return '';
      return `<h2 style="margin-top:18px">${baslik}</h2><div class="se-filtre">` +
        `<button type="button" data-filtre="${alan}" data-deger="" aria-pressed="${!d.filtre[alan]}">Tümü</button>` +
        l.map(x => `<button type="button" data-filtre="${alan}" data-deger="${kacis(x.ad)}" aria-pressed="${d.filtre[alan] === x.ad}">${kacis(x.ad)} <small>${x.sayi}</small></button>`).join('') + '</div>';
    };
    const kap = $('#mk-filtreler'); if (!kap) return;
    kap.innerHTML = grup('tur', 'Tür') + grup('ruh', 'Ruh hâli') + (SANATCI_SAYFASI ? '' : grup('sanatci', 'Sanatçı'));
  }

  const satisi = id => d.satislar.find(s => s.parca_id === id) || null;

  function versiyonCiz(p) {
    const tum = d.versiyonlar.filter(v => v.parca_id === p.id);
    const alt = tum.filter(v => v.tur === 'alternatif'), stem = tum.filter(v => v.tur === 'stem');
    const sekme = d.sekme[p.id] || (alt.length ? 'alternatif' : 'stem');
    const liste = sekme === 'alternatif' ? alt : stem;
    return `<div class="mk-alt">
      <div class="mk-sekmeler" role="tablist">
        ${alt.length ? `<button type="button" role="tab" data-sekme="${p.id}" data-tur="alternatif" aria-selected="${sekme === 'alternatif'}">Alternatif versiyonlar</button>` : ''}
        ${stem.length ? `<button type="button" role="tab" data-sekme="${p.id}" data-tur="stem" aria-selected="${sekme === 'stem'}">Stemler</button>` : ''}
      </div>
      ${liste.map(v => `<div class="mk-versiyon">
        <button type="button" class="se-cal" data-cal="v:${v.id}" aria-pressed="${d.calan === 'v:' + v.id}" aria-label="${kacis(v.ad)} ${d.calan === 'v:' + v.id ? 'durdur' : 'çal'}" ${v.onizleme_path ? '' : 'disabled'}>${d.calan === 'v:' + v.id ? DUR : PLAY}</button>
        <span style="font-size:15px">${kacis(v.ad)}</span>
        ${dalgaKutusu('v:' + v.id, v.dalga, v.ad)}
        <span class="se-sure">${v.sure_sn ? sureYaz(v.sure_sn) : ''}</span>
      </div>`).join('')}
    </div>`;
  }

  function listeCiz() {
    const l = suzulmus();
    if (!d.parcalar.length) { $('#mk-liste').innerHTML = SANATCI_SAYFASI ? '<p class="se-bos">Bu sanatçının şarkıları çok yakında burada.</p>' : '<p class="se-bos">Şarkılar çok yakında burada. Dinleyip lisanslayabileceksin.</p>'; return; }
    if (!l.length) { $('#mk-liste').innerHTML = '<p class="se-bos">Bu aramaya uyan şarkı yok.</p>'; return; }
    const simdi = Date.now();
    $('#mk-liste').innerHTML = l.map(p => {
      const anahtar = 'p:' + p.id;
      const calan = d.calan === anahtar;
      const surumVar = d.versiyonlar.some(v => v.parca_id === p.id);
      const yeni = (simdi - new Date(p.created_at).getTime()) / 864e5 < YENI_GUN;
      const s = satisi(p.id);
      const ipucu = s && s.durum === 'odendi' ? 'Lisanslı · indir' : s ? 'Lisans talebin var' : 'Lisans al';
      return `<div class="mk-satir">
        <button type="button" class="mk-kapak" data-cal="${anahtar}" aria-pressed="${calan}" aria-label="${kacis(p.ad)} ${calan ? 'durdur' : 'çal'}" ${p.onizleme_path ? '' : 'disabled'}>
          <img src="${kacis(kapakAdres(p))}" alt="" loading="lazy"><span>${calan ? DUR : PLAY}</span></button>
        <div class="se-ad"><b>${kacis(p.ad)}${yeni ? '<span class="mk-yeni">Yeni</span>' : ''}</b><small>${p.sanatcilar && p.sanatcilar.slug && !SANATCI_SAYFASI ? `<a class="mk-sanatci" href="sanatcilar.html?s=${encodeURIComponent(p.sanatcilar.slug)}">${kacis(p.sanatci)}</a>` : kacis(p.sanatci)}</small></div>
        ${surumVar ? `<button type="button" class="mk-ac" data-ac="${p.id}" aria-expanded="${!!d.acik[p.id]}" aria-label="${kacis(p.ad)}: versiyonlar ve stemler">${OK}</button>` : '<span></span>'}
        ${dalgaKutusu(anahtar, p.dalga, p.ad)}
        <span class="se-sure">${p.sure_sn ? sureYaz(p.sure_sn) : ''}</span>
        <span class="mk-etiket">${kacis([].concat(p.ruh_hali || [], p.tur ? [p.tur] : []).join(', '))}</span>
        <button type="button" class="mk-lisans ${s && s.durum === 'odendi' ? 'alindi' : ''}" data-lisans="${p.id}" data-ipucu="${ipucu}" aria-label="${kacis(p.ad)}: ${ipucu}">${SEPET}</button>
        ${d.acik[p.id] ? versiyonCiz(p) : ''}
      </div>`;
    }).join('');
    dalgalariCiz();
    ilerlemeGuncelle();
  }

  function lisanslarCiz() {
    const kap = $('#lisanslarim');
    if (!kap) return;
    const a = window.DerinAuth;
    if (!a || !a.user || !d.satislar.length) { kap.hidden = true; return; }
    kap.hidden = false;
    const bekleyen = d.satislar.some(s => s.durum !== 'odendi');
    const iban = bekleyen && d.odeme.iban ? `<div class="se-iban">Havale bilgileri<br>IBAN: <code>${kacis(SA.ibanGoster(d.odeme.iban))}</code>${d.odeme.alici ? '<br>Alıcı: ' + kacis(d.odeme.alici) : ''}${d.odeme.aciklama ? '<br>' + kacis(d.odeme.aciklama) : ''}</div>` : '';
    const turAd = id => (d.turler.find(t => t.id === id) || {}).ad || id;
    $('#mk-lisanslar').innerHTML = iban + d.satislar.map(s => {
      const p = d.parcalar.find(x => x.id === s.parca_id);
      const rozet = s.durum === 'odendi' ? '<span class="se-rozet odendi">Ödendi</span>' : s.durum === 'dekont' ? '<span class="se-rozet dekont">Dekont kontrol ediliyor</span>' : '<span class="se-rozet">Ödeme bekleniyor</span>';
      let islem;
      if (s.durum === 'odendi') {
        islem = d.indirmeler.filter(x => x.satis_id === s.id).map(x =>
          `<button type="button" class="se-dugme yesil" data-indir="${kacis(x.dosya_path)}" data-ad="${kacis(x.dosya_adi || 'muzik.wav')}">${kacis(x.ad)} · indir</button>`).join('');
      } else {
        islem = `<label class="se-dugme ikincil" style="cursor:pointer">${s.durum === 'dekont' ? 'Dekontu değiştir' : 'Dekont yükle'}<input type="file" class="se-gizli" accept="${SA.DEKONT_ACCEPT}" data-dekont="${s.id}"></label>`;
      }
      return `<div class="se-alim"><div class="se-ad"><b>${kacis(p ? p.ad + ' — ' + p.sanatci : 'Şarkı')}</b><small>${kacis(turAd(s.lisans_turu))} lisansı · ${kacis(fiyatYaz(s.tutar))}</small></div>${rozet}<div style="display:flex;flex-wrap:wrap;gap:8px">${islem}</div></div>`;
    }).join('');
  }

  function panelCiz() {
    const kok = $('#mk-panel-kok');
    const p = d.panel && d.parcalar.find(x => x.id === d.panel);
    if (!p) { kok.innerHTML = ''; return; }
    const s = satisi(p.id);
    const turler = d.turler.map((t, i) => {
      const kapali = !(Number(t.fiyat) > 0);
      return `<label class="mk-tur ${kapali ? 'kapali' : ''}"><input type="radio" name="mk-tur" value="${t.id}" ${kapali ? 'disabled' : ''} ${!kapali && i === 1 ? 'checked' : ''}>
        <div><b>${kacis(t.ad)}</b><p>${kacis(t.aciklama || '')}</p></div><span>${kapali ? 'Yakında' : kacis(fiyatYaz(t.fiyat))}</span></label>`;
    }).join('');
    kok.innerHTML = `<div class="mk-perde" data-kapat></div>
      <aside class="mk-panel" role="dialog" aria-modal="true" aria-labelledby="mk-panel-baslik">
        <div class="mk-panel-ust"><img src="${kacis(kapakAdres(p))}" alt=""><div><b id="mk-panel-baslik">${kacis(p.ad)}</b><small>${kacis(p.sanatci)}</small></div>
          <button type="button" class="mk-kapat" data-kapat aria-label="Kapat">✕</button></div>
        ${s ? `<p class="se-uyari-kutu" style="margin:0">Bu şarkı için ${s.durum === 'odendi' ? 'lisansın var. Dosyaları aşağıdaki "Lisanslarım" bölümünden indirebilirsin.' : 'bir lisans talebin var. Havale yapıp dekontu "Lisanslarım" bölümünden yükleyebilirsin.'}</p>` : ''}
        <form id="mk-lisans-form" style="display:flex;flex-direction:column;gap:16px">
          <fieldset class="mk-turler"><legend>Tek kullanımlık lisansını seç</legend>${turler}</fieldset>
          <div class="mk-ozel"><b>Özel teklif</b><br>Aradığını bulamadın mı? Kullanımını anlat, sana özel fiyat verelim. <a href="index.html#iletisim">İletişime geç →</a></div>
          <label class="mk-not">Müziği nerede kullanacaksın? (isteğe bağlı)<textarea name="not" maxlength="500" placeholder="Örn. YouTube kanalımdaki tanıtım videosu"></textarea></label>
          <button type="submit" class="se-dugme">Lisansı satın al</button>
          <p class="se-durum" id="mk-panel-durum" role="status" aria-live="polite">Ödeme havale ile yapılır; dekontu yükleyince Derin onaylar ve dosyalar indirilir.</p>
        </form>
      </aside>`;
    const ilk = kok.querySelector('input[name="mk-tur"]:checked') || kok.querySelector('input[name="mk-tur"]:not([disabled])');
    if (ilk) { ilk.checked = true; ilk.focus(); } else { const k = kok.querySelector('.mk-kapat'); if (k) k.focus(); }
  }

  function hepsiniCiz() { filtreCiz(); listeCiz(); lisanslarCiz(); panelCiz(); }

  // ---------- Veri ----------
  async function yukle() {
    const a = window.DerinAuth;
    const c = a && a.client;
    if (!c) { durumYaz('Bağlantı kurulamadı.', true); return; }
    // Sanatçı profil sayfası (sanatcilar.html?s=…) yalnız o sanatçının şarkılarını ister.
    const sid = SANATCI_SAYFASI ? await window.DerinMuzikSanatci : null;
    let sorgu = c.from('muzik_parcalari').select('id,ad,sanatci,sanatci_id,sanatcilar(slug),tur,ruh_hali,etiketler,bpm,sure_sn,dalga,kapak_path,onizleme_path,sira,created_at').eq('durum', 'yayinda');
    if (SANATCI_SAYFASI) sorgu = sorgu.eq('sanatci_id', sid || '00000000-0000-0000-0000-000000000000');
    const [pr, ve, tu] = await Promise.all([
      sorgu,
      c.from('muzik_versiyonlari').select('id,parca_id,tur,ad,sure_sn,dalga,onizleme_path,sira').order('sira'),
      c.from('muzik_lisans_turleri').select('id,ad,aciklama,fiyat,sira').order('sira')
    ]);
    d.parcalar = pr.error ? [] : (pr.data || []);
    d.versiyonlar = ve.error ? [] : (ve.data || []);
    d.turler = tu.error ? [] : (tu.data || []);
    d.satislar = []; d.indirmeler = [];
    if (a.user) {
      const [sa, ind, od] = await Promise.all([
        c.from('muzik_lisans_satislari').select('id,parca_id,lisans_turu,durum,tutar,istendi_at').order('istendi_at', { ascending: false }),
        c.rpc('muzik_indirme_listesi'),
        c.from('odeme_ayarlari').select('iban,alici,aciklama').eq('id', 1).maybeSingle()
      ]);
      d.satislar = sa.error ? [] : (sa.data || []);
      d.indirmeler = ind.error ? [] : (ind.data || []);
      d.odeme = (!od.error && od.data) || {};
    }
    durumYaz(pr.error ? 'Şarkılar yüklenemedi. Sayfayı yenileyin.' : '', !!pr.error);
    hepsiniCiz();
  }

  // ---------- Çalma ----------
  function kaynak(anahtar) {
    const [t, id] = anahtar.split(':');
    const x = t === 'p' ? d.parcalar.find(p => p.id === id) : d.versiyonlar.find(v => v.id === id);
    return x && x.onizleme_path ? R2.adres('muzik-onizleme', x.onizleme_path) : null;
  }
  function cal(anahtar, oran) {
    if (d.calan === anahtar && oran == null) { ses.pause(); d.calan = null; listeCiz(); return; }
    const src = kaynak(anahtar); if (!src) return;
    if (d.calan !== anahtar) { ses.src = src; d.calan = anahtar; }
    const basla = () => { if (oran != null && ses.duration) ses.currentTime = ses.duration * oran; };
    if (ses.readyState >= 1) basla(); else ses.addEventListener('loadedmetadata', basla, { once: true });
    ses.play().catch(() => { d.calan = null; listeCiz(); durumYaz('Önizleme çalınamadı.', true); });
    listeCiz();
  }
  function ilerlemeGuncelle() {
    const el = d.calan && document.querySelector(`[data-ilerleme="${d.calan}"]`);
    if (el && ses.duration) el.style.clipPath = `inset(0 ${100 - ses.currentTime / ses.duration * 100}% 0 0)`;
  }
  ses.addEventListener('timeupdate', ilerlemeGuncelle);
  ses.addEventListener('ended', () => { d.calan = null; listeCiz(); });

  // ---------- Satın alma ----------
  async function lisansAl(ev) {
    ev.preventDefault();
    const a = window.DerinAuth;
    const form = ev.target;
    const tur = form.querySelector('input[name="mk-tur"]:checked');
    const yaz = (m, h) => { const el = $('#mk-panel-durum'); el.textContent = m; el.classList.toggle('hata', !!h); };
    if (!tur) { yaz('Bir lisans türü seç.', true); return; }
    if (!a.user) { yaz('Satın almak için giriş yap ya da ücretsiz hesap aç.'); a.open(); return; }
    const btn = form.querySelector('button[type="submit"]'); btn.disabled = true;
    yaz('Lisans talebin oluşturuluyor…');
    const { error } = await a.client.from('muzik_lisans_satislari').insert({ parca_id: d.panel, lisans_turu: tur.value, kullanim_notu: form.not.value });
    btn.disabled = false;
    if (error) { yaz(/Satista/.test(error.message) ? 'Bu şarkı şu an satışta değil.' : /Fiyatsiz/.test(error.message) ? 'Bu lisans türünün fiyatı henüz belirlenmedi.' : 'Talep oluşturulamadı. Tekrar dene.', true); return; }
    d.panel = null;
    await yukle();
    durumYaz('Lisans talebin alındı. "Lisanslarım" bölümündeki IBAN\'a havale yapıp dekontu yükle; onaylanınca dosyalar açılır.');
    const k = $('#lisanslarim'); if (k) k.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function dekontYukle(satisId, dosya) {
    const hata = SA.dekontHatasi(dosya);
    if (hata) { durumYaz(hata, true); return; }
    const a = window.DerinAuth;
    durumYaz('Dekont yükleniyor…');
    const yol = SA.dekontYolu(a.user.id, 'lisans-' + satisId, dosya.name);
    const up = await R2.yukle('project-audio', yol, dosya, dosya.type || undefined);
    if (up.error) { durumYaz('Dekont yüklenemedi: ' + up.error.message, true); return; }
    const { data, error } = await a.client.from('muzik_lisans_satislari')
      .update({ durum: 'dekont', dekont_path: yol, dekont_adi: dosya.name }).eq('id', satisId).select('id');
    if (error || !data || !data.length) { durumYaz('Dekont kaydedilemedi. Tekrar dene.', true); return; }
    await yukle();
    durumYaz('Dekontun alındı. Ödeme onaylanınca indirme düğmeleri burada açılır.');
  }

  async function indir(yol, ad) {
    durumYaz('İndirme hazırlanıyor…');
    try {
      const adres = await R2.korumaliAdres('muzik-audio', String(yol).replace(/^muzik\//, ''));
      const blob = await (await fetch(adres)).blob();
      const el = document.createElement('a');
      el.href = URL.createObjectURL(blob); el.download = ad || 'muzik.wav';
      document.body.append(el); el.click(); el.remove();
      setTimeout(() => URL.revokeObjectURL(el.href), 4000);
      durumYaz('');
    } catch (e) {
      durumYaz('İndirilemedi: ' + ((e && e.message) || 'bilinmeyen hata'), true);
    }
  }

  let oncekiOdak = null;
  function panelAc(id) { oncekiOdak = document.activeElement; d.panel = id; panelCiz(); document.body.style.overflow = 'hidden'; }
  function panelKapat() { d.panel = null; panelCiz(); document.body.style.overflow = ''; if (oncekiOdak && oncekiOdak.focus) oncekiOdak.focus(); }

  function bagla() {
    document.addEventListener('click', ev => {
      const t = ev.target.closest('[data-filtre],[data-cal],[data-sar],[data-ac],[data-sekme],[data-lisans],[data-kapat],[data-indir]');
      if (!t) return;
      if (t.dataset.filtre) { d.filtre[t.dataset.filtre] = t.dataset.deger; filtreCiz(); listeCiz(); }
      else if (t.dataset.cal) cal(t.dataset.cal);
      else if (t.dataset.sar) { const r = t.getBoundingClientRect(); cal(t.dataset.sar, Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width))); }
      else if (t.dataset.ac) { d.acik[t.dataset.ac] = !d.acik[t.dataset.ac]; listeCiz(); }
      else if (t.dataset.sekme) { d.sekme[t.dataset.sekme] = t.dataset.tur; listeCiz(); }
      else if (t.dataset.lisans) panelAc(t.dataset.lisans);
      else if (t.hasAttribute('data-kapat')) panelKapat();
      else if (t.dataset.indir) indir(t.dataset.indir, t.dataset.ad);
    });
    document.addEventListener('submit', ev => { if (ev.target.id === 'mk-lisans-form') lisansAl(ev); });
    document.addEventListener('keydown', ev => { if (ev.key === 'Escape' && d.panel) panelKapat(); });
    document.addEventListener('change', ev => {
      const f = ev.target.closest('[data-dekont]');
      if (f && f.files && f.files[0]) dekontYukle(f.dataset.dekont, f.files[0]);
    });
    const ara = $('#mk-ara'), sirala = $('#mk-sirala');
    if (ara) ara.addEventListener('input', ev => { d.arama = ev.target.value; listeCiz(); });
    if (sirala) sirala.addEventListener('change', ev => { d.sirala = ev.target.value; listeCiz(); });
  }

  async function baslat() {
    bagla();
    const a = window.DerinAuth;
    if (!a) { durumYaz('Bağlantı kurulamadı.', true); return; }
    await a.ready;
    await yukle();
    window.addEventListener('derin:authchange', () => yukle());
  }
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', baslat) : baslat();
})();
