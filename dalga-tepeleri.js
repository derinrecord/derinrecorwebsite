// Dalga formu tepeleri — hızlı yol.
// WAV dosyaları zaten çözülmüş ses (PCM) içerir; tarayıcının decodeAudioData
// adımı büyük dosyada hem saniyeler sürer hem yüzlerce MB bellek ister.
// Burada başlığı okuyup örnekleri doğrudan tarıyoruz. WAV değilse null döner
// ve sayfa eski yola (tarayıcı çözücüsü) düşer.
(() => {
  // hedefHz: saniye başına tepe sayısı (yakın plan için ~60 yeterli).
  function wavTepeleri(buf, hedefHz) {
    if (!buf || buf.byteLength < 44) return null;
    const dv = new DataView(buf);
    const id = o => String.fromCharCode(dv.getUint8(o), dv.getUint8(o + 1), dv.getUint8(o + 2), dv.getUint8(o + 3));
    if (id(0) !== 'RIFF' || id(8) !== 'WAVE') return null;
    let o = 12, fmt = null, veriBas = 0, veriUzun = 0;
    while (o + 8 <= buf.byteLength) {
      const ad = id(o), boy = dv.getUint32(o + 4, true);
      if (ad === 'fmt ') {
        fmt = { bicim: dv.getUint16(o + 8, true), kanal: dv.getUint16(o + 10, true), sr: dv.getUint32(o + 12, true), bit: dv.getUint16(o + 22, true) };
        // WAVE_FORMAT_EXTENSIBLE: asıl biçim alt-biçim alanında.
        if (fmt.bicim === 0xfffe && boy >= 26) fmt.bicim = dv.getUint16(o + 32, true);
      } else if (ad === 'data') {
        veriBas = o + 8;
        veriUzun = Math.min(boy, buf.byteLength - veriBas);
        break;
      }
      o += 8 + boy + (boy & 1);
    }
    if (!fmt || !veriBas || !fmt.kanal || !fmt.sr) return null;
    const bps = fmt.bit / 8, kare = bps * fmt.kanal;
    let oku;
    if (fmt.bicim === 3 && fmt.bit === 32) oku = p => dv.getFloat32(p, true);
    else if (fmt.bicim !== 1) return null;
    else if (fmt.bit === 16) oku = p => dv.getInt16(p, true) / 32768;
    else if (fmt.bit === 24) oku = p => { let x = dv.getUint8(p) | (dv.getUint8(p + 1) << 8) | (dv.getUint8(p + 2) << 16); if (x & 0x800000) x -= 0x1000000; return x / 8388608; };
    else if (fmt.bit === 32) oku = p => dv.getInt32(p, true) / 2147483648;
    else if (fmt.bit === 8) oku = p => (dv.getUint8(p) - 128) / 128;
    else return null;

    const kareSayisi = Math.floor(veriUzun / kare);
    const duration = kareSayisi / fmt.sr;
    const adet = Math.max(1, Math.round(duration * (hedefHz || 60)));
    const blok = kareSayisi / adet;
    // Her tepede en çok ~96 örneğe bakılır: görüntü için yeterli, büyük dosyada çok hızlı.
    const adim = Math.max(1, Math.floor(blok / 96));
    const peaks = new Float32Array(adet);
    let enBuyuk = 0;
    for (let i = 0; i < adet; i++) {
      const bas = Math.floor(i * blok), son = Math.min(kareSayisi, Math.floor((i + 1) * blok));
      let m = 0;
      for (let k = bas; k < son; k += adim) {
        const p = veriBas + k * kare;
        for (let c = 0; c < fmt.kanal; c++) { const v = oku(p + c * bps); const a = v < 0 ? -v : v; if (a > m) m = a; }
      }
      peaks[i] = m; if (m > enBuyuk) enBuyuk = m;
    }
    if (enBuyuk > 0) for (let i = 0; i < adet; i++) peaks[i] /= enBuyuk;
    return { peaks, duration };
  }

  // Tarayıcıda saklamak için kısa metin: süre + 8 bitlik tepe değerleri (base64).
  function kodla({ peaks, duration }) {
    let s = '';
    for (let i = 0; i < peaks.length; i++) s += String.fromCharCode(Math.round(Math.max(0, Math.min(1, peaks[i])) * 255));
    return 'd1|' + duration + '|' + btoa(s);
  }
  function coz(metin) {
    try {
      const [v, d, b] = String(metin || '').split('|');
      if (v !== 'd1' || !b) return null;
      const duration = Number(d); if (!(duration > 0)) return null;
      const s = atob(b), peaks = new Float32Array(s.length);
      for (let i = 0; i < s.length; i++) peaks[i] = s.charCodeAt(i) / 255;
      return { peaks, duration };
    } catch { return null; }
  }

  window.DerinDalga = { wavTepeleri, kodla, coz };
})();
