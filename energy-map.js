(() => {
  const dosyaGirdi = document.querySelector('#audio-file');
  const audio = document.querySelector('#audio');
  const canvas = document.querySelector('#energy-chart');
  if (!dosyaGirdi || !audio || !canvas) return;

  const ctx = canvas.getContext('2d');
  const panel = document.querySelector('#bant');
  const bosKatman = document.querySelector('#bant-bos');
  const baslik = document.querySelector('#bant-baslik');
  const durum = document.querySelector('#energy-status');
  const dosyaAdi = document.querySelector('#dosya-adi');
  const avgEl = document.querySelector('#avg');
  const bpmEl = document.querySelector('#bpm');
  const bpmBirim = document.querySelector('#bpm-birim');
  const tepeEl = document.querySelector('#tepe');
  const okuma = document.querySelector('#enerji-okuma');
  const gecenEl = document.querySelector('#gecen');
  const sureEl = document.querySelector('#sure');
  const oynatBtn = document.querySelector('#oynat');
  const konum = document.querySelector('#konum');
  const bantCizgi = [...document.querySelectorAll('#bantlar-cizgi i')];
  const bantYazi = Object.fromEntries(
    [...document.querySelectorAll('[data-band-yazi]')].map(el => [el.dataset.bandYazi, el])
  );

  const DILIM = 160;
  const renk = {
    zemin: '#f4f1e9',
    izgara: 'rgba(11, 11, 13, .09)',
    ayrac: 'rgba(11, 11, 13, .2)',
    taban: 'rgba(11, 11, 13, .5)',
    eksen: 'rgba(11, 11, 13, .5)',
    metin: '#4a443f',
    ortalama: '#a8800c',
    tepe: '#cb2468',
    imlec: '#ff352e'
  };

  const durum_ = { values: [], average: 0, duration: 0, peakStart: 0, peakSpan: 8, hover: -1, hazir: false };
  let engine = null;
  let url = '';

  const zaman = s => {
    if (!isFinite(s) || s < 0) s = 0;
    const t = Math.floor(s);
    if (t >= 3600) {
      return `${Math.floor(t / 3600)}:${String(Math.floor((t % 3600) / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
    }
    return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
  };

  const yuzde = v => `%${Math.round(v * 100)}`;

  /* ---------------- çizim ---------------- */

  function olcum() {
    const w = canvas.clientWidth || 640;
    const h = canvas.clientHeight || 360;
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const sol = 4;
    const sag = w - (w < 480 ? 34 : 44);
    const ust = 20;
    const alt = h - 30;
    return { w, h, sol, sag, ust, alt, gw: sag - sol, gh: alt - ust };
  }

  const y = (deger, m) => m.alt - deger * m.gh;

  function izgara(m) {
    [0.25, 0.5, 0.75].forEach(oran => {
      const py = Math.round(y(oran, m)) + .5;
      ctx.strokeStyle = renk.izgara;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(m.sol, py);
      ctx.lineTo(m.sag, py);
      ctx.stroke();
    });

    // düşük / orta / yüksek band ayraçları
    ctx.strokeStyle = renk.ayrac;
    ctx.setLineDash([3, 6]);
    [0.33, 0.66].forEach(oran => {
      const py = Math.round(y(oran, m)) + .5;
      ctx.beginPath();
      ctx.moveTo(m.sol, py);
      ctx.lineTo(m.sag, py);
      ctx.stroke();
    });
    ctx.setLineDash([]);

    if (!durum_.values.length) return;

    ctx.strokeStyle = renk.taban;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(m.sol, Math.round(m.alt) + .5);
    ctx.lineTo(m.sag, Math.round(m.alt) + .5);
    ctx.stroke();
  }

  function olcek(m) {
    ctx.font = '600 10px Arial, Helvetica, sans-serif';
    ctx.fillStyle = renk.eksen;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    [['yüksek', 0.83], ['orta', 0.5], ['düşük', 0.17]].forEach(([etiket, oran]) => {
      ctx.fillText(etiket, m.w - 4, y(oran, m));
    });

    if (!durum_.duration) return;

    const adim = 8;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    for (let i = 0; i <= adim; i++) {
      const px = m.sol + (m.gw * i) / adim;
      const buyuk = i % 2 === 0;
      ctx.strokeStyle = buyuk ? 'rgba(11,11,13,.38)' : 'rgba(11,11,13,.2)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(px, m.alt + 4);
      ctx.lineTo(px, m.alt + (buyuk ? 10 : 7));
      ctx.stroke();
      if (buyuk) {
        ctx.fillStyle = renk.eksen;
        const lx = Math.min(m.sag - 12, Math.max(m.sol + 12, px));
        ctx.fillText(zaman((durum_.duration * i) / adim), lx, m.h - 6);
      }
    }
  }

  function cubuklar(m) {
    const { values } = durum_;
    const slot = m.gw / DILIM;
    const kalinlik = Math.max(1, slot * 0.68);
    const dolgu = ctx.createLinearGradient(0, m.ust, 0, m.alt);
    dolgu.addColorStop(0, '#2c2824');
    dolgu.addColorStop(1, '#0b0b0d');
    ctx.fillStyle = dolgu;

    values.forEach((deger, i) => {
      const h = Math.max(0.012, deger) * m.gh;
      const bx = m.sol + i * slot + (slot - kalinlik) / 2;
      ctx.fillRect(bx, m.alt - h, kalinlik, h);
    });

    // en yoğun bölüm: taban çizgisinin altında pembe işaret
    ctx.fillStyle = renk.tepe;
    ctx.fillRect(m.sol + durum_.peakStart * slot, m.alt + 1, durum_.peakSpan * slot, 3);

    // ortalama
    const ay = Math.round(y(durum_.average, m)) + .5;
    ctx.strokeStyle = renk.ortalama;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 5]);
    ctx.beginPath();
    ctx.moveTo(m.sol, ay);
    ctx.lineTo(m.sag, ay);
    ctx.stroke();
    ctx.setLineDash([]);

    const etiket = `ort. ${yuzde(durum_.average)}`;
    ctx.font = '700 10px Arial, Helvetica, sans-serif';
    const genislik = ctx.measureText(etiket).width + 10;
    ctx.fillStyle = renk.zemin;
    ctx.fillRect(m.sol, ay - 16, genislik, 13);
    ctx.fillStyle = renk.ortalama;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(etiket, m.sol + 5, ay - 9.5);
  }

  function oynatmaCizgisi(m) {
    if (!durum_.hazir || !durum_.duration) return;
    const oran = Math.min(1, Math.max(0, audio.currentTime / durum_.duration));
    const px = Math.min(m.sag - 1, Math.max(m.sol + 1, Math.round(m.sol + m.gw * oran))) + .5;
    ctx.strokeStyle = renk.imlec;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(px, m.ust - 6);
    ctx.lineTo(px, m.alt);
    ctx.stroke();
    ctx.fillStyle = renk.imlec;
    ctx.fillRect(px - 3, m.ust - 10, 6, 6);
  }

  function imlec(m) {
    const i = durum_.hover;
    if (i < 0 || i >= durum_.values.length) return;
    const slot = m.gw / DILIM;
    const cx = Math.round(m.sol + i * slot + slot / 2) + .5;
    const deger = durum_.values[i];

    ctx.strokeStyle = 'rgba(11,11,13,.35)';
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 4]);
    ctx.beginPath();
    ctx.moveTo(cx, m.ust);
    ctx.lineTo(cx, m.alt);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = renk.tepe;
    ctx.beginPath();
    ctx.arc(cx, y(deger, m), 3.5, 0, Math.PI * 2);
    ctx.fill();

    const metin = `${zaman((durum_.duration * i) / DILIM)} · ${yuzde(deger)}`;
    ctx.font = '700 11px Arial, Helvetica, sans-serif';
    const genislik = ctx.measureText(metin).width + 18;
    const bx = Math.min(Math.max(cx - genislik / 2, m.sol), m.sag - genislik);
    ctx.fillStyle = '#0b0b0d';
    ctx.fillRect(bx, m.ust - 4, genislik, 22);
    ctx.fillStyle = renk.tepe;
    ctx.fillRect(bx, m.ust - 4, 3, 22);
    ctx.fillStyle = '#f4f1e9';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(metin, bx + genislik / 2 + 1.5, m.ust + 7.5);
  }

  function okumaYaz(i) {
    if (!okuma) return;
    if (i < 0 || i >= durum_.values.length) {
      okuma.textContent = '';
      return;
    }
    const deger = durum_.values[i];
    const bant = deger < 0.33 ? 'düşük' : deger < 0.66 ? 'orta' : 'yüksek';
    okuma.textContent = `${zaman((durum_.duration * i) / DILIM)}, enerji ${yuzde(deger)}, ${bant}.`;
  }

  function draw() {
    const m = olcum();
    ctx.clearRect(0, 0, m.w, m.h);
    ctx.fillStyle = renk.zemin;
    ctx.fillRect(0, 0, m.w, m.h);
    if (!durum_.values.length) return;
    izgara(m);
    cubuklar(m);
    olcek(m);
    oynatmaCizgisi(m);
    imlec(m);
  }

  /* ---------------- analiz ---------------- */

  function kanallariAl(buffer) {
    const kanallar = [];
    for (let c = 0; c < buffer.numberOfChannels; c++) kanallar.push(buffer.getChannelData(c));
    return kanallar;
  }

  function enerjiHaritasi(buffer, kanallar) {
    const adim = Math.max(1, Math.floor(buffer.length / DILIM));
    const ham = [];

    for (let i = 0; i < DILIM; i++) {
      const bas = i * adim;
      const son = Math.min(buffer.length, bas + adim);
      let toplam = 0;
      for (let k = bas; k < son; k++) {
        let ornek = 0;
        for (let c = 0; c < kanallar.length; c++) ornek += kanallar[c][k];
        ornek /= kanallar.length;
        toplam += ornek * ornek;
      }
      ham.push(son > bas ? Math.sqrt(toplam / (son - bas)) : 0);
    }

    // Parçanın kendi en yüksek bölümüne göre oranla: sessiz kayıtlar da dolu görünsün.
    // Tavan, tek tek vuruşların (kick) binmesini engellemek için yumuşatılmış zarftan alınır.
    const yumusak = ham.map((v, i) => ((ham[i - 1] ?? v) + v + (ham[i + 1] ?? v)) / 3);
    const sirali = [...yumusak].sort((a, b) => a - b);
    const tavan = sirali[Math.floor(sirali.length * 0.95)] || 0.001;
    durum_.values = ham.map(v => Math.min(1, Math.max(0.04, v / tavan)));
    durum_.average = durum_.values.reduce((sum, v) => sum + v, 0) / durum_.values.length;

    // En yoğun bölüm: parçanın %5'i kadar kayan bir pencere.
    const pencere = Math.max(3, Math.round(DILIM * 0.05));
    let enIyi = -1;
    let enIyiBas = 0;
    for (let i = 0; i + pencere <= durum_.values.length; i++) {
      let toplam = 0;
      for (let k = i; k < i + pencere; k++) toplam += durum_.values[k];
      const ortalama = toplam / pencere;
      if (ortalama > enIyi) {
        enIyi = ortalama;
        enIyiBas = i;
      }
    }
    durum_.peakStart = enIyiBas;
    durum_.peakSpan = pencere;
  }

  // Tempo, enerji zarfının kendi kendine benzerliğinden (otokorelasyon) çıkarılır:
  // sabit vuruşlu bir parçanın zarfı, vuruş aralığı kadar kaydırılınca kendini yineler.
  function tahminiTempo(buffer, kanallar) {
    const hop = Math.max(128, Math.round(buffer.sampleRate * 0.0116));
    const zarf = [];

    for (let i = 0; i + hop <= buffer.length; i += hop) {
      let toplam = 0;
      for (let k = i; k < i + hop; k++) {
        let ornek = 0;
        for (let c = 0; c < kanallar.length; c++) ornek += kanallar[c][k];
        ornek /= kanallar.length;
        toplam += ornek * ornek;
      }
      zarf.push(Math.sqrt(toplam / hop));
    }
    if (zarf.length < 64) return null;

    // Vuruş başlangıçları: zarfın yalnızca artan kısmı.
    const giris = zarf.map((v, i) => (i ? Math.max(0, v - zarf[i - 1]) : 0));
    const hopSn = hop / buffer.sampleRate;
    const enKisa = Math.max(4, Math.round(60 / 200 / hopSn));
    const enUzun = Math.round(60 / 60 / hopSn);
    let enIyi = 0;
    let enIyiGecikme = 0;

    for (let gecikme = enKisa; gecikme <= enUzun; gecikme++) {
      let toplam = 0;
      for (let i = 0; i + gecikme < giris.length; i++) toplam += giris[i] * giris[i + gecikme];
      const puan = toplam / (giris.length - gecikme);
      if (puan > enIyi) {
        enIyi = puan;
        enIyiGecikme = gecikme;
      }
    }
    if (!enIyiGecikme || enIyi <= 0) return null;

    let bpm = 60 / (enIyiGecikme * hopSn);
    while (bpm < 70) bpm *= 2;
    while (bpm > 180) bpm /= 2;
    return Math.round(bpm);
  }

  /* ---------------- arayüz ---------------- */

  function boyutYaz(bytes) {
    if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1).replace('.', ',')} MB`;
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }

  function bantlariYaz() {
    const sayim = { dusuk: 0, orta: 0, yuksek: 0 };
    durum_.values.forEach(v => {
      sayim[v < 0.33 ? 'dusuk' : v < 0.66 ? 'orta' : 'yuksek']++;
    });
    const toplam = durum_.values.length || 1;
    bantCizgi.forEach(el => {
      el.style.flex = `0 0 ${(sayim[el.dataset.band] / toplam) * 100}%`;
    });
    const bantAdi = { dusuk: 'düşük', orta: 'orta', yuksek: 'yüksek' };
    Object.entries(sayim).forEach(([ad, adet]) => {
      if (bantYazi[ad]) bantYazi[ad].textContent = `${bantAdi[ad]} ${yuzde(adet / toplam)}`;
    });
  }

  function sifirla() {
    durum_.values = [];
    durum_.average = 0;
    durum_.duration = 0;
    durum_.peakStart = 0;
    durum_.hover = -1;
    durum_.hazir = false;
    avgEl.textContent = '—';
    bpmEl.textContent = '—';
    bpmBirim.hidden = true;
    tepeEl.textContent = '—';
    gecenEl.textContent = '0:00';
    sureEl.textContent = '0:00';
    konum.value = '0';
    konum.disabled = true;
    oynatBtn.disabled = true;
    oynatBtn.textContent = '▶';
    oynatBtn.setAttribute('aria-label', 'Parçayı oynat');
    bosKatman.hidden = false;
    if (okuma) okuma.textContent = '';
    baslik.textContent = 'Analiz bekleniyor';
    dosyaAdi.textContent = 'Dosya seçilmedi';
    bantCizgi.forEach(el => { el.style.flex = '0 0 0%'; });
    if (bantYazi.dusuk) bantYazi.dusuk.textContent = 'düşük —';
    if (bantYazi.orta) bantYazi.orta.textContent = 'orta —';
    if (bantYazi.yuksek) bantYazi.yuksek.textContent = 'yüksek —';
  }

  async function analizEt(secilen) {
    if (!secilen) return;
    durum.textContent = 'Analiz ediliyor…';
    try {
      if (!engine) engine = new (window.AudioContext || window.webkitAudioContext)();
      if (engine.state === 'suspended') await engine.resume();

      const buf = await engine.decodeAudioData(await secilen.arrayBuffer());
      if (url) URL.revokeObjectURL(url);
      url = URL.createObjectURL(secilen);
      audio.src = url;

      durum_.duration = buf.duration;
      durum_.hover = -1;
      const kanallar = kanallariAl(buf);
      enerjiHaritasi(buf, kanallar);
      const bpm = tahminiTempo(buf, kanallar);

      avgEl.textContent = yuzde(durum_.average);
      bpmEl.textContent = bpm ? `~${bpm}` : '—';
      bpmBirim.hidden = !bpm;
      tepeEl.textContent = zaman((durum_.duration * durum_.peakStart) / DILIM);
      gecenEl.textContent = '0:00';
      sureEl.textContent = zaman(durum_.duration);
      baslik.textContent = secilen.name;
      dosyaAdi.textContent = `${zaman(durum_.duration)} · ${boyutYaz(secilen.size)}`;
      bantlariYaz();
      bosKatman.hidden = true;
      konum.disabled = false;
      konum.value = '0';
      oynatBtn.disabled = false;
      durum_.hazir = true;
      durum.textContent = 'Bir noktaya tıkla; parça oradan çalsın.';
      canvas.setAttribute(
        'aria-label',
        `Enerji dağılım grafiği: ortalama ${yuzde(durum_.average)}, tempo ${bpm ? `yaklaşık ${bpm} BPM` : 'ölçülemedi'}, en yoğun bölüm ${zaman((durum_.duration * durum_.peakStart) / DILIM)}. Ok tuşlarıyla bölümleri gez.`
      );
      draw();
    } catch (error) {
      sifirla();
      durum.textContent = 'Bu dosya analiz edilemedi. Başka bir ses dosyası dene.';
      draw();
    }
  }

  /* ---------------- olaylar ---------------- */

  dosyaGirdi.addEventListener('change', () => analizEt(dosyaGirdi.files[0]));

  let surukleme = 0;
  panel.addEventListener('dragenter', event => {
    event.preventDefault();
    surukleme++;
    panel.classList.add('is-over');
  });
  panel.addEventListener('dragover', event => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  });
  panel.addEventListener('dragleave', () => {
    surukleme = Math.max(0, surukleme - 1);
    if (!surukleme) panel.classList.remove('is-over');
  });
  panel.addEventListener('drop', event => {
    event.preventDefault();
    surukleme = 0;
    panel.classList.remove('is-over');
    const secilen = event.dataTransfer?.files?.[0];
    if (secilen) analizEt(secilen);
  });

  oynatBtn.addEventListener('click', async () => {
    if (engine && engine.state === 'suspended') await engine.resume();
    if (audio.paused) {
      try {
        await audio.play();
      } catch (error) {
        durum.textContent = 'Parça başlatılamadı. Dosyayı yeniden seç.';
      }
    } else {
      audio.pause();
    }
  });

  audio.addEventListener('play', () => {
    oynatBtn.textContent = '❚❚';
    oynatBtn.setAttribute('aria-label', 'Parçayı duraklat');
  });
  const durduruldu = () => {
    oynatBtn.textContent = '▶';
    oynatBtn.setAttribute('aria-label', 'Parçayı oynat');
  };
  audio.addEventListener('pause', durduruldu);
  audio.addEventListener('ended', () => {
    durduruldu();
    konum.value = '1000';
    draw();
  });

  audio.addEventListener('timeupdate', () => {
    if (!durum_.duration) return;
    gecenEl.textContent = zaman(audio.currentTime);
    konum.value = String(Math.round((audio.currentTime / durum_.duration) * 1000));
    draw();
  });

  konum.addEventListener('input', () => {
    if (!durum_.duration) return;
    audio.currentTime = (Number(konum.value) / 1000) * durum_.duration;
    gecenEl.textContent = zaman(audio.currentTime);
    draw();
  });

  function konumdanZaman(event) {
    const m = olcum();
    const x = event.clientX - canvas.getBoundingClientRect().left - m.sol;
    const oran = Math.min(1, Math.max(0, x / m.gw));
    return oran * durum_.duration;
  }

  canvas.addEventListener('pointermove', event => {
    if (!durum_.values.length) return;
    const m = olcum();
    const x = event.clientX - canvas.getBoundingClientRect().left - m.sol;
    const index = Math.floor((x / m.gw) * DILIM);
    const yeni = x < 0 || index >= DILIM ? -1 : index;
    if (yeni !== durum_.hover) {
      durum_.hover = yeni;
      okumaYaz(yeni);
      draw();
    }
  });
  canvas.addEventListener('pointerleave', () => {
    if (durum_.hover === -1) return;
    durum_.hover = -1;
    okumaYaz(-1);
    draw();
  });

  canvas.addEventListener('pointerdown', event => {
    if (!durum_.hazir) {
      dosyaGirdi.click();
      return;
    }
    audio.currentTime = konumdanZaman(event);
    gecenEl.textContent = zaman(audio.currentTime);
    konum.value = String(Math.round((audio.currentTime / durum_.duration) * 1000));
    draw();
  });

  canvas.addEventListener('keydown', event => {
    if (!durum_.values.length) return;
    const son = durum_.values.length - 1;
    let hedef = durum_.hover < 0 ? 0 : durum_.hover;

    if (event.key === 'ArrowRight') hedef = Math.min(son, hedef + 1);
    else if (event.key === 'ArrowLeft') hedef = Math.max(0, hedef - 1);
    else if (event.key === 'Home') hedef = 0;
    else if (event.key === 'End') hedef = son;
    else if (event.key === 'Enter' && durum_.hover >= 0) {
      audio.currentTime = (durum_.duration * durum_.hover) / DILIM;
      gecenEl.textContent = zaman(audio.currentTime);
      konum.value = String(Math.round((audio.currentTime / durum_.duration) * 1000));
      event.preventDefault();
      draw();
      return;
    } else return;

    event.preventDefault();
    durum_.hover = hedef;
    okumaYaz(hedef);
    draw();
  });

  canvas.addEventListener('blur', () => {
    if (durum_.hover === -1) return;
    durum_.hover = -1;
    okumaYaz(-1);
    draw();
  });

  window.addEventListener('resize', draw);
  sifirla();
  draw();
})();
