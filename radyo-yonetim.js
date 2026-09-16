(() => {
  const byId = id => document.getElementById(id);
  const safe = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  const slugify = value => String(value || '').toLowerCase()
    .replace(/ğ/g,'g').replace(/ü/g,'u').replace(/ş/g,'s').replace(/ı/g,'i').replace(/ö/g,'o').replace(/ç/g,'c')
    .replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');

  let client = null;
  let state = { brands: [], folders: [], tracks: [], players: [], broadcast: [] };

  const coverUrl = path => client.storage.from('radio-covers').getPublicUrl(path).data.publicUrl;

  async function load() {
    await window.DerinAuth.ready;
    const auth = window.DerinAuth;
    const status = byId('radio-status'), app = byId('radio-app');
    client = auth.client;

    if (!auth.configured) { status.textContent = 'Önce Supabase bağlantısını config.js dosyasına ekleyin.'; return; }
    if (!auth.user) {
      status.innerHTML = 'Bu alan yalnızca yöneticilere açıktır. <button class="account-button" id="radio-login">GİRİŞ YAP</button>';
      byId('radio-login').onclick = () => auth.open();
      return;
    }
    if (auth.profile?.role !== 'admin') { status.textContent = 'Bu alan için yönetici yetkiniz yok.'; return; }

    status.textContent = `Yönetici: ${auth.profile.full_name || auth.user.email}`;
    app.hidden = false;
    await refresh();
  }

  async function refresh() {
    const [brands, folders, tracks, players, broadcast] = await Promise.all([
      client.from('brands').select('id,name,slug,is_active').order('name'),
      client.from('radio_folders').select('id,name,description,cover_path').order('name'),
      client.from('radio_tracks').select('id,folder_id,title,storage_path,sort_order').order('sort_order'),
      client.from('brand_players').select('id,brand_id,label,player_key,last_seen_at').order('label'),
      client.from('brand_broadcast').select('brand_id,folder_id,updated_at')
    ]);
    state = {
      brands: brands.data || [], folders: folders.data || [], tracks: tracks.data || [],
      players: players.data || [], broadcast: broadcast.data || []
    };
    render();
  }

  function render() {
    const { brands, folders, tracks, players, broadcast } = state;
    const folderOptions = folders.map(f => `<option value="${f.id}">${safe(f.name)}</option>`).join('');
    const playerBase = location.href.replace(/[^/]*$/, '') + 'radyo.html?key=';

    byId('radio-app').innerHTML = `
      <section class="radio-panel">
        <h2>1 — MARKALAR</h2>
        <div class="radio-row">
          <input id="brand-name" placeholder="Marka adı (örn. Chemex)">
          <input id="brand-contact" placeholder="İletişim (isteğe bağlı)">
          <button id="brand-add">EKLE</button>
        </div>
        <p class="radio-msg" id="brand-msg"></p>
        <ul class="radio-list">
          ${brands.length ? brands.map(b => `<li><span><strong>${safe(b.name)}</strong> <small>${safe(b.slug)}</small></span>
            <button data-del-brand="${b.id}">SİL</button></li>`).join('') : '<li>Henüz marka yok.</li>'}
        </ul>
      </section>

      <section class="radio-panel">
        <h2>2 — YAYIN KLASÖRLERİ</h2>
        <div class="radio-row">
          <input id="folder-name" placeholder="Klasör adı (örn. Sabah Açılış — Ambient)">
          <input id="folder-desc" placeholder="Açıklama (isteğe bağlı)">
          <button id="folder-add">EKLE</button>
        </div>
        <p class="radio-msg" id="folder-msg"></p>
        <ul class="radio-list">
          ${folders.length ? folders.map(f => `<li>
            <span style="display:flex;align-items:center;gap:12px">
              ${f.cover_path
                ? `<img src="${coverUrl(f.cover_path)}" alt="" style="width:46px;height:46px;border-radius:12px;object-fit:cover">`
                : '<span style="width:46px;height:46px;border-radius:12px;background:rgba(255,255,255,.07);display:inline-block"></span>'}
              <span><strong>${safe(f.name)}</strong>
                <small>${tracks.filter(t => t.folder_id === f.id).length} parça</small></span>
            </span>
            <span>
              <button data-cover="${f.id}">KAPAK</button>
              <button data-del-folder="${f.id}">SİL</button>
            </span></li>`).join('') : '<li>Henüz klasör yok.</li>'}
        </ul>
        <input type="file" id="cover-file" accept="image/*" hidden>
      </section>

      <section class="radio-panel">
        <h2>3 — PARÇA YÜKLE</h2>
        <div class="radio-row">
          <select id="track-folder"><option value="">Klasör seçin</option>${folderOptions}</select>
          <input id="track-file" type="file" accept="audio/*" multiple>
          <button id="track-upload">YÜKLE</button>
        </div>
        <p class="radio-msg" id="track-msg"></p>
        ${folders.map(f => {
          const list = tracks.filter(t => t.folder_id === f.id);
          if (!list.length) return '';
          return `<h3 style="font-size:12px;letter-spacing:.12em;opacity:.6;margin:18px 0 4px">${safe(f.name).toUpperCase()}</h3>
          <ul class="radio-list">${list.map((t, i) => `<li>
            <span><strong>${i + 1}. ${safe(t.title)}</strong></span>
            <span>
              <button data-move="up" data-track="${t.id}" data-folder="${f.id}"${i === 0 ? ' disabled' : ''}>▲</button>
              <button data-move="down" data-track="${t.id}" data-folder="${f.id}"${i === list.length - 1 ? ' disabled' : ''}>▼</button>
              <button data-del-track="${t.id}" data-path="${safe(t.storage_path)}">SİL</button>
            </span></li>`).join('')}</ul>`;
        }).join('') || '<p class="radio-msg">Henüz parça yok.</p>'}
      </section>

      <section class="radio-panel">
        <h2>4 — ŞUBE CİHAZLARI</h2>
        <div class="radio-row">
          <select id="player-brand"><option value="">Marka seçin</option>${brands.map(b => `<option value="${b.id}">${safe(b.name)}</option>`).join('')}</select>
          <input id="player-label" placeholder="Şube adı (örn. Chemex Alsancak)">
          <button id="player-add">EKLE</button>
        </div>
        <p class="radio-msg" id="player-msg"></p>
        <ul class="radio-list">
          ${players.length ? players.map(p => `<li>
            <span><strong>${safe(p.label)}</strong>
              <small>${safe(brands.find(b => b.id === p.brand_id)?.name || '—')} · ${playerBase}${safe(p.player_key)}</small>
              <small>${p.last_seen_at ? 'son bağlantı: ' + new Date(p.last_seen_at).toLocaleString('tr-TR') : 'hiç bağlanmadı'}</small></span>
            <span><button data-copy="${playerBase}${safe(p.player_key)}">LİNKİ KOPYALA</button>
            <button data-del-player="${p.id}">SİL</button></span></li>`).join('') : '<li>Henüz şube yok.</li>'}
        </ul>
      </section>

      <section class="radio-panel">
        <h2>5 — CANLI YAYIN</h2>
        <p class="radio-msg" id="live-msg">Bir markaya klasör atadığınızda tüm şubelerde anında değişir.</p>
        <ul class="radio-list">
          ${brands.length ? brands.map(b => {
            const current = broadcast.find(x => x.brand_id === b.id);
            return `<li><span><strong>${safe(b.name)}</strong>
              ${current?.folder_id ? '<span class="radio-live">YAYINDA</span>' : '<small>yayın yok</small>'}
              <small>${players.filter(p => p.brand_id === b.id).length} şube</small></span>
              <span><select data-live-brand="${b.id}"><option value="">— durdur —</option>${
                folders.map(f => `<option value="${f.id}"${current?.folder_id === f.id ? ' selected' : ''}>${safe(f.name)}</option>`).join('')
              }</select></span></li>`;
          }).join('') : '<li>Önce marka ekleyin.</li>'}
        </ul>
      </section>`;

    wire();
  }

  function wire() {
    const app = byId('radio-app');

    byId('brand-add').onclick = async () => {
      const name = byId('brand-name').value.trim();
      const msg = byId('brand-msg');
      if (!name) { msg.textContent = 'Marka adı gerekli.'; return; }
      const { error } = await client.from('brands').insert({
        name, slug: slugify(name), contact: byId('brand-contact').value.trim() || null
      });
      msg.textContent = error ? error.message : 'Marka eklendi.';
      if (!error) await refresh();
    };

    byId('folder-add').onclick = async () => {
      const name = byId('folder-name').value.trim();
      const msg = byId('folder-msg');
      if (!name) { msg.textContent = 'Klasör adı gerekli.'; return; }
      const { error } = await client.from('radio_folders').insert({
        name, description: byId('folder-desc').value.trim() || null
      });
      msg.textContent = error ? error.message : 'Klasör eklendi.';
      if (!error) await refresh();
    };

    const coverInput = byId('cover-file');
    app.querySelectorAll('[data-cover]').forEach(button => {
      button.onclick = () => { coverInput.dataset.folder = button.dataset.cover; coverInput.click(); };
    });
    coverInput.onchange = async () => {
      const file = coverInput.files?.[0];
      const folderId = coverInput.dataset.folder;
      const msg = byId('folder-msg');
      if (!file || !folderId) return;
      msg.textContent = 'Kapak yükleniyor…';
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
      const path = `${folderId}/${Date.now()}.${ext}`;
      const up = await client.storage.from('radio-covers').upload(path, file, { contentType: file.type || 'image/jpeg' });
      if (up.error) { msg.textContent = 'Yükleme hatası: ' + up.error.message; return; }
      const { error } = await client.from('radio_folders').update({ cover_path: path }).eq('id', folderId);
      msg.textContent = error ? error.message : 'Kapak güncellendi.';
      coverInput.value = '';
      if (!error) await refresh();
    };

    byId('track-upload').onclick = async () => {
      const folderId = byId('track-folder').value;
      const files = Array.from(byId('track-file').files || []);
      const msg = byId('track-msg');
      if (!folderId) { msg.textContent = 'Önce klasör seçin.'; return; }
      if (!files.length) { msg.textContent = 'Dosya seçin.'; return; }
      const existing = state.tracks.filter(t => t.folder_id === folderId).length;
      let done = 0;
      for (const file of files) {
        msg.textContent = `Yükleniyor… (${done + 1}/${files.length}) ${file.name}`;
        const path = `${folderId}/${Date.now()}-${slugify(file.name.replace(/\.[^.]+$/, ''))}.${(file.name.split('.').pop() || 'mp3')}`;
        const up = await client.storage.from('radio-audio').upload(path, file, { contentType: file.type || 'audio/mpeg' });
        if (up.error) { msg.textContent = 'Yükleme hatası: ' + up.error.message; return; }
        const { error } = await client.from('radio_tracks').insert({
          folder_id: folderId,
          title: file.name.replace(/\.[^.]+$/, ''),
          storage_path: path,
          sort_order: existing + done
        });
        if (error) { msg.textContent = 'Kayıt hatası: ' + error.message; return; }
        done++;
      }
      msg.textContent = `${done} parça yüklendi.`;
      byId('track-file').value = '';
      await refresh();
    };

    app.querySelectorAll('[data-move]').forEach(button => {
      button.onclick = async () => {
        const list = state.tracks.filter(t => t.folder_id === button.dataset.folder);
        const at = list.findIndex(t => t.id === button.dataset.track);
        const to = button.dataset.move === 'up' ? at - 1 : at + 1;
        if (to < 0 || to >= list.length) return;
        const a = list[at], b = list[to];
        await Promise.all([
          client.from('radio_tracks').update({ sort_order: to }).eq('id', a.id),
          client.from('radio_tracks').update({ sort_order: at }).eq('id', b.id)
        ]);
        await refresh();
      };
    });

    byId('player-add').onclick = async () => {
      const brandId = byId('player-brand').value;
      const label = byId('player-label').value.trim();
      const msg = byId('player-msg');
      if (!brandId || !label) { msg.textContent = 'Marka ve şube adı gerekli.'; return; }
      const { error } = await client.from('brand_players').insert({ brand_id: brandId, label });
      msg.textContent = error ? error.message : 'Şube eklendi.';
      if (!error) await refresh();
    };

    app.querySelectorAll('[data-live-brand]').forEach(select => {
      select.onchange = async () => {
        const brandId = select.dataset.liveBrand;
        const folderId = select.value || null;
        const { error } = await client.from('brand_broadcast').upsert({
          brand_id: brandId, folder_id: folderId, updated_at: new Date().toISOString()
        });
        byId('live-msg').textContent = error ? error.message
          : (folderId ? 'Yayın güncellendi — şubelere gönderildi.' : 'Yayın durduruldu.');
        await refresh();
      };
    });

    app.querySelectorAll('[data-copy]').forEach(button => {
      button.onclick = async () => {
        try { await navigator.clipboard.writeText(button.dataset.copy); button.textContent = 'KOPYALANDI'; }
        catch { button.textContent = 'KOPYALANAMADI'; }
        setTimeout(() => { button.textContent = 'LİNKİ KOPYALA'; }, 1600);
      };
    });

    app.querySelectorAll('[data-del-brand]').forEach(b => b.onclick = async () => {
      if (!confirm('Marka ve bağlı şubeleri silinecek. Emin misiniz?')) return;
      await client.from('brands').delete().eq('id', b.dataset.delBrand); await refresh();
    });
    app.querySelectorAll('[data-del-folder]').forEach(b => b.onclick = async () => {
      if (!confirm('Klasör ve içindeki parça kayıtları silinecek. Emin misiniz?')) return;
      await client.from('radio_folders').delete().eq('id', b.dataset.delFolder); await refresh();
    });
    app.querySelectorAll('[data-del-track]').forEach(b => b.onclick = async () => {
      if (!confirm('Parça silinecek. Emin misiniz?')) return;
      await client.storage.from('radio-audio').remove([b.dataset.path]);
      await client.from('radio_tracks').delete().eq('id', b.dataset.delTrack); await refresh();
    });
    app.querySelectorAll('[data-del-player]').forEach(b => b.onclick = async () => {
      if (!confirm('Şube silinecek. Emin misiniz?')) return;
      await client.from('brand_players').delete().eq('id', b.dataset.delPlayer); await refresh();
    });
  }

  load();
})();
