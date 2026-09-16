(() => {
  const app=document.querySelector('#music-app'), status=document.querySelector('#music-status');
  const BRANCHES=['Aerobik','Akrobatik','Artistik','Ritmik Cimnastik','Çocuk Fitness','Genel çalışma'];
  const safe=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let client=null,me=null;
  const buildUrl=(s,p)=>p==='spotify'?'https://open.spotify.com/search/'+encodeURIComponent(s):'https://www.youtube.com/results?search_query='+encodeURIComponent(s);

  async function init(){
    await window.DerinAuth.ready;
    const a=window.DerinAuth; client=a.client;
    if(!a.configured){status.textContent='Araç hazırlanıyor.';return;}
    if(!a.user){status.innerHTML='<button class="account-button" id="music-login">GİRİŞ YAP</button>';
      document.querySelector('#music-login').onclick=()=>a.open();return;}
    me=a.user.id; status.textContent=''; app.hidden=false; render();
  }

  function render(){
    app.innerHTML=`<form>
      <label>ŞARKI / SANATÇI<input name="song" maxlength="180" placeholder="Örn. Billie Eilish — Birds of a Feather" required></label>
      <label>HANGİ BRANŞ?<select name="branch">${BRANCHES.map(b=>`<option>${b}</option>`).join('')}</select></label>
      <label>NEREDEN?<select name="platform"><option value="youtube">YouTube</option><option value="spotify">Spotify</option></select></label>
      <p class="music-hint">Linki oluştur, kaseti Derin Record yuvasına sürükle. Birden fazla parça birleştirmek istiyorsan işlemi tekrarla.</p>

      <div class="music-link-box"><span>OLUŞTURULAN LİNK</span>
        <p class="music-link-empty">Parçanın linkini oluşturduğunda kaset burada görünecek.</p>
        <div class="music-link-card" draggable="false" hidden>
          <img src="assets/demo-cassette-derin-record.png" alt="Derin Record kaseti">
          <small>KASETİ DERİN RECORD'A SÜRÜKLE</small>
          <a class="music-generated-link" target="_blank" rel="noreferrer"></a>
        </div></div>

      <div class="music-actions">
        <button type="button" data-create>PARÇANIN LİNKİNİ OLUŞTUR ↗</button>
        <div class="music-drop-zone" data-drop>
          <div class="empty-cassette-slot"><img src="assets/cassette-derin-record.jpg" alt="Boş kaset yuvası"></div>
          <span>KASETİ BU BÖLÜME SÜRÜKLE</span>
        </div>
      </div>

      <div class="music-link-box"><span>EKLENEN PARÇALAR</span>
        <ul id="track-list" style="list-style:none;padding:0;margin:10px 0"></ul></div>

      <section class="music-message-box"><span>NOTUN</span>
        <textarea name="message" maxlength="1000" placeholder="Örn. 1. parçanın nakaratı ile 2. parçanın girişini birleştirelim."></textarea>
        <button type="button" data-send disabled>DERİN RECORD'A GÖNDER →</button>
      </section></form>`;

    const f=app.querySelector('form'), listEl=f.querySelector('#track-list');
    const card=f.querySelector('.music-link-card'), empty=f.querySelector('.music-link-empty');
    const zone=f.querySelector('[data-drop]'), sendBtn=f.querySelector('[data-send]');
    const pending=[]; let ready=null;

    const paint=()=>{
      listEl.innerHTML=pending.length?pending.map((t,i)=>`<li style="display:flex;justify-content:space-between;gap:10px;padding:9px 0;border-top:1px solid rgba(255,255,255,.1)">
        <span><strong>${i+1}. ${safe(t.label)}</strong><br><small style="opacity:.6">${safe(t.source_url)}</small></span>
        <button type="button" data-rm="${i}" style="padding:6px 12px;border-radius:10px;border:1px solid rgba(255,255,255,.2);background:transparent;color:inherit;cursor:pointer">ÇIKAR</button></li>`).join('')
        :'<li style="opacity:.5">Henüz kaset yerleştirilmedi.</li>';
      sendBtn.disabled=pending.length===0;
      listEl.querySelectorAll('[data-rm]').forEach(b=>b.onclick=()=>{pending.splice(+b.dataset.rm,1);paint();});
    };
    paint();

    f.querySelector('[data-create]').onclick=()=>{
      const song=f.song.value.trim();
      if(!song){status.textContent='Önce şarkı adını yaz.';return;}
      ready={label:song,source_url:buildUrl(song,f.platform.value)};
      const link=f.querySelector('.music-generated-link');
      link.href=ready.source_url;
      link.textContent=(f.platform.value==='spotify'?'Spotify':'YouTube')+' bağlantısını aç ↗';
      card.hidden=false; card.draggable=true; empty.hidden=true;
      status.textContent='Kaset hazır — Derin Record yuvasına sürükle.';
    };

    card.addEventListener('dragstart',e=>{
      if(!ready)return;
      e.dataTransfer.setData('text/plain',ready.source_url);
      e.dataTransfer.setDragImage(card.querySelector('img'),38,24);
      zone.classList.add('is-ready');
    });
    card.addEventListener('dragend',()=>zone.classList.remove('is-ready'));

    const drop=()=>{
      if(!ready)return;
      pending.push(ready); ready=null;
      card.hidden=true; card.draggable=false; empty.hidden=false;
      f.song.value=''; zone.classList.remove('is-over','is-ready');
      status.textContent='Kaset yuvaya yerleşti.';
      paint();
    };
    zone.addEventListener('dragover',e=>{e.preventDefault();zone.classList.add('is-over');});
    zone.addEventListener('dragleave',()=>zone.classList.remove('is-over'));
    zone.addEventListener('drop',e=>{e.preventDefault();drop();});
    zone.addEventListener('click',drop);   // dokunmatik cihazlar için

    sendBtn.onclick=async()=>{
      sendBtn.disabled=true; status.textContent='Gönderiliyor…';
      const title=pending.length>1?`${f.branch.value} · ${pending.length} parça birleşimi`:`${f.branch.value} · ${pending[0].label}`;
      const proj=await client.from('music_projects').insert({coach_id:me,title,
        song:pending.map(t=>t.label).join(' + '),branch:f.branch.value,status:'pending'}).select('id').single();
      if(proj.error){status.textContent='Gönderilemedi: '+proj.error.message;sendBtn.disabled=false;return;}
      const tr=await client.from('project_tracks').insert(pending.map((t,i)=>({project_id:proj.data.id,label:t.label,source_url:t.source_url,sort_order:i})));
      if(tr.error){status.textContent='Parçalar eklenemedi: '+tr.error.message;sendBtn.disabled=false;return;}
      const note=f.message.value.trim();
      if(note)await client.from('project_feedback').insert({project_id:proj.data.id,author_id:me,body:note,kind:'note'});
      status.textContent='Gönderildi. Projelerim sayfasından takip edebilirsin.';
      render();
    };
  }

  init();
})();
