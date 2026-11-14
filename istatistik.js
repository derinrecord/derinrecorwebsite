// İstatistikler (11 Kasım 2026) — yalnız yönetici görür. C "Sade" görünümü.
// Büyük grafik: Ziyaretçi / Sayfa görüntüleme / Üye girişi; dönem 7 / 30 / 90 gün;
// artış/azalış bir önceki aynı uzunluktaki döneme göre.
// Üyeler: supabase/istatistik.sql (istatistik_uyeler(), giris_gunluk).
// Ziyaretçiler: /api/istatistik?gun=N (Vercel Web Analytics; anahtar sunucuda durur).
(() => {
  'use strict';

  // ---- Saf yardımcılar (Node'da sınanır) ----
  const BOLGE = 'Europe/Istanbul';
  const GUN_MS = 864e5;
  const gunYazi = t => new Date(t).toLocaleDateString('sv-SE', { timeZone: BOLGE }); // YYYY-MM-DD
  const gunEkle = (g, n) => new Date(Date.parse(g + 'T00:00:00Z') + n * GUN_MS).toISOString().slice(0, 10);
  const haftaBasi = g => { const h = (new Date(g + 'T00:00:00Z').getUTCDay() + 6) % 7; return gunEkle(g, -h); };
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const topla = a => a.reduce((t, v) => t + (Number(v) || 0), 0);

  function ozet(uyeler, simdi) {
    const s = +simdi, bugun = gunYazi(s), ay = bugun.slice(0, 7);
    const o = { toplam: uyeler.length, bugun: 0, gun7: 0, gun30: 0, buAyYeni: 0 };
    uyeler.forEach(u => {
      if (u.last_sign_in_at) {
        const t = Date.parse(u.last_sign_in_at);
        if (gunYazi(t) === bugun) o.bugun++;
        if (s - t <= 7 * GUN_MS) o.gun7++;
        if (s - t <= 30 * GUN_MS) o.gun30++;
      }
      if (u.created_at && gunYazi(Date.parse(u.created_at)).slice(0, 7) === ay) o.buAyYeni++;
    });
    return o;
  }

  // Son n günün her biri için o gün giriş yapan üye sayısı (giris_gunluk satırları).
  function gunluk(satirlar, n, simdi) {
    const son = gunYazi(+simdi), say = {};
    (satirlar || []).forEach(r => { say[r.gun] = (say[r.gun] || 0) + 1; });
    return Array.from({ length: n }, (_, i) => { const g = gunEkle(son, i - n + 1); return { gun: g, deger: say[g] || 0 }; });
  }

  // Son n haftanın (pazartesi başlar) her birinde kayıt olan üye sayısı.
  function haftalik(uyeler, n, simdi) {
    const bu = haftaBasi(gunYazi(+simdi)), say = {};
    (uyeler || []).forEach(u => { if (u.created_at) { const h = haftaBasi(gunYazi(Date.parse(u.created_at))); say[h] = (say[h] || 0) + 1; } });
    return Array.from({ length: n }, (_, i) => { const g = gunEkle(bu, (i - n + 1) * 7); return { gun: g, deger: say[g] || 0 }; });
  }

  function onceYazi(iso, simdi) {
    if (!iso) return 'hiç girmedi';
    const dk = Math.floor((+simdi - Date.parse(iso)) / 6e4);
    if (dk < 5) return 'az önce';
    if (dk < 60) return dk + ' dakika önce';
    if (dk < 1440) return Math.floor(dk / 60) + ' saat önce';
    return Math.floor(dk / 1440) + ' gün önce';
  }

  // Bu dönem ile önceki dönemin toplamı karşılaştırılır.
  function egilim(simdi, once) {
    if (!once && !simdi) return { yon: 'ayni', yazi: 'değişmedi' };
    if (!once) return { yon: 'ayni', yazi: 'önceki dönemde veri yok' };
    const y = Math.round((simdi - once) / once * 100);
    if (y === 0) return { yon: 'ayni', yazi: 'değişmedi' };
    return { yon: y < 0 ? 'asagi' : 'yukari', yazi: (y < 0 ? '▼ ' : '▲ ') + Math.abs(y) + '%' };
  }

  // 2n uzunluğundaki diziyi [önceki n, son n] olarak böler (eksikse önceki kısa kalır).
  const ikiyeBol = (dizi, n) => [dizi.slice(Math.max(0, dizi.length - 2 * n), Math.max(0, dizi.length - n)), dizi.slice(-n)];

  // Yumuşak çizgi yolu (SVG path) ve nokta konumları.
  function egriYol(degerler, W, H, ust, alt) {
    const n = degerler.length, m = Math.max(1, ...degerler);
    const p = degerler.map((v, i) => [n === 1 ? W : i / (n - 1) * W, H - alt - (Number(v) || 0) / m * (H - alt - ust)].map(x => Math.round(x * 10) / 10));
    let d = `M${p[0][0]},${p[0][1]}`;
    for (let i = 1; i < n; i++) { const [x0, y0] = p[i - 1], [x1, y1] = p[i], c = (x1 - x0) / 2; d += ` C${x0 + c},${y0} ${x1 - c},${y1} ${x1},${y1}`; }
    return { d, p };
  }

  // Ülke kodundan bayrak (TR → 🇹🇷); geçersizse boş.
  const bayrak = k => /^[A-Z]{2}$/.test(String(k || '')) ? String.fromCodePoint(...[...k].map(c => 0x1F1A5 + c.charCodeAt(0))) : '';

  // Haftalık kayıt çubukları (SVG). veri: [{ etiket, deger }]
  function cubukGrafik(veri, renk) {
    const G = 480, Y = 220, alt = 40, n = Math.max(1, veri.length), a = G / n, m = Math.max(1, ...veri.map(v => v.deger || 0));
    const parca = veri.map((v, i) => {
      const h = Math.max(2, (v.deger || 0) / m * (Y - alt - 20)), y = Y - alt - h;
      return `<rect x="${(i * a + 6).toFixed(1)}" y="${y.toFixed(1)}" width="${(a - 12).toFixed(1)}" height="${h.toFixed(1)}" rx="5" fill="${v.deger ? (renk || '#fe4b6a') : '#2c2c2e'}"><title>${esc(v.etiket)}: ${v.deger || 0}</title></rect>`
        + (i % 3 === 1 ? `<text x="${(i * a + a / 2).toFixed(1)}" y="${Y - 12}" text-anchor="middle">${esc(v.etiket)}</text>` : '');
    }).join('');
    return `<svg class="ist-grafik" viewBox="0 0 ${G} ${Y}" role="img">${parca}</svg>`;
  }

  // KVKK onayı: kayıtta kabul edilen Aydınlatma Metni sürümü (auth.js AYDINLATMA_SURUM ile aynı).
  const GUNCEL_AYDINLATMA = '2026-10-24';
  const KISA_AY = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
  function kvkkDurum(u) {
    const s = u && u.aydinlatma_surum;
    if (!s) return { sinif: 'yok', yazi: 'KVKK yok' };
    if (s !== GUNCEL_AYDINLATMA) return { sinif: 'eski', yazi: 'KVKK eski sürüm' };
    const g = u.kabul_at ? gunYazi(Date.parse(u.kabul_at)) : '';
    return { sinif: 'tamam', yazi: 'KVKK ✓' + (g ? ' ' + (+g.slice(8, 10)) + ' ' + KISA_AY[+g.slice(5, 7) - 1] : '') };
  }
  const kvkkSay = uyeler => (uyeler || []).filter(u => kvkkDurum(u).sinif === 'tamam').length;

  // Açılır KVKK penceresi için: onaylayan (en yeni onay önce) / eski sürüm / onay yok.
  function kvkkGruplar(uyeler) {
    const g = { tamam: [], eski: [], yok: [] };
    (uyeler || []).forEach(u => g[kvkkDurum(u).sinif].push(u));
    g.tamam.sort((a, b) => (Date.parse(b.kabul_at) || 0) - (Date.parse(a.kabul_at) || 0));
    return g;
  }

  if (typeof module !== 'undefined') module.exports = { GUNCEL_AYDINLATMA, kvkkDurum, kvkkSay, kvkkGruplar, ozet, gunluk, haftalik, onceYazi, cubukGrafik, gunYazi, egilim, ikiyeBol, egriYol, bayrak };
  if (typeof document === 'undefined') return;

  // ---- Sayfa ----
  const $ = id => document.getElementById(id);
  const AYLAR = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
  const kisaGun = g => +g.slice(8, 10) + ' ' + AYLAR[+g.slice(5, 7) - 1];
  const ROL = { admin: 'Yönetici', coach: 'Antrenör', business: 'İşletme', sound_design: 'Film & ses' };
  const OLCU = { z: 'ziyaretçi', s: 'sayfa görüntüleme', g: 'üye girişi' };
  const RENK = { z: '#e8d15a', s: '#3fc1c9', g: '#9be15d' };
  let ulkeAdi = k => k;
  try { const dn = new Intl.DisplayNames(['tr'], { type: 'region' }); ulkeAdi = k => { try { return dn.of(k) || k; } catch (e) { return k; } }; } catch (e) { /* eski tarayıcı */ }
  const CIHAZ = { mobile: 'Telefon', desktop: 'Bilgisayar', tablet: 'Tablet' };
  const SAYFA_AD = { '/': 'Ana sayfa', '/index.html': 'Ana sayfa', '/aerobik.html': 'Aerobik', '/akrobatik.html': 'Akrobatik', '/artistik.html': 'Artistik', '/ritmik.html': 'Ritmik', '/cocuk-fitness.html': 'Çocuk fitness', '/ses-tasarimi.html': 'Ses tasarımı', '/coffee': 'Mekân (coffee)', '/news.html': 'Haberler' };
  const SAYFA_IC = { 'Ana sayfa': '⌂', 'Ses tasarımı': '◉', 'Mekân (coffee)': '☕', 'Haberler': '✎' };

  const veri = { client: null, uyeler: [], girisler: [], ziyaret: {}, hata: '' };
  const secim = { olcu: 'z', gun: 30 };

  async function ziyaretAl(gun) {
    if (veri.ziyaret[gun]) return veri.ziyaret[gun];
    let sonuc;
    try {
      const { data: { session } } = await veri.client.auth.getSession();
      const r = await fetch('/api/istatistik?gun=' + gun, { headers: { Authorization: 'Bearer ' + (session && session.access_token) } });
      const g = await r.json().catch(() => null);
      sonuc = r.ok ? (g || { bagli: false }) : { bagli: false, hata: (g && g.hata) || ('Hata ' + r.status) };
    } catch (e) { sonuc = { bagli: false, hata: 'Ziyaretçi bilgisine bağlanılamadı.' }; }
    veri.ziyaret[gun] = sonuc;
    return sonuc;
  }

  // Seçili ölçünün 2×gün uzunluğundaki günlük dizisi: [{ gun, deger }]
  function dizi(olcu, z, gun, simdi) {
    if (olcu === 'g') return gunluk(veri.girisler, gun * 2, simdi);
    return (z.gunluk || []).map(r => ({ gun: String(r.timestamp).slice(0, 10), deger: olcu === 'z' ? r.visitors || 0 : r.pageviews || 0 }));
  }

  const egilimHtml = (e, ek) => `<span class="ist-egilim ${e.yon}">${esc(e.yazi)}${ek && /%/.test(e.yazi) ? ' ' + esc(ek) : ''}</span>`;
  const spark = degerler => { const { d } = egriYol(degerler.length ? degerler : [0, 0], 200, 34, 3, 3); return `<svg viewBox="0 0 200 34" preserveAspectRatio="none" aria-hidden="true"><path d="${d}" fill="none" stroke="currentColor" stroke-width="2.5" vector-effect="non-scaling-stroke"/></svg>`; };
  // Ana sayfadaki demo listesi gibi alttan yükselen çubuklar; bugünün çubuğu parlak, üstünde değer kutusu.
  function cubukDalga(degerler, etiketler, renk) {
    const W = 1000, H = 250, alt = 30, ust = 34, n = Math.max(1, degerler.length), a = W / n, g = Math.max(2, a * (n > 60 ? 0.7 : 0.58)), m = Math.max(1, ...degerler);
    const adim = Math.max(1, Math.round(n / 6));
    let h = `<line x1="0" x2="${W}" y1="${H - alt}" y2="${H - alt}" stroke="rgba(255,255,255,.12)"/>`;
    degerler.forEach((v, i) => {
      const yuk = Math.max(3, v / m * (H - alt - ust)), x = i * a + (a - g) / 2, son = i === n - 1;
      h += `<rect x="${x.toFixed(1)}" y="${(H - alt - yuk).toFixed(1)}" width="${g.toFixed(1)}" height="${yuk.toFixed(1)}" rx="${Math.min(4, g / 2).toFixed(1)}" fill="${renk}" opacity="${son ? 1 : .62}"><title>${esc(etiketler[i])}: ${v}</title></rect>`;
      const ox = x + g / 2;
      if (i % adim === 0 && ox > 30 && ox < W - 90) h += `<text x="${ox.toFixed(1)}" y="${H - 8}" text-anchor="middle">${esc(etiketler[i])}</text>`;
      if (son) { const kx = Math.min(W - 130, Math.max(0, ox - 65)), ky = Math.max(0, H - alt - yuk - 36); h += `<rect x="${kx.toFixed(1)}" y="${ky.toFixed(1)}" width="130" height="30" rx="6" fill="rgba(0,0,0,.82)"/><text x="${(kx + 65).toFixed(1)}" y="${(ky + 20).toFixed(1)}" text-anchor="middle" style="fill:${renk}">BUGÜN ${v}</text>`; }
    });
    return `<svg class="ist-grafik" viewBox="0 0 ${W} ${H}" aria-hidden="true">${h}</svg>`;
  }

  function buyukCiz(z, simdi) {
    const { olcu, gun } = secim, kutu = $('ist-buyuk');
    if (olcu !== 'g' && !z.bagli) {
      kutu.innerHTML = `<div class="ist-bos"><strong>Ziyaretçi bilgisi bağlanmadı</strong>${esc(z.hata || 'Vercel anahtarı eklenince burada günlük ziyaretçi ve sayfa görüntüleme grafiği görünecek. Şimdilik “Üye girişi”ni seçebilirsin.')}</div>`;
      return;
    }
    const tum = dizi(olcu, z, gun, simdi), [once, son] = ikiyeBol(tum, gun);
    const toplam = topla(son.map(v => v.deger)), e = egilim(toplam, topla(once.map(v => v.deger)));
    const renk = RENK[olcu];
    const svg = cubukDalga(son.map(v => v.deger), son.map(v => kisaGun(v.gun).toLocaleUpperCase('tr-TR')), renk);
    const bugun = son.length ? son[son.length - 1].deger : 0;
    kutu.innerHTML = `<div class="ist-metrik"><b>${toplam}</b>${egilimHtml(e, 'önceki ' + gun + ' güne göre')}</div>
      <p class="ist-metrik-alt">${esc(OLCU[olcu])}, son ${gun} gün · bugün ${bugun}${olcu === 'g' ? ' · her üye günde bir kez sayılır, 11 Kasım 2026’dan beri' : ''}</p>
      <div role="img" aria-label="Son ${gun} gün ${esc(OLCU[olcu])} grafiği">${svg}</div>`;
  }

  function dortCiz(z, simdi) {
    const { gun } = secim, o = ozet(veri.uyeler, simdi);
    const sDizi = z.bagli ? dizi('s', z, gun, simdi) : [], [sOnce, sSon] = ikiyeBol(sDizi, gun);
    const zDizi = z.bagli ? dizi('z', z, gun, simdi) : [];
    const g7 = gunluk(veri.girisler, 7, simdi).map(v => v.deger);
    // Toplam üye: son 12 haftada birikerek
    const hafta = haftalik(veri.uyeler, 12, simdi), once12 = veri.uyeler.length - topla(hafta.map(h => h.deger));
    let birikim = once12; const uyeCizgi = hafta.map(h => (birikim += h.deger));
    const kart = (baslik, sayi, alt, svg, ek = '') => `<section class="ist-kart ist-kucuk"${ek}><h3>${esc(baslik)}</h3><b>${sayi}</b>${alt}${svg}</section>`;
    $('ist-dort').innerHTML = [
      z.bagli ? kart('SAYFA GÖRÜNTÜLEME', topla(sSon.map(v => v.deger)), egilimHtml(egilim(topla(sSon.map(v => v.deger)), topla(sOnce.map(v => v.deger)))), spark(sSon.map(v => v.deger)))
        : kart('SAYFA GÖRÜNTÜLEME', '—', '<p class="ist-not">bağlanmadı</p>', ''),
      z.bagli ? kart('BUGÜN', zDizi.length ? zDizi[zDizi.length - 1].deger : 0, '<p class="ist-not">ziyaretçi</p>', spark(zDizi.slice(-7).map(v => v.deger)))
        : kart('BUGÜN GİRDİ', o.bugun, '<p class="ist-not">üye</p>', spark(g7)),
      kart('TOPLAM ÜYE', o.toplam, `<p class="ist-not">${o.buAyYeni} yeni bu ay</p>`, spark(uyeCizgi)),
      kart('SON 7 GÜNDE GİREN', o.gun7, '<p class="ist-not">üye</p>', spark(g7)),
      kart('KVKK ONAYLI', kvkkSay(veri.uyeler) + ' / ' + veri.uyeler.length, '<p class="ist-not">güncel metni onaylayan üye</p><span class="ist-kvkk-ac">LİSTEYİ AÇ ▾</span>', '', ' data-kvkk-ac role="button" tabindex="0" aria-controls="ist-kvkk-panel"')
    ].join('');
  }

  // Aynı adın satırları birleşir; "Others" → Diğer (en sona).
  function listeHazirla(dizi, alan, esle) {
    const m = new Map();
    (dizi || []).forEach(x => { const ham = x[alan], ad = ham === 'Others' ? 'Diğer' : (esle ? esle(ham) : ham) || '—'; const k = m.get(ad) || { ad, kod: ham, sayi: 0 }; k.sayi += x.visitors || 0; m.set(ad, k); });
    return [...m.values()].sort((a, b) => (a.ad === 'Diğer') - (b.ad === 'Diğer') || b.sayi - a.sayi);
  }

  function listelerCiz(z) {
    const yok = metin => `<li class="ist-yok">${esc(metin)}</li>`;
    if (!z.bagli) {
      const m = 'Ziyaretçi bilgisi bağlanınca görünecek.';
      $('ist-sayfalar').innerHTML = yok(m); $('ist-ulkeler').innerHTML = yok(m); $('ist-cihaz').innerHTML = `<p class="ist-not">${esc(m)}</p>`;
      return;
    }
    const sayfalar = listeHazirla(z.sayfalar, 'requestPath', y => SAYFA_AD[y] || y).slice(0, 7), ms = Math.max(1, ...sayfalar.map(s => s.sayi));
    $('ist-sayfalar').innerHTML = sayfalar.map(s => `<li><span class="ist-ic" aria-hidden="true">${SAYFA_IC[s.ad] || '♪'}</span><div class="ist-ad">${esc(s.ad)}<i style="width:${Math.max(3, s.sayi / ms * 100)}%"></i></div><b>${s.sayi}</b></li>`).join('') || yok('Bu dönemde veri yok.');
    const ulkeler = listeHazirla(z.ulkeler, 'country', k => (k === 'Others' ? k : ulkeAdi(k))).slice(0, 6);
    $('ist-ulkeler').innerHTML = ulkeler.map(u => `<li><span class="ist-ic" aria-hidden="true">${bayrak(u.kod) || '🌐'}</span><div class="ist-ad">${esc(u.ad)}</div><b>${u.sayi}</b></li>`).join('') || yok('Bu dönemde veri yok.');
    const c = listeHazirla(z.cihazlar, 'deviceType', k => CIHAZ[k] || k), toplam = Math.max(1, topla(c.map(x => x.sayi)));
    const renkler = ['#e8d15a', '#3fc1c9', '#fe4b6a'], r = 60, cevre = 2 * Math.PI * r;
    let bas = 0, halka = `<circle cx="75" cy="75" r="${r}" fill="none" stroke="#2c2c2e" stroke-width="14"/>`;
    c.slice(0, 3).forEach((x, i) => { const pay = x.sayi / toplam * cevre; halka += `<circle cx="75" cy="75" r="${r}" fill="none" stroke="${renkler[i]}" stroke-width="14" stroke-dasharray="${Math.max(0, pay - 4).toFixed(1)} ${cevre.toFixed(1)}" stroke-dashoffset="${(-bas).toFixed(1)}" transform="rotate(-90 75 75)"/>`; bas += pay; });
    $('ist-cihaz').innerHTML = `<svg viewBox="0 0 150 150" role="img" aria-label="Cihaz oranı">${halka}</svg><dl>${c.slice(0, 3).map((x, i) => `<div><dt style="--r:${renkler[i]}">${esc(x.ad)}</dt><dd>%${Math.round(x.sayi / toplam * 100)} · ${x.sayi}</dd></div>`).join('')}</dl>`;
  }

  function uyelerCiz(simdi) {
    $('ist-kayit').innerHTML = cubukGrafik(haftalik(veri.uyeler, 12, simdi).map(v => ({ etiket: kisaGun(v.gun).toLocaleUpperCase('tr-TR'), deger: v.deger })), '#fe4b6a');
    if (veri.hata) { $('ist-uyeler').innerHTML = `<li class="ist-yok ist-uyari">${esc(veri.hata)}</li>`; return; }
    const AV = ['#e8d15a', '#fe4b6a', '#3fc1c9', '#ab6ee7', '#9be15d', '#f1ece1'];
    $('ist-uye-sayi').textContent = veri.uyeler.length + ' ÜYE';
    $('ist-uyeler').innerHTML = veri.uyeler.map((u, i) => {
      const taze = u.last_sign_in_at && +simdi - Date.parse(u.last_sign_in_at) < GUN_MS;
      const alt = [ROL[u.role] || u.role, u.kulup, u.sehir].filter(Boolean).join(' · ');
      const k = kvkkDurum(u);
      return `<li><span class="ist-av${taze ? ' taze' : ''}" style="--r:${AV[i % AV.length]}" aria-hidden="true">${esc(String(u.full_name || '?').trim().charAt(0).toLocaleUpperCase('tr-TR'))}</span><div class="ist-ad">${esc(u.full_name || '—')}${u.status === 'suspended' ? '<span class="ist-etiket">dondurulmuş</span>' : ''}<small>${esc(alt)}</small><span class="ist-kvkk ${k.sinif}" title="${esc(u.aydinlatma_surum ? 'Aydınlatma Metni sürümü: ' + u.aydinlatma_surum + (u.sozlesme_surum ? ' · Sözleşme: ' + u.sozlesme_surum : '') : 'Kayıt onayı yok')}">${esc(k.yazi)}</span></div><em title="${esc(u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleString('tr-TR', { timeZone: BOLGE }) : '')}">${esc(onceYazi(u.last_sign_in_at, simdi))}</em></li>`;
    }).join('') || '<li class="ist-yok">Henüz üye yok.</li>';
  }

  function kvkkPanelCiz() {
    const g = kvkkGruplar(veri.uyeler);
    $('ist-kvkk-sayi').textContent = g.tamam.length + ' / ' + veri.uyeler.length + ' ONAYLI';
    const tarih = u => u.kabul_at ? new Date(u.kabul_at).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: BOLGE }) : '';
    const satir = u => `<li><div class="ist-ad">${esc(u.full_name || '—')}<small>${esc([ROL[u.role] || u.role, u.kulup, u.sehir].filter(Boolean).join(' · '))}</small></div>${u.aydinlatma_surum ? `<em>${esc(tarih(u) || u.aydinlatma_surum + ' sürümü')}</em>` : ''}</li>`;
    const grup = (sinif, baslik, aciklama, liste) => `<div class="ist-kvkk-grup ${sinif}"><h3><span class="ist-kvkk ${sinif}">${esc(baslik)}</span><b>${liste.length}</b></h3><p class="ist-not">${esc(aciklama)}</p><ul class="ist-satirlar">${liste.map(satir).join('') || '<li class="ist-yok">Kimse yok.</li>'}</ul></div>`;
    $('ist-kvkk-icerik').innerHTML = grup('tamam', 'ONAYLADI', 'Güncel Aydınlatma Metni’ni kabul etti', g.tamam)
      + grup('eski', 'ESKİ SÜRÜM', 'Eski metni kabul etti, yeniden onay gerekir', g.eski)
      + grup('yok', 'ONAY YOK', 'Kayıtta onay bilgisi yok', g.yok);
  }

  // Seçili düğmenin altına sarı vurgu kayar (giriş sekmelerindeki gibi).
  function isaretleriKoy() {
    document.querySelectorAll('.ist-secim').forEach(k => {
      const b = k.querySelector('button[aria-pressed="true"]');
      if (!b || !b.offsetWidth) return;
      k.style.setProperty('--x', b.offsetLeft + 'px'); k.style.setProperty('--w', b.offsetWidth + 'px'); k.classList.add('hazir');
    });
  }
  window.addEventListener('resize', isaretleriKoy);

  async function ciz() {
    const simdi = new Date(), z = await ziyaretAl(secim.gun);
    buyukCiz(z, simdi); dortCiz(z, simdi); kvkkPanelCiz(); listelerCiz(z); uyelerCiz(simdi);
    document.querySelectorAll('[data-olcu]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.olcu === secim.olcu)));
    document.querySelectorAll('[data-gun]').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.gun === secim.gun)));
    isaretleriKoy();
    $('ist-durum').textContent = 'Son güncelleme ' + simdi.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', timeZone: BOLGE });
  }

  async function basla() {
    let auth = null;
    try { auth = window.DerinAuth && await window.DerinAuth.ready; } catch (e) { auth = null; }
    const client = auth && auth.client;
    if (!client || !window.DerinAuth.user) { $('ist-durum').textContent = 'Bu sayfayı görmek için yönetici hesabıyla giriş yap.'; return; }
    if (window.DerinAuth.profile?.role !== 'admin') { $('ist-durum').textContent = 'Bu sayfa yalnız yöneticiye açık.'; return; }
    if (veri.client) return;
    veri.client = client;
    $('ist-durum').textContent = 'Yükleniyor…';
    const [u, g] = await Promise.all([
      client.rpc('istatistik_uyeler'),
      client.from('giris_gunluk').select('gun').gte('gun', gunEkle(gunYazi(Date.now()), -180))
    ]);
    if (u.error) veri.hata = 'Üye bilgisi alınamadı: ' + u.error.message;
    veri.uyeler = (u.data || []).slice().sort((a, b) => (Date.parse(b.last_sign_in_at) || 0) - (Date.parse(a.last_sign_in_at) || 0));
    veri.girisler = g.data || [];
    const z = await ziyaretAl(secim.gun);
    if (!z.bagli) secim.olcu = 'g'; // ziyaretçi bağlı değilse elde olanla açılır
    $('ist-app').hidden = false;
    await ciz();
  }

  // Aydınlatma Metni: pencere ilk açıldığında sitedeki metin sayfasından okunur.
  let metinYuklendi = false;
  async function metinYukle() {
    if (metinYuklendi) return; metinYuklendi = true;
    const kutu = $('ist-metin-icerik');
    try {
      const r = await fetch('aydinlatma-metni.html', { cache: 'no-cache' });
      const d = new DOMParser().parseFromString(await r.text(), 'text/html');
      const govde = d.querySelector('.hk-metin.hk-tr'), tarih = d.querySelector('.hk-tarih');
      if (!r.ok || !govde) throw new Error();
      kutu.innerHTML = (tarih ? `<p class="ist-metin-tarih">${esc(tarih.textContent)}</p>` : '') + `<div class="ist-metin">${govde.innerHTML}</div><a class="ist-metin-link" href="aydinlatma-metni.html" target="_blank" rel="noopener">Sayfasında aç ↗</a>`;
    } catch (e) { metinYuklendi = false; kutu.innerHTML = '<p class="ist-not ist-uyari">Metin yüklenemedi, sayfayı yenileyip tekrar dene.</p>'; }
  }
  $('ist-metin-panel').addEventListener('toggle', () => { if ($('ist-metin-panel').open) metinYukle(); });

  // KVKK ONAYLI kutusuna basınca pencere açılır ve oraya kayar.
  function kvkkAc() { $('ist-kvkk-panel').open = true; $('ist-kvkk-panel').scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  document.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.closest('[data-kvkk-ac]')) { e.preventDefault(); kvkkAc(); } });
  document.addEventListener('click', e => {
    if (e.target.closest('[data-kvkk-ac]')) { kvkkAc(); return; }
    const b = e.target.closest('[data-olcu],[data-gun]');
    if (!b || !veri.client) return;
    if (b.dataset.olcu) secim.olcu = b.dataset.olcu; else secim.gun = +b.dataset.gun;
    ciz();
  });
  basla();
  window.addEventListener('derin:authchange', basla);
})();
