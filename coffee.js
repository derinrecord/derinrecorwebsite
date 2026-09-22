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

   const { data, error } = await c.from('plans').select('id,name,min_branch,max_branch,per_branch,features,sort_order').order('sort_order');
  const fy = await c.rpc('plan_fiyatlari');
  const fiyatlar = (fy.data && fy.data.length) ? fy.data : null;
  if (!fiyatlar) { const t = document.querySelector('.cf-toggle'); if (t) t.style.display = 'none'; }

  const ciz = () => {
    kutu.innerHTML = data.map(p => {
           const f = fiyatlar && fiyatlar.find(x => x.id === p.id);
      const fiyat = f ? (yillik ? (f.yearly_price || f.monthly_price * 12) : f.monthly_price) : 0;
      <article class="cf-plan${p.id === 'zincir' ? ' one' : ''}">
        ${p.id === 'zincir' ? '<span class="cf-rozet">EN ÇOK TERCİH EDİLEN</span>' : ''}
        <h3>${p.name}</h3>
        <p class="cf-branch">${aralik(p)}</p>
         ${fiyatlar ? `<p class="cf-price">TL<span>${birim}</span></p>` : `<p class="cf-price"><b style="font-size:20px">Teklif alın</b></p>`}
        <ul>${(p.features || []).map(f => `<li>${f}</li>`).join('')}</ul>
        <button data-plan="${p.id}">7 GÜN ÜCRETSİZ DENE</button>
      </article>`;
    }).join('');

    kutu.querySelectorAll('[data-plan]').forEach(b => b.onclick = () => {
      const p = data.find(x => x.id === b.dataset.plan);
      const not = document.getElementById('cf-note');
      if (not) not.value = `${p.name} paketiyle ilgileniyorum (${yillik ? 'yıllık' : 'aylık'} ödeme).` + (not.value ? '\n' + not.value : '');
      const sube = document.getElementById('cf-branch');
      if (sube && !sube.value) sube.value = p.min_branch;
      document.querySelector('.cf-form')?.scrollIntoView({ behavior:'smooth', block:'start' });
      document.getElementById('cf-company')?.focus();
    });
  };

  document.getElementById('cf-ay').onclick = () => {
    yillik = false;
    document.getElementById('cf-ay').classList.add('on');
    document.getElementById('cf-yil').classList.remove('on');
    ciz();
  };
  document.getElementById('cf-yil').onclick = () => {
    yillik = true;
    document.getElementById('cf-yil').classList.add('on');
    document.getElementById('cf-ay').classList.remove('on');
    ciz();
  };

  ciz();
})();
  

