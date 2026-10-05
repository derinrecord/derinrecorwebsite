// Derin Record — Plan sayfasındaki İKİNCİ TAKVİM: öğrenci takibi.
//
// Aşama 1: liste (ad, veli, telefon, not) — ekle / düzenle / sil / ara.
// Aşama 2: yoklama — ikinci takvimin gün hücresinden o günün yoklaması.
// Aşama 3: ödeme — öğrenci başına tahsilat satırları (açıklama + tutar).
// Aşama 4: özet — ay özeti, borç/devamsızlık rozetleri ve uyarı süzgeçleri
//           ("kim borçlu, kim aksıyor" tek bakışta).
//
// Bu dosya saf hesap ve HTML üretiminden ibarettir: DOM'a dokunmaz, ağa
// çıkmaz. Böylece node testleriyle doğrudan sınanabiliyor (bkz.
// plan-takvim.js — aynı kalıp).
//
// YER: marka takviminin yanındaki ödeme panelleri kahve markalarına aittir;
// öğrenci işi onlara karışmaz. Öğrenciler Plan sayfasında marka takviminin
// ALTINDA kendi bölümünde durur: solda ay ızgarası, sağında öğrenci listesi
// (ad · veli · telefon) ve ödemeler. Marka panelindeki "Marka ara" süzgeci,
// yaklaşan ödemeler ve tahsilat trendi bu bölümle hiçbir şey paylaşmaz.
//
// Ay BAĞIMSIZDIR: ikinci takvimin ay okları marka takvimini kaydırmaz; yoksa
// "öğrencilerin ekim ayı" marka takvimini de ekime çekerdi. Bu yüzden ay
// durumu ayrı tutulur (state.ogrenciYil / state.ogrenciAy).
//
// Veri plan_maddeleri'nden bağımsızdır (supabase/ogrenciler.sql).
(() => {
  'use strict';

  const esc = v => String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  // Arama harf büyüklüğünden bağımsız olmalı. Türkçe küçültme yereli
  // kullanılıyor; "İ"→"i" doğru çevrilsin diye varsayılan yerel yeterli değil.
  const norm = v => String(v == null ? '' : v).trim().toLocaleLowerCase('tr');

  const para = n => Number(n || 0).toLocaleString('tr-TR');
  const iki = n => (n < 10 ? '0' : '') + n;
  const AYLAR_ADI = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
    'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

  const ayOnek = (yil, ay) => yil + '-' + iki(ay);
  // Ayın gün sayısı: UTC'de bir sonraki ayın 0. günü bu ayın son günüdür.
  const ayGunSayisi = (yil, ay) => new Date(Date.UTC(yil, ay, 0)).getUTCDate();

  const gunKisa = iso => {
    const p = String(iso || '').slice(0, 10).split('-').map(Number);
    if (p.length !== 3 || !p[0] || !p[1] || !p[2]) return String(iso || '');
    return p[2] + ' ' + AYLAR_ADI[p[1] - 1];
  };

  // ---------- Yoklama ----------
  // Tek düğmeyle üç durum arasında dönülür; dördüncü basış işareti kaldırır.
  // Böylece gün şeridinde onlarca düğme yerine tek bir nokta olur ve yanlış
  // işaret tek basışla silinir.
  const KATILIM = [
    { anahtar: 'geldi', kisa: '✓', etiket: 'Geldi' },
    { anahtar: 'gelmedi', kisa: '×', etiket: 'Gelmedi' },
    { anahtar: 'mazeret', kisa: 'M', etiket: 'Mazeret' }
  ];
  const KATILIM_DONGU = ['', 'geldi', 'gelmedi', 'mazeret'];
  const katilimBul = d => KATILIM.find(k => k.anahtar === d) || null;
  const katilimSonraki = d => {
    const i = KATILIM_DONGU.indexOf(String(d || ''));
    return KATILIM_DONGU[(i + 1) % KATILIM_DONGU.length];
  };
  const katilimEtiket = d => (katilimBul(d) || {}).etiket || 'İşaretsiz';
  const katilimKisa = d => (katilimBul(d) || {}).kisa || '';

  // ---------- Kayıt süzgeçleri ----------

  function ogrenciKayitlari(liste, ogrenciId, tur) {
    return (liste || []).filter(k =>
      k.ogrenci_id === ogrenciId && (!tur || k.tur === tur));
  }

  function katilimDurum(liste, ogrenciId, iso) {
    const k = ogrenciKayitlari(liste, ogrenciId, 'katilim')
      .find(x => String(x.gun).slice(0, 10) === iso);
    return k ? k.durum : null;
  }

  function katilimOzeti(liste, ogrenciId, yil, ay) {
    const onek = ayOnek(yil, ay);
    const ayin = ogrenciKayitlari(liste, ogrenciId, 'katilim')
      .filter(x => String(x.gun).slice(0, 7) === onek);
    const say = d => ayin.filter(x => x.durum === d).length;
    return {
      geldi: say('geldi'), gelmedi: say('gelmedi'), mazeret: say('mazeret'),
      toplam: ayin.length
    };
  }

  // Yeni tarih başta: ödemelerde en son yapılan tahsilat ilk görünür.
  function ogrenciOdemeleri(liste, ogrenciId) {
    return ogrenciKayitlari(liste, ogrenciId, 'odeme').slice().sort((a, b) => {
      const x = String(a.gun).slice(0, 10), y = String(b.gun).slice(0, 10);
      return x < y ? 1 : (x > y ? -1 : 0);
    });
  }

  function odemeOzeti(liste, ogrenciId, yil, ay) {
    const onek = ayOnek(yil, ay);
    const ayin = ogrenciOdemeleri(liste, ogrenciId)
      .filter(x => String(x.gun).slice(0, 7) === onek);
    const topla = f => ayin.filter(f).reduce((t, x) => t + Number(x.tutar || 0), 0);
    return { tahsil: topla(x => x.bitti), bekleyen: topla(x => !x.bitti), adet: ayin.length };
  }

  // Açık (ödenmemiş) kayıtların toplamı. Burada ay sınırı YOK: geçen aydan
  // devreden aidat da borçtur, yoksa borç her ay sıfırlanmış gibi görünürdü.
  function borcOzeti(liste, ogrenciId) {
    const acik = ogrenciKayitlari(liste, ogrenciId, 'odeme').filter(k => !k.bitti);
    return {
      tutar: acik.reduce((t, k) => t + Number(k.tutar || 0), 0),
      adet: acik.length
    };
  }

  // Bu eşiği aşan devamsızlık satırda ayrı renkte vurgulanır: stüdyo sahibi
  // "kim aksıyor" sorusunu listeyi tek tek açmadan görsün.
  const DEVAMSIZLIK_ESIK = 3;

  // İki uyarı süzgeci. Sayaçları aramadan bağımsız, tüm listeden gelir; arama
  // alanı doluyken de gerçek toplam okunur.
  const ODAK = [
    { anahtar: 'borc', etiket: 'Borçlular' },
    { anahtar: 'gelmedi', etiket: 'Gelmedi ≥ ' + DEVAMSIZLIK_ESIK }
  ];

  // Bir öğrencinin dikkat gerektiren hâli: ödenmemiş borç (tüm zamanlar) ve
  // takvimin ayındaki devamsızlık. İkisi ayrı ayrı da raporlanır.
  function dikkatOzeti(liste, o, a) {
    const ayar = a || {};
    const id = o && o.id;
    const b = borcOzeti(liste, id);
    const k = katilimOzeti(liste, id, ayar.yil, ayar.ay);
    return { borc: b.tutar, borcAdet: b.adet, gelmedi: k.gelmedi };
  }

  function odakSayilari(liste, kayitListesi, a) {
    const s = { borc: 0, gelmedi: 0 };
    (liste || []).forEach(o => {
      const d = dikkatOzeti(kayitListesi, o, a);
      if (d.borc > 0) s.borc++;
      if (d.gelmedi >= DEVAMSIZLIK_ESIK) s.gelmedi++;
    });
    return s;
  }

  // Bilinmeyen bir anahtar süzgeci sessizce yok sayar: durum eski bir
  // sürümden kalma bir değer taşısa da liste boşalmaz.
  function ogrenciOdakla(liste, kayitListesi, odak, a) {
    const gecerli = ODAK.some(x => x.anahtar === odak) ? odak : null;
    if (!gecerli) return (liste || []).slice();
    return (liste || []).filter(o => {
      const d = dikkatOzeti(kayitListesi, o, a);
      return gecerli === 'borc' ? d.borc > 0 : d.gelmedi >= DEVAMSIZLIK_ESIK;
    });
  }

  // Klasör başlığındaki ay özeti: tüm liste üzerinden, takvimin ayı için.
  function ogrenciToplam(liste, kayitListesi, yil, ay) {
    const t = {
      ogrenci: (liste || []).length,
      geldi: 0, gelmedi: 0, mazeret: 0, tahsil: 0, bekleyen: 0
    };
    (liste || []).forEach(o => {
      const k = katilimOzeti(kayitListesi, o.id, yil, ay);
      t.geldi += k.geldi; t.gelmedi += k.gelmedi; t.mazeret += k.mazeret;
      const od = odemeOzeti(kayitListesi, o.id, yil, ay);
      t.tahsil += od.tahsil; t.bekleyen += od.bekleyen;
    });
    return t;
  }

  // ---------- Liste ----------

  // Liste ad, veli ve telefonda aranır. Süzgeç boşken tüm liste görünür,
  // yani varsayılan davranış değişmez.
  function ogrenciFiltrele(liste, q) {
    const nq = norm(q);
    if (!nq) return (liste || []).slice();
    return (liste || []).filter(o =>
      norm(o.ad).indexOf(nq) !== -1
      || norm(o.veli).indexOf(nq) !== -1
      || norm(o.telefon).indexOf(nq) !== -1);
  }

  // Kaydedilemeyen satır silinmez: metin ekranda durur, yanında tekrar dene
  // çıkar. Sessiz başarısızlık yok — sessiz kayıp da yok (plan-takvim.js'teki
  // hataSatiri ile aynı söz).
  const hataSatiri = o => o.hata
    ? `<button class="plan-tekrar" data-act="ogrenci-tekrar" data-id="${esc(o.id)}"
        type="button">kaydedilemedi — tekrar dene</button>`
    : '';

  function alanlar(o, kip) {
    const k = kip === 'duzenle' ? 'ogrenci-duzenle' : 'ogrenci-gir';
    const v = ad => esc(o && o[ad] ? o[ad] : '');
    return `<input class="plan-gir" data-${k}="ad" type="text" autocomplete="off"
        placeholder="Öğrenci adı" value="${v('ad')}">
      <input class="plan-gir" data-${k}="veli" type="text" autocomplete="off"
        placeholder="Veli" value="${v('veli')}">
      <input class="plan-gir" data-${k}="telefon" type="tel" autocomplete="off"
        placeholder="Telefon" value="${v('telefon')}">
      <input class="plan-gir" data-${k}="notlar" type="text" autocomplete="off"
        placeholder="Not" value="${v('notlar')}">`;
  }

  // Katlanmış satırda ayın özeti: kaç gün geldi, ne kadar tahsil edildi.
  // Detayı açmadan bakınca "bu öğrenci bu ay nasıl gidiyor" görünsün.
  function ozetCipleri(liste, o, a) {
    const k = katilimOzeti(liste, o.id, a.yil, a.ay);
    const od = odemeOzeti(liste, o.id, a.yil, a.ay);
    const d = dikkatOzeti(liste, o, a);
    const p = [];
    if (k.toplam) {
      p.push(`<i class="g">${k.geldi} geldi</i>`);
      // Eşiği aşan devamsızlık "d" ile ayrı renkte: göze çarpsın.
      if (k.gelmedi) {
        p.push(`<i class="y${d.gelmedi >= DEVAMSIZLIK_ESIK ? ' d' : ''}">${k.gelmedi} gelmedi</i>`);
      }
      if (k.mazeret) p.push(`<i class="m">${k.mazeret} mazeret</i>`);
    }
    if (od.tahsil) p.push(`<i class="g">${para(od.tahsil)} ₺ ödendi</i>`);
    if (od.bekleyen) p.push(`<i class="y">${para(od.bekleyen)} ₺ bekliyor</i>`);
    // "Bu ay bekleyen" ile "geçmişten devreden borç" ayrı yazılır; aynı
    // tutarı iki kez göstermemek için ayın bekleyeni düşülür.
    const devir = d.borc - od.bekleyen;
    if (devir > 0) p.push(`<i class="b">${para(devir)} ₺ devir</i>`);
    return p.length ? `<span class="ogr-cip">${p.join('')}</span>` : '';
  }

  // ---------- İkinci takvim: öğrenci ay ızgarası ve gün yoklaması ----------

  const HAFTA = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
  const isoYaz = d => d.getUTCFullYear() + '-' + iki(d.getUTCMonth() + 1) + '-' + iki(d.getUTCDate());

  // Marka takvimiyle aynı ızgara kuralı: 42 hücre, pazartesi başlangıcı, ay
  // dışındaki kareler komşu ayın gerçek günleriyle dolu. Böylece iki takvim
  // aynı ritimde okunuyor; ay kısalınca ekran zıplamaz.
  function aylikOgrenciIzgara(yil, ay) {
    const ilk = new Date(Date.UTC(yil, ay - 1, 1));
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

  // Bir günün yoklaması LİSTEDEKİ öğrenciler üzerinden sayılır. Kayıtlara
  // doğrudan bakılsaydı listede olmayan bir öğrencinin (silinmiş ya da başka
  // bir listeye ait) kaydı sayıya girerdi: 2 öğrencili listede "3/2 geldi"
  // gibi imkânsız bir rozet çıkardı. Öğrenci başına durum katilimDurum ile
  // okunur; gün başına tek kayıt olduğu için sayı ile kayıt birbirini tutar.
  function gunKatilim(liste, kayitListesi, iso) {
    const kimler = (liste || []).map(o => o.id);
    const say = d => kimler.filter(id => katilimDurum(kayitListesi, id, iso) === d).length;
    return { geldi: say('geldi'), gelmedi: say('gelmedi'), mazeret: say('mazeret') };
  }

  // Gün başlığı: "5 Ekim 2026 · Pazartesi". Elle biçimlendiriliyor; tarayıcı
  // yereline bırakılsaydı sunucudaki testle ekrandaki metin ayrışırdı.
  function gunUzun(iso) {
    const p = String(iso || '').slice(0, 10).split('-').map(Number);
    if (p.length !== 3 || !p[0] || !p[1] || !p[2]) return String(iso || '');
    const gun = new Date(Date.UTC(p[0], p[1] - 1, p[2]));
    return p[2] + ' ' + AYLAR_ADI[p[1] - 1] + ' ' + p[0] + ' · ' + HAFTA[(gun.getUTCDay() + 6) % 7];
  }

  // Izgara hücresi: gün numarası, o gün gelenlerin sayısı ve gelmeyen/mazeret
  // işaretleri. Üç renk durumu var: tam (herkes geldi), eksik (gelmeyen var),
  // işaretsiz (henüz yoklama yapılmadı).
  function ogrHucre(h, liste, kayitListesi, s, a) {
    const toplam = (liste || []).length;
    const k = gunKatilim(liste, kayitListesi, h.iso);
    const isaretli = k.geldi + k.gelmedi + k.mazeret;
    const tam = toplam > 0 && k.geldi === toplam && k.gelmedi === 0 && k.mazeret === 0;
    const eksik = k.gelmedi > 0;
    const acik = (s || {}).ogrenciGun === h.iso;
    const sinif = ['ogr-hucre', h.ayIcinde ? '' : 'disari', h.iso === a.bugun ? 'bugun' : '',
      tam ? 'tam' : '', eksik ? 'eksik' : '', isaretli ? '' : 'isaretsiz', acik ? 'acik' : '']
      .filter(Boolean).join(' ');
    const rozet = isaretli ? `<i class="rozet">${k.geldi}/${toplam}</i>` : '';
    const alt = isaretli
      ? `<span class="hucre-alt">${k.gelmedi ? `<i class="y">${k.gelmedi}×</i>` : ''}${k.mazeret ? `<i class="m">${k.mazeret}M</i>` : ''}</span>`
      : '';
    const etiket = gunUzun(h.iso)
      + (isaretli ? ` · ${k.geldi}/${toplam} geldi` : ' · yoklama yapılmadı')
      + (k.gelmedi ? ` · ${k.gelmedi} gelmedi` : '') + (k.mazeret ? ` · ${k.mazeret} mazeret` : '');
    return `<button class="${sinif}" data-act="ogrenci-gun" data-id="${h.iso}" type="button"
      aria-label="${esc(etiket)}" aria-pressed="${acik ? 'true' : 'false'}">
      <span class="hucre-ust"><span class="gun">${h.gunNo}</span>${rozet}</span>${alt}
    </button>`;
  }

  // Gün yoklaması: seçilen gün için TÜM öğrenciler tek listede, her satırda tek
  // düğme. Sınıfı toplu işaretlemek için gün içi gezinme gerekmez — yoklama
  // gün bazında yapılan bir iş ve ekran da o günün tamamını gösterir.
  // Arama süzgeci burada da geçerli: kalabalık listede öğrenci tek tek bulunur.
  function gunYoklama(iso, liste, kayitListesi, s, a) {
    const tam = liste || [];
    const k = gunKatilim(tam, kayitListesi, iso);
    const isaretli = k.geldi + k.gelmedi + k.mazeret;
    const satirlar = ogrenciFiltrele(tam, (s || {}).ogrenciAra).map(o => {
      const durum = katilimDurum(kayitListesi, o.id, iso);
      const alt = [o.veli, o.telefon].filter(x => x && String(x).trim()).join(' · ');
      return `<li class="ogr-yoklama-satir">
        <span class="metin"><b>${esc(o.ad || '—')}</b>${alt ? ` <small>${esc(alt)}</small>` : ''}</span>
        <button class="ogr-durum ${esc(durum || 'yok')}" data-act="ogrenci-katilim"
          data-id="${esc(o.id)}:${iso}:${esc(durum || '')}" type="button"
          title="${esc(katilimEtiket(durum))} — bas: geldi → gelmedi → mazeret → işaretsiz">${esc(katilimEtiket(durum))}</button>
      </li>`;
    });
    const govde = satirlar.length
      ? `<ul class="ogr-yoklama-liste">${satirlar.join('')}</ul>`
      : `<p class="bos">${tam.length ? 'Aramayla eşleşen öğrenci yok.' : 'Henüz öğrenci yok. Listeden ekle.'}</p>`;
    return `<div class="ogr-yoklama">
      <div class="ogr-gun-bas">
        <b>${esc(gunUzun(iso))}</b>
        <span class="ogr-yoklama-ozet">${isaretli ? `${isaretli}/${tam.length} işaretli` : 'Henüz işaret yok'}${k.gelmedi ? ` · <b class="y">${k.gelmedi} gelmedi</b>` : ''}${k.mazeret ? ` · <b class="m">${k.mazeret} mazeret</b>` : ''}</span>
        <button class="plan-vazgec" data-act="ogrenci-gun-kapat" type="button" aria-label="Gün yoklamasını kapat">×</button>
      </div>
      ${govde}
      <p class="ogr-ipucu">Düğmeye bas: geldi → gelmedi → mazeret → işaretsiz</p>
    </div>`;
  }

  // Ödeme satırı. duzenleId bu satırsa normal görünüm yerine yerinde açılan
  // açıklama + tutar formu basılır (plan-takvim.js'teki ödeme satırıyla aynı
  // mantık: tutarı sonradan düzeltmek gerekebilir).
  function odemeSatiri(k, duzenleId) {
    if (k.id === duzenleId) {
      return `<li class="plan-satir ogr-odeme duzenliyor">
        <input class="plan-gir" data-ogrenci-odeme-duzenle="metin" type="text" autocomplete="off"
          placeholder="Açıklama" value="${esc(k.metin || '')}">
        <input class="plan-gir tutar" data-ogrenci-odeme-duzenle="tutar" type="text" inputmode="decimal"
          autocomplete="off" value="${esc(k.tutar == null ? '' : k.tutar)}" placeholder="Tutar ₺">
        <button class="plan-kaydet" data-act="ogrenci-odeme-duzenle-kaydet" data-id="${esc(k.id)}" type="button">kaydet</button>
        <button class="plan-vazgec" data-act="ogrenci-odeme-duzenle-kapat" type="button" aria-label="Vazgeç">×</button>
      </li>`;
    }
    return `<li class="plan-satir ogr-odeme${k.bitti ? ' bitti' : ''}">
      <button class="kutu" data-act="ogrenci-odeme-isaret" data-id="${esc(k.id)}" type="button"
        aria-label="${k.bitti ? 'Ödenmedi işaretle' : 'Ödendi işaretle'}">${k.bitti ? '✓' : ''}</button>
      <span class="metin">${esc(k.metin || 'Ödeme')} <small>${esc(gunKisa(k.gun))}</small></span>
      <b class="tutar">${para(k.tutar)} ₺</b>
      <button class="duzenle" data-act="ogrenci-odeme-duzenle" data-id="${esc(k.id)}" type="button" aria-label="Düzenle">✎</button>
      <button class="sil" data-act="ogrenci-odeme-sil" data-id="${esc(k.id)}" type="button" aria-label="Sil">×</button>
    </li>`;
  }

  // Öğrenci detayı: ayın yoklama özeti ve ödeme listesi. Yoklama işareti
  // burada değil ikinci takvimin gün hücresinde atılır; burada yalnız "bu ay
  // nasıl gitti" özeti durur, yoksa aynı iş iki yerden yapılırdı.
  function ogrenciDetay(o, liste, s, a) {
    const odemeler = ogrenciOdemeleri(liste, o.id);
    const oz = odemeOzeti(liste, o.id, a.yil, a.ay);
    const yok = katilimOzeti(liste, o.id, a.yil, a.ay);
    const borc = borcOzeti(liste, o.id);
    const acikBorc = borc.tutar
      ? `<p class="ogr-acik-borc">Toplam açık borç: <b>${para(borc.tutar)} ₺</b>${borc.adet > 1 ? ` · ${borc.adet} kayıt` : ''}</p>`
      : '';
    const form = s.ogrenciOdemeYeni === o.id
      ? `<div class="plan-yeni ogr-odeme-yeni">
          <input class="plan-gir" data-ogrenci-odeme-gir="metin" type="text" autocomplete="off"
            placeholder="Açıklama (ör. Ekim aidatı)">
          <input class="plan-gir tutar" data-ogrenci-odeme-gir="tutar" type="text" inputmode="decimal"
            autocomplete="off" placeholder="Tutar ₺">
          <button class="plan-kaydet" data-act="ogrenci-odeme-kaydet" data-id="${esc(o.id)}" type="button">ekle</button>
          <button class="plan-vazgec" data-act="ogrenci-odeme-kapat" type="button" aria-label="Vazgeç">×</button>
        </div>`
      : `<button class="plan-ekle" data-act="ogrenci-odeme-yeni" data-id="${esc(o.id)}" type="button">+ ödeme ekle</button>`;
    const govde = odemeler.length
      ? `<ul class="plan-liste ogr-odeme-liste">${odemeler.map(k => odemeSatiri(k, s.ogrenciOdemeDuzenle || null)).join('')}</ul>`
      : '<p class="bos">Bu öğrenci için henüz ödeme kaydı yok.</p>';
    return `<div class="ogr-detay">
      <div class="ogr-bolum">
        <h4>YOKLAMA</h4>
        <p class="ogr-ozet">${esc(AYLAR_ADI[a.ay - 1] + ' ' + a.yil)} ·
          <b class="g">${yok.geldi} geldi</b>${yok.gelmedi ? ` · <b class="y">${yok.gelmedi} gelmedi</b>` : ''}${yok.mazeret ? ` · <b class="m">${yok.mazeret} mazeret</b>` : ''}</p>
        <p class="ogr-ipucu">Gün gün yoklama öğrenci takviminden işaretlenir.</p>
      </div>
      <div class="ogr-bolum">
        <h4>ÖDEMELER</h4>
        <p class="ogr-ozet">${esc(AYLAR_ADI[a.ay - 1] + ' ' + a.yil)} ·
          <b class="g">${para(oz.tahsil)} ₺ tahsil</b>${oz.bekleyen ? ` · <b class="y">${para(oz.bekleyen)} ₺ bekliyor</b>` : ''}</p>
        ${acikBorc}
        ${form}
        ${govde}
      </div>
    </div>`;
  }

  // Öğrenci satırı (listenin tek satırı). duzenleId bu satırsa normal görünüm
  // yerine yerinde açılan form basılır. Kaydedilemeyen (yerel) satırda
  // düzenleme ve detay yoktur:
  // gerçek id'si olmadığı için yoklama/ödeme yanlış satıra yazardı; orada
  // zaten "tekrar dene" vardır.
  function ogrenciSatiri(o, s, kayitListesi, a) {
    const durum = s || {};
    const liste = kayitListesi || [];
    const ayar = a || {};
    if (o.id === durum.ogrenciDuzenle) {
      return `<li class="plan-satir ogrenci duzenliyor${o.hata ? ' hata' : ''}">
        ${alanlar(o, 'duzenle')}
        <button class="plan-kaydet" data-act="ogrenci-duzenle-kaydet" data-id="${esc(o.id)}" type="button">kaydet</button>
        <button class="plan-vazgec" data-act="ogrenci-duzenle-kapat" type="button" aria-label="Vazgeç">×</button>
      </li>`;
    }
    const yerel = !!o.hata || String(o.id).indexOf('yerel-') === 0;
    const acik = durum.ogrenciAcik === o.id;
    const alt = [o.veli, o.telefon].filter(x => x && String(x).trim()).join(' · ');
    const acDugme = yerel ? '' : `<button class="ogr-ac" data-act="ogrenci-detay" data-id="${esc(o.id)}"
      type="button" aria-expanded="${acik ? 'true' : 'false'}"
      aria-label="${acik ? 'Ödeme listesini ve ay özetini kapat' : 'Ödeme listesi ve ay özeti'}">${acik ? '▾' : '▸'}</button>`;
    return `<li class="plan-satir ogrenci${acik ? ' acik' : ''}${o.hata ? ' hata' : ''}">
      ${acDugme}
      <span class="metin"><b>${esc(o.ad || '—')}</b>${alt ? ` <small>${esc(alt)}</small>` : ''}${o.notlar && String(o.notlar).trim() ? `<br><small>${esc(o.notlar)}</small>` : ''}${acik ? '' : ozetCipleri(liste, o, ayar)}</span>
      ${yerel ? '' : `<button class="duzenle" data-act="ogrenci-duzenle" data-id="${esc(o.id)}" type="button" aria-label="Düzenle">✎</button>`}
      <button class="sil" data-act="ogrenci-sil" data-id="${esc(o.id)}" type="button" aria-label="Sil">×</button>
      ${acik ? ogrenciDetay(o, liste, durum, ayar) : ''}
      ${hataSatiri(o)}
    </li>`;
  }

  // Klasör başlığı özeti: kaç öğrenci, bu ay ne kadar tahsil edildi, ne kadar
  // bekliyor, kaç gün gelinmedi. Liste boşken hiç basılmaz.
  function toplamSatiri(liste, kayitListesi, a) {
    if (!(liste || []).length) return '';
    const t = ogrenciToplam(liste, kayitListesi, a.yil, a.ay);
    const p = [t.ogrenci + ' öğrenci'];
    if (t.tahsil) p.push(`<b class="g">${para(t.tahsil)} ₺ tahsil</b>`);
    if (t.bekleyen) p.push(`<b class="y">${para(t.bekleyen)} ₺ bekleyen</b>`);
    if (t.gelmedi) p.push(`<b class="y">${t.gelmedi} gelmedi</b>`);
    if (t.mazeret) p.push(`<b class="m">${t.mazeret} mazeret</b>`);
    return `<p class="ogr-toplam">${esc(AYLAR_ADI[a.ay - 1] + ' ' + a.yil)} · ${p.join(' · ')}</p>`;
  }

  // Uyarı süzgeçleri: "Tümü / Borçlular / Gelmedi ≥ eşik". Sayılar rozetin
  // yanında durur; tıklanınca liste o öğrencilere iner.
  function odakCubugu(liste, kayitListesi, s, a) {
    if (!(liste || []).length) return '';
    const say = odakSayilari(liste, kayitListesi, a);
    const secili = (s || {}).ogrenciOdak || '';
    const dugme = (anahtar, etiket, n) => {
      const sec = secili === anahtar;
      return `<button class="ogr-odak${sec ? ' secili' : ''}${n ? '' : ' bos'}"
        data-act="ogrenci-odak" data-id="${esc(anahtar)}" type="button"
        aria-pressed="${sec ? 'true' : 'false'}">${esc(etiket)} <b>${n}</b></button>`;
    };
    return `<div class="ogr-suzgec">${dugme('', 'Tümü', (liste || []).length)}
      ${ODAK.map(o => dugme(o.anahtar, o.etiket, say[o.anahtar] || 0)).join('')}</div>`;
  }

  // İkinci takvimin tamamı: başlık ve ay okları, ay ızgarası, seçili günün
  // yoklaması ve sağdaki öğrenci listesi. Plan sayfasında marka takviminin
  // ALTINA basılır; marka panelleriyle ortak bir parçası yoktur.
  //   s: panel durumu (ogrenciYil / ogrenciAy / ogrenciGun / ogrenciOdak /
  //      ogrenciAra / ogrenciYeni / ogrenciDuzenle / ogrenciAcik / ödeme
  //      formları)
  //   a: ikinci takvimin ayı ve bugünü — { yil, ay, bugun }
  function ogrenciTakvimi(liste, kayitListesi, s, a) {
    const durum = s || {};
    const ayar = a || {};
    const tam = liste || [];
    const gun = durum.ogrenciGun && String(durum.ogrenciGun).slice(0, 10);
    const hucreler = aylikOgrenciIzgara(ayar.yil, ayar.ay)
      .map(h => ogrHucre(h, tam, kayitListesi, durum, ayar)).join('');
    return `<section class="ogr-takvim">
      <div class="ogr-takvim-bas">
        <h3>ÖĞRENCİLER</h3>
        <span class="ogr-takvim-ay">
          <button data-act="ogrenci-ay" data-id="onceki" type="button" aria-label="Önceki ay">‹</button>
          <b>${esc(AYLAR_ADI[ayar.ay - 1] + ' ' + ayar.yil)}</b>
          <button data-act="ogrenci-ay" data-id="sonraki" type="button" aria-label="Sonraki ay">›</button>
        </span>
        <p class="ogr-ipucu">Marka takviminden bağımsız aydır.</p>
      </div>
      <div class="ogr-takvim-sarmal">
        <div class="ogr-takvim-ana">
          <div class="plan-hafta">${HAFTA.map(g => `<span>${g}</span>`).join('')}</div>
          <div class="ogr-izgara">${hucreler}</div>
          ${gun ? gunYoklama(gun, tam, kayitListesi, durum, ayar) : ''}
        </div>
        <aside class="ogr-takvim-yan">${ogrenciListesi(tam, kayitListesi, durum, ayar)}</aside>
      </div>
    </section>`;
  }

  // Sağdaki öğrenci listesi: arama, ay özeti, uyarı süzgeçleri, ekleme formu
  // ve satırlar (ad · veli · telefon, detayda ödemeler).
  function ogrenciListesi(liste, kayitListesi, s, a) {
    const durum = s || {};
    const ayar = a || {};
    const tam = liste || [];
    const satirlar = ogrenciOdakla(ogrenciFiltrele(tam, durum.ogrenciAra), kayitListesi, durum.ogrenciOdak, ayar);
    const ekle = durum.ogrenciYeni
      ? `<div class="plan-yeni ogrenci-yeni">
          ${alanlar(null, 'ekle')}
          <button class="plan-kaydet" data-act="ogrenci-kaydet" type="button">ekle</button>
          <button class="plan-vazgec" data-act="ogrenci-yeni-kapat" type="button" aria-label="Vazgeç">×</button>
        </div>`
      : `<button class="plan-ekle" data-act="ogrenci-yeni" type="button">+ öğrenci ekle</button>`;
    const govde = satirlar.length
      ? `<ul class="plan-liste ogrenci-liste">${satirlar.map(o => ogrenciSatiri(o, durum, kayitListesi, ayar)).join('')}</ul>`
      : `<p class="bos">${durum.ogrenciOdak ? 'Bu süzgeçte öğrenci yok.'
        : (durum.ogrenciAra ? 'Aramayla eşleşen öğrenci yok.' : 'Henüz öğrenci yok. Yukarıdan ekle.')}</p>`;
    return `<div class="ogrenci-klasor">
      <div class="plan-filtre">
        <input class="plan-filtre-gir" data-act="ogrenci-ara" type="text" autocomplete="off"
          placeholder="Öğrenci ara…" value="${esc(durum.ogrenciAra || '')}">
      </div>
      ${toplamSatiri(tam, kayitListesi, ayar)}
      ${odakCubugu(tam, kayitListesi, durum, ayar)}
      ${ekle}
      ${govde}
    </div>`;
  }

  const api = {
    KATILIM: KATILIM,
    katilimSonraki: katilimSonraki,
    katilimEtiket: katilimEtiket,
    katilimKisa: katilimKisa,
    ayGunSayisi: ayGunSayisi,
    gunKisa: gunKisa,
    ogrenciKayitlari: ogrenciKayitlari,
    katilimDurum: katilimDurum,
    katilimOzeti: katilimOzeti,
    ogrenciOdemeleri: ogrenciOdemeleri,
    odemeOzeti: odemeOzeti,
    borcOzeti: borcOzeti,
    dikkatOzeti: dikkatOzeti,
    odakSayilari: odakSayilari,
    ogrenciOdakla: ogrenciOdakla,
    ogrenciToplam: ogrenciToplam,
    DEVAMSIZLIK_ESIK: DEVAMSIZLIK_ESIK,
    ODAK: ODAK,
    toplamSatiri: toplamSatiri,
    odakCubugu: odakCubugu,
    ogrenciFiltrele: ogrenciFiltrele,
    gunKatilim: gunKatilim,
    gunUzun: gunUzun,
    aylikOgrenciIzgara: aylikOgrenciIzgara,
    ogrHucre: ogrHucre,
    gunYoklama: gunYoklama,
    ogrenciTakvimi: ogrenciTakvimi,
    ogrenciListesi: ogrenciListesi,
    ogrenciDetay: ogrenciDetay,
    odemeSatiri: odemeSatiri,
    ogrenciSatiri: ogrenciSatiri,
    HAFTA: HAFTA,
    AYLAR: AYLAR_ADI
  };

  if (typeof window !== 'undefined') window.DerinOgrenci = api;
  if (typeof module !== 'undefined') module.exports = api;
})();
