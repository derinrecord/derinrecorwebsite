(() => {
  const STAGES=[{k:'approved',l:'ONAYLANDI'},{k:'started',l:'BAŞLANDI'},{k:'production',l:'YAPIM SÜRECİNDE'},{k:'finishing',l:'BİTİM AŞAMASI'},{k:'delivered',l:'TESLİM EDİLDİ'}];
  const GROUPS=[{t:'BEKLEYEN PROJELER',has:s=>s==='pending'},{t:'YAPIM SÜRECİNDE',has:s=>['approved','started','production','finishing'].includes(s)},{t:'TAMAMLANAN',has:s=>s==='delivered'}];
  const list=document.querySelector('#list'), status=document.querySelector('#s');
  const safe=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  // "3 gün önce" gibi okunur zaman; bir haftadan eskiyse kısa tarih.
  const goreli=v=>{
    const t=new Date(v).getTime(); if(!isFinite(t))return '';
    const fark=Math.max(0,Date.now()-t), dk=Math.round(fark/6e4), sa=Math.round(fark/36e5), gn=Math.round(fark/864e5);
    if(dk<1)return 'az önce'; if(dk<60)return dk+' dk önce'; if(sa<24)return sa+' saat önce';
    if(gn<7)return gn+' gün önce';
    return new Date(t).toLocaleDateString('tr-TR',{day:'numeric',month:'long',year:'numeric'});
  };
  // "1:05,3" — işaret zamanları onda bir saniye hassasiyetle gösterilir.
  const mmssOnda=s=>{ if(!s||!isFinite(s))s=0; const t=Math.round(s*10)/10; const dk=Math.floor(t/60), sn=t-dk*60;
    return dk+':'+String(Math.floor(sn)).padStart(2,'0')+','+Math.round((sn-Math.floor(sn))*10); };
  // Elle yazılan zaman: "1:05,3", "1:05.3", "65,3" ya da "65" → saniye; anlaşılmazsa null.
  const zamanCoz=metin=>{ const m=/^\s*(?:(\d+):)?(\d+(?:[.,]\d+)?)\s*$/.exec(String(metin||''));
    if(!m)return null; const v=(m[1]?parseInt(m[1],10)*60:0)+parseFloat(m[2].replace(',','.')); return isFinite(v)?v:null; };
  const mmss=s=>(!s||!isFinite(s))?'0:00':Math.floor(s/60)+':'+String(Math.floor(s%60)).padStart(2,'0');

  let client=null,admin=false,me=null,projects=[],tracks={},feedback={},names={},coachList=[],busy=false,subscribed=false;
  let openTrackId=null;
  let detail={};
  let newFolderOpen=false, newFolderBusy=false, newFolderError='', newFolderNote='';
  let localSeq=0;

  // Katlanmış projeler: kart açık/kapalı tercihi tarayıcıda saklanır, böylece
  // sayfa yenilendiğinde veya canlı güncelleme listeyi yeniden çizdiğinde
  // kullanıcı bıraktığı yerde bulur.
  let katliProjeler={};
  try{ katliProjeler=JSON.parse(localStorage.getItem('derin:katli-projeler')||'{}')||{}; }catch{ katliProjeler={}; }
  const katliKaydet=()=>{ try{ localStorage.setItem('derin:katli-projeler',JSON.stringify(katliProjeler)); }catch{} };
  const newLocalId=()=>'local-'+(++localSeq);

  // Supabase, hiçbir satırı etkilemeyen güncelleme/silmede hata döndürmez:
  // işlem sessizce boşa düşer, ekran "oldu" der. Etkilenen satırı geri
  // isteyip doğrularız; yoksa hata fırlatır.
  async function tekSatir(zincir,mesaj){
    const {data,error}=await zincir.select('id');
    if(error)throw error;
    if(!data||!data.length)throw new Error(mesaj||'Kayıt bulunamadı ya da bu işlem için yetkiniz yok.');
    return data;
  }

  async function boot(){
    await window.DerinAuth.ready;
    const a=window.DerinAuth; client=a.client;
    if(!a.configured){status.textContent='Bağlantı hazırlanıyor.';return;}
    if(!a.user){list.innerHTML=''; document.querySelector('#refresh').hidden=true;
      status.innerHTML='<button class="account-button" id="p-login">GİRİŞ YAP</button>';
      document.querySelector('#p-login').onclick=()=>a.open();return;}
    me=a.user.id; admin=a.profile?.role==='admin';
    const rb=document.querySelector('#refresh'); rb.hidden=false; rb.onclick=()=>load();
    const foldAll=document.querySelector('#foldall');
    if(foldAll)foldAll.onclick=()=>{
      // Tümü katlıysa hepsini aç, değilse hepsini katla.
      const hepsi=hepsiKatliMi();
      projects.forEach(p=>{ katliProjeler[p.id]=!hepsi; });
      katliKaydet();
      list.querySelectorAll('[data-projfold]').forEach(h=>katlaUygula(h,!hepsi));
      tumunuKatlaEtiketiniYenile();
    };
    // Kanalları yalnızca bir kez kur; giriş/çıkış sonrası boot() tekrar çağrılabiliyor.
    if(!subscribed){
      subscribed=true;
      client.channel('proj-'+me)
        .on('postgres_changes',{event:'*',schema:'public',table:'music_projects'},()=>load())
        .on('postgres_changes',{event:'*',schema:'public',table:'project_tracks'},()=>load())
        .on('postgres_changes',{event:'*',schema:'public',table:'project_feedback'},()=>load())
        .subscribe();
    }
    await load();
  }

  async function load(){
    // Oturum yokken sorgu atlamak zorunlu: admin/coach bilgisi yokken filtre
    // 'coach_id=eq.null' olur ve PostgREST 400 döndürür.
    if(!client||!me)return;
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
      if(admin){
        const r=await client.from('profiles').select('id,full_name,role').order('full_name');
        if(!r.error){
          names=Object.fromEntries(r.data.map(p=>[p.id,p.full_name]));
          coachList=r.data.filter(p=>p.role!=='admin');
        }
      }
      if(openTrackId){
        let found=null,foundProject=null;
        for(const p of projects){const tr=(tracks[p.id]||[]).find(t=>t.id===openTrackId);if(tr){found=tr;foundProject=p;break;}}
        if(found)syncSavedPoints(found,foundProject);
        else openTrackId=null;
      }
      render();
    }catch(e){bildir('Projeler alınamadı: '+e.message,'hata');}
    finally{busy=false;}
  }

  const bar=st=>{const at=STAGES.findIndex(s=>s.k===st);
    const yuzde=at<0?0:Math.round((at+1)/STAGES.length*100);
    return `<div class="stage-bar"><div class="stage-ust"><span>ÜRETİM SÜRECİ</span><b>%${yuzde}</b></div><div class="stage-row">${STAGES.map((s,i)=>`<div class="stage-step ${at<0?'':i<at?'done':i===at?'now':''}"><div class="stage-dot"></div>${s.l}</div>`).join('')}</div></div>`;};

  function trackBlock(tr,i,p){
    const has=!!tr.audio_path;
    const renkler=['aerobik','acrobatik','artistik','ritmik','trambolin'];
    const renk=renkler[i%renkler.length];
    return `<button type="button" class="proj-track" data-tb="${tr.id}" data-tdopen="${tr.id}">
      <span class="pt-no">${String(i+1).padStart(2,'0')}</span>
      <span class="pt-kaset ${renk}"><img src="assets/demo-cassette-derin-record.png" alt="" loading="lazy"></span>
      <span class="pt-ad"><strong>${safe(tr.label||'Parça')}</strong><small>${has?'Düzenlenmiş kayıt · dinle ve not bırak':'Ham kaynak · düzenleme bekliyor'}</small></span>
      ${(()=>{ const n=parcaNotlari(p.id,tr.id).hepsi.length; return n?`<span class="pt-not" title="${n} not — parçayı açıp klasörlerde gör">${klasorIkon} ${n}</span>`:'<span class="pt-not"></span>'; })()}
      <span class="pt-surum${has?' hazir':''}">v${safe(tr.version||1)}</span>
      <span class="pt-ok" aria-hidden="true">→</span>
    </button>`;
  }

  // Kart gövdesini "katla/aç": sınıfı değiştirmek yeterli (CSS yüksekliği
  // animasyonla kapatıyor), bu yüzden liste yeniden çizilmez ve odak kaymaz.
  function katlaUygula(head,katli){
    const kart=head.closest('.proj-card'); if(!kart)return;
    kart.classList.toggle('katli',katli);
    head.setAttribute('aria-expanded',katli?'false':'true');
    const govde=kart.querySelector('.proj-fold-inner'); if(govde)govde.inert=katli;
    const etiket=head.querySelector('.proj-fold-label'); if(etiket)etiket.textContent=katli?'AÇ':'KATLA';
    const ok=head.querySelector('.proj-fold-arrow'); if(ok)ok.textContent=katli?'▸':'▾';
  }

  function hepsiKatliMi(){ return projects.length>0&&projects.every(p=>katliProjeler[p.id]); }
  function tumunuKatlaEtiketiniYenile(){
    const fa=document.querySelector('#foldall');
    if(!fa)return;
    fa.textContent=hepsiKatliMi()?'TÜMÜNÜ AÇ':'TÜMÜNÜ KATLA';
  }

  function card(p){
    // Parça notları kendi klasörlerinde durur; kartta yalnız projenin geneline yazılanlar görünür.
    const trs=tracks[p.id]||[], fbs=(feedback[p.id]||[]).filter(f=>f.track_id==null&&f.start_sec==null);
    const katli=!!katliProjeler[p.id];
    const asama=p.status==='pending'?'BEKLİYOR':((STAGES.find(s=>s.k===p.status)||{}).l||'');
    const durum=p.status==='pending'?'bekliyor':p.status==='delivered'?'teslim':'yapim';
    const kim=admin?(names[p.coach_id]||'Antrenör'):'Derin Record × sen';
    const no=String(projects.indexOf(p)+1).padStart(2,'0');
    const notSayisi=fbs.length;
    return `<article class="proj-card${katli?' katli':''}" data-durum="${durum}">
      <div class="proj-head" data-projfold="${p.id}" role="button" tabindex="0" aria-expanded="${katli?'false':'true'}" aria-controls="proj-body-${p.id}">
        <span class="proj-no" aria-hidden="true">${no}</span>
        <div class="proj-head-main">
          <p class="proj-kicker">${p.branch?safe(String(p.branch).toLocaleUpperCase('tr-TR'))+' · ':''}${safe(kim)}</p>
          <h3>${safe(p.title||'Proje')}</h3>
          <p class="meta">${trs.length} parça · ${notSayisi} not · ${safe(goreli(p.updated_at||p.created_at))} güncellendi</p>
        </div>
        <span class="proj-stage-chip">${asama}</span>
        <span class="proj-fold-label">${katli?'AÇ':'KATLA'}</span>
        <span class="proj-fold-arrow" aria-hidden="true">${katli?'▸':'▾'}</span>
      </div>
      <div class="proj-fold" id="proj-body-${p.id}">
      <div class="proj-fold-inner"${katli?' inert':''}>
      ${p.status==='pending'?'<div class="pj-bekleme"><strong>ONAY BEKLİYOR</strong>Talep Derin Record\'a ulaştı. Onaylandığında üretim süreci burada adım adım ilerler.</div>':bar(p.status)}
      <p class="pj-baslik"><span>PARÇALAR</span><i>${trs.length}</i></p>
      <div class="proj-tracks">${trs.length ? trs.map((tr,i)=>trackBlock(tr,i,p)).join('') : `<p class="proj-empty-track">Henüz parça yok. İlk taslak yüklendiğinde burada görünecek.</p>`}</div>
      ${admin?`<div class="proj-actions proj-yonetim"><span>YÖNETİM</span>
        <label class="proj-add-track">+ YENİ PARÇA <input type="file" accept="${SES_ACCEPT}" data-addtrack="${p.id}" hidden></label>
        <select data-stage="${p.id}" aria-label="Proje aşaması">
          <option value="pending"${p.status==='pending'?' selected':''}>Bekliyor</option>
          ${STAGES.map(s=>`<option value="${s.k}"${p.status===s.k?' selected':''}>${s.l}</option>`).join('')}
        </select>
        <button data-dlallow="${p.id}" data-on="${p.download_allowed?1:0}"${p.download_allowed?' class="aktif"':''}>${p.download_allowed?'✓ İNDİRME AÇIK':'İNDİRMEYE İZİN VER'}</button>
        <button data-del="${p.id}" class="tehlike">SİL</button></div>`:''}
      <div class="fb-box"><p class="pj-baslik"><span>NOTLAR</span><i>${notSayisi}</i></p>
      <ul class="fb-list">${fbs.length?fbs.map(f=>{
        const t=trs.find(x=>x.id===f.track_id);
        const antrenor=f.author_id===p.coach_id;
        const ad=antrenor?(admin?(names[p.coach_id]||'Antrenör'):'Sen'):'Derin Record';
        return `<li><span class="fb-av${antrenor?'':' stu'}" aria-hidden="true">${safe(ad.trim().charAt(0).toLocaleUpperCase('tr-TR'))}</span><div class="fb-govde">${safe(f.body)}${t?` <em>· ${safe(t.label)}</em>`:''}<small>${safe(ad)} · ${safe(goreli(f.created_at))}</small></div></li>`;
      }).join(''):'<li class="bos">Henüz not yok. İlk notu sen bırak.</li>'}</ul>
      <div class="fb-yaz"><textarea data-fb="${p.id}" rows="1" placeholder="Not yaz…" aria-label="Not yaz"></textarea>
      <button data-fbsend="${p.id}">GÖNDER</button></div></div>
      </div>
      </div>
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
      return `<section class="proj-group"><h2>${g.t} <i>${it.length}</i></h2>${it.length?it.map(card).join(''):'<p class="proj-empty">Bu grupta proje yok.</p>'}</section>`;}).join('');
    list.innerHTML=`<button type="button" class="proj-fab" id="proj-fab-btn" aria-label="Yeni proje klasörü aç" title="Yeni proje klasörü aç"><b>${newFolderOpen?'×':'+'}</b><span>${newFolderOpen?'KAPAT':'YENİ PROJE'}</span></button>
      ${newFolderOpen?newFolderPanel():''}
      ${groupsHtml}`;
    status.textContent=projects.length?'● Canlı — değişiklikler anında yansır':'Henüz proje yok.';
    ozetCiz();
    const foldAll=document.querySelector('#foldall');
    if(foldAll){ foldAll.hidden=!projects.length; tumunuKatlaEtiketiniYenile(); }
    wire();
  }

  // Üstteki dört sayı: tek bakışta durum.
  function ozetCiz(){
    const kutu=document.querySelector('#ozet'); if(!kutu)return;
    if(!projects.length){kutu.hidden=true;return;}
    const say=f=>projects.filter(p=>f(p.status)).length;
    const parca=projects.reduce((n,p)=>n+(tracks[p.id]||[]).length,0);
    kutu.innerHTML=[
      ['vurgu',say(s=>['approved','started','production','finishing'].includes(s)),'YAPIMDA'],
      ['',say(s=>s==='pending'),'ONAY BEKLİYOR'],
      ['',say(s=>s==='delivered'),'TESLİM EDİLDİ'],
      ['',parca,'PARÇA']
    ].map(([c,n,l])=>`<div class="${c}"><b>${n}</b><span>${l}</span></div>`).join('');
    kutu.hidden=false;
  }

  function newFolderPanel(){
    return `<div class="proj-newfolder-overlay" id="proj-newfolder-overlay">
      <div class="proj-newfolder-panel">
        <h3>Yeni proje klasörü</h3>
        <p>Klasöre bir isim ver, istersen ilk ses dosyasını da hemen ekle.</p>
        ${admin?`<select id="proj-newfolder-coach" autocomplete="off">
          <option value="">Antrenör seçin</option>
          ${coachList.map(c=>`<option value="${c.id}">${safe(c.full_name||c.id)}</option>`).join('')}
        </select>`:''}
        <input type="text" id="proj-newfolder-name" placeholder="Proje adı (ör. Unleashed v2)" autocomplete="off">
        <input type="file" id="proj-newfolder-file" accept="${SES_ACCEPT}">
        <p class="proj-newfolder-hint">WAV, FLAC ve MP3 desteklenir · ${dosyaBoyutu(PARCA_BOYUTU)} üzeri dosyalar kayıpsız olarak parçalara bölünüp yüklenir (tek nesne sınırı ${dosyaBoyutu(YUKLEME_SINIRI)})<br><small class="proj-surum">sürüm ${SURUM}</small></p>
        <p class="proj-newfolder-error" id="proj-newfolder-error" role="alert">${safe(newFolderError)}</p>
        <p class="proj-newfolder-note" id="proj-newfolder-note" role="status">${safe(newFolderNote)}</p>
        <div class="proj-newfolder-actions">
          <button type="button" class="proj-newfolder-cancel" id="proj-newfolder-cancel">VAZGEÇ</button>
          <button type="button" class="proj-newfolder-confirm" id="proj-newfolder-confirm" aria-label="Klasörü oluştur" title="Klasörü oluştur" ${newFolderBusy?'disabled':''}>${newFolderBusy?'…':'✓'}</button>
        </div>
      </div>
    </div>`;
  }

  async function signed(path){const r=await client.storage.from('project-audio').createSignedUrl(path,3600);return r.data?.signedUrl;}

  // Ses dosyası yardımcıları tek kaynaktan gelir: audio-file-types.js
  // (aynı modül tests/audio-file-types.test.js ile doğrulanıyor).
  const Ses=window.DerinAudioTypes;
  const dosyaBoyutu=Ses.boyut;
  const sesUzantisi=Ses.uzanti;
  const sesTipi=Ses.tip;
  const sesGecerli=Ses.gecerli;
  const YUKLEME_SINIRI=Ses.YUKLEME_SINIRI;
  const PARCA_BOYUTU=Ses.PARCA_BOYUTU;
  const sesBuyuk=Ses.buyukMu;
  // input accept listesi uzantı doğrulamasıyla aynı kaynaktan üretilir.
  const SES_ACCEPT=Ses.accept();
  // Kullanıcıya gösterilen desteklenen uzantı listesi.
  const desteklenenMetin=()=>Ses.desteklenenler();

  // Storage hatalarını kullanıcının atacağı adıma çevir (ham İngilizce mesaj tek başına anlaşılmıyor).
  function storageHint(message){
    const m=String(message||'');
    if(/row-level security|violates|policy|Unauthorized|not allowed|permission/i.test(m))
      return 'Depolama yetkisi reddedildi. Supabase SQL Editor’de supabase/proje-dosya-deposu.sql dosyasını çalıştırıp sayfayı yenileyin.';
    if(/maximum allowed size|exceeded the maximum|too large|entity too large|payload|413/i.test(m))
      return `Dosya Supabase yükleme sınırını aşıyor (ücretsiz plan üst sınırı ${dosyaBoyutu(YUKLEME_SINIRI)}). Supabase → Storage → Settings → “Global file size limit” değerini yükseltin; sınır yükseltilemiyorsa dosyayı bölerek yükleyin.`;
    if(/mime|content.?type/i.test(m))
      return 'Bu ses formatı depolama kovası tarafından kabul edilmiyor. Supabase SQL Editor’de supabase/proje-dosya-deposu.sql dosyasını çalıştırıp tekrar deneyin.';
    if(/duplicate|already exists/i.test(m))
      return 'Aynı adla bir dosya var; sayfayı yenileyip tekrar deneyin.';
    if(/fetch|network|Failed to fetch/i.test(m))
      return 'Bağlantı kesildi. İnternet bağlantınızı kontrol edip tekrar deneyin.';
    return '';
  }

  // Tablo (parça / proje kaydı) hataları için aynı çeviri.
  function tabloHint(message){
    const m=String(message||'');
    if(/row-level security|violates|policy|permission denied|not allowed/i.test(m))
      return 'Kayıt yetkisi reddedildi. Supabase SQL Editor’de supabase/proje-dosya-deposu.sql dosyasını çalıştırıp sayfayı yenileyin.';
    if(/does not exist|schema cache/i.test(m))
      return 'Veritabanı şeması beklenenden farklı görünüyor. Supabase SQL Editor’de supabase/proje-dosya-deposu.sql dosyasını çalıştırın.';
    return '';
  }

  // ---------- Görünür bildirim ----------
  // Neden: tüm mesajlar sayfanın ÜSTÜNDEKİ durum satırına yazılıyordu. Kullanıcı
  // ekranın ortasındaki karta baktığı için hata "hiçbir şey olmuyor" gibi
  // görünüyordu (sessiz başarısızlık). Artık kritik mesajlar ekranın altındaki
  // sabit kutuda çıkar; hata kutusu kendiliğinden kaybolmaz ve tek tuşla rapor
  // kopyalanabilir (hangi aşamada, hangi dosyada, sunucunun tam cevabı).
  const SURUM='20260926f';
  let sonHataDetay={};

  function raporMetni(){
    const d=sonHataDetay;
    return [
      'Derin Record — proje ses yükleme tanı raporu',
      'Sürüm: '+SURUM,
      'Zaman: '+new Date().toISOString(),
      'Sayfa: '+location.href,
      'Tarayıcı: '+navigator.userAgent,
      'Yetki: '+(admin?'yönetici':'antrenör'),
      'Aşama: '+(d.asama||'-'),
      'Dosya: '+(d.dosya||'-'),
      'Boyut: '+(d.boyut||'-'),
      'Uzantı/tip: '+(d.tip||'-'),
      'Parça: '+(d.parca||'-'),
      'Yol: '+(d.yol||'-'),
      'Sunucu mesajı: '+(d.mesaj||'-')
    ].join('\n');
  }

  function bildir(metin,tur,eylem){
    status.textContent=metin;
    if(!metin)return;
    const tip=tur||'bilgi';
    let kutu=document.querySelector('#proj-bildirim');
    if(!kutu){ kutu=document.createElement('div'); kutu.id='proj-bildirim'; document.body.appendChild(kutu); }
    kutu.className='proj-bildirim '+tip;
    kutu.setAttribute('role',tip==='hata'?'alert':'status');
    const p=document.createElement('p'); p.className='proj-bildirim-metin'; p.textContent=metin;
    const kapat=document.createElement('button');
    kapat.type='button'; kapat.className='proj-bildirim-kapat';
    kapat.setAttribute('aria-label','Bildirimi kapat'); kapat.textContent='×';
    kapat.onclick=()=>kutu.remove();
    const ust=document.createElement('div'); ust.className='proj-bildirim-ust';
    ust.append(p,kapat);
    kutu.replaceChildren(ust);
    if(tip==='hata'){
      const kopyala=document.createElement('button');
      kopyala.type='button'; kopyala.className='proj-bildirim-kopyala'; kopyala.textContent='RAPORU KOPYALA';
      kopyala.onclick=async()=>{
        try{ await navigator.clipboard.writeText(raporMetni()); kopyala.textContent='KOPYALANDI ✓'; }
        catch{ kopyala.textContent='Kopyalanamadı — elle seçip kopyalayın'; }
      };
      const alt=document.createElement('div'); alt.className='proj-bildirim-alt';
      alt.appendChild(kopyala); kutu.appendChild(alt);
      console.error('[Derin Record] '+metin+'\n'+raporMetni());
    }else{
      if(eylem){
        const d=document.createElement('button'); d.type='button'; d.className='proj-bildirim-kopyala'; d.textContent=eylem.etiket;
        d.onclick=async()=>{ d.disabled=true; kutu.remove(); try{ await eylem.is(); }catch(e){ bildir('İşlem yapılamadı: '+e.message,'hata'); } };
        const alt=document.createElement('div'); alt.className='proj-bildirim-alt'; alt.appendChild(d); kutu.appendChild(alt);
      }
      clearTimeout(bildir._t); bildir._t=setTimeout(()=>{ const k=document.querySelector('#proj-bildirim'); if(k)k.remove(); },eylem?9000:6000);
    }
  }

  // Tek noktadan yükleme: hata mesajını hint ile birleştirir, MIME reddinde bir kez nötr tip ile dener.
  // tip: parça yüklerken dilim Blob'unun tipini açıkça geçmek için (Blob'da dosya adı yoktur).
  async function yukleSes(path,file,tip){
    const ct=tip||sesTipi(file);
    const ilk=await client.storage.from('project-audio').upload(path,file,{contentType:ct,upsert:false});
    if(!ilk.error)return {path,error:null};
    if(/mime|content.?type/i.test(ilk.error.message||'')){
      const ikinci=await client.storage.from('project-audio').upload(path,file,{contentType:'application/octet-stream',upsert:false});
      if(!ikinci.error)return {path,error:null};
    }
    return {path,error:new Error([ilk.error.message,storageHint(ilk.error.message)].filter(Boolean).join(' — '))};
  }

  // ---------- Parçalı yükleme (50 MiB'lik tek nesne sınırı için) ----------
  // Sunucu, 52.428.800 baytı aşan bir yüklemeyi izinlerden ÖNCE reddediyor.
  // Bu yüzden büyük WAV'lar 45 MB'lık dilimlere bölünüp ayrı nesneler olarak
  // yüklenir. Dilimler orijinal dosyanın kesintisiz parçalarıdır: sırayla
  // birleştirildiğinde dosya bit düzeyinde birebir aynı çıkar (MP3'e çevirme yok).

  // temelYol: uzantı ve parça eki hariç yol. Döner: {path (ilk parça), toplam}
  // Mantık audio-file-types.js içindedir (Ses.parcaliYukle): aynı kod sohbet
  // sayfasındaki müzik gönderimi ve testler tarafından da kullanılır.
  async function yukleSesParcali(temelYol,file,ilerleme){
    const sonuc=await Ses.parcaliYukle({
      yukle:(yol,dilim,tip)=>yukleSes(yol,dilim,tip),
      sil:yollar=>client.storage.from('project-audio').remove(yollar)
    },temelYol,file,ilerleme);
    if(sonuc.error){
      sonHataDetay.yol=sonuc.yol; sonHataDetay.parca=`${sonuc.parca}/${sonuc.toplam}`; sonHataDetay.mesaj=sonuc.error.message;
    }else if(sonuc.path){
      dalgaOnHazirla(sonuc.path,file); // beklemeden arka planda
    }
    return sonuc;
  }

  // Parçalı dosyayı indirip tek bir Blob olarak döner.
  async function sesBlob(path){
    const blobs=[];
    for(const p of Ses.parcalariCoz(path)){
      const url=await signed(p.path);
      if(!url)return null;
      const cevap=await fetch(url);
      if(!cevap.ok)return null;
      blobs.push(await cevap.blob());
    }
    return new Blob(blobs,{type:'audio/wav'});
  }

  // Oynatma/analiz için tek bir URL döner: tek parçada imzalı adres, çok parçada
  // tarayıcıda birleştirilmiş blob adresi.
  let aktifBlobUrl=null;
  async function sesUrl(path){
    if(!Ses.parcaliMi(path))return signed(path);
    const blob=await sesBlob(path);
    if(!blob)return null;
    if(aktifBlobUrl){ try{URL.revokeObjectURL(aktifBlobUrl);}catch{} }
    aktifBlobUrl=URL.createObjectURL(blob);
    return aktifBlobUrl;
  }

  // ---------- Parça detayı (dalga formu / nokta işaretleme) ----------

  // Notun zamanı: kayıtlı zaman alanı; yoksa (klasör sistemi öncesi notlar) yazının
  // içindeki ilk "1:05" / "0:23,4" biçimli zaman. Veritabanı değiştirilmez.
  function metindekiZaman(body){
    const m=/(?:^|[\s\[(·•-])(\d{1,2}):([0-5]\d)(?:[.,](\d))?(?!\d)/.exec(String(body||''));
    // Saat gibi yazılmış zamanları (ör. 12:30) parça zamanı sanmamak için dakika 15 ile sınırlı.
    return m&&+m[1]<=15?(+m[1]*60+ +m[2]+(m[3]?+m[3]/10:0)):null;
  }
  const notZamani=f=>f.start_sec!=null?Number(f.start_sec):metindekiZaman(f.body);
  const sistemNotuMu=f=>f.kind==='system';
  // Bir parçanın notları: zamanlı olanlar işaret klasörlerine, zamansızlar GENEL klasörüne.
  function parcaNotlari(projectId,trackId){
    const hepsi=(feedback[projectId]||[]).filter(f=>f.track_id===trackId&&!sistemNotuMu(f));
    return {zamanli:hepsi.filter(f=>notZamani(f)!=null), genel:hepsi.filter(f=>notZamani(f)==null), hepsi};
  }

  function syncSavedPoints(tr,project){
    const {zamanli,genel}=parcaNotlari(project.id,tr.id);
    const draftLocal=(detail.points||[]).filter(p=>!p.saved);
    const savedNow=zamanli.map(f=>{
      const existing=(detail.points||[]).find(p=>p.dbId===f.id);
      return {localId:existing?existing.localId:'db-'+f.id,dbId:f.id,time:notZamani(f),body:f.body||'',voicePath:f.voice_path||null,
        voiceUrl:existing?existing.voiceUrl:null,saved:true,yazar:f.author_id,tarih:f.created_at,metindenZaman:f.start_sec==null,
        kayitliZaman:notZamani(f)};
    });
    detail.points=[...savedNow,...draftLocal];
    detail.genelNotlar=genel;
    detail.proje=project;
  }

  // ---------- Dalga formu ----------
  // Veri: dalga-tepeleri.js (Ableton tarzı: her dilimde en düşük / en yüksek /
  // ortalama düzey, saniyede 200 dilim). Kaynak sırası, hızlıdan yavaşa:
  //   1) tarayıcı belleği  2) ses dosyasının yanındaki "<yol>.dalga" özeti (~100 KB)
  //   3) sesin kendisi — WAV ise inerken soldan sağa kademeli çizilir.
  // Özet ilk çıkarıldığında depoya yazılır; o parça sonra herkes için anında açılır.
  const Dalga=window.DerinDalga||null;
  const DALGA_ANAHTAR='derin:dalga:', DALGA_LISTE='derin:dalga-liste', DALGA_EN_COK=20;
  const dalgaBellek=new Map();
  function dalgaOku(yol){
    if(dalgaBellek.has(yol))return dalgaBellek.get(yol);
    try{ const r=Dalga&&Dalga.coz(localStorage.getItem(DALGA_ANAHTAR+yol)); if(r){dalgaBellek.set(yol,r);return r;} }catch{}
    return null;
  }
  function dalgaYaz(yol,veri){
    dalgaBellek.set(yol,veri);
    if(!Dalga||!veri||veri.eski)return;
    try{
      let liste=[]; try{liste=JSON.parse(localStorage.getItem(DALGA_LISTE)||'[]')||[];}catch{}
      liste=liste.filter(x=>x!==yol); liste.push(yol);
      while(liste.length>DALGA_EN_COK){ const eski=liste.shift(); try{localStorage.removeItem(DALGA_ANAHTAR+eski);}catch{} }
      const metin=Dalga.kodla(veri);
      for(let deneme=0;deneme<4;deneme++){
        try{ localStorage.setItem(DALGA_ANAHTAR+yol,metin); break; }
        catch{ const eski=liste.shift(); if(!eski||eski===yol)break; try{localStorage.removeItem(DALGA_ANAHTAR+eski);}catch{} }
      }
      localStorage.setItem(DALGA_LISTE,JSON.stringify(liste));
    }catch{}
  }

  const yanDosya=yol=>yol+'.dalga';
  const sesYollari=yol=>yol?[...Ses.parcalariCoz(yol).map(p=>p.path),yanDosya(yol)]:[];
  async function yanDosyaOku(yol){
    if(!Dalga)return null;
    try{
      const r=await client.storage.from('project-audio').createSignedUrl(yanDosya(yol),600);
      const u=r.data?.signedUrl; if(!u)return null;
      const c=await fetch(u); if(!c.ok)return null;
      return Dalga.coz(await c.text());
    }catch{ return null; }
  }
  async function yanDosyaYaz(yol,veri){
    if(!Dalga||!veri)return;
    try{
      await client.storage.from('project-audio').upload(yanDosya(yol),new Blob([Dalga.kodla(veri)],{type:'application/octet-stream'}),
        {contentType:'application/octet-stream',upsert:true});
    }catch{ /* yazılamazsa sayfa bir dahaki açılışta yine çıkarır */ }
  }

  // Ses baytlarından dalga: WAV doğrudan, diğerleri tarayıcı çözücüsüyle.
  async function dalgaCikar(buf){
    const u8=new Uint8Array(buf);
    if(Dalga.wavMi(u8)){ const r=Dalga.wavTepeleri(buf,Dalga.HZ); if(r)return r; }
    const Ctx=window.AudioContext||window.webkitAudioContext;
    const ctx=new Ctx();
    try{
      const ab=await ctx.decodeAudioData(buf.slice?buf.slice(0):buf);
      const kanallar=[]; for(let c=0;c<Math.min(2,ab.numberOfChannels);c++)kanallar.push(ab.getChannelData(c));
      return Dalga.pcmTepeleri(kanallar,ab.sampleRate,Dalga.HZ);
    }finally{ try{ctx.close();}catch{} }
  }
  // Yükleme anında, elimizdeki dosyadan dalgayı çıkarıp depoya yaz:
  // antrenör parçayı ilk açtığında dalga hazır bekler.
  async function dalgaOnHazirla(yol,dosya){
    if(!Dalga||!dosya||dosya.size>300*1024*1024)return;
    try{ const veri=await dalgaCikar(await dosya.arrayBuffer()); dalgaYaz(yol,veri); await yanDosyaYaz(yol,veri); }catch{}
  }

  // Sesi parça parça indirir (parçalı dosyalarda sırayla). Her gelen bayt dilimi
  // `dilim` ile hemen işlenir; `sakla` ise baytlar oynatma için Blob'a toplanır.
  async function sesAkisIndir(yol,{dilim,ilerleme,sakla}){
    const parcalar=Ses.parcalariCoz(yol), saklanan=[];
    let gelen=0, toplam=0;
    for(let i=0;i<parcalar.length;i++){
      const url=await signed(parcalar[i].path); if(!url)throw new Error('Ses adresi alınamadı');
      const resp=await fetch(url); if(!resp.ok)throw new Error('Ses indirilemedi ('+resp.status+')');
      const boy=Number(resp.headers.get('content-length'))||0;
      // Toplam boy: ilk parçanın boyu × parça sayısı (son parça küçük olabilir; yalnız yüzde içindir).
      if(i===0)toplam=boy*parcalar.length;
      if(!resp.body||!resp.body.getReader){
        const b=new Uint8Array(await resp.arrayBuffer());
        dilim&&dilim(b); if(sakla)saklanan.push(b); gelen+=b.length; ilerleme&&ilerleme(toplam?Math.min(1,gelen/toplam):(i+1)/parcalar.length);
        continue;
      }
      const okuyucu=resp.body.getReader();
      for(;;){
        const {done,value}=await okuyucu.read(); if(done)break;
        dilim&&dilim(value); if(sakla)saklanan.push(value);
        gelen+=value.length; ilerleme&&ilerleme(toplam?Math.min(1,gelen/toplam):(i+1)/parcalar.length);
      }
    }
    return sakla?new Blob(saklanan,{type:Ses.tip({name:yol})||'audio/wav'}):null;
  }

  const YAKIN_PLAN=8;            // klasördeki yakın plan dalga penceresi (saniye)

  // ---------- Ana dalga: yakınlaştırma / uzaklaştırma ----------
  // detail.gorunum = {bas,son} (saniye) — null ise parçanın tamamı görünür.
  const EN_DAR=1;                 // en fazla yakınlaşma: ekranda 1 saniye
  const toplamSure=()=>detail.duration||(detail.peaks&&detail.peaks.duration)||0;
  function gorAralik(){
    const dur=toplamSure(), g=detail.gorunum;
    if(!g||!dur)return [0,dur];
    const uz=Math.min(dur,Math.max(EN_DAR,g.son-g.bas));
    const bas=Math.max(0,Math.min(dur-uz,g.bas));
    return [bas,bas+uz];
  }
  const yakinMi=()=>{ const [a,b]=gorAralik(); return toplamSure()>0&&(b-a)<toplamSure()-1e-3; };
  function gorunumAyarla(bas,son){
    const dur=toplamSure(); if(!dur)return;
    let uz=Math.min(dur,Math.max(EN_DAR,son-bas));
    bas=Math.max(0,Math.min(dur-uz,bas));
    detail.gorunum=uz>=dur-1e-3?null:{bas,son:bas+uz};
    gorunumUygula();
  }
  // Elle gezinme: çalan yer yeni görünümün dışında kaldıysa takip durur
  // (görünüm geri zıplamaz); çalan yer görüntüye girince ya da bir yere dokununca yeniden başlar.
  function elleGorunum(bas,son){
    gorunumAyarla(bas,son);
    const [a,b]=gorAralik(), c=detail.curTime||0;
    detail.takipKapali=!(c>=a&&c<=b);
  }
  // oran<1 yakınlaştırır, >1 uzaklaştırır; merkez: sabit kalacak zaman noktası.
  function yakinlastir(oran,merkez){
    const [a,b]=gorAralik(), uz=b-a;
    if(merkez==null){ const c=detail.curTime||0; merkez=(c>=a&&c<=b)?c:(a+b)/2; }
    const yeniUz=Math.min(toplamSure(),Math.max(EN_DAR,uz*oran));
    const k=(merkez-a)/uz;
    elleGorunum(merkez-k*yeniUz,merkez-k*yeniUz+yeniUz);
  }
  const sureYazi=s=>s>=60?(Math.floor(s/60)+' dk'+(Math.round(s%60)?' '+Math.round(s%60)+' sn':'')):((s<10?String(Math.round(s*10)/10).replace('.',','):Math.round(s))+' sn');
  function cetvelHtml(){
    const [a,b]=gorAralik(), uz=b-a, ince=uz<20;
    return [0,.25,.5,.75,1].map(r=>`<span style="left:${r*100}%">${ince?mmssOnda(a+r*uz):mmss(a+r*uz)}</span>`).join('');
  }
  // Ekran yeniden kurulmadan: işaret konumları, cetvel, kaydırma çubuğu, düğmeler, çizim.
  function gorunumUygula(){
    const root=document.querySelector('.track-detail'); if(!root)return;
    const [a,b]=gorAralik(), uz=Math.max(.001,b-a), dur=toplamSure();
    (detail.points||[]).forEach(p=>{
      const m=root.querySelector(`[data-tdmark="${p.localId}"]`); if(!m)return;
      m.style.left=((p.time-a)/uz*100)+'%';
      m.classList.toggle('disarida',p.time<a-1e-6||p.time>b+1e-6);
    });
    const c=root.querySelector('.td-cetvel'); if(c)c.innerHTML=cetvelHtml();
    const g=root.querySelector('[data-tdgenel]');
    if(g){ g.hidden=!yakinMi(); const t=g.querySelector('i'); if(t&&dur){ t.style.left=(a/dur*100)+'%'; t.style.width=Math.max(2,uz/dur*100)+'%'; } }
    const sy=root.querySelector('[data-tdgorsure]'); if(sy)sy.textContent=yakinMi()?sureYazi(uz):'TÜMÜ';
    const uzak=root.querySelector('[data-tdzoom-out]'); if(uzak)uzak.disabled=!yakinMi();
    const tum=root.querySelector('[data-tdzoom-fit]'); if(tum)tum.disabled=!yakinMi();
    const yak=root.querySelector('[data-tdzoom-in]'); if(yak)yak.disabled=uz<=EN_DAR+1e-3;
    root.querySelector('[data-tdwave]')?.classList.toggle('yakin',yakinMi());
    cizimYenile();
  }
  // Çalarken çalan yer görünümden çıkarsa görünüm onu takip eder (sayfa çevirir gibi).
  function takipEt(){
    if(!detail.playing||!yakinMi()||detail.elleKaydiriyor)return;
    const [a,b]=gorAralik(), c=detail.curTime||0, uz=b-a;
    if(detail.takipKapali){ if(c>=a&&c<=b)detail.takipKapali=false; else return; }
    if(c>b-uz*0.02||c<a)gorunumAyarla(c-uz*0.1,c-uz*0.1+uz);
  }
  const sirali=()=>[...(detail.points||[])].sort((a,b)=>a.time-b.time);
  const noktaNo=p=>String(sirali().indexOf(p)+1).padStart(2,'0');
  const seciliNokta=()=>(detail.points||[]).find(x=>x.localId===detail.selPointLocalId)||null;
  const yakinPencere=t=>{
    const dur=detail.duration||0, yarim=YAKIN_PLAN/2;
    let a=Math.max(0,t-yarim), b=Math.min(dur,a+YAKIN_PLAN); a=Math.max(0,b-YAKIN_PLAN);
    return [a,b];
  };

  // Ableton tarzı çizim: gri-mavi klip zemini üzerinde, her kanal kendi şeridinde
  // (stereo: üstte sol, altta sağ), içi dolu koyu kontur. Her ekran pikseli o
  // aralığın gerçek en düşük/en yüksek örneğini gösterir — yaklaştıkça ayrıntı artar.
  // Klip zemini rengi (Ableton'daki klip renkleri gibi). Dalga rengi zemine göre
  // kendiliğinden seçilir: açık zeminde koyu, koyu zeminde açık — her renkte net okunur.
  // Seçim yalnız bu cihazda hatırlanır.
  const ZEMINLER=[
    {k:'arduvaz',ad:'Arduvaz',renk:'#5d7682'},
    {k:'kum',ad:'Kum',renk:'#c9b98c'},
    {k:'altin',ad:'Altın',renk:'#d8bb2c'},
    {k:'mercan',ad:'Mercan',renk:'#e07a5f'},
    {k:'gul',ad:'Gül',renk:'#d06a92'},
    {k:'lavanta',ad:'Lavanta',renk:'#9a8bd0'},
    {k:'nane',ad:'Nane',renk:'#7fc3a3'},
    {k:'gece',ad:'Gece',renk:'#1c1f26'}
  ];
  const ZEMIN_ANAHTAR='derin:dalga-zemin', OZEL_ANAHTAR='derin:dalga-ozel-renkler', ACIK_ANAHTAR='derin:dalga-palet-acik';
  const OZEL_EN_COK=8;
  const hexMi=v=>/^#[0-9a-f]{6}$/i.test(String(v||''));
  // Kendi kaydettiğin renkler ("ozel:#rrggbb" koduyla seçilir).
  let ozelRenkler=[];
  try{ ozelRenkler=(JSON.parse(localStorage.getItem(OZEL_ANAHTAR)||'[]')||[]).filter(hexMi).slice(0,OZEL_EN_COK); }catch{ ozelRenkler=[]; }
  const ozelKaydet=()=>{ try{localStorage.setItem(OZEL_ANAHTAR,JSON.stringify(ozelRenkler));}catch{} };
  const zeminGecerli=z=>ZEMINLER.some(x=>x.k===z)||(String(z).startsWith('ozel:')&&ozelRenkler.includes(String(z).slice(5)));
  let zeminKodu='arduvaz', paletAcik=false;
  try{ const z=localStorage.getItem(ZEMIN_ANAHTAR); if(zeminGecerli(z))zeminKodu=z; paletAcik=localStorage.getItem(ACIK_ANAHTAR)==='1'; }catch{}
  const zeminHex=()=>String(zeminKodu).startsWith('ozel:')?zeminKodu.slice(5):(ZEMINLER.find(x=>x.k===zeminKodu)||ZEMINLER[0]).renk;
  const hexRgb=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16));
  const karis=(a,b,o)=>{const x=hexRgb(a),y=hexRgb(b);return 'rgb('+x.map((v,i)=>Math.round(v*(1-o)+y[i]*o)).join(',')+')';};
  function renkler(){
    const z=zeminHex();
    const [r,g,b]=hexRgb(z), parlak=(0.299*r+0.587*g+0.114*b)/255>0.42;
    const ink=parlak?'10,12,14':'244,241,233';
    return {
      zemin:z,
      zeminCalan:karis(z,parlak?'#000000':'#e8d15a',parlak?0.12:0.22), // çalınmış kısım bir ton farklı
      izgara:`rgba(${ink},${parlak?.2:.12})`,
      ayrac:`rgba(${ink},${parlak?.3:.18})`,
      dalga:parlak?'#121314':'#ece6d6',
      bos:`rgba(${ink},.35)`,
      calanCizgi:parlak?'#ffffff':'#e8d15a'
    };
  }
  let RENK=renkler();
  function izgaraAdimi(aralik){ // ~8–16 çizgi olacak şekilde saniye adımı
    for(const a of [.1,.25,.5,1,2,5,10,15,30,60]) if(aralik/a<=16)return a;
    return 120;
  }
  function drawWave(canvas,o){
    const D=detail.peaks, dur=detail.duration||(D&&D.duration);
    if(!canvas||!D||!dur)return;
    const dpr=window.devicePixelRatio||1;
    const w=canvas.clientWidth||1, h=canvas.clientHeight||1;
    const W=Math.round(w*dpr), H=Math.round(h*dpr);
    if(canvas.width!==W||canvas.height!==H){canvas.width=W;canvas.height=H;}
    const ctx=canvas.getContext('2d');
    ctx.setTransform(1,0,0,1,0,0);
    const from=o.from||0, to=o.to||dur, aralik=Math.max(.001,to-from);
    const X=t=>(t-from)/aralik*W;
    const cur=detail.curTime||0, curX=Math.max(0,Math.min(W,X(cur)));

    // Klip zemini: çalınan kısım hafif yeşil-altın tonda.
    ctx.fillStyle=RENK.zemin; ctx.fillRect(0,0,W,H);
    if(curX>0){ ctx.fillStyle=RENK.zeminCalan; ctx.fillRect(0,0,curX,H); }
    // Dikey ızgara
    const adim=izgaraAdimi(aralik);
    ctx.fillStyle=RENK.izgara;
    for(let t=Math.ceil(from/adim)*adim;t<=to;t+=adim){ ctx.fillRect(Math.round(X(t)),0,Math.max(1,Math.round(dpr)),H); }

    const kanal=D.kanal||1, hz=D.hz, hazir=D.hazir, olcek=D.tepe>0?1/D.tepe:1;
    const bosluk=kanal>1?Math.round(3*dpr):0;
    const serit=(H-bosluk*(kanal-1))/kanal;
    if(kanal>1){ ctx.fillStyle=RENK.ayrac; for(let c=1;c<kanal;c++)ctx.fillRect(0,Math.round(c*serit+(c-1)*bosluk),W,bosluk); }

    const ust=new Float32Array(W+1), alt=new Float32Array(W+1);
    for(let c=0;c<kanal;c++){
      const mnA=D.mn[c], mxA=D.mx[c];
      const y0=c*(serit+bosluk), mid=y0+serit/2, yar=serit/2-1.5*dpr;
      let son=-1;
      for(let px=0;px<=W;px++){
        const t0=from+px/W*aralik, t1=from+(px+1)/W*aralik;
        let b0=Math.floor(t0*hz), b1=Math.floor(t1*hz);
        if(b1<=b0)b1=b0+1;
        if(b0>=hazir||b0<0)break;
        if(b1>hazir)b1=hazir;
        let mn=Infinity, mx=-Infinity;
        for(let b=b0;b<b1;b++){ if(mnA[b]<mn)mn=mnA[b]; if(mxA[b]>mx)mx=mxA[b]; }
        ust[px]=mid-mx*olcek*yar; alt[px]=mid-mn*olcek*yar;
        // Çok kısık yerlerde bile ince bir çizgi görünsün.
        if(alt[px]-ust[px]<dpr){ const m=(alt[px]+ust[px])/2; ust[px]=m-dpr/2; alt[px]=m+dpr/2; }
        son=px;
      }
      // Henüz inmemiş kısım: ince orta çizgi
      if(son<W){ ctx.fillStyle=RENK.bos; ctx.fillRect(Math.max(0,son),Math.round(mid),W-Math.max(0,son),Math.max(1,Math.round(dpr))); }
      if(son<1)continue;
      // Tek dolu şekil: üst kontur soldan sağa, alt kontur sağdan sola.
      ctx.beginPath();
      ctx.moveTo(0,ust[0]);
      for(let px=1;px<=son;px++)ctx.lineTo(px,ust[px]);
      for(let px=son;px>=0;px--)ctx.lineTo(px,alt[px]);
      ctx.closePath();
      ctx.fillStyle=RENK.dalga; ctx.fill();
    }

    for(const im of (o.isaretler||[])){
      if(im.t<from||im.t>to)continue;
      const ix=Math.round(X(im.t)), k=Math.max(1,Math.round((im.aktif?2:1.5)*dpr));
      ctx.fillStyle=im.aktif?'#cb2468':(im.saved?'#d8bb2c':'#f4f1e9');
      ctx.fillRect(ix-Math.floor(k/2),0,k,H);
    }
    if(o.hover!=null&&o.hover>=from&&o.hover<=to){
      ctx.fillStyle='rgba(244,241,233,.7)';
      const hx=Math.round(X(o.hover));
      for(let y=0;y<H;y+=6*dpr)ctx.fillRect(hx,y,Math.max(1,Math.round(dpr)),3*dpr);
    }
    if(cur>=from&&cur<=to){
      ctx.fillStyle=RENK.calanCizgi; ctx.fillRect(Math.round(curX)-Math.round(dpr),0,Math.max(2,Math.round(2*dpr)),H);
    }
  }

  // Ana dalga + açık klasördeki yakın plan: oynatırken, sürüklerken, inerken anlık.
  let cizimBekliyor=false;
  function cizimIste(){ if(cizimBekliyor)return; cizimBekliyor=true; (window.requestAnimationFrame||(f=>setTimeout(f,16)))(()=>{cizimBekliyor=false;cizimYenile();}); }
  function cizimYenile(){
    const root=document.querySelector('.track-detail'); if(!root)return;
    const D=detail.peaks;
    const rozet=root.querySelector('.td-badge');
    if(rozet&&D&&!detail.dalgaHata)rozet.textContent=(D.hazir>=D.n&&D.n)?'DALGA FORMU HAZIR':('DALGA FORMU YÜKLENİYOR · %'+Math.floor((detail.dalgaYuzde||0)));
    if(!D)return;
    const sec=seciliNokta();
    const ana=root.querySelector('.td-wave-canvas');
    if(ana){ const [ga,gb]=gorAralik(); drawWave(ana,{from:ga,to:gb,hover:detail.hoverAna}); }
    const yakin=root.querySelector('.td-zoom-canvas');
    if(yakin&&sec){
      const [a,b]=yakinPencere(sec.time);
      drawWave(yakin,{from:a,to:b,hover:detail.hoverYakin,
        isaretler:(detail.points||[]).map(p=>({t:p.time,saved:p.saved,aktif:p===sec}))});
      const ra=root.querySelector('[data-zoombas]'), rb=root.querySelector('[data-zoomson]');
      if(ra)ra.textContent=mmss(a); if(rb)rb.textContent=mmss(b);
    }
    // Çalan yer bir işaretin ±1,5 sn yakınındaysa o işaret ve klasörü "şimdi çalıyor" ışığı alır.
    const cur=detail.curTime||0;
    (detail.points||[]).forEach(p=>{
      const yakinda=!!detail.playing&&Math.abs(cur-p.time)<=1.5;
      root.querySelector(`[data-tdmark="${p.localId}"]`)?.classList.toggle('caliyor',yakinda);
      root.querySelector(`[data-tdsec="${p.localId}"]`)?.classList.toggle('caliyor',yakinda);
    });
  }

  // Bilgilendirme yazısı: kapalı başlar, tercih bu cihazda hatırlanır.
  const BILGI_ANAHTAR='derin:dalga-bilgi-acik';
  let bilgiAcik=false;
  try{ bilgiAcik=localStorage.getItem(BILGI_ANAHTAR)==='1'; }catch{}

  // Zemin paleti: kapalıyken yalnız seçili rengi gösteren küçük düğme; açıkken hazır
  // renkler + kaydedilmiş özel renkler + "+" (yeni renk kaydet).
  function paletHtml(){
    const sw=(kod,renk,ad,ozel)=>`<span class="td-zemin-kap"><button type="button" role="radio" aria-checked="${kod===zeminKodu}" class="td-zemin${kod===zeminKodu?' secili':''}" data-tdzemin="${kod}" style="--z:${renk}" title="${ad}" aria-label="${ad}"></button>${ozel?`<button type="button" class="td-zemin-sil" data-tdzeminsil="${renk}" aria-label="${ad} rengini sil" title="Sil">×</button>`:''}</span>`;
    return `<div class="td-zeminler${paletAcik?' acik':''}">
      <button type="button" class="td-zemin-ac" data-tdzeminac aria-expanded="${paletAcik}" aria-controls="td-palet" aria-label="Zemin rengi" title="Zemin rengi"><i style="--z:${zeminHex()}"></i></button>
      <div class="td-palet" id="td-palet" role="radiogroup" aria-label="Dalga formu arka plan rengi"${paletAcik?'':' hidden'}>
        ${ZEMINLER.map(z=>sw(z.k,z.renk,z.ad,false)).join('')}
        ${ozelRenkler.length?'<span class="td-palet-ayrac" aria-hidden="true"></span>':''}
        ${ozelRenkler.map(h=>sw('ozel:'+h,h,'Kendi rengin '+h,true)).join('')}
        ${ozelRenkler.length<OZEL_EN_COK?`<label class="td-zemin-ekle" title="Kendi rengini kaydet" aria-label="Kendi rengini kaydet">+<input type="color" data-tdzeminekle value="${zeminHex()}"></label>`:''}
      </div>
    </div>`;
  }

  const yazarAdi=(id,project)=>{
    if(id===me)return 'Sen';
    if(project&&id===project.coach_id)return admin?(names[id]||'Antrenör'):'Sen';
    return 'Derin Record';
  };
  const GENEL='__genel';
  const genelSecili=()=>detail.selPointLocalId===GENEL;

  const klasorIkon='<svg viewBox="0 0 20 16" width="15" height="12" aria-hidden="true"><path d="M1 3.2C1 2 2 1 3.2 1h4.3l2 2.2h7.3C18 3.2 19 4.2 19 5.4v7.4c0 1.2-1 2.2-2.2 2.2H3.2C2 15 1 14 1 12.8z" fill="currentColor"/></svg>';

  function klasorSekmesi(p){
    const aktif=p.localId===detail.selPointLocalId;
    const ses=p.voiceUrl||p.voiceBlobUrl;
    return `<button type="button" role="tab" aria-selected="${aktif}" class="td-sekme ${p.saved?'saved':'draft'}${aktif?' aktif':''}" data-tdsec="${p.localId}">
      <span class="td-sekme-ikon">${klasorIkon}</span>
      <span class="td-sekme-no">${noktaNo(p)}</span>
      <span class="td-sekme-zaman" data-sekmezaman="${p.localId}">${mmssOnda(p.time)}</span>
      <span class="td-sekme-durum">${p.saved?'KAYITLI':'TASLAK'}${ses?' · SESLİ':''}</span>
    </button>`;
  }

  function genelSekmesi(){
    const n=(detail.genelNotlar||[]).length, aktif=genelSecili();
    return `<button type="button" role="tab" aria-selected="${aktif}" class="td-sekme genel${n?' saved':''}${aktif?' aktif':''}" data-tdsec="${GENEL}">
      <span class="td-sekme-ikon">${klasorIkon}</span>
      <span class="td-sekme-no">GENEL</span>
      <span class="td-sekme-zaman">${n}</span>
      <span class="td-sekme-durum">PARÇANIN GENELİ</span>
    </button>`;
  }
  function genelGovdesi(){
    const notlar=detail.genelNotlar||[];
    return `<div class="td-klasor genel" role="tabpanel">
      <div class="td-klasor-ust"><div>
        <p class="td-klasor-etiket">GENEL KLASÖR · BELİRLİ BİR ANA BAĞLI OLMAYAN NOTLAR</p>
      </div></div>
      ${notlar.length?`<ul class="td-genel-liste">${notlar.map(f=>`<li><span class="fb-av${f.author_id===detail.proje?.coach_id?'':' stu'}" aria-hidden="true">${safe(yazarAdi(f.author_id,detail.proje).charAt(0).toLocaleUpperCase('tr-TR'))}</span>
        <div class="fb-govde">${safe(f.body||'')}<small>${safe(yazarAdi(f.author_id,detail.proje))} · ${safe(goreli(f.created_at))}</small></div></li>`).join('')}</ul>`
        :'<p class="td-empty">Bu klasörde henüz not yok.</p>'}
      <div class="fb-yaz td-genel-yaz"><textarea data-tdgenelnot rows="1" placeholder="Parçanın geneli için not yaz…" aria-label="Parçanın geneli için not"></textarea>
        <button type="button" data-tdgenelgonder>GÖNDER</button></div>
    </div>`;
  }

  // Açık klasör: yakın plan dalga + o noktanın notu.
  function klasorGovdesi(p){
    if(!p)return '';
    return `<div class="td-klasor ${p.saved?'saved':'draft'}" role="tabpanel" data-tdpoint="${p.localId}">
      <div class="td-klasor-ust">
        <div>
          <p class="td-klasor-etiket">KLASÖR ${noktaNo(p)} · ${p.saved?('NOT · '+safe(yazarAdi(p.yazar,detail.proje).toLocaleUpperCase('tr-TR'))+(p.tarih?' · '+safe(goreli(p.tarih).toLocaleUpperCase('tr-TR')):'')):'TASLAK NOT'}</p>
          <p class="td-klasor-zaman">${!tasinabilir(p)?`<span class="td-point-time" data-klasorzaman>${mmssOnda(p.time)}</span>`
            :`<input class="td-zaman-kutu" data-klasorzaman data-tdzamanyaz inputmode="decimal" value="${mmssOnda(p.time)}" aria-label="İşaret zamanı (dakika:saniye,onda bir)" title="Zamanı yaz, işaret oraya taşınır">`}</p>
        </div>
        <div class="td-klasor-arac">
          <button type="button" class="td-dinle" data-tdburadan="${p.localId}" aria-label="${detail.playing?'Durdur':'Bu noktadan çal'}" title="${detail.playing?'Durdur':'Bu noktadan çal'}">${detail.playing?'❚❚':'▶'}</button>
          ${!p.saved?`<button type="button" class="td-point-del" data-tdpointdel="${p.localId}">SİL</button>`:''}
        </div>
      </div>
      <div class="td-zoom">
        <canvas class="td-zoom-canvas" data-tdzoom></canvas>
        <div class="td-zoom-cetvel"><span data-zoombas>0:00</span><span>YAKIN PLAN · ${YAKIN_PLAN} SN</span><span data-zoomson>0:00</span></div>
      </div>
      ${tasinabilir(p)?`<div class="td-ince"><span>İNCE AYAR</span>
        <button type="button" data-tdkaydir="-1">−1 sn</button><button type="button" data-tdkaydir="-0.1">−0,1</button>
        <button type="button" data-tdkaydir="0.1">+0,1</button><button type="button" data-tdkaydir="1">+1 sn</button>
        <button type="button" data-tdsuana>ÇALAN YERE TAŞI</button></div>`:''}
      <textarea class="td-point-note" placeholder="Bu noktada ne değişsin? (ör. davul daha sert girsin)" data-tdpointnote="${p.localId}" ${p.saved?'disabled':''}>${safe(p.body||'')}</textarea>
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
    if(!genelSecili()&&!seciliNokta())detail.selPointLocalId=points.length?sirali()[0].localId:GENEL;
    const draftCount=points.filter(p=>!p.saved).length;
    const savedCount=points.filter(p=>p.saved).length;
    const D=detail.peaks, dalgaTam=!!(D&&D.n&&D.hazir>=D.n), dalgaVar=!!(D&&D.hazir>0&&(detail.duration||D.duration));
    const waveState=!has?'':(detail.dalgaHata&&!dalgaVar?'DALGA FORMU ÇIKARILAMADI':(dalgaTam?'DALGA FORMU HAZIR':('DALGA FORMU YÜKLENİYOR · %'+Math.floor(detail.dalgaYuzde||0))));
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
        ${admin?`<label class="td-tool-upload">${has?'YENİ VARYASYON EKLE':'SES DOSYASI YÜKLE'}<input type="file" accept="${SES_ACCEPT}" data-newver="${tr.id}" hidden></label>`:''}
        ${(admin && has)?`<button type="button" class="td-tool-del" data-trackdel="${tr.id}" data-path="${safe(tr.audio_path)}">PARÇAYI SİL</button>`:''}
      </div>

      <hr class="td-divider">

      <div class="td-shape-head">
        <div class="td-shape-sol">
          <p class="td-eyebrow">BİRLİKTE ŞEKİLLENDİRELİM</p>
          <button type="button" class="td-bilgi-ac" data-tdbilgi aria-expanded="${bilgiAcik}" aria-controls="td-bilgi">ⓘ NASIL KULLANILIR <b aria-hidden="true">${bilgiAcik?'▴':'▾'}</b></button>
        </div>
        ${waveState?`<span class="td-badge">${waveState}</span>`:''}
      </div>
      <div class="td-desc" id="td-bilgi"${bilgiAcik?'':' hidden'}>
        <p><strong>Dinle:</strong> Dalgaya dokun, o yerden çalar.</p>
        <p><strong>İşaretle:</strong> Değişmesini istediğin yerde <strong>+ İŞARET KOY</strong>'a bas; her işaret kendi klasöründe notunu tutar. Taslak işaretleri sürükleyerek ya da ince ayarla kaydırabilirsin.${admin?' Kayıtlı işaretleri de taşıyabilirsin; yeni yeri kendiliğinden kaydedilir.':''}</p>
        <p><strong>Yakınlaştır:</strong> − / + düğmeleri, telefonda iki parmak, bilgisayarda Ctrl/⌘ + tekerlek. Yakınken sağa-sola sürükleyerek gezin.</p>
        <p><strong>Renk:</strong> Alttaki yuvarlak simgeden dalganın zemin rengini seç.</p>
      </div>

      ${has?`
      <div class="td-wave-wrap${dalgaVar?'':' yukleniyor'}" data-tdwave>
        <canvas class="td-wave-canvas"></canvas>
        ${dalgaVar||detail.dalgaHata?'':`<div class="td-iskelet" aria-hidden="true">${Array.from({length:64},(_,i)=>`<i style="--h:${18+Math.round(Math.abs(Math.sin(i*1.7)*Math.cos(i*.45))*70)}%;--g:${(i%16)*60}ms"></i>`).join('')}</div>
        <p class="td-iskelet-yazi" role="status">Dalga formu yükleniyor<br><small>Birazdan soldan sağa çizilmeye başlar.</small></p>`}
        <div class="td-hover" data-tdhover hidden></div>
        <div class="td-marks">
          ${sirali().map(p=>{ const [ga,gb]=gorAralik(), guz=Math.max(.001,gb-ga), dis=p.time<ga-1e-6||p.time>gb+1e-6;
            return `<div class="td-mark ${p.saved?'saved':'draft'}${tasinabilir(p)?' surukle':''} ${p.localId===detail.selPointLocalId?'active':''}${dis?' disarida':''}" style="left:${(p.time-ga)/guz*100}%" data-tdmark="${p.localId}" title="${mmss(p.time)}">
            <span class="td-mark-badge">${noktaNo(p)}</span>
            <span class="td-mark-line"></span>
          </div>`;}).join('')}
        </div>
        <div class="td-cetvel">${cetvelHtml()}</div>
        <div class="td-genel" data-tdgenel${yakinMi()?'':' hidden'} title="Parçanın neresindesin — sürükleyerek kaydır"><i style="left:${toplamSure()?gorAralik()[0]/toplamSure()*100:0}%;width:${toplamSure()?Math.max(2,(gorAralik()[1]-gorAralik()[0])/toplamSure()*100):100}%"></i></div>
      </div>
      <div class="td-dalga-arac">
        <div class="td-zoom-dug" role="group" aria-label="Dalga formunu yakınlaştır">
          <button type="button" data-tdzoom-out aria-label="Uzaklaştır" title="Uzaklaştır"${yakinMi()?'':' disabled'}>−</button>
          <span data-tdgorsure aria-live="polite">${yakinMi()?sureYazi(gorAralik()[1]-gorAralik()[0]):'TÜMÜ'}</span>
          <button type="button" data-tdzoom-in aria-label="Yakınlaştır" title="Yakınlaştır">+</button>
          <button type="button" class="td-zoom-tum" data-tdzoom-fit aria-label="Tamamını göster" title="Tamamını göster"${yakinMi()?'':' disabled'}>⤢</button>
        </div>
        ${paletHtml()}
      </div>

      <div class="td-addbtn-row">
        <button type="button" class="td-addbtn" data-tdaddpoint>+ İŞARET KOY · <span data-tdaddzaman>${mmss(cur)}</span></button>
        <span class="td-legend"><i class="td-legend-dot draft"></i> taslak <i class="td-legend-dot saved"></i> kayıtlı <i class="td-legend-dot aktif"></i> açık klasör · ${draftCount} taslak · ${savedCount} kayıtlı</span>
      </div>

      <div class="td-klasorler">
        <p class="td-klasorler-baslik">NOT KLASÖRLERİ <i>${points.length+(detail.genelNotlar||[]).length}</i></p>
        <div class="td-sekmeler" role="tablist">${genelSekmesi()}${sirali().map(klasorSekmesi).join('')}</div>
        ${genelSecili()?genelGovdesi():klasorGovdesi(seciliNokta())}
        ${points.length?'':'<p class="td-empty">İşaretli bir yere not bırakmak için dinlerken “+ İşaret koy”a bas; o not kendi klasöründe durur.</p>'}
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
    const ekle=root.querySelector('[data-tdaddzaman]'); if(ekle)ekle.textContent=mmss(detail.curTime);
    if(yakinMi()){ const once=gorAralik()[0]; takipEt(); if(gorAralik()[0]!==once)gorunumUygula(); }
    root.querySelectorAll('[data-tdburadan]').forEach(b=>{ const t=detail.playing?'❚❚':'▶'; if(b.textContent!==t){ b.textContent=t; const e=detail.playing?'Durdur':'Bu noktadan çal'; b.setAttribute('aria-label',e); b.title=e; } });
    const playBtn=root.querySelector('[data-tdplay]'); if(playBtn)playBtn.textContent=detail.audioEl?(detail.playing?'❚❚':'▶'):(detail.sesYuzde!=null?'%'+detail.sesYuzde:'…');
    cizimIste();
  }

  async function openTrackDetail(tr,project){
    openTrackId=tr.id;
    const yol=tr.audio_path;
    detail={points:[],peaks:null,duration:0,curTime:0,selPointLocalId:null,playing:false,audioEl:null,dalgaYuzde:0,dalgaHata:false,sesYuzde:null};
    syncSavedPoints(tr,project);
    const halaAcik=()=>openTrackId===tr.id;
    const dalgaKoy=v=>{ if(!v)return; detail.peaks=v; if(!detail.duration&&v.duration)detail.duration=v.duration; };
    // 1) Tarayıcı belleği: ekran ilk anda dalgayla açılır.
    if(yol)dalgaKoy(dalgaOku(yol));
    render();

    // Sesli notların adresleri arka planda.
    const sesliNotlar=Promise.all(detail.points.filter(p=>p.voicePath).map(async p=>{
      try{const r=await client.storage.from('project-voice-notes').createSignedUrl(p.voicePath,3600); p.voiceUrl=r.data?.signedUrl||null;}catch{}
    }));
    if(!yol){ await sesliNotlar; if(halaAcik())renderDetail(tr,project); return; }

    // 2) Yan dosya (küçük özet) — sesle AYNI ANDA istenir, sesi beklemez.
    const gerekYan=!detail.peaks||detail.peaks.eski;
    const yanSozu=gerekYan?yanDosyaOku(yol).then(v=>{
      if(!v||!halaAcik())return;
      if(!detail.peaks||detail.peaks.eski||detail.peaks.hazir<detail.peaks.n){
        if(detail.peaks&&!detail.peaks.eski&&v.eski)return; // yarım yeni veri, eski özetten iyidir
        dalgaKoy(v); if(!v.eski)dalgaYaz(yol,v); renderDetail(tr,project);
      }
    }):Promise.resolve();

    const oynaticiKur=url=>{
      const audio=new Audio(url);
      audio.preload='metadata';
      detail.audioEl=audio; detail.sesYuzde=null;
      audio.addEventListener('loadedmetadata',()=>{ if(!detail.duration)detail.duration=audio.duration; updateDetailProgress(); });
      audio.addEventListener('timeupdate',()=>{ detail.curTime=audio.currentTime; updateDetailProgress(); });
      audio.addEventListener('play',()=>{ detail.playing=true; updateDetailProgress(); });
      audio.addEventListener('pause',()=>{ detail.playing=false; updateDetailProgress(); });
      audio.addEventListener('ended',()=>{ detail.playing=false; updateDetailProgress(); });
      if(detail.curTime)try{audio.currentTime=detail.curTime;}catch{}
    };

    const parcali=Ses.parcaliMi(yol);
    // Tek parça: oynatıcı imzalı adresle hemen açılır (tarayıcı akışla çalar).
    if(!parcali){
      const url=await signed(yol);
      if(!halaAcik())return;
      if(url)oynaticiKur(url);
      renderDetail(tr,project);
    }

    // Yan dosya cevabını kısa süre bekle: varsa sesi dalga için indirmeye gerek yok.
    await Promise.race([yanSozu,new Promise(r=>setTimeout(r,1500))]);
    if(!halaAcik())return;
    const dalgaGerek=()=>!detail.peaks||detail.peaks.eski;

    // 3) Ses indirmesi: parçalıysa oynatma için zaten gerekli; değilse yalnız dalga eksikse.
    if(parcali||dalgaGerek()){
      let akis=null, ilkBaytlar=true, sonCizim=0;
      const dalgaIcin=dalgaGerek();
      const blob=await sesAkisIndir(yol,{
        sakla:parcali||true,
        dilim:b=>{
          if(!dalgaIcin||!halaAcik())return;
          if(ilkBaytlar){ ilkBaytlar=false; if(Dalga&&Dalga.wavMi(b))akis=Dalga.wavAkis(Dalga.HZ); }
          if(!akis)return;
          akis.ekle(b);
          const v=akis.veri();
          if(v&&v.hazir>0&&dalgaGerek()||v&&detail.peaks===v){
            const ilk=detail.peaks!==v;
            if(ilk){ dalgaKoy(v); renderDetail(tr,project); }
            const simdi=Date.now(); if(simdi-sonCizim>120){ sonCizim=simdi; cizimIste(); }
          }
        },
        ilerleme:oran=>{
          const y=Math.min(99,Math.floor(oran*100));
          detail.dalgaYuzde=y; if(parcali&&!detail.audioEl)detail.sesYuzde=y;
          const el=document.querySelector('[data-tdplay]'); if(el&&!detail.audioEl)el.textContent='%'+y;
          cizimIste();
        }
      }).catch(e=>{ detail.dalgaHata=true; return null; });
      if(!halaAcik())return;
      detail.dalgaYuzde=100;
      if(parcali&&blob){
        if(aktifBlobUrl){ try{URL.revokeObjectURL(aktifBlobUrl);}catch{} }
        aktifBlobUrl=URL.createObjectURL(blob);
        oynaticiKur(aktifBlobUrl);
      }
      if(dalgaIcin){
        try{
          let v=akis?akis.bitir():null;
          if(!v&&blob)v=await dalgaCikar(await blob.arrayBuffer());
          if(v&&halaAcik()&&(dalgaGerek()||detail.peaks===v||detail.peaks===(akis&&akis.veri()))){
            dalgaKoy(v); dalgaYaz(yol,v); yanDosyaYaz(yol,v);
          }
        }catch{ if(!detail.peaks)detail.dalgaHata=true; }
      }
      if(halaAcik())renderDetail(tr,project);
    }
    await sesliNotlar;
    if(halaAcik()&&detail.points.some(p=>p.voiceUrl))renderDetail(tr,project);
  }

  function closeTrackDetail(){
    if(detail.audioEl){try{detail.audioEl.pause();}catch{}}
    openTrackId=null; detail={};
    render();
  }

  // Palet yalnız kendi kutusunda yeniden çizilir: dalga, not ve oynatıcı yerinde kalır.
  function paletYenile(root){
    const eski=root.querySelector('.td-zeminler'); if(!eski)return;
    const kap=document.createElement('div'); kap.innerHTML=paletHtml();
    const yeni=kap.firstElementChild; eski.replaceWith(yeni); paletBagla(root);
  }
  function zeminSec(root,kod){
    zeminKodu=kod; RENK=renkler();
    try{localStorage.setItem(ZEMIN_ANAHTAR,zeminKodu);}catch{}
    paletYenile(root); cizimYenile();
  }
  function paletBagla(root){
    const ac=root.querySelector('[data-tdzeminac]');
    if(ac)ac.onclick=()=>{ paletAcik=!paletAcik; try{localStorage.setItem(ACIK_ANAHTAR,paletAcik?'1':'0');}catch{} paletYenile(root); };
    root.querySelectorAll('[data-tdzemin]').forEach(b=>b.onclick=()=>zeminSec(root,b.dataset.tdzemin));
    root.querySelectorAll('[data-tdzeminsil]').forEach(b=>b.onclick=()=>{
      const h=b.dataset.tdzeminsil;
      ozelRenkler=ozelRenkler.filter(x=>x!==h); ozelKaydet();
      zeminSec(root,zeminKodu==='ozel:'+h?'arduvaz':zeminKodu);
    });
    const ekle=root.querySelector('[data-tdzeminekle]');
    if(ekle){
      // Seçerken dalga canlı önizlenir; seçim bitince (change) renk kaydedilir.
      ekle.oninput=()=>{ if(!hexMi(ekle.value))return; const onceki=zeminKodu; zeminKodu='ozel:'+ekle.value.toLowerCase(); RENK=renkler(); cizimYenile(); zeminKodu=onceki; };
      ekle.onchange=()=>{
        const h=String(ekle.value).toLowerCase(); if(!hexMi(h))return;
        if(!ozelRenkler.includes(h)){ ozelRenkler.push(h); if(ozelRenkler.length>OZEL_EN_COK)ozelRenkler.shift(); ozelKaydet(); }
        zeminSec(root,'ozel:'+h);
      };
    }
  }

  // Taslak işaretleri herkes, kayıtlı işaretleri yalnız yönetici taşır
  // (veritabanında notu güncelleme izni yalnız yöneticide).
  const tasinabilir=p=>!!p&&(!p.saved||admin);
  let kayitZamanlayici=null;
  function zamaniKaydet(p){
    if(!p||!p.saved||!p.dbId||!admin)return;
    clearTimeout(kayitZamanlayici);
    kayitZamanlayici=setTimeout(async()=>{
      const eski=p.kayitliZaman, yeni=Math.round(p.time*10)/10;
      if(eski!=null&&Math.abs(eski-yeni)<0.05)return;
      const kayit=Object.values(feedback).flat().find(f=>f.id===p.dbId);
      const uygula=async(deger)=>{
        await tekSatir(client.from('project_feedback').update({start_sec:deger}).eq('id',p.dbId),'Not bulunamadı ya da taşıma yetkin yok.');
        p.kayitliZaman=deger; if(kayit)kayit.start_sec=deger;
      };
      try{
        await uygula(yeni);
        bildir(`İşaret ${mmssOnda(yeni)} konumuna taşındı.`,'ok',{etiket:'GERİ AL',is:async()=>{
          await uygula(eski); p.time=eski; canliKonum(p); bildir('Geri alındı: '+mmssOnda(eski),'ok');
        }});
      }catch(e){
        if(eski!=null){ p.time=eski; canliKonum(p); }
        bildir('İşaret taşınamadı: '+e.message,'hata');
      }
    },600);
  }

  // İşaret sürükleme belge düzeyinde izlenir: seçim değişince ekran yeniden
  // çizilse bile sürükleme kopmaz.
  let surukleme=null, surukleKurulu=false;
  let sikistirmaOldu=false; // iki parmak hareketi sırasında işaret dokunuşları yok sayılır
  function canliKonum(p){
    const root=document.querySelector('.track-detail'); if(!root)return;
    const m=root.querySelector(`[data-tdmark="${p.localId}"]`);
    if(m&&detail.duration){const [ga,gb]=gorAralik(); m.style.left=((p.time-ga)/Math.max(.001,gb-ga)*100)+'%'; m.title=mmss(p.time); m.classList.toggle('disarida',p.time<ga||p.time>gb);}
    const sz=root.querySelector(`[data-sekmezaman="${p.localId}"]`); if(sz)sz.textContent=mmssOnda(p.time);
    if(p===seciliNokta()){const kz=root.querySelector('[data-klasorzaman]');
      if(kz){ if(kz.tagName==='INPUT'){ if(document.activeElement!==kz)kz.value=mmssOnda(p.time); } else kz.textContent=mmssOnda(p.time); }}
    cizimYenile();
  }
  function surukleKur(){
    if(surukleKurulu||typeof document.addEventListener!=='function')return;
    surukleKurulu=true;
    document.addEventListener('pointermove',e=>{
      if(!surukleme||!detail.duration)return;
      if(sikistirmaOldu)return;
      const p=(detail.points||[]).find(x=>x.localId===surukleme.id);
      if(!tasinabilir(p))return;
      if(!surukleme.oynadi&&Math.abs(e.clientX-surukleme.baslaX)<4)return;
      surukleme.oynadi=true;
      const tuval=document.querySelector('.td-wave-canvas'); if(!tuval)return;
      const r=tuval.getBoundingClientRect(), [ga,gb]=gorAralik();
      p.time=ga+Math.min(1,Math.max(0,(e.clientX-r.left)/r.width))*(gb-ga);
      canliKonum(p);
    });
    const bitir=()=>{
      if(!surukleme)return;
      const {tr,project,oynadi,id,oncekiSec}=surukleme; surukleme=null;
      if(sikistirmaOldu){
        // Parmak işarete yanlışlıkla denk geldi: seçimi eski haline döndür, çalmaya dokunma.
        detail.selPointLocalId=oncekiSec;
        document.querySelectorAll('.td-mark').forEach(m=>m.classList.toggle('active',m.dataset.tdmark===oncekiSec));
        cizimIste(); return;
      }
      const p=(detail.points||[]).find(x=>x.localId===id);
      if(!oynadi&&p){ detail.curTime=p.time; if(detail.audioEl)detail.audioEl.currentTime=p.time; }
      if(oynadi&&p&&p.saved){ p.time=Math.round(p.time*10)/10; zamaniKaydet(p); }
      if(openTrackId)renderDetail(tr,project);
    };
    document.addEventListener('pointerup',bitir);
    document.addEventListener('pointercancel',bitir);
  }

  function wireDetail(tr,project){
    const root=document.querySelector('.track-detail');
    if(!root)return;
    root.querySelector('[data-tdback]').onclick=()=>closeTrackDetail();

    const audio=detail.audioEl;
    const playBtn=root.querySelector('[data-tdplay]');
    if(playBtn)playBtn.onclick=async()=>{ detail.takipKapali=false; if(!audio)return; if(audio.paused)await audio.play(); else audio.pause(); };
    const seek=root.querySelector('[data-tdseek]');
    if(seek)seek.oninput=()=>{ if(audio)audio.currentTime=parseFloat(seek.value); detail.curTime=parseFloat(seek.value); updateDetailProgress(); };
    const ana=root.querySelector('.td-wave-canvas');
    const zamanAl=(el,e,from,to)=>{const r=el.getBoundingClientRect();return from+Math.min(1,Math.max(0,(e.clientX-r.left)/r.width))*(to-from);};
    const git=t=>{ detail.curTime=Math.max(0,Math.min(detail.duration||0,t)); detail.takipKapali=false; if(audio)audio.currentTime=detail.curTime; updateDetailProgress(); };
    const hoverEl=root.querySelector('[data-tdhover]');
    paletBagla(root);
    const bilgiDug=root.querySelector('[data-tdbilgi]');
    if(bilgiDug)bilgiDug.onclick=()=>{
      bilgiAcik=!bilgiAcik; try{localStorage.setItem(BILGI_ANAHTAR,bilgiAcik?'1':'0');}catch{}
      const kutu=root.querySelector('#td-bilgi'); if(kutu)kutu.hidden=!bilgiAcik;
      bilgiDug.setAttribute('aria-expanded',String(bilgiAcik));
      const ok=bilgiDug.querySelector('b'); if(ok)ok.textContent=bilgiAcik?'▴':'▾';
    };
    if(ana&&detail.peaks){
      cizimYenile();
      // Dokunma sürerken ekran yeniden çizilebilir (indirme biter, not gelir…); olaylar eski
      // öğeye bağlı kalır. Ölçüler her zaman ekrandaki güncel dalgadan alınır.
      const canliTuval=()=>{ const c=document.querySelector('.td-wave-canvas'); return c&&c.isConnected?c:ana; };
      const imlecZamani=e=>{ const [ga,gb]=gorAralik(); return zamanAl(canliTuval(),e,ga,gb); };
      // Dokunuşlar: tek parmak kısa dokunuş → o yerden çal; yatay sürükleme → kaydır;
      // iki parmak → sıkıştırarak yakınlaştır/uzaklaştır (ve birlikte kaydır).
      const dokunan=new Map(); let hareket=null, sikistirma=null;
      // İki parmak: tarayıcılar ikinci parmağın işaretçi olaylarını her zaman göndermiyor;
      // sıkıştırma dokunma olaylarıyla okunur. Dikey sayfa kaydırması tek parmakta serbest kalır.
      const ikiParmak=e=>{ const r=canliTuval().getBoundingClientRect(); const [t1,t2]=[e.touches[0],e.touches[1]];
        return {orta:(t1.clientX+t2.clientX)/2, ara:Math.max(20,Math.abs(t1.clientX-t2.clientX)), r}; };
      const sikistirmaBasla=e=>{
        const {orta,ara,r}=ikiParmak(e), [ga,gb]=gorAralik();
        sikistirma={ara0:ara,merkez:ga+((orta-r.left)/r.width)*(gb-ga),ga,gb,gen:r.width,sol:r.left,orta0:orta};
        hareket={tur:'bitti'}; detail.elleKaydiriyor=true; sikistirmaOldu=true;
      };
      const alan=root.querySelector('[data-tdwave]')||ana; // dalga + işaretler
      alan.addEventListener('touchstart',e=>{
        if(e.touches.length<2)return;
        e.preventDefault(); sikistirmaBasla(e);
      },{passive:false});
      alan.addEventListener('touchmove',e=>{
        if(e.touches.length<2)return;
        e.preventDefault();
        if(!sikistirma){ sikistirmaBasla(e); return; } // ikinci parmak yalnız harekette bildirildiyse
        const {orta,ara}=ikiParmak(e), s0=sikistirma;
        const uz=Math.min(toplamSure(),Math.max(EN_DAR,(s0.gb-s0.ga)*s0.ara0/ara));
        const k=(orta-s0.sol)/s0.gen;
        elleGorunum(s0.merkez-k*uz,s0.merkez-k*uz+uz);
      },{passive:false});
      const dokunmaBitti=e=>{ if(!sikistirma)return; if(e.touches.length<2){ sikistirma=null; } if(!e.touches.length){ hareket=null; dokunan.clear(); detail.elleKaydiriyor=false; } };
      alan.addEventListener('touchend',dokunmaBitti); alan.addEventListener('touchcancel',dokunmaBitti);
      ana.onpointerdown=e=>{
        if(sikistirma)return;
        dokunan.set(e.pointerId,{x:e.clientX,y:e.clientY});
        try{ana.setPointerCapture(e.pointerId);}catch{}
        const [ga,gb]=gorAralik(), r=canliTuval().getBoundingClientRect();
        if(dokunan.size===1){ hareket={tur:'dokun',x0:e.clientX,y0:e.clientY,ga,gb,gen:r.width}; }
        else if(dokunan.size===2){
          const [p1,p2]=[...dokunan.values()];
          const orta=(p1.x+p2.x)/2, ara=Math.max(20,Math.abs(p1.x-p2.x));
          hareket={tur:'sikistir',ara0:ara,merkez:ga+((orta-r.left)/r.width)*(gb-ga),ga,gb,gen:r.width,sol:r.left};
          detail.elleKaydiriyor=true;
        }
      };
      ana.onpointermove=e=>{
        if(dokunan.has(e.pointerId))dokunan.set(e.pointerId,{x:e.clientX,y:e.clientY});
        if(hareket&&hareket.tur==='dokun'&&dokunan.size===1){
          const dx=e.clientX-hareket.x0, dy=e.clientY-hareket.y0;
          if(Math.abs(dx)>6&&Math.abs(dx)>Math.abs(dy)){
            if(yakinMi()){ hareket.tur='kaydir'; detail.elleKaydiriyor=true; }
            else hareket.tur='bitti'; // tam görünümde yana sürükleme çalmayı tetiklemesin
          } else if(Math.abs(dy)>10) hareket.tur='bitti'; // sayfayı kaydırıyor
        }
        if(hareket&&hareket.tur==='kaydir'){
          const uz=hareket.gb-hareket.ga, kay=-(e.clientX-hareket.x0)/hareket.gen*uz;
          elleGorunum(hareket.ga+kay,hareket.gb+kay); return;
        }
        if(hareket&&hareket.tur==='sikistir'&&dokunan.size>=2){
          const [p1,p2]=[...dokunan.values()];
          const ara=Math.max(20,Math.abs(p1.x-p2.x)), orta=(p1.x+p2.x)/2;
          const uz=Math.min(toplamSure(),Math.max(EN_DAR,(hareket.gb-hareket.ga)*hareket.ara0/ara));
          const k=(orta-hareket.sol)/hareket.gen;
          elleGorunum(hareket.merkez-k*uz,hareket.merkez-k*uz+uz); return;
        }
        if(e.pointerType==='touch')return;
        detail.hoverAna=imlecZamani(e);
        const [ga,gb]=gorAralik();
        if(hoverEl){hoverEl.hidden=false;hoverEl.textContent=(gb-ga<20?mmssOnda:mmss)(detail.hoverAna);hoverEl.style.left=((detail.hoverAna-ga)/Math.max(.001,gb-ga)*100)+'%';}
        cizimYenile();
      };
      const birak=e=>{
        dokunan.delete(e.pointerId);
        if(hareket&&hareket.tur==='dokun'&&e.type==='pointerup'&&!sikistirma)git(imlecZamani(e));
        if(!dokunan.size){ hareket=null; detail.elleKaydiriyor=false; }
        else if(hareket&&hareket.tur==='sikistir')hareket={tur:'bitti'}; // bir parmak kaldı: çalma tetiklenmesin
      };
      ana.onpointerup=birak; ana.onpointercancel=birak;
      ana.onpointerleave=e=>{ if(e.pointerType!=='touch'){detail.hoverAna=null;if(hoverEl)hoverEl.hidden=true;cizimYenile();} };
      // Trackpad sıkıştırma (tarayıcı ctrlKey ile bildirir) veya Ctrl/⌘ + tekerlek: imlecin olduğu yere yakınlaş.
      // Yatay kaydırma (iki parmakla yana) veya Shift + tekerlek: yakınken görünümü kaydır.
      ana.addEventListener('wheel',e=>{
        if(e.ctrlKey||e.metaKey){
          e.preventDefault();
          yakinlastir(Math.exp(Math.max(-1,Math.min(1,e.deltaY*0.01))),imlecZamani(e));
          return;
        }
        const yatay=Math.abs(e.deltaX)>Math.abs(e.deltaY)?e.deltaX:(e.shiftKey?e.deltaY:0);
        if(yatay&&yakinMi()){
          e.preventDefault();
          const [ga,gb]=gorAralik(), kay=yatay/canliTuval().clientWidth*(gb-ga);
          elleGorunum(ga+kay,gb+kay);
        }
      },{passive:false});
      ana.onclick=null;
    }
    // Yakınlaştırma düğmeleri
    const zIn=root.querySelector('[data-tdzoom-in]'); if(zIn)zIn.onclick=()=>yakinlastir(0.5);
    const zOut=root.querySelector('[data-tdzoom-out]'); if(zOut)zOut.onclick=()=>yakinlastir(2);
    const zFit=root.querySelector('[data-tdzoom-fit]'); if(zFit)zFit.onclick=()=>gorunumAyarla(0,toplamSure());
    // Genel bakış çubuğu: tutup sürükle ya da bir yere dokun → görünüm oraya gider.
    const genel=root.querySelector('[data-tdgenel]');
    if(genel){
      let tut=null;
      const yerlestir=e=>{ const r=genel.getBoundingClientRect(), [ga,gb]=gorAralik(), uz=gb-ga;
        const t=Math.min(1,Math.max(0,(e.clientX-r.left)/r.width))*toplamSure()-(tut?tut.fark:uz/2); elleGorunum(t,t+uz); };
      genel.onpointerdown=e=>{ e.preventDefault(); try{genel.setPointerCapture(e.pointerId);}catch{}
        const r=genel.getBoundingClientRect(), [ga,gb]=gorAralik(), t=(e.clientX-r.left)/r.width*toplamSure();
        tut={fark:(t>=ga&&t<=gb)?t-ga:(gb-ga)/2}; detail.elleKaydiriyor=true; yerlestir(e); };
      genel.onpointermove=e=>{ if(tut)yerlestir(e); };
      genel.onpointerup=genel.onpointercancel=()=>{ tut=null; detail.elleKaydiriyor=false; };
    }
    const yakin=root.querySelector('[data-tdzoom]');
    if(yakin){
      yakin.onclick=e=>{const sp=seciliNokta();if(!sp)return;const [a,b]=yakinPencere(sp.time);git(zamanAl(yakin,e,a,b));};
      yakin.onpointermove=e=>{if(e.pointerType==='touch')return;const sp=seciliNokta();if(!sp)return;const [a,b]=yakinPencere(sp.time);detail.hoverYakin=zamanAl(yakin,e,a,b);cizimYenile();};
      yakin.onpointerleave=()=>{detail.hoverYakin=null;cizimYenile();};
    }

    // Klasör seçimi: klasör açılır, dalga o noktaya gider (çalma başlamaz).
    const sec=id=>{ detail.selPointLocalId=id; if(id===GENEL){ renderDetail(tr,project); return; } const p=seciliNokta();
      if(p){ detail.curTime=p.time; if(audio)audio.currentTime=p.time;
        const [ga,gb]=gorAralik(); if(yakinMi()&&(p.time<ga||p.time>gb)){ const uz=gb-ga; detail.gorunum={bas:p.time-uz/2,son:p.time+uz/2}; } }
      renderDetail(tr,project); };
    root.querySelectorAll('[data-tdsec]').forEach(b=>b.onclick=()=>sec(b.dataset.tdsec));

    // Klasördeki çal/durdur: çalıyorsa durdurur; duruyorsa işaretten 2 sn önceden çalar.
    root.querySelectorAll('[data-tdburadan]').forEach(b=>b.onclick=async()=>{
      const p=(detail.points||[]).find(x=>x.localId===b.dataset.tdburadan); if(!p||!audio)return;
      if(!audio.paused){ audio.pause(); return; }
      git(Math.max(0,p.time-2));
      try{await audio.play();}catch{}
    });

    // İnce ayar: işaret, sekme ve yakın plan anında güncellenir; kayıtlı işarette (yönetici) kaydedilir.
    const kaydir=yeni=>{
      const p=seciliNokta(); if(!tasinabilir(p))return;
      p.time=Math.round(Math.max(0,Math.min(detail.duration||0,yeni))*10)/10;
      // Çalma noktası da işaretle birlikte belirlenen saniyeye geçer: dinlerken tam o yer duyulur.
      detail.curTime=p.time; if(audio)audio.currentTime=p.time;
      canliKonum(p); updateDetailProgress();
      if(p.saved)zamaniKaydet(p);
    };
    // Zamanı elle yaz: geçerli bir zaman yazıldığı anda işaret oraya taşınır.
    const zamanKutu=root.querySelector('[data-tdzamanyaz]');
    if(zamanKutu){
      zamanKutu.oninput=()=>{ const v=zamanCoz(zamanKutu.value); zamanKutu.classList.toggle('hatali',v==null);
        if(v!=null&&v<=(detail.duration||Infinity))kaydir(v); };
      zamanKutu.onblur=()=>{ const p=seciliNokta(); if(p){zamanKutu.value=mmssOnda(p.time);zamanKutu.classList.remove('hatali');} };
      zamanKutu.onkeydown=e=>{ if(e.key==='Enter'){e.preventDefault();zamanKutu.blur();}
        if(e.key==='ArrowUp'||e.key==='ArrowDown'){e.preventDefault();const p=seciliNokta();if(p){kaydir(p.time+(e.key==='ArrowUp'?.1:-.1));zamanKutu.value=mmssOnda(p.time);}} };
    }
    root.querySelectorAll('[data-tdkaydir]').forEach(b=>b.onclick=()=>{const p=seciliNokta();if(p)kaydir(p.time+parseFloat(b.dataset.tdkaydir));});
    const suana=root.querySelector('[data-tdsuana]'); if(suana)suana.onclick=()=>kaydir(detail.curTime||0);

    // İşaret: dokununca klasörünü açar; taslaksa sürüklenir (yakın plan canlı izler).
    root.querySelectorAll('[data-tdmark]').forEach(el=>{
      el.onclick=e=>e.stopPropagation();
      el.addEventListener('pointerdown',e=>{
        e.preventDefault(); e.stopPropagation();
        const p=(detail.points||[]).find(x=>x.localId===el.dataset.tdmark); if(!p)return;
        sikistirmaOldu=false;
        surukleme={id:p.localId,tr,project,oynadi:false,baslaX:e.clientX,oncekiSec:detail.selPointLocalId};
        // Seçim hemen görünsün ama ekran yeniden kurulmasın: dokunma sürerken
        // ikinci parmak gelebilir (sıkıştırma). Tam çizim parmak kalkınca yapılır.
        if(detail.selPointLocalId!==p.localId){ detail.selPointLocalId=p.localId;
          root.querySelectorAll('.td-mark').forEach(m=>m.classList.toggle('active',m===el)); cizimIste(); }
      });
    });
    surukleKur();

    const addBtn=root.querySelector('[data-tdaddpoint]');
    if(addBtn)addBtn.onclick=()=>{
      detail.points=detail.points||[];
      const yeni={localId:newLocalId(),time:detail.curTime||0,body:'',voicePath:null,voiceUrl:null,voiceBlob:null,voiceBlobUrl:null,saved:false,recording:false};
      detail.points.push(yeni);
      detail.selPointLocalId=yeni.localId;
      renderDetail(tr,project);
    };

    root.querySelectorAll('[data-tdpointdel]').forEach(b=>b.onclick=()=>{
      detail.points=(detail.points||[]).filter(p=>p.localId!==b.dataset.tdpointdel);
      renderDetail(tr,project);
    });

    root.querySelectorAll('[data-tdpointnote]').forEach(ta=>ta.oninput=ta.onchange=()=>{
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
        }catch(e){ bildir('Mikrofona erişilemedi: '+e.message,'hata'); }
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
        bildir('Nokta gönderildi.','ok');
        await load();
      }catch(e){
        bildir('Gönderilemedi: '+e.message,'hata');
        b.disabled=false; b.textContent='KAYDET VE GÖNDER';
      }
    });

    root.querySelectorAll('[data-dl]').forEach(b=>b.onclick=async()=>{
      const ad=`${b.dataset.name}.${sesUzantisi(b.dataset.path)||'wav'}`;
      if(Ses.parcaliMi(b.dataset.path)){
        // Parçalı dosya: tüm parçaları indirip tarayıcıda birleştirerek ver.
        status.textContent='Parçalı dosya birleştiriliyor…';
        const blob=await sesBlob(b.dataset.path);
        if(!blob){bildir('İndirilemedi: parçalar okunamadı.','hata');return;}
        const url=URL.createObjectURL(blob);
        const a=document.createElement('a'); a.href=url; a.download=ad; a.click();
        setTimeout(()=>URL.revokeObjectURL(url),60000);
        status.textContent='İndirildi.';
        return;
      }
      const {data,error}=await client.storage.from('project-audio').createSignedUrl(b.dataset.path,600,{download:ad});
      if(error){bildir('İndirilemedi: '+error.message,'hata');return;}
      const a=document.createElement('a'); a.href=data.signedUrl; a.download=ad; a.click();
    });

    root.querySelectorAll('[data-trackdel]').forEach(button=>button.onclick=async()=>{
      if(!confirm('Bu parça ve ses dosyası silinsin mi?'))return;
      button.disabled=true;
      try{
        await tekSatir(client.from('project_tracks').delete().eq('id',button.dataset.trackdel),'Parça bulunamadı ya da silme yetkiniz yok.');
        await client.storage.from('project-audio').remove(sesYollari(button.dataset.path));
        bildir('Parça silindi.','ok');
        openTrackId=null; detail={};
        await load();
      }catch(error){bildir('Parça silinemedi: '+error.message,'hata');}
      finally{button.disabled=false;}
    });

    root.querySelectorAll('[data-newver]').forEach(inp=>inp.onchange=async()=>{
      const file=inp.files?.[0]; if(!file)return;
      if(!sesGecerli(file)){ bildir(`“${sesUzantisi(file.name)}” uzantısı desteklenmiyor. Desteklenen ses dosyaları: ${desteklenenMetin()}.`,'hata'); inp.value=''; return; }
      bildir('Yeni varyasyon ekleniyor… ('+dosyaBoyutu(file.size)+')','bilgi');
      inp.disabled=true;
      try{
        const up=await yukleSesParcali(`${project.coach_id}/${project.id}-${Date.now()}`,file,
          (i,n)=>{ bildir(`Yeni varyasyon ekleniyor… parça ${i}/${n} (${dosyaBoyutu(file.size)})`,'bilgi'); });
        if(up.error)throw up.error;
        const sortOrder=(tracks[project.id]||[]).length;
        const insertRes=await client.from('project_tracks').insert({
          project_id:project.id,label:tr.label||'Parça',audio_path:up.path,version:1,sort_order:sortOrder
        });
        if(insertRes.error)throw insertRes.error;
        await client.from('project_feedback').insert({project_id:project.id,author_id:me,kind:'system',
          body:`Yeni bir varyasyon eklendi (${tr.label||'parça'}). Lütfen inceleyiniz.`});
        bildir('Yeni varyasyon eklendi, antrenöre bildirildi.','ok');
        openTrackId=null; detail={};
        await load();
      }catch(e){
        bildir('Yükleme hatası: '+e.message,'hata');
        inp.disabled=false;
      }
    });

    const genelGonder=root.querySelector('[data-tdgenelgonder]');
    if(genelGonder)genelGonder.onclick=async()=>{
      const kutu=root.querySelector('[data-tdgenelnot]');
      const body=(kutu?.value||'').trim();
      if(!body){ kutu?.focus(); return; }   // boş not gönderilmez
      genelGonder.disabled=true;
      const {error}=await client.from('project_feedback').insert({project_id:project.id,author_id:me,track_id:tr.id,kind:'note',body});
      bildir(error?'Gönderilemedi: '+error.message:'Not GENEL klasörüne eklendi.',error?'hata':'ok');
      genelGonder.disabled=false;
      if(!error){ detail.selPointLocalId=GENEL; await load(); }
    };
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
      // Dosya seçilince, isim alanı boşsa proje adını dosya adından türet.
      // Böylece 'dosya + antrenör seç ve ✓ bas' akışı isim yazmadan da çalışır.
      const nfFile=list.querySelector('#proj-newfolder-file');
      const nfName=list.querySelector('#proj-newfolder-name');
      if(nfFile&&nfName)nfFile.onchange=()=>{
        const picked=nfFile.files?.[0];
        const noteEl=list.querySelector('#proj-newfolder-note');
        const errEl=list.querySelector('#proj-newfolder-error');
        if(picked&&!nfName.value.trim())nfName.value=picked.name.replace(/\.[^.]+$/,'').slice(0,120);
        if(noteEl){
          const parca=sesBuyuk(picked)?Ses.parcaSayisi(picked.size):0;
          noteEl.textContent=picked
            ? `${picked.name} · ${dosyaBoyutu(picked.size)}${parca>1?` · kayıpsız ${parca} parçaya bölünecek`:''}`
            : '';
        }
        if(errEl){
          if(picked&&!sesGecerli(picked)) errEl.textContent=`“${sesUzantisi(picked.name)}” uzantısı desteklenmiyor. Desteklenen ses dosyaları: ${desteklenenMetin()}.`;
          else if(errEl.textContent&&(!picked||sesGecerli(picked))) errEl.textContent='';
        }
      };
      const nfConfirm=list.querySelector('#proj-newfolder-confirm');
      if(nfConfirm)nfConfirm.onclick=async()=>{
        if(newFolderBusy)return;
        const nameInp=list.querySelector('#proj-newfolder-name');
        const fileInp=list.querySelector('#proj-newfolder-file');
        const coachSel=list.querySelector('#proj-newfolder-coach');
        const title=(nameInp?.value||'').trim();
        // Dosya, panel yeniden çizilmeden ÖNCE okunmalı: render() input'u DOM'dan
        // çıkarır ve Safari/iOS bu durumda FileList'i boşaltır (sessiz başarısızlık).
        const file=fileInp?.files?.[0]||null;
        // Panel yükleme boyunca HİÇ yeniden çizilmez: böylece dosya referansı kopmaz
        // (Safari/iOS detached input FileList'ini boşaltır) ve hatadan sonra kullanıcı
        // dosyayı yeniden seçmek zorunda kalmaz. Mesajlar doğrudan DOM'a yazılır.
        const nfError=text=>{ newFolderError=text; const el=list.querySelector('#proj-newfolder-error'); if(el)el.textContent=text; };
        const nfNote=text=>{ newFolderNote=text; const el=list.querySelector('#proj-newfolder-note'); if(el)el.textContent=text; };
        if(!title){ nfError('Klasöre önce bir isim ver.'); nameInp?.focus(); return; }
        let targetCoach=me;
        if(admin){
          targetCoach=coachSel?.value||'';
          if(!targetCoach){ nfError('Önce bir antrenör seç.'); coachSel?.focus(); return; }
        }
        if(file&&!sesGecerli(file)){
          nfError(`“${sesUzantisi(file.name)}” uzantısı desteklenmiyor. Desteklenen ses dosyaları: ${desteklenenMetin()}.`);
          return;
        }
        nfError('');
        nfNote(file?`${file.name} yükleniyor… (${dosyaBoyutu(file.size)})`:'Ses dosyası seçilmedi; klasör boş açılacak.');
        newFolderBusy=true;
        nfConfirm.disabled=true; nfConfirm.textContent='…';
        const bitti=()=>{ const btn=list.querySelector('#proj-newfolder-confirm'); if(btn){ btn.disabled=false; btn.textContent='✓'; } };
        let stage='kayıt', projectId=null, created=false;
        try{
          const {data:proj,error:projErr}=await client.from('music_projects')
            .insert({coach_id:targetCoach,title,status:'pending'}).select().single();
          if(projErr)throw new Error([projErr.message,tabloHint(projErr.message)].filter(Boolean).join(' '));
          if(!proj?.id)throw new Error('Proje kaydı oluşturulamadı.');
          projectId=proj.id; created=true;
          if(file){
            stage='ses yükleme';
            const up=await yukleSesParcali(`${targetCoach}/${proj.id}-${Date.now()}`,file,
              (i,n)=>nfNote(`${file.name} yükleniyor… parça ${i}/${n} (${dosyaBoyutu(file.size)})`));
            if(up.error)throw up.error;
            stage='parça kaydı';
            const trackResult=await client.from('project_tracks').insert({project_id:proj.id,label:title,audio_path:up.path,version:1,sort_order:0});
            if(trackResult.error)throw new Error(['Parça kaydı yazılamadı.',trackResult.error.message,tabloHint(trackResult.error.message)].filter(Boolean).join(' '));
          }
          newFolderOpen=false; newFolderNote='';
          bildir(file?'Yeni klasör ve ses dosyası oluşturuldu.':'Yeni klasör oluşturuldu.','ok');
          await load();
        }catch(e){
          // Panel açık kalır ve hata panelin içinde görünür; sayfa arkasındaki
          // durum satırı overlay yüzünden okunamıyordu.
          const reason=e?.message||'Bilinmeyen hata.';
          newFolderNote='';
          if(created){
            // Yarım kalan klasörü geri al: kullanıcı listede içi boş, kullanılamayan
            // bir proje görmesin (eski hatada tam olarak bu oluyordu).
            let geriSilindi=true;
            try{ await tekSatir(client.from('music_projects').delete().eq('id',projectId),'Yarım klasör geri alınamadı.'); }
            catch{ geriSilindi=false; }
            if(geriSilindi){
              nfError(`${stage} aşamasında hata: ${reason}`);
              nfNote(file?'Dosya seçili kaldı — ✓ düğmesiyle tekrar deneyebilirsin.':'');
              bildir(`${stage} aşamasında hata: ${reason}`,'hata');
            }else{
              // Silme yetkisi yoksa proje listede kalsın; parça sonradan eklenebilsin.
              newFolderOpen=false;
              nfError('');
              bildir(`Klasör açıldı ancak ses dosyası eklenemedi (${reason}). Projedeki “YENİ PARÇA EKLE” düğmesiyle tekrar deneyebilirsin.`,'hata');
              await load();
            }
          }else{
            nfError(`${stage} aşamasında hata: ${reason}`);
            nfNote(file?'Dosya seçili kaldı — ✓ düğmesiyle tekrar deneyebilirsin.':'');
            bildir('Klasör oluşturulamadı: '+reason,'hata');
          }
        }finally{
          newFolderBusy=false;
          bitti();
        }
      };
    }

    // Proje kartını katla/aç — başlık satırı tıklanabilir (klavyeyle de).
    list.querySelectorAll('[data-projfold]').forEach(head=>{
      const degistir=()=>{
        const id=head.dataset.projfold;
        katliProjeler[id]=!katliProjeler[id];
        katliKaydet();
        katlaUygula(head,!!katliProjeler[id]);
        tumunuKatlaEtiketiniYenile();
      };
      head.onclick=degistir;
      head.onkeydown=e=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); degistir(); } };
    });

    list.querySelectorAll('[data-tdopen]').forEach(el=>el.onclick=()=>{
      const trackId=el.dataset.tdopen;
      let tr=null,project=null;
      for(const p of projects){const t=(tracks[p.id]||[]).find(x=>x.id===trackId);if(t){tr=t;project=p;break;}}
      if(tr&&project)openTrackDetail(tr,project);
    });

    list.querySelectorAll('[data-stage]').forEach(s=>s.onchange=async()=>{
      s.disabled=true;
      try{
        await tekSatir(client.from('music_projects').update({status:s.value,updated_at:new Date().toISOString()}).eq('id',s.dataset.stage),'Aşama kaydedilemedi: kayıt bulunamadı ya da yetkiniz yok.');
        bildir('Aşama güncellendi.','ok');
      }catch(error){ bildir('Kaydedilemedi: '+error.message,'hata'); }
      s.disabled=false;load();
    });
    list.querySelectorAll('[data-dlallow]').forEach(b=>b.onclick=async()=>{
      const yeni = b.dataset.on!=='1';
      try{
        await tekSatir(client.from('music_projects').update({download_allowed:yeni}).eq('id',b.dataset.dlallow),'İndirme izni kaydedilemedi.');
        bildir(yeni?'İndirme izni verildi.':'İndirme izni kaldırıldı.','ok');
      }catch(error){ bildir('İndirme izni kaydedilemedi: '+error.message,'hata'); }
      load();
    });

    list.querySelectorAll('[data-dl]').forEach(b=>b.onclick=async()=>{
      const ad=`${b.dataset.name}.${sesUzantisi(b.dataset.path)||'wav'}`;
      if(Ses.parcaliMi(b.dataset.path)){
        // Parçalı dosya: tüm parçaları indirip tarayıcıda birleştirerek ver.
        status.textContent='Parçalı dosya birleştiriliyor…';
        const blob=await sesBlob(b.dataset.path);
        if(!blob){bildir('İndirilemedi: parçalar okunamadı.','hata');return;}
        const url=URL.createObjectURL(blob);
        const a=document.createElement('a'); a.href=url; a.download=ad; a.click();
        setTimeout(()=>URL.revokeObjectURL(url),60000);
        status.textContent='İndirildi.';
        return;
      }
      const {data,error}=await client.storage.from('project-audio').createSignedUrl(b.dataset.path,600,{download:ad});
      if(error){bildir('İndirilemedi: '+error.message,'hata');return;}
      const a=document.createElement('a'); a.href=data.signedUrl; a.download=ad; a.click();
    });
    list.querySelectorAll('[data-del]').forEach(b=>b.onclick=async()=>{
      if(!confirm('Proje silinecek. Emin misiniz?'))return;
      try{ await tekSatir(client.from('music_projects').delete().eq('id',b.dataset.del),'Proje bulunamadı ya da silme yetkiniz yok.'); bildir('Proje silindi.','ok'); }
      catch(error){ bildir('Proje silinemedi: '+error.message,'hata'); }
      load();
    });

    list.querySelectorAll('[data-addtrack]').forEach(inp=>inp.onchange=async()=>{
      const file=inp.files?.[0]; if(!file)return;
      const project=projects.find(p=>p.id===inp.dataset.addtrack); if(!project)return;
      if(!sesGecerli(file)){
        bildir(`“${sesUzantisi(file.name)}” uzantısı desteklenmiyor. Desteklenen ses dosyaları: ${desteklenenMetin()}.`,'hata');
        inp.value=''; return;
      }
      inp.disabled=true; bildir('Parça yükleniyor… ('+dosyaBoyutu(file.size)+')','bilgi');
      try{
        const uploaded=await yukleSesParcali(`${project.coach_id}/${project.id}-${Date.now()}`,file,
          (i,n)=>{ bildir(`Parça yükleniyor… parça ${i}/${n} (${dosyaBoyutu(file.size)})`,'bilgi'); });
        if(uploaded.error)throw uploaded.error;
        const label=file.name.replace(/\.[^.]+$/,'');
        const result=await client.from('project_tracks').insert({project_id:project.id,label,audio_path:uploaded.path,version:1,sort_order:(tracks[project.id]||[]).length});
        if(result.error)throw new Error(['Parça kaydı yazılamadı.',result.error.message,tabloHint(result.error.message)].filter(Boolean).join(' '));
        bildir('Yeni parça projeye eklendi.','ok'); load();
      }catch(error){bildir('Parça eklenemedi: '+error.message,'hata');}
      finally{inp.disabled=false;inp.value='';}
    });

    list.querySelectorAll('[data-trackdel]').forEach(button=>button.onclick=async()=>{
      if(!confirm('Bu parça ve ses dosyası silinsin mi?'))return;
      button.disabled=true;
      try{
        await tekSatir(client.from('project_tracks').delete().eq('id',button.dataset.trackdel),'Parça bulunamadı ya da silme yetkiniz yok.');
        // Parçalı dosyada tüm parçaları sil.
        await client.storage.from('project-audio').remove(sesYollari(button.dataset.path));
        bildir('Parça silindi.','ok'); load();
      }catch(error){bildir('Parça silinemedi: '+error.message,'hata');}
      finally{button.disabled=false;}
    });

    list.querySelectorAll('[data-newver]').forEach(inp=>inp.onchange=async()=>{
      const file=inp.files?.[0]; if(!file)return;
      const tid=inp.dataset.newver;
      const tr=Object.values(tracks).flat().find(t=>t.id===tid);
      const proj=projects.find(p=>p.id===tr.project_id);
      bildir('Varyasyon yükleniyor… ('+dosyaBoyutu(file.size)+')','bilgi');
      if(!sesGecerli(file)){ bildir(`“${sesUzantisi(file.name)}” uzantısı desteklenmiyor. Desteklenen ses dosyaları: ${desteklenenMetin()}.`,'hata'); inp.value=''; return; }
      const eskiParcalar=sesYollari(tr.audio_path);
      const up=await yukleSesParcali(`${proj.coach_id}/${tid}-${Date.now()}`,file,
        (i,n)=>{ bildir(`Varyasyon yükleniyor… parça ${i}/${n} (${dosyaBoyutu(file.size)})`,'bilgi'); });
      if(up.error){bildir('Yükleme hatası: '+up.error.message,'hata');return;}
      try{ await tekSatir(client.from('project_tracks').update({audio_path:up.path,version:(tr.version||1)+1}).eq('id',tid),'Varyasyon kaydedilemedi.'); }
      catch(error){ bildir('Varyasyon kaydedilemedi: '+error.message,'hata'); return; }
      // Yeni sürüm yazıldıktan sonra eski dosyayı (ve parçalarını) temizle.
      if(eskiParcalar.length){ try{ await client.storage.from('project-audio').remove(eskiParcalar); }catch{} }
      await client.from('project_feedback').insert({project_id:proj.id,author_id:me,kind:'system',
        body:`Parçanız düzenlenmiş haliyle gönderildi (v${(tr.version||1)+1} · ${tr.label||'parça'}). Lütfen inceleyiniz.`});
      bildir('Varyasyon gönderildi, antrenöre bildirildi.','ok');
      load();
    });

    list.querySelectorAll('[data-fbsend]').forEach(b=>b.onclick=async()=>{
      const box=list.querySelector(`[data-fb="${b.dataset.fbsend}"]`);
      const body=box.value.trim(); if(!body)return;
      b.disabled=true;
      const {error}=await client.from('project_feedback').insert({project_id:b.dataset.fbsend,author_id:me,body,kind:'note'});
      bildir(error?'Gönderilemedi: '+error.message:'Geri bildirim gönderildi.',error?'hata':'ok');
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
      bildir(error?'Gönderilemedi: '+error.message:'Not gönderildi.',error?'hata':'ok');
      if(!error && inp)inp.value='';
      b.disabled=false;
      load();
    });

    list.querySelectorAll('[data-play]').forEach(b=>b.onclick=async()=>{
      const id=b.dataset.play;
      if(cur&&cur.id===id){ if(cur.audio.paused){cur.audio.play();b.textContent='⏸';b.setAttribute('aria-label','Parçayı duraklat');}else{cur.audio.pause();b.textContent='▶';b.setAttribute('aria-label','Parçayı oynat');} return; }
      if(cur){cur.audio.pause();cur.btn.textContent='▶';cur.btn.setAttribute('aria-label','Parçayı oynat');}
      const url=await sesUrl(b.dataset.path); if(!url){bildir('Ses açılamadı.','hata');return;}
      const audio=new Audio(url);
      audio.onended=()=>{b.textContent='▶';b.setAttribute('aria-label','Parçayı oynat');cur=null;};
      await audio.play(); b.textContent='⏸'; b.setAttribute('aria-label','Parçayı duraklat'); cur={id,audio,btn:b};
    });
  }

  let cur=null;

  window.addEventListener('derin:authchange',()=>{
    if(!client)return;
    const currentUser=window.DerinAuth.user;
    if(!currentUser){ me=null; admin=false; }          // çıkış: kimliği sıfırla
    if(currentUser&&currentUser.id===me){ load(); return; }
    boot();                                            // giriş / kullanıcı değişimi
  });
  boot();
})();
