(() => {
  const config = window.DERIN_CONFIG || {};
  const configured = Boolean(config.supabaseUrl && config.supabasePublishableKey && window.supabase);
  const state = { client: null, user: null, profile: null, configured };
  let resolveReady;
  const ready = new Promise(resolve => { resolveReady = resolve; });
  window.DerinAuth = { ...state, ready, open: () => openAuth('login') };

  const escapeHtml = value => String(value || '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const emit = () => { Object.assign(window.DerinAuth, state); window.dispatchEvent(new CustomEvent('derin:authchange', { detail: state })); };

  function shell() {
    const header = document.querySelector('.header, .site-header');
    if (!header || document.querySelector('.account-actions')) return;
    const actions = document.createElement('div'); actions.className = 'account-actions';
    actions.innerHTML = '<a class="account-button secondary coach-action" href="music-request.html" hidden>MÜZİĞİNİ ARAŞTIR</a><button class="account-button" type="button" data-login>GİRİŞ YAP</button><button class="account-button secondary" type="button" data-signup>KAYIT OL</button><div class="account-menu" hidden></div>';
    const nav = header.querySelector('nav');
    nav ? header.insertBefore(actions, nav) : header.append(actions);
    actions.querySelector('[data-login]').addEventListener('click', () => state.user ? toggleMenu(actions) : openAuth('login'));
    actions.querySelector('[data-signup]').addEventListener('click', () => openAuth('signup'));
  }
  function renderAccount() {
    const actions = document.querySelector('.account-actions'); if (!actions) return;
    const button = actions.querySelector('[data-login]'), signup = actions.querySelector('[data-signup]'), coachAction = actions.querySelector('.coach-action'), menu = actions.querySelector('.account-menu');
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
    menu.innerHTML = `${state.profile?.role === 'admin' ? '<a href="admin.html">YÖNETİM PANELİ</a><a href="projects.html">TÜM PROJELER</a><a href="music-request.html">MÜZİK ARAŞTIR</a>' : '<a href="music-request.html">MÜZİK ARAŞTIR</a>'}<a href="my-projects.html">PROJELERİM</a><a href="energy-map.html">ENERJİ & TEMPO</a><a href="license.html">MÜZİK BEYANI</a><a href="chat.html">SOHBET</a><button type="button" data-logout>ÇIKIŞ YAP</button>`;
    menu.querySelector('[data-logout]').addEventListener('click', async () => { await state.client.auth.signOut(); menu.hidden = true; });
  }
  function toggleMenu(actions) { const menu = actions.querySelector('.account-menu'); menu.hidden = !menu.hidden; }
  function openAuth(mode) {
    let overlay = document.querySelector('.auth-overlay');
    if (!overlay) { overlay = document.createElement('div'); overlay.className = 'auth-overlay'; document.body.append(overlay); }
    if (!configured) { overlay.innerHTML = '<section class="auth-card"><button class="auth-close">KAPAT</button><h2>HESAP SİSTEMİ HAZIRLANIYOR</h2><p>Yönetici, Supabase bağlantı bilgilerini ekledikten sonra e-posta ve şifreyle kayıt/giriş açılacak.</p></section>'; overlay.hidden=false; overlay.querySelector('.auth-close').onclick=()=>overlay.hidden=true; return; }
    const signup = mode === 'signup';
    overlay.innerHTML = `<section class="auth-card"><button class="auth-close" type="button">KAPAT</button><h2>${signup ? 'ANTRENÖR KAYDI' : 'HESABINA GİR'}</h2><p>${signup ? 'Kaydın yönetici onayından sonra demo erişimin açılır.' : 'Demo notlarına ulaşmak için giriş yap.'}</p><form class="auth-form">${signup ? '<label>AD SOYAD<input name="name" autocomplete="name" required></label>' : ''}<label>E-POSTA<input name="email" type="email" autocomplete="email" required></label><label>ŞİFRE<input name="password" type="password" minlength="8" autocomplete="current-password" required></label><button class="auth-submit">${signup ? 'KAYIT OL' : 'GİRİŞ YAP'}</button></form><button class="auth-switch" type="button">${signup ? 'Zaten hesabın var mı? Giriş yap' : 'Hesabın yok mu? Antrenör olarak kayıt ol'}</button><p class="auth-message"></p></section>`;
    overlay.hidden = false;
    overlay.querySelector('.auth-close').onclick = () => overlay.hidden = true;
    overlay.querySelector('.auth-switch').onclick = () => openAuth(signup ? 'login' : 'signup');
    overlay.querySelector('.auth-form').onsubmit = async event => {
      event.preventDefault(); const form = new FormData(event.currentTarget), message = overlay.querySelector('.auth-message'); message.textContent = 'Kontrol ediliyor…';
      const email = String(form.get('email')).trim(), password = String(form.get('password'));
      const result = signup ? await state.client.auth.signUp({ email, password, options: { data: { full_name: String(form.get('name')).trim() } } }) : await state.client.auth.signInWithPassword({ email, password });
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
    if (!user) { state.user=null; state.profile=null; emit(); renderAccount(); return; }
    state.user = user;
    let profile;
    for (let attempt = 0; attempt < 3; attempt++) {
      const { data } = await state.client.from('profiles').select('id,full_name,role').eq('id', user.id).maybeSingle();
      if (data) { profile = data; break; }
      await new Promise(resolve => setTimeout(resolve, 350));
    }
    state.profile = profile || { id:user.id, full_name:user.user_metadata?.full_name || '', role:'coach' };
    emit(); renderAccount();
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
