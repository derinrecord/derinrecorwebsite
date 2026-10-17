/* Derin Record — müşteri sunumu (şube ekranı).
   Şube linkiyle (/coffee/s/<anahtar>) açılır; şube kodu ve cihaz kilidi
   sube-guvenlik.js'te. Veriyi sube_sunum_* fonksiyonlarıyla okur
   (supabase/sube-sunum.sql).
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
// Kumanda ikonları: emoji karakterleri telefondan telefona farklı (bazen renkli)
// çizildiği için ikonlar tek renkli çizimdir, düğmenin yazı rengini alır.
const IKON = {
  onceki: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6 5h2v14H6zM20 5v14L9 12z"/></svg>',
  sonraki: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M16 5h2v14h-2zM4 5v14l11-7z"/></svg>',
  oynat: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15L19.5 12z"/></svg>',
  durdur: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6 4.5h4.2v15H6zM13.8 4.5H18v15h-4.2z"/></svg>'
};
const bekle = ms => new Promise(done => setTimeout(done, ms));

const client = window.supabase.createClient(
  window.DERIN_CONFIG.supabaseUrl, window.DERIN_CONFIG.supabasePublishableKey);
const G = window.DerinSubeGuvenlik;
const anahtar = G.anahtarOku(location);
const baglam = { client, anahtar };
// Kapak ve ses Cloudflare R2'den gelir (bkz. r2-depo.js).
const urly = (kova, p) => window.DerinR2.adres(kova, p);
const kapak = p => urly('radio-covers', p);
const ses = p => urly('radio-audio', p);

const audio = byId('mk-audio');
const KAPANMA_MS = 2600;   // parça sonundaki fade out
const ACILMA_MS = 1100;    // yeni parçanın fade in'i
const DUGME_MS = 420;      // düğmeyle geçişte kısa fade
const GORSEL_MS = 340;     // sahne görselinin fade süresi
const EN_KISA = 8;         // saniyeden kısa parçalarda uçtan geçiş yapılmaz

// Sunum yalnız okur: hangi listelerin o şubede çalacağını yönetim belirler.
// Marka burada seçim yapmaz, sunumu izler (karar tek yerde, panelde).
let listeler = [];
let kuyruk = [];
let sira = -1;
// "Karışık çal": müşteri sunumda kendisi açar. Sunucu listeleri sıralı gelir
// (sube_sunum_liste shuffle döndürmez), o yüzden varsayılan kapalıdır.
let karisik = false;
// Fiilen çalınacak sıra: kuyruğa indeksler. Karışık kapalıyken doğal sıra.
let duzen = [];
let acikListe = null;
// Markaya özel kapak (supabase/marka-kapagi.sql): kendi kapağı olmayan liste
// ve parçalar için varsayılan görsel. Fonksiyon yoksa null kalır.
let markaKapak = null;
let markaAdi = '';
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
// Kuyruğun çalma sırasını kurar. Karışık kapalıyken doğal sıra (0,1,2…) döner;
// açıkken Fisher-Yates ile karıştırılır ve o an çalan parça başa alınır ki
// "sonraki" bulunduğu yerden devam etsin (başa dönmüş gibi hissettirmesin).
function duzenKur() {
  const n = kuyruk.length;
  const idx = Array.from({ length: n }, (_, i) => i);
  if (!karisik) return idx;
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  if (sira >= 0 && sira < n) {
    const k = idx.indexOf(sira);
    if (k > 0) { idx.splice(k, 1); idx.unshift(sira); }
  }
  return idx;
}

// Sıradaki/önceki parça: doğal komşu değil, kurulu sıradaki komşu. Karışık
// açıkken bu yüzden rastgele akar; kapalıyken eskisi gibi art arda gider.
function sonraki(yon) {
  if (!kuyruk.length) return -1;
  if (duzen.length !== kuyruk.length) duzen = duzenKur();
  const p = duzen.indexOf(sira);
  if (p < 0) return duzen[0] ?? -1;
  return duzen[(p + yon + duzen.length) % duzen.length];
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
  parcaDegisti(t);
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
    const cizgi = byId('mk-dock-bar'); if (cizgi) cizgi.style.width = (audio.currentTime / d * 100).toFixed(2) + '%';
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

// Alt mini oynatıcı: sahne ekrandan çıkınca beliren "şu an çalan" çubuğu.
// Kapak, başlık ve liste adını sahneyle aynı yerden besler.
function dockYaz(t) {
  const kp = t ? (t.cover_path || t._playlistCover || markaKapak) : null;
  const art = byId('mk-dock-art');
  if (art) art.innerHTML = kapak(kp)
    ? `<img src="${safe(kapak(kp))}" alt="">`
    : '<span class="ph" aria-hidden="true">♪</span>';
  const bas = byId('mk-dock-baslik');
  if (bas) bas.textContent = t ? clean(t.title) : '—';
  const alt = byId('mk-dock-alt');
  if (alt) alt.textContent = t ? (t._playlistName || '') : '';
}

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

// Kapak yoksa sahnede boş bir kare yerine markanın adı yazılır.
function bosKapak() {
  return '<div class="ph"><span aria-hidden="true">♪</span>' +
    (markaAdi ? '<b class="ph-ad">' + safe(markaAdi) + '</b>' : '') + '</div>';
}

function doldur(t) {
  dockYaz(t);
  const stage = byId('mk-stage');
  if (!stage) return;
  const art = byId('mk-art');
  if (!t) {
    art.innerHTML = bosKapak();
    byId('mk-tur').textContent = 'HAZIR';
    byId('mk-baslik').textContent = 'Yayın bekleniyor';
    byId('mk-alt').textContent = 'Bu listede henüz parça yok.';
    byId('mk-album').textContent = '';
    stage.classList.remove('caliyor');
    return;
  }
  const kapakPath = t.cover_path || t._playlistCover || markaKapak;
  art.innerHTML = kapak(kapakPath)
    ? `<img src="${safe(kapak(kapakPath))}" alt="">`
    : bosKapak();
  byId('mk-tur').textContent = 'ŞİMDİ ÇALIYOR';
  // Yeni parça: süre baştan, toplam süre kayıttan (çalmadan önce 0:00 / 0:00 görünmesin).
  byId('mk-cur').textContent = '0:00';
  byId('mk-dur').textContent = fmt(t.duration_sec);
  byId('mk-seek').value = 0;
  const cizgi = byId('mk-dock-bar'); if (cizgi) cizgi.style.width = '0%';
  byId('mk-baslik').textContent = clean(t.title);
  byId('mk-alt').textContent = t._playlistName || '';
  byId('mk-album').innerHTML = `${safe(sanatciAdi(t))} <button class="mk-info" type="button" id="mk-info-sahne" aria-label="Parça bilgisi">i</button>`;
  const sahneBilgi = byId('mk-info-sahne');
  if (sahneBilgi) sahneBilgi.onclick = () => detayGoster(t);
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
          <span class="ad">${safe(clean(t.title))}</span><small class="alt">${safe(sanatciAdi(t))}</small></span>
        <span class="sure">${fmt(t.duration_sec)}<button class="mk-info" type="button" data-info="${i}" aria-label="Parça bilgisi">i</button></span>
      </li>`).join('')}</ol>`;
}

function istatistikCiz(brand) {
  // Canlı yayın sekmesi sayıma girmez: aynı parçalar listelerde zaten sayılıyor.
  const gercek = listeler.filter(pl => !pl._canli);
  const parcaSayisi = gercek.reduce((n, pl) => n + pl._tracks.length, 0);
  const toplam = gercek.reduce((n, pl) => n + pl._sure, 0);
  byId('mk-stats').innerHTML = `
    <div class="mk-stat"><b>${gercek.length}</b><span>ÇALMA LİSTESİ</span></div>
    <div class="mk-stat"><b>${parcaSayisi}</b><span>PARÇA</span></div>
    <div class="mk-stat"><b>${sureMetni(toplam)}</b><span>TOPLAM AKIŞ</span></div>`;
  byId('mk-selam').textContent = 'DERİN RECORD × ' + String(brand.name || '').toUpperCase();
}

function ciz(brand, plist) {
  markaAdi = String(brand.name || '');
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
<div class="mk-arka" aria-hidden="true">
  <img src="/assets/kaset-filigran.png" alt="" class="k1">
  <img src="/assets/kaset-filigran.png" alt="" class="k2">
  <img src="/assets/kaset-filigran.png" alt="" class="k3">
  <img src="/assets/kaset-filigran.png" alt="" class="k4">
  <img src="/assets/kaset-filigran.png" alt="" class="k5">
</div>



<section class="mk-shell">
 <div class="mk-govde">
  <section class="mk-hero mk-shell">
    <div class="mk-hero-logo" aria-hidden="true"><img src="/assets/kaset-filigran.png" alt=""></div>
    <p class="mk-eyebrow" id="mk-selam">DERİN RECORD</p>
    <h1>${safe(brand.name)}</h1>
    ${brand.tagline ? `<p class="mk-tag">${safe(brand.tagline)}</p>` : ''}
    ${notlar.length ? `<div class="mk-notes">${notlar.map(n => `<span class="mk-note">${safe(n)}</span>`).join('')}</div>` : ''}
  </section>

  <div class="mk-tabs" id="mk-tabs"></div>

  <div class="mk-sag">
  <div class="mk-stage" id="mk-stage">
    <div class="mk-art" id="mk-art">${bosKapak()}
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
        <button id="mk-geri" type="button" aria-label="Önceki">${IKON.onceki}</button>
        <button class="mk-main" id="mk-oyna" type="button" aria-label="Oynat">${IKON.oynat}</button>
        <button id="mk-ileri" type="button" aria-label="Sonraki">${IKON.sonraki}</button>
        <button class="mk-shuffle" id="mk-karisik" type="button" aria-pressed="${karisik}"
          aria-label="Karışık çal" title="Karışık çal">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
            stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M16 3h5v5"/><path d="M4 20 21 3"/><path d="M21 16v5h-5"/>
            <path d="M15 15l6 6"/><path d="M4 4l5 5"/>
          </svg>
        </button>
        <div class="mk-vol"><button class="mk-sustur" id="mk-sustur" type="button" aria-label="Sesi kapat" aria-pressed="false"><svg class="mk-vol-ikon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M3 9.5h3.6L11.5 5v14l-4.9-4.5H3z" fill="currentColor"/><path class="ses-dalga" d="M15 9.2a4 4 0 0 1 0 5.6M17.8 6.6a7.6 7.6 0 0 1 0 10.8" fill="none" stroke="#cb2468" stroke-width="2.2" stroke-linecap="round"/><path class="ses-carpi" d="M15.5 9.5l5 5M20.5 9.5l-5 5" fill="none" stroke="#cb2468" stroke-width="2.2" stroke-linecap="round"/></svg></button><input type="range" id="mk-ses" min="0" max="100" value="100" aria-label="Ses"></div>
      </div>
      <p class="mk-sub" id="mk-durum" style="margin-top:14px"></p>
    </div>
  </div>

  <div class="mk-panel">
    <h3 id="mk-liste-baslik"></h3>
    <div id="mk-liste"></div>
  </div>
  </div>

  <!-- Sağ sütun: markanın karar verirken ihtiyaç duyduğu bilgi. Sayılar
       üstte, güven maddeleri altta. Kahramandan buraya taşındı: ekranın
       sağı boş duruyordu, çalan parça da aşağı iniyordu. -->
  <aside class="mk-bilgi">
    <div class="mk-stats" id="mk-stats"></div>
    <div class="mk-guven">
      <div>
        <b>KENDİ ÜRETİMİMİZ</b>
        <p>Bu sunumdaki parçalar Derin Record stüdyosunda üretildi. Hazır katalogdan seçilmedi.</p>
      </div>
      <div>
        <b>MARKAYA ÖZEL</b>
        <p>Listeler bu marka için hazırlanır; başka bir mekânda aynısı yayınlanmaz.</p>
      </div>
      <div>
        <b>KULLANIM KAPSAMI</b>
        <p>Yayın, anlaşmalı marka ve şubeleriyle sınırlıdır. Koşullar sözleşmede tanımlanır.</p>
      </div>
    </div>
  </aside>
 </div>


  <div class="mk-foot">
    <span>DERİN RECORD · ÖZEL SUNUM</span>
    <span>${new Date().getFullYear()}</span>
  </div>

  <div class="mk-dock" id="mk-dock" role="region" aria-label="Şu an çalan">
    <span class="mk-dock-art" id="mk-dock-art"><span class="ph" aria-hidden="true">♪</span></span>
    <span class="mk-dock-meta"><b id="mk-dock-baslik">—</b><span id="mk-dock-alt"></span></span>
    <span class="mk-dock-cmds">
      <button id="mk-dock-geri" type="button" aria-label="Önceki">${IKON.onceki}</button>
      <button class="mk-dock-main" id="mk-dock-oyna" type="button" aria-label="Oynat">${IKON.oynat}</button>
      <button id="mk-dock-ileri" type="button" aria-label="Sonraki">${IKON.sonraki}</button>
    </span>
    <i class="mk-dock-bar" id="mk-dock-bar" aria-hidden="true"></i>
  </div>
</section>`;

  istatistikCiz(brand);
  acikListe = listeler[0] || null;
  kuyruk = acikListe ? acikListe._tracks : [];
  duzen = [];
  tabsCiz();
  listeCiz();
  doldur(kuyruk[0] || null);
  if (!listeler.length) bosSunum();
  bagla();
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
    duzen = [];
    sira = -1;
    tabsCiz();
    listeCiz();
    if (devam && kuyruk.length) await gecisCal(0);
    else { satirlariIsaretle(); sahneYaz(kuyruk[0] || null); }
  });

  byId('mk-liste').addEventListener('click', e => {
    const bilgi = e.target.closest('.mk-info');
    if (bilgi) {
      e.stopPropagation();
      const tb = kuyruk[Number(bilgi.dataset.info)];
      if (tb) detayGoster(tb);
      return;
    }
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
  // Oynat/duraklat ikonu iki kumandada da (sahne + alt çubuk) aynı kalsın.
  const oynaIkon = () => {
    const im = audio.paused ? IKON.oynat : IKON.durdur;
    const etiket = audio.paused ? 'Oynat' : 'Duraklat';
    ['mk-oyna', 'mk-dock-oyna'].forEach(id => {
      const b = byId(id);
      if (b) { b.innerHTML = im; b.setAttribute('aria-label', etiket); }
    });
  };
  audio.addEventListener('play', oynaIkon);
  audio.addEventListener('pause', oynaIkon);
  oynaIkon();

  // Karışık çal aç/kapa: sıra yeniden kurulur, o an çalan parça korunur.
  const karisikDugme = byId('mk-karisik');
  if (karisikDugme) karisikDugme.onclick = () => {
    karisik = !karisik;
    karisikDugme.setAttribute('aria-pressed', karisik ? 'true' : 'false');
    duzen = duzenKur();
    durum(karisik ? 'Karışık çalma açık.' : 'Karışık çalma kapalı.');
  };

  byId('mk-ileri').onclick = () => { const i = sonraki(1); if (i >= 0) gecisCal(i); };
  byId('mk-geri').onclick = () => {
    if (audio.currentTime > 3) { audio.currentTime = 0; return; }
    const i = sonraki(-1);
    if (i >= 0) gecisCal(i);
  };
  // Simgeye basınca ses tamamen kapanır ve kaydırıcı en sola gelir; yeniden
  // basınca önceki seviyeye döner. Sessiz durum ses kontrolüne bildirilir
  // (panelde ses kapalı görünür). Kapalıyken kaydırıcı oynatılırsa ses açılır.
  const sustur = kapali => {
    audio.muted = kapali;
    const d = byId('mk-sustur');
    d.setAttribute('aria-pressed', String(kapali));
    d.setAttribute('aria-label', kapali ? 'Sesi aç' : 'Sesi kapat');
    byId('mk-ses').value = kapali ? 0 : Math.round(seviye * 100);
    sesDegisti();
  };
  byId('mk-ses').oninput = e => {
    const deger = Number(e.target.value);
    if (audio.muted) { if (!deger) return; seviye = deger / 100; sustur(false); }
    seviye = deger / 100; iptalFade(); audio.volume = seviye;
  };
  byId('mk-sustur').onclick = () => sustur(!audio.muted);
  byId('mk-seek').addEventListener('input', () => { surukluyor = true; });
  byId('mk-seek').addEventListener('change', e => {
    surukluyor = false;
    if (isFinite(audio.duration) && audio.duration) audio.currentTime = (Number(e.target.value) / 1000) * audio.duration;
  });
  document.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT') return;
    if (e.key === 'ArrowRight') byId('mk-ileri').click();
    else if (e.key === 'ArrowLeft') byId('mk-geri').click();
    else if (e.key === ' ') { e.preventDefault(); byId('mk-oyna').click(); }
  });

  // Alt mini oynatıcı: sahne görünürken gizli kalır, aşağı kaydırınca belirir.
  // Kumandalar sahneyle aynı düğmelere delege edilir; ikinci bir çalma mantığı yok.
  const dok = byId('mk-dock');
  const dokOyna = byId('mk-dock-oyna');
  if (dokOyna) {
    byId('mk-dock-geri').onclick = () => byId('mk-geri').click();
    byId('mk-dock-ileri').onclick = () => byId('mk-ileri').click();
    dokOyna.onclick = () => byId('mk-oyna').click();
  }
  const sahne = byId('mk-stage');
  if (dok && sahne && 'IntersectionObserver' in window) {
    new IntersectionObserver(girisler => {
      const gorunur = girisler[0].isIntersecting;
      dok.classList.toggle('acik', !gorunur && kuyruk.length > 0);
    }, { threshold: 0.12 }).observe(sahne);
  }
}

// Parçanın sahibi: kredi girilmişse sanatçı, yoksa Derin Record.
const sanatciAdi = t => (t && t.sanatci) ? String(t.sanatci) : 'Derin Record';

function detayGoster(t) {
  const kapakPath = t.cover_path || t._playlistCover || markaKapak;
  const ov = document.createElement('div');
  ov.className = 'mk-ov';
  ov.innerHTML = `
    <div class="mk-card" role="dialog" aria-modal="true">
      ${kapak(kapakPath) ? `<img src="${safe(kapak(kapakPath))}" alt="">` : '<div class="ph">♪</div>'}
      <h3>${safe(clean(t.title))}</h3>
      <p class="mk-card-sanatci">${safe(sanatciAdi(t))}</p>
      <p>${safe(t._playlistName || '')}${t.duration_sec ? ' · ' + fmt(t.duration_sec) : ''}</p>
      ${t.kredi ? `<p class="mk-card-kredi">${safe(t.kredi)}</p>` : ''}
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

// ---------- Şube yayını: geçmiş, çalan parça, yayın saatleri, anons ----------
let yayinSaati = { acilis: null, kapanis: null };
let ilkCalis = true;
let duraklatildi = false;
let yuklemeHatasi = false;
let ardisikHata = 0;   // "devam" yalnız gerçek duraklatmadan sonra yazılır
let duraklatmaSebebi = null;
let anonsta = false;
let sonAnons = null;

function parcaDegisti(t) {
  if (!t) return;
  // Canlı yayın sekmesinin kimliği uuid değildir: sunucuya liste kimliği gitmez.
  G.calaniBildir(baglam, {
    track_id: t.id, title: clean(t.title),
    playlist_id: t._playlistId === CANLI_ID ? null : t._playlistId, playlist_name: t._playlistName
  });
}

const dakika = v => {
  const m = String(v || '').match(/^(\d{1,2}):(\d{2})/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};
function simdiDakika() {
  const parcalar = new Intl.DateTimeFormat('tr-TR', {
    timeZone: 'Europe/Istanbul', hour: '2-digit', minute: '2-digit', hour12: false
  }).formatToParts(new Date());
  const al = tip => Number(parcalar.find(p => p.type === tip).value);
  return al('hour') * 60 + al('minute');
}
// Saat girilmemişse yayın kesintisiz sürer (paneldeki kural).
function mesaideMi() {
  const { acilis, kapanis } = yayinSaati;
  if (acilis === null || kapanis === null || acilis === kapanis) return true;
  const an = simdiDakika();
  if (acilis < kapanis) return an >= acilis && an < kapanis;
  return an >= acilis || an < kapanis;   // gece yarısını aşan mesai
}
// Dokunuşsuz kurulum (panel: ?kiosk=1): cihaz açılışta ve mesai başlayınca kendiliğinden çalar.
const kiosk = new URLSearchParams(location.search).get('kiosk') === '1';
let mesaiIleDurdu = false;
function mesaiDenetle() {
  if (kiosk && mesaideMi() && audio.paused && mesaiIleDurdu && kuyruk.length) {
    mesaiIleDurdu = false;
    if (sira < 0) gecisCal(0); else audio.play().catch(() => {});
    durum('');
    return;
  }
  if (mesaideMi() || audio.paused) return;
  mesaiIleDurdu = true;
  duraklatmaSebebi = 'mesai-disi';
  audio.pause();
  durum('Yayın saatleri dışında.');
  G.olay(baglam, 'mesai', 'disi');
}

// Çalma/duraklatma panele beklemeden gider: dakikalık yoklamayı beklemek,
// panelde duraklatılmış şubeyi bir dakika "çalıyor" gösteriyordu.
function anlikBildir() {
  const caliyor = !audio.paused && !!audio.src;
  G.baglan({ client, anahtar, kod: G.kayitliKod(anahtar), calarMi: caliyor }).catch(() => {});
  G.sesBildir(baglam, { seviye: audio.muted ? 0 : seviye * 100, ilerliyor: caliyor ? true : null });
}

function sesOlaylariniBagla() {
  audio.addEventListener('play', () => {
    if (!mesaideMi()) { mesaiDenetle(); return; }
    const t = kuyruk[sira];
    const ad = t ? clean(t.title) + (t._playlistName ? ' · ' + t._playlistName : '') : '';
    // Parça geçişi de 'play' yollar: geçmişe yalnız ilk çalış ve duraklatma
    // sonrası devam yazılır, her parça için satır açılmaz.
    const durumDegisti = ilkCalis || duraklatildi;
    if (ilkCalis) G.olay(baglam, 'caliyor', ad || null);
    else if (duraklatildi) G.olay(baglam, 'devam', ad || null);
    ilkCalis = false;
    duraklatildi = false;
    if (durumDegisti) anlikBildir();
  });
  audio.addEventListener('pause', () => {
    // Parça sonu ve parça geçişi duraklatma sayılmaz.
    if (gecisVar || audio.ended || (audio.duration > 0 && audio.currentTime >= audio.duration - 0.75)) return;
    const sebep = duraklatmaSebebi || 'cihaz';
    duraklatmaSebebi = null;
    duraklatildi = true;
    G.olay(baglam, 'durakladi', sebep);
    anlikBildir();
  });
  // Tek parça açılamazsa ekran sıradakine geçer: bu yalnız geçmişe yazılır.
  // Art arda iki parça açılamıyorsa yayın gerçekten sorunludur: alarm olayı.
  audio.addEventListener('error', () => {
    const t = kuyruk[sira];
    ardisikHata++;
    const tur = ardisikHata >= 2 ? 'yuklenemedi' : 'parca-acilamadi';
    if (t) G.olay(baglam, tur, clean(t.title));
    if (tur === 'yuklenemedi') yuklemeHatasi = true;
  });
  // Bir parça gerçekten çalmaya başlarsa sayaç sıfırlanır, alarm varsa kapanır.
  audio.addEventListener('playing', () => {
    ardisikHata = 0;
    if (!yuklemeHatasi) return;
    yuklemeHatasi = false;
    G.olay(baglam, 'duzeldi', 'parça açıldı');
  });
}

async function anonslariYokla() {
  if (anonsta) return;
  let r;
  try {
    r = await client.rpc('radio_anonslar', {
      p_player_key: anahtar, p_device_id: G.cihazKimligi(),
      p_since: sonAnons || new Date(Date.now() - 60000).toISOString()
    });
  } catch { return; }
  const yeni = r && Array.isArray(r.data) ? r.data : [];
  for (const a of yeni) {
    sonAnons = a.created_at;
    await anonsCal(a);
  }
}
async function anonsCal(a) {
  if (!a || !a.storage_path) return;
  anonsta = true;
  const caliyordu = !audio.paused;
  try {
    if (caliyordu) await fade(0.12, 600);
    durum('Anons' + (a.label ? ' — ' + a.label : ''));
    const ses = new Audio(urly('radio-announcements', a.storage_path));
    await new Promise(bitti => {
      ses.onended = bitti; ses.onerror = bitti;
      ses.play().catch(bitti);
      setTimeout(bitti, 180000);
    });
    if (caliyordu) await fade(seviye, 800);
    durum('');
  } finally { anonsta = false; }
}

// ---------- Açılış ----------
// Başka cihaza bağlı linkte kod girmek işe yaramaz: form gizlenir, yalnız mesaj kalır.
function kodFormu(gorunur) {
  const form = byId('mk-kod').closest('.mk-code');
  if (form) form.hidden = !gorunur;
  // Kod sorulmuyorsa "kodu girin" yönergeleri de gizlenir: yalnız mesaj kalır.
  document.querySelectorAll('#mk-lock > p:not(.mk-eyebrow):not(.mk-err)')
    .forEach(el => { el.hidden = !gorunur; });
}
function kilitKarti(mesaj, sebep) {
  byId('mk-app').hidden = true;
  byId('mk-lock').hidden = false;
  byId('mk-hata').textContent = mesaj || '';
  kodFormu(sebep !== 'kilitli');
}

function kapanisDinle() {
  window.addEventListener('derin:sube-kapandi', e => {
    duraklatmaSebebi = 'cihaz-kilidi';
    try { audio.pause(); } catch { /* yok say */ }
    kilitKarti((e.detail && e.detail.mesaj) || 'Yayın kapandı.', e.detail && e.detail.sebep);
  });
}

