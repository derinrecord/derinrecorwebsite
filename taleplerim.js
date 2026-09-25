(() => {
  const typeLabels = {
    sound_design: 'Ses Tasarımı',
    film_scoring: 'Film Scoring',
    both: 'Ses Tasarımı & Film Scoring'
  };
  const escapeHtml = value => String(value || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const formatDate = iso => {
    try {
      return new Date(iso).toLocaleString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch (e) { return iso; }
  };
  const byId = id => document.getElementById(id);

  async function load() {
    await window.DerinAuth.ready;
    const { configured, user, profile, client } = window.DerinAuth;
    const status = byId('talep-status'), app = byId('talep-app');

    if (!configured) { status.textContent = 'Önce Supabase bağlantısını config.js dosyasına ekleyin.'; return; }
    if (!user) {
      status.innerHTML = 'Bu alan yalnızca yöneticilere açıktır. <button class="account-button" id="talep-login">GİRİŞ YAP</button>';
      byId('talep-login').onclick = () => window.DerinAuth.open();
      return;
    }
    if (profile?.role !== 'admin') { status.textContent = 'Bu alan için yönetici yetkiniz yok.'; return; }

    status.textContent = `Yönetici: ${profile.full_name || user.email}`;
    app.hidden = false;
    app.innerHTML = '<p class="talep-empty">Talepler yükleniyor…</p>';

    const { data, error } = await client
      .from('sound_design_requests')
      .select('id,contact_name,email,phone,project_type,message,status,created_at')
      .order('created_at', { ascending: false });

    if (error) {
      app.innerHTML = `<p class="talep-empty">Talepler yüklenirken bir hata oluştu: ${escapeHtml(error.message)}</p>`;
      return;
    }

    if (!data || data.length === 0) {
      app.innerHTML = '<p class="talep-empty">Henüz hiç proje talebi yok.</p>';
      return;
    }

    app.innerHTML = `<div class="talep-list">${data.map(row => `
      <article class="talep-card">
        <div class="talep-top">
          <span class="talep-name">${escapeHtml(row.contact_name)}</span>
          <span class="talep-type">${escapeHtml(typeLabels[row.project_type] || row.project_type)}</span>
        </div>
        <div class="talep-meta">
          <span class="talep-date">${formatDate(row.created_at)}</span>
          ${row.email ? `<a href="mailto:${escapeHtml(row.email)}">${escapeHtml(row.email)}</a>` : ''}
          ${row.phone ? `<a href="tel:${escapeHtml(row.phone)}">${escapeHtml(row.phone)}</a>` : ''}
        </div>
        ${row.message ? `<p class="talep-message">${escapeHtml(row.message)}</p>` : ''}
      </article>
    `).join('')}</div>`;
  }

  load();
})();
