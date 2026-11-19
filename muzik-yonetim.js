// Derin Record — Müzik kataloğu yönetimi (19 Kasım 2026, yalnız yönetici)
//
// Derin şarkı ekler (WAV + kapak), alternatif versiyon ve stem ekler, lisans
// fiyatlarını yazar ve lisans satışlarını onaylar.
// Yükleme: tarayıcı süreyi ve dalga formunu okur, filigransız MP3 önizlemeyi
// üretir (ses-donustur.js). WAV → gizli muzik/ ; MP3 ve kapak → herkese açık
// muzik-onizleme/ (R2). Satır önce taslak açılır; yarıda kalırsa taslak kalır.
(() => {
  'use strict';

  const SA = window.DerinSatinAlma;
  const R2 = window.DerinR2;
  const $ = (s, k) => (k || document).querySelector(s);
  const kacis = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const istemci = () => window.DerinAuth && window.DerinAuth.client;
  const SES = /\.(wav|aiff?|flac|mp3)$/i;
  const v = { parcalar: [], versiyonlar: [], dosyalar: [], turler: [], satislar: [], adlar: {}, versiyonFormu: null,
    sanatcilar: [], ozel: {}, beyanlar: {}, radyoParcalari: {}, klasorler: [], acikBeyan: null, havuz: [], ay: '' };
  const dinle = new Audio(); dinle.preload = 'none';

  async function tekSatir(sorgu) {
    const { data, error } = await sorgu;
    if (error) return error;
    return (data && data.length) ? null : { message: 'Kayıt bulunamadı ya da yetki yok.' };
  }
  const yaz = (id, m, h) => { const el = $(id); if (el) { el.textContent = m || ''; el.classList.toggle('hata', !!h); } };
  const fiyatYaz = n => (SA && SA.tutarGoster(n)) || '—';
  const sureYaz = sn => { const s = Math.round(Number(sn) || 0); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
  const rastgele = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  const liste = s => String(s || '').split(',').map(x => x.trim()).filter(Boolean).slice(0, 12);

  // Süre/dalga formu okuma ve yükleme ortak dosyada (muzik-yukle.js).
  const MY = window.DerinMuzikYukle;
  const sesYukle = (parcaId, dosya, ad, versiyonId, durumId, on) =>
    MY.sesYukle(istemci(), parcaId, dosya, ad, versiyonId, m => yaz(durumId, on + m));

  // ---------- Okuma ----------
  async function yukle() {
    const c = istemci();
    const [p, ve, df, tu, sa] = await Promise.all([
      c.from('muzik_parcalari').select('*').order('created_at', { ascending: false }),
      c.from('muzik_versiyonlari').select('*').order('sira'),
      c.from('muzik_dosyalari').select('*'),
      c.from('muzik_lisans_turleri').select('*').order('sira'),
      c.from('muzik_lisans_satislari').select('*').order('istendi_at', { ascending: false })
    ]);
    if (p.error) { yaz('#my-durum', 'Tablolar okunamadı: ' + p.error.message, true); return; }
    v.parcalar = p.data || []; v.versiyonlar = ve.data || []; v.dosyalar = df.data || [];
    v.turler = tu.data || []; v.satislar = sa.data || [];
    const [sn, oz, be, rt, kl] = await Promise.all([
      c.from('sanatcilar').select('*').order('created_at', { ascending: false }),
      c.from('sanatci_ozel').select('*'),
      c.from('muzik_parca_beyan').select('*'),
      c.from('radio_tracks').select('id,muzik_parca_id').not('muzik_parca_id', 'is', null),
      c.from('radio_folders').select('id,name').order('name')
    ]);
    v.sanatcilar = sn.error ? [] : (sn.data || []);
    v.ozel = {}; (oz.data || []).forEach(x => { v.ozel[x.sanatci_id] = x; });
    v.beyanlar = {}; (be.data || []).forEach(x => { v.beyanlar[x.parca_id] = x; });
    v.radyoParcalari = {}; (rt.data || []).forEach(x => { v.radyoParcalari[x.muzik_parca_id] = x.id; });
    v.klasorler = kl.error ? [] : (kl.data || []);
    await havuzYukle();
    const kimler = [...new Set(v.satislar.map(s => s.kullanici_id))];
    if (kimler.length) { const pr = await c.from('profiles').select('id,full_name').in('id', kimler); (pr.data || []).forEach(x => { v.adlar[x.id] = x.full_name; }); }
    ciz();
  }

  // ---------- Çizim ----------
  function ciz() {
    $('#my-turler').innerHTML = v.turler.map(t => `<form class="se-form" data-tur-form="${t.id}" style="padding:14px 0;border-bottom:1px solid #1e1d22">
        <div class="se-yan-yana"><label>Lisans adı<input name="ad" value="${kacis(t.ad)}" maxlength="60"></label>
        <label>Fiyat (₺, KDV dahil)<input name="fiyat" inputmode="decimal" value="${t.fiyat ? kacis(String(t.fiyat).replace('.', ',')) : ''}" placeholder="Fiyat yaz"></label></div>
        <label>Açıklama<input name="aciklama" value="${kacis(t.aciklama || '')}" maxlength="400"></label>
        <button type="submit" class="se-dugme ikincil" style="align-self:flex-start">Kaydet</button></form>`).join('');

    const turlerListesi = [...new Set(v.parcalar.map(p => p.tur).filter(Boolean))];
    $('#my-tur-liste').innerHTML = turlerListesi.map(t => `<option value="${kacis(t)}">`).join('');

    $('#my-parcalar').innerHTML = v.parcalar.length ? v.parcalar.map(p => {
      const surum = v.versiyonlar.filter(x => x.parca_id === p.id);
      const anaDosya = v.dosyalar.some(d => d.parca_id === p.id && !d.versiyon_id);
      const eksik = !anaDosya || !p.onizleme_path;
      const yayinda = p.durum === 'yayinda';
      const beyan = v.beyanlar[p.id];
      const radyoda = !!v.radyoParcalari[p.id];
      const durumAd = eksik ? 'Dosya eksik' : ({ yayinda: 'Yayında', inceleme: 'Onay bekliyor', reddedildi: 'Reddedildi' }[p.durum] || 'Taslak');
      const ek1Satir = v.acikBeyan === p.id ? `<tr><td colspan="4">${ek1Ciz(beyan)}</td></tr>` : '';
      const form = v.versiyonFormu === p.id ? `<tr><td colspan="4"><form class="se-form" data-versiyon-form="${p.id}" style="padding:10px 0">
          <div class="se-yan-yana"><label>Tür<select name="tur"><option value="alternatif">Alternatif versiyon</option><option value="stem">Stem</option></select></label>
          <label>Dosyalar<input type="file" name="dosya" accept=".wav,.aif,.aiff,.flac,.mp3,audio/*" multiple></label></div>
          <small style="color:#a8a5a0">Her dosya ayrı versiyon olur; adı dosya adından gelir (ör. "Instrumental [Chorus]").</small>
          <div style="display:flex;gap:8px"><button type="submit" class="se-dugme">Versiyonları ekle</button><button type="button" class="se-dugme ikincil" data-versiyon-kapat>Vazgeç</button></div>
          <p class="se-durum" id="my-v-durum" role="status" aria-live="polite"></p></form></td></tr>` : '';
      return `<tr>
        <td><div style="display:flex;gap:12px;align-items:center">${p.kapak_path ? `<img src="${kacis(R2.adres('muzik-onizleme', p.kapak_path))}" alt="" style="width:44px;height:44px;border-radius:6px;object-fit:cover">` : ''}
          <span><b>${kacis(p.ad)}</b><br><small style="color:#a8a5a0">${kacis(p.sanatci)}${p.sanatci_id ? ' (sanatçı)' : ''}${p.tur ? ' · ' + kacis(p.tur) : ''}${p.sure_sn ? ' · ' + sureYaz(p.sure_sn) : ''}</small>
          ${p.sanatci_id && beyan ? `<br><small style="color:${beyan.radyo_izni ? '#7fd49a' : '#a8a5a0'}">${beyan.radyo_izni ? 'Radyo izni var' : 'Radyo izni yok'}${radyoda ? ' · radyoda' : ''}</small>` : ''}
          ${p.red_notu && p.durum === 'reddedildi' ? `<br><small style="color:#e58">Red notu: ${kacis(p.red_notu)}</small>` : ''}</span></div></td>
        <td>${surum.filter(x => x.tur === 'alternatif').length} alternatif · ${surum.filter(x => x.tur === 'stem').length} stem
          ${surum.length ? `<br><small style="color:#a8a5a0">${surum.map(x => kacis(x.ad)).join(', ')}</small>` : ''}</td>
        <td><span class="se-rozet ${yayinda ? 'odendi' : p.durum === 'inceleme' ? 'dekont' : ''}">${durumAd}</span></td>
        <td><div class="islem">
          ${p.onizleme_path ? `<button type="button" class="se-dugme ikincil" data-dinle="${p.id}">${dinle.dataset.calan === p.id && !dinle.paused ? 'Durdur' : 'Dinle'}</button>` : ''}
          ${p.sanatci_id ? `<button type="button" class="se-dugme ikincil" data-ek1="${p.id}">Ek-1 beyanı</button>` : ''}
          ${p.sanatci_id && p.durum === 'inceleme' ? `<button type="button" class="se-dugme ikincil" data-parca-red="${p.id}">Reddet</button>` : ''}
          ${yayinda && beyan && beyan.radyo_izni && !radyoda ? `<button type="button" class="se-dugme ikincil" data-radyoya="${p.id}">Radyoya ekle</button>` : ''}
          <button type="button" class="se-dugme ikincil" data-versiyon-ac="${p.id}">Versiyon / stem ekle</button>
          <button type="button" class="se-dugme ${yayinda ? 'ikincil' : ''}" data-yayin="${p.id}" ${eksik && !yayinda ? 'disabled' : ''}>${yayinda ? 'Taslağa al' : 'Yayınla'}</button>
          <button type="button" class="se-dugme ikincil" data-parca-sil="${p.id}">Sil</button></div></td></tr>${ek1Satir}${form}`;
    }).join('') : '<tr><td colspan="4" style="color:#a8a5a0">Henüz şarkı yok. Yukarıdan ilk şarkını ekle.</td></tr>';
    sanatcilarCiz();
    paylarCiz();

    const turAd = id => (v.turler.find(t => t.id === id) || {}).ad || id;
    const tarih = t => t ? new Date(t).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' }) : '';
    $('#my-satislar').innerHTML = v.satislar.length ? v.satislar.map(s => {
      const p = v.parcalar.find(x => x.id === s.parca_id);
      return `<tr><td><b>${kacis(v.adlar[s.kullanici_id] || 'Müşteri')}</b><br><small style="color:#a8a5a0">${tarih(s.istendi_at)}</small></td>
        <td>${kacis(p ? p.ad : 'Silinmiş şarkı')}<br><small style="color:#a8a5a0">${kacis(turAd(s.lisans_turu))}${s.kullanim_notu ? ' · ' + kacis(s.kullanim_notu) : ''}</small></td>
        <td>${kacis(fiyatYaz(s.tutar))}</td>
        <td><span class="se-rozet ${s.durum}">${s.durum === 'odendi' ? 'Ödendi' : s.durum === 'dekont' ? 'Dekont geldi' : 'Ödeme bekleniyor'}</span></td>
        <td><div class="islem">
          ${s.dekont_path ? `<button type="button" class="se-dugme ikincil" data-dekont-gor="${kacis(s.dekont_path)}">Dekontu gör</button>` : ''}
          ${s.durum !== 'odendi' ? `<button type="button" class="se-dugme yesil" data-odendi="${s.id}">Ödeme alındı · Dosyaları aç</button>` : ''}
          <button type="button" class="se-dugme ikincil" data-satis-sil="${s.id}">Sil</button></div></td></tr>`;
    }).join('') : '<tr><td colspan="5" style="color:#a8a5a0">Henüz lisans satışı yok.</td></tr>';
  }


  // ---------- Sanatçılar (2. aşama, 20 Kasım) ----------
  const EK1 = [
    ['besteci', 'Besteci / söz yazarı / düzenleyen'], ['muzisyenler', 'Kayda katılan diğer müzisyenler ve onayları'],
    ['sample', 'Sample / loop'], ['yz', 'Yapay zekâ'], ['birlik', 'Telif birliği kaydı'], ['munhasir', 'Başka yerde münhasır lisans']
  ];
  function ek1Ciz(b) {
    if (!b) return '<p style="color:#a8a5a0;margin:8px 0">Sanatçı Ek-1 formunu henüz doldurmadı.</p>';
    const e = b.ek1 || {};
    const evetHayir = (k) => { const x = e[k] || {}; return x.var ? 'Evet' + (x.not ? ': ' + kacis(x.not) : '') : 'Hayır'; };
    const satir = ([k, ad]) => `<li><b>${ad}:</b> ${['sample', 'yz', 'birlik', 'munhasir'].includes(k) ? evetHayir(k) : kacis(e[k] || '—')}</li>`;
    return `<ul style="margin:8px 0;padding-left:18px;line-height:1.6;color:#d0ccc7">${EK1.map(satir).join('')}
      <li><b>Mekân radyosu:</b> ${b.radyo_izni ? 'Evet, izin veriyor' : 'Hayır'}</li>
      <li><b>Onay cümlesi:</b> ${e.onay === true ? 'Onaylandı' + (e.onay_at ? ' · ' + new Date(e.onay_at).toLocaleString('tr-TR') : '') : 'Onaylanmadı'}</li></ul>`;
  }

  const SANATCI_DURUM = { basvurdu: 'Başvurdu', onaylandi: 'Onaylı', reddedildi: 'Reddedildi', askida: 'Askıda' };
  function sanatcilarCiz() {
    const kap = $('#my-sanatcilar'); if (!kap) return;
    const sira = { basvurdu: 0, onaylandi: 1, askida: 2, reddedildi: 3 };
    const l = v.sanatcilar.slice().sort((a, b) => (sira[a.durum] - sira[b.durum]) || String(b.created_at).localeCompare(String(a.created_at)));
    kap.innerHTML = l.length ? l.map(s => {
      const o = v.ozel[s.id] || {};
      const sarki = v.parcalar.filter(p => p.sanatci_id === s.id);
      const baglanti = [['Instagram', s.instagram], ['Spotify', s.spotify], ['YouTube', s.youtube], ['Web', s.web]].filter(x => x[1])
        .map(([ad, u]) => `<a href="${kacis(/^https?:\/\//.test(u) ? u : 'https://' + u)}" target="_blank" rel="noopener" style="color:#d8bb2c">${ad}</a>`).join(' · ');
      return `<tr><td><div style="display:flex;gap:12px;align-items:flex-start">${s.foto_path ? `<img src="${kacis(R2.adres('muzik-onizleme', s.foto_path))}" alt="" style="width:52px;height:52px;border-radius:50%;object-fit:cover">` : ''}
          <span><b>${kacis(s.ad)}</b><br><small style="color:#a8a5a0">${kacis([s.sehir, (s.turler || []).join(', ')].filter(Boolean).join(' · '))}</small>
          ${s.biyografi ? `<br><small style="color:#d0ccc7;display:block;max-width:420px;margin-top:4px">${kacis(s.biyografi)}</small>` : ''}
          ${baglanti ? `<br><small>${baglanti}</small>` : ''}
          <br><small style="color:#a8a5a0">${sarki.length} şarkı · sözleşme ${kacis(s.sozlesme_surumu || '—')}${s.sozlesme_onay_at ? ' · ' + new Date(s.sozlesme_onay_at).toLocaleDateString('tr-TR') : ''}</small></span></div></td>
        <td><small>${kacis(o.yasal_ad || '')}<br>${kacis(o.eposta || '')}<br>${kacis(o.telefon || '')}${o.iban ? '<br>IBAN: ' + kacis(SA.ibanGoster(o.iban)) : ''}${o.hesap_sahibi ? '<br>' + kacis(o.hesap_sahibi) : ''}</small></td>
        <td><span class="se-rozet ${s.durum === 'onaylandi' ? 'odendi' : s.durum === 'basvurdu' ? 'dekont' : ''}">${SANATCI_DURUM[s.durum] || s.durum}</span>${s.red_notu ? `<br><small style="color:#a8a5a0">${kacis(s.red_notu)}</small>` : ''}</td>
        <td><div class="islem">
          ${s.durum !== 'onaylandi' ? `<button type="button" class="se-dugme yesil" data-sanatci-onay="${s.id}">Onayla</button>` : `<a class="se-dugme ikincil" href="sanatcilar.html?s=${encodeURIComponent(s.slug || '')}" target="_blank" rel="noopener">Profili gör</a>`}
          ${s.durum === 'basvurdu' ? `<button type="button" class="se-dugme ikincil" data-sanatci-red="${s.id}">Reddet</button>` : ''}
          ${s.durum === 'onaylandi' ? `<button type="button" class="se-dugme ikincil" data-sanatci-askiya="${s.id}">Askıya al</button>` : ''}
        </div></td></tr>`;
    }).join('') : '<tr><td colspan="4" style="color:#a8a5a0">Henüz başvuru yok. Başvuru sayfası: derinrecord.com/sanatci-paneli.html</td></tr>';
  }

  // Radyoya ekle: yayındaki, sanatçının radyo izni verdiği şarkının 320 kbps
  // MP3'ü seçilen radyo klasörüne kopyalanır; çalınmaları sanatçıya sayılır.
  async function radyoyaEkle(id) {
    const p = v.parcalar.find(x => x.id === id); if (!p) return;
    if (!v.klasorler.length) { yaz('#my-durum', 'Önce radyo panelinde bir klasör aç.', true); return; }
    const liste = v.klasorler.map((k, i) => (i + 1) + ') ' + k.name).join('\n');
    const cevap = prompt(`"${p.ad}" hangi radyo klasörüne eklensin? Numarasını yaz:\n${liste}`, '1');
    if (cevap == null) return;
    const k = v.klasorler[parseInt(cevap, 10) - 1];
    if (!k) { yaz('#my-durum', 'Klasör numarası anlaşılmadı.', true); return; }
    try {
      yaz('#my-durum', `"${p.ad}" radyoya kopyalanıyor…`);
      const ses = await (await fetch(R2.adres('muzik-onizleme', p.onizleme_path))).blob();
      const taban = MY.guvenliAd(p.ad).toLowerCase();
      const yol = `${k.id}/${Date.now()}-${taban}.mp3`;
      const y = await R2.yukle('radio-audio', yol, ses, 'audio/mpeg');
      if (y.error) throw new Error(y.error.message);
      let cover_path = null;
      if (p.kapak_path) {
        try {
          const kp = await (await fetch(R2.adres('muzik-onizleme', p.kapak_path))).blob();
          const ky = `${k.id}/${Date.now()}-${taban}.${(p.kapak_path.split('.').pop() || 'jpg')}`;
          const ks = await R2.yukle('radio-covers', ky, kp, kp.type || 'image/jpeg');
          if (!ks.error) cover_path = ky;
        } catch (e) { /* kapak olmadan da çalar */ }
      }
      const { error } = await istemci().from('radio_tracks').insert({
        folder_id: k.id, title: p.ad, storage_path: yol, sort_order: 9999, duration_sec: p.sure_sn,
        sanatci: p.sanatci, sanatci_id: p.sanatci_id, muzik_parca_id: p.id, cover_path, dalga: null
      });
      if (error) { await R2.sil('radio-audio', yol); throw new Error(error.message); }
      yaz('#my-durum', `"${p.ad}" radyoda "${k.name}" klasörüne eklendi. Çalınmaları sanatçıya sayılacak.`);
      await yukle();
    } catch (e) { yaz('#my-durum', 'Radyoya eklenemedi: ' + ((e && e.message) || 'hata'), true); }
  }

  // ---------- Paylar ----------
  const buAy = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); };
  async function havuzYukle() {
    if (!v.ay) v.ay = buAy();
    const r = await istemci().rpc('radyo_havuz_ozeti', { p_ay: v.ay + '-01' });
    v.havuz = r.error ? [] : (r.data || []);
  }
  function paylarCiz() {
    const kap = $('#my-paylar'); if (!kap) return;
    const f = $('#my-pay-form');
    if (f && document.activeElement !== f.ay) f.ay.value = v.ay;
    const net = v.havuz.length ? v.havuz[0].net_gelir : null;
    if (f && document.activeElement !== f.gelir) f.gelir.value = net != null ? String(net).replace('.', ',') : '';
    const [yil, ay] = v.ay.split('-').map(Number);
    const ayici = t => { if (!t) return false; const d = new Date(t); return d.getFullYear() === yil && d.getMonth() + 1 === ay; };
    const satir = v.sanatcilar.filter(s => s.durum !== 'reddedildi').map(s => {
      const satislar = v.satislar.filter(x => x.durum === 'odendi' && ayici(x.odendi_at) && (v.parcalar.find(p => p.id === x.parca_id) || {}).sanatci_id === s.id);
      const brut = satislar.reduce((n, x) => n + (Number(x.tutar) || 0), 0);
      const h = v.havuz.find(x => x.sanatci_id === s.id) || {};
      const radyo = Number(h.pay) || 0;
      return { s, adet: satislar.length, brut, lisans: brut * 0.25, calma: Number(h.calma) || 0, toplam: Number(h.toplam_calma) || 0, radyo };
    }).filter(x => x.adet || x.calma || x.s.durum === 'onaylandi');
    kap.innerHTML = satir.length ? satir.map(x => `<tr><td><b>${kacis(x.s.ad)}</b></td>
      <td>${x.adet} satış · ${kacis(fiyatYaz(x.brut || null))}</td><td>${kacis(fiyatYaz(x.lisans || null))}</td>
      <td>${x.calma}${x.toplam ? ` / ${x.toplam} (%${(x.calma / x.toplam * 100).toLocaleString('tr-TR', { maximumFractionDigits: 2 })})` : ''}</td>
      <td>${net == null ? '<small style="color:#a8a5a0">gelir yazılmadı</small>' : kacis(fiyatYaz(x.radyo || null))}</td>
      <td><b>${kacis(fiyatYaz((x.lisans + x.radyo) || null))}</b></td></tr>`).join('')
      : '<tr><td colspan="6" style="color:#a8a5a0">Bu ay için sanatçı payı yok.</td></tr>';
  }

  // ---------- Şarkı ekleme ----------
  async function parcaEkle(ev) {
    ev.preventDefault();
    const f = ev.target, c = istemci();
    const ses = f.dosya.files[0], kapak = f.kapak.files[0];
    if (!ses || !SES.test(ses.name)) { yaz('#my-ekle-durum', 'Şarkının ses dosyasını seç (WAV önerilir).', true); return; }
    if (kapak && !/^image\//.test(kapak.type)) { yaz('#my-ekle-durum', 'Kapak bir görsel olmalı (JPG/PNG).', true); return; }
    const ad = f.ad.value.trim() || ses.name.replace(SES, '').replace(/[_-]+/g, ' ').trim();
    const bpm = parseInt(f.bpm.value, 10);
    const yayinla = f.yayinla.checked;
    const btn = f.querySelector('button[type="submit"]'); btn.disabled = true;
    try {
      const { data: satir, error } = await c.from('muzik_parcalari').insert({
        ad: ad.slice(0, 120), sanatci: (f.sanatci.value.trim() || 'Derin Record').slice(0, 120),
        tur: f.tur.value.trim().slice(0, 40) || null, ruh_hali: liste(f.ruh.value), etiketler: liste(f.etiket.value),
        bpm: bpm >= 20 && bpm <= 300 ? bpm : null, durum: 'taslak'
      }).select('id').single();
      if (error) throw new Error('kayıt açılamadı (' + error.message + ')');
      const sonuc = await sesYukle(satir.id, ses, ad, null, '#my-ekle-durum', ad + ': ');
      let kapak_path = null;
      if (kapak) {
        yaz('#my-ekle-durum', ad + ': kapak yükleniyor…');
        const uz = (kapak.name.match(/\.(jpe?g|png|webp)$/i) || ['.jpg'])[0].toLowerCase();
        kapak_path = satir.id + '/kapak-' + rastgele() + uz;
        const k = await R2.yukle('muzik-onizleme', kapak_path, kapak, kapak.type);
        if (k.error) throw new Error('kapak yüklenemedi (' + k.error.message + ')');
      }
      const g = await tekSatir(c.from('muzik_parcalari').update({ ...sonuc, kapak_path, durum: yayinla ? 'yayinda' : 'taslak' }).eq('id', satir.id).select('id'));
      if (g) throw new Error('kayıt güncellenemedi (' + g.message + ')');
      f.reset();
      yaz('#my-ekle-durum', `"${ad}" eklendi${yayinla ? ' ve yayına alındı' : ' (taslak)'}. Versiyon ve stemleri listeden ekleyebilirsin.`);
    } catch (e) {
      yaz('#my-ekle-durum', 'Eklenemedi: ' + ((e && e.message) || 'hata') + ' — kayıt taslak olarak kalmış olabilir.', true);
    }
    btn.disabled = false;
    await yukle();
  }

  async function versiyonEkle(ev, parcaId) {
    ev.preventDefault();
    const f = ev.target, c = istemci();
    const dosyalar = [...(f.dosya.files || [])].filter(x => SES.test(x.name));
    if (!dosyalar.length) { yaz('#my-v-durum', 'En az bir ses dosyası seç.', true); return; }
    const tur = f.tur.value;
    const btn = f.querySelector('button[type="submit"]'); btn.disabled = true;
    let tamam = 0; const hata = [];
    const mevcut = v.versiyonlar.filter(x => x.parca_id === parcaId).length;
    for (let i = 0; i < dosyalar.length; i++) {
      const dosya = dosyalar[i];
      const ad = dosya.name.replace(SES, '').replace(/[_]+/g, ' ').trim().slice(0, 120) || 'Versiyon';
      const on = `(${i + 1}/${dosyalar.length}) ${ad}: `;
      try {
        const { data: vs, error } = await c.from('muzik_versiyonlari').insert({ parca_id: parcaId, tur, ad, sira: mevcut + i }).select('id').single();
        if (error) throw new Error(error.message);
        const sonuc = await sesYukle(parcaId, dosya, ad, vs.id, '#my-v-durum', on);
        const g = await tekSatir(c.from('muzik_versiyonlari').update(sonuc).eq('id', vs.id).select('id'));
        if (g) throw new Error(g.message);
        tamam++;
      } catch (e) { hata.push(ad + ': ' + ((e && e.message) || 'hata')); }
    }
    btn.disabled = false;
    if (!hata.length) v.versiyonFormu = null;
    await yukle();
    yaz('#my-durum', hata.length ? `${tamam} versiyon eklendi. Eklenemeyenler: ${hata.join(' · ')}` : `${tamam} ${tur === 'stem' ? 'stem' : 'alternatif versiyon'} eklendi.`, hata.length > 0);
  }

  async function parcaSil(id) {
    const p = v.parcalar.find(x => x.id === id); if (!p) return;
    if (!confirm(`"${p.ad}" silinsin mi? Versiyonları, stemleri ve dosyaları da silinir.`)) return;
    const dosyalar = v.dosyalar.filter(d => d.parca_id === id);
    const onizlemeler = [p.onizleme_path, p.kapak_path].concat(v.versiyonlar.filter(x => x.parca_id === id).map(x => x.onizleme_path)).filter(Boolean);
    const err = await tekSatir(istemci().from('muzik_parcalari').delete().eq('id', id).select('id'));
    if (err) { yaz('#my-durum', 'Silinemedi: ' + err.message, true); return; }
    for (const d of dosyalar) await R2.sil('muzik-audio', d.dosya_path.replace(/^muzik\//, ''));
    for (const o of onizlemeler) await R2.sil('muzik-onizleme', o);
    yaz('#my-durum', 'Şarkı silindi.');
    await yukle();
  }

  async function guncelle(tablo, id, alanlar, mesaj) {
    const err = await tekSatir(istemci().from(tablo).update(alanlar).eq('id', id).select('id'));
    yaz('#my-durum', err ? 'Kaydedilemedi: ' + err.message : (mesaj || 'Kaydedildi.'), !!err);
    if (!err) await yukle();
  }

  function bagla() {
    $('#my-ekle').addEventListener('submit', parcaEkle);
    dinle.addEventListener('ended', () => ciz());
    $('#my-pay-form').ay.addEventListener('change', async ev => { if (/^\d{4}-\d{2}$/.test(ev.target.value)) { v.ay = ev.target.value; await havuzYukle(); paylarCiz(); } });
    document.addEventListener('submit', ev => {
      const t = ev.target;
      if (t.dataset.turForm) {
        ev.preventDefault();
        const m = t.fiyat.value.trim(), n = m ? SA.tutarCoz(m) : null;
        if (m && !n) { yaz('#my-tur-durum', 'Fiyat anlaşılmadı. Örnek: 1500 ya da 1.499,90', true); return; }
        tekSatir(istemci().from('muzik_lisans_turleri').update({ ad: t.ad.value.trim() || t.dataset.turForm, aciklama: t.aciklama.value.trim() || null, fiyat: n }).eq('id', t.dataset.turForm).select('id'))
          .then(err => { yaz('#my-tur-durum', err ? 'Kaydedilemedi: ' + err.message : 'Lisans kaydedildi.', !!err); if (!err) yukle(); });
      } else if (t.dataset.versiyonForm) versiyonEkle(ev, t.dataset.versiyonForm);
      else if (t.id === 'my-pay-form') {
        ev.preventDefault();
        const m = t.gelir.value.trim(), n = m ? SA.tutarCoz(m) : null;
        if (!m || !n) { yaz('#my-pay-durum', 'Geliri rakamla yaz. Örnek: 5000 ya da 4.999,90', true); return; }
        istemci().from('radyo_aylik_gelir').upsert({ ay: v.ay + '-01', net_gelir: n, updated_at: new Date().toISOString() }).select('ay')
          .then(async ({ data, error }) => {
            const err = error || (!data || !data.length ? { message: 'Kayıt bulunamadı ya da yetki yok.' } : null);
            yaz('#my-pay-durum', err ? 'Kaydedilemedi: ' + err.message : 'Radyo geliri kaydedildi.', !!err);
            if (!err) { await havuzYukle(); paylarCiz(); }
          });
      }
    });
    document.addEventListener('click', async ev => {
      const b = ev.target.closest('button'); if (!b) return;
      if (b.dataset.dinle) {
        const p = v.parcalar.find(x => x.id === b.dataset.dinle);
        if (dinle.dataset.calan === p.id && !dinle.paused) dinle.pause();
        else { dinle.src = R2.adres('muzik-onizleme', p.onizleme_path); dinle.dataset.calan = p.id; dinle.play().catch(() => {}); }
        ciz();
      }
      else if (b.dataset.ek1) { v.acikBeyan = v.acikBeyan === b.dataset.ek1 ? null : b.dataset.ek1; ciz(); }
      else if (b.dataset.parcaRed) {
        const not = prompt('Sanatçıya red gerekçesi yaz (sanatçı panelinde görür):', '');
        if (not != null) guncelle('muzik_parcalari', b.dataset.parcaRed, { durum: 'reddedildi', red_notu: not.trim().slice(0, 500) || null }, 'Şarkı reddedildi; sanatçı notu görecek.');
      }
      else if (b.dataset.radyoya) radyoyaEkle(b.dataset.radyoya);
      else if (b.dataset.sanatciOnay) { if (confirm('Sanatçı onaylansın mı? Profili Sanatçılar sayfasında görünür ve şarkı yükleyebilir.')) guncelle('sanatcilar', b.dataset.sanatciOnay, { durum: 'onaylandi' }, 'Sanatçı onaylandı.'); }
      else if (b.dataset.sanatciRed) {
        const not = prompt('Red gerekçesi (sanatçı görür):', '');
        if (not != null) guncelle('sanatcilar', b.dataset.sanatciRed, { durum: 'reddedildi', red_notu: not.trim().slice(0, 500) || null }, 'Başvuru reddedildi.');
      }
      else if (b.dataset.sanatciAskiya) { if (confirm('Sanatçı askıya alınsın mı? Profili gizlenir, yeni şarkı yükleyemez. Yayındaki şarkıları satışta kalır.')) guncelle('sanatcilar', b.dataset.sanatciAskiya, { durum: 'askida' }, 'Sanatçı askıya alındı.'); }
      else if (b.dataset.yayin) { const p = v.parcalar.find(x => x.id === b.dataset.yayin); guncelle('muzik_parcalari', p.id, { durum: p.durum === 'yayinda' ? 'taslak' : 'yayinda' }, p.durum === 'yayinda' ? 'Taslağa alındı.' : 'Yayına alındı.'); }
      else if (b.dataset.parcaSil) parcaSil(b.dataset.parcaSil);
      else if (b.dataset.versiyonAc) { v.versiyonFormu = b.dataset.versiyonAc; ciz(); }
      else if (b.hasAttribute('data-versiyon-kapat')) { v.versiyonFormu = null; ciz(); }
      else if (b.dataset.odendi) { if (confirm('Ödeme hesabına geçti mi? Onaylarsan müşterinin dosyaları açılır.')) guncelle('muzik_lisans_satislari', b.dataset.odendi, { durum: 'odendi' }, 'Ödendi; müşterinin dosyaları açıldı.'); }
      else if (b.dataset.satisSil) { if (confirm('Bu satış kaydı silinsin mi?')) { const err = await tekSatir(istemci().from('muzik_lisans_satislari').delete().eq('id', b.dataset.satisSil).select('id')); yaz('#my-durum', err ? 'Silinemedi: ' + err.message : 'Satış kaydı silindi.', !!err); yukle(); } }
      else if (b.dataset.dekontGor) { try { window.open(await R2.korumaliAdres('project-audio', b.dataset.dekontGor), '_blank', 'noopener'); } catch (e) { yaz('#my-durum', 'Dekont açılamadı.', true); } }
    });
  }

  async function baslat() {
    const a0 = window.DerinAuth; if (!a0) return;
    await a0.ready;
    const a = window.DerinAuth;
    if (!a.configured) { yaz('#my-durum', 'Hesap sistemi hazırlanıyor.', true); return; }
    if (!a.user) { $('#my-kilit').hidden = false; $('#my-giris').onclick = () => a.open(); return; }
    if (!a.profile || a.profile.role !== 'admin') { yaz('#my-durum', 'Bu ekran yalnız yöneticiye açık.', true); return; }
    $('#my-uygulama').hidden = false;
    bagla();
    await yukle();
  }
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', baslat) : baslat();
})();
