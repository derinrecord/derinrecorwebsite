(() => {
  // Üyelik onayında kabul edilen hukuki metin sürümleri (sayfalardaki "Sürüm" ile aynı).
  const SOZLESME_SURUM = '2026-10-04';
  const AYDINLATMA_SURUM = '2026-10-04';
  const config = window.DERIN_CONFIG || {};
  const configured = Boolean(config.supabaseUrl && config.supabasePublishableKey && window.supabase);
  const state = { client: null, user: null, profile: null, configured };
  let resolveReady;
  const ready = new Promise(resolve => { resolveReady = resolve; });
  window.DerinAuth = { ...state, ready, open: () => openAuth('login'), _sayacYazisi: n => (!n || n < 1) ? '' : (n > 99 ? '99+' : String(n)) };

  const escapeHtml = value => String(value || '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const emit = () => { Object.assign(window.DerinAuth, state); window.dispatchEvent(new CustomEvent('derin:authchange', { detail: state })); };

  function shell() {
    sayacStiliEkle();
    const header = document.querySelector('.header, .site-header');
    if (!header || document.querySelector('.account-actions')) return;
    const actions = document.createElement('div'); actions.className = 'account-actions';
    actions.innerHTML = '<a class="account-button secondary coach-action" href="music-request.html" hidden>MÜZİĞİNİ ARAŞTIR</a><button class="account-button" type="button" data-login>GİRİŞ YAP</button><button class="account-button secondary" type="button" data-signup>KAYIT OL</button>';
  const menu = document.createElement('div');
  menu.className = 'account-menu';
  menu.hidden = true;
  menu.innerHTML = '<div class="account-menu-backdrop" data-menu-close></div><aside class="account-menu-panel"><div class="account-menu-head"><span class="account-menu-name"></span><button class="account-menu-close" type="button" data-menu-close aria-label="Kapat">×</button></div><nav class="account-menu-links"></nav><button class="account-menu-logout" type="button" data-logout>ÇIKIŞ YAP</button></aside>';
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
  menu.querySelector('[data-logout]').addEventListener('click', async () => { await state.client.auth.signOut(); closeMenu(menu); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && !menu.hidden) closeMenu(menu); });
  }
  function renderAccount() {
    const actions = document.querySelector('.account-actions'); if (!actions) return;
    const button = actions.querySelector('[data-login]'), signup = actions.querySelector('[data-signup]'), coachAction = actions.querySelector('.coach-action'), menu = document.querySelector('.account-menu');
    const header = actions.closest('.site-header');
    const navigation = header?.querySelector('nav'), menuToggle = header?.querySelector('.menu-toggle');
    const setNavigation = visible => {
      if (!navigation || !menuToggle) return;
      navigation.hidden = !visible; menuToggle.hidden = !visible;
      if (!visible) { navigation.classList.remove('open'); menuToggle.setAttribute('aria-expanded', 'false'); }
    };
    if (!configured) { setNavigation(false); coachAction.hidden = true; button.textContent = 'HESAP SİSTEMİ'; button.classList.add('secondary'); signup.hidden = true; button.onclick = () => openAuth('login'); return; }
    if (!state.user) { setNavigation(false); coachAction.hidden = true; button.textContent = 'GİRİŞ YAP'; button.classList.remove('secondary'); signup.hidden = false; return; }
    setNavigation(true);
    signup.hidden = true; coachAction.hidden = false;
    button.textContent = `${(state.profile?.full_name || state.user.email || 'HESABIM').toUpperCase()} · HESABIM`;
    menu.querySelector('.account-menu-links').innerHTML = `${state.profile?.role === 'admin' ? '<a href="kullanicilar.html">KULLANICILAR</a><a href="bildirimler.html">BİLDİRİMLER<span class="bildirim-sayac" data-bildirim-sayac hidden></span></a><a href="taleplerim.html">TALEPLERİM</a><a href="radyo-yonetim.html">RADYO YÖNETİMİ</a><a href="ajanlar.html">AJANLAR</a><a href="harmonic-mixer.html">HARMONİK SET</a><a href="music-request.html">MÜZİK ARAŞTIR</a>' : '<a href="music-request.html">MÜZİK ARAŞTIR</a>'}<a href="my-projects.html">PROJELERİM</a><a href="energy-map.html">ENERJİ & TEMPO</a><a href="license.html">MÜZİK BEYANI</a>`;
    menu.querySelector('.account-menu-name').textContent = state.profile?.full_name || state.user.email || 'HESABIM';
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
      + '.account-button[data-sayac]::after{content:attr(data-sayac);position:absolute;top:-9px;right:-9px;min-width:19px;height:19px;padding:0 5px;border-radius:10px;background:#cb2468;color:#fff;font:800 .62rem/19px Arial,sans-serif;letter-spacing:0;text-align:center;box-sizing:border-box;box-shadow:0 0 0 2px #0b0b0d;animation:bildirimGeldi .5s ease}'
      + '@keyframes bildirimGeldi{0%{transform:scale(.4)}60%{transform:scale(1.2)}100%{transform:scale(1)}}'
      + '@media(prefers-reduced-motion:reduce){.account-button[data-sayac]::after{animation:none}}'
      // Telefonda başlık tek satıra sığmıyordu: HESABIM düğmesi ekrandan taşıp sayfayı
      // sağa-sola kaydırıyordu. Dar ekranda hesap düğmeleri ikinci satıra, sağa iner.
      + '@media(max-width:600px){.header:has(.account-actions){flex-wrap:wrap;row-gap:10px}'
      + '.header>.account-actions{order:3;flex:1 1 100%;min-width:0;justify-content:flex-end;margin-left:0}'
      + '.header>.account-actions .account-button{white-space:nowrap}}';
    (document.head || document.body).appendChild(st);
  }
  function sayaclariYaz() {
    if (document.head || document.body) sayacStiliEkle();
    const yazi = sayacYazisi(bekleyenSayisi);
    document.querySelectorAll('[data-bildirim-sayac]').forEach(el => { el.textContent = yazi; el.hidden = !yazi; });
    const dugme = document.querySelector('.account-actions [data-login]');
    if (dugme) {
      if (yazi && state.user) { dugme.dataset.sayac = yazi; dugme.setAttribute('aria-label', `${dugme.textContent} — ${yazi} yeni bildirim`); }
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
  function openAuth(mode) {
    let overlay = document.querySelector('.auth-overlay');
    if (!overlay) { overlay = document.createElement('div'); overlay.className = 'auth-overlay'; document.body.append(overlay); }
    if (!configured) { overlay.innerHTML = '<section class="auth-card"><button class="auth-close">KAPAT</button><h2>HESAP SİSTEMİ HAZIRLANIYOR</h2><p>Yönetici, Supabase bağlantı bilgilerini ekledikten sonra e-posta ve şifreyle kayıt/giriş açılacak.</p></section>'; overlay.hidden=false; overlay.querySelector('.auth-close').onclick=()=>overlay.hidden=true; return; }
    const signup = mode === 'signup';
    overlay.innerHTML = `<section class="auth-card"><button class="auth-close" type="button">KAPAT</button><h2>${signup ? 'ANTRENÖR KAYDI' : 'HESABINA GİR'}</h2><p>${signup ? 'Kaydın yönetici onayından sonra demo erişimin açılır.' : 'Demo notlarına ulaşmak için giriş yap.'}</p><form class="auth-form">${signup ? '<label>AD SOYAD<input name="name" autocomplete="name" required></label>' : ''}<label>E-POSTA<input name="email" type="email" autocomplete="email" required></label><label>ŞİFRE<input name="password" type="password" minlength="8" autocomplete="${signup ? 'new-password' : 'current-password'}" required></label>${signup ? '<label class="auth-onay"><input type="checkbox" name="onay" required><span><a href="kullanici-sozlesmesi.html" target="_blank" rel="noopener">Kullanıcı Sözleşmesi</a>’ni okudum ve kabul ediyorum; <a href="aydinlatma-metni.html" target="_blank" rel="noopener">Aydınlatma Metni</a>’ni okudum.</span></label>' : ''}<button class="auth-submit">${signup ? 'KAYIT OL' : 'GİRİŞ YAP'}</button></form><button class="auth-switch" type="button">${signup ? 'Zaten hesabın var mı? Giriş yap' : 'Hesabın yok mu? Antrenör olarak kayıt ol'}</button>${signup ? '' : '<button class="auth-switch auth-forgot" type="button">Şifreni mi unuttun?</button>'}<p class="auth-message"></p></section>`;
    overlay.hidden = false;
    overlay.querySelector('.auth-close').onclick = () => overlay.hidden = true;
    overlay.querySelector('.auth-switch').onclick = () => openAuth(signup ? 'login' : 'signup');
    const forgot = overlay.querySelector('.auth-forgot');
    if (forgot) forgot.onclick = async () => {
      const message = overlay.querySelector('.auth-message');
      const emailInput = overlay.querySelector('input[name="email"]');
      const email = String(emailInput.value || '').trim();
      if (!email) { message.textContent = 'Önce e-posta adresini yaz, sonra bu bağlantıya bas.'; emailInput.focus(); return; }
      forgot.disabled = true; message.textContent = 'Sıfırlama bağlantısı gönderiliyor…';
      const { error } = await state.client.auth.resetPasswordForEmail(email, { redirectTo: `${location.origin}/sifre-yenile.html` });
      forgot.disabled = false;
      message.textContent = error
        ? error.message
        : 'Bu adres kayıtlıysa sıfırlama bağlantısı gönderildi. Gelen kutunu ve spam klasörünü kontrol et.';
    };
    overlay.querySelector('.auth-form').onsubmit = async event => {
      event.preventDefault(); const form = new FormData(event.currentTarget), message = overlay.querySelector('.auth-message'); message.textContent = 'Kontrol ediliyor…';
      const email = String(form.get('email')).trim(), password = String(form.get('password'));
      // Üyelik onayı: sözleşme kutusu işaretlenmeden hesap açılmaz; kabul edilen
      // metin sürümleri ve zamanı hesabın kayıt bilgisine yazılır (kanıt).
      if (signup && !form.get('onay')) { message.textContent = 'Kayıt için Kullanıcı Sözleşmesi’ni kabul etmen gerekiyor.'; return; }
      const onay = { sozlesme_surum: SOZLESME_SURUM, aydinlatma_surum: AYDINLATMA_SURUM, kabul_at: new Date().toISOString() };
      const result = signup ? await state.client.auth.signUp({ email, password, options: { data: Object.assign({ full_name: String(form.get('name')).trim() }, onay) } }) : await state.client.auth.signInWithPassword({ email, password });
      if (result.error) {
        message.textContent = result.error.message;
        if (!signup && /confirm|onay|verified/i.test(result.error.message)) {
          const resendButton = document.createElement('button'); resendButton.type = 'button'; resendButton.className = 'auth-switch'; resendButton.textContent = 'ONAY E-POSTASINI YENİDEN GÖNDER';
          resendButton.onclick = async () => { const resend = await state.client.auth.resend({ type:'signup', email, options:{ emailRedirectTo:`${location.origin}${location.pathname}` } }); message.textContent = resend.error ? resend.error.message : 'Yeni onay e-postası gönderildi.'; };
          message.append(document.createElement('br'), resendButton);
        }
        return;
      }
      if (signup && !result.data.session) {
        message.innerHTML = 'Kayıt oluşturuldu. E-postandaki onay bağlantısını açtıktan sonra giriş yap. <button class="auth-switch auth-resend" type="button">ONAY E-POSTASINI YENİDEN GÖNDER</button>';
        message.querySelector('.auth-resend').onclick = async () => {
          const resend = await state.client.auth.resend({ type:'signup', email, options:{ emailRedirectTo:`${location.origin}${location.pathname}` } });
          message.textContent = resend.error ? resend.error.message : 'Yeni onay e-postası gönderildi.';
        };
      } else message.textContent = 'Giriş başarılı.';
      if (result.data.session) setTimeout(() => overlay.hidden = true, 450);
    };
  }
  async function loadProfile(user) {
    if (!user) { state.user=null; state.profile=null; document.body.classList.remove('is-admin'); emit(); renderAccount(); return; }
    state.user = user;
    let profile;
    for (let attempt = 0; attempt < 3; attempt++) {
      const { data } = await state.client.from('profiles').select('id,full_name,role').eq('id', user.id).maybeSingle();
      if (data) { profile = data; break; }
      await new Promise(resolve => setTimeout(resolve, 350));
    }
    state.profile = profile || { id:user.id, full_name:user.user_metadata?.full_name || '', role:'coach' };
    emit(); renderAccount(); document.body.classList.toggle('is-admin', state.profile?.role === 'admin');
  }
  async function init() {
    if (document.querySelector('.player-controls')) {
      const seekFix = document.createElement('script');
      seekFix.src = 'player-seek-fix.js?v=1';
      document.head.append(seekFix);
    }
    shell();
    if (!configured) { renderAccount(); resolveReady(state); return; }
    state.client = window.supabase.createClient(config.supabaseUrl, config.supabasePublishableKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
    emit();
    const { data } = await state.client.auth.getSession(); await loadProfile(data.session?.user || null); resolveReady(state);
    state.client.auth.onAuthStateChange((_event, session) => { loadProfile(session?.user || null); });
  }
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', init) : init();
})();
