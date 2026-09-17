(() => {
  const byId = id => document.getElementById(id);
  const safe = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  const parseKey = k => {
    const m = /^(\d{1,2})([AB])$/i.exec(String(k || '').trim());
    return m ? { n:+m[1], L:m[2].toUpperCase() } : null;
  };
  const wrap = n => ((n - 1 + 12) % 12) + 1;

  function relation(from, to) {
    const a = parseKey(from), b = parseKey(to);
    if (!a || !b) return null;
    if (a.n === b.n && a.L === b.L) return { tip:'Aynı ton', sinif:'ok', puan:5 };
    if (a.n === b.n) return { tip:'Paralel majör↔minör', sinif:'ok', puan:5 };
    if (a.L === b.L && wrap(a.n + 1) === b.n) return { tip:'Enerji artışı (+1)', sinif:'up', puan:6 };
    if (a.L === b.L && wrap(a.n - 1) === b.n) return { tip:'Yumuşak iniş (−1)', sinif:'ok', puan:4 };
    if (a.L === b.L && wrap(a.n + 2) === b.n) return { tip:'Enerji sıçraması (+2)', sinif:'up', puan:2 };
    if (a.L === b.L && wrap(a.n + 7) === b.n) return { tip:'Yükseltme (+7)', sinif:'up', puan:2 };
    return null;
  }

  // Geçiş kalitesi: ton + BPM yakınlığı + enerji akışı
  function score(a, b) {
    const r = relation(a.camelot, b.camelot);
    if (!r) return -Infinity;
    let s = r.puan * 10;
    if (a.bpm && b.bpm) {
      const fark = Math.abs(a.bpm - b.bpm);
      s -= fark > 6 ? (fark - 6) * 2 : 0;
      if (fark <= 3) s += 4;
    }
    if (a.energy && b.energy) {
      const d = b.energy - a.energy;
      if (d >= 0 && d <= 2) s += 5;
      else if (d < -2) s -= 6;
    }
    return s;
  }

  // Açgözlü zincir + her başlangıç noktası denenir
  function autoOrder(list) {
    if (list.length < 2) return list.slice();
    let best = null, bestScore = -Infinity;
    for (const start of list) {
      const kalan = list.filter(t => t.id !== start.id);
      const sira = [start];
      let toplam = 0;
      while (kalan.length) {
        const son = sira[sira.length - 1];
        let en = null, enP = -Infinity, enIdx = -1;
        kalan.forEach((t, i) => { const p = score(son, t); if (p > enP) { enP = p; en = t; enIdx = i; } });
        if (enP === -Infinity) { en = kalan[0]; enIdx = 0; enP = -25; }
        toplam += enP;
        sira.push(en); kalan.splice(enIdx, 1);
      }
      if (toplam > bestScore) { bestScore = toplam; best = sira; }
    }
    return best;
  }

  let client = null, tracks = [], set = [], selected = null;

  async function boot() {
    await window.DerinAuth.ready;
    const a = window.DerinAuth; client = a.client;
    const st = byId('hm-status');
    if (!a.configured) { st.textContent = 'Bağlantı hazırlanıyor.'; return; }
    if (!a.user) { st.innerHTML = '<button class="account-button" id="hm-login">GİRİŞ YAP</button>';
      byId('hm-login').onclick = () => a.open(); return; }
    if (a.profile?.role !== 'admin') { st.textContent = 'Bu araç yalnızca yöneticilere açıktır.'; return; }
    st.textContent = '';
    byId('hm-app').hidden = false;
    await load();
  }

  async function load() {
    const { data, error } = await client.from('dj_tracks')
      .select('id,title,artist,audio_path,camelot,key_name,makam,bpm,energy,duration_sec')
      .order('created_at', { ascending:false });
    if (error) { byId('hm-status').textContent = error.message; return; }
    tracks = data || [];
    set = set.map(s => tracks.find(t => t.id === s.id)).filter(Boolean);
    render();
  }

  function suggestions() {
    const last = set.length ? set[set.length - 1] : selected;
    if (!last) return [];
    return tracks.filter(t => t.id !== last.id && !set.some(s => s.id === t.id))
      .map(t => ({ t, rel: relation(last.camelot, t.camelot), p: score(last, t) }))
      .filter(x => x.rel).sort((a, b) => b.p - a.p);
  }

  const keyChip = t => t.camelot
    ? `<span class="hm-key ${parseKey(t.camelot)?.L === 'B' ? 'b' : ''}">${safe(t.camelot)}</span>`
    : '<span class="hm-key" style="opacity:.4">ton yok</span>';

  const meta = t => [t.artist, t.key_name, t.makam, t.bpm ? t.bpm + ' BPM' : null, t.energy ? 'E' + t.energy : null]
    .filter(Boolean).map(safe).join(' · ') || 'meta veri eksik';

  function render() {
    const sug = suggestions();
    const sn = set.reduce((s, t) => s + (Number(t.duration_sec) || 0), 0);
    const dk = Math.round(sn / 60);
    const eksikTon = tracks.filter(t => !t.camelot).length;

    byId('hm-app').innerHTML = `
      <div class="hm-grid">
        <div>
          <section class="hm-panel">
            <h2>PARÇA EKLE</h2>
            <div class="hm-edit" style="border:0;padding-top:0;margin-top:0">
              <input id="nt-title" placeholder="Parça adı" style="flex:1 1 100%">
              <input id="nt-artist" placeholder="Sanatçı">
              <input id="nt-cam" placeholder="Camelot (8A)">
              <input id="nt-key" placeholder="Ton (A minor)">
              <input id="nt-makam" placeholder="Makam">
              <input id="nt-bpm" type="number" placeholder="BPM">
              <input id="nt-en" type="number" min="1" max="10" placeholder="Enerji 1-10">
              <input id="nt-dur" type="number" placeholder="Süre (sn)">
              <input id="nt-file" type="file" accept="audio/*" style="flex:1 1 100%">
              <button id="nt-add">KATALOĞA EKLE</button>
            </div>
            <p class="hm-warn" id="nt-msg"></p>
          </section>

          <section class="hm-panel" style="margin-top:20px">
            <h2>SET KATALOĞU (${tracks.length})</h2>
            ${eksikTon ? `<p class="hm-warn">${eksikTon} parçanın Camelot kodu yok — sıralamaya girmez.</p>` : ''}
            ${tracks.map(t => `
              <div class="hm-track ${selected?.id === t.id ? 'sel' : ''}" data-pick="${t.id}">
                <span><strong>${safe(t.title)}</strong><small>${meta(t)}</small></span>
                               <span style="display:flex;gap:7px;align-items:center">${keyChip(t)}
                  <button data-push="${t.id}" style="padding:4px 9px;border-radius:9px;font-size:10px;border:1px solid rgba(224,195,65,.5);background:rgba(224,195,65,.14);color:#e8d15a;cursor:pointer">SETE EKLE</button>
                  <button data-del="${t.id}" style="padding:4px 9px;border-radius:9px;font-size:10px;border:1px solid rgba(255,255,255,.2);background:transparent;color:inherit;cursor:pointer">SİL</button></span>
              </div>`).join('') || '<p style="opacity:.5;font-size:13px">Katalog boş. Yukarıdan parça ekle.</p>'}

            ${selected ? `<div class="hm-edit">
              <input id="hm-cam" value="${safe(selected.camelot || '')}" placeholder="Camelot">
              <input id="hm-key" value="${safe(selected.key_name || '')}" placeholder="Ton">
              <input id="hm-bpm" type="number" value="${selected.bpm || ''}" placeholder="BPM">
              <input id="hm-en" type="number" min="1" max="10" value="${selected.energy || ''}" placeholder="Enerji">
              <input id="hm-dur" type="number" value="${selected.duration_sec || ''}" placeholder="Süre (sn)">
              <button id="hm-save">GÜNCELLE</button>
            </div>` : ''}
          </section>
        </div>

        <div>
          <section class="hm-panel">
            <h2>OTOMATİK SIRALAMA</h2>
            <p style="font-size:12px;opacity:.65;margin:0 0 12px">
              Katalogdaki tüm parçaları ton uyumu, BPM yakınlığı ve enerji akışına göre en akıcı sıraya dizer.</p>
            <div class="hm-edit" style="border:0;padding-top:0;margin-top:0">
              <button id="hm-auto">TÜM KATALOĞU SIRALA</button>
              <button id="hm-autoset" style="background:rgba(255,255,255,.08);color:inherit;border:1px solid rgba(255,255,255,.2)">MEVCUT SETİ YENİDEN DİZ</button>
              <button id="hm-clear" style="background:rgba(255,255,255,.08);color:inherit;border:1px solid rgba(255,255,255,.2)">SETİ TEMİZLE</button>
            </div>
          </section>

          <section class="hm-panel" style="margin-top:20px">
            <h2>SIRADAKİ UYUMLU PARÇALAR</h2>
            ${(set.length || selected)
              ? (sug.length ? sug.slice(0, 6).map(x => `
                  <div class="hm-track" data-add="${x.t.id}">
                    <span><strong>${safe(x.t.title)}</strong><small>${meta(x.t)}</small>
                      <span class="hm-rel"><span class="hm-chip ${x.rel.sinif}">${x.rel.tip}</span></span></span>
                    ${keyChip(x.t)}
                  </div>`).join('')
                : '<p style="opacity:.5;font-size:13px">Uyumlu parça yok.</p>')
              : '<p style="opacity:.5;font-size:13px">Katalogdan bir parça seç ya da otomatik sıralamayı çalıştır.</p>'}
          </section>

          <section class="hm-panel" style="margin-top:20px">
            <h2>SET AKIŞI</h2>
            <div class="hm-meta">
              <span>Parça: <b>${set.length}</b></span>
              <span>Süre: <b>${dk} dk</b> / 90 dk</span>
              <span>Kalan: <b>${Math.max(0, 90 - dk)} dk</b></span>
            </div>
            <ol class="hm-set">${set.map((t, i) => {
              const r = i ? relation(set[i-1].camelot, t.camelot) : null;
              return `<li><span><strong>${safe(t.title)}</strong>
                <small>${meta(t)}${r ? ' · ' + r.tip : (i ? ' · ⚠ uyumsuz geçiş' : '')}</small></span>
                <span style="display:flex;gap:8px;align-items:center">${keyChip(t)}
                <button data-rm="${t.id}">ÇIKAR</button></span></li>`;
            }).join('') || '<p style="opacity:.5;font-size:13px">Set boş.</p>'}</ol>
            <canvas class="hm-curve" id="hm-curve"></canvas>
          </section>
        </div>
      </div>`;
    wire(); drawCurve();
  }

  function drawCurve() {
    const c = byId('hm-curve'); if (!c) return;
    c.width = c.offsetWidth * 2; c.height = 300;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, c.width, c.height);
    if (set.length < 2) {
      ctx.fillStyle = 'rgba(255,255,255,.3)'; ctx.font = '22px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('Enerji eğrisi için en az iki parça', c.width/2, c.height/2); return;
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
    const g = ctx.createLinearGradient(0, 0, c.width, 0);
    g.addColorStop(0, '#5ea4ff'); g.addColorStop(1, '#e0c341');
    ctx.strokeStyle = g; ctx.lineWidth = 5; ctx.lineJoin = 'round';
    ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.stroke();
    pts.forEach(p => { ctx.beginPath(); ctx.arc(p.x, p.y, 8, 0, Math.PI*2);
      ctx.fillStyle = '#e8d15a'; ctx.fill(); ctx.strokeStyle = '#141416'; ctx.lineWidth = 3; ctx.stroke(); });
  }

  function wire() {
    byId('nt-add').onclick = async () => {
      const msg = byId('nt-msg');
      const title = byId('nt-title').value.trim();
      if (!title) { msg.textContent = 'Parça adı gerekli.'; return; }
      msg.textContent = 'Ekleniyor…';
      let audio_path = null;
      const file = byId('nt-file').files?.[0];
      if (file) {
        const path = `${Date.now()}-${Math.random().toString(36).slice(2,8)}.${file.name.split('.').pop() || 'mp3'}`;
        const up = await client.storage.from('dj-audio').upload(path, file, { contentType: file.type || 'audio/mpeg' });
        if (up.error) { msg.textContent = 'Yükleme hatası: ' + up.error.message; return; }
        audio_path = path;
      }
      const { error } = await client.from('dj_tracks').insert({
        title, artist: byId('nt-artist').value.trim() || null, audio_path,
        camelot: byId('nt-cam').value.trim() || null,
        key_name: byId('nt-key').value.trim() || null,
        makam: byId('nt-makam').value.trim() || null,
        bpm: byId('nt-bpm').value ? Number(byId('nt-bpm').value) : null,
        energy: byId('nt-en').value ? Number(byId('nt-en').value) : null,
        duration_sec: byId('nt-dur').value ? Number(byId('nt-dur').value) : null
      });
      msg.textContent = error ? error.message : 'Parça eklendi.';
      if (!error) await load();
    };

    byId('hm-auto').onclick = () => {
      const uygun = tracks.filter(t => t.camelot);
      if (uygun.length < 2) { byId('hm-status').textContent = 'En az iki parçaya Camelot kodu gerekli.'; return; }
      set = autoOrder(uygun); selected = null;
      byId('hm-status').textContent = `${set.length} parça otomatik sıralandı.`;
      render();
    };

    byId('hm-autoset').onclick = () => {
      if (set.length < 2) return;
      set = autoOrder(set.filter(t => t.camelot));
      byId('hm-status').textContent = 'Set yeniden dizildi.';
      render();
    };

    byId('hm-clear').onclick = () => { set = []; selected = null; render(); };

    document.querySelectorAll('[data-pick]').forEach(el => el.onclick = e => {
            if (e.target.dataset.del || e.target.dataset.push) return;
      selected = tracks.find(t => t.id === el.dataset.pick);
      if (!set.length) set = [selected];
      render();
    });
    document.querySelectorAll('[data-push]').forEach(el => el.onclick = ev => {
      ev.stopPropagation();
      const t = tracks.find(x => x.id === el.dataset.push);
      if (set.some(s => s.id === t.id)) { byId('hm-status').textContent = 'Bu parça sette zaten var.'; return; }
      set.push(t); render();
    });
    document.querySelectorAll('[data-add]').forEach(el => el.onclick = () => {
      set.push(tracks.find(t => t.id === el.dataset.add)); render();
    });

    document.querySelectorAll('[data-rm]').forEach(el => el.onclick = () => {
      set = set.filter(t => t.id !== el.dataset.rm); render();
    });

    document.querySelectorAll('[data-del]').forEach(el => el.onclick = async ev => {
      ev.stopPropagation();
      if (!confirm('Parça katalogdan silinecek. Emin misiniz?')) return;
      const t = tracks.find(x => x.id === el.dataset.del);
      if (t?.audio_path) await client.storage.from('dj-audio').remove([t.audio_path]);
      await client.from('dj_tracks').delete().eq('id', el.dataset.del);
      set = set.filter(x => x.id !== el.dataset.del);
      if (selected?.id === el.dataset.del) selected = null;
      await load();
    });

    const save = byId('hm-save');
    if (save) save.onclick = async () => {
      const body = {
        camelot: byId('hm-cam').value.trim() || null,
        key_name: byId('hm-key').value.trim() || null,
        bpm: byId('hm-bpm').value ? Number(byId('hm-bpm').value) : null,
        energy: byId('hm-en').value ? Number(byId('hm-en').value) : null,
        duration_sec: byId('hm-dur').value ? Number(byId('hm-dur').value) : null
      };
      const { error } = await client.from('dj_tracks').update(body).eq('id', selected.id);
      byId('hm-status').textContent = error ? error.message : 'Güncellendi.';
      if (!error) { Object.assign(selected, body); await load(); }
    };
  }

  window.addEventListener('resize', drawCurve);
  boot();
})();
