(() => {
  const app = document.querySelector('#music-app');
  const status = document.querySelector('#music-status');
  const BRANCHES = ['Aerobik','Akrobatik','Artistik','Ritmik Cimnastik','Çocuk Fitness','Genel çalışma'];
  const safe = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  let client=null, me=null, isAdmin=false;

  const buildUrl = (song, platform) => platform==='spotify'
    ? 'https://open.spotify.com/search/'+encodeURIComponent(song)
    : 'https://www.youtube.com/results?search_query='+encodeURIComponent(song);

  async function init(){
    await window.DerinAuth.ready;
    const a = window.DerinAuth;
    client = a.client;
    if(!a.configured){ status.textContent='Araç hazırlanıyor.'; return; }
    if(!a.user){
      status.innerHTML='<button class="account-button" id="music-login">GİRİŞ YAP</button>';
      document.querySelector('#music-login').onclick=()=>a.open(); return;
    }
    me=a.user.id; isAdmin=a.profile?.role==='admin';
    status.textContent='';
    app.hidden=false;
    render();
  }

  function render(){
    app.innerHTML=`<form>
      <label>ŞARKI / SANATÇI<input name="song" maxlength="180" placeholder="Örn. Billie Eilish — Birds of a Feather" required></label>
      <label>HANGİ BRANŞ?<select name="branch">${BRANCHES.map(b=>`<option>${b}</option>`).join('')}</select></label>
      <label>NEREDEN?<select name="platform"><option value="youtube">YouTube</option><option value="spotify">Spotify</option></select></label>
      <p class="music-hint">Birden fazla parça birleştirmek istiyorsan her parça için ayrı link oluşturup ekle, sonra hepsini tek seferde gönder.</p>
      <div class="music-actions">
        <button type="button" data-add>PARÇANIN LİNKİNİ OLUŞTUR VE EKLE ↗</button>
      </div>
      <div class="music-link-box"><span>EKLENEN PARÇALAR</span><ul id="track-list" style="list-style:none;padding:0;margin:10px 0"></ul></div>
      <section class="music-message-box"><span>NOTUN</span>
        <textarea name="message" maxlength="1000" placeholder="Örn. 1. parçanın nakaratı ile 2. parçanın girişini birleştirelim."></textarea>
        <button type="button" data-send disabled>DERİN RECORD'A GÖNDER →</button>
      </section></form>`;

    const form=app.querySelector('form');
    const listEl=form.querySelector('#track-list');
    const sendBtn=form.querySelector('[data-send]');
    const pending=[];

    const paint=()=>{
      listEl.innerHTML = pending.length
        ? pending.map((t,i)=>`<li style="display:flex;justify-content:space-between;gap:10px;padding:9px 0;border-top:1px solid rgba(255,255,255,.1)">
            <span><strong>${i+1}. ${safe(t.label)}</strong><br><small style="opacity:.6">${safe(t.source_url)}</small></span>
            <button type="button" data-rm="${i}" style="padding:6px 12px;border-radius:10px;border:1px solid rgba(255,255,255,.2);background:transparent;color:inherit;cursor:pointer">ÇIKAR</button>
          </li>`).join('')
        : '<li style="opacity:.5">Henüz parça eklenmedi.</li>';
      sendBtn.disabled = pending.length===0;
      listEl.querySelectorAll('[data-rm]').forEach(b=>b.onclick=()=>{pending.splice(+b.dataset.rm,1);paint();});
    };
    paint();

    form.querySelector('[data-add]').onclick=()=>{
      const song=form.song.value.trim();
      if(!song){ status.textContent='Önce şarkı adını yaz.'; return; }
      pending.push({ label:song, source_url:buildUrl(song, form.platform.value) });
      form.song.value='';
      status.textContent='Parça eklendi.';
      paint();
    };

    sendBtn.onclick=async()=>{
      sendBtn.disabled=true;
      status.textContent='Gönderiliyor…';
      const title = pending.length>1
        ? `${form.branch.value} · ${pending.length} parça birleşimi`
        : `${form.branch.value} · ${pending[0].label}`;

      const proj = await client.from('music_projects').insert({
        coach_id: me, title, song: pending.map(t=>t.label).join(' + '),
        branch: form.branch.value, status:'pending'
      }).select('id').single();

      if(proj.error){ status.textContent='Gönderilemedi: '+proj.error.message; sendBtn.disabled=false; return; }

      const rows = pending.map((t,i)=>({ project_id:proj.data.id, label:t.label, source_url:t.source_url, sort_order:i }));
      const tr = await client.from('project_tracks').insert(rows);
      if(tr.error){ status.textContent='Parçalar eklenemedi: '+tr.error.message; sendBtn.disabled=false; return; }

      const note=form.message.value.trim();
      if(note) await client.from('project_feedback').insert({ project_id:proj.data.id, author_id:me, body:note, kind:'note' });

      status.textContent='Gönderildi. Projelerim sayfasından takip edebilirsin.';
      render();
    };
  }

  init();
})();
