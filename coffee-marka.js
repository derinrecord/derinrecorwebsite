(() => {
  const byId = id => document.getElementById(id);
  const safe = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const client = window.supabase.createClient(
    window.DERIN_CONFIG.supabaseUrl, window.DERIN_CONFIG.supabasePublishableKey);

  const slug = decodeURIComponent(location.pathname.split('/').filter(Boolean).pop() || '');
  const hhmm = t => t ? String(t).slice(0,5) : null;

  const ETIKET = { morning:'SABAH', midday:'ÖĞLE', evening:'AKŞAM', all:'GÜN BOYU' };

  async function ac(kod) {
    const err = byId('br-err');
    err.textContent = 'Kontrol ediliyor…';
    const { data, error } = await client.rpc('coffee_brand_view', { p_slug: slug, p_code: kod });
    if (error) { err.textContent = 'Hata: ' + error.message; return; }
    if (!data || !data.length) { err.textContent = 'Kod doğru değil ya da sunum hazır değil.'; return; }
    sessionStorage.setItem('br-' + slug, kod);
    ciz(data);
  }

  function ciz(rows) {
    const b = rows[0];
    const listeler = rows.filter(r => r.folder_id);
    byId('br-lock').hidden = true;
    const app = byId('br-app');
    app.hidden = false;

    app.innerHTML = `
      <section class="br-hero">
        <p class="br-eyebrow">DERİN RECORD × ${safe(b.name).toUpperCase()}</p>
        <h1>${safe(b.name)}<br><span style="color:${safe(b.accent_color || '#e8d15a')}">İÇİN KURGULANDI.</span></h1>
        <p class="br-tag">${safe(b.tagline || 'Mekânınızın karakterine göre hazırlanmış, tamamı özgün üretim müzik akışı.')}</p>
        ${(b.roast_profile || (b.tasting_notes && b.tasting_notes.length)) ? `<div class="br-notes">
          ${b.roast_profile ? `<span class="br-note">${safe(b.roast_profile)}</span>` : ''}
          ${(b.tasting_notes || []).map(n => `<span class="br-note">${safe(n)}</span>`).join('')}
        </div>` : ''}
      </section>

      <section class="br-sec">
        <h2>GÜN İÇİ AKIŞ</h2>
        ${listeler.length ? listeler.map(r => `
          <div class="br-day">
            <span class="br-time">${hhmm(r.start_time) && hhmm(r.end_time)
              ? hhmm(r.start_time) + '–' + hhmm(r.end_time)
              : (ETIKET[r.daypart] || 'GÜN BOYU')}</span>
            <span><strong>${safe(r.folder_name)}</strong>
              <small>${r.track_count} parça</small></span>
          </div>`).join('')
          : '<p style="opacity:.6;font-size:13.5px">Akış kurgusu hazırlanıyor.</p>'}
      </section>

      <section class="br-sec">
        <h2>NASIL ÇALIŞIR</h2>
        <div class="br-day"><span class="br-time">01</span>
          <span><strong>Kurulum</strong><small>Mevcut ses sisteminize küçük bir cihaz bağlanır. Bir saat sürmez.</small></span></div>
        <div class="br-day"><span class="br-time">02</span>
          <span><strong>Merkezden yönetim</strong><small>Tüm şubelerin müziği tek panelden anlık değişir.</small></span></div>
        <div class="br-day"><span class="br-time">03</span>
          <span><strong>Yıllık lisans</strong><small>Tüm eserler Derin Record'a aittir; üçüncü taraf telif riski yoktur.</small></span></div>
      </section>

      <div class="br-cta">
        <a href="/coffee">TEKLİF VE FİYATLANDIRMA →</a>
      </div>`;
  }

  byId('br-enter').onclick = () => {
    const kod = byId('br-code').value.trim();
    if (kod) ac(kod);
  };
  byId('br-code').addEventListener('keydown', e => { if (e.key === 'Enter') byId('br-enter').click(); });

  const kayitli = sessionStorage.getItem('br-' + slug);
  if (kayitli) ac(kayitli);
})();