// Marka pasife alınır ya da abonelik biterse yayın en geç bir dakikada kesilir;
// marka yeniden yayına alınınca sayfa kendini yeniler (kayıtlı kodla açılır).
const KAPALI_MESAJ = 'Yayın şu an kapalı. Derin Record ile iletişime geçin.';
let yayinKapali = false;
async function yayinDenetle() {
  let m;
  try {
    m = await client.rpc('sube_sunum_marka', { p_player_key: anahtar, p_device_id: G.cihazKimligi() });
  } catch { return; }
  if (!m || m.error || !Array.isArray(m.data)) return;   // bağlantı sorunu: yayını kesme
  if (!m.data.length && !yayinKapali) {
    yayinKapali = true;
    duraklatmaSebebi = 'yayin-kapandi';
    try { audio.pause(); } catch { /* yok say */ }
    kilitKarti(KAPALI_MESAJ, 'kilitli');
  } else if (m.data.length && yayinKapali) {
    location.reload();
  }
}

// ---------- Ses kontrolü ----------
// Dakikada bir: ekrandaki ses seviyesi (sessize alındıysa 0) ve çalan parçanın
// son ölçümden beri ilerleyip ilerlemediği panele gider. Ses düğmesi sıfıra
// çekilince beklemeden bildirilir.
let sonSesZamani = null;
// Süren ses sorunu ('ses-kapali' | 'takildi' | null). Sorun başlayınca ve
// bitince bağlantı geçmişine olay düşer; sunucu bundan panel ve Telegram
// alarmı üretir (supabase/radio-sube-alarm.sql). Duraklatılmış yayında
// sorun değerlendirilmez.
let sesSorunu = null;
function sesSorunuDenetle(caliyor, ilerliyor) {
  if (!caliyor) return;
  const sessiz = audio.muted || seviye <= 0;
  const yeni = sessiz ? 'ses-kapali' : (ilerliyor === false ? 'takildi' : null);
  if (yeni === sesSorunu) return;
  const eski = sesSorunu;
  sesSorunu = yeni;
  const t = kuyruk[sira];
  if (yeni) G.olay(baglam, yeni, t ? clean(t.title) : null);
  else G.olay(baglam, 'duzeldi', eski);
}
function sesOlcVeBildir() {
  const caliyor = !audio.paused && !!audio.src;
  const an = audio.currentTime;
  const ilerliyor = caliyor ? (sonSesZamani === null || an !== sonSesZamani) : null;
  sonSesZamani = caliyor ? an : null;
  G.sesBildir(baglam, { seviye: audio.muted ? 0 : seviye * 100, ilerliyor });
  sesSorunuDenetle(caliyor, ilerliyor);
}
let sesZamanlayici = null;
function sesDegisti() {
  clearTimeout(sesZamanlayici);
  sesZamanlayici = setTimeout(() => {
    const caliyor = !audio.paused && !!audio.src;
    G.sesBildir(baglam, { seviye: audio.muted ? 0 : seviye * 100, ilerliyor: caliyor ? true : null });
    sesSorunuDenetle(caliyor, caliyor ? true : null);
  }, 1500);
}

