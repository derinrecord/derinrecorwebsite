// Profilim: fotoğraf (tarayıcıda 256×256 küçültülür), ad, kulüp, şehir,
// telefon/WhatsApp ve şifre. Kurallar: profil-yardim.js; izinler: supabase/profil.sql.
(() => {
  'use strict';
  const P = window.DerinProfil;
  const $ = id => document.getElementById(id);
  const L = (tr, en) => (document.documentElement.getAttribute('data-dil') === 'en' ? en : tr);
  const yaz = (el, metin, tip) => { el.textContent = metin || ''; el.className = 'pf-msg' + (tip ? ' ' + tip : ''); };

  let client = null, ben = null, profil = {};

  function fotoGoster(url) {
    const kutu = $('pf-foto');
    kutu.textContent = '';
    if (url) {
      const img = document.createElement('img');
      img.src = url; img.alt = '';
      kutu.appendChild(img);
    } else {
      kutu.textContent = P.basHarf($('pf-ad').value || profil.full_name, ben && ben.email);
    }
    $('pf-foto-kaldir').hidden = !profil.avatar_path;
  }

  async function fotoUrl(yol) {
    if (!yol) return null;
    const { data } = await client.storage.from('profil-foto').createSignedUrl(yol, 3600);
    return data && data.signedUrl;
  }

  function resimAc(dosya) {
    return new Promise((tamam, hata) => {
      const url = URL.createObjectURL(dosya);
      const img = new Image();
      img.onload = () => tamam({ img, url });
      img.onerror = () => { URL.revokeObjectURL(url); hata(new Error(L('Bu fotoğraf açılamadı. JPG ya da PNG dene.', 'This photo could not be opened. Try JPG or PNG.'))); };
      img.src = url;
    });
  }

  // Izgaralı pencere: sürükle (tek parmak/fare), büyüt (çubuk, iki parmak, tekerlek).
  // KAYDET → { sx, sy, kenar, cikti }; VAZGEÇ → null.
  function ayarla(img, url) {
    return new Promise(bitir => {
      const pen = $('pf-ayar'), alan = $('pf-ayar-alan'), res = $('pf-ayar-resim'), cubuk = $('pf-ayar-zoom');
      const gen = img.naturalWidth, yuk = img.naturalHeight;
      res.src = url;
      pen.hidden = false;
      let F = alan.clientWidth || 300;
      let a = P.baslangicAyar(gen, yuk, F);
      const ciz = () => {
        const s = (F / Math.min(gen, yuk)) * a.zoom;
        res.style.width = gen * s + 'px';
        res.style.height = yuk * s + 'px';
        res.style.transform = `translate(${a.ox}px, ${a.oy}px)`;
        cubuk.value = a.zoom;
      };
      ciz();

      const parmak = new Map();
      let onceki = null; // { x, y, mesafe }
      const yerel = e => { const r = alan.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
      const durum = () => {
        const n = [...parmak.values()];
        if (n.length === 1) return { x: n[0].x, y: n[0].y, mesafe: 0 };
        if (n.length >= 2) return { x: (n[0].x + n[1].x) / 2, y: (n[0].y + n[1].y) / 2, mesafe: Math.hypot(n[0].x - n[1].x, n[0].y - n[1].y) };
        return null;
      };
      const bas = e => { alan.setPointerCapture(e.pointerId); parmak.set(e.pointerId, yerel(e)); onceki = durum(); alan.classList.add('surukle'); };
      const oynat = e => {
        if (!parmak.has(e.pointerId)) return;
        parmak.set(e.pointerId, yerel(e));
        const d = durum();
        if (!d || !onceki) { onceki = d; return; }
        if (d.mesafe && onceki.mesafe) a = P.zoomla(a, a.zoom * d.mesafe / onceki.mesafe, gen, yuk, F, d.x, d.y);
        a = P.sinirla({ zoom: a.zoom, ox: a.ox + d.x - onceki.x, oy: a.oy + d.y - onceki.y }, gen, yuk, F);
        onceki = d;
        ciz();
      };
      const birak = e => { parmak.delete(e.pointerId); onceki = durum(); if (!parmak.size) alan.classList.remove('surukle'); };
      const tekerlek = e => { e.preventDefault(); const p = yerel(e); a = P.zoomla(a, a.zoom * (e.deltaY < 0 ? 1.08 : 1 / 1.08), gen, yuk, F, p.x, p.y); ciz(); };
      const cubukla = () => { a = P.zoomla(a, Number(cubuk.value), gen, yuk, F); ciz(); };
      const boyut = () => {
        const yeni = alan.clientWidth || F;
        if (yeni === F) return;
        a = P.sinirla({ zoom: a.zoom, ox: a.ox * yeni / F, oy: a.oy * yeni / F }, gen, yuk, yeni);
        F = yeni; ciz();
      };
      const tus = e => { if (e.key === 'Escape') kapat(null); };

      alan.addEventListener('pointerdown', bas);
      alan.addEventListener('pointermove', oynat);
      alan.addEventListener('pointerup', birak);
      alan.addEventListener('pointercancel', birak);
      alan.addEventListener('wheel', tekerlek, { passive: false });
      cubuk.addEventListener('input', cubukla);
      window.addEventListener('resize', boyut);
      document.addEventListener('keydown', tus);

      function kapat(sonuc) {
        alan.removeEventListener('pointerdown', bas);
        alan.removeEventListener('pointermove', oynat);
        alan.removeEventListener('pointerup', birak);
        alan.removeEventListener('pointercancel', birak);
        alan.removeEventListener('wheel', tekerlek);
        cubuk.removeEventListener('input', cubukla);
        window.removeEventListener('resize', boyut);
        document.removeEventListener('keydown', tus);
        $('pf-ayar-kaydet').onclick = $('pf-ayar-vazgec').onclick = null;
        pen.hidden = true;
        res.removeAttribute('src');
        bitir(sonuc);
      }
      $('pf-ayar-kaydet').onclick = () => kapat(P.ayarKirp(a, gen, yuk, F));
      $('pf-ayar-vazgec').onclick = () => kapat(null);
    });
  }

  // Seçilen resmi pencerede ayarlatıp kırpar → JPEG Blob (vazgeçilirse null).
  async function kucult(dosya) {
    const { img, url } = await resimAc(dosya);
    try {
      const k = await ayarla(img, url);
      if (!k) return null;
      const tuval = document.createElement('canvas');
      tuval.width = tuval.height = k.cikti;
      tuval.getContext('2d').drawImage(img, k.sx, k.sy, k.kenar, k.kenar, 0, 0, k.cikti, k.cikti);
      return await new Promise((tamam, hata) => tuval.toBlob(b => (b ? tamam(b) : hata(new Error(L('Fotoğraf işlenemedi.', 'Could not process the photo.')))), 'image/jpeg', 0.85));
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  async function fotoYukle(dosya) {
    const msg = $('pf-foto-msg');
    if (!P.resimMi(dosya)) { yaz(msg, L('Lütfen bir fotoğraf seç.', 'Please choose a photo.'), 'err'); return; }
    yaz(msg, '');
    try {
      const blob = await kucult(dosya);
      if (!blob) return;
      yaz(msg, L('Yükleniyor…', 'Uploading…'));
      const yol = P.fotoYolu(ben.id, Date.now());
      const yukle = await client.storage.from('profil-foto').upload(yol, blob, { contentType: 'image/jpeg', upsert: true });
      if (yukle.error) throw yukle.error;
      const kayit = await client.from('profiles').update({ avatar_path: yol }).eq('id', ben.id).select('id');
      if (kayit.error || !kayit.data || !kayit.data.length) {
        await client.storage.from('profil-foto').remove([yol]);
        throw kayit.error || new Error(L('Profil kaydedilemedi.', 'Profile could not be saved.'));
      }
      const eski = profil.avatar_path;
      profil.avatar_path = yol;
      if (eski && eski !== yol) await client.storage.from('profil-foto').remove([eski]);
      fotoGoster(await fotoUrl(yol));
      yaz(msg, L('Fotoğraf kaydedildi.', 'Photo saved.'), 'ok');
      document.dispatchEvent(new CustomEvent('derin:profilfoto'));
    } catch (e) {
      yaz(msg, L('Yüklenemedi: ', 'Upload failed: ') + (e && e.message || ''), 'err');
    } finally {
      $('pf-foto-sec').value = '';
    }
  }

  async function fotoKaldir() {
    const msg = $('pf-foto-msg');
    const eski = profil.avatar_path;
    if (!eski) return;
    const kayit = await client.from('profiles').update({ avatar_path: null }).eq('id', ben.id).select('id');
    if (kayit.error) { yaz(msg, L('Kaldırılamadı: ', 'Could not remove: ') + kayit.error.message, 'err'); return; }
    await client.storage.from('profil-foto').remove([eski]);
    profil.avatar_path = null;
    fotoGoster(null);
    yaz(msg, L('Fotoğraf kaldırıldı.', 'Photo removed.'), 'ok');
  }

  async function bilgiKaydet() {
    const msg = $('pf-bilgi-msg');
    const sonuc = P.formKaydi({ ad: $('pf-ad').value, kulup: $('pf-kulup').value, sehir: $('pf-sehir').value, telefon: $('pf-telefon').value });
    if (sonuc.hata) { yaz(msg, sonuc.hata, 'err'); return; }
    const d = $('pf-kaydet'); d.disabled = true;
    const kayit = await client.from('profiles').update(sonuc.kayit).eq('id', ben.id).select('id');
    d.disabled = false;
    if (kayit.error || !kayit.data || !kayit.data.length) {
      yaz(msg, L('Kaydedilemedi: ', 'Could not save: ') + (kayit.error ? kayit.error.message : ''), 'err'); return;
    }
    Object.assign(profil, sonuc.kayit);
    if (!profil.avatar_path) fotoGoster(null);
    yaz(msg, L('Bilgilerin kaydedildi.', 'Your details were saved.'), 'ok');
  }

  async function sifreKaydet() {
    const msg = $('pf-sifre-msg');
    const a = $('pf-sifre').value, b = $('pf-sifre2').value;
    const hata = P.sifreHatasi(a, b);
    if (hata) { yaz(msg, hata, 'err'); return; }
    const d = $('pf-sifre-kaydet'); d.disabled = true;
    const { error } = await client.auth.updateUser({ password: a });
    d.disabled = false;
    if (error) { yaz(msg, error.message, 'err'); return; }
    $('pf-sifre').value = ''; $('pf-sifre2').value = '';
    yaz(msg, L('Şifren güncellendi.', 'Your password was updated.'), 'ok');
  }

  (async () => {
    const durum = $('pf-durum');
    if (!window.DerinAuth) { yaz(durum, 'Hesap sistemi yüklenemedi.', 'err'); return; }
    const st = await window.DerinAuth.ready;
    client = st.client;
    ben = st.user;
    if (!client || !ben) { yaz(durum, L('Profilini görmek için giriş yap.', 'Log in to see your profile.'), 'err'); return; }

    // Yeni alanlar (supabase/profil.sql) kurulmamışsa eski alanlarla devam edilir.
    let r = await client.from('profiles').select('id,full_name,phone,avatar_path,kulup,sehir').eq('id', ben.id).maybeSingle();
    if (r.error) r = await client.from('profiles').select('id,full_name,phone').eq('id', ben.id).maybeSingle();
    profil = r.data || {};

    $('pf-ad').value = profil.full_name || '';
    $('pf-kulup').value = profil.kulup || '';
    $('pf-sehir').value = profil.sehir || '';
    $('pf-telefon').value = profil.phone || '';
    $('pf-eposta').value = ben.email || '';
    fotoGoster(await fotoUrl(profil.avatar_path));

    $('pf-foto-sec').onchange = e => { const f = e.target.files && e.target.files[0]; if (f) fotoYukle(f); };
    $('pf-foto-kaldir').onclick = fotoKaldir;
    $('pf-kaydet').onclick = bilgiKaydet;
    $('pf-sifre-kaydet').onclick = sifreKaydet;

    yaz(durum, '');
    $('pf-icerik').hidden = false;
  })();
})();
