// Dalga formu verisi — Ableton tarzı.
// Her kanal için ayrı (stereo: sol + sağ şerit), her dilimde (saniyede `hz` adet)
// en düşük (mn) ve en yüksek (mx) örnek tutulur: içi dolu, tırtıklı gerçek kontur.
//
// WAV dosyaları zaten çözülmüş ses (PCM) içerir: tarayıcının ağır çözücüsü
// yerine örnekler doğrudan okunur. Okuma AKIŞLA yapılır (wavAkis): ses indikçe
// dilimler dolar, dalga dosyanın tamamı inmeden soldan sağa çizilebilir.
// Veri yapısı: { n, hz, duration, kanal, hazir, tepe, mn:[kanal başına], mx:[kanal başına] }
//   hazir: dolu dilim sayısı (akışta artar), tepe: en büyük mutlak değer.
(() => {
  const VARSAYILAN_HZ = 200;

  const EN_COK_KANAL = 2;   // stereo yeter; 5.1 gibi dosyalarda ilk iki kanal

  function yeniVeri(hz, n, duration, kanal) {
    const v = { n, hz, duration, kanal, hazir: 0, tepe: 0, mn: [], mx: [] };
    for (let c = 0; c < kanal; c++) { v.mn.push(new Float32Array(n)); v.mx.push(new Float32Array(n)); }
    return v;
  }

  function genislet(v, gereken) {
    if (gereken <= v.mn[0].length) return;
    const yeniBoy = Math.max(gereken, Math.ceil(v.mn[0].length * 1.5) + 64);
    for (const k of ['mn', 'mx']) for (let c = 0; c < v.kanal; c++) { const a = new Float32Array(yeniBoy); a.set(v[k][c]); v[k][c] = a; }
  }

  // Sonuçta en büyük mutlak değer 1 olur (sessiz kayıt da okunur görünür).
  function normalize(v) {
    if (v.tepe > 0 && v.tepe !== 1) {
      const k = 1 / v.tepe;
      for (let c = 0; c < v.kanal; c++) for (let i = 0; i < v.n; i++) { v.mn[c][i] *= k; v.mx[c][i] *= k; }
    }
    v.tepe = v.n ? 1 : 0;
    return v;
  }

  function wavMi(u8) {
    return !!u8 && u8.length >= 12 && u8[0] === 82 && u8[1] === 73 && u8[2] === 70 && u8[3] === 70 &&
      u8[8] === 87 && u8[9] === 65 && u8[10] === 86 && u8[11] === 69;
  }

  // Akışlı WAV okuyucu: ekle(Uint8Array) → veri() ile o ana kadarki dalga; bitir() → son hali.
  function wavAkis(hz) {
    hz = hz || VARSAYILAN_HZ;
    let bas = new Uint8Array(0);   // başlık okunana kadar biriken baytlar
    let fmt = null, hata = false, v = null, artik = null;
    let kareNo = 0, kova = -1, kMn = null, kMx = null, kSay = 0, kanalSay = 1;
    let bps = 0, kare = 0, oku = null, veriKalan = Infinity;

    function baslikCoz() {
      const u = bas, dv = new DataView(u.buffer, u.byteOffset, u.byteLength);
      if (u.length < 12) return false;
      if (!wavMi(u)) { hata = true; return false; }
      const id = o => String.fromCharCode(u[o], u[o + 1], u[o + 2], u[o + 3]);
      let o = 12;
      while (o + 8 <= u.length) {
        const ad = id(o), boy = dv.getUint32(o + 4, true);
        if (ad === 'fmt ') {
          if (o + 8 + 16 > u.length) return false;
          fmt = { bicim: dv.getUint16(o + 8, true), kanal: dv.getUint16(o + 10, true), sr: dv.getUint32(o + 12, true), bit: dv.getUint16(o + 22, true) };
          if (fmt.bicim === 0xfffe) { if (o + 8 + 26 > u.length) return false; fmt.bicim = dv.getUint16(o + 32, true); }
        } else if (ad === 'data') {
          if (!fmt || !fmt.kanal || !fmt.sr) { hata = true; return false; }
          bps = fmt.bit / 8; kare = bps * fmt.kanal;
          if (fmt.bicim === 3 && fmt.bit === 32) oku = (d, p) => d.getFloat32(p, true);
          else if (fmt.bicim !== 1) { hata = true; return false; }
          else if (fmt.bit === 16) oku = (d, p) => d.getInt16(p, true) / 32768;
          else if (fmt.bit === 24) oku = (d, p) => { let x = d.getUint8(p) | (d.getUint8(p + 1) << 8) | (d.getUint8(p + 2) << 16); if (x & 0x800000) x -= 0x1000000; return x / 8388608; };
          else if (fmt.bit === 32) oku = (d, p) => d.getInt32(p, true) / 2147483648;
          else if (fmt.bit === 8) oku = (d, p) => (d.getUint8(p) - 128) / 128;
          else { hata = true; return false; }
          const gecerli = boy > 0 && boy !== 0xffffffff;
          veriKalan = gecerli ? boy : Infinity;
          const toplamKare = gecerli ? Math.floor(boy / kare) : 0;
          const duration = toplamKare / fmt.sr;
          kanalSay = Math.min(EN_COK_KANAL, fmt.kanal);
          kMn = new Float64Array(kanalSay); kMx = new Float64Array(kanalSay);
          v = yeniVeri(hz, gecerli ? Math.max(1, Math.ceil(duration * hz)) : 1, duration, kanalSay);
          if (!gecerli) v.n = 0;
          const kalan = u.subarray(o + 8);
          bas = null;
          if (kalan.length) isle(kalan);
          return true;
        }
        o += 8 + boy + (boy & 1);
      }
      if (u.length > 4 * 1024 * 1024) hata = true; // makul bir başlık bu kadar uzun olmaz
      return false;
    }

    function kovaKapat() {
      if (kova < 0 || !kSay) return;
      genislet(v, kova + 1);
      for (let c = 0; c < kanalSay; c++) {
        v.mn[c][kova] = kMn[c]; v.mx[c][kova] = kMx[c];
        const a = Math.max(kMx[c], -kMn[c]); if (a > v.tepe) v.tepe = a;
      }
      if (kova + 1 > v.n) v.n = kova + 1;
      v.hazir = kova + 1;
    }

    function isle(parca) {
      let u = parca;
      if (artik && artik.length) { const b = new Uint8Array(artik.length + parca.length); b.set(artik); b.set(parca, artik.length); u = b; }
      let boy = u.length;
      if (veriKalan !== Infinity) { boy = Math.min(boy, veriKalan); }
      const tamKare = Math.floor(boy / kare);
      const dv = new DataView(u.buffer, u.byteOffset, u.byteLength);
      const sr = fmt.sr;
      for (let k = 0; k < tamKare; k++) {
        const hedef = Math.floor(kareNo * hz / sr);
        if (hedef !== kova) { kovaKapat(); kova = hedef; kMn.fill(Infinity); kMx.fill(-Infinity); kSay = 0; }
        const p = k * kare;
        for (let c = 0; c < kanalSay; c++) {
          const x = oku(dv, p + c * bps);
          if (x < kMn[c]) kMn[c] = x; if (x > kMx[c]) kMx[c] = x;
        }
        kSay++;
        kareNo++;
      }
      const tuketilen = tamKare * kare;
      if (veriKalan !== Infinity) veriKalan -= tuketilen;
      artik = veriKalan > 0 ? u.slice(tuketilen, boy) : null;
    }

    return {
      ekle(parca) {
        if (hata || !parca || !parca.length) return;
        if (bas) {
          const b = new Uint8Array(bas.length + parca.length); b.set(bas); b.set(parca, bas.length); bas = b;
          baslikCoz();
          return;
        }
        if (veriKalan <= 0) return;
        isle(parca);
      },
      wavDegil() { return hata; },
      veri() { return v; },
      bitir() {
        if (hata || !v) return null;
        kovaKapat();
        if (!v.duration) v.duration = kareNo / fmt.sr;
        v.n = v.hazir;
        return normalize(v);
      }
    };
  }

  function wavTepeleri(buf, hz) {
    const a = wavAkis(hz);
    a.ekle(new Uint8Array(buf));
    return a.bitir();
  }

  // Tarayıcının çözdüğü ses (MP3, FLAC…) için: kanal dizilerinden aynı yapı.
  function pcmTepeleri(kanallar, sr, hz) {
    hz = hz || VARSAYILAN_HZ;
    kanallar = kanallar.slice(0, EN_COK_KANAL);
    const uzunluk = kanallar[0].length, duration = uzunluk / sr;
    const n = Math.max(1, Math.ceil(duration * hz));
    const v = yeniVeri(hz, n, duration, kanallar.length);
    for (let c = 0; c < kanallar.length; c++) {
      const d = kanallar[c];
      for (let i = 0; i < n; i++) {
        const s = Math.floor(i * sr / hz), e = Math.min(uzunluk, Math.floor((i + 1) * sr / hz));
        let mn = Infinity, mx = -Infinity;
        for (let j = s; j < e; j++) { const x = d[j]; if (x < mn) mn = x; if (x > mx) mx = x; }
        if (e <= s) { mn = 0; mx = 0; }
        v.mn[c][i] = mn; v.mx[c][i] = mx;
        const a = Math.max(mx, -mn); if (a > v.tepe) v.tepe = a;
      }
    }
    v.hazir = n;
    return normalize(v);
  }

  // Saklama metni (yan dosya ve tarayıcı): d3|süre|hz|kanal|base64(her dilimde kanal başına mn,mx baytı)
  function kodla(v) {
    const n = v.n, k = v.tepe > 0 ? 1 / v.tepe : 1;
    const q = x => Math.max(-127, Math.min(127, Math.round(x * k * 127))) & 255;
    const parcalar = [];
    let s = '';
    for (let i = 0; i < n; i++) {
      for (let c = 0; c < v.kanal; c++) s += String.fromCharCode(q(v.mn[c][i]), q(v.mx[c][i]));
      if (s.length > 30000) { parcalar.push(s); s = ''; }
    }
    parcalar.push(s);
    return 'd3|' + v.duration + '|' + v.hz + '|' + v.kanal + '|' + btoa(parcalar.join(''));
  }

  const isaretli = b => (b > 127 ? b - 256 : b) / 127;

  function coz(metin) {
    try {
      const p = String(metin || '').split('|');
      if (p[0] === 'd3' && p.length === 5) {
        const duration = Number(p[1]), hz = Number(p[2]), kanal = Number(p[3]);
        if (!(duration > 0) || !(hz > 0) || !(kanal >= 1 && kanal <= EN_COK_KANAL)) return null;
        const s = atob(p[4]), adim = 2 * kanal, n = Math.floor(s.length / adim);
        const v = yeniVeri(hz, n, duration, kanal);
        for (let i = 0; i < n; i++) for (let c = 0; c < kanal; c++) {
          v.mn[c][i] = isaretli(s.charCodeAt(i * adim + c * 2)); v.mx[c][i] = isaretli(s.charCodeAt(i * adim + c * 2 + 1));
        }
        v.hazir = n; v.tepe = n ? 1 : 0;
        return v;
      }
      // Önceki biçimler (tek şerit): okunur, "eski" işaretlenir; uygun olunca yenisi yazılır.
      if (p[0] === 'd2' && p.length === 4) {
        const duration = Number(p[1]), hz = Number(p[2]);
        if (!(duration > 0) || !(hz > 0)) return null;
        const s = atob(p[3]), n = Math.floor(s.length / 3);
        const v = yeniVeri(hz, n, duration, 1);
        for (let i = 0; i < n; i++) { v.mn[0][i] = isaretli(s.charCodeAt(i * 3)); v.mx[0][i] = isaretli(s.charCodeAt(i * 3 + 1)); }
        v.hazir = n; v.tepe = n ? 1 : 0; v.eski = true;
        return v;
      }
      if (p[0] === 'd1' && p.length === 3) {
        const duration = Number(p[1]); if (!(duration > 0) || !p[2]) return null;
        const s = atob(p[2]), n = s.length;
        const v = yeniVeri(n / duration, n, duration, 1);
        for (let i = 0; i < n; i++) { const a = s.charCodeAt(i) / 255; v.mx[0][i] = a; v.mn[0][i] = -a; }
        v.hazir = n; v.tepe = n ? 1 : 0; v.eski = true;
        return v;
      }
      return null;
    } catch { return null; }
  }

  window.DerinDalga = { HZ: VARSAYILAN_HZ, wavMi, wavAkis, wavTepeleri, pcmTepeleri, kodla, coz };
})();