// ---------- Canlı yayın (panel › Yayın başlat) ----------
// Panelden şubeye (ya da markanın geneline) gönderilen yayın, listelerin önünde
// "CANLI YAYIN" sekmesi olarak durur. Yayın değişince (Yayın başlat) şube o anda
// ona geçer; GENEL YAYINA DÖN ile önceki yayına dönülünce personelin o sırada
// seçili olan listesi geri gelir. Kaynak 30 sn'de bir yoklanır.
const CANLI_ID = 'canli-yayin';
let canliImza = null;       // yürürlükteki kaynağın kimliği (klasör/liste + güncelleme zamanı)
let geriDonus = null;       // { imza, listeId }: Yayın başlat'tan önceki durum

function canliListeKur(satirlar) {
  const ilk = satirlar[0];
  const parcalar = satirlar.filter(x => x.track_id && x.storage_path);
  const pl = {
    id: CANLI_ID, name: 'CANLI YAYIN · ' + (ilk.folder_name || ''), cover_path: ilk.cover_path,
    created_at: ilk.updated_at, _canli: true, _karisik: !!ilk.shuffle, _baslangic: ilk.start_track_id,
    _tracks: parcalar.map(x => ({
      id: x.track_id, title: x.title, storage_path: x.storage_path, cover_path: null,
      duration_sec: null, _playlistId: CANLI_ID, _playlistName: 'Canlı yayın · ' + (ilk.folder_name || ''),
      _playlistCover: ilk.cover_path
    }))
  };
  // Süre ve kapak canlı yayın cevabında yok: aynı parça listelerde varsa oradan alınır.
  const bilinen = new Map();
  listeler.forEach(x => { if (!x._canli) x._tracks.forEach(t => bilinen.set(String(t.id), t)); });
  pl._tracks.forEach(t => {
    const b = bilinen.get(String(t.id));
    if (b) { t.duration_sec = b.duration_sec; t.cover_path = b.cover_path; t.sanatci = b.sanatci; t.kredi = b.kredi; }
  });
  pl._sure = pl._tracks.reduce((n, t) => n + (Number(t.duration_sec) || 0), 0);
  return pl;
}

