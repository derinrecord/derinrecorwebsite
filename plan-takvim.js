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

  // Takvim hücresinin içindeki detaylar. Kare boş durmasın diye gün kısaca
  // özetlenir: iş ilerlemesi, o günün ödeme tutarı ve ilk kaydın kısa metni.
  // Not bir iş değildir ama varlığı önizlemede kendini gösterir.
  function gunBilgi(maddeler, iso) {
    const gunun = (maddeler || []).filter(m => m.gun === iso);
    const isler = gunun.filter(m => m.tur === 'madde');
    const odemeler = gunun.filter(m => m.tur === 'odeme');
    const not = gunun.find(m => m.tur === 'not');
    const isMetni = isler.map(m => m.metin).find(m => m && String(m).trim());
    const odemeAdi = odemeler.map(o => o.marka || o.metin).find(m => m && String(m).trim());
    const notMetni = not && not.metin && String(not.metin).trim() ? not.metin : '';
    return {
      isToplam: isler.length,
      isBitti: isler.filter(m => m.bitti).length,
      odemeToplam: odemeler.reduce((t, o) => t + Number(o.tutar || 0), 0),
      odemeAdet: odemeler.length,
      varNot: !!notMetni,
      onizleme: isMetni || odemeAdi || notMetni || ''
    };
  }

  // "2026-10-27" → "27 Ekim 2026 · Salı". UTC üzerinden okunur ki saat
  // dilimi günü kaydırmasın (aylikIzgara ile aynı kural).
  function gunEtiketi(iso) {
    const p = String(iso || '').slice(0, 10).split('-').map(Number);
    if (p.length !== 3 || !p[0] || !p[1] || !p[2]) return String(iso || '');
    const d = new Date(Date.UTC(p[0], p[1] - 1, p[2]));
    return `${p[2]} ${AYLAR_ADI[p[1] - 1]} ${p[0]} · ${GUNLER[(d.getUTCDay() + 6) % 7]}`;
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
  function yaklasanOdemeler(D, bugunIso, gunSayisi, geriGunSayisi) {
    const ileri = gunSayisi == null ? 60 : gunSayisi;
    // Geçmiş dönemler de listede kalır: ödemesi gelip işaretlenmemiş bir satır,
    // kullanıcı onu işaretleyene kadar gözden kaçmasın diye. Aksi hâlde gün
    // geçince satır kendiliğinden kaybolur ve hatırlanması imkânsızlaşırdı.
    const geri = geriGunSayisi == null ? 180 : geriGunSayisi;
    const bas = gunEkle(bugunIso, -geri);
    const son = gunEkle(bugunIso, ileri);
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
          iptal: !!s.canceled_at,
          gecmis: iso < bugunIso
        };
      })
      .filter(o => o.iso >= bas && o.iso <= son)
      .sort((a, b) => (a.iso < b.iso ? -1 : a.iso > b.iso ? 1 : 0));
  }

  // Bir abonelik ödemesinin işaretlenip işaretlenmediği. Abonelikten gelen
  // satır plan_maddeleri'nde tutulmaz; ancak kullanıcı işaretleyince o güne
  // bir 'odeme' satırı düşer. Eşleşme gün + marka üzerinden yapılır.
  // Dönüş: 'odendi' | 'odenmedi' | null (henüz işaretlenmemiş).
  function odemeDurumu(maddeler, o) {
    const kayit = (maddeler || []).find(x => x.tur === 'odeme' && x.gun === o.iso && x.marka === o.marka);
    if (!kayit) return null;
    return kayit.bitti ? 'odendi' : 'odenmedi';
  }

  // Elle işaretlenmiş tüm ödemeler (plan_maddeleri'ndeki 'odeme' satırları),
  // en yeni gün en üstte. Geçmişe bakınca kimin ödediği buradan görülür.
  function odemeGecmisi(maddeler) {
    return (maddeler || [])
      .filter(x => x.tur === 'odeme')
      .map(x => ({
        id: x.id,
        gun: x.gun,
        marka: x.marka || x.metin || '—',
        tutar: Number(x.tutar || 0),
        bitti: !!x.bitti
      }))
      .sort((a, b) => (a.gun === b.gun ? 0 : a.gun < b.gun ? 1 : -1));
  }

  function odemeOzeti(maddeler) {
    const liste = odemeGecmisi(maddeler);
    const odendi = liste.filter(x => x.bitti).length;
    return { toplam: liste.length, odendi: odendi, odenmedi: liste.length - odendi };
  }

  // ---------- Ödeme takip özeti ----------
  // Abonelikten beklenen ödemelerle elle girilen ödemeler tek listede
  // birleştirilir. İki kaynak aynı ödemeyi gösterebilir (abonelik ödemesi
  // işaretlenince plan_maddeleri'ne bir 'odeme' satırı düşer); bu yüzden
  // gün + marka üzerinden tekilleştirilir, yoksa tutar iki kez sayılırdı.
  function odemeKalemleri(D, maddeler, bugunIso, ileri, geri) {
    const beklenen = yaklasanOdemeler(D || {}, bugunIso,
      ileri == null ? 400 : ileri, geri == null ? 400 : geri);
    const gorulen = {};
    const liste = [];
    beklenen.forEach(o => {
      const durum = odemeDurumu(maddeler, o);
      gorulen[o.iso + '|' + norm(o.marka)] = true;
      liste.push({
        iso: o.iso, marka: o.marka, tutar: Number(o.tutar || 0),
        iptal: !!o.iptal, gecmis: !!o.gecmis,
        bitti: durum === 'odendi', isaretli: durum !== null, kaynak: 'abonelik'
      });
    });
    (maddeler || []).filter(x => x.tur === 'odeme').forEach(x => {
      const marka = x.marka || x.metin || '—';
      if (gorulen[x.gun + '|' + norm(marka)]) return; // aboneliğin aynası
      liste.push({
        iso: x.gun, marka: marka, tutar: Number(x.tutar || 0),
        iptal: false, gecmis: x.gun < bugunIso,
        bitti: !!x.bitti, isaretli: true, kaynak: 'elle'
      });
    });
    return liste.sort((a, b) => (a.iso < b.iso ? -1 : a.iso > b.iso ? 1 : 0));
  }

  // Bir ayın ödeme özeti: tahsil edilen, bekleyen, gecikmiş. İptal edilmiş
  // abonelikler hiçbir sayıma girmez — etiketli gösterilirler ama takip
  // listesini şişirmesinler.
  function aylikOzet(D, maddeler, yil, ay, bugunIso) {
    const onek = yil + '-' + iki(ay);
    const kalemler = odemeKalemleri(D, maddeler, bugunIso, 800, 800)
      .filter(k => !k.iptal && k.iso.slice(0, 7) === onek);
    const topla = l => l.reduce((t, k) => t + k.tutar, 0);
    const tahsil = kalemler.filter(k => k.bitti);
    const bekleyen = kalemler.filter(k => !k.bitti);
    const gecikmis = bekleyen.filter(k => k.gecmis);
    return {
      adet: kalemler.length, toplam: topla(kalemler),
      tahsil: topla(tahsil), tahsilAdet: tahsil.length,
      bekleyen: topla(bekleyen), bekleyenAdet: bekleyen.length,
      gecikmis: topla(gecikmis), gecikmisAdet: gecikmis.length
    };
  }

  // Son n ayın tahsilat trendi: her ay için tahsil edilen ve bekleyen tutar.
  // Geçmiş aylarda "bekleyen" pratikte tahsil edilmemiş demektir; yine de
  // ayrı gösterilir, çünkü geç gelen bir ödeme kayda geçtiğinde ayın rengi
  // değişir. Ölçek, en büyük sütunun tam genişlik olmasıyla kurulur.
  function tahsilatTrendi(D, maddeler, bugunIso, aySayisi) {
    const n = aySayisi || 12;
    const parcalar = bugunIso.slice(0, 7).split('-');
    const y0 = +parcalar[0], a0 = +parcalar[1];
    const kalemler = odemeKalemleri(D, maddeler, bugunIso, 800, 800).filter(k => !k.iptal);
    const aylar = [];
    for (let i = n - 1; i >= 0; i--) {
      let y = y0, a = a0 - i;
      while (a < 1) { a += 12; y -= 1; }
      const onek = y + '-' + iki(a);
      const ayin = kalemler.filter(k => k.iso.slice(0, 7) === onek);
      const tahsil = ayin.filter(k => k.bitti).reduce((t, k) => t + k.tutar, 0);
      const bekleyen = ayin.filter(k => !k.bitti).reduce((t, k) => t + k.tutar, 0);
      aylar.push({ onek: onek, yil: y, ay: a, etiket: AYLAR[a - 1].slice(0, 3), tahsil: tahsil, bekleyen: bekleyen });
    }
    const enBuyuk = aylar.reduce((m, x) => Math.max(m, x.tahsil, x.bekleyen), 0);
    return {
      aylar: aylar, enBuyuk: enBuyuk, yil: y0,
      yilToplam: aylar.filter(x => x.yil === y0).reduce((t, x) => t + x.tahsil, 0)
    };
  }

  // Bekleyen abonelik ödemesi filtreye uyuyor mu?
  //  odendi   → yalnız ödendi işaretliler
  //  odenmedi → yalnız "ödenmedi" işaretliler
  //  gecikmis → günü geçmiş ve ödendi işaretlenmemiş olanlar
  function kalemUyuyor(o, maddeler, filtre, bugunIso) {
    if (filtre.q && !norm(o.marka).includes(filtre.q)) return false;
    if (!filtre.durum) return true;
    const durum = odemeDurumu(maddeler, o);
    if (filtre.durum === 'odendi') return durum === 'odendi';
    if (filtre.durum === 'odenmedi') return durum === 'odenmedi';
    if (filtre.durum === 'gecikmis') return o.iso < bugunIso && durum !== 'odendi';
    return true;
  }

  // Ödeme geçmişindeki bir satır filtreye uyuyor mu? Geçmişteki her satır
  // zaten işaretlenmiştir; gecikmiş = ödenmemiş.
  function gecmisUyuyor(g, filtre) {
    if (filtre.q && !norm(g.marka).includes(filtre.q)) return false;
    if (!filtre.durum) return true;
    if (filtre.durum === 'odendi') return !!g.bitti;
    if (filtre.durum === 'odenmedi' || filtre.durum === 'gecikmis') return !g.bitti;
    return true;
  }

  // Kullanıcıdan gelen her metin buradan geçer. Projedeki her dosyada
  // kendi yereli var; takvim de kendi kopyasını taşıyor.
  const esc = s => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  const para = n => Number(n || 0).toLocaleString('tr-TR');

  // Marka eşleştirmesi ve arama harf büyüklüğünden bağımsız olmalı ("Chemex"
  // ile "chemex" aynı). Türkçe küçültme yereli kullanılıyor; "İ"→"i" doğru
  // çevrilsin diye varsayılan yerel yeterli değil.
  const norm = v => String(v == null ? '' : v).trim().toLocaleLowerCase('tr');

  const AYLAR = ['OCAK', 'ŞUBAT', 'MART', 'NİSAN', 'MAYIS', 'HAZİRAN',
    'TEMMUZ', 'AĞUSTOS', 'EYLÜL', 'EKİM', 'KASIM', 'ARALIK'];
  // Gün başlığı cümle içinde geçtiği için ay adı düz yazılır ("27 Ekim 2026").
  const AYLAR_ADI = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
    'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
  const HAFTA = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
  // Gün başlığında tam ad kullanılır: "27 Ekim 2026 · Salı".
  const GUNLER = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'];

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

  // Ödeme satırı. duzenleId bu satırsa normal görünüm yerine yerinde açılan
  // marka + tutar formu basılır. Tutarı sonradan değiştirebilmek önemli:
  // havale eksik ya da geç geldiğinde kayıt gerçeği yansıtsın, yalnız ödendi
  // işareti yeterli olmasın. Kaydedilemeyen (yerel) satırda düzenleme yoktur;
  // orada zaten "tekrar dene" vardır.
  function odemeSatiri(o, duzenleId) {
    if (o.id === duzenleId) {
      return `<li class="plan-satir odeme duzenliyor${o.hata ? ' hata' : ''}">
        <input class="plan-gir" data-plan-duzenle="odeme-marka" type="text" autocomplete="off"
          value="${esc(o.marka || o.metin || '')}" placeholder="Marka / açıklama">
        <input class="plan-gir tutar" data-plan-duzenle="odeme-tutar" type="text" inputmode="decimal"
          autocomplete="off" value="${esc(o.tutar == null ? '' : o.tutar)}" placeholder="Tutar ₺">
        <button class="plan-kaydet" data-act="plan-duzenle-kaydet" data-id="${esc(o.id)}" type="button">kaydet</button>
        <button class="plan-vazgec" data-act="plan-duzenle-kapat" type="button" aria-label="Vazgeç">×</button>
      </li>`;
    }
    return `<li class="plan-satir odeme${o.bitti ? ' bitti' : ''}${o.hata ? ' hata' : ''}">
      <button class="kutu" data-act="plan-isaret" data-id="${esc(o.id)}" type="button"
        aria-label="${o.bitti ? 'Ödenmedi işaretle' : 'Ödendi işaretle'}">${o.bitti ? '✓' : ''}</button>
      <span class="metin">${esc(o.marka || o.metin)}</span>
      <b class="tutar">${para(o.tutar)} ₺</b>
      ${o.hata ? '' : `<button class="duzenle" data-act="plan-duzenle" data-id="${esc(o.id)}" type="button" aria-label="Düzenle">✎</button>`}
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

  // Abonelikten gelen ama henüz işaretlenmemiş ödeme. Gün panelinde de görünür
  // ki ana takvimden işaretlenebilsin; tek bir kayıt yazıldığı için yandaki
  // yaklaşan ödemeler listesiyle aynı durumu paylaşır — ikisi senkron kalır.
  function beklenenSatiri(o) {
    const id = d => `${esc(o.iso)}:${d}:${encodeURIComponent(o.marka)}:${o.tutar}`;
    return `<li class="plan-satir odeme beklenen">
      <span class="metin">${esc(o.marka)} <i class="kaynak">abonelik</i></span>
      <b class="tutar">${para(o.tutar)} ₺</b>
      <div class="plan-durum">
        <button class="d-odendi" type="button" data-act="plan-odeme-durum" data-id="${id('odendi')}">ödendi</button>
        <button class="d-odenmedi" type="button" data-act="plan-odeme-durum" data-id="${id('odenmedi')}">ödenmedi</button>
      </div>
    </li>`;
  }

  // Açık günün paneli. Her bölüm ayrı katlanır; eklenen her şey silinebilir.
  // yeniTur: açık olan satır içi ekleme formu ('madde' | 'odeme' | null).
  // beklenen: o güne abonelikten düşen, henüz işaretlenmemiş ödemeler.
  // duzenleId: düzenlenen ödeme satırının id'si (yoksa null).
  function gunPaneli(iso, maddeler, katli, yeniTur, beklenen, duzenleId) {
    const gunun = maddeler.filter(m => m.gun === iso);
    const isler = gunun.filter(m => m.tur === 'madde').sort((a, b) => (a.sira || 0) - (b.sira || 0));
    const odemeler = gunun.filter(m => m.tur === 'odeme').sort((a, b) => (a.sira || 0) - (b.sira || 0));
    const not = gunun.find(m => m.tur === 'not');
    const k = ad => katli.indexOf(ad) !== -1;

    // Tarih başlığı artık gün sekmesinin üst şeridinde yazılır; burada
    // yinelenmez, yalnız bölümler açılır.
    return `<div class="plan-gun-paneli" data-gun="${esc(iso)}">
      ${bolum('maddeler', 'YAPILACAKLAR', `
        <ul class="plan-liste">${isler.map(maddeSatiri).join('')}</ul>
        ${ekleFormu('madde', iso, yeniTur)}
      `, k('maddeler'))}
      ${bolum('odemeler', 'ÖDEMELER', `
        <ul class="plan-liste">${odemeler.map(o => odemeSatiri(o, duzenleId)).join('')}${(beklenen || []).map(beklenenSatiri).join('')}</ul>
        ${ekleFormu('odeme', iso, yeniTur)}
      `, k('odemeler'))}
      ${bolum('not', 'NOT', `
        <textarea class="plan-not" data-act="plan-not" data-id="${esc(iso)}"
          placeholder="Bu güne dair not…">${esc(not ? not.metin : '')}</textarea>
      `, k('not'))}
    </div>`;
  }

  // Açık güne abonelikten düşen, henüz işaretlenmemiş ödemeler. Böylece ödeme
  // ana takvimden de işaretlenebiliyor; yandaki listeyle aynı kaydı paylaşır.
  function acikGunBeklenen(iso, D, maddeler) {
    if (!iso) return [];
    return yaklasanOdemeler(D, iso, 0, 0).filter(o => odemeDurumu(maddeler, o) === null);
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

    // Hücre yalnız gün numarası değil, o güne dair kısa bir özet de taşır:
    // iş ilerlemesi (rozet), toplam ödeme tutarı ve ilk kaydın metni. Böylece
    // kareye bakınca ne olduğu anlaşılır; detayı görmek için içine girilir.
    const hucre = h => {
      const b = gunBilgi(maddeler, h.iso);
      const acik = s.planAcikGun === h.iso;
      const rozet = b.isToplam ? `<i class="rozet">${b.isBitti}/${b.isToplam}</i>` : '';
      const tutar = b.odemeToplam ? `<i class="h-tutar">${para(b.odemeToplam)} ₺</i>` : '';
      const onizleme = b.onizleme ? `<span class="h-not">${esc(b.onizleme)}</span>` : '';
      const alt = (tutar || onizleme) ? `<span class="hucre-alt">${tutar}${onizleme}</span>` : '';
      const etiket = gunEtiketi(h.iso) + (b.isToplam ? ` · ${b.isBitti}/${b.isToplam} iş` : '')
        + (b.odemeToplam ? ` · ${para(b.odemeToplam)} ₺` : '');
      return `<button class="plan-hucre${h.ayIcinde ? '' : ' disari'}${h.iso === bugun ? ' bugun' : ''}${acik ? ' acik' : ''}"
        data-act="plan-gun" data-id="${h.iso}" type="button" aria-label="${esc(etiket)}">
        <span class="hucre-ust"><span class="gun">${h.gunNo}</span>${rozet}</span>${alt}
      </button>`;
    };

    // Ödeme listeleri marka araması ve durum süzgeciyle daraltılır. Süzgeç
    // boşken tüm liste görünür, yani varsayılan davranış değişmez.
    const filtre = { q: norm(s.planAra), durum: s.planDurum || '' };
    const odemeler = yaklasanOdemeler(D || {}, bugun, 60)
      .filter(o => kalemUyuyor(o, maddeler, filtre, bugun));
    // İşaret düğmesinin taşıdığı bilgi: gün, durum, marka (kodlanmış), tutar.
    // Marka içinde ':' geçebilir; encodeURIComponent bunun için şart.
    const durumId = (o, durum) => `${o.iso}:${durum}:${encodeURIComponent(o.marka)}:${o.tutar}`;
    const odemeSutun = odemeler.length
      ? `<ul class="plan-odeme-liste">${odemeler.map(o => {
          const durum = odemeDurumu(maddeler, o);
          const gecikmis = o.gecmis && !durum;
          const sinif = [o.iptal ? 'iptal' : '', o.gecmis ? 'gecmis' : '', gecikmis ? 'gecikmis' : '', durum || '']
            .filter(Boolean).join(' ');
          // Kutucuk: ödendi → altın ve işaretli, ödenmedi → kırmızı ve çarpılı.
          // Satır da aynı renge boyanır; böylece işaret uzaktan belli olur,
          // yalnız düğmenin değil satırın da işaretlendiği görülür.
          const kutu = `<i class="kutu${durum ? ' ' + durum : ''}" aria-hidden="true">${durum === 'odendi' ? '✓' : durum === 'odenmedi' ? '×' : ''}</i>`;
          return `<li${sinif ? ` class="${sinif}"` : ''}>
            ${kutu}
            <span class="t">${esc(o.iso)}</span>
            <span class="m">${esc(o.marka)}</span>
            <b>${para(o.tutar)} ₺</b>
            ${o.iptal ? '<small>iptal edilmiş</small>' : ''}
            ${gecikmis ? '<small class="gec">gecikmiş — işaretle</small>' : ''}
            <div class="plan-durum">
              <button class="d-odendi${durum === 'odendi' ? ' secili' : ''}" type="button"
                data-act="plan-odeme-durum" data-id="${esc(durumId(o, 'odendi'))}">ödendi</button>
              <button class="d-odenmedi${durum === 'odenmedi' ? ' secili' : ''}" type="button"
                data-act="plan-odeme-durum" data-id="${esc(durumId(o, 'odenmedi'))}">ödenmedi</button>
            </div>
          </li>`;
        }).join('')}</ul>`
      : `<p class="bos">${(filtre.q || filtre.durum)
        ? 'Filtreyle eşleşen bekleyen ödeme yok.'
        : 'Önümüzdeki 60 günde ödemesi gelen abonelik yok.'}</p>`;

    // Geçmiş listesi de aynı süzgeçten geçer; özet satırı filtrelenmiş
    // listenin sayısını yazsın diye özet filtreden sonra hesaplanır.
    const gecmisListe = odemeGecmisi(maddeler).filter(g => gecmisUyuyor(g, filtre));
    const ozet = {
      toplam: gecmisListe.length,
      odendi: gecmisListe.filter(g => g.bitti).length
    };
    ozet.odenmedi = ozet.toplam - ozet.odendi;
    const gecmisSutun = gecmisListe.length
      ? `<div class="plan-gecmis">
        <p class="ozet">${ozet.toplam} kayıt · ${ozet.odendi} ödendi · ${ozet.odenmedi} ödenmedi</p>
        <ul class="plan-gecmis-liste">${gecmisListe.map(g => `
          <li class="${g.bitti ? 'odendi' : 'odenmedi'}">
            <span class="t">${esc(g.gun)}</span>
            <span class="m">${esc(g.marka)}</span>
            <b>${para(g.tutar)} ₺</b>
            <i>${g.bitti ? 'ödendi' : 'ödenmedi'}</i>
          </li>`).join('')}</ul>
      </div>`
      : `<p class="bos">${(filtre.q || filtre.durum)
        ? 'Filtreyle eşleşen işaretli ödeme yok.'
        : 'Henüz işaretlenmiş ödeme yok. Yukarıdaki bir satırı “ödendi” ya da “ödenmedi” diye işaretle.'}</p>`;

    // Özet şeridi: görüntülenen ayın tahsil edilen, bekleyen ve gecikmiş
    // tutarları. Abonelik kaydı bozuk/iptal olsa bile sayı uydurulmaz; iptal
    // edilenler sayıma girmez.
    const ayOzet = aylikOzet(D || {}, maddeler, yil, ay, bugun);
    const ozetSeridi = `<div class="tiles plan-ozet">
      <div class="tile gold"><span>TAHSİL EDİLEN</span><b>${para(ayOzet.tahsil)} ₺</b>
        <small>${ayOzet.tahsilAdet} ödeme · ${AYLAR[ay - 1]} ${yil}</small></div>
      <div class="tile"><span>BEKLEYEN</span><b>${para(ayOzet.bekleyen)} ₺</b>
        <small>${ayOzet.bekleyenAdet} ödeme · bu ay</small></div>
      <div class="tile${ayOzet.gecikmisAdet ? ' danger' : ''}"><span>GECİKMİŞ</span><b>${para(ayOzet.gecikmis)} ₺</b>
        <small>${ayOzet.gecikmisAdet ? ayOzet.gecikmisAdet + ' ödeme · işaretlenmemiş' : 'gecikmiş ödeme yok'}</small></div>
    </div>`;

    // Filtre çubuğu ödeme listelerinin üstünde durur. Arama kutusu odak
    // kaybetmesin diye girdi işleyicisi yeniden çizimden sonra odağı geri verir
    // (bkz. radyo-yonetim.js).
    const filtreCubugu = `<div class="plan-filtre">
      <input class="plan-filtre-gir" data-act="plan-arama" type="text" autocomplete="off"
        placeholder="Marka ara…" value="${esc(s.planAra || '')}">
      ${[['', 'Tümü'], ['odendi', 'Ödendi'], ['odenmedi', 'Ödenmedi'], ['gecikmis', 'Gecikmiş']]
        .map(x => `<button class="plan-filtre-btn${(s.planDurum || '') === x[0] ? ' secili' : ''}"
          data-act="plan-durum" data-id="${x[0]}" type="button">${x[1]}</button>`).join('')}
    </div>`;

    // Tahsilat trendi: son 12 ayın tahsil edilen ve bekleyen tutarları. Ölçek
    // en büyük sütuna göre kurulur, böylece çubuklar birbirine göre okunur.
    const trend = tahsilatTrendi(D || {}, maddeler, bugun, 12);
    const trendSutun = `<div class="plan-trend">
      <p class="ozet">${trend.yil} yılında tahsil edilen: <b>${para(trend.yilToplam)} ₺</b></p>
      <ul class="plan-trend-liste">${trend.aylar.map(t => {
        const yuzde = trend.enBuyuk ? Math.round(t.tahsil / trend.enBuyuk * 100) : 0;
        const bekYuzde = trend.enBuyuk ? Math.round(t.bekleyen / trend.enBuyuk * 100) : 0;
        const simdi = t.onek === bugun.slice(0, 7);
        return `<li${simdi ? ' class="simdi"' : ''}>
          <span class="ay">${esc(t.etiket)}</span>
          <span class="cubuk"><i style="width:${yuzde}%"></i><i class="bek" style="width:${bekYuzde}%"></i></span>
          <b>${para(t.tahsil)} ₺</b>
        </li>`;
      }).join('')}</ul>
    </div>`;

    // İkinci takvim: öğrenciler. Marka takviminin ALTINDA basılır ve kendi
    // ayını taşır. Yan paneldeki ödeme panelleri kahve markalarına aittir;
    // öğrenci işi onlara karışmaz, o yüzden ayrı bir bölüm ve ayrı ay durumu
    // var. Öğrenci okları marka takviminin ayını kaydırmaz.
    // Modül yüklenemediyse sessizce boş bırakmak yerine söylenir.
    const O = (typeof window !== 'undefined' && window.DerinOgrenci) || null;
    const ogrenciTakvim = O
      ? O.ogrenciTakvimi((D && D.ogrenciler) || [], (D && D.ogrenciKayitlari) || [], s,
        { yil: s.ogrenciYil || yil, ay: s.ogrenciAy || ay, bugun: bugun })
      : '<p class="bos">Öğrenci modülü yüklenemedi (ogrenciler.js).</p>';

    // Bir güne girildiğinde ay ızgarası yerine o günün sekmesi açılır: başlıkta
    // geri düğmesi (aya dön) ve gün gün gezinme okları durur. Ay görünümünde ise
    // ızgara basılır — hücrelerin içi artık detay taşır.
    const acikGun = s.planAcikGun || null;
    const govde = acikGun
      ? `<div class="plan-gun-bas">
          <button class="plan-geri" data-act="plan-gun-kapat" type="button">‹ ${esc(AYLAR[ay - 1] + ' ' + yil)}</button>
          <b>${esc(gunEtiketi(acikGun))}</b>
          <span class="plan-gun-kaydir">
            <button data-act="plan-gun-kaydir" data-id="onceki" type="button" aria-label="Önceki gün">‹</button>
            <button data-act="plan-gun-kaydir" data-id="sonraki" type="button" aria-label="Sonraki gün">›</button>
          </span>
        </div>
        ${gunPaneli(acikGun, maddeler, katli, yeniTur(s), acikGunBeklenen(acikGun, D || {}, maddeler), s.planDuzenle || null)}`
      : `<div class="plan-ay-bas">
          <button data-act="plan-ay" data-id="onceki" type="button" aria-label="Önceki ay">‹</button>
          <b>${AYLAR[ay - 1]} ${yil}</b>
          <button data-act="plan-ay" data-id="sonraki" type="button" aria-label="Sonraki ay">›</button>
        </div>
        <div class="plan-hafta">${HAFTA.map(g => `<span>${g}</span>`).join('')}</div>
        <div class="plan-izgara">${aylikIzgara(yil, ay).map(hucre).join('')}</div>`;

    return `<div class="plan-sayfa">
      ${ozetSeridi}
      <div class="plan-sarmal">
      <div class="plan-ana">
        ${govde}
      </div>
      <aside class="plan-yan">
        ${filtreCubugu}
        ${bolum('yaklasan', 'YAKLAŞAN ÖDEMELER', odemeSutun, katli.indexOf('yaklasan') !== -1)}
        ${bolum('gecmis', 'ÖDEME GEÇMİŞİ', gecmisSutun, katli.indexOf('gecmis') !== -1)}
        ${bolum('trend', 'TAHSİLAT TRENDİ (12 AY)', trendSutun, katli.indexOf('trend') !== -1)}
      </aside>
      </div>
      ${ogrenciTakvim}
    </div>`;
  }

  const api = {
    aylikIzgara: aylikIzgara,
    gunOzeti: gunOzeti,
    gunBilgi: gunBilgi,
    gunEtiketi: gunEtiketi,
    gunEkle: gunEkle,
    yaklasanOdemeler: yaklasanOdemeler,
    odemeDurumu: odemeDurumu,
    odemeGecmisi: odemeGecmisi,
    odemeOzeti: odemeOzeti,
    odemeKalemleri: odemeKalemleri,
    aylikOzet: aylikOzet,
    tahsilatTrendi: tahsilatTrendi,
    kalemUyuyor: kalemUyuyor,
    gecmisUyuyor: gecmisUyuyor,
    takvimView: takvimView
  };

  if (typeof window !== 'undefined') window.DerinPlan = api;
  if (typeof module !== 'undefined') module.exports = api;
})();
