// Ödemelerim (14 Kasım): HESABIM → ÖDEMELERİM. Müşteri satın aldığı parçaları,
// tutarları ve ödeme durumlarını tek sayfada görür; yönetici herkesinkini görür.
// Veri: project_tracks (satın alma alanları) + music_projects; izinler mevcut RLS.
// Satın alma kuralları: satin-alma.js · supabase/parca-satin-alma.sql
(() => {
  'use strict';
  const SA = window.DerinSatinAlma;
  const $ = id => document.getElementById(id);
  const L = (tr, en) => (document.documentElement.getAttribute('data-dil') === 'en' ? en : tr);
  const kacis = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const tarih = t => t ? new Date(t).toLocaleDateString(L('tr-TR', 'en-GB'), { day: 'numeric', month: 'long', year: 'numeric' }) : '';

  let client = null, ben = null, admin = false;

  const DURUM = {
    istendi: { sinif: 'bekliyor', yazi: () => L('Ödeme bekleniyor', 'Awaiting payment') },
    dekont: { sinif: 'kontrol', yazi: () => L('Dekont alındı · onay bekleniyor', 'Receipt received · awaiting confirmation') },
    odendi: { sinif: 'odendi', yazi: () => L('Ödendi', 'Paid') }
  };

  function kart(t, proje, musteri) {
    const d = DURUM[t.satin_alma_durum] || DURUM.istendi;
    const tutar = SA.tutarGoster(t.satin_alma_tutar);
    const parcaLink = 'my-projects.html?parca=' + encodeURIComponent(t.id);
    const adimlar = [
      [L('Satın alındı', 'Purchased'), t.satin_alma_istendi_at],
      [L('Dekont', 'Receipt'), t.dekont_at],
      [L('Ödeme onaylandı', 'Payment confirmed'), t.odendi_at]
    ].filter(a => a[1]).map(a => `<li><span>${kacis(a[0])}</span><time>${kacis(tarih(a[1]))}</time></li>`).join('');
    let eylem = '';
    if (t.satin_alma_durum === 'odendi') eylem = `<a class="od-dugme ana" href="${parcaLink}">${L('İndir', 'Download')} →</a>`;
    else if (t.satin_alma_durum === 'istendi') eylem = `<a class="od-dugme ana" href="${parcaLink}&odeme=1">${L('Ödemeye git', 'Go to payment')} →</a>`;
    else eylem = `<a class="od-dugme" href="${parcaLink}&odeme=1">${L('Parçaya git', 'Open track')} →</a>`;
    return `<article class="od-kart od-${d.sinif}">
      <div class="od-ust">
        <div class="od-ad">
          <p class="od-proje">${kacis(proje ? proje.title : L('Proje', 'Project'))}${admin && musteri ? ` · <b>${kacis(musteri)}</b>` : ''}</p>
          <h2>${kacis(t.label || L('Parça', 'Track'))}</h2>
        </div>
        <div class="od-tutar">${tutar ? `<b>${kacis(tutar.replace(/ ₺$/, ''))}<em>₺</em></b><small>${L('KDV dahil', 'incl. VAT')}</small>` : `<b class="bos">—</b><small>${L('tutar bekleniyor', 'price pending')}</small>`}</div>
      </div>
      <div class="od-alt">
        <span class="od-rozet">${kacis(d.yazi())}</span>
        ${adimlar ? `<ol class="od-zaman">${adimlar}</ol>` : ''}
        <div class="od-eylem">
          ${t.dekont_path ? `<button type="button" class="od-dugme" data-dekont="${kacis(t.dekont_path)}">${L('Dekontu gör', 'View receipt')} ↗</button>` : ''}
          ${eylem}
        </div>
      </div>
    </article>`;
  }

  async function yukle() {
    const liste = $('od-liste'), durum = $('od-durum');
    const r = await client.from('project_tracks')
      .select('id,label,project_id,satin_alma_durum,satin_alma_tutar,dekont_path,satin_alma_istendi_at,dekont_at,odendi_at')
      .not('satin_alma_durum', 'is', null)
      .order('satin_alma_istendi_at', { ascending: false, nullsFirst: false });
    if (r.error) { durum.textContent = L('Ödemeler alınamadı: ', 'Payments could not be loaded: ') + r.error.message; durum.className = 'od-msg err'; return; }
    const parcalar = r.data || [];
    const pid = [...new Set(parcalar.map(t => t.project_id))];
    const projeler = {}, adlar = {};
    if (pid.length) {
      const p = await client.from('music_projects').select('id,title,coach_id').in('id', pid);
      (p.data || []).forEach(x => { projeler[x.id] = x; });
      if (admin) {
        const cid = [...new Set((p.data || []).map(x => x.coach_id).filter(Boolean))];
        if (cid.length) { const pr = await client.from('profiles').select('id,full_name').in('id', cid); (pr.data || []).forEach(x => { adlar[x.id] = x.full_name; }); }
      }
    }
    const top = d => parcalar.filter(t => d.includes(t.satin_alma_durum)).reduce((n, t) => n + (Number(t.satin_alma_tutar) || 0), 0);
    $('od-odenen').textContent = SA.tutarGoster(top(['odendi'])) || '0 ₺';
    $('od-bekleyen').textContent = SA.tutarGoster(top(['istendi', 'dekont'])) || '0 ₺';
    $('od-ozet').hidden = !parcalar.length;
    durum.textContent = ''; durum.className = 'od-msg';
    liste.innerHTML = parcalar.length
      ? parcalar.map(t => { const p = projeler[t.project_id]; return kart(t, p, p && adlar[p.coach_id]); }).join('')
      : `<p class="od-bos">${L('Henüz bir satın alma yok. Projelerim\'deki bir parçada SATIN AL\'a bastığında burada görünür.', 'No purchases yet. When you press BUY on a track in My Projects, it appears here.')}</p>`;
    liste.querySelectorAll('[data-dekont]').forEach(b => b.onclick = async () => {
      const sekme = window.open('', '_blank');
      let url = null; try { url = await window.DerinR2.korumaliAdres('project-audio', b.dataset.dekont); } catch { url = null; }
      if (!url) { if (sekme) sekme.close(); durum.textContent = L('Dekont açılamadı.', 'The receipt could not be opened.'); durum.className = 'od-msg err'; return; }
      if (sekme) sekme.location.href = url; else window.location.href = url;
    });
  }

  (async () => {
    const durum = $('od-durum');
    if (!window.DerinAuth || !SA) { durum.textContent = 'Hesap sistemi yüklenemedi.'; durum.className = 'od-msg err'; return; }
    const st = await window.DerinAuth.ready;
    client = st.client; ben = st.user;
    if (!client || !ben) { durum.textContent = L('Ödemelerini görmek için giriş yap.', 'Log in to see your payments.'); durum.className = 'od-msg err'; return; }
    admin = !!(st.profile && st.profile.role === 'admin');
    if (admin) $('od-baslik-not').textContent = L('Yönetici: tüm müşterilerin satın almaları', 'Admin: all customers\' purchases');
    await yukle();
    // Canlı: tutar / durum değişince sayfa yenilemeden güncellenir.
    let bekle = null;
    client.channel('odemelerim-' + ben.id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'project_tracks' }, () => { clearTimeout(bekle); bekle = setTimeout(yukle, 300); })
      .subscribe();
  })();
})();
