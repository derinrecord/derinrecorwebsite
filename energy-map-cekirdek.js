/* Derin Record — Enerji Grafiği analiz çekirdeği
 * Tarayıcıda ve Node'da çalışır. Girdi: mono Float32Array + örnekleme hızı.
 * Çıktı: tempo (BPM + güven), tempo eğrisi, algılanan yükseklik (enerji) eğrisi,
 * en yoğun bölüm ve log-frekans spektrogramı.
 */
(function (kok) {
  'use strict';

  // ---------- FFT (radix-2, yerinde) ----------
  function fftHazirla(n) {
    const bit = Math.log2(n);
    const ters = new Uint32Array(n);
    for (let i = 0; i < n; i++) {
      let r = 0;
      for (let b = 0; b < bit; b++) r |= ((i >> b) & 1) << (bit - 1 - b);
      ters[i] = r;
    }
    const cos = new Float32Array(n / 2), sin = new Float32Array(n / 2);
    for (let i = 0; i < n / 2; i++) {
      cos[i] = Math.cos((2 * Math.PI * i) / n);
      sin[i] = -Math.sin((2 * Math.PI * i) / n);
    }
    return { n, ters, cos, sin };
  }
  function fft(h, re, im) {
    const { n, ters, cos, sin } = h;
    for (let i = 0; i < n; i++) {
      const j = ters[i];
      if (j > i) {
        let t = re[i]; re[i] = re[j]; re[j] = t;
        t = im[i]; im[i] = im[j]; im[j] = t;
      }
    }
    for (let boy = 2; boy <= n; boy <<= 1) {
      const yari = boy >> 1, adim = n / boy;
      for (let i = 0; i < n; i += boy) {
        for (let j = 0, k = 0; j < yari; j++, k += adim) {
          const a = i + j, b = a + yari;
          const tr = re[b] * cos[k] - im[b] * sin[k];
          const ti = re[b] * sin[k] + im[b] * cos[k];
          re[b] = re[a] - tr; im[b] = im[a] - ti;
          re[a] += tr; im[a] += ti;
        }
      }
    }
  }

  // K-ağırlığı (ITU-R BS.1770) genlik yanıtı: yüksek raf + yüksek geçiren.
  function kAgirlik(f) {
    const raf = 1 + (Math.pow(10, 4 / 20) - 1) / (1 + Math.pow(1681 / Math.max(f, 1), 2));
    const r = Math.pow(f / 38, 2);
    const hp = r / Math.sqrt(1 + r * r);
    return raf * hp;
  }

  const ara = (dizi, x) => {
    if (x <= 0) return dizi[0];
    const i = Math.floor(x);
    if (i >= dizi.length - 1) return dizi[dizi.length - 1];
    const f = x - i;
    return dizi[i] * (1 - f) + dizi[i + 1] * f;
  };

  function otokorelasyon(s) {
    const N = s.length;
    let ort = 0;
    for (let i = 0; i < N; i++) ort += s[i];
    ort /= N;
    let n = 1;
    while (n < 2 * N) n <<= 1;
    const h = fftHazirla(n);
    const re = new Float32Array(n), im = new Float32Array(n);
    for (let i = 0; i < N; i++) re[i] = s[i] - ort;
    fft(h, re, im);
    for (let i = 0; i < n; i++) { re[i] = re[i] * re[i] + im[i] * im[i]; im[i] = 0; }
    fft(h, re, im); // gerçek & simetrik: ileri FFT ters FFT ile aynı (ölçek hariç)
    const a = new Float32Array(N);
    const sifir = re[0] || 1e-9;
    for (let i = 0; i < N; i++) a[i] = re[i] / sifir;
    return a;
  }

  // Harmonik tarak: gerçek vuruş, katlarında (2, 3, 4 vuruş) da tekrar eder.
  // Böylece 156 BPM'lik parça 104'e (2/3) ya da 78'e (1/2) kaymaz.
  function tarakPuani(a, kare, bpm) {
    let p = 0;
    const w = [1, 0.5, 0.33, 0.25];
    for (let k = 1; k <= 4; k++) p += w[k - 1] * ara(a, (k * 60 * kare) / bpm);
    return p;
  }
  // Spor müziği çoğunlukla 100–180 BPM: 135 merkezli yumuşak tercih.
  const onsel = bpm => Math.exp(-0.5 * Math.pow(Math.log2(bpm / 135) / 0.7, 2));

  function tempoBul(a, kare, alt = 60, ust = 200) {
    let enIyi = -Infinity, enIyiBpm = 0;
    const puanlar = [];
    for (let b = alt; b <= ust + 1e-9; b += 0.1) {
      const p = tarakPuani(a, kare, b) * (0.5 + 0.5 * onsel(b));
      puanlar.push(p);
      if (p > enIyi) { enIyi = p; enIyiBpm = b; }
    }
    // güven: vuruş aralığındaki ham tekrar gücü (0,3 ve üstü = çok net)
    const guven = Math.max(0, Math.min(1, ara(a, (60 * kare) / enIyiBpm) / 0.3));
    return { bpm: Math.round(enIyiBpm * 10) / 10, puan: enIyi, guven };
  }

  function analizEt(veri, sr, secenek = {}) {
    const N = 2048;
    const hop = Math.round(sr * 0.01); // 10 ms
    const kare = sr / hop;
    const kareSayisi = Math.max(0, 1 + Math.floor((veri.length - N) / hop));
    if (kareSayisi < 300) throw new Error('kısa');

    const h = fftHazirla(N);
    const pencere = new Float32Array(N);
    for (let i = 0; i < N; i++) pencere[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1));
    const kutu = N / 2 + 1;
    const binHz = sr / N;
    const akiUst = Math.min(kutu, Math.floor(11000 / binHz));
    const kAg = new Float32Array(kutu);
    for (let k = 0; k < kutu; k++) { const g = kAgirlik(k * binHz); kAg[k] = g * g; }

    // spektrogram bantları (log frekans, 30 Hz – 16 kHz)
    const BANT = secenek.bant || 96;
    const fAlt = 30, fUst = Math.min(16000, sr / 2 - 1);
    const bantSinir = new Uint16Array(BANT + 1);
    for (let b = 0; b <= BANT; b++) {
      const f = fAlt * Math.pow(fUst / fAlt, b / BANT);
      bantSinir[b] = Math.min(kutu - 1, Math.max(1, Math.round(f / binHz)));
    }
    const SUTUN = secenek.sutun || 480;
    const spek = new Float32Array(SUTUN * BANT); // güç toplamı
    const spekSay = new Uint16Array(SUTUN);

    const aki = new Float32Array(kareSayisi);
    const guc = new Float32Array(kareSayisi); // K-ağırlıklı ortalama güç
    const re = new Float32Array(N), im = new Float32Array(N);
    const yan = secenek.yan || null; // stereo yan sinyal (L-R)/2: LUFS için kanal gücü
    const re2 = yan ? new Float32Array(N) : null, im2 = yan ? new Float32Array(N) : null;
    let onceki = new Float32Array(akiUst), simdiki = new Float32Array(akiUst);
    const mag = new Float32Array(kutu);

    for (let f = 0; f < kareSayisi; f++) {
      const bas = f * hop;
      for (let i = 0; i < N; i++) { re[i] = veri[bas + i] * pencere[i]; im[i] = 0; }
      fft(h, re, im);
      let kg = 0;
      for (let k = 0; k < kutu; k++) {
        const p = re[k] * re[k] + im[k] * im[k];
        mag[k] = Math.sqrt(p);
        kg += p * kAg[k];
      }
      if (yan) {
        for (let i = 0; i < N; i++) { re2[i] = yan[bas + i] * pencere[i]; im2[i] = 0; }
        fft(h, re2, im2);
        let ks = 0;
        for (let k = 0; k < kutu; k++) ks += (re2[k] * re2[k] + im2[k] * im2[k]) * kAg[k];
        kg = 2 * (kg + ks); // L² + R² = 2(M² + S²)  (BS.1770 kanal toplamı)
      }
      guc[f] = kg;
      let toplam = 0;
      for (let k = 0; k < akiUst; k++) {
        const l = Math.log1p(1000 * mag[k]);
        simdiki[k] = l;
        const d = l - onceki[k];
        if (d > 0 && f) toplam += d;
      }
      aki[f] = toplam;
      const t = onceki; onceki = simdiki; simdiki = t;

      const s = Math.min(SUTUN - 1, Math.floor((f / kareSayisi) * SUTUN));
      spekSay[s]++;
      const o = s * BANT;
      for (let b = 0; b < BANT; b++) {
        let e = 0;
        const k0 = bantSinir[b], k1 = Math.max(k0 + 1, bantSinir[b + 1]);
        for (let k = k0; k < k1; k++) e += mag[k] * mag[k];
        spek[o + b] += e / (k1 - k0);
      }
    }

    // ---------- tempo ----------
    const yarim = Math.round(0.25 * kare);
    const giris = new Float32Array(kareSayisi);
    {
      // kayan ortalama (merkezli)
      const ps = new Float64Array(kareSayisi + 1);
      for (let i = 0; i < kareSayisi; i++) ps[i + 1] = ps[i] + aki[i];
      for (let i = 0; i < kareSayisi; i++) {
        const a0 = Math.max(0, i - yarim), a1 = Math.min(kareSayisi, i + yarim);
        giris[i] = Math.max(0, aki[i] - (ps[a1] - ps[a0]) / (a1 - a0));
      }
    }
    const genelAcf = otokorelasyon(giris);
    const genel = tempoBul(genelAcf, kare);

    // tempo eğrisi: 8 sn pencere, 1 sn adım; genel tempoya yakın aralıkta ara
    const tempoEgri = [];
    const pen = Math.round(8 * kare), adim = Math.round(kare);
    if (genel.bpm && kareSayisi > pen) {
      for (let bas = 0; bas + pen <= kareSayisi; bas += adim) {
        const a = otokorelasyon(giris.subarray(bas, bas + pen));
        const y = tempoBul(a, kare, genel.bpm * 0.92, Math.min(200, genel.bpm * 1.08));
        tempoEgri.push({ t: (bas + pen / 2) / kare, bpm: y.bpm, guven: y.guven });
      }
      // 5'li ortanca süzgeç: tek tük sıçramalar eğriyi bozmasın
      const ham = tempoEgri.map(n => n.bpm);
      tempoEgri.forEach((n, i) => {
        const p = ham.slice(Math.max(0, i - 3), i + 4).sort((x, y) => x - y);
        n.bpm = p[Math.floor(p.length / 2)];
      });
    }

    // ---------- algılanan yükseklik (LUFS benzeri) ----------
    // kısa süreli: 3 sn pencere; ani (momentary): 400 ms
    const kisa = new Float32Array(kareSayisi), ani = new Float32Array(kareSayisi);
    {
      const ps = new Float64Array(kareSayisi + 1);
      for (let i = 0; i < kareSayisi; i++) ps[i + 1] = ps[i] + guc[i];
      const ort = (i, w) => {
        const a0 = Math.max(0, i - w), a1 = Math.min(kareSayisi, i + w);
        return (ps[a1] - ps[a0]) / (a1 - a0);
      };
      // Hann penceresi enerji düzeltmesi; 0,86 = K-ağırlığı yaklaşımının ffmpeg ebur128 ile
      // ölçülen ~0,65 dB farkının kalibrasyonu (3 Derin Record parçası, 21 Kasım)
      const olcek = (2 / (N * N * 0.375)) * 0.86;
      for (let i = 0; i < kareSayisi; i++) {
        kisa[i] = -0.691 + 10 * Math.log10(ort(i, Math.round(1.5 * kare)) * olcek + 1e-12);
        ani[i] = -0.691 + 10 * Math.log10(ort(i, Math.round(0.2 * kare)) * olcek + 1e-12);
      }
    }
    // tümleşik yükseklik (−70 mutlak ve −10 göreli kapılı)
    let gTop = 0, gSay = 0;
    for (let i = 0; i < kareSayisi; i += 10) if (ani[i] > -70) { gTop += Math.pow(10, ani[i] / 10); gSay++; }
    let tumlesik = gSay ? 10 * Math.log10(gTop / gSay) : -70;
    gTop = 0; gSay = 0;
    for (let i = 0; i < kareSayisi; i += 10) if (ani[i] > tumlesik - 10) { gTop += Math.pow(10, ani[i] / 10); gSay++; }
    if (gSay) tumlesik = 10 * Math.log10(gTop / gSay);

    const DILIM = secenek.dilim || 200;
    const egriDb = new Float32Array(DILIM);
    for (let d = 0; d < DILIM; d++) {
      const a0 = Math.floor((d / DILIM) * kareSayisi), a1 = Math.max(a0 + 1, Math.floor(((d + 1) / DILIM) * kareSayisi));
      let e = 0;
      for (let i = a0; i < a1; i++) e += Math.pow(10, kisa[i] / 10);
      egriDb[d] = 10 * Math.log10(e / (a1 - a0) + 1e-12);
    }
    const siraDb = Array.from(egriDb).sort((x, y) => x - y);
    const tavan = siraDb[Math.floor(DILIM * 0.98)];
    const ARALIK = 18; // tavanın 18 dB altı = sıfır
    const oran = db => Math.max(0, Math.min(1, (db - (tavan - ARALIK)) / ARALIK));
    const egri = Array.from(egriDb, oran);
    const ortalama = egri.reduce((s, v) => s + v, 0) / DILIM;

    // en yoğun bölüm: ~%6'lık kayan pencere
    const pencereD = Math.max(3, Math.round(DILIM * 0.06));
    let enIyi = -1, enIyiBas = 0;
    for (let i = 0; i + pencereD <= DILIM; i++) {
      let s = 0;
      for (let k = i; k < i + pencereD; k++) s += egri[k];
      if (s > enIyi) { enIyi = s; enIyiBas = i; }
    }

    // spektrogram: dB, 0..1
    const spekDb = new Float32Array(SUTUN * BANT);
    let spekMax = -Infinity;
    for (let s = 0; s < SUTUN; s++) {
      const c = Math.max(1, spekSay[s]);
      for (let b = 0; b < BANT; b++) {
        const v = 10 * Math.log10(spek[s * BANT + b] / c + 1e-12);
        spekDb[s * BANT + b] = v;
        if (v > spekMax) spekMax = v;
      }
    }
    const SPEK_ARALIK = 72;
    const spektrum = new Uint8Array(SUTUN * BANT);
    for (let i = 0; i < spekDb.length; i++) {
      spektrum[i] = Math.round(255 * Math.max(0, Math.min(1, (spekDb[i] - (spekMax - SPEK_ARALIK)) / SPEK_ARALIK)));
    }
    const bantFrekans = Array.from({ length: BANT }, (_, b) => fAlt * Math.pow(fUst / fAlt, (b + 0.5) / BANT));

    return {
      sure: veri.length / sr,
      tempo: genel.bpm || null,
      tempoGuven: genel.guven,
      tempoEgri,
      egri, egriDb: Array.from(egriDb), tavanDb: tavan, aralikDb: ARALIK,
      ortalama, tumlesikLufs: tumlesik,
      tepeBas: enIyiBas, tepeGenislik: pencereD, dilim: DILIM,
      spektrum, sutun: SUTUN, bant: BANT, bantFrekans
    };
  }

  // Tarayıcı yardımcıları: AudioBuffer -> mono
  function monoYap(buffer) {
    const n = buffer.length, c = buffer.numberOfChannels;
    if (c === 1) return buffer.getChannelData(0);
    const m = new Float32Array(n);
    for (let k = 0; k < c; k++) {
      const d = buffer.getChannelData(k);
      for (let i = 0; i < n; i++) m[i] += d[i] / c;
    }
    return m;
  }

  function yanYap(buffer) {
    if (buffer.numberOfChannels !== 2) return null;
    const a = buffer.getChannelData(0), b = buffer.getChannelData(1), n = buffer.length;
    const s = new Float32Array(n);
    for (let i = 0; i < n; i++) s[i] = (a[i] - b[i]) / 2;
    return s;
  }

  const api = { analizEt, monoYap, yanYap };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else kok.DerinEnerji = api;
})(typeof self !== 'undefined' ? self : this);
