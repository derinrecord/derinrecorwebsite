// Derin Record — satış takibi (radyo paneli · Müşteriler → Satış).
//
// Tasarım: docs/superpowers/specs/2026-10-10-satis-takibi-design.md
//
// Bu dosya saf hesaptan ibarettir: DOM'a dokunmaz, ağa çıkmaz. Böylece node
// testleriyle doğrudan sınanabiliyor. Tarihler 'YYYY-AA-GG' metni olarak
// karşılaştırılır: bu biçimde sözlük sırası tarih sırasıyla aynıdır.
(() => {
  'use strict';

  const ASAMALAR = [
    { kod: 'new', etiket: 'Yeni' },
    { kod: 'contacted', etiket: 'Görüşüldü' },
    { kod: 'offer', etiket: 'Teklif gönderildi' },
    { kod: 'trial', etiket: 'Denemede' },
    { kod: 'won', etiket: 'Anlaştı' },
    { kod: 'lost', etiket: 'Olmadı' }
  ];

  const KAYNAK_ETIKET = { form: 'Site', manual: 'Elle' };

  function asamaEtiket(kod) {
    const a = ASAMALAR.find(x => x.kod === kod);
    return a ? a.etiket : kod;
  }

  function acikMi(t) {
    return !!t && t.status !== 'won' && t.status !== 'lost';
  }

  const gun = v => (v ? String(v).slice(0, 10) : '');

  function bugunYapilacaklar(talepler, bugunIso) {
    const bugun = gun(bugunIso);
    return (talepler || [])
      .filter(t => acikMi(t) && gun(t.next_step_date) && gun(t.next_step_date) <= bugun)
      .sort((a, b) => (gun(a.next_step_date) < gun(b.next_step_date) ? -1 : gun(a.next_step_date) > gun(b.next_step_date) ? 1 : 0));
  }

  function asamaSayilari(talepler) {
    const s = { tumu: 0 };
    ASAMALAR.forEach(a => { s[a.kod] = 0; });
    (talepler || []).forEach(t => {
      s.tumu += 1;
      if (Object.prototype.hasOwnProperty.call(s, t.status) && t.status !== 'tumu') s[t.status] += 1;
    });
    return s;
  }

  // Öncelik: 0 = tarihli açık, 1 = tarihsiz açık, 2 = kapanmış.
  function sirala(talepler) {
    const grup = t => (!acikMi(t) ? 2 : (gun(t.next_step_date) ? 0 : 1));
    return (talepler || []).slice().sort((a, b) => {
      const ga = grup(a), gb = grup(b);
      if (ga !== gb) return ga - gb;
      if (ga === 0) {
        const x = gun(a.next_step_date), y = gun(b.next_step_date);
        if (x !== y) return x < y ? -1 : 1;
      }
      const ca = String(a.created_at || ''), cb = String(b.created_at || '');
      return ca > cb ? -1 : ca < cb ? 1 : 0;
    });
  }

  const temiz = v => {
    const s = v == null ? '' : String(v).trim();
    return s ? s : null;
  };

  function markayaAktarilacak(t) {
    return {
      name: temiz(t.company),
      contact_name: temiz(t.contact_name),
      contact_phone: temiz(t.phone),
      contact_email: temiz(t.email)
    };
  }

  const api = {
    ASAMALAR: ASAMALAR,
    KAYNAK_ETIKET: KAYNAK_ETIKET,
    asamaEtiket: asamaEtiket,
    acikMi: acikMi,
    bugunYapilacaklar: bugunYapilacaklar,
    asamaSayilari: asamaSayilari,
    sirala: sirala,
    markayaAktarilacak: markayaAktarilacak
  };

  if (typeof window !== 'undefined') window.DerinSatis = api;
  if (typeof module !== 'undefined') module.exports = api;
})();
