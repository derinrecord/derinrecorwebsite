/* Derin Record — marka sunumu.
   Veriyi coffee_brand_auth ile açar, listeleri ve parçaları okur.
   Parça geçişleri hem görselde hem seste fade ile akar:
   parça bitmeden 2.6 sn önce ses kısılır, yeni parça 1.1 sn'de açılır. */
(() => {
const byId = id => document.getElementById(id);
const safe = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clean = n => { try { return decodeURIComponent(n); } catch { return n; } };
const fmt = s => (isFinite(s) && s > 0)
  ? Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0') : '0:00';
const sureMetni = s => {
  const t = Math.round(s || 0);
  return t >= 60 ? Math.floor(t / 60) + ' dk' : t + ' sn';
};
const es = (a, b) => String(a) === String(b);
const bekle = ms => new Promise(done => setTimeout(done, ms));

const client = window.supabase.createClient(
  window.DERIN_CONFIG.supabaseUrl, window.DERIN_CONFIG.supabasePublishableKey);
const slug = decodeURIComponent(location.pathname.split('/').filter(Boolean).pop() || '');
const urly = (kova, p) => p ? client.storage.from(kova).getPublicUrl(p).data.publicUrl : null;
const kapak = p => urly('radio-covers', p);
const ses = p => urly('radio-audio', p);

const audio = byId('mk-audio');
const KAPANMA_MS = 2600;   // parça sonundaki fade out
const ACILMA_MS = 1100;    // yeni parçanın fade in'i
const DUGME_MS = 420;      // düğmeyle geçişte kısa fade
const GORSEL_MS = 340;     // sahne görselinin fade süresi
const EN_KISA = 8;         // saniyeden kısa parçalarda uçtan geçiş yapılmaz

let listeler = [];
// Şube havuzu: yönetimin o şubenin havuzuna koydukları + markanın seçimi
// (player_playlists). null = fonksiyon henüz kurulmamış ya da okunamadı: o
// zaman seçim bölümü hiç çizilmez, sunum bugünkü gibi çalışır.
let havuz = null;
let sonKod = '';
let kuyruk = [];
let sira = -1;
let acikListe = null;
let seviye = 1;
let gecisVar = false;
let fadeZaman = null;
let sahneIsi = Promise.resolve();
let surukluyor = false;

// ---------- Ses geçişleri ----------
function iptalFade() { if (fadeZaman) { clearInterval(fadeZaman); fadeZaman = null; } }

function fade(hedef, ms) {
  return new Promise(done => {
    iptalFade();
    const bas = audio.volume;
    const varis = Math.min(1, Math.max(0, hedef));
    if (ms <= 0 || Math.abs(varis - bas) < 0.005) { audio.volume = varis; done(); return; }
    const adim = Math.max(8, Math.min(30, Math.round(ms / 50)));
    const fark = (varis - bas) / adim;
    let i = 0;
    fadeZaman = setInterval(() => {
      i++;
      audio.volume = Math.min(1, Math.max(0, bas + fark * i));
      if (i >= adim) { iptalFade(); audio.volume = varis; done(); }
    }, ms / adim);
  });
}

// ---------- Kuyruk ----------
function sonraki(yon) {
  if (!kuyruk.length) return -1;
  return (sira + yon + kuyruk.length) % kuyruk.length;
}

function kaynakYukle(t, baslangic) {
  audio.volume = Math.min(1, Math.max(0, baslangic));
  audio.src = ses(t.storage_path);
  audio.play().catch(() => {
    audio.volume = seviye;
    durum('Tarayıcı otomatik çalmayı engelledi. Başlatmak için oynat düğmesine dokunun.');
  });
}

// Parçayı seçer: kaynağı yükler, sahneyi ve listeyi tazeler.
function parcaSec(i, { cal = true, baslangic = seviye } = {}) {
  if (i < 0 || i >= kuyruk.length) return;
  sira = i;
  const t = kuyruk[i];
  if (cal) kaynakYukle(t, baslangic);
  sahneYaz(t);
  satirlariIsaretle();
}

// Düğme/liste tıklamasıyla geçiş: kısa fade out → parça → fade in.
async function gecisCal(i) {
  if (gecisVar || i < 0) return;
  gecisVar = true;
  try {
    if (!audio.paused) await fade(0, DUGME_MS);
    parcaSec(i, { baslangic: 0 });
    await fade(seviye, ACILMA_MS);
  } finally { gecisVar = false; }
}

// Parça sonuna yaklaşınca kesintisiz geçiş.
async function uctanGecis() {
  if (gecisVar) return;
  gecisVar = true;
  try {
    await fade(0, KAPANMA_MS);
    const i = sonraki(1);
    if (i < 0) return;
    parcaSec(i, { baslangic: 0 });
    await fade(seviye, ACILMA_MS);
  } finally { gecisVar = false; }
}

audio.addEventListener('timeupdate', () => {
  const d = audio.duration;
  if (isFinite(d) && d > 0) {
    byId('mk-cur').textContent = fmt(audio.currentTime);
    byId('mk-dur').textContent = fmt(d);
    if (!surukluyor) byId('mk-seek').value = Math.round((audio.currentTime / d) * 1000);
  }
  if (gecisVar || audio.paused || !kuyruk.length) return;
  if (!isFinite(d) || d < EN_KISA) return;
  const kalan = d - audio.currentTime;
  if (kalan > 0.25 && kalan <= KAPANMA_MS / 1000) uctanGecis();
});

audio.addEventListener('ended', () => {
  if (gecisVar) return;
  gecisVar = true;
  const i = sonraki(1);
  if (i >= 0) {
    parcaSec(i, { baslangic: 0 });
    fade(seviye, ACILMA_MS).then(() => { gecisVar = false; });
  } else { gecisVar = false; }
});

audio.addEventListener('error', () => {
  if (gecisVar || !kuyruk.length) return;
  durum('Parça açılamadı, sıradakine geçiliyor…');
  setTimeout(() => { const i = sonraki(1); if (i >= 0) gecisCal(i); }, 900);
});

// Kullanıcı duraklattıysa yarı kalan fade'i bitir ki ses kapalı kalmasın.
audio.addEventListener('pause', () => { if (!gecisVar) { iptalFade(); audio.volume = seviye; } });

// ---------- Sahne (görsel fade) ----------
function sahneYaz(t) {
  const stage = byId('mk-stage');
  if (!stage) return;
  sahneIsi = sahneIsi.then(async () => {
    stage.classList.add('gizle');
    await bekle(GORSEL_MS);
    doldur(t);
    stage.classList.remove('gizle');
  }).catch(() => {});
}

function doldur(t) {
  const stage = byId('mk-stage');
  if (!stage) return;
  const art = byId('mk-art');
  if (!t) {
    art.innerHTML = '<div class="ph">♪</div>';
    byId('mk-tur').textContent = 'HAZIR';
    byId('mk-baslik').textContent = 'Yayın bekleniyor';
    byId('mk-alt').textContent = 'Bu listede henüz parça yok.';
    byId('mk-album').textContent = '';
    stage.classList.remove('caliyor');
    return;
  }
  const kapakPath = t.cover_path || t._playlistCover;
  art.innerHTML = kapak(kapakPath)
    ? `<img src="${safe(kapak(kapakPath))}" alt="">`
    : '<div class="ph">♪</div>';
  byId('mk-tur').textContent = 'ŞİMDİ ÇALIYOR';
  byId('mk-baslik').textContent = clean(t.title);
  byId('mk-alt').textContent = t._playlistName || '';
  byId('mk-album').textContent = t._album || '';
  stage.classList.toggle('caliyor', !audio.paused);
}

audio.addEventListener('play', () => { const s = byId('mk-stage'); if (s) s.classList.add('caliyor'); });
audio.addEventListener('pause', () => { const s = byId('mk-stage'); if (s) s.classList.remove('caliyor'); });

function satirlariIsaretle() {
  const t = kuyruk[sira];
  document.querySelectorAll('.mk-item').forEach(el => {
    el.classList.toggle('calisiyor', !!t && es(el.dataset.track, t.id) && es(el.dataset.plist, t._playlistId));
  });
}

function durum(metin) {
  const el = byId('mk-durum');
  if (el) el.textContent = metin || '';
}

// ---------- Çizim ----------
function tabsCiz() {
  const kutu = byId('mk-tabs');
  kutu.innerHTML = listeler.map(pl => `
    <button class="mk-tab" type="button" data-plist="${safe(pl.id)}" aria-pressed="${es(pl.id, acikListe && acikListe.id)}">
      ${kapak(pl.cover_path) ? `<img src="${safe(kapak(pl.cover_path))}" alt="">` : '<span class="ph">♪</span>'}
      <span><b>${safe(pl.name)}</b><small>${pl._tracks.length} parça · ${sureMetni(pl._sure)}</small></span>
    </button>`).join('');
}

// Markaya hiç çalma listesi eklenmemişse sunum "bu listede henüz şarkı yok"
// diyerek yanıltıyordu: ortada liste bile yok. Doğrusunu söyleriz, yoksa kafe
// sahibi hizmette hiç müzik olmadığını sanıyor.
function bosSunum() {
  byId('mk-liste-baslik').innerHTML = '<span>ÇALMA LİSTESİ YOK</span><span></span>';
  byId('mk-liste').innerHTML = '<p class="mk-bos">Bu markaya henüz çalma listesi eklenmemiş. Listeler eklendiğinde parçalar burada akmaya başlar.</p>';
  byId('mk-tur').textContent = 'HAZIR DEĞİL';
  byId('mk-baslik').textContent = 'Sunum hazırlanmayı bekliyor';
  byId('mk-alt').textContent = 'Derin Record ile iletişime geçin.';
  byId('mk-album').textContent = '';
}

function listeCiz() {
  const pl = acikListe;
  const baslik = byId('mk-liste-baslik');
  const kutu = byId('mk-liste');
  baslik.innerHTML = `<span>${safe(pl ? pl.name : '')}</span><span>${pl ? pl._tracks.length + ' parça · ' + sureMetni(pl._sure) : ''}</span>`;
  if (!pl || !pl._tracks.length) {
    kutu.innerHTML = '<p class="mk-bos">Bu listede henüz şarkı yok.</p>';
    return;
  }
  kutu.innerHTML = `<div class="mk-list-head"><span>#</span><span>BAŞLIK</span><span style="text-align:right">SÜRE</span></div>
    <ol class="mk-list" id="mk-satirlar">${pl._tracks.map((t, i) => `
      <li class="mk-item" data-track="${safe(t.id)}" data-plist="${safe(pl.id)}" data-idx="${i}">
        <span class="no"><span class="sira">${i + 1}</span>
          <span class="mk-eq" aria-hidden="true"><i></i><i></i><i></i></span></span>
        <span class="ttl">${kapak(t.cover_path)
          ? `<img src="${safe(kapak(t.cover_path))}" alt="">`
          : '<span class="ph" aria-hidden="true">♪</span>'}
          <span class="ad">${safe(clean(t.title))}</span></span>
        <span class="sure">${fmt(t.duration_sec)}</span>
      </li>`).join('')}</ol>`;
}

function istatistikCiz(brand) {
  const parcaSayisi = listeler.reduce((n, pl) => n + pl._tracks.length, 0);
  const toplam = listeler.reduce((n, pl) => n + pl._sure, 0);
  byId('mk-stats').innerHTML = `
    <div class="mk-stat"><b>${listeler.length}</b><span>ÇALMA LİSTESİ</span></div>
    <div class="mk-stat"><b>${parcaSayisi}</b><span>PARÇA</span></div>
    <div class="mk-stat"><b>${sureMetni(toplam)}</b><span>TOPLAM AKIŞ</span></div>`;
  byId('mk-selam').textContent = 'DERİN RECORD × ' + String(brand.name || '').toUpperCase();
}

function ciz(brand, plist) {
  byId('mk-lock').hidden = true;
  const app = byId('mk-app');
  app.hidden = false;
  const vurgu = /^#[0-9a-f]{3,8}$/i.test(brand.accent_color || '') ? brand.accent_color : '#e8d15a';
  byId('mk-root').style.setProperty('--mk-accent', vurgu);

  const notlar = [
    brand.roast_profile,
    ...(Array.isArray(brand.tasting_notes) ? brand.tasting_notes : [])
  ].filter(Boolean);

  app.innerHTML = `
<section class="mk-hero mk-shell">
  <p class="mk-eyebrow" id="mk-selam">DERİN RECORD</p>
  <h1>${safe(brand.name)}<br><span>İÇİN KURGULANDI.</span></h1>
  ${brand.tagline ? `<p class="mk-tag">${safe(brand.tagline)}</p>` : ''}
  ${notlar.length ? `<div class="mk-notes">${notlar.map(n => `<span class="mk-note">${safe(n)}</span>`).join('')}</div>` : ''}
  <div class="mk-stats" id="mk-stats"></div>
</section>

<section class="mk-shell">
  <div class="mk-tabs" id="mk-tabs"></div>

  <div class="mk-stage" id="mk-stage">
    <div class="mk-art" id="mk-art"><div class="ph">♪</div>
      <span class="mk-live"><i></i>CANLI</span></div>
    <div class="mk-meta">
      <div class="mk-icerik">
        <p class="mk-lbl" id="mk-tur">HAZIR</p>
        <h2 id="mk-baslik">Bir liste seçin</h2>
        <p class="mk-sub" id="mk-alt">Listeyi seçtiğinizde parçalar akmaya başlar.</p>
        <p class="mk-album" id="mk-album"></p>
      </div>
      <div class="mk-prog">
        <span id="mk-cur">0:00</span>
        <input type="range" id="mk-seek" min="0" max="1000" value="0" aria-label="İlerleme">
        <span id="mk-dur">0:00</span>
      </div>
      <div class="mk-cmds">
        <button id="mk-geri" type="button" aria-label="Önceki">⏮</button>
        <button class="mk-main" id="mk-oyna" type="button" aria-label="Oynat">▶</button>
        <button id="mk-ileri" type="button" aria-label="Sonraki">⏭</button>
        <div class="mk-vol">🔊<input type="range" id="mk-ses" min="0" max="100" value="100" aria-label="Ses"></div>
      </div>
      <p class="mk-sub" id="mk-durum" style="margin-top:14px"></p>
    </div>
  </div>

  <div class="mk-panel">
    <h3 id="mk-liste-baslik"></h3>
    <div id="mk-liste"></div>
  </div>

  <div id="mk-secim"></div>

  <div class="mk-foot">
    <span>DERİN RECORD · ÖZEL SUNUM</span>
    <span>${new Date().getFullYear()}</span>
  </div>
</section>`;

  istatistikCiz(brand);
  acikListe = listeler[0] || null;
  kuyruk = acikListe ? acikListe._tracks : [];
  tabsCiz();
  listeCiz();
  doldur(kuyruk[0] || null);
  if (!listeler.length) bosSunum();
  bagla();
}

// ---------- Şube listesi seçimi ----------
// Yönetim her şubeye bir havuz atar (hangi listeler o şubeye ait). Marka bu
// havuzun içinden hangilerinin çalacağını seçer; seçim sunucuya yazılır, yani
// kalıcıdır. Şube başına liste sayısında sınır yoktur: 10 liste de seçilebilir.
function subeFiltresi() {
  try { return new URLSearchParams(location.search).get('sube') || ''; } catch { return ''; }
}

function secimGruplari() {
  const filtre = subeFiltresi();
  const gruplar = new Map();
  (havuz || []).forEach(s => {
    if (filtre && !es(s.player_id, filtre)) return;
    if (!gruplar.has(String(s.player_id))) {
      gruplar.set(String(s.player_id), {
        player_id: s.player_id, sube: s.sube, abonelik: !!s.abonelik, listeler: []
      });
    }
    gruplar.get(String(s.player_id)).listeler.push(s);
  });
  return [...gruplar.values()];
}

function durumYaz(playerId, metin) {
  const el = document.querySelector('[data-sube-durum="' + playerId + '"]');
  if (el) el.textContent = metin || '';
}

function secimCiz() {
  const host = byId('mk-secim');
  if (!host) return;
  // Fonksiyon kurulmamışsa bölüm hiç görünmez: eksik kurulumu markaya
  // gösterip korkutmaya gerek yok.
  if (havuz === null) { host.innerHTML = ''; return; }

  const gruplar = secimGruplari();
  if (!gruplar.length) {
    host.innerHTML = `<div class="mk-panel">
      <h3><span>ÇALINACAK LİSTELER</span><span></span></h3>
      <p class="mk-bos">Bu şubeye henüz çalma listesi atanmadı. Derin Record bir liste atadığında buradan istediklerini seçebilirsin.</p>
    </div>`;
    return;
  }

  const baslik = gruplar.length > 1 ? 'ŞUBELERDE ÇALINACAK LİSTELER' : 'BU ŞUBEDE ÇALINACAK LİSTELER';
  const govde = gruplar.map(g => {
    const seciliAdet = g.listeler.filter(x => x.secili).length;
    const kilitli = !g.abonelik;
    const satirlar = g.listeler.map(x => `
      <label class="mk-secim-satir">
        <input type="checkbox" data-sube="${safe(g.player_id)}" value="${safe(x.playlist_id)}"
          ${x.secili ? 'checked' : ''}${kilitli ? ' disabled' : ''}>
        <span><b>${safe(x.liste)}</b><small>${Number(x.parca) || 0} parça</small></span>
      </label>`).join('');
    return `<div class="mk-sube">
      <div class="mk-sube-ust">
        <b>${safe(g.sube || 'Şube')}</b>
        <span class="mk-sub">${seciliAdet} / ${g.listeler.length} liste çalıyor</span>
      </div>
      <div class="mk-secim-kutu">${satirlar}</div>
      ${kilitli ? `<p class="mk-bos">Aboneliğiniz aktif olmadığı için seçim kaydedilemez. Derin Record ile iletişime geçin.</p>` : ''}
      <div class="mk-secim-alt">
        <button class="mk-btn" type="button" data-sube-kaydet="${safe(g.player_id)}"${kilitli ? ' disabled' : ''}>SEÇİMİ KAYDET</button>
        <span class="mk-sub" data-sube-durum="${safe(g.player_id)}">Kaydettiğiniz anda bu şubede geçerli olur ve siz değiştirene kadar kalır.</span>
      </div>
    </div>`;
  }).join('');

  host.innerHTML = `<div class="mk-panel">
    <h3><span>${baslik}</span><span>istediğiniz kadar liste</span></h3>
    <p class="mk-bos">Yönetimin bu şubeye atadığı listeler aşağıdadır. İşaretlediklerin bu şubede çalar,
      işareti kaldırdıkların çalmaz. Hepsi kapanırsa o şubede müzik çalmaz.</p>
    ${govde}
  </div>`;
}

async function secimYukle(kod) {
  try {
    const r = await client.rpc('coffee_brand_havuz', { p_slug: slug, p_code: kod });
    if (!r || r.error || !Array.isArray(r.data)) { havuz = null; secimCiz(); return; }
    havuz = r.data;
  } catch { havuz = null; }
  secimCiz();
}

async function secimKaydet(playerId, dugme) {
  const secili = [...document.querySelectorAll('[data-sube]')]
    .filter(k => es(k.dataset.sube, playerId) && k.checked)
    .map(k => k.value);
  dugme.disabled = true;
  durumYaz(playerId, 'Kaydediliyor…');
  const { data, error } = await client.rpc('coffee_brand_secim', {
    p_slug: slug, p_code: sonKod, p_player_id: playerId, p_playlist_ids: secili
  });
  dugme.disabled = false;
  if (error) { durumYaz(playerId, 'Kaydedilemedi: ' + error.message); return; }
  (havuz || []).forEach(x => {
    if (es(x.player_id, playerId)) x.secili = secili.some(v => es(v, x.playlist_id));
  });
  secimCiz();
  const adet = Number(data) || 0;
  durumYaz(playerId, adet === 0
    ? 'Hiç liste seçilmedi: bu şubede müzik çalmaz.'
    : 'Kaydedildi: bu şubede ' + adet + ' liste çalacak.');
}

function bagla() {
  byId('mk-tabs').addEventListener('click', async e => {
    const dugme = e.target.closest('.mk-tab');
    if (!dugme) return;
    const pl = listeler.find(x => es(x.id, dugme.dataset.plist));
    if (!pl || (acikListe && es(pl.id, acikListe.id))) return;
    const devam = !audio.paused && !!audio.src;
    acikListe = pl;
    kuyruk = pl._tracks;
    sira = -1;
    tabsCiz();
    listeCiz();
    if (devam && kuyruk.length) await gecisCal(0);
    else { satirlariIsaretle(); sahneYaz(kuyruk[0] || null); }
  });

  byId('mk-liste').addEventListener('click', e => {
    const satir = e.target.closest('.mk-item');
    if (!satir) return;
    const i = Number(satir.dataset.idx);
    const t = kuyruk[i];
    if (!t) return;
    if (sira === i && es(t._playlistId, acikListe.id)) detayGoster(t);
    else gecisCal(i);
  });

  byId('mk-oyna').onclick = () => {
    if (!kuyruk.length) return;
    if (sira < 0) { gecisCal(0); return; }
    if (audio.paused) {
      audio.play().catch(() => durum('Parça açılamadı.'));
    } else {
      audio.pause();
    }
  };
  audio.addEventListener('play', () => { byId('mk-oyna').textContent = '⏸'; });
  audio.addEventListener('pause', () => { byId('mk-oyna').textContent = '▶'; });

  byId('mk-ileri').onclick = () => { const i = sonraki(1); if (i >= 0) gecisCal(i); };
  byId('mk-geri').onclick = () => {
    if (audio.currentTime > 3) { audio.currentTime = 0; return; }
    const i = sonraki(-1);
    if (i >= 0) gecisCal(i);
  };
  byId('mk-ses').oninput = e => { seviye = Number(e.target.value) / 100; iptalFade(); audio.volume = seviye; };
  byId('mk-seek').addEventListener('input', () => { surukluyor = true; });
  byId('mk-seek').addEventListener('change', e => {
    surukluyor = false;
    if (isFinite(audio.duration) && audio.duration) audio.currentTime = (Number(e.target.value) / 1000) * audio.duration;
  });
  byId('mk-secim').addEventListener('click', e => {
    const dugme = e.target.closest('[data-sube-kaydet]');
    if (dugme) secimKaydet(dugme.dataset.subeKaydet, dugme).catch(err =>
      durumYaz(dugme.dataset.subeKaydet, 'Kaydedilemedi: ' + (err.message || '')));
  });

  document.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT') return;
    if (e.key === 'ArrowRight') byId('mk-ileri').click();
    else if (e.key === 'ArrowLeft') byId('mk-geri').click();
    else if (e.key === ' ') { e.preventDefault(); byId('mk-oyna').click(); }
  });
}

