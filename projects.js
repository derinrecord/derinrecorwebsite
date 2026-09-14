(() => {
  const labels = {draft_review:'Taslak inceleme',coach_approved:'Antrenör onayı',payment_pending:'Ödeme bekleniyor',payment_verified:'Ödeme doğrulandı',final_unlocked:'Final teslimine hazır',completed:'Teslim edildi'};
  const list = document.querySelector('#list'), status = document.querySelector('#s');
  let generation = 0, loading = false, saving = false;
  const coachOnly = document.body.dataset.view === 'coach';
  const node = (tag, text) => { const el = document.createElement(tag); el.textContent = text; return el; };
  async function refresh(clear = false) {
    if (clear) { generation++; list.replaceChildren(); loading = false; }
    if (loading || saving) return;
    const run = generation, {client,user,profile} = window.DerinAuth;
    const admin = profile?.role === 'admin' && !coachOnly;
    if (!user) { status.textContent = 'Projelerini görmek için giriş yap.'; return; }
    if (!coachOnly && !admin) { status.textContent = 'Bu alan yalnızca yöneticiye açıktır. Hesap menüsünden Projelerim ekranını açabilirsin.'; return; }
    loading = true;
    try {
      let query = client.from('music_projects').select('id,coach_id,title,status,created_at,updated_at').order('created_at',{ascending:false});
      if (!admin) query = query.eq('coach_id',user.id);
      const {data,error} = await query;
      if (error) throw error;
      let names = {};
      if (admin && data.length) {
        const result = await client.from('profiles').select('id,full_name').in('id',[...new Set(data.map(p=>p.coach_id))]);
        if (result.error) throw result.error;
        names = Object.fromEntries(result.data.map(p=>[p.id,p.full_name]));
      }
      if (run !== generation) return;
      const fragment = document.createDocumentFragment();
      for (const project of data) {
        const card = node('article',''); card.className = 'card';
        card.append(node('h2',project.title),node('p',admin ? (names[project.coach_id] || 'Antrenör') : 'Sana ait proje'));
        const stage = node('p',labels[project.status] || project.status); stage.className='status'; card.append(stage);
        card.append(node('p','Son güncelleme: '+new Date(project.updated_at || project.created_at).toLocaleString('tr-TR')));
        if (admin) {
          const select = document.createElement('select'); select.setAttribute('aria-label',project.title+' aşaması');
          for (const [value,label] of Object.entries(labels)) { const option=node('option',label); option.value=value; select.append(option); }
          select.value=project.status;
          select.onchange=async()=>{
            saving=true; select.disabled=true;
            try {
              const result=await client.from('music_projects').update({status:select.value,updated_at:new Date().toISOString()}).eq('id',project.id).eq('status',project.status).select('id,status').single();
              if(result.error) throw result.error;
              if(run===generation) status.textContent='Aşama kaydedildi. Antrenör ekranına en geç 10 saniyede yansır.';
            } catch(error) { if(run===generation){select.value=project.status;status.textContent='Aşama kaydedilemedi: '+error.message;} }
            finally { saving=false;select.disabled=false;refresh(); }
          };
          card.append(select);
        }
        fragment.append(card);
      }
      // Do not replace a control while the user is choosing a stage.
      if (!list.contains(document.activeElement)) list.replaceChildren(fragment);
      status.textContent=data.length ? `${data.length} proje · Aşamalar otomatik güncellenir.` : 'Henüz proje yok. Müzik araştırma talebinle projen oluşturulur.';
    } catch(error) { if(run===generation) status.textContent='Projeler alınamadı: '+error.message; }
    finally { if(run===generation) loading=false; }
  }
  window.addEventListener('derin:authchange',()=>refresh(true));
  window.addEventListener('focus',()=>refresh());
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
  document.querySelector('#refresh').onclick=()=>refresh();
  window.DerinAuth.ready.then(()=>refresh(true));
  setInterval(()=>{if(!document.hidden)refresh();},10000);
})();