function listeyeGec(pl, { cal }) {
  acikListe = pl;
  kuyruk = pl ? pl._tracks : [];
  duzen = [];
  sira = -1;
  if (pl && pl._canli) {
    karisik = pl._karisik;
    const k = byId('mk-karisik');
    if (k) k.setAttribute('aria-pressed', karisik ? 'true' : 'false');
  }
  tabsCiz();
  listeCiz();
  const bas = pl && pl._baslangic ? Math.max(0, kuyruk.findIndex(t => es(t.id, pl._baslangic))) : 0;
  if (cal && kuyruk.length) gecisCal(bas);
  else { satirlariIsaretle(); sahneYaz(kuyruk[bas] || kuyruk[0] || null); }
}

async function canliYayinYokla() {
  let r;
  try {
    r = await client.rpc('radio_now_playing', { p_player_key: anahtar, p_device_id: G.cihazKimligi() });
  } catch { return; }
  if (!r || r.error || !Array.isArray(r.data)) return;   // bağlantı sorunu: olduğu gibi kal
  const satirlar = r.data.filter(x => x.track_id);
  const imza = satirlar.length ? [satirlar[0].folder_id, satirlar[0].updated_at].join('|') : null;
  if (imza === canliImza) return;

  const ilkAcilis = canliImza === null && !ilkKaynakGoruldu;
  ilkKaynakGoruldu = true;
  const caliyordu = !audio.paused && !!audio.src;
  const onceki = canliImza;
  canliImza = imza;

  const eskiIndeks = listeler.findIndex(x => x._canli);
  if (eskiIndeks >= 0) listeler.splice(eskiIndeks, 1);
  const canli = imza ? canliListeKur(satirlar) : null;
  if (canli) listeler.unshift(canli);

  if (ilkAcilis) {
    // Açılış: kaynak varsa varsayılan sekme odur; ses yalnız dokunuşla ya da kiosk'ta başlar.
    if (canli) listeyeGec(canli, { cal: false }); else tabsCiz();
    istatistikCiz(markaBilgi);
    return;
  }

  if (geriDonus && imza === geriDonus.imza) {
    // GENEL YAYINA DÖN: Yayın başlat'tan önceki seçime geri dönülür.
    const hedef = listeler.find(x => es(x.id, geriDonus.listeId)) || canli || listeler[0] || null;
    geriDonus = null;
    listeyeGec(hedef, { cal: caliyordu });
    durum('Genel yayına dönüldü.');
  } else if (canli) {
    // Yeni yayın başlatıldı: şube o anda ona geçer.
    if (!geriDonus) geriDonus = { imza: onceki, listeId: acikListe ? acikListe.id : null };
    listeyeGec(canli, { cal: caliyordu || kiosk });
    durum('Canlı yayın başladı: ' + (satirlar[0].folder_name || ''));
    G.olay(baglam, 'liste', 'canlı yayın · ' + (satirlar[0].folder_name || ''));
  } else {
    // Yayın tamamen kaldırıldı: personelin listesine dönülür.
    const hedef = (geriDonus && listeler.find(x => es(x.id, geriDonus.listeId))) || listeler[0] || null;
    geriDonus = null;
    if (acikListe && acikListe._canli) listeyeGec(hedef, { cal: caliyordu });
    else tabsCiz();
    durum('Canlı yayın kaldırıldı.');
  }
  istatistikCiz(markaBilgi);
}
let ilkKaynakGoruldu = false;
let markaBilgi = null;

