// Derin Record — Ses Efektleri mağazası (19 Kasım 2026)
//
// Derin: "Sound FX satışı yapacağım; ben ekleyip satabileyim."
// Ziyaretçi yayındaki efektleri ve paketleri görür, MP3 önizlemeyi dinler.
// Satın alma Projelerim'deki parça satışıyla aynı akış (supabase/ses-efektleri.sql):
//   SATIN AL → 'istendi' → müşteri IBAN'a havale yapıp dekontu yükler → 'dekont'
//   → Derin "ödendi" yapar → 'odendi' → WAV indirme düğmesi açılır.
// Önizlemelerde filigran yok (Derin, 19 Kasım). WAV'ın yeri müşteriye yalnız
// ödemeden sonra efekt_indirme_listesi() ile gelir; indirme adresi imzalıdır.
(() => {
  'use strict';

  const SA = window.DerinSatinAlma;
  const R2 = window.DerinR2;
  const $ = (s, k) => (k || document).querySelector(s);
  const kacis = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const PLAY = '<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M4 2v10l8-5z" fill="currentColor"/></svg>';
  const DUR = '<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M3 2h3v10H3zM8 2h3v10H8z" fill="currentColor"/></svg>';

  const durum = { efektler: [], paketler: [], satislar: [], indirmeler: [], odeme: {}, kategori: '', arama: '', sirala: 'yeni', calan: null };
  const ses = new Audio();
  ses.preload = 'none';

  const sureYaz = sn => {
    const s = Math.max(0, Math.round(Number(sn) || 0));
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  };
  const fiyatYaz = n => (SA && SA.tutarGoster(n)) || '';

  function durumYaz(metin, hata) {
    const el = $('#se-durum');
    if (!el) return;
    el.textContent = metin || '';
    el.classList.toggle('hata', !!hata);
  }

  // ---------- Liste ----------
  function suzulmus() {
    const q = durum.arama.trim().toLocaleLowerCase('tr');
    let l = durum.efektler.filter(e => !durum.kategori || e.kategori === durum.kategori);
    if (q) l = l.filter(e => [e.ad, e.kategori, (e.etiketler || []).join(' ')].join(' ').toLocaleLowerCase('tr').includes(q));
    const s = durum.sirala;
    l = l.slice().sort((a, b) =>
      s === 'ucuz' ? (Number(a.fiyat) || 0) - (Number(b.fiyat) || 0)
      : s === 'kisa' ? (Number(a.sure_sn) || 0) - (Number(b.sure_sn) || 0)
      : s === 'ad' ? a.ad.localeCompare(b.ad, 'tr')
      : (a.sira - b.sira) || String(b.created_at).localeCompare(String(a.created_at)));
    return l;
  }

  function kategoriler() {
    const say = {};
    durum.efektler.forEach(e => { if (e.kategori) say[e.kategori] = (say[e.kategori] || 0) + 1; });
    return Object.keys(say).sort((a, b) => a.localeCompare(b, 'tr')).map(k => ({ ad: k, sayi: say[k] }));
  }

  function filtreCiz() {
    const k = kategoriler();
    const tum = `<button type="button" data-kategori="" aria-pressed="${!durum.kategori}">Tümü <small>${durum.efektler.length}</small></button>`;
    $('#se-filtre').innerHTML = tum + k.map(x =>
      `<button type="button" data-kategori="${kacis(x.ad)}" aria-pressed="${durum.kategori === x.ad}">${kacis(x.ad)} <small>${x.sayi}</small></button>`).join('');
    $('#se-cipler').innerHTML = [{ ad: '' }].concat(k).map(x =>
      `<button type="button" class="se-cip" data-kategori="${kacis(x.ad)}" aria-pressed="${durum.kategori === x.ad}">${x.ad ? kacis(x.ad) : 'Tümü'}</button>`).join('');
  }

  function satisDurumu(efektId, paketId) {
    return durum.satislar.find(s => (efektId && s.efekt_id === efektId) || (paketId && s.paket_id === paketId)) || null;
  }
  function paketteAlindi(e) {
    return e.paket_id && durum.satislar.some(s => s.paket_id === e.paket_id);
  }

  function satinDugmesi(e) {
    const s = satisDurumu(e.id, null);
    if (s && s.durum === 'odendi') return `<a class="se-dugme yesil" href="#satin-aldiklarim">İndir</a>`;
    if (s || paketteAlindi(e)) return `<a class="se-dugme ikincil" href="#satin-aldiklarim">Siparişte</a>`;
    if (!(Number(e.fiyat) > 0)) return `<span class="se-rozet">Yakında</span>`;
    return `<button type="button" class="se-dugme" data-satin="${e.id}">Satın al</button>`;
  }

  function listeCiz() {
    const l = suzulmus();
    $('#se-baslik').textContent = durum.kategori || 'Öne çıkan ses efektleri';
    if (!durum.efektler.length) {
      $('#se-liste').innerHTML = '<p class="se-bos">Ses efektleri çok yakında burada. Stüdyoda kaydedilen ilk efektler eklenince dinleyip satın alabileceksin.</p>';
      return;
    }
    if (!l.length) {
      $('#se-liste').innerHTML = '<p class="se-bos">Bu aramaya uyan efekt yok.</p>';
      return;
    }
    $('#se-liste').innerHTML = l.map(e => `
      <div class="se-satir" data-efekt="${e.id}">
        <button type="button" class="se-cal" data-cal="${e.id}" aria-pressed="${durum.calan === e.id}" aria-label="${kacis(e.ad)} önizlemesini ${durum.calan === e.id ? 'durdur' : 'çal'}" ${e.onizleme_path ? '' : 'disabled'}>${durum.calan === e.id ? DUR : PLAY}</button>
        <div class="se-ad"><b>${kacis(e.ad)}</b><small>${kacis([e.kategori].concat(e.etiketler || []).filter(Boolean).join(', '))}</small></div>
        <div class="se-ilerleme" aria-hidden="true"><i data-ilerleme="${e.id}"></i></div>
        <span class="se-sure">${e.sure_sn ? sureYaz(e.sure_sn) : ''}</span>
        <span class="se-fiyat">${kacis(fiyatYaz(e.fiyat))}</span>
        ${satinDugmesi(e)}
      </div>`).join('');
  }

  function paketCiz() {
    const kap = $('#se-paket-bolum');
    if (!durum.paketler.length) { kap.hidden = true; return; }
    kap.hidden = false;
    $('#se-paketler').innerHTML = durum.paketler.map(p => {
      const adet = durum.efektler.filter(e => e.paket_id === p.id).length;
      const s = satisDurumu(null, p.id);
      const dugme = s && s.durum === 'odendi' ? '<a class="se-dugme yesil" href="#satin-aldiklarim">İndir</a>'
        : s ? '<a class="se-dugme ikincil" href="#satin-aldiklarim">Siparişte</a>'
        : Number(p.fiyat) > 0 ? `<button type="button" class="se-dugme sari" data-paket-satin="${p.id}">Paketi al</button>` : '<span class="se-rozet">Yakında</span>';
      return `<article class="se-paket"><b>${kacis(p.ad)}</b><p>${adet} efekt${p.aciklama ? ' · ' + kacis(p.aciklama) : ''}</p>
        <div class="se-alt"><span class="se-fiyat">${kacis(fiyatYaz(p.fiyat))}</span>${dugme}</div></article>`;
    }).join('');
  }

  // ---------- Satın aldıklarım ----------
  function urunAdi(s) {
    if (s.efekt_id) { const e = durum.efektler.find(x => x.id === s.efekt_id); return e ? e.ad : 'Ses efekti'; }
    const p = durum.paketler.find(x => x.id === s.paket_id); return p ? p.ad + ' (paket)' : 'Paket';
  }

  function alimlarCiz() {
    const kap = $('#satin-aldiklarim');
    const auth = window.DerinAuth;
    if (!auth || !auth.user || !durum.satislar.length) { kap.hidden = true; return; }
    kap.hidden = false;
    const iban = durum.odeme.iban ? `<div class="se-iban">Havale bilgileri<br>IBAN: <code>${kacis(SA.ibanGoster(durum.odeme.iban))}</code>${durum.odeme.alici ? '<br>Alıcı: ' + kacis(durum.odeme.alici) : ''}${durum.odeme.aciklama ? '<br>' + kacis(durum.odeme.aciklama) : ''}</div>` : '';
    const bekleyen = durum.satislar.some(s => s.durum !== 'odendi');
    $('#se-alimlar').innerHTML = (bekleyen ? iban : '') + durum.satislar.map(s => {
      const rozet = s.durum === 'odendi' ? '<span class="se-rozet odendi">Ödendi</span>'
        : s.durum === 'dekont' ? '<span class="se-rozet dekont">Dekont kontrol ediliyor</span>'
        : '<span class="se-rozet">Ödeme bekleniyor</span>';
      let islem = '';
      if (s.durum === 'odendi') {
        const dosyalar = durum.indirmeler.filter(d => d.satis_id === s.id);
        islem = dosyalar.map(d => `<button type="button" class="se-dugme yesil" data-indir="${kacis(d.dosya_path)}" data-ad="${kacis(d.dosya_adi || d.ad + '.wav')}">${kacis(d.ad)} · WAV indir</button>`).join('');
      } else {
        islem = `<label class="se-dugme ikincil" style="display:inline-flex;align-items:center;cursor:pointer">${s.durum === 'dekont' ? 'Dekontu değiştir' : 'Dekont yükle'}<input type="file" class="se-gizli" accept="${SA.DEKONT_ACCEPT}" data-dekont="${s.id}"></label>`;
      }
      return `<div class="se-alim"><div class="se-ad"><b>${kacis(urunAdi(s))}</b><small>${kacis(fiyatYaz(s.tutar))}</small></div>${rozet}${islem}</div>`;
    }).join('');
  }

  function hepsiniCiz() { filtreCiz(); paketCiz(); listeCiz(); alimlarCiz(); }

  // ---------- Veri ----------
  async function yukle() {
    const auth = window.DerinAuth;
    const c = auth && auth.client;
    if (!c) { durumYaz('Bağlantı kurulamadı.', true); return; }
    const [ef, pk] = await Promise.all([
      c.from('ses_efektleri').select('id,ad,kategori,etiketler,sure_sn,fiyat,paket_id,onizleme_path,sira,created_at').eq('durum', 'yayinda'),
      c.from('ses_efekt_paketleri').select('id,ad,aciklama,fiyat,sira').eq('durum', 'yayinda').order('sira')
    ]);
    durum.efektler = ef.error ? [] : (ef.data || []);
    durum.paketler = pk.error ? [] : (pk.data || []);
    durum.satislar = []; durum.indirmeler = [];
    if (auth.user) {
      const [sa, ind, od] = await Promise.all([
        c.from('ses_efekt_satislari').select('id,efekt_id,paket_id,durum,tutar,istendi_at').order('istendi_at', { ascending: false }),
        c.rpc('efekt_indirme_listesi'),
        c.from('odeme_ayarlari').select('iban,alici,aciklama').eq('id', 1).maybeSingle()
      ]);
      durum.satislar = sa.error ? [] : (sa.data || []);
      durum.indirmeler = ind.error ? [] : (ind.data || []);
      durum.odeme = (!od.error && od.data) || {};
    }
    durumYaz(ef.error ? 'Efektler yüklenemedi. Sayfayı yenileyin.' : '', !!ef.error);
    hepsiniCiz();
  }

  // ---------- İşlemler ----------
  function cal(id) {
    const e = durum.efektler.find(x => x.id === id);
    if (!e || !e.onizleme_path) return;
    if (durum.calan === id) { ses.pause(); durum.calan = null; listeCiz(); return; }
    ses.src = R2.adres('efekt-onizleme', e.onizleme_path);
    durum.calan = id;
    ses.play().catch(() => { durum.calan = null; listeCiz(); durumYaz('Önizleme çalınamadı.', true); });
    listeCiz();
  }
  ses.addEventListener('timeupdate', () => {
    const i = durum.calan && document.querySelector(`[data-ilerleme="${durum.calan}"]`);
    if (i && ses.duration) i.style.width = (ses.currentTime / ses.duration * 100) + '%';
  });
  ses.addEventListener('ended', () => { durum.calan = null; listeCiz(); });

  async function satinAl(alan, id) {
    const auth = window.DerinAuth;
    if (!auth.user) { durumYaz('Satın almak için giriş yap ya da ücretsiz hesap aç.'); auth.open(); return; }
    durumYaz('Satın alma talebin oluşturuluyor…');
    const satir = {}; satir[alan] = id;
    const { error } = await auth.client.from('ses_efekt_satislari').insert(satir);
    if (error) { durumYaz(/Satista/.test(error.message) ? 'Bu ürün şu an satışta değil.' : 'Talep oluşturulamadı. Tekrar dene.', true); return; }
    await yukle();
    durumYaz('Talebin alındı. Aşağıdaki IBAN\'a havale yapıp dekontu yükle; ödeme onaylanınca indirme açılır.');
    const k = $('#satin-aldiklarim'); if (k) k.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function dekontYukle(satisId, dosya) {
    const hata = SA.dekontHatasi(dosya);
    if (hata) { durumYaz(hata, true); return; }
    const auth = window.DerinAuth;
    durumYaz('Dekont yükleniyor…');
    const yol = SA.dekontYolu(auth.user.id, 'efekt-' + satisId, dosya.name);
    const up = await R2.yukle('project-audio', yol, dosya, dosya.type || undefined);
    if (up.error) { durumYaz('Dekont yüklenemedi: ' + up.error.message, true); return; }
    const { data, error } = await auth.client.from('ses_efekt_satislari')
      .update({ durum: 'dekont', dekont_path: yol, dekont_adi: dosya.name }).eq('id', satisId).select('id');
    if (error || !data || !data.length) { durumYaz('Dekont kaydedilemedi. Tekrar dene.', true); return; }
    await yukle();
    durumYaz('Dekontun alındı. Ödeme onaylanınca indirme düğmesi burada açılır.');
  }

  async function indir(yol, ad) {
    durumYaz('İndirme hazırlanıyor…');
    try {
      const adres = await R2.korumaliAdres('efekt-audio', String(yol).replace(/^efekt\//, ''));
      const blob = await (await fetch(adres)).blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = ad || 'ses-efekti.wav';
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      durumYaz('');
    } catch (e) {
      durumYaz('İndirilemedi: ' + ((e && e.message) || 'bilinmeyen hata'), true);
    }
  }

  function bagla() {
    document.addEventListener('click', ev => {
      const k = ev.target.closest('[data-kategori]');
      if (k) { durum.kategori = k.getAttribute('data-kategori'); filtreCiz(); listeCiz(); return; }
      const c = ev.target.closest('[data-cal]'); if (c) { cal(c.getAttribute('data-cal')); return; }
      const s = ev.target.closest('[data-satin]'); if (s) { satinAl('efekt_id', s.getAttribute('data-satin')); return; }
      const p = ev.target.closest('[data-paket-satin]'); if (p) { satinAl('paket_id', p.getAttribute('data-paket-satin')); return; }
      const d = ev.target.closest('[data-indir]'); if (d) { indir(d.getAttribute('data-indir'), d.getAttribute('data-ad')); }
    });
    document.addEventListener('change', ev => {
      const f = ev.target.closest('[data-dekont]');
      if (f && f.files && f.files[0]) dekontYukle(f.getAttribute('data-dekont'), f.files[0]);
    });
    $('#se-ara').addEventListener('input', ev => { durum.arama = ev.target.value; listeCiz(); });
    $('#se-sirala').addEventListener('change', ev => { durum.sirala = ev.target.value; listeCiz(); });
  }

  async function baslat() {
    bagla();
    const auth = window.DerinAuth;
    if (!auth) { durumYaz('Bağlantı kurulamadı.', true); return; }
    await auth.ready;
    await yukle();
    window.addEventListener('derin:authchange', () => yukle());
  }

  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', baslat) : baslat();
})();
