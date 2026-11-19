// Derin Record — görsel kırpma penceresi (20 Kasım 2026)
//
// Derin'in isteği: sanatçı fotoğrafı (ve şarkı kapağı) yüklenmeden önce
// ayarlanabilsin. Kare çerçevede fotoğraf sürüklenir, kaydırıcıyla (ya da
// fare tekerleği / iki parmakla) yakınlaştırılır; "Kullan" kare JPEG üretir.
// Kullanım: const blob = await DerinGorselKirp.ac(dosya, { yuvarlak: true, boyut: 1200 });
// Vazgeçilirse null döner.
(() => {
  'use strict';

  const STIL = `
  .gk-perde{position:fixed;inset:0;z-index:1000;background:rgba(0,0,0,.78);display:flex;align-items:center;justify-content:center;padding:16px}
  .gk-kutu{width:min(440px,100%);background:#141317;border:1px solid #2a2930;border-radius:14px;padding:20px;display:flex;flex-direction:column;gap:14px;color:#f4f1e9;font:400 15px/1.5 Inter,Arial,sans-serif}
  .gk-kutu h2{margin:0;font-size:18px}
  .gk-kutu p{margin:0;color:#a8a5a0;font-size:14px}
  .gk-alan{position:relative;width:100%;aspect-ratio:1;border-radius:10px;overflow:hidden;background:#0b0b0d;touch-action:none;cursor:grab;user-select:none}
  .gk-alan:active{cursor:grabbing}
  .gk-alan canvas{width:100%;height:100%;display:block}
  .gk-maske{position:absolute;inset:0;pointer-events:none;border-radius:50%;box-shadow:0 0 0 9999px rgba(11,11,13,.55);outline:1px solid rgba(255,255,255,.35)}
  .gk-yakin{display:flex;align-items:center;gap:12px}
  .gk-yakin input{flex:1;accent-color:#cb2468;height:28px}
  .gk-dugmeler{display:flex;gap:8px;justify-content:flex-end}
  .gk-dugmeler button{min-height:44px;padding:0 18px;border-radius:8px;border:1px solid #34333a;background:transparent;color:#f4f1e9;font:600 15px Inter,Arial,sans-serif;cursor:pointer}
  .gk-dugmeler .gk-kullan{background:#cb2468;border-color:#cb2468;color:#fff}`;

  function stilEkle() {
    if (document.getElementById('gk-stil')) return;
    const s = document.createElement('style');
    s.id = 'gk-stil'; s.textContent = STIL;
    document.head.appendChild(s);
  }

  function resimYukle(dosya) {
    return new Promise((ok, hata) => {
      const adres = URL.createObjectURL(dosya);
      const img = new Image();
      img.onload = () => ok({ img, adres });
      img.onerror = () => { URL.revokeObjectURL(adres); hata(new Error('Görsel açılamadı.')); };
      img.src = adres;
    });
  }

  async function ac(dosya, ayar) {
    const { yuvarlak = false, boyut = 1200, baslik = 'Fotoğrafı ayarla' } = ayar || {};
    if (!dosya || !/^image\//.test(dosya.type)) return null;
    stilEkle();
    const { img, adres } = await resimYukle(dosya);
    const onceki = document.activeElement;

    return new Promise(bitti => {
      const perde = document.createElement('div');
      perde.className = 'gk-perde';
      perde.innerHTML = `<div class="gk-kutu" role="dialog" aria-modal="true" aria-labelledby="gk-baslik">
          <h2 id="gk-baslik">${baslik}</h2>
          <p>Sürükleyerek yerini, kaydırıcıyla yakınlığını ayarla.</p>
          <div class="gk-alan"><canvas></canvas>${yuvarlak ? '<span class="gk-maske"></span>' : ''}</div>
          <label class="gk-yakin"><span aria-hidden="true">−</span><input type="range" min="1" max="4" step="0.01" value="1" aria-label="Yakınlaştır"><span aria-hidden="true">+</span></label>
          <div class="gk-dugmeler"><button type="button" class="gk-vazgec">Vazgeç</button><button type="button" class="gk-kullan">Kullan</button></div>
        </div>`;
      document.body.appendChild(perde);
      const alan = perde.querySelector('.gk-alan');
      const tuval = perde.querySelector('canvas');
      const kaydirici = perde.querySelector('input[type=range]');
      const ctx = tuval.getContext('2d');

      // Durum: yakınlık (1 = kısa kenar çerçeveyi doldurur) ve merkez kayması (çerçeve oranı).
      const d = { z: 1, x: 0, y: 0 };
      const taban = () => Math.max(1 / img.naturalWidth, 1 / img.naturalHeight); // çerçeve=1 birim
      const sinirla = () => {
        const o = taban() * d.z;
        const yw = img.naturalWidth * o, yh = img.naturalHeight * o; // çerçeveye göre görsel boyu (≥1)
        const mx = (yw - 1) / 2, my = (yh - 1) / 2;
        d.x = Math.min(mx, Math.max(-mx, d.x));
        d.y = Math.min(my, Math.max(-my, d.y));
      };
      function ciz(c, kenar) {
        const o = taban() * d.z * kenar;
        const w = img.naturalWidth * o, h = img.naturalHeight * o;
        c.fillStyle = '#0b0b0d'; c.fillRect(0, 0, kenar, kenar);
        c.drawImage(img, kenar / 2 - w / 2 + d.x * kenar, kenar / 2 - h / 2 + d.y * kenar, w, h);
      }
      function yenile() {
        const r = alan.getBoundingClientRect();
        const k = Math.round(r.width * (window.devicePixelRatio || 1));
        if (tuval.width !== k) { tuval.width = k; tuval.height = k; }
        ciz(ctx, k);
      }

      // Sürükleme ve iki parmakla yakınlaştırma
      const parmak = new Map();
      let iki = null;
      alan.addEventListener('pointerdown', e => { alan.setPointerCapture(e.pointerId); parmak.set(e.pointerId, { x: e.clientX, y: e.clientY }); });
      alan.addEventListener('pointermove', e => {
        const once = parmak.get(e.pointerId); if (!once) return;
        const gen = alan.getBoundingClientRect().width;
        parmak.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (parmak.size === 2) {
          const [a, b] = [...parmak.values()];
          const mesafe = Math.hypot(a.x - b.x, a.y - b.y);
          if (iki) { d.z = Math.min(4, Math.max(1, d.z * mesafe / iki)); kaydirici.value = d.z; }
          iki = mesafe;
        } else {
          d.x += (e.clientX - once.x) / gen; d.y += (e.clientY - once.y) / gen;
        }
        sinirla(); yenile();
      });
      const birak = e => { parmak.delete(e.pointerId); if (parmak.size < 2) iki = null; };
      alan.addEventListener('pointerup', birak);
      alan.addEventListener('pointercancel', birak);
      alan.addEventListener('wheel', e => {
        e.preventDefault();
        d.z = Math.min(4, Math.max(1, d.z * (e.deltaY < 0 ? 1.06 : 1 / 1.06)));
        kaydirici.value = d.z; sinirla(); yenile();
      }, { passive: false });
      kaydirici.addEventListener('input', () => { d.z = Number(kaydirici.value); sinirla(); yenile(); });
      window.addEventListener('resize', yenile);

      function kapat(sonuc) {
        window.removeEventListener('resize', yenile);
        document.removeEventListener('keydown', tus);
        perde.remove();
        URL.revokeObjectURL(adres);
        if (onceki && onceki.focus) onceki.focus();
        bitti(sonuc);
      }
      const tus = e => { if (e.key === 'Escape') kapat(null); };
      document.addEventListener('keydown', tus);
      perde.querySelector('.gk-vazgec').onclick = () => kapat(null);
      perde.querySelector('.gk-kullan').onclick = () => {
        const cikti = document.createElement('canvas');
        cikti.width = boyut; cikti.height = boyut;
        ciz(cikti.getContext('2d'), boyut);
        cikti.toBlob(b => kapat(b), 'image/jpeg', 0.9);
      };
      perde.addEventListener('click', e => { if (e.target === perde) kapat(null); });
      requestAnimationFrame(yenile);
      perde.querySelector('.gk-kullan').focus();
    });
  }

  window.DerinGorselKirp = { ac };
})();