function detayGoster(t) {
  const kapakPath = t.cover_path || t._playlistCover;
  const ov = document.createElement('div');
  ov.className = 'mk-ov';
  ov.innerHTML = `
    <div class="mk-card" role="dialog" aria-modal="true">
      ${kapak(kapakPath) ? `<img src="${safe(kapak(kapakPath))}" alt="">` : '<div class="ph">♪</div>'}
      <h3>${safe(clean(t.title))}</h3>
      <p>${safe(t._playlistName || '')}${t.duration_sec ? ' · ' + fmt(t.duration_sec) : ''}</p>
      <button id="mk-kapat" type="button">KAPAT</button>
    </div>`;
  document.body.appendChild(ov);
  const kapat = () => ov.remove();
  ov.querySelector('#mk-kapat').onclick = kapat;
  ov.onclick = e => { if (e.target === ov) kapat(); };
  document.addEventListener('keydown', function esc(e) {
    if (e.key === 'Escape') { kapat(); document.removeEventListener('keydown', esc); }
  });
}

// ---------- Açılış ----------
async function ac(kod) {
  const hata = byId('mk-hata');
  const dugme = byId('mk-gir');
  hata.textContent = 'Kontrol ediliyor…';
  dugme.disabled = true;
  const { data, error } = await client.rpc('coffee_brand_auth', { p_slug: slug, p_code: kod });
  dugme.disabled = false;
  if (error) { hata.textContent = 'Bağlantı kurulamadı: ' + error.message; return; }
  if (!data || !data.length) {
    hata.textContent = 'Kod doğru değil ya da sunum henüz hazır değil.';
    return;
  }
  const brand = data[0];

  // Listeler ve parçalar: katalog tabloları dışarıya (girişsiz ziyaretçiye)
  // kapatıldığı için sunum sayfası veriyi, erişim kodunu sunucuda doğrulayan
  // coffee_brand_liste'den alır (supabase/radio-erisim.sql). Fonksiyon henüz
  // kurulmadıysa aşağıdaki eski doğrudan okumaya düşülür, yani geçiş sırasında
  // müşterinin gördüğü sayfa bozulmaz.
  let satirlar = null;
  try {
    const r = await client.rpc('coffee_brand_liste', { p_slug: slug, p_code: kod });
    if (r && !r.error && Array.isArray(r.data)) satirlar = r.data;
  } catch { /* fonksiyon yok: eski yola düşülür */ }

  if (satirlar) {
    const gorulen = new Map();
    satirlar.forEach(x => {
      if (!gorulen.has(x.playlist_id)) {
        gorulen.set(x.playlist_id, {
          id: x.playlist_id, name: x.name, cover_path: x.cover_path,
          created_at: x.created_at, _tracks: []
        });
      }
      if (x.track_id) {
        gorulen.get(x.playlist_id)._tracks.push({
          id: x.track_id, title: x.title, storage_path: x.storage_path,
          cover_path: x.track_cover, duration_sec: x.duration_sec,
          _playlistId: x.playlist_id, _playlistName: x.name, _playlistCover: x.cover_path
        });
      }
    });
    listeler = [...gorulen.values()];
  } else {
    const { data: plistRaw } = await client.from('brand_playlists')
      .select('id,name,cover_path,created_at').eq('brand_id', brand.brand_id).order('created_at');
    listeler = plistRaw || [];
    const idler = listeler.map(p => p.id);
    const { data: pt } = idler.length
      ? await client.from('brand_playlist_tracks').select('id,playlist_id,track_id,sort_order').in('playlist_id', idler).order('sort_order')
      : { data: [] };
    const trackIds = [...new Set((pt || []).map(x => x.track_id))];
    const { data: parcalar } = trackIds.length
      ? await client.from('radio_tracks').select('id,title,storage_path,cover_path,duration_sec').in('id', trackIds)
      : { data: [] };
    const trackById = Object.fromEntries((parcalar || []).map(t => [t.id, t]));

    listeler.forEach(pl => {
      pl._tracks = (pt || []).filter(x => x.playlist_id === pl.id)
        .map(x => trackById[x.track_id]).filter(Boolean)
        .map(t => ({ ...t, _playlistId: pl.id, _playlistName: pl.name, _playlistCover: pl.cover_path }));
    });
  }

  listeler.forEach(pl => {
    pl._sure = pl._tracks.reduce((n, t) => n + (Number(t.duration_sec) || 0), 0);
  });

  try { sessionStorage.setItem('br-' + slug, kod); } catch {}
  sonKod = kod;
  ciz(brand, listeler);
  secimYukle(kod).catch(() => {});
}

byId('mk-gir').onclick = () => {
  const kod = byId('mk-kod').value.trim();
  if (!kod) { byId('mk-hata').textContent = 'Erişim kodunu girin.'; return; }
  ac(kod).catch(err => { byId('mk-hata').textContent = 'Beklenmeyen hata: ' + (err.message || ''); });
};
byId('mk-kod').addEventListener('keydown', e => { if (e.key === 'Enter') byId('mk-gir').click(); });

let kayitli = null;
try { kayitli = sessionStorage.getItem('br-' + slug); } catch {}
if (kayitli) ac(kayitli).catch(err => { byId('mk-hata').textContent = 'Beklenmeyen hata: ' + (err.message || ''); });
})();
