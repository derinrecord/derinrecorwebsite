(() => {
  const STAGES=[{k:'approved',l:'ONAYLANDI'},{k:'started',l:'BAŞLANDI'},{k:'production',l:'YAPIM SÜRECİNDE'},{k:'finishing',l:'BİTİM AŞAMASI'},{k:'delivered',l:'TESLİM EDİLDİ'}];
  const GROUPS=[{t:'BEKLEYEN PROJELER',has:s=>s==='pending'},{t:'YAPIM SÜRECİNDE',has:s=>['approved','started','production','finishing'].includes(s)},{t:'TAMAMLANAN',has:s=>s==='delivered'}];
  const list=document.querySelector('#list'), status=document.querySelector('#s');
  const safe=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const mmss=s=>isFinite(s)?Math.floor(s/60)+':'+String(Math.floor(s%60)).padStart(2,'0'):'0:00';

  let client=null,admin=false,me=null,projects=[],tracks={},feedback={},names={},busy=false;
  const peaks={}, sel={};

  async function boot(){
    await window.DerinAuth.ready;
    const a=window.DerinAuth; client=a.client;
    if(!a.configured){status.textContent='Bağlantı hazırlanıyor.';return;}
    if(!a.user){status.innerHTML='<button class="account-button" id="p-login">GİRİŞ YAP</button>';
      document.querySelector('#p-login').onclick=()=>a.open();return;}
    me=a.user.id; admin=a.profile?.role==='admin';
    const rb=document.querySelector('#refresh'); rb.hidden=false; rb.onclick=()=>load();
    client.channel('proj-'+me)
      .on('postgres_changes',{event:'*',schema:'public',table:'music_projects'},()=>load())
      .on('postgres_changes',{event:'*',schema:'public',table:'project_tracks'},()=>load())
      .on('postgres_changes',{event:'*',schema:'public',table:'project_feedback'},()=>load())
      .subscribe();
    await load();
  }

  async function load(){
    if(busy)return; busy=true;
    try{
      let q=client.from('music_projects').select('id,coach_id,title,song,branch,status,note,created_at,updated_at').order('created_at',{ascending:false});
      if(!admin)q=q.eq('coach_id',me);
      const {data,error}=await q; if(error)throw error;
      projects=data||[];
      const ids=projects.map(p=>p.id);
      tracks={};feedback={};names={};
      if(ids.length){
        const t=await client.from('project_tracks').select('*').in('project_id',ids).order('sort_order');
        if(!t.error)for(const x of t.data)(tracks[x.project_id]||=[]).push(x);
        const f=await client.from('project_feedback').select('*').in('project_id',ids).order('created_at');
        if(!f.error)for(const x of f.data)(feedback[x.project_id]||=[]).push(x);
      }
      if(admin&&projects.length){
        const r=await client.from('profiles').select('id,full_name').in('id',[...new Set(projects.map(p=>p.coach_id))]);
        if(!r.error)names=Object.fromEntries(r.data.map(p=>[p.id,p.full_name]));
      }
      render();
    }catch(e){status.textContent='Projeler alınamadı: '+e.message;}
    finally{busy=false;}
  }

  const bar=st=>{const at=STAGES.findIndex(s=>s.k===st);
    return `<div class="track">${STAGES.map((s,i)=>`<div class="track-step ${at<0?'':i<at?'done':i===at?'now':''}"><div class="track-dot"></div>${s.l}</div>`).join('')}</div>`;};

  function trackBlock(tr,i){
    const has=!!tr.audio_path;
    return `<div class="proj-player" data-tb="${tr.id}" style="flex-direction:column;align-items:stretch">
      <div style="display:flex;gap:14px;align-items:center;flex-wrap:wrap">
        <img class="cassette" src="assets/cassette-derin-record.jpg" alt="">
        <div style="flex:1 1 180px"><strong>${i+1}. ${safe(tr.label||'Parça')}</strong>
          <small style="display:block;opacity:.6">${has?('v'+tr.version+' · düzenlenmiş'):'ham kaynak'}</small>
          ${tr.source_url?`<a href="${safe(tr.source_url)}" target="_blank" rel="noreferrer" style="font-size:11px;opacity:.7">kaynağı aç ↗</a>`:''}</div>
        ${has?`<button class="proj-play" data-play="${tr.id}" data-path="${safe(tr.audio_path)}">▶ DİNLE</button>`:''}
      </div>
      ${has?`<div class="proj-wave" style="margin-top:12px;position:relative">
        <canvas data-wave="${tr.id}" style="height:72px;cursor:crosshair"></canvas>
        <div data-selinfo="${tr.id}" style="font-size:11px;opacity:.65;margin-top:6px">Dalga formunda sürükleyerek kesmek istediğin bölgeyi seç.</div>
        <div class="proj-actions" style="margin-top:8px">
          <input data-cut="${tr.id}" placeholder="Bu bölge için notun" style="flex:1 1 220px;padding:10px 13px;border-radius:13px;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.06);color:inherit;font:inherit">
          <button data-cutsend="${tr.id}">BÖLGEYİ BİLDİR</button>
        </div></div>`:''}
      ${admin?`<div class="proj-actions" style="margin-top:10px">
        <input type="file" accept="audio/*" data-newver="${tr.id}">
        <span style="font-size:11px;opacity:.6">yeni varyasyon yükle</span></div>`:''}
    </div>`;
  }

  function card(p){
    const trs=tracks[p.id]||[], fbs=feedback[p.id]||[];
    return `<article class="proj-card">
      <h3>${safe(p.title||'Proje')}</h3>
      <p class="meta">${safe(admin?(names[p.coach_id]||'Antrenör'):'Sana ait proje')}${p.branch?' · '+safe(p.branch):''} · ${new Date(p.updated_at||p.created_at).toLocaleString('tr-TR')}</p>
      ${p.status==='pending'?'<p class="meta">Onay bekliyor.</p>':bar(p.status)}
      ${trs.map(trackBlock).join('')||'<p class="meta">Parça yok.</p>'}
      ${admin?`<div class="proj-actions">
        <select data-stage="${p.id}">
          <option value="pending"${p.status==='pending'?' selected':''}>Bekliyor</option>
          ${STAGES.map(s=>`<option value="${s.k}"${p.status===s.k?' selected':''}>${s.l}</option>`).join('')}
        </select>
        <button data-del="${p.id}">SİL</button></div>`:''}
      <div class="fb-box"><ul class="fb-list">${fbs.length?fbs.map(f=>{
        const t=trs.find(x=>x.id===f.track_id);
        const rng=(f.start_sec!=null)?` [${mmss(f.start_sec)}–${mmss(f.end_sec)}${t?' · '+safe(t.label):''}]`:'';
        return `<li>${safe(f.body)}${rng}<small>${f.author_id===p.coach_id?'Antrenör':'Derin Record'} · ${new Date(f.created_at).toLocaleString('tr-TR')}</small></li>`;
      }).join(''):'<li style="opacity:.45">Henüz geri bildirim yok.</li>'}</ul>
      <textarea data-fb="${p.id}" placeholder="Geri bildirim yaz…"></textarea>
      <div class="proj-actions"><button data-fbsend="${p.id}">GÖNDER</button></div></div>
    </article>`;
  }

  function render(){
    list.innerHTML=GROUPS.map(g=>{const it=projects.filter(p=>g.has(p.status));
      return `<section class="proj-group"><h2>${g.t} (${it.length})</h2>${it.length?it.map(card).join(''):'<p class="proj-empty">Bu grupta proje yok.</p>'}</section>`;}).join('');
    status.textContent=projects.length?`${projects.length} proje · anlık güncellenir.`:'Henüz proje yok.';
    wire();
    for(const id of Object.keys(peaks)) drawWave(id);
    list.querySelectorAll('[data-wave]').forEach(c=>{ if(!peaks[c.dataset.wave]) loadPeaks(c.dataset.wave); });
  }

  async function signed(path){const r=await client.storage.from('project-audio').createSignedUrl(path,3600);return r.data?.signedUrl;}

  async function loadPeaks(id){
    const btn=list.querySelector(`[data-play="${id}"]`); if(!btn)return;
    const url=await signed(btn.dataset.path); if(!url)return;
    try{
      const buf=await (await fetch(url)).arrayBuffer();
      const ac=new (window.AudioContext||window.webkitAudioContext)();
      const ab=await ac.decodeAudioData(buf);
      const ch=ab.getChannelData(0), N=260, step=Math.floor(ch.length/N), out=[];
      for(let i=0;i<N;i++){let m=0;for(let j=0;j<step;j+=16){const v=Math.abs(ch[i*step+j]||0);if(v>m)m=v;}out.push(m);}
      peaks[id]={data:out,dur:ab.duration}; ac.close(); drawWave(id);
    }catch{}
  }

  function drawWave(id,progress){
    const c=list.querySelector(`[data-wave="${id}"]`); const p=peaks[id]; if(!c||!p)return;
    c.width=c.offsetWidth*2; c.height=144;
    const ctx=c.getContext('2d'), w=c.width/p.data.length;
    const s=sel[id];
    ctx.clearRect(0,0,c.width,c.height);
    if(s){const x1=(s.a/p.dur)*c.width,x2=(s.b/p.dur)*c.width;
      ctx.fillStyle='rgba(224,195,65,.16)';ctx.fillRect(Math.min(x1,x2),0,Math.abs(x2-x1),c.height);}
    p.data.forEach((v,i)=>{
      const h=Math.max(3,v*c.height*0.92), y=(c.height-h)/2;
      const played=progress!=null&&(i/p.data.length)<=progress;
      ctx.fillStyle=played?'rgba(224,195,65,.95)':'rgba(255,255,255,.34)';
      ctx.fillRect(i*w,y,w-2,h);
    });
  }

  let cur=null;
  function wire(){
    list.querySelectorAll('[data-stage]').forEach(s=>s.onchange=async()=>{
      s.disabled=true;
      const {error}=await client.from('music_projects').update({status:s.value,updated_at:new Date().toISOString()}).eq('id',s.dataset.stage);
      status.textContent=error?'Kaydedilemedi: '+error.message:'Aşama güncellendi.';
      s.disabled=false;load();
    });

    list.querySelectorAll('[data-del]').forEach(b=>b.onclick=async()=>{
      if(!confirm('Proje silinecek. Emin misiniz?'))return;
      await client.from('music_projects').delete().eq('id',b.dataset.del);load();
    });

    list.querySelectorAll('[data-newver]').forEach(inp=>inp.onchange=async()=>{
      const file=inp.files?.[0]; if(!file)return;
      const tid=inp.dataset.newver;
      const tr=Object.values(tracks).flat().find(t=>t.id===tid);
      const proj=projects.find(p=>p.id===tr.project_id);
      status.textContent='Varyasyon yükleniyor…';
      const path=`${proj.coach_id}/${tid}-${Date.now()}.${file.name.split('.').pop()||'mp3'}`;
      const up=await client.storage.from('project-audio').upload(path,file,{contentType:file.type||'audio/mpeg'});
      if(up.error){status.textContent='Yükleme hatası: '+up.error.message;return;}
      await client.from('project_tracks').update({audio_path:path,version:(tr.version||1)+1}).eq('id',tid);
      await client.from('project_feedback').insert({project_id:proj.id,author_id:me,kind:'system',
        body:`Parçanız düzenlenmiş haliyle gönderildi (v${(tr.version||1)+1} · ${tr.label||'parça'}). Lütfen inceleyiniz.`});
      delete peaks[tid];
      status.textContent='Varyasyon gönderildi, antrenöre bildirildi.';
      load();
    });

    list.querySelectorAll('[data-fbsend]').forEach(b=>b.onclick=async()=>{
      const box=list.querySelector(`[data-fb="${b.dataset.fbsend}"]`);
      const body=box.value.trim(); if(!body)return;
      b.disabled=true;
      const {error}=await client.from('project_feedback').insert({project_id:b.dataset.fbsend,author_id:me,body,kind:'note'});
      status.textContent=error?'Gönderilemedi: '+error.message:'Geri bildirim gönderildi.';
      box.value='';b.disabled=false;load();
    });

    list.querySelectorAll('[data-cutsend]').forEach(b=>b.onclick=async()=>{
      const id=b.dataset.cutsend, s=sel[id];
      if(!s){status.textContent='Önce dalga formunda bölge seç.';return;}
      const inp=list.querySelector(`[data-cut="${id}"]`);
      const tr=Object.values(tracks).flat().find(t=>t.id===id);
      const {error}=await client.from('project_feedback').insert({
        project_id:tr.project_id,author_id:me,track_id:id,kind:'cut',
        start_sec:Math.min(s.a,s.b),end_sec:Math.max(s.a,s.b),
        body:inp.value.trim()||'Bu bölgenin kesilmesini istiyorum.'});
      status.textContent=error?'Gönderilemedi: '+error.message:'Bölge bildirimi gönderildi.';
      inp.value='';delete sel[id];load();
    });

    list.querySelectorAll('[data-wave]').forEach(c=>{
      const id=c.dataset.wave; let dragging=false,startX=0;
      const pos=e=>{const r=c.getBoundingClientRect();return ((e.clientX-r.left)/r.width)*(peaks[id]?.dur||0);};
      c.onmousedown=e=>{if(!peaks[id])return;dragging=true;startX=pos(e);sel[id]={a:startX,b:startX};};
      c.onmousemove=e=>{if(!dragging)return;sel[id].b=pos(e);drawWave(id);
        const info=list.querySelector(`[data-selinfo="${id}"]`);
        if(info)info.textContent=`Seçili bölge: ${mmss(Math.min(sel[id].a,sel[id].b))} – ${mmss(Math.max(sel[id].a,sel[id].b))}`;};
      c.onmouseup=()=>{dragging=false;};
      c.onmouseleave=()=>{dragging=false;};
    });

    list.querySelectorAll('[data-play]').forEach(b=>b.onclick=async()=>{
      const id=b.dataset.play;
      if(cur&&cur.id===id){ if(cur.audio.paused){cur.audio.play();b.textContent='⏸ DURDUR';}else{cur.audio.pause();b.textContent='▶ DİNLE';} return; }
      if(cur){cur.audio.pause();cur.btn.textContent='▶ DİNLE';}
      const url=await signed(b.dataset.path); if(!url){status.textContent='Ses açılamadı.';return;}
      const audio=new Audio(url);
      audio.ontimeupdate=()=>{ if(audio.duration) drawWave(id,audio.currentTime/audio.duration); };
      audio.onended=()=>{b.textContent='▶ DİNLE';drawWave(id);cur=null;};
      await audio.play(); b.textContent='⏸ DURDUR'; cur={id,audio,btn:b};
    });
  }

  window.addEventListener('derin:authchange',()=>load());
  boot();
})();
