// Sayfa bakım modu (14 Kasım 2026) — supabase/sayfa-bakim.sql
// Açıkken yönetici dışındaki herkes sayfa yerine "Sitede bakım yapılıyor" ekranını görür.
// Yönetici sayfayı normal görür ve üstteki BAKIM MODU düğmesiyle istediği zaman açıp kapatır.
// Tablo yoksa ya da okunamazsa sayfa hiç kapanmaz (güvenli varsayılan).
(() => {
  const sayfa = document.currentScript?.dataset.sayfa || 'projelerim';
  const L = (tr, en) => document.documentElement?.getAttribute?.('data-dil') === 'en' ? en : tr;
  let acik = false, yonetici = false, client = null, kanal = false;

  const stil = document.createElement('style');
  stil.textContent = `
    .bakim-perde{position:fixed;inset:0;z-index:9000;display:flex;align-items:center;justify-content:center;padding:24px;background:rgba(8,8,10,.94);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);text-align:center;color:#f4efe6}
    .bakim-kutu{max-width:420px}
    .bakim-ikon{font-size:44px;margin-bottom:14px}
    .bakim-kutu h2{letter-spacing:.04em;font-size:26px;margin:0 0 10px}
    .bakim-kutu p{opacity:.8;line-height:1.5;margin:0 0 20px}
    .bakim-kutu a{display:inline-block;padding:10px 18px;border:1px solid currentColor;border-radius:999px;color:inherit;text-decoration:none;font-weight:700;letter-spacing:.06em;font-size:13px}
    body.bakim-kilit{overflow:hidden}
    .bakim-yonetici{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin:14px 0 0;padding:10px 14px;border:1px solid rgba(255,255,255,.18);border-radius:14px;font-size:13px}
    .bakim-yonetici b{letter-spacing:.06em}
    .bakim-yonetici .durum{opacity:.8}
    .bakim-yonetici.acik{border-color:#e0b100;background:rgba(224,177,0,.12)}
    .bakim-yonetici button{margin-left:auto;padding:8px 14px;border-radius:999px;border:0;font-weight:800;letter-spacing:.06em;cursor:pointer;background:#e0b100;color:#111}
    .bakim-yonetici.acik button{background:#2fbf71;color:#fff}
    .bakim-yonetici button:disabled{opacity:.5;cursor:wait}`;
  document.head.appendChild(stil);

  const perdeCiz = () => {
    let perde = document.getElementById('bakim-perde');
    const goster = acik && !yonetici;
    document.body.classList.toggle('bakim-kilit', goster);
    if (!goster) { perde?.remove(); return; }
    if (!perde) {
      perde = document.createElement('div');
      perde.id = 'bakim-perde'; perde.className = 'bakim-perde';
      perde.setAttribute('role', 'alert');
      document.body.appendChild(perde);
    }
    perde.innerHTML = `<div class="bakim-kutu"><div class="bakim-ikon">🛠️</div>
      <h2>${L('Sitede bakım yapılıyor', 'Under maintenance')}</h2>
      <p>${L('Projelerim bölümünde şu an çalışma yapıyoruz. Kısa süre sonra tekrar açılacak, anlayışınız için teşekkürler.', 'We are currently working on the My Projects section. It will be back shortly — thank you for your patience.')}</p>
      <a href="index.html">${L('← ANA SAYFA', '← HOME')}</a></div>`;
  };

  const yoneticiCiz = () => {
    let bar = document.getElementById('bakim-yonetici');
    if (!yonetici) { bar?.remove(); return; }
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'bakim-yonetici';
      (document.querySelector('.pj-hero') || document.querySelector('main') || document.body).appendChild(bar);
    }
    bar.className = 'bakim-yonetici' + (acik ? ' acik' : '');
    bar.innerHTML = `<b>🛠️ ${L('BAKIM MODU', 'MAINTENANCE')}: ${acik ? L('AÇIK', 'ON') : L('KAPALI', 'OFF')}</b>
      <span class="durum">${acik ? L('Müşteriler şu an bakım ekranını görüyor.', 'Clients currently see the maintenance screen.') : L('Sayfa herkese açık.', 'Page is open to everyone.')}</span>
      <button type="button">${acik ? L('BAKIMI KAPAT', 'TURN OFF') : L('BAKIMI AÇ', 'TURN ON')}</button>`;
    bar.querySelector('button').onclick = async e => {
      e.currentTarget.disabled = true;
      const { data, error } = await client.from('sayfa_bakim')
        .update({ acik: !acik, updated_at: new Date().toISOString() }).eq('sayfa', sayfa).select('acik');
      if (error || !data?.length) {
        alertYok(L('Bakım modu değiştirilemedi. supabase/sayfa-bakim.sql çalıştırıldı mı?', 'Could not change maintenance mode.'));
      } else acik = !!data[0].acik;
      ciz();
    };
  };
  const alertYok = m => { const s = document.getElementById('bakim-yonetici'); if (s) s.querySelector('.durum').textContent = m; };

  const ciz = () => { perdeCiz(); yoneticiCiz(); };

  const oku = async () => {
    try {
      const { data, error } = await client.from('sayfa_bakim').select('acik').eq('sayfa', sayfa).maybeSingle();
      acik = !error && !!data?.acik;
    } catch { acik = false; }
    ciz();
  };

  const kur = async () => {
    const a = window.DerinAuth;
    if (!a) return;
    const st = await a.ready;
    client = st?.client || a.client;
    if (!client) return;
    yonetici = a.profile?.role === 'admin';
    await oku();
    if (!kanal) {
      kanal = true;
      client.channel('bakim-' + sayfa)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'sayfa_bakim' }, oku)
        .subscribe();
    }
    window.addEventListener('derin:authchange', () => { yonetici = window.DerinAuth?.profile?.role === 'admin'; ciz(); });
    // Dil değişince yazılar yeniden çizilir.
    new MutationObserver(ciz).observe(document.documentElement, { attributes: true, attributeFilter: ['data-dil'] });
  };

  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', kur) : kur();
})();
