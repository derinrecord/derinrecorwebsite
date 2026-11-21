// Derin Record ikonları (21 Kasım 2026, Derin'in seçimi):
//   • Dosya türleri (WAV, MP3, FLAC, AIFF, M4A, OGG, video, görsel, dekont) → "makara bant" belge ikonu
//   • "Dosya ekle" → yuvarlak köşeli kare, pembe artı
//   • Diğer butonlar (indir, yükle, oynat, klasör, bilgi) → pembe yuvarlak
// İkonlar assets/ikonlar/ klasöründe. Bu dosya uygulama.js tarafından her sayfaya yüklenir.
//
// Ne yapar (sayfadaki kodu bozmadan, yalnız görünüşü değiştirir):
//   1) Görünen her <input type="file"> yerinde kalır ama gizlenir; yanına "Dosya ekle" butonu
//      çizilir. Dosya seçilince butonun yanında dosyanın adı ve kendi format ikonu görünür.
//   2) Gizli dosya girişini saran etiketlere ("Dekont yükle", "+ YENİ PARÇA" gibi) küçük ikon eklenir.
//   3) İndirme düğmeleri (Projelerim [data-dl], Müzik kataloğu [data-indir]) format ikonunu alır.
//   4) Başka sayfalar isterse: window.DerinIkon.dosya('ad.wav') → <img> HTML'i döner;
//      ya da bir öğeye data-dosya-ikon="ad.wav" yazmak yeterli.
(() => {
  if (window.DerinIkon) return;
  const YOL = 'assets/ikonlar/';
  const SURUM = '?v=2';
  const TUR = {
    wav: 'wav', wave: 'wav', mp3: 'mp3', flac: 'flac', aif: 'aiff', aiff: 'aiff', aifc: 'aiff',
    m4a: 'm4a', aac: 'm4a', ogg: 'ogg', oga: 'ogg', opus: 'ogg',
    mp4: 'video', mov: 'video', m4v: 'video', webm: 'video',
    jpg: 'gorsel', jpeg: 'gorsel', png: 'gorsel', webp: 'gorsel', heic: 'gorsel', heif: 'gorsel', gif: 'gorsel',
    pdf: 'dekont'
  };
  const ATLA = '.istek-birak'; // kendi sürükle-bırak kutusu olan alanlar olduğu gibi kalır

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const tur = (ad) => TUR[(String(ad || '').split('.').pop() || '').toLowerCase()] || 'wav';
  const img = (dosya, sinif, alt) =>
    `<img class="${sinif}" src="${YOL}${dosya}.svg${SURUM}" alt="${esc(alt || '')}"${alt ? '' : ' aria-hidden="true"'} width="32" height="32" decoding="async">`;
  const dosya = (ad, sinif) => img('dosya-' + tur(ad), sinif || 'dri-dosya', tur(ad).toUpperCase());

  const css = `
.dri-gizli{position:absolute!important;width:1px!important;height:1px!important;padding:0!important;margin:-1px!important;overflow:hidden!important;clip:rect(0 0 0 0)!important;white-space:nowrap!important;border:0!important;opacity:0!important}
.dri-sec{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:6px;min-width:0}
.dri-dugme{display:inline-flex;align-items:center;gap:10px;min-height:44px;padding:5px 16px 5px 6px;border:1px solid #2a2930;border-radius:14px;background:#141317;color:#f4f1e9;font:600 15px/1.2 Inter,system-ui,sans-serif;letter-spacing:0;text-transform:none;cursor:pointer;transition:border-color .15s}
.dri-dugme:hover{border-color:#cb2468}
.dri-dugme img{width:34px;height:34px;flex:none}
input.dri-gizli:focus-visible+.dri-sec .dri-dugme{outline:2px solid #cb2468;outline-offset:2px}
input.dri-gizli:disabled+.dri-sec .dri-dugme{opacity:.5;cursor:not-allowed}
.dri-secilen{display:flex;align-items:center;gap:8px;min-width:0;color:#c9c6bf;font:400 14px/1.3 Inter,system-ui,sans-serif}
.dri-secilen span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:min(320px,60vw)}
.dri-dosya{width:32px;height:32px;flex:none}
.dri-etiket-ikon{width:22px;height:22px;flex:none;vertical-align:middle;margin-inline-end:8px}
.dri-indir-ikon{width:28px;height:28px;flex:none;vertical-align:middle;margin-inline-end:6px}
[data-dl]:has(.dri-indir-ikon),[data-indir]:has(.dri-indir-ikon){display:inline-flex;align-items:center}
`;
  const stil = document.createElement('style');
  stil.id = 'dr-ikonlar-stil';
  stil.textContent = css;
  (document.head || document.documentElement).appendChild(stil);

  const L = (tr, en) => (document.documentElement.lang || '').toLowerCase().startsWith('en') ? en : tr;

  function secilenYaz(input, kutu) {
    const dosyalar = Array.from(input.files || []);
    const hedef = kutu.querySelector('.dri-secilen');
    if (!dosyalar.length) { hedef.innerHTML = ''; return; }
    if (dosyalar.length === 1) {
      hedef.innerHTML = dosya(dosyalar[0].name) + `<span title="${esc(dosyalar[0].name)}">${esc(dosyalar[0].name)}</span>`;
    } else {
      hedef.innerHTML = dosya(dosyalar[0].name) + `<span>${dosyalar.length} ${L('dosya seçildi', 'files selected')}</span>`;
    }
  }

  function gorunurDosyaGirisi(input) {
    if (input.dataset.dri) return;
    input.dataset.dri = '1';
    const etiketIcinde = !!input.closest('label');
    const kutu = document.createElement('span');
    kutu.className = 'dri-sec';
    kutu.innerHTML = `<span class="dri-dugme" role="presentation">${img('dosya-ekle', '', '')}${L('Dosya ekle', 'Add file')}</span><span class="dri-secilen" aria-live="polite"></span>`;
    input.classList.add('dri-gizli');
    input.insertAdjacentElement('afterend', kutu);
    // Etiketin içindeyse tıklamayı etiket zaten girişe iletir; değilse biz iletiriz.
    if (!etiketIcinde) kutu.querySelector('.dri-dugme').addEventListener('click', () => { if (!input.disabled) input.click(); });
    input.addEventListener('change', () => secilenYaz(input, kutu));
    const form = input.form;
    if (form) form.addEventListener('reset', () => setTimeout(() => secilenYaz(input, kutu), 0));
  }

  function gizliGirisEtiketi(input) {
    const etiket = input.closest('label');
    if (!etiket || etiket.dataset.dri || etiket.matches(ATLA)) return;
    etiket.dataset.dri = '1';
    const kabul = String(input.accept || '').toLowerCase();
    const dekont = /pdf/.test(kabul) && !/audio/.test(kabul);
    // "+ YENİ PARÇA" gibi baştaki artı işareti ikonla aynı işi yapar; kaldırılır.
    const ilk = etiket.firstChild;
    if (ilk && ilk.nodeType === 3) ilk.textContent = ilk.textContent.replace(/^\s*\+\s*/, '');
    etiket.insertAdjacentHTML('afterbegin', img(dekont ? 'buton-yukle' : 'dosya-ekle', 'dri-etiket-ikon', ''));
  }

  function indirDugmesi(b) {
    if (b.dataset.driIndir) return;
    b.dataset.driIndir = '1';
    const ad = b.dataset.bicim ? 'x.' + b.dataset.bicim : (b.dataset.ad || b.dataset.name || '');
    // Baştaki "⤓" işaretini kaldır; yerine format ikonu gelir.
    const ilk = b.firstChild;
    if (ilk && ilk.nodeType === 3) ilk.textContent = ilk.textContent.replace(/^\s*⤓\s*/, '');
    b.insertAdjacentHTML('afterbegin', dosya(ad, 'dri-indir-ikon'));
  }

  function tara(kok) {
    if (!kok || !kok.querySelectorAll) return;
    kok.querySelectorAll('input[type="file"]:not([data-dri])').forEach((input) => {
      if (input.closest(ATLA)) { input.dataset.dri = '1'; return; }
      const gizli = input.hidden || input.classList.contains('se-gizli') || getComputedStyle(input).display === 'none';
      if (gizli) { input.dataset.dri = '1'; gizliGirisEtiketi(input); }
      else gorunurDosyaGirisi(input);
    });
    kok.querySelectorAll('[data-dl][data-bicim]:not([data-dri-indir]),[data-indir][data-ad]:not([data-dri-indir])').forEach(indirDugmesi);
    kok.querySelectorAll('[data-dosya-ikon]:not([data-dri-ikon])').forEach((el) => {
      el.dataset.driIkon = '1';
      el.insertAdjacentHTML('afterbegin', dosya(el.dataset.dosyaIkon));
    });
  }

  let bekliyor = false;
  const gozcu = new MutationObserver(() => {
    if (bekliyor) return;
    bekliyor = true;
    requestAnimationFrame(() => { bekliyor = false; tara(document.body); });
  });

  function basla() {
    tara(document.body);
    gozcu.observe(document.body, { childList: true, subtree: true });
  }

  window.DerinIkon = { dosya, tur, tara, img: (ad, sinif, alt) => img(ad, sinif || '', alt) };
  if (document.body) basla(); else document.addEventListener('DOMContentLoaded', basla);
})();
