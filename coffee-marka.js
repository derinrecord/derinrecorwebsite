(() => {
const byId = id => document.getElementById(id);
const safe = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clean = n => { try { return decodeURIComponent(n); } catch { return n; } };
const fmt = s => isFinite(s) ? Math.floor(s/60) + ':' + String(Math.floor(s%60)).padStart(2,'0') : '0:00';
const client = window.supabase.createClient(
window.DERIN_CONFIG.supabaseUrl, window.DERIN_CONFIG.supabasePublishableKey);

const slug = decodeURIComponent(location.pathname.split('/').filter(Boolean).pop() || '');
const audioUrl = p => client.storage.from('radio-audio').getPublicUrl(p).data.publicUrl;
const coverUrl = p => p ? client.storage.from('radio-covers').getPublicUrl(p).data.publicUrl : null;

const audio = byId('br-audio');
let queue = [];
let aktif = -1;

function showTrackDetail(track, subtitle, cover){
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.78);z-index:99998;display:flex;align-items:center;justify-content:center;padding:20px;font-family:inherit';
  overlay.innerHTML = `
    <div style="max-width:360px;width:100%;padding:32px 28px;border-radius:24px;background:#1a1a1e;border:1px solid rgba(255,255,255,.15);box-shadow:0 20px 60px rgba(0,0,0,.5);color:#f4f1e9;text-align:center">
      ${cover ? `<img src="${cover}" alt="" style="width:220px;height:220px;border-radius:18px;object-fit:cover;margin:0 auto 20px;display:block;box-shadow:0 12px 30px rgba(0,0,0,.5)">`
        : `<div style="width:220px;height:220px;border-radius:18px;background:rgba(255,255,255,.08);margin:0 auto 20px;display:flex;align-items:center;justify-content:center;font-size:48px;opacity:.4">♪</div>`}
      <h3 style="margin:0 0 6px;font-size:19px">${safe(clean(track.title))}</h3>
      <p style="margin:0;opacity:.6;font-size:13px">${safe(subtitle || '')}</p>
      <button id="br-detail-close" style="margin-top:24px;padding:10px 24px;border-radius:14px;border:1px solid rgba(255,255,255,.22);background:rgba(255,255,255,.08);color:inherit;font:inherit;font-size:12px;cursor:pointer">KAPAT</button>
    </div>`;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.querySelector('#br-detail-close').onclick = close;
  overlay.onclick = e => { if (e.target === overlay) close(); };
}

function playAt(q, i){
  if (i < 0 || i >= q.length) return;
  queue = q;
  aktif = i;
  const t = q[i];
  audio.src = audioUrl(t.storage_path);
  byId('sp-player').classList.add('on');
  document.body.classList.add('sp-open');
  byId('sp-title').textContent = clean(t.title);
  byId('sp-sub').textContent = t._playlistName || '';
  const img = byId('sp-now-img');
  const c = coverUrl(t.cover_path) || coverUrl(t._playlistCover);
  if (c) { img.src = c; img.style.display = ''; } else { img.style.display = 'none'; }
  document.querySelectorAll('.sp-row').forEach(r => r.classList.toggle('playing', r.dataset.track === t.id && r.dataset.plist === t._playlistId));
  audio.play().then(() => { byId('sp-toggle').textContent = '⏸'; }).catch(() => { byId('sp-toggle').textContent = '▶'; });
}

function wirePlayer(playlists){
  byId('sp-toggle').onclick = () => {
    if (!audio.src) return;
    if (audio.paused) { audio.play(); byId('sp-toggle').textContent = '⏸'; }
    else { audio.pause(); byId('sp-toggle').textContent = '▶'; }
  };
  byId('sp-next').onclick = () => { if (queue.length) playAt(queue, (aktif + 1) % queue.length); };
  byId('sp-prev').onclick = () => { if (queue.length) playAt(queue, (aktif - 1 + queue.length) % queue.length); };
  byId('sp-vol').oninput = e => { audio.volume = e.target.value / 100; };
  byId('sp-seek').oninput = e => { if (audio.duration) audio.currentTime = (e.target.value/1000) * audio.duration; };
  audio.ontimeupdate = () => {
    if (!audio.duration) return;
    byId('sp-cur').textContent = fmt(audio.currentTime);
    byId('sp-dur').textContent = fmt(audio.duration);
    byId('sp-seek').value = Math.round((audio.currentTime / audio.duration) * 1000);
  };
  audio.onended = () => { if (queue.length) playAt(queue, (aktif + 1) % queue.length); };
  byId('sp-now').onclick = () => {
    if (aktif < 0) return;
    const t = queue[aktif];
    showTrackDetail(t, t._playlistName, coverUrl(t.cover_path) || coverUrl(t._playlistCover));
  };
  document.querySelectorAll('.sp-row').forEach(row => {
    row.addEventListener('click', () => {
      const p = playlists.find(x => x.id === row.dataset.plist);
      if (!p) return;
      const idx = Number(row.dataset.idx);
      if (aktif === idx && queue === p._tracks) {
        const t = p._tracks[idx];
        showTrackDetail(t, p.name, coverUrl(t.cover_path) || coverUrl(p.cover_path));
      } else {
        playAt(p._tracks, idx);
      }
    });
  });
}

function ciz(brand, playlists) {
  byId('br-lock').hidden = true;
  const app = byId('br-app');
  app.hidden = false;

  app.innerHTML = `
<section class="br-hero">
<p class="br-eyebrow">DERİN RECORD × ${safe(brand.name).toUpperCase()}</p>
<h1>${safe(brand.name)}<br><span style="color:${safe(brand.accent_color || '#e8d15a')}">İÇİN KURGULANDI.</span></h1>
${brand.tagline ? `<p class="br-tag">${safe(brand.tagline)}</p>` : ''}
${(brand.roast_profile || (brand.tasting_notes && brand.tasting_notes.length)) ? `<div class="br-notes">
${brand.roast_profile ? `<span class="br-note">${safe(brand.roast_profile)}</span>` : ''}
${(brand.tasting_notes || []).map(n => `<span class="br-note">${safe(n)}</span>`).join('')}
</div>` : ''}
</section>

${playlists.length ? playlists.map(p => `
<section class="br-sec">
<h2>${safe(p.name)}</h2>
${p._tracks.length ? `
<div class="sp-th"><span>#</span><span>BAŞLIK</span><span>SÜRE</span><span></span></div>
<ul class="sp-rows">
${p._tracks.map((t,i) => `
<li class="sp-row" data-track="${t.id}" data-plist="${p.id}" data-idx="${i}">
<span class="no">${i+1}</span>
<span class="ttl" style="display:flex;align-items:center;gap:8px">${t.cover_path ? `<img src="${coverUrl(t.cover_path)}" style="width:22px;height:22px;border-radius:5px;object-fit:cover;flex:0 0 auto">` : ''}<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${safe(clean(t.title))}</span></span>
<span class="dur">${fmt(t.duration_sec)}</span>
<span class="act"></span>
</li>`).join('')}
</ul>` : '<p style="opacity:.55;font-size:13px">Bu listede henüz şarkı yok.</p>'}
</section>`).join('') : '<section class="br-sec"><p style="opacity:.6;font-size:13.5px">Akış kurgusu hazırlanıyor.</p></section>'}

<div class="sp-player" id="sp-player">
<div class="sp-now" id="sp-now" style="cursor:pointer">
<img id="sp-now-img" src="" alt="" style="display:none">
<div class="t"><b id="sp-title">—</b><small id="sp-sub"></small></div>
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

  wirePlayer(playlists);
}

async function ac(kod) {
  const err = byId('br-err');
  err.textContent = 'Kontrol ediliyor…';
  const { data, error } = await client.rpc('coffee_brand_auth', { p_slug: slug, p_code: kod });
  if (error) { err.textContent = 'Hata: ' + error.message; return; }
  if (!data || !data.length) { err.textContent = 'Kod doğru değil ya da sunum hazır değil.'; return; }
  const brand = data[0];

  const { data: playlistsRaw } = await client.from('brand_playlists')
    .select('id,name,cover_path,created_at').eq('brand_id', brand.brand_id).order('created_at');
  const plist = playlistsRaw || [];
  const playlistIds = plist.map(p => p.id);
  const { data: pt } = playlistIds.length
    ? await client.from('brand_playlist_tracks').select('id,playlist_id,track_id,sort_order').in('playlist_id', playlistIds).order('sort_order')
    : { data: [] };
  const trackIds = [...new Set((pt||[]).map(x => x.track_id))];
  const { data: tracks } = trackIds.length
    ? await client.from('radio_tracks').select('id,title,storage_path,cover_path,duration_sec').in('id', trackIds)
    : { data: [] };
  const trackById = Object.fromEntries((tracks||[]).map(t => [t.id, t]));

  plist.forEach(p => {
    p._tracks = (pt||[]).filter(x => x.playlist_id === p.id)
      .map(x => trackById[x.track_id]).filter(Boolean)
      .map(t => ({ ...t, _playlistId: p.id, _playlistName: p.name, _playlistCover: p.cover_path }));
  });

  sessionStorage.setItem('br-' + slug, kod);
  ciz(brand, plist);
}

byId('br-enter').onclick = () => {
  const kod = byId('br-code').value.trim();
  if (kod) ac(kod);
};
byId('br-code').addEventListener('keydown', e => { if (e.key === 'Enter') byId('br-enter').click(); });

const kayitli = sessionStorage.getItem('br-' + slug);
if (kayitli) ac(kayitli);
})();
