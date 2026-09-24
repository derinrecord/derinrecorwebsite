(() => {
  const byId = id => document.getElementById(id);

  function askConfirm(message){
    return new Promise(resolve => {
      const overlay = document.createElement('div');
      overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:99999;display:flex;align-items:center;justify-content:center;padding:20px;font-family:inherit';
      const box = document.createElement('div');
      box.style.cssText = 'max-width:420px;width:100%;padding:24px;border-radius:20px;background:#1a1a1e;border:1px solid rgba(255,255,255,.15);box-shadow:0 20px 60px rgba(0,0,0,.5);color:#f4f1e9;font-size:14px;line-height:1.5';
      const p = document.createElement('p');
      p.style.cssText = 'margin:0 0 20px;white-space:pre-wrap';
      p.textContent = message;
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;gap:10px;justify-content:flex-end';
      const cancelBtn = document.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.textContent = 'İPTAL';
      cancelBtn.style.cssText = 'padding:10px 18px;border-radius:12px;border:1px solid rgba(255,255,255,.22);background:rgba(255,255,255,.07);color:inherit;font:inherit;font-size:12px;cursor:pointer';
      const okBtn = document.createElement('button');
      okBtn.type = 'button';
      okBtn.textContent = 'EVET';
      okBtn.style.cssText = 'padding:10px 18px;border-radius:12px;border:1px solid rgba(254,75,69,.5);background:rgba(254,75,69,.18);color:#ffb4b0;font:inherit;font-size:12px;cursor:pointer;font-weight:700';
      function close(result){ overlay.remove(); document.removeEventListener('keydown', onKey); resolve(result); }
      function onKey(e){ if(e.key==='Escape'){ e.preventDefault(); close(false); } if(e.key==='Enter'){ e.preventDefault(); close(true); } }
      cancelBtn.onclick = () => close(false);
      okBtn.onclick = () => close(true);
      overlay.onclick = (e) => { if(e.target === overlay) close(false); };
      row.appendChild(cancelBtn); row.appendChild(okBtn);
      box.appendChild(p); box.appendChild(row);
      overlay.appendChild(box);
      document.body.appendChild(overlay);
      document.addEventListener('keydown', onKey);
      okBtn.focus();
    });
  }
  function askAlert(message){
    return new Promise(resolve => {
      const overlay = document.createElement('div');
      overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:99999;display:flex;align-items:center;justify-content:center;padding:20px;font-family:inherit';
      const box = document.createElement('div');
      box.style.cssText = 'max-width:420px;width:100%;padding:24px;border-radius:20px;background:#1a1a1e;border:1px solid rgba(255,255,255,.15);box-shadow:0 20px 60px rgba(0,0,0,.5);color:#f4f1e9;font-size:14px;line-height:1.5';
      const p = document.createElement('p');
      p.style.cssText = 'margin:0 0 20px;white-space:pre-wrap';
      p.textContent = message;
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;justify-content:flex-end';
      const okBtn = document.createElement('button');
      okBtn.type = 'button';
      okBtn.textContent = 'TAMAM';
      okBtn.style.cssText = 'padding:10px 18px;border-radius:12px;border:1px solid rgba(255,255,255,.22);background:rgba(255,255,255,.1);color:inherit;font:inherit;font-size:12px;cursor:pointer;font-weight:700';
      function close(){ overlay.remove(); document.removeEventListener('keydown', onKey); resolve(); }
      function onKey(e){ if(e.key==='Escape'||e.key==='Enter'){ e.preventDefault(); close(); } }
      okBtn.onclick = close;
      overlay.onclick = (e) => { if(e.target === overlay) close(); };
      row.appendChild(okBtn);
      box.appendChild(p); box.appendChild(row);
      overlay.appendChild(box);
      document.body.appendChild(overlay);
      document.addEventListener('keydown', onKey);
      okBtn.focus();
    });
  }

  function askMoveTarget(trackTitle){
  return new Promise(resolve => {
    const brandPlaylists = state.brands
      .map(b => ({ brand: b, playlists: state.playlists.filter(p => p.brand_id === b.id) }))
      .filter(x => x.playlists.length);
    if (!brandPlaylists.length) { askAlert('Önce bir markaya çalma listesi eklemelisiniz.').then(() => resolve(null)); return; }
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:99999;display:flex;align-items:center;justify-content:center;padding:20px;font-family:inherit';
    const box = document.createElement('div');
    box.style.cssText = 'max-width:420px;width:100%;padding:24px;border-radius:20px;background:#1a1a1e;border:1px solid rgba(255,255,255,.15);box-shadow:0 20px 60px rgba(0,0,0,.5);color:#f4f1e9;font-size:14px;line-height:1.5';
    const p = document.createElement('p');
    p.style.cssText = 'margin:0 0 16px;white-space:pre-wrap';
    p.textContent = `"${trackTitle}" hangi markanın hangi listesine eklensin?`;
    const brandSel = document.createElement('select');
    brandSel.style.cssText = 'width:100%;padding:10px 14px;border-radius:12px;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.06);color:inherit;font:inherit;font-size:13px;margin-bottom:10px';
    brandPlaylists.forEach(x => { const o = document.createElement('option'); o.value = x.brand.id; o.textContent = x.brand.name; brandSel.appendChild(o); });
    const playlistSel = document.createElement('select');
    playlistSel.style.cssText = brandSel.style.cssText;
    function fillPlaylists(){
      playlistSel.innerHTML = '';
      const entry = brandPlaylists.find(x => x.brand.id === brandSel.value);
      (entry ? entry.playlists : []).forEach(pl => { const o = document.createElement('option'); o.value = pl.id; o.textContent = pl.name; playlistSel.appendChild(o); });
    }
    brandSel.onchange = fillPlaylists;
    fillPlaylists();
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:10px;justify-content:flex-end;margin-top:6px';
    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.textContent = 'İPTAL';
    cancelBtn.style.cssText = 'padding:10px 18px;border-radius:12px;border:1px solid rgba(255,255,255,.22);background:rgba(255,255,255,.07);color:inherit;font:inherit;font-size:12px;cursor:pointer';
    const okBtn = document.createElement('button');
    okBtn.type = 'button';
    okBtn.textContent = 'EKLE';
    okBtn.style.cssText = 'padding:10px 18px;border-radius:12px;border:1px solid rgba(24,195,125,.5);background:rgba(24,195,125,.18);color:#8ef0c4;font:inherit;font-size:12px;cursor:pointer;font-weight:700';
    function close(result){ overlay.remove(); document.removeEventListener('keydown', onKey); resolve(result); }
    function onKey(e){ if(e.key==='Escape'){ e.preventDefault(); close(null); } }
    cancelBtn.onclick = () => close(null);
    okBtn.onclick = () => close({ brandId: brandSel.value, playlistId: playlistSel.value });
    overlay.onclick = (e) => { if(e.target === overlay) close(null); };
    row.appendChild(cancelBtn); row.appendChild(okBtn);
    box.appendChild(p); box.appendChild(brandSel); box.appendChild(playlistSel); box.appendChild(row);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    document.addEventListener('keydown', onKey);
  });
}

const safe = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const slugify = v => String(v || '').toLowerCase()
    .replace(/ğ/g,'g').replace(/ü/g,'u').replace(/ş/g,'s').replace(/ı/g,'i').replace(/ö/g,'o').replace(/ç/g,'c')
    .replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
  const clean = n => { try { return decodeURIComponent(n); } catch { return n; } };
  const hhmm = t => t ? String(t).slice(0,5) : '';
  const mmss = s => (!s || !isFinite(s)) ? '—' : Math.floor(s/60) + ':' + String(Math.floor(s%60)).padStart(2,'0');

  let client = null;
  let state = { brands:[], folders:[], tracks:[], players:[], broadcast:[], announcements:[], playlists:[], playlistTracks:[], coffeeAttempts:[] };
  let recorder = null, chunks = [], recStream = null;

  const coverUrl = p => client.storage.from('radio-covers').getPublicUrl(p).data.publicUrl;
  const siteRoot = () => location.href.split('#')[0].split('?')[0].replace(/[^/]*$/, '');
  const playerBase = () => siteRoot() + 'radyo.html?key=';
  const brandPreviewUrl = b => siteRoot() + 'coffee/' + encodeURIComponent(b.slug || '');
  const badge = (on, textOn, textOff) => `<span style="display:inline-block;padding:3px 11px;border-radius:999px;font-size:11px;font-weight:700;letter-spacing:.04em;white-space:nowrap;
    background:${on ? 'rgba(24,195,125,.16)' : 'rgba(255,255,255,.07)'};color:${on ? '#6ee7b0' : 'rgba(255,255,255,.55)'};
    border:1px solid ${on ? 'rgba(24,195,125,.4)' : 'rgba(255,255,255,.16)'}">${on ? textOn : textOff}</span>`;
  const isFresh = p => p.last_seen_at && (Date.now() - new Date(p.last_seen_at).getTime()) < 150000;
  const trackBadge = p => badge(isFresh(p), '● BAĞLI', '○ BAĞLI DEĞİL');
  const playingBadge = p => (p.is_playing && isFresh(p))
    ? `<span class="derin-live-dot" style="display:inline-block;padding:3px 11px;border-radius:999px;font-size:11px;font-weight:700;letter-spacing:.04em;white-space:nowrap;
        background:rgba(24,195,125,.22);color:#6ee7b0;border:1px solid rgba(24,195,125,.55)">▶ ÇALIYOR</span>`
    : '';
  const lockBadge = p => {
    const html = `<span style="display:inline-block;padding:3px 11px;border-radius:999px;font-size:11px;font-weight:700;letter-spacing:.04em;white-space:nowrap;
      background:${p.bound_device_id ? 'rgba(232,209,90,.16)' : 'rgba(255,255,255,.07)'};color:${p.bound_device_id ? '#e8d15a' : 'rgba(255,255,255,.55)'};
      border:1px solid ${p.bound_device_id ? 'rgba(232,209,90,.4)' : 'rgba(255,255,255,.16)'}">${p.bound_device_id ? '🔒 KİLİTLİ' : '🔓 KİLİT YOK'}</span>`;
    return html;
  };
  const lockInfo = p => {
    const parts = [];
    if (p.bound_device_id && p.bound_at) parts.push('kilitlenme: ' + new Date(p.bound_at).toLocaleString('tr-TR'));
    if (p.last_ip) parts.push('IP: ' + safe(p.last_ip));
    return parts.join(' · ');
  };

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
    injectLiveStyle();
    watchPlayers();
    await refresh();
  }

  function injectLiveStyle() {
    if (byId('derin-live-style')) return;
    const style = document.createElement('style');
    style.id = 'derin-live-style';
    style.textContent = '@keyframes derinPulse{0%,100%{opacity:1}50%{opacity:.3}} .derin-live-dot{animation:derinPulse 1.1s ease-in-out infinite}';
    document.head.appendChild(style);
  }

  let refreshTimer = null;
  function watchPlayers() {
    client.channel('admin-brand-players')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'brand_players' }, () => {
        clearTimeout(refreshTimer);
        refreshTimer = setTimeout(refresh, 800);
      })
      .subscribe();
  }

  async function refresh() {
    const [brands, folders, tracks, players, broadcast, announcements, playlists, playlistTracks, coffeeAttempts] = await Promise.all([
      client.from('brands').select('id,name,slug,is_active,access_code').order('name'),
      client.from('radio_folders').select('id,name,description,cover_path,shuffle').order('name'),
      client.from('radio_tracks').select('id,folder_id,title,storage_path,sort_order,duration_sec').order('sort_order'),
      client.from('brand_players').select('id,brand_id,label,player_key,last_seen_at,open_time,close_time,bound_device_id,bound_at,first_ip,last_ip,last_ip_at,is_playing').order('label'),
      client.from('brand_broadcast').select('brand_id,folder_id,shuffle,updated_at'),
      client.from('radio_announcements').select('id,brand_id,storage_path,label,created_at').order('created_at',{ascending:false}).limit(20),
      client.from('brand_playlists').select('id,brand_id,name,description,cover_path,shuffle,created_at').order('created_at'),
      client.from('brand_playlist_tracks').select('id,playlist_id,track_id,sort_order').order('sort_order'),
      client.from('coffee_access_attempts').select('id,brand_id,slug,success,ip,created_at').order('created_at',{ascending:false}).limit(200)
    ]);
    state = {
      brands:brands.data||[], folders:folders.data||[], tracks:tracks.data||[],
      players:players.data||[], broadcast:broadcast.data||[], announcements:announcements.data||[],
      playlists:playlists.data||[], playlistTracks:playlistTracks.data||[],
      coffeeAttempts:coffeeAttempts.data||[]
    };
    route();
  }

  const go = h => { location.hash = h; };

  function route() {
    const [page, id, section, itemId] = (location.hash || '#/').replace(/^#\/?/, '').split('/');
    if (page === 'klasorler') return id ? folderDetail(id) : folderList();
    if (page === 'markalar')  return section === 'listeler' ? playlistDetail(id, itemId) : (id ? brandDetail(id) : brandList());
    if (page === 'subeler')   return playerList();
        if (page === 'abonelikler') return abonelikList();
       if (page === 'talepler') return talepList();
    if (page === 'anons')     return anonsPage();
    home();
  }

  const crumb = (...items) => `<nav class="crumb">
    <a href="#/">← PANEL</a>${items.map(t => `<span>${safe(t)}</span>`).join('<span>›</span>')}</nav>`;

  function home() {
    const { brands, folders, tracks, players, broadcast } = state;
    const live = broadcast.filter(b => b.folder_id).length;
    const onlineCount = players.filter(p => isFresh(p)).length;
    const lockedCount = players.filter(p => p.bound_device_id).length;
    const playingCount = players.filter(p => p.is_playing && isFresh(p)).length;
    byId('radio-app').innerHTML = `
      <div class="grid">
        <a class="card" href="#/markalar"><div class="ico">🏷</div>
          <h3>MARKALAR</h3><p>${brands.length} marka · ${live} yayında · ${playingCount} canlı çalıyor</p></a>
        <a class="card" href="#/klasorler"><div class="ico">🎵</div>
          <h3>YAYIN KLASÖRLERİ</h3><p>${folders.length} klasör · ${tracks.length} parça</p></a>
        <a class="card" href="#/subeler"><div class="ico">📻</div>
          <h3>ŞUBE TAKİP PANELİ</h3><p>${players.length} şube · ${onlineCount} bağlı · ${lockedCount} kilitli</p></a>
        <a class="card" href="#/anons"><div class="ico">🎙</div>
          <h3>ANLIK ANONS</h3><p>Mikrofondan canlı duyuru</p></a>
        <a class="card" href="#/abonelikler"><div class="ico">💳</div>
          <h3>ABONELİKLER</h3><p>Marka paketleri, deneme ve lisans süreleri</p></a>
        <a class="card" href="#/talepler"><div class="ico">📩</div>
          <h3>TEKLİF TALEPLERİ</h3><p>Kahve markalarından gelen başvurular</p></a>     
      </div>`;
  }

  function folderList() {
    const { folders, tracks, brands, playlists, playlistTracks } = state;
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
      </section>
      <section class="radio-panel">
        <h2>MARKA LİSTELERİ</h2>
        <ul class="radio-list">
          ${playlists.length ? playlists.map(p => {
            const b = brands.find(x => x.id === p.brand_id);
            const sayi = playlistTracks.filter(pt => pt.playlist_id === p.id).length;
            return `<li class="open-row" data-open="#/markalar/${p.brand_id}/listeler/${p.id}">
            <span><strong>${safe(b ? b.name : '—')}</strong>
              <small>${safe(p.name)} · ${sayi} parça</small></span>
            <button data-open="#/markalar/${p.brand_id}/listeler/${p.id}">AÇ ›</button></li>`;
          }).join('') : '<li>Henüz marka listesi yok.</li>'}
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
              <button id="sp-shuffle" class="sp-mode${folder.shuffle!==false?' on':''}" title="${folder.shuffle!==false?'Karışık çalıyor':'Sırayla çalıyor'}">
          ${folder.shuffle!==false
            ? `<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 3h5v5"/><path d="M4 20 21 3"/><path d="M21 16v5h-5"/><path d="M15 15l6 6"/><path d="M4 4l5 5"/></svg>`
            : `<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h11"/><path d="M4 12h11"/><path d="M4 18h11"/><path d="M18 9l3 3-3 3"/></svg>`}
          <span>${folder.shuffle!==false?'KARIŞIK':'SIRAYLA'}</span>
        </button>
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
                <button data-move-track="${t.id}">TAŞI</button>
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
    byId('sp-shuffle').onclick = async () => {
      const yeni = !(folder.shuffle !== false);
      const { error } = await client.from('radio_folders').update({ shuffle: yeni }).eq('id', id);
      byId('f-msg').textContent = error ? error.message
        : (yeni ? 'Karışık çalma açık — her tur yeniden karışır.' : 'Sırayla çalma açık.');
      if (!error) await refresh();
    };
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
      if (!await askConfirm('Klasör ve içindeki parça kayıtları silinecek. Emin misiniz?')) return;
      await client.from('radio_folders').delete().eq('id', id);
      go('#/klasorler'); await refresh();
    };

    const coverDel = byId('cover-del');
    if (coverDel) coverDel.onclick = async () => {
      if (!await askConfirm('Kapak görseli silinecek. Emin misiniz?')) return;
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
      if (!await askConfirm('Parça silinecek. Emin misiniz?')) return;
      await client.storage.from('radio-audio').remove([b.dataset.path]);
      await client.from('radio_tracks').delete().eq('id', b.dataset.delTrack);
      await refresh();
    });

    document.querySelectorAll('[data-move-track]').forEach(b => b.onclick = async ev => {
      ev.stopPropagation();
      const track = list.find(t => t.id === b.dataset.moveTrack);
      if (!track) return;
      const target = await askMoveTarget(clean(track.title));
      if (!target) return;
      const already = state.playlistTracks.filter(pt => pt.playlist_id === target.playlistId);
      if (already.some(pt => pt.track_id === track.id)) { await askAlert('Bu şarkı zaten o listede var.'); return; }
      const { error } = await client.from('brand_playlist_tracks').insert({ playlist_id: target.playlistId, track_id: track.id, sort_order: already.length });
      if (error) { await askAlert(error.message); return; }
      await askAlert('Şarkı markanın listesine eklendi. Genel klasördeki şarkı olduğu gibi kaldı.');
      await refresh();
    });
  }

  const brandLiveBadge = bId => state.players.some(p => p.brand_id === bId && p.is_playing && isFresh(p))
    ? `<span class="derin-live-dot" style="display:inline-block;padding:3px 11px;border-radius:999px;font-size:11px;font-weight:700;letter-spacing:.04em;white-space:nowrap;
        background:rgba(24,195,125,.22);color:#6ee7b0;border:1px solid rgba(24,195,125,.55)">▶ CANLI ÇALIYOR</span>`
    : '';

  function brandList() {
    const { brands, players, broadcast } = state;
    byId('radio-app').innerHTML = `${crumb('Markalar')}
      <section class="radio-panel">
        <h2>YENİ MARKA</h2>
               <div class="radio-row">
          <input id="brand-name" placeholder="Yeni marka/kafe adı (örn. Starbucks, Kahve Dünyası)">
          <input id="brand-contact" placeholder="İletişim (isteğe bağlı)">
          <button id="brand-add">+ YENİ MARKA EKLE</button>
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
                ${brandLiveBadge(b.id)}
                <small>${players.filter(p => p.brand_id === b.id).length} şube</small></span>
              <button data-open="#/markalar/${b.id}">AÇ ›</button></li>`;
          }).join('') : '<li>Henüz marka yok.</li>'}
        </ul>
      </section>`;
       byId('brand-add').onclick = async () => {
      const name = byId('brand-name').value.trim();
      const msg = byId('brand-msg');
      if (!name) { msg.textContent = 'Marka adı gerekli.'; return; }
      const { data, error } = await client.from('brands').insert({
        name, slug: slugify(name), contact: byId('brand-contact').value.trim() || null }).select('id').single();
      msg.textContent = error ? error.message : 'Marka eklendi.';
      if (!error) go('#/markalar/' + data.id);
    };
    wireOpen();
  }

  function brandDetail(id) {
    const brand = state.brands.find(b => b.id === id);
    if (!brand) return go('#/markalar');
    const subs = state.players.filter(p => p.brand_id === id);
    const cur = state.broadcast.find(x => x.brand_id === id);
    const anons = state.announcements.filter(a => a.brand_id === id);
    const lists = state.playlists.filter(p => p.brand_id === id);
    const attempts = state.coffeeAttempts.filter(a => a.brand_id === id).slice(0, 15);
    const failedRecent = state.coffeeAttempts.filter(a => a.brand_id === id && !a.success
      && (Date.now() - new Date(a.created_at).getTime()) < 86400000).length;
    const activeValue = cur?.playlist_id ? `playlist:${cur.playlist_id}` : (cur?.folder_id ? `folder:${cur.folder_id}` : '');

    byId('radio-app').innerHTML = `${crumb('Markalar', brand.name)}${brandLiveBadge(id) ? `<div style="margin:10px 0 -4px">${brandLiveBadge(id)}</div>` : ''}
      <section class="radio-panel">
        <h2>MARKA SUNUMU — MÜŞTERİYE GÖNDERİLECEK LİNK</h2>
