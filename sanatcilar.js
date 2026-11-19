// Derin Record — Sanatçılar (20 Kasım 2026, 2. aşama)
//
// Derin'in seçtiği tasarım: Soundstripe'taki gibi fotoğraflı kart ızgarası
// (arama, tür filtresi, sıralama) ve "Sanatçılar B" profil sayfası: büyük
// kart + altında sanatçının şarkıları (katalogdaki dalga formu ve lisans
// paneliyle — liste muzik.js'ten gelir, yalnız o sanatçıya süzülür).
// Adres: sanatcilar.html (ızgara), sanatcilar.html?s=<ad-parcasi> (profil).
(() => {
  'use strict';

  const R2 = window.DerinR2;
  const $ = s => document.querySelector(s);
  const kacis = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const slug = new URLSearchParams(location.search).get('s');
  const d = { sanatcilar: [], sayilar: {}, arama: '', tur: '', sirala: 'one' };
  const durumYaz = (m, h) => { const el = $('#sn-durum'); if (el) { el.textContent = m || ''; el.classList.toggle('hata', !!h); } };
  const foto = s => s.foto_path ? R2.adres('muzik-onizleme', s.foto_path) : '';
  const harici = u => /^https?:\/\//i.test(u) ? u : 'https://' + u;

  // Profil sayfasında muzik.js, sanatçının kimliğini bu sözden okur.
  let kimlikVer;
  if (slug) window.DerinMuzikSanatci = new Promise(r => { kimlikVer = r; });

  async function istemci() {
    const a = window.DerinAuth;
    if (!a) return null;
    await a.ready;
    return window.DerinAuth.client || null;
  }

  // ---------- Izgara ----------
  function izgaraCiz() {
    const q = d.arama.trim().toLocaleLowerCase('tr');
    let l = d.sanatcilar.filter(s => (!d.tur || (s.turler || []).includes(d.tur)) &&
      (!q || [s.ad, s.sehir, (s.turler || []).join(' ')].join(' ').toLocaleLowerCase('tr').includes(q)));
    l = l.slice().sort((a, b) => d.sirala === 'ad' ? a.ad.localeCompare(b.ad, 'tr')
      : d.sirala === 'yeni' ? String(b.onaylandi_at).localeCompare(String(a.onaylandi_at))
      : ((d.sayilar[b.id] || 0) - (d.sayilar[a.id] || 0)) || a.ad.localeCompare(b.ad, 'tr'));
    const kap = $('#sn-izgara');
    if (!d.sanatcilar.length) { kap.innerHTML = '<p class="se-bos">İlk sanatçılar çok yakında burada.</p>'; return; }
    if (!l.length) { kap.innerHTML = '<p class="se-bos">Bu aramaya uyan sanatçı yok.</p>'; return; }
    kap.innerHTML = l.map(s => `<a class="sn-kart" href="sanatcilar.html?s=${encodeURIComponent(s.slug)}">
        <div class="sn-foto">${foto(s) ? `<img src="${kacis(foto(s))}" alt="" loading="lazy">` : `<span class="sn-bas" aria-hidden="true">${kacis(s.ad.slice(0, 1).toLocaleUpperCase('tr'))}</span>`}</div>
        <b>${kacis(s.ad)}</b>
        <small>${kacis((s.turler || []).slice(0, 3).join(', ') || (d.sayilar[s.id] ? d.sayilar[s.id] + ' şarkı' : ''))}</small>
      </a>`).join('');
  }

  function turleriCiz() {
    const turler = [...new Set(d.sanatcilar.flatMap(s => s.turler || []))].sort((a, b) => a.localeCompare(b, 'tr'));
    $('#sn-tur').innerHTML = '<option value="">Tüm türler</option>' + turler.map(t => `<option value="${kacis(t)}">${kacis(t)}</option>`).join('');
  }

  async function izgara() {
    const c = await istemci();
    if (!c) { durumYaz('Bağlantı kurulamadı.', true); return; }
    const [sn, pr] = await Promise.all([
      c.from('sanatcilar').select('id,ad,slug,sehir,turler,foto_path,onaylandi_at').eq('durum', 'onaylandi'),
      c.from('muzik_parcalari').select('sanatci_id').eq('durum', 'yayinda').not('sanatci_id', 'is', null)
    ]);
    if (sn.error) { durumYaz('Sanatçılar yüklenemedi. Sayfayı yenileyin.', true); $('#sn-izgara').innerHTML = ''; return; }
    d.sanatcilar = sn.data || [];
    d.sayilar = {}; (pr.data || []).forEach(x => { d.sayilar[x.sanatci_id] = (d.sayilar[x.sanatci_id] || 0) + 1; });
    turleriCiz();
    izgaraCiz();
  }

  // ---------- Profil ----------
  async function profil() {
    $('#sn-izgara-sayfa').hidden = true;
    $('#sn-profil-sayfa').hidden = false;
    const kap = $('#sn-profil');
    kap.innerHTML = '<p class="se-bos">Yükleniyor…</p>';
    const c = await istemci();
    const r = c ? await c.from('sanatcilar').select('id,ad,slug,sehir,turler,biyografi,foto_path,instagram,spotify,youtube,web,durum').eq('slug', slug).maybeSingle() : { error: true };
    const s = r && !r.error ? r.data : null;
    kimlikVer(s ? s.id : null);
    yukleMuzik();
    if (!s) {
      kap.innerHTML = '<div><h1>Sanatçı bulunamadı</h1><p class="sn-meta">Bu profil kaldırılmış ya da henüz yayında değil.</p></div>';
      return;
    }
    document.title = s.ad + ' — Derin Record';
    const baglanti = [['Instagram', s.instagram], ['Spotify', s.spotify], ['YouTube', s.youtube], ['Web sitesi', s.web]]
      .filter(x => x[1]).map(([ad, u]) => `<a href="${kacis(harici(u))}" target="_blank" rel="noopener">${ad} ↗</a>`).join('');
    kap.innerHTML = `<div class="sn-foto">${foto(s) ? `<img src="${kacis(foto(s))}" alt="${kacis(s.ad)}">` : `<span class="sn-bas" aria-hidden="true">${kacis(s.ad.slice(0, 1).toLocaleUpperCase('tr'))}</span>`}</div>
      <div>
        <p class="sn-meta" style="margin:0;letter-spacing:1.2px;font-size:13px">SANATÇI</p>
        <h1>${kacis(s.ad)}</h1>
        <div class="sn-meta">${kacis([(s.turler || []).join(', '), s.sehir].filter(Boolean).join(' · '))}</div>
        ${s.biyografi ? `<p class="sn-bio">${kacis(s.biyografi)}</p>` : ''}
        ${baglanti ? `<div class="sn-baglantilar">${baglanti}</div>` : ''}
        ${s.durum !== 'onaylandi' ? '<p class="se-uyari-kutu" style="margin-top:16px">Bu profil henüz yayında değil; yalnız sen ve Derin görebiliyorsunuz.</p>' : ''}
      </div>`;
  }

  // Şarkı listesi, lisans paneli ve "Lisanslarım": katalogla aynı kod.
  function yukleMuzik() {
    const el = document.createElement('script');
    el.src = 'muzik.js?v=4';
    document.body.appendChild(el);
  }

  function bagla() {
    $('#sn-ara').addEventListener('input', ev => { d.arama = ev.target.value; izgaraCiz(); });
    $('#sn-tur').addEventListener('change', ev => { d.tur = ev.target.value; izgaraCiz(); });
    $('#sn-sirala').addEventListener('change', ev => { d.sirala = ev.target.value; izgaraCiz(); });
  }

  function baslat() {
    if (slug) { profil(); return; }
    bagla();
    izgara();
  }
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', baslat) : baslat();
})();
