(() => {
  // Enerji Haritası (21 Kasım 2026, tasarım B "Katmanlı").
  // Analiz energy-map-cekirdek.js'te (tarayıcı + Node); burada çizim, liste ve oynatıcı.
  // Antrenör kendi Projelerim parçalarını tek tıkla açar; dışarıdan dosya da seçebilir.
  const C = metin => (window.DerinDil && window.DerinDil.cevir ? window.DerinDil.cevir(metin) : metin);
  const $ = s => document.querySelector(s);
  const dosyaGirdi = $('#audio-file');
  const audio = $('#audio');
  const canvas = $('#energy-chart');
  if (!dosyaGirdi || !audio || !canvas || !window.DerinEnerji) return;

  const ctx = canvas.getContext('2d');
  const panel = $('#bant');
  const grafik = $('#grafik');
  const ipucu = $('#ipucu');
  const bos = $('#bant-bos');
  const yukleniyor = $('#yukleniyor');
  const yukleniyorYazi = $('#yukleniyor-yazi');
  const baslik = $('#bant-baslik');
  const kunye = $('#dosya-adi');
  const durum = $('#energy-status');
  const okuma = $('#enerji-okuma');
  const liste = $('#calisma-liste');
  const listeNot = $('#calisma-not');
  const oynatBtn = $('#oynat');
  const konum = $('#konum');
  const gecenEl = $('#gecen');
  const sureEl = $('#sure');
  const tepeBtn = $('#tepe-dugme');

  const escapeHtml = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const zaman = s => {
    if (!isFinite(s) || s < 0) s = 0;
    const t = Math.floor(s);
    return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
  };
  const ondalik = (n, b = 1) => n.toFixed(b).replace('.', window.DerinDil && window.DerinDil.dil && window.DerinDil.dil() === 'en' ? '.' : ',');
  const yuzde = v => `%${Math.round(v * 100)}`;

  let R = null;           // son analiz
  let spekResim = null;   // spektrum, ekran dışı tuval
  let hover = -1;         // 0..1, fare konumu
  let yerlesim = { x0: 0, x1: 1, y0: 0, y1: 1 };
  let url = '';
  let secili = null;      // seçili çalışma id'si
  const onbellek = new Map(); // çalışma id → { R, blob }

  /* ---------------- renk haritası: gece → mor → pembe → turuncu → sarı → krem ---------------- */

  const DURAK = [[0, [9, 9, 11]], [.22, [36, 16, 64]], [.42, [91, 42, 140]], [.62, [203, 36, 104]], [.78, [255, 96, 72]], [.9, [232, 209, 90]], [1, [255, 248, 220]]];
  const LUT = new Uint8Array(256 * 3);
  for (let i = 0; i < 256; i++) {
    const v = i / 255;
    let k = 0;
    while (k < DURAK.length - 2 && v > DURAK[k + 1][0]) k++;
    const [a, ca] = DURAK[k], [b, cb] = DURAK[k + 1], f = (v - a) / (b - a);
    for (let c = 0; c < 3; c++) LUT[i * 3 + c] = Math.round(ca[c] + (cb[c] - ca[c]) * f);
  }

  function spektrumKur() {
    const t = document.createElement('canvas');
    t.width = R.sutun; t.height = R.bant;
    const g = t.getContext('2d');
    const im = g.createImageData(R.sutun, R.bant);
    for (let s = 0; s < R.sutun; s++) {
      for (let b = 0; b < R.bant; b++) {
        const v = Math.pow(R.spektrum[s * R.bant + b] / 255, 1.35);
        const i = Math.round(v * 255) * 3, o = ((R.bant - 1 - b) * R.sutun + s) * 4;
        im.data[o] = LUT[i]; im.data[o + 1] = LUT[i + 1]; im.data[o + 2] = LUT[i + 2]; im.data[o + 3] = 255;
      }
    }
    g.putImageData(im, 0, 0);
    spekResim = t;
  }

  /* ---------------- çizim ---------------- */

  function olcu() {
    const w = canvas.clientWidth || 640, h = canvas.clientHeight || 440;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { w, h };
  }
  const yumusak = (v, i) => {
    const d = k => v[Math.max(0, Math.min(v.length - 1, i + k))];
    return (d(-2) + 2 * d(-1) + 3 * v[i] + 2 * d(1) + d(2)) / 9;
  };
  function egriYol(n) {
    ctx.beginPath();
    ctx.moveTo(n[0][0], n[0][1]);
    for (let i = 1; i < n.length - 1; i++) {
      const a = n[i], b = n[i + 1];
      ctx.quadraticCurveTo(a[0], a[1], (a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
    }
    ctx.lineTo(n[n.length - 1][0], n[n.length - 1][1]);
  }
  function yazi(t, x, y, renk = '#a29daa', hiza = 'left') {
    ctx.font = '600 11px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.fillStyle = renk; ctx.textAlign = hiza; ctx.textBaseline = 'middle';
    ctx.fillText(t, x, y);
  }
  function zamanEkseni(w, y) {
    const n = w < 520 ? 4 : 8;
    for (let i = 0; i <= n; i++) {
      const x = (w * i) / n;
      yazi(zaman((R.sure * i) / n), Math.min(w - 18, Math.max(18, x)), y, '#6f6a75', 'center');
    }
  }
  function enYogun(w, y0, y1) {
    const a = (R.tepeBas / R.dilim) * w, b = ((R.tepeBas + R.tepeGenislik) / R.dilim) * w;
    ctx.fillStyle = 'rgba(232, 209, 90, .07)'; ctx.fillRect(a, y0, b - a, y1 - y0);
    ctx.fillStyle = '#e8d15a'; ctx.fillRect(a, y0, b - a, 2);
    yazi(C('en yoğun'), Math.min(a + 4, w - 70), y0 + 10, '#e8d15a');
  }
  function enerjiKatmani(w, y0, y1) {
    ctx.fillStyle = '#0d0c10'; ctx.fillRect(0, y0, w, y1 - y0);
    ctx.strokeStyle = 'rgba(244, 241, 233, .06)'; ctx.lineWidth = 1;
    [.25, .5, .75].forEach(f => {
      const y = Math.round(y1 - f * (y1 - y0 - 28)) + .5;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    });
    yazi(C('ENERJİ'), 8, y0 + 12, '#6f6a75');
    enYogun(w, y0, y1);
    const n = R.egri.length;
    const noktalar = R.egri.map((_, i) => [((i + .5) / n) * w, y1 - 4 - yumusak(R.egri, i) * (y1 - y0 - 32)]);
    const dolgu = ctx.createLinearGradient(0, y0 + 28, 0, y1);
    dolgu.addColorStop(0, 'rgba(232, 209, 90, .55)');
    dolgu.addColorStop(.45, 'rgba(203, 36, 104, .4)');
    dolgu.addColorStop(1, 'rgba(91, 42, 140, .05)');
    egriYol(noktalar);
    ctx.lineTo(noktalar[n - 1][0], y1); ctx.lineTo(noktalar[0][0], y1); ctx.closePath();
    ctx.fillStyle = dolgu; ctx.fill();
    ctx.save();
    ctx.lineJoin = 'round'; ctx.shadowColor = 'rgba(255, 61, 127, .9)'; ctx.shadowBlur = 14;
    ctx.strokeStyle = '#ffd9e6'; ctx.lineWidth = 2;
    egriYol(noktalar); ctx.stroke();
    ctx.restore();
    const ay = y1 - 4 - R.ortalama * (y1 - y0 - 32);
    ctx.strokeStyle = 'rgba(244, 241, 233, .4)'; ctx.setLineDash([5, 5]);
    ctx.beginPath(); ctx.moveTo(0, ay); ctx.lineTo(w, ay); ctx.stroke(); ctx.setLineDash([]);
    yazi(`${C('ort.')} ${yuzde(R.ortalama)}`, w - 8, ay - 9, '#d8d3dc', 'right');
  }
  function tempoKatmani(w, y0, y1) {
    const T = R.tempoEgri;
    ctx.fillStyle = '#0f0e13'; ctx.fillRect(0, y0, w, y1 - y0);
    yazi(C('TEMPO'), 8, y0 + 11, '#6f6a75');
    if (!T.length) { yazi(C('ölçülemedi'), 70, y0 + 11); return; }
    let lo = Math.min(...T.map(p => p.bpm)), hi = Math.max(...T.map(p => p.bpm));
    if (hi - lo < 6) { lo -= 3; hi += 3; }
    const Y = b => y1 - 6 - ((b - lo) / (hi - lo)) * (y1 - y0 - 24);
    const X = t => (t / R.sure) * w;
    ctx.strokeStyle = 'rgba(232, 209, 90, .25)'; ctx.setLineDash([3, 5]);
    ctx.beginPath(); ctx.moveTo(0, Y(R.tempo)); ctx.lineTo(w, Y(R.tempo)); ctx.stroke(); ctx.setLineDash([]);
    ctx.strokeStyle = '#e8d15a'; ctx.lineWidth = 2; ctx.beginPath();
    T.forEach((p, i) => {
      const x = X(p.t), y = Y(p.bpm);
      if (!i) ctx.moveTo(0, y); else ctx.lineTo(x, Y(T[i - 1].bpm));
      ctx.lineTo(x, y);
    });
    ctx.lineTo(w, Y(T[T.length - 1].bpm)); ctx.stroke();
    yazi(String(Math.round(hi)), w - 6, y0 + 11, '#6f6a75', 'right');
    yazi(String(Math.round(lo)), w - 6, y1 - 8, '#6f6a75', 'right');
  }
  function spektrumKatmani(w, y0, y1) {
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(spekResim, 0, y0, w, y1 - y0);
    yazi(C('SPEKTRUM'), 8, y0 + 12, 'rgba(244, 241, 233, .65)');
    const lo = 30, hi = R.bantFrekans[R.bant - 1];
    [['120', 120], ['500', 500], ['2k', 2000], ['8k', 8000]].forEach(([ad, hz]) => {
      const y = y1 - (Math.log(hz / lo) / Math.log(hi / lo)) * (y1 - y0);
      if (y > y0 + 22 && y < y1 - 6) yazi(ad, w - 8, y, 'rgba(244, 241, 233, .55)', 'right');
    });
  }

  function draw() {
    const { w, h } = olcu();
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#0b0a0e'; ctx.fillRect(0, 0, w, h);
    if (!R) return;
    const e1 = Math.round(h * .46), t1 = e1 + 80, s1 = h - 24;
    enerjiKatmani(w, 0, e1);
    tempoKatmani(w, e1 + 2, t1);
    spektrumKatmani(w, t1 + 2, s1);
    zamanEkseni(w, h - 12);
    yerlesim = { x0: 0, x1: w, y0: 0, y1: s1 };
    const t = audio.currentTime || 0;
    const px = (t / R.sure) * w;
    ctx.fillStyle = '#fff'; ctx.fillRect(px - 1, 0, 2, s1);
    ctx.beginPath(); ctx.arc(px, 3, 4, 0, Math.PI * 2); ctx.fill();
    if (hover >= 0) {
      const x = hover * w;
      ctx.strokeStyle = 'rgba(244, 241, 233, .35)'; ctx.setLineDash([2, 4]);
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, s1); ctx.stroke(); ctx.setLineDash([]);
    }
  }

  /* ---------------- analiz ---------------- */

  let motor = null;
  let isci = null;
  function isciAl() {
    if (isci !== null) return isci;
    try { isci = new Worker('energy-map-isci.js?v=1'); } catch (e) { isci = false; }
    return isci;
  }
  async function analizEt(blob) {
    if (!motor) motor = new (window.AudioContext || window.webkitAudioContext)();
    const ab = await motor.decodeAudioData(await blob.arrayBuffer());
    const veri = DerinEnerji.monoYap(ab).slice();
    const yan = DerinEnerji.yanYap(ab);
    const w = isciAl();
    if (!w) return DerinEnerji.analizEt(veri, ab.sampleRate, { yan });
    return new Promise((tamam, hata) => {
      w.onmessage = e => (e.data.hata ? hata(new Error(e.data.hata)) : tamam(e.data.r));
      w.onerror = () => { isci = false; tamam(DerinEnerji.analizEt(veri, ab.sampleRate, { yan })); };
      w.postMessage({ veri, yan, sr: ab.sampleRate }, yan ? [veri.buffer, yan.buffer] : [veri.buffer]);
    });
  }

  function sonucYaz(ad, alt) {
    const g = R.tempoGuven;
    const guven = $('#guven');
    const [gAd, gSinif] = g >= .55 ? ['net', 'net'] : g >= .3 ? ['orta', 'orta'] : ['zayıf', 'zayif'];
    guven.textContent = C(gAd); guven.className = 'em-guven ' + gSinif; guven.hidden = !R.tempo;
    $('#bpm').textContent = R.tempo ? ondalik(R.tempo) : '—';
    $('#bpm-birim').hidden = !R.tempo;
    const T = R.tempoEgri.map(p => p.bpm);
    const lo = T.length ? Math.round(Math.min(...T)) : 0, hi = T.length ? Math.round(Math.max(...T)) : 0;
    $('#bpm-not').textContent = !T.length ? '' : hi - lo >= 3 ? `${lo}–${hi} ${C('arası değişiyor')}` : C('parça boyunca sabit');
    $('#lufs').textContent = ondalik(R.tumlesikLufs);
    $('#lufs-birim').hidden = false;
    $('#lufs-not').textContent = C(R.tumlesikLufs > -11 ? 'çok yüksek, sıkıştırılmış' : R.tumlesikLufs > -15 ? 'güçlü, yarışmaya uygun' : 'sakin, yükseltilebilir');
    $('#avg').textContent = yuzde(R.ortalama);
    $('#avg-not').textContent = `${yuzde(R.egri.filter(v => v > .66).length / R.egri.length)} ${C('süre yüksek enerjide')}`;
    const a = (R.tepeBas / R.dilim) * R.sure, b = ((R.tepeBas + R.tepeGenislik) / R.dilim) * R.sure;
    $('#tepe').textContent = `${zaman(a)}–${zaman(b)}`;
    tepeBtn.disabled = false;
    baslik.textContent = ad;
    kunye.textContent = [alt, zaman(R.sure)].filter(Boolean).join(' · ');
    sureEl.textContent = zaman(R.sure);
    gecenEl.textContent = '0:00';
    konum.disabled = false; konum.value = '0';
    oynatBtn.disabled = false;
    bos.hidden = true;
    durum.textContent = C('Bir noktaya tıkla; parça oradan çalsın.');
    canvas.setAttribute('aria-label',
      `${C('Enerji, tempo ve spektrum grafiği')}: ${C('tempo')} ${R.tempo ? `${C('yaklaşık')} ${Math.round(R.tempo)} BPM` : C('ölçülemedi')}, ` +
      `${C('yükseklik')} ${ondalik(R.tumlesikLufs)} LUFS, ${C('ortalama enerji')} ${yuzde(R.ortalama)}, ${C('en yoğun bölüm')} ${zaman(a)}. ${C('Ok tuşlarıyla gez.')}`);
  }

  async function ac(kaynak, ad, alt, anahtar) {
    audio.pause();
    yukleniyor.hidden = false;
    yukleniyorYazi.textContent = C('Analiz ediliyor…');
    durum.textContent = '';
    try {
      let blob, sonuc = anahtar && onbellek.get(anahtar);
      if (sonuc) { blob = sonuc.blob; R = sonuc.R; }
      else {
        blob = typeof kaynak === 'function' ? await kaynak() : kaynak;
        if (!blob) throw new Error('dosya yok');
        R = await analizEt(blob);
        if (anahtar) onbellek.set(anahtar, { blob, R });
      }
      if (url) URL.revokeObjectURL(url);
      url = URL.createObjectURL(blob);
      audio.src = url;
      hover = -1;
      spektrumKur();
      sonucYaz(ad, alt);
    } catch (e) {
      R = null;
      bos.hidden = false;
      baslik.textContent = C('Analiz bekleniyor');
      kunye.textContent = '';
      oynatBtn.disabled = true; konum.disabled = true; tepeBtn.disabled = true;
      durum.textContent = C('Bu dosya analiz edilemedi. Başka bir ses dosyası dene.');
    }
    yukleniyor.hidden = true;
    draw();
  }

  /* ---------------- Çalışmalarım (Projelerim parçaları) ---------------- */

  const RENK = { aerobik: '#e8d15a', akrobatik: '#cb2468', artistik: '#b98cff', ritmik: '#ff9d4a', 'aero dans': '#5ee0c1', 'cocuk-fitness': '#7fd36b' };
  const bransAdi = b => {
    const s = String(b || '').replace(/-/g, ' ');
    return s ? s.charAt(0).toLocaleUpperCase('tr-TR') + s.slice(1) : '';
  };
  let isler = [];

  async function sesIndir(yol) {
    const Ses = window.DerinAudioTypes, R2 = window.DerinR2;
    const parcalar = Ses ? Ses.parcalariCoz(yol) : [{ path: yol }];
    const bloblar = await Promise.all(parcalar.map(async p => {
      const adres = await R2.korumaliAdres('project-audio', p.path);
      if (!adres) return null;
      const cevap = await fetch(adres);
      return cevap.ok ? cevap.blob() : null;
    }));
    if (bloblar.some(b => !b)) return null;
    return new Blob(bloblar, { type: bloblar[0].type || 'audio/mpeg' });
  }

  function listeYaz() {
    if (!isler.length) return;
    liste.innerHTML = isler.map(i => `
      <button type="button" class="em-is${secili === i.id ? ' secili' : ''}" role="listitem" data-is="${escapeHtml(i.id)}">
        <span class="em-kapak" style="background:${RENK[String(i.brans || '').toLowerCase()] || '#cb2468'}">${escapeHtml((bransAdi(i.brans) || i.ad).slice(0, 2).toLocaleUpperCase('tr-TR'))}</span>
        <span><strong>${escapeHtml(i.ad)}</strong><small>${escapeHtml([bransAdi(i.brans), i.proje !== i.ad ? i.proje : ''].filter(Boolean).join(' · '))} · <b>${escapeHtml(C('Hazır'))}</b></small></span>
      </button>`).join('');
  }

  async function calismalariYukle() {
    const auth = window.DerinAuth;
    if (auth && auth.ready) { try { await auth.ready; } catch (e) { /* yine de dene */ } }
    const client = auth && auth.client, user = auth && auth.user;
    if (!client || !user) {
      isler = [];
      liste.innerHTML = '';
      listeNot.innerHTML = `${escapeHtml(C('Kendi çalışmalarını görmek için'))} <a href="#" id="giris-ac">${escapeHtml(C('giriş yap'))}</a>.`;
      const g = $('#giris-ac');
      if (g) g.addEventListener('click', e => { e.preventDefault(); if (auth && auth.open) auth.open(); });
      return;
    }
    listeNot.textContent = C('Tek tıkla açılır, dosya yüklemek gerekmez.');
    liste.innerHTML = '<div class="em-iskelet"></div><div class="em-iskelet"></div>';
    try {
      const p = await client.from('music_projects').select('id,title,song,branch,created_at').order('created_at', { ascending: false }).limit(60);
      if (p.error) throw p.error;
      const projeler = p.data || [];
      const ids = projeler.map(x => x.id);
      let parcalar = [];
      if (ids.length) {
        const t = await client.from('project_tracks').select('id,project_id,label,audio_path,sort_order').in('project_id', ids).order('sort_order');
        if (t.error) throw t.error;
        parcalar = (t.data || []).filter(x => x.audio_path);
      }
      const proje = Object.fromEntries(projeler.map(x => [x.id, x]));
      isler = parcalar
        .map(x => {
          const pr = proje[x.project_id] || {};
          const projeAd = pr.song || pr.title || C('Proje');
          return { id: x.id, yol: x.audio_path, ad: x.label || projeAd, proje: projeAd, brans: pr.branch, tarih: pr.created_at || '' };
        })
        .sort((a, b) => String(b.tarih).localeCompare(String(a.tarih)))
        .slice(0, 50);
      if (!isler.length) {
        liste.innerHTML = '';
        listeNot.textContent = C('Henüz hazır bir çalışman yok. Dışarıdan dosya seçebilirsin.');
        return;
      }
      listeYaz();
    } catch (e) {
      liste.innerHTML = '';
      listeNot.textContent = C('Çalışmalar alınamadı. Dosya seçerek devam edebilirsin.');
    }
  }

  liste.addEventListener('click', e => {
    const b = e.target.closest('[data-is]');
    if (!b) return;
    const is = isler.find(x => String(x.id) === b.dataset.is);
    if (!is) return;
    secili = is.id;
    listeYaz();
    ac(() => sesIndir(is.yol), is.ad, [bransAdi(is.brans), is.proje !== is.ad ? is.proje : ''].filter(Boolean).join(' · '), 'is:' + is.id);
  });

  /* ---------------- dosya seç / sürükle-bırak ---------------- */

  const disaridan = f => {
    secili = null;
    listeYaz();
    ac(f, f.name.replace(/\.[^.]+$/, ''), C('Dışarıdan yüklendi'));
  };
  dosyaGirdi.addEventListener('change', () => { if (dosyaGirdi.files[0]) disaridan(dosyaGirdi.files[0]); dosyaGirdi.value = ''; });
  let surukleme = 0;
  panel.addEventListener('dragenter', e => { e.preventDefault(); surukleme++; panel.classList.add('surukle'); });
  panel.addEventListener('dragover', e => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
  panel.addEventListener('dragleave', () => { surukleme = Math.max(0, surukleme - 1); if (!surukleme) panel.classList.remove('surukle'); });
  panel.addEventListener('drop', e => {
    e.preventDefault(); surukleme = 0; panel.classList.remove('surukle');
    const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) disaridan(f);
  });

  /* ---------------- oynatıcı ---------------- */

  let kare = 0;
  function kareCiz() {
    if (audio.paused) { kare = 0; return; }
    gecenEl.textContent = zaman(audio.currentTime);
    if (R) konum.value = String(Math.round((audio.currentTime / R.sure) * 1000));
    draw();
    kare = requestAnimationFrame(kareCiz);
  }
  function git(t) {
    if (!R) return;
    t = Math.max(0, Math.min(R.sure - .05, t));
    try { audio.currentTime = t; } catch (e) { /* yüklenmemiş olabilir */ }
    gecenEl.textContent = zaman(t);
    konum.value = String(Math.round((t / R.sure) * 1000));
    draw();
  }
  async function cal() {
    if (motor && motor.state === 'suspended') { try { await motor.resume(); } catch (e) { /* yok */ } }
    try { await audio.play(); } catch (e) { durum.textContent = C('Parça başlatılamadı. Dosyayı yeniden seç.'); }
  }
  oynatBtn.addEventListener('click', () => { if (audio.paused) cal(); else audio.pause(); });
  audio.addEventListener('play', () => {
    oynatBtn.textContent = '❚❚'; oynatBtn.setAttribute('aria-label', C('Parçayı duraklat'));
    if (!kare) kare = requestAnimationFrame(kareCiz);
  });
  const durdu = () => {
    if (kare) cancelAnimationFrame(kare);
    kare = 0;
    oynatBtn.textContent = '▶'; oynatBtn.setAttribute('aria-label', C('Parçayı oynat'));
    draw();
  };
  audio.addEventListener('pause', durdu);
  audio.addEventListener('ended', durdu);
  konum.addEventListener('input', () => { if (R) git((Number(konum.value) / 1000) * R.sure); });
  tepeBtn.addEventListener('click', () => { if (!R) return; git((R.tepeBas / R.dilim) * R.sure); cal(); });

  /* ---------------- grafikle etkileşim ---------------- */

  const oran = e => {
    const r = canvas.getBoundingClientRect();
    return Math.max(0, Math.min(1, (e.clientX - r.left - yerlesim.x0) / (yerlesim.x1 - yerlesim.x0)));
  };
  const yerelTempo = t => (R.tempoEgri.length ? R.tempoEgri.reduce((a, p) => (Math.abs(p.t - t) < Math.abs(a.t - t) ? p : a)).bpm : R.tempo);
  function okumaYaz(f) {
    if (!R || f < 0) { okuma.textContent = ''; return; }
    const t = f * R.sure, i = Math.min(R.dilim - 1, Math.floor(f * R.dilim));
    okuma.textContent = `${zaman(t)}, ${C('enerji')} ${yuzde(R.egri[i])}, ${C('tempo')} ${Math.round(yerelTempo(t) || 0)} BPM.`;
  }
  canvas.addEventListener('pointerdown', e => {
    if (!R) { dosyaGirdi.click(); return; }
    git(oran(e) * R.sure);
  });
  canvas.addEventListener('pointermove', e => {
    if (!R) return;
    hover = oran(e);
    const t = hover * R.sure, i = Math.min(R.dilim - 1, Math.floor(hover * R.dilim));
    const r = grafik.getBoundingClientRect();
    ipucu.style.display = 'block';
    ipucu.style.left = `${Math.max(90, Math.min(r.width - 90, e.clientX - r.left))}px`;
    ipucu.style.top = `${e.clientY - r.top - 12}px`;
    ipucu.innerHTML = `<b>${zaman(t)}</b> · ${escapeHtml(C('enerji'))} ${yuzde(R.egri[i])} · ${Math.round(yerelTempo(t) || 0)} BPM`;
    if (audio.paused) draw();
  });
  canvas.addEventListener('pointerleave', () => { hover = -1; ipucu.style.display = 'none'; if (audio.paused) draw(); });
  canvas.addEventListener('keydown', e => {
    if (!R) return;
    const adim = R.sure / 40;
    let f = hover < 0 ? (audio.currentTime || 0) / R.sure : hover;
    if (e.key === 'ArrowRight') f = Math.min(1, f + adim / R.sure);
    else if (e.key === 'ArrowLeft') f = Math.max(0, f - adim / R.sure);
    else if (e.key === 'Home') f = 0;
    else if (e.key === 'End') f = 1;
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); git(f * R.sure); if (audio.paused) cal(); return; }
    else return;
    e.preventDefault();
    hover = f; okumaYaz(f); draw();
  });
  canvas.addEventListener('blur', () => { hover = -1; okumaYaz(-1); draw(); });

  const gozcu = new ResizeObserver(() => draw());
  gozcu.observe(grafik);

  window.addEventListener('derin:authchange', () => calismalariYukle());
  document.addEventListener('derin:dil', () => {
    if (R) sonucYaz(baslik.textContent, kunye.textContent.split(' · ').slice(0, -1).join(' · '));
    listeYaz();
    calismalariYukle();
    draw();
  });

  draw();
  calismalariYukle();
})();
