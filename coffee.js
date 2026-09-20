(() => {
  const byId = id => document.getElementById(id);
  const client = window.supabase.createClient(
    window.DERIN_CONFIG.supabaseUrl, window.DERIN_CONFIG.supabasePublishableKey);

  byId('cf-send').onclick = async () => {
    const msg = byId('cf-msg');
    const company = byId('cf-company').value.trim();
    const name = byId('cf-name').value.trim();
    const email = byId('cf-email').value.trim();
    if (!company || !name || !email) { msg.style.color = '#ffb3b3'; msg.textContent = 'Şirket, yetkili ve e-posta alanları gerekli.'; return; }

    byId('cf-send').disabled = true;
    msg.style.color = '#6ee7b0';
    msg.textContent = 'Gönderiliyor…';

    const { error } = await client.from('coffee_requests').insert({
      company, contact_name: name, email,
      phone: byId('cf-phone').value.trim() || null,
      branch_count: byId('cf-branch').value ? Number(byId('cf-branch').value) : null,
      message: byId('cf-note').value.trim() || null
    });

    if (error) { msg.style.color = '#ffb3b3'; msg.textContent = 'Gönderilemedi: ' + error.message; byId('cf-send').disabled = false; return; }
    msg.textContent = 'Talebiniz alındı. En kısa sürede size dönüş yapacağız.';
    ['cf-company','cf-name','cf-email','cf-phone','cf-branch','cf-note'].forEach(i => byId(i).value = '');
    byId('cf-send').disabled = false;
  };
})();
(async () => {
  const kutu = document.getElementById('cf-plan-grid');
  if (!kutu) return;
  const c = window.supabase.createClient(
    window.DERIN_CONFIG.supabaseUrl, window.DERIN_CONFIG.supabasePublishableKey);

  const { data, error } = await c.from('plans').select('*').order('sort_order');
  if (error || !data?.length) { kutu.innerHTML = '<p style="opacity:.6;font-size:13px">Paket bilgisi yüklenemedi.</p>'; return; }

  const tl = n => Number(n).toLocaleString('tr-TR');
  const aralik = p => p.max_branch ? (p.min_branch === p.max_branch ? `${p.min_branch} şube` : `${p.min_branch}-${p.max_branch} şube`) : `${p.min_branch}+ şube`;

  
})();
