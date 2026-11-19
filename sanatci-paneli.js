// Derin Record — Sanatçı paneli (20 Kasım 2026, 2. aşama)
//
// Tek sayfa, hesabın durumuna göre:
//   giriş yok        → nasıl çalışır + giriş düğmesi
//   başvuru yok      → başvuru formu (sözleşme özeti + onay kutusu)
//   başvurdu/red/askı→ durum kartı; red ise düzeltip tekrar başvurma
//   onaylı           → Şarkılarım (yükleme + Ek-1 + radyo izni), Profil, Kazançlarım
// Kurallar sunucuda (supabase/sanatcilar.sql): sanatçı şarkıyı yalnız taslak
// ya da "onaya gönder" yapabilir; yayına alma Derin'in. Yayındaki şarkıda
// yalnız radyo izni değişir.
(() => {
  'use strict';

  const SA = window.DerinSatinAlma;
  const R2 = window.DerinR2;
  const MY = window.DerinMuzikYukle;
  const $ = (s, k) => (k || document).querySelector(s);
  const kacis = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const SOZLESME = '2026-11-taslak';
  const istemci = () => window.DerinAuth && window.DerinAuth.client;
  const v = {
    sanatci: null, ozel: {}, parcalar: [], versiyonlar: [], beyanlar: {}, satislar: [], havuz: null,
    sekme: 'sarkilar', duzenle: null, versiyonFormu: null, ay: '', kirpik: {}, asil: {}
  };
  const yaz = (id, m, h) => { const el = $(id); if (el) { el.textContent = m || ''; el.classList.toggle('hata', !!h); } };
  const fiyatYaz = n => (SA && SA.tutarGoster(n)) || '—';
  const sureYaz = sn => { const s = Math.round(Number(sn) || 0); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
  const liste = (s, n) => String(s || '').split(',').map(x => x.trim()).filter(Boolean).slice(0, n || 12);
  const bos = s => { const x = String(s || '').trim(); return x || null; };
  const HATA = {
    SanatciDegil: 'Bu işlem için onaylı sanatçı hesabı gerekiyor.',
    YayindakiParcaDegismez: 'Yayındaki şarkı değiştirilemez. Değişiklik için Derin ile iletişime geç.',
    Ek1Eksik: 'Onaya göndermeden önce Ek-1 formunu doldurup onay cümlesini işaretle.',
    DosyaEksik: 'Önce şarkının ses dosyasını yükle.',
    SozlesmeOnayiGerekli: 'Başvuru için sözleşme özetini onaylaman gerekiyor.'
  };
  const hataMetni = e => { const m = String((e && e.message) || e || 'hata'); const k = Object.keys(HATA).find(x => m.includes(x)); return k ? HATA[k] : m; };
  async function tekSatir(sorgu) {
    const { data, error } = await sorgu;
    if (error) return error;
    return (data && data.length) ? null : { message: 'Kayıt bulunamadı ya da yetki yok.' };
  }

  // ---------- Veri ----------
  async function yukle() {
    const a = window.DerinAuth, c = istemci();
    const sn = await c.from('sanatcilar').select('*').eq('kullanici_id', a.user.id).maybeSingle();
    if (sn.error) { yaz('#sp-durum', 'Sanatçı bilgileri okunamadı: ' + sn.error.message, true); return; }
    v.sanatci = sn.data || null;
    v.ozel = {};
    if (v.sanatci) {
      const oz = await c.from('sanatci_ozel').select('*').eq('sanatci_id', v.sanatci.id).maybeSingle();
      v.ozel = (!oz.error && oz.data) || {};
    }
    if (v.sanatci && v.sanatci.durum === 'onaylandi') {
      const [p, ve, be, sa] = await Promise.all([
        c.from('muzik_parcalari').select('*').eq('sanatci_id', v.sanatci.id).order('created_at', { ascending: false }),
        c.from('muzik_versiyonlari').select('id,parca_id,tur,ad,sira'),
        c.from('muzik_parca_beyan').select('*'),
        c.rpc('sanatci_satislari')
      ]);
      v.parcalar = p.data || [];
      const benim = new Set(v.parcalar.map(x => x.id));
      v.versiyonlar = (ve.data || []).filter(x => benim.has(x.parca_id));
      v.beyanlar = {}; (be.data || []).forEach(x => { v.beyanlar[x.parca_id] = x; });
      v.satislar = sa.error ? [] : (sa.data || []);
      await havuzYukle();
    }
    ciz();
  }
  const buAy = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); };
  async function havuzYukle() {
    if (!v.ay) v.ay = buAy();
    const r = await istemci().rpc('radyo_havuz_ozeti', { p_ay: v.ay + '-01' });
    v.havuz = (!r.error && r.data && r.data[0]) || null;
  }

  // ---------- Çizim ----------
  function profilAlanlari(s, o) {
    s = s || {}; o = o || {};
    const fotoAdres = s.foto_path ? R2.adres('muzik-onizleme', s.foto_path) : '';
    return `
      <div class="sn-foto-sec">${fotoAdres ? `<img src="${kacis(fotoAdres)}" alt="">` : '<span class="sn-yok"></span>'}
        <label style="flex:1">Profil fotoğrafı — seçince yerini ve yakınlığını ayarlarsın<input type="file" name="foto" accept="image/jpeg,image/png,image/webp"></label>
        <button type="button" class="se-dugme ikincil" data-ayarla="foto" hidden>Yeniden ayarla</button></div>
      <div class="se-yan-yana">
        <label>Sanatçı adı *<input name="ad" maxlength="80" required value="${kacis(s.ad || '')}" placeholder="Sahnede kullandığın ad"></label>
        <label>Şehir<input name="sehir" maxlength="60" value="${kacis(s.sehir || '')}" placeholder="Örn. İzmir"></label>
      </div>
      <label>Türler (virgülle ayır, en fazla 8)<input name="turler" value="${kacis((s.turler || []).join(', '))}" placeholder="Sinematik, Elektronik, Pop"></label>
      <label>Biyografi<textarea name="biyografi" maxlength="1500" rows="5" placeholder="Kendini ve müziğini birkaç cümleyle anlat">${kacis(s.biyografi || '')}</textarea></label>
      <div class="se-yan-yana">
        <label>Instagram<input name="instagram" maxlength="200" value="${kacis(s.instagram || '')}" placeholder="instagram.com/…"></label>
        <label>Spotify<input name="spotify" maxlength="200" value="${kacis(s.spotify || '')}" placeholder="open.spotify.com/artist/…"></label>
      </div>
      <div class="se-yan-yana">
        <label>YouTube<input name="youtube" maxlength="200" value="${kacis(s.youtube || '')}" placeholder="youtube.com/@…"></label>
        <label>Web sitesi<input name="web" maxlength="200" value="${kacis(s.web || '')}" placeholder="ornek.com"></label>
      </div>
      <h3 style="margin:10px 0 0;font-size:16px">Yalnız Derin'in göreceği bilgiler</h3>
      <div class="se-yan-yana">
        <label>Ad soyad (sözleşme için) *<input name="yasal_ad" maxlength="120" required value="${kacis(o.yasal_ad || '')}"></label>
        <label>E-posta *<input name="eposta" type="email" maxlength="200" required value="${kacis(o.eposta || (window.DerinAuth.user && window.DerinAuth.user.email) || '')}"></label>
      </div>
      <div class="se-yan-yana">
        <label>Telefon<input name="telefon" maxlength="40" inputmode="tel" value="${kacis(o.telefon || '')}" placeholder="05xx xxx xx xx"></label>
        <label>IBAN (ödemeler için, sonra da ekleyebilirsin)<input name="iban" maxlength="40" value="${kacis(o.iban || '')}" placeholder="TR.."></label>
      </div>
      <label>Hesap sahibinin adı<input name="hesap_sahibi" maxlength="120" value="${kacis(o.hesap_sahibi || '')}"></label>`;
  }

  function sozlesmeKutusu() {
    return `<div class="se-uyari-kutu" style="display:flex;flex-direction:column;gap:8px">
        <b>Sözleşme özeti</b>
        <ul class="sn-madde">
          <li>Şarkıların senin kalır; Derin Record'a münhasır olmayan satış ve lisans izni verirsin.</li>
          <li>Her lisans satışının net gelirinin %25'i senin. Radyoya izin verdiğin şarkılar için aylık radyo gelirinin %25'lik havuzundan çalınma oranında pay alırsın.</li>
          <li>Her şarkı için ayrı bir onay (Ek-1) verirsin: besteci, sample, yapay zekâ ve telif birliği bilgileri.</li>
          <li>Derin her şarkıyı dinleyip onaylar ya da gerekçesiyle reddeder. İstediğinde şarkını yeni satışa kapattırabilirsin; önceden satılmış lisanslar geçerli kalır.</li>
        </ul>
        <small style="color:var(--se-soluk)">Başvurun onaylanınca sözleşmenin tam metni imzalaman için e-postana gönderilir. Kişisel verilerin <a href="aydinlatma-metni.html" target="_blank" rel="noopener" style="color:var(--se-sari)">Aydınlatma Metni</a>'ne göre işlenir.</small>
      </div>
      <label class="sn-onay"><input type="checkbox" name="sozlesme" required> <span>Sözleşme özetini okudum ve kabul ediyorum; başvurum onaylanırsa tam sözleşmeyi imzalayacağım.</span></label>`;
  }

  function ciz() {
    v.kirpik = {}; v.asil = {};
    const kok = $('#sp-uygulama');
    const s = v.sanatci;
    if (!s) {
      kok.innerHTML = `<section class="se-kutu"><h2 class="se-bolum" style="margin:0">Sanatçı başvurusu</h2>
        <p class="se-aciklama" style="margin:0">Bilgilerini doldur. Derin başvurunu inceleyip onaylayınca şarkı yükleyebilirsin.</p>
        <form class="se-form" id="sp-basvuru">${profilAlanlari(null, null)}${sozlesmeKutusu()}
          <button type="submit" class="se-dugme" style="align-self:flex-start">Başvuruyu gönder</button>
          <p class="se-durum" id="sp-form-durum" role="status" aria-live="polite"></p></form></section>`;
      return;
    }
    if (s.durum !== 'onaylandi') {
      const baslik = { basvurdu: 'Başvurun inceleniyor', reddedildi: 'Başvurun onaylanmadı', askida: 'Hesabın askıda' }[s.durum];
      const metin = {
        basvurdu: 'Derin başvurunu inceliyor. Onaylanınca bu sayfadan şarkı yükleyebileceksin. Bu arada profilini düzenleyebilirsin.',
        reddedildi: 'Aşağıdaki notu inceleyip bilgilerini düzelt ve tekrar başvur.',
        askida: 'Yeni şarkı yükleme şu an kapalı. Ayrıntı için Derin ile iletişime geç.'
      }[s.durum];
      kok.innerHTML = `<section class="se-kutu"><h2 class="se-bolum" style="margin:0">${baslik}</h2>
        <p style="margin:0;color:var(--se-soluk)">${metin}</p>
        ${s.red_notu ? `<p class="se-uyari-kutu" style="margin:0"><b>Derin'in notu:</b> ${kacis(s.red_notu)}</p>` : ''}
        ${s.durum === 'askida' ? '' : `<form class="se-form" id="sp-profil">${profilAlanlari(s, v.ozel)}${s.durum === 'reddedildi' ? sozlesmeKutusu() : ''}
          <button type="submit" class="se-dugme" style="align-self:flex-start">${s.durum === 'reddedildi' ? 'Tekrar başvur' : 'Bilgileri kaydet'}</button>
          <p class="se-durum" id="sp-form-durum" role="status" aria-live="polite"></p></form>`}</section>`;
      return;
    }
    const sekme = (id, ad) => `<button type="button" role="tab" data-sekme="${id}" aria-selected="${v.sekme === id}">${ad}</button>`;
    kok.innerHTML = `<div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:12px;align-items:center">
        <p style="margin:0">Hoş geldin, <b>${kacis(s.ad)}</b>.</p>
        <a class="se-dugme ikincil" href="sanatcilar.html?s=${encodeURIComponent(s.slug || '')}">Profilimi gör</a></div>
      <div class="sn-sekmeler" role="tablist">${sekme('sarkilar', 'Şarkılarım')}${sekme('kazanc', 'Kazançlarım')}${sekme('profil', 'Profil ve ödeme')}</div>
      <div id="sp-sekme">${v.sekme === 'profil' ? profilSekmesi() : v.sekme === 'kazanc' ? kazancSekmesi() : sarkilarSekmesi()}</div>`;
  }

  function profilSekmesi() {
    return `<section class="se-kutu"><form class="se-form" id="sp-profil">${profilAlanlari(v.sanatci, v.ozel)}
      <button type="submit" class="se-dugme" style="align-self:flex-start">Kaydet</button>
      <p class="se-durum" id="sp-form-durum" role="status" aria-live="polite"></p></form></section>`;
  }

  // ---- Ek-1 formu ----
  function evetHayir(ad, baslik, deger, ipucu) {
    const d = deger || {};
    return `<fieldset><legend>${baslik}</legend><div class="sn-secim">
        <label><input type="radio" name="${ad}" value="hayir" ${!d.var ? 'checked' : ''}> Hayır</label>
        <label><input type="radio" name="${ad}" value="evet" ${d.var ? 'checked' : ''}> Evet</label></div>
        <input name="${ad}_not" maxlength="300" value="${kacis(d.not || '')}" placeholder="${kacis(ipucu)}"></fieldset>`;
  }
  function ek1Alanlari(b) {
    const e = (b && b.ek1) || {};
    return `<div class="sn-ek1 se-form" style="gap:12px">
      <h3 style="margin:6px 0 0;font-size:16px">Ek-1 — Eser onay formu</h3>
      <label>Besteci / söz yazarı / düzenleyen *<input name="besteci" maxlength="300" value="${kacis(e.besteci || '')}" placeholder="Örn. Beste ve düzenleme: ben; söz: Ayşe Kaya"></label>
      <label>Kayda katılan diğer müzisyenler ve onayları<input name="muzisyenler" maxlength="300" value="${kacis(e.muzisyenler || '')}" placeholder="Örn. Gitar: Mehmet Demir (yazılı onayı var) — yoksa boş bırak"></label>
      ${evetHayir('sample', 'Başkasına ait sample / loop / beat kullandın mı?', e.sample, 'Evetse: kaynağı ve lisansı (ör. Splice, ticari lisans)')}
      ${evetHayir('yz', 'Yapay zekâ aracı kullandın mı?', e.yz, 'Evetse: hangi araç ve ne için (ör. Suno Pro, tüm şarkı)')}
      ${evetHayir('birlik', 'Bu şarkı bir telif birliğine kayıtlı mı? (MESAM, MSG vb.)', e.birlik, 'Evetse: hangi birlik')}
      ${evetHayir('munhasir', 'Bu şarkı başka bir yerde münhasır (yalnız oraya ait) lisanslı mı?', e.munhasir, 'Evetse: nerede')}
      <label class="sn-onay"><input type="checkbox" name="radyo" ${b && b.radyo_izni ? 'checked' : ''}> <span>Bu şarkı Derin Record mekân radyosunda da çalınabilir. <small style="color:var(--se-soluk);display:block">Telif birliğine kayıtlı şarkılar radyoya alınmaz. İzni kapatırsan şarkı radyodan hemen çıkar ve radyo payı durur.</small></span></label>
      <label class="sn-onay"><input type="checkbox" name="onay" ${e.onay ? 'checked' : ''}> <span>Bu eserin ve kaydın hakları bana aittir; yukarıdaki bilgiler doğrudur. Derin Record Sanatçı Lisans Sözleşmesi'nin 3. maddesindeki çoğaltma, yayma, umuma iletim ve sınırlı işleme hakları ile alt lisans iznini bu eser için veriyorum.</span></label>
    </div>`;
  }
  function ek1Oku(f) {
    const eh = ad => ({ var: (f.querySelector(`input[name="${ad}"]:checked`) || {}).value === 'evet', not: bos(f[ad + '_not'].value) });
    const ek1 = {
      besteci: bos(f.besteci.value), muzisyenler: bos(f.muzisyenler.value),
      sample: eh('sample'), yz: eh('yz'), birlik: eh('birlik'), munhasir: eh('munhasir'),
      onay: f.onay.checked, onay_at: f.onay.checked ? new Date().toISOString() : null, surum: SOZLESME
    };
    return { ek1, radyo_izni: f.radyo.checked && !ek1.birlik.var };
  }

  function sarkiFormu(p) {
    const b = p ? v.beyanlar[p.id] : null;
    return `<section class="se-kutu"><h2 class="se-bolum" style="margin:0">${p ? `"${kacis(p.ad)}" düzenle` : 'Yeni şarkı yükle'}</h2>
      <p class="se-aciklama" style="margin:0">Ana kayıt WAV olsun (en az 44,1 kHz / 24 bit). Kapak kare, en az 1500 × 1500 piksel. Önizleme MP3'ü otomatik hazırlanır.</p>
      <form class="se-form" id="sp-sarki" data-parca="${p ? p.id : ''}">
        <label>Ses dosyası${p ? ' (değiştirmeyeceksen boş bırak)' : ' *'}<input type="file" name="dosya" accept=".wav,.aif,.aiff,.flac,.mp3,audio/*"></label>
        <div class="sn-foto-sec sn-kapak-sec">${p && p.kapak_path ? `<img src="${kacis(R2.adres('muzik-onizleme', p.kapak_path))}" alt="" style="border-radius:8px">` : '<span class="sn-yok" style="border-radius:8px"></span>'}
          <label style="flex:1">Kapak görseli — seçince kırpıp ayarlarsın<input type="file" name="kapak" accept="image/jpeg,image/png,image/webp"></label>
          <button type="button" class="se-dugme ikincil" data-ayarla="kapak" hidden>Yeniden ayarla</button></div>
        <div class="se-yan-yana">
          <label>Şarkı adı *<input name="ad" maxlength="120" value="${kacis(p ? p.ad : '')}" placeholder="Boşsa dosya adı"></label>
          <label>Tür<input name="tur" maxlength="40" value="${kacis(p && p.tur || '')}" placeholder="Örn. Sinematik"></label>
        </div>
        <div class="se-yan-yana">
          <label>BPM<input name="bpm" inputmode="numeric" value="${kacis(p && p.bpm || '')}" placeholder="Örn. 120"></label>
          <label>Ruh hâli<input name="ruh" value="${kacis(p ? (p.ruh_hali || []).join(', ') : '')}" placeholder="Umutlu, Enerjik"></label>
        </div>
        <label>Etiketler<input name="etiket" value="${kacis(p ? (p.etiketler || []).join(', ') : '')}" placeholder="piyano, çello, trailer"></label>
        ${ek1Alanlari(b)}
        <div style="display:flex;flex-wrap:wrap;gap:8px">
          <button type="submit" class="se-dugme" data-gonder="1">Kaydet ve onaya gönder</button>
          <button type="submit" class="se-dugme ikincil" data-gonder="0">Taslak olarak kaydet</button>
          ${p ? '<button type="button" class="se-dugme ikincil" data-vazgec>Vazgeç</button>' : ''}
        </div>
        <p class="se-durum" id="sp-sarki-durum" role="status" aria-live="polite"></p>
      </form></section>`;
  }

  const DURUM = { taslak: 'Taslak', inceleme: 'Derin inceliyor', yayinda: 'Yayında', reddedildi: 'Onaylanmadı' };
  function sarkilarSekmesi() {
    const duzenlenen = v.duzenle && v.parcalar.find(p => p.id === v.duzenle);
    const satirlar = v.parcalar.map(p => {
      const b = v.beyanlar[p.id];
      const sv = v.versiyonlar.filter(x => x.parca_id === p.id);
      const yayinda = p.durum === 'yayinda';
      const form = v.versiyonFormu === p.id ? `<tr><td colspan="3"><form class="se-form" data-versiyon-form="${p.id}" style="padding:10px 0">
          <div class="se-yan-yana"><label>Tür<select name="tur"><option value="alternatif">Alternatif versiyon</option><option value="stem">Stem</option></select></label>
          <label>Dosyalar (WAV)<input type="file" name="dosya" accept=".wav,.aif,.aiff,.flac,.mp3,audio/*" multiple></label></div>
          <small style="color:var(--se-soluk)">Her dosya ayrı versiyon olur; adı dosya adından gelir (ör. "Instrumental [Nakarat]"). Stemler ana kayıtla aynı uzunlukta olmalı.</small>
          <div style="display:flex;gap:8px"><button type="submit" class="se-dugme">Ekle</button><button type="button" class="se-dugme ikincil" data-versiyon-kapat>Vazgeç</button></div>
          <p class="se-durum" id="sp-v-durum" role="status" aria-live="polite"></p></form></td></tr>` : '';
      return `<tr><td><div style="display:flex;gap:12px;align-items:center">${p.kapak_path ? `<img src="${kacis(R2.adres('muzik-onizleme', p.kapak_path))}" alt="" style="width:44px;height:44px;border-radius:6px;object-fit:cover">` : ''}
          <span><b>${kacis(p.ad)}</b><br><small style="color:var(--se-soluk)">${kacis([p.tur, p.sure_sn ? sureYaz(p.sure_sn) : '', sv.length ? sv.length + ' versiyon/stem' : ''].filter(Boolean).join(' · '))}</small>
          ${p.durum === 'reddedildi' && p.red_notu ? `<br><small style="color:#f08">Derin'in notu: ${kacis(p.red_notu)}</small>` : ''}</span></div></td>
        <td><span class="se-rozet ${yayinda ? 'odendi' : p.durum === 'inceleme' ? 'dekont' : ''}">${DURUM[p.durum] || p.durum}</span>
          <br><label class="sn-radyo"><input type="checkbox" data-radyo="${p.id}" ${b && b.radyo_izni ? 'checked' : ''} ${b && b.ek1 && b.ek1.birlik && b.ek1.birlik.var ? 'disabled' : ''}> Radyoda çalınabilir</label></td>
        <td><div class="islem">
          ${!yayinda ? `<button type="button" class="se-dugme ikincil" data-duzenle="${p.id}">Düzenle / Ek-1</button>
            <button type="button" class="se-dugme ikincil" data-versiyon-ac="${p.id}">Versiyon / stem ekle</button>` : ''}
          ${p.durum === 'taslak' || p.durum === 'reddedildi' ? `<button type="button" class="se-dugme" data-gonder-parca="${p.id}">Onaya gönder</button>` : ''}
          ${!yayinda ? `<button type="button" class="se-dugme ikincil" data-sil="${p.id}">Sil</button>` : ''}
        </div></td></tr>${form}`;
    }).join('');
    const liste = `<section class="se-kutu"><h2 class="se-bolum" style="margin:0">Şarkılarım</h2>
        <p class="se-aciklama" style="margin:0">Onaya gönderdiğin şarkıyı Derin dinler; onaylanınca katalogda ve profilinde yayına girer. Yayındaki şarkıda yalnız radyo iznini değiştirebilirsin.</p>
        <div class="se-kaydir"><table class="se-tablo"><thead><tr><th>ŞARKI</th><th>DURUM</th><th></th></tr></thead>
        <tbody>${satirlar || '<tr><td colspan="3" style="color:var(--se-soluk)">Henüz şarkın yok. Yukarıdan ilk şarkını yükle.</td></tr>'}</tbody></table></div></section>`;
    // Düzenlenen şarkının formu üstte; yeni yükleme formu listenin altında.
    return duzenlenen ? sarkiFormu(duzenlenen) + liste : liste + sarkiFormu(null);
  }

  function kazancSekmesi() {
    const toplam = v.satislar.reduce((n, s) => n + (Number(s.tutar) || 0), 0);
    const h = v.havuz || {};
    const oran = h.toplam_calma ? (Number(h.calma) / Number(h.toplam_calma) * 100) : 0;
    return `<div class="sn-ozet">
        <div><small>Toplam lisans satışı</small><b>${v.satislar.length}</b></div>
        <div><small>Satış tutarı</small><b>${kacis(fiyatYaz(toplam || null))}</b></div>
        <div><small>Lisans payın (%25, tahmini)</small><b>${kacis(fiyatYaz(toplam * 0.25 || null))}</b></div>
      </div>
      <section class="se-kutu"><h2 class="se-bolum" style="margin:0">Radyo payı</h2>
        <form class="se-form" id="sp-ay" style="flex-direction:row;align-items:flex-end;gap:12px"><label>Ay<input type="month" name="ay" value="${kacis(v.ay)}"></label></form>
        <div class="sn-ozet">
          <div><small>Şarkılarının çalınması</small><b>${Number(h.calma) || 0}</b></div>
          <div><small>Radyodaki bütün çalınmalar</small><b>${Number(h.toplam_calma) || 0}</b></div>
          <div><small>Payın</small><b>%${oran.toLocaleString('tr-TR', { maximumFractionDigits: 2 })}</b></div>
          <div><small>Radyo kazancın</small><b>${h.pay != null ? kacis(fiyatYaz(Number(h.pay) || null)) : 'Ay kapanınca'}</b></div>
        </div>
        <p class="se-aciklama" style="margin:0">Aylık radyo Net Gelir'inin %25'i havuzdur; o ay radyoda çalınan bütün şarkılar içinde senin şarkılarının payı kadarını alırsın.</p></section>
      <section class="se-kutu"><h2 class="se-bolum" style="margin:0">Satışlar</h2>
        <p class="se-aciklama" style="margin:0">Müşterilerin kişisel bilgileri paylaşılmaz. Tutarlar KDV ve masraflar düşülmeden öncedir; ödeme sözleşmedeki Net Gelir'e göre yapılır.</p>
        <div class="se-kaydir"><table class="se-tablo"><thead><tr><th>TARİH</th><th>ŞARKI</th><th>LİSANS</th><th>TUTAR</th><th>PAYIN</th></tr></thead><tbody>
        ${v.satislar.length ? v.satislar.map(s => `<tr><td>${s.odendi_at ? new Date(s.odendi_at).toLocaleDateString('tr-TR') : ''}</td><td>${kacis(s.parca_ad)}</td><td>${kacis(s.lisans_ad)}</td>
          <td>${kacis(fiyatYaz(s.tutar))}</td><td>${kacis(fiyatYaz((Number(s.tutar) || 0) * 0.25 || null))}</td></tr>`).join('')
          : '<tr><td colspan="5" style="color:var(--se-soluk)">Henüz satış yok.</td></tr>'}</tbody></table></div></section>`;
  }

  // ---------- İşlemler ----------
  function profilOku(f) {
    return {
      genel: {
        ad: f.ad.value.trim().slice(0, 80), sehir: bos(f.sehir.value), turler: liste(f.turler.value, 8),
        biyografi: bos(f.biyografi.value), instagram: bos(f.instagram.value), spotify: bos(f.spotify.value),
        youtube: bos(f.youtube.value), web: bos(f.web.value)
      },
      ozel: {
        yasal_ad: bos(f.yasal_ad.value), eposta: bos(f.eposta.value), telefon: bos(f.telefon.value),
        iban: bos(String(f.iban.value || '').replace(/\s+/g, '').toUpperCase()), hesap_sahibi: bos(f.hesap_sahibi.value)
      }
    };
  }
  async function fotoKaydet(f, sanatciId) {
    const dosya = v.kirpik.foto || f.foto.files[0];
    if (!dosya) return;
    const yol = await MY.gorselYukle('sanatci/' + sanatciId, 'foto', dosya);
    const err = await tekSatir(istemci().from('sanatcilar').update({ foto_path: yol }).eq('id', sanatciId).select('id'));
    if (err) throw new Error(err.message);
  }

  async function basvur(ev) {
    ev.preventDefault();
    const f = ev.target, c = istemci();
    const { genel, ozel } = profilOku(f);
    if (!genel.ad || !ozel.yasal_ad || !ozel.eposta) { yaz('#sp-form-durum', 'Sanatçı adı, ad soyad ve e-posta gerekli.', true); return; }
    if (!f.sozlesme.checked) { yaz('#sp-form-durum', HATA.SozlesmeOnayiGerekli, true); return; }
    const btn = f.querySelector('button[type="submit"]'); btn.disabled = true;
    try {
      yaz('#sp-form-durum', 'Başvuru gönderiliyor…');
      const { data, error } = await c.from('sanatcilar').insert({ ...genel, kullanici_id: window.DerinAuth.user.id, sozlesme_surumu: SOZLESME }).select('id').single();
      if (error) throw error;
      const o = await c.from('sanatci_ozel').upsert({ sanatci_id: data.id, ...ozel }).select('sanatci_id');
      if (o.error) throw o.error;
      await fotoKaydet(f, data.id);
      yaz('#sp-durum', 'Başvurun alındı. Derin inceleyip onaylayınca şarkı yükleyebileceksin.');
    } catch (e) { yaz('#sp-form-durum', 'Gönderilemedi: ' + hataMetni(e), true); btn.disabled = false; return; }
    await yukle();
  }

  async function profilKaydet(ev) {
    ev.preventDefault();
    const f = ev.target, c = istemci(), s = v.sanatci;
    const { genel, ozel } = profilOku(f);
    if (!genel.ad || !ozel.yasal_ad || !ozel.eposta) { yaz('#sp-form-durum', 'Sanatçı adı, ad soyad ve e-posta gerekli.', true); return; }
    const tekrar = s.durum === 'reddedildi';
    if (tekrar && !f.sozlesme.checked) { yaz('#sp-form-durum', HATA.SozlesmeOnayiGerekli, true); return; }
    const btn = f.querySelector('button[type="submit"]'); btn.disabled = true;
    try {
      yaz('#sp-form-durum', 'Kaydediliyor…');
      const alanlar = tekrar ? { ...genel, durum: 'basvurdu', sozlesme_surumu: SOZLESME } : genel;
      const err = await tekSatir(c.from('sanatcilar').update(alanlar).eq('id', s.id).select('id'));
      if (err) throw err;
      const o = await c.from('sanatci_ozel').upsert({ sanatci_id: s.id, ...ozel }).select('sanatci_id');
      if (o.error) throw o.error;
      await fotoKaydet(f, s.id);
      yaz('#sp-durum', tekrar ? 'Başvurun yeniden gönderildi.' : 'Bilgilerin kaydedildi.');
    } catch (e) { yaz('#sp-form-durum', 'Kaydedilemedi: ' + hataMetni(e), true); btn.disabled = false; return; }
    await yukle();
  }

  async function sarkiKaydet(ev) {
    ev.preventDefault();
    const f = ev.target, c = istemci();
    const gonder = ev.submitter ? ev.submitter.dataset.gonder === '1' : true;
    const parcaId = f.dataset.parca || null;
    const ses = f.dosya.files[0], kapak = v.kirpik.kapak || f.kapak.files[0];
    if (!parcaId && (!ses || !MY.SES.test(ses.name))) { yaz('#sp-sarki-durum', 'Şarkının ses dosyasını seç (WAV önerilir).', true); return; }
    if (ses && !MY.SES.test(ses.name)) { yaz('#sp-sarki-durum', 'Ses dosyası WAV, AIFF, FLAC ya da MP3 olmalı.', true); return; }
    const beyan = ek1Oku(f);
    if (gonder && (!beyan.ek1.besteci || !beyan.ek1.onay)) { yaz('#sp-sarki-durum', HATA.Ek1Eksik + ' Besteci alanı da gerekli.', true); return; }
    const ad = (f.ad.value.trim() || (ses ? ses.name.replace(MY.SES, '').replace(/[_-]+/g, ' ').trim() : '')).slice(0, 120);
    if (!ad) { yaz('#sp-sarki-durum', 'Şarkı adını yaz.', true); return; }
    const bpm = parseInt(f.bpm.value, 10);
    const bilgi = { ad, tur: bos(f.tur.value), ruh_hali: liste(f.ruh.value), etiketler: liste(f.etiket.value), bpm: bpm >= 20 && bpm <= 300 ? bpm : null };
    const dugmeler = [...f.querySelectorAll('button')]; dugmeler.forEach(b => { b.disabled = true; });
    const on = ad + ': ';
    try {
      let id = parcaId;
      if (!id) {
        const { data, error } = await c.from('muzik_parcalari').insert({ ...bilgi, sanatci: v.sanatci.ad, sanatci_id: v.sanatci.id, durum: 'taslak' }).select('id').single();
        if (error) throw error;
        id = data.id;
      }
      const guncel = { ...bilgi };
      if (ses) {
        const eski = v.parcalar.find(p => p.id === id);
        const eskiler = parcaId ? ((await c.from('muzik_dosyalari').select('id,dosya_path').eq('parca_id', id).is('versiyon_id', null)).data || []) : [];
        Object.assign(guncel, await MY.sesYukle(c, id, ses, ad, null, m => yaz('#sp-sarki-durum', on + m)));
        // Eski ana kayıt (yayında olmayan şarkı) yenisiyle değişir: kaydı ve dosyaları silinir.
        for (const d of eskiler) {
          await R2.sil('muzik-audio', d.dosya_path.replace(/^muzik\//, '')).catch(() => {});
          await c.from('muzik_dosyalari').delete().eq('id', d.id).select('id');
        }
        if (eski && eski.onizleme_path) await R2.sil('muzik-onizleme', eski.onizleme_path).catch(() => {});
      }
      if (kapak) {
        yaz('#sp-sarki-durum', on + 'kapak yükleniyor…');
        guncel.kapak_path = await MY.gorselYukle(id, 'kapak', kapak);
      }
      const g = await tekSatir(c.from('muzik_parcalari').update(guncel).eq('id', id).select('id'));
      if (g) throw g;
      const b = await c.from('muzik_parca_beyan').upsert({ parca_id: id, ...beyan }).select('parca_id');
      if (b.error) throw b.error;
      if (gonder) {
        const s = await tekSatir(c.from('muzik_parcalari').update({ durum: 'inceleme' }).eq('id', id).select('id'));
        if (s) throw s;
      }
      v.duzenle = null;
      yaz('#sp-durum', gonder ? `"${ad}" Derin'in onayına gönderildi.` : `"${ad}" taslak olarak kaydedildi.`);
    } catch (e) {
      yaz('#sp-sarki-durum', 'Kaydedilemedi: ' + hataMetni(e) + (parcaId ? '' : ' — şarkı taslak olarak kalmış olabilir.'), true);
      dugmeler.forEach(b => { b.disabled = false; });
      await yukle().catch(() => {});
      return;
    }
    await yukle();
  }

  async function versiyonEkle(ev, parcaId) {
    ev.preventDefault();
    const f = ev.target, c = istemci();
    const dosyalar = [...(f.dosya.files || [])].filter(x => MY.SES.test(x.name));
    if (!dosyalar.length) { yaz('#sp-v-durum', 'En az bir ses dosyası seç.', true); return; }
    const tur = f.tur.value;
    const btn = f.querySelector('button[type="submit"]'); btn.disabled = true;
    let tamam = 0; const hata = [];
    const mevcut = v.versiyonlar.filter(x => x.parca_id === parcaId).length;
    for (let i = 0; i < dosyalar.length; i++) {
      const dosya = dosyalar[i];
      const ad = dosya.name.replace(MY.SES, '').replace(/[_]+/g, ' ').trim().slice(0, 120) || 'Versiyon';
      try {
        const { data: vs, error } = await c.from('muzik_versiyonlari').insert({ parca_id: parcaId, tur, ad, sira: mevcut + i }).select('id').single();
        if (error) throw error;
        const sonuc = await MY.sesYukle(c, parcaId, dosya, ad, vs.id, m => yaz('#sp-v-durum', `(${i + 1}/${dosyalar.length}) ${ad}: ${m}`));
        const g = await tekSatir(c.from('muzik_versiyonlari').update(sonuc).eq('id', vs.id).select('id'));
        if (g) throw g;
        tamam++;
      } catch (e) { hata.push(ad + ': ' + hataMetni(e)); }
    }
    btn.disabled = false;
    if (!hata.length) v.versiyonFormu = null;
    await yukle();
    yaz('#sp-durum', hata.length ? `${tamam} dosya eklendi. Eklenemeyenler: ${hata.join(' · ')}` : `${tamam} ${tur === 'stem' ? 'stem' : 'alternatif versiyon'} eklendi.`, hata.length > 0);
  }

  async function onayaGonder(id) {
    const err = await tekSatir(istemci().from('muzik_parcalari').update({ durum: 'inceleme' }).eq('id', id).select('id'));
    yaz('#sp-durum', err ? hataMetni(err) : "Şarkı Derin'in onayına gönderildi.", !!err);
    if (!err) await yukle();
  }

  async function sil(id) {
    const p = v.parcalar.find(x => x.id === id); if (!p) return;
    if (!confirm(`"${p.ad}" silinsin mi? Versiyonları ve stemleri de silinir.`)) return;
    const c = istemci();
    const df = await c.from('muzik_dosyalari').select('dosya_path').eq('parca_id', id);
    const ve = await c.from('muzik_versiyonlari').select('onizleme_path').eq('parca_id', id);
    // Dosya izni şarkı kaydına bağlı: önce dosyalar, sonra kayıt silinir.
    for (const d of (df.data || [])) await R2.sil('muzik-audio', d.dosya_path.replace(/^muzik\//, '')).catch(() => {});
    for (const o of [p.onizleme_path, p.kapak_path].concat((ve.data || []).map(x => x.onizleme_path)).filter(Boolean)) await R2.sil('muzik-onizleme', o).catch(() => {});
    const err = await tekSatir(c.from('muzik_parcalari').delete().eq('id', id).select('id'));
    if (err) { yaz('#sp-durum', 'Silinemedi: ' + hataMetni(err), true); return; }
    yaz('#sp-durum', 'Şarkı silindi.');
    await yukle();
  }

  async function radyoIzni(id, acik) {
    const c = istemci();
    const b = v.beyanlar[id];
    const r = b
      ? await tekSatir(c.from('muzik_parca_beyan').update({ radyo_izni: acik }).eq('parca_id', id).select('parca_id'))
      : (await c.from('muzik_parca_beyan').insert({ parca_id: id, radyo_izni: acik }).select('parca_id')).error;
    yaz('#sp-durum', r ? 'Radyo izni kaydedilemedi: ' + hataMetni(r) : acik ? 'Radyo izni verildi.' : 'Radyo izni kapatıldı; şarkı radyodan çıkarıldı ve radyo payı durdu.', !!r);
    await yukle();
  }

  // Fotoğraf ve kapak yüklenmeden önce ayarlanır (gorsel-kirp.js): kare kırpılır.
  async function gorselAyarla(form, ad, dosya) {
    const K = window.DerinGorselKirp;
    if (!K || !dosya) return;
    const foto = ad === 'foto';
    const blob = await K.ac(dosya, { yuvarlak: foto, boyut: foto ? 1200 : 1500, baslik: foto ? 'Profil fotoğrafını ayarla' : 'Kapağı ayarla' });
    const kutu = form[ad].closest('.sn-foto-sec');
    if (!blob) { if (!v.kirpik[ad]) form[ad].value = ''; return; }
    v.asil[ad] = dosya;
    v.kirpik[ad] = new File([blob], ad + '.jpg', { type: 'image/jpeg' });
    const onizleme = document.createElement('img');
    onizleme.src = URL.createObjectURL(blob); onizleme.alt = '';
    if (!foto) onizleme.style.borderRadius = '8px';
    kutu.firstElementChild.replaceWith(onizleme);
    kutu.querySelector('[data-ayarla]').hidden = false;
  }

  function bagla() {
    document.addEventListener('submit', ev => {
      const t = ev.target;
      if (t.id === 'sp-basvuru') basvur(ev);
      else if (t.id === 'sp-profil') profilKaydet(ev);
      else if (t.id === 'sp-sarki') sarkiKaydet(ev);
      else if (t.dataset.versiyonForm) versiyonEkle(ev, t.dataset.versiyonForm);
      else if (t.id === 'sp-ay') ev.preventDefault();
    });
    document.addEventListener('change', async ev => {
      const t = ev.target;
      if (t.dataset.radyo) radyoIzni(t.dataset.radyo, t.checked);
      else if ((t.name === 'foto' || t.name === 'kapak') && t.type === 'file' && t.files && t.files[0]) {
        v.kirpik[t.name] = null;
        gorselAyarla(t.form, t.name, t.files[0]);
      }
      else if (t.name === 'ay' && t.closest('#sp-ay') && /^\d{4}-\d{2}$/.test(t.value)) { v.ay = t.value; await havuzYukle(); ciz(); }
      else if (t.name === 'birlik' && t.closest('#sp-sarki')) {
        const f = t.closest('form'); const kayitli = t.value === 'evet';
        f.radyo.disabled = kayitli; if (kayitli) f.radyo.checked = false;
      }
    });
    document.addEventListener('click', ev => {
      const b = ev.target.closest('button'); if (!b) return;
      if (b.dataset.ayarla) gorselAyarla(b.form, b.dataset.ayarla, v.asil[b.dataset.ayarla]);
      else if (b.dataset.sekme) { v.sekme = b.dataset.sekme; ciz(); }
      else if (b.dataset.duzenle) { v.duzenle = b.dataset.duzenle; ciz(); const f = $('#sp-sarki'); if (f) f.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
      else if (b.hasAttribute('data-vazgec')) { v.duzenle = null; ciz(); }
      else if (b.dataset.versiyonAc) { v.versiyonFormu = b.dataset.versiyonAc; ciz(); }
      else if (b.hasAttribute('data-versiyon-kapat')) { v.versiyonFormu = null; ciz(); }
      else if (b.dataset.gonderParca) onayaGonder(b.dataset.gonderParca);
      else if (b.dataset.sil) sil(b.dataset.sil);
    });
  }

  async function baslat() {
    const a0 = window.DerinAuth; if (!a0) { yaz('#sp-durum', 'Bağlantı kurulamadı.', true); return; }
    await a0.ready;
    const a = window.DerinAuth;
    if (!a.configured) { yaz('#sp-durum', 'Hesap sistemi hazırlanıyor.', true); return; }
    bagla();
    const ac = async () => {
      if (!window.DerinAuth.user) {
        $('#sp-tanitim').hidden = false; $('#sp-uygulama').innerHTML = '';
        $('#sp-giris').onclick = () => window.DerinAuth.open();
        return;
      }
      $('#sp-tanitim').hidden = true;
      await yukle();
    };
    await ac();
    window.addEventListener('derin:authchange', ac);
  }
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', baslat) : baslat();
})();
