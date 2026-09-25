(() => {
const ROLE_LABELS = { admin:'Yönetici', coach:'Antrenör', business:'İşletme', sound_design:'Film & Ses Tasarımı' };
const ROLE_ORDER = ['coach','business','sound_design','admin'];
const escapeHtml = value => String(value || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const formatDate = iso => { try { return new Date(iso).toLocaleDateString('tr-TR', { day:'2-digit', month:'long', year:'numeric' }); } catch (e) { return iso; } };
const byId = id => document.getElementById(id);
let FUNCTIONS_URL = '';
let allUsers = [];
let searchTerm = '';

async function callAdmin(action, payload = {}) {
  const { client } = window.DerinAuth;
  const { data: { session } } = await client.auth.getSession();
  if (!session) throw new Error('Oturum bulunamadı, lütfen tekrar giriş yapın.');
  const res = await fetch(FUNCTIONS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
    body: JSON.stringify({ action, ...payload }),
  });
  let json = {};
  try { json = await res.json(); } catch (e) {}
  if (!res.ok) throw new Error(json.error || 'Beklenmeyen bir hata oluştu.');
  return json;
}

function renderStats(users) {
  const counts = { admin:0, coach:0, business:0, sound_design:0, suspended:0 };
  users.forEach(u => { if (counts[u.role] !== undefined) counts[u.role]++; if (u.status === 'suspended') counts.suspended++; });
  return `<div class="admin-grid">
    <div class="admin-stat">TOPLAM KULLANICI<strong>${users.length}</strong></div>
    <div class="admin-stat">ANTRENÖR<strong>${counts.coach}</strong></div>
    <div class="admin-stat">İŞLETME<strong>${counts.business}</strong></div>
    <div class="admin-stat">FİLM &amp; SES TASARIMI<strong>${counts.sound_design}</strong></div>
    <div class="admin-stat">YÖNETİCİ<strong>${counts.admin}</strong></div>
    <div class="admin-stat">DONDURULMUŞ<strong>${counts.suspended}</strong></div>
  </div>`;
}

function renderRow(user, currentUserId) {
  const roleOptions = ROLE_ORDER.map(r => `<option value="${r}" ${user.role === r ? 'selected' : ''}>${ROLE_LABELS[r]}</option>`).join('');
  const isSelf = user.id === currentUserId;
  return `<tr data-id="${user.id}">
    <td>${escapeHtml(user.full_name || 'İsimsiz')}${isSelf ? ' <span style="opacity:.6">(sen)</span>' : ''}</td>
    <td>${user.email ? `<a href="mailto:${escapeHtml(user.email)}" style="color:#7fe3ff">${escapeHtml(user.email)}</a>` : '—'}</td>
    <td>${user.phone ? escapeHtml(user.phone) : '—'}</td>
    <td><select class="kul-role-select" data-id="${user.id}" ${isSelf ? 'disabled title="Kendi rolünüzü buradan değiştiremezsiniz"' : ''}>${roleOptions}</select></td>
    <td><span class="kul-status-pill kul-status-${user.status}">${user.status === 'suspended' ? 'Dondurulmuş' : 'Aktif'}</span></td>
    <td>${formatDate(user.created_at)}</td>
    <td style="display:flex;gap:.4rem;flex-wrap:wrap">
      <button class="kul-suspend-btn" data-id="${user.id}" data-status="${user.status}" ${isSelf ? 'disabled' : ''}>${user.status === 'suspended' ? 'DONDURMAYI KALDIR' : 'DONDUR'}</button>
      <button class="kul-delete-btn kul-danger" data-id="${user.id}" ${isSelf ? 'disabled' : ''}>SİL</button>
    </td>
  </tr>`;
}

function matchesSearch(user, term) {
  if (!term) return true;
  const haystack = `${user.full_name || ''} ${user.email || ''} ${user.phone || ''}`.toLowerCase();
  return haystack.includes(term.toLowerCase());
}

function renderApp(app, currentUserId) {
  const filtered = allUsers.filter(u => matchesSearch(u, searchTerm));
  app.innerHTML = `
    ${renderStats(allUsers)}
    <section class="admin-panel">
      <div class="kul-toolbar">
        <input type="search" id="kul-search" placeholder="İsim, e-posta veya telefon ara…" value="${escapeHtml(searchTerm)}">
        <button class="kul-add-btn" id="kul-add-open" type="button">+ KULLANICI EKLE</button>
      </div>
      ${filtered.length ? `<table class="admin-table"><thead><tr><th>Ad</th><th>E-posta</th><th>Telefon</th><th>Rol</th><th>Durum</th><th>Kayıt</th><th></th></tr></thead><tbody>${filtered.map(u => renderRow(u, currentUserId)).join('')}</tbody></table>` : '<p class="kul-empty">Aramayla eşleşen kullanıcı yok.</p>'}
    </section>`;

  const searchInput = byId('kul-search');
  searchInput.oninput = event => {
    searchTerm = event.target.value;
    const pos = event.target.selectionStart;
    renderApp(app, currentUserId);
    const again = byId('kul-search');
    again.focus();
    again.setSelectionRange(pos, pos);
  };
  byId('kul-add-open').onclick = () => openAddModal();

  app.querySelectorAll('.kul-role-select').forEach(select => {
    select.addEventListener('change', async event => {
      const id = event.target.dataset.id, role = event.target.value;
      const user = allUsers.find(u => u.id === id);
      const prev = user?.role;
      select.disabled = true;
      try {
        await callAdmin('update_role', { user_id: id, role });
        if (user) user.role = role;
        renderApp(app, currentUserId);
      } catch (err) {
        alert(err.message);
        select.value = prev;
        select.disabled = false;
      }
    });
  });

  app.querySelectorAll('.kul-suspend-btn').forEach(button => {
    button.addEventListener('click', async () => {
      const id = button.dataset.id, current = button.dataset.status;
      const next = current === 'suspended' ? 'active' : 'suspended';
      const user = allUsers.find(u => u.id === id);
      if (next === 'suspended' && !confirm(`${user?.full_name || 'Bu kullanıcının'} üyeliğini dondurmak istediğinize emin misiniz? Giriş yapamayacaklar.`)) return;
      button.disabled = true;
      try {
        await callAdmin('update_status', { user_id: id, status: next });
        if (user) user.status = next;
        renderApp(app, currentUserId);
      } catch (err) {
        alert(err.message);
        button.disabled = false;
      }
    });
  });

  app.querySelectorAll('.kul-delete-btn').forEach(button => {
    button.addEventListener('click', async () => {
      const id = button.dataset.id;
      const user = allUsers.find(u => u.id === id);
      if (!confirm(`${user?.full_name || 'Bu kullanıcıyı'} kalıcı olarak silmek istediğinize emin misiniz? Bu işlem geri alınamaz.`)) return;
      button.disabled = true;
      try {
        await callAdmin('delete', { user_id: id });
        allUsers = allUsers.filter(u => u.id !== id);
        renderApp(app, currentUserId);
      } catch (err) {
        alert(err.message);
        button.disabled = false;
      }
    });
  });
}

function openAddModal() {
  const modal = byId('kul-modal');
  modal.innerHTML = `<div class="kul-modal">
    <h2>KULLANICI EKLE</h2>
    <p style="margin:0 0 .8rem;font-size:.82rem;opacity:.85">Kullanıcıya e-posta ile bir davet bağlantısı gönderilir; şifresini kendisi belirler.</p>
    <form id="kul-add-form">
      <label>AD SOYAD<input name="full_name" required></label>
      <label>E-POSTA<input name="email" type="email" required></label>
      <label>TELEFON (opsiyonel)<input name="phone" type="tel"></label>
      <label>ROL<select name="role">${ROLE_ORDER.map(r => `<option value="${r}">${ROLE_LABELS[r]}</option>`).join('')}</select></label>
      <p class="kul-message" id="kul-add-message"></p>
      <div class="kul-modal-actions">
        <button type="button" class="kul-modal-cancel" id="kul-modal-cancel">VAZGEÇ</button>
        <button type="submit" class="kul-add-btn">DAVET GÖNDER</button>
      </div>
    </form>
  </div>`;
  modal.hidden = false;
  byId('kul-modal-cancel').onclick = () => modal.hidden = true;
  modal.onclick = event => { if (event.target === modal) modal.hidden = true; };
  byId('kul-add-form').onsubmit = async event => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const message = byId('kul-add-message');
    message.textContent = 'Gönderiliyor…';
    try {
      await callAdmin('invite', {
        email: String(form.get('email')).trim(),
        full_name: String(form.get('full_name')).trim(),
        role: String(form.get('role')),
        phone: String(form.get('phone') || '').trim() || null,
      });
      message.textContent = 'Davet gönderildi.';
      setTimeout(() => { modal.hidden = true; load(); }, 700);
    } catch (err) {
      message.textContent = err.message;
    }
  };
}

async function load() {
  await window.DerinAuth.ready;
  const { configured, user, profile, client } = window.DerinAuth;
  const status = byId('kul-status'), app = byId('kul-app');

  if (!configured) { status.textContent = 'Önce Supabase bağlantısını config.js dosyasına ekleyin.'; return; }
  if (!user) {
    status.innerHTML = 'Bu alan yalnızca yöneticilere açıktır. <button class="account-button" id="kul-login">GİRİŞ YAP</button>';
    byId('kul-login').onclick = () => window.DerinAuth.open();
    return;
  }
  if (profile?.role !== 'admin') { status.textContent = 'Bu alan için yönetici yetkiniz yok.'; return; }

  FUNCTIONS_URL = `${window.DERIN_CONFIG.supabaseUrl}/functions/v1/admin-users`;
  status.textContent = `Yönetici: ${profile.full_name || user.email}`;
  app.hidden = false;
  app.innerHTML = '<p class="kul-empty">Kullanıcılar yükleniyor…</p>';

  try {
    const result = await callAdmin('list');
    allUsers = result.users || [];
    renderApp(app, user.id);
  } catch (err) {
    app.innerHTML = `<p class="kul-empty">Kullanıcılar yüklenirken hata oluştu: ${escapeHtml(err.message)}</p>`;
  }
}

load();
})();
