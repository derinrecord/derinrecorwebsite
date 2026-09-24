(() => {
  const STAGES=[{k:'approved',l:'ONAYLANDI'},{k:'started',l:'BAŞLANDI'},{k:'production',l:'YAPIM SÜRECİNDE'},{k:'finishing',l:'BİTİM AŞAMASI'},{k:'delivered',l:'TESLİM EDİLDİ'}];
  const GROUPS=[{t:'BEKLEYEN PROJELER',has:s=>s==='pending'},{t:'YAPIM SÜRECİNDE',has:s=>['approved','started','production','finishing'].includes(s)},{t:'TAMAMLANAN',has:s=>s==='delivered'}];
  const list=document.querySelector('#list'), status=document.querySelector('#s');
  const safe=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const mmss=s=>(!s||!isFinite(s))?'0:00':Math.floor(s/60)+':'+String(Math.floor(s%60)).padStart(2,'0');

  let client=null,admin=false,me=null,projects=[],tracks={},feedback={},names={},busy=false;
  let openTrackId=null;
  let detail={};
  let newFolderOpen=false, newFolderBusy=false;
  let localSeq=0;
  const newLocalId=()=>'local-'+(++localSeq);

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
      let q=client.from('music_projects').select('id,coach_id,title,song,branch,status,note,download_allowed,created_at,updated_at').order('created_at',{ascending:false});
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
      if(openTrackId){
        let found=null,foundProject=null;
        for(const p of projects){const tr=(tracks[p.id]||[]).find(t=>t.id===openTrackId);if(tr){found=tr;foundProject=p;break;}}
        if(found)syncSavedPoints(found,foundProject);
        else openTrackId=null;
      }
      render();
    }catch(e){status.textContent='Projeler alınamadı: '+e.message;}
    finally{busy=false;}
  }

  const bar=st=>{const at=STAGES.findIndex(s=>s.k===st);
    return `<div class="track-box"><div class="track">${STAGES.map((s,i)=>`<div class="track-step ${at<0?'':i<at?'done':i===at?'now':''}"><div class="track-dot"></div>${s.l}</div>`).join('')}</div></div>`;};

  function trackBlock(tr,i,p){
    const has=!!tr.audio_path;
    const renkler=['aerobik','acrobatik','artistik','ritmik','trambolin'];
    const renk=renkler[i%renkler.length];
    return `<div class="proj-cassette-card ${renk}" data-tb="${tr.id}" data-tdopen="${tr.id}" style="cursor:pointer">
      <span class="card-number">${String(i+1).padStart(2,'0')}</span>
      <img class="demo-cassette-image" src="assets/demo-cassette-derin-record.png" alt="Derin Record kaseti">
      <div class="card-meta">
        <strong>${safe(tr.label||'Parça')}</strong>
        <span>${has?('v'+tr.version+' · düzenlenmiş'):'ham kaynak'} →</span>
      </div>
    </div>`;
  }

  function card(p){
    const trs=tracks[p.id]||[], fbs=(feedback[p.id]||[]).filter(f=>f.start_sec==null);
    return `<article class="proj-card">
      <h3>${safe(p.title||'Proje')}</h3>
      <p class="meta">${safe(admin?(names[p.coach_id]||'Antrenör'):'Sana ait proje')}${p.branch?' · '+safe(p.branch):''} · ${new Date(p.updated_at||p.created_at).toLocaleString('tr-TR')}</p>
      ${p.status==='pending'?'<p class="meta">Onay bekliyor.</p>':bar(p.status)}
      <div class="proj-tracks-grid">${trs.length ? trs.map((tr,i)=>trackBlock(tr,i,p)).join('') : `<div class="proj-cassette-card proj-empty-track"><span class="card-number">—</span><img class="demo-cassette-image" src="assets/demo-cassette-derin-record.png" alt="Derin Record kaseti"><p class="meta">Henüz parça eklenmedi.</p></div>`}</div>
      ${admin?`<div class="proj-actions">
        <label class="proj-add-track">YENİ PARÇA EKLE <input type="file" accept="audio/*" data-addtrack="${p.id}" hidden></label>
        <select data-stage="${p.id}">
          <option value="pending"${p.status==='pending'?' selected':''}>Bekliyor</option>
          ${STAGES.map(s=>`<option value="${s.k}"${p.status===s.k?' selected':''}>${s.l}</option>`).join('')}
        </select>
                <button data-dlallow="${p.id}" data-on="${p.download_allowed?1:0}" style="${p.download_allowed?'border-color:rgba(24,195,125,.5);background:rgba(24,195,125,.14);color:#6ee7b0':''}">${p.download_allowed?'İNDİRME AÇIK':'İNDİRMEYE İZİN VER'}</button>
        <button data-del="${p.id}">SİL</button></div>`:''}
      <div class="fb-box"><ul class="fb-list">${fbs.length?fbs.map(f=>{
        const t=trs.find(x=>x.id===f.track_id);
        return `<li>${safe(f.body)}${t?` [${safe(t.label)}]`:''}<small>${f.author_id===p.coach_id?'Antrenör':'Derin Record'} · ${new Date(f.created_at).toLocaleString('tr-TR')}</small></li>`;
      }).join(''):'<li style="opacity:.45">Henüz geri bildirim yok.</li>'}</ul>
      <textarea data-fb="${p.id}" placeholder="Geri bildirim yaz…"></textarea>
      <div class="proj-actions"><button data-fbsend="${p.id}">GÖNDER</button></div></div>
    </article>`;
  }

  function render(){
    if(openTrackId){
      let found=null,foundProject=null;
      for(const p of projects){const tr=(tracks[p.id]||[]).find(t=>t.id===openTrackId);if(tr){found=tr;foundProject=p;break;}}
      if(found){ list.innerHTML=trackDetailView(found,foundProject); wireDetail(found,foundProject); return; }
      openTrackId=null;
    }
    const groupsHtml=GROUPS.map(g=>{const it=projects.filter(p=>g.has(p.status));
      return `<section class="proj-group"><h2>${g.t} (${it.length})</h2>${it.length?it.map(card).join(''):'<p class="proj-empty">Bu grupta proje yok.</p>'}</section>`;}).join('');
    list.innerHTML=`<button type="button" class="proj-fab" id="proj-fab-btn" aria-label="Yeni proje klasörü aç" title="Yeni proje klasörü aç">${newFolderOpen?'×':'+'}</button>
      ${newFolderOpen?newFolderPanel():''}
      ${groupsHtml}`;
    status.textContent=projects.length?`${projects.length} proje · anlık güncellenir.`:'Henüz proje yok.';
    wire();
  }

  function newFolderPanel(){
    return `<div class="proj-newfolder-overlay" id="proj-newfolder-overlay">
      <div class="proj-newfolder-panel">
        <h3>Yeni proje klasörü</h3>
        <p>Klasöre bir isim ver, istersen ilk ses dosyasını da hemen ekle.</p>
        <input type="text" id="proj-newfolder-name" placeholder="Proje adı (ör. Unleashed v2)" autocomplete="off">
        <input type="file" id="proj-newfolder-file" accept="audio/*">
        <div class="proj-newfolder-actions">
          <button type="button" class="proj-newfolder-cancel" id="proj-newfolder-cancel">VAZGEÇ</button>
          <button type="button" class="proj-newfolder-confirm" id="proj-newfolder-confirm" aria-label="Klasörü oluştur" title="Klasörü oluştur" ${newFolderBusy?'disabled':''}>${newFolderBusy?'…':'✓'}</button>
        </div>
      </div>
    </div>`;
  }

  async function signed(path){const r=await client.storage.from('project-audio').createSignedUrl(path,3600);return r.data?.signedUrl;}

  // ---------- Parça detayı (dalga formu / nokta işaretleme) ----------

  function syncSavedPoints(tr,project){
    const fbs=(feedback[project.id]||[]).filter(f=>f.track_id===tr.id && f.start_sec!=null);
    const draftLocal=(detail.points||[]).filter(p=>!p.saved);
    const savedNow=fbs.map(f=>{
      const existing=(detail.points||[]).find(p=>p.dbId===f.id);
      return {localId:existing?existing.localId:'db-'+f.id,dbId:f.id,time:Number(f.start_sec),body:f.body||'',voicePath:f.voice_path||null,voiceUrl:existing?existing.voiceUrl:null,saved:true};
    });
    detail.points=[...savedNow,...draftLocal];
  }

  async function computePeaks(url,buckets=220){
    const resp=await fetch(url);
    const buf=await resp.arrayBuffer();
    const Ctx=window.AudioContext||window.webkitAudioContext;
    const ctx=new Ctx();
    const audioBuf=await ctx.decodeAudioData(buf);
    const data=audioBuf.getChannelData(0);
    const blockSize=Math.max(1,Math.floor(data.length/buckets));
    const peaks=new Float32Array(buckets);
    for(let i=0;i<buckets;i++){
      let max=0; const start=i*blockSize; const end=Math.min(data.length,start+blockSize);
      for(let j=start;j<end;j++){const v=Math.abs(data[j]);if(v>max)max=v;}
      peaks[i]=max;
    }
    const duration=audioBuf.duration;
    try{ctx.close();}catch{}
    return {peaks,duration};
  }

  function drawWave(canvas,peaks,playheadFrac){
    if(!canvas||!peaks)return;
    const dpr=window.devicePixelRatio||1;
    const w=canvas.clientWidth||1, h=canvas.clientHeight||1;
    canvas.width=w*dpr; canvas.height=h*dpr;
    const ctx=canvas.getContext('2d');
    ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.clearRect(0,0,w,h);
    const n=peaks.length, barW=w/n, mid=h/2;
    const playedUpTo=Math.floor((playheadFrac||0)*n);
    for(let i=0;i<n;i++){
      const amp=Math.max(peaks[i],0.035);
      const barH=Math.max(2,amp*h*0.92);
      ctx.fillStyle=i<=playedUpTo?'#d4c24e':'#fe4b6a';
      ctx.fillRect(i*barW,mid-barH/2,Math.max(barW-1.4,1),barH);
    }
  }

  function pointRow(p,idx){
    return `<div class="td-point ${p.saved?'saved':'draft'}" data-tdpoint="${p.localId}">
      <div class="td-point-head">
        <span class="td-point-badge">${p.saved?'✓':idx+1}</span>
        <span class="td-point-time">${mmss(p.time)}</span>
        ${!p.saved?`<button type="button" class="td-point-del" data-tdpointdel="${p.localId}">Sil</button>`:''}
      </div>
      <textarea class="td-point-note" placeholder="Bu nokta için yazılı not…" data-tdpointnote="${p.localId}" ${p.saved?'disabled':''}>${safe(p.body||'')}</textarea>
      <div class="td-point-voice">
        ${p.voiceUrl?`<audio controls src="${p.voiceUrl}"></audio>`:''}
        ${!p.saved && p.voiceBlobUrl?`<audio controls src="${p.voiceBlobUrl}"></audio><button type="button" class="td-point-voicedel" data-tdvoicedel="${p.localId}">Sesli notu kaldır</button>`:''}
        ${!p.saved && !p.voiceBlobUrl?`<button type="button" class="td-point-rec ${p.recording?'is-rec':''}" data-tdrec="${p.localId}">${p.recording?'⏹ Durdur':'🎙 Sesli not kaydet'}</button>`:''}
      </div>
      ${!p.saved?`<button type="button" class="td-point-save" data-tdpointsave="${p.localId}">KAYDET VE GÖNDER</button>`:''}
    </div>`;
  }

  function trackDetailView(tr,project){
    const has=!!tr.audio_path;
    const dur=detail.duration||0, cur=detail.curTime||0;
    const branchLabel=safe((project.branch||'proje').toUpperCase());
    const points=detail.points||[];
    const draftCount=points.filter(p=>!p.saved).length;
    const savedCount=points.filter(p=>p.saved).length;
    const waveState=!has?'':(detail.peaks?'DALGA FORMU HAZIR':'DALGA FORMU YÜKLENİYOR…');
    return `<div class="track-detail">
      <button type="button" class="td-back" data-tdback>← PROJELERİM</button>
      <div class="td-head">
        <img class="td-cassette" src="assets/demo-cassette-derin-record.png" alt="Derin Record kaseti">
        <div class="td-head-info">
          <p class="td-eyebrow">${branchLabel}</p>
          <h2 class="td-title">${safe(tr.label||'Parça')}</h2>
          <p class="td-sub">${has?('v'+tr.version+' sürüm'):'Ham kaynak'} · Kaseti oynat ve ritmi hisset.</p>
        </div>
        ${has?`<div class="td-player">
          <button type="button" class="td-play" data-tdplay>${detail.playing?'❚❚':'▶'}</button>
          <input type="range" class="td-seek" min="0" max="${dur||1}" step="0.01" value="${cur}" data-tdseek>
          <span class="td-time">${mmss(cur)} / ${mmss(dur)}</span>
        </div>`:''}
      </div>

      <div class="td-tools">
        ${tr.source_url?`<a class="td-tool-link" href="${safe(tr.source_url)}" target="_blank" rel="noreferrer">KAYNAĞI AÇ ↗</a>`:''}
        ${(!admin && project.download_allowed && has) ? `<button type="button" class="td-tool-btn" data-dl="${tr.id}" data-path="${safe(tr.audio_path)}" data-name="${safe(tr.label||'parca')}">⤓ İNDİR</button>` : ''}
        ${admin?`<label class="td-tool-upload">${has?'YENİ VARYASYON YÜKLE':'SES DOSYASI YÜKLE'}<input type="file" accept="audio/*" data-newver="${tr.id}" hidden></label>`:''}
        ${(admin && has)?`<button type="button" class="td-tool-del" data-trackdel="${tr.id}" data-path="${safe(tr.audio_path)}">PARÇAYI SİL</button>`:''}
      </div>
      ${has?`<div class="td-quicknote">
        <input data-cut="${tr.id}" placeholder="Bu parça için genel notun (isteğe bağlı)">
        <button type="button" data-notesend="${tr.id}">NOT GÖNDER</button>
      </div>`:''}

      <hr class="td-divider">

      <div class="td-shape-head">
        <div>
          <p class="td-eyebrow">BİRLİKTE ŞEKİLLENDİRELİM</p>
          <h3 class="td-shape-title">Her değişikliğin bir işareti olsun.</h3>
        </div>
        ${waveState?`<span class="td-badge">${waveState}</span>`:''}
      </div>
      <p class="td-desc">Dalganın farklı yerlerine tıklayarak birden fazla nokta ekle. İşaretleri sonradan sürükleyerek yerini değiştirebilirsin. Her numara kendi yazılı ve sesli notunu tutar.</p>

      ${has?`
      <div class="td-wave-wrap" data-tdwave>
        <canvas class="td-wave-canvas"></canvas>
        <div class="td-marks">
          ${points.map((p,i)=>`<div class="td-mark ${p.saved?'saved':'draft'} ${p.localId===detail.selPointLocalId?'active':''}" style="left:${dur?(p.time/dur*100):0}%" data-tdmark="${p.localId}">
            <span class="td-mark-line"></span>
            <span class="td-mark-badge">${p.saved?'✓':i+1}</span>
          </div>`).join('')}
        </div>
      </div>

      <div class="td-legend">
        <span><span class="td-legend-dot draft"></span> Taslak nokta &nbsp;&nbsp; <span class="td-legend-dot saved"></span> Kaydedilmiş not</span>
        <span>${draftCount} taslak · ${savedCount} kayıtlı</span>
      </div>

      <div class="td-addrow">
        <label>Dinleme / yeni nokta zamanı <strong>${mmss(cur)}</strong></label>
        <input type="range" class="td-addseek" min="0" max="${dur||1}" step="0.01" value="${cur}" data-tdaddseek>
      </div>
      <div class="td-addbtn-row">
        <button type="button" class="td-addbtn" data-tdaddpoint>+ BU ANA NOKTA EKLE</button>
        <span class="td-addhint">Kaydırıcıyla zaman seçip de ekleyebilirsin.</span>
      </div>

      <div class="td-points-list">
        ${points.length?points.map((p,i)=>pointRow(p,i)).join(''):'<p class="td-empty">Henüz nokta eklenmedi.</p>'}
      </div>
      `:`<p class="td-empty">Bu parça için henüz ses dosyası yok.</p>`}
    </div>`;
  }

  function renderDetail(tr,project){
    list.innerHTML=trackDetailView(tr,project);
    wireDetail(tr,project);
  }

  function updateDetailProgress(){
    const root=document.querySelector('.track-detail');
    if(!root)return;
    const seek=root.querySelector('[data-tdseek]'); if(seek)seek.value=detail.curTime||0;
    const timeEl=root.querySelector('.td-time'); if(timeEl)timeEl.textContent=`${mmss(detail.curTime)} / ${mmss(detail.duration)}`;
    const canvas=root.querySelector('.td-wave-canvas');
    if(canvas&&detail.peaks)drawWave(canvas,detail.peaks,detail.duration?detail.curTime/detail.duration:0);
    const playBtn=root.querySelector('[data-tdplay]'); if(playBtn)playBtn.textContent=detail.playing?'❚❚':'▶';
  }

  async function openTrackDetail(tr,project){
    openTrackId=tr.id;
    detail={points:[],peaks:null,duration:0,curTime:0,selPointLocalId:null,playing:false,audioEl:null};
    syncSavedPoints(tr,project);
    render();
    for(const p of detail.points){
      if(p.voicePath){
        try{const r=await client.storage.from('project-voice-notes').createSignedUrl(p.voicePath,3600); p.voiceUrl=r.data?.signedUrl||null;}catch{}
      }
    }
    if(tr.audio_path){
      const url=await signed(tr.audio_path);
      if(url){
        const audio=new Audio(url);
        detail.audioEl=audio;
        audio.addEventListener('loadedmetadata',()=>{ if(!detail.duration)detail.duration=audio.duration; updateDetailProgress(); });
        audio.addEventListener('timeupdate',()=>{ detail.curTime=audio.currentTime; updateDetailProgress(); });
        audio.addEventListener('play',()=>{ detail.playing=true; updateDetailProgress(); });
        audio.addEventListener('pause',()=>{ detail.playing=false; updateDetailProgress(); });
        audio.addEventListener('ended',()=>{ detail.playing=false; updateDetailProgress(); });
        try{
          const {peaks,duration}=await computePeaks(url);
          detail.peaks=peaks; if(!detail.duration)detail.duration=duration;
        }catch(e){ /* peak analizi başarısız olsa da oynatma çalışsın */ }
        renderDetail(tr,project);
      }
    }
    renderDetail(tr,project);
  }

  function closeTrackDetail(){
    if(detail.audioEl){try{detail.audioEl.pause();}catch{}}
    openTrackId=null; detail={};
    render();
  }

  function wireDetail(tr,project){
    const root=document.querySelector('.track-detail');
    if(!root)return;
    root.querySelector('[data-tdback]').onclick=()=>closeTrackDetail();

    const audio=detail.audioEl;
    const playBtn=root.querySelector('[data-tdplay]');
    if(playBtn)playBtn.onclick=async()=>{ if(!audio)return; if(audio.paused)await audio.play(); else audio.pause(); };
    const seek=root.querySelector('[data-tdseek]');
    if(seek)seek.oninput=()=>{ if(audio)audio.currentTime=parseFloat(seek.value); detail.curTime=parseFloat(seek.value); updateDetailProgress(); };
    const addSeek=root.querySelector('[data-tdaddseek]');
    if(addSeek)addSeek.oninput=()=>{ detail.curTime=parseFloat(addSeek.value); if(audio)audio.currentTime=detail.curTime; renderDetail(tr,project); };

    const canvas=root.querySelector('.td-wave-canvas');
    const waveWrap=root.querySelector('[data-tdwave]');
    if(canvas&&detail.peaks){
      drawWave(canvas,detail.peaks,detail.duration?detail.curTime/detail.duration:0);
      canvas.onclick=(e)=>{
        const rect=canvas.getBoundingClientRect();
        const frac=Math.min(1,Math.max(0,(e.clientX-rect.left)/rect.width));
        const t=frac*detail.duration;
        if(detail.selPointLocalId){
          const p=(detail.points||[]).find(x=>x.localId===detail.selPointLocalId && !x.saved);
          if(p){ p.time=t; renderDetail(tr,project); return; }
        }
        detail.curTime=t; if(audio)audio.currentTime=t;
        renderDetail(tr,project);
      };
    }

    root.querySelectorAll('[data-tdmark]').forEach(el=>{
      el.addEventListener('click',(e)=>{ e.stopPropagation(); detail.selPointLocalId=el.dataset.tdmark; renderDetail(tr,project); });
      let dragging=false;
      el.addEventListener('pointerdown',(e)=>{
        const p=(detail.points||[]).find(x=>x.localId===el.dataset.tdmark);
        if(!p||p.saved)return;
        dragging=true; try{el.setPointerCapture(e.pointerId);}catch{}
      });
      el.addEventListener('pointermove',(e)=>{
        if(!dragging||!waveWrap||!detail.duration)return;
        const rect=waveWrap.getBoundingClientRect();
        const frac=Math.min(1,Math.max(0,(e.clientX-rect.left)/rect.width));
        const p=(detail.points||[]).find(x=>x.localId===el.dataset.tdmark);
        if(p&&!p.saved){
          p.time=frac*detail.duration; el.style.left=(frac*100)+'%';
          const timeEl=root.querySelector(`[data-tdpoint="${p.localId}"] .td-point-time`);
          if(timeEl)timeEl.textContent=mmss(p.time);
        }
      });
      el.addEventListener('pointerup',()=>{ if(dragging){dragging=false; renderDetail(tr,project);} });
    });

    const addBtn=root.querySelector('[data-tdaddpoint]');
    if(addBtn)addBtn.onclick=()=>{
      detail.points=detail.points||[];
      detail.points.push({localId:newLocalId(),time:detail.curTime||0,body:'',voicePath:null,voiceUrl:null,voiceBlob:null,voiceBlobUrl:null,saved:false,recording:false});
      renderDetail(tr,project);
    };

    root.querySelectorAll('[data-tdpointdel]').forEach(b=>b.onclick=()=>{
      detail.points=(detail.points||[]).filter(p=>p.localId!==b.dataset.tdpointdel);
      renderDetail(tr,project);
    });

    root.querySelectorAll('[data-tdpointnote]').forEach(ta=>ta.onchange=()=>{
      const p=(detail.points||[]).find(x=>x.localId===ta.dataset.tdpointnote);
      if(p)p.body=ta.value;
    });

    root.querySelectorAll('[data-tdrec]').forEach(b=>b.onclick=async()=>{
      const p=(detail.points||[]).find(x=>x.localId===b.dataset.tdrec);
      if(!p)return;
      if(!p.recording){
        try{
          const stream=await navigator.mediaDevices.getUserMedia({audio:true});
          const rec=new MediaRecorder(stream);
          const chunks=[];
          rec.ondataavailable=e=>{ if(e.data&&e.data.size)chunks.push(e.data); };
          rec.onstop=()=>{
            const blob=new Blob(chunks,{type:'audio/webm'});
            p.voiceBlob=blob; p.voiceBlobUrl=URL.createObjectURL(blob);
            stream.getTracks().forEach(t=>t.stop());
            p.recording=false; p.mediaRecorder=null;
            renderDetail(tr,project);
          };
          rec.start(); p.mediaRecorder=rec; p.recording=true;
          renderDetail(tr,project);
        }catch(e){ status.textContent='Mikrofona erişilemedi: '+e.message; }
      }else{
        try{p.mediaRecorder&&p.mediaRecorder.stop();}catch{}
      }
    });

    root.querySelectorAll('[data-tdvoicedel]').forEach(b=>b.onclick=()=>{
      const p=(detail.points||[]).find(x=>x.localId===b.dataset.tdvoicedel);
      if(p){p.voiceBlob=null;p.voiceBlobUrl=null;}
      renderDetail(tr,project);
    });

    root.querySelectorAll('[data-tdpointsave]').forEach(b=>b.onclick=async()=>{
      const p=(detail.points||[]).find(x=>x.localId===b.dataset.tdpointsave);
      if(!p)return;
      b.disabled=true; b.textContent='GÖNDERİLİYOR…';
      try{
        let voice_path=null;
        if(p.voiceBlob){
          voice_path=`${me}/${tr.id}-${Date.now()}.webm`;
          const up=await client.storage.from('project-voice-notes').upload(voice_path,p.voiceBlob,{contentType:'audio/webm'});
          if(up.error)throw up.error;
        }
        const {error}=await client.from('project_feedback').insert({
          project_id:project.id,author_id:me,track_id:tr.id,
          start_sec:p.time,kind:'note',body:p.body||null,voice_path
        });
        if(error)throw error;
        status.textContent='Nokta gönderildi.';
        await load();
      }catch(e){
        status.textContent='Gönderilemedi: '+e.message;
        b.disabled=false; b.textContent='KAYDET VE GÖNDER';
      }
    });

    root.querySelectorAll('[data-dl]').forEach(b=>b.onclick=async()=>{
      const {data,error}=await client.storage.from('project-audio').createSignedUrl(b.dataset.path,600,{download:b.dataset.name+'.mp3'});
      if(error){status.textContent='İndirilemedi: '+error.message;return;}
      const a=document.createElement('a'); a.href=data.signedUrl; a.download=b.dataset.name; a.click();
    });

    root.querySelectorAll('[data-trackdel]').forEach(button=>button.onclick=async()=>{
      if(!confirm('Bu parça ve ses dosyası silinsin mi?'))return;
      button.disabled=true;
      try{
        const removed=await client.from('project_tracks').delete().eq('id',button.dataset.trackdel);
        if(removed.error)throw removed.error;
        await client.storage.from('project-audio').remove([button.dataset.path]);
        status.textContent='Parça silindi.';
        openTrackId=null; detail={};
        await load();
      }catch(error){status.textContent='Parça silinemedi: '+error.message;}
      finally{button.disabled=false;}
    });

    root.querySelectorAll('[data-newver]').forEach(inp=>inp.onchange=async()=>{
      const file=inp.files?.[0]; if(!file)return;
      const tid=inp.dataset.newver;
      status.textContent='Varyasyon yükleniyor…';
      inp.disabled=true;
      const path=`${project.coach_id}/${tid}-${Date.now()}.${file.name.split('.').pop()||'mp3'}`;
      try{
        const up=await client.storage.from('project-audio').upload(path,file,{contentType:file.type||'audio/mpeg'});
        if(up.error)throw up.error;
        const newVersion=(tr.version||1)+1;
        await client.from('project_tracks').update({audio_path:path,version:newVersion}).eq('id',tid);
        await client.from('project_feedback').insert({project_id:project.id,author_id:me,kind:'system',
          body:`Parçanız düzenlenmiş haliyle gönderildi (v${newVersion} · ${tr.label||'parça'}). Lütfen inceleyiniz.`});
        status.textContent='Varyasyon gönderildi, antrenöre bildirildi.';
        await load();
        const freshTr=(tracks[project.id]||[]).find(t=>t.id===tid);
        const freshProject=projects.find(p=>p.id===project.id);
        if(freshTr&&freshProject)openTrackDetail(freshTr,freshProject);
      }catch(e){
        status.textContent='Yükleme hatası: '+e.message;
        inp.disabled=false;
      }
    });

    root.querySelectorAll('[data-notesend]').forEach(b=>b.onclick=async()=>{
      const inp=root.querySelector(`[data-cut="${tr.id}"]`);
      const body=(inp?.value||'').trim();
      b.disabled=true;
      const {error}=await client.from('project_feedback').insert({
        project_id:project.id,author_id:me,track_id:tr.id,kind:'note',
        body:body||'Bu parça hakkında not.'
      });
      status.textContent=error?('Gönderilemedi: '+error.message):'Not gönderildi.';
      if(!error && inp)inp.value='';
      b.disabled=false;
    });
  }

  // ---------- Liste görünümü kablolama ----------

  function wire(){
    const fabBtn=list.querySelector('#proj-fab-btn');
    if(fabBtn)fabBtn.onclick=()=>{ newFolderOpen=!newFolderOpen; render(); };

    const nfOverlay=list.querySelector('#proj-newfolder-overlay');
    if(nfOverlay){
      nfOverlay.onclick=(e)=>{ if(e.target===nfOverlay){ newFolderOpen=false; render(); } };
      const nfCancel=list.querySelector('#proj-newfolder-cancel');
      if(nfCancel)nfCancel.onclick=()=>{ newFolderOpen=false; render(); };
      const nfConfirm=list.querySelector('#proj-newfolder-confirm');
      if(nfConfirm)nfConfirm.onclick=async()=>{
        if(newFolderBusy)return;
        const nameInp=list.querySelector('#proj-newfolder-name');
        const fileInp=list.querySelector('#proj-newfolder-file');
        const title=(nameInp?.value||'').trim();
        if(!title){ status.textContent='Klasöre önce bir isim ver.'; nameInp?.focus(); return; }
        newFolderBusy=true; render();
        try{
          const {data:proj,error:projErr}=await client.from('music_projects')
            .insert({coach_id:me,title,status:'pending'}).select().single();
          if(projErr)throw projErr;
          const file=fileInp?.files?.[0];
          if(file){
            const ext=file.name.split('.').pop()||'mp3';
            const path=`${me}/${proj.id}-${Date.now()}.${ext}`;
            const up=await client.storage.from('project-audio').upload(path,file,{contentType:file.type||'audio/mpeg'});
            if(up.error)throw up.error;
            const trackResult=await client.from('project_tracks').insert({project_id:proj.id,label:title,audio_path:path,version:1,sort_order:0});
            if(trackResult.error)throw trackResult.error;
          }
          status.textContent='Yeni klasör oluşturuldu.';
          newFolderOpen=false;
          await load();
        }catch(e){
          status.textContent='Klasör oluşturulamadı: '+e.message;
        }finally{
          newFolderBusy=false; render();
        }
      };
    }

    list.querySelectorAll('[data-tdopen]').forEach(el=>el.onclick=()=>{
      const trackId=el.dataset.tdopen;
      let tr=null,project=null;
      for(const p of projects){const t=(tracks[p.id]||[]).find(x=>x.id===trackId);if(t){tr=t;project=p;break;}}
      if(tr&&project)openTrackDetail(tr,project);
    });

    list.querySelectorAll('[data-stage]').forEach(s=>s.onchange=async()=>{
      s.disabled=true;
      const {error}=await client.from('music_projects').update({status:s.value,updated_at:new Date().toISOString()}).eq('id',s.dataset.stage);
      status.textContent=error?'Kaydedilemedi: '+error.message:'Aşama güncellendi.';
      s.disabled=false;load();
    });
    list.querySelectorAll('[data-dlallow]').forEach(b=>b.onclick=async()=>{
      const yeni = b.dataset.on!=='1';
      const {error}=await client.from('music_projects').update({download_allowed:yeni}).eq('id',b.dataset.dlallow);
      status.textContent = error ? error.message : (yeni?'İndirme izni verildi.':'İndirme izni kaldırıldı.');
      load();
    });

    list.querySelectorAll('[data-dl]').forEach(b=>b.onclick=async()=>{
      const {data,error}=await client.storage.from('project-audio').createSignedUrl(b.dataset.path,600,{download:b.dataset.name+'.mp3'});
      if(error){status.textContent='İndirilemedi: '+error.message;return;}
      const a=document.createElement('a'); a.href=data.signedUrl; a.download=b.dataset.name; a.click();
    });
    list.querySelectorAll('[data-del]').forEach(b=>b.onclick=async()=>{
      if(!confirm('Proje silinecek. Emin misiniz?'))return;
      await client.from('music_projects').delete().eq('id',b.dataset.del);load();
    });

    list.querySelectorAll('[data-addtrack]').forEach(inp=>inp.onchange=async()=>{
      const file=inp.files?.[0]; if(!file)return;
      const project=projects.find(p=>p.id===inp.dataset.addtrack); if(!project)return;
      const ext=file.name.split('.').pop()||'mp3';
      const path=`${project.coach_id}/${project.id}-${Date.now()}.${ext}`;
      inp.disabled=true; status.textContent='Parça yükleniyor…';
      try{
        const uploaded=await client.storage.from('project-audio').upload(path,file,{contentType:file.type||'audio/mpeg'});
        if(uploaded.error)throw uploaded.error;
        const label=file.name.replace(/\.[^.]+$/,'');
        const result=await client.from('project_tracks').insert({project_id:project.id,label,audio_path:path,version:1,sort_order:(tracks[project.id]||[]).length});
        if(result.error)throw result.error;
        status.textContent='Yeni parça projeye eklendi.'; load();
      }catch(error){status.textContent='Parça eklenemedi: '+error.message;}
      finally{inp.disabled=false;inp.value='';}
    });

    list.querySelectorAll('[data-trackdel]').forEach(button=>button.onclick=async()=>{
      if(!confirm('Bu parça ve ses dosyası silinsin mi?'))return;
      button.disabled=true;
      try{
        const removed=await client.from('project_tracks').delete().eq('id',button.dataset.trackdel);
        if(removed.error)throw removed.error;
        await client.storage.from('project-audio').remove([button.dataset.path]);
        status.textContent='Parça silindi.'; load();
      }catch(error){status.textContent='Parça silinemedi: '+error.message;}
      finally{button.disabled=false;}
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

    list.querySelectorAll('[data-notesend]').forEach(b=>b.onclick=async()=>{
      const id=b.dataset.notesend;
      const inp=list.querySelector(`[data-cut="${id}"]`);
      const body=(inp?.value||'').trim();
      const tr=Object.values(tracks).flat().find(t=>t.id===id);
      b.disabled=true;
      const {error}=await client.from('project_feedback').insert({
        project_id:tr.project_id,author_id:me,track_id:id,kind:'note',
        body:body||'Bu parça hakkında not.'
      });
      status.textContent=error?('Gönderilemedi: '+error.message):'Not gönderildi.';
      if(!error && inp)inp.value='';
      b.disabled=false;
      load();
    });

    list.querySelectorAll('[data-play]').forEach(b=>b.onclick=async()=>{
      const id=b.dataset.play;
      if(cur&&cur.id===id){ if(cur.audio.paused){cur.audio.play();b.textContent='⏸';b.setAttribute('aria-label','Parçayı duraklat');}else{cur.audio.pause();b.textContent='▶';b.setAttribute('aria-label','Parçayı oynat');} return; }
      if(cur){cur.audio.pause();cur.btn.textContent='▶';cur.btn.setAttribute('aria-label','Parçayı oynat');}
      const url=await signed(b.dataset.path); if(!url){status.textContent='Ses açılamadı.';return;}
      const audio=new Audio(url);
      audio.onended=()=>{b.textContent='▶';b.setAttribute('aria-label','Parçayı oynat');cur=null;};
      await audio.play(); b.textContent='⏸'; b.setAttribute('aria-label','Parçayı duraklat'); cur={id,audio,btn:b};
    });
  }

  let cur=null;

  window.addEventListener('derin:authchange',()=>{if(client)load();});
  boot();
})();
