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

  const { data, error } = await c.from('plans')
    .select('id,name,min_branch,max_branch,per_branch,features,sort_order')
    .order('sort_order');
  if (error || !data?.length) {
    kutu.innerHTML = '<p style="opacity:.6;font-size:13px">Paket bilgisi yüklenemedi.</p>';
    return;
  }

  const fy = await c.rpc('plan_fiyatlari');
  const fiyatlar = (fy.data && fy.data.length) ? fy.data : null;

  const toggle = document.querySelector('.cf-toggle');
  if (!fiyatlar && toggle) toggle.style.display = 'none';

  const tl = n => Number(n).toLocaleString('tr-TR');
  const aralik = p => p.max_branch
    ? (p.min_branch === p.max_branch ? `${p.min_branch} şube` : `${p.min_branch}-${p.max_branch} şube`)
    : `${p.min_branch}+ şube`;

  let yillik = false;

  const ciz = () => {
    kutu.innerHTML = data.map(p => {
      const f = fiyatlar && fiyatlar.find(x => x.id === p.id);
      const fiyat = f ? (yillik ? (f.yearly_price || f.monthly_price * 12) : f.monthly_price) : 0;
      const birim = yillik
        ? (p.per_branch ? ' / şube / yıl' : ' / yıl')
        : (p.per_branch ? ' / şube / ay' : ' / ay');
      return `
      <article class="cf-plan${p.id === 'zincir' ? ' one' : ''}">
        ${p.id === 'zincir' ? '<span class="cf-rozet">EN ÇOK TERCİH EDİLEN</span>' : ''}
        <h3>${p.name}</h3>
        <p class="cf-branch">${aralik(p)}</p>
        ${f
          ? `<p class="cf-price"><b>${tl(fiyat)}</b> TL<span>${birim}</span></p>`
          : `<p class="cf-price"><b style="font-size:20px">Teklif alın</b></p>`}
        <ul>${(p.features || []).map(x => `<li>${x}</li>`).join('')}</ul>
        <button data-plan="${p.id}">7 GÜN ÜCRETSİZ DENE</button>
      </article>`;
    }).join('');

    kutu.querySelectorAll('[data-plan]').forEach(b => b.onclick = () => {
      const p = data.find(x => x.id === b.dataset.plan);
      const not = document.getElementById('cf-note');
      if (not) not.value = `${p.name} paketiyle ilgileniyorum${fiyatlar ? ` (${yillik ? 'yıllık' : 'aylık'} ödeme)` : ''}.` + (not.value ? '\n' + not.value : '');
      const sube = document.getElementById('cf-branch');
      if (sube && !sube.value) sube.value = p.min_branch;
      document.querySelector('.cf-form')?.scrollIntoView({ behavior:'smooth', block:'start' });
      document.getElementById('cf-company')?.focus();
    });
  };

  const ay = document.getElementById('cf-ay');
  const yil = document.getElementById('cf-yil');
  if (ay && yil) {
    ay.onclick = () => { yillik = false; ay.classList.add('on'); yil.classList.remove('on'); ciz(); };
    yil.onclick = () => { yillik = true; yil.classList.add('on'); ay.classList.remove('on'); ciz(); };
  }

  ciz();
})();
