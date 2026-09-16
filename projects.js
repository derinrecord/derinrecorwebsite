(() => {
  const STAGES = [
    { key:'approved',   label:'ONAYLANDI' },
    { key:'started',    label:'BAŞLANDI' },
    { key:'production', label:'YAPIM SÜRECİNDE' },
    { key:'finishing',  label:'BİTİM AŞAMASI' },
    { key:'delivered',  label:'TESLİM EDİLDİ' }
  ];
  const GROUPS = [
    { key:'pending',  title:'BEKLEYEN PROJELER',  has:s => s === 'pending' },
    { key:'active',   title:'YAPIM SÜRECİNDE',    has:s => ['approved','started','production','finishing'].includes(s) },
    { key:'done',     title:'TAMAMLANAN',         has:s => s === 'delivered' }
  ];

  const list = document.querySelector('#list');
  const status = document.querySelector('#s');
  const safe = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

  let client = null, admin = false, me = null, projects = [], feedback = {}, names = {};
  let busy = false;

  async function boot() {
    await window.DerinAuth.ready;
    const auth = window.DerinAuth;
    client = auth.client;
    if (!auth.configured) { status.textContent = 'Bağlantı hazırlanıyor.'; return; }
    if (!auth.user) {
      status.innerHTML = '<button class="account-button" id="p-login">GİRİŞ YAP</button>';
      document.querySelector('#p-login').onclick = () => auth.open();
      return;
    }
    me = auth.user.id;
    admin = auth.profile?.role === 'admin';
    document.querySelector('#refresh').hidden = false;
    document.querySelector('#refresh').onclick = () => load();
    subscribe();
    await load();
  }

  function subscribe() {
    client.channel('projeler-' + me)
      .on('postgres_changes', { event:'*', schema:'public', table:'music_projects' }, () => load())
      .on('postgres_changes', { event:'*', schema:'public', table:'project_feedback' }, () => load())
      .subscribe();
  }

  async function load() {
    if (busy) return;
    busy = true;
    try {
      let q = client.from('music_projects')
        .select('id,coach_id,title,song,branch,status,audio_path,note,created_at,updated_at')
        .order('created_at', { ascending:false });
      if (!admin) q = q.eq('coach_id', me);
      const { data, error } = await q;
      if (error) throw error;
      projects = data || [];

      names = {};
      if (admin && projects.length) {
        const ids = [...new Set(projects.map(p => p.coach_id))];
        const r = await client.from('profiles').select('id,full_name').in('id', ids);
        if (!r.error) names = Object.fromEntries(r.data.map(p => [p.id, p.full_name]));
      }

      feedback = {};
      if (projects.length) {
        const r = await client.from('project_feedback')
          .select('id,project_id,author_id,body,created_at')
          .in('project_id', projects.map(p => p.id))
          .order('created_at');
        if (!r.error) for (const f of r.data) (feedback[f.project_id] ||= []).push(f);
      }

      render();
    } catch (e) {
      status.textContent = 'Projeler alınamadı: ' + e.message;
    } finally { busy = false; }
  }

  function trackBar(current) {
    const at = STAGES.findIndex(s => s.key === current);
    return `<div class="track">${STAGES.map((s, i) => {
      const cls = at < 0 ? '' : (i < at ? 'done' : i === at ? 'now' : '');
      return `<div class="track-step ${cls}"><div class="track-dot"></div>${s.label}</div>`;
    }).join('')}</div>`;
  }

  function card(p) {
    const fbs = feedback[p.id] || [];
    const who = admin ? (names[p.coach_id] || 'Antrenör') : 'Sana ait proje';
    const stageSelect = admin ? `
      <select data-stage="${p.id}">
        <option value="pending"${p.status==='pending'?' selected':''}>Bekliyor (onay verilmedi)</option>
        ${STAGES.map(s => `<option value="${s.key}"${p.status===s.key?' selected':''}>${s.label}</option>`).join('')}
      </select>
      <input type="file" accept="audio/*" data-audio="${p.id}">
      <button data-del="${p.id}">SİL</button>` : '';

    return `<article class="proj-card" data-card="${p.id}">
      <h3>${safe(p.title || p.song || 'Proje')}</h3>
      <p class="meta">${safe(who)}${p.branch ? ' · ' + safe(p.branch) : ''} · son güncelleme ${new Date(p.updated_at || p.created_at).toLocaleString('tr-TR')}</p>
      ${p.status === 'pending' ? '<p class="meta">Onay bekliyor.</p>' : trackBar(p.status)}
      ${p.audio_path ? `<div class="proj-player">
          <img class="cassette" src="assets/demo-cassette-derin-record.png" alt="">
          <div class="proj-wave"><canvas data-wave="${p.id}"></canvas></div>
          <button class="proj-play" data-play="${p.id}" data-path="${safe(p.audio_path)}">▶ DİNLE</button>
        </div>` : ''}
      <div class="proj-actions">${stageSelect}</div>
      <div class="fb-box">
        <ul class="fb-list">${fbs.length ? fbs.map(f => `<li>${safe(f.body)}
          <small>${f.author_id === p.coach_id ? 'Antrenör' : 'Derin Record'} · ${new Date(f.created_at).toLocaleString('tr-TR')}</small></li>`).join('')
          : '<li style="opacity:.45">Henüz geri bildirim yok.</li>'}</ul>
        <textarea data-fb="${p.id}" placeholder="Geri bildirim yaz…"></textarea>
        <div class="proj-actions"><button data-fbsend="${p.id}">GÖNDER</button></div>
      </div>
    </article>`;
  }

  function render() {
    list.innerHTML = GROUPS.map(g => {
      const items = projects.filter(p => g.has(p.status));
      return `<section class="proj-group"><h2>${g.title} (${items.length})</h2>
        ${items.length ? items.map(card).join('') : '<p class="proj-empty">Bu grupta proje yok.</p>'}</section>`;
    }).join('');
    status.textContent = projects.length
      ? `${projects.length} proje · aşamalar anlık güncellenir.`
      : 'Henüz proje yok.';
    wire();
  }

  function wire() {
    list.querySelectorAll('[data-stage]').forEach(sel => {
      sel.onchange = async () => {
        sel.disabled = true;
        const { error } = await client.from('music_projects')
          .update({ status: sel.value, updated_at: new Date().toISOString() })
          .eq('id', sel.dataset.stage);
        status.textContent = error ? 'Kaydedilemedi: ' + error.message : 'Aşama güncellendi — antrenöre anında yansır.';
        sel.disabled = false;
        load();
      };
    });

    list.querySelectorAll('[data-audio]').forEach(input => {
      input.onchange = async () => {
        const file = input.files?.[0];
        if (!file) return;
        const p = projects.find(x => x.id === input.dataset.audio);
        status.textContent = 'Ses yükleniyor…';
        const ext = (file.name.split('.').pop() || 'mp3');
        const path = `${p.coach_id}/${p.id}-${Date.now()}.${ext}`;
        const up = await client.storage.from('project-audio').upload(path, file, { contentType: file.type || 'audio/mpeg' });
        if (up.error) { status.textContent = 'Yükleme hatası: ' + up.error.message; return; }
        const { error } = await client.from('music_projects')
          .update({ audio_path: path, updated_at: new Date().toISOString() }).eq('id', p.id);
        status.textContent = error ? error.message : 'Ses eklendi.';
        load();
      };
    });

    list.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
      if (!confirm('Proje silinecek. Emin misiniz?')) return;
      await client.from('music_projects').delete().eq('id', b.dataset.del);
      load();
    });

    list.querySelectorAll('[data-fbsend]').forEach(b => b.onclick = async () => {
      const box = list.querySelector(`[data-fb="${b.dataset.fbsend}"]`);
      const body = box.value.trim();
      if (!body) return;
      b.disabled = true;
      const { error } = await client.from('project_feedback')
        .insert({ project_id: b.dataset.fbsend, author_id: me, body });
      status.textContent = error ? 'Gönderilemedi: ' + error.message : 'Geri bildirim gönderildi.';
      box.value = '';
      b.disabled = false;
      load();
    });

    list.querySelectorAll('[data-play]').forEach(b => b.onclick = async () => {
      const id = b.dataset.play;
      const { data, error } = await client.storage.from('project-audio')
        .createSignedUrl(b.dataset.path, 3600);
      if (error) { status.textContent = 'Ses açılamadı: ' + error.message; return; }
      playWithWave(data.signedUrl, id, b);
    });
  }

  let current = null;
  async function playWithWave(url, id, button) {
    if (current) { current.audio.pause(); current.button.textContent = '▶ DİNLE'; }
    const audio = new Audio(url);
    audio.crossOrigin = 'anonymous';
    const canvas = list.querySelector(`[data-wave="${id}"]`);
    const ctx = canvas.getContext('2d');
    canvas.width = canvas.offsetWidth * 2; canvas.height = 112;

    let ac, analyser, src;
    try {
      ac = new (window.AudioContext || window.webkitAudioContext)();
      analyser = ac.createAnalyser(); analyser.fftSize = 128;
      src = ac.createMediaElementSource(audio);
      src.connect(analyser); analyser.connect(ac.destination);
    } catch { /* dalga formu olmadan da çalsın */ }

    const bars = new Uint8Array(analyser ? analyser.frequencyBinCount : 0);
    const draw = () => {
      if (audio.paused) return;
      requestAnimationFrame(draw);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (!analyser) return;
      analyser.getByteFrequencyData(bars);
      const w = canvas.width / bars.length;
      for (let i = 0; i < bars.length; i++) {
        const h = (bars[i] / 255) * canvas.height;
        ctx.fillStyle = `rgba(224,195,65,${.35 + bars[i] / 400})`;
        ctx.fillRect(i * w, canvas.height - h, w - 3, h);
      }
    };

    audio.onended = () => { button.textContent = '▶ DİNLE'; current = null; };
    await audio.play();
    button.textContent = '⏸ DURDUR';
    current = { audio, button };
    draw();

    button.onclick = () => {
      if (audio.paused) { audio.play(); button.textContent = '⏸ DURDUR'; draw(); }
      else { audio.pause(); button.textContent = '▶ DİNLE'; }
    };
  }

  window.addEventListener('derin:authchange', () => load());
  boot();
})();
