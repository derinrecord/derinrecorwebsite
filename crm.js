// CRM ekranları (15 Kasım 2026) — mekân radyo lisansı satış takibi, mobil öncelikli.
// Şartname: docs/crm/04-EKRANLAR.md · İş kuralları: docs/crm/03-IS-KURALLARI.md
// Sunucu mantığı Postgres'te (supabase/crm.sql): tek transaction gereken işler RPC ile.
// Yetki: crm_yetkili() = admin VE crm_sahip listesinde; tablolar RLS ile kapalı.
(() => {
  'use strict';
  const S = window.DerinCrmSozluk;
  const $ = id => document.getElementById(id);
  const kacis = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uuid = () => (window.crypto && crypto.randomUUID) ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); });

  let client = null;

  // ───────── Tarih: tek saat dilimi (Europe/Istanbul) ─────────
  const bugun = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const parca = s => s.split('-').map(Number);
  const yaz = d => d.toISOString().slice(0, 10);
  const gunEkle = (s, n) => { const [y, m, g] = parca(s); return yaz(new Date(Date.UTC(y, m - 1, g + n))); };
  const aySonu = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate(); // m: 1-12
  const ayEkle = (s, n) => { const [y, m, g] = parca(s); const hy = y + Math.floor((m - 1 + n) / 12), hm = ((m - 1 + n) % 12 + 12) % 12 + 1; return yaz(new Date(Date.UTC(hy, hm - 1, Math.min(g, aySonu(hy, hm))))); };
  const gunFarki = (a, b) => Math.round((Date.UTC(...parca(b).map((v, i) => i === 1 ? v - 1 : v)) - Date.UTC(...parca(a).map((v, i) => i === 1 ? v - 1 : v))) / 864e5);
  // "ay başı / ortası / sonu": ayın 1'i / 15'i / son günü; geçtiyse sonraki ay (iş kuralları §4.1).
  function ayNoktasi(tur) {
    const b = bugun(); const [y, m] = parca(b);
    const aday = (yy, mm) => { const g = tur === 'basi' ? 1 : tur === 'ortasi' ? 15 : aySonu(yy, mm); return `${yy}-${String(mm).padStart(2, '0')}-${String(g).padStart(2, '0')}`; };
    let t = aday(y, m);
    if (t <= b) { const ny = m === 12 ? y + 1 : y, nm = m === 12 ? 1 : m + 1; t = aday(ny, nm); }
    return t;
  }
  const AYLAR = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
  const GUNLER = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];
  function tarihYazi(s) {
    if (!s) return '';
    const fark = gunFarki(bugun(), s);
    if (fark === 0) return 'Bugün'; if (fark === 1) return 'Yarın'; if (fark === -1) return 'Dün';
    const [y, m, g] = parca(s); const gun = GUNLER[new Date(Date.UTC(y, m - 1, g)).getUTCDay()];
    return `${g} ${AYLAR[m - 1]}${y !== parca(bugun())[0] ? ' ' + y : ''} ${gun}`;
  }
  function onceYazi(ts) {
    if (!ts) return 'temas kaydedilmedi';
    const g = gunFarki(new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(new Date(ts)), bugun());
    return g <= 0 ? 'bugün' : g === 1 ? 'dün' : g + ' gün önce';
  }
  const saatYazi = t => t ? String(t).slice(0, 5) : '';
  const zamanTam = ts => ts ? new Date(ts).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
  const para = n => (n == null || n === '') ? '' : Number(n).toLocaleString('tr-TR', { maximumFractionDigits: 2 }) + ' ₺';

  // ───────── Ortak parçalar ─────────
  const IKON = {
    tel: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1z"/></svg>',
    wa: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm5.3 14.1c-.2.6-1.3 1.2-1.8 1.2-.5.1-1 .2-3.3-.7-2.8-1.1-4.5-3.9-4.7-4.1-.1-.2-1.1-1.5-1.1-2.9s.7-2 1-2.3c.2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.5l.8 2c.1.2.1.4 0 .5l-.3.5-.4.4c-.1.1-.3.3-.1.6.2.3.8 1.3 1.7 2.1 1.2 1 2.1 1.3 2.4 1.5.3.1.5.1.6-.1l.9-1c.2-.3.4-.2.7-.1l1.9.9c.3.1.5.2.5.3.1.2.1.7-.1 1.4z"/></svg>',
    mail: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 5h18a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zm9 7.2L4 7.3V17h16V7.3z"/></svg>'
  };
  function iletisim(tel, wa, eposta) {
    let h = '';
    if (tel) h += `<a class="crm-ikon" href="tel:+${kacis(tel)}" aria-label="Ara">${IKON.tel}</a>`;
    if (tel && wa) h += `<a class="crm-ikon wa" href="https://wa.me/${kacis(tel)}" target="_blank" rel="noopener" aria-label="WhatsApp">${IKON.wa}</a>`;
    if (eposta) h += `<a class="crm-ikon" href="mailto:${kacis(eposta)}" aria-label="E-posta">${IKON.mail}</a>`;
    return h ? `<span class="crm-iletisim">${h}</span>` : '';
  }
  const asamaCip = st => `<span class="crm-asama a-${kacis(st)}">${kacis(S.ad(S.ASAMA, st))}</span>`;
  const sicaklik = h => h ? `<span class="crm-isi i-${h}" title="${kacis(S.SICAKLIK[h])}">${'●'.repeat(h)}<span class="gizli"> ${kacis(S.SICAKLIK[h])}</span></span>` : '';
  const cipler = (sozluk, sira, secili, ad, coklu) => (sira || Object.keys(sozluk)).map(k =>
    `<button type="button" class="crm-cip${(coklu ? secili.includes(k) : secili === k) ? ' on' : ''}" data-${ad}="${kacis(k)}" aria-pressed="${(coklu ? secili.includes(k) : secili === k)}">${kacis(sozluk[k])}</button>`).join('');

  function toast(metin, hata) {
    const t = $('crm-toast'); t.textContent = metin; t.className = 'crm-toast goster' + (hata ? ' hata' : '');
    clearTimeout(toast.z); toast.z = setTimeout(() => { t.className = 'crm-toast'; }, hata ? 4200 : 2400);
  }
  async function rpc(ad, arg) {
    const r = await client.rpc(ad, arg || {});
    if (r.error) throw r.error;
    return r.data;
  }

  // ───────── Alt yan panel (bottom sheet) ─────────
  let sheetKapanis = null;
  function sheetAc(baslik, govde, bagla) {
    const kap = $('crm-sheet'), ic = $('crm-sheet-ic');
    ic.innerHTML = `<div class="crm-sheet-tutamac" aria-hidden="true"></div>
      <div class="crm-sheet-bas"><h2>${baslik}</h2><button type="button" class="crm-kapat" data-sheetkapat aria-label="Kapat">✕</button></div>
      <div class="crm-sheet-govde">${govde}</div>`;
    kap.hidden = false; document.body.classList.add('crm-sheet-acik');
    requestAnimationFrame(() => kap.classList.add('acik'));
    ic.querySelector('[data-sheetkapat]').onclick = sheetKapat;
    if (bagla) bagla(ic.querySelector('.crm-sheet-govde'));
    const ilk = ic.querySelector('[autofocus]'); if (ilk && matchMedia('(pointer:fine)').matches) ilk.focus();
  }
  function sheetKapat() {
    const kap = $('crm-sheet'); kap.classList.remove('acik'); document.body.classList.remove('crm-sheet-acik');
    setTimeout(() => { kap.hidden = true; $('crm-sheet-ic').innerHTML = ''; }, 220);
    if (sheetKapanis) { const f = sheetKapanis; sheetKapanis = null; f(); }
  }
  const sheetGovde = () => $('crm-sheet-ic').querySelector('.crm-sheet-govde');

  // ───────── Yönlendirme ─────────
  const gorunum = () => { const h = location.hash.replace(/^#/, ''); if (h.startsWith('firma/')) return { ad: 'firma', id: Number(h.slice(6)) }; return { ad: ['firmalar', 'odeme'].includes(h) ? h : 'bugun' }; };
  async function ciz() {
    const g = gorunum();
    document.querySelectorAll('[data-sekme]').forEach(b => b.classList.toggle('on', b.dataset.sekme === (g.ad === 'firma' ? 'firmalar' : g.ad)));
    ['bugun', 'firmalar', 'firma', 'odeme'].forEach(a => { $('v-' + a).hidden = a !== g.ad; });
    if (g.ad === 'bugun') await ajandaCiz();
    else if (g.ad === 'firmalar') await firmalarCiz(true);
    else if (g.ad === 'firma') await firmaCiz(g.id);
    if (g.ad !== 'firmalar') window.scrollTo(0, 0);
  }
  function yenile() { const g = gorunum(); if (g.ad === 'bugun') ajandaCiz(); else if (g.ad === 'firma') firmaCiz(g.id); else if (g.ad === 'firmalar') firmalarCiz(false, true); }

  // ───────── ① Bugün (ajanda) ─────────
  let ufuk = Number(sessionStorage.getItem('crm-ufuk')) || 7;
  function gorevSatir(g, firmaAdiGoster) {
    const gec = g.due_date < bugun();
    const zaman = [g.due_is_approx ? '~' : '', g.due_time ? saatYazi(g.due_time) : '', tarihYazi(g.due_date)].filter(Boolean).join(' ');
    return `<li class="crm-gorev${gec ? ' gec' : ''}${g.priority === 'must' ? ' must' : ''}">
      <div class="crm-gorev-ust">
        <span class="crm-gorev-zaman" title="${g.due_is_approx ? 'Yaklaşık tarih' : ''}">${kacis(zaman)}${gec ? ` · <b>${-gunFarki(bugun(), g.due_date)} gün gecikti</b>` : ''}</span>
        ${g.priority === 'must' ? '<span class="crm-must">MUTLAKA</span>' : ''}
        ${g.snooze_count >= 3 ? `<span class="crm-erteleme" title="Çok ertelenen görev">${g.snooze_count}× ertelendi</span>` : ''}
      </div>
      ${firmaAdiGoster ? `<a class="crm-gorev-firma" href="#firma/${g.account_id}">${kacis(g.account_name)}</a>` : ''}
      <div class="crm-gorev-kisi"><span>${kacis(S.ad(S.GOREV, g.task_type))}${g.contact_name ? ' · ' + kacis(g.contact_name) : ''}</span>${iletisim(g.contact_phone_e164, g.contact_is_whatsapp)}</div>
      ${g.note ? `<p class="crm-gorev-not">${kacis(g.note)}</p>` : ''}${g.due_label ? `<p class="crm-gorev-etiket">“${kacis(g.due_label)}”</p>` : ''}
      <div class="crm-gorev-eylem">
        <button type="button" class="crm-btn ana" data-tamamla="${g.task_id}" data-firma="${g.account_id}">Tamamla</button>
        <button type="button" class="crm-btn" data-ertele="${g.task_id}">Ertele</button>
      </div>
    </li>`;
  }
  function firmaSatir(a) {
    const k = a.primary_contact || {}, t = a.next_task;
    const rakip = a.competitor_contract_ends_at ? gunFarki(bugun(), a.competitor_contract_ends_at) : null;
    return `<li class="crm-firma-satir"><a href="#firma/${a.account_id}">
        <span class="crm-fs-ust"><b>${kacis(a.name)}</b>${sicaklik(a.heat)}</span>
        <span class="crm-fs-orta">${asamaCip(a.stage)}${a.city ? `<span>${kacis(a.city)}</span>` : ''}${a.branches ? `<span>${kacis(S.liste(a.branches).map(b => S.ad(S.BRANS, b)).join(', '))}</span>` : ''}${a.needs_review ? '<span class="crm-kontrol">kontrol bekliyor</span>' : ''}</span>
        <span class="crm-fs-alt">${t ? `<span>Sonraki: ${t.due_is_approx ? '~' : ''}${kacis(tarihYazi(t.due_date))} · ${kacis(S.ad(S.GOREV, t.task_type))}</span>` : '<span class="soluk">Açık görev yok</span>'}<span>Son temas: ${kacis(onceYazi(a.last_activity_at))}</span>${rakip != null ? `<span class="${rakip <= 60 ? 'kirmizi' : ''}">Rakip bitişi: ${kacis(tarihYazi(a.competitor_contract_ends_at))}</span>` : ''}</span>
      </a>${k.phone_e164 ? `<span class="crm-fs-tel">${iletisim(k.phone_e164, k.is_whatsapp)}</span>` : ''}</li>`;
  }
  async function ajandaCiz() {
    const v = $('v-bugun');
    if (!v.dataset.dolu) v.innerHTML = '<p class="crm-yukleniyor">Ajanda yükleniyor…</p>';
    let d;
    try { d = await rpc('crm_ajanda', { p_ufuk: ufuk, p_sahip: null }); }
    catch (e) { v.innerHTML = `<p class="crm-hata">${kacis(S.hataMetni(e))}</p>`; return; }
    const grup = (ikon, baslik, dizi, satir, bos, sinif) => `<section class="crm-grup ${sinif || ''}"><h2><span aria-hidden="true">${ikon}</span> ${baslik} <em>${dizi.length}</em></h2>${dizi.length ? `<ul class="crm-liste">${dizi.map(satir).join('')}</ul>` : `<p class="crm-bos">${bos}</p>`}</section>`;
    const gs = g => gorevSatir(g, true);
    const toplamIs = d.gecikmis.length + d.bugunku.length;
    v.innerHTML = `
      <div class="crm-bas"><p class="crm-eyebrow">${kacis(new Date(d.bugun + 'T12:00:00Z').toLocaleDateString('tr-TR', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' }))}</p>
        <h1>BUGÜN<span>.</span></h1>
        <p class="crm-alt">${toplamIs ? `${toplamIs} iş seni bekliyor` : 'Bugün için açık iş yok'}</p></div>
      ${d.gecikmis.length ? grup('⚠', 'Gecikmiş', d.gecikmis, gs, '', 'gecikmis') : ''}
      ${grup('📅', 'Bugün', d.bugunku, gs, 'Bugüne görev yok. Firmalar’dan birini seçip görüşme yazabilirsin.')}
      <section class="crm-grup"><div class="crm-grup-bas"><h2><span aria-hidden="true">🗓</span> Önümüzdeki günler <em>${d.hafta.length}</em></h2>
        <div class="crm-ufuk" role="group" aria-label="Ufuk">${[7, 30, 90].map(n => `<button type="button" data-ufuk="${n}" class="${n === ufuk ? 'on' : ''}" aria-pressed="${n === ufuk}">${n} gün</button>`).join('')}</div></div>
        ${d.hafta.length ? `<ul class="crm-liste">${d.hafta.map(gs).join('')}</ul>` : '<p class="crm-bos">Bu aralıkta planlı görev yok.</p>'}</section>
      ${grup('🔥', 'Fırsatlar', d.firsatlar, firmaSatir, 'Rakip sözleşmesi 60 gün içinde biten firma yok.')}
      ${grup('💤', 'Dokunulmamış', d.dokunulmamis, firmaSatir, '30 günden uzun süredir dokunulmamış takip yok.')}`;
    v.dataset.dolu = '1';
    v.querySelectorAll('[data-ufuk]').forEach(b => b.onclick = () => { ufuk = Number(b.dataset.ufuk); sessionStorage.setItem('crm-ufuk', ufuk); ajandaCiz(); });
    gorevEylemBagla(v, [...d.gecikmis, ...d.bugunku, ...d.hafta]);
  }
  function gorevEylemBagla(kok, gorevler) {
    kok.querySelectorAll('[data-tamamla]').forEach(b => b.onclick = async () => {
      const g = gorevler.find(x => String(x.task_id) === b.dataset.tamamla);
      await aktiviteAkisi({ hesap: Number(b.dataset.firma), gorev: g });
    });
    kok.querySelectorAll('[data-ertele]').forEach(b => b.onclick = () => ertelePaneli(Number(b.dataset.ertele)));
  }

  // ───────── ② Firmalar ─────────
  const F_ANAHTAR = 'crm-firmalar';
  const fVarsayilan = () => ({ search: '', stages: [], branch: '', heat: '', bayrak: [], sort: '', sayfa: 1, scroll: 0 });
  let f = (() => { try { return Object.assign(fVarsayilan(), JSON.parse(sessionStorage.getItem(F_ANAHTAR) || '{}')); } catch { return fVarsayilan(); } })();
  let fSatirlar = [], fToplam = 0;
  const fSakla = () => { try { sessionStorage.setItem(F_ANAHTAR, JSON.stringify(f)); } catch { /* özel mod */ } };
  const BAYRAK = { no_open_task: 'Açık görevi yok', untouched_days: '30+ gün dokunulmamış', competitor_within_days: 'Rakip bitişi ≤ 90 gün', needs_review: 'Kontrol bekliyor' };
  function fFiltre(sayfa) {
    const p = { search: f.search || null, stages: f.stages, branch: f.branch || null, heat: f.heat || null, sort: f.sort || null, page: sayfa, page_size: 30 };
    if (f.bayrak.includes('no_open_task')) p.no_open_task = true;
    if (f.bayrak.includes('untouched_days')) p.untouched_days = 30;
    if (f.bayrak.includes('competitor_within_days')) p.competitor_within_days = 90;
    if (f.bayrak.includes('needs_review')) p.needs_review = true;
    return p;
  }
  function firmalarIskelet() {
    const v = $('v-firmalar'); if (v.dataset.iskelet) return; v.dataset.iskelet = '1';
    v.innerHTML = `<div class="crm-bas"><p class="crm-eyebrow">MEKÂNLAR</p><h1>FİRMA<span>LAR.</span></h1></div>
      <div class="crm-ara"><input type="search" id="f-ara" placeholder="Ad, kişi ya da telefon" aria-label="Firma ara" enterkeyhint="search"></div>
      <div class="crm-filtre" id="f-filtre"></div>
      <p class="crm-sayac" id="f-sayac" aria-live="polite"></p>
      <ul class="crm-liste" id="f-liste"></ul>
      <button type="button" class="crm-btn genis" id="f-daha" hidden>Daha fazla</button>`;
    const ara = $('f-ara'); ara.value = f.search;
    let z; ara.oninput = () => { clearTimeout(z); z = setTimeout(() => { f.search = ara.value.trim(); f.sayfa = 1; f.scroll = 0; firmalarCiz(false, true); }, 280); };
    $('f-daha').onclick = async () => { f.sayfa += 1; await firmalarGetir(f.sayfa, true); fSakla(); };
  }
  function filtreCiz() {
    const kutu = $('f-filtre');
    const asamaYazi = f.stages.length ? f.stages.map(s => S.ad(S.ASAMA, s)).join(', ') : 'Tüm aşamalar';
    kutu.innerHTML = `
      <div class="crm-cipler kaydir">
        <button type="button" class="crm-cip acilir${f.stages.length ? ' on' : ''}" data-fpanel="asama">${kacis(asamaYazi)} ▾</button>
        <button type="button" class="crm-cip acilir${f.branch ? ' on' : ''}" data-fpanel="brans">${kacis(f.branch ? S.ad(S.BRANS, f.branch) : 'Branş')} ▾</button>
        <button type="button" class="crm-cip acilir${f.heat ? ' on' : ''}" data-fpanel="isi">${kacis(f.heat ? S.SICAKLIK[f.heat] : 'Sıcaklık')} ▾</button>
        ${Object.keys(BAYRAK).map(k => `<button type="button" class="crm-cip${f.bayrak.includes(k) ? ' on' : ''}" data-bayrak="${k}" aria-pressed="${f.bayrak.includes(k)}">${BAYRAK[k]}</button>`).join('')}
      </div>
      <div class="crm-sirala"><label>Sırala <select id="f-sirala">
        <option value="">Son temas</option><option value="next_task"${f.sort === 'next_task' ? ' selected' : ''}>Sonraki görev</option>
        <option value="name"${f.sort === 'name' ? ' selected' : ''}>Ad</option><option value="created"${f.sort === 'created' ? ' selected' : ''}>Eklenme</option></select></label>
        ${(f.stages.length || f.branch || f.heat || f.bayrak.length || f.search) ? '<button type="button" class="crm-link" id="f-temizle">Filtreleri temizle</button>' : ''}</div>`;
    const yenidenAra = () => { f.sayfa = 1; f.scroll = 0; firmalarCiz(false, true); };
    kutu.querySelectorAll('[data-bayrak]').forEach(b => b.onclick = () => { const k = b.dataset.bayrak; f.bayrak = f.bayrak.includes(k) ? f.bayrak.filter(x => x !== k) : [...f.bayrak, k]; yenidenAra(); });
    $('f-sirala').onchange = e => { f.sort = e.target.value; yenidenAra(); };
    const t = $('f-temizle'); if (t) t.onclick = () => { f = fVarsayilan(); $('f-ara').value = ''; yenidenAra(); };
    kutu.querySelectorAll('[data-fpanel]').forEach(b => b.onclick = () => {
      const tur = b.dataset.fpanel;
      if (tur === 'asama') {
        let secim = [...f.stages];
        sheetAc('Aşama', `<div class="crm-cipler">${cipler(S.ASAMA, S.ASAMA_SIRA, secim, 'secasama', true)}</div><div class="crm-sheet-alt"><button type="button" class="crm-btn" data-temiz>Temizle</button><button type="button" class="crm-btn ana" data-uygula>Uygula</button></div>`, g => {
          g.querySelectorAll('[data-secasama]').forEach(c => c.onclick = () => { const k = c.dataset.secasama; secim = secim.includes(k) ? secim.filter(x => x !== k) : [...secim, k]; c.classList.toggle('on'); c.setAttribute('aria-pressed', secim.includes(k)); });
          g.querySelector('[data-temiz]').onclick = () => { f.stages = []; sheetKapat(); yenidenAra(); };
          g.querySelector('[data-uygula]').onclick = () => { f.stages = secim; sheetKapat(); yenidenAra(); };
        });
      } else {
        const sozluk = tur === 'brans' ? S.BRANS : S.SICAKLIK, alan = tur === 'brans' ? 'branch' : 'heat';
        sheetAc(tur === 'brans' ? 'Branş' : 'Sıcaklık', `<div class="crm-cipler">${cipler(sozluk, null, String(f[alan]), 'sectek', false)}</div><div class="crm-sheet-alt"><button type="button" class="crm-btn" data-temiz>Hepsi</button></div>`, g => {
          g.querySelectorAll('[data-sectek]').forEach(c => c.onclick = () => { f[alan] = c.dataset.sectek; sheetKapat(); yenidenAra(); });
          g.querySelector('[data-temiz]').onclick = () => { f[alan] = ''; sheetKapat(); yenidenAra(); };
        });
      }
    });
  }
  async function firmalarGetir(sayfa, ekle) {
    let d;
    try { d = await rpc('crm_firmalar', { p: fFiltre(sayfa) }); }
    catch (e) { $('f-sayac').textContent = S.hataMetni(e); return false; }
    fToplam = d.toplam; fSatirlar = ekle ? [...fSatirlar, ...d.satirlar] : d.satirlar;
    $('f-liste').innerHTML = fSatirlar.length ? fSatirlar.map(firmaSatir).join('') : '<li class="crm-bos">Bu filtrelerle firma yok.</li>';
    $('f-sayac').textContent = `${fToplam} firma`;
    $('f-daha').hidden = fSatirlar.length >= fToplam;
    return true;
  }
  // Listeye dönüşte filtre + kaydırma konumu korunur (04-EKRANLAR · mobil kuralları).
  async function firmalarCiz(geriDonus, sifirla) {
    firmalarIskelet(); filtreCiz(); fSakla();
    const hedefSayfa = geriDonus ? f.sayfa : 1;
    if (!geriDonus && sifirla) f.sayfa = 1;
    fSatirlar = [];
    for (let s = 1; s <= hedefSayfa; s++) { if (!await firmalarGetir(s, s > 1)) break; }
    if (geriDonus && f.scroll) requestAnimationFrame(() => window.scrollTo(0, f.scroll));
  }
  window.addEventListener('scroll', () => { if (gorunum().ad === 'firmalar') { f.scroll = window.scrollY; clearTimeout(firmalarCiz.z); firmalarCiz.z = setTimeout(fSakla, 150); } }, { passive: true });

  // ───────── ④ Firma kartı ─────────
  let kart = null;
  async function firmaCiz(id) {
    const v = $('v-firma');
    if (!kart || kart.firma.account_id !== id) v.innerHTML = '<p class="crm-yukleniyor">Firma yükleniyor…</p>';
    try { kart = await rpc('crm_firma', { p_account: id }); }
    catch (e) { v.innerHTML = `<a class="crm-geri" href="#firmalar">← Firmalar</a><p class="crm-hata">${kacis(S.hataMetni(e))}</p>`; return; }
    const a = kart.firma, b = bugun();
    const rakipGun = a.competitor_contract_ends_at ? gunFarki(b, a.competitor_contract_ends_at) : null;
    const kisiAdi = id2 => { const k = kart.kisiler.find(x => x.contact_id === id2); return k ? (k.name || 'İsimsiz kişi') : ''; };
    const birincil = kart.kisiler[0];
    const gorevler = kart.gorevler.map(t => Object.assign({}, t, { account_name: a.name, contact_name: kisiAdi(t.contact_id) || (birincil && birincil.name), contact_phone_e164: (kart.kisiler.find(x => x.contact_id === t.contact_id) || birincil || {}).phone_e164, contact_is_whatsapp: (kart.kisiler.find(x => x.contact_id === t.contact_id) || birincil || {}).is_whatsapp }));
    const alan = (et, deger) => `<div><dt>${et}</dt><dd>${deger ? kacis(deger) : '<span class="soluk">kaydedilmedi</span>'}</dd></div>`;
    v.innerHTML = `
      <a class="crm-geri" href="#firmalar">← Firmalar</a>
      ${a.needs_review ? '<div class="crm-serit"><span>İçe aktarımdan ya da çözülemeyen bir numarayla geldi; kontrol et.</span><button type="button" class="crm-btn" data-kontrol>Kontrol edildi</button></div>' : ''}
      <header class="crm-kart-bas">
        <p class="crm-eyebrow">${kacis([S.liste(a.branches).map(x => S.ad(S.BRANS, x)).join(', '), [a.district, a.city].filter(Boolean).join(' / ')].filter(Boolean).join(' · ') || 'FİRMA')}</p>
        <h1 class="crm-kart-ad">${kacis(a.name)}</h1>
        <div class="crm-kart-cipler"><button type="button" class="crm-asama-btn" data-asama>${asamaCip(a.stage)} <span aria-hidden="true">▾</span><span class="gizli">Aşamayı değiştir</span></button>${sicaklik(a.heat)}
          ${S.liste(a.tags).map(t => `<span class="crm-etiket${t.startsWith('feat_') ? ' istek' : ''}">${kacis(S.ad(S.ETIKET, t))}</span>`).join('')}</div>
        ${a.current_software || a.competitor_contract_ends_at ? `<p class="crm-rakip${rakipGun != null && rakipGun <= 60 ? ' yakin' : ''}">Şu an: <b>${kacis(S.ad(S.YAZILIM, a.current_software) || 'kaydedilmedi')}</b>${a.competitor_contract_ends_at ? ` · sözleşme bitişi <b>${kacis(tarihYazi(a.competitor_contract_ends_at))}</b>${rakipGun != null ? ` (${rakipGun < 0 ? -rakipGun + ' gün önce bitti' : rakipGun + ' gün kaldı'})` : ''}` : ''}${a.competitor_annual_fee ? ` · yıllık ${kacis(para(a.competitor_annual_fee))}` : ''}</p>` : ''}
        <div class="crm-kart-eylem"><button type="button" class="crm-btn ana" data-aktivite>Görüşme yaz</button><button type="button" class="crm-btn" data-gorevekle>Görev ekle</button><button type="button" class="crm-btn" data-duzenle>Düzenle</button></div>
      </header>
      <section class="crm-blok"><div class="crm-blok-bas"><h2>Kişiler <em>${kart.kisiler.length}</em></h2><button type="button" class="crm-link" data-kisiekle>+ Kişi ekle</button></div>
        ${kart.kisiler.length ? `<ul class="crm-kisiler">${kart.kisiler.map(k => `<li><button type="button" class="crm-kisi-ad" data-kisi="${k.contact_id}"><span><b>${kacis(k.name || 'İsimsiz kişi')}</b>${k.is_decision_maker ? ' <span class="crm-yildiz" title="Karar verici">★</span>' : ''}${k.is_primary ? ' <span class="crm-birincil">birincil</span>' : ''}</span><span class="crm-kisi-rol">${kacis([S.ad(S.ROL, k.role), k.phone_e164 ? '+' + k.phone_e164 : (k.phone_raw ? k.phone_raw + ' (çözülemedi)' : '')].filter(Boolean).join(' · '))}${k.receives_payment_reminder ? ' · hatırlatma alıcısı' : ''}</span></button>${iletisim(k.phone_e164, k.is_whatsapp, k.email)}</li>`).join('')}</ul>` : '<p class="crm-bos">Kişi kaydedilmedi.</p>'}
      </section>
      <section class="crm-blok"><div class="crm-blok-bas"><h2>Açık görevler <em>${gorevler.length}</em></h2></div>
        ${gorevler.length ? `<ul class="crm-liste">${gorevler.map(g => gorevSatir(g, false)).join('')}</ul>` : '<p class="crm-bos">Açık görev yok — sonraki adım ne?</p>'}
      </section>
      <section class="crm-blok"><div class="crm-blok-bas"><h2>Görüşmeler <em>${kart.gorusme_sayisi}</em></h2></div>
        <ol class="crm-tunel" id="k-tunel">${tunelSatirlari(kart.gorusmeler, kisiAdi)}</ol>
        ${kart.gorusme_sayisi > kart.gorusmeler.length ? '<button type="button" class="crm-btn genis" data-tumgorusme>Daha eski görüşmeler</button>' : ''}
      </section>
      <section class="crm-blok"><div class="crm-blok-bas"><h2>Profil</h2><button type="button" class="crm-link" data-duzenle>Düzenle</button></div>
        <dl class="crm-alanlar">${alan('İl / ilçe', [a.city, a.district].filter(Boolean).join(' / '))}${alan('Kuruluş', S.ad(S.KURULUS, a.organization_type))}${alan('Kaynak', S.ad(S.KAYNAK, a.source))}${alan('Web', a.website_url)}${alan('Instagram', a.instagram_url)}${alan('Mekân notu', a.facility_note)}${alan('Rakip notu', a.competitor_note)}${alan('Kayıp nedeni', S.ad(S.KAYIP, a.lost_reason))}${alan('Genel not', a.notes)}${alan('Eklenme', zamanTam(a.created_at))}</dl>
      </section>
      ${a.stage === 'member' ? '<section class="crm-blok"><h2>Ödeme</h2><p class="crm-bos">Ödeme takibi bir sonraki aşamada bu karta eklenecek.</p></section>' : ''}`;
    // Yanlış açılan görev Ertele panelindeki "Görevi iptal et" ile kapatılır.
    gorevEylemBagla(v, gorevler);
    v.querySelectorAll('[data-devam]').forEach(btn => btn.onclick = () => { btn.parentElement.classList.add('acik'); btn.remove(); });
    const kontrol = v.querySelector('[data-kontrol]');
    if (kontrol) kontrol.onclick = async () => { const r = await client.from('crm_account').update({ needs_review: false }).eq('account_id', a.account_id); if (r.error) toast(S.hataMetni(r.error), true); else { toast('Kontrol edildi olarak işaretlendi'); firmaCiz(a.account_id); } };
    v.querySelector('[data-asama]').onclick = () => asamaPaneli(a);
    v.querySelector('[data-aktivite]').onclick = () => aktiviteAkisi({ hesap: a.account_id });
    v.querySelector('[data-gorevekle]').onclick = () => gorevEklePaneli(a.account_id);
    v.querySelectorAll('[data-duzenle]').forEach(x => x.onclick = () => duzenlePaneli(a));
    v.querySelector('[data-kisiekle]').onclick = () => kisiPaneli(a.account_id, null);
    v.querySelectorAll('[data-kisi]').forEach(x => x.onclick = () => kisiPaneli(a.account_id, kart.kisiler.find(k => String(k.contact_id) === x.dataset.kisi)));
    const tum = v.querySelector('[data-tumgorusme]');
    if (tum) tum.onclick = async () => {
      const r = await client.from('crm_activity').select('activity_id,contact_id,activity_type,direction,outcome,occurred_at,summary,materials,offer_amount,offer_note').eq('account_id', a.account_id).eq('is_deleted', false).order('occurred_at', { ascending: false }).limit(500);
      if (r.error) { toast(S.hataMetni(r.error), true); return; }
      $('k-tunel').innerHTML = tunelSatirlari(r.data, kisiAdi); tum.remove();
      $('k-tunel').querySelectorAll('[data-devam]').forEach(btn => btn.onclick = () => { btn.parentElement.classList.add('acik'); btn.remove(); });
    };
  }
  function tunelSatirlari(gorusmeler, kisiAdi) {
    if (!gorusmeler.length) return '<li class="crm-bos">Henüz görüşme kaydedilmedi.</li>';
    return gorusmeler.map(g => {
      const uzun = (g.summary || '').length > 240;
      const malz = S.liste(g.materials).map(m => S.ad(S.MATERYAL, m)).join(', ');
      return `<li class="crm-tunel-satir o-${kacis(g.outcome || 'yok')}">
        <p class="crm-tunel-ust"><time>${kacis(zamanTam(g.occurred_at))}</time> · ${kacis(S.ad(S.AKTIVITE, g.activity_type))}${g.direction === 'inbound' ? ' (gelen)' : ''}${g.contact_id && kisiAdi(g.contact_id) ? ' · ' + kacis(kisiAdi(g.contact_id)) : ''}</p>
        ${g.outcome ? `<p class="crm-tunel-sonuc">${kacis(S.ad(S.SONUC, g.outcome))}</p>` : ''}
        ${g.summary ? `<div class="crm-tunel-not${uzun ? ' kisa' : ''}"><p>${kacis(g.summary)}</p>${uzun ? '<button type="button" class="crm-link" data-devam>devamı</button>' : ''}</div>` : ''}
        ${malz || g.offer_amount ? `<p class="crm-tunel-ek">${malz ? 'Gönderilen: ' + kacis(malz) : ''}${g.offer_amount ? (malz ? ' · ' : '') + 'Teklif: ' + kacis(para(g.offer_amount)) : ''}${g.offer_note ? ' — ' + kacis(g.offer_note) : ''}</p>` : ''}
      </li>`;
    }).join('');
  }

  // ───────── Görev tarihi seçici (aktivite 3. adım, görev ekle, aşama=beklemede) ─────────
  const KISAYOL = [
    ['yarin', 'Yarın'], ['3gun', '3 gün'], ['hafta', 'Haftaya'], ['aybasi', 'Ay başı'], ['ayortasi', 'Ay ortası'], ['aysonu', 'Ay sonu'],
    ['1ay', '+1 ay'], ['3ay', '+3 ay'], ['6ay', '+6 ay']
  ];
  function kisayolTarih(k) {
    const b = bugun();
    switch (k) {
      case 'yarin': return [gunEkle(b, 1), false]; case '3gun': return [gunEkle(b, 3), false]; case 'hafta': return [gunEkle(b, 7), false];
      case 'aybasi': return [ayNoktasi('basi'), true]; case 'ayortasi': return [ayNoktasi('ortasi'), true]; case 'aysonu': return [ayNoktasi('sonu'), true];
      case '1ay': return [ayEkle(b, 1), true]; case '3ay': return [ayEkle(b, 3), true]; case '6ay': return [ayEkle(b, 6), true];
    }
    return [b, false];
  }
  function gorevFormu(on, ayar) {
    ayar = ayar || {};
    return `<div class="crm-gorev-form" data-${on}>
      ${ayar.tip !== false ? `<p class="crm-etiket-bas">Ne yapılacak</p><div class="crm-cipler">${cipler(S.GOREV, null, 'call', on + 'tip', false)}</div>` : ''}
      <p class="crm-etiket-bas">Ne zaman</p>
      <div class="crm-cipler">${KISAYOL.map(([k, t]) => `<button type="button" class="crm-cip" data-${on}kisa="${k}">${t}</button>`).join('')}</div>
      <div class="crm-satir2"><label>Tarih<input type="date" data-${on}tarih min="${bugun()}"></label><label><span>Saat <small>(isteğe bağlı)</small></span><input type="time" data-${on}saat></label></div>
      <div class="crm-satir2 tik"><label class="crm-tik"><input type="checkbox" data-${on}yaklasik> Yaklaşık tarih</label>${ayar.onem !== false ? `<label class="crm-tik"><input type="checkbox" data-${on}must> MUTLAKA</label>` : ''}</div>
      ${ayar.etiket !== false ? `<label class="crm-alan"><span>Tarihin söylendiği hâli <small>(ör. “bayramdan sonra”)</small></span><input type="text" data-${on}etiket maxlength="120"></label>` : ''}
      ${ayar.not !== false ? `<label class="crm-alan">Arama öncesi not<textarea data-${on}not rows="2" maxlength="1000" placeholder="Aradığında ilk ne söyleyeceksin?"></textarea></label>` : ''}
    </div>`;
  }
  function gorevFormuBagla(kok, on) {
    let tip = 'call';
    kok.querySelectorAll(`[data-${on}tip]`).forEach(c => c.onclick = () => { tip = c.dataset[on + 'tip']; kok.querySelectorAll(`[data-${on}tip]`).forEach(x => { x.classList.toggle('on', x === c); x.setAttribute('aria-pressed', x === c); }); });
    const tarih = kok.querySelector(`[data-${on}tarih]`), yak = kok.querySelector(`[data-${on}yaklasik]`);
    kok.querySelectorAll(`[data-${on}kisa]`).forEach(c => c.onclick = () => {
      const [t, approx] = kisayolTarih(c.dataset[on + 'kisa']); tarih.value = t; yak.checked = approx;
      kok.querySelectorAll(`[data-${on}kisa]`).forEach(x => x.classList.toggle('on', x === c));
    });
    tarih.oninput = () => kok.querySelectorAll(`[data-${on}kisa]`).forEach(x => x.classList.remove('on'));
    return () => {
      const deger = s => { const e = kok.querySelector(`[data-${on}${s}]`); return e ? e.value.trim() : ''; };
      if (!tarih.value) return null;
      const m = kok.querySelector(`[data-${on}must]`);
      return { task_type: tip, due_date: tarih.value, due_time: deger('saat') || null, due_is_approx: yak.checked, due_label: deger('etiket') || null, priority: m && m.checked ? 'must' : 'normal', note: deger('not') || null };
    };
  }

  // ───────── ③ Görüşme sonrası akış — üç tık ─────────
  async function aktiviteAkisi({ hesap, gorev }) {
    let kisiler = (kart && kart.firma.account_id === hesap) ? kart.kisiler : null;
    if (!kisiler) { try { kisiler = (await rpc('crm_firma', { p_account: hesap })).kisiler; } catch (e) { toast(S.hataMetni(e), true); return; } }
    const st = { adim: 1, sonuc: '', tip: gorev && ['call', 'whatsapp', 'email', 'demo', 'visit'].includes(gorev.task_type) ? gorev.task_type : 'call', yon: 'outbound', kisi: (gorev && gorev.contact_id) || (kisiler[0] && kisiler[0].contact_id) || '', malz: [], istek: uuid(), gorevIstek: uuid(), kayip: '', asama: '' };
    const baslik = gorev ? 'Görevi tamamla' : 'Görüşme yaz';
    sheetAc(baslik, `
      <ol class="crm-adimlar" aria-label="Adımlar"><li data-adim-g="1" class="on">Sonuç</li><li data-adim-g="2">Not</li><li data-adim-g="3">Sonraki</li></ol>
      <div data-adim="1">
        <div class="crm-cipler kucuk">${cipler(S.AKTIVITE, ['call', 'whatsapp', 'email', 'demo', 'visit', 'offer', 'note'], st.tip, 'atip', false)}</div>
        <div class="crm-sonuclar">${S.SONUC_SIRA.map(k => `<button type="button" class="crm-sonuc s-${k}" data-sonuc="${k}">${kacis(S.SONUC[k])}</button>`).join('')}</div>
      </div>
      <div data-adim="2" hidden>
        <p class="crm-secilen" data-secilen></p>
        <label class="crm-alan"><span>Not <small>(telefonun sesle yazdırmasını kullanabilirsin)</small></span><textarea data-ozet rows="7" maxlength="8000" placeholder="Ne konuştunuz, ne istedi, neye takıldı?"></textarea></label>
        ${kisiler.length ? `<label class="crm-alan">Kiminle<select data-kisisec>${kisiler.map(k => `<option value="${k.contact_id}"${String(k.contact_id) === String(st.kisi) ? ' selected' : ''}>${kacis(k.name || 'İsimsiz kişi')}${k.role ? ' · ' + kacis(S.ad(S.ROL, k.role)) : ''}</option>`).join('')}<option value="">Belirtme</option></select></label>` : ''}
        <div class="crm-cipler kucuk">${cipler(S.YON, null, st.yon, 'yon', false)}</div>
        <p class="crm-etiket-bas">Gönderilen</p><div class="crm-cipler kucuk">${cipler(S.MATERYAL, null, st.malz, 'malz', true)}</div>
        <div data-teklif hidden><div class="crm-satir2"><label>Teklif tutarı (₺)<input type="text" inputmode="decimal" data-tutar placeholder="ör. 4.800"></label><label>Teklif notu<input type="text" data-tnot maxlength="300"></label></div></div>
        <div class="crm-sheet-alt"><button type="button" class="crm-btn" data-geri="1">Geri</button><button type="button" class="crm-btn ana" data-ileri>İleri</button></div>
      </div>
      <div data-adim="3" hidden>
        <div data-kayipkutu hidden><p class="crm-etiket-bas">Neden olmadı?</p><div class="crm-cipler">${cipler(S.KAYIP, null, '', 'kayip', false)}</div><p class="crm-kucuk-not">Firma “Olumsuz” aşamasına geçer.</p></div>
        <div data-sonrakikutu><p class="crm-zorunlu" data-zorunlu hidden>“Müsait değil, tekrar” seçtin: tekrar arama tarihini seç.</p>${gorevFormu('n')}
          <label class="crm-alan"><span>Aşama <small>(değişmeyecekse boş bırak)</small></span><select data-asamasec><option value="">Değişmesin</option>${S.ASAMA_SIRA.filter(k => k !== 'lost').map(k => `<option value="${k}">${kacis(S.ASAMA[k])}</option>`).join('')}</select></label></div>
        <p class="crm-hata" data-hata hidden></p>
        <div class="crm-sheet-alt"><button type="button" class="crm-btn" data-geri="2">Geri</button><button type="button" class="crm-btn ana" data-kaydet>Kaydet</button></div>
      </div>`, g => {
      const adimaGit = n => { st.adim = n; g.querySelectorAll('[data-adim]').forEach(x => { x.hidden = Number(x.dataset.adim) !== n; }); g.querySelectorAll('[data-adim-g]').forEach(x => x.classList.toggle('on', Number(x.dataset.adimG) <= n)); g.closest('.crm-sheet-ic').scrollTop = 0; };
      g.querySelectorAll('[data-atip]').forEach(c => c.onclick = () => { st.tip = c.dataset.atip; g.querySelectorAll('[data-atip]').forEach(x => { x.classList.toggle('on', x === c); x.setAttribute('aria-pressed', x === c); }); });
      g.querySelectorAll('[data-sonuc]').forEach(c => c.onclick = () => {
        st.sonuc = c.dataset.sonuc;
        g.querySelector('[data-secilen]').innerHTML = `${kacis(S.AKTIVITE[st.tip])} · <b>${kacis(S.SONUC[st.sonuc])}</b>`;
        g.querySelector('[data-teklif]').hidden = st.tip !== 'offer';
        const kayip = st.sonuc === 'not_interested';
        g.querySelector('[data-kayipkutu]').hidden = !kayip; g.querySelector('[data-sonrakikutu]').hidden = kayip;
        g.querySelector('[data-zorunlu]').hidden = st.sonuc !== 'busy_callback';
        adimaGit(2); const o = g.querySelector('[data-ozet]'); if (matchMedia('(pointer:fine)').matches) o.focus();
      });
      g.querySelectorAll('[data-yon]').forEach(c => c.onclick = () => { st.yon = c.dataset.yon; g.querySelectorAll('[data-yon]').forEach(x => { x.classList.toggle('on', x === c); x.setAttribute('aria-pressed', x === c); }); });
      g.querySelectorAll('[data-malz]').forEach(c => c.onclick = () => { const k = c.dataset.malz; st.malz = st.malz.includes(k) ? st.malz.filter(x => x !== k) : [...st.malz, k]; c.classList.toggle('on'); c.setAttribute('aria-pressed', st.malz.includes(k)); });
      g.querySelectorAll('[data-kayip]').forEach(c => c.onclick = () => { st.kayip = c.dataset.kayip; g.querySelectorAll('[data-kayip]').forEach(x => { x.classList.toggle('on', x === c); x.setAttribute('aria-pressed', x === c); }); });
      g.querySelectorAll('[data-geri]').forEach(b => b.onclick = () => adimaGit(Number(b.dataset.geri)));
      g.querySelector('[data-ileri]').onclick = () => adimaGit(3);
      const sonraki = gorevFormuBagla(g, 'n');
      const hata = m => { const e = g.querySelector('[data-hata]'); e.textContent = m; e.hidden = !m; };
      const kaydet = g.querySelector('[data-kaydet]');
      kaydet.onclick = async () => {
        hata('');
        const ks = g.querySelector('[data-kisisec]');
        const tutar = (g.querySelector('[data-tutar]').value || '').replace(/\./g, '').replace(',', '.').trim();
        const akt = { activity_type: st.tip, direction: st.yon, outcome: st.sonuc || null, summary: g.querySelector('[data-ozet]').value.trim(),
          contact_id: ks ? (ks.value || null) : null, materials: st.malz.join(',') || null, istek_id: st.istek,
          offer_amount: st.tip === 'offer' && tutar && !isNaN(Number(tutar)) ? Number(tutar) : null, offer_note: st.tip === 'offer' ? g.querySelector('[data-tnot]').value.trim() || null : null };
        let next = null;
        if (st.sonuc === 'not_interested') {
          if (!st.kayip) { hata('Bir neden seç.'); return; }
          akt.stage = 'lost'; akt.lost_reason = st.kayip;
        } else {
          next = sonraki();
          if (st.sonuc === 'busy_callback' && !next) { hata('Tekrar arama için bir tarih seç.'); return; }
          if (next) next.istek_id = st.gorevIstek;
          const yeni = g.querySelector('[data-asamasec]').value; if (yeni) akt.stage = yeni;
        }
        kaydet.disabled = true; kaydet.textContent = 'Kaydediliyor…';
        try {
          if (gorev) await rpc('crm_gorev_tamamla', { p_task: gorev.task_id, p_aktivite: akt, p_sonraki: next });
          else await rpc('crm_aktivite_ekle', { p: Object.assign({ account_id: hesap, next_task: next }, akt) });
          sheetKapat(); toast(gorev ? 'Görev tamamlandı' : 'Görüşme kaydedildi'); yenile();
        } catch (e) { hata(S.hataMetni(e)); kaydet.disabled = false; kaydet.textContent = 'Kaydet'; }
      };
    });
  }

  // ───────── Ertele ─────────
  function ertelePaneli(gorevId) {
    sheetAc('Ertele', `<div class="crm-cipler">${[['yarin', 'Yarın'], ['3gun', '3 gün'], ['hafta', 'Haftaya'], ['aysonu', 'Ay sonu']].map(([k, t]) => `<button type="button" class="crm-cip buyuk" data-ekisa="${k}">${t}</button>`).join('')}</div>
      <div class="crm-satir2"><label>Tarih seç<input type="date" data-etarih min="${bugun()}"></label><label><span>Saat <small>(isteğe bağlı)</small></span><input type="time" data-esaat></label></div>
      <p class="crm-hata" data-hata hidden></p>
      <div class="crm-sheet-alt"><button type="button" class="crm-btn tehlike" data-iptal>Görevi iptal et</button><button type="button" class="crm-btn ana" data-ekaydet>Ertele</button></div>`, g => {
      const git = async (tarih, approx) => {
        try { await rpc('crm_gorev_ertele', { p_task: gorevId, p_tarih: tarih, p_saat: g.querySelector('[data-esaat]').value || null, p_yaklasik: approx, p_etiket: null }); sheetKapat(); toast('Ertelendi: ' + tarihYazi(tarih)); yenile(); }
        catch (e) { const h = g.querySelector('[data-hata]'); h.textContent = S.hataMetni(e); h.hidden = false; }
      };
      g.querySelectorAll('[data-ekisa]').forEach(c => c.onclick = () => { const [t, a] = kisayolTarih(c.dataset.ekisa); git(t, a); });
      g.querySelector('[data-ekaydet]').onclick = () => { const t = g.querySelector('[data-etarih]').value; if (!t) { const h = g.querySelector('[data-hata]'); h.textContent = 'Bir tarih seç ya da kısayola dokun.'; h.hidden = false; return; } git(t, false); };
      g.querySelector('[data-iptal]').onclick = async () => {
        if (!confirm('Bu görev iptal edilsin mi? Görüşme kaydı yazılmaz.')) return;
        try { await rpc('crm_gorev_iptal', { p_task: gorevId }); sheetKapat(); toast('Görev iptal edildi'); yenile(); } catch (e) { toast(S.hataMetni(e), true); }
      };
    });
  }

  // ───────── Görev ekle ─────────
  function gorevEklePaneli(hesap) {
    const istek = uuid();
    sheetAc('Görev ekle', `${gorevFormu('g')}<p class="crm-hata" data-hata hidden></p><div class="crm-sheet-alt"><button type="button" class="crm-btn ana" data-gkaydet>Görevi aç</button></div>`, g => {
      const oku = gorevFormuBagla(g, 'g');
      g.querySelector('[data-gkaydet]').onclick = async () => {
        const p = oku(); const h = g.querySelector('[data-hata]');
        if (!p) { h.textContent = 'Bir tarih seç.'; h.hidden = false; return; }
        p.istek_id = istek;
        try { await rpc('crm_gorev_ekle', { p_account: hesap, p }); sheetKapat(); toast('Görev açıldı'); yenile(); } catch (e) { h.textContent = S.hataMetni(e); h.hidden = false; }
      };
    });
  }

  // ───────── Aşama değiştir ─────────
  function asamaPaneli(a) {
    let secim = a.stage, kayip = a.lost_reason || '';
    sheetAc('Aşama', `<div class="crm-cipler">${cipler(S.ASAMA, S.ASAMA_SIRA, secim, 'asm', false)}</div>
      <div data-akayip hidden><p class="crm-etiket-bas">Neden olmadı?</p><div class="crm-cipler">${cipler(S.KAYIP, null, kayip, 'akyp', false)}</div></div>
      <div data-abekle hidden><p class="crm-zorunlu">Beklemeye alınan firma için ne zaman dönüleceğini seç.</p>${gorevFormu('w', { onem: false })}</div>
      <p class="crm-hata" data-hata hidden></p>
      <div class="crm-sheet-alt"><button type="button" class="crm-btn ana" data-akaydet>Kaydet</button></div>`, g => {
      const goster = () => { g.querySelector('[data-akayip]').hidden = secim !== 'lost'; g.querySelector('[data-abekle]').hidden = secim !== 'waiting'; };
      g.querySelectorAll('[data-asm]').forEach(c => c.onclick = () => { secim = c.dataset.asm; g.querySelectorAll('[data-asm]').forEach(x => { x.classList.toggle('on', x === c); x.setAttribute('aria-pressed', x === c); }); goster(); });
      g.querySelectorAll('[data-akyp]').forEach(c => c.onclick = () => { kayip = c.dataset.akyp; g.querySelectorAll('[data-akyp]').forEach(x => { x.classList.toggle('on', x === c); x.setAttribute('aria-pressed', x === c); }); });
      const bekleOku = gorevFormuBagla(g, 'w'); const istek = uuid(); goster();
      g.querySelector('[data-akaydet]').onclick = async () => {
        const h = g.querySelector('[data-hata]'); h.hidden = true;
        if (secim === 'lost' && !kayip) { h.textContent = 'Bir neden seç.'; h.hidden = false; return; }
        let gorevP = null;
        if (secim === 'waiting') { gorevP = bekleOku(); if (gorevP) gorevP.istek_id = istek; }
        try { await rpc('crm_asama', { p_account: a.account_id, p_stage: secim, p_kayip: secim === 'lost' ? kayip : null, p_gorev: gorevP }); sheetKapat(); toast('Aşama: ' + S.ASAMA[secim]); yenile(); }
        catch (e) { h.textContent = S.hataMetni(e); h.hidden = false; }
      };
    });
  }

  // ───────── Firma düzenle ─────────
  function duzenlePaneli(a) {
    let branslar = S.liste(a.branches), etiketler = S.liste(a.tags), isi = a.heat ? String(a.heat) : '';
    const sec = (ad, sozluk, deger) => `<select data-d="${ad}"><option value="">Seçilmedi</option>${Object.keys(sozluk).map(k => `<option value="${k}"${k === deger ? ' selected' : ''}>${kacis(sozluk[k])}</option>`).join('')}</select>`;
    const metin = (ad, et, deger, tip) => `<label class="crm-alan">${et}<input type="${tip || 'text'}" data-d="${ad}" value="${kacis(deger || '')}"${tip === 'url' ? ' inputmode="url"' : ''}></label>`;
    sheetAc('Firmayı düzenle', `
      ${metin('name', 'Firma adı', a.name)}
      <p class="crm-etiket-bas">Branş</p><div class="crm-cipler kucuk">${cipler(S.BRANS, null, branslar, 'dbr', true)}</div>
      <p class="crm-etiket-bas">Sıcaklık</p><div class="crm-cipler kucuk">${cipler(S.SICAKLIK, null, isi, 'disi', false)}</div>
      <div class="crm-satir2">${metin('city', 'İl', a.city)}${metin('district', 'İlçe', a.district)}</div>
      <div class="crm-satir2"><label>Kuruluş${sec('organization_type', S.KURULUS, a.organization_type)}</label><label>Kaynak${sec('source', S.KAYNAK, a.source)}</label></div>
      ${metin('website_url', 'Web sitesi', a.website_url, 'url')}${metin('instagram_url', 'Instagram', a.instagram_url, 'url')}
      <label class="crm-alan">Mekân notu<textarea data-d="facility_note" rows="2">${kacis(a.facility_note || '')}</textarea></label>
      <h3 class="crm-ara-bas">Şu an ne çalıyor</h3>
      <label class="crm-alan"><span>Kaynak / rakip <small>(listeden seç ya da yaz)</small></span><input type="text" data-d="current_software" list="crm-yazilim" value="${kacis(S.YAZILIM[a.current_software] ? S.YAZILIM[a.current_software] : (a.current_software || ''))}"></label>
      <div class="crm-satir2"><label>Sözleşme bitişi<input type="date" data-d="competitor_contract_ends_at" value="${kacis(a.competitor_contract_ends_at || '')}"></label><label>Yıllık ücret (₺)<input type="text" inputmode="decimal" data-d="competitor_annual_fee" value="${a.competitor_annual_fee != null ? kacis(a.competitor_annual_fee) : ''}"></label></div>
      <p class="crm-kucuk-not">Bitiş tarihi girilince bitişten 45 gün önceye “MUTLAKA ara” görevi kendiliğinden açılır.</p>
      <label class="crm-alan">Rakip notu<textarea data-d="competitor_note" rows="2">${kacis(a.competitor_note || '')}</textarea></label>
      <p class="crm-etiket-bas">Etiketler</p><div class="crm-cipler kucuk">${cipler(S.ETIKET, null, etiketler, 'detk', true)}</div>
      <label class="crm-alan">Genel not<textarea data-d="notes" rows="4">${kacis(a.notes || '')}</textarea></label>
      <p class="crm-hata" data-hata hidden></p>
      <div class="crm-sheet-alt"><button type="button" class="crm-btn ana" data-dkaydet>Kaydet</button></div>
      <datalist id="crm-yazilim">${Object.values(S.YAZILIM).map(y => `<option value="${kacis(y)}">`).join('')}</datalist>`, g => {
      g.querySelectorAll('[data-dbr]').forEach(c => c.onclick = () => { const k = c.dataset.dbr; branslar = branslar.includes(k) ? branslar.filter(x => x !== k) : [...branslar, k]; c.classList.toggle('on'); });
      g.querySelectorAll('[data-detk]').forEach(c => c.onclick = () => { const k = c.dataset.detk; etiketler = etiketler.includes(k) ? etiketler.filter(x => x !== k) : [...etiketler, k]; c.classList.toggle('on'); });
      g.querySelectorAll('[data-disi]').forEach(c => c.onclick = () => { isi = isi === c.dataset.disi ? '' : c.dataset.disi; g.querySelectorAll('[data-disi]').forEach(x => x.classList.toggle('on', x.dataset.disi === isi)); });
      g.querySelector('[data-dkaydet]').onclick = async () => {
        const h = g.querySelector('[data-hata]'); h.hidden = true;
        const d = {}; g.querySelectorAll('[data-d]').forEach(e => { d[e.dataset.d] = e.value.trim() || null; });
        if (!d.name) { h.textContent = S.HATA.AccountNameRequired; h.hidden = false; return; }
        const yaz = Object.keys(S.YAZILIM).find(k => S.YAZILIM[k].toLocaleLowerCase('tr') === String(d.current_software || '').toLocaleLowerCase('tr'));
        if (yaz) d.current_software = yaz;
        if (d.competitor_annual_fee) { const n = Number(String(d.competitor_annual_fee).replace(/\./g, '').replace(',', '.')); if (isNaN(n)) { h.textContent = 'Yıllık ücret sayı olmalı.'; h.hidden = false; return; } d.competitor_annual_fee = n; }
        d.branches = branslar.join(',') || null; d.tags = etiketler.join(',') || null; d.heat = isi ? Number(isi) : null;
        const r = await client.from('crm_account').update(d).eq('account_id', a.account_id);
        if (r.error) { h.textContent = S.hataMetni(r.error); h.hidden = false; return; }
        sheetKapat(); toast('Firma güncellendi'); yenile();
      };
    });
  }

  // ───────── Kişi ekle / düzenle ─────────
  function kisiPaneli(hesap, k) {
    k = k || {};
    sheetAc(k.contact_id ? 'Kişiyi düzenle' : 'Kişi ekle', `
      <label class="crm-alan">Ad soyad<input type="text" data-k="name" value="${kacis(k.name || '')}" autocomplete="off" autofocus></label>
      <div class="crm-satir2"><label>Telefon<input type="tel" data-k="phone_raw" value="${kacis(k.phone_raw || '')}" inputmode="tel" placeholder="0532 000 00 00"></label>
        <label>Rol<select data-k="role"><option value="">Seçilmedi</option>${Object.keys(S.ROL).map(r => `<option value="${r}"${r === k.role ? ' selected' : ''}>${kacis(S.ROL[r])}</option>`).join('')}</select></label></div>
      <label class="crm-alan">E-posta<input type="email" data-k="email" value="${kacis(k.email || '')}" inputmode="email"></label>
      <div class="crm-tikler">
        <label class="crm-tik"><input type="checkbox" data-kb="is_whatsapp"${k.is_whatsapp !== false ? ' checked' : ''}> WhatsApp kullanıyor</label>
        <label class="crm-tik"><input type="checkbox" data-kb="is_decision_maker"${k.is_decision_maker ? ' checked' : ''}> Karar verici</label>
        <label class="crm-tik"><input type="checkbox" data-kb="is_primary"${k.is_primary || !k.contact_id && !(kart && kart.kisiler.length) ? ' checked' : ''}> Birincil kişi</label>
        <label class="crm-tik"><input type="checkbox" data-kb="receives_payment_reminder"${k.receives_payment_reminder ? ' checked' : ''}> Ödeme hatırlatması alır</label>
      </div>
      <label class="crm-alan">Not<textarea data-k="note" rows="2">${kacis(k.note || '')}</textarea></label>
      <p class="crm-hata" data-hata hidden></p>
      <div class="crm-sheet-alt">${k.contact_id ? '<button type="button" class="crm-btn tehlike" data-ksil>Kişiyi kaldır</button>' : ''}<button type="button" class="crm-btn ana" data-kkaydet>Kaydet</button></div>`, g => {
      const h = g.querySelector('[data-hata]');
      g.querySelector('[data-kkaydet]').onclick = async () => {
        const d = {}; g.querySelectorAll('[data-k]').forEach(e => { d[e.dataset.k] = e.value.trim() || null; });
        g.querySelectorAll('[data-kb]').forEach(e => { d[e.dataset.kb] = e.checked; });
        if (!d.name && !d.phone_raw) { h.textContent = 'Ad ya da telefon gir.'; h.hidden = false; return; }
        const r = k.contact_id ? await client.from('crm_contact').update(d).eq('contact_id', k.contact_id) : await client.from('crm_contact').insert(Object.assign({ account_id: hesap }, d));
        if (r.error) { h.textContent = S.hataMetni(r.error); h.hidden = false; return; }
        sheetKapat(); toast('Kişi kaydedildi'); yenile();
      };
      const sil = g.querySelector('[data-ksil]');
      if (sil) sil.onclick = async () => {
        if (!confirm('Bu kişi firmadan kaldırılsın mı? Görüşme geçmişi silinmez.')) return;
        const r = await client.from('crm_contact').update({ is_deleted: true, is_primary: false }).eq('contact_id', k.contact_id);
        if (r.error) { h.textContent = S.hataMetni(r.error); h.hidden = false; return; }
        sheetKapat(); toast('Kişi kaldırıldı'); yenile();
      };
    });
  }

  // ───────── ⑤ Hızlı ekle (＋) — kaydettikten sonra açık kalır ─────────
  function hizliEkle() {
    let istek = uuid(), branslar = [], isi = '';
    sheetAc('Yeni firma', `
      <label class="crm-alan"><span>Firma adı <b class="zorunlu">*</b></span><input type="text" data-h="name" autocomplete="off" autofocus placeholder="ör. Kahve Durağı Moda"></label>
      <div class="crm-satir2"><label>Kişi adı<input type="text" data-h="contact_name" autocomplete="off"></label><label>Telefon<input type="tel" data-h="phone" inputmode="tel" placeholder="0532 000 00 00"></label></div>
      <div class="crm-mukerrer" data-muk hidden></div>
      <div class="crm-satir2"><label>İl<input type="text" data-h="city" value="${kacis(sessionStorage.getItem('crm-son-il') || '')}"></label><label>İlçe<input type="text" data-h="district"></label></div>
      <p class="crm-etiket-bas">Branş</p><div class="crm-cipler kucuk">${cipler(S.BRANS, null, branslar, 'hbr', true)}</div>
      <p class="crm-etiket-bas">Sıcaklık</p><div class="crm-cipler kucuk">${cipler(S.SICAKLIK, null, isi, 'hisi', false)}</div>
      <label class="crm-alan">Not<textarea data-h="notes" rows="2"></textarea></label>
      <p class="crm-hata" data-hata hidden></p>
      <div class="crm-sheet-alt"><button type="button" class="crm-btn" data-hgorusme>Kaydet + görüşme yaz</button><button type="button" class="crm-btn ana" data-hkaydet>Kaydet</button></div>
      <p class="crm-kucuk-not" data-hson aria-live="polite"></p>`, g => {
      const h = g.querySelector('[data-hata]'), muk = g.querySelector('[data-muk]');
      const al = n => g.querySelector(`[data-h="${n}"]`);
      g.querySelectorAll('[data-hbr]').forEach(c => c.onclick = () => { const k = c.dataset.hbr; branslar = branslar.includes(k) ? branslar.filter(x => x !== k) : [...branslar, k]; c.classList.toggle('on'); });
      g.querySelectorAll('[data-hisi]').forEach(c => c.onclick = () => { isi = isi === c.dataset.hisi ? '' : c.dataset.hisi; g.querySelectorAll('[data-hisi]').forEach(x => x.classList.toggle('on', x.dataset.hisi === isi)); });
      // Mükerrer: uyarı, engel değil (iş kuralları §8).
      let z; const mukKontrol = () => { clearTimeout(z); z = setTimeout(async () => {
        const ad = al('name').value.trim(), tel = al('phone').value.trim();
        if (!ad && tel.replace(/\D/g, '').length < 10) { muk.hidden = true; return; }
        try {
          const l = await rpc('crm_mukerrer', { p_phone: tel || null, p_name: ad || null, p_haric: null });
          muk.hidden = !l.length;
          muk.innerHTML = l.length ? `<b>Benzer kayıt var:</b> ${l.map(x => `<a href="#firma/${x.account_id}" data-mukgit>${kacis(x.name)}</a> (${kacis(S.ad(S.ASAMA, x.stage))})`).join(', ')}. Aynı yer mi? Değilse kaydetmeye devam edebilirsin.` : '';
          muk.querySelectorAll('[data-mukgit]').forEach(x => x.onclick = () => sheetKapat());
        } catch { muk.hidden = true; }
      }, 400); };
      al('name').addEventListener('input', mukKontrol); al('phone').addEventListener('input', mukKontrol);
      const kaydet = async gorusme => {
        h.hidden = true;
        const p = { istek_id: istek, branches: branslar.join(',') || null, heat: isi || null };
        g.querySelectorAll('[data-h]').forEach(e => { p[e.dataset.h] = e.value.trim() || null; });
        if (!p.name) { h.textContent = S.HATA.AccountNameRequired; h.hidden = false; al('name').focus(); return; }
        g.querySelectorAll('.crm-sheet-alt .crm-btn').forEach(b => { b.disabled = true; });
        try {
          const id = await rpc('crm_firma_ekle', { p });
          if (p.city) sessionStorage.setItem('crm-son-il', p.city);
          if (gorusme) { sheetKapat(); location.hash = '#firma/' + id; setTimeout(() => aktiviteAkisi({ hesap: id }), 350); return; }
          toast(`Kaydedildi: ${p.name}`);
          g.querySelector('[data-hson]').innerHTML = `Son eklenen: <a href="#firma/${id}" data-songit>${kacis(p.name)}</a>`;
          g.querySelector('[data-songit]').onclick = () => sheetKapat();
          ['name', 'contact_name', 'phone', 'district', 'notes'].forEach(n => { al(n).value = ''; });
          branslar = []; isi = ''; g.querySelectorAll('[data-hbr],[data-hisi]').forEach(x => x.classList.remove('on'));
          muk.hidden = true; istek = uuid(); al('name').focus();
          sheetKapanis = yenile;
        } catch (e) { h.textContent = S.hataMetni(e); h.hidden = false; }
        g.querySelectorAll('.crm-sheet-alt .crm-btn').forEach(b => { b.disabled = false; });
      };
      g.querySelector('[data-hkaydet]').onclick = () => kaydet(false);
      g.querySelector('[data-hgorusme]').onclick = () => kaydet(true);
    });
  }

  // ───────── ⑥ Ödeme (Faz 3) ─────────
  function odemeCiz() {
    $('v-odeme').innerHTML = `<div class="crm-bas"><p class="crm-eyebrow">ABONELİKLER</p><h1>ÖDEME<span>.</span></h1></div>
      <p class="crm-bos buyuk">Mekân aboneliklerinin vade ve tahsilat takibi bir sonraki aşamada burada olacak. Şimdilik firmalar “Müşteri” aşamasına alınabilir; ödeme kayıtları o zaman eklenecek.</p>`;
  }

  // ───────── Başlangıç ─────────
  (async () => {
    const durum = $('crm-durum');
    if (!window.DerinAuth || !S) { durum.textContent = 'Hesap sistemi yüklenemedi.'; return; }
    const st = await window.DerinAuth.ready;
    client = st.client;
    if (!client || !st.user) { durum.innerHTML = 'CRM için giriş yap. <a href="index.html">Ana sayfa →</a>'; return; }
    let yetkili = false;
    try { yetkili = await rpc('crm_yetkili'); } catch { yetkili = false; }
    if (!yetkili) { durum.innerHTML = 'Bu sayfa yalnız CRM sahibine açık. <a href="index.html">Ana sayfa →</a>'; return; }
    durum.remove();
    document.body.classList.add('crm-hazir');
    $('crm-sekmeler').hidden = false;
    $('crm-sheet').addEventListener('click', e => { if (e.target.id === 'crm-sheet') sheetKapat(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('crm-sheet').hidden) sheetKapat(); });
    $('crm-ekle').onclick = hizliEkle;
    odemeCiz();
    window.addEventListener('hashchange', ciz);
    await ciz();
    // Derin link: crm.html?task=<id> görevi doğrudan "Tamamla" akışında açar; ?firma=<id> kartı açar.
    const q = new URLSearchParams(location.search);
    if (q.get('firma')) location.hash = '#firma/' + Number(q.get('firma'));
    if (q.get('task')) {
      const r = await client.from('crm_task').select('task_id,account_id,contact_id,task_type,status').eq('task_id', Number(q.get('task'))).maybeSingle();
      if (r.data && r.data.status === 'open') aktiviteAkisi({ hesap: r.data.account_id, gorev: r.data });
      else if (r.data) toast(S.HATA.TaskAlreadyClosed, true);
      else toast(S.HATA.TaskNotFound, true);
    }
  })();
})();
