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
  const addStyle = href => { const style = document.createElement('link'); style.rel = 'stylesheet'; style.href = href; document.head.append(style); };
  addStyle('chat-room-ui.css?v=2');
  addStyle('music-request.css?v=1');
  addStyle('chat-expression.css?v=1');
  addStyle('chat-sticker-drawer.css?v=1');
  addStyle('chat-music-link.css?v=1');
  addStyle('chat-wallpaper.css?v=1');
  addStyle('chat-message-menu.css?v=1');
  addStyle('chat-layout-simple.css?v=1');
  addStyle('chat-send-button.css?v=2');
  addStyle('chat-send-button-cassette.css?v=1');
  addStyle('chat-send-button-demo-cassette.css?v=1');
  addStyle('chat-send-button-demo-label.css?v=1');
  addStyle('chat-notifications.css?v=1');
  addStyle('chat-contacts.css?v=1');
  addStyle('chat-key-transfer.css?v=1');
  addStyle('chat-key-transfer-form.css?v=1');

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
  let emojiOpen = false;
  let selectedMessageIds = new Set();
  let chatScrollTop = 0;
  let chatAtBottom = true;
  let incomingNotice = '';
  let transferOpen = false;
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
  const emojis = ['👏','🎵','✨','💪','🔥','✅','💬','🎯'];

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
    const previousEmojiPanel = app.querySelector('.chat-emoji');
    if (previousEmojiPanel) emojiOpen = !previousEmojiPanel.hidden;
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

    const { data: loadedMessages, error } = await client.from('direct_messages').select('id,sender_id,recipient_id,body,created_at').or(`and(sender_id.eq.${user.id},recipient_id.eq.${contactId}),and(sender_id.eq.${contactId},recipient_id.eq.${user.id})`).order('created_at');
    if (error && !admin) { status.textContent = 'Sohbet henüz kurulmadı. Yönetici sohbet SQL dosyasını çalıştırmalı.'; return; }
    const messages = await Promise.all((loadedMessages || []).map(async message => ({
      ...message,
      body: await window.DerinChatCrypto.open(message.body, message.sender_id, message.recipient_id)
    })));
    const contactName = admin ? people.find(person => person.id === contactId)?.full_name || 'Derin Record' : 'Yönetici';
    status.textContent = incomingNotice || (admin ? (error ? 'Sohbet arayüzü önizlemesi açık. Mesajlaşma için sohbet SQL kurulumu gerekir.' : people.length ? 'Antrenör seçip özel konuşmayı yönet.' : 'Sohbet arayüzü önizlemesi açık.') : 'Yöneticiyle özel olarak mesajlaş.');
    app.hidden = false;
    const pinnedIds = new Set(JSON.parse(localStorage.getItem('derin-pinned-messages') || '[]'));
    const messageHtml = messages.length ? messages.map(message => `<article class="chat-message ${message.sender_id === user.id ? 'own' : ''} ${message.body.includes('[Müzik araştırma isteği') ? 'music-link-message' : ''} ${pinnedIds.has(message.id) ? 'pinned-message' : ''} ${selectedMessageIds.has(message.id) ? 'selected-message' : ''}" data-message-id="${message.id}" data-message-body="${encodeURIComponent(message.body)}" data-own="${message.sender_id === user.id}"><small>${pinnedIds.has(message.id) ? '📌 ' : ''}${message.sender_id === user.id ? 'Sen' : safe(contactName)} · ${date(message.created_at)}</small><p>${renderBody(message.body)}</p></article>`).join('') : '<div class="chat-empty"><b>💬</b><strong>Henüz mesaj yok.</strong><span>Bir emoji ekleyip ilk mesajını gönder.</span></div>';
    const contactListHtml = admin ? `<aside class="chat-contacts"><h2>ÖZEL SOHBETLER</h2><p>🔒 Uçtan uca şifreli</p>${people.length ? people.map(person => `<button type="button" class="${person.id === contactId ? 'active' : ''}" data-contact="${person.id}"><b>${safe((person.full_name || 'A').slice(0,1)).toUpperCase()}</b><span>${safe(person.full_name || 'İsimsiz antrenör')}</span><i>ÖZEL</i></button>`).join('') : '<small>Henüz kayıtlı antrenör yok.</small>'}</aside>` : '';
    const emojiHtml = emojis.map(emoji => `<button type="button" data-emoji="${emoji}" aria-label="${emoji} ekle">${emoji}</button>`).join('');
    app.innerHTML = `<div class="chat-shell"><div class="chat-head"><strong>${admin ? 'ANTRENÖR MESAJLARI' : 'YÖNETİCİYLE ÖZEL SOHBET'}</strong>${admin && people.length ? `<select class="chat-contact">${people.map(person => `<option value="${person.id}" ${person.id === contactId ? 'selected' : ''}>${safe(person.full_name || 'İsimsiz')}</option>`).join('')}</select>` : `<span>${admin ? 'ÖZEL SOHBET' : contactName}</span>`}</div><div class="chat-layout ${admin ? 'has-contacts' : ''}">${contactListHtml}<section class="chat-conversation"><div class="chat-list">${messageHtml}</div><div class="chat-form-wrap"><div class="chat-emoji" aria-label="Emoji seç"><span>EMOJİ</span>${emojiHtml}</div><form class="chat-form"><textarea name="message" maxlength="2000" placeholder="Mesajını yaz…" required>${safe(composeDraft)}</textarea><button class="derin-send-button" type="submit"><span>MESAJI</span> GÖNDER <b>↗</b></button></form></div></section></div></div>`;
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
    const emojiPanel = app.querySelector('.chat-emoji');
    emojiPanel.hidden = !emojiOpen;
    const emojiToggle = document.createElement('button');
    emojiToggle.type = 'button';
    emojiToggle.className = 'chat-emoji-toggle';
    emojiToggle.setAttribute('aria-expanded', String(emojiOpen));
    emojiToggle.innerHTML = `☺ EMOJİLER VE STICKERLAR <span>${emojiOpen ? '−' : '+'}</span>`;
    emojiPanel.before(emojiToggle);
    const stickerSheet = document.createElement('img');
    stickerSheet.className = 'chat-sticker-sheet';
    stickerSheet.src = 'assets/chat-cimnastik-fitness-stickers.png';
    stickerSheet.alt = 'Cimnastik ve fitness sticker seti';
    emojiPanel.prepend(stickerSheet);
    emojiToggle.onclick = () => {
      const open = emojiPanel.hidden;
      emojiPanel.hidden = !open;
      emojiOpen = open;
      emojiToggle.setAttribute('aria-expanded', String(open));
      emojiToggle.querySelector('span').textContent = open ? '−' : '+';
    };
    const list = app.querySelector('.chat-list');
    list.scrollTop = chatAtBottom ? list.scrollHeight : chatScrollTop;

    if (!error && !transferOpen) refreshTimer = window.setTimeout(load, 3000);
    app.querySelector('.chat-contact')?.addEventListener('change', event => { chosenCoachId = event.target.value; load(); });
    app.querySelectorAll('[data-contact]').forEach(button => button.onclick = () => { chosenCoachId = button.dataset.contact; composeDraft = ''; load(); });
    app.querySelectorAll('[data-emoji]').forEach(button => button.onclick = () => { const field = app.querySelector('textarea'); const start = field.selectionStart; const end = field.selectionEnd; field.setRangeText(button.dataset.emoji, start, end, 'end'); composeDraft = field.value; field.focus(); });
    const composeField = app.querySelector('textarea');
    composeField.addEventListener('input', event => { composeDraft = event.target.value; });
    if (composeFocused) window.requestAnimationFrame(() => { composeField.focus(); composeField.setSelectionRange(composeCaretStart, composeCaretEnd); });
    app.querySelectorAll('[data-delete]').forEach(button => button.onclick = async () => {
      if (!window.confirm('Bu mesaj silinsin mi?')) return;
      const { error: deleteError } = await client.from('direct_messages').delete().eq('id', button.dataset.delete).eq('sender_id', user.id);
      if (deleteError) { status.textContent = deleteError.message; return; }
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
    const closeMenus = () => app.querySelectorAll('.message-context-menu').forEach(menu => menu.remove());
    const writeToField = value => { composeDraft = value; const field = app.querySelector('textarea'); field.value = value; field.focus(); };
    const openMessageMenu = article => {
      closeMenus();
      const own = article.dataset.own === 'true';
      const body = decodeURIComponent(article.dataset.messageBody);
      const menu = document.createElement('div');
      menu.className = 'message-context-menu';
      menu.innerHTML = `<button type="button" data-reply>YANITLA</button><button type="button" data-copy>KOPYALA</button>${own ? '<button type="button" data-edit-menu>DÜZENLE</button><button type="button" data-pin>SABİTLE</button>' : ''}<button type="button" data-forward>İLET</button>${own ? '<button type="button" class="danger" data-delete-menu>SİL</button>' : ''}<button type="button" data-select-menu><span class="select-circle">✓</span> SEÇ</button>`;
      article.append(menu);
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
        <span class="dz-yazi"><b>Müziği sürükle bırak</b><small>veya <u>dosya seç</u> · MP3, WAV</small></span>
        <span class="dz-dosya" id="dz-dosya" hidden></span>
      </label>
      <div class="dz-alt">
        <select id="chat-proj"></select>
        <select id="chat-mode"><option value="new">Yeni parça</option><option value="ver">Yeni sürüm</option></select>
        <button type="button" id="chat-audio-send" disabled><span>MÜZİĞİ GÖNDER</span><i class="dz-bar"></i></button>
      </div>`;
    app.querySelector('.chat-form-wrap').prepend(fileRow);

       (() => {
      const dz = fileRow.querySelector('#dz');
      const inp = fileRow.querySelector('#chat-audio');
      const etiket = fileRow.querySelector('#dz-dosya');
      const gonder = fileRow.querySelector('#chat-audio-send');
      const boyut = b => b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.round(b / 1024) + ' KB';

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
        if (f && f.type.startsWith('audio/')) ata(f);
      });

      gonder.addEventListener('click', () => {
        if (!(inp.files && inp.files[0])) return;
        gonder.classList.add('yukleniyor');
        const bitir = () => {
          window.__secilenMuzik = null;
          gonder.classList.remove('yukleniyor');
          gonder.classList.add('bitti');
          setTimeout(() => gonder.classList.remove('bitti'), 1600);
        };
        const gozle = new MutationObserver(() => {
          const m = fileRow.querySelector('.chat-file-msg');
          if (m && m.textContent) { bitir(); gozle.disconnect(); }
        });
        gozle.observe(fileRow, { childList: true, subtree: true, characterData: true });
        setTimeout(() => { gonder.classList.remove('yukleniyor'); gozle.disconnect(); }, 60000);
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
           if (!hedefProje) {
               status.textContent = 'Bu antrenör için yeni proje açılıyor…';
             const yeni = await client.from('music_projects')
         .insert({ coach_id: contactId, title: label, status: 'approved' })
       .select('id').single();
       if (yeni.error) { status.textContent = 'Proje açılamadı: ' + yeni.error.message; return; }
       hedefProje = yeni.data.id;
      }

           const path = `${contactId}/${hedefProje}-${Date.now()}.${file.name.split('.').pop() || 'mp3'}`;
      const up = await client.storage.from('project-audio')
        .upload(path, file, { contentType: file.type || 'audio/mpeg' });
      if (up.error) { status.textContent = 'Yükleme hatası: ' + up.error.message; return; }

      const existing = await client.from('project_tracks')
                .select('id,version').eq('project_id', hedefProje).order('sort_order').limit(1);

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
      msg.textContent = fileRow.querySelector('#chat-mode').value === 'ver'
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
