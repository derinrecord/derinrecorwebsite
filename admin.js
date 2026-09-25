(() => {
  const demos = [
    ['aerobik-the-witcher', 'Aerobik — The Witcher'],
    ['akrobatik-horon-kafkas', 'Ritmik — Horon Kafkas'],
    ['akrobatik-wp-acro', 'Akrobatik — WP Acro'],
    ['artistik-007', 'Artistik — 007']
  ];
  const byId = id => document.getElementById(id);
  const label = key => demos.find(([id]) => id === key)?.[1] || key;
  async function load() {
    await window.DerinAuth.ready;
    const { configured, user, profile, client } = window.DerinAuth;
    const status = byId('admin-status'), app = byId('admin-app');
    if (!configured) { status.textContent = 'Önce Supabase bağlantısını config.js dosyasına ekleyin.'; return; }
    if (!user) { status.innerHTML = 'Bu alan yalnızca yöneticilere açıktır. <button class="account-button" id="admin-login">GİRİŞ YAP</button>'; byId('admin-login').onclick = () => window.DerinAuth.open(); return; }
    if (profile?.role !== 'admin') { status.textContent = 'Bu alan için yönetici yetkiniz yok.'; return; }
    status.textContent = `Yönetici: ${profile.full_name || user.email}`; app.hidden = false;
    const [profilesResult, accessResult, notesResult] = await Promise.all([
      client.from('profiles').select('id,full_name,role,created_at').order('created_at', { ascending:false }),
      client.from('demo_access').select('demo_key,user_id,granted_at'),
      client.from('feedback_notes').select('id').limit(10000)
    ]);
    const people = profilesResult.data || [], access = accessResult.data || [], notes = notesResult.data || [];
    app.innerHTML = `<div class="admin-grid"><div class="admin-stat">KAYITLI HESAP<strong>${people.length}</strong></div><div class="admin-stat">AÇIK DEMO ERİŞİMİ<strong>${access.length}</strong></div><div class="admin-stat">GERİ BİLDİRİM<strong>${notes.length}</strong></div></div><section class="admin-panel"><h2>ANTRENÖRE DEMO ERİŞİMİ VER</h2><form class="access-form" id="access-form"><select name="userId" required><option value="">Antrenör seçin</option>${people.filter(person => person.role !== 'admin').map(person => `<option value="${person.id}">${escapeHtml(person.full_name || person.id)} — ${escapeHtml(person.role)}</option>`).join('')}</select><select name="demoKey" required><option value="">Demo seçin</option>${demos.map(([key,title]) => `<option value="${key}">${title}</option>`).join('')}</select><button>ERİŞİM VER</button></form><p id="access-message"></p></section><section class="admin-panel"><h2>AKTİF ERİŞİMLER</h2><table class="admin-table"><thead><tr><th>Antrenör</th><th>Demo</th><th></th></tr></thead><tbody>${access.length ? access.map(item => `<tr><td>${escapeHtml(people.find(person => person.id===item.user_id)?.full_name || item.user_id)}</td><td>${escapeHtml(label(item.demo_key))}</td><td><button data-revoke="${item.demo_key}" data-user="${item.user_id}">KALDIR</button></td></tr>`).join('') : '<tr><td colspan="3">Henüz erişim verilmedi.</td></tr>'}</tbody></table></section><section class="admin-panel"><h2>KULLANICILAR</h2><table class="admin-table"><thead><tr><th>Ad</th><th>Rol</th><th>Kayıt</th></tr></thead><tbody>${people.map(person => `<tr><td>${escapeHtml(person.full_name || 'İsimsiz')}</td><td>${person.role === 'admin' ? 'Yönetici' : 'Antrenör'}</td><td>${new Date(person.created_at).toLocaleDateString('tr-TR')}</td></tr>`).join('')}</tbody></table></section>`;
    byId('access-form').onsubmit = async event => { event.preventDefault(); const form = new FormData(event.currentTarget), message = byId('access-message'); const { error } = await client.from('demo_access').upsert({ user_id:form.get('userId'), demo_key:form.get('demoKey') }); if (error) { message.textContent = error.message; return; } message.textContent = 'Erişim verildi.'; load(); };
    app.querySelectorAll('[data-revoke]').forEach(button => button.onclick = async () => { const { error } = await client.from('demo_access').delete().eq('demo_key', button.dataset.revoke).eq('user_id', button.dataset.user); if (!error) load(); });
  }
  const escapeHtml = value => String(value || '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  window.addEventListener('derin:authchange', load);
  load();
})();
