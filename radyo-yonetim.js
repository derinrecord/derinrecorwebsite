(() => {
  const byId = id => document.getElementById(id);
  const safe = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  const slugify = value => String(value || '').toLowerCase()
    .replace(/ğ/g,'g').replace(/ü/g,'u').replace(/ş/g,'s').replace(/ı/g,'i').replace(/ö/g,'o').replace(/ç/g,'c')
    .replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');

  let client = null;
  let state = { brands: [], folders: [], tracks: [], players: [], broadcast: [] };

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
      client.from('radio_folders').select('id,name,description').order('name'),
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
          <input id="folder-name" placeholder="Klasör adı (örn. Sabah / Akustik)">
          <input id="folder-desc" placeholder="Açıklama (isteğe bağlı)">
          <button id="folder-add">EKLE</button>
        </div>
        <p class="radio-msg" id="folder-msg"></p>
        <ul class="radio-list">
          ${folders.length ? folders.map(f => `<li><span><strong>${safe(f.name)}</strong>
            <small>${tracks.filter(t => t.folder_id === f.id).length} parça</small></span>
            <button data-del-folder="${f.id}">SİL</button></li>`).join('') : '<li>Henüz klasör yok.</li>'}
        </ul>
      </section>

      <section class="radio-panel">
        <h2>3 — PARÇA YÜKLE</h2>
        <div class="radio-row">
          <select id="track-folder"><option value="">Klasör seçin</option>${folderOptions}</select>
          <input id="track-file" type="file" accept="audio/*" multiple>
          <button id="track-upload">YÜKLE</button>
        </div>
        <p class="radio-msg" id="track-msg"></p>
        <ul class="radio-list">
          ${tracks.length ? tracks.map(t => `<li><span><strong>${safe(t.title)}</strong>
            <small>${safe(folders.find(f => f.id === t.folder_id)?.name || '—')}</small></span>
            <button data-del-track="${t.id}" data-path="${safe(t.storage_path)}">SİL</button></li>`).join('') : '<li>Henüz parça yok.</li>'}
        </ul>
      </section>

      <section class="radio-panel">
        <h2>4 — ŞUBE CİHAZLARI</h2>
