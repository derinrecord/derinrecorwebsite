// Radyo Yönetim Paneli — kumanda katmanı (veri + etkileşim).
//
// Yerleşim
//   radyo-panel-views.js  → ekranların HTML'i (saf fonksiyonlar)
//   radyo-yonetim.js      → Supabase çağrıları, durum, olaylar (bu dosya)
//
// Kurallar
//   * Kullanıcıya görünen her geri bildirim tek tip: alttaki bildirim kutusu.
//   * Yıkıcı işlemler tek tip onay penceresinden geçer (tarayıcının confirm'i yok).
//   * Yükleme boyunca hiçbir yerde sayfa yeniden çizilmez; yalnızca ilgili
//     satırdaki metin ve ilerleme çubuğu güncellenir (yazdığınız alan kaybolmaz).
//   * Ses yüklemeleri parçalıdır (audio-file-types.js): 50 MiB tek nesne tavanı
//     aşıldığında dosya kayıpsız dilimlere bölünür, WAV/FLAC olduğu gibi kalır.

(() => {
  const V = window.DerinRadyoViews;
  const Ses = window.DerinAudioTypes;
  const el = id => document.getElementById(id);
  const esc = V.esc;

  const slugify = v => String(v || '').toLowerCase()
    .replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's').replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ç/g, 'c')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

  let client = null;
  let kullanici = { ad: 'Yönetici', alt: '', basHarf: 'DR' };
  let D = {
    brands: [], folders: [], tracks: [], players: [], broadcast: [], announcements: [],
    playlists: [], playlistTracks: [], coffeeAttempts: [], subscriptions: [], plans: [], requests: null
  };
  const state = { nav: 'canli', sub: 'subeler', openFolder: null, openBrand: null, openPlaylist: null, q: '' };

  let modalOnay = null, modalKapat = null;
  let toastZaman = null;
  let recorder = null, recParcalari = [], recAkis = null, recZaman = null, recBaslangic = 0;
  let ses = null, calmaListesi = [], calmaIdx = -1, calmaBaslik = '', oynaticiKuruldu = false;
  let yenileZaman = null;

  // ---------- Yardımcılar ----------
  const siteRoot = () => location.href.split('#')[0].split('?')[0].replace(/[^/]*$/, '');
  const ui = {
    cover: p => client.storage.from('radio-covers').getPublicUrl(p).data.publicUrl,
    ses: p => client.storage.from('radio-audio').getPublicUrl(p).data.publicUrl,
    anons: p => client.storage.from('radio-announcements').getPublicUrl(p).data.publicUrl,
    playerBase: () => siteRoot() + 'radyo.html?key=',
    brandUrl: slug => siteRoot() + 'coffee/' + encodeURIComponent(slug || ''),
    accept: () => (Ses ? Ses.accept() : 'audio/*'),
    desteklenenler: () => (Ses ? Ses.desteklenenler() : 'mp3, wav'),
    parcaNotu: () => '45 MB üzeri dosyalar kayıpsız parçalara bölünerek yüklenir',
    now: () => Date.now()
  };

  function bildir(mesaj, tur) {
    const t = el('toast');
    t.className = 'toast show ' + (tur || 'ok');
    t.textContent = mesaj;
    clearTimeout(toastZaman);
    toastZaman = setTimeout(() => { t.className = 'toast ' + (tur || 'ok'); }, tur === 'err' ? 6500 : 3200);
  }
  const hata = m => bildir(m, 'err');

  // ---------- Tek tip pencere ----------
  function pencere(s) {
    modalOnay = s.onOnay || null;
    modalKapat = s.onKapat || null;
    el('modal').innerHTML = `
      <h3>${esc(s.baslik || '')}</h3>
      ${s.govde ? `<div class="modal-body">${s.govde}</div>` : ''}
      <div class="modal-actions">
        <button class="btn" data-act="modal-close" type="button">${esc(s.gizleOnay ? (s.kapatMetni || 'KAPAT') : (s.kapatMetni || 'VAZGEÇ'))}</button>
        ${s.gizleOnay ? '' : `<button class="btn ${s.tehlike ? 'danger' : 'primary'}" data-act="modal-ok" type="button">${esc(s.onayMetni || 'ONAYLA')}</button>`}
      </div>`;
    el('modal-wrap').classList.add('open');
    const ilk = el('modal').querySelector('input,select,textarea');
    if (ilk) setTimeout(() => ilk.focus(), 40);
  }
  function pencereKapat() {
    if (!el('modal-wrap').classList.contains('open')) return;
    el('modal-wrap').classList.remove('open');
    const kapat = modalKapat;
    modalOnay = null; modalKapat = null;
    kaydiTemizle();
    if (kapat) kapat();
  }
  function onaySor(s) {
    return new Promise(res => {
      pencere({
        baslik: s.baslik, govde: s.govde, onayMetni: s.onayMetni || 'SİL', tehlike: true,
        onOnay: () => res(true),
        onKapat: () => res(false)
      });
    });
  }
  function soruSor(s) {
    return new Promise(res => {
      pencere({
        baslik: s.baslik, govde: s.govde, onayMetni: s.onayMetni || 'KAYDET',
        onOnay: () => res(el('modal').querySelector('#soru-deger').value.trim()),
        onKapat: () => res(null)
      });
      const inp = el('modal').querySelector('#soru-deger');
      if (inp) { inp.select(); inp.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); const d = modalOnay; pencereKapat(); if (d) d(); } }; }
    });
  }

  // ---------- Çekmece ----------
  function cekmeceAc(html) {
    el('drawer').innerHTML = `<button class="btn sm drawer-close" data-act="drawer-close" type="button">KAPAT</button>${html}`;
    el('drawer').classList.add('open');
    el('drawer').setAttribute('aria-hidden', 'false');
    el('backdrop').classList.add('open');
  }
  function cekmeceKapat() {
    el('drawer').classList.remove('open');
    el('drawer').setAttribute('aria-hidden', 'true');
    el('backdrop').classList.remove('open');
  }

  // ---------- Yönlendirme ----------
  const ROTALAR = {
    canli: { nav: 'canli', sub: 'subeler' },
    subeler: { nav: 'canli', sub: 'subeler' },
    klasorler: { nav: 'icerik', sub: 'klasorler' },
    anons: { nav: 'icerik', sub: 'anonslar' },
    markalar: { nav: 'musteri', sub: 'markalar' },
    listeler: { nav: 'musteri', sub: 'listeler' },
    abonelikler: { nav: 'musteri', sub: 'abonelikler' },
    talepler: { nav: 'musteri', sub: 'talepler' }
  };

  function hashCoz() {
    const parcalar = (location.hash || '#/canli').replace(/^#\/?/, '').split('/');
    const [sayfa, id, alt, altId] = parcalar;
    const temel = ROTALAR[sayfa] || ROTALAR.canli;
    state.nav = temel.nav;
    state.sub = temel.sub;
    state.openFolder = state.openBrand = state.openPlaylist = null;
    if (sayfa === 'klasorler' && id) state.openFolder = id;
    else if (sayfa === 'markalar' && id) {
      state.openBrand = id;
      if (alt === 'listeler' && altId) { state.sub = 'listeler'; state.openPlaylist = altId; }
    } else if (sayfa === 'listeler' && id) state.openPlaylist = id;
  }

  const git = h => { if (location.hash === h) uygula(); else location.hash = h; };

  function gorunumHash() {
    if (state.openPlaylist) return '#/listeler/' + state.openPlaylist;
    if (state.openBrand) return '#/markalar/' + state.openBrand;
    if (state.openFolder) return '#/klasorler/' + state.openFolder;
    if (state.nav === 'canli') return '#/canli';
    if (state.nav === 'icerik') return state.sub === 'anonslar' ? '#/anons' : '#/klasorler';
    if (state.sub === 'listeler') return '#/listeler';
    if (state.sub === 'abonelikler') return '#/abonelikler';
    if (state.sub === 'talepler') return '#/talepler';
    return '#/markalar';
  }

  // ---------- Çizim ----------
  function sayimlar() {
    return {
      players: D.players.length,
      folders: D.folders.length,
      announcements: D.announcements.length,
      brands: D.brands.length,
      playlists: D.playlists.length,
      requests: D.requests ? D.requests.length : null
    };
  }

  function ciz() {
    // Kapı ekranındayken (giriş yok / yetki yok) istemci hazır olmaz;
    // bu durumda adres çubuğundaki değişiklikler çizim tetiklememeli.
    if (!client) return;
    el('rail').innerHTML = V.nav(state, sayimlar(), kullanici);
    const g = V.gorunum(state, D, ui);
    el('page-title').textContent = g.baslik;
    el('page-sub').textContent = g.alt;
    el('view').innerHTML = g.html;
    const now = Date.now();
    const caliyor = D.players.filter(p => p.is_playing && V.canliMi(p, now)).length;
    const bagli = D.players.filter(p => V.canliMi(p, now)).length;
    const nokta = el('live-dot');
    nokta.className = 'status-dot' + (bagli ? '' : ' bekliyor');
    el('live-text').textContent = bagli ? `${bagli} şube bağlı` : (caliyor ? `${caliyor} kanal çalıyor` : 'canlı bağlantı yok');
    satirSuruklemeBagla();
  }

  // ---------- Veri ----------
  async function veriYukle() {
    const [brands, folders, tracks, players, broadcast, announcements, playlists, playlistTracks, coffeeAttempts, subscriptions, plans] = await Promise.all([
      client.from('brands').select('id,name,slug,is_active,access_code').order('name'),
      client.from('radio_folders').select('id,name,description,cover_path,shuffle').order('name'),
      client.from('radio_tracks').select('id,folder_id,title,storage_path,sort_order,duration_sec,cover_path').order('sort_order'),
      client.from('brand_players').select('id,brand_id,label,player_key,last_seen_at,open_time,close_time,bound_device_id,bound_at,first_ip,last_ip,last_ip_at,is_playing').order('label'),
      client.from('brand_broadcast').select('brand_id,folder_id,playlist_id,shuffle,updated_at'),
      client.from('radio_announcements').select('id,brand_id,storage_path,label,created_at').order('created_at', { ascending: false }).limit(50),
      client.from('brand_playlists').select('id,brand_id,name,description,cover_path,shuffle,created_at').order('created_at'),
      client.from('brand_playlist_tracks').select('id,playlist_id,track_id,sort_order').order('sort_order'),
      client.from('coffee_access_attempts').select('id,brand_id,slug,success,ip,created_at').order('created_at', { ascending: false }).limit(200),
      client.from('subscriptions').select('*'),
      client.from('plans').select('*').order('sort_order')
    ]);
    D = {
      brands: brands.data || [], folders: folders.data || [], tracks: tracks.data || [],
      players: players.data || [], broadcast: broadcast.data || [], announcements: announcements.data || [],
      playlists: playlists.data || [], playlistTracks: playlistTracks.data || [],
      coffeeAttempts: coffeeAttempts.data || [], subscriptions: subscriptions.data || [], plans: plans.data || [],
      requests: D.requests
    };
  }

  // sessiz: yalnızca Canlı durum ekranı kendini tazeler; form girdileriniz
  // (klasör adı, yeni marka vb.) yeniden çizimle silinmez.
  async function yenile(sessiz) {
    await veriYukle();
    if (sessiz && state.nav !== 'canli') { el('rail').innerHTML = V.nav(state, sayimlar(), kullanici); return; }
    ciz();
    if (state.openBrand && !D.brands.some(b => b.id === state.openBrand)) git('#/markalar');
    if (state.openFolder && !D.folders.some(f => f.id === state.openFolder)) git('#/klasorler');
  }

  async function uygula() {
    if (!client) return;
    hashCoz();
    if (state.nav === 'musteri' && state.sub === 'talepler' && !state.openBrand && !state.openPlaylist) await talepleriYukle();
    ciz();
  }

  async function talepleriYukle() {
    const { data, error } = await client.from('coffee_requests')
      .select('id,company,contact_name,email,phone,branch_count,message,status,created_at')
      .order('created_at', { ascending: false });
    if (error) { hata('Talepler okunamadı: ' + error.message); D.requests = []; return; }
    D.requests = data || [];
  }

  let canliKanal = null;
  function canliDinle() {
    if (canliKanal) return;
    canliKanal = client.channel('radyo-panel-subeler')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'brand_players' }, () => {
        clearTimeout(yenileZaman);
        yenileZaman = setTimeout(() => yenile(true).catch(() => {}), 800);
      })
      .subscribe();
    // Cihaz nabzı 60 saniyede bir düşüyor: "bağlı/çalıyor" göstergesi için
    // olay gelmese de düzenli olarak tazeliyoruz.
    setInterval(() => yenile(true).catch(() => {}), 30000);
  }

  // ---------- Kapı (giriş/yetki) ----------
  function kapi(baslik, mesaj, butonMetni, tikla) {
    el('rail').hidden = true;
    el('page-title').textContent = 'Radyo kontrolü';
    el('page-sub').textContent = mesaj;
    el('view').innerHTML = `<div class="gate">
      <h2>${esc(baslik)}</h2><p>${esc(mesaj)}</p>
      ${butonMetni ? `<button class="btn primary" id="kapi-buton" type="button">${esc(butonMetni)}</button>` : ''}
    </div>`;
    if (butonMetni && tikla) el('kapi-buton').onclick = tikla;
  }

  async function basla() {
    await window.DerinAuth.ready;
    const auth = window.DerinAuth;
    if (!auth.configured) return kapi('Hesap sistemi hazır değil', 'Supabase bağlantı bilgileri config.js dosyasına eklenmeli.', null, null);
    if (!auth.user) return kapi('Giriş gerekli', 'Bu panel yalnızca yöneticilere açıktır.', 'GİRİŞ YAP', () => auth.open());
    if (auth.profile?.role !== 'admin') return kapi('Yetki yok', 'Bu alan için yönetici yetkiniz bulunmuyor.', null, null);

    client = auth.client;
    const ad = auth.profile.full_name || auth.user.email || 'Yönetici';
    kullanici = {
      ad,
      alt: auth.user.email || 'Yönetici',
      basHarf: String(ad).trim().split(/\s+/).slice(0, 2).map(s => s[0]).join('').toUpperCase() || 'DR'
    };
    el('rail').hidden = false;
    hashCoz();
    ciz();
    await yenile(false);
    canliDinle();
  }

  // ---------- Parça oynatma (klasör ve liste önizlemesi) ----------
  function oynaticiKur() {
    if (oynaticiKuruldu) return;
    oynaticiKuruldu = true;
    el('player').innerHTML = `
      <div class="p-now" id="p-now">
        <span class="cover" id="p-img">♪</span>
        <div style="min-width:0"><b id="p-title">—</b><small id="p-sub">—</small></div>
      </div>
      <div class="p-ctr">
        <div class="p-btns">
          <button id="p-prev" type="button" title="Önceki">⏮</button>
          <button class="main" id="p-toggle" type="button" title="Çal / durdur">▶</button>
          <button id="p-next" type="button" title="Sonraki">⏭</button>
        </div>
        <div class="p-seek">
          <span class="p-time" id="p-cur">0:00</span>
          <input type="range" id="p-seek" min="0" max="1000" value="0" aria-label="İlerleme">
          <span class="p-time" id="p-dur">0:00</span>
        </div>
      </div>
      <div class="p-vol">🔊<input type="range" id="p-vol" min="0" max="100" value="100" aria-label="Ses"></div>
      <button class="btn sm" id="p-close" type="button">KAPAT</button>`;
    ses = new Audio();
    el('p-toggle').onclick = () => {
      if (!ses.src) return;
      if (ses.paused) ses.play().catch(() => hata('Parça çalınamadı.'));
      else ses.pause();
    };
    el('p-next').onclick = () => cal((calmaIdx + 1) % calmaListesi.length);
    el('p-prev').onclick = () => cal((calmaIdx - 1 + calmaListesi.length) % calmaListesi.length);
    el('p-vol').oninput = e => { ses.volume = e.target.value / 100; };
    el('p-seek').oninput = e => { if (ses.duration) ses.currentTime = (e.target.value / 1000) * ses.duration; };
    el('p-close').onclick = () => { ses.pause(); el('player').classList.remove('open'); };
    el('p-now').onclick = () => {
      if (calmaIdx < 0) return;
      const t = calmaListesi[calmaIdx];
      pencere({
        baslik: 'Parça', govde: V.parcaDetay(t, calmaBaslik, t.cover_path ? ui.cover(t.cover_path) : null),
        gizleOnay: true, kapatMetni: 'KAPAT'
      });
    };
    ses.ontimeupdate = () => {
      if (!ses.duration) return;
      el('p-cur').textContent = V.mmss(ses.currentTime);
      el('p-dur').textContent = V.mmss(ses.duration);
      el('p-seek').value = Math.round((ses.currentTime / ses.duration) * 1000);
    };
    ses.onplay = () => { el('p-toggle').textContent = '⏸'; };
    ses.onpause = () => { el('p-toggle').textContent = '▶'; };
    ses.onended = () => cal((calmaIdx + 1) % calmaListesi.length);
    ses.onerror = () => hata('Bu parçanın ses dosyası okunamadı.');
  }

  function cal(i) {
    if (!calmaListesi.length || !(i >= 0 && i < calmaListesi.length)) return;
    oynaticiKur();
    calmaIdx = i;
    const t = calmaListesi[i];
    ses.src = ui.ses(t.storage_path);
    el('player').classList.add('open');
    el('p-title').textContent = V.clean(t.title);
    el('p-sub').textContent = calmaBaslik;
    const img = el('p-img');
    img.innerHTML = t.cover_path ? `<img src="${esc(ui.cover(t.cover_path))}" alt="">` : '♪';
    el('p-cur').textContent = '0:00';
    el('p-dur').textContent = '0:00';
    el('p-seek').value = 0;
    ses.play().catch(() => hata('Çalmak için oynatıcıdaki ▶ düğmesine bas.'));

    // Klasörde tıklanan satırı işaretle
    document.querySelectorAll('#view tbody tr.playing').forEach(r => r.classList.remove('playing'));
    const secili = document.querySelector(`#view tbody tr[data-id="${t.id}"]`);
    if (secili) secili.classList.add('playing');
  }

  function klasoruCal(folderId, baslangicId) {
    const liste = D.tracks.filter(t => t.folder_id === folderId)
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    if (!liste.length) return hata('Bu klasörde çalınacak parça yok.');
    calmaListesi = liste;
    calmaBaslik = (D.folders.find(f => f.id === folderId) || {}).name || 'Klasör';
    const idx = baslangicId ? Math.max(0, liste.findIndex(t => t.id === baslangicId)) : 0;
    cal(idx);
  }

  // ---------- Anons kaydı ----------
  // Kaydı bırakır: pencere kapatıldığında gönderim yapılmaz, mikrofon bırakılır.
  function kaydiTemizle() {
    clearInterval(recZaman);
    recZaman = null;
    if (recorder && recorder.state === 'recording') {
      recorder.onstop = null;
      try { recorder.stop(); } catch (err) { /* kayıt zaten durmuş */ }
    }
    recorder = null;
    if (recAkis) { recAkis.getTracks().forEach(t => t.stop()); recAkis = null; }
  }

  function mikrofon(brandId) {
    if (!brandId) return hata('Önce marka seçin.');
    const marka = D.brands.find(b => b.id === brandId);
    pencere({
      baslik: 'Mikrofonla anons',
      gizleOnay: true, kapatMetni: 'KAPAT',
      govde: `
        <p>${esc(marka ? marka.name : 'Marka')} şubelerinde çalan akışın önüne girer.</p>
        <div class="field" style="margin-bottom:14px"><label for="mik-label">NOT (isteğe bağlı)</label>
          <input id="mik-label" placeholder="Örn. Kampanya duyurusu" autocomplete="off"></div>
        <div class="mic">
          <div class="bars" id="mik-bars" hidden>${Array.from({ length: 22 }, (_, i) => `<i style="animation-delay:${(i % 7) * 0.09}s"></i>`).join('')}</div>
          <span class="chip gold" id="mik-sure">00:00</span>
          <button class="btn primary" id="mik-rec" type="button">🎙 KAYDA BAŞLA</button>
          <span class="sub" id="mik-msg">Kayıt başladığında konuşun, bitince durdurun.</span>
        </div>`
    });
    el('mik-rec').onclick = () => kayitDugmesi(brandId);
  }

  async function kayitDugmesi(brandId) {
    const dugme = el('mik-rec'), mesaj = el('mik-msg');
    if (recorder && recorder.state === 'recording') { recorder.stop(); return; }
    try { recAkis = await navigator.mediaDevices.getUserMedia({ audio: true }); }
    catch (err) { mesaj.textContent = 'Mikrofona erişilemedi: ' + err.name; return; }

    recParcalari = [];
    el('mik-bars').hidden = false;
    recBaslangic = Date.now();
    recZaman = setInterval(() => {
      const s = Math.floor((Date.now() - recBaslangic) / 1000);
      el('mik-sure').textContent = String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
    }, 250);

    recorder = new MediaRecorder(recAkis);
    recorder.ondataavailable = e => { if (e.data.size) recParcalari.push(e.data); };
    recorder.onstop = async () => {
      // kaydiTemizle() recorder'ı boşaltır: kullanılacak değerler önce alınır.
      const tip = recorder.mimeType || 'audio/webm';
      const sure = Math.floor((Date.now() - recBaslangic) / 1000);
      kaydiTemizle();
      if (el('mik-bars')) el('mik-bars').hidden = true;
      if (dugme) { dugme.textContent = '🎙 KAYDA BAŞLA'; dugme.classList.remove('rec'); }
      if (sure < 1) { if (mesaj) mesaj.textContent = 'Kayıt çok kısa (1 saniyeden az) — gönderilmedi.'; return; }
      if (mesaj) mesaj.textContent = 'Gönderiliyor…';
      const blob = new Blob(recParcalari, { type: tip });
      const uzanti = tip.includes('mp4') ? 'mp4' : 'webm';
      const yol = `${brandId}/${Date.now()}.${uzanti}`;
      const up = await client.storage.from('radio-announcements').upload(yol, blob, { contentType: blob.type });
      if (up.error) { if (mesaj) mesaj.textContent = 'Yükleme hatası: ' + up.error.message; return; }
      const etiket = document.getElementById('mik-label') ? document.getElementById('mik-label').value.trim() : '';
      const { error } = await client.from('radio_announcements').insert({
        brand_id: brandId, storage_path: yol, label: etiket || null
      });
      if (error) { if (mesaj) mesaj.textContent = 'Kayıt hatası: ' + error.message; return; }
      pencereKapat();
      bildir('Anons gönderildi: ' + (marka(brandId) ? marka(brandId).name : 'marka') + ' şubeleri çalacak.');
      await yenile(false);
    };

    recorder.start();
    if (dugme) { dugme.textContent = '⏹ DURDUR VE GÖNDER'; dugme.classList.add('rec'); }
    if (mesaj) mesaj.textContent = 'Kayıt sürüyor… Konuşun, bitince durdurun.';
  }

  const marka = id => D.brands.find(b => b.id === id);

  // ---------- Parça yükleme (parçalı, kayıpsız) ----------
  async function parcalariYukle(folderId) {
    const giris = el('track-file');
    const dosyalar = Array.from((giris && giris.files) || []);
    const mesaj = el('track-msg'), bar = el('up-bar');
    if (!dosyalar.length) return hata('Önce dosya seçin.');
    if (!Ses) return hata('Ses yükleme yardımcıları yüklenemedi (audio-file-types.js).');

    const baslangic = Date.now();
    let biten = 0, atlanan = 0, ilkHata = '';
    const mevcut = D.tracks.filter(t => t.folder_id === folderId).length;

    for (const dosya of dosyalar) {
      if (!Ses.gecerli(dosya)) { atlanan++; ilkHata = ilkHata || `“${dosya.name}” desteklenmeyen bir uzantıda.`; continue; }
      const yuzde = Math.round((biten / dosyalar.length) * 100);
      mesaj.textContent = `Yükleniyor… ${biten + 1}/${dosyalar.length} · %${yuzde}`;
      bar.hidden = false;
      bar.firstElementChild.style.width = yuzde + '%';

      const taban = V.clean(dosya.name).replace(/\.[^.]+$/, '');
      const temelYol = `${folderId}/${Date.now()}-${slugify(taban) || 'parca'}`;
      const sonuc = await Ses.parcaliYukle({
        yukle: (yol, dilim, tip) => client.storage.from('radio-audio').upload(yol, dilim, { contentType: tip }),
        sil: yollar => client.storage.from('radio-audio').remove(yollar)
      }, temelYol, dosya, (i, n) => {
        if (n > 1) mesaj.textContent = `Yükleniyor… ${biten + 1}/${dosyalar.length} · parça ${i}/${n}`;
      });

      if (sonuc.error) {
        atlanan++;
        ilkHata = ilkHata || (`“${dosya.name}” yüklenemedi: ` + (sonuc.error.message || 'bilinmeyen hata'));
        continue;
      }

      const sure = await sureOku(dosya);
      const { error } = await client.from('radio_tracks').insert({
        folder_id: folderId, title: taban, storage_path: sonuc.path,
        sort_order: mevcut + biten, duration_sec: sure
      });
      if (error) {
        atlanan++;
        ilkHata = ilkHata || ('Kayıt oluşturulamadı: ' + error.message);
        await client.storage.from('radio-audio').remove(Ses.parcalariCoz(sonuc.path).map(p => p.path));
        continue;
      }
      biten++;
    }

    const saniye = Math.round((Date.now() - baslangic) / 1000);
    bar.firstElementChild.style.width = '100%';
    setTimeout(() => { bar.hidden = true; }, 600);
    giris.value = '';
    const kutu = el('track-drop');
    if (kutu) kutu.classList.remove('secili');
    await yenile(false);
    if (atlanan) hata(`${biten} parça yüklendi (${saniye} sn) · ${atlanan} dosya atlandı — ${ilkHata}`);
    else bildir(`${biten} parça yüklendi (${saniye} sn).`);
  }

  function sureOku(dosya) {
    return new Promise(res => {
      const a = new Audio(URL.createObjectURL(dosya));
      let bitti = false;
      const tamam = v => { if (!bitti) { bitti = true; res(v); } };
      a.onloadedmetadata = () => tamam(Math.round(a.duration) || null);
      a.onerror = () => tamam(null);
      setTimeout(() => tamam(null), 8000);
    });
  }

  // ---------- Sıralama (sürükle) ----------
  function satirSuruklemeBagla() {
    const satirlar = Array.from(document.querySelectorAll('#view tr[draggable="true"]'));
    if (!satirlar.length) return;
    let tasinan = null;
    satirlar.forEach(satir => {
      satir.addEventListener('dragstart', () => {
        if (state.q) { bildir('Arama açıkken sıralama kapalı. Aramayı temizleyin.', 'err'); return; }
        tasinan = satir;
        satir.classList.add('tasiyor');
      });
      satir.addEventListener('dragend', () => {
        satir.classList.remove('tasiyor');
        tasinan = null;
      });
      satir.addEventListener('dragover', e => {
        if (!tasinan || tasinan === satir) return;
        e.preventDefault();
      });
      satir.addEventListener('drop', async e => {
        e.preventDefault();
        if (!tasinan || tasinan === satir) return;
        const govde = satir.parentElement;
        const yerler = Array.from(govde.children);
        const kaynak = yerler.indexOf(tasinan), hedef = yerler.indexOf(satir);
        if (kaynak < 0 || hedef < 0) return;
        govde.removeChild(tasinan);
        govde.insertBefore(tasinan, hedef > kaynak ? satir.nextSibling : satir);
        tasinan = null;
        const yeniSira = Array.from(govde.children).map(r => r.dataset.id).filter(Boolean);
        await sirayiKaydet(yeniSira);
      });
    });
  }

  async function sirayiKaydet(idlistesi) {
    const guncellemeler = idlistesi.map((id, i) => client.from('radio_tracks').update({ sort_order: i }).eq('id', id));
    const sonuclar = await Promise.all(guncellemeler);
    const hataVar = sonuclar.find(s => s.error);
    if (hataVar) { hata('Sıra kaydedilemedi: ' + hataVar.error.message); return; }
    D.tracks.forEach(t => { const i = idlistesi.indexOf(t.id); if (i > -1) t.sort_order = i; });
    bildir('Sıra güncellendi.');
    ciz();
  }

  // ---------- Olaylar ----------
  document.addEventListener('click', async e => {
    // Kapı ekranındayken panel çizilmemiştir: veri istemcisi olmadan
    // hiçbir işlem çalışmamalı (giriş yapmadan adres/arama karıştırılsa bile).
    if (!client) return;
    const nav = e.target.closest('.nav-item');
    if (nav) {
      state.q = ''; el('search').value = '';
      state.nav = nav.dataset.nav; state.sub = nav.dataset.sub;
      state.openFolder = state.openBrand = state.openPlaylist = null;
      git(gorunumHash());
      return;
    }
    const sekme = e.target.closest('.tabs button');
    if (sekme) {
      state.q = ''; el('search').value = '';
      state.sub = sekme.dataset.sub;
      state.openFolder = state.openBrand = state.openPlaylist = null;
      git(gorunumHash());
      return;
    }

    const hedef = e.target.closest('[data-act]');
    if (!hedef) return;
    const act = hedef.dataset.act, id = hedef.dataset.id;
    const dur = e => { if (e) { e.preventDefault(); e.stopPropagation(); } };

    switch (act) {
      // --- pencere / çekmece / genel ---
      case 'modal-close': return pencereKapat();
      case 'modal-ok': {
        // Onay yolunda pencere kapanışı "vazgeç" geri çağrısını çalıştırmaz;
        // aksi hâlde söz (promise) onaylanmadan önce null ile çözülürdü.
        const f = modalOnay;
        modalKapat = null; modalOnay = null;
        el('modal-wrap').classList.remove('open');
        kaydiTemizle();
        if (f) await f();
        return;
      }
      case 'drawer-close': return cekmeceKapat();
      case 'copy':
        {
          const eski = hedef.textContent;
          try { await navigator.clipboard.writeText(hedef.dataset.copy || ''); hedef.textContent = 'KOPYALANDI'; }
          catch (err) { return hata('Kopyalanamadı. Değeri elle seçebilirsiniz.'); }
          setTimeout(() => { hedef.textContent = eski; }, 1600);
        }
        return;
      case 'cikis':
        if (!await onaySor({ baslik: 'Çıkış yapılsın mı?', govde: 'Panelden çıkacak ve giriş ekranına döneceksiniz.', onayMetni: 'ÇIKIŞ YAP' })) return;
        await client.auth.signOut();
        location.reload();
        return;
      case 'geri': {
        const nereye = hedef.dataset.hedef;
        state.q = ''; el('search').value = '';
        if (nereye === 'klasorler') { state.sub = 'klasorler'; state.openFolder = null; }
        else if (nereye === 'markalar') { state.sub = 'markalar'; state.openPlaylist = null; state.openBrand = null; }
        else { state.sub = 'listeler'; if (state.openBrand) state.openPlaylist = null; else state.openPlaylist = null; }
        git(gorunumHash());
        return;
      }

      // --- şubeler ---
      case 'branch-open': cekmeceAc(V.subeCekmecesi(id, D, ui)); return;
      case 'player-copy': {
        const p = D.players.find(x => x.id === id);
        if (!p) return;
        try { await navigator.clipboard.writeText(ui.playerBase() + p.player_key); hedef.textContent = 'KOPYALANDI'; bildir('Yayın linki kopyalandı.'); }
        catch (err) { return hata('Link kopyalanamadı.'); }
        setTimeout(() => { hedef.textContent = 'LİNK'; }, 1600);
        return;
      }
      case 'player-lock':
        if (!await onaySor({ baslik: 'Cihaz kilidi sıfırlansın mı?', govde: 'Bu şubenin linki bir sonraki açılan cihaza yeniden kilitlenecek.', onayMetni: 'KİLİDİ SIFIRLA' })) return;
        await client.from('brand_players').update({
          bound_device_id: null, bound_at: null, first_ip: null, last_ip: null, last_ip_at: null
        }).eq('id', id);
        cekmeceKapat(); await yenile(false); bildir('Cihaz kilidi sıfırlandı.');
        return;
      case 'player-del': {
        const p = D.players.find(x => x.id === id);
        if (!await onaySor({
          baslik: 'Şube silinsin mi?',
          govde: `“${p ? p.label : 'Şube'}” kaydı silinir ve yayın linki çalışmayı durdurur.`,
          onayMetni: 'ŞUBEYİ SİL'
        })) return;
        const { error } = await client.from('brand_players').delete().eq('id', id);
        if (error) return hata('Şube silinemedi: ' + error.message);
        cekmeceKapat(); await yenile(false); bildir('Şube silindi.');
        return;
      }
      case 'player-add': {
        const ad = el('p-label').value.trim();
        if (!ad) return hata('Şube adı gerekli.');
        const { error } = await client.from('brand_players').insert({
          brand_id: id, label: ad,
          open_time: el('p-open').value || null, close_time: el('p-close').value || null
        });
        if (error) return hata('Şube eklenemedi: ' + error.message);
        await yenile(false); bildir('Şube eklendi ve yayın linki üretildi.');
        return;
      }

      // --- klasörler ---
      case 'folder-open': git('#/klasorler/' + id); return;
      case 'folder-add': {
        const ad = el('folder-name').value.trim();
        if (!ad) return hata('Klasör adı gerekli.');
        const { error } = await client.from('radio_folders').insert({
          name: ad, description: el('folder-desc').value.trim() || null
        });
        if (error) return hata('Klasör oluşturulamadı: ' + error.message);
        await yenile(false); bildir('Klasör oluşturuldu.');
        return;
      }
      case 'folder-del': {
        const f = D.folders.find(x => x.id === id);
        const parcalar = D.tracks.filter(t => t.folder_id === id);
        if (!await onaySor({
          baslik: 'Klasör silinsin mi?',
          govde: `“${f ? f.name : 'Klasör'}” ve içindeki ${parcalar.length} parça listeden çıkarılır; ses dosyaları depodan silinir.`,
          onayMetni: 'KLASÖRÜ SİL'
        })) return;
        if (Ses && parcalar.length) {
          const yollar = parcalar.flatMap(t => Ses.parcalariCoz(t.storage_path).map(p => p.path));
          await client.storage.from('radio-audio').remove(yollar);
        }
        await client.from('radio_tracks').delete().eq('folder_id', id);
        const { error } = await client.from('radio_folders').delete().eq('id', id);
        if (error) return hata('Klasör silinemedi: ' + error.message);
        if (state.openFolder === id) { state.openFolder = null; git('#/klasorler'); }
        await yenile(false); bildir('Klasör silindi.');
        return;
      }
      case 'folder-rename': {
        const ad = el('f-name').value.trim();
        if (!ad) return hata('Klasör adı boş olamaz.');
        const { error } = await client.from('radio_folders').update({ name: ad }).eq('id', state.openFolder);
        if (error) return hata('Ad güncellenemedi: ' + error.message);
        await yenile(false); bildir('Klasör adı güncellendi.');
        return;
      }
      case 'folder-shuffle': {
        const f = D.folders.find(x => x.id === state.openFolder);
        if (!f) return;
        const yeni = f.shuffle === false;
        const { error } = await client.from('radio_folders').update({ shuffle: yeni }).eq('id', f.id);
        if (error) return hata('Kaydedilemedi: ' + error.message);
        await yenile(false);
        bildir(yeni ? 'Karışık çalma açık — her tur yeniden karışır.' : 'Sırayla çalma açık.');
        return;
      }
      case 'cover-del': {
        const f = D.folders.find(x => x.id === state.openFolder);
        if (!f || !f.cover_path) return;
        if (!await onaySor({ baslik: 'Kapak silinsin mi?', govde: 'Klasörün kapak görseli kaldırılacak.', onayMetni: 'KAPAĞI SİL' })) return;
        await client.storage.from('radio-covers').remove([f.cover_path]);
        const { error } = await client.from('radio_folders').update({ cover_path: null }).eq('id', f.id);
        if (error) return hata('Kapak silinemedi: ' + error.message);
        await yenile(false); bildir('Kapak silindi.');
        return;
      }

      // --- parçalar ---
      // Satıra tıklamak da çalar (sürükleme tutamacı ve düğmeler hariç).
      case 'track-open': case 'track-play': {
        if (e.target.closest('.drag') || e.target.closest('button')) return;
        dur(e);
        klasoruCal(state.openFolder, id);
        return;
      }
      case 'track-upload': return parcalariYukle(state.openFolder);
      case 'track-rename': {
        const t = D.tracks.find(x => x.id === id);
        if (!t) return;
        const yeni = await soruSor({
          baslik: 'Parça adı',
          govde: `<div class="field"><label for="soru-deger">YENİ AD</label>
            <input id="soru-deger" value="${esc(V.clean(t.title))}"></div>`
        });
        if (!yeni) return;
        const { error } = await client.from('radio_tracks').update({ title: yeni }).eq('id', t.id);
        if (error) return hata('Ad kaydedilemedi: ' + error.message);
        await yenile(false); bildir('Parça adı güncellendi.');
        return;
      }
      case 'track-img': {
        const t = D.tracks.find(x => x.id === id);
        if (!t) return;
        const giris = document.createElement('input');
        giris.type = 'file'; giris.accept = 'image/*';
        giris.onchange = async () => {
          const dosya = giris.files && giris.files[0];
          if (!dosya) return;
          const yol = `tracks/${t.id}-${Date.now()}.${(dosya.name.split('.').pop() || 'jpg').toLowerCase()}`;
          const up = await client.storage.from('radio-covers').upload(yol, dosya, { contentType: dosya.type || 'image/jpeg' });
          if (up.error) return hata('Görsel yüklenemedi: ' + up.error.message);
          const { error } = await client.from('radio_tracks').update({ cover_path: yol }).eq('id', t.id);
          if (error) return hata('Görsel kaydedilemedi: ' + error.message);
          await yenile(false); bildir('Parça görseli güncellendi.');
        };
        giris.click();
        return;
      }
      case 'track-move': {
        const t = D.tracks.find(x => x.id === id);
        if (!t) return;
        const secenekler = D.brands
          .map(b => ({ b, listeler: D.playlists.filter(p => p.brand_id === b.id) }))
          .filter(x => x.listeler.length);
        if (!secenekler.length) return hata('Önce bir markaya çalma listesi eklemelisiniz.');
        pencere({
          baslik: 'Başka listeye ekle',
          onayMetni: 'LİSTEYE EKLE',
          govde: `
            <p>“${esc(V.clean(t.title))}” hangi markanın listesine eklensin? Parça genel klasöründe olduğu gibi kalır.</p>
            <div class="field" style="margin-bottom:12px"><label for="tasi-marka">MARKA</label>
              <select id="tasi-marka">${secenekler.map(x => `<option value="${esc(x.b.id)}">${esc(x.b.name)}</option>`).join('')}</select></div>
            <div class="field"><label for="tasi-liste">ÇALMA LİSTESİ</label>
              <select id="tasi-liste"></select></div>`,
          onOnay: async () => {
            const playlistId = el('tasi-liste').value;
            if (!playlistId) return;
            const mevcut = D.playlistTracks.filter(x => x.playlist_id === playlistId);
            if (mevcut.some(x => x.track_id === t.id)) return hata('Bu parça zaten o listede var.');
            const { error } = await client.from('brand_playlist_tracks').insert({
              playlist_id: playlistId, track_id: t.id, sort_order: mevcut.length
            });
            if (error) return hata('Listeye eklenemedi: ' + error.message);
            await yenile(false); bildir('Parça markanın listesine eklendi.');
          }
        });
        const markaSec = el('tasi-marka'), listeSec = el('tasi-liste');
        const doldur = () => {
          const x = secenekler.find(s => s.b.id === markaSec.value);
          listeSec.innerHTML = (x ? x.listeler : []).map(p => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('');
        };
        markaSec.onchange = doldur;
        doldur();
        return;
      }
      case 'track-del': {
        const t = D.tracks.find(x => x.id === id);
        if (!await onaySor({
          baslik: 'Parça silinsin mi?',
          govde: `“${t ? esc(V.clean(t.title)) : 'Parça'}” listeden çıkarılır ve ses dosyası depodan silinir.`,
          onayMetni: 'PARÇAYI SİL'
        })) return;
        if (Ses) await client.storage.from('radio-audio').remove(Ses.parcalariCoz(hedef.dataset.path || (t && t.storage_path)).map(p => p.path));
        const { error } = await client.from('radio_tracks').delete().eq('id', id);
        if (error) return hata('Parça silinemedi: ' + error.message);
        await yenile(false); bildir('Parça silindi.');
        return;
      }

      // --- anonslar ---
      case 'mic': {
        const brandId = id || (el('anons-brand') ? el('anons-brand').value : '');
        return mikrofon(brandId);
      }
      case 'anons-play': {
        oynaticiKur();
        ses.src = ui.anons(hedef.dataset.path);
        el('player').classList.add('open');
        el('p-title').textContent = 'Anons';
        el('p-sub').textContent = 'Marka anonsu';
        el('p-img').innerHTML = '🎙';
        calmaListesi = []; calmaIdx = -1;
        ses.play().catch(() => hata('Anons çalınamadı.'));
        return;
      }
      case 'anons-del': {
        if (!await onaySor({ baslik: 'Anons silinsin mi?', govde: 'Kayıt silinir ve şubeler artık çalamaz.', onayMetni: 'ANONSU SİL' })) return;
        await client.storage.from('radio-announcements').remove([hedef.dataset.path]);
        const { error } = await client.from('radio_announcements').delete().eq('id', id);
        if (error) return hata('Anons silinemedi: ' + error.message);
        await yenile(false); bildir('Anons silindi.');
        return;
      }

      // --- markalar ---
      case 'brand-open': git('#/markalar/' + id); return;
      case 'brand-add': {
        const ad = el('brand-name').value.trim();
        if (!ad) return hata('Marka adı gerekli.');
        const slug = bosSlug(slugify(ad));
        const { data, error } = await client.from('brands').insert({
          name: ad, slug, contact: el('brand-contact').value.trim() || null
        }).select('id').single();
        if (error) return hata('Marka oluşturulamadı: ' + error.message);
        await yenile(false); bildir('Marka oluşturuldu.');
        git('#/markalar/' + data.id);
        return;
      }
      case 'ab-brand-add': {
        const ad = el('ab-brand-name').value.trim();
        if (!ad) return hata('Marka adı gerekli.');
        const { error } = await client.from('brands').insert({
          name: ad, slug: bosSlug(slugify(ad)), contact: el('ab-brand-contact').value.trim() || null
        });
        if (error) return hata('Marka oluşturulamadı: ' + error.message);
        await yenile(false); bildir('Marka oluşturuldu.');
        return;
      }
      case 'brand-slug-set': {
        const b = marka(id);
        const ham = el('brand-slug').value.trim();
        if (!ham) return hata('Link adı gerekli.');
        const yeni = slugify(ham);
        if (!yeni) return hata('Geçerli bir link adı girin (harf, rakam, tire).');
        if (b && yeni === b.slug) return bildir('Link adı zaten bu.');
        if (b && b.slug && !await onaySor({
          baslik: 'Link adı değiştirilsin mi?',
          govde: `Eski link (coffee/${esc(b.slug)}) çalışmaz olur ve yeni linki markaya iletmeniz gerekir.`,
          onayMetni: 'LİNK ADINI DEĞİŞTİR'
        })) return;
        const { error } = await client.from('brands').update({ slug: yeni }).eq('id', id);
        if (error) return hata(error.code === '23505' ? 'Bu link adı başka bir markada kullanılıyor.' : error.message);
        await yenile(false); bildir('Link adı güncellendi: coffee/' + yeni);
        return;
      }
      case 'brand-code-set': {
        const b = marka(id);
        const kod = el('brand-code').value.trim();
        if (!kod) return hata('Erişim kodu gerekli.');
        if (b && b.access_code && kod !== b.access_code && !await onaySor({
          baslik: 'Erişim kodu değiştirilsin mi?',
          govde: 'Markanın eski kodu ve linki çalışmaz olur; yeni kodu müşteriye iletmeniz gerekir.',
          onayMetni: 'KODU DEĞİŞTİR'
        })) return;
        const { error } = await client.from('brands').update({ access_code: kod }).eq('id', id);
        if (error) return hata('Kod kaydedilemedi: ' + error.message);
        await yenile(false); bildir('Erişim kodu kaydedildi.');
        return;
      }
      case 'brand-del': {
        const b = marka(id);
        if (!await onaySor({
          baslik: 'Marka silinsin mi?',
          govde: `“${b ? b.name : 'Marka'}” tamamen silinir: şubeleri, yayın linkleri, çalma listeleri, anonsları ve aboneliği birlikte gider. Bu işlem geri alınamaz.`,
          onayMetni: 'MARKAYI SİL'
        })) return;
        hedef.disabled = true;
        const { error } = await client.from('brands').delete().eq('id', id);
        if (error) { hedef.disabled = false; return hata('Marka silinemedi: ' + error.message); }
        if (state.openBrand === id) { state.openBrand = null; git('#/markalar'); }
        await yenile(false); bildir('Marka silindi.');
        return;
      }
      case 'playlist-add': {
        const ad = el('playlist-name').value.trim();
        const kaynak = el('playlist-source').value;
        if (!ad) return hata('Liste adı gerekli.');
        let folderId = kaynak;
        if (!folderId) {
          const { data: klasor, error: klasorHata } = await client.from('radio_folders').insert({ name: ad }).select('id').single();
          if (klasorHata) return hata('Klasör oluşturulamadı: ' + klasorHata.message);
          folderId = klasor.id;
        }
        const { data: liste, error } = await client.from('brand_playlists')
          .insert({ brand_id: id, name: ad, folder_id: folderId }).select('id').single();
        if (error) return hata('Liste oluşturulamadı: ' + error.message);
        if (kaynak) {
          const parcalar = D.tracks.filter(t => t.folder_id === kaynak);
          if (parcalar.length) {
            await client.from('brand_playlist_tracks').insert(
              parcalar.map((t, i) => ({ playlist_id: liste.id, track_id: t.id, sort_order: i })));
          }
        }
        await yenile(false);
        bildir(kaynak ? 'Liste oluşturuldu ve parça sırası kopyalandı.' : 'Boş liste oluşturuldu.');
        return;
      }

      // --- çalma listeleri ---
      case 'list-open': git('#/listeler/' + id); return;
      case 'list-del': {
        const pl = D.playlists.find(x => x.id === id);
        if (!await onaySor({
          baslik: 'Liste silinsin mi?',
          govde: `“${pl ? pl.name : 'Liste'}” silinir. Bu listeyi kullanan şubeler yayın bekler duruma geçer.`,
          onayMetni: 'LİSTEYİ SİL'
        })) return;
        const { error } = await client.from('brand_playlists').delete().eq('id', id);
        if (error) return hata('Liste silinemedi: ' + error.message);
        if (state.openPlaylist === id) { state.openPlaylist = null; git('#/listeler'); }
        await yenile(false); bildir('Liste silindi.');
        return;
      }
      case 'list-addtrack': {
        const pl = D.playlists.find(x => x.id === id);
        if (!pl) return;
        const mevcut = D.playlistTracks.filter(x => x.playlist_id === id).map(x => x.track_id);
        const uygun = D.tracks.filter(t => !mevcut.includes(t.id));
        if (!uygun.length) return bildir('Klasörlerdeki bütün parçalar bu listede.');
        pencere({
          baslik: 'Listeye parça ekle',
          onayMetni: 'SEÇİLENLERİ EKLE',
          govde: `
            <div class="field" style="margin-bottom:12px"><label for="sarki-ara">KLASÖRLERDE ARA</label>
              <input id="sarki-ara" placeholder="Parça adı…" autocomplete="off"></div>
            <div class="tick-list" id="sarki-liste">
              ${uygun.map(t => {
                const f = D.folders.find(x => x.id === t.folder_id);
                return `<label data-ara="${esc(V.clean(t.title) + ' ' + (f ? f.name : ''))}">
                  <input type="checkbox" value="${esc(t.id)}">
                  <span><b>${esc(V.clean(t.title))}</b><span class="sub">${esc(f ? f.name : 'klasör silinmiş')} · ${V.mmss(t.duration_sec)}</span></span>
                </label>`;
              }).join('')}
            </div>`,
          onOnay: async () => {
            const secili = Array.from(el('sarki-liste').querySelectorAll('input:checked')).map(i => i.value);
            if (!secili.length) return bildir('Hiç parça seçilmedi.');
            const sira = D.playlistTracks.filter(x => x.playlist_id === id).length;
            const { error } = await client.from('brand_playlist_tracks').insert(
              secili.map((trackId, i) => ({ playlist_id: id, track_id: trackId, sort_order: sira + i })));
            if (error) return hata('Eklenemedi: ' + error.message);
            await yenile(false); bildir(secili.length + ' parça listeye eklendi.');
          }
        });
        el('sarki-ara').oninput = e => {
          const q = e.target.value.toLocaleLowerCase('tr');
          el('sarki-liste').querySelectorAll('label').forEach(l => {
            l.hidden = q && !l.dataset.ara.toLocaleLowerCase('tr').includes(q);
          });
        };
        return;
      }
      case 'ptrack-play': {
        const pl = D.playlists.find(x => x.id === state.openPlaylist);
        if (!pl) return;
        const kayitlar = D.playlistTracks.filter(x => x.playlist_id === pl.id)
          .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
          .map(x => D.tracks.find(t => t.id === x.track_id)).filter(Boolean);
        calmaListesi = kayitlar;
        calmaBaslik = pl.name;
        cal(id ? Math.max(0, kayitlar.findIndex(t => t.id === id)) : 0);
        return;
      }
      case 'ptrack-up': case 'ptrack-down': {
        const yon = act === 'ptrack-up' ? -1 : 1;
        const kayitlar = D.playlistTracks.filter(x => x.playlist_id === state.openPlaylist)
          .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
        const i = kayitlar.findIndex(x => x.id === id);
        const karsi = kayitlar[i + yon];
        if (!karsi) return;
        await Promise.all([
          client.from('brand_playlist_tracks').update({ sort_order: karsi.sort_order }).eq('id', kayitlar[i].id),
          client.from('brand_playlist_tracks').update({ sort_order: kayitlar[i].sort_order }).eq('id', karsi.id)
        ]);
        await yenile(false);
        return;
      }
      case 'ptrack-del': {
        const { error } = await client.from('brand_playlist_tracks').delete().eq('id', id);
        if (error) return hata('Çıkarılamadı: ' + error.message);
        await yenile(false); bildir('Parça listeden çıkarıldı.');
        return;
      }

      // --- abonelikler ---
      case 'ab-extend': {
        const b = marka(id);
        if (!b) return;
        const planSec = document.querySelector(`[data-ab-plan="${id}"]`);
        if (!planSec || !planSec.value) return hata('Önce paket seçin.');
        const subeSayisi = Number(document.querySelector(`[data-ab-sube="${id}"]`)?.value) || 1;
        pencere({
          baslik: 'Abonelik süresi',
          onayMetni: 'KAYDET',
          govde: `
            <p>${esc(b.name)} için süre eklenecek (şube sayısı: ${subeSayisi}).</p>
            <div class="radio-row">
              <label><input type="radio" name="ab-tur" value="active" checked> Aktif / uzat</label>
              <label><input type="radio" name="ab-tur" value="trial"> Deneme</label>
            </div>
            <div class="form-grid">
              <div class="field"><label for="ab-miktar">MİKTAR</label>
                <input id="ab-miktar" type="number" min="1" value="1"></div>
              <div class="field"><label for="ab-birim">BİRİM</label>
                <select id="ab-birim"><option value="ay">ay</option><option value="gun">gün</option><option value="yil">yıl</option></select></div>
            </div>`,
          onOnay: async () => {
            const tur = el('modal').querySelector('input[name="ab-tur"]:checked').value;
            const miktar = Math.max(1, Number(el('ab-miktar').value) || 1);
            const birim = el('ab-birim').value;
            const mevcut = D.subscriptions.find(s => s.brand_id === id);
            const baz = (mevcut && mevcut.status === 'active' && mevcut.current_end && new Date(mevcut.current_end) > new Date())
              ? new Date(mevcut.current_end) : new Date();
            const bitis = sureEkle(baz, miktar, birim).toISOString();
            const alanlar = tur === 'trial'
              ? { status: 'trial', trial_ends_at: bitis, current_start: new Date().toISOString(), current_end: null }
              : { status: 'active', current_end: bitis };
            const { error } = await client.from('subscriptions').upsert({
              brand_id: id, plan_id: planSec.value, branch_count: subeSayisi,
              updated_at: new Date().toISOString(), ...alanlar
            }, { onConflict: 'brand_id' });
            if (error) return hata('Kaydedilemedi: ' + error.message);
            await yenile(false);
            bildir(tur === 'trial' ? 'Deneme süresi başlatıldı.' : 'Abonelik uzatıldı.');
          }
        });
        return;
      }
      case 'ab-cancel':
        if (!await onaySor({ baslik: 'Abonelik iptal edilsin mi?', govde: 'Şubeler yayından düşer; kayıtlar silinmez, süre ekleyerek yeniden açabilirsiniz.', onayMetni: 'İPTAL ET' })) return;
        {
          const { error } = await client.from('subscriptions')
            .update({ status: 'canceled', canceled_at: new Date().toISOString() }).eq('brand_id', id);
          if (error) return hata('İptal edilemedi: ' + error.message);
          await yenile(false); bildir('Abonelik iptal edildi.');
        }
        return;

      // --- talepler ---
      case 'req-convert': {
        const r = (D.requests || []).find(x => x.id === id);
        if (!r) return;
        if (!await onaySor({
          baslik: 'Markaya çevrilsin mi?',
          govde: `“${esc(r.company)}” için marka kaydı açılacak ve başvuru “iletişime geçildi” olarak işaretlenecek.`,
          onayMetni: 'MARKA OLUŞTUR'
        })) return;
        const { data, error } = await client.from('brands')
          .insert({ name: r.company, slug: bosSlug(slugify(r.company)), contact: r.email || null })
          .select('id').single();
        if (error) return hata('Marka oluşturulamadı: ' + error.message);
        await client.from('coffee_requests').update({ status: 'contacted' }).eq('id', id);
        await talepleriYukle();
        await yenile(false); bildir('Marka oluşturuldu, başvuru işaretlendi.');
        git('#/markalar/' + data.id);
        return;
      }
      case 'req-del':
        if (!await onaySor({ baslik: 'Talep silinsin mi?', govde: 'Başvuru kaydı kalıcı olarak silinir.', onayMetni: 'TALEBİ SİL' })) return;
        {
          const { error } = await client.from('coffee_requests').delete().eq('id', id);
          if (error) return hata('Silinemedi: ' + error.message);
          await talepleriYukle(); ciz();
          bildir('Talep silindi.');
        }
        return;
    }
  });

  // Değişiklik olayları (select / saat alanları / dosya seçimi)
  document.addEventListener('change', async e => {
    if (!client) return;
    const hedef = e.target;

    if (hedef.id === 'track-file') {
      const kutu = el('track-drop');
      const adet = hedef.files ? hedef.files.length : 0;
      if (kutu) kutu.classList.toggle('secili', adet > 0);
      if (adet) {
        let toplam = 0, atlanan = 0;
        Array.from(hedef.files).forEach(f => { if (Ses && Ses.gecerli(f)) toplam += f.size; else atlanan++; });
        el('track-msg').textContent = adet + ' dosya seçildi · ' + (Ses ? Ses.boyut(toplam) : '') + (atlanan ? ` · ${atlanan} dosya desteklenmiyor` : '');
      } else if (el('track-msg')) el('track-msg').textContent = '';
      return;
    }

    if (hedef.id === 'cover-file') {
      const dosya = hedef.files && hedef.files[0];
      if (!dosya) return;
      const f = D.folders.find(x => x.id === state.openFolder);
      if (!f) return;
      const yol = `${f.id}/${Date.now()}.${(dosya.name.split('.').pop() || 'jpg').toLowerCase()}`;
      const up = await client.storage.from('radio-covers').upload(yol, dosya, { contentType: dosya.type || 'image/jpeg' });
      if (up.error) return hata('Kapak yüklenemedi: ' + up.error.message);
      const { error } = await client.from('radio_folders').update({ cover_path: yol }).eq('id', f.id);
      if (error) return hata('Kapak kaydedilemedi: ' + error.message);
      await yenile(false); bildir('Kapak güncellendi.');
      return;
    }

    const act = hedef.dataset ? hedef.dataset.act : null;

    if (act === 'live-source') {
      const [tur, deger] = (hedef.value || ':').split(':');
      const { error } = await client.from('brand_broadcast').upsert({
        brand_id: hedef.dataset.id,
        folder_id: tur === 'folder' ? deger : null,
        playlist_id: tur === 'playlist' ? deger : null,
        updated_at: new Date().toISOString()
      }, { onConflict: 'brand_id' });
      if (error) return hata('Yayın güncellenemedi: ' + error.message);
      await yenile(false);
      bildir(deger ? 'Canlı yayın güncellendi.' : 'Yayın durduruldu.');
      return;
    }

    if (act === 'req-status') {
      const { error } = await client.from('coffee_requests').update({ status: hedef.value }).eq('id', hedef.dataset.id);
      if (error) return hata('Durum güncellenemedi: ' + error.message);
      const kayit = (D.requests || []).find(r => r.id === hedef.dataset.id);
      if (kayit) kayit.status = hedef.value;
      bildir('Talep durumu güncellendi.');
      return;
    }

    if (hedef.dataset && hedef.dataset.hours) {
      const alan = hedef.dataset.hours === 'open' ? 'open_time' : 'close_time';
      const { error } = await client.from('brand_players')
        .update({ [alan]: hedef.value || null }).eq('id', hedef.dataset.player);
      if (error) return hata('Saat güncellenemedi: ' + error.message);
      const kayit = D.players.find(p => p.id === hedef.dataset.player);
      if (kayit) kayit[alan] = hedef.value || null;
      bildir('Yayın saati güncellendi.');
      return;
    }
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { pencereKapat(); cekmeceKapat(); }
  });
  el('backdrop').onclick = cekmeceKapat;
  el('search').addEventListener('input', e => {
    if (!client) return;
    state.q = e.target.value;
    const g = V.gorunum(state, D, ui);
    el('view').innerHTML = g.html;
    satirSuruklemeBagla();
  });

  function sureEkle(tarih, miktar, birim) {
    const d = new Date(tarih);
    if (birim === 'yil') d.setFullYear(d.getFullYear() + miktar);
    else if (birim === 'ay') d.setMonth(d.getMonth() + miktar);
    else d.setDate(d.getDate() + miktar);
    return d;
  }

  function bosSlug(temel) {
    let slug = temel || 'marka';
    let ek = 2;
    while (D.brands.some(b => b.slug === slug)) { slug = (temel || 'marka') + '-' + ek; ek++; }
    return slug;
  }

  window.addEventListener('hashchange', () => { uygula().catch(err => hata('Sayfa yüklenemedi: ' + err.message)); });
  basla().catch(err => kapi('Panel yüklenemedi', err.message, null, null));
})();
