(() => {
  // ---- Saf yardımcılar (Node'da sınanır) ----
  // Ana sayfa kasetinin alt yazısı branştaki gerçek demolardan gelir (24 Ekim):
  // hiç yoksa YAKINDA, tek demoysa adı, birden çoksa "N DEMO".
  const BRANSLAR = ['aerobik', 'akrobatik', 'artistik', 'ritmik', 'cocuk-fitness'];
  const bransAnahtari = link => {
    const m = /^\/?([a-z-]+)\.html(?:[#?].*)?$/i.exec(String(link || '').trim());
    return m && BRANSLAR.includes(m[1].toLowerCase()) ? m[1].toLowerCase() : null;
  };
  const altYazi = basliklar => !basliklar.length ? 'YAKINDA'
    : basliklar.length === 1 ? String(basliklar[0]) : basliklar.length + ' DEMO';
  const basliklariGuncelle = (katalog, demolar) => katalog.map(k => {
    const b = bransAnahtari(k.link_url);
    if (!b) return k;
    return { ...k, title: altYazi(demolar.filter(d => d.brans === b).map(d => d.baslik)) };
  });
  if (typeof module !== 'undefined') module.exports = { bransAnahtari, altYazi, basliklariGuncelle };
  if (typeof document === 'undefined') return;

  const grid = document.querySelector('.cassette-grid');
  const demos = document.querySelector('#demolar');
  if (!grid || !demos) return;
  const safe = value => String(value || '').replace(/[&<>"']/g, char => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[char]));
  // Yalnızca site içi yollara ve http(s) bağlantılarına izin ver; javascript: gibi şemaları engelle.
  const safeHref = value => { const v = String(value || '').trim(); return /^(https?:\/\/|\/[\w-]|\.\.?\/[\w-]|[\w-]+\.html)/i.test(v) ? v : '#'; };
  // PostgREST tablo bulamazsa teknik mesaj yerine ne yapılacağını söyle.
  const tableHint = message => /demo_catalog|schema cache|does not exist/i.test(String(message))
    ? 'Demo kataloğu tablosu bu projede kurulu değil. Supabase SQL Editor’de supabase/demo-catalog.sql dosyasını bir kez çalıştırıp sayfayı yenileyin.'
    : message;
  const render = items => {
    grid.innerHTML = items.map((item, index) => { const b = bransAnahtari(item.link_url); return `<a class="cassette-card${b ? ' renk-' + b : ''}" href="${safeHref(item.link_url)}"><span class="card-number">${String(index + 1).padStart(2,'0')}</span><img class="demo-cassette-image" src="assets/demo-cassette-derin-record.png" alt="Derin Record kaseti"><div class="card-meta"><strong>${safe(item.branch).toUpperCase()}</strong><span>${safe(item.title).toUpperCase()} →</span></div></a>`; }).join('');
  };
  async function init() {
    await window.DerinAuth.ready;
    const { configured, client, profile } = window.DerinAuth;
    if (!configured) return;
    // Branş sayfalarındaki demolar (tablo yoksa katalog başlıkları olduğu gibi kalır).
    const { data: demolar, error: demoHata } = await client.from('demo_parcalari').select('brans,baslik');
    const guncelle = liste => (demoHata || !demolar) ? liste : basliklariGuncelle(liste, demolar);
    const { data, error } = await client.from('demo_catalog').select('*').order('sort_order').order('created_at');
    if (!error && data?.length) render(guncelle(data));
    if (profile?.role !== 'admin') return;
    const panel = document.createElement('section');
    panel.className = 'demo-manager';
    panel.innerHTML = '<button type="button" class="demo-manager-toggle">KASET YÖNETİMİ</button><div class="demo-manager-body" hidden><p>Yeni demo kaseti ekle veya mevcut bir kaseti kaldır.</p><form><input name="branch" maxlength="60" placeholder="Branş adı" required><input name="title" maxlength="80" placeholder="Demo adı" required><input name="link" maxlength="180" placeholder="Bağlantı: örn. aerobik.html" required><button>KASET EKLE</button></form><div class="demo-manager-list"></div></div>';
    demos.querySelector('.demos-heading').after(panel);
    const body = panel.querySelector('.demo-manager-body');
    panel.querySelector('.demo-manager-toggle').onclick = () => { body.hidden = !body.hidden; };
    const list = panel.querySelector('.demo-manager-list');
    const refresh = async () => {
      const { data: current, error: listError } = await client.from('demo_catalog').select('*').order('sort_order').order('created_at');
      if (listError) { list.textContent = tableHint(listError.message); return; }
      render(guncelle(current || []));
      list.innerHTML = (current || []).map(item => `<div><span>${safe(item.branch)} — ${safe(item.title)}</span><button type="button" data-remove="${item.id}">KALDIR</button></div>`).join('') || 'Henüz demo yok.';
      list.querySelectorAll('[data-remove]').forEach(button => button.onclick = async () => { if (!confirm('Bu demo kaseti kaldırılsın mı?')) return; const { data: silinen, error: removeError } = await client.from('demo_catalog').delete().eq('id', button.dataset.remove).select('id'); if (removeError) { list.textContent = removeError.message; return; } if (!silinen || !silinen.length) { list.textContent = 'Kaset kaldırılamadı: kayıt bulunamadı ya da yetkiniz yok.'; return; } refresh(); });
    };
    panel.querySelector('form').onsubmit = async event => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const { error: addError } = await client.from('demo_catalog').insert({ branch: form.get('branch').trim(), title: form.get('title').trim(), link_url: form.get('link').trim(), sort_order: Date.now() });
      if (addError) { list.textContent = tableHint(addError.message); return; }
      event.currentTarget.reset();
      refresh();
    };
    refresh();
  }
  init();
})();
