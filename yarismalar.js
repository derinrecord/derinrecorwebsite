// YARIŞMALAR (14 Kasım 2026) — yalnız yönetici. Federasyon takviminden her sabah
// otomatik okunan yarışmalar (supabase/yarismalar.sql) listelenir; yönetici birini
// seçip canlı yayın bağlantısını yazar ve "SİTEDE GÖSTER" der → ana sayfa ve Haberler.
(() => {
  'use strict';
  const BOLGE = 'Europe/Istanbul';
  const VARSAYILAN_YAYIN = 'https://www.youtube.com/channel/UCneNJjXZoKZTbqH5QYdirvg/live'; // TCF YouTube canlı yayın sayfası
  const AYLAR = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const bugunYazi = simdi => new Date(simdi).toLocaleDateString('sv-SE', { timeZone: BOLGE });

  // Yayın bağlantısı ve not denetimi: bağlantı https olmalı; not en çok 200 harf.
  function formDenetle(link, not) {
    const l = String(link || '').trim(), n = String(not || '').trim();
    if (!l) return { hata: 'Canlı yayın bağlantısını yaz.' };
    if (!/^https:\/\/[^\s<>"']+$/.test(l)) return { hata: 'Bağlantı https:// ile başlamalı ve boşluk içermemeli.' };
    if (n.length > 200) return { hata: 'Not en çok 200 harf olabilir.' };
    return { canli_link: l, not_metni: n || null };
  }

  // Kaç gün kaldı: "BUGÜN", "YARIN", "3 GÜN SONRA", "DEVAM EDİYOR", "BİTTİ"
  function kalan(y, simdi) {
    const b = bugunYazi(simdi), gun = (Date.parse(y.bas) - Date.parse(b)) / 864e5;
    if (String(y.bit) < b) return 'BİTTİ';
    if (gun < 0) return 'DEVAM EDİYOR';
    if (gun === 0) return 'BUGÜN';
    if (gun === 1) return 'YARIN';
    return gun + ' GÜN SONRA';
  }

  const kisa = g => { const [, a, d] = String(g).split('-').map(Number); return d + ' ' + AYLAR[a - 1]; };
  const tarih = y => y.bas === y.bit ? kisa(y.bas) : kisa(y.bas) + ' – ' + kisa(y.bit);

  if (typeof module !== 'undefined') module.exports = { formDenetle, kalan, VARSAYILAN_YAYIN };
  if (typeof document === 'undefined') return;

  const $ = id => document.getElementById(id);
  const durum = $('yr-durum'), liste = $('yr-liste');
  let client = null, kayitlar = [];

  function kart(y) {
    const k = kalan(y, Date.now()), yakin = /BUGÜN|YARIN|DEVAM|^[12] GÜN/.test(k);
    return `<article class="yr-kart${y.yayinda ? ' yayinda' : ''}" data-id="${esc(y.id)}">
      <div class="yr-ust"><span class="yr-kalan${yakin ? ' yakin' : ''}">${esc(k)}</span>${y.yayinda ? '<span class="yr-yayinda"><i></i>SİTEDE YAYINDA</span>' : ''}${y.bildirim_at ? '<span class="yr-tg">TELEGRAM ✓</span>' : ''}</div>
      <h2>${esc(y.ad)}</h2>
      <p class="yr-bilgi">${esc([tarih(y), y.sehir, y.brans].filter(Boolean).join(' · '))} · <a href="${esc(y.link)}" target="_blank" rel="noreferrer">Federasyon sayfası ↗</a></p>
      <form class="yr-form">
        <label>CANLI YAYIN BAĞLANTISI<input name="link" type="url" inputmode="url" value="${esc(y.canli_link || VARSAYILAN_YAYIN)}" required></label>
        <label>KISA NOT (isteğe bağlı)<input name="not" maxlength="200" value="${esc(y.not_metni || '')}" placeholder="Örn. Cumartesi 10:00'da başlıyor"></label>
        <p class="yr-mesaj" role="status" aria-live="polite"></p>
        <div class="yr-dugmeler">${y.yayinda ? '<button type="submit" class="yr-ana">GÜNCELLE</button><button type="button" class="yr-kaldir" data-kaldir>SİTEDEN KALDIR</button>' : '<button type="submit" class="yr-ana">ANA SAYFADA VE HABERLERDE GÖSTER</button>'}</div>
      </form>
    </article>`;
  }

  function ciz() {
    const b = bugunYazi(Date.now());
    const gelecek = kayitlar.filter(y => String(y.bit) >= b);
    liste.innerHTML = gelecek.map(kart).join('') || '<p class="yr-bos">Yaklaşan yarışma yok. Takvim her sabah 09:00\'da yeniden okunur.</p>';
  }

  async function yukle() {
    const [y, t] = await Promise.all([
      client.from('yarismalar').select('*').gte('bit', bugunYazi(Date.now())).order('bas'),
      client.from('yarisma_tarama').select('son_tarama_at,son_sayi,son_hata').eq('id', 1).maybeSingle()
    ]);
    if (y.error) { durum.textContent = 'Yarışmalar alınamadı: ' + y.error.message; return; }
    kayitlar = y.data || [];
    const s = t.data;
    durum.textContent = s && s.son_tarama_at
      ? 'Takvim son okunma: ' + new Date(s.son_tarama_at).toLocaleString('tr-TR', { timeZone: BOLGE, day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit' }) + (s.son_hata ? ' · ' + s.son_hata : '') + ' · Her sabah 09:00\'da otomatik okunur.'
      : 'Takvim henüz okunmadı. "TAKVİMİ ŞİMDİ OKU" ile başlat.';
    ciz();
  }

  async function kaydet(id, alanlar, mesaj, dugme) {
    dugme.disabled = true;
    const { data, error } = await client.from('yarismalar').update(Object.assign({ updated_at: new Date().toISOString() }, alanlar)).eq('id', id).select('id');
    dugme.disabled = false;
    if (error || !data || !data.length) { mesaj.textContent = 'Kaydedilemedi: ' + ((error && error.message) || 'yetki yok ya da kayıt bulunamadı.'); mesaj.className = 'yr-mesaj hata'; return false; }
    Object.assign(kayitlar.find(y => y.id === id) || {}, alanlar);
    ciz();
    return true;
  }

  liste.addEventListener('submit', async e => {
    e.preventDefault();
    const f = e.target, k = f.closest('.yr-kart'), mesaj = f.querySelector('.yr-mesaj');
    const s = formDenetle(f.elements.link.value, f.elements.not.value);
    if (s.hata) { mesaj.textContent = s.hata; mesaj.className = 'yr-mesaj hata'; return; }
    await kaydet(k.dataset.id, { canli_link: s.canli_link, not_metni: s.not_metni, yayinda: true }, mesaj, f.querySelector('[type="submit"]'));
  });
  liste.addEventListener('click', async e => {
    const b = e.target.closest('[data-kaldir]');
    if (!b) return;
    const k = b.closest('.yr-kart');
    await kaydet(k.dataset.id, { yayinda: false }, k.querySelector('.yr-mesaj'), b);
  });
  $('yr-tara').addEventListener('click', async e => {
    const b = e.currentTarget;
    b.disabled = true; b.textContent = 'OKUNUYOR…';
    try {
      const r = await client.rpc('yarisma_tara_baslat');
      if (r.error) throw r.error;
      await new Promise(t => setTimeout(t, 8000));
      const s = await client.rpc('yarisma_tara_isle');
      if (s.error) throw s.error;
      await yukle();
    } catch (err) { durum.textContent = 'Takvim okunamadı: ' + (err.message || err); }
    b.disabled = false; b.textContent = 'TAKVİMİ ŞİMDİ OKU';
  });

  async function basla() {
    let auth = null;
    try { auth = window.DerinAuth && await window.DerinAuth.ready; } catch (e) { auth = null; }
    client = auth && auth.client;
    const giris = $('yr-giris');
    if (!client || !window.DerinAuth.user) { giris.textContent = 'Bu sayfayı görmek için yönetici hesabıyla giriş yap.'; giris.hidden = false; client = null; return; }
    if (window.DerinAuth.profile?.role !== 'admin') { giris.textContent = 'Bu sayfa yalnız yöneticiye açık.'; giris.hidden = false; client = null; return; }
    giris.hidden = true;
    $('yr-app').hidden = false;
    await yukle();
  }
  basla();
  window.addEventListener('derin:authchange', () => { if (!client) basla(); });
})();
