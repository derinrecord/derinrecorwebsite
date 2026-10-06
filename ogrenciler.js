// Derin Record — Plan sayfasındaki İKİNCİ TAKVİM: öğrenci takibi.
//
// Aşama 1: liste (ad, veli, telefon, not) — ekle / düzenle / sil / ara.
// Aşama 2: yoklama — ikinci takvimin gün hücresinden o günün yoklaması.
// Aşama 3: ödeme — öğrenci başına tahsilat satırları (açıklama + tutar).
// Aşama 4: özet — ay özeti, borç/devamsızlık rozetleri ve uyarı süzgeçleri
//           ("kim borçlu, kim aksıyor" tek bakışta).
// Aşama 5: aidat — haftalık gün sayısı ve aylık tutar öğrencide durur. Gün
//           sayısı yazılınca tutar tarifeden dolar (2/3 gün) ama elle değiş-
//           tirilebilir. "<Ay> aidatlarını oluştur" tek düğmeyle görünen ayın
//           kayıtlarını açar, kaydı olanı atlar.
//
// Bu dosya saf hesap ve HTML üretiminden ibarettir: DOM'a dokunmaz, ağa
// çıkmaz. Böylece node testleriyle doğrudan sınanabiliyor (bkz.
// plan-takvim.js — aynı kalıp).
//
// YER: Plan bölümünün İKİNCİ sayfası — panel menüsünde "Takvim"in altında
// kendi satırı vardır (Plan → Öğrenciler). Marka takvimi ve kahve markası
// ödemeleri ayrı sayfada kalır; öğrenci işi onlarla aynı ekranı paylaşmaz.
// Sayfada solda ay ızgarası, sağında öğrenci listesi (ad · veli · telefon)
// ve o öğrencinin ödemeleri durur.
//
// Ay BAĞIMSIZDIR: bu sayfanın ay okları marka takviminin ayını kaydırmaz.
// Ay durumu ayrı tutulur (state.ogrenciYil / state.ogrenciAy); sayfa ilk
// açıldığında içinde bulunulan ay gösterilir.
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

  // Başlama tarihi satırda gün.ay.yıl olarak yazılır (12.10.2026). Ay adıyla
  // yazılsaydı ekini tahmin etmek gerekirdi ("Ekim'den" ama "Ocak'tan");
  // sayı biçimi hem kısa hem ek istemiyor.
  const tarihKisa = iso => {
    const p = String(iso == null ? '' : iso).slice(0, 10).split('-');
    if (p.length !== 3 || !p[0] || !p[1] || !p[2]) return '';
    return p[2] + '.' + p[1] + '.' + p[0];
  };

  // Form alanına tarih değeri: yalnız YYYY-AA-GG yazılır. Veritabanındaki
  // date kolonu bu biçimde döner; başka bir şey gelirse (elle doldurulmuş
  // satır, eski kayıt) alan boş kalır — tarih alanına geçersiz metin yazmak
  // tarayıcıda sessizce silinirdi.
  const tarihDeger = v => {
    const s = String(v == null ? '' : v).slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : '';
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
    return {
      tahsil: topla(x => x.bitti), bekleyen: topla(x => !x.bitti), adet: ayin.length,
      // Elden alınan kısmı ayrı toplanır: "bu ay ne kadar nakit geçti elime"
      // sorusu tahsil toplamından çıkarılamaz, çünkü havale de tahsildir.
      elden: topla(x => x.bitti && !!x.elden)
    };
  }

  // Elden işaretinin tek kuralı: nakit para ele geçtiği anda tahsilat hem
  // "alındı" hem "elden" olur. Bu yüzden işareti açmak ÖDENMİŞLİĞİ de yazar —
  // kullanıcıdan iki ayrı tıklama istemek "parayı aldım ama ödenmiş
  // görünmüyor" hâlini üretirdi.
  //
  // İşareti kaldırmak yalnız "elden" bilgisini siler, tahsilatı borca
  // çevirmez: yanlışlıkla basılmış bir işareti geri almak, alınmış parayı yok
  // saymak olmamalı.
  function eldenCevir(k) {
    if (k && k.elden) return { elden: false };
    return { elden: true, bitti: true };
  }

  // Kaydın günü ile paranın ele geçtiği gün ayrı şeyler: aidat kaydı "1
  // Ekim aidatı" diye ayın başına düşer ama para 14 Ekim'de gelebilir. Bu
  // yüzden ödeme günü ayrı tutulur; kaydın günü aidatın AYINI söylemeye devam
  // eder (gelir özeti ve aidat kontrolü ona bakar).
  //
  // Ödendi işareti konurken gün boşsa bugün yazılır: parayı aldığın gün ayrıca
  // sorulmasın. Bir kez yazılmış günün üstüne yazılmaz — kullanıcı 14 Ekim'i
  // elle girmişse işareti kaldırıp yeniden koymak onu bugüne çevirmemeli.
  function odemeGunu(k, bugun) {
    if (!k || k.odeme_gunu) return {};
    const s = String(bugun == null ? '' : bugun).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return {};
    return { odeme_gunu: s };
  }

  // Ödeme günü satırda yalnız kaydın gününden FARKLIYSA yazılır: aynı günü iki
  // kez okumanın anlamı yok.
  const odemeGunuNotu = k => {
    const g = String((k && k.odeme_gunu) || '').slice(0, 10);
    if (!g || g === String((k && k.gun) || '').slice(0, 10)) return '';
    return ' · ödendi ' + gunKisa(g);
  };

  // Elden düğmesi işaretsizken de basılır durumda durur: yalnız işaretliyken
  // görünseydi özellik hiç bulunamazdı. data-act panelde karşılanır.
  function eldenDugmesi(k) {
    return `<button class="ogr-elden${k.elden ? ' secili' : ''}" data-act="ogrenci-odeme-elden"
        data-id="${esc(k.id)}" type="button" aria-pressed="${k.elden ? 'true' : 'false'}"
        title="${k.elden ? 'Elden alındı — işareti kaldır' : 'Elden alındı olarak işaretle'} (ödendi sayılır)">elden</button>`;
  }

  // En son ÖDENMİŞ ay — ay sınırı yok. odemeOzeti yalnız görünen aya bakar;
  // ekim ayına bakan yönetici eylülde ödeyen öğrenciyi "hiç ödememiş" gibi
  // görüyordu, satır çipi o boşluğu kapatır.
  // ogrenciOdemeleri yeni tarih başta sıralar: ilk ödenmiş kayıt en sonuncu.
  // Aynı ayda birden çok tahsilat varsa (aidat + ek ücret) tutar toplanır ki
  // çip tek kaydı gösterip yanıltmasın.
  function sonOdeme(liste, ogrenciId) {
    const odemeler = ogrenciOdemeleri(liste, ogrenciId);
    const son = odemeler.find(x => x.bitti);
    if (!son) return null;
    const ay = String(son.gun).slice(0, 7);
    const ayniAy = odemeler.filter(x => x.bitti && String(x.gun).slice(0, 7) === ay);
    return {
      ay: ay, gun: son.gun, adet: ayniAy.length,
      tutar: ayniAy.reduce((t, x) => t + Number(x.tutar || 0), 0),
      // Ayın TAMAMI elden ödendiyse çip "elden" der; bir kısmı havaleyle
      // geldiyse sessiz kalır. "Kısmen elden" yazmak satırda yanıltıcı olurdu:
      // yönetici çipe bakıp "hepsi nakit" sanmamalı.
      elden: ayniAy.length > 0 && ayniAy.every(x => !!x.elden)
    };
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

  // ---------- Aylık aidat oluşturma ----------

  // Bu ayın aidat kayıtları: tutarı elle yazılmış, aktif her öğrenci için bir
  // "ödemeler" satırı üretir. Tarife yok — tutar öğrencide yazılı olduğu gibi
  // alınır, çünkü haftada 2 gün gelenle 3 gün gelenin fiyatı ayrı.
  //
  // Çift kayıt koruması: o ay için zaten bir ödeme kaydı düşülmüşse (elle
  // girilmiş bir tahsilat da olabilir) öğrenci atlanır. Düğmeye iki kez basmak
  // bu yüzden ikinci kez kayıt açmaz; atlananlar ayrıca sayılır ki ekran
  // "neden 5 değil 3 kayıt açıldı" sorusunu cevaplayabilsin.
  function aylikAidatlar(liste, kayitListesi, a) {
    const ayar = a || {};
    const bos = { kayitlar: [], atlanan: 0, toplam: 0 };
    if (!ayar.yil || !ayar.ay) return bos;
    const onek = ayOnek(ayar.yil, ayar.ay);
    const kayitlar = [];
    let atlanan = 0;
    (liste || []).forEach(o => {
      if (!o || !o.id || o.aktif === false) return;
      const tutar = Number(o.aylik_tutar || 0);
      if (!(tutar > 0)) return;
      const varMi = ogrenciKayitlari(kayitListesi, o.id, 'odeme')
        .some(k => String(k.gun).slice(0, 7) === onek);
      if (varMi) { atlanan++; return; }
      kayitlar.push({
        ogrenci_id: o.id, tur: 'odeme', gun: onek + '-01',
        metin: AYLAR_ADI[ayar.ay - 1] + ' aidatı', tutar: tutar, bitti: false
      });
    });
    return {
      kayitlar: kayitlar, atlanan: atlanan,
      toplam: kayitlar.reduce((t, k) => t + k.tutar, 0)
    };
  }

  // ---------- Gecikme ----------

  // İki gün arasındaki fark, takvim günü olarak. İki tarih de YYYY-AA-GG
  // geldiği için UTC gece yarısına sabitlenip gün farkı alınır; yaz saati
  // kayması sonucu bir gün kaydırmasın.
  const gunFarki = (bas, son) => {
    const a = Date.parse(String(bas == null ? '' : bas).slice(0, 10) + 'T00:00:00Z');
    const b = Date.parse(String(son == null ? '' : son).slice(0, 10) + 'T00:00:00Z');
    if (!isFinite(a) || !isFinite(b)) return 0;
    return Math.round((b - a) / 86400000);
  };

  // Gecikme: kaydın günü ("1 Ekim aidatı") ile paranın geldiği gün arasındaki
  // fark. Ay, KAYDIN ayına göre sayılır — gelir şeridiyle aynı ölçü, yoksa aynı
  // tahsilat bir şeritte Ekim'de, diğerinde Kasım'da görünürdü. Yalnız ödenmiş
  // kayıtlar gecikir: parası gelmemiş bir satır "geç geldi" sayılamaz.
  // Gün farkı sıfır ya da eksiyse (aynı gün, erken ödeme) gecikme değildir.
  function gecikmeOzeti(liste, kayitListesi, a) {
    const ayar = a || {};
    const bos = { adet: 0, ortalama: 0, toplam: 0, en: null };
    if (!ayar.yil || !ayar.ay) return bos;
    const onek = ayOnek(ayar.yil, ayar.ay);
    const adlar = {};
    (liste || []).forEach(o => { adlar[o.id] = o.ad || ''; });
    const gec = [];
    (kayitListesi || []).forEach(k => {
      if (!k || k.tur !== 'odeme' || !k.bitti || k.odeme_gunu == null) return;
      if (String(k.gun).slice(0, 7) !== onek) return;
      const fark = gunFarki(k.gun, k.odeme_gunu);
      if (fark <= 0) return;
      gec.push({ id: k.ogrenci_id, ad: adlar[k.ogrenci_id] || '', gun: fark });
    });
    if (!gec.length) return bos;
    const toplam = gec.reduce((t, x) => t + x.gun, 0);
    const en = gec.slice().sort((x, y) => y.gun - x.gun)[0];
    return {
      adet: gec.length, toplam: toplam,
      ortalama: Math.round(toplam / gec.length),
      en: en
    };
  }

  // Öğrencinin gecikme GEÇMİŞİ: ay sınırı yoktur, kişisel bir alışkanlığı
  // anlatır ("bu ay geç ödedi" bilgisi zaten ay rozetinde durur). Böylece
  // kimin sürekli geciktirdiği, kimin bir kez aksattığı ay değiştirmeden
  // görünür.
  function gecikmeGecmisi(kayitListesi, ogrenciId) {
    const gec = (kayitListesi || []).filter(k => {
      if (!k || k.tur !== 'odeme' || k.ogrenci_id !== ogrenciId) return false;
      if (!k.bitti || k.odeme_gunu == null) return false;
      return gunFarki(k.gun, k.odeme_gunu) > 0;
    });
    if (!gec.length) return null;
    const toplam = gec.reduce((t, k) => t + gunFarki(k.gun, k.odeme_gunu), 0);
    return { adet: gec.length, toplam: toplam, ortalama: Math.round(toplam / gec.length) };
  }

  // Tek gecikmede "ortalama" demek gereksiz: sayı doğrudan yazılır. İki ve
  // fazlasında ortalama anlamlı oluyor.
  function gecikmeNotu(kayitListesi, ogrenciId) {
    const g = gecikmeGecmisi(kayitListesi, ogrenciId);
    if (!g) return '';
    const ek = g.adet === 1
      ? g.toplam + ' gün'
      : 'ortalama ' + g.ortalama + ' gün';
    return `<small class="ogr-gec-notu">${g.adet} kez geç ödedi · ${ek}</small>`;
  }

  // Gecikme şeridi gelir şeridinin hemen altında durur: para özetini okurken
  // "bu para ne zaman geldi" sorusu aynı yerde cevaplanır. Gecikme yoksa
  // şerit hiç basılmaz — sıfır gecikme yazmak gürültü olurdu.
  function gecikmeSeridi(liste, kayitListesi, a) {
    const g = gecikmeOzeti(liste, kayitListesi, a);
    if (!g.adet) return '';
    const en = g.en && g.en.ad
      ? `<span>en çok <b>${esc(g.en.ad)}</b> · ${g.en.gun} gün</span>`
      : '';
    return `<div class="ogr-gecikme">
      <b>${g.adet} ödeme geç geldi</b>
      <span class="ogr-gecikme-kalemler">
        <span>ortalama <b>${g.ortalama} gün</b></span>
        ${en}
      </span>
      <small>Kaydın günü ile paranın geldiği gün arası.</small>
    </div>`;
  }

  // Toplu aidat düğmesi. Tutarı yazılmış öğrenci yoksa hiç basılmaz (işlevsiz
  // düğme durmaz). Kaydı zaten olanlar varsa bu yazıyla söylenir: yönetici
  // "aidatlar oluşturuldu mu" sorusunu düğmeden cevaplayabilsin.
  //
  // Düğme GÖRÜNEN ayın adını taşır, "bu ay" demez: ay geriye alınıp Eylül'e
  // dönülebiliyor ve kayıt görünen aya düşüyor (bkz. radyo-yonetim.js,
  // ogrenci-ay + ogrenci-aidat-olustur). "Bu ayın" yazsaydı Eylül'de basılan
  // düğme Ekim'i kastediyor sanılırdı.
  function aidatDugmesi(liste, kayitListesi, a) {
    if (!(liste || []).length) return '';
    const h = aylikAidatlar(liste, kayitListesi, a);
    if (!h.kayitlar.length && !h.atlanan) return '';
    const ayAdi = AYLAR_ADI[((a || {}).ay || 0) - 1] || '';
    if (!h.kayitlar.length) {
      return `<p class="ogr-aidat-tamam">${esc(ayAdi + ' ' + (a || {}).yil)}
        aidatları hazır · ${h.atlanan} öğrencinin kaydı var</p>`;
    }
    return `<div class="ogr-aidat">
      <button class="ogr-aidat-dugme" data-act="ogrenci-aidat-olustur" type="button">
        ${esc(ayAdi ? ayAdi + ' aidatlarını oluştur' : 'Aidatları oluştur')}</button>
      <small>${h.kayitlar.length} öğrenci · toplam <b>${para(h.toplam)} ₺</b>${h.atlanan ? ` · ${h.atlanan} öğrencinin kaydı zaten var` : ''}</small>
    </div>`;
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

  // ---------- Aylık gelir özeti ----------

  // Bu ayın öğrenci parası tek bakışta. Beklenen aidat, aktif öğrencilerin
  // yazılı aylık tutarlarının toplamıdır (tarifenin beklenen karşılığı);
  // tahsil ve bekleyen ayın ödeme kayıtlarından gelir.
  //
  // Kayıtlar yalnız LİSTEDEKİ öğrenciler üzerinden sayılır: silinmiş bir
  // öğrencinin kaydı gelire girseydi özet, listedeki satırların toplamıyla
  // tutmazdı (gunKatilim ile aynı kural).
  function gelirOzeti(liste, kayitListesi, a) {
    const ayar = a || {};
    const onek = ayOnek(ayar.yil, ayar.ay);
    const tam = liste || [];
    let beklenen = 0;
    tam.forEach(o => {
      if (!o || o.aktif === false) return;
      const t = Number(o.aylik_tutar || 0);
      if (t > 0) beklenen += t;
    });
    const kimler = tam.map(o => o.id);
    let tahsil = 0, bekleyen = 0, adet = 0;
    (kayitListesi || []).forEach(k => {
      if (!k || k.tur !== 'odeme') return;
      if (kimler.indexOf(k.ogrenci_id) === -1) return;
      if (String(k.gun).slice(0, 7) !== onek) return;
      const t = Number(k.tutar || 0);
      adet++;
      if (k.bitti) tahsil += t; else bekleyen += t;
    });
    // Henüz açılmamış aidat: tutarı yazılı olup bu ay için kaydı olmayanlar.
    const acilmamis = aylikAidatlar(tam, kayitListesi, ayar).toplam;
    return { beklenen: beklenen, tahsil: tahsil, bekleyen: bekleyen, acilmamis: acilmamis, adet: adet };
  }

  // Gelir şeridi. Sıfır olan kalem yazılmaz (her ay sıfırlar ekranda yer
  // kaplamasın); hiç kalem yoksa şerit de basılmaz.
  function gelirSeridi(liste, kayitListesi, a) {
    const ayar = a || {};
    if (!(liste || []).length || !ayar.yil || !ayar.ay) return '';
    const g = gelirOzeti(liste, kayitListesi, ayar);
    const kalem = (etiket, tutar, sinif) => (tutar > 0
      ? `<span class="kalem"><i>${esc(etiket)}</i><b${sinif ? ` class="${sinif}"` : ''}>${para(tutar)} ₺</b></span>`
      : '');
    const kalemler = kalem('Beklenen aidat', g.beklenen)
      + kalem('Tahsil', g.tahsil, 'g')
      + kalem('Bekleyen', g.bekleyen, 'y')
      + kalem('Aidatı açılmamış', g.acilmamis, 'm');
    if (!kalemler) return '';
    return `<div class="ogr-gelir">
      <b class="bas">${esc(AYLAR_ADI[ayar.ay - 1] + ' ' + ayar.yil)} · öğrenci geliri</b>
      <span class="ogr-gelir-kalemler">${kalemler}</span>
      ${g.adet ? `<small>${g.adet} ödeme kaydı</small>` : ''}
    </div>`;
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

  // Haftalık ders günü sayısı: hazır seçenekler (2/3/4) sunulur ama alan
  // serbest bırakılır — haftada 5 gün gelen olabilir. <select> serbest girişi
  // kapatırdı; bu yüzden sayı alanı + datalist kullanılıyor.
  const GUN_SECENEKLERI = [2, 3, 4];
  const GUN_LISTESI_ID = 'ogr-gun-sayisi-listesi';

  // Haftalık gün sayısına göre aylık aidat tarifesi: kursa haftanın 2 günü
  // gelenle 3 günü gelen aynı parayı vermiyor (3 gün: salon 1.600 + ücret
  // 2.500 = 4.100 ₺; 2 gün: 3.200 ₺). Tutar yine ELLE DEĞİŞTİRİLEBİLİR:
  // tarife yalnız formu doldurur, kaydı bağlamaz. Tarifede olmayan gün
  // sayısı (1, 4, 5 …) için tutar serbest kalır.
  const TARIFE = { 2: 3200, 3: 4100 };
  const tarifeTutar = gun => {
    const n = Number(gun);
    return TARIFE[n] != null ? TARIFE[n] : null;
  };
  // Alanın içindeki değer tarifeden mi gelmiş? Otomatik dolumun elle yazılmış
  // tutarın üstüne yazmaması için gerekir (bkz. radyo-yonetim.js).
  const tarifeMi = tutar => {
    const s = String(tutar == null ? '' : tutar).trim();
    if (!s) return false;
    return Object.keys(TARIFE).some(g => String(TARIFE[g]) === s);
  };
  const tarifeNotu = () => Object.keys(TARIFE)
    .map(g => g + ' gün: ' + para(TARIFE[g]) + ' ₺').join(' · ');

  // Aynı datalist birden çok forma hizmet eder; sayfada bir kez basılır
  // (bkz. ogrenciTakvimi). data- listesi formu açan sayı alanlarına bağlanır.
  const gunSecenekListesi = () => `<datalist id="${GUN_LISTESI_ID}">`
    + GUN_SECENEKLERI.map(n => `<option value="${n}"></option>`).join('')
    + '</datalist>';

  function alanlar(o, kip) {
    const k = kip === 'duzenle' ? 'ogrenci-duzenle' : 'ogrenci-gir';
    const v = ad => esc(o && o[ad] ? o[ad] : '');
    return `<input class="plan-gir" data-${k}="ad" type="text" autocomplete="off"
        placeholder="Öğrenci adı" value="${v('ad')}">
      <input class="plan-gir" data-${k}="veli" type="text" autocomplete="off"
        placeholder="Veli" value="${v('veli')}">
      <input class="plan-gir" data-${k}="telefon" type="tel" autocomplete="off"
        placeholder="Telefon" value="${v('telefon')}">
      <input class="plan-gir tarih" data-${k}="baslama" type="date"
        title="Kursa başladığı gün — boş bırakılabilir" value="${tarihDeger(o && o.baslama)}">
      <input class="plan-gir gun" data-${k}="gun_sayisi" type="number" min="1" max="7" step="1"
        list="${GUN_LISTESI_ID}" autocomplete="off" placeholder="Haftalık gün"
        title="Haftada kaç gün geliyor — 2/3/4 seç ya da elle yaz" value="${v('gun_sayisi')}">
      <input class="plan-gir tutar" data-${k}="aylik_tutar" type="text" inputmode="decimal"
        autocomplete="off" placeholder="Aylık tutar ₺"
        title="${esc(tarifeNotu())} — gün sayısını yazınca tutar otomatik dolar, istersen değiştir"
        value="${v('aylik_tutar')}">
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
    // Koşul bilgisi (haftalık gün, aylık tutar) ilk sırada: öğrencinin bu ay
    // hiç kaydı olmasa bile satırda görünür, "kaça geliyor" sorusu açmadan
    // okunur.
    if (o.gun_sayisi) p.push(`<i class="p">Haftada ${esc(o.gun_sayisi)} gün</i>`);
    if (Number(o.aylik_tutar) > 0) p.push(`<i class="p">Aylık ${para(o.aylik_tutar)} ₺</i>`);
    if (k.toplam) {
      p.push(`<i class="g">${k.geldi} geldi</i>`);
      // Eşiği aşan devamsızlık "d" ile ayrı renkte: göze çarpsın.
      if (k.gelmedi) {
        p.push(`<i class="y${d.gelmedi >= DEVAMSIZLIK_ESIK ? ' d' : ''}">${k.gelmedi} gelmedi</i>`);
      }
      if (k.mazeret) p.push(`<i class="m">${k.mazeret} mazeret</i>`);
    }
    // Ayın tamamı elden alındıysa çip bunu söyler (bkz. sonOdeme.elden):
    // "kim bana nakit ödedi" sorusu satırda cevaplanır.
    const ayElden = od.tahsil > 0 && od.elden === od.tahsil;
    if (od.tahsil) p.push(`<i class="g">${para(od.tahsil)} ₺ ödendi${ayElden ? ' · elden' : ''}</i>`);
    // Görünen ayda tahsilat yoksa geçen tahsilatın ayı yazılır: "kim ödedi"
    // sorusu ekrandaki aya takılıp boşta kalmasın. Ay kaydı varken bu çip
    // basılmaz — aynı bilgi iki kez yazılmaz.
    else {
      const son = sonOdeme(liste, o.id);
      if (son) {
        const ayAdi = AYLAR_ADI[Number(son.ay.slice(5, 7)) - 1];
        p.push(`<i class="g">${esc(ayAdi)} ödendi · ${para(son.tutar)} ₺${son.elden ? ' · elden' : ''}</i>`);
      }
    }
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
  // işaretsiz (henüz yoklama yapılmadı). Ders günü ise kalıptan okunup ayrıca
  // işaretlenir (bkz. dersKalibi) — ay daha bakarken hangi günlerin çalışma
  // günü olduğu görünsün.
  //   kalip: dersKalibi() sonucu (hafta günü kümesi). Verilmezse hücre
  //   renklenmez; takvim bu kümeyi bir kez hesaplayıp bütün hücrelere geçirir.
  function ogrHucre(h, liste, kayitListesi, s, a, kalip) {
    const toplam = (liste || []).length;
    const k = gunKatilim(liste, kayitListesi, h.iso);
    const isaretli = k.geldi + k.gelmedi + k.mazeret;
    const tam = toplam > 0 && k.geldi === toplam && k.gelmedi === 0 && k.mazeret === 0;
    const eksik = k.gelmedi > 0;
    const acik = (s || {}).ogrenciGun === h.iso;
    // Ay dışı kareler renklenmez: komşu ayın günleri kendi ayında görünür.
    const ders = !!kalip && h.ayIcinde && kalip.has(haftaGunu(h.iso));
    const sinif = ['ogr-hucre', h.ayIcinde ? '' : 'disari', ders ? 'ders' : '',
      h.iso === a.bugun ? 'bugun' : '',
      tam ? 'tam' : '', eksik ? 'eksik' : '', isaretli ? '' : 'isaretsiz', acik ? 'acik' : '']
      .filter(Boolean).join(' ');
    const rozet = isaretli ? `<i class="rozet">${k.geldi}/${toplam}</i>` : '';
    const alt = isaretli
      ? `<span class="hucre-alt">${k.gelmedi ? `<i class="y">${k.gelmedi}×</i>` : ''}${k.mazeret ? `<i class="m">${k.mazeret}M</i>` : ''}</span>`
      : '';
    const etiket = gunUzun(h.iso)
      + (ders ? ' · ders günü' : '')
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

  // ---------- Eksik yoklama ----------

  // Pazartesi = 0 … pazar = 6. Tarih bozuksa -1 döner ve o gün hiç sayılmaz.
  const haftaGunu = iso => {
    const p = String(iso || '').slice(0, 10).split('-').map(Number);
    if (p.length !== 3 || !p[0] || !p[1] || !p[2]) return -1;
    return (new Date(Date.UTC(p[0], p[1] - 1, p[2])).getUTCDay() + 6) % 7;
  };

  // Ay içinde yoklama yapılmış hafta günleri "ders günü" sayılır. Stüdyonun
  // hangi günler çalıştığı ayrı bir ayar olarak tutulmuyor; kalıp zaten
  // işaretlerin kendisinde görünüyor. Listede olmayan öğrencinin kaydı kalıba
  // girmez — sayılar da onun üzerinden yürüyor, tutarlı kalsın.
  function dersGunleri(liste, kayitListesi, a) {
    const ayar = a || {};
    const onek = ayOnek(ayar.yil, ayar.ay);
    const kimler = (liste || []).map(o => o.id);
    const gunler = new Set();
    (kayitListesi || []).forEach(k => {
      if (k.tur !== 'katilim' || kimler.indexOf(k.ogrenci_id) === -1) return;
      const iso = String(k.gun).slice(0, 10);
      if (iso.slice(0, 7) !== onek) return;
      const h = haftaGunu(iso);
      if (h >= 0) gunler.add(h);
    });
    return gunler;
  }

  // Haftalık ders kalıbı — AY SINIRI YOK. dersGunleri ay içinden okunduğu
  // için yeni ayın ilk günlerinde kalıp eksik çıkar: ekimde henüz yalnız
  // cumartesi işaretliydi, oysa dersler pazartesi/çarşamba/cumartesi. Takvim
  // o günleri renksiz bırakırdı. Kalıp geçmişin tamamından okunur; haftalık
  // ritim zamanla oturur, ay başında sıfırlanmaz.
  //   Yalnız listede olan öğrencilerin kayıtları sayılır — gunKatilim ile aynı
  //   kapsam, yoksa silinmiş bir öğrencinin geçmişi kalıba sızardı.
  function dersKalibi(liste, kayitListesi) {
    const kimler = (liste || []).map(o => o.id);
    const gunler = new Set();
    (kayitListesi || []).forEach(k => {
      if (k.tur !== 'katilim' || kimler.indexOf(k.ogrenci_id) === -1) return;
      const h = haftaGunu(k.gun);
      if (h >= 0) gunler.add(h);
    });
    return gunler;
  }

  // Geçmişte kalmış, ders günü olup hiç işaret taşımayan günler (eskiden yeniye).
  // Bugün eksik sayılmaz: yoklama gün içinde hâlâ girilebilir. Ay içinde hiç
  // işaret yoksa kalıp çıkmaz, uyarı da basılmaz — yoksa tatil günleri de eksik
  // sanılırdı.
  function eksikYoklamalar(liste, kayitListesi, a) {
    const ayar = a || {};
    if (!ayar.yil || !ayar.ay || !ayar.bugun || !(liste || []).length) return [];
    const gunler = dersGunleri(liste, kayitListesi, ayar);
    if (!gunler.size) return [];
    const onek = ayOnek(ayar.yil, ayar.ay);
    const bugun = String(ayar.bugun).slice(0, 10);
    const eksik = [];
    for (let g = 1; g <= ayGunSayisi(ayar.yil, ayar.ay); g++) {
      const iso = onek + '-' + iki(g);
      if (iso >= bugun) break;
      if (!gunler.has(haftaGunu(iso))) continue;
      const k = gunKatilim(liste, kayitListesi, iso);
      if (k.geldi + k.gelmedi + k.mazeret === 0) eksik.push(iso);
    }
    return eksik;
  }

  // Şeritte en çok bu kadar gün gösterilir; gerisi "+N gün" olur. Yoksa kırk
  // günlük bir ay listesi sayfayı kaplardı.
  const UYARI_GUN_LIMIT = 6;

  // Uyarı yalnız söylemez, düzeltmeye götürür: çip aynı gün eylemini taşır.
  function eksikSeridi(liste, kayitListesi, a) {
    const eksik = eksikYoklamalar(liste, kayitListesi, a);
    if (!eksik.length) return '';
    const goster = eksik.slice(0, UYARI_GUN_LIMIT);
    const kalan = eksik.length - goster.length;
    const cipler = goster.map(iso => `<button class="ogr-uyari-gun" data-act="ogrenci-gun"
        data-id="${iso}" type="button" title="${esc(gunUzun(iso))} yoklamasını aç">${esc(gunKisa(iso))}<i>${HAFTA[haftaGunu(iso)]}</i></button>`).join('');
    return `<div class="ogr-uyari">
      <b>${eksik.length} ders günü işaretsiz</b>
      <span class="ogr-uyari-cipler">${cipler}${kalan > 0 ? `<span class="ogr-uyari-kalan">+${kalan} gün</span>` : ''}</span>
      <small>Güne bas, yoklamayı gir.</small>
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
        <input class="plan-gir tarih" data-ogrenci-odeme-duzenle="odeme_gunu" type="date"
          title="Paranın eline geçtiği gün — boş bırakılabilir" value="${tarihDeger(k.odeme_gunu)}">
        <button class="plan-kaydet" data-act="ogrenci-odeme-duzenle-kaydet" data-id="${esc(k.id)}" type="button">kaydet</button>
        <button class="plan-vazgec" data-act="ogrenci-odeme-duzenle-kapat" type="button" aria-label="Vazgeç">×</button>
      </li>`;
    }
    return `<li class="plan-satir ogr-odeme${k.bitti ? ' bitti' : ''}${k.elden ? ' elden' : ''}">
      <button class="kutu" data-act="ogrenci-odeme-isaret" data-id="${esc(k.id)}" type="button"
        aria-label="${k.bitti ? 'Ödenmedi işaretle' : 'Ödendi işaretle'}">${k.bitti ? '✓' : ''}</button>
      <span class="metin">${esc(k.metin || 'Ödeme')} <small>${esc(gunKisa(k.gun))}${esc(odemeGunuNotu(k))}</small></span>
      ${eldenDugmesi(k)}
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
          <b class="g">${para(oz.tahsil)} ₺ tahsil</b>${oz.elden ? ` · <b class="e">${para(oz.elden)} ₺ elden</b>` : ''}${oz.bekleyen ? ` · <b class="y">${para(oz.bekleyen)} ₺ bekliyor</b>` : ''}</p>
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
    // Başlama tarihi veli/telefonun yanında durur: satırın kimlik bilgisi,
    // durum rozeti değil. "başlama" etiketiyle yazılır, yoksa tarihin tek
    // başına ne olduğu (kayıt mı, tahsilat mı) belirsiz kalırdı.
    const baslama = tarihKisa(o.baslama);
    const alt = [o.veli, o.telefon, baslama ? 'başlama ' + baslama : '']
      .filter(x => x && String(x).trim()).join(' · ');
    const acDugme = yerel ? '' : `<button class="ogr-ac" data-act="ogrenci-detay" data-id="${esc(o.id)}"
      type="button" aria-expanded="${acik ? 'true' : 'false'}"
      aria-label="${acik ? 'Ödeme listesini ve ay özetini kapat' : 'Ödeme listesi ve ay özeti'}">${acik ? '▾' : '▸'}</button>`;
    return `<li class="plan-satir ogrenci${acik ? ' acik' : ''}${o.hata ? ' hata' : ''}">
      ${acDugme}
      <span class="metin"><b>${esc(o.ad || '—')}</b>${alt ? ` <small>${esc(alt)}</small>` : ''}${o.notlar && String(o.notlar).trim() ? `<br><small>${esc(o.notlar)}</small>` : ''}${acik ? '' : ozetCipleri(liste, o, ayar)}${gecikmeNotu(liste, o.id)}</span>
      ${yerel ? '' : `<button class="duzenle" data-act="ogrenci-duzenle" data-id="${esc(o.id)}" type="button" aria-label="Düzenle">✎</button>`}
      <button class="sil" data-act="ogrenci-sil" data-id="${esc(o.id)}" type="button" aria-label="Sil">×</button>
      ${acik ? ogrenciDetay(o, liste, durum, ayar) : ''}
      ${hataSatiri(o)}
    </li>`;
  }

  // Klasör başlığı özeti: kaç öğrenci ve ayın yoklama durumu. Para kalemleri
  // burada DEĞİL gelir şeridinde durur: aynı tutar iki yerde yazılırsa biri
  // güncellenmeden kalabilir ve "hangi rakam doğru" sorusu doğar.
  function toplamSatiri(liste, kayitListesi, a) {
    if (!(liste || []).length) return '';
    const t = ogrenciToplam(liste, kayitListesi, a.yil, a.ay);
    const p = [t.ogrenci + ' öğrenci'];
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
    const kalip = dersKalibi(tam, kayitListesi);
    const hucreler = aylikOgrenciIzgara(ayar.yil, ayar.ay)
      .map(h => ogrHucre(h, tam, kayitListesi, durum, ayar, kalip)).join('');
    return `<section class="ogr-takvim">
      <div class="ogr-takvim-bas">
        <span class="ogr-takvim-ay">
          <button data-act="ogrenci-ay" data-id="onceki" type="button" aria-label="Önceki ay">‹</button>
          <b>${esc(AYLAR_ADI[ayar.ay - 1] + ' ' + ayar.yil)}</b>
          <button data-act="ogrenci-ay" data-id="sonraki" type="button" aria-label="Sonraki ay">›</button>
        </span>
        <p class="ogr-ipucu">${kalip.size ? 'Renkli günler ders günü · ' : ''}Güne bas: o günün yoklaması</p>
      </div>
      ${gunSecenekListesi()}
      ${gelirSeridi(tam, kayitListesi, ayar)}
      ${gecikmeSeridi(tam, kayitListesi, ayar)}
      ${eksikSeridi(tam, kayitListesi, ayar)}
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
      ${aidatDugmesi(tam, kayitListesi, ayar)}
      ${govde}
    </div>`;
  }

  const api = {
    KATILIM: KATILIM,
    GUN_SECENEKLERI: GUN_SECENEKLERI,
    TARIFE: TARIFE,
    tarifeTutar: tarifeTutar,
    tarifeMi: tarifeMi,
    para: para,
    aylikAidatlar: aylikAidatlar,
    aidatDugmesi: aidatDugmesi,
    katilimSonraki: katilimSonraki,
    katilimEtiket: katilimEtiket,
    katilimKisa: katilimKisa,
    ayGunSayisi: ayGunSayisi,
    gunKisa: gunKisa,
    tarihKisa: tarihKisa,
    ogrenciKayitlari: ogrenciKayitlari,
    katilimDurum: katilimDurum,
    katilimOzeti: katilimOzeti,
    ogrenciOdemeleri: ogrenciOdemeleri,
    odemeOzeti: odemeOzeti,
    eldenCevir: eldenCevir,
    eldenDugmesi: eldenDugmesi,
    odemeGunu: odemeGunu,
    odemeGunuNotu: odemeGunuNotu,
    sonOdeme: sonOdeme,
    borcOzeti: borcOzeti,
    dikkatOzeti: dikkatOzeti,
    odakSayilari: odakSayilari,
    ogrenciOdakla: ogrenciOdakla,
    gelirOzeti: gelirOzeti,
    gelirSeridi: gelirSeridi,
    gunFarki: gunFarki,
    gecikmeOzeti: gecikmeOzeti,
    gecikmeSeridi: gecikmeSeridi,
    gecikmeGecmisi: gecikmeGecmisi,
    gecikmeNotu: gecikmeNotu,
    ogrenciToplam: ogrenciToplam,
    DEVAMSIZLIK_ESIK: DEVAMSIZLIK_ESIK,
    ODAK: ODAK,
    toplamSatiri: toplamSatiri,
    odakCubugu: odakCubugu,
    ogrenciFiltrele: ogrenciFiltrele,
    gunKatilim: gunKatilim,
    gunUzun: gunUzun,
    haftaGunu: haftaGunu,
    dersGunleri: dersGunleri,
    dersKalibi: dersKalibi,
    eksikYoklamalar: eksikYoklamalar,
    eksikSeridi: eksikSeridi,
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
