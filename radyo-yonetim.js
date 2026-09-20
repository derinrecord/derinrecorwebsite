(() => {
  const byId = id => document.getElementById(id);
  const safe = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const slugify = v => String(v || '').toLowerCase()
    .replace(/ğ/g,'g').replace(/ü/g,'u').replace(/ş/g,'s').replace(/ı/g,'i').replace(/ö/g,'o').replace(/ç/g,'c')
    .replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
  const clean = n => { try { return decodeURIComponent(n); } catch { return n; } };
  const hhmm = t => t ? String(t).slice(0,5) : '';
  const mmss = s => (!s || !isFinite(s)) ? '—' : Math.floor(s/60) + ':' + String(Math.floor(s%60)).padStart(2,'0');

  let client = null;
  let state = { brands:[], folders:[], tracks:[], players:[], broadcast:[], announcements:[] };
  let recorder = null, chunks = [], recStream = null;

  const coverUrl = p => client.storage.from('radio-covers').getPublicUrl(p).data.publicUrl;
  const playerBase = () => location.href.split('#')[0].split('?')[0].replace(/[^/]*$/, '') + 'radyo.html?key=';

  async function load() {
    await window.DerinAuth.ready;
    const auth = window.DerinAuth;
    const status = byId('radio-status'), app = byId('radio-app');
    client = auth.client;
    if (!auth.configured) { status.textContent = 'Önce Supabase bağlantısını config.js dosyasına ekleyin.'; return; }
    if (!auth.user) {
      status.innerHTML = 'Bu alan yalnızca yöneticilere açıktır. <button class="account-button" id="radio-login">GİRİŞ YAP</button>';
      byId('radio-login').onclick = () => auth.open(); return;
    }
    if (auth.profile?.role !== 'admin') { status.textContent = 'Bu alan için yönetici yetkiniz yok.'; return; }
    status.textContent = `Yönetici: ${auth.profile.full_name || auth.user.email}`;
    app.hidden = false;
    window.addEventListener('hashchange', route);
    await refresh();
  }

  async function refresh() {
    const [brands, folders, tracks, players, broadcast, announcements] = await Promise.all([
      client.from('brands').select('id,name,slug,is_active').order('name'),
      client.from('radio_folders').select('id,name,description,cover_path').order('name'),
      client.from('radio_tracks').select('id,folder_id,title,storage_path,sort_order,duration_sec').order('sort_order'),
      client.from('brand_players').select('id,brand_id,label,player_key,last_seen_at,open_time,close_time').order('label'),
      client.from('brand_broadcast').select('brand_id,folder_id,shuffle,updated_at'),
      client.from('radio_announcements').select('id,brand_id,storage_path,label,created_at').order('created_at',{ascending:false}).limit(20)
    ]);
    state = {
      brands:brands.data||[], folders:folders.data||[], tracks:tracks.data||[],
      players:players.data||[], broadcast:broadcast.data||[], announcements:announcements.data||[]
    };
    route();
  }

  const go = h => { location.hash = h; };

  function route() {
    const [page, id] = (location.hash || '#/').replace(/^#\/?/, '').split('/');
    if (page === 'klasorler') return id ? folderDetail(id) : folderList();
    if (page === 'markalar')  return id ? brandDetail(id) : brandList();
    if (page === 'subeler')   return playerList();
       if (page === 'talepler') return talepList();
    if (page === 'anons')     return anonsPage();
    home();
  }

  const crumb = (...items) => `<nav class="crumb">
    <a href="#/">← PANEL</a>${items.map(t => `<span>${safe(t)}</span>`).join('<span>›</span>')}</nav>`;

  function home() {
    const { brands, folders, tracks, players, broadcast } = state;
    const live = broadcast.filter(b => b.folder_id).length;
    byId('radio-app').innerHTML = `
      <div class="grid">
        <a class="card" href="#/markalar"><div class="ico">🏷</div>
          <h3>MARKALAR</h3><p>${brands.length} marka · ${live} yayında</p></a>
        <a class="card" href="#/klasorler"><div class="ico">🎵</div>
          <h3>YAYIN KLASÖRLERİ</h3><p>${folders.length} klasör · ${tracks.length} parça</p></a>
        <a class="card" href="#/subeler"><div class="ico">📻</div>
          <h3>ŞUBE CİHAZLARI</h3><p>${players.length} şube</p></a>
        <a class="card" href="#/anons"><div class="ico">🎙</div>
          <h3>ANLIK ANONS</h3><p>Mikrofondan canlı duyuru</p></a>
                   <a class="card" href="#/talepler"><div class="ico">📩</div>
          <h3>TEKLİF TALEPLERİ</h3><p>Kahve markalarından gelen başvurular</p></a>     
      </div>`;
  }

  function folderList() {
    const { folders, tracks } = state;
    byId('radio-app').innerHTML = `${crumb('Yayın Klasörleri')}
      <section class="radio-panel">
        <h2>YENİ KLASÖR</h2>
        <div class="radio-row">
          <input id="folder-name" placeholder="Klasör adı (örn. Sabah Açılış — Ambient)">
          <input id="folder-desc" placeholder="Açıklama (isteğe bağlı)">
          <button id="folder-add">EKLE</button>
        </div>
        <p class="radio-msg" id="folder-msg"></p>
      </section>
      <section class="radio-panel">
        <h2>KLASÖRLER</h2>
        <ul class="radio-list">
          ${folders.length ? folders.map(f => `<li class="open-row" data-open="#/klasorler/${f.id}">
            <span style="display:flex;align-items:center;gap:12px">
              ${f.cover_path
                ? `<img src="${coverUrl(f.cover_path)}" alt="" style="width:48px;height:48px;border-radius:14px;object-fit:cover">`
                : '<span style="width:48px;height:48px;border-radius:14px;background:rgba(255,255,255,.07);display:inline-block"></span>'}
              <span><strong>${safe(f.name)}</strong>
                <small>${tracks.filter(t => t.folder_id === f.id).length} parça${f.description ? ' · ' + safe(f.description) : ''}</small></span>
            </span>
            <button data-open="#/klasorler/${f.id}">AÇ ›</button></li>`).join('') : '<li>Henüz klasör yok.</li>'}
        </ul>
      </section>`;
    byId('folder-add').onclick = async () => {
      const name = byId('folder-name').value.trim();
      const msg = byId('folder-msg');
      if (!name) { msg.textContent = 'Klasör adı gerekli.'; return; }
      const { error } = await client.from('radio_folders').insert({
        name, description: byId('folder-desc').value.trim() || null });
      msg.textContent = error ? error.message : 'Klasör eklendi.';
      if (!error) await refresh();
    };
    wireOpen();
  }

  function folderDetail(id) {
    const folder = state.folders.find(f => f.id === id);
    if (!folder) return go('#/klasorler');
    const list = state.tracks.filter(t => t.folder_id === id);
    const cover = folder.cover_path ? coverUrl(folder.cover_path) : null;
    const toplam = list.reduce((s,t) => s + (Number(t.duration_sec)||0), 0);

    byId('radio-app').innerHTML = `${crumb('Klasörler', folder.name)}
      <section class="sp-head">
        ${cover ? `<img class="sp-cover" src="${cover}" alt="">` : '<div class="sp-cover empty">♪</div>'}
        <div class="sp-info">
          <p class="lbl">YAYIN KLASÖRÜ</p>
          <h2>${safe(folder.name)}</h2>
          <p class="sub">${list.length} parça${toplam ? ' · ' + Math.round(toplam/60) + ' dk' : ''}${folder.description ? ' · ' + safe(folder.description) : ''}</p>
        </div>
      </section>

      <div class="sp-bar">
        <button class="sp-play" id="sp-all" title="Tümünü çal">▶</button>
        <label class="drop" id="cover-drop" style="flex:0 1 130px;min-height:44px">
          <input id="cover-file" type="file" accept="image/*"></label>
        <span style="font-size:11px;opacity:.55">${cover ? 'kapağı değiştir' : 'kapak yükle'}</span>
        ${cover ? '<button id="cover-del">KAPAĞI SİL</button>' : ''}
        <input id="f-name" value="${safe(folder.name)}"
          style="flex:1 1 170px;padding:10px 14px;border-radius:14px;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.06);color:inherit;font:inherit;font-size:13px">
        <button id="f-rename">ADI KAYDET</button>
        <button id="f-delete">KLASÖRÜ SİL</button>
      </div>
      <p class="radio-msg" id="f-msg"></p>

      <section class="radio-panel">
        <h2>PARÇA YÜKLE</h2>
        <div class="radio-row">
          <label class="drop" id="track-drop"><input id="track-file" type="file" accept="audio/*" multiple></label>
          <button id="track-upload">YÜKLE</button>
        </div>
        <p class="radio-msg" id="track-msg"></p>
        <div class="sp-th"><span>#</span><span>BAŞLIK</span><span>SÜRE</span><span></span></div>
        <ul class="sp-rows" id="sp-list">
          ${list.length ? list.map((t,i) => `
            <li class="sp-row" draggable="true" data-idx="${i}" data-track="${t.id}">
              <span class="no">${i+1}</span>
              <span class="ttl">${safe(clean(t.title))}</span>
              <span class="dur">${mmss(t.duration_sec)}</span>
              <span class="act">
                <button data-rename-track="${t.id}">AD</button>
                <button data-del-track="${t.id}" data-path="${safe(t.storage_path)}">SİL</button>
              </span></li>`).join('') : '<li style="opacity:.5;padding:16px">Henüz parça yok.</li>'}
        </ul>
      </section>

      <div class="sp-player" id="sp-player">
        <div class="sp-now">
          ${cover ? `<img src="${cover}" alt="">` : '<div style="width:48px;height:48px;border-radius:9px;background:rgba(255,255,255,.08)"></div>'}
          <div class="t"><b id="sp-title">—</b><small>${safe(folder.name)}</small></div>
        </div>
        <div class="sp-ctr">
          <div class="sp-btns">
            <button id="sp-prev">⏮</button>
            <button class="main" id="sp-toggle">▶</button>
            <button id="sp-next">⏭</button>
          </div>
          <div class="sp-seek">
            <span id="sp-cur">0:00</span>
            <input type="range" id="sp-seek" value="0" min="0" max="1000">
            <span id="sp-dur">0:00</span>
          </div>
        </div>
        <div class="sp-vol">🔊<input type="range" id="sp-vol" min="0" max="100" value="100"></div>
      </div>`;

    const audio = window.__spAudio || (window.__spAudio = new Audio());
    const sira = list.slice();
    let aktif = -1;
    const fmt = s => isFinite(s) ? Math.floor(s/60) + ':' + String(Math.floor(s%60)).padStart(2,'0') : '0:00';

    async function cal(i) {
      if (i < 0 || i >= sira.length) return;
      aktif = i;
      const t = sira[i];
      audio.src = client.storage.from('radio-audio').getPublicUrl(t.storage_path).data.publicUrl;
      byId('sp-player').classList.add('on');
      document.body.classList.add('sp-open');
      byId('sp-title').textContent = clean(t.title);
      document.querySelectorAll('.sp-row').forEach(r => r.classList.toggle('playing', r.dataset.track === t.id));
      try { await audio.play(); byId('sp-toggle').textContent = '⏸'; byId('f-msg').textContent = ''; }
      catch { byId('sp-toggle').textContent = '▶'; byId('f-msg').textContent = 'Çalmak için oynatıcıdaki ▶ düğmesine bas.'; }
    }

    byId('sp-all').onclick = () => cal(0);
    byId('sp-toggle').onclick = () => {
      if (audio.paused) { audio.play(); byId('sp-toggle').textContent = '⏸'; }
      else { audio.pause(); byId('sp-toggle').textContent = '▶'; }
    };
    byId('sp-next').onclick = () => cal((aktif + 1) % sira.length);
    byId('sp-prev').onclick = () => cal((aktif - 1 + sira.length) % sira.length);
    byId('sp-vol').oninput = e => { audio.volume = e.target.value / 100; };
    audio.ontimeupdate = () => {
      if (!audio.duration) return;
      byId('sp-cur').textContent = fmt(audio.currentTime);
      byId('sp-dur').textContent = fmt(audio.duration);
      byId('sp-seek').value = Math.round((audio.currentTime / audio.duration) * 1000);
    };
    audio.onended = () => cal((aktif + 1) % sira.length);
    byId('sp-seek').oninput = e => { if (audio.duration) audio.currentTime = (e.target.value/1000) * audio.duration; };

    document.querySelectorAll('.sp-row').forEach(row => {
      row.addEventListener('click', e => {
        if (e.target.tagName === 'BUTTON') return;
        cal(sira.findIndex(t => t.id === row.dataset.track));
      });
    });

    let tasinan = null;
    document.querySelectorAll('.sp-row[draggable]').forEach(row => {
      row.addEventListener('dragstart', () => { tasinan = +row.dataset.idx; row.style.opacity = '.4'; });
      row.addEventListener('dragend', () => { row.style.opacity = ''; });
      row.addEventListener('dragover', e => { e.preventDefault(); row.style.background = 'rgba(224,195,65,.14)'; });
      row.addEventListener('dragleave', () => { row.style.background = ''; });
      row.addEventListener('drop', async e => {
        e.preventDefault();
        const hedef = +row.dataset.idx;
        if (tasinan === null || tasinan === hedef) return;
        const yeni = list.slice();
        const [x] = yeni.splice(tasinan, 1);
        yeni.splice(hedef, 0, x);
        tasinan = null;
        byId('f-msg').textContent = 'Sıra kaydediliyor…';
        await Promise.all(yeni.map((t,i) => client.from('radio_tracks').update({ sort_order:i }).eq('id', t.id)));
        byId('f-msg').textContent = 'Sıra güncellendi.';
        await refresh();
      });
    });

    byId('f-rename').onclick = async () => {
      const name = byId('f-name').value.trim();
      if (!name) return;
      const { error } = await client.from('radio_folders').update({ name }).eq('id', id);
      byId('f-msg').textContent = error ? error.message : 'Ad güncellendi.';
      if (!error) await refresh();
    };

    byId('f-delete').onclick = async () => {
      if (!confirm('Klasör ve içindeki parça kayıtları silinecek. Emin misiniz?')) return;
      await client.from('radio_folders').delete().eq('id', id);
      go('#/klasorler'); await refresh();
    };

    const coverDel = byId('cover-del');
    if (coverDel) coverDel.onclick = async () => {
      if (!confirm('Kapak görseli silinecek. Emin misiniz?')) return;
      byId('f-msg').textContent = 'Kapak siliniyor…';
      if (folder.cover_path) await client.storage.from('radio-covers').remove([folder.cover_path]);
      const { error } = await client.from('radio_folders').update({ cover_path:null }).eq('id', id);
      byId('f-msg').textContent = error ? error.message : 'Kapak silindi.';
      if (!error) await refresh();
    };

    const coverFile = byId('cover-file');
    coverFile.onchange = async () => {
      const file = coverFile.files?.[0];
      if (!file) return;
      byId('f-msg').textContent = 'Kapak yükleniyor…';
      const path = `${id}/${Date.now()}.${(file.name.split('.').pop()||'jpg').toLowerCase()}`;
      const up = await client.storage.from('radio-covers').upload(path, file, { contentType: file.type || 'image/jpeg' });
      if (up.error) { byId('f-msg').textContent = 'Yükleme hatası: ' + up.error.message; return; }
      const { error } = await client.from('radio_folders').update({ cover_path: path }).eq('id', id);
      byId('f-msg').textContent = error ? error.message : 'Kapak güncellendi.';
      if (!error) await refresh();
    };

    const trackFile = byId('track-file'), trackDrop = byId('track-drop');
    trackFile.onchange = () => {
      const n = trackFile.files?.length || 0;
      trackDrop.classList.toggle('has-file', n > 0);
      byId('track-msg').textContent = n ? `${n} dosya seçildi.` : '';
    };

    byId('track-upload').onclick = async () => {
      const files = Array.from(trackFile.files || []);
      const msg = byId('track-msg');
      if (!files.length) { msg.textContent = 'Dosya seçin.'; return; }
      const btn = byId('track-upload');
      btn.disabled = true;
      const basla = Date.now();
      let done = 0, hatali = 0;
      for (const file of files) {
        const yuzde = Math.round((done / files.length) * 100);
        msg.innerHTML = `Yükleniyor… <b>${done+1}/${files.length}</b> · %${yuzde}
          <span style="display:block;height:4px;border-radius:99px;background:rgba(255,255,255,.14);margin-top:6px;overflow:hidden">
            <span style="display:block;height:100%;width:${yuzde}%;background:#e0c341;transition:width .3s"></span></span>`;
        const base = clean(file.name).replace(/\.[^.]+$/, '');
        const path = `${id}/${Date.now()}-${slugify(base)}.${file.name.split('.').pop() || 'mp3'}`;
        const up = await client.storage.from('radio-audio').upload(path, file, { contentType: file.type || 'audio/mpeg' });
        if (up.error) { hatali++; done++; continue; }
        let sure = null;
        try {
          sure = await new Promise(res => {
            const a = new Audio(URL.createObjectURL(file));
            a.onloadedmetadata = () => res(Math.round(a.duration));
            a.onerror = () => res(null);
            setTimeout(() => res(null), 8000);
          });
        } catch {}
        const { error } = await client.from('radio_tracks').insert({
          folder_id:id, title:base, storage_path:path, sort_order:list.length + done, duration_sec:sure });
        if (error) { hatali++; done++; continue; }
        done++;
      }
      const sn = Math.round((Date.now() - basla)/1000);
      msg.textContent = `${done - hatali} parça yüklendi (${sn} sn)` + (hatali ? ` · ${hatali} dosya atlandı.` : '.');
      trackFile.value = '';
      trackDrop.classList.remove('has-file');
      btn.disabled = false;
      await refresh();
    };

    document.querySelectorAll('[data-rename-track]').forEach(b => b.onclick = async ev => {
      ev.stopPropagation();
      const track = list.find(t => t.id === b.dataset.renameTrack);
      const name = prompt('Parça adı:', clean(track.title));
      if (!name) return;
      await client.from('radio_tracks').update({ title: name.trim() }).eq('id', track.id);
      await refresh();
    });

    document.querySelectorAll('[data-del-track]').forEach(b => b.onclick = async ev => {
      ev.stopPropagation();
      if (!confirm('Parça silinecek. Emin misiniz?')) return;
      await client.storage.from('radio-audio').remove([b.dataset.path]);
      await client.from('radio_tracks').delete().eq('id', b.dataset.delTrack);
      await refresh();
    });
  }

  function brandList() {
    const { brands, players, broadcast } = state;
    byId('radio-app').innerHTML = `${crumb('Markalar')}
      <section class="radio-panel">
        <h2>YENİ MARKA</h2>
        <div class="radio-row">
          <input id="brand-name" placeholder="Marka adı (örn. Chemex)">
          <input id="brand-contact" placeholder="İletişim (isteğe bağlı)">
          <button id="brand-add">EKLE</button>
        </div>
        <p class="radio-msg" id="brand-msg"></p>
      </section>
      <section class="radio-panel">
        <h2>MARKALAR</h2>
        <ul class="radio-list">
          ${brands.length ? brands.map(b => {
            const cur = broadcast.find(x => x.brand_id === b.id);
            return `<li class="open-row" data-open="#/markalar/${b.id}">
              <span><strong>${safe(b.name)}</strong>
                ${cur?.folder_id ? '<span class="radio-live">YAYINDA</span>' : ''}
                <small>${players.filter(p => p.brand_id === b.id).length} şube</small></span>
              <button data-open="#/markalar/${b.id}">AÇ ›</button></li>`;
          }).join('') : '<li>Henüz marka yok.</li>'}
        </ul>
      </section>`;
    byId('brand-add').onclick = async () => {
      const name = byId('brand-name').value.trim();
      const msg = byId('brand-msg');
      if (!name) { msg.textContent = 'Marka adı gerekli.'; return; }
      const { error } = await client.from('brands').insert({
        name, slug: slugify(name), contact: byId('brand-contact').value.trim() || null });
      msg.textContent = error ? error.message : 'Marka eklendi.';
      if (!error) await refresh();
    };
    wireOpen();
  }

  function brandDetail(id) {
    const brand = state.brands.find(b => b.id === id);
    if (!brand) return go('#/markalar');
    const subs = state.players.filter(p => p.brand_id === id);
    const cur = state.broadcast.find(x => x.brand_id === id);
    const anons = state.announcements.filter(a => a.brand_id === id);

    byId('radio-app').innerHTML = `${crumb('Markalar', brand.name)}
      <section class="radio-panel">
        <h2>CANLI YAYIN</h2>
        <div class="radio-row">
          <select id="live-folder"><option value="">— yayını durdur —</option>${
            state.folders.map(f => `<option value="${f.id}"${cur?.folder_id === f.id ? ' selected' : ''}>${safe(f.name)}</option>`).join('')}</select>
        </div>
                  <button id="live-shuffle" style="${cur?.shuffle !== false
            ? 'border-color:rgba(24,195,125,.5);background:rgba(24,195,125,.14);color:#6ee7b0'
            : ''}">${cur?.shuffle !== false ? '🔀 KARIŞIK ÇALIYOR' : '➜ SIRAYLA ÇALIYOR'}</button>
        <p class="radio-msg" id="live-msg">${cur?.folder_id ? 'Şu an yayında.' : 'Yayın kapalı.'}</p>
      </section>
      <section class="radio-panel">
        <h2>ŞUBELER</h2>
        <div class="radio-row">
          <input id="p-label" placeholder="Şube adı (örn. Chemex Alsancak)">
          <input id="p-open" type="time" title="Açılış">
          <input id="p-close" type="time" title="Kapanış">
          <button id="p-add">EKLE</button>
        </div>
        <p class="radio-msg" id="p-msg">Saat boş bırakılırsa yayın kesintisiz sürer.</p>
        <ul class="radio-list">
          ${subs.length ? subs.map(p => `<li>
            <span><strong>${safe(p.label)}</strong>
              <small>${playerBase()}${safe(p.player_key)}</small>
              <small>${p.last_seen_at ? 'son bağlantı: ' + new Date(p.last_seen_at).toLocaleString('tr-TR') : 'hiç bağlanmadı'}</small></span>
            <span style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
              <input type="time" value="${hhmm(p.open_time)}" data-hours="open" data-player="${p.id}"
                style="padding:8px 10px;border-radius:12px;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.06);color:inherit;font:inherit;font-size:12px">
              <input type="time" value="${hhmm(p.close_time)}" data-hours="close" data-player="${p.id}"
                style="padding:8px 10px;border-radius:12px;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.06);color:inherit;font:inherit;font-size:12px">
              <button data-copy="${playerBase()}${safe(p.player_key)}">LİNKİ KOPYALA</button>
              <button data-del-player="${p.id}">SİL</button>
            </span></li>`).join('') : '<li>Henüz şube yok.</li>'}
        </ul>
      </section>
      <section class="radio-panel">
        <h2>ANONS GEÇMİŞİ</h2>
        <ul class="radio-list">
          ${anons.length ? anons.map(a => `<li>
            <span><strong>${safe(a.label || 'Anons')}</strong>
              <small>${new Date(a.created_at).toLocaleString('tr-TR')}</small></span>
            <button data-del-anons="${a.id}" data-path="${safe(a.storage_path)}">SİL</button></li>`).join('') : '<li>Henüz anons yok.</li>'}
        </ul>
      </section>`;

    byId('live-folder').onchange = async e => {
          byId('live-shuffle').onclick = async () => {
      const yeni = !(cur?.shuffle !== false);
      const { error } = await client.from('brand_broadcast').upsert({
        brand_id: id,
        folder_id: cur?.folder_id || null,
        shuffle: yeni,
        updated_at: new Date().toISOString()
      });
      byId('live-msg').textContent = error ? error.message
        : (yeni ? 'Karışık çalma açıldı — her tur yeniden karışır.' : 'Sırayla çalma açıldı.');
      await refresh();
    };
      const { error } = await client.from('brand_broadcast').upsert({
        brand_id:id, folder_id:e.target.value || null, updated_at:new Date().toISOString() });
      byId('live-msg').textContent = error ? error.message
        : (e.target.value ? 'Yayın güncellendi — şubelere gönderildi.' : 'Yayın durduruldu.');
      await refresh();
    };

    byId('p-add').onclick = async () => {
      const label = byId('p-label').value.trim();
      if (!label) { byId('p-msg').textContent = 'Şube adı gerekli.'; return; }
      const { error } = await client.from('brand_players').insert({
        brand_id:id, label, open_time:byId('p-open').value || null, close_time:byId('p-close').value || null });
      byId('p-msg').textContent = error ? error.message : 'Şube eklendi.';
      if (!error) await refresh();
    };
    wireCommon();
  }

  function playerList() {
    const { players, brands } = state;
    byId('radio-app').innerHTML = `${crumb('Şube Cihazları')}
      <section class="radio-panel">
        <h2>TÜM ŞUBELER</h2>
        <p class="radio-msg" id="p-msg">Yeni şube eklemek için marka sayfasını açın.</p>
        <ul class="radio-list">
          ${players.length ? players.map(p => `<li>
            <span><strong>${safe(p.label)}</strong>
              <small>${safe(brands.find(b => b.id === p.brand_id)?.name || '—')}</small>
              <small>${playerBase()}${safe(p.player_key)}</small>
              <small>${p.last_seen_at ? 'son bağlantı: ' + new Date(p.last_seen_at).toLocaleString('tr-TR') : 'hiç bağlanmadı'}</small></span>
            <span style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
              <input type="time" value="${hhmm(p.open_time)}" data-hours="open" data-player="${p.id}"
                style="padding:8px 10px;border-radius:12px;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.06);color:inherit;font:inherit;font-size:12px">
              <input type="time" value="${hhmm(p.close_time)}" data-hours="close" data-player="${p.id}"
                style="padding:8px 10px;border-radius:12px;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.06);color:inherit;font:inherit;font-size:12px">
              <button data-copy="${playerBase()}${safe(p.player_key)}">LİNKİ KOPYALA</button>
              <button data-del-player="${p.id}">SİL</button>
            </span></li>`).join('') : '<li>Henüz şube yok.</li>'}
        </ul>
      </section>`;
    wireCommon();
  }

  function anonsPage() {
    const { brands, announcements } = state;
    byId('radio-app').innerHTML = `${crumb('Anlık Anons')}
      <section class="radio-panel">
        <h2>YENİ ANONS</h2>
        <div class="radio-row">
          <select id="anons-brand"><option value="">Marka seçin</option>${
            brands.map(b => `<option value="${b.id}">${safe(b.name)}</option>`).join('')}</select>
          <input id="anons-label" placeholder="Not (örn. Kampanya duyurusu)">
          <button id="anons-rec">🎙 KAYDA BAŞLA</button>
        </div>
        <p class="radio-msg" id="anons-msg">Marka seçip kayda başlayın. Bitirdiğinizde anons tüm şubelere gönderilir.</p>
      </section>
      <section class="radio-panel">
        <h2>GEÇMİŞ</h2>
        <ul class="radio-list">
          ${announcements.length ? announcements.map(a => `<li>
            <span><strong>${safe(a.label || 'Anons')}</strong>
              <small>${safe(brands.find(b => b.id === a.brand_id)?.name || '—')} · ${new Date(a.created_at).toLocaleString('tr-TR')}</small></span>
            <button data-del-anons="${a.id}" data-path="${safe(a.storage_path)}">SİL</button></li>`).join('') : '<li>Henüz anons yok.</li>'}
        </ul>
      </section>`;

    byId('anons-rec').onclick = async () => {
      const msg = byId('anons-msg'), button = byId('anons-rec');
      if (recorder && recorder.state === 'recording') { recorder.stop(); return; }
      const brandId = byId('anons-brand').value;
      if (!brandId) { msg.textContent = 'Önce marka seçin.'; return; }
      const label = byId('anons-label').value.trim();
      try { recStream = await navigator.mediaDevices.getUserMedia({ audio:true }); }
      catch (err) { msg.textContent = 'Mikrofona erişilemedi: ' + err.name; return; }
      chunks = [];
      recorder = new MediaRecorder(recStream);
      recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
      recorder.onstop = async () => {
        recStream.getTracks().forEach(t => t.stop());
        button.textContent = '🎙 KAYDA BAŞLA';
        button.classList.remove('rec-on');
        msg.textContent = 'Gönderiliyor…';
        const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
        const ext = (recorder.mimeType || '').includes('mp4') ? 'mp4' : 'webm';
        const path = `${brandId}/${Date.now()}.${ext}`;
        const up = await client.storage.from('radio-announcements').upload(path, blob, { contentType: blob.type });
        if (up.error) { msg.textContent = 'Yükleme hatası: ' + up.error.message; return; }
        const { error } = await client.from('radio_announcements').insert({
          brand_id:brandId, storage_path:path, label:label || null });
        msg.textContent = error ? error.message : 'Anons tüm şubelere gönderildi.';
        byId('anons-label').value = '';
        if (!error) await refresh();
      };
      recorder.start();
      button.textContent = '⏹ DURDUR VE GÖNDER';
      button.classList.add('rec-on');
      msg.textContent = 'Kayıt sürüyor… Konuşun, bitince durdurun.';
    };
    wireCommon();
  }
  async function talepList() {
    byId('radio-app').innerHTML = `${crumb('Teklif Talepleri')}
      <section class="radio-panel"><h2>GELEN TALEPLER</h2>
        <p class="radio-msg" id="tl-msg">Yükleniyor…</p>
        <ul class="radio-list" id="tl-list"></ul></section>`;

    const { data, error } = await client.from('coffee_requests')
      .select('id,company,contact_name,email,phone,branch_count,message,status,created_at')
      .order('created_at', { ascending:false });

    if (error) { byId('tl-msg').textContent = 'Okunamadı: ' + error.message; return; }
    const list = data || [];
    byId('tl-msg').textContent = list.length ? `${list.length} talep` : 'Henüz talep yok.';
    byId('tl-list').innerHTML = list.map(t => `<li>
      <span><strong>${safe(t.company)}</strong>
        <small>${safe(t.contact_name)} · ${safe(t.email)}${t.phone ? ' · ' + safe(t.phone) : ''}</small>
        <small>${t.branch_count ? t.branch_count + ' şube · ' : ''}${new Date(t.created_at).toLocaleString('tr-TR')}</small>
        ${t.message ? `<small style="opacity:.8">"${safe(t.message)}"</small>` : ''}</span>
      <span style="display:flex;gap:8px;align-items:center">
        <select data-tl="${t.id}">
          ${['new','contacted','closed'].map(s => `<option value="${s}"${t.status===s?' selected':''}>${
            {new:'Yeni', contacted:'İletişime geçildi', closed:'Kapandı'}[s]}</option>`).join('')}
        </select>
        <button data-tl-del="${t.id}">SİL</button></span></li>`).join('');

    document.querySelectorAll('[data-tl]').forEach(s => s.onchange = async () => {
      const { error } = await client.from('coffee_requests').update({ status:s.value }).eq('id', s.dataset.tl);
      byId('tl-msg').textContent = error ? error.message : 'Durum güncellendi.';
    });
    document.querySelectorAll('[data-tl-del]').forEach(b => b.onclick = async () => {
      if (!confirm('Talep silinecek. Emin misiniz?')) return;
      await client.from('coffee_requests').delete().eq('id', b.dataset.tlDel);
      talepList();
    });
    wireOpen();
  }
  function wireOpen() {
    document.querySelectorAll('[data-open]').forEach(el => {
      el.onclick = e => { e.stopPropagation(); go(el.dataset.open); };
    });
  }

  function wireCommon() {
    document.querySelectorAll('[data-hours]').forEach(input => {
      input.onchange = async () => {
        const field = input.dataset.hours === 'open' ? 'open_time' : 'close_time';
        const { error } = await client.from('brand_players')
          .update({ [field]: input.value || null }).eq('id', input.dataset.player);
        const msg = byId('p-msg');
        if (msg) msg.textContent = error ? error.message : 'Saat güncellendi.';
      };
    });
    document.querySelectorAll('[data-copy]').forEach(b => b.onclick = async () => {
      try { await navigator.clipboard.writeText(b.dataset.copy); b.textContent = 'KOPYALANDI'; }
      catch { b.textContent = 'KOPYALANAMADI'; }
      setTimeout(() => { b.textContent = 'LİNKİ KOPYALA'; }, 1600);
    });
    document.querySelectorAll('[data-del-player]').forEach(b => b.onclick = async () => {
      if (!confirm('Şube silinecek. Emin misiniz?')) return;
      await client.from('brand_players').delete().eq('id', b.dataset.delPlayer);
      await refresh();
    });
    document.querySelectorAll('[data-del-anons]').forEach(b => b.onclick = async () => {
      if (!confirm('Anons silinecek. Emin misiniz?')) return;
      await client.storage.from('radio-announcements').remove([b.dataset.path]);
      await client.from('radio_announcements').delete().eq('id', b.dataset.delAnons);
      await refresh();
    });
    wireOpen();
  }

  load();
})();
/* Karışık çalma düğmesi — güvenli bağlama */
document.addEventListener('click', async e => {
  const b = e.target.closest('#live-shuffle');
  if (!b) return;
  e.preventDefault();

  const id = (location.hash.split('/')[2] || '').trim();
  if (!id) return;

  const c = window.DerinAuth?.client;
  if (!c) return;

  const msg = document.getElementById('live-msg');
  b.disabled = true;
  if (msg) msg.textContent = 'Güncelleniyor…';

  const mevcut = await c.from('brand_broadcast').select('folder_id,shuffle').eq('brand_id', id).maybeSingle();
  if (mevcut.error) { if (msg) msg.textContent = 'Okunamadı: ' + mevcut.error.message; b.disabled = false; return; }

  const yeni = !(mevcut.data?.shuffle !== false);
  const { error } = await c.from('brand_broadcast').upsert({
    brand_id: id,
    folder_id: mevcut.data?.folder_id || null,
    shuffle: yeni,
    updated_at: new Date().toISOString()
  });

  if (msg) msg.textContent = error ? ('Kaydedilemedi: ' + error.message)
    : (yeni ? 'Karışık çalma açıldı — her tur yeniden karışır.' : 'Sırayla çalma açıldı.');

  b.textContent = yeni ? '🔀 KARIŞIK ÇALIYOR' : '➜ SIRAYLA ÇALIYOR';
  b.style.cssText = yeni ? 'border-color:rgba(24,195,125,.5);background:rgba(24,195,125,.14);color:#6ee7b0' : '';
  b.disabled = false;
});
