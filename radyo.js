(() => {
  const byId = id => document.getElementById(id);
  const audio = byId('audio');
  const key = new URLSearchParams(location.search).get('key');

  let client = null, brandId = null, queue = [], index = 0, started = false, lastStamp = null, karistir = true;
  let bootTime = Date.now(), announcing = false;
  let openTime = null, closeTime = null, wasOpen = null;

  const setState = text => { byId('state').textContent = text; };
  const safe = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

  const audioUrl = path => client.storage.from('radio-audio').getPublicUrl(path).data.publicUrl;
  const coverUrl = path => client.storage.from('radio-covers').getPublicUrl(path).data.publicUrl;
  const anonsUrl = path => client.storage.from('radio-announcements').getPublicUrl(path).data.publicUrl;

  const toMinutes = t => {
    if (!t) return null;
    const [h, m] = String(t).split(':');
    return Number(h) * 60 + Number(m);
  };

  function nowMinutes() {
    const parts = new Intl.DateTimeFormat('tr-TR', {
      timeZone: 'Europe/Istanbul', hour: '2-digit', minute: '2-digit', hour12: false
    }).formatToParts(new Date());
    const h = Number(parts.find(p => p.type === 'hour').value);
    const m = Number(parts.find(p => p.type === 'minute').value);
    return h * 60 + m;
  }

  function isOpen() {
    if (openTime === null || closeTime === null) return true;
    const now = nowMinutes();
    if (openTime === closeTime) return true;
    if (openTime < closeTime) return now >= openTime && now < closeTime;
    return now >= openTime || now < closeTime;   // gece yarısını aşan mesai
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
      byId('cover').style.display = 'none';
      audio.pause();
      setState('Bu link tanınmadı. Lütfen Derin Record ile iletişime geçin.');
      return;
    }

    const head = data[0];
    brandId = head.brand_id;
    byId('brand').textContent = head.brand_name;
    byId('branch').textContent = head.player_label || '';

    openTime = toMinutes(head.open_time);
    closeTime = toMinutes(head.close_time);
    byId('hours').textContent = (head.open_time && head.close_time)
      ? `Yayın saatleri ${String(head.open_time).slice(0,5)} – ${String(head.close_time).slice(0,5)}`
      : 'Yayın saati sınırı yok';

    const cover = byId('cover');
    if (head.cover_path) { cover.src = coverUrl(head.cover_path); cover.style.display = 'block'; }
    else { cover.style.display = 'none'; }

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

         karistir = head.shuffle;
      queue = karistir ? shuffled(tracks) : tracks;
      index = 0;
      if (started && !announcing && isOpen()) play();
    }
    checkHours();
  }

  function checkHours() {
    if (!started) return;
    const open = isOpen();
    if (open === wasOpen) return;
    wasOpen = open;
    if (open) {
      setState('Mesai başladı — yayın açıldı.');
      if (!announcing) play();
    } else {
      audio.pause();
      byId('now').textContent = 'Yayın dışı';
      setState('Mesai saati dışında. Açılışta otomatik başlar.');
    }
  }

  function play() {
    if (!queue.length || announcing || !isOpen()) return;
    const track = queue[index % queue.length];
    audio.src = audioUrl(track.storage_path);
    audio.volume = 1;
    audio.play().then(() => {
      byId('now').innerHTML = '<span class="dot"></span>' + safe(track.title);
      setState('');
    }).catch(() => {
      byId('start').hidden = false;
      setState('Tarayıcı otomatik çalmayı engelledi. Başlatmak için butona dokunun.');
    });
  }

  function fade(from, to, ms) {
    return new Promise(done => {
      const steps = 12, step = (to - from) / steps;
      let i = 0;
      const timer = setInterval(() => {
        i++;
        audio.volume = Math.min(1, Math.max(0, from + step * i));
        if (i >= steps) { clearInterval(timer); done(); }
      }, ms / steps);
    });
  }

  async function playAnnouncement(path, label) {
    if (announcing || !started) return;
    announcing = true;
    const prevNow = byId('now').innerHTML;
    const playing = !audio.paused;

    if (playing) await fade(audio.volume, 0.12, 600);
    byId('now').innerHTML = '<span class="dot"></span>ANONS' + (label ? ' — ' + safe(label) : '');

    const voice = new Audio(anonsUrl(path));
    await new Promise(done => {
      voice.onended = done;
      voice.onerror = done;
      voice.play().catch(done);
      setTimeout(done, 180000);
    });

    if (playing) await fade(audio.volume, 1, 800);
    byId('now').innerHTML = prevNow;
    announcing = false;
  }

   audio.addEventListener('ended', () => {
    index++;
    if (index >= queue.length) {
      index = 0;
      if (karistir && queue.length > 2) {
        const sonParca = queue[queue.length - 1];
        let yeni = shuffled(queue);
        if (yeni[0].track_id === sonParca.track_id) {
          [yeni[0], yeni[yeni.length - 1]] = [yeni[yeni.length - 1], yeni[0]];
        }
        queue = yeni;
      }
    }
    play();
  });
  audio.addEventListener('error', () => { index++; setTimeout(play, 1200); });

  byId('start').onclick = () => {
    started = true;
    byId('start').hidden = true;
    wasOpen = null;
    checkHours();
    if (isOpen()) play();
  };

  function subscribe() {
    client.channel('radio-' + key)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'brand_broadcast', filter: 'brand_id=eq.' + brandId },
        () => fetchBroadcast())
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'radio_announcements', filter: 'brand_id=eq.' + brandId },
        payload => {
          const row = payload.new;
          if (new Date(row.created_at).getTime() < bootTime - 60000) return;
          playAnnouncement(row.storage_path, row.label);
        })
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
    setInterval(checkHours, 30000);
  }

  boot();
})();
