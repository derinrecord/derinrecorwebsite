// Ses Tasarımı işleri (27 Ekim).
// Kartlar veritabanından (ses_tasarimi_isleri) çizilir. Yönetici sayfadan iş
// ekler, düzenler, siler ve sırasını değiştirir. Video ve kapak Derin'in
// yüklediği dosyalardır (R2, demo/ses-tasarimi/); Drive'dan açılmaz. Eski 3
// işin Drive kimliği yalnız yeniden yüklenene dek yedek olarak oynatılır.
// Tablo yoksa ya da okunamazsa sayfada kodda duran eski kartlar kalır.
(() => {
  'use strict';

  // ---------- Saf yardımcılar (Node'da sınanır) ----------
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const VIDEO_UZANTI = /\.(mp4|m4v|mov|webm)$/i;
  const RESIM_UZANTI = /\.(jpe?g|png|webp|avif)$/i;
  const EN_BUYUK_VIDEO = 2 * 1024 * 1024 * 1024; // 2 GB
  const EN_BUYUK_KAPAK = 15 * 1024 * 1024; // 15 MB

  const videoMu = d => !!d && ((d.type || '').startsWith('video/') || VIDEO_UZANTI.test(d.name || ''));
  const resimMi = d => !!d && ((d.type || '').startsWith('image/') || RESIM_UZANTI.test(d.name || ''));

  // R2 yolu: demo/ses-tasarimi/<damga>-<güvenli ad>. Türkçe harfler sadeleşir.
  function r2Yolu(tur, ad, damga) {
    const temiz = String(ad || 'dosya').toLocaleLowerCase('tr-TR')
      .replace(/[çğıöşü]/g, c => ({ 'ç': 'c', 'ğ': 'g', 'ı': 'i', 'ö': 'o', 'ş': 's', 'ü': 'u' }[c]))
      .replace(/[^a-z0-9.]+/g, '-').replace(/^-+|-+$/g, '').slice(-60) || 'dosya';
    return `ses-tasarimi/${tur}/${damga}-${temiz}`;
  }

  // İki komşu işin sırasını değiştirir; sıra eşitse araya 10'luk açar.
  function siraDegistir(isler, id, yon) {
    const i = isler.findIndex(x => x.id === id), j = i + yon;
    if (i < 0 || j < 0 || j >= isler.length) return null;
    const a = isler[i], b = isler[j];
    const yeniA = b.sira === a.sira ? b.sira + yon * 10 : b.sira;
    return [{ id: a.id, sira: yeniA }, { id: b.id, sira: a.sira }];
  }

  function kartHtml(is, yonetici) {
    const yonetim = yonetici ? `<div class="st-yonet" data-st-yonet>
        <button type="button" data-st-sola="${esc(is.id)}" aria-label="Sola al" title="Sola al">◀</button>
        <button type="button" data-st-saga="${esc(is.id)}" aria-label="Sağa al" title="Sağa al">▶</button>
        <button type="button" data-st-duzenle="${esc(is.id)}">DÜZENLE</button>
        <button type="button" class="tehlike" data-st-sil="${esc(is.id)}">SİL</button>
      </div>` : '';
    return `<div class="sd-card" data-st-id="${esc(is.id)}" data-title="${esc(is.baslik)}" role="button" tabindex="0">
      <img src="${esc(is.kapak_url)}" alt="${esc(is.baslik)} kapak görseli" loading="lazy" />
      <div class="sd-play"><svg viewBox="0 0 24 24" fill="#fff"><path d="M8 5v14l11-7z"/></svg><b>${esc(String(is.baslik).toLocaleUpperCase('tr-TR'))}</b></div>
      ${yonetim}
    </div>`;
  }

  // Döndürme/çevirme → CSS transform. 90/270'te videonun eni ve boyu yer
  // değiştirir; çerçeveye sığsın diye en/boy çerçevenin tersi verilir.
  function donusum(is) {
    const d = [0, 90, 180, 270].includes(Number(is && is.donme)) ? Number(is.donme) : 0;
    const parca = [];
    if (d) parca.push(`rotate(${d}deg)`);
    if (is && is.yatay_cevir) parca.push('scaleX(-1)');
    if (is && is.dikey_cevir) parca.push('scaleY(-1)');
    return { yan: d === 90 || d === 270, transform: parca.join(' ') };
  }

  // Silinmiş işi yeniden eklerken: yeni seçilenler, yoksa eski değerler.
  function yenidenEklenecek(eski, satir) {
    const y = {
      baslik: satir.baslik, sira: eski.sira,
      donme: satir.donme || 0, yatay_cevir: !!satir.yatay_cevir, dikey_cevir: !!satir.dikey_cevir,
      kapak_url: satir.kapak_url || eski.kapak_url, kapak_r2: satir.kapak_url ? satir.kapak_r2 : null
    };
    if (satir.video_url) Object.assign(y, { video_url: satir.video_url, video_r2: satir.video_r2, video_id: null });
    else Object.assign(y, { video_url: eski.video_url || null, video_r2: null, video_id: eski.video_id || null });
    return y;
  }

  const api = { yenidenEklenecek, donusum, esc, videoMu, resimMi, r2Yolu, siraDegistir, kartHtml, EN_BUYUK_VIDEO, EN_BUYUK_KAPAK };
  if (typeof module !== 'undefined') module.exports = api;
  if (typeof document === 'undefined') return;

  // ---------- Sayfa ----------
  const KOVA = 'demo-audio'; // R2 demo/ klasörü: herkese açık okunur, yalnız yönetici yazar
  const grid = document.querySelector('.sd-grid');
  const modal = document.getElementById('sd-modal');
  const cerceve = modal && modal.querySelector('.sd-frame');
  const baslikEl = document.getElementById('sd-modal-title');
  let isler = null; // null: eski, koddaki kartlar
  let client = null;

  function modalAc(is) {
    baslikEl.textContent = is.baslik || '';
    if (is.video_url) {
      cerceve.classList.add('st-video');
      const t = donusum(is);
      // Döndürülen videoda tarayıcının kendi düğmeleri de döner (ters durur);
      // o yüzden döndürmede düğmeler videonun dışında, düz durur.
      cerceve.innerHTML = `<video src="${esc(is.video_url)}" ${t.transform ? '' : 'controls'} autoplay playsinline preload="metadata"></video>`;
      const v = cerceve.querySelector('video');
      if (t.transform) duzKontroller(v);
      v.style.transform = `translate(-50%,-50%) ${t.transform}`.trim();
      if (t.yan) { // en/boy yer değiştirir
        const r = cerceve.getBoundingClientRect();
        v.style.width = r.height + 'px'; v.style.height = r.width + 'px';
      }
    } else {
      cerceve.classList.remove('st-video');
      cerceve.innerHTML = `<iframe src="https://drive.google.com/file/d/${encodeURIComponent(is.video_id)}/preview" allow="autoplay" allowfullscreen></iframe>`;
    }
    modal.classList.add('on');
  }
  function modalKapat() {
    modal.classList.remove('on'); cerceve.innerHTML = '';
    const k = modal.querySelector('.st-kontrol'); if (k) k.remove();
  }

  const sure = sn => { sn = Math.max(0, Math.floor(sn || 0)); return Math.floor(sn / 60) + ':' + String(sn % 60).padStart(2, '0'); };
  function duzKontroller(v) {
    const k = document.createElement('div');
    k.className = 'st-kontrol';
    k.innerHTML = '<button type="button" class="st-oynat" aria-label="Oynat / duraklat">❚❚</button><input type="range" min="0" max="1000" value="0" aria-label="Videoda ilerle"><span>0:00</span><button type="button" class="st-tam" aria-label="Tam ekran">⤢</button>';
    cerceve.after(k);
    const dugme = k.querySelector('.st-oynat'), cubuk = k.querySelector('input'), yazi = k.querySelector('span');
    const tazele = () => {
      dugme.textContent = v.paused ? '▶' : '❚❚';
      if (v.duration) cubuk.value = Math.round(v.currentTime / v.duration * 1000);
      yazi.textContent = sure(v.currentTime) + ' / ' + sure(v.duration);
    };
    ['play', 'pause', 'timeupdate', 'loadedmetadata'].forEach(o => v.addEventListener(o, tazele));
    dugme.onclick = () => (v.paused ? v.play() : v.pause());
    v.onclick = () => (v.paused ? v.play() : v.pause());
    cubuk.oninput = () => { if (v.duration) v.currentTime = cubuk.value / 1000 * v.duration; };
    k.querySelector('.st-tam').onclick = () => { const kutu = modal.querySelector('.sd-modal-box'); (kutu.requestFullscreen || kutu.webkitRequestFullscreen || (() => {})).call(kutu); };
  }

  function kartlariBagla() {
    grid.querySelectorAll('.sd-card').forEach(kart => {
      const ac = e => {
        if (e.target.closest('[data-st-yonet]')) return;
        if (e.type === 'keydown' && e.key !== 'Enter' && e.key !== ' ') return;
        if (e.type === 'keydown') e.preventDefault();
        const is = isler ? isler.find(x => x.id === kart.dataset.stId)
          : { baslik: kart.dataset.title, video_id: kart.dataset.video };
        if (is) modalAc(is);
      };
      kart.onclick = ac; kart.onkeydown = ac;
    });
  }

  function ciz(yonetici) {
    grid.innerHTML = isler.map(is => kartHtml(is, yonetici)).join('')
      || '<p class="st-bos">Henüz iş yok.</p>';
    kartlariBagla();
  }

  // ---------- Yönetici: ekle / düzenle formu ----------
  const yukleXhr = (adres, dosya, ilerle) => new Promise((tamam, hata) => {
    const x = new XMLHttpRequest();
    x.open('PUT', adres);
    x.upload.onprogress = e => { if (e.lengthComputable) ilerle(e.loaded / e.total); };
    x.onload = () => (x.status >= 200 && x.status < 300 ? tamam() : hata(new Error('Yükleme reddedildi (' + x.status + ')')));
    x.onerror = () => hata(new Error('Bağlantı koptu, tekrar dene.'));
    x.send(dosya);
  });

  function formKur() {
    const kutu = document.createElement('div');
    kutu.className = 'st-yonetim';
    kutu.innerHTML = `
      <button type="button" class="st-ekle-ac">＋ İŞ EKLE</button>
      <form class="st-form" hidden>
        <p class="st-form-baslik"></p>
        <label>İŞİN ADI<input name="baslik" maxlength="80" required placeholder="Örn. Interstellar"></label>
        <label class="st-dosya"><span class="st-video-etiket">VİDEO (MP4, MOV ya da WEBM)</span><input name="video" type="file" accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.m4v,.webm"></label>
        <label class="st-dosya"><span class="st-kapak-etiket">KAPAK FOTOĞRAFI</span><input name="kapak" type="file" accept="image/*"></label>
        <fieldset class="st-don"><legend>VİDEO TERS YA DA YAN MI? DÖNDÜR</legend>
          <label><input type="radio" name="donme" value="0" checked> Düz</label>
          <label><input type="radio" name="donme" value="90"> ↻ 90° sağa</label>
          <label><input type="radio" name="donme" value="180"> 180° (baş aşağı)</label>
          <label><input type="radio" name="donme" value="270"> ↺ 90° sola</label>
          <label><input type="checkbox" name="yatay_cevir"> ⇆ Yatay çevir (ayna)</label>
          <label><input type="checkbox" name="dikey_cevir"> ⇅ Dikey çevir</label>
        </fieldset>
        <div class="st-ilerleme" hidden><i></i><span>%0</span></div>
        <p class="st-mesaj" role="status" aria-live="polite"></p>
        <div class="st-dugmeler"><button type="button" class="st-vazgec">VAZGEÇ</button><button type="submit" class="st-kaydet">KAYDET</button></div>
      </form>`;
    grid.before(kutu);
    const form = kutu.querySelector('form');
    const ac = kutu.querySelector('.st-ekle-ac');
    const mesaj = kutu.querySelector('.st-mesaj');
    const ilerleme = kutu.querySelector('.st-ilerleme');
    const yaz = (m, tip) => { mesaj.textContent = m || ''; mesaj.className = 'st-mesaj' + (tip ? ' ' + tip : ''); };
    const ilerle = (oran, ne) => {
      const y = Math.floor(oran * 100);
      ilerleme.querySelector('i').style.width = y + '%';
      ilerleme.querySelector('span').textContent = `${ne} %${y}`;
    };
    let duzenlenen = null;

    const goster = (acik, is) => {
      duzenlenen = acik ? (is || null) : null;
      form.hidden = !acik; ac.hidden = acik;
      form.reset(); yaz(''); ilerleme.hidden = true;
      form.querySelector('.st-form-baslik').textContent = duzenlenen ? 'İŞİ DÜZENLE' : 'YENİ İŞ';
      form.baslik.value = duzenlenen ? duzenlenen.baslik : '';
      const donme = String((duzenlenen && duzenlenen.donme) || 0);
      form.querySelectorAll('[name=donme]').forEach(r => { r.checked = r.value === donme; });
      form.yatay_cevir.checked = !!(duzenlenen && duzenlenen.yatay_cevir);
      form.dikey_cevir.checked = !!(duzenlenen && duzenlenen.dikey_cevir);
      form.video.required = !duzenlenen; form.kapak.required = !duzenlenen;
      form.querySelector('.st-video-etiket').textContent = duzenlenen
        ? (duzenlenen.video_url ? 'VİDEO (değiştirmek istersen seç)' : 'VİDEO — şu an Drive\'dan açılıyor, kendi dosyanı seç')
        : 'VİDEO (MP4, MOV ya da WEBM)';
      form.querySelector('.st-kapak-etiket').textContent = duzenlenen ? 'KAPAK FOTOĞRAFI (değiştirmek istersen seç)' : 'KAPAK FOTOĞRAFI';
      if (acik) kutu.scrollIntoView({ block: 'start', behavior: 'smooth' });
    };
    ac.onclick = () => goster(true);
    kutu.querySelector('.st-vazgec').onclick = () => goster(false);

    form.onsubmit = async e => {
      e.preventDefault();
      const baslik = form.baslik.value.trim();
      const video = form.video.files[0] || null;
      const kapak = form.kapak.files[0] || null;
      if (!baslik) { yaz('İşin adı boş olamaz.', 'err'); return; }
      if (!duzenlenen && (!video || !kapak)) { yaz('Video ve kapak fotoğrafı seç.', 'err'); return; }
      if (video && !videoMu(video)) { yaz('Video MP4, MOV ya da WEBM olmalı.', 'err'); return; }
      if (video && video.size > EN_BUYUK_VIDEO) { yaz('Video çok büyük (en çok 2 GB).', 'err'); return; }
      if (kapak && !resimMi(kapak)) { yaz('Kapak bir fotoğraf olmalı (JPG, PNG, WEBP).', 'err'); return; }
      if (kapak && kapak.size > EN_BUYUK_KAPAK) { yaz('Kapak fotoğrafı çok büyük (en çok 15 MB).', 'err'); return; }
      const dugme = form.querySelector('.st-kaydet');
      dugme.disabled = true;
      const damga = Date.now().toString(36);
      const yeniYollar = [];
      try {
        const satir = { baslik, donme: Number(form.querySelector('[name=donme]:checked').value) || 0,
          yatay_cevir: form.yatay_cevir.checked, dikey_cevir: form.dikey_cevir.checked };
        if (kapak) {
          const yol = r2Yolu('kapak', kapak.name, damga);
          ilerleme.hidden = false; yaz('Kapak yükleniyor…');
          await yukleXhr(await window.DerinR2.imzaAdresi(KOVA, yol, 'yukle'), kapak, o => ilerle(o, 'Kapak'));
          yeniYollar.push(yol);
          Object.assign(satir, { kapak_url: window.DerinR2.adres(KOVA, yol), kapak_r2: yol });
        }
        if (video) {
          const yol = r2Yolu('video', video.name, damga);
          ilerleme.hidden = false; yaz('Video yükleniyor…');
          await yukleXhr(await window.DerinR2.imzaAdresi(KOVA, yol, 'yukle'), video, o => ilerle(o, 'Video'));
          yeniYollar.push(yol);
          Object.assign(satir, { video_url: window.DerinR2.adres(KOVA, yol), video_r2: yol, video_id: null });
        }
        yaz('Kaydediliyor…');
        let sonuc, yenidenEklendi = false;
        if (duzenlenen) {
          sonuc = await client.from('ses_tasarimi_isleri').update(satir).eq('id', duzenlenen.id).select('id');
          // Form açıkken iş silinmişse (27 Ekim: Megatron) güncellenecek satır kalmaz;
          // yüklenen dosyalar boşa gitmesin, iş aynı yerinde yeniden eklenir.
          if (!sonuc.error && sonuc.data && !sonuc.data.length) {
            sonuc = await client.from('ses_tasarimi_isleri').insert(yenidenEklenecek(duzenlenen, satir)).select('id');
            yenidenEklendi = true;
          }
        } else {
          const enSon = isler.reduce((m, x) => Math.max(m, x.sira || 0), 0);
          sonuc = await client.from('ses_tasarimi_isleri').insert(Object.assign(satir, { sira: enSon + 10 })).select('id');
        }
        if (sonuc.error || !sonuc.data || !sonuc.data.length) throw new Error((sonuc.error && sonuc.error.message) || 'Kayıt bulunamadı ya da yetkin yok.');
        // Düzenlemede yerine yenisi gelen eski dosyalar R2'den silinir.
        if (duzenlenen && !yenidenEklendi) {
          const eski = [];
          if (kapak && duzenlenen.kapak_r2) eski.push(duzenlenen.kapak_r2);
          if (video && duzenlenen.video_r2) eski.push(duzenlenen.video_r2);
          if (eski.length) await window.DerinR2.sil(KOVA, eski);
        }
        goster(false);
        await yenile();
      } catch (err) {
        if (yeniYollar.length) await window.DerinR2.sil(KOVA, yeniYollar);
        yaz('Kaydedilemedi: ' + ((err && err.message) || ''), 'err');
        ilerleme.hidden = true;
      } finally {
        dugme.disabled = false;
      }
    };
    return {
      duzenle: is => goster(true, is),
      // Düzenlenen iş silinirse form kapanır; eski kayda kaydetmeye çalışmasın.
      silindi: id => { if (duzenlenen && duzenlenen.id === id) goster(false); }
    };
  }

  function yonetimiBagla(form) {
    const duzenle = form.duzenle;
    grid.addEventListener('click', async e => {
      const d = e.target.closest('[data-st-duzenle]');
      if (d) { const is = isler.find(x => x.id === d.dataset.stDuzenle); if (is) duzenle(is); return; }
      const s = e.target.closest('[data-st-sil]');
      if (s) {
        const is = isler.find(x => x.id === s.dataset.stSil); if (!is) return;
        if (!confirm(`"${is.baslik}" silinsin mi? Videosu ve kapağı da silinir, geri alınamaz.`)) return;
        s.disabled = true; s.textContent = 'SİLİNİYOR…';
        const { data, error } = await client.from('ses_tasarimi_isleri').delete().eq('id', is.id).select('id');
        if (error || !data || !data.length) { alert('Silinemedi: ' + ((error && error.message) || 'kayıt bulunamadı ya da yetkin yok.')); await yenile(); return; }
        const yollar = [is.video_r2, is.kapak_r2].filter(Boolean);
        if (yollar.length) await window.DerinR2.sil(KOVA, yollar);
        form.silindi(is.id);
        await yenile();
        return;
      }
      const yon = e.target.closest('[data-st-sola]') ? -1 : e.target.closest('[data-st-saga]') ? 1 : 0;
      if (yon) {
        const b = e.target.closest('button');
        const degisim = siraDegistir(isler, b.dataset.stSola || b.dataset.stSaga, yon);
        if (!degisim) return;
        for (const x of degisim) {
          const { data, error } = await client.from('ses_tasarimi_isleri').update({ sira: x.sira }).eq('id', x.id).select('id');
          if (error || !data || !data.length) { alert('Sıra kaydedilemedi: ' + ((error && error.message) || 'yetkin yok.')); break; }
        }
        await yenile();
      }
    });
  }

  let yonetici = false;
  async function yenile() {
    const { data, error } = await client.from('ses_tasarimi_isleri').select('*').order('sira').order('created_at');
    if (error) return false;
    isler = data || [];
    ciz(yonetici);
    return true;
  }

  async function basla() {
    if (!grid || !modal) return;
    document.getElementById('sd-modal-close').onclick = modalKapat;
    modal.addEventListener('click', e => { if (e.target === modal) modalKapat(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && modal.classList.contains('on')) modalKapat(); });
    kartlariBagla(); // tablo gelene dek koddaki eski kartlar çalışsın
    let auth = null;
    try { auth = window.DerinAuth && await window.DerinAuth.ready; } catch (e) { auth = null; }
    client = auth && auth.client;
    if (!client) return;
    yonetici = window.DerinAuth.profile?.role === 'admin';
    if (!(await yenile())) return; // tablo kurulmadıysa eski kartlar kalır
    if (yonetici) yonetimiBagla(formKur());
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', basla); else basla();
})();
