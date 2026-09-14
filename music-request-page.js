(() => {
  const app = document.querySelector('#music-app');
  const status = document.querySelector('#music-status');
  const demos = '<option>Aerobik</option><option>Akrobatik</option><option>Artistik</option><option>Ritmik Cimnastik</option><option>Çocuk Fitness</option><option>Genel çalışma</option>';

  async function init() {
    await window.DerinAuth.ready;
    const { configured, user, profile, client } = window.DerinAuth;
    if (!configured) { status.textContent = 'Araştırma aracı hazırlanıyor.'; return; }
    if (!user) {
      status.innerHTML = '<button class="account-button" id="music-login">GİRİŞ YAP</button>';
      document.querySelector('#music-login').onclick = () => window.DerinAuth.open();
      return;
    }
    try {
      await window.DerinChatCrypto.ready(client, user.id);
    } catch (cryptoError) {
      status.textContent = cryptoError.message || 'Uçtan uca şifreleme hazırlanamadı.';
      return;
    }

    let recipient;
    let canSend = true;
    let recipientText = 'yöneticiye';
    let recipientField = '';
    if (profile.role === 'admin') {
      const { data: coaches, error } = await client.from('profiles').select('id, full_name').eq('role', 'coach').order('created_at');
      if (error) { status.textContent = error.message; return; }
      if (!coaches?.length) {
        recipient = user.id;
        recipientText = 'Derin Record gelen kutusuna';
      } else {
        recipientField = `<label>HANGİ ANTRENÖRE?<select name="recipient">${coaches.map(coach => `<option value="${coach.id}">${(coach.full_name || 'Antrenör').replace(/</g, '&lt;')}</option>`).join('')}</select></label>`;
        recipientText = 'seçtiğin antrenöre';
      }
    } else {
      recipient = (await client.rpc('admin_contact_id')).data;
      if (!recipient) { status.textContent = 'Yönetici hesabı bulunamadı.'; return; }
    }

    status.textContent = '';
    app.hidden = false;
    app.innerHTML = `<form><label>ŞARKI / SANATÇI<input name="song" maxlength="180" placeholder="Örn. Billie Eilish — Birds of a Feather" required></label><label>HANGİ BRANŞIN DEMOSU?<select name="demo">${demos}</select></label><label>NEREDEN ARAŞTIRALIM?<select name="platform"><option value="youtube">YouTube</option><option value="spotify">Spotify</option></select></label>${recipientField}<p class="music-hint">${canSend ? `Bağlantıyı oluşturduktan sonra kaseti Derin Record alanına sürükleyip bırakabilirsin.` : 'Henüz kayıtlı antrenör yok. Bağlantıyı oluşturup seçtiğin platformda açabilirsin; antrenör kaydolduğunda Derin Record’a gönderebilirsin.'}</p><div class="music-link-box"><span>OLUŞTURULAN LİNK</span><p class="music-link-empty">Parçanın linkini oluşturduğunda kaset burada görünecek.</p><div class="music-link-card" draggable="false" hidden><img src="assets/demo-cassette-derin-record.png" alt="Derin Record kaseti"><small>KASETİ DERİN RECORD’A SÜRÜKLE</small><a class="music-generated-link" target="_blank" rel="noreferrer"></a></div></div><div class="music-actions"><button type="button" data-create-link>PARÇANIN LİNKİNİ OLUŞTUR ↗</button><div class="music-drop-zone ${canSend ? '' : 'is-disabled'}" data-drop-zone><div class="empty-cassette-slot"><img src="assets/demo-cassette-derin-record.png" alt="Boş kaset yuvası"></div><span>${canSend ? 'KASETİ BU BÖLÜME SÜRÜKLE' : 'DERİN RECORD’A GÖNDER · ANTRENÖR KAYDI BEKLENİYOR'}</span></div><section class="music-message-box"><span>MESAJ OLARAK İLET</span><textarea name="message" maxlength="1000" placeholder="Örn. Bu parçanın ritmi Çocuk Fitness koreografisine uygun olabilir."></textarea><button type="button" data-send-message ${canSend ? '' : 'disabled'}>MESAJ OLARAK İLET →</button></section></div></form>`;
    const form = app.querySelector('form');
    const getSelection = () => {
      if (!form.reportValidity()) return null;
      const data = new FormData(form);
      const song = String(data.get('song')).trim();
      const demo = data.get('demo');
      const platform = data.get('platform');
      const platformName = platform === 'spotify' ? 'Spotify' : 'YouTube';
      const url = platform === 'spotify' ? `https://open.spotify.com/search/${encodeURIComponent(song)}` : `https://www.youtube.com/results?search_query=${encodeURIComponent(song)}`;
      return { song, demo, platformName, url, target: data.get('recipient') || recipient };
    };
    let generatedSelection;
    let cassetteSeated = false;
    const linkCard = form.querySelector('.music-link-card');
    const dropZone = form.querySelector('[data-drop-zone]');
    const seatCassette = text => {
      dropZone.classList.add('has-cassette');
      dropZone.innerHTML = `<div class="empty-cassette-slot"><img src="assets/demo-cassette-derin-record.png" alt="Derin Record kaseti"></div><span>${text}</span>`;
    };
    const resetGeneratedLink = () => {
      generatedSelection = null;
      linkCard.hidden = true;
      linkCard.draggable = false;
      form.querySelector('.music-link-empty').hidden = false;
    };
    form.querySelector('[data-create-link]').onclick = () => {
      const selection = getSelection();
      if (!selection) return;
      generatedSelection = selection;
      cassetteSeated = false;
      const link = form.querySelector('.music-generated-link');
      link.href = selection.url;
      link.textContent = `${selection.platformName} bağlantısını aç ↗`;
      linkCard.hidden = false;
      linkCard.draggable = canSend;
      form.querySelector('.music-link-empty').hidden = true;
      dropZone.classList.remove('has-cassette');
      dropZone.innerHTML = '<div class="empty-cassette-slot"><img src="assets/demo-cassette-derin-record.png" alt="Boş kaset yuvası"></div><span>KASETİ BU BÖLÜME SÜRÜKLE</span>';
      status.textContent = 'Bağlantı oluşturuldu. İstersen Derin Record’a gönderebilirsin.';
    };
    form.querySelector('[data-send-message]').onclick = async () => {
      const message = form.querySelector('[name="message"]').value.trim();
      if (!generatedSelection) { status.textContent = 'Önce parçanın bağlantısını oluştur.'; return; }
      if (!cassetteSeated) { status.textContent = 'Önce kaseti yuvaya sürükleyip bırak.'; return; }
      if (!message) { status.textContent = 'Göndermek istediğin mesajı yaz.'; return; }
      if (!generatedSelection.target) { status.textContent = 'Bu mesajı gönderebilmek için antrenör kaydı gerekiyor.'; return; }
      const sendButton = form.querySelector('[data-send-message]');
      if(sendButton.disabled) return;
      sendButton.disabled = true;
      const body = `[Müzik araştırma isteği · ${generatedSelection.demo} · ${generatedSelection.platformName}] ${generatedSelection.song}\nAraştırma bağlantısı: ${generatedSelection.url}\n\nAçıklama:\n${message}`;
      let encryptedBody;
      try { encryptedBody = await window.DerinChatCrypto.seal(body, generatedSelection.target); }
      catch (cryptoError) { status.textContent = cryptoError.message || 'Bağlantı şifrelenemedi.'; sendButton.disabled=false; return; }
      let error;
      try { ({error} = await client.from('direct_messages').insert({ recipient_id: generatedSelection.target, body: encryptedBody })); }
      catch (failure) { error=failure; }
      if(error) { status.textContent=error.message;sendButton.disabled=false;return; }
      form.querySelector('[name="message"]').value = '';
      linkCard.draggable = false;
      cassetteSeated = false;
      seatCassette('DERİN RECORD’A GÖNDERİLDİ');
      status.textContent = 'Bağlantı ve açıklama Derin Record’a iletildi.';
      if(profile?.role !== 'admin') {
        const project = {id:crypto.randomUUID(),coach_id:user.id,title:`${generatedSelection.demo} · ${generatedSelection.song}`};
        async function saveProject() {
          try {
            const result=await client.from('music_projects').insert(project);
            if(result.error && result.error.code !== '23505') throw result.error;
            status.textContent='Talebin iletildi ve projen oluşturuldu. Hesap menüsündeki Projelerim ekranından takip edebilirsin.';
          } catch(failure) {
            status.textContent='Mesajın iletildi ancak proje kaydı tamamlanamadı. Mesajı yeniden göndermeden proje kaydını tekrar deneyebilirsin. ';
            const retry=document.createElement('button');retry.type='button';retry.textContent='Proje kaydını tekrar dene';
            retry.onclick=()=>{retry.disabled=true;saveProject();};status.append(retry);
          }
        }
        await saveProject();
      }
      sendButton.disabled=false;
    };
    linkCard.addEventListener('dragstart', event => { if (!generatedSelection?.target) return; event.dataTransfer.setData('text/plain', generatedSelection.url); event.dataTransfer.setDragImage(linkCard.querySelector('img'), 38, 24); dropZone.classList.add('is-ready'); });
    linkCard.addEventListener('dragend', () => dropZone.classList.remove('is-ready'));
    dropZone.addEventListener('dragover', event => { if (canSend && generatedSelection) { event.preventDefault(); dropZone.classList.add('is-over'); } });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('is-over'));
    dropZone.addEventListener('drop', event => { event.preventDefault(); dropZone.classList.remove('is-over'); if (!generatedSelection) return; cassetteSeated = true; seatCassette('KASET YUVAYA YERLEŞTİ'); status.textContent = 'Açıklamanı yazıp Mesaj Olarak İlet düğmesine bas.'; });
  }
  init();
})();
