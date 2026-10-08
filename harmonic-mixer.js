(() => {
  const byId = id => document.getElementById(id);
  const safe = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  // Sıralama/skor/geçiş hesabı harmonic-set.js'te: burası yalnız çizer ve yazar.
  const H = window.DerinHarmonicSet;
  const parseKey = H.parseKey;
  // Ses dosyası yardımcıları tek kaynaktan gelir: audio-file-types.js.
  // Supabase ücretsiz planda tek nesne sınırı 50 MiB (52.428.800 bayt); uzun bir
  // WAV bunu aşar ve ham yükleme "size çok büyük" hatası verir.
  const Ses = window.DerinAudioTypes;

  let client = null, tracks = [], set = [], selected = null;

  async function boot() {
    await window.DerinAuth.ready;
    const a = window.DerinAuth; client = a.client;
    const st = byId('hm-status');
    if (!a.configured) { st.textContent = 'Bağlantı hazırlanıyor.'; return; }
    if (!a.user) { st.innerHTML = '<button class="account-button" id="hm-login">GİRİŞ YAP</button>';
      byId('hm-login').onclick = () => a.open(); return; }
    if (a.profile?.role !== 'admin') { st.textContent = 'Bu araç yalnızca yöneticilere açıktır.'; return; }
    st.textContent = '';
    ayarYukle();          // hedef hız tercihi tarayıcıdan okunur
    byId('hm-app').hidden = false;
    await load();
  }

  // Parçalı yüklemeyi mümkün kılan yardımcılar yoksa (eski önbellek) yükleme
  // yerine açık bir uyarı verilir; sessizce ham yüklemeye düşülmez.
  const sesHazir = () => !!(Ses && Ses.parcaliYukle && Ses.parcalariCoz);

  const djDepo = () => client.storage.from('dj-audio');

  // Kova belirli bir MIME listesiyle kısıtlanmışsa tarayıcının bildirdiği tip
  // reddedilir; bu durumda jenerik tip ile bir kez daha denenir.
  async function djYukle(yol, dilim, tip) {
    const ilk = await djDepo().upload(yol, dilim, { contentType: tip || 'audio/mpeg', upsert: false });
    if (!ilk.error) return { path: yol, error: null };
    if (/mime|content.?type/i.test(ilk.error.message || '')) {
      const ikinci = await djDepo().upload(yol, dilim, { contentType: 'application/octet-stream', upsert: false });
      if (!ikinci.error) return { path: yol, error: null };
      return { path: null, error: ikinci.error };
    }
    return { path: null, error: ilk.error };
  }
  const imzaliUrl = async path => {
    const { data, error } = await djDepo().createSignedUrl(path, 3600);
    return error ? null : data.signedUrl;
  };

  // Parçalı dosya tek bir nesne gibi çalınamaz: parçalar indirilip tarayıcıda
  // birleştirilir. Tek parçada doğrudan imzalı adres kullanılır.
  let aktifBlobUrl = null;
  async function sesUrl(path) {
    if (!sesHazir() || !Ses.parcaliMi(path)) return imzaliUrl(path);
    const parcalar = [];
    for (const p of Ses.parcalariCoz(path)) {
      const url = await imzaliUrl(p.path);
      if (!url) return null;
      const cevap = await fetch(url);
      if (!cevap.ok) return null;
      parcalar.push(await cevap.blob());
    }
    if (aktifBlobUrl) { try { URL.revokeObjectURL(aktifBlobUrl); } catch (e) {} }
    aktifBlobUrl = URL.createObjectURL(new Blob(parcalar, { type: 'audio/mpeg' }));
    return aktifBlobUrl;
  }

  async function load() {
    const { data, error } = await client.from('dj_tracks')
      .select('id,title,artist,audio_path,camelot,key_name,makam,bpm,energy,duration_sec')
      .order('created_at', { ascending:false });
    if (error) { byId('hm-status').textContent = error.message; return; }
    tracks = data || [];
    set = set.map(s => tracks.find(t => t.id === s.id)).filter(Boolean);
    render();
  }

  function suggestions() {
    const last = set.length ? set[set.length - 1] : selected;
    if (!last) return [];
    return tracks.filter(t => t.id !== last.id && !set.some(s => s.id === t.id))
      .map(t => ({ t, rel: H.relation(last.camelot, t.camelot), p: H.score(last, t) }))
      .filter(x => x.rel).sort((a, b) => b.p - a.p);
  }

  const keyChip = t => t.camelot
    ? `<span class="hm-key ${parseKey(t.camelot)?.L === 'B' ? 'b' : ''}">${safe(t.camelot)}</span>`
    : '<span class="hm-key" style="opacity:.4">ton yok</span>';

  const meta = t => [t.artist, t.key_name, t.makam, t.bpm ? t.bpm + ' BPM' : null, t.energy ? 'E' + t.energy : null]
    .filter(Boolean).map(safe).join(' · ') || 'meta veri eksik';

  // Öneri bağlantısı: dış servis anahtarı yok, arama sorgusuna götürür.
  function linkHtml(hedef) {
    const sorgu = H.oneriSorgusu(hedef);
    const l = H.aramaLinkleri(sorgu);
    return `<span class="hm-links">
      <span class="hm-chip">${safe(sorgu)}</span>
      <a class="hm-link" href="${safe(l.youtube)}" target="_blank" rel="noopener">YouTube'da ara ↗</a>
      <a class="hm-link" href="${safe(l.spotify)}" target="_blank" rel="noopener">Spotify'da ara ↗</a>
    </span>`;
  }

  const hizMetni = h => (h.bpmMin && h.bpmMax)
    ? (h.bpmMin === h.bpmMax ? h.bpmMin + ' BPM' : h.bpmMin + '–' + h.bpmMax + ' BPM')
    : 'hız bilgisi yok';

  const tonMetni = h => (h.tonlar && h.tonlar.length) ? h.tonlar.join(' · ') : 'ton bilgisi yok';

  // ---- Tarz önerisi: Deezer'ın benzer sanatçı algoritması --------------------
  // Spotify ve YouTube API anahtarı yok; tarayıcıdan api.deezer.com'a düz fetch
  // CORS'a takılır (allow-origin başlığı yok) ama Deezer JSONP destekliyor:
  // veri <script> ile okunur. Sonuç sanatçı bazında önbelleğe alınır ki her
  // çizimde yeniden sorulmasın.
  let dzSayac = 0;
  const tarzOnbellek = new Map();
  let tarzDurum = { sanatci: null, veri: null, hata: null, yukleniyor: false };

  function deezerOku(yol, parametreler) {
    return new Promise((cozum, ret) => {
      const ad = 'derinDz' + (++dzSayac);
      const betik = document.createElement('script');
      const temizle = () => { try { delete window[ad]; } catch (e) { window[ad] = null; } betik.remove(); };
      const zaman = setTimeout(() => { temizle(); ret(new Error('yanıt gelmedi')); }, 8000);
      window[ad] = veri => { clearTimeout(zaman); temizle(); cozum(veri); };
      const sorgu = new URLSearchParams(Object.assign({}, parametreler, { output: 'jsonp', callback: ad }));
      betik.src = 'https://api.deezer.com/' + yol + '?' + sorgu.toString();
      betik.onerror = () => { clearTimeout(zaman); temizle(); ret(new Error('bağlantı kurulamadı')); };
      document.head.appendChild(betik);
    });
  }

  async function tarzGetir(sanatci) {
    if (tarzOnbellek.has(sanatci)) return tarzOnbellek.get(sanatci);
    const ara = await deezerOku('search/artist', { q: sanatci, limit: 1 });
    const kaynak = ara && ara.data && ara.data[0];
    if (!kaynak) throw new Error('Deezer\'da bulunamadı');
    const benzer = await deezerOku('artist/' + kaynak.id + '/related', { limit: 10 });
    const liste = (benzer && benzer.data) || [];
    // İlk beş sanatçının öne çıkan parçaları da alınır: öneri sanatçı adı değil,
    // dinlenebilir parça olsun (30 sn önizleme Deezer'dan gelir).
    const ilk = await Promise.all(liste.slice(0, 5).map(async a => {
      try {
        const top = await deezerOku('artist/' + a.id + '/top', { limit: 2 });
        return Object.assign({}, a, { parcalar: (top && top.data) || [] });
      } catch (e) {
        return Object.assign({}, a, { parcalar: [] });
      }
    }));
    const veri = { kaynak, benzer: ilk.concat(liste.slice(5).map(a => Object.assign({}, a, { parcalar: [] }))) };
    tarzOnbellek.set(sanatci, veri);
    return veri;
  }

  // Referans parçanın ardından gelecek parçanın hedefi: yay yükseldiği için hız
  // bir adım yukarısı, ton da referanstan çıkılabilen tonlar.
  const tarzHedefi = t => {
    const bpm = Number(t && t.bpm) || null;
    return {
      tonlar: H.cikilanTonlar(t).slice(0, 3).map(x => x.ton),
      bpm,
      bpmMin: bpm,
      bpmMax: bpm ? bpm + H.HIZ_TOLERANS : null
    };
  };

  // ---- Hedef hız ayarı ------------------------------------------------------
  // Kullanıcının çalışma biçimi: "şu civardaki parçaları şu hıza sabitliyorum,
  // hızlılar sonraki hızlı bölüm için". Ayar tarayıcıda saklanır ki her açılışta
  // yeniden girilmesin; motorun varsayılanı nötr kalır.
  const AYAR_ANAHTARI = 'derin-harmonik-hiz-ayari';
  const VARSAYILAN_AYAR = { hedef: 126, tolerans: 4, hizliEsik: 135, hizliHedef: 145, inisTolerans: 2 };
  // İniş payı: tek bir küçük geri adım serbest, üst üste binemez. Ölçü komşu
  // adım değil zirveden sapmadır (motor tarafında INIS_TOLERANS).
  const INIS_PAYI_VARSAYILAN = 2;

  function ayarYukle() {
    let ayar = VARSAYILAN_AYAR;
    try {
      const ham = localStorage.getItem(AYAR_ANAHTARI);
      if (ham) {
        const okunan = JSON.parse(ham);
        ayar = {
          hedef: Number(okunan.hedef) || null,
          tolerans: okunan.tolerans == null ? 4 : Number(okunan.tolerans),
          hizliEsik: okunan.hizliEsik == null ? 135 : Number(okunan.hizliEsik),
          hizliHedef: okunan.hizliHedef == null ? 145 : Number(okunan.hizliHedef),
          inisTolerans: okunan.inisTolerans == null ? INIS_PAYI_VARSAYILAN : Number(okunan.inisTolerans)
        };
      }
    } catch (e) { /* gizli pencere ya da bozuk kayıt: varsayılanla devam */ }
    H.hizAyari(ayar);
    return ayar;
  }

  function ayarKaydet(ayar) {
    H.hizAyari(ayar);
    try {
      localStorage.setItem(AYAR_ANAHTARI, JSON.stringify({
        hedef: ayar.hedef, tolerans: ayar.tolerans,
        hizliEsik: ayar.hizliEsik, hizliHedef: ayar.hizliHedef,
        inisTolerans: ayar.inisTolerans
      }));
    } catch (e) { /* saklanamazsa da ayar bu oturumda geçerli */ }
  }

  const BOLUM_ETIKETI = { giris: 'AÇILIŞ', ana: 'SABİT HIZ', hizli: 'HIZLI BÖLÜM' };

  // Ayarlıyken hangi parça hangi bölüme düşüyor? Ekranda tek satırda gösterilir.
  function bolumOzeti() {
    const ayar = H.hizAyari();
    if (!ayar.hedef) return '<p style="opacity:.6;font-size:13px">Hedef hız kapalı: sıralama yalnız 5 BPM kuralına bakar.</p>';
    const say = { giris: [], ana: [], hizli: [] };
    set.forEach(t => {
      const ad = H.hizBolumu(t);
      (say[ad] || []).push(t);
    });
    const hizliSabit = set.filter(t => H.hizliSabit(Number(t.bpm) || 0));
    // Hızlı bölümdekiler yukarıda ayrıca yazıldığı için burada tekrarlanmaz.
    const sabit = set.filter(t => H.sabitlenen(t) && !H.hizliSabit(Number(t.bpm) || 0));
    const hedefMetni = t => `${t.bpm} → ${H.etkinBpm(t)}`;
    const liste = (dizi, adet) => dizi.slice(0, adet).map(t => `${safe(t.title)} (${hedefMetni(t)})`).join(', ')
      + (dizi.length > adet ? ' …' : '');
    return `<p>Ana bölüm hedefi: <b>${ayar.hedef} BPM</b> ± ${ayar.tolerans} BPM.
        İniş payı <b>${ayar.inisTolerans} BPM</b> (zirveden en fazla bu kadar aşağı).
        ${hizliSabit.length ? `<b>${hizliSabit.length} parça ${ayar.hizliEsik} BPM üstü olduğu için
          hızlı bölümde ${ayar.hizliHedef} BPM'e sabitleniyor:</b>
          ${liste(hizliSabit, 6)}.` : `${ayar.hizliEsik} BPM üstünde parça yok.`}</p>
      ${sabit.length ? `<p>Hedefe çekilen ${sabit.length} parça: ${liste(sabit, 6)}.</p>`
        : '<p style="opacity:.6">Bu aralıkta parça yok.</p>'}
      ${say.hizli.length ? `<p>Hızlı bölüm (setin sonuna): <b>${say.hizli.map(t => safe(t.title) + ' (' + hedefMetni(t) + ')').join(', ')}</b>.</p>`
        : '<p style="opacity:.6">Hızlı bölüm boş.</p>'}
      ${say.giris.length ? `<p>Açılış (setin başına): <b>${say.giris.map(t => safe(t.title) + ' (' + t.bpm + ')').join(', ')}</b>.</p>` : ''}`;
  }

  function hizAyariHtml() {
    const ayar = H.hizAyari();
    return `<section class="hm-panel" style="margin-top:20px">
      <h2>HEDEF HIZ — BÖLÜMLÜ SET</h2>
      <p style="font-size:12px;opacity:.65;margin:0 0 12px">
        Sıralamada öncelik hızdır: set her zaman <b>yavaştan hızlıya</b> akar, ton
        uyumu bu iskeletin içinde aranır.<br>
        Ana bölümü tek hıza sabitliyorsan (ör. 122 civarı parçaları 126'da çalıyorsan)
        bu aralıktaki parçalar <b>aynı hızda</b> sayılır — aralarında hız farkı kalmaz.
        Hedefin üstünde kalanlar <b>setin sonundaki hızlı bölüme</b>, altında kalanlar açılışa ayrılır.
        Hızlı bölüm de tek hıza çekilir: <b>eşiğin üstündeki parçalar hızlı hedefte</b> çalınır
        (ör. 135 üstü → 145).<br>
        <b>İniş payı</b>, setin zirvesinden en fazla ne kadar aşağı inebileceğidir:
        2 BPM'lik tek bir dalma serbest, arka arkaya gelen inişler cezalı. 0 yazarsan
        set kıl payı geri dönmez.</p>
      <div class="hm-edit" style="border:0;padding-top:0;margin-top:0">
        <input id="hz-hedef" type="number" value="${ayar.hedef || ''}" placeholder="Ana hedef BPM (126)">
        <input id="hz-tol" type="number" value="${ayar.tolerans}" placeholder="± BPM">
        <input id="hz-esik" type="number" value="${ayar.hizliEsik}" placeholder="Hızlı eşik BPM (135)">
        <input id="hz-hizli" type="number" value="${ayar.hizliHedef || ''}" placeholder="Hızlı hedef BPM (145)">
        <input id="hz-inis" type="number" value="${ayar.inisTolerans}" placeholder="İniş payı BPM (2)">
        <button id="hz-uygula">UYGULA</button>
        <button id="hz-kapat" style="background:rgba(255,255,255,.08);color:inherit;border:1px solid rgba(255,255,255,.2)">KAPAT</button>
      </div>
      <div style="margin-top:12px">${bolumOzeti()}</div>
    </section>`;
  }

  const disLinkler = (sorgu, etiket) => {
    const l = H.aramaLinkleri(sorgu);
    return `<span class="hm-links"><span class="hm-chip">${safe(sorgu)}</span>
      <a class="hm-link" href="${safe(l.youtube)}" target="_blank" rel="noopener">${safe(etiket || 'YouTube\'da ara')} ↗</a>
      <a class="hm-link" href="${safe(l.spotify)}" target="_blank" rel="noopener">Spotify\'da ara ↗</a></span>`;
  };

  // Tarz önerileri paneli: solda kendi kataloğundan tarz imzası, sağda Deezer
  // algoritmasından benzer sanatçılar. Her ikisi de parçanın tarzını taşır.
  function tarzPanel() {
    // Referans: kullanıcı katalogdan bir parça seçtiyse o, yoksa setin sonuncusu.
    // Böylece "en son çalan neyse ona göre" varsayılanı bozulmaz, isteyen başka
    // bir sanatçıyı da analiz ettirebilir.
    const ref = selected || (set.length ? set[set.length - 1] : null);
    if (!ref) return '<p style="opacity:.5;font-size:13px">Önce bir parça seç ya da set kur.</p>';
    const refNotu = (selected && (!set.length || set[set.length - 1].id !== selected.id)) ? 'seçili parça' : 'setin sonuncusu';
    const tarz = H.tarzEtiketi(ref);
    const hedef = tarzHedefi(ref);

    // Katalogdan uyan sanatçılar: dış servise çıkmadan, elimizdeki parçalarla.
    const katalogUyan = set.length ? H.uyumluSanatcilar(set, tracks, 4) : [];
    const katalogHtml = katalogUyan.length ? katalogUyan.map(x => `
      <div class="hm-track" style="cursor:default;align-items:flex-start">
        <span><strong>${safe(x.sanatci)}</strong>
          <small>${safe(x.tarz)} · ${x.bpm ? x.bpm + ' BPM' : 'hız yok'} · katalogda ${x.parcalar.length} parça uyar</small>
          <span class="hm-rel">${x.parcalar.slice(0, 3).map(t => `<span class="hm-chip">${safe(t.title)}${t.camelot ? ' · ' + safe(t.camelot) : ''}${t.bpm ? ' · ' + safe(String(t.bpm)) : ''}</span>`).join('')}</span>
          <span style="display:block;margin-top:7px">${disLinkler(H.oneriSorgusu({
            sanatci: x.sanatci, tarz: x.tarz, tonlar: hedef.tonlar, bpmMin: hedef.bpmMin, bpmMax: hedef.bpmMax
          }))}</span>
        </span>
      </div>`).join('')
      : '<p style="opacity:.6;font-size:13px">Katalogdaki başka sanatçılarda sete uyan parça yok.</p>';

    // Dış öneri: referans sanatçının benzerleri (Deezer). Tek sefer sorulur.
    const sanatci = String(ref.artist || '').trim();
    if (sanatci && tarzDurum.sanatci !== sanatci && !tarzDurum.yukleniyor) {
      tarzDurum = { sanatci, veri: null, hata: null, yukleniyor: true };
      // Yanıt gelince panel tazelenir. Kullanıcı o sırada form dolduruyorsa
      // çizim atlanır: alanlara yazdığı yazı silinmesin, bir sonraki
      // etkileşimde (ya da YENİLE ile) öneriler zaten görünür.
      const tazele = () => {
        const odak = document.activeElement;
        if (odak && odak.tagName === 'INPUT' && byId('hm-app') && byId('hm-app').contains(odak)) return;
        render();
      };
      tarzGetir(sanatci).then(veri => {
        tarzDurum = { sanatci, veri, hata: null, yukleniyor: false };
        tazele();
      }).catch(hata => {
        tarzDurum = { sanatci, veri: null, hata: String((hata && hata.message) || hata), yukleniyor: false };
        tazele();
      });
    }

    let disHtml;
    if (!sanatci) {
      disHtml = '<p style="opacity:.6;font-size:13px">Referans parçanın sanatçısı girilmemiş; tarz önerisi için sanatçı alanını doldur.</p>';
    } else if (tarzDurum.yukleniyor || tarzDurum.sanatci !== sanatci) {
      disHtml = '<p style="opacity:.6;font-size:13px">Benzeri sanatçılar aranıyor…</p>';
    } else if (tarzDurum.hata) {
      disHtml = `<p class="hm-warn">“${safe(sanatci)}” için dış öneri alınamadı (${safe(tarzDurum.hata)}).
        Yukarıdaki arama bağlantılarıyla devam edebilirsin.</p>`;
    } else {
      const liste = (tarzDurum.veri && tarzDurum.veri.benzer) || [];
      disHtml = liste.length ? liste.map(a => {
        const parca = (a.parcalar || [])[0];
        const sorgu = H.oneriSorgusu({ sanatci: a.name, tarz, tonlar: [], bpmMin: null, bpmMax: null }).replace(' mix', '');
        const l = H.aramaLinkleri(sorgu);
        return `<div class="hm-track" style="cursor:default;align-items:flex-start">
          <span><strong>${safe(a.name)}</strong>
            <small>${parca ? safe(parca.title) : 'Deezer önerisi'} · ${safe(tarz)}
              ${parca && parca.preview ? `<button data-onizleme="${safe(parca.preview)}" style="padding:2px 8px;border-radius:8px;font-size:10px;border:1px solid rgba(224,195,65,.5);background:rgba(224,195,65,.14);color:#e8d15a;cursor:pointer">▶ 30 sn</button>` : ''}</small>
            <span style="display:block;margin-top:7px"><span class="hm-links">
              <a class="hm-link" href="${safe(l.youtube)}" target="_blank" rel="noopener">Tarzında YouTube ↗</a>
              <a class="hm-link" href="${safe(l.spotify)}" target="_blank" rel="noopener">Spotify ↗</a>
              <a class="hm-link" href="${safe(a.link)}" target="_blank" rel="noopener">Deezer ↗</a></span></span>
          </span>
        </div>`;
      }).join('')
        : '<p style="opacity:.6;font-size:13px">Deezer bu sanatçı için benzer sanatçı döndürmedi.</p>';
    }

    return `<p>Referans (${safe(refNotu)}): <b>${safe(ref.title)}</b> · ${safe(ref.artist || 'sanatçı yok')} ·
        <b>${safe(tarz)}</b>${ref.bpm ? ' · ' + safe(String(ref.bpm)) + ' BPM' : ''}
        <span style="opacity:.6">— başka bir sanatçıyı görmek için katalogdan parça seç.</span></p>
      <p>Sıradaki parça hedefi: <b>${safe(hedef.tonlar.join(' · ') || 'ton bilgisi yok')}</b> tonunda,
        <b>${safe(hedef.bpmMin ? hedef.bpmMin + '–' + hedef.bpmMax + ' BPM' : 'hız bilgisi yok')}</b>
        — yay yükseldiği için bir adım yukarısı.</p>
      ${disLinkler(H.oneriSorgusu({ sanatci: ref.artist || '', tarz, tonlar: hedef.tonlar, bpmMin: hedef.bpmMin, bpmMax: hedef.bpmMax }))}
      <h2 style="margin:16px 0 10px">KENDİ KATALOĞUNDAN UYAN SANATÇILAR</h2>
      ${katalogHtml}
      <h2 style="margin:16px 0 10px">BENZERİ SANATÇILAR — DEEZER ALGORİTMASI
        <button id="tarz-yenile" style="float:right;padding:4px 10px;border-radius:9px;font-size:10px;border:1px solid rgba(255,255,255,.2);background:transparent;color:inherit;cursor:pointer">YENİLE</button></h2>
      ${disHtml}`;
  }

  // Geçiş uymadığında araya girecek parçanın tonu ve hızı. Hız farkı tek
  // köprüyle kapanmıyorsa iki adım ayrı ayrı yazılır.
  function kopruHtml(g) {
    const k = H.kopru(g.onceki, g.sonraki);
    // Başlık sorunun ton mu hız mı yay mı olduğunu söyler: ton tutup hız
    // uzaksa köprü, set geriye dönüyorsa sıra değişikliği gerekir.
    const baslik = g.inis ? 'SIRA GERİYE DÖNÜYOR — HIZ DÜŞÜYOR'
      : ((g.iliski && !g.yanYana) ? 'ARAYA KÖPRÜ — TON UYUMLU, HIZ UZAK' : 'KÖPRÜ PARÇASI GEREKİYOR');
    const yerlestir = `<b>${safe(tonMetni(k))}</b> tonunda, <b>${safe(hizMetni(k))}</b> aralığında bir parça koy.`;
    const hedef = !k.tekParca ? 'tek parça yetmiyor; aşağıdaki iki köprüyü sırayla kullan.'
      : (g.inis ? `bu ikilinin sırasını değiştir; olmuyorsa araya ${yerlestir}` : `arasına ${yerlestir}`);
    // İniş varsa cümle "arasına" ile kurulmaz: önce sıra düzeltilir.
    const cumle = g.inis
      ? `“${safe(g.onceki.title)}” ile “${safe(g.sonraki.title)}” arasında hız düşüyor: ${hedef}`
      : `“${safe(g.onceki.title)}” ile “${safe(g.sonraki.title)}” ${hedef}`;
    const iki = k.ikiAdim ? `
      <p><b>1. köprü:</b> <b>${safe(tonMetni(k.ikiAdim.birinci))}</b> tonunda,
        <b>${safe(hizMetni(k.ikiAdim.birinci))}</b> — önceki parçanın hızına yakın.<br>
        <b>2. köprü:</b> <b>${safe(tonMetni(k.ikiAdim.ikinci))}</b> tonunda,
        <b>${safe(hizMetni(k.ikiAdim.ikinci))}</b> — sonraki parçanın hızına yakın.</p>
      ${k.ikiAdim.ornek.length ? `<p>İki köprü birbirine de bağlanmalı; örnek zincir:
        <b>${safe(k.ikiAdim.ornek.map(o => o.birinci + ' → ' + o.ikinci).join('  ·  '))}</b></p>` : ''}
      ${linkHtml({ tonlar: k.ikiAdim.birinci.tonlar, bpmMin: k.ikiAdim.birinci.bpmMin, bpmMax: k.ikiAdim.birinci.bpmMax })}
      ${linkHtml({ tonlar: k.ikiAdim.ikinci.tonlar, bpmMin: k.ikiAdim.ikinci.bpmMin, bpmMax: k.ikiAdim.ikinci.bpmMax })}` : '';
    // Tarzı korumak için ayrı bir arama: köprü parçası da aynı tarzda olmalı.
    const tarzSatiri = g.onceki && g.onceki.artist
      ? `<p style="opacity:.85">Tarzı koru (${safe(g.onceki.artist)}): ${disLinkler(H.oneriSorgusu({
          sanatci: g.onceki.artist, tarz: H.tarzEtiketi(g.onceki), tonlar: k.tonlar, bpmMin: k.bpmMin, bpmMax: k.bpmMax
        }))}</p>` : '';
    return `<div class="hm-kopru">
      <b>${baslik}</b>
      <p>${cumle}
        ${g.sorunlar.length ? 'Sorun: ' + safe(g.sorunlar.join(', ')) + '.' : ''}</p>
      ${iki}
      ${k.not ? `<p class="hm-warn">${safe(k.not)}</p>` : ''}
      ${tarzSatiri}
      ${k.tekParca ? linkHtml({ tonlar: k.tonlar, bpmMin: k.bpmMin, bpmMax: k.bpmMax }) : ''}
    </div>`;
  }

  // Setin tamamına bakış. Yerel geçiş listesi yayı göstermez: tek tek
  // bakıldığında 122 → 124 ile 124 → 122 eşit derecede yakın görünür, oysa set
  // yavaştan hızlıya akmalı. Burada eğri, zirvenin yeri ve en büyük atlama yazılır.
  function yayHtml() {
    if (set.length < 2) return '<p style="opacity:.5;font-size:13px">Yay için en az iki parça gerekir.</p>';
    const y = H.yay(set);
    const hedefHiz = H.hizAyari().hedef;
    const satirlar = [`<p>Yay: <b>${safe(String(y.ilk))} → ${safe(String(y.son))} BPM</b>${hedefHiz ? ` (sabitlenen hızlar; ham ${y.ilkHam} → ${y.sonHam})` : ''} ·
      ${y.yukselen ? '<b>yükseliyor</b>' : 'zikzaklı'}.
      En hızlı parça <b>${safe(y.zirve.title)}</b> (${safe(String(y.zirve.bpm))} BPM),
      ${y.zirveYeri + 1}. sırada.</p>`];

    // Zirve sonda değilse setin ikinci yarısı yavaşlıyor demektir.
    if (y.zirveSonrasi > Math.floor(set.length * 0.2)) {
      satirlar.push(`<p class="hm-warn">Zirve erken: en hızlı parçadan sonra ${y.zirveSonrasi} parça
        daha geliyor. Setin en hızlı parçası sona yakın olmalı.</p>`);
    }

    // Geriye düşen adımlar: köprü değil, sıra değişikliği ister. Ölçü zirveden
    // sapmadır; küçük adımlarla oluşan uzun inişler de böylece yakalanır.
    y.inisler.forEach(g => satirlar.push(`<p class="hm-warn">“${safe(g.onceki.title)}” →
      “${safe(g.sonraki.title)}”: hız zirveden <b>${g.dusus} BPM</b> aşağı iniyor. Bu ikilinin
      sırasını değiştir ya da araya daha yavaş bir parça koy.</p>`));

    // En büyük çıkış: araya ısınma parçası koymak için hedef hız.
    let atlama = null;
    set.slice(1).forEach((t, i) => {
      const onceki = set[i];
      const artis = (Number(t.bpm) || 0) - (Number(onceki.bpm) || 0);
      if (artis > 10 && (!atlama || artis > atlama.artis)) atlama = { artis, onceki, sonraki: t };
    });
    if (atlama) {
      const orta = Math.round(((Number(atlama.onceki.bpm) || 0) + (Number(atlama.sonraki.bpm) || 0)) / 2);
      satirlar.push(`<p>En büyük çıkış: “${safe(atlama.onceki.title)}” → “${safe(atlama.sonraki.title)}”
        arasında <b>${atlama.artis} BPM</b> atlama var; araya <b>${orta} BPM</b> civarı bir
        ısınma parçası yayı düzler.</p>`);
    }

    if (satirlar.length === 1) {
      satirlar.push('<p style="opacity:.65">Set baştan sona yükseliyor; tek tek hız düşüşü yok.</p>');
    }
    return satirlar.join('');
  }

  // Uymayan parçalar: setin içinde kopukluk yaratanlar ve sete hiç giremeyenler.
  function uyumsuzPanel() {
    if (!set.length) return '<p style="opacity:.5;font-size:13px">Set boş: önce parça ekle.</p>';
    const icinde = H.uymayanlar(set);
    const disi = H.setDisiKalanlar(set, tracks);
    const tonlar = H.uyumluTonlar(set, 3).map(x => x.ton);
    // Yerine aranacak parçanın hızı, bu tonlara uyan setteki parçaların hızına
    // göre verilir: setin tamamının 96–131 gibi geniş aralığı işe yaramaz, çünkü
    // parça yalnızca tonu uyan komşusuna 5 BPM içinde bağlanabilir.
    const eslesen = set.filter(t => tonlar.some(ton =>
      H.relation(t.camelot, ton) || H.relation(ton, t.camelot)));
    const eslesenBpm = eslesen.map(t => Number(t.bpm)).filter(Boolean);
    // Yeni parça komşusuna 5 BPM içinde bağlanmalı: uygun hızlar, tonu uyan
    // komşuların ±5 BPM pencerelerinin birleşimidir. Tek bir min–max aralığı
    // yanıltır (91 ile 136 arası sanılır), ortada boşluk varsa ayrı yazılır.
    const pencereler = eslesenBpm.map(b => [b - H.HIZ_TOLERANS, b + H.HIZ_TOLERANS])
      .sort((u, v) => u[0] - v[0]);
    const araliklar = [];
    pencereler.forEach(pencere => {
      const son = araliklar[araliklar.length - 1];
      if (son && pencere[0] <= son[1] + 1) son[1] = Math.max(son[1], pencere[1]);
      else araliklar.push(pencere.slice());
    });
    const enGenis = araliklar.slice().sort((u, v) => (v[1] - v[0]) - (u[1] - u[0]))[0];
    const setHedef = {
      tonlar,
      bpmMin: enGenis ? enGenis[0] : null,
      bpmMax: enGenis ? enGenis[1] : null
    };
    const aralikMetni = araliklar.length
      ? araliklar.slice(0, 3).map(a => a[0] + '–' + a[1] + ' BPM').join(' ya da ')
      : 'hız bilgisi yok';

    if (!icinde.length && !disi.length) {
      return '<p style="opacity:.6;font-size:13px">Bütün geçişler uyumlu; değiştirilecek parça yok.</p>';
    }

    const icindeHtml = icinde.map(x => {
      const i = x.sira;
      const onceki = set[i - 1], sonraki = set[i + 1];
      const hedef = (onceki && sonraki)
        ? H.kopru(onceki, sonraki)
        : H.kopru(onceki || sonraki, onceki || sonraki);
      return `<div class="hm-kopru">
        <b>${safe(x.parca.title)} — SET İÇİNDE UYMUYOR</b>
        <p>${safe(x.sebep)}. Yerine ${hedef.tekParca
          ? `<b>${safe(tonMetni(hedef))}</b> tonunda, <b>${safe(hizMetni(hedef))}</b> aralığında bir parça koy.`
          : 'komşularına uyan <b>tek</b> parça yetmiyor; köprü zinciri ya da parçayı kaydırmak gerekir.'}</p>
        ${hedef.ikiAdim ? `<p>1. köprü: <b>${safe(tonMetni(hedef.ikiAdim.birinci))}</b> tonunda,
          <b>${safe(hizMetni(hedef.ikiAdim.birinci))}</b> · 2. köprü:
          <b>${safe(tonMetni(hedef.ikiAdim.ikinci))}</b> tonunda,
          <b>${safe(hizMetni(hedef.ikiAdim.ikinci))}</b></p>` : ''}
        ${hedef.not ? `<p class="hm-warn">${safe(hedef.not)}</p>` : ''}
        ${linkHtml({ tonlar: hedef.tonlar, bpmMin: hedef.bpmMin, bpmMax: hedef.bpmMax })}
      </div>`;
    }).join('');

    const disiHtml = disi.length ? `<div class="hm-kopru">
      <b>SETE GİRMEYEN ${disi.length} KATALOG PARÇASI</b>
      <p>${disi.slice(0, 8).map(t => safe(t.title)).join(', ')}${disi.length > 8 ? ' …' : ''}
        — setteki tonlarla bağlanmıyor.</p>
      <p>Yerlerine setteki tonlara uyan bir parça ara: <b>${safe(tonlar.join(' · ') || 'ton bilgisi yok')}</b>,
        <b>${safe(aralikMetni)}</b> (komşusuna 5 BPM içinde bağlanmalı).</p>
      ${linkHtml(setHedef)}
    </div>` : '';

    return icindeHtml + disiHtml;
  }

  function render() {
    const sug = suggestions();
    const sn = set.reduce((s, t) => s + (Number(t.duration_sec) || 0), 0);
    const dk = Math.round(sn / 60);
    const eksikTon = tracks.filter(t => !t.camelot).length;
    const gecisListesi = H.gecisler(set);
    const sorunlu = gecisListesi.filter(g => g.seviye !== 'iyi').length;
    const ayrilan = gecisListesi.filter(g => g.iliski && !g.yanYana).length;
    // Set yayı: BPM eğrisinin tamamı (yerel geçişler bunu göstermez).
    const yay = H.yay(set);

    byId('hm-app').innerHTML = `
      <div class="hm-grid">
        <div>
          <section class="hm-panel">
            <h2>PARÇA EKLE</h2>
            <div class="hm-edit" style="border:0;padding-top:0;margin-top:0">
              <input id="nt-title" placeholder="Parça adı" style="flex:1 1 100%">
              <input id="nt-artist" placeholder="Sanatçı">
              <input id="nt-cam" placeholder="Camelot (8A)">
              <input id="nt-key" placeholder="Ton (A minor)">
              <input id="nt-makam" placeholder="Makam">
              <input id="nt-bpm" type="number" placeholder="BPM">
              <input id="nt-en" type="number" min="1" max="10" placeholder="Enerji 1-10">
              <input id="nt-dur" type="number" placeholder="Süre (sn)">
              <input id="nt-file" type="file" accept="audio/*" style="flex:1 1 100%">
              <button id="nt-add">KATALOĞA EKLE</button>
            </div>
            <p class="hm-warn" id="nt-msg"></p>
          </section>

          <section class="hm-panel" style="margin-top:20px">
            <h2>SET KATALOĞU (${tracks.length})</h2>
            ${eksikTon ? `<p class="hm-warn">${eksikTon} parçanın Camelot kodu yok — sıralamaya girmez.</p>` : ''}
            ${tracks.map(t => `
              <div class="hm-track ${selected?.id === t.id ? 'sel' : ''}" data-pick="${t.id}">
                <span><strong>${safe(t.title)}</strong><small>${meta(t)}</small></span>
                <span style="display:flex;gap:7px;align-items:center">${keyChip(t)}
                  <button data-push="${t.id}" style="padding:4px 9px;border-radius:9px;font-size:10px;border:1px solid rgba(224,195,65,.5);background:rgba(224,195,65,.14);color:#e8d15a;cursor:pointer">SETE EKLE</button>
                  <button data-del="${t.id}" style="padding:4px 9px;border-radius:9px;font-size:10px;border:1px solid rgba(255,255,255,.2);background:transparent;color:inherit;cursor:pointer">SİL</button></span>
              </div>`).join('') || '<p style="opacity:.5;font-size:13px">Katalog boş. Yukarıdan parça ekle.</p>'}

            ${selected ? `<div class="hm-edit">
              <input id="hm-cam" value="${safe(selected.camelot || '')}" placeholder="Camelot">
              <input id="hm-key" value="${safe(selected.key_name || '')}" placeholder="Ton">
              <input id="hm-bpm" type="number" value="${selected.bpm || ''}" placeholder="BPM">
              <input id="hm-en" type="number" min="1" max="10" value="${selected.energy || ''}" placeholder="Enerji">
              <input id="hm-dur" type="number" value="${selected.duration_sec || ''}" placeholder="Süre (sn)">
              <button id="hm-save">GÜNCELLE</button>
            </div>` : ''}
          </section>
        </div>

        <div>
          ${hizAyariHtml()}

          <section class="hm-panel" style="margin-top:20px">
            <h2>OTOMATİK SIRALAMA</h2>
            <p style="font-size:12px;opacity:.65;margin:0 0 12px">
              Parçaları <b>setin tamamına</b> bakarak dizer: önce her başlangıç ve BPM sırası
              denenir, sonra yer değiştirme, kaydırma ve bölüt ters çevirmeyle zincir
              iyileştirilir. Set <b>yavaştan hızlıya</b> akar (hız düşüşleri cezalı), ton uysa
              bile <b>hız farkı 5 BPM'i aşan iki parça yan yana konmaz</b>; başka çare yoksa
              köprü önerilir.</p>
            <div class="hm-edit" style="border:0;padding-top:0;margin-top:0">
              <button id="hm-auto">TÜM KATALOĞU SIRALA</button>
              <button id="hm-autoset" style="background:rgba(255,255,255,.08);color:inherit;border:1px solid rgba(255,255,255,.2)">MEVCUT SETİ YENİDEN DİZ</button>
              <button id="hm-clear" style="background:rgba(255,255,255,.08);color:inherit;border:1px solid rgba(255,255,255,.2)">SETİ TEMİZLE</button>
            </div>
          </section>

          <section class="hm-panel" style="margin-top:20px">
            <h2>SIRADAKİ UYUMLU PARÇALAR</h2>
            ${(set.length || selected)
              ? (sug.length ? sug.slice(0, 6).map(x => `
                  <div class="hm-track" data-add="${x.t.id}">
                    <span><strong>${safe(x.t.title)}</strong><small>${meta(x.t)}</small>
                      <span class="hm-rel"><span class="hm-chip ${x.rel.sinif}">${x.rel.tip}</span>
                        ${(() => { const onceki = set.length ? set[set.length - 1] : selected;
                          const h = H.tempo(onceki, x.t);
                          if (h.fark == null) return '';
                          // Ton tutsa da hız uzaksa öneri işaretlenir: kullanıcı bunu
                          // yan yana koymadan önce bilsin.
                          const ayri = !H.yanYana(onceki, x.t);
                          return `<span class="hm-chip${ayri ? ' bad' : ''}">${h.fark} BPM fark · ${safe(h.tip)}${ayri ? ' · yan yana olmamalı' : ''}</span>`; })()}</span></span>
                    ${keyChip(x.t)}
                  </div>`).join('')
                : '<p style="opacity:.5;font-size:13px">Uyumlu parça yok.</p>')
              : '<p style="opacity:.5;font-size:13px">Katalogdan bir parça seç ya da otomatik sıralamayı çalıştır.</p>'}
          </section>

          <section class="hm-panel" style="margin-top:20px">
            <h2>TARZ ÖNERİLERİ</h2>
            <p style="font-size:12px;opacity:.65;margin:0 0 12px">
              Öneri artık yalnız ton + hız değil: referans parçanın <b>tarzı</b> (tempo, enerji,
              makamdan okunur) ve sanatçısı analiz edilir. Kendi kataloğundan sete uyan
              sanatçılar burada, dış öneriler Deezer'ın benzer sanatçı algoritmasından gelir —
              ses verisi tarayıcıdan okunur, API anahtarı gerekmez.</p>
            ${tarzPanel()}
          </section>

          <section class="hm-panel" style="margin-top:20px">
            <h2>SET AKIŞI</h2>
            <div class="hm-meta">
              <span>Parça: <b>${set.length}</b></span>
              <span>Süre: <b>${dk} dk</b> / 90 dk</span>
              <span>Kalan: <b>${Math.max(0, 90 - dk)} dk</b></span>
              <span>Sorunlu geçiş: <b>${sorunlu}</b></span>
              <span>Ton uyumlu, hız uzak: <b>${ayrilan}</b></span>
              <span>Yay: <b>${yay.ilk} → ${yay.son} BPM</b></span>
              <span>İniş: <b>${yay.inisSayi}</b></span>
            </div>
            <ol class="hm-set">${set.map((t, i) => {
              const g = i ? gecisListesi[i - 1] : null;
              const chipTur = !g ? 'off' : (g.seviye === 'iyi' ? 'ok' : (g.seviye === 'zorlama' ? 'up' : 'bad'));
              const chipMetin = !g ? 'BAŞLANGIÇ' : (g.iliski ? g.iliski.tip : 'UYUMSUZ GEÇİŞ');
              const hiz = g && g.hiz.fark != null
                ? `<span class="hm-chip">${g.hiz.fark} BPM fark · ${safe(g.hiz.tip)}</span>` : '';
              // Ton tutuyor ama hız farkı 5 BPM'i aşıyor: bu ikili yan yana
              // olmamalı, sebebi de satırın üstünde yazılı olsun.
              const ayri = g && g.iliski && !g.yanYana
                ? `<span class="hm-chip bad">YAN YANA OLMAMALI · ${g.hiz.fark} BPM</span>` : '';
              // Yay uyarısı: bu adım hızdan yavaşa dönüyor.
              const inis = g && g.inis
                ? `<span class="hm-chip up">HIZ DÜŞÜYOR · ${g.inis.dusus} BPM</span>` : '';
              // Hedef hıza sabitlenen ve hızlı bölüme kalan parçalar işaretlenir.
              const bolumAdi = H.hizBolumu(t);
              const bolumHedefi = bolumAdi === 'ana' ? H.hizAyari().hedef
                : (bolumAdi === 'hizli' && H.hizliSabit(Number(t.bpm) || 0) ? H.hizAyari().hizliHedef : null);
              const bolum = bolumAdi
                ? `<span class="hm-chip ${bolumAdi === 'hizli' ? 'up' : 'off'}">${BOLUM_ETIKETI[bolumAdi]}${bolumHedefi ? ' · ' + bolumHedefi : ''}</span>` : '';
              return `<li draggable="true" data-idx="${i}" style="cursor:grab">
                <span><strong>${safe(t.title)}</strong>
                  <small>${meta(t)}</small>
                  <span class="hm-rel"><span class="hm-chip ${chipTur}">${safe(chipMetin)}</span>${hiz}${ayri}${inis}${bolum}</span></span>
                <span style="display:flex;gap:8px;align-items:center">${keyChip(t)}
                ${t.audio_path ? `<button data-play="${t.id}" data-path="${safe(t.audio_path)}" style="padding:6px 12px;border-radius:10px;border:1px solid rgba(224,195,65,.5);background:rgba(224,195,65,.14);color:#e8d15a;cursor:pointer">▶</button>` : ''}
                <button data-rm="${t.id}">ÇIKAR</button></span>
                ${g && g.seviye !== 'iyi' ? kopruHtml(g) : ''}
              </li>`;
            }).join('') || '<p style="opacity:.5;font-size:13px">Set boş.</p>'}</ol>
            <canvas class="hm-curve" id="hm-curve"></canvas>
          </section>

          <section class="hm-panel" style="margin-top:20px">
            <h2>SET YAYI — GENEL BAKIŞ</h2>
            <p style="font-size:12px;opacity:.65;margin:0 0 12px">
              Tek tek geçişlere bakmak yetmez: 122 → 124 ile 124 → 122 eşit derecede yakın
              görünür. Burada setin tamamı okunur — eğri yavaştan hızlıya mı akıyor,
              nerede geriye düşüyor, zirve nerede?</p>
            ${yayHtml()}
          </section>

          <section class="hm-panel" style="margin-top:20px">
            <h2>UYUMSUZ PARÇALAR VE ÖNERİLER</h2>
            <p style="font-size:12px;opacity:.65;margin:0 0 12px">
              Uymayan geçişlerde araya koyulacak parçanın tonu ve hızı burada yazar.
              Bağlantılar dış serviste <b>arama</b> açar; önerilen parça listesi dışarıdan çekilmez.</p>
            ${uyumsuzPanel()}
          </section>
        </div>
      </div>`;
    wire(); drawCurve();
  }

  // Enerji (dolu çizgi) ve tempo (kesikli çizgi) aynı grafikte: set akışının
  // nerede yükselip nerede hızlandığı tek bakışta görünsün.
  function drawCurve() {
    const c = byId('hm-curve'); if (!c) return;
    c.width = c.offsetWidth * 2; c.height = 300;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, c.width, c.height);
    if (set.length < 2) {
      ctx.fillStyle = 'rgba(255,255,255,.3)'; ctx.font = '22px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('Enerji ve tempo eğrisi için en az iki parça', c.width/2, c.height/2); return;
    }
    const ust = 40, alt = c.height - 40;
    const bpmlar = set.map(t => Number(t.bpm)).filter(Boolean);
    const enAz = bpmlar.length ? Math.min(...bpmlar) : 0;
    const enCok = bpmlar.length ? Math.max(...bpmlar) : 0;
    const bpmY = v => {
      if (!bpmlar.length) return (ust + alt) / 2;
      if (enCok === enAz) return (ust + alt) / 2;
      return alt - ((v - enAz) / (enCok - enAz)) * (alt - ust);
    };
    const pts = set.map((t, i) => ({
      x: (i / (set.length - 1)) * (c.width - 80) + 40,
      y: alt - ((Number(t.energy) || 5) / 10) * (alt - ust)
    }));

    ctx.strokeStyle = 'rgba(255,255,255,.1)'; ctx.lineWidth = 2;
    for (let e = 0; e <= 10; e += 2) {
      const y = alt - (e / 10) * (alt - ust);
      ctx.beginPath(); ctx.moveTo(40, y); ctx.lineTo(c.width - 40, y); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(255,255,255,.4)'; ctx.font = '20px sans-serif'; ctx.textAlign = 'left';
    ctx.fillText('ENERJİ', 8, ust + 6);
    if (bpmlar.length) {
      ctx.textAlign = 'right';
      ctx.fillText(enCok + ' BPM', c.width - 8, ust + 6);
      ctx.fillText(enAz + ' BPM', c.width - 8, alt + 6);
      ctx.textAlign = 'left';
      ctx.fillText('TEMPO (kesikli)', 8, alt + 24);
      ctx.save();
      ctx.setLineDash([14, 10]); ctx.strokeStyle = '#5ea4ff'; ctx.lineWidth = 3;
      ctx.beginPath();
      let basladi = false;
      set.forEach((t, i) => {
        const v = Number(t.bpm);
        if (!v) return;
        const x = pts[i].x, y = bpmY(v);
        if (basladi) ctx.lineTo(x, y); else { ctx.moveTo(x, y); basladi = true; }
      });
      ctx.stroke();
      ctx.restore();
    }

    const g = ctx.createLinearGradient(0, 0, c.width, 0);
    g.addColorStop(0, '#5ea4ff'); g.addColorStop(1, '#e0c341');
    ctx.strokeStyle = g; ctx.lineWidth = 5; ctx.lineJoin = 'round';
    ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.stroke();
    pts.forEach(p => { ctx.beginPath(); ctx.arc(p.x, p.y, 8, 0, Math.PI*2);
      ctx.fillStyle = '#e8d15a'; ctx.fill(); ctx.strokeStyle = '#141416'; ctx.lineWidth = 3; ctx.stroke(); });
  }

  function wire() {
    byId('nt-add').onclick = async () => {
      const msg = byId('nt-msg');
      const title = byId('nt-title').value.trim();
      if (!title) { msg.textContent = 'Parça adı gerekli.'; return; }
      msg.textContent = 'Ekleniyor…';
      let audio_path = null;
      const file = byId('nt-file').files?.[0];
      if (file) {
        if (!sesHazir()) { msg.textContent = 'Ses yükleme yardımcıları yüklenemedi (audio-file-types.js). Sayfayı yenileyin.'; return; }
        if (!Ses.gecerli(file)) {
          msg.textContent = `“${Ses.uzanti(file.name)}” uzantısı desteklenmiyor. Desteklenenler: ${Ses.desteklenenler()}.`;
          return;
        }
        const taban = `${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
        const up = await Ses.parcaliYukle({
          yukle: djYukle,
          sil: yollar => djDepo().remove(yollar)
        }, taban, file, (i, n) => {
          msg.textContent = n > 1
            ? `Ses yükleniyor… parça ${i}/${n} (${Ses.boyut(file.size)})`
            : `Ses yükleniyor… (${Ses.boyut(file.size)})`;
        });
        if (up.error) {
          msg.textContent = 'Yükleme hatası: ' + up.error.message
            + (/maximum allowed size|too large|exceeded/i.test(up.error.message)
              ? ' — dosya tek nesne sınırını aşmış görünüyor; sayfayı yenileyip tekrar dene.' : '');
          return;
        }
        audio_path = up.path;
        if (up.toplam > 1) msg.textContent = `Ses ${up.toplam} parça hâlinde yüklendi.`;
      }
      const { error } = await client.from('dj_tracks').insert({
        title, artist: byId('nt-artist').value.trim() || null, audio_path,
        camelot: byId('nt-cam').value.trim() || null,
        key_name: byId('nt-key').value.trim() || null,
        makam: byId('nt-makam').value.trim() || null,
        bpm: byId('nt-bpm').value ? Number(byId('nt-bpm').value) : null,
        energy: byId('nt-en').value ? Number(byId('nt-en').value) : null,
        duration_sec: byId('nt-dur').value ? Number(byId('nt-dur').value) : null
      });
      msg.textContent = error ? error.message : 'Parça eklendi.';
      if (!error) await load();
    };

    const siralamaNotu = () => {
      const gecis = H.gecisler(set);
      const sorun = gecis.filter(g => g.seviye !== 'iyi').length;
      // Yalnız tonu uyan ama hızı uzak komşuluklar: kopuk geçişler zaten
      // "uyumsuz" olarak ayrıca sayılıyor.
      const ayri = gecis.filter(g => g.iliski && !g.yanYana).length;
      const y = H.yay(set);
      const ayar = H.hizAyari();
      const bolum = H.hizBolumu(set[0]);
      return `${set.length} parça sıralandı.`
        + (sorun ? ` ${sorun} geçişte köprü gerekiyor.` : ' Bütün geçişler uyumlu.')
        + (ayri ? ` ${ayri} komşulukta ton uyuyor ama hız farkı 5 BPM'i aşıyor.` : '')
        + (y.inisSayi ? ` Yay ${y.inisSayi} yerde geriye düşüyor.`
          : (y.yukselen ? ' Set yavaştan hızlıya akıyor.'
            : ' İlk yarı ikinci yarıdan hızlı; yay geriye dönüyor.'))
        + (ayar.hedef ? ` Bölümler: ${BOLUM_ETIKETI[bolum] || 'ana bölüm'} → … → ${BOLUM_ETIKETI[H.hizBolumu(set[set.length - 1])] || 'ana bölüm'} (ana ${ayar.hedef} BPM, hızlı ${ayar.hizliHedef} BPM'e sabit).` : '');
    };

    byId('hm-auto').onclick = () => {
      const uygun = tracks.filter(t => t.camelot);
      if (uygun.length < 2) { byId('hm-status').textContent = 'En az iki parçaya Camelot kodu gerekli.'; return; }
      set = H.autoOrder(uygun); selected = null;
      byId('hm-status').textContent = siralamaNotu();
      render();
    };

    byId('hm-autoset').onclick = () => {
      if (set.length < 2) return;
      set = H.autoOrder(set.filter(t => t.camelot));
      byId('hm-status').textContent = siralamaNotu();
      render();
    };

    byId('hm-clear').onclick = () => { set = []; selected = null; render(); };

    document.querySelectorAll('[data-pick]').forEach(el => el.onclick = e => {
      if (e.target.dataset.del || e.target.dataset.push) return;
      selected = tracks.find(t => t.id === el.dataset.pick);
      if (!set.length) set = [selected];
      render();
    });
    document.querySelectorAll('[data-push]').forEach(el => el.onclick = ev => {
      ev.stopPropagation();
      const t = tracks.find(x => x.id === el.dataset.push);
      if (set.some(s => s.id === t.id)) { byId('hm-status').textContent = 'Bu parça sette zaten var.'; return; }
      set.push(t); render();
    });
    document.querySelectorAll('[data-add]').forEach(el => el.onclick = () => {
      set.push(tracks.find(t => t.id === el.dataset.add)); render();
    });

    document.querySelectorAll('[data-rm]').forEach(el => el.onclick = () => {
      set = set.filter(t => t.id !== el.dataset.rm); render();
    });

    document.querySelectorAll('[data-del]').forEach(el => el.onclick = async ev => {
      ev.stopPropagation();
      if (!confirm('Parça katalogdan silinecek. Emin misiniz?')) return;
      const t = tracks.find(x => x.id === el.dataset.del);
      // Parçalı yüklemede dosya birden çok nesnedir: hepsi birlikte silinir.
      if (t?.audio_path) {
        const yollar = sesHazir() ? Ses.parcalariCoz(t.audio_path).map(p => p.path) : [t.audio_path];
        await djDepo().remove(yollar);
      }
      // Supabase hiçbir satırı etkilemeyen silmede hata döndürmez: kayıt
      // yerinde kalırken ekran silinmiş sanırdı. Silinen satırı geri isteriz.
      const { data: silinen, error: silmeHatasi } = await client.from('dj_tracks')
        .delete().eq('id', el.dataset.del).select('id');
      if (silmeHatasi || !silinen || !silinen.length) {
        byId('hm-status').textContent = 'Parça silinemedi: kayıt bulunamadı ya da yetkiniz yok.';
        return;
      }
      set = set.filter(x => x.id !== el.dataset.del);
      if (selected?.id === el.dataset.del) selected = null;
      await load();
    });
    // Sürükle-bırak sıralama
    let suruklenen = null;
    document.querySelectorAll('.hm-set li[draggable]').forEach(li => {
      li.addEventListener('dragstart', e => {
        suruklenen = +li.dataset.idx;
        li.style.opacity = '.4';
        e.dataTransfer.effectAllowed = 'move';
      });
      li.addEventListener('dragend', () => { li.style.opacity = ''; });
      li.addEventListener('dragover', e => {
        e.preventDefault();
        li.style.borderColor = 'rgba(224,195,65,.7)';
      });
      li.addEventListener('dragleave', () => { li.style.borderColor = ''; });
      li.addEventListener('drop', e => {
        e.preventDefault();
        const hedef = +li.dataset.idx;
        if (suruklenen === null || suruklenen === hedef) return;
        const [tasinan] = set.splice(suruklenen, 1);
        set.splice(hedef, 0, tasinan);
        suruklenen = null;
        render();
      });
    });

    // Hedef hız: ana bölümü tek hıza sabitleme.
    byId('hz-uygula').onclick = () => {
      const hedef = Number(byId('hz-hedef').value) || null;
      const tolerans = byId('hz-tol').value === '' ? 4 : Number(byId('hz-tol').value);
      const hizliEsik = byId('hz-esik').value === '' ? 135 : Number(byId('hz-esik').value);
      const hizliHedef = Number(byId('hz-hizli').value) || null;
      const inisHam = byId('hz-inis').value === '' ? INIS_PAYI_VARSAYILAN : Number(byId('hz-inis').value);
      ayarKaydet({
        hedef,
        tolerans: isNaN(tolerans) ? 4 : tolerans,
        hizliEsik: isNaN(hizliEsik) ? 135 : hizliEsik,
        hizliHedef,
        inisTolerans: isNaN(inisHam) ? INIS_PAYI_VARSAYILAN : Math.max(0, inisHam)
      });
      if (set.length > 1) set = H.autoOrder(set);
      render();
      byId('hm-status').textContent = siralamaNotu();
    };
    byId('hz-kapat').onclick = () => {
      ayarKaydet({ hedef: null, tolerans: 4, hizliEsik: 135, hizliHedef: 145, inisTolerans: INIS_PAYI_VARSAYILAN });
      render();
    };

    // Dış tarz önerisini yenile: önbellek ve durum sıfırlanır.
    const yenile = byId('tarz-yenile');
    if (yenile) yenile.onclick = () => {
      if (tarzDurum.sanatci) tarzOnbellek.delete(tarzDurum.sanatci);
      tarzDurum = { sanatci: null, veri: null, hata: null, yukleniyor: false };
      render();
    };

    // Deezer 30 saniyelik önizlemeler
    document.querySelectorAll('[data-onizleme]').forEach(btn => btn.onclick = async () => {
      if (window.__hmAudio && !window.__hmAudio.paused) {
        window.__hmAudio.pause();
        document.querySelectorAll('[data-onizleme],[data-play]').forEach(b => b.textContent = b.dataset.play ? '▶' : '▶ 30 sn');
        if (window.__hmOnizleme === btn.dataset.onizleme) { window.__hmOnizleme = null; return; }
      }
      window.__hmAudio = new Audio(btn.dataset.onizleme);
      window.__hmOnizleme = btn.dataset.onizleme;
      window.__hmAudio.onended = () => { btn.textContent = '▶ 30 sn'; window.__hmOnizleme = null; };
      await window.__hmAudio.play();
      btn.textContent = '⏸ 30 sn';
    });

    // Parça dinleme
    document.querySelectorAll('[data-play]').forEach(btn => btn.onclick = async () => {
      if (window.__hmAudio && !window.__hmAudio.paused) {
        window.__hmAudio.pause();
        document.querySelectorAll('[data-play]').forEach(b => b.textContent = '▶');
        if (window.__hmPlaying === btn.dataset.play) { window.__hmPlaying = null; return; }
      }
      const url = await sesUrl(btn.dataset.path);
      if (!url) { byId('hm-status').textContent = 'Ses açılamadı: dosya okunamadı.'; return; }
      window.__hmAudio = new Audio(url);
      window.__hmPlaying = btn.dataset.play;
      window.__hmAudio.onended = () => { btn.textContent = '▶'; window.__hmPlaying = null; };
      await window.__hmAudio.play();
      btn.textContent = '⏸';
    });
    const save = byId('hm-save');
    if (save) save.onclick = async () => {
      const body = {
        camelot: byId('hm-cam').value.trim() || null,
        key_name: byId('hm-key').value.trim() || null,
        bpm: byId('hm-bpm').value ? Number(byId('hm-bpm').value) : null,
        energy: byId('hm-en').value ? Number(byId('hm-en').value) : null,
        duration_sec: byId('hm-dur').value ? Number(byId('hm-dur').value) : null
      };
      const { data: guncellenen, error } = await client.from('dj_tracks')
        .update(body).eq('id', selected.id).select('id');
      const sorun = error ? error.message
        : (!guncellenen || !guncellenen.length ? 'Kayıt bulunamadı ya da bu işlem için yetkiniz yok.' : null);
      byId('hm-status').textContent = sorun || 'Güncellendi.';
      if (!sorun) { Object.assign(selected, body); await load(); }
    };
  }

  window.addEventListener('resize', drawCurve);
  boot();
})();
