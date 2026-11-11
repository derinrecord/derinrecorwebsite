(() => {
  // Üyelik onayında kabul edilen hukuki metin sürümleri (sayfalardaki "Sürüm" ile aynı).
  const SOZLESME_SURUM = '2026-10-04';
  const AYDINLATMA_SURUM = '2026-10-24';
  const config = window.DERIN_CONFIG || {};
  const configured = Boolean(config.supabaseUrl && config.supabasePublishableKey && window.supabase);
  const HATIRLA_ANAHTARI = 'derin-auth-hatirla';
  const kaliciDepo = typeof localStorage === 'undefined' ? null : localStorage;
  const geciciDepo = typeof sessionStorage === 'undefined' ? null : sessionStorage;
  let hatirlaTercihi = kaliciDepo?.getItem(HATIRLA_ANAHTARI) === '1';
  const oturumDeposu = {
    getItem(anahtar) {
      return (hatirlaTercihi ? kaliciDepo : geciciDepo)?.getItem(anahtar) ?? null;
    },
    setItem(anahtar, deger) {
      const aktifDepo = hatirlaTercihi ? kaliciDepo : geciciDepo;
      const digerDepo = hatirlaTercihi ? geciciDepo : kaliciDepo;
      aktifDepo?.setItem(anahtar, deger);
      digerDepo?.removeItem(anahtar);
    },
    removeItem(anahtar) {
      kaliciDepo?.removeItem(anahtar);
      geciciDepo?.removeItem(anahtar);
    }
  };
  const state = { client: null, user: null, profile: null, configured };
  let fotoUrl = null; // HESABIM düğmesindeki profil fotoğrafının süreli bağlantısı
  let resolveReady;
  const ready = new Promise(resolve => { resolveReady = resolve; });
  // Uygulamada (App Store / Google Play) yönetici sayfalarından yalnız Radyo Yönetimi menüde kalır;
  // radyo bağlantısı yalnız yöneticiye görünür. Tarayıcıda menü hiç değişmez (31 Ekim).
  const UYGULAMADA_GIZLI = ['kullanicilar.html', 'bildirimler.html', 'taleplerim.html', 'ajanlar.html', 'harmonic-mixer.html', 'mp3-donusturucu.html', 'chat.html', 'admin.html', 'istatistik.html'];
  const menuSuz = (hrefler, rol, uygulamada) => !uygulamada ? hrefler.slice()
    : hrefler.filter(h => !UYGULAMADA_GIZLI.includes(h) && (h !== 'radyo-yonetim.html' || rol === 'admin'));
  function menuyuUygulamayaGoreSuz(menu) {
    if (!window.DerinApp?.uygulamada) return;
    const baglantilar = [...menu.querySelectorAll('.account-menu-links a')];
    const kalan = menuSuz(baglantilar.map(a => a.getAttribute('href')), state.profile?.role || null, true);
    baglantilar.forEach(a => { if (!kalan.includes(a.getAttribute('href'))) a.remove(); });
  }
  // Supabase hata metinleri anlaşılır Türkçeye çevrilir (1 Kasım: antrenör İngilizce hatalarla takıldı).
  function hataMetni(hata) {
    const kod = String(hata?.code || ''), m = String(hata?.message || '');
    if (kod === 'invalid_credentials' || /invalid login credentials/i.test(m)) return dilMetni('auth.hataSifre', 'E-posta ya da şifre yanlış.');
    if (kod === 'email_not_confirmed' || /email not confirmed/i.test(m)) return dilMetni('auth.hataOnaysiz', 'E-postan henüz onaylanmamış. Sana gelen en son onay e-postasındaki bağlantıyı aç.');
    if (kod.includes('rate_limit') || /rate limit|you can only request this after/i.test(m)) return dilMetni('auth.hataSik', 'Çok sık denendi. Bir dakika bekleyip yeniden dene.');
    if (kod === 'user_already_exists' || /already registered/i.test(m)) return dilMetni('auth.hataKayitli', 'Bu e-posta zaten kayıtlı. Giriş yap ya da şifreni yenile.');
    if (kod === 'weak_password' || /at least \d+ characters/i.test(m)) return dilMetni('auth.hataKisa', 'Şifre en az 8 karakter olmalı.');
    return m;
  }
  // Onay e-postasındaki bağlantıdan dönüşte adres çubuğu: eskimiş bağlantı mı, başarılı onay mı?
  function adresDurumu(hash) {
    const h = new URLSearchParams(String(hash || '').replace(/^#/, ''));
    if (h.get('error_code') === 'otp_expired' || (h.get('error') === 'access_denied' && /expired|invalid/i.test(h.get('error_description') || ''))) return 'eskimis';
    if (h.get('access_token') && h.get('type') === 'signup') return 'onaylandi';
    return null;
  }
  const YENIDEN_BEKLE = 60; // sn: yeniden gönderme düğmesi bu kadar sonra açılır (Supabase sınırı)
  window.DerinAuth = { ...state, ready, open: () => openAuth('login'), _menuSuz: menuSuz, _hataMetni: hataMetni, _adresDurumu: adresDurumu, _sayacYazisi: n => (!n || n < 1) ? '' : (n > 99 ? '99+' : String(n)) };

  const escapeHtml = value => String(value || '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  // Dil: kısa metinler dil.js sözlüğünden gelir (TR varsayılan, EN karşılığı).
  const dilMetni = (anahtar, varsayilan) => (window.DerinDil && window.DerinDil.metin ? window.DerinDil.metin(anahtar, varsayilan) : varsayilan);
  const emit = () => { Object.assign(window.DerinAuth, state); window.dispatchEvent(new CustomEvent('derin:authchange', { detail: state })); };

  function shell() {
    sayacStiliEkle();
    const header = document.querySelector('.header, .site-header');
    if (!header || document.querySelector('.account-actions')) return;
    const actions = document.createElement('div'); actions.className = 'account-actions';
    actions.innerHTML = `<button class="account-button" type="button" data-login>${dilMetni('shell.giris', 'GİRİŞ YAP')}</button><button class="account-button secondary" type="button" data-signup>${dilMetni('shell.kayit', 'KAYIT OL')}</button>`;
  const menu = document.createElement('div');
  menu.className = 'account-menu';
  menu.hidden = true;
  menu.innerHTML = `<div class="account-menu-backdrop" data-menu-close></div><aside class="account-menu-panel"><div class="account-menu-head"><span class="account-menu-name"></span><button class="account-menu-close" type="button" data-menu-close aria-label="${dilMetni('shell.kapat', 'Kapat')}">×</button></div><nav class="account-menu-links"></nav><button class="account-menu-logout" type="button" data-logout>${dilMetni('shell.cikis', 'ÇIKIŞ YAP')}</button></aside>`;
  // Yönetici girişi öncesi body etiketi işaretlenir; CSS misafir ziyaretçide yönetici linkini gizler.
  const syncAdminHint = () => { document.body.classList.toggle('is-admin', state.profile?.role === 'admin'); };
  window.addEventListener('derin:authchange', syncAdminHint);
  syncAdminHint();
  document.body.append(menu);
    const nav = header.querySelector('nav');
    nav ? header.insertBefore(actions, nav) : header.append(actions);
    actions.querySelector('[data-login]').addEventListener('click', () => state.user ? toggleMenu() : openAuth('login'));
    actions.querySelector('[data-signup]').addEventListener('click', () => openAuth('signup'));
  menu.querySelectorAll('[data-menu-close]').forEach(el => el.addEventListener('click', () => closeMenu(menu)));
  menu.querySelector('[data-logout]').addEventListener('click', async () => { hatirlaTercihi = false; localStorage.removeItem(HATIRLA_ANAHTARI); await state.client.auth.signOut(); closeMenu(menu); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && !menu.hidden) closeMenu(menu); });
  }
  function renderAccount() {
    const actions = document.querySelector('.account-actions'); if (!actions) return;
    const button = actions.querySelector('[data-login]'), signup = actions.querySelector('[data-signup]'), menu = document.querySelector('.account-menu');
    // Menü artık ziyaretçiye de açık; gizleme kararı burada verilmez (mobil menü mobil.css + script.js).
    button.classList.remove('hb-fotolu');
    // Üst menüdeki müzik araştırma düğmesi 9 Kasım'da kaldırıldı; MÜZİK ARAŞTIR hesap menüsünde.
    if (!configured) { button.textContent = dilMetni('shell.hesapSistemi', 'HESAP SİSTEMİ'); button.classList.add('secondary'); signup.hidden = true; button.onclick = () => openAuth('login'); return; }
    if (!state.user) { button.textContent = dilMetni('shell.giris', 'GİRİŞ YAP'); button.classList.remove('secondary'); signup.hidden = false; return; }
    signup.hidden = true;
    // HESABIM düğmesinde solda profil fotoğrafı; yoksa baş harf (24 Ekim).
    const foto = document.createElement(fotoUrl ? 'img' : 'span');
    foto.className = 'hb-foto';
    if (fotoUrl) { foto.src = fotoUrl; foto.alt = ''; }
    else foto.dataset.harf = String(state.profile?.full_name || state.user.email || '?').trim().charAt(0).toLocaleUpperCase('tr-TR') || '?';
    foto.setAttribute('aria-hidden', 'true');
    button.textContent = '';
    button.append(foto, document.createTextNode(dilMetni('hesap.hesabim', 'HESABIM')));
    button.classList.add('hb-fotolu');
    menu.querySelector('.account-menu-links').innerHTML = `<a href="profilim.html" class="menu-profil">PROFİLİM</a>${state.profile?.role === 'admin' ? '<a href="istatistik.html">İSTATİSTİKLER</a><a href="kullanicilar.html">KULLANICILAR</a><a href="bildirimler.html">BİLDİRİMLER<span class="bildirim-sayac" data-bildirim-sayac hidden></span></a><a href="taleplerim.html">TALEPLERİM</a><a href="radyo-yonetim.html">RADYO YÖNETİMİ</a><a href="ajanlar.html">AJANLAR</a><a href="harmonic-mixer.html">HARMONİK SET</a><a href="music-request.html">MÜZİK ARAŞTIR</a><a href="mp3-donusturucu.html">MP3 DÖNÜŞTÜRÜCÜ</a>' : '<a href="music-request.html">MÜZİK ARAŞTIR</a>'}<a href="my-projects.html">PROJELERİM</a><a href="energy-map.html">ENERJİ & TEMPO</a><a href="license.html">MÜZİK BEYANI</a>`;
    menuLinkleriniCevir(menu);
    menuyuUygulamayaGoreSuz(menu);
    menu.querySelector('.account-menu-name').textContent = state.profile?.full_name || state.user.email || dilMetni('hesap.hesabim', 'HESABIM');
    sayaclariYaz();
  }

  // ---------- Bildirim sayacı (yalnız yönetici) ----------
  // Onay bekleyen Müzik Araştır istekleri sayılır (bildirimler.js ile aynı ölçüt).
  // Menüdeki BİLDİRİMLER bağlantısında ve HESABIM düğmesinde görünür; 20 sn'de bir,
  // sekmeye dönünce ve bildirimler sayfasında onay verilince tazelenir.
  let bekleyenSayisi = 0, sayacZamanlayici = null;
  const sayacYazisi = n => (!n || n < 1) ? '' : (n > 99 ? '99+' : String(n));
  // Rozet görünümü auth.js ile gelir (auth.css sürümsüz yüklendiği için telefon eski kopyayı tutabiliyor).
  function sayacStiliEkle() {
    if (typeof document.getElementById !== 'function' || typeof document.createElement !== 'function') return;
    if (document.getElementById('bildirim-sayac-stili')) return;
    const st = document.createElement('style'); st.id = 'bildirim-sayac-stili';
    st.textContent = '.bildirim-sayac{display:inline-flex;align-items:center;justify-content:center;min-width:18px;height:18px;padding:0 5px;margin-left:8px;border-radius:9px;background:#cb2468;color:#fff;font:800 .62rem/1 Arial,sans-serif;letter-spacing:0;vertical-align:middle;box-sizing:border-box}'
      + '.bildirim-sayac[hidden]{display:none}'
      + '.account-button[data-sayac]{position:relative}'
      + '.auth-card .auth-hatirla{display:flex;align-items:center;gap:.5rem;cursor:pointer}'
      + '.auth-card .auth-hatirla input{width:1rem;height:1rem;margin:0;padding:0;accent-color:var(--yellow,#f4d43e)}'
      + '.account-button[data-sayac]::after{content:attr(data-sayac);position:absolute;top:-9px;right:-9px;min-width:19px;height:19px;padding:0 5px;border-radius:10px;background:#cb2468;color:#fff;font:800 .62rem/19px Arial,sans-serif;letter-spacing:0;text-align:center;box-sizing:border-box;box-shadow:0 0 0 2px #0b0b0d;animation:bildirimGeldi .5s ease}'
      + '@keyframes bildirimGeldi{0%{transform:scale(.4)}60%{transform:scale(1.2)}100%{transform:scale(1)}}'
      + '@media(prefers-reduced-motion:reduce){.account-button[data-sayac]::after{animation:none}}';
    (document.head || document.body).appendChild(st);
  }
  function sayaclariYaz() {
    if (document.head || document.body) sayacStiliEkle();
    const yazi = sayacYazisi(bekleyenSayisi);
    document.querySelectorAll('[data-bildirim-sayac]').forEach(el => { el.textContent = yazi; el.hidden = !yazi; });
    const dugme = document.querySelector('.account-actions [data-login]');
    if (dugme) {
      if (yazi && state.user) { dugme.dataset.sayac = yazi; dugme.setAttribute('aria-label', dilMetni('auth.sayacEtiket', '{dugme} — {sayi} yeni bildirim').replace('{dugme}', dugme.textContent).replace('{sayi}', yazi)); }
      else { delete dugme.dataset.sayac; dugme.removeAttribute('aria-label'); }
    }
  }
  async function bildirimSay() {
    if (!state.client || !state.user || state.profile?.role !== 'admin') return;
    if (document.visibilityState === 'hidden') return;
    try {
      const { count, error } = await state.client.from('direct_messages')
        .select('id', { count: 'exact', head: true })
        .eq('recipient_id', state.user.id)
        .neq('sender_id', state.user.id)
        .is('research_project_id', null)
        .ilike('body', '%[Müzik araştırma isteği%');
      if (error) return;
      bekleyenSayisi = count || 0;
      sayaclariYaz();
    } catch (e) { /* sayaç gösterilemezse sessizce geç; sayfa çalışmaya devam eder */ }
  }
  function sayaciYonet() {
    const yonetici = !!state.user && state.profile?.role === 'admin';
    clearInterval(sayacZamanlayici); sayacZamanlayici = null;
    if (!yonetici) { bekleyenSayisi = 0; sayaclariYaz(); return; }
    bildirimSay();
    sayacZamanlayici = setInterval(bildirimSay, 20000);
  }
  window.addEventListener('derin:authchange', sayaciYonet);
  window.addEventListener('derin:bildirim-yenile', bildirimSay);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') bildirimSay(); });
  function toggleMenu() { const menu = document.querySelector('.account-menu'); if (menu) menu.hidden ? openMenu(menu) : closeMenu(menu); }
function openMenu(menu) { menu.hidden = false; document.body.classList.add('account-menu-open'); requestAnimationFrame(() => menu.classList.add('open')); }
function closeMenu(menu) { let done = false; const finish = () => { if (done) return; done = true; menu.hidden = true; }; menu.classList.remove('open'); document.body.classList.remove('account-menu-open'); menu.addEventListener('transitionend', finish, { once: true }); setTimeout(finish, 320); }
  // Üyelik onayı satırı: bağlantılar korunur, cümle seçili dile göre kurulur.
  function onaySatiri() {
    const sozlesme = `<a href="kullanici-sozlesmesi.html" target="_blank" rel="noopener">${dilMetni('auth.sozlesme', 'Kullanıcı Sözleşmesi')}</a>`;
    const aydinlatma = `<a href="aydinlatma-metni.html" target="_blank" rel="noopener">${dilMetni('auth.aydinlatma', 'Aydınlatma Metni')}</a>`;
    const gizlilik = `<a href="gizlilik-politikasi.html" target="_blank" rel="noopener">${dilMetni('auth.gizlilik', 'Gizlilik Politikası')}</a>`;
    const cumle = dilMetni('auth.onay', '{sozlesme}’ni okudum ve kabul ediyorum; {aydinlatma}’ni ve {gizlilik}’nı okudum.')
      .replace('{sozlesme}', sozlesme).replace('{aydinlatma}', aydinlatma).replace('{gizlilik}', gizlilik);
    return `<label class="auth-onay"><input type="checkbox" name="onay" required><span>${cumle}</span></label>`;
  }

  let acikMod = null;
  // Onay e-postasını yeniden gönderen düğme: basınca 60 sn kilitli kalır, geri sayım gösterir.
  function yenidenGonderDugmesi(epostaAl, mesaj) {
    const d = document.createElement('button'); d.type = 'button'; d.className = 'auth-switch auth-resend';
    const etiket = dilMetni('auth.yenidenGonder', 'ONAY E-POSTASINI YENİDEN GÖNDER');
    let sayac = null;
    const kilitle = () => {
      let kalan = YENIDEN_BEKLE; d.disabled = true;
      const yaz = () => { d.textContent = `${etiket} (${kalan})`; };
      yaz(); clearInterval(sayac);
      sayac = setInterval(() => { kalan -= 1; if (kalan <= 0) { clearInterval(sayac); d.disabled = false; d.textContent = etiket; } else yaz(); }, 1000);
    };
    d.textContent = etiket;
    d.onclick = async () => {
      const email = String(epostaAl() || '').trim();
      if (!email) { mesaj.textContent = dilMetni('shell.onceEposta', 'Önce e-posta adresini yaz, sonra bu bağlantıya bas.'); return; }
      kilitle();
      const { error } = await state.client.auth.resend({ type: 'signup', email, options: { emailRedirectTo: `${location.origin}/` } });
      mesaj.textContent = error ? hataMetni(error) : dilMetni('auth.yeniGitti', 'Yeni onay e-postası gönderildi. En son gelen e-postayı aç; eski e-postalardaki bağlantılar artık çalışmaz.');
    };
    return { d, kilitle };
  }
  // Eskimiş onay bağlantısıyla gelen kişiye açıklama + yeni bağlantı isteme (1 Kasım).
  function eskimisBaglanti() {
    openAuth('login');
    const kart = document.querySelector('.auth-overlay .auth-card');
    if (!kart) return;
    const kutu = document.createElement('div'); kutu.className = 'auth-eskimis';
    kutu.innerHTML = `<p><strong>${dilMetni('auth.eskimisBaslik', 'Bu onay bağlantısı eskimiş.')}</strong> ${dilMetni('auth.eskimisMetin', 'Daha yeni bir onay e-postası geldiyse onu aç. Gelmediyse e-postanı yazıp yeni bağlantı iste.')}</p>`;
    kart.querySelector('h2').after(kutu);
    const mesaj = kart.querySelector('.auth-message');
    const { d } = yenidenGonderDugmesi(() => kart.querySelector('input[name="email"]').value, mesaj);
    d.textContent = dilMetni('auth.yeniBaglanti', 'YENİ BAĞLANTI GÖNDER'); kutu.append(d);
  }

  function openAuth(mode) {
    acikMod = mode;
    let overlay = document.querySelector('.auth-overlay');
    if (!overlay) { overlay = document.createElement('div'); overlay.className = 'auth-overlay'; document.body.append(overlay); }
    if (!configured) { overlay.innerHTML = `<section class="auth-card"><button class="auth-close">${dilMetni('shell.kapat', 'KAPAT')}</button><h2>${dilMetni('shell.hazirlaniyor', 'HESAP SİSTEMİ HAZIRLANIYOR')}</h2><p>${dilMetni('shell.hazirlaniyorMetin', 'Yönetici, Supabase bağlantı bilgilerini ekledikten sonra e-posta ve şifreyle kayıt/giriş açılacak.')}</p></section>`; overlay.hidden=false; overlay.querySelector('.auth-close').onclick=()=>{ overlay.hidden=true; acikMod=null; }; return; }
    const signup = mode === 'signup';
    overlay.innerHTML = `<section class="auth-card"><button class="auth-close" type="button">${dilMetni('shell.kapat', 'KAPAT')}</button><h2>${signup ? dilMetni('shell.kayitBaslik', 'ANTRENÖR KAYDI') : dilMetni('shell.girisBaslik', 'HESABINA GİR')}</h2><p>${signup ? dilMetni('shell.kayitAciklama', 'Kaydın yönetici onayından sonra demo erişimin açılır.') : dilMetni('shell.girisAciklama', 'Demo notlarına ulaşmak için giriş yap.')}</p><form class="auth-form">${signup ? `<label>${dilMetni('shell.adSoyad', 'AD SOYAD')}<input name="name" autocomplete="name" required></label>` : ''}<label>${dilMetni('shell.eposta', 'E-POSTA')}<input name="email" type="email" autocomplete="email" required></label><label>${dilMetni('shell.sifre', 'ŞİFRE')}<input name="password" type="password" minlength="8" autocomplete="${signup ? 'new-password' : 'current-password'}" required></label>${signup ? onaySatiri() : `<label class="auth-hatirla"><input type="checkbox" name="remember"><span>${dilMetni('shell.beniHatirla', 'Beni hatırla')}</span></label>`}<button class="auth-submit">${signup ? dilMetni('shell.kayit', 'KAYIT OL') : dilMetni('shell.giris', 'GİRİŞ YAP')}</button></form><button class="auth-switch" type="button">${signup ? dilMetni('shell.zatenVar', 'Zaten hesabın var mı? Giriş yap') : dilMetni('shell.yokMu', 'Hesabın yok mu? Antrenör olarak kayıt ol')}</button>${signup ? '' : `<button class="auth-switch auth-forgot" type="button">${dilMetni('shell.unuttun', 'Şifreni mi unuttun?')}</button>`}<p class="auth-message"></p></section>`;
    overlay.hidden = false;
    overlay.querySelector('.auth-close').onclick = () => { overlay.hidden = true; acikMod = null; };
    overlay.querySelector('.auth-switch').onclick = () => openAuth(signup ? 'login' : 'signup');
    const forgot = overlay.querySelector('.auth-forgot');
    if (forgot) forgot.onclick = async () => {
      const message = overlay.querySelector('.auth-message');
      const emailInput = overlay.querySelector('input[name="email"]');
      const email = String(emailInput.value || '').trim();
      if (!email) { message.textContent = dilMetni('shell.onceEposta', 'Önce e-posta adresini yaz, sonra bu bağlantıya bas.'); emailInput.focus(); return; }
      forgot.disabled = true; message.textContent = dilMetni('shell.gonderiliyor', 'Sıfırlama bağlantısı gönderiliyor…');
      const { error } = await state.client.auth.resetPasswordForEmail(email, { redirectTo: `${location.origin}/sifre-yenile.html` });
      forgot.disabled = false;
      message.textContent = error
        ? error.message
        : dilMetni('shell.sifirlamaGonderildi', 'Bu adres kayıtlıysa sıfırlama bağlantısı gönderildi. Gelen kutunu ve spam klasörünü kontrol et.');
    };
    overlay.querySelector('.auth-form').onsubmit = async event => {
      event.preventDefault(); const form = new FormData(event.currentTarget), message = overlay.querySelector('.auth-message'); message.textContent = dilMetni('shell.kontrol', 'Kontrol ediliyor…');
      const email = String(form.get('email')).trim(), password = String(form.get('password'));
      if (!signup) hatirlaTercihi = form.get('remember') === 'on';
      // Üyelik onayı: sözleşme kutusu işaretlenmeden hesap açılmaz; kabul edilen
      // metin sürümleri ve zamanı hesabın kayıt bilgisine yazılır (kanıt).
      if (signup && !form.get('onay')) { message.textContent = dilMetni('shell.onayGerekli', 'Kayıt için Kullanıcı Sözleşmesi’ni kabul etmen gerekiyor.'); return; }
      const submit = event.currentTarget.querySelector('.auth-submit');
      if (submit.disabled) return; // çift basışla ikinci kayıt e-postası gitmesin (eskisini geçersiz yapıyordu)
      submit.disabled = true;
      const onay = { sozlesme_surum: SOZLESME_SURUM, aydinlatma_surum: AYDINLATMA_SURUM, kabul_at: new Date().toISOString() };
      const result = signup ? await state.client.auth.signUp({ email, password, options: { data: Object.assign({ full_name: String(form.get('name')).trim() }, onay) } }) : await state.client.auth.signInWithPassword({ email, password });
      if (result.error) {
        submit.disabled = false;
        if (!signup) hatirlaTercihi = localStorage.getItem(HATIRLA_ANAHTARI) === '1';
        message.textContent = hataMetni(result.error);
        if (!signup && (result.error.code === 'email_not_confirmed' || /not confirmed/i.test(result.error.message))) {
          const { d } = yenidenGonderDugmesi(() => email, message);
          message.append(document.createElement('br'), d);
        }
        return;
      }
      if (!signup) {
        hatirlaTercihi ? localStorage.setItem(HATIRLA_ANAHTARI, '1') : localStorage.removeItem(HATIRLA_ANAHTARI);
      }
      if (signup && !result.data.session) {
        // Form kapanır: aynı kişi yeniden kayıt olamaz; tek e-posta, açık yönerge (1 Kasım).
        overlay.querySelector('.auth-form').hidden = true;
        overlay.querySelector('.auth-switch').hidden = true;
        const ad = String(email).replace(/[<>&"]/g, '');
        message.innerHTML = `<strong>${dilMetni('auth.kayitTamam', 'Kaydın alındı.')}</strong> ${dilMetni('auth.epostaGitti', 'Onay e-postası {eposta} adresine gönderildi.').replace('{eposta}', `<b>${ad}</b>`)} ${dilMetni('auth.enSon', 'En son gelen e-postayı aç ve içindeki bağlantıya bas. Gelmezse spam klasörüne bak.')}<br>`;
        const { d, kilitle } = yenidenGonderDugmesi(() => email, message);
        message.append(d); kilitle();
      } else message.textContent = dilMetni('shell.basarili', 'Giriş başarılı.');
      if (result.data.session) setTimeout(() => { overlay.hidden = true; acikMod = null; }, 450);
    };
  }
  // Menü bağlantı metinleri kaynakta Türkçe kalır (testler bunları okur);
  // İngilizce seçiliyse görünen metin dile göre değiştirilir.
  const MENU_ANAHTARLARI = {
    'istatistik.html': ['shell.istatistik', 'İSTATİSTİKLER'],
    'kullanicilar.html': ['shell.kullanicilar', 'KULLANICILAR'],
    'bildirimler.html': ['shell.bildirimler', 'BİLDİRİMLER'],
    'taleplerim.html': ['shell.taleplerim', 'TALEPLERİM'],
    'radyo-yonetim.html': ['shell.radyo', 'RADYO YÖNETİMİ'],
    'ajanlar.html': ['shell.ajanlar', 'AJANLAR'],
    'harmonic-mixer.html': ['shell.harmonik', 'HARMONİK SET'],
    'music-request.html': ['shell.arastir', 'MÜZİK ARAŞTIR'],
    'mp3-donusturucu.html': ['shell.mp3', 'MP3 DÖNÜŞTÜRÜCÜ'],
    'my-projects.html': ['shell.projelerim', 'PROJELERİM'],
    'energy-map.html': ['shell.enerji', 'ENERJİ & TEMPO'],
    'license.html': ['shell.licence', 'MÜZİK BEYANI']
  };
  function menuLinkleriniCevir(menu) {
    menu.querySelectorAll('.account-menu-links a').forEach(link => {
      const kayit = MENU_ANAHTARLARI[link.getAttribute('href')];
      const ilk = link.firstChild;
      if (kayit && ilk && ilk.nodeType === 3) ilk.nodeValue = dilMetni(kayit[0], kayit[1]);
    });
  }

  // Dil değişince hesap kabuğu ve açık giriş penceresi yeniden çizilir.
  document.addEventListener('derin:dil', () => {
    renderAccount();
    const overlay = document.querySelector('.auth-overlay');
    if (acikMod && overlay && !overlay.hidden) openAuth(acikMod);
  });

  async function loadProfile(user) {
    if (!user) { fotoUrl = null; state.user=null; state.profile=null; document.body.classList.remove('is-admin'); emit(); renderAccount(); return; }
    state.user = user;
    let profile;
    for (let attempt = 0; attempt < 3; attempt++) {
      let { data, error } = await state.client.from('profiles').select('id,full_name,role,avatar_path').eq('id', user.id).maybeSingle();
      if (error) ({ data } = await state.client.from('profiles').select('id,full_name,role').eq('id', user.id).maybeSingle());
      if (data) { profile = data; break; }
      await new Promise(resolve => setTimeout(resolve, 350));
    }
    state.profile = profile || { id:user.id, full_name:user.user_metadata?.full_name || '', role:'coach' };
    emit(); renderAccount(); document.body.classList.toggle('is-admin', state.profile?.role === 'admin');
    hesapFotosu();
    girisKaydet(user.id);
  }
  // İstatistikler için: üye o gün giriş yaptı (günde bir kez; supabase/istatistik.sql).
  async function girisKaydet(id) {
    const gun = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' });
    const anahtar = 'derin-giris-' + id;
    try { if (localStorage.getItem(anahtar) === gun) return; } catch (e) { /* gizli mod */ }
    try {
      const { error } = await state.client.rpc('giris_kaydet');
      if (!error) { try { localStorage.setItem(anahtar, gun); } catch (e) { /* gizli mod */ } }
    } catch (e) { /* tablo kurulmadıysa sessizce geçilir */ }
  }
  // Profil fotoğrafı gizli kovada; düğme için 1 saatlik bağlantı alınır.
  async function hesapFotosu() {
    const yol = state.profile?.avatar_path;
    fotoUrl = null;
    if (yol && state.client) {
      try {
        const { data } = await state.client.storage.from('profil-foto').createSignedUrl(yol, 3600);
        fotoUrl = data?.signedUrl || null;
      } catch (e) { fotoUrl = null; }
    }
    renderAccount();
  }
  // Profilim'de fotoğraf yüklenince ya da kaldırılınca düğme yenilenir.
  document.addEventListener('derin:profilfoto', async () => {
    if (!state.client || !state.user) return;
    const { data } = await state.client.from('profiles').select('avatar_path').eq('id', state.user.id).maybeSingle();
    if (state.profile) state.profile.avatar_path = data ? data.avatar_path : null;
    hesapFotosu();
  });
  async function init() {
    if (document.querySelector('.player-controls')) {
      const seekFix = document.createElement('script');
      seekFix.src = 'player-seek-fix.js?v=1';
      document.head.append(seekFix);
    }
    shell();
    if (!configured) { renderAccount(); resolveReady(state); return; }
    const gelis = adresDurumu(location.hash);
    state.client = window.supabase.createClient(config.supabaseUrl, config.supabasePublishableKey, { auth: { persistSession: true, storage: oturumDeposu, autoRefreshToken: true, detectSessionInUrl: true } });
    emit();
    const { data } = await state.client.auth.getSession(); await loadProfile(data.session?.user || null); resolveReady(state);
    if (gelis === 'eskimis') { try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* yok */ } eskimisBaglanti(); }
    if (gelis === 'onaylandi' && data.session) {
      openAuth('login');
      const kart = document.querySelector('.auth-overlay .auth-card');
      if (kart) { kart.querySelector('.auth-form').hidden = true; kart.querySelectorAll('.auth-switch').forEach(b => { b.hidden = true; }); kart.querySelector('.auth-message').textContent = dilMetni('auth.onaylandi', 'E-postan onaylandı, hesabına giriş yapıldı. Hoş geldin!'); }
    }
    state.client.auth.onAuthStateChange((_event, session) => { loadProfile(session?.user || null); });
  }
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', init) : init();
})();
