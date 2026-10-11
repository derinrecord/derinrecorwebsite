// Derin Record — AJANLAR sayfasının canlı durumu.
//
// Ajanlar (zamanlanmış görevler) her çalışmanın sonunda public.ajan_durumu
// tablosuna tek satır yazar: hangi ajan, sonuç, kısa özet, varsa onay bekleyen
// dal. Bu dosya o satırlardan sayfada gösterilecek bilgiyi hesaplar; DOM'a
// dokunmaz, ağa çıkmaz, node testleriyle sınanır.
(() => {
  'use strict';

  // Tablodaki "ajan" sütununun izinli kodları (supabase/ajan-durumu.sql ile aynı).
  const AJANLAR = ['site-bakim', 'arayuz', 'instagram', 'talep', 'radyo', 'yarisma', 'kafe-satis', 'guvenlik', 'koordinator'];

  const SONUC = {
    sorunsuz: { ad: 'Sorunsuz', sinif: 'iyi' },
    is_yapildi: { ad: 'İş hazır', sinif: 'iyi' },
    onay_bekliyor: { ad: 'Onayını bekliyor', sinif: 'onay' },
    hata: { ad: 'Tamamlanamadı', sinif: 'hata' }
  };

  const zaman = v => new Date(v).getTime();

  function sonDurumlar(satirlar) {
    const son = {};
    (satirlar || []).forEach(s => {
      if (!s || !s.ajan) return;
      if (!son[s.ajan] || zaman(s.created_at) > zaman(son[s.ajan].created_at)) son[s.ajan] = s;
    });
    return son;
  }

  // Açık iş: ajanın EN SON kaydı "onay_bekliyor" ise o ajanın onay kayıtlarındaki
  // dallar (en yeni üstte, aynı dal bir kez). Ajan sonraki çalışmada başka bir
  // sonuç yazdıysa bekleyen işi kalmamış sayılır; bu yüzden ajanlar, main'e
  // girmemiş dalları varken her çalışmada yine "onay_bekliyor" yazar.
  function onayBekleyenler(satirlar) {
    const son = sonDurumlar(satirlar);
    const gorulen = new Set();
    return (satirlar || [])
      .filter(s => s && s.sonuc === 'onay_bekliyor' && s.dal && son[s.ajan] && son[s.ajan].sonuc === 'onay_bekliyor')
      .sort((a, b) => zaman(b.created_at) - zaman(a.created_at))
      .filter(s => (gorulen.has(s.dal) ? false : (gorulen.add(s.dal), true)));
  }

  function ozetSayilar(satirlar, simdi) {
    const sinir = zaman(simdi || Date.now()) - 24 * 3600 * 1000;
    const yakin = (satirlar || []).filter(s => zaman(s.created_at) >= sinir);
    return {
      son24: yakin.length,
      hata: yakin.filter(s => s.sonuc === 'hata').length,
      onay: onayBekleyenler(satirlar).length
    };
  }

  const TZ = 'Europe/Istanbul';
  const gunAnahtari = d => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  const saat = d => new Intl.DateTimeFormat('tr-TR', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d);
  const tarih = d => new Intl.DateTimeFormat('tr-TR', { timeZone: TZ, day: 'numeric', month: 'short' }).format(d);

  function goreliZaman(v, simdi) {
    if (!v) return '';
    const d = new Date(v);
    const s = new Date(simdi || Date.now());
    const dun = new Date(s.getTime() - 24 * 3600 * 1000);
    if (gunAnahtari(d) === gunAnahtari(s)) return 'bugün ' + saat(d);
    if (gunAnahtari(d) === gunAnahtari(dun)) return 'dün ' + saat(d);
    return tarih(d) + ' ' + saat(d);
  }

  const api = { AJANLAR, SONUC, sonDurumlar, onayBekleyenler, ozetSayilar, goreliZaman };
  if (typeof window !== 'undefined') window.DerinAjanDurumu = api;
  if (typeof module !== 'undefined') module.exports = api;
})();