<div class="radio-row">
<span style="flex:0 0 auto;align-self:center;opacity:.6;font-size:13px">${safe(siteRoot())}coffee/</span>
<input id="brand-slug" value="${safe(brand.slug || '')}" placeholder="link-adi" style="flex:1 1 140px;padding:12px 15px;border-radius:16px;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.06);color:inherit;font:inherit">
<button id="brand-slug-set">LİNK ADINI KAYDET</button>
</div>
<p class="radio-msg" id="brand-slug-msg">Her markanın kendine ait, istediğin an değiştirebileceğin bir link adı olur — link adını değiştirirsen eski link çalışmaz olur.</p>
        <div class="radio-row">
          <input readonly value="${safe(brandPreviewUrl(brand))}" style="flex:2 1 260px;padding:12px 15px;border-radius:16px;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.06);color:inherit;font:inherit">
          <button data-copy="${safe(brandPreviewUrl(brand))}">LİNKİ KOPYALA</button>
        </div>
        <div class="radio-row">
          <input id="brand-code" value="${safe(brand.access_code || '')}" placeholder="Erişim kodu (örn. ${slugify(brand.name).toUpperCase()}2026)">
          <button id="brand-code-set">${brand.access_code ? 'KODU GÜNCELLE' : 'KODU KAYDET'}</button>
          ${brand.access_code ? `<button data-copy="${safe(brand.access_code)}">KODU KOPYALA</button>` : ''}
        </div>
        <p class="radio-msg" id="brand-code-msg">${brand.access_code ? 'Bu link ile kodu markaya iletin — sadece bu kodu bilenler sunumu görebilir. Kodu istediğin zaman değiştirip güncelleyebilirsin.' : 'Bu markanın henüz sunum sayfası için bir erişim kodu yok.'}</p>
      </section>
      <section class="radio-panel">
        <h2>SUNUM SAYFASINA GİRİŞ DENEMELERİ${failedRecent ? ` <span style="color:#ffb3b3;font-size:11px;font-weight:700">· son 24 saatte ${failedRecent} başarısız deneme</span>` : ''}</h2>
        <ul class="radio-list">${attempts.length ? attempts.map(a => `<li>
          <span><strong>${a.success ? '✅ Doğru kod' : '❌ Yanlış kod'}</strong>
            <small>${new Date(a.created_at).toLocaleString('tr-TR')}${a.ip ? ' · IP: ' + safe(a.ip) : ''}</small></span></li>`).join('')
          : '<li>Henüz giriş denemesi olmadı.</li>'}</ul>
      </section>
      <section class="radio-panel">
        <h2>CANLI YAYIN</h2>
        <div class="radio-row">
          <select id="live-source"><option value="">— yayını durdur —</option>
            <optgroup label="Yayın klasörleri">${state.folders.map(f => `<option value="folder:${f.id}"${activeValue === `folder:${f.id}` ? ' selected' : ''}>${safe(f.name)}</option>`).join('')}</optgroup>
            <optgroup label="${safe(brand.name)} listeleri">${lists.map(p => `<option value="playlist:${p.id}"${activeValue === `playlist:${p.id}` ? ' selected' : ''}>${safe(p.name)}</option>`).join('')}</optgroup>
          </div>
          <p class="radio-msg" id="live-msg">${cur?.folder_id || cur?.playlist_id ? 'Şu an yayında.' : 'Yayın kapalı.'}</p>
      </section>
      <section class="radio-panel">
        <h2>ÇALMA LİSTELERİ</h2>
        <div class="radio-row">
          <input id="playlist-name" placeholder="Liste adı (örn. Chemex öğle yayını)">
          <select id="playlist-source"><option value="">Boş liste oluştur</option>${state.folders.map(f => `<option value="${f.id}">${safe(f.name)} klasöründen kopyala</option>`).join('')}</select>
          <button id="playlist-add">OLUŞTUR</button>
        </div>
        <p class="radio-msg" id="playlist-msg">Kaynak klasör seçilirse şarkılar bu markaya özel sırayla kopyalanır.</p>
        <ul class="radio-list">${lists.length ? lists.map(p => `<li class="open-row" data-open="#/markalar/${id}/listeler/${p.id}">
          <span><strong>${safe(p.name)}</strong><small>${state.playlistTracks.filter(t => t.playlist_id === p.id).length} parça${p.description ? ' · ' + safe(p.description) : ''}</small></span>
          <button data-open="#/markalar/${id}/listeler/${p.id}">DÜZENLE ›</button></li>`).join('') : '<li>Henüz marka listesi yok.</li>'}</ul>
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
              <small>${p.last_seen_at ? 'son bağlantı: ' + new Date(p.last_seen_at).toLocaleString('tr-TR') : 'hiç bağlanmadı'}</small>
              <span style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap">${trackBadge(p)}${playingBadge(p)}${lockBadge(p)}</span>
              ${lockInfo(p) ? `<small>${lockInfo(p)}</small>` : ''}</span>
            <span style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
              <input type="time" value="${hhmm(p.open_time)}" data-hours="open" data-player="${p.id}"
                style="padding:8px 10px;border-radius:12px;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.06);color:inherit;font:inherit;font-size:12px">
              <input type="time" value="${hhmm(p.close_time)}" data-hours="close" data-player="${p.id}"
                style="padding:8px 10px;border-radius:12px;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.06);color:inherit;font:inherit;font-size:12px">
              <button data-copy="${playerBase()}${safe(p.player_key)}">LİNKİ KOPYALA</button>
              ${p.bound_device_id ? `<button data-reset-lock="${p.id}">KİLİDİ SIFIRLA</button>` : ''}
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

    if (byId('brand-slug-set')) {
byId('brand-slug-set').onclick = async () => {
const raw = byId('brand-slug').value.trim();
const msg = byId('brand-slug-msg');
if (!raw) { msg.textContent = 'Link adı gerekli.'; return; }
const newSlug = slugify(raw);
if (!newSlug) { msg.textContent = 'Geçerli bir link adı girin.'; return; }
if (newSlug === brand.slug) { msg.textContent = 'Link adı zaten bu.'; return; }
if (brand.slug) {
if (!await askConfirm('Link adını değiştirirsen eski link (' + brandPreviewUrl(brand) + ') artık çalışmaz, yeni linki markaya iletmen gerekir. Devam edilsin mi?')) return;
}
const { error } = await client.from('brands').update({ slug: newSlug }).eq('id', id);
msg.textContent = error ? (error.code === '23505' ? 'Bu link adı başka bir markada kullanılıyor. Farklı bir ad seçin.' : error.message) : ('Link adı güncellendi: ' + siteRoot() + 'coffee/' + newSlug);
if (!error) await refresh();
};
}
if (byId('brand-code-set')) {
      byId('brand-code-set').onclick = async () => {
        const code = byId('brand-code').value.trim();
        const msg = byId('brand-code-msg');
        if (!code) { msg.textContent = 'Kod girin.'; return; }
        if (brand.access_code && code !== brand.access_code) {
          if (!await askConfirm('Kodu değiştirirsen markanın eski kodu/linki artık çalışmaz, yeni kodu müşteriye iletmen gerekir. Devam edilsin mi?')) return;
        }
        const { error } = await client.from('brands').update({ access_code: code }).eq('id', id);
        msg.textContent = error ? error.message : 'Kod kaydedildi.';
        if (!error) await refresh();
      };
    }
    byId('live-source').onchange = async e => {
      const [kind, value] = (e.target.value || ':').split(':');
      const payload = { brand_id:id, folder_id:kind === 'folder' ? value : null, playlist_id:kind === 'playlist' ? value : null, updated_at:new Date().toISOString() };
      const { error } = await client.from('brand_broadcast').upsert(payload, { onConflict:'brand_id' });
      byId('live-msg').textContent = error ? error.message : (value ? 'Canlı yayın güncellendi.' : 'Yayın durduruldu.');
      if (!error) await refresh();
    };
    byId('playlist-add').onclick = async () => {
      const name = byId('playlist-name').value.trim();
      const source = byId('playlist-source').value;
      const msg = byId('playlist-msg');
      if (!name) { msg.textContent = 'Liste adı gerekli.'; return; }
      let folderId = source;
      if (!folderId) {
        const { data: folder, error: folderErr } = await client.from('radio_folders').insert({ name }).select('id').single();
        if (folderErr) { msg.textContent = folderErr.message; return; }
        folderId = folder.id;
      }
      const { data: playlist, error } = await client.from('brand_playlists').insert({ brand_id:id, name, folder_id:folderId }).select('id').single();
      if (error) { msg.textContent = error.message; return; }
      if (source) {
        const tracks = state.tracks.filter(t => t.folder_id === source);
        if (tracks.length) await client.from('brand_playlist_tracks').insert(tracks.map((t, i) => ({ playlist_id:playlist.id, track_id:t.id, sort_order:i })));
      }
      msg.textContent = source ? 'Liste ve şarkı sırası kopyalandı.' : 'Boş liste oluşturuldu.';
      await refresh();
    };
         byId('p-add').onclick = async () => {
      const label = byId('p-label').value.trim();
      if (!label) { byId('p-msg').textContent = 'Şube adı gerekli.'; return; }
      const { error } = await client.from('brand_players').insert({
        brand_id:id, label,
        open_time:byId('p-open').value || null,
        close_time:byId('p-close').value || null });
      byId('p-msg').textContent = error ? error.message : 'Şube eklendi.';
      if (!error) await refresh();
    };
    wireCommon();
  }

  function playlistDetail(brandId, playlistId) {
    const brand = state.brands.find(b => b.id === brandId);
    const playlist = state.playlists.find(p => p.id === playlistId && p.brand_id === brandId);
    if (!brand || !playlist) return go(`#/markalar/${brandId}`);
    const entries = state.playlistTracks.filter(item => item.playlist_id === playlistId)
      .map(item => ({ item, track:state.tracks.find(track => track.id === item.track_id) }))
      .filter(row => row.track);
    const available = state.tracks.filter(track => !entries.some(row => row.track.id === track.id));
    byId('radio-app').innerHTML = `${crumb('Markalar', brand.name, playlist.name)}
      <section class="radio-panel"><h2>${safe(playlist.name)}</h2>
        <div class="radio-row"><select id="playlist-add-track"><option value="">Şarkı ekle</option>${available.map(t => `<option value="${t.id}">${safe(clean(t.title))}</option>`).join('')}</select><button id="playlist-track-add">EKLE</button><button id="playlist-delete">LİSTEYİ SİL</button></div>
        <p class="radio-msg" id="playlist-detail-msg">Bu listedeki değişiklikler yalnızca ${safe(brand.name)} yayınını etkiler.</p>
        <ul class="radio-list">${entries.length ? entries.map((row, index) => `<li><span><strong>${index + 1}. ${safe(clean(row.track.title))}</strong><small>${mmss(row.track.duration_sec)}</small></span><span><button data-playlist-up="${row.item.id}" ${index === 0 ? 'disabled' : ''}>↑</button><button data-playlist-down="${row.item.id}" ${index === entries.length - 1 ? 'disabled' : ''}>↓</button><button data-playlist-remove="${row.item.id}">SİL</button></span></li>`).join('') : '<li>Henüz şarkı yok.</li>'}</ul>
      </section>`;
    const msg = byId('playlist-detail-msg');
    byId('playlist-track-add').onclick = async () => {
      const trackId = byId('playlist-add-track').value;
      if (!trackId) return;
      const { error } = await client.from('brand_playlist_tracks').insert({ playlist_id:playlistId, track_id:trackId, sort_order:entries.length });
      msg.textContent = error ? error.message : 'Şarkı eklendi.';
      if (!error) await refresh();
    };
    const reorder = async (entryId, direction) => {
      const index = entries.findIndex(row => row.item.id === entryId);
      const other = entries[index + direction];
      if (!other) return;
      await Promise.all([
        client.from('brand_playlist_tracks').update({ sort_order:other.item.sort_order }).eq('id', entries[index].item.id),
        client.from('brand_playlist_tracks').update({ sort_order:entries[index].item.sort_order }).eq('id', other.item.id)
      ]);
      await refresh();
    };
    document.querySelectorAll('[data-playlist-up]').forEach(button => button.onclick = () => reorder(button.dataset.playlistUp, -1));
    document.querySelectorAll('[data-playlist-down]').forEach(button => button.onclick = () => reorder(button.dataset.playlistDown, 1));
    document.querySelectorAll('[data-playlist-remove]').forEach(button => button.onclick = async () => {
      await client.from('brand_playlist_tracks').delete().eq('id', button.dataset.playlistRemove);
      await refresh();
    });
    byId('playlist-delete').onclick = async () => {
      if (!await askConfirm('Bu liste silinecek. Emin misiniz?')) return;
      const { error } = await client.from('brand_playlists').delete().eq('id', playlistId);
      if (error) { msg.textContent = error.message; return; }
      go(`#/markalar/${brandId}`); await refresh();
    };
  }

  function playerList() {
    const { players, brands } = state;
    byId('radio-app').innerHTML = `${crumb('Şube Takip Paneli')}
      <section class="radio-panel">
        <h2>TÜM ŞUBELER — BAĞLANTI VE KİLİT DURUMU</h2>
        <p class="radio-msg" id="p-msg">Yeni şube eklemek için marka sayfasını açın.</p>
        <ul class="radio-list">
          ${players.length ? players.map(p => `<li>
            <span><strong>${safe(p.label)}</strong>
              <small>${safe(brands.find(b => b.id === p.brand_id)?.name || '—')}</small>
              <small>${playerBase()}${safe(p.player_key)}</small>
              <small>${p.last_seen_at ? 'son bağlantı: ' + new Date(p.last_seen_at).toLocaleString('tr-TR') : 'hiç bağlanmadı'}</small>
              <span style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap">${trackBadge(p)}${playingBadge(p)}${lockBadge(p)}</span>
              ${lockInfo(p) ? `<small>${lockInfo(p)}</small>` : ''}</span>
            <span style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
              <input type="time" value="${hhmm(p.open_time)}" data-hours="open" data-player="${p.id}"
                style="padding:8px 10px;border-radius:12px;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.06);color:inherit;font:inherit;font-size:12px">
              <input type="time" value="${hhmm(p.close_time)}" data-hours="close" data-player="${p.id}"
                style="padding:8px 10px;border-radius:12px;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.06);color:inherit;font:inherit;font-size:12px">
              <button data-copy="${playerBase()}${safe(p.player_key)}">LİNKİ KOPYALA</button>
              ${p.bound_device_id ? `<button data-reset-lock="${p.id}">KİLİDİ SIFIRLA</button>` : ''}
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
      if (!await askConfirm('Talep silinecek. Emin misiniz?')) return;
      await client.from('coffee_requests').delete().eq('id', b.dataset.tlDel);
      talepList();
    });
    wireOpen();
  }
    async function abonelikList() {
    byId('radio-app').innerHTML = `${crumb('Abonelikler')}
      <section class="radio-panel">
<h2>YENİ MARKA</h2>
<div class="radio-row">
<input id="ab-brand-name" placeholder="Yeni marka/kafe adı (örn. Starbucks, Kahve Dünyası)">
<input id="ab-brand-contact" placeholder="İletişim (isteğe bağlı)">
<button id="ab-brand-add">+ YENİ MARKA EKLE</button>
</div>
<p class="radio-msg" id="ab-brand-msg"></p>
</section>
<section class="radio-panel"><h2>MARKA ABONELİKLERİ</h2>
        <p class="radio-msg" id="ab-msg">Yükleniyor…</p>
        <ul class="radio-list" id="ab-list"></ul></section>`;

    byId('ab-brand-add').onclick = async () => {
const name = byId('ab-brand-name').value.trim();
const msg = byId('ab-brand-msg');
if (!name) { msg.textContent = 'Marka adı gerekli.'; return; }
const { error } = await client.from('brands').insert({
name, slug: slugify(name), contact: byId('ab-brand-contact').value.trim() || null });
msg.textContent = error ? error.message : 'Marka eklendi.';
if (!error) { await refresh(); }
};

const [ab, pl, br] = await Promise.all([
      client.from('subscriptions').select('*'),
      client.from('plans').select('*').order('sort_order'),
      client.from('brands').select('id,name').order('name')
    ]);
    if (ab.error) { byId('ab-msg').textContent = 'Okunamadı: ' + ab.error.message; return; }

    const planlar = pl.data || [];
    const abone = ab.data || [];
    const gun = d => d ? Math.ceil((new Date(d) - new Date()) / 86400000) : null;
    const etiket = { trial:'Deneme', active:'Aktif', past_due:'Ödeme gecikti', canceled:'İptal', expired:'Süresi doldu' };

    byId('ab-msg').textContent = `${abone.length} abonelik · ${(br.data||[]).length} marka`;
    byId('ab-list').innerHTML = (br.data || []).map(b => {
      const s = abone.find(x => x.brand_id === b.id);
      const p = s ? planlar.find(x => x.id === s.plan_id) : null;
      const kalan = s ? gun(s.status === 'trial' ? s.trial_ends_at : s.current_end) : null;
      const tutar = p ? (p.per_branch ? p.monthly_price * (s.branch_count||1) : p.monthly_price) : 0;
      const renk = kalan === null ? '' : (kalan < 0 ? '#ffb3b3' : kalan <= 3 ? '#e8d15a' : '#6ee7b0');

      return `<li>
        <span><strong>${safe(b.name)}</strong>
          <small>${s ? `${safe(p?.name || s.plan_id)} · ${s.branch_count} şube · ${tutar.toLocaleString('tr-TR')} TL/ay` : 'Abonelik yok'}</small>
          ${s ? `<small style="color:${renk}">${etiket[s.status]||s.status}${kalan!==null ? (kalan<0 ? ` · ${-kalan} gün geçti` : ` · ${kalan} gün kaldı`) : ''}</small>` : ''}</span>
        <span style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <select data-ab-plan="${b.id}">
            <option value="">— paket seç —</option>
            ${planlar.map(x => `<option value="${x.id}"${s?.plan_id===x.id?' selected':''}>${safe(x.name)}</option>`).join('')}
          </select>
          <input type="number" min="1" value="${s?.branch_count || 1}" data-ab-sube="${b.id}"
            style="width:70px;padding:8px 10px;border-radius:12px;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.06);color:inherit;font:inherit;font-size:12px" title="Şube sayısı">
          <input type="number" min="1" value="7" data-ab-sure="${b.id}"
style="width:60px;padding:8px 10px;border-radius:12px;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.06);color:inherit;font:inherit;font-size:12px" title="Süre miktarı">
<select data-ab-birim="${b.id}"
style="padding:8px 10px;border-radius:12px;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.06);color:inherit;font:inherit;font-size:12px">
<option value="gun">gün</option>
<option value="ay">ay</option>
<option value="yil">yıl</option>
</select>
<button data-ab-trial="${b.id}">DENEME BAŞLAT</button>
          <button data-ab-ay="${b.id}">AKTİF ET / UZAT</button>
          ${s ? `<button data-ab-iptal="${b.id}">İPTAL</button>` : ''}
<button data-ab-sil="${b.id}" style="border-color:rgba(254,75,69,.4);background:rgba(254,75,69,.1);color:#ffb4b0">MARKAYI SİL</button>
        </span></li>`;
    }).join('') || '<li>Marka yok.</li>';

    const suresi = (id) => {
const miktar = Number(document.querySelector(`[data-ab-sure="${id}"]`)?.value) || 1;
const birim = document.querySelector(`[data-ab-birim="${id}"]`)?.value || 'gun';
return { miktar, birim };
};
const ekle = (tarih, miktar, birim) => {
const d = new Date(tarih);
if (birim === 'yil') d.setFullYear(d.getFullYear() + miktar); else if (birim === 'ay') d.setMonth(d.getMonth() + miktar); else d.setDate(d.getDate() + miktar);
return d;
};

const kaydet = async (brandId, alanlar) => {
      const planId = document.querySelector(`[data-ab-plan="${brandId}"]`).value;
      if (!planId) { byId('ab-msg').textContent = 'Önce paket seçin.'; return; }
      const sube = Number(document.querySelector(`[data-ab-sube="${brandId}"]`).value) || 1;
      const { error } = await client.from('subscriptions').upsert({
        brand_id: brandId, plan_id: planId, branch_count: sube,
        updated_at: new Date().toISOString(), ...alanlar
      }, { onConflict: 'brand_id' });
      byId('ab-msg').textContent = error ? 'Kaydedilemedi: ' + error.message : 'Güncellendi.';
      if (!error) abonelikList();
    };

    document.querySelectorAll('[data-ab-sil]').forEach(b => b.onclick = async () => {
const id = b.dataset.abSil;
const brand = (br.data || []).find(x => x.id === id);
if (!await askConfirm(`"${brand?.name || 'Bu marka'}" tamamen silinecek: şubeleri, yayın linkleri, çalma listeleri, anonsları ve aboneliği birlikte silinir. Bu işlem geri alınamaz. Emin misiniz?`)) return;
b.disabled = true; b.textContent = 'SİLİNİYOR…';
const { error } = await client.from('brands').delete().eq('id', id);
if (error) { await askAlert('Marka silinemedi: ' + error.message); b.disabled = false; b.textContent = 'MARKAYI SİL'; return; }
await refresh();
});

document.querySelectorAll('[data-ab-trial]').forEach(b => b.onclick = () => {
      const { miktar, birim } = suresi(b.dataset.abTrial);
const bitis = ekle(new Date(), miktar, birim).toISOString();
      kaydet(b.dataset.abTrial, { status:'trial', trial_ends_at:bitis, current_start:new Date().toISOString(), current_end:null });
    });

    document.querySelectorAll('[data-ab-ay]').forEach(b => b.onclick = async () => {
      const id = b.dataset.abAy;
      const s = abone.find(x => x.brand_id === id);
      const baz = (s?.current_end && new Date(s.current_end) > new Date()) ? new Date(s.current_end) : new Date();
      const { miktar, birim } = suresi(id);
const bitis = ekle(baz, miktar, birim).toISOString();
      kaydet(id, { status:'active', current_end: bitis });
    });

    document.querySelectorAll('[data-ab-iptal]').forEach(b => b.onclick = async () => {
      if (!await askConfirm('Abonelik iptal edilecek. Şubeler yayından düşer. Emin misiniz?')) return;
      const { error } = await client.from('subscriptions')
        .update({ status:'canceled', canceled_at:new Date().toISOString() })
        .eq('brand_id', b.dataset.abIptal);
      byId('ab-msg').textContent = error ? error.message : 'Abonelik iptal edildi.';
      if (!error) abonelikList();
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
      if (!await askConfirm('Şube silinecek. Emin misiniz?')) return;
      b.disabled = true; b.textContent = 'SİLİNİYOR…';
      const { error } = await client.from('brand_players').delete().eq('id', b.dataset.delPlayer);
      if (error) { await askAlert('Şube silinemedi: ' + error.message); b.disabled = false; b.textContent = 'SİL'; return; }
      await refresh();
    });
    document.querySelectorAll('[data-reset-lock]').forEach(b => b.onclick = async () => {
      if (!await askConfirm('Cihaz kilidi sıfırlanacak; bu şubenin linki bir sonraki açılan cihaza yeniden kilitlenecek. Emin misiniz?')) return;
      await client.from('brand_players').update({
        bound_device_id: null, bound_at: null, first_ip: null, last_ip: null, last_ip_at: null
      }).eq('id', b.dataset.resetLock);
      await refresh();
    });
    document.querySelectorAll('[data-del-anons]').forEach(b => b.onclick = async () => {
      if (!await askConfirm('Anons silinecek. Emin misiniz?')) return;
      await client.storage.from('radio-announcements').remove([b.dataset.path]);
      await client.from('radio_announcements').delete().eq('id', b.dataset.delAnons);
      await refresh();
    });
    wireOpen();
  }

  load();
})();
