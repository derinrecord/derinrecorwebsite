(() => {
  const byId = id => document.getElementById(id);
  const audio = byId('audio');
  const key = new URLSearchParams(location.search).get('key');

  let client = null, brandId = null, queue = [], index = 0, started = false, lastStamp = null, karistir = true;
  let bootTime = Date.now(), announcing = false;
  let openTime = null, closeTime = null, wasOpen = null;
  let watchdogTimer = null, watchdogProgressAt = -1, watchdogStuckCount = 0;

  const setState = text => { byId('state').textContent = text; };
  const safe = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  const withTimeout = (promise, ms) => Promise.race([
    Promise.resolve(promise),
    new Promise((_, reject) => setTimeout(() => reject(new Error('Bağlantı zaman aşımına uğradı.')), ms))
  ]);
  let fetchAttempts = 0;

  const deviceId = (() => {
    try {
      let id = localStorage.getItem('derin_record_device_id');
      if (!id) { id = crypto.randomUUID(); localStorage.setItem('derin_record_device_id', id); }
      return id;
    } catch { return null; }
  })();

  const audioUrl = path => client.storage.from('radio-audio').getPublicUrl(path).data.publicUrl;
  const coverUrl = path => client.storage.from('radio-covers').getPublicUrl(path).data.publicUrl;
  const anonsUrl = path => client.storage.from('radio-announcements').getPublicUrl(path).data.publicUrl;

  function renderPlaylist(tracks) {
    const list = byId('playlist');
    if (!tracks.length) {
      list.innerHTML = '<li class="playlist-empty">Bu çalma listesine henüz şarkı eklenmemiş.</li>';
      return;
    }
    list.innerHTML = tracks.map((track, order) => `
      <li data-track-id="${safe(track.track_id)}">
        <span class="track-no">${order + 1}</span>
        <span class="track-title">${safe(track.title)}</span>
      </li>`).join('');
  }

  function markPlaying(trackId) {
    byId('playlist').querySelectorAll('li').forEach(item => {
      item.classList.toggle('is-playing', item.dataset.trackId === String(trackId));
    });
  }

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
    let data, error;
    try {
      ({ data, error } = await withTimeout(client.rpc('radio_now_playing', { p_player_key: key }), 10000));
    } catch (networkErr) {
      error = { message: networkErr.message };
    }
    if (error) {
      fetchAttempts++;
      byId('brand').textContent = 'Bağlantı sorunu';
      setState('Bağlantı hatası: ' + error.message + (fetchAttempts < 6 ? ' — tekrar deneniyor…' : ' — sayfayı yenile.'));
      if (fetchAttempts < 6) setTimeout(() => fetchBroadcast({ restart }), Math.min(2000 * fetchAttempts, 10000));
      return;
    }
    fetchAttempts = 0;
    if (!data || !data.length) {
      byId('brand').textContent = 'Geçersiz yayın anahtarı';
      byId('now').textContent = '';
      byId('folder').textContent = '';
      byId('cover').style.display = 'none';
      renderPlaylist([]);
      audio.pause();
           const ab = await client.rpc('abonelik_durumu', { p_player_key: key });
      const d = ab.data && ab.data[0];
      if (d && !d.gecerli) {
        byId('brand').textContent = 'Yayın duraklatıldı';
        setState(d.durum === 'yok'
          ? 'Bu şube için abonelik tanımlı değil. Derin Record ile iletişime geçin.'
          : 'Abonelik süresi doldu. Yenilendiğinde yayın kendiliğinden devam eder.');
          } else {
        setState('Bu link tanınmadı. Lütfen Derin Record ile iletişime geçin.');
      }
      return;
    }

    const view = window.DerinRadioPlaylistQueue.fromRpcRows(data);
    const head = view.head;
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

    const tracks = view.tracks;
    const changed = restart || head.updated_at !== lastStamp;
    lastStamp = head.updated_at;

    byId('folder').textContent = view.playlistName ? view.playlistName + ' · ' + tracks.length + ' parça' : '';
    renderPlaylist(tracks);

    if (!tracks.length) {
      queue = [];
      audio.pause();
      byId('now').textContent = 'Yayın bekleniyor';
      setState('Bu klasörde henüz parça yok.');
      return;
    }

    if (changed) {
      karistir = head.shuffle;
      queue = karistir ? shuffled(tracks) : tracks;
      index = 0;
      if (started && !announcing && isOpen()) play();
    }
    if (started && queue.length) markPlaying(queue[index % queue.length].track_id);
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

  function startWatchdog() {
    clearInterval(watchdogTimer);
    watchdogProgressAt = -1;
    watchdogStuckCount = 0;
    watchdogTimer = setInterval(() => {
      if (audio.paused || announcing || !queue.length) return;
      if (audio.currentTime > watchdogProgressAt) {
        watchdogProgressAt = audio.currentTime;
        watchdogStuckCount = 0;
        return;
      }
      watchdogStuckCount++;
      if (watchdogStuckCount >= 2) {
        watchdogStuckCount = 0;
        setState('Yayın takıldı, yeniden bağlanılıyor…');
        const track = queue[index % queue.length];
        audio.src = audioUrl(track.storage_path);
        audio.load();
        audio.play().catch(() => {});
      }
    }, 6000);
  }

  function play() {
    if (!queue.length || announcing || !isOpen()) return;
    const track = queue[index % queue.length];
    markPlaying(track.track_id);
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

  audio.addEventListener('play', () => reportPlaying(true));
  audio.addEventListener('pause', () => reportPlaying(false));

  function reportPlaying(playing) {
    if (!client || !key) return;
    Promise.resolve(client.rpc('radio_ping', { p_player_key: key, p_device_id: deviceId, p_playing: playing })).catch(() => {});
  }

  byId('start').onclick = () => {
    started = true;
    byId('start').hidden = true;
    wasOpen = null;
    checkHours();
    startWatchdog();
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

  function lockedOut() {
    queue = [];
    started = false;
    audio.pause();
    byId('start').hidden = true;
    byId('brand').textContent = 'Bu cihaz yetkili değil';
    byId('now').textContent = '';
    byId('folder').textContent = '';
    byId('cover').style.display = 'none';
    renderPlaylist([]);
    setState('Bu yayın linki başka bir cihaza kayıtlı. Derin Record ile iletişime geçin.');
  }

  async function ping() {
    let data, error;
    try {
      ({ data, error } = await withTimeout(client.rpc('radio_ping', { p_player_key: key, p_device_id: deviceId, p_playing: !audio.paused }), 8000));
    } catch {
      return false;
    }
    if (error) return false;
    const row = data && data[0];
    if (row && row.ok === false && row.reason === 'locked_to_other_device') {
      lockedOut();
      return true;
    }
    return false;
  }

  async function boot() {
    if (!window.DERIN_CONFIG?.supabaseUrl) { setState('Yapılandırma eksik.'); return; }
    if (!key) {
      byId('brand').textContent = 'Yayın anahtarı yok';
      setState('Bu sayfa şubeye özel link ile açılmalıdır.');
      return;
    }
    if (!window.supabase?.createClient) {
      byId('brand').textContent = 'Bağlantı kurulamadı';
      setState('Yayın sistemi yüklenemedi. İnternet bağlantınızı kontrol edip sayfayı yenileyin.');
      return;
    }
    if (!window.DerinRadioPlaylistQueue?.fromRpcRows) {
      byId('brand').textContent = 'Oynatıcı yüklenemedi';
      setState('Sayfayı yenileyin. Sorun sürerse Derin Record ile iletişime geçin.');
      return;
    }
    client = window.supabase.createClient(window.DERIN_CONFIG.supabaseUrl, window.DERIN_CONFIG.supabasePublishableKey);

    if (await ping()) return;

    await fetchBroadcast({ restart: true });
    if (!brandId) return;

    byId('start').hidden = false;
    subscribe();

    setInterval(ping, 60000);
    setInterval(() => fetchBroadcast(), 120000);
    setInterval(checkHours, 30000);
  }

  boot().catch(error => {
    byId('brand').textContent = 'Yayın açılamadı';
    setState(error?.message || 'Beklenmeyen bir bağlantı hatası oluştu. Sayfayı yenileyin.');
  });
})();
