// İstatistikler (11 Kasım 2026) — yalnız yönetici görür.
// Üyeler: özet kutular, haftalık yeni kayıt ve günlük giriş grafiği, üye listesi
// (supabase/istatistik.sql: istatistik_uyeler(), giris_gunluk).
// Ziyaretçiler: /api/istatistik (Vercel Web Analytics; anahtar sunucuda durur).
(() => {
  'use strict';

  // ---- Saf yardımcılar (Node'da sınanır) ----
  const BOLGE = 'Europe/Istanbul';
  const GUN_MS = 864e5;
  const gunYazi = t => new Date(t).toLocaleDateString('sv-SE', { timeZone: BOLGE }); // YYYY-MM-DD
  const gunEkle = (g, n) => new Date(Date.parse(g + 'T00:00:00Z') + n * GUN_MS).toISOString().slice(0, 10);
  const haftaBasi = g => { const h = (new Date(g + 'T00:00:00Z').getUTCDay() + 6) % 7; return gunEkle(g, -h); };
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

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

  // Sade çubuk grafik (SVG). veri: [{ etiket, deger }]; en büyük değer üstte yazar.
  function cubukGrafik(veri, renk) {
    const G = 640, Y = 200, alt = 26, ust = 18, n = Math.max(1, veri.length);
    const enBuyuk = Math.max(1, ...veri.map(v => v.deger || 0));
    const aralik = G / n, gen = Math.max(2, aralik * 0.66);
    const etiketAdim = Math.ceil(n / 8);
    const parca = veri.map((v, i) => {
      const h = Math.round(((v.deger || 0) / enBuyuk) * (Y - alt - ust));
      const x = i * aralik + (aralik - gen) / 2, y = Y - alt - h;
      const yazi = (i % etiketAdim === 0) ? `<text x="${(x + gen / 2).toFixed(1)}" y="${Y - 8}" text-anchor="middle">${esc(v.etiket)}</text>` : '';
      const deger = v.deger ? `<text class="ig-d" x="${(x + gen / 2).toFixed(1)}" y="${y - 4}" text-anchor="middle">${v.deger}</text>` : '';
      return `<rect x="${x.toFixed(1)}" y="${y}" width="${gen.toFixed(1)}" height="${Math.max(h, 1)}" rx="3" fill="${renk || '#e8d15a'}"><title>${esc(v.etiket)}: ${v.deger || 0}</title></rect>${deger}${yazi}`;
    }).join('');
    return `<svg class="ig-grafik" viewBox="0 0 ${G} ${Y}" role="img"><line x1="0" x2="${G}" y1="${Y - alt}" y2="${Y - alt}" stroke="rgba(255,255,255,.18)"/>${parca}</svg>`;
  }

  if (typeof module !== 'undefined') module.exports = { ozet, gunluk, haftalik, onceYazi, cubukGrafik, gunYazi };
  if (typeof document === 'undefined') return;

  // ---- Sayfa ----
  const durum = document.getElementById('ist-durum');
  const app = document.getElementById('ist-app');
  const AYLAR = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
  const kisaGun = g => +g.slice(8, 10) + ' ' + AYLAR[+g.slice(5, 7) - 1];
  const tarih = iso => iso ? new Date(iso).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric', timeZone: BOLGE }) : '—';
  const ROL = { admin: 'Yönetici', coach: 'Antrenör', business: 'İşletme', sound_design: 'Film & Ses' };
  let ulkeAdi = k => k;
  try { const d = new Intl.DisplayNames(['tr'], { type: 'region' }); ulkeAdi = k => { try { return d.of(k) || k; } catch (e) { return k; } }; } catch (e) { /* eski tarayıcı */ }
  const CIHAZ = { desktop: 'Bilgisayar', mobile: 'Telefon', tablet: 'Tablet' };

  const kutu = (ad, sayi, alt) => `<div class="admin-stat ig-kutu">${esc(ad)}<strong>${esc(sayi)}</strong>${alt ? `<small>${esc(alt)}</small>` : ''}</div>`;
  const pano = (baslik, ic, aciklama) => `<section class="admin-panel ig-pano"><h2>${esc(baslik)}</h2>${aciklama ? `<p class="ig-aciklama">${esc(aciklama)}</p>` : ''}${ic}</section>`;
  const siraListe = (satirlar, ad) => {
    const enBuyuk = Math.max(1, ...satirlar.map(s => s.sayi));
    return `<ol class="ig-sira">${satirlar.map(s => `<li><span>${esc(ad(s))}</span><b>${s.sayi}</b><i style="width:${Math.round(s.sayi / enBuyuk * 100)}%"></i></li>`).join('') || '<li class="ig-bos">Henüz veri yok.</li>'}</ol>`;
  };

  async function uyeler(client) {
    const simdi = new Date();
    const { data, error } = await client.rpc('istatistik_uyeler');
    if (error) return pano('ÜYELER', `<p class="ig-uyari">Üye bilgisi alınamadı: ${esc(error.message)}</p>`);
    const u = data || [];
    const o = ozet(u, simdi);
    const bas = gunEkle(gunYazi(+simdi), -29);
    const { data: girisler } = await client.from('giris_gunluk').select('gun').gte('gun', bas);
    const gGunluk = gunluk(girisler, 30, simdi).map(v => ({ etiket: kisaGun(v.gun), deger: v.deger }));
    const gHafta = haftalik(u, 12, simdi).map(v => ({ etiket: kisaGun(v.gun), deger: v.deger }));
    const satir = x => `<tr><td><strong>${esc(x.full_name || '—')}</strong>${x.status === 'suspended' ? ' <span class="ig-etiket">dondurulmuş</span>' : ''}</td><td>${esc(ROL[x.role] || x.role || '')}</td><td>${esc(x.kulup || '—')}</td><td>${esc(x.sehir || '—')}</td><td>${tarih(x.created_at)}</td><td title="${esc(x.last_sign_in_at ? new Date(x.last_sign_in_at).toLocaleString('tr-TR', { timeZone: BOLGE }) : '')}">${esc(onceYazi(x.last_sign_in_at, simdi))}</td></tr>`;
    return `<h2 class="ig-bolum">ÜYELER</h2>
      <div class="admin-grid ig-kutular">${kutu('TOPLAM ÜYE', o.toplam)}${kutu('BUGÜN GİRDİ', o.bugun)}${kutu('SON 7 GÜN', o.gun7, 'giriş yapan')}${kutu('SON 30 GÜN', o.gun30, 'giriş yapan')}${kutu('BU AY YENİ', o.buAyYeni, 'kayıt')}</div>
      <div class="ig-ikili">
        ${pano('GÜNLÜK GİRİŞ (30 GÜN)', cubukGrafik(gGunluk, '#e8d15a'), 'Bu sayım 11 Kasım 2026’dan itibaren tutuluyor.')}
        ${pano('HAFTALIK YENİ KAYIT (12 HAFTA)', cubukGrafik(gHafta, '#ff5fa2'))}
      </div>
      ${pano('ÜYE LİSTESİ', `<div class="ig-tablo"><table class="admin-table"><thead><tr><th>AD</th><th>ROL</th><th>KULÜP</th><th>ŞEHİR</th><th>KAYIT</th><th>SON GİRİŞ</th></tr></thead><tbody>${u.map(satir).join('')}</tbody></table></div>`, 'Son giriş yapan en üstte.')}`;
  }

  async function ziyaretciler(client) {
    let veri = null, hata = '';
    try {
      const { data: { session } } = await client.auth.getSession();
      const r = await fetch('/api/istatistik', { headers: { Authorization: 'Bearer ' + (session && session.access_token) } });
      veri = await r.json().catch(() => null);
      if (!r.ok) hata = (veri && veri.hata) || ('Hata ' + r.status);
    } catch (e) { hata = 'Bağlantı kurulamadı.'; }
    if (hata) return `<h2 class="ig-bolum">ZİYARETÇİLER</h2>` + pano('ZİYARETÇİ BİLGİSİ', `<p class="ig-uyari">${esc(hata)}</p>`);
    if (!veri || !veri.bagli) return `<h2 class="ig-bolum">ZİYARETÇİLER</h2>` + pano('ZİYARETÇİ BİLGİSİ BAĞLANMADI', '<p class="ig-aciklama">Vercel anahtarı eklenince burada günlük ziyaretçi grafiği, en çok bakılan sayfalar, ülkeler ve cihazlar görünecek.</p>');
    const gun = (veri.gunluk || []).map(v => ({ etiket: kisaGun(String(v.timestamp).slice(0, 10)), deger: v.visitors || 0 }));
    const toplamZ = gun.reduce((a, v) => a + v.deger, 0), toplamS = (veri.gunluk || []).reduce((a, v) => a + (v.pageviews || 0), 0);
    const bugunZ = gun.length ? gun[gun.length - 1].deger : 0;
    // Aynı sayfanın iki adresi (/ ve /index.html) birleşir; "Others" → Diğer (en sona).
    const liste = (dizi, alan, esle) => {
      const m = new Map();
      (dizi || []).forEach(x => { const ad = x[alan] === 'Others' ? 'Diğer' : (esle ? esle(x[alan]) : x[alan]) || '—'; m.set(ad, (m.get(ad) || 0) + (x.visitors || 0)); });
      return [...m].map(([ad, sayi]) => ({ ad, sayi })).sort((a, b) => (a.ad === 'Diğer') - (b.ad === 'Diğer') || b.sayi - a.sayi);
    };
    return `<h2 class="ig-bolum">ZİYARETÇİLER</h2>
      <div class="admin-grid ig-kutular">${kutu('SON 30 GÜN', toplamZ, 'ziyaretçi (günlük toplam)')}${kutu('SAYFA GÖRÜNTÜLEME', toplamS, 'son 30 gün')}${kutu('BUGÜN', bugunZ, 'ziyaretçi')}</div>
      ${pano('GÜNLÜK ZİYARETÇİ (30 GÜN)', cubukGrafik(gun, '#3fc1c9'))}
      <div class="ig-uclu">
        ${pano('EN ÇOK BAKILAN SAYFALAR', siraListe(liste(veri.sayfalar, 'requestPath', y => (y === '/index.html' ? '/' : y)), s => s.ad === '/' ? 'Ana sayfa' : s.ad))}
        ${pano('ÜLKELER', siraListe(liste(veri.ulkeler, 'country'), s => s.ad === 'Diğer' ? s.ad : ulkeAdi(s.ad)))}
        ${pano('CİHAZ', siraListe(liste(veri.cihazlar, 'deviceType'), s => CIHAZ[s.ad] || s.ad))}
      </div>`;
  }

  async function basla() {
    let auth = null;
    try { auth = window.DerinAuth && await window.DerinAuth.ready; } catch (e) { auth = null; }
    const client = auth && auth.client;
    if (!client || !window.DerinAuth.user) { durum.textContent = 'Bu sayfayı görmek için yönetici hesabıyla giriş yap.'; return; }
    if (window.DerinAuth.profile?.role !== 'admin') { durum.textContent = 'Bu sayfa yalnız yöneticiye açık.'; return; }
    durum.textContent = 'Yükleniyor…';
    const [z, u] = await Promise.all([ziyaretciler(client), uyeler(client)]);
    app.innerHTML = z + u;
    app.hidden = false;
    durum.textContent = 'Son güncelleme: ' + new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', timeZone: BOLGE });
  }
  basla();
  window.addEventListener('derin:authchange', () => { if (app.hidden) basla(); });
})();
