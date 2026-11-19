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
  const v = { parcalar: [], versiyonlar: [], dosyalar: [], turler: [], satislar: [], adlar: {}, versiyonFormu: null };

  async function tekSatir(sorgu) {
    const { data, error } = await sorgu;
    if (error) return error;
    return (data && data.length) ? null : { message: 'Kayıt bulunamadı ya da yetki yok.' };
  }
  const yaz = (id, m, h) => { const el = $(id); if (el) { el.textContent = m || ''; el.classList.toggle('hata', !!h); } };
  const fiyatYaz = n => (SA && SA.tutarGoster(n)) || '—';
  const sureYaz = sn => { const s = Math.round(Number(sn) || 0); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
  const guvenliAd = ad => String(ad || 'parca').normalize('NFKD').replace(/[^\w.-]+/g, '-').replace(/-+/g, '-').slice(0, 80) || 'parca';
  const rastgele = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  const liste = s => String(s || '').split(',').map(x => x.trim()).filter(Boolean).slice(0, 12);

  // Süre + DAW (Ableton) tarzı ayrıntılı dalga formu: 800 dilimde gerçek tepe
  // değerleri — her dilim için üst (en büyük pozitif) ve alt (en büyük negatif)
  // tepe, 0–100 ölçeğinde, sırayla [üst0, alt0, üst1, alt1, …] (1600 sayı).
  // Çizim (muzik.js) bunları ekran genişliğinde dolu bir şekil olarak çizer.
  const DALGA_N = 800;
  async function cozumle(dosya) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return { sure: null, dalga: null };
    const ctx = new Ctx();
    try {
      const b = await ctx.decodeAudioData(await dosya.arrayBuffer());
      const kanallar = [];
      for (let k = 0; k < Math.min(2, b.numberOfChannels); k++) kanallar.push(b.getChannelData(k));
      const uzun = kanallar[0].length, adim = Math.max(1, Math.floor(uzun / DALGA_N));
      const atla = Math.max(1, Math.floor(adim / 600));
      const ust = [], alt = [];
      let en = 1e-9;
      for (let i = 0; i < DALGA_N; i++) {
        let mx = 0, mn = 0;
        const bas = i * adim, son = Math.min(uzun, bas + adim);
        for (let j = bas; j < son; j += atla) {
          for (const ch of kanallar) { const x = ch[j]; if (x > mx) mx = x; if (x < mn) mn = x; }
        }
        ust.push(mx); alt.push(-mn);
        en = Math.max(en, mx, -mn);
      }
      const dalga = [];
      for (let i = 0; i < DALGA_N; i++) dalga.push(Math.round(ust[i] / en * 100), Math.round(alt[i] / en * 100));
      return { sure: Math.round(b.duration * 100) / 100, dalga };
    } catch (e) { return { sure: null, dalga: null }; }
    finally { try { ctx.close(); } catch (e) {} }
  }

  async function sesYukle(parcaId, dosya, ad, versiyonId, durumId, on) {
    const c = istemci();
    const kok = parcaId + '/' + rastgele();
    const uz = (dosya.name.match(SES) || ['.wav'])[0].toLowerCase();
    yaz(durumId, on + 'dosya okunuyor…');
    const analiz = await cozumle(dosya);
    yaz(durumId, on + 'orijinal dosya yükleniyor…');
    const w = await R2.yukle('muzik-audio', kok + '-' + guvenliAd(ad) + uz, dosya, dosya.type || 'audio/wav');
    if (w.error) throw new Error('dosya yüklenemedi (' + w.error.message + ')');
    const kayit = await c.from('muzik_dosyalari').insert({ parca_id: parcaId, versiyon_id: versiyonId || null, dosya_path: 'muzik/' + kok + '-' + guvenliAd(ad) + uz, dosya_adi: guvenliAd(ad) + uz });
    if (kayit.error) throw new Error('dosya kaydı yazılamadı (' + kayit.error.message + ')');
    yaz(durumId, on + 'MP3 önizleme hazırlanıyor…');
    const mp3 = await window.DerinSesDonustur.cevir(dosya, dosya.name, 'mp3', y => yaz(durumId, on + 'MP3 önizleme hazırlanıyor… %' + Math.round(y || 0)));
    const m = await R2.yukle('muzik-onizleme', kok + '.mp3', mp3, 'audio/mpeg');
    if (m.error) throw new Error('önizleme yüklenemedi (' + m.error.message + ')');
    return { onizleme_path: kok + '.mp3', sure_sn: analiz.sure, dalga: analiz.dalga };
  }

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
      const form = v.versiyonFormu === p.id ? `<tr><td colspan="4"><form class="se-form" data-versiyon-form="${p.id}" style="padding:10px 0">
          <div class="se-yan-yana"><label>Tür<select name="tur"><option value="alternatif">Alternatif versiyon</option><option value="stem">Stem</option></select></label>
          <label>Dosyalar<input type="file" name="dosya" accept=".wav,.aif,.aiff,.flac,.mp3,audio/*" multiple></label></div>
          <small style="color:#a8a5a0">Her dosya ayrı versiyon olur; adı dosya adından gelir (ör. "Instrumental [Chorus]").</small>
          <div style="display:flex;gap:8px"><button type="submit" class="se-dugme">Versiyonları ekle</button><button type="button" class="se-dugme ikincil" data-versiyon-kapat>Vazgeç</button></div>
          <p class="se-durum" id="my-v-durum" role="status" aria-live="polite"></p></form></td></tr>` : '';
      return `<tr>
        <td><div style="display:flex;gap:12px;align-items:center">${p.kapak_path ? `<img src="${kacis(R2.adres('muzik-onizleme', p.kapak_path))}" alt="" style="width:44px;height:44px;border-radius:6px;object-fit:cover">` : ''}
          <span><b>${kacis(p.ad)}</b><br><small style="color:#a8a5a0">${kacis(p.sanatci)}${p.tur ? ' · ' + kacis(p.tur) : ''}${p.sure_sn ? ' · ' + sureYaz(p.sure_sn) : ''}</small></span></div></td>
        <td>${surum.filter(x => x.tur === 'alternatif').length} alternatif · ${surum.filter(x => x.tur === 'stem').length} stem
          ${surum.length ? `<br><small style="color:#a8a5a0">${surum.map(x => kacis(x.ad)).join(', ')}</small>` : ''}</td>
        <td><span class="se-rozet ${yayinda ? 'odendi' : ''}">${eksik ? 'Dosya eksik' : yayinda ? 'Yayında' : 'Taslak'}</span></td>
        <td><div class="islem">
          <button type="button" class="se-dugme ikincil" data-versiyon-ac="${p.id}">Versiyon / stem ekle</button>
          <button type="button" class="se-dugme ${yayinda ? 'ikincil' : ''}" data-yayin="${p.id}" ${eksik && !yayinda ? 'disabled' : ''}>${yayinda ? 'Taslağa al' : 'Yayınla'}</button>
          <button type="button" class="se-dugme ikincil" data-parca-sil="${p.id}">Sil</button></div></td></tr>${form}`;
    }).join('') : '<tr><td colspan="4" style="color:#a8a5a0">Henüz şarkı yok. Yukarıdan ilk şarkını ekle.</td></tr>';

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
    document.addEventListener('submit', ev => {
      const t = ev.target;
      if (t.dataset.turForm) {
        ev.preventDefault();
        const m = t.fiyat.value.trim(), n = m ? SA.tutarCoz(m) : null;
        if (m && !n) { yaz('#my-tur-durum', 'Fiyat anlaşılmadı. Örnek: 1500 ya da 1.499,90', true); return; }
        tekSatir(istemci().from('muzik_lisans_turleri').update({ ad: t.ad.value.trim() || t.dataset.turForm, aciklama: t.aciklama.value.trim() || null, fiyat: n }).eq('id', t.dataset.turForm).select('id'))
          .then(err => { yaz('#my-tur-durum', err ? 'Kaydedilemedi: ' + err.message : 'Lisans kaydedildi.', !!err); if (!err) yukle(); });
      } else if (t.dataset.versiyonForm) versiyonEkle(ev, t.dataset.versiyonForm);
    });
    document.addEventListener('click', async ev => {
      const b = ev.target.closest('button'); if (!b) return;
      if (b.dataset.yayin) { const p = v.parcalar.find(x => x.id === b.dataset.yayin); guncelle('muzik_parcalari', p.id, { durum: p.durum === 'yayinda' ? 'taslak' : 'yayinda' }, p.durum === 'yayinda' ? 'Taslağa alındı.' : 'Yayına alındı.'); }
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
