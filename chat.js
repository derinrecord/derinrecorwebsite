(() => {
    // --- Şifreleme devre dışı: mesajlar düz metin olarak saklanır ---
  const looksEncrypted = v => {
    if (typeof v !== 'string') return false;
        if (v.startsWith('E2EE')) return true;
        if (v.startsWith('E2EE')) return true;
    if (v.startsWith('{') && v.includes('"iv"')) return true;
    return /^[A-Za-z0-9+/=]{120,}$/.test(v.replace(/\s/g, ''));
  };
  window.DerinChatCrypto = {
    ready: async () => true,
    seal: async body => body,
    open: async body => looksEncrypted(body) ? '[eski şifreli mesaj — okunamıyor]' : body,
    createBackup: async () => { throw new Error('Yedek kodu artık gerekli değil.'); },
    restoreBackup: async () => true,
    startFreshKey: async () => true
  };
  // Not: sohbetin tüm görünümü artık tek dosyada — chat.css. Eskiden burada
  // 16 ayrı küçük CSS dosyası tek tek ekleniyordu (chat-room-ui, chat-expression,
  // chat-send-button + 3 varyasyonu vb.); hepsi chat.css içine taşındı.

  // --- "SENKRONİZE EDİLİYOR" yükleme kartı: müzik yüklenirken görünen kart ---
  (() => {
    const heights = [14,24,36,48,58,44,30,20,32,46,56,40,26,18,34,50,60,42,28,16];
    const rects = heights.map((h,i) => `<rect x='${i*8}' y='${64-h}' width='4' height='${h}'/>`).join('');
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='160' height='64'>${rects}</svg>`;
    const mask = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
    const style = document.createElement('style');
    style.textContent = `
.us-sync{position:relative;flex:1 1 100%;height:108px;border-radius:20px;overflow:hidden;display:flex;flex-direction:column;justify-content:space-between;padding:16px 20px;background:linear-gradient(100deg,#0c0609 0%,#1a0a12 55%,#200c16 100%);box-shadow:0 10px 30px rgba(0,0,0,.45)}
.us-sync[hidden]{display:none}
.us-sync::before{content:'';position:absolute;top:0;left:0;right:0;height:60%;background:linear-gradient(180deg,rgba(0,0,0,.5),rgba(0,0,0,0));z-index:1;pointer-events:none}
.us-sync-top{position:relative;z-index:2;display:flex;align-items:flex-start;justify-content:space-between;gap:14px}
.us-sync-text b{display:block;font-size:15px;font-weight:900;letter-spacing:.04em;color:#fff}
.us-sync-text small{display:block;margin-top:3px;font-size:10.5px;font-weight:700;letter-spacing:.14em;color:rgba(255,255,255,.45)}
.us-sync-pct{position:relative;z-index:2;font-size:26px;font-weight:900;color:#fff;line-height:1}
.us-wave{position:absolute;inset:0}
.us-wave-bars{position:absolute;inset:0;background:linear-gradient(180deg,rgba(255,255,255,.10),rgba(255,255,255,.02));-webkit-mask-image:${mask};mask-image:${mask};-webkit-mask-repeat:repeat-x;mask-repeat:repeat-x;-webkit-mask-size:160px 100%;mask-size:160px 100%;-webkit-mask-position:bottom left;mask-position:bottom left}
.us-fill{position:absolute;inset:0;width:0%;overflow:hidden;transition:width .3s ease}
.us-fill-inner{position:absolute;top:0;bottom:0;left:0;width:900px;background:linear-gradient(90deg,#fff 0%,#ffd3ea 22%,#ff7fc0 55%,#ef2f8f 100%);-webkit-mask-image:${mask};mask-image:${mask};-webkit-mask-repeat:repeat-x;mask-repeat:repeat-x;-webkit-mask-size:160px 100%;mask-size:160px 100%;-webkit-mask-position:bottom left;mask-position:bottom left}
@media(max-width:600px){.us-sync{padding:14px 16px}.us-sync-pct{font-size:20px}}
`;
    document.head.append(style);
  })();

  const status = document.querySelector('#chat-status');
  const app = document.querySelector('#chat-app');
  const safe = value => String(value || '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
  const renderBody = value => safe(value).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noreferrer">Bağlantıyı aç ↗</a>');
  const date = value => new Intl.DateTimeFormat('tr-TR', { hour:'2-digit', minute:'2-digit', day:'2-digit', month:'short' }).format(new Date(value));
  let chosenCoachId = null;
  let refreshTimer = null;
  let composeDraft = '';
  let composeFocused = false;
  let composeCaretStart = 0;
  let composeCaretEnd = 0;
  let selectedMessageIds = new Set();
  let chatScrollTop = 0;
  let chatAtBottom = true;
  let incomingNotice = '';
  let transferOpen = false;
  let lastRenderSignature = null;
  const seenIncomingKey = userId => `derin-record-seen-messages-${userId}`;
  async function checkNotifications(client, user) {
    const { data, error } = await client.from('direct_messages').select('id,sender_id,created_at').eq('recipient_id', user.id).neq('sender_id', user.id).order('created_at', { ascending: false }).limit(30);
    if (error || !data) return;
    const storageKey = seenIncomingKey(user.id);
    const seen = new Set(JSON.parse(localStorage.getItem(storageKey) || '[]'));
    if (!localStorage.getItem(storageKey)) {
      localStorage.setItem(storageKey, JSON.stringify(data.map(message => message.id)));
      return;
    }
    const fresh = data.filter(message => !seen.has(message.id));
    if (!fresh.length) return;
    localStorage.setItem(storageKey, JSON.stringify([...new Set([...seen, ...data.map(message => message.id)])].slice(-100)));
    incomingNotice = `${fresh.length} yeni mesaj geldi.`;
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') new Notification('Derin Record', { body: `${fresh.length} yeni mesajın var.`, tag: `derin-record-chat-${user.id}` });
  }

  async function load() {
    if (refreshTimer) { clearTimeout(refreshTimer); refreshTimer = null; }
    incomingNotice = '';
    const currentField = app.querySelector('textarea');
    if (currentField) {
      composeDraft = currentField.value;
      composeFocused = document.activeElement === currentField;
      composeCaretStart = currentField.selectionStart;
      composeCaretEnd = currentField.selectionEnd;
    }
    const previousList = app.querySelector('.chat-list');
    if (previousList) {
      chatScrollTop = previousList.scrollTop;
      chatAtBottom = previousList.scrollHeight - previousList.scrollTop - previousList.clientHeight < 32;
    }
    selectedMessageIds = new Set([...app.querySelectorAll('.chat-message.selected-message')].map(message => message.dataset.messageId));
    await window.DerinAuth.ready;
    const { configured, user, profile, client } = window.DerinAuth;
    if (!configured) { status.textContent = 'Sohbet bağlantısı hazırlanıyor.'; return; }
    if (!user) {
      status.innerHTML = '<button class="account-button" id="chat-login">GİRİŞ YAP</button>';
      document.querySelector('#chat-login').onclick = () => window.DerinAuth.open();
      return;
    }
    try {
      await window.DerinChatCrypto.ready(client, user.id);
    } catch (cryptoError) {
      if (cryptoError.code === 'RESTORE_REQUIRED') {
        status.innerHTML = 'Bu yeni cihazda şifreli sohbeti açmak için aktarım kodunu gir. <button class="account-button" id="restore-chat-key">AKTARIM KODUNU GİR</button> <button class="account-button" id="fresh-chat-key">YENİ SOHBET ANAHTARI OLUŞTUR</button>';
        document.querySelector('#restore-chat-key').onclick = async () => {
          const code = window.prompt('Bilgisayarda oluşturduğun aktarım kodunu gir.');
          if (!code) return;
          try { await window.DerinChatCrypto.restoreBackup(client, user.id, code); load(); }
          catch (restoreError) { status.textContent = restoreError.message || 'Aktarım kodu açılamadı.'; }
        };
        document.querySelector('#fresh-chat-key').onclick = async () => {
          const accepted = window.confirm('Yeni sohbet anahtarı oluşturulsun mu? Daha önceki şifreli mesajlar bu cihazda açılamaz; bundan sonraki mesajlar güvenli biçimde devam eder.');
          if (!accepted) return;
          try { await window.DerinChatCrypto.startFreshKey(client, user.id); load(); }
          catch (freshKeyError) { status.textContent = freshKeyError.message || 'Yeni sohbet anahtarı oluşturulamadı.'; }
        };
        return;
      }
      status.textContent = cryptoError.message || 'Uçtan uca şifreleme hazırlanamadı.';
      return;
    }
    const admin = profile?.role === 'admin';
    await checkNotifications(client, user);
    const people = admin ? (await client.from('profiles').select('id,full_name').eq('role','coach').order('full_name')).data || [] : [];
    let contactId = admin ? (chosenCoachId || people[0]?.id || user.id) : null;
    if (!admin) contactId = (await client.rpc('admin_contact_id')).data;
    if (!contactId) { status.textContent = 'Yönetici hesabı bulunamadı.'; return; }

    const { data: loadedMessages, error } = await client.from('direct_messages').select('id,sender_id,recipient_id,body,created_at,research_project_id').or(`and(sender_id.eq.${user.id},recipient_id.eq.${contactId}),and(sender_id.eq.${contactId},recipient_id.eq.${user.id})`).order('created_at');
    if (error && !admin) { status.textContent = 'Sohbet henüz kurulmadı. Yönetici sohbet SQL dosyasını çalıştırmalı.'; return; }
    const messages = await Promise.all((loadedMessages || []).map(async message => ({
      ...message,
      body: await window.DerinChatCrypto.open(message.body, message.sender_id, message.recipient_id)
    })));
    const contactName = admin ? people.find(person => person.id === contactId)?.full_name || 'Derin Record' : 'Yönetici';
    status.textContent = incomingNotice || (admin ? (error ? 'Sohbet arayüzü önizlemesi açık. Mesajlaşma için sohbet SQL kurulumu gerekir.' : people.length ? 'Antrenör seçip özel konuşmayı yönet.' : 'Sohbet arayüzü önizlemesi açık.') : 'Yöneticiyle özel olarak mesajlaş.');
    app.hidden = false;
    const pinnedIds = new Set(JSON.parse(localStorage.getItem('derin-pinned-messages') || '[]'));
    const renderSignature = JSON.stringify({
      contactId, admin,
      people: people.map(person => person.id + ':' + person.full_name),
      pinned: [...pinnedIds].sort(),
      selected: [...selectedMessageIds].sort(),
      messages: messages.map(message => message.id + ':' + message.body + ':' + message.created_at + ':' + (message.research_project_id || ''))
    });
    if (renderSignature === lastRenderSignature && !incomingNotice) {
      if (!error && !transferOpen) refreshTimer = window.setTimeout(load, 3000);
      return;
    }
    lastRenderSignature = renderSignature;
    const messageHtml = messages.length ? messages.map(message => {
      const musicMatch = message.body.match(/__DATA__:(\{[\s\S]*\})\s*$/);
      const displayBody = musicMatch ? message.body.slice(0, musicMatch.index).trim() : message.body;
      const isMusicRequest = displayBody.includes('[Müzik araştırma isteği');
      const isOwn = message.sender_id === user.id;
      const approveHtml = (admin && isMusicRequest && !isOwn)
        ? (message.research_project_id
            ? '<span class="music-approved-badge">✅ Onaylandı — Projelerim\'e eklendi</span>'
            : `<button type="button" class="music-approve-button" data-approve-msg="${message.id}">ONAYLA — PROJELERİM'E EKLE</button>`)
        : '';
      return `<article class="chat-message ${isOwn ? 'own' : ''} ${isMusicRequest ? 'music-link-message' : ''} ${pinnedIds.has(message.id) ? 'pinned-message' : ''} ${selectedMessageIds.has(message.id) ? 'selected-message' : ''}" data-message-id="${message.id}" data-message-body="${encodeURIComponent(message.body)}" data-own="${isOwn}">${pinnedIds.has(message.id) ? '<i class="msg-pin">📌</i>' : ''}<p>${renderBody(displayBody)}</p>${approveHtml}<time>${date(message.created_at)}</time></article>`;
    }).join('') : '<div class="chat-empty"><b>💬</b><strong>Henüz mesaj yok.</strong><span>İlk mesajını gönder.</span></div>';
    const contactListHtml = admin ? `<aside class="chat-contacts"><h2>ÖZEL SOHBETLER</h2><p>🔒 Uçtan uca şifreli</p>${people.length ? people.map(person => `<button type="button" class="${person.id === contactId ? 'active' : ''}" data-contact="${person.id}"><b>${safe((person.full_name || 'A').slice(0,1)).toUpperCase()}</b><span>${safe(person.full_name || 'İsimsiz antrenör')}</span><i>ÖZEL</i></button>`).join('') : '<small>Henüz kayıtlı antrenör yok.</small>'}</aside>` : '';
    app.innerHTML = `<div class="chat-shell"><div class="chat-head"><strong>${admin ? 'ANTRENÖR MESAJLARI' : 'YÖNETİCİYLE ÖZEL SOHBET'}</strong>${admin && people.length ? `<select class="chat-contact">${people.map(person => `<option value="${person.id}" ${person.id === contactId ? 'selected' : ''}>${safe(person.full_name || 'İsimsiz')}</option>`).join('')}</select>` : `<span>${admin ? 'ÖZEL SOHBET' : contactName}</span>`}</div><div class="chat-layout ${admin ? 'has-contacts' : ''}">${contactListHtml}<section class="chat-conversation"><div class="chat-list">${messageHtml}</div><div class="chat-form-wrap"><form class="chat-form"><textarea name="message" maxlength="2000" placeholder="Mesajını yaz…" required>${safe(composeDraft)}</textarea><button class="derin-send-button" type="submit" aria-label="Gönder"></button></form></div></section></div></div>`;
    const transferButton = document.createElement('button');
    transferButton.type = 'button';
    transferButton.className = 'chat-key-transfer-button';
    transferButton.textContent = 'CİHAZ AKTARIMI';
    transferButton.onclick = () => {
      transferOpen = true;
      if (refreshTimer) { clearTimeout(refreshTimer); refreshTimer = null; }
      const panel = app.querySelector('.chat-transfer-panel');
      panel.hidden = false;
      panel.querySelector('input').focus();
    };
    app.querySelector('.chat-head').append(transferButton);
    const deleteChatButton = document.createElement('button');
    deleteChatButton.type = 'button';
    deleteChatButton.className = 'chat-delete-chat-button';
    deleteChatButton.textContent = 'SOHBETİ SİL';
    deleteChatButton.onclick = async () => {
      const confirmMsg = admin
        ? 'Bu sohbetteki TÜM mesajlar (iki taraftan da) kalıcı olarak silinsin mi? Bu işlem geri alınamaz.'
        : 'Bu sohbette senin gönderdiğin mesajlar kalıcı olarak silinsin mi? Bu işlem geri alınamaz.';
      if (!window.confirm(confirmMsg)) return;
      deleteChatButton.disabled = true;
      deleteChatButton.textContent = 'SİLİNİYOR…';
      let deleteError;
      if (admin) {
        ({ error: deleteError } = await client.from('direct_messages').delete()
          .or(`and(sender_id.eq.${user.id},recipient_id.eq.${contactId}),and(sender_id.eq.${contactId},recipient_id.eq.${user.id})`));
      } else {
        ({ error: deleteError } = await client.from('direct_messages').delete()
          .eq('sender_id', user.id).eq('recipient_id', contactId));
      }
      if (deleteError) { status.textContent = deleteError.message; deleteChatButton.disabled = false; deleteChatButton.textContent = 'SOHBETİ SİL'; return; }
      load();
    };
    app.querySelector('.chat-head').append(deleteChatButton);
    const transferPanel = document.createElement('form');
    transferPanel.className = 'chat-transfer-panel';
    transferPanel.hidden = true;
    transferPanel.noValidate = true;
    transferPanel.innerHTML = '<strong>CİHAZ AKTARIM KODU</strong><p>Telefonunda kullanacağın, en az 8 karakterlik kodu belirle.</p><label>AKTARIM KODU<input name="code" type="password" autocomplete="new-password"></label><label>KODU TEKRAR GİR<input name="confirmation" type="password" autocomplete="new-password"></label><p class="chat-transfer-error" aria-live="polite"></p><div><button type="submit">KODU OLUŞTUR</button><button type="button" data-cancel-transfer>VAZGEÇ</button></div>';
    app.querySelector('.chat-head').after(transferPanel);
    transferPanel.querySelector('[data-cancel-transfer]').onclick = () => { transferOpen = false; transferPanel.hidden = true; refreshTimer = window.setTimeout(load, 3000); };
    transferPanel.onsubmit = async event => {
      event.preventDefault();
      const code = transferPanel.elements.code.value;
      const confirmation = transferPanel.elements.confirmation.value;
      const transferError = transferPanel.querySelector('.chat-transfer-error');
      if (code.length < 8) { transferError.textContent = 'Kod en az 8 karakter olmalı.'; return; }
      if (code !== confirmation) { transferError.textContent = 'İki kutudaki kod aynı değil.'; return; }
      transferError.textContent = '';
      try {
        await window.DerinChatCrypto.createBackup(code);
        transferOpen = false;
        transferPanel.hidden = true;
        status.textContent = 'Aktarım kodu hazır. Telefonda aynı hesapla giriş yaptıktan sonra bu kodu gir.';
        refreshTimer = window.setTimeout(load, 3000);
      } catch (backupError) { transferError.textContent = backupError.message || 'Aktarım yedeği oluşturulamadı.'; }
    };
    if (typeof Notification !== 'undefined' && Notification.permission !== 'granted') {
      const notificationButton = document.createElement('button');
      notificationButton.type = 'button';
      notificationButton.className = 'chat-notification-button';
      notificationButton.textContent = 'BİLDİRİMLERİ AÇ';
      notificationButton.onclick = async () => { const permission = await Notification.requestPermission(); status.textContent = permission === 'granted' ? 'Bildirimler açıldı.' : 'Bildirim izni verilmedi.'; notificationButton.remove(); };
      app.querySelector('.chat-head').append(notificationButton);
    }
    const list = app.querySelector('.chat-list');
    list.scrollTop = chatAtBottom ? list.scrollHeight : chatScrollTop;

    if (!error && !transferOpen) refreshTimer = window.setTimeout(load, 3000);
    app.querySelector('.chat-contact')?.addEventListener('change', event => { chosenCoachId = event.target.value; load(); });
    app.querySelectorAll('[data-contact]').forEach(button => button.onclick = () => { chosenCoachId = button.dataset.contact; composeDraft = ''; load(); });
    const composeField = app.querySelector('textarea');
    composeField.addEventListener('input', event => { composeDraft = event.target.value; });
    if (composeFocused) window.requestAnimationFrame(() => { composeField.focus(); composeField.setSelectionRange(composeCaretStart, composeCaretEnd); });
    app.querySelectorAll('[data-delete]').forEach(button => button.onclick = async () => {
      if (!window.confirm('Bu mesaj silinsin mi?')) return;
      const { error: deleteError } = await client.from('direct_messages').delete().eq('id', button.dataset.delete).eq('sender_id', user.id);
      if (deleteError) { status.textContent = deleteError.message; return; }
      load();
    });
    app.querySelectorAll('[data-approve-msg]').forEach(button => button.onclick = async () => {
      if (!window.confirm('Bu parça(lar) onaylanıp Projelerim sayfasına eklensin mi?')) return;
      button.disabled = true;
      const originalLabel = button.textContent;
      button.textContent = 'EKLENİYOR…';
      const article = button.closest('.chat-message');
      const rawBody = decodeURIComponent(article.dataset.messageBody);
      const dataMatch = rawBody.match(/__DATA__:(\{[\s\S]*\})\s*$/);
      if (!dataMatch) { status.textContent = 'Bu mesajdan parça bilgisi okunamadı.'; button.disabled = false; button.textContent = originalLabel; return; }
      let payload;
      try { payload = JSON.parse(dataMatch[1]); }
      catch { status.textContent = 'Parça bilgisi bozuk.'; button.disabled = false; button.textContent = originalLabel; return; }
      const proj = await client.from('music_projects').insert({
        coach_id: contactId, title: payload.title, song: payload.song, branch: payload.branch, status: 'approved'
      }).select('id').single();
      if (proj.error) { status.textContent = 'Proje oluşturulamadı: ' + proj.error.message; button.disabled = false; button.textContent = originalLabel; return; }
      if (payload.tracks && payload.tracks.length) {
        const trackInsert = await client.from('project_tracks').insert(payload.tracks.map((track, index) => ({
          project_id: proj.data.id, label: track.label, source_url: track.source_url, sort_order: index
        })));
        if (trackInsert.error) status.textContent = 'Proje oluştu ama parçalar eklenemedi: ' + trackInsert.error.message;
      }
      if (payload.note) await client.from('project_feedback').insert({ project_id: proj.data.id, author_id: user.id, body: 'Antrenörün notu: ' + payload.note, kind: 'note' });
      await client.from('direct_messages').update({ research_project_id: proj.data.id }).eq('id', button.dataset.approveMsg);
      load();
    });
    app.querySelectorAll('[data-edit]').forEach(button => button.onclick = () => {
      const article = button.closest('.chat-message');
      const original = decodeURIComponent(button.dataset.editBody);
      article.querySelector('p').innerHTML = `<textarea class="message-edit-field">${safe(original)}</textarea>`;
      article.querySelector('.message-actions').innerHTML = '<div class="message-edit-controls"><button type="button" data-save-edit>KAYDET</button><button type="button" data-cancel-edit>VAZGEÇ</button></div>';
      article.querySelector('[data-cancel-edit]').onclick = () => load();
      article.querySelector('[data-save-edit]').onclick = async () => {
        const body = article.querySelector('.message-edit-field').value.trim();
        if (!body) { status.textContent = 'Mesaj boş bırakılamaz.'; return; }
        const encryptedBody = await window.DerinChatCrypto.seal(body, contactId);
        const { error: updateError } = await client.from('direct_messages').update({ body: encryptedBody }).eq('id', button.dataset.edit).eq('sender_id', user.id);
        if (updateError) { status.textContent = updateError.message; return; }
        load();
      };
    });
    const closeMenus = () => { app.querySelectorAll('.message-context-menu').forEach(menu => menu.remove()); app.querySelectorAll('.chat-message.menu-open').forEach(el => el.classList.remove('menu-open')); };
    const writeToField = value => { composeDraft = value; const field = app.querySelector('textarea'); field.value = value; field.focus(); };
    const openMessageMenu = article => {
      closeMenus();
      const own = article.dataset.own === 'true';
      const body = decodeURIComponent(article.dataset.messageBody);
      const menu = document.createElement('div');
      menu.className = 'message-context-menu';
      menu.innerHTML = `<button type="button" data-reply>YANITLA</button><button type="button" data-copy>KOPYALA</button>${own ? '<button type="button" data-edit-menu>DÜZENLE</button><button type="button" data-pin>SABİTLE</button>' : ''}<button type="button" data-forward>İLET</button>${own ? '<button type="button" class="danger" data-delete-menu>SİL</button>' : ''}<button type="button" data-select-menu><span class="select-circle">✓</span> SEÇ</button>`;
      article.append(menu);
      article.classList.add('menu-open');
      menu.querySelector('[data-reply]').onclick = () => { writeToField(`↪ ${body}\n`); closeMenus(); };
      menu.querySelector('[data-copy]').onclick = async () => { try { await navigator.clipboard.writeText(body); status.textContent = 'Mesaj kopyalandı.'; } catch { status.textContent = 'Kopyalama için mesajı seçebilirsin.'; } closeMenus(); };
      menu.querySelector('[data-forward]').onclick = () => { writeToField(`İletilen mesaj:\n${body}`); closeMenus(); };
      menu.querySelector('[data-select-menu]').onclick = () => { article.classList.toggle('selected-message'); if (article.classList.contains('selected-message')) selectedMessageIds.add(article.dataset.messageId); else selectedMessageIds.delete(article.dataset.messageId); closeMenus(); };
      menu.querySelector('[data-pin]')?.addEventListener('click', () => {
        const stored = new Set(JSON.parse(localStorage.getItem('derin-pinned-messages') || '[]'));
        stored.add(article.dataset.messageId);
        localStorage.setItem('derin-pinned-messages', JSON.stringify([...stored]));
        status.textContent = 'Mesaj sabitlendi.';
        load();
      });
      menu.querySelector('[data-delete-menu]')?.addEventListener('click', async () => {
        if (!window.confirm('Bu mesaj silinsin mi?')) return;
        const { error: deleteError } = await client.from('direct_messages').delete().eq('id', article.dataset.messageId).eq('sender_id', user.id);
        if (deleteError) { status.textContent = deleteError.message; return; }
        load();
      });
      menu.querySelector('[data-edit-menu]')?.addEventListener('click', () => {
        closeMenus();
        const paragraph = article.querySelector('p');
        paragraph.innerHTML = `<textarea class="message-edit-field">${safe(body)}</textarea><span class="message-edit-controls"><button type="button" data-save-edit>KAYDET</button><button type="button" data-cancel-edit>VAZGEÇ</button></span>`;
        paragraph.querySelector('[data-cancel-edit]').onclick = () => load();
        paragraph.querySelector('[data-save-edit]').onclick = async () => {
          const updated = paragraph.querySelector('.message-edit-field').value.trim();
          if (!updated) { status.textContent = 'Mesaj boş bırakılamaz.'; return; }
          let encryptedBody;
          try { encryptedBody = await window.DerinChatCrypto.seal(updated, contactId); }
          catch (cryptoError) { status.textContent = cryptoError.message || 'Mesaj şifrelenemedi.'; return; }
          const { error: updateError } = await client.from('direct_messages').update({ body: encryptedBody }).eq('id', article.dataset.messageId).eq('sender_id', user.id);
          if (updateError) { status.textContent = updateError.message; return; }
          load();
        };
      });
    };
    app.querySelectorAll('.chat-message').forEach(article => {
      let holdTimer = null;
      const cancelHold = () => { if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; } };
      article.addEventListener('pointerdown', event => {
        if (event.target.closest('a, button, textarea')) return;
        holdTimer = window.setTimeout(() => { openMessageMenu(article); holdTimer = null; }, 450);
      });
      ['pointerup', 'pointerleave', 'pointercancel'].forEach(type => article.addEventListener(type, cancelHold));
      article.addEventListener('contextmenu', event => { event.preventDefault(); openMessageMenu(article); });
      article.addEventListener('click', event => {
        if (event.target.closest('a, button, textarea')) return;
        article.classList.toggle('selected-message');
        if (article.classList.contains('selected-message')) selectedMessageIds.add(article.dataset.messageId);
        else selectedMessageIds.delete(article.dataset.messageId);
      });
    });
    app.onclick = event => { if (!event.target.closest('.chat-message')) closeMenus(); };
        const fileRow = document.createElement('div');
    fileRow.className = 'chat-file-row';
    fileRow.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;align-items:center;padding:10px 0';
        fileRow.innerHTML = `
      <label class="dz" id="dz">
        <input type="file" accept="audio/*" id="chat-audio" hidden>
        <span class="dz-ok dz-ok-l"><svg viewBox="0 0 40 40" width="34" height="34" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M8 6c0 14 6 22 22 24"/><path d="M24 24l6 6-7 4"/></svg></span>
        <span class="dz-kartlar">
          <span class="dz-kart k1"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/></svg></span>
          <span class="dz-kart k2"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg></span>
          <span class="dz-kart k3"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12h2l2-6 4 12 3-9 2 3h5"/></svg></span>
        </span>
        <span class="dz-ok dz-ok-r"><svg viewBox="0 0 40 40" width="34" height="34" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M32 6c0 14-6 22-22 24"/><path d="M16 24l-6 6 7 4"/></svg></span>
        <span class="dz-yazi"><b>Müziği sürükle bırak</b><small>veya <u>dosya seç</u> · WAV, MP3, FLAC · büyük dosyalar parçalanır</small></span>
        <span class="dz-dosya" id="dz-dosya" hidden></span>
      </label>
      <div class="dz-alt">
        <select id="chat-proj"></select>
        <button type="button" id="chat-audio-send" disabled><span>MÜZİĞİ GÖNDER</span><i class="dz-bar"></i></button>
      </div>
      <div class="us-sync" id="us-sync" hidden>
        <div class="us-sync-top">
          <div class="us-sync-text"><b>SENKRONİZE EDİLİYOR</b><small>DOSYAN HAZIRLANIYOR</small></div>
          <div class="us-sync-pct" id="us-sync-pct">0%</div>
        </div>
        <div class="us-wave"><div class="us-wave-bars"></div><div class="us-fill" id="us-fill"><div class="us-fill-inner"></div></div></div>
      </div>`;
    app.querySelector('.chat-form-wrap').prepend(fileRow);

       (() => {
      const dz = fileRow.querySelector('#dz');
      const dzAlt = fileRow.querySelector('.dz-alt');
      const sync = fileRow.querySelector('#us-sync');
      const syncPct = fileRow.querySelector('#us-sync-pct');
      const syncFill = fileRow.querySelector('#us-fill');
      const inp = fileRow.querySelector('#chat-audio');
      const etiket = fileRow.querySelector('#dz-dosya');
      const gonder = fileRow.querySelector('#chat-audio-send');
      const boyut = b => b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.round(b / 1024) + ' KB';

      let syncTimer = null;
      const syncBaslat = fileSize => {
        dz.hidden = true;
        dzAlt.hidden = true;
        sync.hidden = false;
        const t0 = Date.now();
        const tau = Math.max(1200, Math.min(9000, (fileSize || 3000000) / 1800));
        syncFill.style.width = '0%';
        syncPct.textContent = '0%';
        clearInterval(syncTimer);
        syncTimer = setInterval(() => {
          // Gerçek parça ilerlemesi varsa (çok parçalı yükleme) onun altına düşme.
          const gercek = Number(sync.dataset.gercek || 0);
          const pct = Math.max(gercek, Math.min(92, Math.round(92 * (1 - Math.exp(-(Date.now() - t0) / tau)))));
          syncFill.style.width = pct + '%';
          syncPct.textContent = pct + '%';
        }, 90);
      };
      const syncBitir = () => {
        clearInterval(syncTimer);
        syncFill.style.width = '100%';
        syncPct.textContent = '100%';
        setTimeout(() => {
          sync.hidden = true;
          dz.hidden = false;
          dzAlt.hidden = false;
          syncFill.style.width = '0%';
          syncPct.textContent = '0%';
        }, 700);
      };

      const goster = () => {
        const f = inp.files && inp.files[0];
        dz.classList.toggle('dolu', !!f);
        gonder.disabled = !f;
        etiket.hidden = !f;
        if (f) etiket.innerHTML = '<b>' + f.name.replace(/[<>&]/g, '') + '</b><small>' + boyut(f.size) + '</small>';
      };

      const ata = f => {
        const dt = new DataTransfer();
        dt.items.add(f);
        inp.files = dt.files;
        window.__secilenMuzik = f;
        goster();
      };

      if (window.__secilenMuzik && !(inp.files && inp.files.length)) ata(window.__secilenMuzik);

      inp.addEventListener('change', () => {
        window.__secilenMuzik = (inp.files && inp.files[0]) || null;
        goster();
      });

      ['dragenter', 'dragover'].forEach(tip => dz.addEventListener(tip, e => {
        e.preventDefault();
        dz.classList.add('ustunde');
      }));

      ['dragleave', 'drop'].forEach(tip => dz.addEventListener(tip, e => {
        e.preventDefault();
        dz.classList.remove('ustunde');
      }));

      dz.addEventListener('drop', e => {
        const f = e.dataTransfer.files && e.dataTransfer.files[0];
        // Uzantı kontrolü de yapılır: bazı sistemlerde .wav dosyasının tipi boş
        // gelir ve yalnızca type kontrolü bırakılan dosyayı sessizce yok sayardı.
        const Ses = window.DerinAudioTypes;
        if (f && (f.type.startsWith('audio/') || (Ses && Ses.gecerli(f)))) ata(f);
      });

      gonder.addEventListener('click', () => {
        if (!(inp.files && inp.files[0])) return;
        gonder.classList.add('yukleniyor');
        syncBaslat(inp.files[0].size);
        const bitir = () => {
          window.__secilenMuzik = null;
          gonder.classList.remove('yukleniyor');
          gonder.classList.add('bitti');
          syncBitir();
          setTimeout(() => gonder.classList.remove('bitti'), 1600);
        };
        const gozle = new MutationObserver(() => {
          const m = fileRow.querySelector('.chat-file-msg');
          if (m && m.textContent) { bitir(); gozle.disconnect(); }
        });
        gozle.observe(fileRow, { childList: true, subtree: true, characterData: true });
        setTimeout(() => { gonder.classList.remove('yukleniyor'); syncBitir(); gozle.disconnect(); }, 180000);
      });

      goster();
    })();
    (async () => {
      const targetCoach = admin ? contactId : null;
      if (!targetCoach) { fileRow.remove(); return; }
      const { data } = await client.from('music_projects')
        .select('id,title').eq('coach_id', targetCoach).order('created_at', { ascending:false });
            const sel = fileRow.querySelector('#chat-proj');
      sel.innerHTML = (data && data.length)
        ? data.map(p => `<option value="${p.id}">${safe(p.title || 'Proje')}</option>`).join('')
        : `<option value="">Bu antrenörün projesi yok</option>`;
    })();

    fileRow.querySelector('#chat-audio-send').onclick = async () => {
      const input = fileRow.querySelector('#chat-audio');
      const file = input.files?.[0];
      if (!file) { status.textContent = 'Önce bir ses dosyası seç.'; return; }
      status.textContent = 'Müzik gönderiliyor…';


      const label = file.name.replace(/\.[^.]+$/, '');

           const projectId = fileRow.querySelector('#chat-proj').value;

            let hedefProje = projectId;
           let yeniProje = false;
           if (!hedefProje) {
               status.textContent = 'Bu antrenör için yeni proje açılıyor…';
             const yeni = await client.from('music_projects')
         .insert({ coach_id: contactId, title: label, status: 'approved' })
       .select('id').single();
       if (yeni.error) { status.textContent = 'Proje açılamadı: ' + yeni.error.message; return; }
       hedefProje = yeni.data.id;
       yeniProje = true;
      }

      // Uzantı doğrulaması + 45 MB üzeri dosyalar için parçalı yükleme.
      // Tek nesne sınırı (50 MiB) aşılırsa sunucu 413 döndürür ve dosya hiç
      // yüklenmez; bu yüzden büyük WAV'lar kayıpsız parçalara bölünür.
      const Ses = window.DerinAudioTypes;
      if (!Ses || !Ses.gecerli(file)) {
        status.textContent = `“${file.name}” desteklenen bir ses dosyası değil. Desteklenenler: ${Ses ? Ses.desteklenenler() : 'wav, mp3, flac, m4a, aac, ogg'}.`;
        if (yeniProje) await client.from('music_projects').delete().eq('id', hedefProje);
        return;
      }
      const syncKart = fileRow.querySelector('#us-sync');
      const up = await Ses.parcaliYukle({
        yukle: async (yol, dilim, tip) => {
          const ilk = await client.storage.from('project-audio').upload(yol, dilim, { contentType: tip, upsert: false });
          if (!ilk.error) return { error: null };
          if (/mime|content.?type/i.test(ilk.error.message || '')) {
            const ikinci = await client.storage.from('project-audio').upload(yol, dilim, { contentType: 'application/octet-stream', upsert: false });
            if (!ikinci.error) return { error: null };
          }
          return { error: new Error(ilk.error.message) };
        },
        sil: yollar => client.storage.from('project-audio').remove(yollar)
      }, `${contactId}/${hedefProje}-${Date.now()}`, file, (i, n) => {
        if (syncKart) {
          const pct = Math.round((i - 1) / n * 100);
          syncKart.dataset.gercek = String(pct);
          const pctEl = syncKart.querySelector('#us-sync-pct'); if (pctEl) pctEl.textContent = pct + '%';
          const dolgu = syncKart.querySelector('#us-fill'); if (dolgu) dolgu.style.width = pct + '%';
        }
        status.textContent = `Müzik yükleniyor… parça ${i}/${n} (${Ses.boyut(file.size)})`;
      });
      if (up.error) {
        // Yarım kalan yeni proje listede kalmasın (aksi hâlde “Henüz parça
        // eklenmedi” yazan boş bir kaset oluşuyordu).
        if (yeniProje) await client.from('music_projects').delete().eq('id', hedefProje);
        const ek = /maximum allowed size|exceeded the maximum|413/i.test(up.error.message)
          ? ' Dosya boyutu depolama sınırını aşıyor.'
          : /row-level security|policy|Unauthorized/i.test(up.error.message)
            ? ' Depolama yetkisi reddedildi; depolama izinlerini kontrol edin.'
            : '';
        status.textContent = 'Yükleme hatası: ' + up.error.message + ek + (yeniProje ? ' Hiçbir proje oluşturulmadı.' : '');
        const hataKutusu = fileRow.querySelector('.chat-file-msg') || document.createElement('div');
        hataKutusu.className = 'chat-file-msg';
        hataKutusu.style.cssText = 'flex:1 1 100%;font-size:12px;color:#ff9db0;padding-top:6px';
        hataKutusu.textContent = 'Yükleme başarısız — dosya gönderilmedi.';
        if (!hataKutusu.parentNode) fileRow.appendChild(hataKutusu);
        return;
      }
      const path = up.path;

      const existing = await client.from('project_tracks')
                .select('id,version').eq('project_id', hedefProje).order('sort_order').limit(1);
      const versionGuncellendi = !!(existing.data && existing.data.length);

      if (existing.data && existing.data.length) {
        await client.from('project_tracks')
          .update({ audio_path: path, version: (existing.data[0].version || 1) + 1 })
          .eq('id', existing.data[0].id);
      } else {
        await client.from('project_tracks')
                   .insert({ project_id: hedefProje, label, audio_path: path, sort_order: 0 });
                }

           const meRes = await client.auth.getUser();
      const fbRes = await client.from('project_feedback').insert({
               project_id: hedefProje, author_id: meRes.data.user.id,
        kind: 'system', body: `Parçanız gönderildi (${label}). Projelerim sayfasından dinleyebilirsiniz.` });
      if (fbRes.error) { status.textContent = 'Bildirim yazılamadı: ' + fbRes.error.message; return; }
      try {
        const note = await window.DerinChatCrypto.seal(
          `Müzik gönderildi: ${label} — Projelerim sayfandan dinleyebilirsin.`, contactId);
        await client.from('direct_messages').insert({ recipient_id: contactId, body: note });
      } catch {}

      input.value = '';
                 let msg = fileRow.querySelector('.chat-file-msg');
      if (!msg) { msg = document.createElement('div'); msg.className = 'chat-file-msg'; msg.style.cssText = 'flex:1 1 100%;font-size:12px;color:#6ee7b0;padding-top:6px'; fileRow.appendChild(msg); }
      msg.textContent = versionGuncellendi
        ? 'Yeni sürüm gönderildi — antrenörün dalga formu güncellendi.'
        : 'Yeni parça gönderildi — antrenörün Projelerim sayfasına düştü.';
      setTimeout(() => { msg.textContent = ''; }, 6000);
           setTimeout(load, 5000);
    };
    app.querySelector('.chat-form').onsubmit = async event => {
      event.preventDefault();
      const field = event.currentTarget.elements.message;
      const body = field.value.trim();
      if (!body) return;
      let encryptedBody;
      try { encryptedBody = await window.DerinChatCrypto.seal(body, contactId); }
      catch (cryptoError) { status.textContent = cryptoError.message || 'Mesaj şifrelenemedi.'; return; }
      const { error: sendError } = await client.from('direct_messages').insert({ recipient_id: contactId, body: encryptedBody });
      if (sendError) { status.textContent = sendError.message; return; }
      field.value = '';
      composeDraft = '';
      load();
    };
  }
  load();
})();
/* Sohbet yenilenirken sayfa konumunu koru */
(() => {
  let y = 0, bekle = null;
  const kaydet = () => { if (!bekle) y = window.scrollY; };
  window.addEventListener('scroll', kaydet, { passive: true });

  const hedef = document.querySelector('#chat-app') || document.body;
  new MutationObserver(() => {
    if (Math.abs(window.scrollY - y) < 4) return;
    clearTimeout(bekle);
    window.scrollTo(0, y);
    bekle = setTimeout(() => { bekle = null; }, 400);
  }).observe(hedef, { childList: true, subtree: true });
})();
