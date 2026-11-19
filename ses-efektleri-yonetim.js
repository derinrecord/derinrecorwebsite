// Derin Record — Ses Efektleri yönetimi (19 Kasım 2026, yalnız yönetici)
//
// Derin efekt ekler, fiyatlar, paketler ve satışları onaylar.
// Yükleme: WAV seçilir → tarayıcı süreyi okur ve MP3 önizlemeyi üretir
// (ses-donustur.js, filigransız) → WAV gizli efekt/ klasörüne, MP3 herkese açık
// efekt-onizleme/ klasörüne gider (R2). Satır önce taslak olarak açılır,
// dosyalar yüklenince yolları yazılır; yarıda kalırsa taslak olarak kalır.
// Satış onayı: "ödendi" yalnız yönetici yazabilir (supabase/ses-efektleri.sql).
(() => {
  'use strict';

  const SA = window.DerinSatinAlma;
  const R2 = window.DerinR2;
  const $ = (s, k) => (k || document).querySelector(s);
  const kacis = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const istemci = () => window.DerinAuth && window.DerinAuth.client;
  // Tek satırlık yazmalar: etkilenen satır geri istenir; 0 satır = izin yok/silinmiş (sessiz yazma olmasın).
  async function tekSatir(sorgu) {
    const { data, error } = await sorgu;
    if (error) return error;
    return (data && data.length) ? null : { message: 'Kayıt bulunamadı ya da yetki yok.' };
  }

  const veri = { efektler: [], dosyalar: {}, paketler: [], satislar: [], adlar: {} };
  const SES_UZANTI = /\.(wav|aiff?|flac|mp3)$/i;

  function durumYaz(id, metin, hata) {
    const el = $(id); if (!el) return;
    el.textContent = metin || ''; el.classList.toggle('hata', !!hata);
  }
  const fiyatYaz = n => (SA && SA.tutarGoster(n)) || '—';
  const sureYaz = sn => { const s = Math.round(Number(sn) || 0); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
  const guvenliAd = ad => String(ad || 'efekt').normalize('NFKD').replace(/[^\w.-]+/g, '-').replace(/-+/g, '-').slice(0, 80) || 'efekt';
  const rastgele = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

  // ---------- Okuma ----------
  async function yukle() {
    const c = istemci();
    const [ef, df, pk, sa] = await Promise.all([
      c.from('ses_efektleri').select('*').order('created_at', { ascending: false }),
      c.from('ses_efekt_dosyalari').select('*'),
      c.from('ses_efekt_paketleri').select('*').order('sira'),
      c.from('ses_efekt_satislari').select('*').order('istendi_at', { ascending: false })
    ]);
    if (ef.error) { durumYaz('#sy-durum', 'Tablolar okunamadı: ' + ef.error.message, true); return; }
    veri.efektler = ef.data || [];
    veri.dosyalar = {}; (df.data || []).forEach(d => { veri.dosyalar[d.efekt_id] = d; });
    veri.paketler = pk.data || [];
    veri.satislar = sa.data || [];
    const kimler = [...new Set(veri.satislar.map(s => s.kullanici_id))];
    if (kimler.length) {
      const pr = await c.from('profiles').select('id,full_name').in('id', kimler);
      (pr.data || []).forEach(p => { veri.adlar[p.id] = p.full_name; });
    }
    ciz();
  }

  // ---------- Çizim ----------
  function paketSecenekleri(secili) {
    return '<option value="">Paket yok</option>' + veri.paketler.map(p =>
      `<option value="${p.id}" ${p.id === secili ? 'selected' : ''}>${kacis(p.ad)}</option>`).join('');
  }

  function ciz() {
    $('#sy-paket').innerHTML = paketSecenekleri('');
    const kategoriler = [...new Set(veri.efektler.map(e => e.kategori).filter(Boolean))];
    $('#sy-kategoriler').innerHTML = kategoriler.map(k => `<option value="${kacis(k)}">`).join('');

    $('#sy-efektler').innerHTML = veri.efektler.length ? veri.efektler.map(e => {
      const dosya = veri.dosyalar[e.id];
      const eksik = !dosya || !e.onizleme_path;
      const yayinda = e.durum === 'yayinda';
      return `<tr>
        <td><b>${kacis(e.ad)}</b><br><small style="color:#a8a5a0">${kacis([e.kategori].concat(e.etiketler || []).filter(Boolean).join(', '))}${e.sure_sn ? ' · ' + sureYaz(e.sure_sn) : ''}</small></td>
        <td style="white-space:nowrap"><input type="text" inputmode="decimal" value="${e.fiyat ? kacis(String(e.fiyat).replace('.', ',')) : ''}" placeholder="Fiyat" aria-label="${kacis(e.ad)} fiyatı" data-fiyat="${e.id}" style="width:96px;min-height:36px;padding:6px 10px;border-radius:6px;border:1px solid #34333a;background:#0b0b0d;color:#f4f1e9"> ₺</td>
        <td><select aria-label="${kacis(e.ad)} paketi" data-efekt-paket="${e.id}" style="min-height:36px;border-radius:6px;border:1px solid #34333a;background:#0b0b0d;color:#f4f1e9">${paketSecenekleri(e.paket_id)}</select></td>
        <td><span class="se-rozet ${yayinda ? 'odendi' : ''}">${eksik ? 'Dosya eksik' : yayinda ? 'Yayında' : 'Taslak'}</span></td>
        <td><div class="islem">
          ${e.onizleme_path ? `<button type="button" class="se-dugme ikincil" data-dinle="${e.id}">Dinle</button>` : ''}
          <button type="button" class="se-dugme ${yayinda ? 'ikincil' : ''}" data-yayin="${e.id}" ${eksik && !yayinda ? 'disabled' : ''}>${yayinda ? 'Taslağa al' : 'Yayınla'}</button>
          <button type="button" class="se-dugme ikincil" data-efekt-sil="${e.id}">Sil</button>
        </div></td></tr>`;
    }).join('') : '<tr><td colspan="5" style="color:#a8a5a0">Henüz efekt yok. Soldan ilk efektini ekle.</td></tr>';

    $('#sy-paketler').innerHTML = veri.paketler.length ? veri.paketler.map(p => {
      const adet = veri.efektler.filter(e => e.paket_id === p.id).length;
      const yayinda = p.durum === 'yayinda';
      return `<tr><td><b>${kacis(p.ad)}</b><br><small style="color:#a8a5a0">${adet} efekt</small></td><td>${kacis(fiyatYaz(p.fiyat))}</td>
        <td><span class="se-rozet ${yayinda ? 'odendi' : ''}">${yayinda ? 'Yayında' : 'Taslak'}</span></td>
        <td><div class="islem"><button type="button" class="se-dugme ${yayinda ? 'ikincil' : ''}" data-paket-yayin="${p.id}">${yayinda ? 'Taslağa al' : 'Yayınla'}</button>
        <button type="button" class="se-dugme ikincil" data-paket-sil="${p.id}">Sil</button></div></td></tr>`;
    }).join('') : '<tr><td colspan="4" style="color:#a8a5a0">Paket yok.</td></tr>';

    const urun = s => {
      if (s.efekt_id) { const e = veri.efektler.find(x => x.id === s.efekt_id); return e ? e.ad : 'Silinmiş efekt'; }
      const p = veri.paketler.find(x => x.id === s.paket_id); return p ? p.ad + ' (paket)' : 'Silinmiş paket';
    };
    const tarih = t => t ? new Date(t).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' }) : '';
    $('#sy-satislar').innerHTML = veri.satislar.length ? veri.satislar.map(s => `
      <tr><td><b>${kacis(veri.adlar[s.kullanici_id] || 'Müşteri')}</b><br><small style="color:#a8a5a0">${tarih(s.istendi_at)}</small></td>
        <td>${kacis(urun(s))}</td><td>${kacis(fiyatYaz(s.tutar))}</td>
        <td><span class="se-rozet ${s.durum}">${s.durum === 'odendi' ? 'Ödendi' : s.durum === 'dekont' ? 'Dekont geldi' : 'Ödeme bekleniyor'}</span></td>
        <td><div class="islem">
          ${s.dekont_path ? `<button type="button" class="se-dugme ikincil" data-dekont-gor="${kacis(s.dekont_path)}">Dekontu gör</button>` : ''}
          ${s.durum !== 'odendi' ? `<button type="button" class="se-dugme yesil" data-odendi="${s.id}">Ödeme alındı · İndirmeyi aç</button>` : ''}
          <button type="button" class="se-dugme ikincil" data-satis-sil="${s.id}">Sil</button>
        </div></td></tr>`).join('') : '<tr><td colspan="5" style="color:#a8a5a0">Henüz satış yok.</td></tr>';
  }

  // ---------- Efekt ekleme ----------
  async function sureOku(dosya) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    const ctx = new Ctx();
    try { const s = await ctx.decodeAudioData(await dosya.arrayBuffer()); return Math.round(s.duration * 100) / 100; }
    catch (e) { return null; }
    finally { try { ctx.close(); } catch (e) {} }
  }

  async function efektEkle(dosya, ortak, sira, toplam) {
    const c = istemci();
    const on = `(${sira}/${toplam}) ${dosya.name}: `;
    const ad = (toplam === 1 && ortak.ad) ? ortak.ad : dosya.name.replace(SES_UZANTI, '').replace(/[_-]+/g, ' ').trim();
    durumYaz('#sy-ekle-durum', on + 'süre okunuyor…');
    const sure = await sureOku(dosya);
    const { data: satir, error } = await c.from('ses_efektleri').insert({
      ad: ad.slice(0, 120), kategori: ortak.kategori || null, etiketler: ortak.etiketler,
      fiyat: ortak.fiyat, paket_id: ortak.paket_id || null, sure_sn: sure, durum: 'taslak'
    }).select('id').single();
    if (error) throw new Error('kayıt açılamadı (' + error.message + ')');

    const kok = satir.id + '/' + rastgele();
    const uzanti = (dosya.name.match(SES_UZANTI) || ['.wav'])[0].toLowerCase();
    const wavYol = kok + '-' + guvenliAd(ad) + uzanti;
    durumYaz('#sy-ekle-durum', on + 'orijinal dosya yükleniyor…');
    const w = await R2.yukle('efekt-audio', wavYol, dosya, dosya.type || 'audio/wav');
    if (w.error) throw new Error('dosya yüklenemedi (' + w.error.message + ')');
    const d = await c.from('ses_efekt_dosyalari').upsert({ efekt_id: satir.id, dosya_path: 'efekt/' + wavYol, dosya_adi: guvenliAd(ad) + uzanti });
    if (d.error) throw new Error('dosya kaydı yazılamadı (' + d.error.message + ')');

    durumYaz('#sy-ekle-durum', on + 'MP3 önizleme hazırlanıyor…');
    const mp3 = await window.DerinSesDonustur.cevir(dosya, dosya.name, 'mp3', y =>
      durumYaz('#sy-ekle-durum', on + 'MP3 önizleme hazırlanıyor… %' + Math.round(y || 0)));
    const mp3Yol = kok + '.mp3';
    const m = await R2.yukle('efekt-onizleme', mp3Yol, mp3, 'audio/mpeg');
    if (m.error) throw new Error('önizleme yüklenemedi (' + m.error.message + ')');
    const g = await tekSatir(c.from('ses_efektleri').update({
      onizleme_path: mp3Yol, durum: ortak.yayinla ? 'yayinda' : 'taslak'
    }).eq('id', satir.id).select('id'));
    if (g) throw new Error('önizleme kaydı yazılamadı (' + g.message + ')');
  }

  async function ekleGonder(ev) {
    ev.preventDefault();
    const dosyalar = [...($('#sy-dosya').files || [])].filter(f => SES_UZANTI.test(f.name));
    if (!dosyalar.length) { durumYaz('#sy-ekle-durum', 'Önce bir ses dosyası seç (WAV önerilir).', true); return; }
    const fiyatMetni = $('#sy-fiyat').value.trim();
    const fiyat = fiyatMetni ? SA.tutarCoz(fiyatMetni) : null;
    if (fiyatMetni && !fiyat) { durumYaz('#sy-ekle-durum', 'Fiyat anlaşılmadı. Örnek: 150 ya da 149,90', true); return; }
    const ortak = {
      ad: $('#sy-ad').value.trim(),
      kategori: $('#sy-kategori').value.trim().slice(0, 40),
      etiketler: $('#sy-etiket').value.split(',').map(x => x.trim()).filter(Boolean).slice(0, 12),
      fiyat, paket_id: $('#sy-paket').value || null,
      yayinla: $('#sy-yayinla').checked
    };
    const dugme = $('#sy-ekle-dugme'); dugme.disabled = true;
    let tamam = 0; const hatalar = [];
    for (let i = 0; i < dosyalar.length; i++) {
      try { await efektEkle(dosyalar[i], ortak, i + 1, dosyalar.length); tamam++; }
      catch (e) { hatalar.push(dosyalar[i].name + ': ' + ((e && e.message) || 'hata')); }
    }
    dugme.disabled = false;
    durumYaz('#sy-ekle-durum', hatalar.length
      ? `${tamam} efekt eklendi. Eklenemeyenler (taslak olarak kalabilir): ${hatalar.join(' · ')}`
      : `${tamam} efekt eklendi${ortak.yayinla ? ' ve yayına alındı' : ' (taslak)'}.`, hatalar.length > 0);
    if (!hatalar.length) { $('#sy-form').reset(); $('#sy-secilen').textContent = ''; }
    await yukle();
  }

  // ---------- Diğer işlemler ----------
  async function guncelle(tablo, id, alanlar, mesaj) {
    const error = await tekSatir(istemci().from(tablo).update(alanlar).eq('id', id).select('id'));
    if (error) { durumYaz('#sy-durum', 'Kaydedilemedi: ' + error.message, true); return false; }
    durumYaz('#sy-durum', mesaj || 'Kaydedildi.');
    await yukle(); return true;
  }

  async function efektSil(id) {
    const e = veri.efektler.find(x => x.id === id); if (!e) return;
    if (!confirm(`"${e.ad}" silinsin mi? Dosyaları da silinir.`)) return;
    const d = veri.dosyalar[id];
    const error = await tekSatir(istemci().from('ses_efektleri').delete().eq('id', id).select('id'));
    if (error) { durumYaz('#sy-durum', 'Silinemedi: ' + error.message, true); return; }
    if (d) await R2.sil('efekt-audio', d.dosya_path.replace(/^efekt\//, ''));
    if (e.onizleme_path) await R2.sil('efekt-onizleme', e.onizleme_path);
    durumYaz('#sy-durum', 'Efekt silindi.');
    await yukle();
  }

  async function paketEkle(ev) {
    ev.preventDefault();
    const ad = $('#sp-ad').value.trim();
    if (!ad) { durumYaz('#sp-durum', 'Paket adı yaz.', true); return; }
    const fm = $('#sp-fiyat').value.trim();
    const fiyat = fm ? SA.tutarCoz(fm) : null;
    if (fm && !fiyat) { durumYaz('#sp-durum', 'Fiyat anlaşılmadı.', true); return; }
    const { error } = await istemci().from('ses_efekt_paketleri').insert({ ad: ad.slice(0, 120), aciklama: $('#sp-aciklama').value.trim().slice(0, 600) || null, fiyat });
    if (error) { durumYaz('#sp-durum', 'Paket eklenemedi: ' + error.message, true); return; }
    $('#sp-form').reset(); durumYaz('#sp-durum', 'Paket eklendi (taslak). Efektleri listeden bu pakete ata, sonra yayınla.');
    await yukle();
  }

  let dinleyici = null;
  function dinle(id) {
    const e = veri.efektler.find(x => x.id === id); if (!e || !e.onizleme_path) return;
    if (dinleyici) dinleyici.pause();
    dinleyici = new Audio(R2.adres('efekt-onizleme', e.onizleme_path));
    dinleyici.play().catch(() => durumYaz('#sy-durum', 'Önizleme çalınamadı.', true));
  }

  function bagla() {
    $('#sy-form').addEventListener('submit', ekleGonder);
    $('#sp-form').addEventListener('submit', paketEkle);
    const birak = $('#sy-birak'), girdi = $('#sy-dosya');
    const secilenYaz = () => { const n = girdi.files ? girdi.files.length : 0; $('#sy-secilen').textContent = n ? n + ' dosya seçildi: ' + [...girdi.files].map(f => f.name).join(', ') : ''; };
    girdi.addEventListener('change', secilenYaz);
    ['dragenter', 'dragover'].forEach(t => birak.addEventListener(t, e => { e.preventDefault(); birak.classList.add('ustunde'); }));
    ['dragleave', 'drop'].forEach(t => birak.addEventListener(t, e => { e.preventDefault(); birak.classList.remove('ustunde'); }));
    birak.addEventListener('drop', e => { if (e.dataTransfer && e.dataTransfer.files.length) { girdi.files = e.dataTransfer.files; secilenYaz(); } });

    document.addEventListener('click', async ev => {
      const t = ev.target.closest('button'); if (!t) return;
      if (t.dataset.yayin) { const e = veri.efektler.find(x => x.id === t.dataset.yayin); guncelle('ses_efektleri', e.id, { durum: e.durum === 'yayinda' ? 'taslak' : 'yayinda' }, e.durum === 'yayinda' ? 'Taslağa alındı.' : 'Yayına alındı.'); }
      else if (t.dataset.efektSil) efektSil(t.dataset.efektSil);
      else if (t.dataset.dinle) dinle(t.dataset.dinle);
      else if (t.dataset.paketYayin) { const p = veri.paketler.find(x => x.id === t.dataset.paketYayin); guncelle('ses_efekt_paketleri', p.id, { durum: p.durum === 'yayinda' ? 'taslak' : 'yayinda' }); }
      else if (t.dataset.paketSil) { if (confirm('Paket silinsin mi? İçindeki efektler silinmez, paketsiz kalır.')) { const error = await tekSatir(istemci().from('ses_efekt_paketleri').delete().eq('id', t.dataset.paketSil).select('id')); durumYaz('#sy-durum', error ? 'Silinemedi: ' + error.message : 'Paket silindi.', !!error); yukle(); } }
      else if (t.dataset.odendi) { if (confirm('Ödeme hesabına geçti mi? Onaylarsan müşterinin indirmesi açılır.')) guncelle('ses_efekt_satislari', t.dataset.odendi, { durum: 'odendi' }, 'Ödendi olarak işaretlendi; müşterinin indirmesi açıldı.'); }
      else if (t.dataset.satisSil) { if (confirm('Bu satış kaydı silinsin mi?')) { const error = await tekSatir(istemci().from('ses_efekt_satislari').delete().eq('id', t.dataset.satisSil).select('id')); durumYaz('#sy-durum', error ? 'Silinemedi: ' + error.message : 'Satış kaydı silindi.', !!error); yukle(); } }
      else if (t.dataset.dekontGor) { try { const u = await R2.korumaliAdres('project-audio', t.dataset.dekontGor); window.open(u, '_blank', 'noopener'); } catch (e) { durumYaz('#sy-durum', 'Dekont açılamadı.', true); } }
    });
    document.addEventListener('change', ev => {
      const f = ev.target.closest('[data-fiyat]');
      if (f) {
        const m = f.value.trim(); const n = m ? SA.tutarCoz(m) : null;
        if (m && !n) { durumYaz('#sy-durum', 'Fiyat anlaşılmadı. Örnek: 150 ya da 149,90', true); return; }
        guncelle('ses_efektleri', f.dataset.fiyat, { fiyat: n }, 'Fiyat kaydedildi.');
      }
      const p = ev.target.closest('[data-efekt-paket]');
      if (p) guncelle('ses_efektleri', p.dataset.efektPaket, { paket_id: p.value || null }, 'Paket güncellendi.');
    });
  }

  async function baslat() {
    const auth = window.DerinAuth;
    if (!auth) return;
    await auth.ready;
    const a = window.DerinAuth;
    if (!a.configured) { durumYaz('#sy-durum', 'Hesap sistemi hazırlanıyor.', true); return; }
    if (!a.user) {
      $('#sy-kilit').hidden = false;
      $('#sy-giris').onclick = () => a.open();
      return;
    }
    if (!a.profile || a.profile.role !== 'admin') { durumYaz('#sy-durum', 'Bu ekran yalnız yöneticiye açık.', true); return; }
    $('#sy-uygulama').hidden = false;
    bagla();
    await yukle();
  }

  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', baslat) : baslat();
})();
