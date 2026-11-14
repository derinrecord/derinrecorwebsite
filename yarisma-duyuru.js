// Canlı yayın duyuruları (14 Kasım 2026) — yöneticinin YARIŞMALAR sayfasında seçtiği
// (yayinda = true) yarışmalar ana sayfada (MÜZİĞİNİ OLUŞTUR'un altında kaset etiketli
// şerit) ve Haberler'in en üstünde görünür; bitiş günü geçince kendiliğinden kalkar.
// Veri: supabase/yarismalar.sql (ziyaretçi yalnız yayınlanan satırları okuyabilir).
(() => {
  'use strict';
  const BOLGE = 'Europe/Istanbul';
  const AYLAR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const bugunYazi = simdi => new Date(simdi).toLocaleDateString('sv-SE', { timeZone: BOLGE });

  // Yalnız https bağlantılar (javascript: vb. reddedilir).
  const guvenliAdres = a => /^https:\/\/[^\s<>"']+$/.test(String(a || '')) ? String(a) : '';

  // Yayında olan ve bitmemiş yarışmalar, başlangıca göre sıralı.
  function gorunenler(liste, simdi) {
    const bugun = bugunYazi(simdi);
    return (liste || []).filter(y => y && y.yayinda && String(y.bit) >= bugun).sort((a, b) => String(a.bas).localeCompare(String(b.bas)));
  }

  // "13–15 Kasım", "30 Kasım – 2 Aralık", "20 Kasım"
  function tarihYazi(bas, bit) {
    const [, ab, gb] = String(bas).split('-').map(Number), [, as, gs] = String(bit || bas).split('-').map(Number);
    if (!ab || !gb) return '';
    if (String(bas) === String(bit || bas)) return gb + ' ' + AYLAR[ab - 1];
    if (ab === as) return gb + '–' + gs + ' ' + AYLAR[ab - 1];
    return gb + ' ' + AYLAR[ab - 1] + ' – ' + gs + ' ' + AYLAR[as - 1];
  }

  // Başladıysa "CANLI YAYIN", başlamadıysa "CANLI YAYIN · 20 KASIM".
  function etiket(y, simdi) {
    if (String(y.bas) <= bugunYazi(simdi)) return 'CANLI YAYIN';
    const [, a, g] = String(y.bas).split('-').map(Number);
    return 'CANLI YAYIN · ' + g + ' ' + AYLAR[a - 1].toLocaleUpperCase('tr-TR');
  }

  const altYazi = y => [tarihYazi(y.bas, y.bit), y.sehir].filter(Boolean).join(' · ');

  function seritHtml(y, simdi) {
    const adres = guvenliAdres(y.canli_link) || guvenliAdres(y.link);
    return `<a class="hero-yarisma" href="${esc(adres)}" target="_blank" rel="noreferrer"><span class="hy-lamba"><i aria-hidden="true"></i><span>${esc(etiket(y, simdi))}</span></span><span class="hy-metin"><b>${esc(y.ad)}</b><small>${esc(altYazi(y))}</small></span><span class="hy-izle">İZLE ↗</span></a>`;
  }

  function haberHtml(y, simdi) {
    const canli = guvenliAdres(y.canli_link), sayfa = guvenliAdres(y.link);
    const metin = [tarihYazi(y.bas, y.bit) + (y.sehir ? ', ' + y.sehir : ''), y.brans, y.not_metni].filter(Boolean).join(' · ');
    return `<article class="news-card local news-akro" data-yarisma="${esc(y.id)}"><span class="news-canli">${esc(etiket(y, simdi))}${y.brans ? ' · ' + esc(String(y.brans).toLocaleUpperCase('tr-TR')) : ''}</span><h2>${esc(y.ad)}</h2><p>${esc(metin)}</p>`
      + (canli ? `<a class="news-canli-dugme" href="${esc(canli)}" target="_blank" rel="noreferrer">CANLI YAYIN · TIKLA ↗</a>` : '')
      + (sayfa ? `<a class="news-ikincil" href="${esc(sayfa)}" target="_blank" rel="noreferrer">Yarışma sayfası ↗</a>` : '')
      + '</article>';
  }

  if (typeof module !== 'undefined') module.exports = { gorunenler, tarihYazi, etiket, guvenliAdres, seritHtml, haberHtml };
  if (typeof document === 'undefined') return;

  async function basla() {
    const serit = document.querySelector('[data-yarisma-serit]'), haber = document.querySelector('[data-yarisma-haber]');
    if (!serit && !haber) return;
    let client = null;
    try { client = window.DerinAuth && (await window.DerinAuth.ready).client; } catch (e) { client = null; }
    if (!client) return;
    const { data, error } = await client.from('yarismalar')
      .select('id,ad,brans,sehir,bas,bit,link,canli_link,not_metni,yayinda')
      .eq('yayinda', true).gte('bit', bugunYazi(Date.now())).order('bas');
    if (error || !data) return;
    const liste = gorunenler(data, Date.now());
    if (serit) { serit.innerHTML = liste.length ? seritHtml(liste[0], Date.now()) : ''; serit.hidden = !liste.length; }
    if (haber) haber.innerHTML = liste.map(y => haberHtml(y, Date.now())).join('');
  }
  basla();
})();
