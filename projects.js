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
    const trs=tracks[p.id]||[], fbs=(feedback[p.id]||[]).filter(f=>f.start_sec==null);
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

  function bildir(metin,tur){
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
      clearTimeout(bildir._t); bildir._t=setTimeout(()=>{ const k=document.querySelector('#proj-bildirim'); if(k)k.remove(); },6000);
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

  function syncSavedPoints(tr,project){
    const fbs=(feedback[project.id]||[]).filter(f=>f.track_id===tr.id && f.start_sec!=null);
    const draftLocal=(detail.points||[]).filter(p=>!p.saved);
    const savedNow=fbs.map(f=>{
      const existing=(detail.points||[]).find(p=>p.dbId===f.id);
      return {localId:existing?existing.localId:'db-'+f.id,dbId:f.id,time:Number(f.start_sec),body:f.body||'',voicePath:f.voice_path||null,voiceUrl:existing?existing.voiceUrl:null,saved:true};
    });
    detail.points=[...savedNow,...draftLocal];
  }

  // ---------- Dalga formu: hızlı okuma + tarayıcıda saklama ----------
  // 1) WAV ise dalga-tepeleri.js başlığı okuyup örnekleri doğrudan tarar
  //    (decodeAudioData büyük WAV'da saniyeler sürüyordu).
  // 2) Sonuç tarayıcıda saklanır: aynı parça ikinci kez açılınca anında gelir.
  // 3) İndirme yüzdesi ekranda gösterilir.
  const Dalga=window.DerinDalga||null;
  const DALGA_ANAHTAR='derin:dalga:', DALGA_LISTE='derin:dalga-liste', DALGA_EN_COK=40;
  const dalgaBellek=new Map();
  function dalgaOku(yol){
    if(dalgaBellek.has(yol))return dalgaBellek.get(yol);
    try{ const r=Dalga&&Dalga.coz(localStorage.getItem(DALGA_ANAHTAR+yol)); if(r){dalgaBellek.set(yol,r);return r;} }catch{}
    return null;
  }
  function dalgaYaz(yol,veri){
    dalgaBellek.set(yol,veri);
    if(!Dalga)return;
    try{
      let liste=[]; try{liste=JSON.parse(localStorage.getItem(DALGA_LISTE)||'[]')||[];}catch{}
      liste=liste.filter(x=>x!==yol); liste.push(yol);
      while(liste.length>DALGA_EN_COK){ const eski=liste.shift(); try{localStorage.removeItem(DALGA_ANAHTAR+eski);}catch{} }
      const metin=Dalga.kodla(veri);
      // Depo dolarsa en eskileri silip bir kez daha dene.
      for(let deneme=0;deneme<3;deneme++){
        try{ localStorage.setItem(DALGA_ANAHTAR+yol,metin); break; }
        catch{ const eski=liste.shift(); if(!eski||eski===yol)break; try{localStorage.removeItem(DALGA_ANAHTAR+eski);}catch{} }
      }
      localStorage.setItem(DALGA_LISTE,JSON.stringify(liste));
    }catch{}
  }

  // Dalga özeti ses dosyasının yanında küçük bir dosya olarak durur:
  // "<ses yolu>.dalga" (~15 KB). Böylece 50 MB'lık sesi indirmeden dalga gelir.
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
      const metin=Dalga.kodla(veri);
      await client.storage.from('project-audio').upload(yanDosya(yol),new Blob([metin],{type:'application/octet-stream'}),
        {contentType:'application/octet-stream',upsert:true});
    }catch{ /* yan dosya yazılamazsa sayfa yine kendi hesaplar */ }
  }
  // Yükleme anında, elimizdeki dosyadan dalgayı çıkarıp hem tarayıcıya hem depoya yaz:
  // antrenör parçayı ilk açtığında dalga hazır bekler.
  async function dalgaOnHazirla(yol,dosya){
    if(!dosya||dosya.size>300*1024*1024)return; // çok büyük dosyada belleği zorlamayalım; ilk açılışta hesaplanır
    try{
      const veri=await tepelerCikar(await dosya.arrayBuffer());
      dalgaYaz(yol,veri); await yanDosyaYaz(yol,veri);
    }catch{}
  }

  async function indirIlerlemeli(url,ilerleme){
    const resp=await fetch(url);
    if(!resp.ok)throw new Error('Ses indirilemedi ('+resp.status+')');
    const toplam=Number(resp.headers.get('content-length'))||0;
    if(!resp.body||!toplam||!resp.body.getReader)return resp.arrayBuffer();
    const okuyucu=resp.body.getReader(), hedef=new Uint8Array(toplam);
    let gelen=0;
    for(;;){
      const {done,value}=await okuyucu.read(); if(done)break;
      if(gelen+value.length>hedef.length){ // sunucu farklı boy bildirdiyse güvenli yol
        const parcalar=[hedef.subarray(0,gelen),value]; let toplamYeni=gelen+value.length;
        for(;;){const r=await okuyucu.read(); if(r.done)break; parcalar.push(r.value); toplamYeni+=r.value.length;}
        const birlesik=new Uint8Array(toplamYeni); let o=0; for(const p of parcalar){birlesik.set(p,o);o+=p.length;}
        return birlesik.buffer;
      }
      hedef.set(value,gelen); gelen+=value.length;
      ilerleme&&ilerleme(gelen/toplam);
    }
    return hedef.buffer.slice(0,gelen);
  }

  async function computePeaks(url,ilerleme){
    return tepelerCikar(await indirIlerlemeli(url,ilerleme));
  }

  async function tepelerCikar(buf){
    const hizli=Dalga&&Dalga.wavTepeleri(buf,60);
    if(hizli)return hizli;
    // WAV değil (MP3/FLAC): tarayıcı çözücüsü.
    const Ctx=window.AudioContext||window.webkitAudioContext;
    const ctx=new Ctx();
    const audioBuf=await ctx.decodeAudioData(buf);
    const kanallar=[];
    for(let c=0;c<Math.min(2,audioBuf.numberOfChannels);c++)kanallar.push(audioBuf.getChannelData(c));
    const uzunluk=kanallar[0].length;
    const hedef=Math.max(200,Math.min(40000,Math.ceil(audioBuf.duration*60)));
    const blok=Math.max(1,Math.floor(uzunluk/hedef));
    const adim=Math.max(1,Math.floor(blok/96));
    const adet=Math.ceil(uzunluk/blok);
    const peaks=new Float32Array(adet);
    let enBuyuk=0;
    for(let i=0;i<adet;i++){
      let max=0; const start=i*blok, end=Math.min(uzunluk,start+blok);
      for(const d of kanallar)for(let j=start;j<end;j+=adim){const v=d[j]<0?-d[j]:d[j];if(v>max)max=v;}
      peaks[i]=max; if(max>enBuyuk)enBuyuk=max;
    }
    if(enBuyuk>0)for(let i=0;i<adet;i++)peaks[i]/=enBuyuk;
    const duration=audioBuf.duration;
    try{ctx.close();}catch{}
    return {peaks,duration};
  }

  const YAKIN_PLAN=8;            // klasördeki yakın plan dalga penceresi (saniye)
  const sirali=()=>[...(detail.points||[])].sort((a,b)=>a.time-b.time);
  const noktaNo=p=>String(sirali().indexOf(p)+1).padStart(2,'0');
  const seciliNokta=()=>(detail.points||[]).find(x=>x.localId===detail.selPointLocalId)||null;
  const yakinPencere=t=>{
    const dur=detail.duration||0, yarim=YAKIN_PLAN/2;
    let a=Math.max(0,t-yarim), b=Math.min(dur,a+YAKIN_PLAN); a=Math.max(0,b-YAKIN_PLAN);
    return [a,b];
  };

  // Tek çizim fonksiyonu: [from,to] aralığını çubuklarla çizer.
  // band: vurgulanan bölüm, isaretler: yakın plandaki çizgiler, hover: imleç zamanı.
  function drawWave(canvas,o){
    const peaks=detail.peaks, dur=detail.duration;
    if(!canvas||!peaks||!dur)return;
    const dpr=window.devicePixelRatio||1;
    const w=canvas.clientWidth||1, h=canvas.clientHeight||1;
    if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);}
    const ctx=canvas.getContext('2d');
    ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.clearRect(0,0,w,h);
    const from=o.from||0, to=o.to||dur, aralik=Math.max(.001,to-from);
    const x=t=>(t-from)/aralik*w;
    const cur=detail.curTime||0;

    if(o.band){
      const bx=Math.max(0,x(o.band[0])), bw=Math.min(w,x(o.band[1]))-bx;
      ctx.fillStyle='rgba(216,187,44,.09)'; ctx.fillRect(bx,0,bw,h);
      ctx.fillStyle='rgba(216,187,44,.5)'; ctx.fillRect(bx,0,1,h); ctx.fillRect(bx+bw-1,0,1,h);
    }

    const ince=w<520, barW=ince?2:2.6, bosluk=ince?1.4:1.8, adim=barW+bosluk;
    const n=Math.max(1,Math.floor(w/adim)), n0=peaks.length;
    const i0=from/dur*n0, perBar=(to-from)/dur*n0/n;
    const mid=h/2, tepe=h/2-3;
    const altin=ctx.createLinearGradient(0,0,0,h);
    altin.addColorStop(0,'#f2df7a'); altin.addColorStop(.5,'#d8bb2c'); altin.addColorStop(1,'#a88f1c');
    for(let k=0;k<n;k++){
      const a=Math.floor(i0+k*perBar), b=Math.max(a+1,Math.floor(i0+(k+1)*perBar));
      let m=0; for(let i=a;i<b&&i<n0;i++)if(peaks[i]>m)m=peaks[i];
      const yuk=Math.max(1.5,Math.pow(m,.85)*tepe);
      const tk=from+(k+.5)/n*aralik;
      const bandIci=o.band&&tk>=o.band[0]&&tk<=o.band[1];
      ctx.fillStyle=tk<=cur?altin:(bandIci?'rgba(244,241,233,.55)':'rgba(244,241,233,.24)');
      const bx=k*adim;
      if(ctx.roundRect){ctx.beginPath();ctx.roundRect(bx,mid-yuk,barW,yuk*2,barW/2);ctx.fill();}
      else ctx.fillRect(bx,mid-yuk,barW,yuk*2);
    }
    ctx.fillStyle='rgba(244,241,233,.08)'; ctx.fillRect(0,mid-.5,w,1);

    for(const im of (o.isaretler||[])){
      if(im.t<from||im.t>to)continue;
      const ix=x(im.t);
      ctx.fillStyle=im.aktif?'#cb2468':(im.saved?'#d8bb2c':'rgba(244,241,233,.75)');
      ctx.fillRect(ix-(im.aktif?1:.75),0,im.aktif?2:1.5,h);
    }
    if(o.hover!=null&&o.hover>=from&&o.hover<=to){
      ctx.fillStyle='rgba(244,241,233,.45)';
      for(let y=0;y<h;y+=6)ctx.fillRect(x(o.hover)-.5,y,1,3);
    }
    if(cur>=from&&cur<=to){
      ctx.fillStyle='#f4f1e9'; ctx.fillRect(x(cur)-1,0,2,h);
      ctx.beginPath(); ctx.arc(x(cur),3,3.5,0,Math.PI*2); ctx.fill();
    }
  }

  // Ana dalga + açık klasördeki yakın plan: oynatırken, sürüklerken ve imleçte anlık.
  function cizimYenile(){
    const root=document.querySelector('.track-detail'); if(!root||!detail.peaks)return;
    const sec=seciliNokta();
    const ana=root.querySelector('.td-wave-canvas');
    if(ana)drawWave(ana,{from:0,to:detail.duration,band:sec?yakinPencere(sec.time):null,hover:detail.hoverAna});
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

  // Açık klasör: yakın plan dalga + o noktanın notu.
  function klasorGovdesi(p){
    if(!p)return '';
    return `<div class="td-klasor ${p.saved?'saved':'draft'}" role="tabpanel" data-tdpoint="${p.localId}">
      <div class="td-klasor-ust">
        <div>
          <p class="td-klasor-etiket">KLASÖR ${noktaNo(p)} · ${p.saved?'KAYITLI NOT':'TASLAK NOT'}</p>
          <p class="td-klasor-zaman">${p.saved?`<span class="td-point-time" data-klasorzaman>${mmssOnda(p.time)}</span>`
            :`<input class="td-zaman-kutu" data-klasorzaman data-tdzamanyaz inputmode="decimal" value="${mmssOnda(p.time)}" aria-label="İşaret zamanı (dakika:saniye,onda bir)" title="Zamanı yaz, işaret oraya taşınır">`}</p>
        </div>
        <div class="td-klasor-arac">
          <button type="button" class="td-dinle" data-tdburadan="${p.localId}">▶ BURADAN DİNLE</button>
          ${!p.saved?`<button type="button" class="td-point-del" data-tdpointdel="${p.localId}">SİL</button>`:''}
        </div>
      </div>
      <div class="td-zoom">
        <canvas class="td-zoom-canvas" data-tdzoom></canvas>
        <div class="td-zoom-cetvel"><span data-zoombas>0:00</span><span>YAKIN PLAN · ${YAKIN_PLAN} SN</span><span data-zoomson>0:00</span></div>
      </div>
      ${!p.saved?`<div class="td-ince"><span>İNCE AYAR</span>
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
    if(points.length&&!seciliNokta())detail.selPointLocalId=sirali()[0].localId;
    const draftCount=points.filter(p=>!p.saved).length;
    const savedCount=points.filter(p=>p.saved).length;
    const waveState=!has?'':(detail.peaks?'DALGA FORMU HAZIR':(detail.dalgaHata?'DALGA FORMU ÇIKARILAMADI':'DALGA FORMU HAZIRLANIYOR'));
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
      <p class="td-desc">Dalgaya dokun, o yerden dinle. Değişmesini istediğin yerde <strong>+ İŞARET KOY</strong>'a bas; her işaret kendi klasöründe notunu tutar. Taslak işaretleri sürükleyerek kaydırabilirsin.</p>

      ${has?`
      <div class="td-wave-wrap${detail.peaks?'':' yukleniyor'}" data-tdwave>
        <canvas class="td-wave-canvas"></canvas>
        ${detail.peaks||detail.dalgaHata?'':`<div class="td-iskelet" aria-hidden="true">${Array.from({length:64},(_,i)=>`<i style="--h:${18+Math.round(Math.abs(Math.sin(i*1.7)*Math.cos(i*.45))*70)}%;--g:${(i%16)*60}ms"></i>`).join('')}</div>
        <p class="td-iskelet-yazi" role="status">Dalga formu hazırlanıyor · <span data-dalgayuzde>${detail.dalgaYuzde==null?'':('%'+detail.dalgaYuzde)}</span><br><small>Bu sırada parçayı dinleyebilirsin.</small></p>`}
        <div class="td-hover" data-tdhover hidden></div>
        <div class="td-marks">
          ${sirali().map(p=>`<div class="td-mark ${p.saved?'saved':'draft'} ${p.localId===detail.selPointLocalId?'active':''}" style="left:${dur?(p.time/dur*100):0}%" data-tdmark="${p.localId}" title="${mmss(p.time)}">
            <span class="td-mark-badge">${noktaNo(p)}</span>
            <span class="td-mark-line"></span>
          </div>`).join('')}
        </div>
        <div class="td-cetvel">${[0,.25,.5,.75,1].map(r=>`<span style="left:${r*100}%">${mmss(r*dur)}</span>`).join('')}</div>
      </div>

      <div class="td-addbtn-row">
        <button type="button" class="td-addbtn" data-tdaddpoint>+ İŞARET KOY · <span data-tdaddzaman>${mmss(cur)}</span></button>
        <span class="td-legend"><i class="td-legend-dot draft"></i> taslak <i class="td-legend-dot saved"></i> kayıtlı <i class="td-legend-dot aktif"></i> açık klasör · ${draftCount} taslak · ${savedCount} kayıtlı</span>
      </div>

      <div class="td-klasorler">
        <p class="td-klasorler-baslik">NOT KLASÖRLERİ <i>${points.length}</i></p>
        ${points.length?`<div class="td-sekmeler" role="tablist">${sirali().map(klasorSekmesi).join('')}</div>
        ${klasorGovdesi(seciliNokta())}`:'<p class="td-empty">Henüz işaret yok. Dinlerken değişmesini istediğin yerde “+ İşaret koy”a bas.</p>'}
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
    const playBtn=root.querySelector('[data-tdplay]'); if(playBtn)playBtn.textContent=detail.playing?'❚❚':'▶';
    cizimYenile();
  }

  async function openTrackDetail(tr,project){
    openTrackId=tr.id;
    detail={points:[],peaks:null,duration:0,curTime:0,selPointLocalId:null,playing:false,audioEl:null,dalgaYuzde:null,dalgaHata:false};
    syncSavedPoints(tr,project);
    const halaAcik=()=>openTrackId===tr.id;
    // Daha önce çıkarılmış dalga varsa ekran ilk anda onunla açılır.
    const kayitli=tr.audio_path?dalgaOku(tr.audio_path):null;
    if(kayitli){ detail.peaks=kayitli.peaks; detail.duration=kayitli.duration; }
    render();

    // Sesli notların adresleri arka planda, aynı anda alınır (oynatıcıyı bekletmez).
    const sesliNotlar=Promise.all(detail.points.filter(p=>p.voicePath).map(async p=>{
      try{const r=await client.storage.from('project-voice-notes').createSignedUrl(p.voicePath,3600); p.voiceUrl=r.data?.signedUrl||null;}catch{}
    }));

    if(tr.audio_path){
      const url=await sesUrl(tr.audio_path);
      if(!halaAcik())return;
      if(url){
        const audio=new Audio(url);
        audio.preload='metadata';
        detail.audioEl=audio;
        audio.addEventListener('loadedmetadata',()=>{ if(!detail.duration)detail.duration=audio.duration; updateDetailProgress(); });
        audio.addEventListener('timeupdate',()=>{ detail.curTime=audio.currentTime; updateDetailProgress(); });
        audio.addEventListener('play',()=>{ detail.playing=true; updateDetailProgress(); });
        audio.addEventListener('pause',()=>{ detail.playing=false; updateDetailProgress(); });
        audio.addEventListener('ended',()=>{ detail.playing=false; updateDetailProgress(); });
        // Oynatıcı hemen kullanılabilir; dalga formu ayrıca hazırlanır.
        renderDetail(tr,project);
        if(!detail.peaks){
          const yan=await yanDosyaOku(tr.audio_path);
          if(!halaAcik())return;
          if(yan){
            dalgaYaz(tr.audio_path,yan);
            detail.peaks=yan.peaks; if(!detail.duration)detail.duration=yan.duration;
            renderDetail(tr,project);
          }
        }
        if(!detail.peaks){
          detail.dalgaYuzde=0;
          const yuzdeYaz=()=>{ const el=document.querySelector('[data-dalgayuzde]'); if(el)el.textContent=detail.dalgaYuzde>=100?'işleniyor…':('%'+detail.dalgaYuzde); };
          try{
            const veri=await computePeaks(url,oran=>{ const y=Math.min(99,Math.floor(oran*100)); if(y!==detail.dalgaYuzde){detail.dalgaYuzde=y;yuzdeYaz();} });
            dalgaYaz(tr.audio_path,veri);
            yanDosyaYaz(tr.audio_path,veri); // eski parçalar için: bir sonraki açılış hızlı olsun
            if(!halaAcik())return;
            detail.peaks=veri.peaks; if(!detail.duration)detail.duration=veri.duration;
          }catch(e){ if(halaAcik())detail.dalgaHata=true; /* dalga çıkmasa da oynatma çalışsın */ }
          if(!halaAcik())return;
          detail.dalgaYuzde=null;
          renderDetail(tr,project);
        }
      }
    }
    await sesliNotlar;
    if(halaAcik()&&detail.points.some(p=>p.voiceUrl))renderDetail(tr,project);
  }

  function closeTrackDetail(){
    if(detail.audioEl){try{detail.audioEl.pause();}catch{}}
    openTrackId=null; detail={};
    render();
  }

  // İşaret sürükleme belge düzeyinde izlenir: seçim değişince ekran yeniden
  // çizilse bile sürükleme kopmaz.
  let surukleme=null, surukleKurulu=false;
  function canliKonum(p){
    const root=document.querySelector('.track-detail'); if(!root)return;
    const m=root.querySelector(`[data-tdmark="${p.localId}"]`);
    if(m&&detail.duration){m.style.left=(p.time/detail.duration*100)+'%';m.title=mmss(p.time);}
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
      const p=(detail.points||[]).find(x=>x.localId===surukleme.id);
      if(!p||p.saved)return;
      if(!surukleme.oynadi&&Math.abs(e.clientX-surukleme.baslaX)<4)return;
      surukleme.oynadi=true;
      const wrap=document.querySelector('[data-tdwave]'); if(!wrap)return;
      const r=wrap.getBoundingClientRect();
      p.time=Math.min(1,Math.max(0,(e.clientX-r.left)/r.width))*detail.duration;
      canliKonum(p);
    });
    const bitir=()=>{
      if(!surukleme)return;
      const {tr,project,oynadi,id}=surukleme; surukleme=null;
      const p=(detail.points||[]).find(x=>x.localId===id);
      if(!oynadi&&p){ detail.curTime=p.time; if(detail.audioEl)detail.audioEl.currentTime=p.time; }
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
    if(playBtn)playBtn.onclick=async()=>{ if(!audio)return; if(audio.paused)await audio.play(); else audio.pause(); };
    const seek=root.querySelector('[data-tdseek]');
    if(seek)seek.oninput=()=>{ if(audio)audio.currentTime=parseFloat(seek.value); detail.curTime=parseFloat(seek.value); updateDetailProgress(); };
    const ana=root.querySelector('.td-wave-canvas');
    const zamanAl=(el,e,from,to)=>{const r=el.getBoundingClientRect();return from+Math.min(1,Math.max(0,(e.clientX-r.left)/r.width))*(to-from);};
    const git=t=>{ detail.curTime=Math.max(0,Math.min(detail.duration||0,t)); if(audio)audio.currentTime=detail.curTime; updateDetailProgress(); };
    const hoverEl=root.querySelector('[data-tdhover]');
    if(ana&&detail.peaks){
      cizimYenile();
      ana.onclick=e=>git(zamanAl(ana,e,0,detail.duration));
      ana.onpointermove=e=>{
        if(e.pointerType==='touch')return;
        detail.hoverAna=zamanAl(ana,e,0,detail.duration);
        if(hoverEl){hoverEl.hidden=false;hoverEl.textContent=mmss(detail.hoverAna);hoverEl.style.left=(detail.hoverAna/detail.duration*100)+'%';}
        cizimYenile();
      };
      ana.onpointerleave=()=>{detail.hoverAna=null;if(hoverEl)hoverEl.hidden=true;cizimYenile();};
    }
    const yakin=root.querySelector('[data-tdzoom]');
    if(yakin){
      yakin.onclick=e=>{const sp=seciliNokta();if(!sp)return;const [a,b]=yakinPencere(sp.time);git(zamanAl(yakin,e,a,b));};
      yakin.onpointermove=e=>{if(e.pointerType==='touch')return;const sp=seciliNokta();if(!sp)return;const [a,b]=yakinPencere(sp.time);detail.hoverYakin=zamanAl(yakin,e,a,b);cizimYenile();};
      yakin.onpointerleave=()=>{detail.hoverYakin=null;cizimYenile();};
    }

    // Klasör seçimi: klasör açılır, dalga o noktaya gider (çalma başlamaz).
    const sec=id=>{ detail.selPointLocalId=id; const p=seciliNokta(); if(p){detail.curTime=p.time; if(audio)audio.currentTime=p.time;} renderDetail(tr,project); };
    root.querySelectorAll('[data-tdsec]').forEach(b=>b.onclick=()=>sec(b.dataset.tdsec));

    root.querySelectorAll('[data-tdburadan]').forEach(b=>b.onclick=async()=>{
      const p=(detail.points||[]).find(x=>x.localId===b.dataset.tdburadan); if(!p||!audio)return;
      git(Math.max(0,p.time-2));
      try{await audio.play();}catch{}
    });

    // İnce ayar (yalnız taslak): işaret, sekme ve yakın plan anında güncellenir.
    const kaydir=yeni=>{
      const p=seciliNokta(); if(!p||p.saved)return;
      p.time=Math.round(Math.max(0,Math.min(detail.duration||0,yeni))*10)/10;
      // Çalma noktası da işaretle birlikte belirlenen saniyeye geçer: dinlerken tam o yer duyulur.
      detail.curTime=p.time; if(audio)audio.currentTime=p.time;
      canliKonum(p); updateDetailProgress();
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
        surukleme={id:p.localId,tr,project,oynadi:false,baslaX:e.clientX};
        if(detail.selPointLocalId!==p.localId){ detail.selPointLocalId=p.localId; renderDetail(tr,project); }
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

    root.querySelectorAll('[data-notesend]').forEach(b=>b.onclick=async()=>{
      const inp=root.querySelector(`[data-cut="${tr.id}"]`);
      const body=(inp?.value||'').trim();
      b.disabled=true;
      const {error}=await client.from('project_feedback').insert({
        project_id:project.id,author_id:me,track_id:tr.id,kind:'note',
        body:body||'Bu parça hakkında not.'
      });
      bildir(error?'Gönderilemedi: '+error.message:'Not gönderildi.',error?'hata':'ok');
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
