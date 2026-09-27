(() => {
  const byId = id => document.getElementById(id);
  const audio = byId('audio');
  const key = new URLSearchParams(location.search).get('key');

  let client = null, brandId = null, queue = [], index = 0, started = false, lastStamp = null, karistir = true;
  let bootTime = Date.now(), announcing = false;
  let openTime = null, closeTime = null, wasOpen = null;
  let watchdogTimer = null, watchdogProgressAt = -1, watchdogStuckCount = 0;

  const setState = text => { byId('state').textContent = text; };

  // Saha ekibi telefonla ararken "ne yazıyor?" sorusunu bitirmek için: ekranda
  // kısa, kopyalanabilir bir teşhis kodu bırakırız. Kod, zincirin hangi
  // halkasının koptuğunu söyler; Derin Record tarafında tek bakışta anlaşılır.
  function tani(kod) {
    const el = byId('tani');
    if (!el) return;
    if (!kod) { el.textContent = ''; el.hidden = true; return; }
    el.hidden = false;
    el.textContent = 'Teşhis kodu: ' + kod;
  }
  const safe = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  const withTimeout = (promise, ms) => Promise.race([
    Promise.resolve(promise),
    new Promise((_, reject) => setTimeout(() => reject(new Error('Bağlantı zaman aşımına uğradı.')), ms))
  ]);
  let fetchAttempts = 0;
  // radio_ping'in anahtarı tanıyıp tanımadığı. null: henüz bilinmiyor.
  // "yok" ise sunucu bu anahtarla bir şube kaydı bulamıyor demektir; bu,
  // marka pasif/kaynak atanmamış olmasından ayrı bir arızadır.
  let anahtarDurumu = null;
  // Kafedeki personelin cihazdan seçtiği çalma listesi. Boşsa yönetimin
  // atadığı kaynak ("otomatik") çalınır. Seçim cihazda saklanır.
  let seciliListe = null;
  let listeler = [];
  const LISTE_ANAHTARI = 'derin_record_liste' + (key ? '_' + key : '');
  // Şu an çalan parça: sunucuya bildiririz ki panelde gerçekten hangi parçanın
  // çaldığı görünsün (eskiden yalnızca "ses çalıyor mu" biliniyordu).
  let calanParca = null;
  // Şu an çalınan çalma listesi. Personel cihazdan bir liste seçtiyse onu,
  // yönetimin atadığı kaynak bir listeyse onu taşır. Panel bu sayede "cihaz
  // benim atadığımı mı çalıyor, personel başka bir liste mi seçmiş" sorusunu
  // cevaplayabilir. {id, ad} ya da liste yoksa null (klasör kaynağı).
  let calanListe = null;

  // Sunucu yayın anahtarını uuid olarak bekler. Paneldeki kayıtta anahtar boş
  // kalmışsa kopyalanan bağlantı "...?key=null" olur; sunucu bunu uuid sanıp
  // 400 döner ve oynatıcı boşuna tekrar tekrar dener. Bu yüzden sunucuya hiç
  // gitmeden burada yakalarız.
  const gecerliAnahtar = deger =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(deger || ''));

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
      // Listeyi boş bırakırız: burada "henüz şarkı eklenmemiş" yazmak, yayın
      // çalışıyormuş da parça yokmuş gibi okunuyor ve ekip yanlış yere bakıyor.
      byId('playlist').innerHTML = '';
      audio.pause();
      // radio_now_playing boş döndüğünde dört ayrı arıza aynı ekrana düşer:
      // anahtar hiç tanınmıyor, marka pasif, canlı yayın kaynağı atanmamış ya da
      // abonelik geçersiz. Aşağıda bunları tek tek ayırıp doğrusunu söyleriz,
      // yoksa ekip yerinde deneme yanılma yapmak zorunda kalıyor.
      let d = null;
      try {
        const ab = await client.rpc('abonelik_durumu', { p_player_key: key });
        d = ab && ab.data && ab.data[0];
      } catch { /* abonelik okunamazsa d=null kalır */ }

      if (anahtarDurumu === 'yok') {
        // radio_ping bu anahtarla bir şube bulamadı.
        byId('brand').textContent = 'Yayın anahtarı tanınmıyor';
        setState('Bu bağlantıdaki anahtar sistemde yok. Şube silinip yeniden eklendiyse paneldeki yeni bağlantıyı kullanın.');
        tani('anahtar-yok');
      } else if (d && !d.gecerli) {
        byId('brand').textContent = 'Yayın duraklatıldı';
        setState(d.durum === 'yok'
          ? 'Bu şube için abonelik tanımlı değil. Derin Record ile iletişime geçin.'
          : 'Abonelik süresi doldu. Yenilendiğinde yayın kendiliğinden devam eder.');
        tani(d.durum === 'yok' ? 'abonelik-yok' : 'abonelik-bitmis');
      } else if (d && d.gecerli) {
        // Anahtar da abonelik de sağlam: kopukluk markanın kendisinde.
        byId('brand').textContent = 'Yayın zinciri kopuk';
        setState('Anahtar geçerli ama sunucu markaya yayın vermiyor: marka yayında değil ya da canlı yayın kaynağı atanmamış. Panelde Yayın sağlığı ekranı bunu tek tıkla düzeltir.');
        tani('marka-pasif-veya-kaynak-yok');
      } else {
        setState('Bu link tanınmadı. Lütfen Derin Record ile iletişime geçin.');
        tani('anahtar-belirsiz');
      }
      return;
    }

    // Yayın geldi: geride kalmış bir teşhis kodu varsa temizle.
    tani('');

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

    // Personel bir liste seçtiyse yayını yönetimin atadığı kaynakla ezmeyiz:
    // marka adı ve saatler güncellenir, çalan liste olduğu gibi kalır.
    if (seciliListe) return;

    const tracks = view.tracks;
    const changed = restart || head.updated_at !== lastStamp;
    lastStamp = head.updated_at;

    // Yönetimin atadığı kaynak bir çalma listesiyse adını panele bildiririz.
    // Klasör kaynağında liste yoktur: null gider, panel atanmış kaynağı yazar.
    // (Marka listeleri okunamıyorsa ayırt edemeyiz; bu durumda da null gider ve
    // panel doğru olanı — atanmış kaynağı — gösterir.)
    calanListe = listeler.some(l => l.id === head.folder_id)
      ? { id: head.folder_id, ad: head.folder_name || '' }
      : null;

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
      // Çalabildiyse başlat düğmesine gerek yok.
      byId('start').hidden = true;
      setState('');
      calaniBildir(track);
    }).catch(() => {
      // Tarayıcı sesli otomatik çalmayı engelledi: tek bir dokunuş yeter.
      byId('start').hidden = false;
      setState('Tarayıcı otomatik çalmayı engelledi. Başlatmak için butona dokunun.');
    });
  }

  // Yayını başlatır. Hem düğmeye basıldığında hem de sayfa açılışında
  // kendiliğinden denendiğinde aynı yolu kullanır: tarayıcı sesi engellerse
  // düğme geri görünür, engellemezse hiç görünmez.
  function basla() {
    started = true;
    wasOpen = null;
    startWatchdog();
    if (!isOpen()) {
      // Mesai dışında başlatılacak bir şey yok; düğme de gerekmiyor.
      byId('start').hidden = true;
      checkHours();
      return;
    }
    if (queue.length) play();
    else checkHours();
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

  // Sunucuya "şu an bu parça ve bu liste çalıyor" bilgisini bırakır. Alanlar ve
  // radio_now_report fonksiyonu henüz eklenmemişse çağrı başarısız olur;
  // oynatıcı bunu yok sayar ve çalmaya devam eder. Var olan radio_ping'e
  // dokunmadığımız için cihaz kilidi de etkilenmez.
  //
  // `track` null verilirse "artık bir şey çalmıyor" diye bildiririz; yoksa
  // panelde silinmiş bir listeye ait eski parça adı asılı kalırdı.
  async function calaniBildir(track) {
    if (!client || !key) return;
    if (track && track.title) calanParca = track;
    else if (!track) calanParca = null;

    const ortak = {
      p_player_key: key,
      p_track_id: (track && track.track_id) || null,
      p_title: (track && track.title) || null
    };
    const listeAlanlari = {
      p_playlist_id: calanListe ? calanListe.id : null,
      p_playlist_name: calanListe && calanListe.ad ? calanListe.ad : null
    };
    try {
      const tam = await client.rpc('radio_now_report', Object.assign({}, ortak, listeAlanlari));
      if (!tam || !tam.error) return;
      // supabase/radio-liste-bildirimi.sql henüz çalıştırılmadıysa sunucu beş
      // parametreli çağrıyı reddeder. Eski imzayla tekrar deneriz: parça adı
      // panele akmaya devam etsin, kaybedilen yalnızca liste satırı olsun.
      await client.rpc('radio_now_report', ortak);
    } catch { /* bildirim "olsa iyi olur" katmanıdır: yayın etkilenmez */ }
  }

  byId('start').onclick = basla;

  // Cihaz uykuya girip geri döndüğünde yayın sessizce ölü kalmasın.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && started && audio.paused) play();
  });

  // ---- Personelin çalma listesi seçimi ----------------------------------
  // Yönetim markaya bir kaynak atar; o kaynak "otomatik" seçeneğidir. Kafedeki
  // personel cihazdan markanın kendi listelerinden birini seçip onu çaldırabilir.
  // Seçim cihazda saklanır, yani her sabah yeniden seçmek gerekmez.

  async function listeParcalariniAl(id) {
    try {
      const bag = await client.from('brand_playlist_tracks')
        .select('track_id,sort_order').eq('playlist_id', id).order('sort_order');
      const siralar = (bag && bag.data) || [];
      if (!siralar.length) return [];
      const tr = await client.from('radio_tracks')
        .select('id,title,storage_path').in('id', siralar.map(x => x.track_id));
      const bulunan = new Map(((tr && tr.data) || []).map(t => [t.id, t]));
      // Sıra, listenin kendi sırası olmalı; eksik parçalar atlanır.
      return siralar.map(x => bulunan.get(x.track_id)).filter(Boolean)
        .map(t => ({ track_id: t.id, title: t.title, storage_path: t.storage_path }));
    } catch { return []; }
  }

  function secimCiz() {
    const kap = byId('liste-kap'), sec = byId('liste-sec');
    if (!kap || !sec) return;
    if (!listeler.length) { kap.hidden = true; return; }
    sec.innerHTML = '<option value="">OTOMATİK — yönetimin atadığı yayın</option>'
      + listeler.map(l => `<option value="${safe(l.id)}">${safe(l.name)}</option>`).join('');
    sec.value = seciliListe || '';
    kap.hidden = false;
  }

  // `cal: false` yalnızca açılışta kullanılır: kuyruğu kurar ama başlatmayı
  // tek yerden (basla) yapmak için sesi kendi başına başlatmaz.
  async function listeSec(id, { cal = true } = {}) {
    seciliListe = id || null;
    try {
      if (seciliListe) localStorage.setItem(LISTE_ANAHTARI, seciliListe);
      else localStorage.removeItem(LISTE_ANAHTARI);
    } catch { /* özel mod: seçim yalnızca bu oturumda kalır */ }

    if (!seciliListe) {
      // Otomatiğe dönüş: yönetimin atadığı kaynağı baştan kur.
      lastStamp = null;
      await fetchBroadcast({ restart: true });
      return;
    }

    const secilen = listeler.find(l => l.id === seciliListe);
    const parcalar = await listeParcalariniAl(seciliListe);
    calanListe = { id: seciliListe, ad: secilen ? secilen.name : '' };
    byId('folder').textContent = (secilen ? secilen.name : 'Seçili liste')
      + (parcalar.length ? ' · ' + parcalar.length + ' parça' : '');
    renderPlaylist(parcalar);

    if (!parcalar.length) {
      queue = [];
      audio.pause();
      byId('now').textContent = 'Yayın bekleniyor';
      setState('Bu listede henüz parça yok. Başka bir liste seçin ya da parça ekletin.');
      // Boş liste seçildi: sunucuda eski parça bildirimi asılı kalmasın.
      calaniBildir(null);
      return;
    }

    karistir = secilen ? !!secilen.shuffle : false;
    queue = karistir ? shuffled(parcalar) : parcalar;
    index = 0;
    if (cal) {
      byId('now').textContent = '';
      if (isOpen() && !announcing) play();
    }
  }

  async function listeleriHazirla() {
    if (!brandId || typeof client.from !== 'function') return;
    let data = null;
    try {
      const sonuc = await client.from('brand_playlists')
        .select('id,name,shuffle').eq('brand_id', brandId).order('name');
      data = sonuc && sonuc.data;
    } catch { data = null; }
    // Yönetim bu tabloyu dışarıya açmadıysa liste boş döner; seçici hiç
    // görünmez ve oynatıcı eskisi gibi yönetimin atadığı kaynağı çalar.
    listeler = Array.isArray(data) ? data : [];
    if (!listeler.length) return;
    try {
      const kayitli = localStorage.getItem(LISTE_ANAHTARI);
      if (kayitli && listeler.some(l => l.id === kayitli)) seciliListe = kayitli;
    } catch { /* yok say */ }
    secimCiz();
    if (seciliListe) await listeSec(seciliListe, { cal: false });
  }

  const listeKutusu = byId('liste-sec');
  if (listeKutusu) listeKutusu.onchange = () => listeSec(listeKutusu.value);

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
    calanListe = null;
    calaniBildir(null);
    setState('Bu yayın linki başka bir cihaza kayıtlı. Derin Record ile iletişime geçin.');
  }

  async function ping() {
    let data, error;
    try {
      ({ data, error } = await withTimeout(client.rpc('radio_ping', { p_player_key: key, p_device_id: deviceId, p_playing: !audio.paused }), 8000));
    } catch {
      return { durum: 'belirsiz' };
    }
    if (error) return { durum: 'belirsiz' };
    const row = data && data[0];
    if (row && row.ok === false && row.reason === 'locked_to_other_device') {
      lockedOut();
      return { durum: 'kilitli' };
    }
    if (row && row.ok === false && row.reason === 'invalid_key') {
      // Sunucu bu anahtarla şube bulamıyor: 'bu link tanınmadı' demenin
      // asıl sebebi bu olabilir, o yüzden ayrı işaretleriz.
      anahtarDurumu = 'yok';
      return { durum: 'gecersiz' };
    }
    anahtarDurumu = 'var';
    return { durum: 'ok' };
  }

  async function boot() {
    if (!window.DERIN_CONFIG?.supabaseUrl) { setState('Yapılandırma eksik.'); return; }
    if (!key) {
      byId('brand').textContent = 'Yayın anahtarı yok';
      setState('Bu sayfa şubeye özel link ile açılmalıdır.');
      return;
    }
    if (!gecerliAnahtar(key)) {
      // "...?key=null" gibi eksik kopyalanmış bağlantı buraya düşer.
      byId('brand').textContent = 'Bağlantı eksik kopyalanmış';
      setState('Bu adresteki yayın anahtarı geçersiz görünüyor. Panelde şubeyi açıp “LİNKİ KOPYALA” ile bağlantıyı baştan alın.');
      tani('anahtar-bozuk');
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

    const ilkPing = await ping();
    if (ilkPing.durum === 'kilitli') return;

    await fetchBroadcast({ restart: true });
    if (!brandId) return;

    // Kendiliğinden başlatmayı deneriz: kiosk olarak işaretlenmiş bir cihazda
    // (--autoplay-policy=no-user-gesture-required) düğme hiç çıkmaz; tarayıcı
    // sesi engelliyorsa düğme görünür ve tek bir dokunuş yeter.
    // Kayıtlı liste seçimi varsa kuyruğu o kurar; sonra tek yerden başlatırız.
    await listeleriHazirla();
    basla();
    subscribe();

    // Bildirimi dakikada bir tazeleriz: panel "8 sn önce" gibi taze bir damga
    // gösterirken parçanın hâlâ çaldığından emin olur.
    // Çalan bir şey yokken bildirim göndermeyiz: boş bildirim sunucudaki parça
    // bilgisini siler, panel de dürüst davranıp atanmış kaynağı gösterir.
    setInterval(() => { ping(); if (calanParca) calaniBildir(calanParca); }, 60000);
    setInterval(() => fetchBroadcast(), 120000);
    setInterval(checkHours, 30000);
  }

  boot().catch(error => {
    byId('brand').textContent = 'Yayın açılamadı';
    setState(error?.message || 'Beklenmeyen bir bağlantı hatası oluştu. Sayfayı yenileyin.');
  });
})();
