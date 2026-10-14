// BİLDİRİMLER — yalnız yönetici.
// Antrenörlerin Müzik Araştır sayfasından gönderdiği istekler burada listelenir
// ve "ONAYLA" ile Projelerim'e eklenir. İstekler eskiden sohbetin içinde
// onaylanıyordu; sohbet 2026-10-14'te gizlendi. Veri yeri değişmedi: istekler
// hâlâ direct_messages tablosunda, onaylanınca research_project_id dolar.
(() => {
  const ETIKET = '[Müzik araştırma isteği';
  const escapeHtml = value => String(value || '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  const guvenliLink = url => /^https?:\/\//i.test(String(url || '')) ? String(url) : '';
  const tarih = iso => {
    try { return new Date(iso).toLocaleString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }
    catch (e) { return iso; }
  };
  const byId = id => document.getElementById(id);
  let filtre = 'bekleyen';
  let sonListe = [];
  let adlar = {};

  // Mesaj gövdesinin sonundaki __DATA__:{...} kısmını okur; bozuksa null.
  function cozumle(body) {
    const m = String(body || '').match(/__DATA__:(\{[\s\S]*\})\s*$/);
    if (!m) return null;
    try { return JSON.parse(m[1]); } catch (e) { return null; }
  }

  function kart(istek) {
    const veri = cozumle(istek.body) || {};
    const onayli = !!istek.research_project_id;
    const parcalar = Array.isArray(veri.tracks) ? veri.tracks : [];
    const parcaHtml = parcalar.length ? `<ol class="bild-parcalar">${parcalar.map((p, i) => {
      const link = guvenliLink(p.source_url);
      return `<li><span class="no">${String(i + 1).padStart(2, '0')}</span><span>${escapeHtml(p.label)}</span>${link ? `<a href="${escapeHtml(link)}" target="_blank" rel="noreferrer">DİNLE ↗</a>` : '<span></span>'}</li>`;
    }).join('')}</ol>` : '';
    return `<article class="bild-card ${onayli ? 'onayli' : ''}" data-id="${escapeHtml(istek.id)}">
      <div class="bild-top"><span class="bild-name">${escapeHtml(adlar[istek.sender_id] || 'Antrenör')}</span>
        <span class="bild-etiket">${onayli ? 'ONAYLANDI' : 'ONAY BEKLİYOR'}</span></div>
      <p class="bild-baslik">${escapeHtml(veri.title || 'Müzik araştırma isteği')}</p>
      <p class="bild-date">${escapeHtml(tarih(istek.created_at))}${veri.branch ? ' · ' + escapeHtml(veri.branch) : ''}</p>
      ${parcaHtml}
      ${veri.note ? `<p class="bild-not">Not: ${escapeHtml(veri.note)}</p>` : ''}
      ${onayli ? '<p class="bild-not durum">✓ PROJELERİM\'E EKLENDİ</p>'
        : (cozumle(istek.body) ? '<button type="button" class="bild-onay" data-onayla>ONAYLA — PROJELERİM\'E EKLE</button>'
          : '<p class="bild-hata">Bu isteğin parça bilgisi okunamadı.</p>')}
      <p class="bild-hata" data-hata hidden></p>
    </article>`;
  }

  function ciz() {
    const app = byId('bild-app');
    const bekleyen = sonListe.filter(i => !i.research_project_id);
    const gosterilen = filtre === 'bekleyen' ? bekleyen : sonListe;
    app.innerHTML = `<div class="bild-ozet">
        <button type="button" class="bild-filtre ${filtre === 'bekleyen' ? 'aktif' : ''}" data-filtre="bekleyen">BEKLEYEN<b>${bekleyen.length}</b></button>
        <button type="button" class="bild-filtre ${filtre === 'tumu' ? 'aktif' : ''}" data-filtre="tumu">TÜMÜ<b>${sonListe.length}</b></button>
      </div>
      <div class="bild-list">${gosterilen.length ? gosterilen.map(kart).join('')
        : `<p class="bild-empty">${filtre === 'bekleyen' ? 'Onay bekleyen istek yok.' : 'Henüz istek gelmedi.'}</p>`}</div>`;
    app.querySelectorAll('[data-filtre]').forEach(b => b.onclick = () => { filtre = b.dataset.filtre; ciz(); });
    app.querySelectorAll('[data-onayla]').forEach(b => b.onclick = () => onayla(b));
  }

  async function onayla(button) {
    const { client, user } = window.DerinAuth;
    const article = button.closest('.bild-card');
    const hata = article.querySelector('[data-hata]');
    const istek = sonListe.find(i => String(i.id) === article.dataset.id);
    const veri = istek && cozumle(istek.body);
    const goster = mesaj => { hata.textContent = mesaj; hata.hidden = false; button.disabled = false; button.textContent = 'ONAYLA — PROJELERİM\'E EKLE'; };
    if (!veri) return goster('Bu isteğin parça bilgisi okunamadı.');
    if (!window.confirm('Bu istek onaylanıp Projelerim sayfasına eklensin mi?')) return;
    button.disabled = true; button.textContent = 'EKLENİYOR…'; hata.hidden = true;

    const proj = await client.from('music_projects').insert({
      coach_id: istek.sender_id, title: veri.title, song: veri.song, branch: veri.branch, status: 'approved'
    }).select('id').single();
    if (proj.error) return goster('Proje oluşturulamadı: ' + proj.error.message);

    const notlar = [];
    if (Array.isArray(veri.tracks) && veri.tracks.length) {
      const r = await client.from('project_tracks').insert(veri.tracks.map((t, i) => ({
        project_id: proj.data.id, label: t.label, source_url: t.source_url, sort_order: i
      })));
      if (r.error) notlar.push('Proje oluştu ama parçalar eklenemedi: ' + r.error.message);
    }
    if (veri.note) {
      const r = await client.from('project_feedback').insert({ project_id: proj.data.id, author_id: user.id, body: 'Antrenörün notu: ' + veri.note, kind: 'note' });
      if (r.error) notlar.push('Antrenörün notu eklenemedi: ' + r.error.message);
    }
    const isaret = await client.from('direct_messages').update({ research_project_id: proj.data.id }).eq('id', istek.id).select('id');
    if (isaret.error || !isaret.data || !isaret.data.length) notlar.push('Proje oluşturuldu ama istek "onaylandı" olarak işaretlenemedi.');

    await yukle();
    if (notlar.length) byId('bild-status').textContent = notlar.join(' ');
  }

  async function yukle() {
    const { client, user } = window.DerinAuth;
    const app = byId('bild-app'), status = byId('bild-status');
    const { data, error } = await client.from('direct_messages')
      .select('id,sender_id,body,created_at,research_project_id')
      .eq('recipient_id', user.id)
      .ilike('body', '%' + ETIKET + '%')
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) { app.innerHTML = `<p class="bild-empty">Bildirimler yüklenemedi: ${escapeHtml(error.message)}</p>`; return; }
    sonListe = (data || []).filter(i => i.sender_id !== user.id);
    const kimler = [...new Set(sonListe.map(i => i.sender_id))].filter(id => !adlar[id]);
    if (kimler.length) {
      const p = await client.from('profiles').select('id,full_name').in('id', kimler);
      (p.data || []).forEach(k => { adlar[k.id] = k.full_name; });
    }
    status.textContent = 'Antrenörlerin Müzik Araştır istekleri. Onaylananlar Projelerim\'e düşer.';
    ciz();
    // Menüdeki/hesap düğmesindeki bildirim sayacını da tazele.
    window.dispatchEvent(new CustomEvent('derin:bildirim-yenile'));
  }

  async function basla() {
    await window.DerinAuth.ready;
    const { configured, user, profile } = window.DerinAuth;
    const status = byId('bild-status'), app = byId('bild-app');
    if (!configured) { status.textContent = 'Önce Supabase bağlantısını config.js dosyasına ekleyin.'; return; }
    if (!user) {
      status.innerHTML = 'Bu alan yalnızca yöneticilere açıktır. <button class="account-button" id="bild-login">GİRİŞ YAP</button>';
      byId('bild-login').onclick = () => window.DerinAuth.open();
      return;
    }
    if (profile?.role !== 'admin') { status.textContent = 'Bu alan için yönetici yetkiniz yok.'; return; }
    app.hidden = false;
    app.innerHTML = '<p class="bild-empty">Bildirimler yükleniyor…</p>';
    await yukle();
    // Sekmeye geri dönünce yeni istekleri getir.
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') yukle(); });
  }

  basla();
})();
