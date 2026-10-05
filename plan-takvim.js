// Derin Record — yönetici plan takvimi.
//
// Tasarım: docs/superpowers/specs/2026-10-05-admin-plan-takvimi-design.md
//
// Bu dosya saf hesap ve HTML üretiminden ibarettir: DOM'a dokunmaz, ağa
// çıkmaz. Böylece node testleriyle doğrudan sınanabiliyor.
//
// Gün hesapları UTC ile yapılır. Türkiye UTC+3; yerel tarih kullanılsaydı
// ayın son günü bir önceki güne kayabilirdi.
(() => {
  'use strict';

  const iki = n => (n < 10 ? '0' : '') + n;
  const isoYaz = d => d.getUTCFullYear() + '-' + iki(d.getUTCMonth() + 1) + '-' + iki(d.getUTCDate());

  // Bir ayın takvim ızgarası: her zaman 42 hücre (6 hafta), pazartesiden
  // başlar. Ay dışındaki hücreler komşu ayın gerçek günleriyle dolar, böylece
  // kullanıcı ay geçişini görür ve ekran ay kısaldığında zıplamaz.
  function aylikIzgara(yil, ay) {
    const ilk = new Date(Date.UTC(yil, ay - 1, 1));
    // getUTCDay: 0 pazar … 6 cumartesi. Pazartesi başlangıcına çeviriyoruz.
    const onde = (ilk.getUTCDay() + 6) % 7;
    const basla = new Date(Date.UTC(yil, ay - 1, 1 - onde));

    const hucreler = [];
    for (let i = 0; i < 42; i++) {
      const g = new Date(Date.UTC(basla.getUTCFullYear(), basla.getUTCMonth(), basla.getUTCDate() + i));
      hucreler.push({
        iso: isoYaz(g),
        gunNo: g.getUTCDate(),
        ayIcinde: g.getUTCMonth() === ay - 1 && g.getUTCFullYear() === yil
      });
    }
    return hucreler;
  }

  // Takvim hücresindeki rozet. Not bir iş değildir; sayıma girmez, yoksa
  // "3 işin 1'i bitmiş" derken aslında ikisi iş biri nottur.
  function gunOzeti(maddeler, iso) {
    const gunun = (maddeler || []).filter(m => m.gun === iso && m.tur === 'madde');
    return { toplam: gunun.length, bitti: gunun.filter(m => m.bitti).length };
  }

  // iso metinlerini gün ekleyerek kaydırır. Karşılaştırmalar da metin
  // üzerinden yapılabiliyor: YYYY-AA-GG'de sözlük sırası tarih sırasıyla aynı.
  function gunEkle(iso, gun) {
    const p = String(iso).slice(0, 10).split('-');
    const d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2] + gun));
    return isoYaz(d);
  }

  // Aboneliklerden gelen ödemeler. Bu satırlar plan_maddeleri'nde TUTULMAZ:
  // canlı okunur, böylece abonelik tarihi değişince takvim de değişir.
  //
  // İptal edilmiş abonelik gizlenmez, etiketlenir — veriyi olduğu gibi
  // göstermek sessizce filtrelemekten iyidir.
  function yaklasanOdemeler(D, bugunIso, gunSayisi) {
    const son = gunEkle(bugunIso, gunSayisi == null ? 60 : gunSayisi);
    const markaAdi = id => {
      const b = (D.brands || []).find(x => x.id === id);
      return b ? b.name : '—';
    };
    return (D.subscriptions || [])
      .filter(s => s.current_end)
      .map(s => {
        const iso = String(s.current_end).slice(0, 10);
        const p = (D.plans || []).find(x => x.id === s.plan_id);
        const fiyat = p ? Number(p.monthly_price) : 0;
        return {
          iso: iso,
          marka: markaAdi(s.brand_id),
          tutar: p && p.per_branch ? fiyat * Number(s.branch_count || 1) : fiyat,
          iptal: !!s.canceled_at
        };
      })
      .filter(o => o.iso >= bugunIso && o.iso <= son)
      .sort((a, b) => (a.iso < b.iso ? -1 : a.iso > b.iso ? 1 : 0));
  }

  // Kullanıcıdan gelen her metin buradan geçer. Projedeki her dosyada
  // kendi yereli var; takvim de kendi kopyasını taşıyor.
  const esc = s => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  const para = n => Number(n || 0).toLocaleString('tr-TR');

  const AYLAR = ['OCAK', 'ŞUBAT', 'MART', 'NİSAN', 'MAYIS', 'HAZİRAN',
    'TEMMUZ', 'AĞUSTOS', 'EYLÜL', 'EKİM', 'KASIM', 'ARALIK'];
  const HAFTA = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];

  // Katlanabilir bölüm. Katlıyken içerik hiç basılmaz — gizlenmiş DOM
  // değil, olmayan DOM; ekran da hafifler.
  function bolum(ad, baslik, icerik, katliMi) {
    return `<section class="plan-bolum${katliMi ? ' katli' : ''}">
      <button class="plan-bolum-bas" data-act="plan-katla" data-id="${esc(ad)}" type="button">
        <span class="ok">${katliMi ? '▸' : '▾'}</span>${esc(baslik)}
      </button>
      ${katliMi ? '' : `<div class="plan-bolum-ic">${icerik}</div>`}
    </section>`;
  }

  // Kaydedilemeyen satır silinmez: metin ekranda durur, yanında tekrar dene
  // çıkar. Sessiz başarısızlık yok — sessiz kayıp da yok.
  const hataSatiri = m => m.hata
    ? `<button class="plan-tekrar" data-act="plan-tekrar" data-id="${esc(m.id)}"
        type="button">kaydedilemedi — tekrar dene</button>`
    : '';

  function maddeSatiri(m) {
    return `<li class="plan-satir${m.bitti ? ' bitti' : ''}${m.hata ? ' hata' : ''}">
      <button class="kutu" data-act="plan-isaret" data-id="${esc(m.id)}" type="button"
        aria-label="${m.bitti ? 'Yapılmadı işaretle' : 'Yapıldı işaretle'}">${m.bitti ? '✓' : ''}</button>
      <span class="metin">${esc(m.metin)}</span>
      <button class="sil" data-act="plan-sil" data-id="${esc(m.id)}" type="button" aria-label="Sil">×</button>
      ${hataSatiri(m)}
    </li>`;
  }

  function odemeSatiri(o) {
    return `<li class="plan-satir odeme${o.bitti ? ' bitti' : ''}${o.hata ? ' hata' : ''}">
      <button class="kutu" data-act="plan-isaret" data-id="${esc(o.id)}" type="button"
        aria-label="${o.bitti ? 'Ödenmedi işaretle' : 'Ödendi işaretle'}">${o.bitti ? '✓' : ''}</button>
      <span class="metin">${esc(o.marka || o.metin)}</span>
      <b class="tutar">${para(o.tutar)} ₺</b>
      <button class="sil" data-act="plan-sil" data-id="${esc(o.id)}" type="button" aria-label="Sil">×</button>
      ${hataSatiri(o)}
    </li>`;
  }

  // Satır içi ekleme. Kapalıyken yalnız bir düğme; açıkken yazı alanı.
  // Tarayıcının prompt() penceresi kullanılmaz: odak kaybolmaz, panelin
  // içinde kalır ve dokunmatikte de çalışır.
  function ekleFormu(tur, iso, acikTur) {
    if (acikTur !== tur) {
      return `<button class="plan-ekle" data-act="plan-yeni"
        data-id="${tur}:${esc(iso)}" type="button">+ ${tur === 'madde' ? 'madde ekle' : 'ödeme ekle'}</button>`;
    }
    if (tur === 'madde') {
      return `<div class="plan-yeni">
        <input class="plan-gir" data-plan-gir="madde" data-id="${esc(iso)}"
          type="text" autocomplete="off" placeholder="Madde yaz, Enter'a bas…">
        <button class="plan-vazgec" data-act="plan-yeni-kapat" type="button" aria-label="Vazgeç">×</button>
      </div>`;
    }
    return `<div class="plan-yeni">
      <input class="plan-gir" data-plan-gir="odeme-marka" data-id="${esc(iso)}"
        type="text" autocomplete="off" placeholder="Marka / açıklama">
      <input class="plan-gir tutar" data-plan-gir="odeme-tutar" data-id="${esc(iso)}"
        type="text" inputmode="decimal" autocomplete="off" placeholder="Tutar ₺">
      <button class="plan-kaydet" data-act="plan-odeme-kaydet" data-id="${esc(iso)}" type="button">ekle</button>
      <button class="plan-vazgec" data-act="plan-yeni-kapat" type="button" aria-label="Vazgeç">×</button>
    </div>`;
  }

  // Açık günün paneli. Her bölüm ayrı katlanır; eklenen her şey silinebilir.
  // yeniTur: açık olan satır içi ekleme formu ('madde' | 'odeme' | null).
  function gunPaneli(iso, maddeler, katli, yeniTur) {
    const gunun = maddeler.filter(m => m.gun === iso);
    const isler = gunun.filter(m => m.tur === 'madde').sort((a, b) => (a.sira || 0) - (b.sira || 0));
    const odemeler = gunun.filter(m => m.tur === 'odeme').sort((a, b) => (a.sira || 0) - (b.sira || 0));
    const not = gunun.find(m => m.tur === 'not');
    const k = ad => katli.indexOf(ad) !== -1;

    return `<div class="plan-gun-paneli" data-gun="${esc(iso)}">
      <h3>${esc(iso)}</h3>
      ${bolum('maddeler', 'YAPILACAKLAR', `
        <ul class="plan-liste">${isler.map(maddeSatiri).join('')}</ul>
        ${ekleFormu('madde', iso, yeniTur)}
      `, k('maddeler'))}
      ${bolum('odemeler', 'ÖDEMELER', `
        <ul class="plan-liste">${odemeler.map(odemeSatiri).join('')}</ul>
        ${ekleFormu('odeme', iso, yeniTur)}
      `, k('odemeler'))}
      ${bolum('not', 'NOT', `
        <textarea class="plan-not" data-act="plan-not" data-id="${esc(iso)}"
          placeholder="Bu güne dair not…">${esc(not ? not.metin : '')}</textarea>
      `, k('not'))}
    </div>`;
  }

  // state.planYeni 'tur:iso' biçiminde tutulur. Açık günün satır içi formu
  // yalnız o güne aitse açılır.
  function yeniTur(state) {
    const parca = String(state.planYeni || '').split(':');
    return parca.length === 2 && parca[1] === state.planAcikGun ? parca[0] : null;
  }

  // Ana görünüm. state.planYil/planAy yoksa bugünün ayı açılır.
  function takvimView(state, D, ui) {
    const s = state || {};
    const bugun = isoYaz(new Date(ui && ui.now ? ui.now() : Date.now()));
    const yil = s.planYil || +bugun.slice(0, 4);
    const ay = s.planAy || +bugun.slice(5, 7);
    const maddeler = (D && D.planItems) || [];
    const katli = s.planKatli || [];

    const hucre = h => {
      const o = gunOzeti(maddeler, h.iso);
      const acik = s.planAcikGun === h.iso;
      const rozet = o.toplam ? `<i class="rozet">${o.bitti}/${o.toplam}</i>` : '';
      return `<button class="plan-hucre${h.ayIcinde ? '' : ' disari'}${h.iso === bugun ? ' bugun' : ''}${acik ? ' acik' : ''}"
        data-act="plan-gun" data-id="${h.iso}" type="button">
        <span class="gun">${h.gunNo}</span>${rozet}
      </button>`;
    };

    const odemeler = yaklasanOdemeler(D || {}, bugun, 60);
    const odemeSutun = odemeler.length
      ? `<ul class="plan-odeme-liste">${odemeler.map(o => `
          <li${o.iptal ? ' class="iptal"' : ''}>
            <span class="t">${esc(o.iso)}</span>
            <span class="m">${esc(o.marka)}</span>
            <b>${para(o.tutar)} ₺</b>
            ${o.iptal ? '<small>iptal edilmiş</small>' : ''}
            <button class="aktar" type="button"
              data-act="plan-odeme-aktar" data-id="${esc(o.iso + ':' + o.marka + ':' + o.tutar)}">takvime ekle</button>
          </li>`).join('')}</ul>`
      : '<p class="bos">Önümüzdeki 60 günde ödemesi gelen abonelik yok.</p>';

    return `<div class="plan-sarmal">
      <div class="plan-ana">
        <div class="plan-ay-bas">
          <button data-act="plan-ay" data-id="onceki" type="button" aria-label="Önceki ay">‹</button>
          <b>${AYLAR[ay - 1]} ${yil}</b>
          <button data-act="plan-ay" data-id="sonraki" type="button" aria-label="Sonraki ay">›</button>
        </div>
        <div class="plan-hafta">${HAFTA.map(g => `<span>${g}</span>`).join('')}</div>
        <div class="plan-izgara">${aylikIzgara(yil, ay).map(hucre).join('')}</div>
        ${s.planAcikGun ? gunPaneli(s.planAcikGun, maddeler, katli, yeniTur(s)) : ''}
      </div>
      <aside class="plan-yan">
        ${bolum('yaklasan', 'YAKLAŞAN ÖDEMELER', odemeSutun, katli.indexOf('yaklasan') !== -1)}
      </aside>
    </div>`;
  }

  const api = {
    aylikIzgara: aylikIzgara,
    gunOzeti: gunOzeti,
    gunEkle: gunEkle,
    yaklasanOdemeler: yaklasanOdemeler,
    takvimView: takvimView
  };

  if (typeof window !== 'undefined') window.DerinPlan = api;
  if (typeof module !== 'undefined') module.exports = api;
})();
