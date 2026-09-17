(() => {
  const byId = id => document.getElementById(id);
  const safe = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  // Camelot çarkı: 1A–12A (minör), 1B–12B (majör)
  const parseKey = k => {
    const m = /^(\d{1,2})([AB])$/i.exec(String(k || '').trim());
    return m ? { n: +m[1], L: m[2].toUpperCase() } : null;
  };
  const wrap = n => ((n - 1 + 12) % 12) + 1;

  // Harmonik geçiş kuralları
  function relation(from, to) {
    const a = parseKey(from), b = parseKey(to);
    if (!a || !b) return null;
    if (a.n === b.n && a.L === b.L) return { tip:'Aynı ton', sinif:'ok', puan:3 };
    if (a.n === b.n) return { tip:'Paralel (majör↔minör)', sinif:'ok', puan:3 };
    if (a.L === b.L && wrap(a.n + 1) === b.n) return { tip:'Enerji artışı (+1)', sinif:'up', puan:4 };
    if (a.L === b.L && wrap(a.n - 1) === b.n) return { tip:'Yumuşak iniş (−1)', sinif:'ok', puan:3 };
    if (a.L === b.L && wrap(a.n + 2) === b.n) return { tip:'Enerji sıçraması (+2)', sinif:'up', puan:1 };
    if (a.L === b.L && wrap(a.n + 7) === b.n) return { tip:'Enerji yükseltme (+7)', sinif:'up', puan:1 };
    return null;
  }

  let client = null, tracks = [], set = [], selected = null;

  async function boot() {
    await window.DerinAuth.ready;
    const a = window.DerinAuth;
    client = a.client;
    const st = byId('hm-status');
    if (!a.configured) { st.textContent = 'Bağlantı hazırlanıyor.'; return; }
    if (!a.user) {
      st.innerHTML = '<button class="account-button" id="hm-login">GİRİŞ YAP</button>';
      byId('hm-login').onclick = () => a.open(); return;
    }
    if (a.profile?.role !== 'admin') { st.textContent = 'Bu araç yalnızca yöneticilere açıktır.'; return; }
    st.textContent = '';
    byId('hm-app').hidden = false;
    await load();
  }

  async function load() {
    const { data, error } = await client.from('radio_tracks')
      .select('id,title,camelot,key_name,makam,bpm,energy,duration_sec,folder_id')
      .order('title');
    if (error) { byId('hm-status').textContent = error.message; return; }
    tracks = data || [];
    render();
  }

  function suggestions() {
    const last = set.length ? set[set.length - 1] : selected;
    if (!last) return [];
    return tracks
      .filter(t => t.id !== last.id && !set.some(s => s.id === t.id))
      .map(t => ({ t, rel: relation(last.camelot, t.camelot) }))
      .filter(x => x.rel)
      .sort((a, b) => b.rel.puan - a.rel.puan || (a.t.bpm || 0) - (b.t.bpm || 0));
  }

  const keyChip = t => t.camelot
    ? `<span class="hm-key ${parseKey(t.camelot)?.L === 'B' ? 'b' : ''}">${safe(t.camelot)}</span>`
    : '<span class="hm-key" style="opacity:.4">ton yok</span>';

  const meta = t => [t.key_name, t.makam, t.bpm ? t.bpm + ' BPM' : null, t.energy ? 'E' + t.energy : null]
    .filter(Boolean).map(safe).join(' · ') || 'meta veri eksik';

  function render() {
    const sug = suggestions();
    const toplamSn = set.reduce((s, t) => s + (Number(t.duration_sec) || 0), 0);
    const dk = Math.round(toplamSn / 60);
    const eksik = set.filter(t => !t.duration_sec).length;

    byId('hm-app').innerHTML = `
      <div class="hm-grid">
        <div>
          <section class="hm-panel">
            <h2>KATALOG (${tracks.length})</h2>
            <div id="hm-list">${tracks.map(t => `
              <div class="hm-track ${selected?.id === t.id ? 'sel' : ''}" data-pick="${t.id}">
                <span><strong>${safe(t.title)}</strong><small>${meta(t)}</small></span>
                ${keyChip(t)}
              </div>`).join('') || '<p style="opacity:.5;font-size:13px">Katalogda parça yok.</p>'}</div>

            ${selected ? `<div class="hm-edit">
              <input id="hm-cam" value="${safe(selected.camelot || '')}" placeholder="Camelot (8A)">
              <input id="hm-key" value="${safe(selected.key_name || '')}" placeholder="Ton (G# min)">
              <input id="hm-makam" value="${safe(selected.makam || '')}" placeholder="Makam (Hicaz)">
              <input id="hm-bpm" type="number" value="${selected.bpm || ''}" placeholder="BPM">
              <input id="hm-en" type="number" min="1" max="10" value="${selected.energy || ''}" placeholder="Enerji 1-10">
              <input id="hm-dur" type="number" value="${selected.duration_sec || ''}" placeholder="Süre (sn)">
              <button id="hm-save">KAYDET</button>
            </div>` : ''}
          </section>
        </div>

        <div>
          <section class="hm-panel">
            <h2>SIRADAKİ UYUMLU PARÇALAR</h2>
            ${set.length || selected
              ? (sug.length ? sug.slice(0, 8).map(x => `
                  <div class="hm-track" data-add="${x.t.id}">
                    <span><strong>${safe(x.t.title)}</strong><small>${meta(x.t)}</small>
                      <span class="hm-rel"><span class="hm-chip ${x.rel.sinif}">${x.rel.tip}</span></span></span>
                    ${keyChip(x.t)}
                  </div>`).join('')
                : '<p style="opacity:.5;font-size:13px">Uyumlu parça bulunamadı. Camelot kodlarını doldurmayı dene.</p>')
              : '<p style="opacity:.5;font-size:13px">Başlamak için katalogdan bir parça seç.</p>'}
          </section>

          <section class="hm-panel" style="margin-top:20px">
            <h2>SET AKIŞI</h2>
            <div class="hm-meta">
              <span>Parça: <b>${set.length}</b></span>
              <span>Süre: <b>${dk} dk</b> / 90 dk</span>
              <span>Kalan: <b>${Math.max(0, 90 - dk)} dk</b></span>
            </div>
            ${eksik ? `<p class="hm-warn">${eksik} parçanın süresi girilmemiş, toplam eksik hesaplanıyor.</p>` : ''}
            <ol class="hm-set">${set.map((t, i) => {
              const r = i ? relation(set[i-1].camelot, t.camelot) : null;
              return `<li><span><strong>${safe(t.title)}</strong>
                <small>${meta(t)}${r ? ' · ' + r.tip : (i ? ' · uyumsuz geçiş' : '')}</small></span>
                <span style="display:flex;gap:8px;align-items:center">${keyChip(t)}
                <button data-rm="${t.id}">ÇIKAR</button></span></li>`;
            }).join('') || '<p style="opacity:.5;font-size:13px">Set boş.</p>'}</ol>
            <canvas class="hm-curve" id="hm-curve"></canvas>
          </section>
        </div>
      </div>`;

    wire();
    drawCurve();
  }

  function drawCurve() {
    const c = byId('hm-curve');
    if (!c) return;
    c.width = c.offsetWidth * 2; c.height = 300;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, c.width, c.height);
    if (set.length < 2) {
      ctx.fillStyle = 'rgba(255,255,255,.35)';
      ctx.font = '22px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('Enerji eğrisi için en az iki parça ekleyin', c.width/2, c.height/2);
      return;
    }
    const pts = set.map((t, i) => ({
      x: (i / (set.length - 1)) * (c.width - 80) + 40,
      y: c.height - 40 - ((Number(t.energy) || 5) / 10) * (c.height - 80)
    }));

    ctx.strokeStyle = 'rgba(255,255,255,.1)'; ctx.lineWidth = 2;
    for (let e = 0; e <= 10; e += 2) {
      const y = c.height - 40 - (e / 10) * (c.height - 80);
      ctx.beginPath(); ctx.moveTo(40, y); ctx.lineTo(c.width - 40, y); ctx.stroke();
    }

    const grad = ctx.createLinearGradient(0, 0, c.width, 0);
    grad.addColorStop(0, '#5ea4ff'); grad.addColorStop(1, '#e0c341');
    ctx.strokeStyle = grad; ctx.lineWidth = 5; ctx.lineJoin = 'round';
    ctx.beginPath();
    pts.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
    ctx.stroke();

    pts.forEach(p => {
      ctx.beginPath(); ctx.arc(p.x, p.y, 8, 0, Math.PI * 2);
      ctx.fillStyle = '#e8d15a'; ctx.fill();
      ctx.strokeStyle = '#141416'; ctx.lineWidth = 3; ctx.stroke();
    });
  }

  function wire() {
    document.querySelectorAll('[data-pick]').forEach(el => el.onclick = () => {
      selected = tracks.find(t => t.id === el.dataset.pick);
      if (!set.length) set = [selected];
      render();
    });

    document.querySelectorAll('[data-add]').forEach(el => el.onclick = () => {
      const t = tracks.find(x => x.id === el.dataset.add);
      set.push(t); render();
    });

    document.querySelectorAll('[data-rm]').forEach(el => el.onclick = () => {
      set = set.filter(t => t.id !== el.dataset.rm);
      if (!set.length) selected = null;
      render();
    });

    const save = byId('hm-save');
    if (save) save.onclick = async () => {
      const body = {
        camelot: byId('hm-cam').value.trim() || null,
        key_name: byId('hm-key').value.trim() || null,
        makam: byId('hm-makam').value.trim() || null,
        bpm: byId('hm-bpm').value ? Number(byId('hm-bpm').value) : null,
        energy: byId('hm-en').value ? Number(byId('hm-en').value) : null,
        duration_sec: byId('hm-dur').value ? Number(byId('hm-dur').value) : null
      };
      const { error } = await client.from('radio_tracks').update(body).eq('id', selected.id);
      byId('hm-status').textContent = error ? error.message : 'Meta veri kaydedildi.';
      if (!error) {
        Object.assign(selected, body);
        set = set.map(t => t.id === selected.id ? { ...t, ...body } : t);
        await load();
      }
    };
  }

  window.addEventListener('resize', drawCurve);
  boot();
})();
