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
    playlists: [], playlistTracks: [], coffeeAttempts: [], subscriptions: [], plans: [], requests: null,
    // Şubeye yüklenen listeler (supabase/radio-sube-listeleri.sql). Tablo
    // kurulmadıysa özellik kapalı kalır: panel sütunu çizmez, cihaz bugünkü gibi
    // markanın bütün listelerini gösterir.
    playerPlaylists: [], subeListeleriVar: false,
    // Çalıştırılan opsiyonel SQL dosyaları (supabase/*.sql). Panel bölümleri
    // bunlara dayanır; hangisi kurulu değilse "Kurulum durumu" ekranında tek
    // yerde görünür (bkz. radyoPanelViews.kurulumView). Anahtarlar SQL dosya
    // adıdır, değer true/false/null (null: henüz denenmedi).
    kurulum: {
      'radio-sube-listeleri.sql': null, 'radio-subeye-ozel-yayin.sql': null,
      'radio-baglanti-gecmisi.sql': null, 'radio-yayin-baslat.sql': null,
      'radio-calan-parca.sql': null, 'radio-liste-bildirimi.sql': null,
      'radio-erisim.sql': null, 'radio-yayin-durdurma.sql': null,
      'radio-sube-kodu.sql': null, 'radio-telegram.sql': null, 'marka-kapagi.sql': null
    }
  };
  const state = {
    nav: 'canli', sub: 'subeler', openFolder: null, openBrand: null, openPlaylist: null, q: '',
    // Plan takvimi: açık gün, görünen ay, katlanmış bölümler. Katlı olanlar
    // tarayıcıda hatırlanır; her açılışta hepsi yeniden açılmasın diye.
    planAcikGun: null, planYil: null, planAy: null, planKatli: [], planYeni: null,
    // Yayın başlatma ekranının seçimleri: marka → şube → kaynak → parça.
    yayin: { brandId: '', playerId: '', kaynak: '', parcaId: '' },
    // Açık bırakılan katlanabilir bölümler (marka sayfasındaki geçmiş listeleri).
    acik: {},
    // İkinci seviyede kapatılan bölümler: marka sayfasındaki şube geçmişleri açık
    // gelir, yönetici kalabalık yapan şubeleri burada işaretler.
    kapali: {}
  };

  // Katlanabilir bölümlerin açık/kapalı tercihi tarayıcıda saklanır. Bir tabloyu
  // kapatan yönetici sayfayı yenilediğinde (ya da canlı veri ekranı yeniden
  // çizdiğinde) aynı düzeni bulmalı; tercih her oturumda baştan kurulmaz.
  // Çözümleme/üretme işi görünüm katmanında (saf), burada yalnız depo var:
  // depo kapalıysa (gizli sekme, kota) panel eskisi gibi çalışır, yalnız hatırlamaz.
  const KATLI_ANAHTARI = 'derin:katli-radyo';
  const katliYaz = () => {
    try { localStorage.setItem(KATLI_ANAHTARI, V.katliDurumYaz(state)); } catch {}
  };
  try {
    const kayit = V.katliDurumOku(localStorage.getItem(KATLI_ANAHTARI));
    state.acik = kayit.acik;
    state.kapali = kayit.kapali;
  } catch {}

  let modalOnay = null, modalKapat = null;
  let toastZaman = null;
  let recorder = null, recParcalari = [], recAkis = null, recZaman = null, recBaslangic = 0;
  let ses = null, calmaListesi = [], calmaIdx = -1, calmaBaslik = '', oynaticiKuruldu = false;
  let yenileZaman = null;
  // "SUNUCUYLA DOĞRULA" sonuçları: şube kimliği → { durum, metin }.
  let saglikSonuc = {};

  // ---------- Yardımcılar ----------
  const siteRoot = () => location.href.split('#')[0].split('?')[0].replace(/[^/]*$/, '');
  const ui = {
    // Ses, kapak ve anonslar Cloudflare R2'de duruyor (bkz. r2-depo.js).
    cover: p => window.DerinR2.adres('radio-covers', p),
    ses: p => window.DerinR2.adres('radio-audio', p),
    anons: p => window.DerinR2.adres('radio-announcements', p),
    playerBase: () => siteRoot() + 'radyo.html?key=',
    brandUrl: slug => siteRoot() + 'coffee/' + encodeURIComponent(slug || ''),
    accept: () => (Ses ? Ses.accept() : 'audio/*'),
    desteklenenler: () => (Ses ? Ses.desteklenenler() : 'mp3, wav'),
    parcaNotu: () => '45 MB üzeri dosyalar kayıpsız parçalara bölünerek yüklenir',
    now: () => Date.now(),
    saglikSonuc: id => saglikSonuc[id] || null,
    // İzin verilmemişse alarm şeridinde "BİLDİRİMLERİ AÇ" düğmesi çizilir.
    bildirimGerekli: () => typeof Notification !== 'undefined' && Notification.permission !== 'granted',
    // Bildirimler ekranında "yeni" işaretlenen satırların sınırı: son bakış anı.
    bildirimOkundu: () => bildirimOkunduZamani()
  };

  // Bildirimler bölümü: şube kodu / link denemeleri bir kez okundu sayılınca
  // menü rozeti susar. Damga tarayıcıda tutulur (yeni SQL ya da kolon
  // gerekmez); başka bir cihazdan bakılırsa o cihaz kendi damgasını taşır.
  const BILDIRIM_OKUNDU_ANAHTARI = 'derin_bildirim_okundu';
  function bildirimOkunduZamani() {
    try { return localStorage.getItem(BILDIRIM_OKUNDU_ANAHTARI) || null; } catch { return null; }
  }

  function bildir(mesaj, tur) {
    const t = el('toast');
    t.className = 'toast show ' + (tur || 'ok');
    t.textContent = mesaj;
    clearTimeout(toastZaman);
    toastZaman = setTimeout(() => { t.className = 'toast ' + (tur || 'ok'); }, tur === 'err' ? 6500 : 3200);
  }
  const hata = m => bildir(m, 'err');

  // ---------- Yazma doğrulaması ----------
  // Supabase, hiçbir satırı etkilemeyen güncelleme/silmede hata döndürmez
  // (RLS engeli, artık var olmayan kimlik). O zaman panel "kaydedildi" ya da
  // "silindi" der, kayıt yerinde kalır: sessiz başarısızlık. Tek satırı
  // hedefleyen yazmalarda etkilenen satırı geri isteyip sayıyı doğrularız.
  // Dönüş: hata metni; sorun yoksa null.
  //   const sorun = await yazDogrula(client.from('x').update({...}).eq('id', id), 'Kaydedilemedi');
  //   if (sorun) return hata(sorun);
  async function yazDogrula(zincir, mesaj) {
    const { data, error } = await zincir.select('id');
    if (error) return mesaj + ': ' + error.message;
    if (!data || !data.length) return mesaj + ': kayıt bulunamadı ya da bu işlem için yetkiniz yok.';
    return null;
  }

  // ---------- Tek tip pencere ----------
  // Kod üretildikten sonra açılan pencere: kodu ve şubeye gönderilecek hazır
  // davet metnini tek ekranda gösterir (kopyalanabilir).
  function kodPenceresi(p, kod) {
    const link = ui.playerBase() + p.player_key;
    pencere({
      baslik: p.label + ' — şube kodu',
      govde: `<p class="sub">Kodu şubeye linkle birlikte gönderin; cihaz ilk kez bağlanırken bir kez sorulur.</p>
        <div class="key">${esc(kod)}</div>
        <div class="qr" data-qr="${esc(link)}"><span class="sub">QR hazırlanıyor…</span></div>
        <p class="sub">QR <b>yalnız yayın linkini</b> taşır: cihazın kamerasına okutulunca link açılır, kodu yukarıdaki alandan bir kez yazarsınız. Kod QR'a gömülmez — QR'ın fotoğrafını alan biri yayını açamaz.</p>
        <div class="row" style="margin-top:10px">
          <button class="btn sm primary" data-act="copy" data-copy="${esc(V.davetMetni({ label: p.label, player_code: kod }, link))}" type="button">DAVETİ KOPYALA</button>
          <button class="btn sm" data-act="copy" data-copy="${esc(kod)}" type="button">KODU KOPYALA</button>
          <button class="btn sm" data-act="copy" data-copy="${esc(link)}" type="button">LİNKİ KOPYALA</button>
        </div>`,
      gizleOnay: true, kapatMetni: 'KAPAT'
    });
    qrCiz();
  }

  // Kodlamayı görünüm katmanı yapar (V.qrGorsel): aynı fonksiyon prova
  // sayfasında gerçek bir okuyucuyla sınanır.
  function pencere(s) {
    modalOnay = s.onOnay || null;
    modalKapat = s.onKapat || null;
    // Pencere kabuğu HTML'de hazır gelir. Eksikse (uzun süre açık kalan eski
    // bir sekme, değiştirilmiş bir kabuk) burada üretilir: aksi hâlde onay
    // penceresi açılamaz ve SİL gibi düğmeler sessizce boşa düşerdi.
    if (!el('modal-wrap') || !el('modal')) {
      if (el('modal-wrap')) el('modal-wrap').remove();
      const sarma = document.createElement('div');
      sarma.id = 'modal-wrap'; sarma.className = 'modal-wrap';
      sarma.setAttribute('role', 'dialog'); sarma.setAttribute('aria-modal', 'true');
      const kutu = document.createElement('div');
      kutu.id = 'modal'; kutu.className = 'modal';
      sarma.appendChild(kutu);
      document.body.appendChild(sarma);
    }
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

  // Davet penceresindeki QR: kafede linki elle yazmak yerine kamerayla okutmak
  // için. Kodu bilerek taşımaz; kod QR'a gömülseydi QR'ın fotoğrafı da linkin
  // kendisi kadar paylaşılabilir bir anahtar olurdu (oynatıcı da kodu adresten
  // okumaz: bkz. radyo.js · KOD_ANAHTARI). Kodlayıcı CDN'den gelir
  // (radyo-yonetim.html); yüklenmezse pencere çökmez, link yazı olarak çizilir.
  function qrCiz() {
    const kutu = el('modal') && el('modal').querySelector('[data-qr]');
    if (!kutu) return;
    const veri = kutu.dataset.qr || '';
    const kutuphane = typeof window !== 'undefined' ? window.qrcode : null;
    const metinle = () => {
      kutu.classList.add('qr-metin');
      kutu.innerHTML = '<span class="sub">QR üretilemedi (kodlayıcı yüklenmedi); linki elle paylaşın:</span>'
        + `<div class="key">${esc(veri)}</div>`;
    };
    // Kodlama işi görünüm katmanında (V.qrGorsel): prova sayfası da aynı
    // fonksiyonu çağırıp QR'ı gerçek bir okuyucuyla çözerek doğrulayabiliyor.
    const gorsel = V.qrGorsel(veri, kutuphane);
    if (!gorsel) return metinle();
    kutu.innerHTML = `<img class="qr-img" alt="Şube yayın linki QR kodu" src="${esc(gorsel)}">`;
  }
  // ---------- Kapak yerleştirme ----------
  // Kapaklar elle yerleştirilir: yönetim indirdiği görseli kendi seçer. Panel
  // önce önizler, sonra kaydeder; böylece hangi görselin hangi parçaya/listeye
  // gittiği karışmaz. Parça, marka listesi ve klasör için tek akış kullanılır.
  const KAPAK_BUCKET = 'radio-covers';
  // Açık penceredeki "KAPAĞI KALDIR" düğmesinin çağıracağı iş.
  let kapakKaldir = null;

  async function kapakYukle(dosya, onEk) {
    const uzanti = ((dosya.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '')) || 'jpg';
    const yol = onEk + '/' + crypto.randomUUID() + '.' + uzanti;
    const up = await window.DerinR2.yukle(KAPAK_BUCKET, yol, dosya, dosya.type || 'image/jpeg');
    return up.error ? { hata: 'Görsel yüklenemedi: ' + up.error.message } : { yol: yol };
  }

  // Değiştirilen ya da kaldırılan kapağın dosyasını depodan sileriz; yoksa
  // depoda kimsenin görmediği eski görseller birikir.
  async function kapakDosyaSil(yol) {
    if (!yol) return;
    try { await window.DerinR2.sil(KAPAK_BUCKET, [yol]); } catch { /* dosya yoksa sorun değil */ }
  }

  // s: { baslik, alt, kapak (depo yolu), onEk (depo klasörü), kaydet(yol), kaldir() }
  function kapakPenceresiAc(s) {
    kapakKaldir = s.kaldir || null;
    pencere({
      baslik: s.baslik,
      govde: V.kapakPenceresi({ kapakUrl: s.kapak ? ui.cover(s.kapak) : null, alt: s.alt, mevcutVar: !!s.kapak }),
      onayMetni: 'KAPAĞI KAYDET',
      onOnay: () => kapakKaydet(s),
      onKapat: () => { kapakOnizlemeBirak(); kapakKaldir = null; }
    });
    const giris = el('kapak-file');
    const onizleme = el('kapak-onizleme');
    const bos = el('kapak-bos');
    if (!giris) return;
    giris.onchange = () => {
      const dosya = giris.files && giris.files[0];
      if (!dosya) return;
      if (!/^image\//.test(dosya.type || '')) {
        giris.value = '';
        return hata('Yalnızca görsel dosyası yerleştirebilirsin.');
      }
      kapakOnizlemeBirak();
      onizleme.src = URL.createObjectURL(dosya);
      onizleme.hidden = false;
      if (bos) bos.hidden = true;
      el('kapak-msg').textContent = dosya.name + ' · ' + Math.max(1, Math.round(dosya.size / 1024))
        + ' KB seçildi (henüz kaydedilmedi).';
    };
  }

  // Önizleme için üretilen geçici blob adresini bırakırız; paneli gün boyu açık
  // tutan bir yönetici onlarca kapak yerleştirdiğinde bellekte birikmesin.
  function kapakOnizlemeBirak() {
    const onizleme = el('kapak-onizleme');
    if (onizleme && onizleme.src && onizleme.src.indexOf('blob:') === 0) URL.revokeObjectURL(onizleme.src);
  }

  async function kapakKaydet(s) {
    try {
      const giris = el('kapak-file');
      const dosya = giris && giris.files && giris.files[0];
      if (!dosya) return bildir('Önce bir görsel seç.');
      const { yol, hata: yuklemeHatasi } = await kapakYukle(dosya, s.onEk);
      if (yuklemeHatasi) return hata(yuklemeHatasi);
      const kayitHatasi = await s.kaydet(yol);
      // Kayıt tutmazsa yüklediğimiz dosyayı hemen geri sileriz: depoda sahipsiz
      // görsel kalmasın.
      if (kayitHatasi) { await kapakDosyaSil(yol); return hata(kayitHatasi); }
      await kapakDosyaSil(s.kapak);
      pencereKapat();
      await yenile(false);
      bildir('Kapak yerleştirildi.');
    } finally {
      kapakOnizlemeBirak();
      kapakKaldir = null;
    }
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


  // ---------- Kurulum durumu ----------
  // Depodaki bir kurulum dosyasını (SQL ya da rehber) panelden okunur/kopyalanır
  // hale getirir: yönetici Supabase SQL Editor'e yapıştırıp bir kez çalıştırır.
  // Dosya depodan (public) raw olarak çekilir; ağ yoksa panel yol gösterir,
  // hata vermez.
  async function kurulumDosyaGoster(dosya) {
    if (!/^[a-z0-9-]+\.(sql|md)$/.test(dosya || '')) return hata('Geçersiz dosya adı.');
    const sqlMi = /\.sql$/.test(dosya);
    pencere({ baslik: dosya, govde: '<p class="sub">Yükleniyor…</p>', gizleOnay: true, kapatMetni: 'KAPAT' });
    let metin = '';
    try {
      const yanit = await fetch('https://raw.githubusercontent.com/derinrecord/derinrecorwebsite/main/supabase/' + dosya);
      if (yanit.ok) metin = await yanit.text();
    } catch { /* ağ yok / engelli: aşağıdaki yönlendirme gösterilir */ }
    const govde = el('modal').querySelector('.modal-body');
    if (!govde) return;
    if (!metin) {
      govde.innerHTML = `<p class="sub">Dosya okunamadı. Depodaki <b>supabase/${esc(dosya)}</b> içeriğini açıp kullanın.</p>`;
      return;
    }
    govde.innerHTML = `
      <p class="sub">${sqlMi
        ? "Bu SQL'i Supabase SQL Editor'de bir kez çalıştırın: özellik açılır, kurulum uyarısı kaybolur."
        : 'Kurulum adımları; her adımı sırayla uygulayın.'}</p>
      <textarea id="kurulum-sql" readonly rows="18" style="width:100%;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;line-height:1.5">${esc(metin)}</textarea>
      <div class="row" style="margin-top:10px">
        <button class="btn sm primary" data-act="kurulum-sql-kopyala" type="button">${sqlMi ? "SQL'İ KOPYALA" : 'METNİ KOPYALA'}</button>
        <span class="sub">${sqlMi ? 'Kopyaladıktan sonra Supabase → SQL Editor → Run.' : 'Adımları takip edin.'}</span>
      </div>`;
  }

  // Eksik kurulum dosyalarının hepsini tek metinde birleştirir: yönetici tek
  // kopyala-yapıştır ile SQL Editor'de hepsini sırayla çalıştırabilsin. Dosyalar
  // KURULUM sırasına göre (bağımlılık gözetilerek) dizilir ve aralarına yorum
  // başlığı konur. Ağ yoksa yol gösterir, hata vermez.
  async function kurulumTumEksikGoster() {
    const harita = (D && D.kurulum) || {};
    const eksikler = (V.KURULUM || []).filter(x => harita[x.anahtar] === false);
    if (!eksikler.length) return bildir('Eksik kurulum yok.');
    pencere({ baslik: 'Eksik kurulum (' + eksikler.length + ')', govde: '<p class="sub">Yükleniyor…</p>', gizleOnay: true, kapatMetni: 'KAPAT' });
    const parcalar = [];
    for (const x of eksikler) {
      try {
        const y = await fetch('https://raw.githubusercontent.com/derinrecord/derinrecorwebsite/main/supabase/' + x.anahtar);
        if (y.ok) parcalar.push('-- ===== supabase/' + x.anahtar + ' — ' + x.ad + ' =====\n' + (await y.text()).trim());
      } catch { /* ağ yok / engelli: aşağıdaki yönlendirme gösterilir */ }
    }
    const govde = el('modal').querySelector('.modal-body');
    if (!govde) return;
    if (!parcalar.length) {
      govde.innerHTML = `<p class="sub">Dosyalar okunamadı. Depodaki <b>supabase/</b> klasöründeki ${esc(eksikler.map(x => x.anahtar).join(', '))} dosyalarını açıp kullanın.</p>`;
      return;
    }
    const metin = '-- Derin Record: eksik kurulum dosyaları (' + parcalar.length + '/' + eksikler.length + ')\n'
      + '-- Supabase → SQL Editor → yapıştır → Run. Sonra panelde "DURUMU YENİDEN KONTROL ET".\n\n'
      + parcalar.join('\n\n');
    govde.innerHTML = `
      <p class="sub">${parcalar.length} dosya tek metinde birleştirildi. Supabase → SQL Editor'e yapıştırıp bir kez çalıştırın;
        ardından panelde <b>DURUMU YENİDEN KONTROL ET</b>'e basın. Dosyalar güvenli sırada (bağımlılık gözetilerek) dizildi.</p>
      <textarea id="kurulum-sql" readonly rows="20" style="width:100%;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;line-height:1.5">${esc(metin)}</textarea>
      <div class="row" style="margin-top:10px">
        <button class="btn sm primary" data-act="kurulum-sql-kopyala" type="button">TÜMÜNÜ KOPYALA</button>
        <span class="sub">Kopyaladıktan sonra Supabase → SQL Editor → Run.</span>
      </div>`;
  }

  // Katalog kapısını kapatma SQL'ini gösterir: şube erişim kapısı kurulduktan
  // sonra katalog tabloları girişsiz ziyaretçiye kapatılır. Sıra önemlidir;
  // pencere bunu açıkça uyarır. Dosya yeniden kullanılan #kurulum-sql
  // alanına yazılır, kopyalama düğmesi ortak çalışır.
  async function kurulumKapatGoster() {
    const hedef = 'radio-erisim-kapat.sql';
    pencere({ baslik: 'Katalog kapısını kapat', govde: '<p class="sub">Yükleniyor…</p>', gizleOnay: true, kapatMetni: 'KAPAT' });
    let metin = '';
    try {
      const yanit = await fetch('https://raw.githubusercontent.com/derinrecord/derinrecorwebsite/main/supabase/' + hedef);
      if (yanit.ok) metin = await yanit.text();
    } catch { /* ağ yok / engelli: aşağıdaki yönlendirme gösterilir */ }
    const govde = el('modal').querySelector('.modal-body');
    if (!govde) return;
    if (!metin) {
      govde.innerHTML = `<p class="sub">Dosya okunamadı. Depodaki <b>supabase/${esc(hedef)}</b> içeriğini açıp kullanın.</p>`;
      return;
    }
    govde.innerHTML = `
      <p class="sub"><b>Son adım.</b> Bu dosya katalog tablolarını girişsiz ziyaretçiye kapatır: müzik listesi ve ses
        dosyası adresleri dışarıdan okunamaz hâle gelir. Yönetici girişi (bu panel) etkilenmez.</p>
      <p class="sub">Kapıyı ancak oynatıcı ve sunum sayfası yeni fonksiyonlarla birkaç dakika çalıştıktan sonra kapatın;
        aksi hâlde kafe cihazı bir sonraki yenilemede personel liste seçiciyi kaybeder (müzik çalmaya devam eder).</p>
      <textarea id="kurulum-sql" readonly rows="18" style="width:100%;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;line-height:1.5">${esc(metin)}</textarea>
      <div class="row" style="margin-top:10px">
        <button class="btn sm primary" data-act="kurulum-sql-kopyala" type="button">SQL'İ KOPYALA</button>
        <span class="sub">Kopyaladıktan sonra Supabase → SQL Editor → Run.</span>
      </div>`;
  }

  // ---------- Şube listeleri ----------
  // Pencerede işaretlenen şubelerin (birden çok olabilir) ataması, işaretlenen
  // çalma listeleriyle baştan kurulur: işaretlenmeyen listeler o şubeden
  // kaldırılır. Yükleme sırası markanın liste sırasına değil işaretleme sırasına
  // göre listenin sonuna eklenir, mevcutların sırası bozulmaz. Hiçbir şey
  // kendiliğinden atanmaz; yazma yalnız KAYDET düğmesiyle olur.
  async function subeListeleriKaydet() {
    if (!kullanici.adminMi) return hata('Şube listesi yüklemek yönetici yetkisi ister.');
    const md = el('modal');
    if (!md) return;
    const hedefler = [...md.querySelectorAll('[data-sube-hedef]')]
      .filter(k => k.checked).map(k => k.value)
      .map(pid => D.players.find(x => x.id === pid)).filter(Boolean);
    if (!hedefler.length) return hata('En az bir şube işaretle.');
    const secilen = [...md.querySelectorAll('[data-sube-liste]')]
      .filter(k => k.checked).map(k => k.value);
    // Boş liste kaydedilebilir ama ses çıkarmaz: yönetici kaydettikten sonra
    // "çalıyor" sanmasın diye bildirim bunu ayrıca söyler.
    const bosSecilen = secilen.filter(id => !D.playlistTracks.some(x => x.playlist_id === id));

    for (const p of hedefler) {
      const yuklu = (D.playerPlaylists || []).filter(x => x.player_id === p.id)
        .map(x => x.playlist_id);
      const eklenecek = secilen.filter(x => !yuklu.includes(x));
      const kaldirilacak = yuklu.filter(x => !secilen.includes(x));
      if (eklenecek.length) {
        const { error } = await client.from('player_playlists').insert(
          eklenecek.map((playlistId, i) => ({
            player_id: p.id, playlist_id: playlistId, sort_order: yuklu.length + i
          })));
        if (error) return hata(p.label + ' · listeler yüklenemedi: ' + error.message);
      }
      if (kaldirilacak.length) {
        const { error } = await client.from('player_playlists').delete()
          .eq('player_id', p.id).in('playlist_id', kaldirilacak);
        if (error) return hata(p.label + ' · listeler kaldırılamadı: ' + error.message);
      }
    }
    pencereKapat();
    await yenile(false);
    const hedefMetni = hedefler.length === 1
      ? hedefler[0].label + ' şubesine'
      : hedefler.length + ' şubeye';
    bildir(!secilen.length
      ? hedefMetni + ' liste kalmadı; bu şubeler çalmayacak.'
      : hedefMetni + ' ' + secilen.length + ' liste atandı.'
        + (bosSecilen.length ? ' Uyarı: ' + bosSecilen.length + ' listede hiç parça yok.' : ''));
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
    yayin: { nav: 'canli', sub: 'yayin' },
    subeler: { nav: 'canli', sub: 'subeler' },
    saglik: { nav: 'canli', sub: 'saglik' },
    gecmis: { nav: 'canli', sub: 'gecmis' },
    klasorler: { nav: 'icerik', sub: 'klasorler' },
    anons: { nav: 'icerik', sub: 'anonslar' },
    markalar: { nav: 'musteri', sub: 'markalar' },
    abonelikler: { nav: 'musteri', sub: 'abonelikler' },
    talepler: { nav: 'musteri', sub: 'talepler' },
    kurulum: { nav: 'kurulum', sub: 'kurulum' },
    plan: { nav: 'plan', sub: 'takvim' },
    bildirimler: { nav: 'bildirim', sub: 'bildirimler' }
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
      if (alt === 'listeler' && altId) state.openPlaylist = altId;
    } else if (sayfa === 'listeler' && id) {
      // Eski bağlantı: ne liste indeksi ne çalma listeleri sekmesi var. Liste
      // kendi marka sayfasında yaşar; yer imleri boşa düşmesin diye oraya
      // gidilir. Listesiz "#/listeler" marka listesine iner.
      const pl = (D.playlists || []).find(x => x.id === id);
      state.nav = 'musteri';
      state.sub = 'markalar';
      state.openPlaylist = id;
      if (pl) state.openBrand = pl.brand_id;
    }
  }

  const git = h => { if (location.hash === h) uygula(); else location.hash = h; };

  function gorunumHash() {
    // Liste detayı marka sayfasının altında durur: adres de markayı taşır ki
    // geri dönüş ve menü işareti marka sayfasına bağlı kalsın.
    if (state.openPlaylist) return state.openBrand
      ? '#/markalar/' + state.openBrand + '/listeler/' + state.openPlaylist
      : '#/listeler/' + state.openPlaylist;
    if (state.openBrand) return '#/markalar/' + state.openBrand;
    if (state.openFolder) return '#/klasorler/' + state.openFolder;
    if (state.nav === 'canli') {
      if (state.sub === 'yayin') return '#/yayin';
      return state.sub === 'saglik' ? '#/saglik' : (state.sub === 'gecmis' ? '#/gecmis' : '#/canli');
    }
    if (state.nav === 'icerik') return state.sub === 'anonslar' ? '#/anons' : '#/klasorler';
    if (state.sub === 'abonelikler') return '#/abonelikler';
    if (state.sub === 'talepler') return '#/talepler';
    if (state.nav === 'bildirim') return '#/bildirimler';
    if (state.nav === 'kurulum') return '#/kurulum';
    if (state.nav === 'plan') return '#/plan/takvim';
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
      requests: D.requests ? D.requests.length : null,
      // Menüde "kaç şubede yayın çalışmaz" görünsün; sorun yoksa rozet çizilmez.
      saglik: D.players.length ? (V.saglikOzet(D).kotu || null) : null,
      // Son 24 saatte kaç yayın-durma olayı olduğu menüde okunsun: kullanıcı
      // geçmiş ekranını aramadan nerede iş olduğunu görsün.
      olaySorun: V.olaySorunSayi(D) || null,
      // Mesai içinde şu an susan şube: menüde kırmızı rozet, üstte şerit.
      sessiz: V.sessizSayi(D) || null,
      // Link/kod paylaşım girişimi olan şube: menüde aynı kırmızı rozete eklenir.
      paylasim: V.paylasimSayi(D) || null,
      // Son bakıştan sonra gelen şube-kodu/link denemesi: Bildirimler satırında
      // kendi kırmızı rozeti olur (bu bir arıza değil, erişim denemesidir).
      bildirim: V.bildirimSayi(D, bildirimOkunduZamani()) || null,
      // Kurulum eksiği varsa menü satırında kırmızı rozet: yönetici ekranı
      // açmadan kaç özelliğin kapalı olduğunu görsün.
      kurulumEksik: V.kurulumOzet(D).eksik || null
    };
  }

  // Kesinti şeridi: sayfanın üstünde durur, sessiz şube yokken hiç görünmez.
  // Zamanla kendi kendine açılan bir uyarı olduğu için her yenilemede tazelenir.
  function seritYaz() {
    const kutu = el('uyari');
    if (!kutu) return;
    const html = V.kurulumSeridi(D) + V.uyariSeridi(D, ui);
    kutu.innerHTML = html;
    kutu.hidden = !html;
  }

  // --- Şube alarmı bildirimi -----------------------------------------------
  // Şerit ve menü rozeti yalnız panel önündeyken işe yarar; yönetici başka bir
  // sekmedeyken haber sessiz kalırdı. Yeni bir paylaşım girişimi doğduğunda
  // masaüstü bildirimi de düşer (sohbet bildirimiyle aynı yol; bkz. chat.js).
  // İlk yüklemede bilerek susarız: panel açılışında dakikalar önceki bir alarm
  // için pencere açmak, gerçek zamanlı alarmı gürültüye çevirirdi.
  let ihlalImza = null;
  const bildirimVar = () => typeof Notification !== 'undefined' && Notification.permission === 'granted';

  // Alarmı tek cümlede özetler: kim, ne yaptı, nereden. bildirim gövdesi kısa
  // olmalı diye konum ve eşleşen şube aynı satıra sığdırılır.
  function ihlalOzet(p) {
    const parcalar = [V.ihlalCumlesi(p)];
    const k = V.konumBilgi(p.son_ihlal_konum);
    parcalar.push(k ? k.metin : 'Konum alınamadı (cihaz izin vermedi, IP çözülemedi).');
    if (p.son_ihlal_ip) parcalar.push('IP: ' + p.son_ihlal_ip);
    const paylasan = V.paylasanSube(D, p);
    if (paylasan) parcalar.push('Bu IP ' + paylasan.label + ' şubesinin kayıtlı IP’si!');
    return p.label + ' · ' + parcalar.join(' · ');
  }

  function ihlalBildir() {
    const simdi = {};
    (D.players || []).forEach(p => {
      if (!V.ihlalVar(p)) return;
      simdi[p.id] = Number(p.ihlal_sayisi || 0) + '|' + (p.son_ihlal_at || '');
    });
    const onceki = ihlalImza;
    ihlalImza = simdi;
    if (!onceki) return;                       // ilk yükleme: sessizce tohumla
    Object.keys(simdi).forEach(id => {
      if (onceki[id] === simdi[id]) return;    // bu şubede yeni bir şey yok
      const p = (D.players || []).find(x => x.id === id);
      if (!p) return;
      // Ekranda şerit zaten güncellenir; bildirim onu öne taşır.
      if (bildirimVar()) {
        try {
          new Notification('Derin Record — şube alarmı', {
            body: ihlalOzet(p),
            tag: 'radyo-ihlal-' + id
          });
        } catch { /* bildirim engellendi: şerit yine görünür */ }
      }
    });
  }

  // ---------- Plan takvimi yardımcıları ----------
  // Takvimin gövdesi plan-takvim.js'te; buradakiler yalnızca kaydetme ve
  // yerel hatırlama. Kaydet düğmesi yok, her değişiklik anında gider.

  const PLAN_KATLI_ANAHTARI = 'derin_plan_katli';

  function planKatliOku() {
    try { return JSON.parse(localStorage.getItem(PLAN_KATLI_ANAHTARI)) || []; } catch { return []; }
  }
  function planKatliYaz(liste) {
    try { localStorage.setItem(PLAN_KATLI_ANAHTARI, JSON.stringify(liste || [])); } catch { /* özel sekme */ }
  }

  function planSiradaki(gun, tur) {
    const ayni = (D.planItems || []).filter(x => x.gun === gun && x.tur === tur);
    return ayni.reduce((en, x) => Math.max(en, (x.sira || 0) + 1), 0);
  }

  // Sunucuya yazmayı dener; ekranı çizmez. Dönüş null ise başarılı, değilse
  // hata nesnesi. Böylece çağıran, iyimser güncelleme yapıp yapmayacağına
  // kendisi karar verebiliyor.
  // Eksik kolon (plan_maddeleri 'yontem' eklenmeden güncellenmişse) sunucudan
  // 42703 ile döner. Ham mesaj "column ... does not exists" der ve kullanıcı
  // ne yapacağını anlamaz; onun yerine çalıştırılacak dosya söylenir.
  function planHatasi(hata) {
    if (hata && hata.code === '42703') {
      return { code: '42703', message: 'plan_maddeleri güncellenmemiş: supabase/plan-takvimi.sql dosyasını SQL Editor\'de bir kez çalıştırın.' };
    }
    return hata;
  }

  // Ödeme yöntemi seçicisini okur. Boş ya da tanınmayan değer null sayılır:
  // veritabanındaki sınırlı liste (nakit / kart / havale) dışına yazılmaz ve
  // "yöntem belirtilmedi" durumu veriye uydurulmaz. İki form aynı anda açık
  // kalabildiği için önek ayrır ('gir' ekleme, 'duzenle' satır düzenleme).
  function planYontemOku(onek) {
    const kutu = el('view').querySelector('[data-plan-' + onek + '="odeme-yontem"]');
    const v = kutu ? String(kutu.value || '') : '';
    const list = (window.DerinPlan && window.DerinPlan.ODEME_YONTEMLERI) || [];
    return list.some(x => x[0] === v) ? v : null;
  }

  async function planYazDene(islem, veri) {
    const depo = client.from('plan_maddeleri');
    let hata = null;
    try {
      if (islem === 'ekle') {
        hata = (await depo.insert(veri)).error || null;
      } else if (islem === 'guncelle') {
        // Yalnız gönderilen alanlar yazılır: işaret değişikliği 'bitti' taşır,
        // satır düzenleme ise 'marka'/'tutar'/'yontem'. Birini diğerinin üstüne
        // yazmak (ör. düzenlemede bitti'yi false yapmak) veriyi bozar.
        const degisim = { updated_at: new Date().toISOString() };
        ['bitti', 'marka', 'tutar', 'metin', 'yontem'].forEach(a => { if (a in veri) degisim[a] = veri[a]; });
        const sorun = await yazDogrula(depo.update(degisim).eq('id', veri.id), 'Satır kaydedilemedi');
        hata = sorun ? { message: sorun } : null;
      } else if (islem === 'sil') {
        const sorun = await yazDogrula(depo.delete().eq('id', veri.id), 'Satır silinemedi');
        hata = sorun ? { message: sorun } : null;
      } else if (islem === 'not') {
        const mevcut = (D.planItems || []).find(x => x.gun === veri.gun && x.tur === 'not');
        if (mevcut) {
          const sorun = await yazDogrula(depo
            .update({ metin: veri.metin, updated_at: new Date().toISOString() })
            .eq('id', mevcut.id), 'Not kaydedilemedi');
          hata = sorun ? { message: sorun } : null;
        } else {
          hata = (await depo.insert({ gun: veri.gun, tur: 'not', metin: veri.metin })).error || null;
        }
      }
    } catch (e) { hata = e; }
    return planHatasi(hata);
  }

  // Tek yerden yazma: ekle / güncelle / sil. Başarısızlıkta kullanıcıya
  // söylenir ve veri yeniden okunur, böylece ekran gerçeği gösterir.
  async function planYaz(islem, veri) {
    const hata = await planYazDene(islem, veri);
    if (hata) {
      bildir('Kaydedilemedi: ' + (hata.message || 'bilinmeyen hata'), true);
      return false;
    }
    // Sessiz yenileme (yenile(true)) yalnız yan menüyü tazeler, içeriği
    // çizmez. Burada kullanıcı bir madde ekledi ya da sildi: listenin hemen
    // güncellenmesi gerekiyor, yoksa kayıt gider ama ekran eski kalır.
    await yenile();
    return true;
  }

  // İyimser ekleme: satır önce ekranda belirir, sonra sunucuya gider. Kayıt
  // düşerse satır silinmez; metin ekranda durur, satır "kaydedilemedi" diye
  // işaretlenir. Böylece yazılan hiçbir şey sessizce kaybolmaz.
  async function planEkle(tur, gun, veri) {
    const yerel = Object.assign({
      id: 'yerel-' + Date.now(), gun: gun, tur: tur, bitti: false,
      sira: planSiradaki(gun, tur), hata: null
    }, veri);
    D.planItems = (D.planItems || []).concat([yerel]);
    state.planYeni = null;
    ciz();

    const hata = await planYazDene('ekle', Object.assign({ gun: gun, tur: tur, sira: yerel.sira }, veri));
    if (hata) { yerel.hata = hata.message || 'kaydedilemedi'; ciz(); return; }
    await yenile();
  }

  // Satır içi ödeme formunu okur ve kaydeder.
  function planGirOdeme(iso) {
    const markaKutu = el('view').querySelector('[data-plan-gir="odeme-marka"]');
    const tutarKutu = el('view').querySelector('[data-plan-gir="odeme-tutar"]');
    const marka = (markaKutu ? markaKutu.value : '').trim();
    const tutar = Number(String(tutarKutu ? tutarKutu.value : '').replace(',', '.'));
    if (!marka) { bildir('Marka / açıklama gerekli.', 'err'); if (markaKutu) markaKutu.focus(); return; }
    if (!isFinite(tutar)) { bildir('Tutar sayı olmalı.', 'err'); if (tutarKutu) tutarKutu.focus(); return; }
    return planEkle('odeme', iso, { metin: '', marka: marka, tutar: tutar, yontem: planYontemOku('gir') });
  }

  // Enter: maddeyi ekler; ödemede marka→tutar ilerler, tutarda kaydeder.
  function planGirEnter(alan) {
    const iso = alan.dataset.id;
    if (alan.dataset.planGir === 'madde') {
      const metin = alan.value.trim();
      if (!metin) return;
      return planEkle('madde', iso, { metin: metin });
    }
    if (alan.dataset.planGir === 'odeme-marka') {
      const t = el('view').querySelector('[data-plan-gir="odeme-tutar"]');
      if (t) t.focus();
      return;
    }
    return planGirOdeme(iso);
  }

  // Açık düzenleme formunu okur ve satırı günceller. Marka ve tutar birlikte
  // yazılır; biri boş/geçersizse kayıt yapılmaz ve alan odakta kalır, böylece
  // yarısı kaydedilmiş bir satır oluşmaz.
  async function planDuzenleKaydet(id) {
    const satir = (D.planItems || []).find(x => x.id === id);
    if (!satir) return;
    const markaKutu = el('view').querySelector('[data-plan-duzenle="odeme-marka"]');
    const tutarKutu = el('view').querySelector('[data-plan-duzenle="odeme-tutar"]');
    const marka = (markaKutu ? markaKutu.value : '').trim();
    const tutar = Number(String(tutarKutu ? tutarKutu.value : '').replace(',', '.'));
    if (!marka) { bildir('Marka / açıklama gerekli.', 'err'); if (markaKutu) markaKutu.focus(); return; }
    if (!isFinite(tutar)) { bildir('Tutar sayı olmalı.', 'err'); if (tutarKutu) tutarKutu.focus(); return; }
    // Kayıt düşerse form açık ve yazılan değerler ekranda kalır: yeniden
    // çizim ancak başarıdan sonra olur, sessiz kayıp olmaz. planYaz burada
    // kullanılmaz, çünkü o başarısızlıkta da çizer ve formu kapatırdı.
    const hata = await planYazDene('guncelle', { id: id, marka: marka, tutar: tutar, yontem: planYontemOku('duzenle') });
    if (hata) { bildir('Kaydedilemedi: ' + (hata.message || 'bilinmeyen hata'), true); return; }
    state.planDuzenle = null;
    await yenile();
  }

  state.planKatli = planKatliOku();

  function ciz() {
    // Kapı ekranındayken (giriş yok / yetki yok) istemci hazır olmaz;
    // bu durumda adres çubuğundaki değişiklikler çizim tetiklememeli.
    if (!client) return;
    el('rail').innerHTML = V.nav(state, sayimlar(), kullanici);
    const g = V.gorunum(state, D, ui);
    el('page-title').textContent = g.baslik;
    el('page-sub').textContent = g.alt;
    el('view').innerHTML = g.html;
    seritYaz();
    // Satır içi ekleme formu açıksa odak ona gider: düğmeye basan kullanıcı
    // hemen yazmaya başlayabilsin.
    if (state.planYeni) {
      const alan = el('view').querySelector('[data-plan-gir]');
      if (alan) alan.focus();
    }
    // Satır düzenleme açıksa odak marka alanına gider ve metin seçili gelir:
    // kullanıcı doğrudan üstüne yazabilsin. Önce marka, sonra tutar.
    if (state.planDuzenle) {
      const alan = el('view').querySelector('[data-plan-duzenle]');
      if (alan) { alan.focus(); if (alan.select) alan.select(); }
    }
    const now = Date.now();
    const caliyor = D.players.filter(p => p.is_playing && V.canliMi(p, now)).length;
    const bagli = D.players.filter(p => V.canliMi(p, now)).length;
    const nokta = el('live-dot');
    nokta.className = 'status-dot' + (bagli ? '' : ' bekliyor');
    el('live-text').textContent = bagli ? `${bagli} şube bağlı` : (caliyor ? `${caliyor} kanal çalıyor` : 'canlı bağlantı yok');
    satirSuruklemeBagla();
    // Bildirimler ekranı açıkken damga hemen tazelenir: ekran bir önceki
    // damgayla çizildi (yeni satırlar "yeni" göründü), rozet ise bu turda
    // susmaya başlar. Menü satırını yeniden çizmek rozeti anında siler;
    // bir sonraki veri tazelemesini beklemek rozeti dakikalarca açık bırakırdı.
    if (state.nav === 'bildirim') {
      try { localStorage.setItem(BILDIRIM_OKUNDU_ANAHTARI, new Date().toISOString()); } catch { /* saklanamadı */ }
      el('rail').innerHTML = V.nav(state, sayimlar(), kullanici);
    }
  }

  // ---------- Veri ----------
  // Bir Supabase fonksiyonunun kurulu olup olmadığını yoklar. true: var,
  // false: yok (42883), null: bilinmiyor (yetki/ağ hatası). Yan etkisi yoktur:
  // yalnız okuma yapan fonksiyonlar sahte bir anahtarla çağrılır.
  async function rpcVarMi(fn, args) {
    try {
      const { error } = await client.rpc(fn, args);
      if (!error) return true;
      if (error.code === '42883' || /does not exist/i.test(error.message || '')) return false;
      return null;
    } catch { return null; }
  }

  // Kurulum dosyası çalıştırılmadıysa sunucu fonksiyonu tanımaz (PostgREST
  // 42883 / "schema cache"). Bu durumu tek cümleyle söyleriz: "token
  // kaydedilemedi" demek, eksiği saklardı.
  const kurulumUyarisi = (error, dosya) => /does not exist|schema cache/i.test((error && error.message) || '')
    ? 'Sunucu bu işlevi tanımıyor: supabase/' + dosya + ' dosyasını çalıştırın.'
    : null;

  async function veriYukle() {
    const [brands, folders, tracks, players, broadcast, playerBroadcast, announcements, playlists, playlistTracks, coffeeAttempts, olaylar, subscriptions, plans, planItems] = await Promise.all([
      client.from('brands').select('id,name,slug,is_active,access_code').order('name'),
      client.from('radio_folders').select('id,name,description,cover_path,shuffle').order('name'),
      client.from('radio_tracks').select('id,folder_id,title,storage_path,sort_order,duration_sec,cover_path').order('sort_order'),
      // player_code ve ihlal_* alanları supabase/radio-sube-kodu.sql ile gelir.
      // Dosya henüz çalıştırılmadıysa PostgREST bu alanları tanımaz ve sorgu hata
      // döner: o durumda şubeler boş görünür, eksiklik Kurulum durumu ekranında
      // dosya adıyla yazar ve tek dokunuşla kurulur.
      client.from('brand_players').select('id,brand_id,label,player_key,player_code,last_seen_at,open_time,close_time,bound_device_id,bound_at,first_ip,last_ip,last_ip_at,is_playing,ihlal_sayisi,son_ihlal_at,son_ihlal_tur,son_ihlal_cihaz,son_ihlal_ip,son_ihlal_konum').order('label'),
      client.from('brand_broadcast').select('brand_id,folder_id,playlist_id,shuffle,updated_at'),
      // Şubeye özel yayın (supabase/radio-subeye-ozel-yayin.sql). Tablo henüz
      // kurulmadıysa sorgu hata döner: bütün şubeler genel yayında sayılır.
      client.from('player_broadcast').select('player_id,folder_id,playlist_id,updated_at'),
      client.from('radio_announcements').select('id,brand_id,storage_path,label,created_at').order('created_at', { ascending: false }).limit(50),
      client.from('brand_playlists').select('id,brand_id,name,description,cover_path,shuffle,created_at').order('created_at'),
      client.from('brand_playlist_tracks').select('id,playlist_id,track_id,sort_order').order('sort_order'),
      client.from('coffee_access_attempts').select('id,brand_id,slug,success,ip,created_at').order('created_at', { ascending: false }).limit(200),
      // Bağlantı geçmişi (supabase/radio-baglanti-gecmisi.sql). Tablo henüz
      // kurulmadıysa sorgu hata döner, data null gelir: ekran boş kalır ama
      // panelin geri kalanı çalışmaya devam eder.
      client.from('radio_player_events')
        .select('id,player_key,player_id,brand_id,device_id,kind,detail,at')
        .order('at', { ascending: false }).limit(600),
      client.from('subscriptions').select('*'),
      client.from('plans').select('*').order('sort_order'),
      // Plan takvimi (supabase/plan-takvimi.sql). Tablo kurulmadıysa sorgu
      // hata döner, data null gelir: takvim boş açılır, panelin geri kalanı
      // çalışmaya devam eder.
      client.from('plan_maddeleri').select('*').order('gun')
    ]);
    D = {
      brands: brands.data || [], folders: folders.data || [], tracks: tracks.data || [],
      players: players.data || [], broadcast: broadcast.data || [],
      playerBroadcast: playerBroadcast.data || [], announcements: announcements.data || [],
      playlists: playlists.data || [], playlistTracks: playlistTracks.data || [],
      coffeeAttempts: coffeeAttempts.data || [], olaylar: olaylar.data || [],
      subscriptions: subscriptions.data || [], plans: plans.data || [],
      planItems: planItems.data || [],
      requests: D.requests
    };

    // Temel şema: panelin çalışması için şart olan tablolar. Biri yoksa panel
    // boş görünür ama nedeni yazmaz; bu bayraklar kurulum ekranında ve üst
    // şeritte konuşur (bkz. radyoPanelViews.temelSema).
    D.temel = {
      brands: !brands.error, radio_folders: !folders.error, radio_tracks: !tracks.error,
      brand_players: !players.error, brand_broadcast: !broadcast.error,
      radio_announcements: !announcements.error, brand_playlists: !playlists.error,
      brand_playlist_tracks: !playlistTracks.error
    };

    // Opsiyonel tabloların kurulu olup olmadığını ana sorguların hatasından
    // çıkarırız: tablo yoksa Supabase "relation does not exist" döndürür.
    D.kurulum = D.kurulum || {};
    D.kurulum['radio-subeye-ozel-yayin.sql'] = !playerBroadcast.error;
    D.kurulum['radio-baglanti-gecmisi.sql'] = !olaylar.error;
    D.kurulum['plan-takvimi.sql'] = !planItems.error;

    // Telefon bildirimi (supabase/radio-telegram.sql): alarmı sunucudan
    // Telegram'a taşıyan ayar ve tetikleyici. Dosya henüz çalıştırılmadıysa
    // RPC hata verir; kart "kurulmadı" der ve panelin gerisi çalışmaya devam
    // eder. Yönetici olmayan oturumda da aynı yol: veri gelmez, kart susar.
    try {
      const tg = await client.rpc('radio_telegram_durum');
      D.telegram = tg.error ? null : (tg.data || null);
      D.kurulum['radio-telegram.sql'] = !tg.error;
    } catch {
      D.telegram = null;
      D.kurulum['radio-telegram.sql'] = false;
    }

    // Çalan parça ve çalma listesi alanları sonradan eklendi
    // (supabase/radio-calan-parca.sql, supabase/radio-liste-bildirimi.sql).
    // Henüz eklenmemişse sorgu hata döner; o zaman oynatıcı da liste bildirmez
    // ve ekranda markaya atanmış kaynak adı görünür. Sorguyu ayrı ve hataya
    // toleranslı tutarız ki ana yükleme bundan etkilenmesin. Liste alanları
    // eksikse parça alanlarıyla devam ederiz: sahadaki "şu an çalan parça"
    // bilgisi yalnızca yeni SQL yüzünden kaybolmasın.
    try {
      let calanlar = await client.from('brand_players')
        .select('id,now_title,now_at,now_playlist_id,now_playlist_name');
      if (calanlar.error) {
        D.kurulum['radio-liste-bildirimi.sql'] = false;
        calanlar = await client.from('brand_players').select('id,now_title,now_at');
      } else {
        D.kurulum['radio-liste-bildirimi.sql'] = true;
      }
      if (calanlar.error) {
        D.kurulum['radio-calan-parca.sql'] = false;
      } else {
        D.kurulum['radio-calan-parca.sql'] = true;
        if (Array.isArray(calanlar.data)) {
          const harita = new Map(calanlar.data.map(x => [x.id, x]));
          D.players = D.players.map(p => Object.assign({}, p, harita.get(p.id) || {}));
        }
      }
    } catch { /* alanlar daha eklenmemiş: sorun değil */ }

    // Yayın başlangıç parçası (supabase/radio-yayin-baslat.sql): brand_broadcast
    // ve player_broadcast tablolarına start_track_id kolonu ekler. Kolon yoksa
    // yayın başlatırken başlangıç parçası kaydedilemez, sessizce yok sayılırız.
    try {
      const deneme = await client.from('brand_broadcast')
        .select('brand_id,start_track_id').limit(1);
      D.kurulum['radio-yayin-baslat.sql'] = !deneme.error;
    } catch { D.kurulum['radio-yayin-baslat.sql'] = false; }

    // Oyuncu tarafı fonksiyonlar (supabase/radio-erisim.sql, radio-yayin-durdurma.sql)
    // tablo değil fonksiyon oldukları için RPC ile yoklanır. Fonksiyon yokken
    // Supabase 42883 ("function does not exist") döner. Başka hata (yetki vb.)
    // gelirse "denenmedi" bırakılır: yanlış alarm verilmez.
    const sahteAnahtar = '00000000-0000-4000-8000-000000000000';
    D.kurulum['radio-erisim.sql'] = await rpcVarMi('radio_listeler', { p_player_key: sahteAnahtar });
    D.kurulum['radio-yayin-durdurma.sql'] = await rpcVarMi('radio_yayin_durumu', { p_player_key: sahteAnahtar });
    // Şube kodu ve paylaşım alarmı (supabase/radio-sube-kodu.sql). Fonksiyonu
    // yan etkisiz yoklarız: bilinmeyen anahtar hiçbir şey yazmaz, yalnız "yok"
    // cevabını verir. Kurulmadıysa oynatıcı yalnız linkle açılır (koruma yok) ve
    // panel bunu kurulum ekranında söyler.
    D.kurulum['radio-sube-kodu.sql'] = await rpcVarMi('radio_kanit', {
      p_player_key: sahteAnahtar, p_konum: 'prova'
    });

    // Şubeye yüklenen listeler (supabase/radio-sube-listeleri.sql). Tablo henüz
    // kurulmadıysa sorgu hata döner: o zaman şube satırında yükleme sütunu
    // çizilmez ve cihaz bugünkü davranışını korur. Ayrı ve hataya toleranslı
    // tutulur ki ana yükleme bundan etkilenmesin.
    try {
      const yuklu = await client.from('player_playlists')
        .select('player_id,playlist_id,sort_order').order('sort_order');
      D.kurulum['radio-sube-listeleri.sql'] = !yuklu.error;
      if (!yuklu.error && Array.isArray(yuklu.data)) {
        D.playerPlaylists = yuklu.data;
        D.subeListeleriVar = true;
      }
    } catch { /* tablo kurulmamış: yükleme özelliği kapalı kalır */ }

    // Marka kapağı (supabase/marka-kapagi.sql). Kolon eklenmemişse sorgu 42703
    // ("column does not exist") döner: özellik kapalı kalır, marka sayfasında
    // kapak bölümü hiç çizilmez. Ayrı ve hataya toleranslı tutulur ki ana
    // yükleme bundan etkilenmesin.
    try {
      const kapak = await client.from('brands').select('id,cover_path');
      if (kapak.error) {
        D.kurulum['marka-kapagi.sql'] = false;
      } else {
        D.kurulum['marka-kapagi.sql'] = true;
        const harita = new Map((kapak.data || []).map(x => [x.id, x.cover_path]));
        D.brands.forEach(b => { b.cover_path = harita.get(b.id) ?? null; });
      }
    } catch { /* kolon yok: marka kapağı kapalı */ }

    // Veri her tazelendiğinde alarm imzası karşılaştırılır: yeni bir paylaşım
    // girişimi doğduysa haber verilir.
    ihlalBildir();
  }

  // sessiz: yalnızca Canlı durum ekranı kendini tazeler; form girdileriniz
  // (klasör adı, yeni marka vb.) yeniden çizimle silinmez.
  async function yenile(sessiz) {
    await veriYukle();
    if (sessiz && state.nav !== 'canli') { el('rail').innerHTML = V.nav(state, sayimlar(), kullanici); seritYaz(); return; }
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
      basHarf: String(ad).trim().split(/\s+/).slice(0, 2).map(s => s[0]).join('').toUpperCase() || 'DR',
      // Kapı zaten yalnız yöneticiyi geçirir; yayın başlatma gibi bölüm
      // yazma işlemleri bu bayrağı bir kez daha kontrol eder.
      adminMi: true
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
      const up = await window.DerinR2.yukle('radio-announcements', yol, blob, blob.type);
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
        yukle: (yol, dilim, tip) => window.DerinR2.yukle('radio-audio', yol, dilim, tip),
        sil: yollar => window.DerinR2.sil('radio-audio', yollar)
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
        await window.DerinR2.sil('radio-audio', Ses.parcalariCoz(sonuc.path).map(p => p.path));
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
      // Süreyi okumak için üretilen blob adresini iş bitince bırakırız; çok
      // parça yükleyen bir oturumda bellekte birikmesin.
      const url = URL.createObjectURL(dosya);
      const a = new Audio(url);
      let bitti = false;
      const tamam = v => {
        if (bitti) return;
        bitti = true;
        URL.revokeObjectURL(url);
        res(v);
      };
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
        // Satır `data-kayit` taşıyorsa çalma listesi kaydıdır
        // (brand_playlist_tracks), yalnız `data-id` taşıyorsa klasör parçasıdır
        // (radio_tracks): sıra doğru tabloya yazılmalı.
        const tur = tasinan.dataset.kayit ? 'playlist' : 'track';
        const govde = satir.parentElement;
        const yerler = Array.from(govde.children);
        const kaynak = yerler.indexOf(tasinan), hedef = yerler.indexOf(satir);
        if (kaynak < 0 || hedef < 0) return;
        govde.removeChild(tasinan);
        govde.insertBefore(tasinan, hedef > kaynak ? satir.nextSibling : satir);
        tasinan = null;
        const yeniSira = Array.from(govde.children)
          .map(r => tur === 'playlist' ? r.dataset.kayit : r.dataset.id).filter(Boolean);
        await sirayiKaydet(yeniSira, tur);
      });
    });
  }

  async function sirayiKaydet(idlistesi, tur) {
    const tablo = tur === 'playlist' ? 'brand_playlist_tracks' : 'radio_tracks';
    const guncellemeler = idlistesi.map((id, i) => yazDogrula(
      client.from(tablo).update({ sort_order: i }).eq('id', id), 'Sıra kaydedilemedi'));
    const sonuclar = await Promise.all(guncellemeler);
    const hataVar = sonuclar.find(s => s);
    if (hataVar) { hata(hataVar); return; }
    // Bellekteki sıra da güncellenir ki yeni çizim doğru sırayı göstersin.
    if (tur === 'playlist') {
      D.playlistTracks.forEach(x => { const i = idlistesi.indexOf(x.id); if (i > -1) x.sort_order = i; });
    } else {
      D.tracks.forEach(t => { const i = idlistesi.indexOf(t.id); if (i > -1) t.sort_order = i; });
    }
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

    // Düğme işlenirken beklenmeyen bir hata olursa sessizce yutulmaz:
    // aksi hâlde tıklama "hiçbir şey olmuyor" gibi görünür (bkz. catch).
    try {
      switch (act) {
      // --- plan takvimi (bkz. plan-takvim.js) ---
      // Kaydet düğmesi yok: her değişiklik anında gider. Yazma başarısız
      // olursa kullanıcıya söylenir; sessizce yutulmaz.
      case 'plan-gun': {
        // Bir güne girilir: ay ızgarası yerine o günün sekmesi açılır. Aynı
        // güne tekrar basmak da geri döndürür (klavye/dokunmatik kolaylığı).
        state.planAcikGun = state.planAcikGun === id ? null : id;
        state.planYeni = null;
        state.planDuzenle = null;
        return ciz();
      }
      case 'plan-gun-kapat': {
        state.planAcikGun = null;
        state.planYeni = null;
        state.planDuzenle = null;
        return ciz();
      }
      case 'plan-gun-kaydir': {
        // Gün görünümünde gün gün ilerle/geri git. Ay sınırı aşılırsa ay
        // başlığı da kayar; kullanıcı geri döndüğünde doğru ay açılır.
        if (!state.planAcikGun) return;
        const p = String(state.planAcikGun).slice(0, 10).split('-').map(Number);
        const d = new Date(Date.UTC(p[0], p[1] - 1, p[2] + (id === 'onceki' ? -1 : 1)));
        state.planAcikGun = d.toISOString().slice(0, 10);
        state.planYil = d.getUTCFullYear();
        state.planAy = d.getUTCMonth() + 1;
        state.planYeni = null;
        state.planDuzenle = null;
        return ciz();
      }
      case 'plan-ay': {
        const bugun = new Date();
        let y = state.planYil || bugun.getFullYear();
        let a = state.planAy || (bugun.getMonth() + 1);
        a += (id === 'onceki' ? -1 : 1);
        if (a < 1) { a = 12; y -= 1; } else if (a > 12) { a = 1; y += 1; }
        state.planYil = y; state.planAy = a;
        state.planYeni = null;
        state.planDuzenle = null;
        return ciz();
      }
      case 'plan-durum': {
        // Ödeme listelerini süzer. Seçili süzgece tekrar basmak süzgeci
        // kaldırır (seçili → Tümü); böylece "ödenmemişleri gör" ile
        // "hepsini gör" arasında tek düğmeyle gidilir.
        state.planDurum = (state.planDurum === id) ? '' : (id || '');
        return ciz();
      }
      case 'plan-katla': {
        const liste = state.planKatli || (state.planKatli = []);
        const i = liste.indexOf(id);
        if (i === -1) liste.push(id); else liste.splice(i, 1);
        planKatliYaz(liste);
        return ciz();
      }
      case 'plan-yeni': {
        // id: 'madde:2026-10-27' | 'odeme:2026-10-27'. ciz() odağı kendisi
        // kurar (yukarı bkz.); burada yalnız hangi form açık, o tutulur.
        state.planYeni = id;
        return ciz();
      }
      case 'plan-yeni-kapat': {
        state.planYeni = null;
        return ciz();
      }
      case 'plan-odeme-kaydet': return planGirOdeme(id);
      case 'plan-duzenle': {
        // Ödeme satırında kalem simgesi: satır yerinde form olur. Aynı satıra
        // tekrar basmak düzenlemeyi kapatır (aynı satırda takılı kalmasın).
        state.planDuzenle = state.planDuzenle === id ? null : id;
        state.planYeni = null;
        return ciz();
      }
      case 'plan-duzenle-kapat': {
        state.planDuzenle = null;
        return ciz();
      }
      case 'plan-duzenle-kaydet': return planDuzenleKaydet(id);
      case 'plan-odeme-durum': {
        // Abonelikten gelen bir ödemeyi elle işaretler: ödendi / ödenmedi.
        // İlk işarette o güne bir 'odeme' satırı düşer (böylece geçmişe
        // kaydolur ve ÖDEME GEÇMİŞİ'nde görünür); sonraki tıklamalar aynı
        // satırın bitti işaretini değiştirir. Bugünü geçen bir ödeme
        // işaretlenmezse sütunda "gecikmiş" olarak kalır.
        // id: "<gun>:<durum>:<marka(kodlanmış)>:<tutar>"
        const p = String(id).split(':');
        const iso = p[0], durum = p[1];
        const tutar = Number(p[3]);
        let marka = p[2] || '';
        try { marka = decodeURIComponent(marka); } catch { /* bozuk kod: olduğu gibi kullan */ }
        if (!iso || !durum) return;
        const mevcut = (D.planItems || []).find(x => x.tur === 'odeme' && x.gun === iso && x.marka === marka);
        if (mevcut) return planYaz('guncelle', { id: mevcut.id, bitti: durum === 'odendi' });
        return planYaz('ekle', {
          gun: iso, tur: 'odeme', metin: '', marka: marka,
          tutar: isFinite(tutar) ? tutar : 0, bitti: durum === 'odendi',
          sira: planSiradaki(iso, 'odeme')
        });
      }
      case 'plan-isaret': {
        const satir = (D.planItems || []).find(x => x.id === id);
        if (!satir) return;
        return planYaz('guncelle', { id: id, bitti: !satir.bitti });
      }
      case 'plan-sil': return planYaz('sil', { id: id });
      case 'plan-tekrar': {
        // Kaydedilemeyen satırı yeniden gönderir. Başarılıysa sunucudan okunan
        // gerçek satırla yer değiştirir; yine düşerse işaret kalır.
        const satir = (D.planItems || []).find(x => x.id === id);
        if (!satir || !satir.hata) return;
        const veri = satir.tur === 'odeme'
          ? { metin: '', marka: satir.marka, tutar: satir.tutar, yontem: satir.yontem || null }
          : { metin: satir.metin };
        const hata = await planYazDene('ekle', Object.assign({ gun: satir.gun, tur: satir.tur, sira: satir.sira }, veri));
        if (hata) { satir.hata = hata.message || 'kaydedilemedi'; ciz(); return; }
        await yenile();
        return;
      }

      // --- pencere / çekmece / genel ---
      case 'modal-close': return pencereKapat();
      case 'kurulum-ac': {
        // Üstteki "kurulum eksik" şeridi: doğrudan kurulum ekranına götürür.
        cekmeceKapat();
        state.nav = 'kurulum'; state.sub = 'kurulum';
        state.q = ''; el('search').value = '';
        git('#/kurulum');
        return;
      }
      case 'kurulum-sql': return kurulumDosyaGoster(hedef.dataset.id);
      case 'kurulum-tumu': return kurulumTumEksikGoster();
      case 'kurulum-kapat-sql': return kurulumKapatGoster();
      case 'kurulum-rehber': return kurulumDosyaGoster('kurulum.md');
      case 'kurulum-yenile': {
        // SQL çalıştırıldıktan sonra sayfayı yenilemeye gerek kalmasın: bütün
        // tabloları yeniden yoklar ve sonucu bildirir.
        await yenile();
        const o = V.kurulumOzet(D);
        bildir(o.eksik
          ? `Yeniden denendi: ${o.eksik} dosya hâlâ eksik.`
          : `Kurulum tamam: ${o.kurulu}/${o.toplam} dosya kurulu.`, o.eksik ? 'err' : null);
        return;
      }
      case 'kurulum-sql-kopyala': {
        const ta = el('modal').querySelector('#kurulum-sql');
        if (!ta) return;
        try {
          await navigator.clipboard.writeText(ta.value);
          bildir('SQL kopyalandı; Supabase SQL Editor\'de çalıştırın.');
        } catch { ta.select(); bildir('Otomatik kopyalanamadı; metni elle kopyalayın.', 'err'); }
        return;
      }
      // Telefon bildirimi (supabase/radio-telegram.sql): panel kapalıyken de
      // alarmın telefona düşmesi. Buradaki dört işlem de aynı yolun parçası:
      // token'ı kaydet, sohbeti bul, aç/kapat, bir test mesajı gönder.
      case 'tg-kaydet': {
        const alan = el('view').querySelector('[data-tg-token]');
        const token = alan ? alan.value.trim() : '';
        if (!token) return hata('Token alanı boş: BotFather\'ın verdiği satırı yapıştırın.');
        hedef.disabled = true;
        try {
          const { data, error } = await client.rpc('radio_telegram_kaydet', { p_token: token });
          if (error) return hata(kurulumUyarisi(error, 'radio-telegram.sql') || 'Token kaydedilemedi: ' + error.message);
          if (!data || data.ok !== true) return hata((data && data.hata) || 'Token kaydedilemedi.');
          if (alan) alan.value = '';
          await yenile(false);
          bildir('Token kaydedildi. Şimdi bota Telegram\'dan bir kez yazıp SOHBETİ BUL\'a basın.');
        } finally { hedef.disabled = false; }
        return;
      }

      // Sohbet kimliğini Telegram'dan bulur: kullanıcı bota bir kez yazdıktan
      // sonra sunucu getUpdates'e bakıp son sohbeti kaydeder. Bu çağrı sunucuda
      // birkaç saniye bekler (Telegram cevabı bekleniyor): düğme kilitli kalır.
      case 'tg-sohbet': {
        hedef.disabled = true;
        const eskiMetin = hedef.textContent;
        hedef.textContent = 'ARANIYOR…';
        try {
          const { data, error } = await client.rpc('radio_telegram_sohbet_bul');
          if (error) return hata(kurulumUyarisi(error, 'radio-telegram.sql') || 'Sohbet bulunamadı: ' + error.message);
          if (!data || data.ok !== true) return hata((data && data.hata) || 'Sohbet bulunamadı.');
          await yenile(false);
          bildir('Sohbet bulundu: ' + (data.ad || data.chat_id) + '. Şimdi BİLDİRİMİ AÇ\'a basın.');
        } finally { hedef.disabled = false; hedef.textContent = eskiMetin; }
        return;
      }

      case 'tg-test': {
        hedef.disabled = true;
        const eskiMetin = hedef.textContent;
        hedef.textContent = 'GÖNDERİLİYOR…';
        try {
          const { data, error } = await client.rpc('radio_telegram_test');
          if (error) return hata(kurulumUyarisi(error, 'radio-telegram.sql') || 'Test mesajı gönderilemedi: ' + error.message);
          if (!data || data.ok !== true) return hata((data && data.hata) || 'Test mesajı gönderilemedi.');
          bildir('Test mesajı gönderildi; birkaç saniye içinde telefona düşer.');
          // Telegram'ın cevabı birkaç saniye sonra düşer: durumu tazeleyip
          // ekranda gösteririz, "gitti mi" sorusu cevapsız kalmasın.
          setTimeout(() => { yenile(false).catch(() => {}); }, 4000);
        } finally { hedef.disabled = false; hedef.textContent = eskiMetin; }
        return;
      }

      case 'tg-ac': {
        const acilacak = !(D.telegram && D.telegram.acik);
        hedef.disabled = true;
        try {
          const { data, error } = await client.rpc('radio_telegram_ac', { p_acik: acilacak });
          if (error) return hata(kurulumUyarisi(error, 'radio-telegram.sql') || 'Durum değiştirilemedi: ' + error.message);
          if (!data || data.ok !== true) return hata((data && data.hata) || 'Durum değiştirilemedi.');
          await yenile(false);
          bildir(acilacak
            ? 'Telefon bildirimi açıldı: yeni şube alarmı Telegram\'a da gidecek.'
            : 'Telefon bildirimi kapatıldı; alarm yine bu ekranda görünür.');
        } finally { hedef.disabled = false; }
        return;
      }

      case 'bildirim-ac': {
        // Tarayıcı bildirimi izni yalnız kullanıcı dokunuşuyla istenebilir:
        // alarm şeridindeki düğme tam bu yüzden var (bkz. ihlalBildir).
        if (typeof Notification === 'undefined') {
          hata('Bu tarayıcı bildirim göstermiyor; alarm yalnız bu ekranda görünür.');
          return;
        }
        const izin = await Notification.requestPermission();
        seritYaz();
        bildir(izin === 'granted'
          ? 'Bildirimler açıldı: yeni şube alarmı masaüstüne düşecek.'
          : 'Bildirim izni verilmedi; alarm yalnız bu ekranda görünür.', izin === 'granted' ? null : 'err');
        return;
      }
      case 'gecmis-ac': {
        // Çekmecedeki "tüm geçmişi aç" düğmesi: geçmiş ekranına geçerken şubeyi
        // arama kutusuna yazarız, böylece çizelge o şubeye odaklanır.
        cekmeceKapat();
        state.nav = 'canli'; state.sub = 'gecmis';
        state.q = hedef.dataset.q || '';
        el('search').value = state.q;
        git('#/gecmis');
        return;
      }
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

      // Katlanabilir bölüm (marka sayfasındaki geçmiş listeleri): açık kalan
      // bölümler `state.acik` içinde tutulur, böylece tazeleme/açma sırasında
      // bölüm kendiliğinden kapanmaz.
      case 'katla':
        state.acik = state.acik || {};
        state.acik[id] = !state.acik[id];
        katliYaz();
        ciz();
        return;

      // İkinci seviye katlama (marka sayfasındaki şube geçmişleri). Bu bölümler
      // açık gelir; burada yalnız "kapatıldı" işareti tutulur.
      case 'katla-alt':
        state.kapali = state.kapali || {};
        state.kapali[id] = !state.kapali[id];
        katliYaz();
        ciz();
        return;

      // Çekmecedeki katlanabilir blok. Çekmece içeriği tek seferlik HTML olarak
      // yazılır (panel gibi yeniden çizilmez), bu yüzden durum tutmayız: gövdeyi
      // yerinde açar/kapatırız.
      case 'katla-yerel': {
        const govde = hedef.closest('.block')?.querySelector('[data-yerel-katli]');
        if (!govde) return;
        const acilacak = govde.hidden;
        govde.hidden = !acilacak;
        hedef.textContent = acilacak ? 'KAPAT ▴' : 'AÇ ▾';
        hedef.setAttribute('aria-expanded', acilacak ? 'true' : 'false');
        return;
      }

      // Şube bağlantı geçmişini silme. Geçmiş, "sorun bizde mi, kafede mi"
      // sorusunu cevaplar; yönetici eski gürültüyü temizleyip güncel durumu
      // okuyabilsin. Silme geri alınamaz, bu yüzden kaç kaydın silineceği onay
      // penceresinde yazılıdır. Metin yalnız oynatıcı olaylarını kapsar; sunum
      // kodu denemeleri (kod geçmişi) ayrı bir kayıttır ve silinmez.
      case 'gecmis-del': {
        if (!kullanici.adminMi) return hata('Geçmişi silmek yönetici yetkisi ister.');
        const p = D.players.find(x => x.id === id);
        if (!p) return hata('Şube bulunamadı.');
        const adet = V.olaylariAl(D, { playerId: p.id }).length;
        if (!adet) return hata('Bu şubenin silinecek geçmiş kaydı yok.');
        const b = marka(p.brand_id);
        // Panel geçmişin en yeni 600 kaydını yükler; silme ise şubenin bütün
        // kayıtlarını kapsar. Bu yüzden sayıyı "listede" diye söyleriz.
        if (!await onaySor({
          baslik: 'Şube geçmişi silinsin mi?',
          govde: `${p.label}${b ? ' (' + b.name + ')' : ''} şubesinin bağlantı geçmişi kayıtları silinir; listede ${adet} kayıt var.
            Bu kayıtlardan hesaplanan canlı durum özetleri de sıfırlanır. Geri alınamaz.`,
          onayMetni: 'GEÇMİŞİ SİL'
        })) return;
        const { error } = await client.from('radio_player_events').delete().eq('player_id', p.id);
        if (error) return hata('Geçmiş silinemedi: ' + error.message);
        await yenile(false);
        bildir(p.label + ' şubesinin bağlantı geçmişi silindi.');
        return;
      }

      // Marka geneli: bütün şubelerin geçmişi birlikte silinir.
      case 'marka-gecmis-del': {
        if (!kullanici.adminMi) return hata('Geçmişi silmek yönetici yetkisi ister.');
        const b = marka(id);
        if (!b) return hata('Marka bulunamadı.');
        const adet = V.olaylariAl(D, { brandId: b.id }).length;
        if (!adet) return hata('Bu markanın silinecek geçmiş kaydı yok.');
        if (!await onaySor({
          baslik: 'Marka geçmişi silinsin mi?',
          govde: `${b.name} markasının bütün şubeleri için bağlantı geçmişi kayıtları silinir; listede ${adet} kayıt var. Geri alınamaz.`,
          onayMetni: 'TÜM GEÇMİŞİ SİL'
        })) return;
        const { error } = await client.from('radio_player_events').delete().eq('brand_id', b.id);
        if (error) return hata('Geçmiş silinemedi: ' + error.message);
        await yenile(false);
        bildir(b.name + ' markasının bağlantı geçmişi silindi.');
        return;
      }

      // Yayın başlatma ekranının kararı: seçimler buraya kadar yalnız ekranda
      // beklemişti; yayın bu düğmeyle değişir.
      case 'yayin-basla': {
        if (!kullanici.adminMi) return hata('Yayın başlatmak yönetici yetkisi ister.');
        const s = state.yayin || {};
        const marka = D.brands.find(x => x.id === s.brandId);
        if (!marka) return hata('Yayın için önce markayı seçin.');
        const [tur, kaynakId] = String(s.kaynak || '').split(':');
        if (!kaynakId) return hata('Yayın kaynağını (klasör ya da liste) seçin.');
        const sube = s.playerId ? D.players.find(p => p.id === s.playerId) : null;
        if (s.playerId && !sube) return hata('Seçilen şube bulunamadı.');
        const kaynakKayit = tur === 'folder'
          ? D.folders.find(f => f.id === kaynakId)
          : D.playlists.find(l => l.id === kaynakId);
        const kaynakAdi = kaynakKayit ? kaynakKayit.name : 'seçilen kaynak';
        const parca = s.parcaId ? D.tracks.find(t => t.id === s.parcaId) : null;

        if (!await onaySor({
          baslik: 'Yayın başlatılsın mı?',
          govde: `${sube ? sube.label : marka.name + ' · bütün şubeler'} için yayın “${kaynakAdi}” kaynağıyla başlar${parca ? ' ve “' + parca.title + '” parçasından devam eder' : ''}. Şubedeki cihazlar kendiliğinden yeni yayına geçer.`,
          onayMetni: 'YAYINI BAŞLAT'
        })) return;

        const satir = {
          folder_id: tur === 'folder' ? kaynakId : null,
          playlist_id: tur === 'playlist' ? kaynakId : null,
          updated_at: new Date().toISOString()
        };
        // Kolon ancak supabase/radio-yayin-baslat.sql çalıştırıldıysa vardır:
        // parça seçilmediyse hiç göndermeyiz, tek kare başlatma çalışmaya devam eder.
        if (s.parcaId) satir.start_track_id = s.parcaId;

        const { error } = sube
          ? await client.from('player_broadcast').upsert(Object.assign({ player_id: sube.id }, satir), { onConflict: 'player_id' })
          : await client.from('brand_broadcast').upsert(Object.assign({ brand_id: marka.id }, satir), { onConflict: 'brand_id' });
        if (error) {
          if (error.code === 'PGRST204' && s.parcaId) {
            return hata('Parçadan başlatmak için supabase/radio-yayin-baslat.sql dosyasını çalıştırın.');
          }
          if (error.code === 'PGRST205' && sube) {
            return hata('Şubeye özel yayın tablosu yok: supabase/radio-subeye-ozel-yayin.sql dosyasını çalıştırın.');
          }
          return hata('Yayın başlatılamadı: ' + error.message);
        }
        await yenile(false);
        bildir(sube
          ? sube.label + ' şubesi yeni yayınla başladı.'
          : marka.name + ' şubeleri yeni yayınla başladı.');
        return;
      }

      // Şube çekmecesinden yayın başlatılmaz: çekmece yalnız durumu gösterir ve
      // yöneticiyi tek yayın ekranına taşır. Marka ile şube hazır seçili gelir,
      // kaynağı yönetici seçer; yayın yine "YAYINI BAŞLAT" ile değişir.
      case 'yayin-ac': {
        if (!kullanici.adminMi) return hata('Yayın başlatmak yönetici yetkisi ister.');
        const p = D.players.find(x => x.id === id);
        if (!p) return hata('Şube bulunamadı.');
        cekmeceKapat();
        state.q = ''; el('search').value = '';
        state.yayin = { brandId: p.brand_id, playerId: p.id, kaynak: '', parcaId: '' };
        state.nav = 'canli'; state.sub = 'yayin';
        git(gorunumHash());
        return;
      }

      // Marka sayfasındaki düğme: yayın kaynağı seçimi tek yerde toplandığı
      // için marka sayfası yalnız yayın ekranına yollar, marka hazır seçili gelir.
      case 'marka-yayin-ac': {
        if (!kullanici.adminMi) return hata('Yayın başlatmak yönetici yetkisi ister.');
        if (!D.brands.some(x => x.id === id)) return hata('Marka bulunamadı.');
        state.q = ''; el('search').value = '';
        state.openBrand = null; state.openPlaylist = null;
        state.yayin = { brandId: id, playerId: '', kaynak: '', parcaId: '' };
        state.nav = 'canli'; state.sub = 'yayin';
        git(gorunumHash());
        return;
      }

      // Marka geneli yayının durdurulması: yalnız canlı yayın kaynağı kaydı
      // silinir. Şubelerde o an çalan şarkı kesilmez; cihazlar yüklü listelerini
      // çalmaya devam eder ve yeni bir kaynak atandığında kendiliğinden ona
      // geçerler. Aboneliği geçersiz ya da markası kapatılmış şubeler yine durur:
      // oynatıcı bu ayrımı radio_yayin_durumu ile yapar.
      case 'yayin-durdur': {
        if (!kullanici.adminMi) return hata('Yayın başlatmak yönetici yetkisi ister.');
        const b = marka(id);
        if (!b) return hata('Marka bulunamadı.');
        const k = V.kaynak(D, b.id);
        if (!k || !k.tip) return hata('Bu markanın canlı yayını zaten kapalı.');
        if (!await onaySor({
          baslik: 'Yayın durdurulsun mu?',
          govde: `${b.name} markasının canlı yayın kaynağı kaldırılır. Şubelerde çalmakta olan şarkı kesilmez: cihazlar yüklü listelerini çalmaya devam eder ve yeni bir kaynak atadığınızda kendiliğinden ona geçerler. Markası kapatılan ya da aboneliği biten şubeler yine durur.`,
          onayMetni: 'YAYINI DURDUR'
        })) return;
        const { error } = await client.from('brand_broadcast').delete().eq('brand_id', b.id);
        if (error) return hata('Yayın durdurulamadı: ' + error.message);
        await yenile(false);
        bildir(b.name + ' markasının yayın kaynağı kaldırıldı; şubeler çalmaya devam ediyor.');
        return;
      }

      // Şubeye özel yayının kaldırılması: şube markanın genel yayınına döner.
      // Bu karar da tek yayın ekranından verilir.
      case 'yayin-genel': {
        if (!kullanici.adminMi) return hata('Yayın başlatmak yönetici yetkisi ister.');
        const p = D.players.find(x => x.id === id);
        if (!p) return hata('Şube bulunamadı.');
        const ozel = V.subeKaynagi(D, p.id);
        if (!ozel.tip) return hata('Bu şubede özel bir yayın yok.');
        const b = marka(p.brand_id);
        if (!await onaySor({
          baslik: 'Şube genel yayına dönsün mü?',
          govde: `${p.label} için verilen “${ozel.ad}” yayını kaldırılır; şube ${b ? b.name + ' markasının' : 'markanın'} genel yayınını çalar.`,
          onayMetni: 'GENEL YAYINA DÖNDÜR'
        })) return;
        const { error } = await client.from('player_broadcast').delete().eq('player_id', p.id);
        if (error) {
          return hata(error.code === 'PGRST205'
            ? 'Şubeye özel yayın tablosu kurulmamış: supabase/radio-subeye-ozel-yayin.sql dosyasını çalıştırın.'
            : 'Şube yayını kaldırılamadı: ' + error.message);
        }
        if (state.yayin && state.yayin.playerId === p.id) { state.yayin.kaynak = ''; state.yayin.parcaId = ''; }
        await yenile(false);
        bildir(p.label + ' markanın genel yayınına döndü.');
        return;
      }
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
        else { state.sub = 'markalar'; state.openPlaylist = null; }
        git(gorunumHash());
        return;
      }

      // --- yayın sağlığı: tek tıkla düzeltme ---
      // Kırmızı satırdaki her sorunun yanında, o sorunu yerinde kapatan düğme
      // durur. Kayıt güncellenince satır yeniden hesaplanır ve kendiliğinden
      // yeşile döner; sunucu doğrulaması da sıfırlanır ki eski cevap kalmasın.
      case 'saglik-fix': {
        const p = D.players.find(x => x.id === id);
        if (!p) return;
        const b = marka(p.brand_id);
        const tip = hedef.dataset.tip;

        if (tip === 'marka-aktif') {
          if (!await onaySor({
            baslik: 'Marka yayına alınsın mı?',
            govde: `“${b ? b.name : 'Marka'}” aktif edilir ve bütün şubeleri seçili akışı çalmaya başlar.`,
            onayMetni: 'YAYINA AL'
          })) return;
          const sorun = await yazDogrula(
            client.from('brands').update({ is_active: true }).eq('id', p.brand_id), 'Marka yayına alınamadı');
          if (sorun) return hata(sorun);
          delete saglikSonuc[p.id];
          await yenile(false); bildir('Marka yayına alındı, satır yenilendi.');
          return;
        }

        if (tip === 'kaynak') { kaynakPenceresi(p); return; }
        if (tip === 'abonelik') { abonelikBaslat(p.brand_id); return; }
        if (tip === 'parca') { git(hedef.dataset.hedef); return; }
        if (tip === 'cekmece') { cekmeceAc(V.subeCekmecesi(p.id, D, ui)); return; }

        // Boş/bozuk anahtar, şubeyi silip yeniden eklemeyi gerektirmiyor: kaydı
        // yerinde tutup yalnızca anahtarı tazeleriz, geçmiş ve cihaz kaydı kalır.
        if (tip === 'anahtar') {
          if (!await onaySor({
            baslik: 'Yayın anahtarı yenilensin mi?',
            govde: `“${p.label}” için yeni bir yayın anahtarı üretilir. Şubeye verilmiş eski bağlantı çalışmayı durdurur; yeni linki kopyalayıp sahaya iletmeniz gerekir.`,
            onayMetni: 'ANAHTARI YENİLE'
          })) return;
          const sorun = await yazDogrula(client.from('brand_players').update({
            player_key: crypto.randomUUID()
          }).eq('id', p.id), 'Anahtar yenilenemedi');
          if (sorun) return hata(sorun);
          delete saglikSonuc[p.id];
          await yenile(false); bildir('Yeni yayın anahtarı üretildi; yeni linki kopyalayın.');
          return;
        }
        return;
      }

      // --- yayın sağlığı ---
      // Bütün şubeler için oynatıcının kullandığı iki okuma çağrısını çalıştırır
      // ve sonucu satır satır yazar. radio_ping BİLİNÇLİ olarak çağrılmaz:
      // denetim, hiçbir cihazı şubeye kilitlememelidir.
      case 'saglik-denetle': {
        const toplam = D.players.length;
        if (!toplam) return;
        const msg = el('saglik-msg');
        saglikSonuc = {};
        hedef.disabled = true;
        let biten = 0;
        if (msg) msg.textContent = `Sunucuya soruluyor… 0/${toplam}`;
        await Promise.all(D.players.map(async p => {
          const sonuc = await sunucuSina(p);
          saglikSonuc[p.id] = sonuc;
          biten++;
          let hucre = null;
          try { hucre = document.querySelector('[data-sunucu="' + p.id + '"]'); } catch (err) { hucre = null; }
          if (hucre) hucre.innerHTML = V.saglikChip(sonuc.durum, sonuc.metin);
          if (msg) msg.textContent = `Sunucuya soruluyor… ${biten}/${toplam}`;
        }));
        hedef.disabled = false;
        const bozuk = D.players.filter(p => saglikSonuc[p.id] && saglikSonuc[p.id].durum === 'kotu').length;
        if (msg) msg.textContent = bozuk
          ? `${toplam} şube denendi · ${bozuk} şubede sunucu yayını vermiyor.`
          : `${toplam} şube denendi · hepsi sunucudan yayın alıyor.`;
        bildir(bozuk ? bozuk + ' şubede sunucu yayını vermiyor.' : 'Bütün şubeler sunucudan yayın alıyor.');
        return;
      }

      // --- şubeler ---
      case 'branch-open': cekmeceAc(V.subeCekmecesi(id, D, ui)); return;
      case 'player-copy': {
        const p = D.players.find(x => x.id === id);
        if (!p) return;
        // Bozuk anahtarı kopyalamak, sahadaki cihaza "açılmayan link" teslim
        // etmek demektir; sessizce kopyalamak yerine söyleriz.
        if (!V.anahtarGecerli(p.player_key)) {
          return hata('Bu şubenin yayın anahtarı geçersiz. Yayın sağlığı ekranından "ANAHTARI YENİLE" ile yeni anahtar üretin.');
        }
        try { await navigator.clipboard.writeText(ui.playerBase() + p.player_key); hedef.textContent = 'KOPYALANDI'; bildir('Yayın linki kopyalandı.'); }
        catch (err) { return hata('Link kopyalanamadı.'); }
        setTimeout(() => { hedef.textContent = 'LİNK'; }, 1600);
        return;
      }
      // --- şube davet kodu ve paylaşım alarmı (supabase/radio-sube-kodu.sql) ---
      // Kod, linkin yanında duran ikinci sırdır: linki ele geçiren biri kodu
      // bilmiyorsa yayını açamaz. Kodu üretmek/yenilemek de yöneticinin işi.
      case 'player-kod-yenile': {
        if (!kullanici.adminMi) return hata('Şube kodu üretmek yönetici yetkisi ister.');
        const p = D.players.find(x => x.id === id);
        if (!p) return hata('Şube bulunamadı.');
        if (!await onaySor({
          baslik: p.player_code ? 'Şube kodu yenilensin mi?' : 'Şubeye kod üretilsin mi?',
          govde: p.bound_device_id
            ? `${p.label} şubesi zaten bir cihaza bağlı: o cihaz kodu sormaz. Yeni kod, cihaz kilidi sıfırlandığında ya da cihaz değiştiğinde istenir.`
            : `${p.label} şubesinde yayın ilk kez açılırken bu kod sorulacak. Eski kod varsa anında geçersiz olur; kodu şubeye yeniden iletin.`,
          onayMetni: p.player_code ? 'KODU YENİLE' : 'KOD ÜRET'
        })) return;
        // Kod panelde üretilir; aynı kodun başka şubede olması ihtimaline karşı
        // veritabanı benzersizliği çakışma derse yeni kodla tekrar denenir.
        const yeni = V.kodUret();
        let sorun = await yazDogrula(
          client.from('brand_players').update({ player_code: yeni }).eq('id', p.id), 'Kod kaydedilemedi');
        if (sorun && /duplicate|unique|23505/i.test(sorun)) {
          const ikinci = V.kodUret();
          sorun = await yazDogrula(
            client.from('brand_players').update({ player_code: ikinci }).eq('id', p.id), 'Kod kaydedilemedi');
          if (!sorun) { await yenile(false); bildir('Yeni şube kodu üretildi.'); return kodPenceresi(p, ikinci); }
        }
        if (sorun) return hata(sorun);
        await yenile(false);
        return kodPenceresi(p, yeni);
      }
      case 'player-kod-kaldir': {
        if (!kullanici.adminMi) return hata('Şube kodunu kaldırmak yönetici yetkisi ister.');
        const p = D.players.find(x => x.id === id);
        if (!p) return hata('Şube bulunamadı.');
        if (!p.player_code) return hata('Bu şubede zaten kod yok.');
        if (!await onaySor({
          baslik: 'Şube kodu kaldırılsın mı?',
          govde: `${p.label} artık yalnız linkle açılır: linki ele geçiren biri ilk kurulumu yapabilir. Cihaz kilidi ve paylaşım alarmı çalışmaya devam eder.`,
          onayMetni: 'KODU KALDIR'
        })) return;
        const sorun = await yazDogrula(
          client.from('brand_players').update({ player_code: null }).eq('id', p.id), 'Kod kaldırılamadı');
        if (sorun) return hata(sorun);
        cekmeceKapat(); await yenile(false); bildir('Şube kodu kaldırıldı.');
        return;
      }
      case 'ihlal-temizle': {
        if (!kullanici.adminMi) return hata('Paylaşım kaydını temizlemek yönetici yetkisi ister.');
        const p = D.players.find(x => x.id === id);
        if (!p) return hata('Şube bulunamadı.');
        if (!await onaySor({
          baslik: 'Paylaşım kaydı temizlensin mi?',
          govde: `${p.label} için sayaç ve kanıt (IP, konum) sıfırlanır. Bağlantı geçmişindeki kayıtlar silinmez; oradan geriye dönük bakmaya devam edebilirsiniz.`,
          onayMetni: 'KAYDI TEMİZLE'
        })) return;
        const { data, error } = await client.rpc('radio_ihlal_temizle', { p_player_id: p.id });
        if (error) {
          return hata(/does not exist|schema cache/i.test(error.message || '')
            ? 'Sunucu bu işlevi tanımıyor: supabase/radio-sube-kodu.sql dosyasını çalıştırın.'
            : 'Kayıt temizlenemedi: ' + error.message);
        }
        if (data !== true) return hata('Kayıt temizlenemedi: yönetici yetkisi doğrulanamadı.');
        cekmeceKapat(); await yenile(false); bildir('Paylaşım kaydı temizlendi.');
        return;
      }

      // "Şubedeki cihaz çalmıyor" durumunu yerinden anlamak için: oynatıcının
      // kullandığı iki okuma çağrısını yapar. radio_ping BİLİNÇLİ olarak
      // çağrılmaz — ping, cihazı şubeye kilitler; panelden sınarken kilidi
      // yöneticinin tarayıcısına bağlamak istemeyiz.
      // Cihazın bir kez "kiosk" olarak işaretlenmesi için gereken komutu verir:
      // sonrasında radyo, cihaz açıldığında kimse düğmeye basmadan çalar.
      case 'player-kiosk': {
        const p = D.players.find(x => x.id === id);
        if (!p) return;
        if (!V.anahtarGecerli(p.player_key)) {
          return hata('Önce geçerli bir yayın anahtarı üretin: Yayın sağlığı → ANAHTARI YENİLE.');
        }
        pencere({
          baslik: 'Dokunuşsuz yayın kurulumu — ' + p.label,
          govde: V.kioskKurulum(ui.playerBase() + p.player_key),
          gizleOnay: true, kapatMetni: 'KAPAT'
        });
        return;
      }

      case 'player-check': {
        const p = D.players.find(x => x.id === id);
        if (!p) return;
        pencere({ baslik: 'Bağlantı sınanıyor…', govde: '<p style="margin:0">Yayın sunucusuna soruluyor…</p>', gizleOnay: true });
        const rapor = await baglantiSina(p);
        pencere({ baslik: 'Bağlantı sınaması', govde: rapor, gizleOnay: true, kapatMetni: 'KAPAT' });
        return;
      }
      case 'player-lock':
        if (!await onaySor({ baslik: 'Cihaz kilidi sıfırlansın mı?', govde: 'Bu şubenin linki bir sonraki açılan cihaza yeniden kilitlenecek.', onayMetni: 'KİLİDİ SIFIRLA' })) return;
        const kilitSorunu = await yazDogrula(client.from('brand_players').update({
          bound_device_id: null, bound_at: null, first_ip: null, last_ip: null, last_ip_at: null
        }).eq('id', id), 'Cihaz kilidi sıfırlanamadı');
        if (kilitSorunu) return hata(kilitSorunu);
        cekmeceKapat(); await yenile(false); bildir('Cihaz kilidi sıfırlandı.');
        return;
      case 'player-del': {
        const p = D.players.find(x => x.id === id);
        if (!await onaySor({
          baslik: 'Şube silinsin mi?',
          govde: `“${p ? p.label : 'Şube'}” kaydı silinir ve yayın linki çalışmayı durdurur.`,
          onayMetni: 'ŞUBEYİ SİL'
        })) return;
        const sorun = await yazDogrula(
          client.from('brand_players').delete().eq('id', id), 'Şube silinemedi');
        if (sorun) return hata(sorun);
        cekmeceKapat(); await yenile(false); bildir('Şube silindi.');
        return;
      }
      case 'player-add': {
        const ad = el('p-label').value.trim();
        if (!ad) return hata('Şube adı gerekli.');
        // Anahtar istemcide üretilip AÇIKÇA gönderilir. Veritabanı varsayılanına
        // güvenmek, alan boş kalırsa kopyalanan bağlantıyı "...?key=null" yapıyor;
        // sunucu bunu uuid sanıp hata verdiği için sahadaki oynatıcı açılmıyordu.
        const { error } = await client.from('brand_players').insert({
          brand_id: id, label: ad,
          player_key: crypto.randomUUID(),
          // Şube kodu ilk kurulumda linkle birlikte istenir (radio-sube-kodu.sql);
          // panelde üretilip şubeye "DAVETİ KOPYALA" ile gönderilir.
          player_code: V.kodUret(),
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
        // Bu klasör (ve içindeki listeler) bir şubenin özel yayın kaynağıysa
        // önce o atamaları kaldırırız. Aksi hâlde veritabanı kaynağı boşaltmaya
        // çalışır, "şubeye özel yayın" satırı kaynaksız kalır ve tablodaki kural
        // (klasör ya da liste zorunlu) silmeyi geri alır: klasör silinemez.
        // Atama kalkınca şube markanın genel yayınına döner.
        const buKlasordekiListeler = D.playlists.filter(pl => pl.folder_id === id).map(pl => pl.id);
        const etkilenenAtamalar = (D.playerBroadcast || []).filter(pb =>
          pb.folder_id === id || (pb.playlist_id && buKlasordekiListeler.includes(pb.playlist_id)));
        if (!await onaySor({
          baslik: 'Klasör silinsin mi?',
          govde: `“${f ? f.name : 'Klasör'}” ve içindeki ${parcalar.length} parça listeden çıkarılır; ses dosyaları depodan silinir.`
            + (etkilenenAtamalar.length
              ? ` Bu klasör ${etkilenenAtamalar.length} şubede özel yayın kaynağı; o atamalar kaldırılır ve şubeler markanın genel yayınına döner.`
              : ''),
          onayMetni: 'KLASÖRÜ SİL'
        })) return;
        if (etkilenenAtamalar.length) {
          const atamaHatasi = (await client.from('player_broadcast')
            .delete().in('player_id', etkilenenAtamalar.map(pb => pb.player_id))).error;
          if (atamaHatasi) return hata('Şubelerin özel yayın atamaları kaldırılamadı: ' + atamaHatasi.message);
        }
        if (Ses && parcalar.length) {
          const yollar = parcalar.flatMap(t => Ses.parcalariCoz(t.storage_path).map(p => p.path));
          await window.DerinR2.sil('radio-audio', yollar);
        }
        // Kapaklar da birlikte gitsin: klasörün ve parçaların görselleri
        // depoda sahipsiz kalmasın.
        await kapakDosyaSil(f && f.cover_path);
        for (const t of parcalar) await kapakDosyaSil(t.cover_path);
        await client.from('radio_tracks').delete().eq('folder_id', id);
        const silmeSorunu = await yazDogrula(
          client.from('radio_folders').delete().eq('id', id), 'Klasör silinemedi');
        if (silmeSorunu) {
          // Veritabanı kuralı adıyla konuşmasın: yönetici ne yapacağını görsün.
          if (/player_broadcast_check/.test(silmeSorunu)) {
            return hata('Klasör silinemedi: bu klasör bir şubenin özel yayın kaynağı. Önce o şubenin yayınını kaldırın (Canlı durum · şube), sonra klasörü silin.');
          }
          return hata(silmeSorunu);
        }
        if (state.openFolder === id) { state.openFolder = null; git('#/klasorler'); }
        await yenile(false); bildir('Klasör silindi.');
        return;
      }
      case 'folder-rename': {
        const ad = el('f-name').value.trim();
        if (!ad) return hata('Klasör adı boş olamaz.');
        const sorun = await yazDogrula(
          client.from('radio_folders').update({ name: ad }).eq('id', state.openFolder), 'Ad güncellenemedi');
        if (sorun) return hata(sorun);
        await yenile(false); bildir('Klasör adı güncellendi.');
        return;
      }
      case 'folder-shuffle': {
        const f = D.folders.find(x => x.id === state.openFolder);
        if (!f) return;
        const yeni = f.shuffle === false;
        const sorun = await yazDogrula(
          client.from('radio_folders').update({ shuffle: yeni }).eq('id', f.id), 'Kaydedilemedi');
        if (sorun) return hata(sorun);
        await yenile(false);
        bildir(yeni ? 'Karışık çalma açık — her tur yeniden karışır.' : 'Sırayla çalma açık.');
        return;
      }
      // Kapak yerleştirme: parça, liste ve klasör aynı pencereyi kullanır.
      // data-id varsa o klasör (kapak denetimi listesinden), yoksa açık klasör
      // (klasör sayfasındaki düğme) kastedilir.
      case 'cover-open': {
        const f = D.folders.find(x => x.id === (id || state.openFolder));
        if (!f) return;
        kapakPenceresiAc({
          baslik: 'Klasör kapağı',
          alt: f.name + ' · ' + D.tracks.filter(t => t.folder_id === f.id).length + ' parça',
          kapak: f.cover_path,
          onEk: 'klasorler',
          kaydet: async yol => yazDogrula(
            client.from('radio_folders').update({ cover_path: yol }).eq('id', f.id), 'Kapak kaydedilemedi'),
          kaldir: f.cover_path ? async () => {
            const sorun = await yazDogrula(
              client.from('radio_folders').update({ cover_path: null }).eq('id', f.id), 'Kapak kaldırılamadı');
            if (sorun) return hata(sorun);
            await kapakDosyaSil(f.cover_path);
            pencereKapat(); await yenile(false); bildir('Kapak kaldırıldı.');
          } : null
        });
        return;
      }
      case 'kapak-sil': {
        const sil = kapakKaldir;
        if (!sil) return;
        kapakKaldir = null;
        await sil();
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
        const sorun = await yazDogrula(
          client.from('radio_tracks').update({ title: yeni }).eq('id', t.id), 'Ad kaydedilemedi');
        if (sorun) return hata(sorun);
        await yenile(false); bildir('Parça adı güncellendi.');
        return;
      }
      case 'track-img': {
        const t = D.tracks.find(x => x.id === id);
        if (!t) return;
        const f = D.folders.find(x => x.id === t.folder_id);
        kapakPenceresiAc({
          baslik: 'Parça kapağı',
          alt: V.clean(t.title) + (f ? ' · ' + f.name : ''),
          kapak: t.cover_path,
          onEk: 'tracks',
          kaydet: async yol => yazDogrula(
            client.from('radio_tracks').update({ cover_path: yol }).eq('id', t.id), 'Kapak kaydedilemedi'),
          kaldir: t.cover_path ? async () => {
            const sorun = await yazDogrula(
              client.from('radio_tracks').update({ cover_path: null }).eq('id', t.id), 'Kapak kaldırılamadı');
            if (sorun) return hata(sorun);
            await kapakDosyaSil(t.cover_path);
            pencereKapat(); await yenile(false); bildir('Kapak kaldırıldı.');
          } : null
        });
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
        if (Ses) await window.DerinR2.sil('radio-audio', Ses.parcalariCoz(hedef.dataset.path || (t && t.storage_path)).map(p => p.path));
        if (t && t.cover_path) await kapakDosyaSil(t.cover_path);
        const sorun = await yazDogrula(
          client.from('radio_tracks').delete().eq('id', id), 'Parça silinemedi');
        if (sorun) return hata(sorun);
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
        await window.DerinR2.sil('radio-announcements', [hedef.dataset.path]);
        const sorun = await yazDogrula(
          client.from('radio_announcements').delete().eq('id', id), 'Anons silinemedi');
        if (sorun) return hata(sorun);
        await yenile(false); bildir('Anons silindi.');
        return;
      }

      // --- markalar ---
      case 'brand-open': git('#/markalar/' + id); return;
      case 'brand-add': {
        const ad = el('brand-name').value.trim();
        if (!ad) return hata('Marka adı gerekli.');
        const slug = bosSlug(slugify(ad));
        // is_active AÇIK yazılır: sunucu yayını yalnızca aktif markalara verir ve
        // panelde marka oluştururken bu alanı boş bırakırsak şube linki
        // “bu link tanınmadı” der.
        const { data, error } = await client.from('brands').insert({
          name: ad, slug, is_active: true, contact: el('brand-contact').value.trim() || null
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
          name: ad, slug: bosSlug(slugify(ad)), is_active: true, contact: el('ab-brand-contact').value.trim() || null
        });
        if (error) return hata('Marka oluşturulamadı: ' + error.message);
        await yenile(false); bildir('Marka oluşturuldu.');
        return;
      }
      // Markayı yayına alıp durdurur. Sunucu yayını yalnızca aktif markalara
      // verdiği için bu anahtar, yeni markaların sessizce pasif kalmasını önler.
      case 'brand-active': {
        const b = marka(id);
        const acilacak = !!(b && b.is_active === false);
        if (!acilacak && !await onaySor({
          baslik: 'Marka durdurulsun mu?',
          govde: `“${b ? b.name : 'Marka'}” pasife alınır: bütün şubelerin yayını kesilir ve yayın linkleri “bu link tanınmadı” der.`,
          onayMetni: 'MARKAYI DURDUR'
        })) return;
        const sorun = await yazDogrula(
          client.from('brands').update({ is_active: acilacak }).eq('id', id), 'Marka durumu değiştirilemedi');
        if (sorun) return hata(sorun);
        await yenile(false);
        bildir(acilacak ? 'Marka yayına alındı.' : 'Marka durduruldu.');
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
        const { data: degisen, error } = await client
          .from('brands').update({ slug: yeni }).eq('id', id).select('id');
        if (error) return hata(error.code === '23505' ? 'Bu link adı başka bir markada kullanılıyor.' : error.message);
        if (!degisen || !degisen.length) {
          return hata('Link adı kaydedilemedi: kayıt bulunamadı ya da bu işlem için yetkiniz yok.');
        }
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
        const sorun = await yazDogrula(
          client.from('brands').update({ access_code: kod }).eq('id', id), 'Kod kaydedilemedi');
        if (sorun) return hata(sorun);
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
        const sorun = await yazDogrula(client.from('brands').delete().eq('id', id), 'Marka silinemedi');
        if (sorun) { hedef.disabled = false; return hata(sorun); }
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

      // --- şube listeleri (supabase/radio-sube-listeleri.sql) ---
      // Şubeye liste atamak yayını değiştirmez: yalnız o şubenin cihazındaki
      // personel seçicisini belirler. Pencerede şube de liste de elle seçilir;
      // hiçbiri atanmazsa şube çalmaz.
      case 'sube-listeler': {
        const p = D.players.find(x => x.id === id);
        if (!p) return hata('Şube bulunamadı.');
        if (!D.subeListeleriVar) return hata('Şube listeleri için supabase/radio-sube-listeleri.sql çalıştırılmalı.');
        // Atama şube çekmecesinden de açılır; pencere arkada açık kalmasın.
        cekmeceKapat();
        pencere({
          baslik: p.label + ' · çalma listeleri',
          govde: V.subeListePenceresi(D, ui, p),
          onayMetni: 'KAYDET',
          onOnay: () => subeListeleriKaydet()
        });
        return;
      }
      // Penceredeki kutuları topluca işaretle/temizle: kayıt yine KAYDET ile.
      case 'sube-liste-hepsi':
      case 'sube-liste-hicbiri': {
        const md = el('modal');
        if (!md) return;
        const acik = act === 'sube-liste-hepsi';
        md.querySelectorAll('[data-sube-liste]').forEach(k => { k.checked = acik; });
        return;
      }

      // --- çalma listeleri ---
      // Liste detayı marka sayfasından açılır; liste yönetimi tek yerde
      // (marka sayfası) kalsın diye adres markayı da taşır.
      case 'list-open': {
        const pl = D.playlists.find(x => x.id === id);
        git(pl ? '#/markalar/' + pl.brand_id + '/listeler/' + id : '#/markalar');
        return;
      }

      case 'list-del': {
        const pl = D.playlists.find(x => x.id === id);
        // Klasör silmedeki ile aynı gerekçe: listeyi şubeye özel yayın kaynağı
        // olarak kullanan şubeler varsa atama önce kaldırılır.
        const etkilenenAtamalar = (D.playerBroadcast || []).filter(pb => pb.playlist_id === id);
        if (!await onaySor({
          baslik: 'Liste silinsin mi?',
          govde: `“${pl ? pl.name : 'Liste'}” silinir. Bu listeyi kullanan şubeler yayın bekler duruma geçer.`
            + (etkilenenAtamalar.length
              ? ` ${etkilenenAtamalar.length} şubedeki özel yayın ataması kaldırılır.`
              : ''),
          onayMetni: 'LİSTEYİ SİL'
        })) return;
        if (etkilenenAtamalar.length) {
          const atamaHatasi = (await client.from('player_broadcast')
            .delete().in('player_id', etkilenenAtamalar.map(pb => pb.player_id))).error;
          if (atamaHatasi) return hata('Şubelerin özel yayın atamaları kaldırılamadı: ' + atamaHatasi.message);
        }
        const silmeSorunu = await yazDogrula(
          client.from('brand_playlists').delete().eq('id', id), 'Liste silinemedi');
        if (silmeSorunu) {
          if (/player_broadcast_check/.test(silmeSorunu)) {
            return hata('Liste silinemedi: bu liste bir şubenin özel yayın kaynağı. Önce o şubenin yayınını kaldırın, sonra listeyi silin.');
          }
          return hata(silmeSorunu);
        }
        if (state.openPlaylist === id) { state.openPlaylist = null; git('#/markalar'); }
        await yenile(false); bildir('Liste silindi.');
        return;
      }
      case 'list-rename': {
        const pl = D.playlists.find(x => x.id === id);
        if (!pl) return;
        // Ad yalnızca panelde değil, müşteri sunumunda ve personelin cihazındaki
        // seçicide de görünür; bu yüzden baştaki/sondaki ve çoklu boşlukları
        // temizleyip kaydederiz (" oğğle  molası " gibi adlar sahaya çıkmasın).
        const ad = (el('pl-name').value || '').trim().replace(/\s+/g, ' ');
        if (!ad) return hata('Liste adı boş olamaz.');
        if (ad === pl.name) return bildir('Ad zaten bu.');
        const sorun = await yazDogrula(
          client.from('brand_playlists').update({ name: ad }).eq('id', id), 'Ad kaydedilemedi');
        if (sorun) return hata(sorun);
        await yenile(false);
        bildir('Liste adı güncellendi. Açık duran oynatıcılar yeni adı birkaç dakika içinde kendiliğinden alır.');
        return;
      }
      case 'brand-cover': {
        const b = D.brands.find(x => x.id === id);
        if (!b) return;
        kapakPenceresiAc({
          baslik: 'Marka kapağı',
          alt: b.name,
          kapak: b.cover_path,
          onEk: 'markalar',
          kaydet: async yol => yazDogrula(
            client.from('brands').update({ cover_path: yol }).eq('id', b.id), 'Kapak kaydedilemedi'),
          kaldir: b.cover_path ? async () => {
            const sorun = await yazDogrula(
              client.from('brands').update({ cover_path: null }).eq('id', b.id), 'Kapak kaldırılamadı');
            if (sorun) return hata(sorun);
            await kapakDosyaSil(b.cover_path);
            pencereKapat(); await yenile(false); bildir('Kapak kaldırıldı.');
          } : null
        });
        return;
      }
      case 'list-img': {
        const pl = D.playlists.find(x => x.id === id);
        if (!pl) return;
        const b = D.brands.find(x => x.id === pl.brand_id);
        kapakPenceresiAc({
          baslik: 'Liste kapağı',
          alt: pl.name + (b ? ' · ' + b.name : ''),
          kapak: pl.cover_path,
          onEk: 'listeler',
          kaydet: async yol => yazDogrula(
            client.from('brand_playlists').update({ cover_path: yol }).eq('id', pl.id), 'Kapak kaydedilemedi'),
          kaldir: pl.cover_path ? async () => {
            const sorun = await yazDogrula(
              client.from('brand_playlists').update({ cover_path: null }).eq('id', pl.id), 'Kapak kaldırılamadı');
            if (sorun) return hata(sorun);
            await kapakDosyaSil(pl.cover_path);
            pencereKapat(); await yenile(false); bildir('Kapak kaldırıldı.');
          } : null
        });
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
        const sonuclar = await Promise.all([
          yazDogrula(client.from('brand_playlist_tracks')
            .update({ sort_order: karsi.sort_order }).eq('id', kayitlar[i].id), 'Sıra kaydedilemedi'),
          yazDogrula(client.from('brand_playlist_tracks')
            .update({ sort_order: kayitlar[i].sort_order }).eq('id', karsi.id), 'Sıra kaydedilemedi')
        ]);
        const siralaHatasi = sonuclar.find(s => s);
        if (siralaHatasi) return hata(siralaHatasi);
        await yenile(false);
        return;
      }
      case 'ptrack-del': {
        const sorun = await yazDogrula(
          client.from('brand_playlist_tracks').delete().eq('id', id), 'Çıkarılamadı');
        if (sorun) return hata(sorun);
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
        const isaretSorunu = await yazDogrula(
          client.from('coffee_requests').update({ status: 'contacted' }).eq('id', id), 'Başvuru işaretlenemedi');
        if (isaretSorunu) return hata(isaretSorunu);
        await talepleriYukle();
        await yenile(false); bildir('Marka oluşturuldu, başvuru işaretlendi.');
        git('#/markalar/' + data.id);
        return;
      }
      case 'req-del':
        if (!await onaySor({ baslik: 'Talep silinsin mi?', govde: 'Başvuru kaydı kalıcı olarak silinir.', onayMetni: 'TALEBİ SİL' })) return;
        {
          const sorun = await yazDogrula(
            client.from('coffee_requests').delete().eq('id', id), 'Silinemedi');
          if (sorun) return hata(sorun);
          await talepleriYukle(); ciz();
          bildir('Talep silindi.');
        }
        return;
      }
    } catch (err) {
      // Beklenmeyen hata kullanıcıya söylenir; panel sessizce boşa düşmez.
      hata('İşlem yapılamadı: ' + ((err && err.message) || err));
    }
  });

  // Değişiklik olayları (select / saat alanları / dosya seçimi)
  // Not alanı: yazmayı bıraktıktan 1 saniye sonra kaydedilir. Her tuşta
  // sunucuya gitmek hem gereksiz hem de yazarken takılmaya yol açar.
  let planNotSayac = null;
  let planAraSayac = null;
  document.addEventListener('input', e => {
    const not = e.target.closest('[data-act="plan-not"]');
    if (not) {
      const gun = not.dataset.id, metin = not.value;
      clearTimeout(planNotSayac);
      planNotSayac = setTimeout(() => planYaz('not', { gun: gun, metin: metin }), 1000);
      return;
    }
    const ara = e.target.closest('[data-act="plan-arama"]');
    if (!ara) return;
    // Arama her tuşta değil, yazma durunca süzülür; aksi hâlde ekran sürekli
    // yeniden çizilir. Yeniden çizim odağı düşürdüğü için odağı ve imleci geri
    // veriyoruz — yoksa kullanıcı ikinci harfi yazamaz.
    const imlec = ara.selectionStart;
    clearTimeout(planAraSayac);
    planAraSayac = setTimeout(() => {
      state.planAra = ara.value;
      ciz();
      const yeni = el('view').querySelector('[data-act="plan-arama"]');
      if (yeni) {
        yeni.focus();
        try { yeni.setSelectionRange(imlec, imlec); } catch (err) { /* desteklenmezse sorun değil */ }
      }
    }, 220);
  });

  document.addEventListener('change', async e => {
    if (!client) return;
    const hedef = e.target;
    // Beklenmeyen hata sessizce yutulmasın (bkz. tıklama dinleyicisi).
    try {

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

    const act = hedef.dataset ? hedef.dataset.act : null;

    // Yayın başlatma ekranı: seçimler yalnız ekranda ilerler, hiçbiri kendi
    // başına yayına geçmez. Ekran her seçimde güncel hâliyle yeniden çizilir.
    if (act === 'yayin-marka' || act === 'yayin-sube' || act === 'yayin-kaynak' || act === 'yayin-parca') {
      // Yayın başlatma ekranı yalnız yöneticiye açıktır; seçim de aynı
      // kapıdan geçer (kapı ekranındayken buraya hiç düşülmez, kemer+askı).
      if (!kullanici.adminMi) return hata('Yayın başlatmak yönetici yetkisi ister.');

      const s = state.yayin;
      if (act === 'yayin-marka') {
        s.brandId = hedef.value; s.playerId = ''; s.kaynak = ''; s.parcaId = '';
      } else if (act === 'yayin-sube') {
        s.playerId = hedef.value;
      } else if (act === 'yayin-kaynak') {
        s.kaynak = hedef.value; s.parcaId = '';
      } else {
        s.parcaId = hedef.value;
      }
      ciz();
      return;
    }

    if (act === 'req-status') {
      const sorun = await yazDogrula(
        client.from('coffee_requests').update({ status: hedef.value }).eq('id', hedef.dataset.id), 'Durum güncellenemedi');
      if (sorun) return hata(sorun);
      const kayit = (D.requests || []).find(r => r.id === hedef.dataset.id);
      if (kayit) kayit.status = hedef.value;
      bildir('Talep durumu güncellendi.');
      return;
    }

    if (hedef.dataset && hedef.dataset.hours) {
      const alan = hedef.dataset.hours === 'open' ? 'open_time' : 'close_time';
      const sorun = await yazDogrula(client.from('brand_players')
        .update({ [alan]: hedef.value || null }).eq('id', hedef.dataset.player), 'Saat güncellenemedi');
      if (sorun) return hata(sorun);
      const kayit = D.players.find(p => p.id === hedef.dataset.player);
      if (kayit) kayit[alan] = hedef.value || null;
      bildir('Yayın saati güncellendi.');
      return;
    }
    } catch (err) {
      hata('İşlem yapılamadı: ' + ((err && err.message) || err));
    }
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { pencereKapat(); cekmeceKapat(); }
    if (!e.target || !e.target.closest || !client) return;
    // Satır içi plan formunda Enter: maddeyi kaydeder, ödemede ilerletir.
    const alan = e.target.closest('[data-plan-gir]');
    if (alan && e.key === 'Enter') { e.preventDefault(); planGirEnter(alan); return; }
    // Düzenleme formunda Enter: kaydeder. Alanlar data-id taşımaz; satırdaki
    // kaydet düğmesinden okunur ki id tek yerde kalsın.
    const duzenle = e.target.closest('[data-plan-duzenle]');
    if (duzenle && e.key === 'Enter') {
      e.preventDefault();
      const dugme = duzenle.closest('.plan-satir') && duzenle.closest('.plan-satir').querySelector('[data-act="plan-duzenle-kaydet"]');
      planDuzenleKaydet(dugme ? dugme.dataset.id : '');
    }
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

  // Bağlantının neden çalmadığını iki sunucu çağrısıyla söyler.
  async function baglantiSina(p) {
    const b = marka(p.brand_id);
    const satir = (ad, deger, tur) => `<div class="row" style="justify-content:space-between;gap:12px;border-top:1px solid var(--line);padding:9px 0">
      <span style="color:var(--muted)">${esc(ad)}</span>
      <b style="color:${tur === 'kotu' ? '#ffc2ca' : (tur === 'iyi' ? '#c8ffe8' : 'var(--txt)')};text-align:right">${esc(deger)}</b>
    </div>`;

    // radio_now_playing sunucuda şu zinciri arar: şube anahtarı → markanın canlı
    // yayın satırı (inner join) → markanın aktif olması → abonelik. İlk halkaları
    // panelin elindeki veriden doğrularız; hangisi kopuksa aşağıda kırmızı çıkar.
    // Kural tek yerde dursun: aynı denetim "Yayın sağlığı" ekranında bütün
    // şubeler için de kullanılıyor (V.saglikTani).
    const tani = V.saglikTani(p, D);
    const yayin = D.broadcast.find(x => x.brand_id === p.brand_id);
    const kaynakId = yayin ? (yayin.playlist_id || yayin.folder_id) : null;
    const parcalar = tani.parcalar;
    const abonelik = D.subscriptions.find(s => s.brand_id === p.brand_id);
    const abGecerli = !!abonelik && !tani.sorunlar.some(s => s.indexOf('Aboneliğin süresi') === 0);
    const eksikler = tani.sorunlar;

    const anahtar = p.player_key;
    let govde = `<p>${esc(b ? b.name : 'Marka')} · ${esc(p.label)}</p>`;
    govde += satir('Anahtar', anahtar ? anahtar : '(boş)', anahtar ? 'iyi' : 'kotu');
    govde += satir('Marka durumu', (b && b.is_active === false) ? 'pasif — yayın verilmez' : 'aktif', (b && b.is_active === false) ? 'kotu' : 'iyi');
    govde += satir('Canlı yayın satırı', yayin ? 'var' : 'yok — yayın sorgusu boş döner', yayin ? 'iyi' : 'kotu');
    govde += satir('Yayın kaynağı', !yayin ? '—' : (kaynakId ? (yayin.playlist_id ? 'liste seçili' : 'klasör seçili') : 'seçilmemiş'), kaynakId ? 'iyi' : 'kotu');
    govde += satir('Kaynaktaki parça', kaynakId ? parcalar.length + ' parça' : '—', parcalar.length ? 'iyi' : 'kotu');
    govde += satir('Abonelik', abonelik ? (abGecerli ? 'geçerli' : 'süresi dolmuş') : 'tanımlı değil', abGecerli ? 'iyi' : 'kotu');
    if (!anahtar) {
      return govde + `<p style="margin:14px 0 0">Bu şube kaydında <b>yayın anahtarı yok</b>. Şubeyi silip yeniden eklerseniz yeni bir anahtar üretilir.</p>`;
    }

    let np, ab;
    try {
      [np, ab] = await Promise.all([
        client.rpc('radio_now_playing', { p_player_key: anahtar }),
        client.rpc('abonelik_durumu', { p_player_key: anahtar })
      ]);
    } catch (err) {
      // Ağ hatası: pencere "sınanıyor…" yazısında kalmasın.
      return govde + `<p style="margin:14px 0 0">Yayın sunucusuna ulaşılamadı: ${esc((err && err.message) || 'bilinmeyen hata')}</p>`;
    }
    const npRow = np.data && np.data[0];
    const abRow = ab.data && ab.data[0];

    let sonuc;
    if (np.error) {
      govde += satir('Yayın sorgusu', np.error.message, 'kotu');
      sonuc = 'Yayın sunucusu bu anahtarı okurken hata verdi. Yukarıdaki ham mesajı bana iletin.';
    } else if (!npRow) {
      // abonelik_durumu yalnızca anahtarı tanıdığında satır döner. Satır varsa
      // anahtar geçerlidir; boş yayın, markanın yayında olmamasından ya da canlı
      // yayın kaynağının atanmamış olmasından gelir. Bunu "anahtar tanınmadı"
      // diye yazmak yanlış halkaya baktırıyordu.
      if (abRow && abRow.gecerli) {
        govde += satir('Yayın sorgusu', 'Anahtar tanınıyor ama yayın boş', 'kotu');
        sonuc = 'Sunucu anahtarı tanıyor (abonelik kaydı okundu) ama yayın listesi boş dönüyor: marka yayında değil ya da canlı yayın kaynağı atanmamış. '
          + (eksikler.length
            ? 'Yukarıdaki <b>kırmızı</b> satırlar bunu doğruluyor: ' + eksikler.join(' · ')
            : 'Yayın sağlığı ekranı bunu tek tıkla düzeltir.')
          + ' Düzeltince bağlantı kendiliğinden çalışır, sayfa yenilemeye gerek yok.';
      } else {
        govde += satir('Yayın sorgusu', 'Bu anahtar tanınmadı', 'kotu');
        sonuc = eksikler.length
          ? 'Sunucu bu anahtarı bulamadı; nedeni yukarıdaki <b>kırmızı</b> satırlar: ' + eksikler.join(' · ')
            + '. Bunlar düzeltilince bağlantı kendiliğinden çalışır ve sayfa yenilemeye gerek kalmaz.'
          : 'Paneldeki kayıtların hepsi tam görünüyor ama sunucu anahtarı yine de bulamadı. Şubeyi silip yeniden eklemek yeni bir anahtar üretir; sorun sürerse bu raporu Derin Record’a iletin.';
      }
    } else {
      const parcalar = (np.data || []).filter(r => r.track_id);
      govde += satir('Marka', npRow.brand_name || (b ? b.name : '—'), 'iyi');
      govde += satir('Şube', npRow.player_label || p.label);
      govde += satir('Yayın kaynağı', npRow.folder_name || 'atanmamış', npRow.folder_name ? '' : 'kotu');
      govde += satir('Parça', parcalar.length + ' parça', parcalar.length ? 'iyi' : 'kotu');
      if (abRow) govde += satir('Abonelik', abRow.gecerli ? 'geçerli' : (abRow.durum === 'yok' ? 'tanımlı değil' : 'süresi dolmuş'), abRow.gecerli ? 'iyi' : 'kotu');
      sonuc = !npRow.folder_name
        ? 'Bağlantı sağlam ama markaya <b>yayın kaynağı atanmamış</b>. Markalar → markanın sayfası → “Canlı yayın” bölümünden bir klasör veya liste seçin.'
        : (!parcalar.length
          ? 'Bağlantı sağlam ama seçili kaynakta <b>parça yok</b>. Yayın klasörlerinden parça yükleyin.'
          : (abRow && !abRow.gecerli
            ? 'Bağlantı sağlam ama <b>abonelik geçersiz</b>: oynatıcı yayını duraklatır.'
            : 'Bağlantı sağlam: oynatıcı bu anahtarla markayı ve listeyi görüyor.'));
    }

    govde += `<p style="margin:14px 0 0">${sonuc}</p>`;
    govde += `<details style="margin-top:16px"><summary style="cursor:pointer;color:var(--muted);font-size:12.5px">Sunucunun ham cevabı</summary>
      <div class="key" style="margin-top:10px;white-space:pre-wrap">${esc(JSON.stringify({ now_playing: np.data || [], hata: np.error ? np.error.message : null, abonelik: ab.data || [], panel_eksikleri: eksikler.map(e => e.replace(/<[^>]+>/g, '')) }, null, 1))}</div></details>`;
    return govde;
  }

  // Bir şubenin yayınını gerçekten sunucuya sorar (panelde sınama aracı).
  async function sunucuSina(p) {
    if (!p.player_key) return { durum: 'kotu', metin: 'anahtar yok' };
    let np, ab;
    try {
      [np, ab] = await Promise.all([
        client.rpc('radio_now_playing', { p_player_key: p.player_key }),
        client.rpc('abonelik_durumu', { p_player_key: p.player_key })
      ]);
    } catch (err) {
      return { durum: 'uyari', metin: 'sunucuya ulaşılamadı' };
    }
    if (np.error) return { durum: 'uyari', metin: 'sunucu hatası' };
    const satir = np.data && np.data[0];
    if (!satir) {
      const abRow = ab.data && ab.data[0];
      if (abRow && !abRow.gecerli) return { durum: 'kotu', metin: abRow.durum === 'yok' ? 'abonelik yok' : 'abonelik bitmiş' };
      // Anahtar tanınıyor (abonelik satırı döndü) ama yayın boş.
      if (abRow && abRow.gecerli) return { durum: 'kotu', metin: 'anahtar var, yayın zinciri kopuk' };
      return { durum: 'kotu', metin: 'anahtar tanınmadı' };
    }
    const parca = (np.data || []).filter(r => r.track_id).length;
    if (!satir.folder_name) return { durum: 'kotu', metin: 'yayın kaynağı yok' };
    if (!parca) return { durum: 'kotu', metin: 'kaynakta parça yok' };
    return { durum: 'iyi', metin: `${parca} parça gönderiyor` };
  }

  // Eksik canlı yayın kaydını yerinde oluşturur. Kaynak seçimi parayla ya da
  // müzikle ilgili olduğu için sessizce tahmin etmeyiz: en dolu kaynak önerilir,
  // kararı yönetici verir.
  function kaynakPenceresi(p) {
    const b = marka(p.brand_id);
    const listeSayisi = id => D.playlistTracks.filter(x => x.playlist_id === id).length;
    const secenekler = [
      ...D.playlists.filter(pl => pl.brand_id === p.brand_id)
        .map(pl => ({ deger: 'playlist:' + pl.id, ad: pl.name + ' · marka listesi', adet: listeSayisi(pl.id) })),
      ...D.folders.map(f => ({
        deger: 'folder:' + f.id, ad: f.name + ' · yayın klasörü',
        adet: D.tracks.filter(t => t.folder_id === f.id).length
      }))
    ].filter(s => s.adet > 0).sort((a, c) => c.adet - a.adet);

    if (!secenekler.length) {
      return hata('Önce bir yayın klasörüne parça yükleyin ya da marka için çalma listesi oluşturun.');
    }

    pencere({
      baslik: 'Yayın kaynağı seç',
      onayMetni: 'KAYNAĞI ATA',
      govde: `
        <p>${esc(b ? b.name : 'Marka')} · ${esc(p.label)} şubesinin çalacağı akış seçilir.</p>
        <div class="field"><label for="kaynak-sec">YAYIN KAYNAĞI</label>
          <select id="kaynak-sec">${secenekler.map((s, i) =>
            `<option value="${esc(s.deger)}"${i === 0 ? ' selected' : ''}>${esc(s.ad)} · ${s.adet} parça</option>`).join('')}</select></div>
        <p class="sub">Kaynak atanınca şube anında bu akışı çalar; sonradan <b>Canlı durum › Yayın başlat</b> ekranından değiştirilebilir.</p>`,
      onOnay: async () => {
        const [tur, deger] = el('kaynak-sec').value.split(':');
        const { error } = await client.from('brand_broadcast').upsert({
          brand_id: p.brand_id,
          folder_id: tur === 'folder' ? deger : null,
          playlist_id: tur === 'playlist' ? deger : null,
          updated_at: new Date().toISOString()
        }, { onConflict: 'brand_id' });
        if (error) return hata('Kaynak atanamadı: ' + error.message);
        delete saglikSonuc[p.id];
        await yenile(false); bildir('Yayın kaynağı atandı, satır yenilendi.');
      }
    });
  }

  // Paket ve süre seçtirip aboneliği başlatır (yayın sağlığı düzeltmesi).
  function abonelikBaslat(brandId) {
    const b = marka(brandId);
    if (!b) return;
    if (!D.plans.length) return hata('Önce Abonelikler ekranından bir paket oluşturun.');
    const subeSayisi = Math.max(1, D.players.filter(p => p.brand_id === brandId).length);
    const mevcut = D.subscriptions.find(s => s.brand_id === brandId);

    pencere({
      baslik: mevcut ? 'Abonelik süresi ekle' : 'Abonelik başlat',
      onayMetni: 'KAYDET',
      govde: `
        <p>${esc(b.name)} için yayın süresi tanımlanır. Bu markanın ${subeSayisi} şubesi var.</p>
        <div class="form-grid">
          <div class="field"><label for="sa-plan">PAKET</label>
            <select id="sa-plan">${D.plans.map((pl, i) =>
              `<option value="${esc(pl.id)}"${i === 0 ? ' selected' : ''}>${esc(pl.name)}${pl.monthly_price ? ' · ' + esc(pl.monthly_price) + ' TL/ay' : ''}</option>`).join('')}</select></div>
          <div class="field"><label for="sa-sube">ŞUBE SAYISI</label>
            <input id="sa-sube" type="number" min="1" value="${subeSayisi}"></div>
        </div>
        <div class="radio-row">
          <label><input type="radio" name="sa-tur" value="active" checked> Aktif / uzat</label>
          <label><input type="radio" name="sa-tur" value="trial"> Deneme</label>
        </div>
        <div class="form-grid">
          <div class="field"><label for="sa-miktar">MİKTAR</label>
            <input id="sa-miktar" type="number" min="1" value="1"></div>
          <div class="field"><label for="sa-birim">BİRİM</label>
            <select id="sa-birim"><option value="ay">ay</option><option value="gun">gün</option><option value="yil">yıl</option></select></div>
        </div>`,
      onOnay: async () => {
        const tur = el('modal').querySelector('input[name="sa-tur"]:checked').value;
        const miktar = Math.max(1, Number(el('sa-miktar').value) || 1);
        const birim = el('sa-birim').value;
        const baz = (mevcut && mevcut.status === 'active' && mevcut.current_end && new Date(mevcut.current_end) > new Date())
          ? new Date(mevcut.current_end) : new Date();
        const bitis = sureEkle(baz, miktar, birim).toISOString();
        const alanlar = tur === 'trial'
          ? { status: 'trial', trial_ends_at: bitis, current_start: new Date().toISOString(), current_end: null }
          : { status: 'active', current_end: bitis };
        const { error } = await client.from('subscriptions').upsert({
          brand_id: brandId,
          plan_id: el('sa-plan').value,
          branch_count: Math.max(1, Number(el('sa-sube').value) || 1),
          updated_at: new Date().toISOString(),
          ...alanlar
        }, { onConflict: 'brand_id' });
        if (error) return hata('Abonelik kaydedilemedi: ' + error.message);
        Object.keys(saglikSonuc).forEach(k => { if ((D.players.find(p => p.id === k) || {}).brand_id === brandId) delete saglikSonuc[k]; });
        await yenile(false);
        bildir(tur === 'trial' ? 'Deneme süresi başlatıldı.' : 'Abonelik kaydedildi.');
      }
    });
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