function satirlariListeyeCevir(satirlar) {
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
        sanatci: x.sanatci || null, kredi: x.kredi || null,
        _playlistId: x.playlist_id, _playlistName: x.name, _playlistCover: x.cover_path
      });
    }
  });
  const sonuc = [...gorulen.values()];
  sonuc.forEach(pl => { pl._sure = pl._tracks.reduce((n, t) => n + (Number(t.duration_sec) || 0), 0); });
  return sonuc;
}

let acildi = false;
async function ac(kod) {
  const hata = byId('mk-hata');
  const dugme = byId('mk-gir');
  hata.textContent = 'Kontrol ediliyor…';
  dugme.disabled = true;
  const s = await G.baglan({ client, anahtar, kod });
  dugme.disabled = false;
  if (s.durum === 'baglanti') {
    hata.textContent = s.mesaj;
    setTimeout(() => ac(G.kayitliKod(anahtar)), 15000);
    return;
  }
  if (s.durum !== 'tamam') {
    hata.textContent = s.mesaj;
    if (s.durum === 'kilitli') {
      G.olay(baglam, 'kilitlendi', 'bu link başka bir cihaza kayıtlı');
      kodFormu(false);
    }
    if (s.durum === 'kod-yanlis') G.olay(baglam, 'kod-yanlis', 'girilen kod bu şubeye ait değil');
    byId('mk-kod').value = '';
    return;
  }

  const cihaz = G.cihazKimligi();
  const m = await client.rpc('sube_sunum_marka', { p_player_key: anahtar, p_device_id: cihaz });
  const brand = m && !m.error && Array.isArray(m.data) ? m.data[0] : null;
  if (!brand) {
    hata.textContent = KAPALI_MESAJ;
    kodFormu(false);
    // Marka yeniden yayına alınınca kendiliğinden açılsın.
    setTimeout(() => ac(G.kayitliKod(anahtar)).catch(() => {}), 60000);
    return;
  }
  kodFormu(true);
  yayinSaati = { acilis: dakika(brand.open_time), kapanis: dakika(brand.close_time) };

  try {
    const k = await client.rpc('sube_sunum_kapak', { p_player_key: anahtar, p_device_id: cihaz });
    if (k && !k.error && typeof k.data === 'string' && k.data) markaKapak = k.data;
  } catch { /* marka kapağı kullanılmaz */ }

  const r = await client.rpc('sube_sunum_liste', { p_player_key: anahtar, p_device_id: cihaz });
  listeler = satirlariListeyeCevir(r && !r.error && Array.isArray(r.data) ? r.data : []);

  hata.textContent = '';
  if (acildi) return;
  acildi = true;
  markaBilgi = brand;
  ciz(brand, listeler);
  await canliYayinYokla();
  sesOlaylariniBagla();
  kapanisDinle();
  G.olay(baglam, 'acildi', 'müşteri sunumu');
  G.nabizBaslat({ client, anahtar, calarMi: () => !audio.paused });
  setInterval(mesaiDenetle, 60000);
  setInterval(yayinDenetle, 60000);
  setInterval(canliYayinYokla, 30000);
  setInterval(sesOlcVeBildir, 60000);
  const sesDugmesi = byId('mk-ses');
  if (sesDugmesi) sesDugmesi.addEventListener('change', sesDegisti);
  audio.addEventListener('volumechange', () => { if (audio.muted) sesDegisti(); });
  setInterval(anonslariYokla, 15000);
  if (!mesaideMi()) {
    durum('Yayın saatleri dışında.');
    mesaiIleDurdu = true;
  } else if (kiosk && kuyruk.length) {
    gecisCal(0);
  }
}

byId('mk-gir').onclick = () => {
  const kod = byId('mk-kod').value.trim();
  if (!kod) { byId('mk-hata').textContent = G.MESAJ['kod-gerekli']; return; }
  ac(kod).catch(err => { byId('mk-hata').textContent = 'Beklenmeyen hata: ' + (err.message || ''); });
};
byId('mk-kod').addEventListener('keydown', e => { if (e.key === 'Enter') byId('mk-gir').click(); });

if (!anahtar) {
  // Eski marka linki (/coffee/<marka>) ya da eksik kopyalanmış şube linki.
  byId('mk-hata').textContent = /\/coffee\/s\//.test(location.pathname)
    ? G.MESAJ['tanınmadı']
    : 'Bu link artık kullanılmıyor. Şubenize iletilen linki kullanın.';
  kodFormu(false);
} else {
  // Kafede zaten bağlı olan cihaz kod sorulmadan açılır: sunucu cihazı tanır.
  ac(G.kayitliKod(anahtar)).catch(err => { byId('mk-hata').textContent = 'Beklenmeyen hata: ' + (err.message || ''); });
}
})();
