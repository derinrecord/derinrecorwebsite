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
  const oynatImlec = document.querySelector('#oynat-imlec');
  const bantCizgi = [...document.querySelectorAll('#bantlar-cizgi i')];
  const bantYazi = Object.fromEntries(
    [...document.querySelectorAll('[data-band-yazi]')].map(el => [el.dataset.bandYazi, el])
  );

  /* ---------------- tanıtım açıklaması (i) ---------------- */

  const bilgiDugme = document.querySelector('#bilgi-dugme');
  const bilgiMetni = document.querySelector('#analiz-bilgi');
  if (bilgiDugme && bilgiMetni) {
    const bilgiAyarla = acik => {
      bilgiDugme.setAttribute('aria-expanded', String(acik));
      bilgiDugme.setAttribute('aria-label', acik ? 'Açıklamayı kapat' : 'Nasıl çalıştığını göster');
      bilgiMetni.hidden = !acik;
    };
    bilgiDugme.addEventListener('click', () =>
      bilgiAyarla(bilgiDugme.getAttribute('aria-expanded') !== 'true')
    );
    document.addEventListener('keydown', event => {
      if (event.key !== 'Escape' || bilgiDugme.getAttribute('aria-expanded') !== 'true') return;
      bilgiAyarla(false);
      bilgiDugme.focus();
    });
  }

  const DILIM = 160;
  const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
  const renk = {
    zemin: '#0f0e12',
    izgara: 'rgba(244, 241, 233, .07)',
    dikey: 'rgba(244, 241, 233, .08)',
    taban: 'rgba(244, 241, 233, .3)',
    eksen: '#6f6a75',
    metin: '#b9b4bd',
    ortalama: '#f4f1e9',
    tepe: '#cb2468',
    vurgu: '#f4f1e9',
    ipucu: '#17151a'
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
    const h = canvas.clientHeight || 330;
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Çubuklar panelin iki kenarına dayanır: grafik tam genişlik, altta zaman şeridi.
    const sol = 0;
    const sag = w;
    const ust = 16;
    const alt = h - 26;
    return { w, h, sol, sag, ust, alt, gw: sag - sol, gh: alt - ust };
  }

  const y = (deger, m) => m.alt - deger * m.gh;

  // Dar ekranda ölçü bölmesi sayısı azalır: etiketler üst üste binmesin.
  const bolme = m => (m.gw < 520 ? 4 : 8);

  function izgara(m) {
    // Taban halesi: zemine derinlik veren çok hafif pembe ışık.
    const hale = ctx.createRadialGradient(
      m.gw / 2, m.alt, 0,
      m.gw / 2, m.alt, Math.max(m.gw * 0.55, 180)
    );
    hale.addColorStop(0, 'rgba(203, 36, 104, .18)');
    hale.addColorStop(.55, 'rgba(203, 36, 104, .06)');
    hale.addColorStop(1, 'rgba(203, 36, 104, 0)');
    ctx.fillStyle = hale;
    ctx.fillRect(m.sol, m.ust, m.gw, m.gh);

    ctx.lineWidth = 1;
    const adim = bolme(m);

    // yatay ölçü çizgileri
    ctx.strokeStyle = renk.izgara;
    [0.25, 0.5, 0.75].forEach(oran => {
      const py = Math.round(y(oran, m)) + .5;
      ctx.beginPath();
      ctx.moveTo(m.sol, py);
      ctx.lineTo(m.sag, py);
      ctx.stroke();
    });

    // dikey ölçü çizgileri: kesikli, ölçüm cihazı ızgarası gibi
    const dikeyX = [];
    for (let i = 1; i < adim; i++) dikeyX.push(Math.round(m.sol + (m.gw * i) / adim) + .5);
    ctx.strokeStyle = renk.dikey;
    ctx.setLineDash([2, 6]);
    ctx.beginPath();
    dikeyX.forEach(px => {
      ctx.moveTo(px, m.ust);
      ctx.lineTo(px, m.alt);
    });
    ctx.stroke();
    ctx.setLineDash([]);

    // kesişim düğümleri: ince artı işaretleri
    ctx.strokeStyle = 'rgba(244, 241, 233, .24)';
    ctx.beginPath();
    [0.25, 0.5, 0.75].forEach(oran => {
      const py = Math.round(y(oran, m)) + .5;
      dikeyX.forEach(px => {
        ctx.moveTo(px - 2.5, py);
        ctx.lineTo(px + 2.5, py);
        ctx.moveTo(px, py - 2.5);
        ctx.lineTo(px, py + 2.5);
      });
    });
    ctx.stroke();

    // taban çizgisi
    ctx.strokeStyle = renk.taban;
    const py = Math.round(m.alt) + .5;
    ctx.beginPath();
    ctx.moveTo(m.sol, py);
    ctx.lineTo(m.sag, py);
    ctx.stroke();

    // zaman bölmelerinde kısa tikler
    ctx.strokeStyle = 'rgba(244, 241, 233, .22)';
    ctx.beginPath();
    for (let i = 0; i <= adim; i++) {
      const px = Math.min(m.sag - 1, Math.round(m.sol + (m.gw * i) / adim)) + .5;
      ctx.moveTo(px, m.alt + 1);
      ctx.lineTo(px, m.alt + 5);
    }
    ctx.stroke();

    // üst ölçüm rayı: ince hat + düzenli tikler
    const ray = m.ust - 7;
    ctx.strokeStyle = 'rgba(244, 241, 233, .16)';
    ctx.beginPath();
    ctx.moveTo(m.sol, ray + .5);
    ctx.lineTo(m.sag, ray + .5);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(244, 241, 233, .13)';
    ctx.beginPath();
    for (let x = 0; x <= m.gw; x += 16) {
      const px = Math.min(m.sag - 1, Math.round(m.sol + x)) + .5;
      ctx.moveTo(px, ray + .5);
      ctx.lineTo(px, ray + (x % 96 === 0 ? 5.5 : 2.5));
    }
    ctx.stroke();
  }

  /* Çubukların üzerine ince yatay tarama çizgileri: LED/ölçüm ekranı dokusu.
     Koyu çizgiler sütunları böler, seyrek açık çizgiler derinlik verir. */
  function tarama(m) {
    ctx.fillStyle = 'rgba(11, 10, 14, .5)';
    for (let yy = m.alt - 2; yy > m.ust; yy -= 3) ctx.fillRect(m.sol, yy, m.gw, 1);
    ctx.fillStyle = 'rgba(244, 241, 233, .045)';
    for (let yy = m.alt - 2; yy > m.ust; yy -= 12) ctx.fillRect(m.sol, yy, m.gw, 1);
  }

  function zamanEkseni(m) {
    if (!durum_.duration) return;
    const adim = bolme(m);
    ctx.font = `600 9px ${MONO}`;
    ctx.fillStyle = renk.eksen;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    for (let i = 0; i <= adim; i++) {
      const px = m.sol + (m.gw * i) / adim;
      const lx = Math.min(m.sag - 16, Math.max(m.sol + 16, px));
      ctx.fillText(zaman((durum_.duration * i) / adim), lx, m.h - 8);
    }
    ctx.textAlign = 'left';
  }

  function cubuklar(m) {
    const { values } = durum_;
    const slot = m.gw / DILIM;
    const kalinlik = Math.max(1, Math.round(slot * 0.62));

    // Sarı taban → pembe orta → kırmızı tepe: kısa çubuklar sarı, uzunlar kırmızı uçlu.
    const dolgu = ctx.createLinearGradient(0, m.alt, 0, m.ust);
    dolgu.addColorStop(0, '#e6cb35');
    dolgu.addColorStop(0.42, '#d8bb2c');
    dolgu.addColorStop(0.74, '#cb2468');
    dolgu.addColorStop(1, '#ff352e');
    ctx.fillStyle = dolgu;

    // Neon hale: sütun siluetinin çevresine pembe ışık. Gövde zemin renginde
    // doldurulur, böylece yalnızca kenarlardaki bulanıklık görünür.
    ctx.save();
    ctx.shadowColor = 'rgba(255, 53, 46, .75)';
    ctx.shadowBlur = Math.min(16, Math.max(8, m.gh * 0.06));
    ctx.fillStyle = renk.zemin;
    ctx.beginPath();
    values.forEach((deger, i) => {
      const h = Math.max(0.012, deger) * m.gh;
      const bx = m.sol + i * slot + (slot - kalinlik) / 2;
      ctx.rect(bx, m.alt - h, kalinlik, h);
    });
    ctx.fill();
    ctx.restore();

    // Üstü yuvarlatılmış ince sütunlar (yuvarlatma desteklenmezse düz çubuk).
    const cubuk = (bx, by, w, h) => {
      const r = Math.min(2, w / 2, h);
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') ctx.roundRect(bx, by, w, h, [r, r, 0, 0]);
      else ctx.rect(bx, by, w, h);
      ctx.fill();
    };

    let vurguX = -1;
    values.forEach((deger, i) => {
      const h = Math.max(0.012, deger) * m.gh;
      const bx = m.sol + i * slot + (slot - kalinlik) / 2;
      cubuk(bx, m.alt - h, kalinlik, h);
      if (i === durum_.hover) vurguX = bx;
    });

    // LED ucu: tepe noktaları sıcak bir kontur çizgisi gibi parlar.
    ctx.fillStyle = 'rgba(255, 246, 214, .88)';
    values.forEach((deger, i) => {
      const h = Math.max(0.012, deger) * m.gh;
      if (h < 3) return;
      const bx = m.sol + i * slot + (slot - kalinlik) / 2;
      ctx.fillRect(bx, m.alt - h, kalinlik, 1.5);
    });

    // Üzerinde gezinilen dilim kremle öne çıkar.
    if (vurguX >= 0) {
      const h = Math.max(0.012, values[durum_.hover]) * m.gh;
      ctx.fillStyle = renk.vurgu;
      cubuk(vurguX, m.alt - h, kalinlik, h);
    }

    // en yoğun bölüm: tabanın altında köşeli ölçü işareti
    const px0 = m.sol + durum_.peakStart * slot;
    const px1 = px0 + Math.max(5, durum_.peakSpan * slot);
    ctx.fillStyle = 'rgba(203, 36, 104, .9)';
    ctx.fillRect(px0, m.alt + 2, px1 - px0, 2);
    ctx.fillRect(px0, m.alt + 2, 1.5, 6);
    ctx.fillRect(px1 - 1.5, m.alt + 2, 1.5, 6);

    // ortalama
    const ay = Math.round(y(durum_.average, m)) + .5;
    ctx.strokeStyle = renk.ortalama;
    ctx.globalAlpha = .55;
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(m.sol, ay);
    ctx.lineTo(m.sag, ay);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;

    const etiket = `ort. ${yuzde(durum_.average)}`;
    ctx.font = `700 9px ${MONO}`;
    const genislik = ctx.measureText(etiket).width + 14;
    const ly = Math.max(m.ust, ay - 14);
    ctx.fillStyle = renk.ipucu;
    ctx.fillRect(m.sol + 10, ly, genislik, 14);
    ctx.strokeStyle = 'rgba(244, 241, 233, .35)';
    ctx.strokeRect(m.sol + 10.5, ly + .5, genislik - 1, 13);
    ctx.fillStyle = renk.ortalama;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(etiket, m.sol + 17, ly + 7.5);
  }

  function imlec(m) {
    const i = durum_.hover;
    if (i < 0 || i >= durum_.values.length) return;
    const slot = m.gw / DILIM;
    const cx = Math.round(m.sol + i * slot + slot / 2) + .5;
    const deger = durum_.values[i];

    ctx.strokeStyle = 'rgba(244, 241, 233, .28)';
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 4]);
    ctx.beginPath();
    ctx.moveTo(cx, m.ust);
    ctx.lineTo(cx, m.alt);
    ctx.stroke();
    ctx.setLineDash([]);

    const py = y(deger, m);
    ctx.fillStyle = renk.vurgu;
    ctx.beginPath();
    ctx.arc(cx, py, 2.5, 0, Math.PI * 2);
    ctx.fill();

    const metin = `${zaman((durum_.duration * i) / DILIM)} · ${yuzde(deger)}`;
    ctx.font = `700 10px ${MONO}`;
    const genislik = ctx.measureText(metin).width + 16;
    const bx = Math.min(Math.max(cx - genislik / 2, m.sol + 2), m.sag - genislik - 2);
    const by = Math.max(m.ust, py - 30);
    ctx.fillStyle = renk.ipucu;
    ctx.fillRect(bx, by, genislik, 20);
    ctx.strokeStyle = 'rgba(244, 241, 233, .4)';
    ctx.strokeRect(bx + .5, by + .5, genislik - 1, 19);
    ctx.fillStyle = renk.vurgu;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(metin, bx + genislik / 2, by + 10.5);
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
    izgara(m);
    if (!durum_.values.length) return;
    cubuklar(m);
    tarama(m);
    zamanEkseni(m);
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

  function ilerlemeYaz() {
    const oran = durum_.duration ? Math.min(1, Math.max(0, audio.currentTime / durum_.duration)) : 0;
    konum.style.setProperty('--ilerleme', `${(oran * 100).toFixed(2)}%`);
    if (oynatImlec) {
      const gen = canvas.clientWidth || 0;
      const px = Math.min(Math.max(0, gen - 2), oran * gen);
      oynatImlec.style.transform = `translate3d(${px.toFixed(2)}px, 0, 0)`;
    }
  }

  // timeupdate saniyede ~4 kez geldiği için bar sıçrıyordu. Çalarken imleç ve
  // dolgu her karede bu döngüyle ilerler; durunca döngü tamamen kapanır.
  let kare = 0;
  function kareCiz() {
    if (audio.paused) {
      kare = 0;
      return;
    }
    ilerlemeYaz();
    kare = requestAnimationFrame(kareCiz);
  }
  function akisBaslat() {
    if (kare) return;
    kare = requestAnimationFrame(kareCiz);
  }
  function akisDur() {
    if (kare) cancelAnimationFrame(kare);
    kare = 0;
    ilerlemeYaz();
  }

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
    akisDur();
    panel.classList.remove('hazir');
    avgEl.textContent = '—';
    bpmEl.textContent = '—';
    bpmBirim.hidden = true;
    tepeEl.textContent = '—';
    gecenEl.textContent = '0:00';
    sureEl.textContent = '0:00';
    konum.value = '0';
    konum.disabled = true;
    konum.style.setProperty('--ilerleme', '0%');
    oynatBtn.disabled = true;
    oynatBtn.textContent = '▶';
    oynatBtn.setAttribute('aria-label', 'Parçayı oynat');
    bosKatman.hidden = false;
    if (okuma) okuma.textContent = '';
    baslik.textContent = 'Analiz bekleniyor';
    dosyaAdi.textContent = '';
    dosyaAdi.hidden = true;
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
      dosyaAdi.hidden = false;
      bantlariYaz();
      bosKatman.hidden = true;
      konum.disabled = false;
      konum.value = '0';
      ilerlemeYaz();
      oynatBtn.disabled = false;
      durum_.hazir = true;
      panel.classList.add('hazir');
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
    akisBaslat();
  });
  const durduruldu = () => {
    akisDur();
    oynatBtn.textContent = '▶';
    oynatBtn.setAttribute('aria-label', 'Parçayı oynat');
  };
  audio.addEventListener('pause', durduruldu);
  audio.addEventListener('ended', () => {
    durduruldu();
    konum.value = '1000';
    ilerlemeYaz();
  });

  audio.addEventListener('timeupdate', () => {
    if (!durum_.duration) return;
    gecenEl.textContent = zaman(audio.currentTime);
    konum.value = String(Math.round((audio.currentTime / durum_.duration) * 1000));
    // İmleç ve dolgu kare döngüsünde ilerliyor; burada yalnız süre yazılır.
  });

  konum.addEventListener('input', () => {
    if (!durum_.duration) return;
    audio.currentTime = (Number(konum.value) / 1000) * durum_.duration;
    gecenEl.textContent = zaman(audio.currentTime);
    ilerlemeYaz();
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

  window.addEventListener('resize', () => {
    draw();
    ilerlemeYaz();
  });
  sifirla();
  draw();
})();
