// Radyo paneli görünüm katmanı — saf fonksiyonlar (veri girer, HTML çıkar).
//
// NEDEN AYRI DOSYA
// Eski panelde ekranların HTML'i ile Supabase çağrıları aynı fonksiyonun içinde
// iç içeydi; bu yüzden bir tablonun sırasını değiştirmek veri katmanına dokunmayı
// gerektiriyordu ve görünümler test edilemiyordu. Burada görünümler yalnızca
// veriyi alıp HTML döndürür; hiçbir ağ çağrısı, hiçbir global durum yoktur.
// Böylece Node testleri (tests/radio-panel-views.test.js) aynı fonksiyonları
// çağırıp gerçek çıktıyı doğrulayabilir ve prova sayfası üretimle birebir aynı
// HTML'i çizebilir.
//
// KURAL: kullanıcıdan gelen her değer esc() ile kaçırılır; hiçbir yerde ham
// string şablona gömülmez.
(function () {
  const esc = v => String(v == null ? '' : v)
    .replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // Depodaki adlar URL kodlanmış olabilir ("%C3%9Csk%C3%BCdar.mp3").
  const clean = n => { try { return decodeURIComponent(n); } catch (e) { return n; } };

  const hhmm = t => (t ? String(t).slice(0, 5) : '');
  const mmss = s => (!s || !isFinite(s)) ? '—' : Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');
  const tarih = v => v ? new Date(v).toLocaleString('tr-TR') : '—';
  const tarihKisa = v => v ? new Date(v).toLocaleDateString('tr-TR') : '—';

  // Arama: satır görünür kalsın mı? (q boşsa hepsi görünür)
  const hit = (q, ...parcalar) => !q || parcalar.join(' ').toLocaleLowerCase('tr').includes(q);
  const norm = v => String(v == null ? '' : v).trim().toLocaleLowerCase('tr');

  const AYLAR = 'Ocak Şubat Mart Nisan Mayıs Haziran Temmuz Ağustos Eylül Ekim Kasım Aralık'.split(' ');
  const uzunTarih = v => {
    if (!v) return '—';
    const d = new Date(v);
    return d.getDate() + ' ' + AYLAR[d.getMonth()] + ' ' + d.getFullYear();
  };

  // Cihaz bağlantısı 150 saniyeden eskiyse "bağlı değil" sayılır (oynatıcı
  // 60 saniyede bir nabız gönderiyor).
  const canliMi = (p, now) => !!(p.last_seen_at && now - new Date(p.last_seen_at).getTime() < 150000);

  const chip = (tip, metin, ikon) => `<span class="chip ${tip}">${ikon ? '<i></i>' : ''}${esc(metin)}</span>`;
  const bagliChip = (p, now) => canliMi(p, now)
    ? chip('live', 'BAĞLI', true)
    : chip('off', 'ÇEVRİMDIŞI');
  const caliyorChip = (p, now) => (p.is_playing && canliMi(p, now)) ? chip('live', '▶ ÇALIYOR', true) : '';
  const kilitChip = p => p.bound_device_id ? chip('lock', 'KİLİTLİ') : chip('off', 'serbest');
  const bos = (kolon, metin) => `<tr><td colspan="${kolon}"><div class="empty">${esc(metin)}</div></td></tr>`;

  // ---------- Marka yayın kaynağı ----------
  // Markanın o an ne çaldığı brand_broadcast kaydında tutulur: ya bir klasör
  // ya da markaya özel bir çalma listesi.
  function kaynak(D, brandId) {
    const b = D.broadcast.find(x => x.brand_id === brandId);
    if (!b) return { tip: null, ad: null, kayit: null };
    if (b.playlist_id) {
      const pl = D.playlists.find(p => p.id === b.playlist_id);
      return { tip: 'liste', ad: pl ? pl.name : 'Silinmiş liste', kayit: b };
    }
    if (b.folder_id) {
      const f = D.folders.find(x => x.id === b.folder_id);
      return { tip: 'klasör', ad: f ? f.name : 'Silinmiş klasör', kayit: b };
    }
    return { tip: null, ad: null, kayit: b };
  }

  const kapakYolu = (path, ui) => (path ? ui.cover(path) : null);

  function kapakHucre(path, ui, yedek, ekSinif) {
    const url = kapakYolu(path, ui);
    return url
      ? `<span class="cover ${ekSinif || ''}"><img src="${esc(url)}" alt="" loading="lazy"></span>`
      : `<span class="cover ${ekSinif || ''}">${yedek || '♪'}</span>`;
  }

  // ---------- Yan menü ----------
  function nav(state, counts, kullanici) {
    const oge = (nav, sub, baslik, alt, sayi, ikon) => `
      <button class="nav-item${state.nav === nav && state.sub === sub ? ' active' : ''}"
        data-nav="${nav}" data-sub="${sub}" type="button">
        ${ikon}<span>${esc(baslik)}<small>${esc(alt)}</small></span>
        ${sayi != null ? `<span class="say">${esc(sayi)}</span>` : ''}
      </button>`;
    const ikonlar = {
      canli: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="2.6"/><path d="M6.2 6.2a8 8 0 000 11.6M17.8 17.8a8 8 0 000-11.6"/></svg>',
      klasor: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M9 18V6l10-2v12"/><circle cx="6" cy="18" r="3"/><circle cx="16" cy="16" r="3"/></svg>',
      anons: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0014 0M12 18v3"/></svg>',
      marka: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M20.6 13.4l-7.2 7.2a2 2 0 01-2.8 0l-7.2-7.2A2 2 0 013 12V4h8a2 2 0 011.4.6l7.2 7.2a2 2 0 010 1.6z"/><circle cx="7.5" cy="7.5" r="1.2"/></svg>',
      liste: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 6h16M4 12h10M4 18h7"/></svg>',
      abonelik: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="2.5" y="5" width="19" height="14" rx="3"/><path d="M2.5 10h19"/></svg>',
      talep: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M3 7l9 6 9-6"/><rect x="3" y="5" width="18" height="14" rx="3"/></svg>'
    };
    return `
      <div class="brand">
        <span class="dot"></span>
        <div><b>DERİN RECORD</b><span>RADYO KONTROLÜ</span></div>
      </div>
      <nav class="nav">
        <div class="nav-title">GÜNLÜK</div>
        ${oge('canli', 'subeler', 'Canlı durum', 'Şubeler ve anons', counts.players, ikonlar.canli)}

        <div class="nav-title">İÇERİK</div>
        ${oge('icerik', 'klasorler', 'Yayın klasörleri', 'Parçalar, sıra, kapak', counts.folders, ikonlar.klasor)}
        ${oge('icerik', 'anonslar', 'Anonslar', 'Mikrofon kayıtları', counts.announcements, ikonlar.anons)}

        <div class="nav-title">MÜŞTERİ</div>
        ${oge('musteri', 'markalar', 'Markalar', 'Şubeler ve listeler', counts.brands, ikonlar.marka)}
        ${oge('musteri', 'listeler', 'Çalma listeleri', 'Marka akışları', counts.playlists, ikonlar.liste)}
        ${oge('musteri', 'abonelikler', 'Abonelikler', 'Paket ve süreler', null, ikonlar.abonelik)}
        ${oge('musteri', 'talepler', 'Talepler', 'Gelen başvurular', counts.requests, ikonlar.talep)}
      </nav>
      <div class="rail-foot">
        <div class="who"><i>${esc((kullanici && kullanici.basHarf) || 'DR')}</i>
          <div><b>${esc((kullanici && kullanici.ad) || 'Yönetici')}</b><small>${esc((kullanici && kullanici.alt) || '')}</small></div></div>
        <button class="btn sm" data-act="cikis" type="button">ÇIKIŞ YAP</button>
        <a class="btn sm" href="index.html">SİTEYE DÖN</a>
      </div>`;
  }

  const BASLIKLAR = {
    'canli/subeler': ['Canlı durum', 'Şubelerin bağlantısı, o an çalan akış ve cihaz kilidi'],
    'icerik/klasorler': ['Yayın klasörleri', 'Parçaları yükle, sırala, kapağı değiştir'],
    'icerik/anonslar': ['Anonslar', 'Mikrofonla kaydedilen duyurular'],
    'musteri/markalar': ['Markalar', 'Şubeler, yayın linkleri ve çalma listeleri'],
    'musteri/listeler': ['Çalma listeleri', 'Markalara özel akış sıraları'],
    'musteri/abonelikler': ['Abonelikler', 'Paketler, deneme ve lisans süreleri'],
    'musteri/talepler': ['Talepler', 'Kahve markalarından gelen başvurular']
  };
  const ALT_SEKME = { klasorler: 'Yayın klasörleri', anonslar: 'Anonslar' };

  function topbar(state, D, now) {
    const anahtar = state.nav + '/' + state.sub;
    const bas = BASLIKLAR[anahtar] || ['Radyo kontrolü', ''];
    const caliyor = D.players.filter(p => p.is_playing && canliMi(p, now)).length;
    const bagli = D.players.filter(p => canliMi(p, now)).length;
    return {
      baslik: bas[0],
      alt: bas[1] + (state.sub === 'subeler' ? ` · ${bagli}/${D.players.length} şube bağlı` : ''),
      canli: caliyor
    };
  }

  // ---------- CANLI DURUM ----------
  function canliView(state, D, ui) {
    const now = ui.now();
    const q = norm(state.q);
    const yayinda = D.broadcast.filter(b => b.folder_id || b.playlist_id).length;
    const bagli = D.players.filter(p => canliMi(p, now)).length;
    const caliyor = D.players.filter(p => p.is_playing && canliMi(p, now)).length;
    const kilitli = D.players.filter(p => p.bound_device_id).length;

    const satirlar = D.players
      .filter(p => {
        const marka = D.brands.find(b => b.id === p.brand_id);
        const k = kaynak(D, p.brand_id);
        return hit(q, p.label, marka ? marka.name : '', k.ad || '');
      })
      .sort((a, b) => (a.label || '').localeCompare(b.label || '', 'tr'))
      .map(p => {
        const marka = D.brands.find(b => b.id === p.brand_id);
        const k = kaynak(D, p.brand_id);
        return `<tr class="selectable" data-act="branch-open" data-id="${esc(p.id)}">
          <td><div class="cell-main"><span class="cover">📻</span><span><b>${esc(p.label)}</b>
            <span class="sub">${esc(marka ? marka.name : '—')}</span></span></div></td>
          <td class="tight">${bagliChip(p, now)}</td>
          <td>${k.ad ? esc(k.ad) : '<span class="sub">yayın atanmadı</span>'}
            <span class="sub">${caliyorChip(p, now) || (canliMi(p, now) ? 'bekliyor' : '')}</span></td>
          <td class="tight">${esc(hhmm(p.open_time) || '—')}–${esc(hhmm(p.close_time) || '—')}</td>
          <td class="tight">${kilitChip(p)}</td>
          <td><div class="row-actions">
            <button class="btn sm" data-act="player-copy" data-id="${esc(p.id)}" type="button">LİNK</button>
            <button class="btn sm" data-act="branch-open" data-id="${esc(p.id)}" type="button">YÖNET ›</button>
          </div></td>
        </tr>`;
      }).join('');

    return `
      <div class="tiles">
        <div class="tile gold"><span>YAYINDA</span><b>${yayinda}</b><small>markaya akış atanmış</small></div>
        <div class="tile"><span>ŞUBE</span><b>${D.players.length}</b><small>${bagli} bağlı · ${D.players.length - bagli} çevrimdışı</small></div>
        <div class="tile"><span>ŞU AN ÇALIYOR</span><b>${caliyor}</b><small>canlı yayında</small></div>
        <div class="tile"><span>KİLİTLİ CİHAZ</span><b>${kilitli}</b><small>başka cihazda açılamaz</small></div>
      </div>
      <div class="panel">
        <h3>ŞUBELER (${D.players.length})</h3>
        <table>
          <thead><tr><th>ŞUBE</th><th>DURUM</th><th>ŞU AN ÇALAN</th><th>SAAT</th><th>CİHAZ</th><th></th></tr></thead>
          <tbody>${satirlar || bos(6, 'Eşleşen şube yok.')}</tbody>
        </table>
      </div>`;
  }

  // ---------- YAYIN KLASÖRLERİ ----------
  function klasorListesi(state, D, ui) {
    const q = norm(state.q);
    const now = ui.now();
    const satirlar = D.folders.filter(f => hit(q, f.name, f.description)).map(f => {
      const adet = D.tracks.filter(t => t.folder_id === f.id).length;
      const yayinda = D.broadcast.some(b => b.folder_id === f.id);
      return `<tr class="selectable" data-act="folder-open" data-id="${esc(f.id)}">
        <td><div class="cell-main">${kapakHucre(f.cover_path, ui, '🎵', 'gold')}
          <span><b>${esc(f.name)}</b><span class="sub">${esc(f.description || 'açıklama yok')}</span></span></div></td>
        <td class="tight">${adet} parça</td>
        <td class="tight">${yayinda ? chip('live', 'YAYINDA', true) : chip('off', 'beklemede')}</td>
        <td class="tight">${f.shuffle === false ? '<span class="sub">sırayla</span>' : '<span class="sub">karışık</span>'}</td>
        <td><div class="row-actions">
          <button class="btn sm" data-act="folder-open" data-id="${esc(f.id)}" type="button">AÇ ›</button>
          <button class="btn sm danger" data-act="folder-del" data-id="${esc(f.id)}" type="button">SİL</button>
        </div></td>
      </tr>`;
    }).join('');

    return `
      <div class="panel" style="margin-bottom:18px">
        <h3>YENİ KLASÖR</h3>
        <div class="form-grid">
          <div class="field"><label for="folder-name">AD</label>
            <input id="folder-name" placeholder="Örn. Öğle Arası — Caz" autocomplete="off"></div>
          <div class="field"><label for="folder-desc">AÇIKLAMA</label>
            <input id="folder-desc" placeholder="İsteğe bağlı" autocomplete="off"></div>
          <button class="btn primary" data-act="folder-add" type="button">KLASÖR OLUŞTUR</button>
        </div>
      </div>
      <div class="panel">
        <h3>YAYIN KLASÖRLERİ (${D.folders.length})</h3>
        <table>
          <thead><tr><th>KLASÖR</th><th>İÇERİK</th><th>DURUM</th><th>ÇALMA</th><th></th></tr></thead>
          <tbody>${satirlar || bos(5, 'Henüz klasör yok. Yukarıdan ilk klasörü oluştur.')}</tbody>
        </table>
      </div>`;
  }

  function klasorDetay(state, D, ui) {
    const f = D.folders.find(x => x.id === state.openFolder);
    if (!f) return klasorListesi(state, D, ui);
    const q = norm(state.q);
    const liste = D.tracks.filter(t => t.folder_id === f.id)
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    const toplam = liste.reduce((s, t) => s + (Number(t.duration_sec) || 0), 0);
    const gorunen = liste.filter(t => hit(q, clean(t.title)));

    const satirlar = gorunen.map((t, i) => `<tr draggable="true" data-act="track-open"
        data-id="${esc(t.id)}" data-idx="${i}" data-sira="${esc(t.sort_order == null ? '' : t.sort_order)}">
      <td class="no">${String(liste.indexOf(t) + 1).padStart(2, '0')}</td>
      <td class="tight"><span class="drag" title="Sürükleyerek sırala">⋮⋮</span></td>
      <td><div class="cell-main"><span class="cover">${t.cover_path
        ? `<img src="${esc(kapakYolu(t.cover_path, ui))}" alt="" loading="lazy">` : '♪'}</span>
        <span><b>${esc(clean(t.title))}</b><span class="sub">${esc(t.storage_path)}</span></span></div></td>
      <td class="tight">${mmss(t.duration_sec)}</td>
      <td><div class="row-actions">
        <button class="btn sm" data-act="track-play" data-id="${esc(t.id)}" type="button">DİNLE</button>
        <button class="btn sm" data-act="track-rename" data-id="${esc(t.id)}" type="button">AD</button>
        <button class="btn sm" data-act="track-img" data-id="${esc(t.id)}" type="button">RESİM</button>
        <button class="btn sm" data-act="track-move" data-id="${esc(t.id)}" type="button">TAŞI</button>
        <button class="btn sm danger" data-act="track-del" data-id="${esc(t.id)}"
          data-path="${esc(t.storage_path)}" type="button">SİL</button>
      </div></td>
    </tr>`).join('');

    return `
      ${geriCubugu('klasorler', 'KLASÖRLERE DÖN', [f.name, liste.length + ' parça' + (toplam ? ' · ' + Math.round(toplam / 60) + ' dk' : '')])}
      <div class="panel" style="margin-bottom:18px">
        <h3>PARÇA YÜKLE</h3>
        <label class="drop" id="track-drop" for="track-file">
          <b>PARÇA YÜKLE — dosyayı buraya bırak veya seç</b>
          <small>${esc(ui.desteklenenler())} · ${esc(ui.parcaNotu())}</small>
          <input id="track-file" type="file" multiple accept="${esc(ui.accept())}">
        </label>
        <div class="row" style="margin-top:14px">
          <button class="btn primary" data-act="track-upload" type="button">YÜKLE</button>
          <span class="sub" id="track-msg"></span>
        </div>
        <div class="progress" id="up-bar" hidden><i></i></div>
      </div>
      <div class="panel" style="margin-bottom:18px">
        <h3>PARÇALAR (${liste.length})</h3>
        <table>
          <thead><tr><th>#</th><th></th><th>PARÇA</th><th>SÜRE</th><th></th></tr></thead>
          <tbody>${satirlar || bos(5, liste.length ? 'Aramayla eşleşen parça yok.' : 'Bu klasörde henüz parça yok.')}</tbody>
        </table>
        ${liste.length > 1 ? '<p class="panel-sub" style="margin:12px 0 0">Sırayı ⋮⋮ tutamacından sürükleyerek ya da dokunarak değiştirebilirsin.</p>' : ''}
      </div>
      <div class="panel">
        <h3>KLASÖR AYARLARI</h3>
        <div class="form-grid">
          <div class="field"><label for="f-name">KLASÖR ADI</label>
            <input id="f-name" value="${esc(f.name)}" autocomplete="off"></div>
          <button class="btn" data-act="folder-rename" type="button">ADI KAYDET</button>
          <div class="field"><label for="cover-file">KAPAK GÖRSELİ</label>
            <input id="cover-file" type="file" accept="image/*"></div>
          ${f.cover_path ? '<button class="btn" data-act="cover-del" type="button">KAPAĞI SİL</button>' : ''}
          <button class="btn" data-act="folder-shuffle" type="button">${f.shuffle === false ? 'KARIŞIK ÇALMAYA GEÇ' : 'SIRAYLA ÇALMAYA GEÇ'}</button>
        </div>
        <hr class="divider">
        <div class="row">
          <button class="btn danger" data-act="folder-del" data-id="${esc(f.id)}" type="button">KLASÖRÜ SİL</button>
          <span class="sub">Klasör ve içindeki parça kayıtları silinir; ses dosyaları depoda temizlenir.</span>
        </div>
        <span class="sub" id="f-msg"></span>
      </div>`;
  }

  // ---------- ANONSLAR ----------
  function anonsListesi(state, D, ui) {
    const q = norm(state.q);
    const satirlar = D.announcements
      .filter(a => {
        const b = D.brands.find(x => x.id === a.brand_id);
        return hit(q, a.label, b ? b.name : '');
      })
      .map(a => {
        const b = D.brands.find(x => x.id === a.brand_id);
        return `<tr>
          <td><div class="cell-main"><span class="cover">🎙</span><span><b>${esc(a.label || 'Anons')}</b>
            <span class="sub">${esc(b ? b.name : '—')} · ${esc(tarih(a.created_at))}</span></span></div></td>
          <td><div class="row-actions">
            <button class="btn sm" data-act="anons-play" data-path="${esc(a.storage_path)}" type="button">DİNLE</button>
            <button class="btn sm danger" data-act="anons-del" data-id="${esc(a.id)}"
              data-path="${esc(a.storage_path)}" type="button">SİL</button>
          </div></td>
        </tr>`;
      }).join('');

    return `
      <div class="panel" style="margin-bottom:18px">
        <h3>YENİ ANONS</h3>
        <p class="panel-sub">Markayı seç, kaydı başlat ve bitir; anons markanın bütün şubelerine gönderilir.</p>
        <div class="form-grid">
          <div class="field"><label for="anons-brand">MARKA</label>
            <select id="anons-brand"><option value="">Marka seçin</option>
              ${D.brands.map(b => `<option value="${esc(b.id)}">${esc(b.name)}</option>`).join('')}</select></div>
          <div class="field"><label for="anons-label">NOT</label>
            <input id="anons-label" placeholder="Örn. Kampanya duyurusu" autocomplete="off"></div>
          <button class="btn primary" data-act="mic" type="button" id="anons-rec">🎙 MİKROFONU AÇ</button>
        </div>
        <span class="sub" id="anons-msg"></span>
      </div>
      <div class="panel">
        <h3>KAYITLAR (${D.announcements.length})</h3>
        <table><tbody>${satirlar || bos(2, 'Henüz anons kaydı yok.')}</tbody></table>
      </div>`;
  }

  // ---------- MARKALAR ----------
  function markaListesi(state, D, ui) {
    const q = norm(state.q);
    const now = ui.now();
    const satirlar = D.brands
      .filter(b => hit(q, b.name))
      .map(b => {
        const k = kaynak(D, b.id);
        const subeler = D.players.filter(p => p.brand_id === b.id);
        const listeler = D.playlists.filter(p => p.brand_id === b.id);
        const canli = subeler.some(p => p.is_playing && canliMi(p, now));
        const ab = D.subscriptions.find(s => s.brand_id === b.id);
        const paket = ab ? D.plans.find(p => p.id === ab.plan_id) : null;
        return `<tr class="selectable" data-act="brand-open" data-id="${esc(b.id)}">
          <td><div class="cell-main"><span class="cover gold">🏷</span><span><b>${esc(b.name)}</b>
            <span class="sub">${listeler.length} çalma listesi · ${esc(k.ad || 'yayın atanmadı')}</span></span></div></td>
          <td class="tight">${subeler.length} şube</td>
          <td class="tight">${ab
            ? chip(ab.status === 'trial' ? 'gold' : (ab.status === 'active' ? 'live' : 'danger'),
                ((paket && paket.name) || 'paket'), ab.status === 'active')
            : chip('off', 'abonelik yok')}</td>
          <td class="tight">${esc(abonelikBitis(ab) ? uzunTarih(abonelikBitis(ab)) : '—')}</td>
          <td class="tight">${canli ? chip('live', '▶ CANLI', true) : (k.ad ? chip('gold', 'YAYINDA') : chip('off', 'kapalı'))}</td>
          <td><div class="row-actions">
            <button class="btn sm" data-act="brand-open" data-id="${esc(b.id)}" type="button">AÇ ›</button>
          </div></td>
        </tr>`;
      }).join('');

    return `
      <div class="panel" style="margin-bottom:18px">
        <h3>YENİ MARKA</h3>
        <div class="form-grid">
          <div class="field"><label for="brand-name">MARKA ADI</label>
            <input id="brand-name" placeholder="Örn. Kahve Dünyası" autocomplete="off"></div>
          <div class="field"><label for="brand-contact">İLETİŞİM</label>
            <input id="brand-contact" placeholder="İsteğe bağlı" autocomplete="off"></div>
          <button class="btn primary" data-act="brand-add" type="button">MARKA OLUŞTUR</button>
        </div>
        <span class="sub" id="brand-msg"></span>
      </div>
      <div class="panel">
        <h3>MARKALAR (${D.brands.length})</h3>
        <table>
          <thead><tr><th>MARKA</th><th>ŞUBE</th><th>PAKET</th><th>BİTİŞ</th><th>YAYIN</th><th></th></tr></thead>
          <tbody>${satirlar || bos(6, 'Henüz marka yok.')}</tbody>
        </table>
      </div>`;
  }

  function markaDetay(state, D, ui) {
    const b = D.brands.find(x => x.id === state.openBrand);
    if (!b) return markaListesi(state, D, ui);
    const now = ui.now();
    const q = norm(state.q);
    const k = kaynak(D, b.id);
    const subeler = D.players.filter(p => p.brand_id === b.id);
    const listeler = D.playlists.filter(p => p.brand_id === b.id);
    const anonslar = D.announcements.filter(a => a.brand_id === b.id);
    const denemeler = D.coffeeAttempts.filter(a => a.brand_id === b.id).slice(0, 8);
    const sonBasarisiz = D.coffeeAttempts.filter(a => a.brand_id === b.id && !a.success
      && (now - new Date(a.created_at).getTime()) < 86400000).length;
    const secili = k.tip === 'liste' ? 'playlist:' + k.kayit.playlist_id : (k.tip === 'klasör' ? 'folder:' + k.kayit.folder_id : '');

    const subeSatirlari = subeler
      .filter(p => hit(q, p.label, p.player_key))
      .map(p => `<tr class="selectable" data-act="branch-open" data-id="${esc(p.id)}">
        <td><b>${esc(p.label)}</b><span class="sub">${esc(p.player_key)}</span></td>
        <td class="tight">${bagliChip(p, now)}</td>
        <td class="tight">${p.last_seen_at ? esc(tarih(p.last_seen_at)) : 'hiç bağlanmadı'}</td>
        <td class="tight">${kilitChip(p)}</td>
        <td><div class="row-actions">
          <button class="btn sm" data-act="player-copy" data-id="${esc(p.id)}" type="button">LİNK</button>
          <button class="btn sm" data-act="branch-open" data-id="${esc(p.id)}" type="button">YÖNET ›</button>
        </div></td>
      </tr>`).join('');

    const listeSatirlari = listeler.map(pl => {
      const adet = D.playlistTracks.filter(x => x.playlist_id === pl.id).length;
      const kullanan = D.broadcast.filter(x => x.playlist_id === pl.id).length;
      return `<tr class="selectable" data-act="list-open" data-id="${esc(pl.id)}">
        <td><b>${esc(pl.name)}</b><span class="sub">${esc(pl.description || 'açıklama yok')}</span></td>
        <td class="tight">${adet} parça</td>
        <td class="tight">${kullanan ? chip('live', 'YAYINDA', true) : chip('off', 'kullanılmıyor')}</td>
        <td><div class="row-actions">
          <button class="btn sm" data-act="list-open" data-id="${esc(pl.id)}" type="button">AÇ ›</button>
          <button class="btn sm danger" data-act="list-del" data-id="${esc(pl.id)}" type="button">SİL</button>
        </div></td>
      </tr>`;
    }).join('');

    const anonsSatirlari = anonslar.map(a => `<tr>
      <td><b>${esc(a.label || 'Anons')}</b><span class="sub">${esc(tarih(a.created_at))}</span></td>
      <td><div class="row-actions">
        <button class="btn sm" data-act="anons-play" data-path="${esc(a.storage_path)}" type="button">DİNLE</button>
        <button class="btn sm danger" data-act="anons-del" data-id="${esc(a.id)}"
          data-path="${esc(a.storage_path)}" type="button">SİL</button>
      </div></td>
    </tr>`).join('');

    const denemeSatirlari = denemeler.map(a => `<tr>
      <td class="tight">${a.success ? chip('live', 'DOĞRU KOD', true) : chip('danger', 'YANLIŞ KOD')}</td>
      <td class="tight">${esc(tarih(a.created_at))}</td>
      <td class="tight"><span class="sub">${a.ip ? esc(a.ip) : '—'}</span></td>
    </tr>`).join('');

    return `
      ${geriCubugu('markalar', 'MARKALARA DÖN', [b.name,
        subeler.length + ' şube · ' + listeler.length + ' liste',
        k.ad || 'yayın atanmadı'])}
      <div class="panel" style="margin-bottom:18px">
        <h3>CANLI YAYIN</h3>
        <p class="panel-sub">Markanın bütün şubeleri bu akışı çalar. Kapalıysa şubeler yayın bekler.</p>
        <div class="form-grid">
          <div class="field"><label for="live-source">YAYIN KAYNAĞI</label>
            <select id="live-source" data-act="live-source" data-id="${esc(b.id)}">
              <option value="">— yayını durdur —</option>
              <optgroup label="Yayın klasörleri">
                ${D.folders.map(f => `<option value="folder:${esc(f.id)}"${secili === 'folder:' + f.id ? ' selected' : ''}>${esc(f.name)}</option>`).join('')}
              </optgroup>
              <optgroup label="${esc(b.name)} listeleri">
                ${listeler.map(pl => `<option value="playlist:${esc(pl.id)}"${secili === 'playlist:' + pl.id ? ' selected' : ''}>${esc(pl.name)}</option>`).join('')}
              </optgroup>
            </select></div>
          <div class="row" style="align-self:end">
            ${k.tip === 'liste' ? chip('live', 'AKTİF LİSTE', true) : (k.tip ? chip('gold', 'AKTİF KLASÖR') : chip('off', 'YAYIN KAPALI'))}
          </div>
        </div>
        <span class="sub" id="live-msg"></span>
      </div>

      <div class="panel" style="margin-bottom:18px">
        <h3>MÜŞTERİ SUNUMU — LİNK VE ERİŞİM KODU</h3>
        <p class="panel-sub">Markaya verdiğin link ve kod ile sunum sayfasını yalnızca müşteri açabilir.</p>
        <div class="form-grid">
          <div class="field"><label for="brand-slug">LİNK ADI</label>
            <input id="brand-slug" value="${esc(b.slug || '')}" placeholder="link-adi" autocomplete="off"></div>
          <button class="btn" data-act="brand-slug-set" data-id="${esc(b.id)}" type="button">LİNK ADINI KAYDET</button>
          <div class="field"><label for="brand-code">ERİŞİM KODU</label>
            <input id="brand-code" value="${esc(b.access_code || '')}" placeholder="Örn. KAHVE2026" autocomplete="off"></div>
          <button class="btn" data-act="brand-code-set" data-id="${esc(b.id)}" type="button">${b.access_code ? 'KODU GÜNCELLE' : 'KODU KAYDET'}</button>
        </div>
        <span class="sub" id="brand-slug-msg">${b.access_code
          ? 'Kodu değiştirirsen markanın eski kodu ve linki çalışmaz olur.'
          : 'Bu markanın henüz erişim kodu yok.'}</span>
        <hr class="divider">
        <div class="row">
          <span class="key">${esc(ui.brandUrl(b.slug))}</span>
          <button class="btn sm" data-act="copy" data-copy="${esc(ui.brandUrl(b.slug))}" type="button">LİNKİ KOPYALA</button>
          <a class="btn sm" href="${esc(ui.brandUrl(b.slug))}" target="_blank" rel="noopener">SUNUMU AÇ ↗</a>
          ${b.access_code ? `<button class="btn sm" data-act="copy" data-copy="${esc(b.access_code)}" type="button">KODU KOPYALA</button>` : ''}
        </div>
      </div>

      <div class="panel" style="margin-bottom:18px">
        <h3>ŞUBELER (${subeler.length})</h3>
        <table>
          <thead><tr><th>ŞUBE</th><th>DURUM</th><th>SON BAĞLANTI</th><th>CİHAZ</th><th></th></tr></thead>
          <tbody>${subeSatirlari || bos(5, subeler.length ? 'Aramayla eşleşen şube yok.' : 'Bu markanın henüz şubesi yok.')}</tbody>
        </table>
        <hr class="divider">
        <div class="form-grid">
          <div class="field"><label for="p-label">YENİ ŞUBE ADI</label>
            <input id="p-label" placeholder="Örn. Alsancak" autocomplete="off"></div>
          <div class="field"><label for="p-open">AÇILIŞ</label><input id="p-open" type="time"></div>
          <div class="field"><label for="p-close">KAPANIŞ</label><input id="p-close" type="time"></div>
          <button class="btn primary" data-act="player-add" data-id="${esc(b.id)}" type="button">ŞUBE EKLE</button>
        </div>
        <span class="sub" id="p-msg">Saat boş bırakılırsa yayın kesintisiz sürer.</span>
      </div>

      <div class="panel" style="margin-bottom:18px">
        <h3>ÇALMA LİSTELERİ (${listeler.length})</h3>
        <p class="panel-sub">Listedeki değişiklikler yalnızca bu markayı etkiler; genel klasörler değişmez.</p>
        <table>
          <thead><tr><th>LİSTE</th><th>PARÇA</th><th>DURUM</th><th></th></tr></thead>
          <tbody>${listeSatirlari || bos(4, 'Bu markanın henüz çalma listesi yok.')}</tbody>
        </table>
        <hr class="divider">
        <div class="form-grid">
          <div class="field"><label for="playlist-name">YENİ LİSTE ADI</label>
            <input id="playlist-name" placeholder="Örn. Akşam Akışı" autocomplete="off"></div>
          <div class="field"><label for="playlist-source">KAYNAK KLASÖR</label>
            <select id="playlist-source"><option value="">Boş liste oluştur</option>
              ${D.folders.map(f => `<option value="${esc(f.id)}">${esc(f.name)} klasöründen kopyala</option>`).join('')}</select></div>
          <button class="btn primary" data-act="playlist-add" data-id="${esc(b.id)}" type="button">LİSTE OLUŞTUR</button>
        </div>
        <span class="sub" id="playlist-msg">Kaynak klasör seçilirse parçalar bu markaya özel sırayla kopyalanır.</span>
      </div>

      <div class="panel" style="margin-bottom:18px">
        <h3>ANONS GEÇMİŞİ (${anonslar.length})</h3>
        <table><tbody>${anonsSatirlari || bos(2, 'Bu markaya henüz anons gönderilmedi.')}</tbody></table>
        <div class="row" style="margin-top:14px">
          <button class="btn" data-act="mic" data-id="${esc(b.id)}" type="button">🎙 MİKROFONU AÇ</button>
          <span class="sub">Anons, markanın bütün şubelerinde çalan akışın önüne girer.</span>
        </div>
      </div>

      <div class="panel" style="margin-bottom:18px">
        <h3>SUNUM GİRİŞ DENEMELERİ${sonBasarisiz ? ` · son 24 saatte ${sonBasarisiz} başarısız` : ''}</h3>
        <table><tbody>${denemeSatirlari || bos(3, 'Bu markanın sunum sayfasına giriş denemesi olmadı.')}</tbody></table>
      </div>

      <div class="panel">
        <h3>BAKIM</h3>
        <div class="row">
          <button class="btn danger" data-act="brand-del" data-id="${esc(b.id)}" type="button">MARKAYI SİL</button>
          <span class="sub">Şubeler, yayın linkleri, çalma listeleri ve abonelik birlikte silinir. Geri alınamaz.</span>
        </div>
      </div>`;
  }

  // ---------- ÇALMA LİSTELERİ ----------
  function listeListesi(state, D, ui) {
    const q = norm(state.q);
    const satirlar = D.playlists
      .filter(pl => {
        const b = D.brands.find(x => x.id === pl.brand_id);
        return hit(q, pl.name, b ? b.name : '');
      })
      .map(pl => {
        const b = D.brands.find(x => x.id === pl.brand_id);
        const adet = D.playlistTracks.filter(x => x.playlist_id === pl.id).length;
        const kullanan = D.broadcast.filter(x => x.playlist_id === pl.id).length;
        return `<tr class="selectable" data-act="list-open" data-id="${esc(pl.id)}">
          <td><div class="cell-main"><span class="cover">🎧</span><span><b>${esc(pl.name)}</b>
            <span class="sub">${esc(pl.description || uzunTarih(pl.created_at) + ' tarihinde oluşturuldu')}</span></span></div></td>
          <td class="tight">${esc(b ? b.name : '—')}</td>
          <td class="tight">${adet} parça</td>
          <td class="tight">${kullanan ? chip('live', kullanan + ' ŞUBEDE', true) : chip('off', 'kullanılmıyor')}</td>
          <td><div class="row-actions">
            <button class="btn sm" data-act="list-open" data-id="${esc(pl.id)}" type="button">AÇ ›</button>
            <button class="btn sm danger" data-act="list-del" data-id="${esc(pl.id)}" type="button">SİL</button>
          </div></td>
        </tr>`;
      }).join('');

    return `
      <div class="panel">
        <h3>ÇALMA LİSTELERİ (${D.playlists.length})</h3>
        <p class="panel-sub">Listeler markaya özeldir; yayın kaynağı olarak markanın sayfasından seçilir.</p>
        <table>
          <thead><tr><th>LİSTE</th><th>MARKA</th><th>PARÇA</th><th>DURUM</th><th></th></tr></thead>
          <tbody>${satirlar || bos(5, 'Henüz çalma listesi yok. Marka sayfasından oluşturabilirsin.')}</tbody>
        </table>
      </div>`;
  }

  function listeDetay(state, D, ui) {
    const pl = D.playlists.find(x => x.id === state.openPlaylist);
    if (!pl) return listeListesi(state, D, ui);
    const b = D.brands.find(x => x.id === pl.brand_id);
    const q = norm(state.q);
    const kayitlar = D.playlistTracks.filter(x => x.playlist_id === pl.id)
      .sort((a, c) => (a.sort_order || 0) - (c.sort_order || 0))
      .map(x => ({ x, t: D.tracks.find(t => t.id === x.track_id) }))
      .filter(r => r.t);
    const gorunen = kayitlar.filter(r => hit(q, clean(r.t.title)));
    const kullanan = D.broadcast.filter(x => x.playlist_id === pl.id).length;

    const satirlar = gorunen.map((r, i) => {
      const klasor = D.folders.find(f => f.id === r.t.folder_id);
      return `<tr data-idx="${i}" data-kayit="${esc(r.x.id)}">
        <td class="no">${String(kayitlar.indexOf(r) + 1).padStart(2, '0')}</td>
        <td><b>${esc(clean(r.t.title))}</b></td>
        <td class="tight">${klasor ? chip('off', klasor.name) : chip('off', 'klasör silinmiş')}</td>
        <td class="tight">${mmss(r.t.duration_sec)}</td>
        <td><div class="row-actions">
          <button class="btn sm" data-act="ptrack-play" data-id="${esc(r.t.id)}" type="button">DİNLE</button>
          <button class="btn sm" data-act="ptrack-up" data-id="${esc(r.x.id)}" ${i === 0 ? 'disabled' : ''} type="button">↑</button>
          <button class="btn sm" data-act="ptrack-down" data-id="${esc(r.x.id)}" ${i === gorunen.length - 1 ? 'disabled' : ''} type="button">↓</button>
          <button class="btn sm danger" data-act="ptrack-del" data-id="${esc(r.x.id)}" type="button">ÇIKAR</button>
        </div></td>
      </tr>`;
    }).join('');

    return `
      ${geriCubugu(null, b ? b.name + ' SAYFASINA DÖN' : 'LİSTELERE DÖN', [pl.name,
        (b ? b.name + ' · ' : '') + kayitlar.length + ' parça' + (kullanan ? ' · ' + kullanan + ' şubede' : '')])}
      <div class="row" style="margin-bottom:18px">
        <button class="btn primary" data-act="list-addtrack" data-id="${esc(pl.id)}" type="button">+ ŞARKI EKLE</button>
        <button class="btn danger" data-act="list-del" data-id="${esc(pl.id)}" type="button">LİSTEYİ SİL</button>
        <span class="sub" id="list-msg"></span>
      </div>
      <div class="panel">
        <h3>AKIŞ (${kayitlar.length})</h3>
        <table>
          <thead><tr><th>#</th><th>PARÇA</th><th>KAYNAK KLASÖR</th><th>SÜRE</th><th></th></tr></thead>
          <tbody>${satirlar || bos(5, kayitlar.length ? 'Aramayla eşleşen parça yok.' : 'Liste boş. “+ ŞARKI EKLE” ile klasörlerden parça seç.')}</tbody>
        </table>
      </div>`;
  }

  // ---------- ABONELİKLER ----------
  const abonelikBitis = ab => !ab ? null : (ab.status === 'trial' ? ab.trial_ends_at : ab.current_end);

  function kalanGun(v) {
    if (!v) return null;
    return Math.ceil((new Date(v).getTime() - Date.now()) / 86400000);
  }
  const DURUM_ETIKET = { trial: 'Deneme', active: 'Aktif', past_due: 'Ödeme gecikti', canceled: 'İptal edildi', expired: 'Süresi doldu' };

  function abonelikListesi(state, D, ui) {
    const q = norm(state.q);
    const planlar = D.plans;
    const satirlar = D.brands
      .filter(b => hit(q, b.name))
      .map(b => {
        const ab = D.subscriptions.find(s => s.brand_id === b.id);
        const plan = ab ? planlar.find(p => p.id === ab.plan_id) : null;
        const kalan = ab ? kalanGun(abonelikBitis(ab)) : null;
        const tutar = plan ? (plan.per_branch ? plan.monthly_price * (ab.branch_count || 1) : plan.monthly_price) : 0;
        const durum = ab ? (DURUM_ETIKET[ab.status] || ab.status) : 'Abonelik yok';
        const renk = kalan == null ? '' : (kalan < 0 ? 'danger' : (kalan <= 3 ? 'gold' : 'live'));
        return `<tr>
          <td><b>${esc(b.name)}</b><span class="sub">${D.players.filter(p => p.brand_id === b.id).length} şube</span></td>
          <td class="tight">
            <select data-ab-plan="${esc(b.id)}" aria-label="Paket">
              <option value="">— paket seç —</option>
              ${planlar.map(p => `<option value="${esc(p.id)}"${ab && ab.plan_id === p.id ? ' selected' : ''}>${esc(p.name)}${p.monthly_price ? ' · ' + p.monthly_price.toLocaleString('tr-TR') + ' TL' : ''}</option>`).join('')}
            </select>
          </td>
          <td class="tight">
            <input type="number" min="1" value="${esc(ab ? ab.branch_count || 1 : 1)}" data-ab-sube="${esc(b.id)}"
              aria-label="Şube sayısı" style="width:74px">
          </td>
          <td class="tight">${ab ? chip(renk, durum) : chip('off', 'yok')}
            <span class="sub">${ab && kalan != null ? (kalan < 0 ? Math.abs(kalan) + ' gün geçti' : kalan + ' gün kaldı') : ''}</span></td>
          <td class="tight">${ab ? esc(uzunTarih(abonelikBitis(ab))) : '—'}
            <span class="sub">${tutar ? tutar.toLocaleString('tr-TR') + ' TL/ay' : ''}</span></td>
          <td><div class="row-actions">
            <button class="btn sm" data-act="ab-extend" data-id="${esc(b.id)}" type="button">SÜRE EKLE</button>
            ${ab ? `<button class="btn sm" data-act="ab-cancel" data-id="${esc(b.id)}" type="button">İPTAL</button>` : ''}
            <button class="btn sm danger" data-act="brand-del" data-id="${esc(b.id)}" type="button">SİL</button>
          </div></td>
        </tr>`;
      }).join('');

    return `
      <div class="panel" style="margin-bottom:18px">
        <h3>YENİ MARKA</h3>
        <div class="form-grid">
          <div class="field"><label for="ab-brand-name">MARKA ADI</label>
            <input id="ab-brand-name" placeholder="Örn. Roast & Co." autocomplete="off"></div>
          <div class="field"><label for="ab-brand-contact">İLETİŞİM</label>
            <input id="ab-brand-contact" placeholder="İsteğe bağlı" autocomplete="off"></div>
          <button class="btn primary" data-act="ab-brand-add" type="button">MARKA OLUŞTUR</button>
        </div>
        <span class="sub" id="ab-brand-msg"></span>
      </div>
      <div class="panel">
        <h3>MARKA ABONELİKLERİ (${D.brands.length})</h3>
        <p class="panel-sub">Paketi seç, şube sayısını yaz, sonra “SÜRE EKLE” ile deneme veya aktif süre ver.</p>
        <table>
          <thead><tr><th>MARKA</th><th>PAKET</th><th>ŞUBE</th><th>DURUM</th><th>BİTİŞ</th><th></th></tr></thead>
          <tbody>${satirlar || bos(6, 'Henüz marka yok.')}</tbody>
        </table>
        <span class="sub" id="ab-msg">${D.subscriptions.length} abonelik kaydı · ${D.plans.length} paket tanımlı</span>
      </div>`;
  }

  // ---------- TALEPLER ----------
  const TALEP_DURUM = { new: 'Yeni', contacted: 'İletişime geçildi', closed: 'Kapandı' };

  function talepListesi(state, D, ui) {
    const q = norm(state.q);
    const list = (D.requests || []).filter(r => hit(q, r.company, r.contact_name, r.email, r.phone));
    const satirlar = list.map(r => `<tr>
      <td><div class="cell-main"><span class="cover">📩</span><span><b>${esc(r.company)}</b>
        <span class="sub">${esc(r.contact_name || '—')} · ${esc(r.email || '—')}${r.phone ? ' · ' + esc(r.phone) : ''}</span></span></div></td>
      <td>${r.branch_count ? esc(r.branch_count + ' şube') : '<span class="sub">—</span>'}
        ${r.message ? `<span class="sub">“${esc(r.message)}”</span>` : ''}</td>
      <td class="tight">${esc(tarih(r.created_at))}</td>
      <td class="tight">
        <select data-act="req-status" data-id="${esc(r.id)}" aria-label="Durum">
          ${Object.keys(TALEP_DURUM).map(s => `<option value="${s}"${r.status === s ? ' selected' : ''}>${TALEP_DURUM[s]}</option>`).join('')}
        </select>
      </td>
      <td><div class="row-actions">
        <button class="btn sm" data-act="req-convert" data-id="${esc(r.id)}" type="button">MARKAYA ÇEVİR</button>
        <button class="btn sm danger" data-act="req-del" data-id="${esc(r.id)}" type="button">SİL</button>
      </div></td>
    </tr>`).join('');

    return `
      <div class="panel">
        <h3>TEKLİF TALEPLERİ (${(D.requests || []).length})</h3>
        <p class="panel-sub">Kahve markalarından gelen başvurular. “MARKAYA ÇEVİR” başvuruyu marka kaydına dönüştürür.</p>
        <table>
          <thead><tr><th>TALEP</th><th>NOT</th><th>GELDİĞİ ZAMAN</th><th>DURUM</th><th></th></tr></thead>
          <tbody>${satirlar || bos(5, (D.requests || []).length ? 'Aramayla eşleşen talep yok.' : 'Henüz talep yok.')}</tbody>
        </table>
      </div>`;
  }

  const SEKMELER = {
    icerik: [['klasorler', 'Yayın klasörleri'], ['anonslar', 'Anonslar']],
    musteri: [['markalar', 'Markalar'], ['listeler', 'Çalma listeleri'], ['abonelikler', 'Abonelikler'], ['talepler', 'Talepler']]
  };

  function sekmeler(state) {
    const liste = SEKMELER[state.nav];
    if (!liste) return '';
    return `<div class="tabs">${liste.map(([k, l]) =>
      `<button type="button" data-sub="${k}" class="${state.sub === k ? 'active' : ''}">${esc(l)}</button>`).join('')}</div>`;
  }

  function geriCubugu(sub, metin, cipsler) {
    const hedef = sub === 'klasorler' ? 'klasorler' : (sub === 'markalar' ? 'markalar' : 'listeler');
    return `<div class="row" style="margin-bottom:18px">
      <button class="btn sm" data-act="geri" data-hedef="${hedef}" type="button">← ${esc(metin)}</button>
      ${(cipsler || []).filter(Boolean).map((c, i) => i === 0 ? chip('gold', c) : chip('off', c)).join('')}
    </div>`;
  }

  // ---------- Ana giriş ----------
  // state: {nav, sub, openFolder, openBrand, openPlaylist, q}
  function gorunum(state, D, ui) {
    const bas = topbar(state, D, ui.now());
    const kabuk = html => ({ baslik: bas.baslik, alt: bas.alt, html: html });
    if (state.nav === 'canli') return kabuk(canliView(state, D, ui));
    if (state.nav === 'icerik') {
      const govde = state.openFolder
        ? klasorDetay(state, D, ui)
        : (state.sub === 'anonslar' ? anonsListesi(state, D, ui) : klasorListesi(state, D, ui));
      return kabuk(sekmeler(state) + govde);
    }
    let govde;
    if (state.openPlaylist) govde = listeDetay(state, D, ui);
    else if (state.openBrand) govde = markaDetay(state, D, ui);
    else if (state.sub === 'listeler') govde = listeListesi(state, D, ui);
    else if (state.sub === 'abonelikler') govde = abonelikListesi(state, D, ui);
    else if (state.sub === 'talepler') govde = talepListesi(state, D, ui);
    else govde = markaListesi(state, D, ui);
    return kabuk(sekmeler(state) + govde);
  }

  // ---------- Çekmece (şube detayı) ----------
  function subeCekmecesi(id, D, ui) {
    const p = D.players.find(x => x.id === id);
    if (!p) return '';
    const b = D.brands.find(x => x.id === p.brand_id);
    const now = ui.now();
    const k = b ? kaynak(D, b.id) : null;
    const link = ui.playerBase() + p.player_key;
    const kilitBilgi = [
      p.bound_at ? 'kilitlenme: ' + tarih(p.bound_at) : null,
      p.last_ip ? 'IP: ' + p.last_ip : null,
      p.last_ip_at ? 'son görülme: ' + tarih(p.last_ip_at) : null
    ].filter(Boolean).join(' · ');
    return `
      <h3>${esc(p.label)}</h3>
      <p class="sub">${esc(b ? b.name : '—')}${k && k.ad ? ' · ' + esc(k.ad) : ''}</p>
      <div class="row">${bagliChip(p, now)}${caliyorChip(p, now)}${kilitChip(p)}</div>

      <div class="block"><h4>YAYIN LİNKİ</h4>
        <div class="key">${esc(link)}</div>
        <div class="row" style="margin-top:12px">
          <button class="btn sm" data-act="copy" data-copy="${esc(link)}" type="button">LİNKİ KOPYALA</button>
          <a class="btn sm" href="${esc(link)}" target="_blank" rel="noopener">YAYINI AÇ ↗</a>
        </div>
        <p class="sub" style="margin-top:10px">Bu bağlantı şubeye aittir; telefonda tarayıcıda açılır ve cihaz kilidi sayesinde başka cihazda çalışmaz.</p>
        ${p.last_seen_at ? `<p class="sub">son bağlantı: ${esc(tarih(p.last_seen_at))}</p>` : '<p class="sub">hiç bağlanmadı</p>'}
        ${kilitBilgi ? `<p class="sub">${esc(kilitBilgi)}</p>` : ''}
      </div>

      <div class="block"><h4>YAYIN SAATLERİ</h4>
        <div class="form-grid">
          <div class="field"><label for="d-open">AÇILIŞ</label>
            <input id="d-open" type="time" value="${esc(hhmm(p.open_time))}"
              data-hours="open" data-player="${esc(p.id)}"></div>
          <div class="field"><label for="d-close">KAPANIŞ</label>
            <input id="d-close" type="time" value="${esc(hhmm(p.close_time))}"
              data-hours="close" data-player="${esc(p.id)}"></div>
        </div>
        <p class="sub" style="margin-top:10px">Boş bırakılırsa yayın kesintisiz sürer.</p>
        <span class="sub" id="drawer-msg"></span>
      </div>

      <div class="block"><h4>ANLIK ANONS</h4>
        <p class="sub">Mikrofonla duyuru gönder; ${esc(b ? b.name : 'bu marka')} şubelerinde çalan akışın önüne girer.</p>
        <button class="btn" data-act="mic" data-id="${esc(p.brand_id)}" type="button">🎙 MİKROFONU AÇ</button>
      </div>

      <div class="block"><h4>BAKIM</h4>
        <div class="row">
          ${p.bound_device_id ? `<button class="btn sm" data-act="player-lock" data-id="${esc(p.id)}" type="button">KİLİDİ SIFIRLA</button>` : ''}
          <button class="btn sm danger" data-act="player-del" data-id="${esc(p.id)}" type="button">ŞUBEYİ SİL</button>
        </div>
      </div>`;
  }

  // ---------- Parça detayı (pencere içeriği) ----------
  function parcaDetay(t, alt, kapakUrl) {
    return `<div style="text-align:center">
      ${kapakUrl
        ? `<img src="${esc(kapakUrl)}" alt="" style="width:220px;height:220px;border-radius:18px;object-fit:cover;display:block;margin:0 auto 18px">`
        : '<div style="width:220px;height:220px;border-radius:18px;background:rgba(255,255,255,.08);margin:0 auto 18px;display:grid;place-items:center;font-size:46px;opacity:.45">♪</div>'}
      <h3 style="margin:0 0 6px;font-size:19px">${esc(clean(t.title))}</h3>
      <p style="margin:0;color:var(--muted);font-size:13px">${esc(alt || '')}</p>
    </div>`;
  }

  const api = {
    esc: esc,
    clean: clean,
    mmss: mmss,
    hhmm: hhmm,
    canliMi: canliMi,
    kaynak: kaynak,
    abonelikBitis: abonelikBitis,
    kalanGun: kalanGun,
    nav: nav,
    topbar: topbar,
    gorunum: gorunum,
    subeCekmecesi: subeCekmecesi,
    parcaDetay: parcaDetay,
    geriCubugu: geriCubugu
  };

  if (typeof window !== 'undefined') window.DerinRadyoViews = api;
  if (typeof module !== 'undefined') module.exports = api;
})();
