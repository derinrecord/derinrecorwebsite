(() => {
  const stamp = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  async function storage(mode, action) {
    const operation = {}; action({ getAll: () => operation.type = 'all', delete: id => { operation.type = 'delete'; operation.id = id; }, put: note => { operation.type = 'put'; operation.note = note; } });
    const client = window.DerinAuth.client;
    if (operation.type === 'all') { const { data, error } = await client.from('feedback_notes').select('*').order('time_seconds'); if (error) throw error; return data.map(row => ({ ...row, key:row.demo_key, time:Number(row.time_seconds), createdAt:row.created_at, audioPath:row.audio_path, ...(row.fig_context || {}) })); }
    if (operation.type === 'delete') { const { error } = await client.from('feedback_notes').delete().eq('id', operation.id); if (error) throw error; return; }
    const note = operation.note, fig = { figAge:note.figAge, figCategory:note.figCategory, figExercise:note.figExercise, contextLabel:note.contextLabel };
    const payload = { id:note.id, demo_key:note.key, time_seconds:note.time, movement:note.movement, message:note.message, fig_context:fig };
    const { data, error } = await client.from('feedback_notes').insert(payload).select().single(); if (error) throw error;
    if (note.voice) { const path = `${note.key}/${window.DerinAuth.user.id}/${note.id}.webm`; const uploaded = await client.storage.from('feedback-audio').upload(path, note.voice, { contentType:note.voice.type || 'audio/webm', upsert:false }); if (uploaded.error) throw uploaded.error; const updated = await client.from('feedback_notes').update({audio_path:path}).eq('id', note.id); if (updated.error) throw updated.error; note.audioPath = path; }
    return data;
  }
  let recordingOwner = null;
  document.querySelectorAll('.track').forEach(async track => {
    await window.DerinAuth.ready;
    const media = track.querySelector('audio,video');
    if (!media) return;
    const key = track.dataset.demoKey;
    const auth = window.DerinAuth;
    const gate = message => { const box = document.createElement('section'); box.className = 'feedback-access'; box.innerHTML = `<h3>GERİ BİLDİRİM ALANI</h3><p>${message}</p>${auth.user ? '' : '<button class="account-button" type="button">GİRİŞ YAP</button>'}`; track.append(box); box.querySelector('button')?.addEventListener('click', () => auth.open()); };
    if (!auth.configured) { gate('Hesap sistemi henüz etkinleştirilmedi. Yönetici Supabase bağlantısını tamamladığında bu alan açılacak.'); return; }
    if (!auth.user) { gate('Zaman damgalı not bırakmak için e-posta ve şifrenle giriş yap.'); return; }
    const allowed = auth.profile?.role === 'admin' || (await auth.client.from('demo_access').select('demo_key').eq('demo_key', key).maybeSingle()).data;
    if (!allowed) { gate('Bu demo için henüz erişimin yok. Yönetici erişim verdiğinde not bırakabilirsin.'); return; }
    const panel = document.createElement('section');
    panel.className = 'feedback';
    panel.innerHTML = `
      <div class="feedback-heading"><div><span class="track-type">BİRLİKTE ŞEKİLLENDİRELİM</span><h3>Her değişikliğin bir işareti olsun.</h3></div><button type="button" class="load-wave">DALGA FORMUNU AÇ</button></div>
      <p class="feedback-help">Dalganın farklı yerlerine tıklayarak birden fazla nokta ekle. İşaretleri sonradan sürükleyerek yerini değiştirebilirsin. Her numara kendi yazılı ve sesli notunu tutar.</p>
      <div class="wave-wrap"><canvas height="110" aria-label="Ses dalga formu: tıklayarak yeni nokta ekle"></canvas><div class="markers"></div></div>
      <div class="wave-legend"><span>○ Taslak nokta</span><span>● Kaydedilmiş not</span><span class="point-count">0 nokta seçili</span></div>
      <label class="position-label">Dinleme / yeni nokta zamanı <strong class="selected-time">0:00</strong><input class="note-position" aria-label="Geri bildirim zamanı" type="range" min="0" max="0" step="0.1" value="0" disabled></label>
      <div class="point-tools"><button type="button" class="add-point">＋ BU ANA NOKTA EKLE</button><span>Kaydırıcıyla zaman seçip de ekleyebilirsin.</span></div>
      <div class="draft-points" aria-label="Seçili zaman noktaları"></div>
      <form>
        <div class="editor-heading"><strong class="editing-point">Bir nokta ekleyerek başla</strong><button class="remove-point" type="button" hidden>Bu taslağı kaldır</button></div>
        <div class="movement-picker"><label>Hareket / geçiş<select name="movement"><option>Genel</option><option>Takla çıkışı</option><option>Denge</option><option>Atlayış</option><option>Geçiş</option><option>Final</option></select></label></div>
        <label>Geri bildirimin<textarea name="message" rows="3" maxlength="2000" placeholder="Bu noktada müzikte ne değişmeli?"></textarea></label>
        <div class="note-actions"><button class="record" type="button">● SESLİ NOT KAYDET</button><button class="save-note" type="submit">BU NOKTAYI KAYDET ↗</button></div>
        <div class="voice-draft" hidden><audio controls></audio><button type="button" class="discard">Kaydı kaldır</button></div>
      </form>
      <p class="feedback-status" role="status" aria-live="polite"></p><div class="notes"></div>`;
    track.append(panel);
    const $ = s => panel.querySelector(s);
    const canvas = $('canvas'), ctx = canvas.getContext('2d'), slider = $('.note-position');
    let selected = 0, peaks = null, notes = [], drafts = [], activeId = null;
    let recorder, stream, voice = null, draftURL, recordingTimer, saving = false, nextNumber = 1;
    let urls = [];
    const picker = window.DerinFIG?.mount($('.movement-picker'), document.body.dataset.branch);
    const active = () => drafts.find(d => d.id === activeId);
    const isLocked = () => saving || recordingOwner === panel;
    const movementValue = () => picker ? picker.getValue() : {movement:$('[name="movement"]').value};
    function status(message) { $('.feedback-status').textContent = message; }
    function capture() {
      const draft = active();
      if (draft) Object.assign(draft, {message:$('textarea').value, voice, ...movementValue()});
    }
    $('textarea').addEventListener('input', capture);
    $('.movement-picker').addEventListener('change', capture);
    function setPosition(second, seek = true) {
      selected = Math.max(0, Math.min(Number.isFinite(media.duration) ? media.duration : 0, second));
      slider.value = selected;
      $('.selected-time').textContent = stamp(selected);
      if (seek && Number.isFinite(media.duration)) media.currentTime = selected;
      draw();
    }
    function releaseDraftURL() {
      $('.voice-draft audio').pause();
      if (draftURL) URL.revokeObjectURL(draftURL);
      draftURL = null;
      $('.voice-draft audio').removeAttribute('src');
      $('.voice-draft').hidden = true;
    }
    function showVoice() {
      releaseDraftURL();
      if (voice) { draftURL = URL.createObjectURL(voice); $('.voice-draft audio').src = draftURL; $('.voice-draft').hidden = false; }
    }
    function loadEditor() {
      const draft = active();
      $('textarea').value = draft?.message || '';
      voice = draft?.voice || null;
      if (draft) {
        if (picker) picker.setValue(draft); else $('[name="movement"]').value = draft.movement || 'Genel';
      }
      $('.editing-point').textContent = draft ? `NOKTA ${draft.number} · ${stamp(draft.time)}` : 'Bir nokta ekleyerek başla';
      $('.remove-point').hidden = !draft;
      $('textarea').disabled = !draft;
      $('.record').disabled = !draft;
      $('.save-note').disabled = !draft;
      $('.record').textContent = voice ? '● SES KAYDINI YENİLE' : '● SESLİ NOT KAYDET';
      showVoice();
    }
    function activate(id) {
      if (isLocked()) { status('Önce kaydı bitir veya kaydetmenin tamamlanmasını bekle.'); return; }
      capture(); activeId = id;
      const draft = active(); if (draft) setPosition(draft.time);
      loadEditor(); renderPoints();
    }
    function addPoint(time) {
      if (isLocked()) { status('Önce kaydı bitir veya kaydetmenin tamamlanmasını bekle.'); return; }
      if (!Number.isFinite(media.duration)) { status('Ses dosyasının yüklenmesini bekle.'); return; }
      capture(); time = Math.round(Math.max(0, Math.min(media.duration, time)) * 10) / 10;
      const nearby = drafts.find(d => Math.abs(d.time - time) < 0.1);
      if (nearby) { activate(nearby.id); return; }
      const draft = {id:crypto.randomUUID(), number:nextNumber++, time, message:'', voice:null, ...movementValue()};
      drafts.push(draft); activeId = draft.id;
      setPosition(time); loadEditor(); renderPoints();
      status(`${stamp(time)} için nokta ${draft.number} eklendi. Başka bir ana tıklayarak yeni nokta ekleyebilirsin.`);
    }
    $('.add-point').onclick = () => addPoint(selected);
    $('.remove-point').onclick = () => {
      if (isLocked() || !active()) return;
      if ((active().message.trim() || voice) && !confirm('Bu noktadaki kaydedilmemiş yazı ve ses kaydı kaldırılsın mı?')) return;
      drafts = drafts.filter(d => d.id !== activeId); activeId = drafts[0]?.id || null;
      if (active()) setPosition(active().time);
      loadEditor(); renderPoints(); status('Taslak nokta kaldırıldı.');
    };
    function draw() {
      const width = Math.max(1, canvas.clientWidth), height = 110;
      canvas.width = width * devicePixelRatio; canvas.height = height * devicePixelRatio;
      ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
      ctx.fillStyle = '#222129'; ctx.fillRect(0, 0, width, height);
      if (!peaks) { ctx.fillStyle = '#bdb8c3'; ctx.font = '13px Arial'; ctx.fillText('Dalga formunu açarak sesi incele.', 14, 58); }
      else peaks.forEach((peak, i) => {
        ctx.fillStyle = i / peaks.length <= selected / media.duration ? '#d8bb2c' : '#cb2468';
        const h = Math.max(2, peak * 90);
        ctx.fillRect(i * width / peaks.length, (height - h) / 2, Math.max(1, width / peaks.length - 1), h);
      });
      if (Number.isFinite(media.duration) && media.duration > 0) {
        [...notes, ...drafts].forEach(point => {
          ctx.fillStyle = point.id === activeId ? '#fff' : '#d8bb2c';
          ctx.fillRect(width * point.time / media.duration, 0, point.id === activeId ? 2 : 1, height);
        });
        ctx.fillStyle = '#fff9'; ctx.fillRect(width * selected / media.duration, 0, 1, height);
      }
    }
    new ResizeObserver(renderPoints).observe(canvas);
    function metadata() { slider.max = Number.isFinite(media.duration) ? media.duration : 0; slider.disabled = !Number.isFinite(media.duration); renderPoints(); }
    media.addEventListener('loadedmetadata', metadata);
    slider.addEventListener('input', () => {
      const time = Number(slider.value); setPosition(time);
      if (active()) { active().time = Math.round(time * 10) / 10; renderPoints(); }
    });
    canvas.addEventListener('click', e => addPoint((e.clientX - canvas.getBoundingClientRect().left) / canvas.clientWidth * media.duration));
    $('.load-wave').onclick = async () => {
      const button = $('.load-wave'); button.disabled = true; status('Ses analiz ediliyor…');
      let context;
      try {
        context = new (window.AudioContext || window.webkitAudioContext)();
        const response = await fetch(media.querySelector('source').src);
        if (!response.ok) throw Error('fetch');
        const buffer = await context.decodeAudioData(await response.arrayBuffer());
        const data = buffer.getChannelData(0), count = 260, size = Math.ceil(data.length / count);
        peaks = Array.from({length:count}, (_, i) => {
          let max = 0;
          for (let j = i * size; j < Math.min((i + 1) * size, data.length); j++) max = Math.max(max, Math.abs(data[j]));
          return max;
        });
        draw(); button.textContent = 'DALGA FORMU HAZIR'; status('Değiştirmek istediğin her ana tıklayarak ayrı nokta ekle.');
      } catch { button.disabled = false; status('Dalga formu açılamadı. Siteyi yerel sunucu veya HTTPS üzerinden açıp yeniden dene. Zaman kaydırıcısıyla nokta ekleyebilirsin.'); }
      finally { if (context) await context.close(); }
    };
    function renderPoints() {
      $('.draft-points').replaceChildren(); $('.markers').replaceChildren();
      $('.point-count').textContent = `${drafts.length} taslak · ${notes.length} kayıtlı`;
      [...drafts].sort((a,b) => a.time - b.time).forEach(draft => {
        const button = document.createElement('button'); button.type = 'button';
        button.className = 'draft-chip'; button.setAttribute('aria-pressed', String(draft.id === activeId));
        button.textContent = `${draft.number} · ${stamp(draft.time)}`;
        button.onclick = () => activate(draft.id); $('.draft-points').append(button);
      });
      if (Number.isFinite(media.duration) && media.duration > 0) {
        // Stagger nearby markers so each remains reachable on a narrow screen.
        const lastPositions = []; const width = Math.max(1, canvas.clientWidth);
        [...notes.map(n => ({...n, saved:true})), ...drafts].sort((a,b) => a.time - b.time).forEach(point => {
          const x = Math.max(14, Math.min(width - 14, point.time / media.duration * width));
          let lane = lastPositions.findIndex(previous => x - previous >= 30);
          if (lane < 0) lane = lastPositions.length;
          lastPositions[lane] = x;
          const marker = document.createElement('button'); marker.type = 'button';
          marker.className = `wave-marker ${point.saved ? 'is-saved' : 'is-draft'}${point.id === activeId ? ' is-active' : ''}`;
          marker.style.left = `${x / width * 100}%`; marker.style.top = `${lane * 32}px`;
          marker.textContent = point.saved ? '✓' : String(point.number);
          marker.title = `${stamp(point.time)} · ${point.saved ? point.movement : `Taslak nokta ${point.number}`}`;
          marker.setAttribute('aria-label', marker.title);
          marker.onclick = () => {
            if (point.saved) { setPosition(point.time); $('.notes').querySelector(`[data-note-id="${CSS.escape(point.id)}"]`)?.scrollIntoView({behavior:'smooth',block:'nearest'}); }
            else activate(point.id);
          };
          marker.addEventListener('pointerdown', event => {
            if (isLocked()) return;
            event.preventDefault(); event.stopPropagation();
            const target = point.saved ? notes.find(note => note.id === point.id) : drafts.find(draft => draft.id === point.id);
            if (!target) return;
            let moved = false;
            const move = moveEvent => {
              const rect = canvas.getBoundingClientRect();
              const next = Math.round(Math.max(0, Math.min(media.duration, (moveEvent.clientX - rect.left) / rect.width * media.duration)) * 10) / 10;
              if (Math.abs(next - target.time) >= 0.1) moved = true;
              target.time = next; setPosition(next, false); marker.style.left = `${next / media.duration * 100}%`;
            };
            const end = async () => {
              window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', end);
              if (!moved) return;
              if (point.saved) {
                const { error } = await window.DerinAuth.client.from('feedback_notes').update({time_seconds:target.time}).eq('id', target.id);
                if (error) { status('İşaret taşınamadı. Tekrar dene.'); return; }
                status(`${stamp(target.time)} noktasındaki kayıt taşındı.`); renderNotes();
              } else { status(`Taslak nokta ${target.number} ${stamp(target.time)} konumuna taşındı.`); renderPoints(); }
            };
            window.addEventListener('pointermove', move); window.addEventListener('pointerup', end, {once:true});
          });
          $('.markers').append(marker);
        });
        $('.wave-wrap').style.paddingBottom = `${Math.max(1, lastPositions.length) * 32 + 8}px`;
        $('.markers').style.height = `${Math.max(1, lastPositions.length) * 32}px`;
      }
      draw();
    }
    function renderNotes() {
      urls.forEach(URL.revokeObjectURL); urls = []; $('.notes').replaceChildren();
      const heading = document.createElement('h4'); heading.textContent = `GERİ BİLDİRİMLER (${notes.length})`; $('.notes').append(heading);
      if (!notes.length) { const p = document.createElement('p'); p.textContent = 'Kaydettiğin notlar burada zaman sırasıyla listelenir.'; $('.notes').append(p); }
      [...notes].sort((a,b) => a.time - b.time).forEach(note => {
        const row = document.createElement('article'); row.className = 'feedback-note'; row.dataset.noteId = note.id;
        const jump = document.createElement('button'); jump.type = 'button'; jump.textContent = `${stamp(note.time)} · ${note.movement}`; jump.onclick = () => setPosition(note.time);
        const p = document.createElement('p'); p.textContent = note.message;
        const del = document.createElement('button'); del.type = 'button'; del.className = 'delete-note'; del.textContent = 'Sil';
        del.onclick = async () => {
          if (!confirm('Bu geri bildirim silinsin mi?')) return;
          try { await storage('readwrite', s => s.delete(note.id)); notes = notes.filter(n => n.id !== note.id); renderNotes(); status('Not silindi.'); }
          catch { status('Not silinemedi. Tekrar dene.'); }
        };
        row.append(jump, p);
        if (note.contextLabel) { const meta = document.createElement('small'); meta.className = 'note-context'; meta.textContent = note.contextLabel; row.append(meta); }
        if (note.audioPath) { const a = document.createElement('audio'); a.controls = true; a.preload = 'none'; window.DerinAuth.client.storage.from('feedback-audio').createSignedUrl(note.audioPath, 3600).then(({data}) => { if (data?.signedUrl) a.src = data.signedUrl; }); row.append(a); }
        row.append(del); $('.notes').append(row);
      });
      renderPoints();
    }
    $('.discard').onclick = () => { if (isLocked()) return; voice = null; showVoice(); capture(); };
    $('.record').onclick = async () => {
      if (recorder?.state === 'recording') { recorder.stop(); return; }
      if (!active() || saving) return;
      if (recordingOwner) { status('Diğer noktadaki ses kaydını önce bitir.'); return; }
      if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) { status('Sesli not için mikrofon destekleyen bir tarayıcıda HTTPS veya localhost kullan. Yazılı not ekleyebilirsin.'); return; }
      recordingOwner = panel; $('.record').disabled = true; $('.save-note').disabled = true;
      const recordingDraft = active();
      try {
        document.querySelectorAll('audio,video').forEach(a => a.pause());
        stream = await navigator.mediaDevices.getUserMedia({audio:true});
        recorder = new MediaRecorder(stream); const chunks = [];
        recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
        recorder.onstop = () => {
          clearTimeout(recordingTimer); stream.getTracks().forEach(t => t.stop()); recordingOwner = null;
          if (chunks.length) {
            voice = new Blob(chunks, {type:recorder.mimeType}); recordingDraft.voice = voice;
            showVoice(); status(`Nokta ${recordingDraft.number} için ses hazır. Dinleyip bu noktayı kaydet.`);
          } else status('Ses kaydedilemedi. Yeniden dene.');
          $('.record').textContent = '● SES KAYDINI YENİLE'; $('.save-note').disabled = false;
        };
        recorder.onerror = () => { stream.getTracks().forEach(t => t.stop()); status('Ses kaydı kesildi. Kaydı kontrol edip yeniden dene.'); };
        recorder.start(); $('.record').textContent = '■ KAYDI BİTİR';
        status(`Nokta ${recordingDraft.number} · ${stamp(recordingDraft.time)} için kayıt yapılıyor. En fazla 2 dakika.`);
        recordingTimer = setTimeout(() => { if (recorder.state === 'recording') recorder.stop(); }, 120000);
      } catch { stream?.getTracks().forEach(t => t.stop()); recordingOwner = null; $('.save-note').disabled = false; status('Mikrofon açılamadı. Tarayıcı iznini kontrol et veya yazılı not ekle.'); }
      finally { $('.record').disabled = false; }
    };
    $('form').onsubmit = async e => {
      e.preventDefault(); if (isLocked() || !active()) return;
      capture(); const draft = active();
      if (!draft.message.trim() && !draft.voice) { status('Bu nokta için bir mesaj yaz veya ses kaydet.'); $('textarea').focus(); return; }
      const note = {...draft, key, message:draft.message.trim(), createdAt:new Date().toISOString()};
      delete note.number;
      saving = true; $('.save-note').disabled = true;
      try {
        await storage('readwrite', s => s.put(note)); notes.push(note);
        drafts = drafts.filter(d => d.id !== draft.id); activeId = drafts[0]?.id || null;
        if (active()) setPosition(active().time);
        loadEditor(); renderNotes(); status(`${stamp(note.time)} noktasına not kaydedildi. ${drafts.length} taslak nokta kaldı.`);
      } catch { status('Not kaydedilemedi. Taslağın korunuyor; tarayıcı depolamasını kontrol edip tekrar dene.'); }
      finally { saving = false; $('.save-note').disabled = !active(); }
    };
    storage('readonly', s => s.getAll()).then(all => { notes = all.filter(n => n.key === key); renderNotes(); }).catch(() => status('Tarayıcı depolaması kullanılamıyor; notlar kaydedilemez.'));
    metadata(); loadEditor(); draw();
    window.addEventListener('beforeunload', e => { if (drafts.length || recordingOwner === panel) { e.preventDefault(); e.returnValue = ''; } });
    window.addEventListener('pagehide', () => { stream?.getTracks().forEach(t => t.stop()); clearTimeout(recordingTimer); });
  });
})();
