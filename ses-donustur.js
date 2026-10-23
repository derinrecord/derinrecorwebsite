// Ses biçimi çevirici (Projelerim · WAV ve MP3 indirme).
// Dosya antrenörün tarayıcısında çevrilir: sunucuya yük yok, depoda ikinci
// kopya yok. WAV yazımı saf JS; MP3 kodlama lamejs ile (yalnız gerektiğinde
// CDN'den yüklenir). Çözme (mp3/flac/wav → örnekler) tarayıcının
// decodeAudioData'sı ile yapılır.
// Not: MP3'ten WAV'a çevirmek kaliteyi artırmaz; yalnız biçimi değiştirir.
(() => {
  'use strict';

  const LAME_ADRESI = 'https://cdn.jsdelivr.net/npm/lamejs@1.2.1/lame.min.js';
  const BLOK = 1152;      // MP3 çerçevesi başına örnek
  const KBPS = 320;

  const uzanti = yol => (String(yol || '').split('?')[0].split('.').pop() || '').toLowerCase();

  function dosyaAdi(ad, bicim) {
    const kok = String(ad || '').replace(/\.(wav|mp3|flac|aiff?|m4a|ogg)$/i, '').trim() || 'parca';
    return kok + '.' + bicim;
  }

  function cevirmeGerekli(yol, bicim) {
    return uzanti(yol) !== bicim;
  }

  // Float32 kanallar → 16-bit PCM WAV (ArrayBuffer).
  function wavKodla(kanallar, hiz) {
    const kanal = kanallar.length;
    const n = kanal ? kanallar[0].length : 0;
    const veri = n * kanal * 2;
    const buf = new ArrayBuffer(44 + veri);
    const v = new DataView(buf);
    const yaz = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    yaz(0, 'RIFF'); v.setUint32(4, 36 + veri, true); yaz(8, 'WAVE');
    yaz(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, kanal, true);
    v.setUint32(24, hiz, true); v.setUint32(28, hiz * kanal * 2, true); v.setUint16(32, kanal * 2, true); v.setUint16(34, 16, true);
    yaz(36, 'data'); v.setUint32(40, veri, true);
    let o = 44;
    for (let i = 0; i < n; i++) {
      for (let k = 0; k < kanal; k++) {
        const x = Math.max(-1, Math.min(1, kanallar[k][i]));
        v.setInt16(o, x < 0 ? x * 32768 : x * 32767, true);
        o += 2;
      }
    }
    return buf;
  }

  const int16 = f => {
    const c = new Int16Array(f.length);
    for (let i = 0; i < f.length; i++) { const x = Math.max(-1, Math.min(1, f[i])); c[i] = x < 0 ? x * 32768 : x * 32767; }
    return c;
  };

  // Float32 kanallar → MP3 Blob. s: { lame, Blob, ilerleme(yuzde) }
  async function mp3Kodla(kanallar, hiz, s) {
    s = s || {};
    const lame = s.lame;
    const B = s.Blob || Blob;
    const stereo = kanallar.length > 1;
    const kod = new lame.Mp3Encoder(stereo ? 2 : 1, hiz, KBPS);
    const sol = int16(kanallar[0]);
    const sag = stereo ? int16(kanallar[1]) : null;
    const parcalar = [];
    let sonBildirim = -1;
    for (let i = 0; i < sol.length; i += BLOK) {
      const l = sol.subarray(i, i + BLOK);
      const cikti = stereo ? kod.encodeBuffer(l, sag.subarray(i, i + BLOK)) : kod.encodeBuffer(l);
      if (cikti.length) parcalar.push(cikti);
      const yuzde = Math.floor(((i + BLOK) / sol.length) * 100);
      if (s.ilerleme && yuzde >= sonBildirim + 5) {
        sonBildirim = yuzde; s.ilerleme(Math.min(99, yuzde));
        // Tarayıcı ekranı güncelleyebilsin.
        await new Promise(r => setTimeout(r, 0));
      }
    }
    const son = kod.flush();
    if (son.length) parcalar.push(son);
    if (s.ilerleme) s.ilerleme(100);
    return new B(parcalar, { type: 'audio/mpeg' });
  }

  let lameSozu = null;
  function lameYukle() {
    if (typeof window !== 'undefined' && window.lamejs) return Promise.resolve(window.lamejs);
    if (lameSozu) return lameSozu;
    lameSozu = new Promise((tamam, hata) => {
      const s = document.createElement('script');
      s.src = LAME_ADRESI;
      s.onload = () => (window.lamejs ? tamam(window.lamejs) : hata(new Error('MP3 kodlayıcı yüklenemedi.')));
      s.onerror = () => { lameSozu = null; hata(new Error('MP3 kodlayıcı yüklenemedi.')); };
      document.head.appendChild(s);
    });
    return lameSozu;
  }

  async function coz(blob) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ctx = new Ctx();
    try {
      const ses = await ctx.decodeAudioData(await blob.arrayBuffer());
      const kanallar = [];
      for (let k = 0; k < Math.min(2, ses.numberOfChannels); k++) kanallar.push(ses.getChannelData(k));
      return { kanallar, hiz: ses.sampleRate };
    } finally {
      try { ctx.close(); } catch (e) {}
    }
  }

  // Kaynak Blob'u istenen biçime çevirir (gerekmiyorsa aynen döner).
  async function cevir(blob, kaynakYol, bicim, ilerleme) {
    if (!cevirmeGerekli(kaynakYol, bicim)) return blob;
    const { kanallar, hiz } = await coz(blob);
    if (bicim === 'wav') return new Blob([wavKodla(kanallar, hiz)], { type: 'audio/wav' });
    const lame = await lameYukle();
    return mp3Kodla(kanallar, hiz, { lame, ilerleme });
  }

  const api = { LAME_ADRESI, dosyaAdi, cevirmeGerekli, wavKodla, mp3Kodla, cevir };
  if (typeof window !== 'undefined') window.DerinSesDonustur = api;
  if (typeof module !== 'undefined') module.exports = api;
})();
