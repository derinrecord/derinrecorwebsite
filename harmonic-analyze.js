(() => {
  const PC = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
  const CAMELOT_MAJ = { C:'8B',G:'9B',D:'10B',A:'11B',E:'12B',B:'1B','F#':'2B','C#':'3B','G#':'4B','D#':'5B','A#':'6B',F:'7B' };
  const CAMELOT_MIN = { A:'8A',E:'9A',B:'10A','F#':'11A','C#':'12A','G#':'1A','D#':'2A','A#':'3A',F:'4A',C:'5A',G:'6A',D:'7A' };
  const MAJ = [6.35,2.23,3.48,2.33,4.38,4.09,2.52,5.19,2.39,3.66,2.29,2.88];
  const MIN = [6.33,2.68,3.52,5.38,2.60,3.53,2.54,4.75,3.98,2.69,3.34,3.17];

  const corr = (a, b) => {
    const ma = a.reduce((s,x)=>s+x,0)/12, mb = b.reduce((s,x)=>s+x,0)/12;
    let n=0, da=0, db=0;
    for (let i=0;i<12;i++){ const x=a[i]-ma, y=b[i]-mb; n+=x*y; da+=x*x; db+=y*y; }
    return n / Math.sqrt(da*db || 1);
  };

  function goertzel(buf, sr, freq) {
    const k = 2 * Math.cos(2 * Math.PI * freq / sr);
    let s0=0, s1=0, s2=0;
    for (let i=0;i<buf.length;i++){ s0 = buf[i] + k*s1 - s2; s2=s1; s1=s0; }
    return Math.sqrt(Math.max(0, s1*s1 + s2*s2 - k*s1*s2));
  }

  function detectKey(ch, sr) {
    const chroma = new Array(12).fill(0);
    const pencere = Math.min(ch.length, sr * 30);
    const basla = Math.floor((ch.length - pencere) / 2);
    const parca = ch.subarray(basla, basla + pencere);
    const adim = Math.floor(sr * 0.5);
    const blok = 4096;
    for (let oct = 2; oct <= 5; oct++) {
      for (let p = 0; p < 12; p++) {
        const f = 440 * Math.pow(2, (p - 9) / 12 + (oct - 4));
        let toplam = 0, n = 0;
        for (let off = 0; off + blok < parca.length; off += adim * 4) {
          toplam += goertzel(parca.subarray(off, off + blok), sr, f); n++;
        }
        if (n) chroma[p] += toplam / n;
      }
    }
    let best = null;
    for (let r = 0; r < 12; r++) {
      const don = chroma.slice(r).concat(chroma.slice(0, r));
      const cM = corr(don, MAJ), cm = corr(don, MIN);
      if (!best || cM > best.p) best = { p:cM, kok:PC[r], mod:'major' };
      if (cm > best.p) best = { p:cm, kok:PC[r], mod:'minor' };
    }
    return {
      key_name: best.kok + (best.mod === 'minor' ? ' minor' : ' major'),
      camelot: best.mod === 'minor' ? CAMELOT_MIN[best.kok] : CAMELOT_MAJ[best.kok],
      guven: Math.round(Math.max(0, best.p) * 100)
    };
  }

  function detectBPM(ch, sr) {
    const boy = 1024;
    const enerji = [];
    for (let i = 0; i + boy < ch.length; i += boy) {
      let s = 0;
      for (let j = 0; j < boy; j += 4) s += ch[i+j] * ch[i+j];
      enerji.push(s);
    }
    const fark = enerji.map((v, i) => i ? Math.max(0, v - enerji[i-1]) : 0);
    const fps = sr / boy;
    const enAz = Math.floor(fps * 60 / 180), enCok = Math.ceil(fps * 60 / 70);
    let iyi = null;
    for (let lag = enAz; lag <= enCok; lag++) {
      let s = 0;
      for (let i = 0; i + lag < fark.length; i++) s += fark[i] * fark[i+lag];
      s /= (fark.length - lag);
      if (!iyi || s > iyi.s) iyi = { s, lag };
    }
    let bpm = (fps * 60) / iyi.lag;
    while (bpm < 85) bpm *= 2;
    while (bpm > 175) bpm /= 2;
    return Math.round(bpm * 10) / 10;
  }

  function detectEnergy(ch) {
    let s = 0, n = 0;
    for (let i = 0; i < ch.length; i += 64) { s += ch[i] * ch[i]; n++; }
    return Math.min(10, Math.max(1, Math.round(Math.sqrt(s / n) * 34)));
  }

  async function analiz(file, bildir) {
    bildir('Dosya okunuyor…');
    const buf = await file.arrayBuffer();
    const ac = new (window.AudioContext || window.webkitAudioContext)();
    const ab = await ac.decodeAudioData(buf);
    const ch = ab.getChannelData(0), sr = ab.sampleRate;
    bildir('Tempo hesaplanıyor…');
    const bpm = detectBPM(ch, sr);
    await new Promise(r => setTimeout(r, 30));
    bildir('Ton analiz ediliyor… (biraz sürebilir)');
    await new Promise(r => setTimeout(r, 30));
    const key = detectKey(ch, sr);
    const energy = detectEnergy(ch);
    ac.close();
    return { bpm, ...key, energy, duration_sec: Math.round(ab.duration) };
  }

  const parseKey = k => { const m=/^(\d{1,2})([AB])$/i.exec(String(k||'').trim()); return m?{n:+m[1],L:m[2].toUpperCase()}:null; };
  const wrap = n => ((n-1+12)%12)+1;

  const uyumluTonlar = k => {
    const K = parseKey(k);
    if (!K) return [];
    return [`${K.n}${K.L}`, `${K.n}${K.L==='A'?'B':'A'}`,
            `${wrap(K.n+1)}${K.L}`, `${wrap(K.n-1)}${K.L}`, `${wrap(K.n+7)}${K.L}`];
  };

  const kopruTonlari = (a, b) => {
    const bU = new Set(uyumluTonlar(b));
    return uyumluTonlar(a).filter(k => bU.has(k));
  };

  function ikiAdimliKopru(a, b) {
    const bU = uyumluTonlar(b), yollar = [];
    for (const x of uyumluTonlar(a)) {
      for (const y of uyumluTonlar(x)) {
        if (bU.includes(y) && x !== y) yollar.push([x, y]);
      }
    }
    return yollar.slice(0, 3);
  }

  function baglaAnaliz() {
    const dosya = document.getElementById('nt-file');
    if (!dosya || dosya.dataset.hazir) return;
    dosya.dataset.hazir = '1';
    const btn = document.createElement('button');
    btn.textContent = '🎧 DOSYAYI ANALİZ ET';
    btn.type = 'button';
    btn.style.cssText = 'flex:1 1 100%;padding:11px 16px;border-radius:12px;border:1px solid rgba(224,195,65,.5);background:rgba(224,195,65,.14);color:#e8d15a;font:inherit;font-size:12px;font-weight:600;cursor:pointer';
    dosya.insertAdjacentElement('afterend', btn);
    btn.onclick = async () => {
      const f = dosya.files?.[0];
      const msg = document.getElementById('nt-msg');
      if (!f) { msg.textContent = 'Önce bir ses dosyası seç.'; return; }
      btn.disabled = true;
      try {
        const r = await analiz(f, t => { msg.textContent = t; });
        const set = (id, v) => { const el = document.getElementById(id); if (el && v != null) el.value = v; };
        set('nt-bpm', r.bpm); set('nt-cam', r.camelot); set('nt-key', r.key_name);
        set('nt-en', r.energy); set('nt-dur', r.duration_sec);
        if (!document.getElementById('nt-title').value.trim())
          document.getElementById('nt-title').value = f.name.replace(/\.[^.]+$/, '');
        msg.textContent = `Analiz tamam — ${r.bpm} BPM · ${r.camelot} (${r.key_name}) · ton güveni %${r.guven}. Yanlışsa elle düzelt.`;
      } catch (e) { msg.textContent = 'Analiz başarısız: ' + e.message; }
      btn.disabled = false;
    };
  }

  function baglaKopru() {
    document.querySelectorAll('.hm-set li').forEach(li => {
      if (li.dataset.kopru) return;
      const kucuk = li.querySelector('small');
      if (!kucuk || !kucuk.textContent.includes('uyumsuz geçiş')) return;

      const oncekiLi = li.previousElementSibling;
      const key = li.querySelector('.hm-key')?.textContent.trim();
      const oncekiKey = oncekiLi?.querySelector('.hm-key')?.textContent.trim();
      if (!key || !oncekiKey) return;
      li.dataset.kopru = '1';

      const ortak = kopruTonlari(oncekiKey, key);
      const zincir = ortak.length ? [] : ikiAdimliKopru(oncekiKey, key);
      const hedefTon = ortak.length ? ortak[0] : (zincir[0] ? zincir[0][0] : oncekiKey);

      const bpmEsle = /(\d+(?:\.\d+)?) BPM/.exec(kucuk.textContent);
      const bpm = bpmEsle ? Math.round(+bpmEsle[1]) : null;
      const aralik = bpm ? `${bpm-4}-${bpm+4} BPM` : 'benzer tempo';

      const sorgu = `${hedefTon} ${bpm ? bpm + ' bpm' : ''} track`.replace(/\s+/g, ' ').trim();
      const yt = 'https://www.youtube.com/results?search_query=' + encodeURIComponent(sorgu);
      const sp = 'https://open.spotify.com/search/' + encodeURIComponent(sorgu);

      const kutu = document.createElement('div');
      kutu.style.cssText = 'flex:1 1 100%;margin-top:10px;padding:12px 14px;border-radius:14px;border:1px dashed rgba(255,179,179,.4);background:rgba(255,120,120,.07);font-size:11.5px;line-height:1.7';
      kutu.innerHTML = `<strong style="color:#ffb3b3">${oncekiKey} → ${key} geçişi uyumsuz.</strong><br>
        ${ortak.length
          ? `Araya girecek parçanın tonu şunlardan biri olmalı: <b style="color:#e8d15a">${ortak.join(' · ')}</b>`
          : (zincir.length
              ? `Tek parça yetmiyor, iki köprü gerekiyor. Önerilen zincir:<br>` +
                zincir.map(z => `&nbsp;&nbsp;<b style="color:#e8d15a">${oncekiKey} → ${z[0]} → ${z[1]} → ${key}</b>`).join('<br>')
              : 'Bu iki ton arasında köprü bulunamadı — parçalardan birini değiştirmen gerekebilir.')}
        <br>Tempo: <b style="color:#e8d15a">${aralik}</b>
        <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap">
          <a href="${yt}" target="_blank" rel="noreferrer" style="padding:6px 12px;border-radius:10px;border:1px solid rgba(255,255,255,.2);color:inherit;text-decoration:none">YouTube'da ara ↗</a>
          <a href="${sp}" target="_blank" rel="noreferrer" style="padding:6px 12px;border-radius:10px;border:1px solid rgba(255,255,255,.2);color:inherit;text-decoration:none">Spotify'da ara ↗</a>
        </div>`;
      li.appendChild(kutu);
      li.style.flexWrap = 'wrap';
    });
  }

  const gozle = () => { baglaAnaliz(); baglaKopru(); };
  new MutationObserver(gozle).observe(document.body, { childList:true, subtree:true });
  document.addEventListener('DOMContentLoaded', gozle);
  gozle();
})();
<script src="sortable-touch.js?v=1"></script>
