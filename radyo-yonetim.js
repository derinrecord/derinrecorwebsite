(() => {
  const byId = id => document.getElementById(id);
  const audio = byId('audio');
  const key = new URLSearchParams(location.search).get('key');

  let client = null, brandId = null, queue = [], index = 0, started = false, lastStamp = null;

  const setState = text => { byId('state').textContent = text; };

  function publicUrl(path) {
    return client.storage.from('radio-audio').getPublicUrl(path).data.publicUrl;
  }

  function shuffled(list) {
    const copy = list.slice();
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  async function fetchBroadcast({ restart = false } = {}) {
    const { data, error } = await client.rpc('radio_now_playing', { p_player_key: key });
    if (error) { setState('Bağlantı hatası: ' + error.message); return; }
    if (!data || !data.length) {
      byId('brand').textContent = 'Geçersiz yayın anahtarı';
      byId('now').textContent = '';
      byId('folder').textContent = '';
      audio.pause();
      setState('Bu link tanınmadı. Lütfen Derin Record ile iletişime geçin.');
      return;
    }

    const head = data[0];
    brandId = head.brand_id;
    byId('brand').textContent = head.brand_name;

    const tracks = data.filter(row => row.track_id);
    const changed = restart || head.updated_at !== lastStamp;
    lastStamp = head.updated_at;

    byId('folder').textContent = head.folder_name ? head.folder_name + ' · ' + tracks.length + ' parça' : '';

    if (!tracks.length) {
      queue = [];
      audio.pause();
      byId('now').textContent = 'Yayın bekleniyor';
      setState('Bu klasörde henüz parça yok.');
      return;
    }

    if (changed) {
      queue = head.shuffle ? shuffled(tracks) : tracks;
      index = 0;
      if (started) play();
      setState('Yayın güncellendi.');
    }
  }

  function play() {
    if (!queue.length) return;
    const track = queue[index % queue.length];
    audio.src = publicUrl(track.storage_path);
    audio.play().then(() => {
      byId('now').innerHTML = '<span class="dot"></span>' + track.title.replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
      setState('');
    }).catch(() => {
      byId('start').hidden = false;
      setState('Tarayıcı otomatik çalmayı engelledi. Başlatmak için butona dokunun.');
    });
  }

  audio.addEventListener('ended', () => { index++; play(); });
  audio.addEventListener('error', () => { index++; setTimeout(play, 1200); });

  byId('start').onclick = () => {
    started = true;
    byId('start').hidden = true;
    play();
  };

  function subscribe() {
    client.channel('radio-' + key)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'brand_broadcast', filter: 'brand_id=eq.' + brandId },
        () => fetchBroadcast())
      .subscribe();
  }

  async function boot() {
    if (!window.DERIN_CONFIG?.supabaseUrl) { setState('Yapılandırma eksik.'); return; }
    if (!key) {
      byId('brand').textContent = 'Yayın anahtarı yok';
      setState('Bu sayfa şubeye özel link ile açılmalıdır.');
      return;
    }
    client = window.supabase.createClient(window.DERIN_CONFIG.supabaseUrl, window.DERIN_CONFIG.supabasePublishableKey);

    await fetchBroadcast({ restart: true });
    if (!brandId) return;

    byId('start').hidden = false;
    subscribe();

    const ping = () => client.rpc('radio_ping', { p_player_key: key });
    ping();
    setInterval(ping, 60000);
    setInterval(() => fetchBroadcast(), 120000);
  }

  boot();
})();
