// Radyo paneli görünüm katmanı — saf fonksiyonlar (veri girer, HTML çıkar).
//
// NEDEN AYRI DOSYA
// Eski panelde ekranların HTML'i ile Supabase çağrıları aynı fonksiyonun içinde
// iç içeydi; bu yüzden bir tablonun sırasını değiştirmek veri katmanına dokunmayı
// gerektiriyordu ve görünümler test edilemiyordu. Burada görünümler yalnızca
// veriyi alıp HTML döndürür; hiçbir ağ çağrısı, hiçbir global durum yoktur.
// Böylece Node testleri (tests/radio-panel-views.test.js) aynı fonksiyonları
// çağırıp gerçek çıktıyı doğrulayabilir ve prova sayfası üretimle birebir aynı
// HTML'i çizebilir.
//
// KURAL: kullanıcıdan gelen her değer esc() ile kaçırılır; hiçbir yerde ham
// string şablona gömülmez.
(function () {
  const esc = v => String(v == null ? '' : v)
    .replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // Depodaki adlar URL kodlanmış olabilir ("%C3%9Csk%C3%BCdar.mp3").
  const clean = n => { try { return decodeURIComponent(n); } catch (e) { return n; } };

  const hhmm = t => (t ? String(t).slice(0, 5) : '');
  const mmss = s => (!s || !isFinite(s)) ? '—' : Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');
  const tarih = v => v ? new Date(v).toLocaleString('tr-TR') : '—';
  const tarihKisa = v => v ? new Date(v).toLocaleDateString('tr-TR') : '—';

  // Arama: satır görünür kalsın mı? (q boşsa hepsi görünür)
  const hit = (q, ...parcalar) => !q || parcalar.join(' ').toLocaleLowerCase('tr').includes(q);
  const norm = v => String(v == null ? '' : v).trim().toLocaleLowerCase('tr');

  const AYLAR = 'Ocak Şubat Mart Nisan Mayıs Haziran Temmuz Ağustos Eylül Ekim Kasım Aralık'.split(' ');
  const uzunTarih = v => {
    if (!v) return '—';
    const d = new Date(v);
    return d.getDate() + ' ' + AYLAR[d.getMonth()] + ' ' + d.getFullYear();
  };

  // Cihaz bağlantısı 150 saniyeden eskiyse "bağlı değil" sayılır (oynatıcı
  // 60 saniyede bir nabız gönderiyor).
  const canliMi = (p, now) => !!(p.last_seen_at && now - new Date(p.last_seen_at).getTime() < 150000);

  const chip = (tip, metin, ikon) => `<span class="chip ${tip}">${ikon ? '<i></i>' : ''}${esc(metin)}</span>`;
  const bagliChip = (p, now) => canliMi(p, now)
    ? chip('live', 'BAĞLI', true)
    : chip('off', 'ÇEVRİMDIŞI');
  const caliyorChip = (p, now) => (p.is_playing && canliMi(p, now)) ? chip('live', '▶ ÇALIYOR', true) : '';

  // Panelin "canlı" bilgisi son görülme zamanına dayanır. Ekranda bunu "8 sn
  // önce" diye yazmak şart: yoksa donmuş bir kayıttaki "ÇALIYOR" yazısı canlı
  // sanılır. Bu, "şu an gerçekten çalıyor mu?" sorusunun dürüst cevabıdır.
  function goreli(zaman, now) {
    if (!zaman) return '';
    const sn = Math.max(0, Math.round((now - new Date(zaman).getTime()) / 1000));
    if (sn < 60) return sn + ' sn önce';
    const dk = Math.round(sn / 60);
    if (dk < 60) return dk + ' dk önce';
    const sa = Math.round(dk / 60);
    if (sa < 24) return sa + ' sa önce';
    return Math.round(sa / 24) + ' gün önce';
  }

  // Oynatıcının bildirdiği parça yalnızca taze olduğu sürece gösterilir; aksi
  // hâlde cihaz kapandıktan sonra da "şu an bu çalıyor" yazılı kalırdı.
  const PARCA_PENCERESI = 150000;
  // Oynatıcı parçayı ve listeyi aynı bildirimde, aynı damgayla tazeler
  // (parça değişiminde + dakikada bir), o yüzden tazelik tek damgadan okunur.
  const bildirimTaze = (p, now) => !!(p.now_at
    && (now - new Date(p.now_at).getTime()) < PARCA_PENCERESI);
  const parcaTaze = (p, now) => !!(p.now_title && bildirimTaze(p, now));

  // Cihazın çaldığı çalma listesi (personel cihazdan seçtiyse o, yönetim markaya
  // liste atadıysa o). Ad, panelin elindeki güncel listeden okunur: liste yeniden
  // adlandırıldığında cihaz eski adı bildirmeye devam etse bile panel doğrusunu
  // yazar; liste panelde yoksa oynatıcının bildirdiği adla yetiniriz. Cihaz
  // çevrimdışıysa ya da bildirim bayatsa hiçbir şey iddia edilmez.
  function calanListe(p, D, now) {
    if (!canliMi(p, now) || !bildirimTaze(p, now)) return null;
    const pl = (p.now_playlist_id && D && D.playlists)
      ? D.playlists.find(x => x.id === p.now_playlist_id)
      : null;
    if (pl) return { id: pl.id, ad: pl.name };
    if (p.now_playlist_name) return { id: p.now_playlist_id || null, ad: p.now_playlist_name };
    return null;
  }

  // Cihazın çaldığı liste yönetimin atadığından farklıysa, bunun tek açıklaması
  // kafedeki personelin cihazdan başka bir liste seçmesidir. Aynıysa susarız:
  // aynı adı iki kez yazmak "iki farklı yayın var" gibi okunur.
  function personelListesi(p, k, D, now) {
    const liste = calanListe(p, D, now);
    if (!liste || !liste.ad) return null;
    const atanan = k && k.ad ? k.ad : null;
    if (atanan && norm(atanan) === norm(liste.ad)) return null;
    return liste;
  }

  // ---------- BAĞLANTI GEÇMİŞİ ----------
  // Oynatıcı (radyo.js) durum değiştikçe sunucuya olay bırakıyor
  // (supabase/radio-baglanti-gecmisi.sql). Kafe sunumunun kod girişleri de aynı
  // çizelgede okunur. Panelin buradaki asıl işi, sahada “yayın durdu” diye gelen
  // şikâyetin kimden çıktığını ayırmak: biz mi durdurduk (mesai saati, kaynak,
  // abonelik, cihaz kilidi) yoksa kafe mi (cihazdan durdurma, arka plan).
  const OLAY_TARAF = { bizde: 'danger', kafe: 'gold' };

  // Teşhis kodlarının insan dilindeki karşılığı: panelde kod okumak yerine ne
  // olduğu yazsın, kod parantez içinde kalsın (sahadaki ekranla eşleşir).
  const HATA_ACIKLAMA = {
    'anahtar-yok': 'yayın anahtarı sistemde bulunamadı',
    'anahtar-bozuk': 'bağlantı eksik kopyalanmış (anahtar geçersiz)',
    'anahtar-belirsiz': 'link tanınmadı',
    'abonelik-yok': 'şube için abonelik tanımlı değil',
    'abonelik-bitmis': 'abonelik süresi doldu',
    'marka-pasif-veya-kaynak-yok': 'marka yayında değil ya da yayın kaynağı atanmamış',
    'baglanti-hatasi': 'sunucuya ulaşılamadı'
  };

  // Duraklatmanın sebebi ve tarafı. `taraf` alanı doğrudan “sorun bizde mi,
  // kafede mi” sorusunun cevabıdır; oynatıcı sebebi bırakmadıysa (kayıt eskiyse)
  // hiçbir taraf iddia edilmez.
  const DURMA_SEBEBI = {
    cihaz: { ad: 'Kafede cihazdan durduruldu', taraf: 'kafe', not: 'Yayın bizim tarafımızda çalışıyordu.' },
    'cihaz-gizli': { ad: 'Cihaz arka plandayken durdu', taraf: 'kafe', not: 'Tarayıcı sekmesi/penceresi arka plandaydı.' },
    'cihaz-kilidi': { ad: 'Link başka bir cihaza kayıtlı', taraf: 'bizde', not: 'Cihaz kilidi sıfırlanmadan yayın çalmaz.' },
    'mesai-disi': { ad: 'Yayın saati bitti', taraf: 'bizde', not: 'Şubeye tanımlı açılış/kapanış saatine göre durdu.' },
    'liste-bos': { ad: 'Seçilen listede parça yok', taraf: 'bizde', not: 'Listeye parça eklenmesi gerekiyor.' },
    'parca-yok': { ad: 'Klasörde parça yok', taraf: 'bizde', not: 'Yayın kaynağında çalınacak parça yok.' },
    'yayin-yok': { ad: 'Yayın kaynağı yok', taraf: 'bizde', not: 'Markaya canlı yayın kaynağı atanmamış ya da marka pasif.' }
  };

  // Bir olayı okunur hâle çevirir: ne oldu, kimin tarafında, ek bilgi ne.
  // `sorun` alanı olayın “yayın durdu/koptu” sınıfına girip girmediğini söyler;
  // özet sayaçları yalnızca bunları sayar (açılış bir sorun değildir).
  function olayBilgi(ev) {
    const kind = String(ev.kind || '');
    const det = String(ev.detail || '').trim();
    if (kind === 'acildi') return { ad: 'Oynatıcı açıldı', ek: det, taraf: 'kafe', sorun: false };
    if (kind === 'liste_degisti') return { ad: 'Çalma listesi seçildi', ek: det, taraf: 'kafe', sorun: false };
    if (kind === 'kod') {
      const yanlis = !/doğru/.test(det);
      return { ad: yanlis ? 'Sunum kodu yanlış girildi' : 'Sunum kodu girildi', ek: det, taraf: 'kafe', sorun: yanlis };
    }
    if (kind === 'caliyor') return { ad: 'Yayın çalmaya başladı', ek: det, taraf: null, sorun: false };
    // Yönetim canlı yayın kaynağını durdurdu; cihaz elindeki listeyi çalmaya
    // devam etti. Yayın sürdüğü için "sorun" sayılmaz, ama panelde "kaynak yok"
    // satırının neden hâlâ müzik çaldığını bu kayıt açıklar.
    if (kind === 'serbest') return { ad: 'Yayın kaynağı durduruldu, cihaz çalmaya devam ediyor', ek: det, taraf: 'bizde', sorun: false };
    if (kind === 'devam') return { ad: 'Yayın yeniden başladı', ek: det, taraf: null, sorun: false };
    if (kind === 'mesai') return {
      ad: det === 'kapandi' ? 'Yayın saati bitti'
        : (det === 'basladi' ? 'Yayın saati başladı' : 'Mesai dışında açıldı'),
      ek: '', taraf: 'bizde', sorun: false
    };
    if (kind === 'durakladi') {
      const s = DURMA_SEBEBI[det];
      return s ? { ad: s.ad, ek: s.not, taraf: s.taraf, sorun: true }
        : { ad: 'Yayın durdu', ek: det, taraf: null, sorun: true };
    }
    if (kind === 'hata') return {
      ad: 'Yayın kurulamadı', ek: (HATA_ACIKLAMA[det] || 'sebep okunamadı') + (det ? ' (' + det + ')' : ''),
      taraf: 'bizde', sorun: true
    };
    if (kind === 'kilitlendi') return { ad: 'Bu cihaz yetkili değil', ek: det, taraf: 'bizde', sorun: true };
    if (kind === 'takildi') return { ad: 'Yayın takıldı, yeniden bağlandı', ek: det, taraf: 'bizde', sorun: true };
    if (kind === 'yuklenemedi') return { ad: 'Parçanın ses dosyası çalınamadı', ek: det, taraf: 'bizde', sorun: true };
    return { ad: kind || 'Bilinmeyen olay', ek: det, taraf: null, sorun: true };
  }

  // Kafe sunumunun kod girişleri de geçmişin parçası; oynatıcı olaylarıyla aynı
  // çizelgede okunsun diye aynı biçime çevrilir (kod girişi şubeye değil markaya
  // aittir, bu yüzden player_id boştur).
  function kodOlaylari(D, brandId) {
    return (D.coffeeAttempts || [])
      .filter(a => !brandId || a.brand_id === brandId)
      .map(a => ({
        id: 'kod-' + a.id, brand_id: a.brand_id, player_id: null, kind: 'kod',
        detail: (a.success ? 'doğru kod' : 'yanlış kod') + (a.ip ? ' · ' + a.ip : ''),
        at: a.created_at
      }));
  }

  // Olayları süzer ve en yeniden eskiye dizer.
  function olaylariAl(D, suzgec) {
    const f = suzgec || {};
    const liste = (D.olaylar || []).filter(ev =>
      (!f.brandId || ev.brand_id === f.brandId) &&
      (!f.playerId || ev.player_id === f.playerId));
    const tumu = f.kodlar ? liste.concat(kodOlaylari(D, f.brandId)) : liste;
    return tumu.slice().sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  }

  // Olay tablosu. Çekmecede şube zaten belli olduğu için `yer: false` ile “kim”
  // sütunu çizilmez. Arama kutusu bu listede de çalışır.
  function olayTablosu(D, ui, f, limit) {
    const now = ui.now();
    const ayar = Object.assign({ yer: true, kodlar: false, q: '' }, f || {});
    const q = norm(ayar.q);
    return olaylariAl(D, ayar)
      .map(ev => {
        const p = ev.player_id ? D.players.find(x => x.id === ev.player_id) : null;
        const b = D.brands.find(x => x.id === ev.brand_id);
        return {
          ev: ev, o: olayBilgi(ev),
          yer: [b ? b.name : null, p ? p.label : null].filter(Boolean).join(' · ') || '—',
          zaman: tarih(ev.at), goreli: goreli(ev.at, now)
        };
      })
      .filter(s => hit(q, s.yer, s.o.ad, s.o.ek, s.ev.kind, s.ev.detail))
      .slice(0, limit || 20)
      .map(s => `<tr>
        ${ayar.yer ? `<td><b>${esc(s.yer)}</b></td>` : ''}
        <td><b>${esc(s.o.ad)}</b>${s.o.ek ? `<span class="sub">${esc(s.o.ek)}</span>` : ''}</td>
        <td class="tight">${s.o.taraf
          ? chip(OLAY_TARAF[s.o.taraf], s.o.taraf === 'kafe' ? 'KAFE TARAFI' : 'BİZİM TARAF')
          : '<span class="sub">—</span>'}</td>
        <td class="tight"><span class="sub">${esc(s.zaman)}</span><span class="sub">${esc(s.goreli)}</span></td>
      </tr>`).join('');
  }

  // “Sorun bizde mi, kafede mi”: son 24 saatteki yayın-durma olaylarını tarafa
  // göre sayar. Kod girişleri ayrı tutulur (onlar bir arıza değil, erişim kaydı).
  function gecmisOzet(D, ui, f) {
    const now = ui.now();
    let bizde = 0, kafe = 0, toplam = 0, kod = 0, yanlis = 0;
    olaylariAl(D, f).forEach(ev => {
      if (now - new Date(ev.at).getTime() >= 86400000) return;
      toplam++;
      if (ev.kind === 'kod') {
        kod++;
        if (!/doğru/.test(String(ev.detail || ''))) yanlis++;
        return;
      }
      const o = olayBilgi(ev);
      if (!o.sorun) return;
      if (o.taraf === 'kafe') kafe++; else bizde++;
    });
    return { bizde: bizde, kafe: kafe, toplam: toplam, kod: kod, yanlis: yanlis };
  }

  // Yan menüde “son 24 saatte kaç yayın durdu” okunsun.
  function olaySorunSayi(D, now) {
    const t = now || Date.now();
    return (D.olaylar || []).filter(ev =>
      t - new Date(ev.at).getTime() < 86400000 && olayBilgi(ev).sorun).length;
  }

  // ---------- Çalışma süresi (kesinti kimin yüzünden) ----------
  // Olay kaydı bir zaman çizelgesidir: “çalmaya başladı” ile “durdu” arası
  // çalışma, “durdu” ile bir sonraki “başladı” arası kesintidir ve kesinti
  // sebebini yazan satır onu kime yazacağımızı söyler. Böylece panel “bu şube
  // son 24 saatte %92 çalıştı, 41 dk kesinti (bizde 8 dk · kafede 33 dk)?”
  // cümlesini kurabilir.
  //
  // Şubeye tanımlı yayın saatleri dışındaki süre hiç sayılmaz: kapanıştan sonra
  // susan bir yayın “kesinti” değildir. Türkiye sabit UTC+3 kullanır, bu yüzden
  // gün sınırını kaydırmadan hesaplayabiliriz.
  const IST_MS = 3 * 3600000;
  const yerelGunBasi = t => Math.floor((t + IST_MS) / 86400000) * 86400000 - IST_MS;

  const saatDk = t => {
    if (!t) return null;
    const [s, d] = String(t).split(':');
    const n = Number(s) * 60 + Number(d);
    return isFinite(n) ? n : null;
  };

  // [bas, bitis] aralığının şubenin yayın saatlerine denk gelen parçaları.
  // Kapanış açılıştan küçükse mesai gece yarısını aşar.
  function mesaiParcalari(p, bas, bitis) {
    const ac = saatDk(p.open_time), kp = saatDk(p.close_time);
    if (ac === null || kp === null || ac === kp) return bitis > bas ? [[bas, bitis]] : [];
    const parcalar = [];
    for (let gun = yerelGunBasi(bas); gun < bitis; gun += 86400000) {
      const x = Math.max(bas, gun + ac * 60000);
      const y = Math.min(bitis, gun + (ac < kp ? kp : kp + 1440) * 60000);
      if (y > x) parcalar.push([x, y]);
    }
    return parcalar;
  }

  // Bir aralığın mesaiye denk gelen süresi: kesinti hesabı da uyarı da bunu
  // kullanır, böylece “mesai dışı suskunluk” hiçbir yerde sorun sayılmaz.
  const mesaiSuresi = (p, bas, bitis) =>
    mesaiParcalari(p, bas, bitis).reduce((t, [x, y]) => t + (y - x), 0);

  // Süreleri sahada okunur yazar: “45 sn”, “38 dk”, “2 sa 14 dk”.
  function sureMetni(ms) {
    const saniye = Math.max(0, Math.round(ms / 1000));
    if (saniye < 60) return saniye + ' sn';
    const dakika = Math.round(saniye / 60);
    if (dakika < 60) return dakika + ' dk';
    const saat = Math.floor(dakika / 60), kalan = dakika % 60;
    if (saat < 24) return saat + ' sa' + (kalan ? ' ' + kalan + ' dk' : '');
    // Haftalık trendde üç günlük bir kesinti “89 sa” diye okunmasın.
    const gun = Math.floor(saat / 24), saatKalan = saat % 24;
    return gun + ' gün' + (saatKalan ? ' ' + saatKalan + ' sa' : '');
  }

  // Son `gun` günün çalışma tablosu. `veriVar` false ise panel hiçbir şey
  // iddia etmez: elimizde olay yokken “çalışıyordu” demek uydurma olurdu.
  function kesintiHesap(D, p, now, gun) {
    const g = gun || 1;
    const bas = now - g * 86400000;
    const sonuc = {
      veriVar: false, caldi: 0, bizde: 0, kafe: 0, bilinmez: 0,
      beklenen: 0, yuzde: null, ilkOlay: null, olcumBas: bas
    };
    const artan = olaylariAl(D, { playerId: p.id })
      .filter(ev => new Date(ev.at).getTime() >= bas)
      .reverse();
    if (!artan.length) return sonuc;

    // Ölçüm elimizde kayıt olan andan başlar: cihaz üç saat önce kurulduysa
    // dünden beri susmuş gibi görünüp yüzdeyi düşürmesin.
    const olcumBas = new Date(artan[0].at).getTime();
    sonuc.ilkOlay = artan[0].at;
    sonuc.olcumBas = olcumBas;
    sonuc.beklenen = mesaiSuresi(p, olcumBas, now);
    let calmaBas = null, durmaBas = null, durmaTaraf = null;

    // Açık kalan aralığı kapatır: çalma süresini ve kesintiyi tarafına yazar.
    const kapat = bitis => {
      if (calmaBas !== null) { sonuc.caldi += mesaiSuresi(p, calmaBas, bitis); calmaBas = null; }
      if (durmaBas !== null) {
        const sure = mesaiSuresi(p, durmaBas, bitis);
        if (durmaTaraf === 'kafe') sonuc.kafe += sure;
        else if (durmaTaraf === 'bizde') sonuc.bizde += sure;
        else sonuc.bilinmez += sure;
        durmaBas = null; durmaTaraf = null;
      }
    };

    artan.forEach(ev => {
      const an = new Date(ev.at).getTime();
      const o = olayBilgi(ev);
      if (ev.kind === 'caliyor' || ev.kind === 'devam') {
        kapat(an);
        if (calmaBas === null) calmaBas = an;
        sonuc.veriVar = true;
      } else if (ev.kind === 'durakladi' || ev.kind === 'hata' || ev.kind === 'kilitlendi') {
        // Bu üçü yayının durduğu anlardır. “Takıldı” ve “dosya çalınamadı”
        // değildir: oynatıcı hemen yeniden bağlanır, yayın devam eder; onları
        // kesinti saymak kesinti süresini şişirirdi.
        kapat(an);
        if (durmaBas === null) { durmaBas = an; durmaTaraf = o.taraf; }
        sonuc.veriVar = true;
      }
    });
    kapat(now);

    // Çalma/durma kaydı yoksa yüzde yazılmaz: “%0” demek “hiç çalmadı” demek
    // olurdu, oysa bilmediğimizi söylüyoruz.
    sonuc.yuzde = (sonuc.veriVar && sonuc.beklenen > 0)
      ? Math.min(100, Math.round(sonuc.caldi / sonuc.beklenen * 100)) : null;
    return sonuc;
  }

  // "Son 24 saat: %92 çalıştı · 41 dk kesinti (bizde 8 dk · kafede 33 dk)"
  function calismaOzeti(D, p, now) {
    const k = kesintiHesap(D, p, now, 1);
    if (!k.veriVar || k.yuzde == null) return 'Son 24 saat için çalışma kaydı yok.';
    const kesinti = k.bizde + k.kafe + k.bilinmez;
    const kim = [];
    if (k.bizde) kim.push('bizde ' + sureMetni(k.bizde));
    if (k.kafe) kim.push('kafede ' + sureMetni(k.kafe));
    if (k.bilinmez) kim.push('sebebi kaydedilmemiş ' + sureMetni(k.bilinmez));
    return 'Son 24 saat: %' + k.yuzde + ' çalıştı (' + sureMetni(k.beklenen) + ' ölçüldü)'
      + (kesinti ? ' · ' + sureMetni(kesinti) + ' kesinti' + (kim.length ? ' (' + kim.join(' · ') + ')' : '')
        : ' · kesinti yok');
  }

  const dolulukChip = yuzde => yuzde >= 98 ? chip('live', '%' + yuzde, true)
    : (yuzde >= 90 ? chip('gold', '%' + yuzde) : chip('danger', '%' + yuzde));

  // Şube şube çalışma süresi. Kayıt yoksa satır “kayıt yok” der; yüzde
  // uydurulmaz.
  function calismaTablosu(D, ui, q) {
    const now = ui.now();
    const ara = norm(q);
    return D.players
      .filter(p => {
        const b = D.brands.find(x => x.id === p.brand_id);
        return hit(ara, p.label, b ? b.name : '');
      })
      .map(p => {
        const b = D.brands.find(x => x.id === p.brand_id);
        const k = kesintiHesap(D, p, now, 1);
        const kesinti = k.bizde + k.kafe + k.bilinmez;
        const kim = [];
        if (k.bizde) kim.push('bizde ' + sureMetni(k.bizde));
        if (k.kafe) kim.push('kafede ' + sureMetni(k.kafe));
        if (k.bilinmez) kim.push('sebebi kaydedilmemiş ' + sureMetni(k.bilinmez));
        return `<tr class="selectable" data-act="branch-open" data-id="${esc(p.id)}">
          <td><b>${esc(p.label)}</b><span class="sub">${esc(b ? b.name : '—')}</span></td>
          <td class="tight">${k.yuzde == null ? '<span class="sub">kayıt yok</span>' : dolulukChip(k.yuzde)}</td>
          <td class="tight">${k.veriVar
            ? `<b>${esc(sureMetni(k.caldi))}</b><span class="sub">ölçüm: ${esc(sureMetni(k.beklenen))}</span>`
            : '<span class="sub">—</span>'}</td>
          <td class="tight">${k.veriVar && kesinti
            ? `<b>${esc(sureMetni(kesinti))}</b><span class="sub">${esc(kim.join(' · '))}</span>`
            : '<span class="sub">kesinti yok</span>'}</td>
        </tr>`;
      }).join('');
  }

  // ---------- Haftalık trend ----------
  // Tek bir günün doluluğu “bugün neden sessiz” sorusunu cevaplar; hafta boyunca
  // bakmak “bu şube bozuluyor mu, düzeliyor mu” sorusunu cevaplar. Yeni bir sayım
  // yapılmaz: aynı olay çizelgesi gün kovalarına bölünür.
  const GUN_ADI = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];
  const AY_ADI = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];

  // Son n günün başlangıç anları, bugün en sonda.
  const sonGunler = (now, n) => {
    const bugun = yerelGunBasi(now), gunler = [];
    for (let i = (n || 7) - 1; i >= 0; i--) gunler.push(bugun - i * 86400000);
    return gunler;
  };

  // Sütun başlığı: “Bugün”, “Dün”, sonrası “Cmt 26 Eyl”.
  function gunEtiketi(t, now) {
    const g = yerelGunBasi(t), bugun = yerelGunBasi(now == null ? Date.now() : now);
    if (g === bugun) return 'Bugün';
    if (g === bugun - 86400000) return 'Dün';
    const d = new Date(g + IST_MS);
    return GUN_ADI[d.getUTCDay()] + ' ' + d.getUTCDate() + ' ' + AY_ADI[d.getUTCMonth()];
  }

  // Şubenin gün gün geçmişi. Olay çizelgesi baştan sona bir kez yürünür, her
  // aralık gün kovalarına dağıtılır: iki gün süren tek bir kesinti iki günün de
  // sütununda görünür (olay yalnızca ilk gün yazılmış olsa bile). Ölçüm yine ilk
  // olayla başlar, yani cihazın kurulmadığı günler “kayıt yok” der; %0 demez.
  function gunlukSeri(D, p, now, gunSayisi) {
    const gunler = sonGunler(now, gunSayisi || 7).map(bas => ({
      bas: bas, olcumBas: bas, bitis: Math.min(bas + 86400000, now),
      caldi: 0, bizde: 0, kafe: 0, bilinmez: 0, beklenen: 0, yuzde: null, veriVar: false
    }));
    const artan = olaylariAl(D, { playerId: p.id }).reverse(); // en eski → en yeni
    if (!artan.length) return gunler;

    const ilkAn = new Date(artan[0].at).getTime();
    gunler.forEach(g => { g.olcumBas = Math.max(g.bas, ilkAn); });

    const dagit = (a, b, alan) => {
      gunler.forEach(g => {
        const x = Math.max(a, g.olcumBas), y = Math.min(b, g.bitis);
        if (y > x) { g.veriVar = true; g[alan] += mesaiSuresi(p, x, y); }
      });
    };
    let calmaBas = null, durmaBas = null, durmaTaraf = null;
    const kapat = bitis => {
      if (calmaBas !== null) { dagit(calmaBas, bitis, 'caldi'); calmaBas = null; }
      if (durmaBas !== null) {
        dagit(durmaBas, bitis, durmaTaraf === 'kafe' ? 'kafe' : (durmaTaraf === 'bizde' ? 'bizde' : 'bilinmez'));
        durmaBas = null; durmaTaraf = null;
      }
    };
    artan.forEach(ev => {
      const an = new Date(ev.at).getTime();
      if (ev.kind === 'caliyor' || ev.kind === 'devam') {
        kapat(an);
        if (calmaBas === null) calmaBas = an;
      } else if (ev.kind === 'durakladi' || ev.kind === 'hata' || ev.kind === 'kilitlendi') {
        kapat(an);
        if (durmaBas === null) { durmaBas = an; durmaTaraf = olayBilgi(ev).taraf; }
      }
    });
    kapat(now);

    gunler.forEach(g => {
      g.beklenen = mesaiSuresi(p, g.olcumBas, g.bitis);
      g.yuzde = (g.veriVar && g.beklenen > 0)
        ? Math.min(100, Math.round(g.caldi / g.beklenen * 100)) : null;
    });
    return gunler;
  }

  // Trend tablosu: satır şube, sütun gün. Renkli kutu o günün doluluğu, son
  // sütun haftanın kesintisini ve tarafını toplar.
  function trendTablosu(D, ui, q) {
    const now = ui.now();
    const ara = norm(q);
    return D.players
      .filter(p => {
        const b = D.brands.find(x => x.id === p.brand_id);
        return hit(ara, p.label, b ? b.name : '');
      })
      .map(p => {
        const b = D.brands.find(x => x.id === p.brand_id);
        const seri = gunlukSeri(D, p, now, 7);
        const topla = alan => seri.reduce((t, g) => t + g[alan], 0);
        const kesinti = topla('bizde') + topla('kafe') + topla('bilinmez');
        const zayif = seri.filter(g => g.yuzde != null && g.yuzde < 90).length;
        const kim = [];
        if (topla('bizde')) kim.push('bizde ' + sureMetni(topla('bizde')));
        if (topla('kafe')) kim.push('kafede ' + sureMetni(topla('kafe')));
        return `<tr class="selectable" data-act="branch-open" data-id="${esc(p.id)}">
          <td><b>${esc(p.label)}</b><span class="sub">${esc(b ? b.name : '—')}${zayif ? ' · ' + zayif + ' gün zayıf' : ''}</span></td>
          ${seri.map(g => `<td class="tight">${g.yuzde == null
            ? '<span class="sub">—</span>' : dolulukChip(g.yuzde)}</td>`).join('')}
          <td class="tight">${kesinti
            ? `<b>${esc(sureMetni(kesinti))}</b><span class="sub">${esc(kim.join(' · '))}</span>`
            : `<span class="sub">${seri.some(g => g.veriVar) ? 'kesinti yok' : '—'}</span>`}</td>
        </tr>`;
      }).join('');
  }

  // Bir şubenin en son durma olayı: “şu an duraklatıldı” diyorsak sebebi de
  // yanında yazılsın, yoksa donmuş bir bayrak canlı sanılır.
  const sonDurma = (D, playerId) =>
    olaylariAl(D, { playerId: playerId }).find(ev => ev.kind === 'durakladi') || null;

  // Şube şu an ne yapıyor? Geçmişin en üstünde durur: “şu an çalıyor mu”
  // sorusu geçmişi okumadan cevaplanabilsin.
  function suanTablosu(D, ui, q) {
    const now = ui.now();
    const ara = norm(q);
    return D.players
      .filter(p => {
        const b = D.brands.find(x => x.id === p.brand_id);
        return hit(ara, p.label, b ? b.name : '');
      })
      .map(p => {
        const b = D.brands.find(x => x.id === p.brand_id);
        const k = b ? etkinKaynak(D, p) : null;
        const bagli = canliMi(p, now);
        const calan = bagli && p.is_playing
          ? ((parcaTaze(p, now) && p.now_title) || (k && k.ad) || 'çalıyor')
          : null;
        const farkli = p.is_playing ? personelListesi(p, k, D, now) : null;
        const suan = calan
          ? chip('live', '▶ ÇALIYOR', true) + `<span class="sub">${esc(calan)}${farkli ? ' · çalınan liste: ' + esc(farkli.ad) : ''}</span>`
          : (bagli ? chip('gold', 'DURAKLATILDI') : chip('off', 'ÇEVRİMDIŞI'));
        const durma = sonDurma(D, p.id);
        const o = durma ? olayBilgi(durma) : null;
        return `<tr class="selectable" data-act="branch-open" data-id="${esc(p.id)}">
          <td><b>${esc(p.label)}</b><span class="sub">${esc(b ? b.name : '—')}</span></td>
          <td>${suan}</td>
          <td class="tight">${o ? `${o.taraf
            ? chip(OLAY_TARAF[o.taraf], o.taraf === 'kafe' ? 'KAFE TARAFI' : 'BİZİM TARAF') : ''}
            <span class="sub">${esc(o.ad)} · ${esc(goreli(durma.at, now))}</span>`
            : '<span class="sub">kayıtlı durma yok</span>'}</td>
          <td class="tight"><span class="sub">${p.last_seen_at ? esc(goreli(p.last_seen_at, now)) : 'hiç bağlanmadı'}</span></td>
        </tr>`;
      }).join('');
  }

  // ---------- Kesinti uyarısı ----------
  // Panel kendiliğinden haber versin: mesai içinde yayın durmuşsa “kontrol eder
  // misin” diyen birinin olmasını beklemeyiz. Uyarı yalnızca elimizde kayıt
  // varken ve şube mesaisi açıkken çıkar; kayıt yokken susar, çünkü susan bir
  // cihazın bilmediğimiz hâlini “yayın durdu” diye bağırmak yanlış olurdu.
  const UYARI_ESIK_MS = 10 * 60000;

  // Mesai açık mı? Saat tanımlanmadıysa yayın her zaman beklenir.
  function mesaideMi(p, t) {
    const ac = saatDk(p.open_time), kp = saatDk(p.close_time);
    if (ac === null || kp === null || ac === kp) return true;
    const dk = (t - yerelGunBasi(t)) / 60000;
    return ac < kp ? (dk >= ac && dk < kp) : (dk >= ac || dk < kp);
  }

  // Şubenin şu anki durumu: olay çizelgesinin son sözü. `is_playing` bayrağı
  // bayat olabilir; “durdu” diyeceksem arkasında bir olay olmalı.
  function suanDurum(D, p, now) {
    const d = { biliniyor: false, caliyor: false, bas: null, taraf: null, sebep: null };
    olaylariAl(D, { playerId: p.id }).reverse().forEach(ev => {
      const an = new Date(ev.at).getTime();
      if (an > now) return;
      if (ev.kind === 'caliyor' || ev.kind === 'devam') {
        d.biliniyor = true; d.caliyor = true; d.bas = an; d.taraf = null; d.sebep = null;
      } else if (ev.kind === 'durakladi' || ev.kind === 'hata' || ev.kind === 'kilitlendi') {
        const o = olayBilgi(ev);
        d.biliniyor = true; d.caliyor = false; d.bas = an; d.taraf = o.taraf; d.sebep = o;
      }
    });
    return d;
  }

  // Mesai içinde uzun süredir susan şubeler: uyarının ham verisi. Sessizlik
  // yalnızca mesai saatleri içinde ölçülür; dün akşam kapanışta susan yayın
  // sabah “12 saat sessiz” diye bağırmaz, sabah açılışından bu yana geçen süre
  // kadar sessiz görünür.
  function sessizSubeler(D, now, esikMs) {
    const esik = esikMs || UYARI_ESIK_MS;
    const simdi = now == null ? Date.now() : now;
    return (D.players || []).map(p => {
      const d = suanDurum(D, p, simdi);
      if (!d.biliniyor || d.caliyor || d.bas === null) return null;
      if (!mesaideMi(p, simdi)) return null;
      const sure = mesaiSuresi(p, d.bas, simdi);
      if (sure < esik) return null;
      const b = D.brands.find(x => x.id === p.brand_id);
      return { p: p, b: b || null, sure: sure, sebep: d.sebep, taraf: d.taraf };
    }).filter(Boolean).sort((a, b) => b.sure - a.sure);
  }

  const sessizSayi = (D, now) => sessizSubeler(D, now).length;

  // “42 dakikadır” gibi bir cümle kurar; “42 dk'dır” gibi türkçesi bozuk bir
  // kısaltma okunmasın diye süreyi burada uzun yazar.
  function sureCumle(ms) {
    const saniye = Math.max(0, Math.round(ms / 1000));
    if (saniye < 60) return saniye + ' saniyedir';
    const dakika = Math.round(saniye / 60);
    if (dakika < 60) return dakika + ' dakikadır';
    const saat = Math.floor(dakika / 60), kalan = dakika % 60;
    if (saat < 24) return saat + ' saat' + (kalan ? ' ' + kalan + ' dakikadır' : 'tir');
    const gun = Math.floor(saat / 24), saatKalan = saat % 24;
    return gun + ' gün' + (saatKalan ? ' ' + saatKalan + ' saattir' : 'dür');
  }

  // Ekranın üstünde duran şerit: hangi şube, ne zamandır ve kimin tarafında.
  // Sessiz şube yoksa boş döner; panel hiçbir şey göstermez.
  function uyariSeridi(D, ui) {
    const now = ui.now();
    const sessiz = sessizSubeler(D, now);
    if (!sessiz.length) return '';
    const ilk = sessiz[0];
    const baslik = sessiz.length === 1
      ? `${ilk.p.label} ${sureCumle(ilk.sure)} sessiz`
      : `${sessiz.length} şubede yayın durdu · en uzunu ${ilk.p.label} (${sureMetni(ilk.sure)})`;
    const sebep = ilk.sebep
      ? ilk.sebep.ad + (ilk.sebep.ek ? ' · ' + ilk.sebep.ek : '')
      : 'Sebep kaydedilmemiş';
    const dugmeler = sessiz.slice(0, 4).map(s =>
      `<button class="btn sm" data-act="branch-open" data-id="${esc(s.p.id)}" type="button">${esc(s.p.label)} · ${esc(sureMetni(s.sure))}</button>`).join('');
    return `<div class="uyari-serit">
      <span class="chip danger">YAYIN DURDU</span>
      <div class="uyari-govde">
        <b>${esc(baslik)}</b>
        <span class="sub">${esc(sebep)}</span>
      </div>
      <div class="uyari-dugmeler">${dugmeler}
        <button class="btn sm primary" data-act="gecmis-ac" type="button">GEÇMİŞİ AÇ</button>
      </div>
    </div>`;
  }

  // Kafe bağlantı geçmişi ekranı: şu anki durum + son 24 saatin özeti + olay
  // çizelgesi. Sahadaki “yayın neden durdu?” sorusu tek ekranda cevaplanır.
  function gecmisView(state, D, ui) {
    const now = ui.now();
    const ozet = gecmisOzet(D, ui, { kodlar: true });
    const satirlar = olayTablosu(D, ui, { kodlar: true, q: state.q }, 150);
    const subeler = suanTablosu(D, ui, state.q) || bos(4, D.players.length ? 'Aramayla eşleşen şube yok.' : 'Henüz şube yok.');
    return `
      <div class="tiles">
        <div class="tile ${ozet.bizde ? 'danger' : 'gold'}"><span>BİZİM TARAF</span><b>${ozet.bizde}</b><small>mesai, kaynak ya da abonelik kaynaklı durma</small></div>
        <div class="tile${ozet.kafe ? ' gold' : ''}"><span>KAFE TARAFI</span><b>${ozet.kafe}</b><small>cihazdan durdurma, yanlış kod</small></div>
        <div class="tile"><span>KOD GİRİŞİ</span><b>${ozet.kod}</b><small>${ozet.yanlis ? ozet.yanlis + ' tanesi yanlış kod' : 'hepsi doğru kod'}</small></div>
        <div class="tile"><span>OLAY</span><b>${ozet.toplam}</b><small>son 24 saat · ${D.players.length} şube</small></div>
      </div>
      ${katliBolum({
        state: state, anahtar: 'gecmis:suan', varsayilanAcik: true,
        baslik: 'ŞU AN', baslikEk: ` <span>${D.players.length} şube</span>`,
        ozet: 'Yayın gerçekten çalıyor mu, durduysa kimin tarafında durdu? Durma sebebi cihazın bıraktığı geçmişten okunur; kayıt yoksa taraf iddia edilmez.',
        icerik: `<table>
          <thead><tr><th>ŞUBE</th><th>ŞU AN</th><th>SON DURMA</th><th>SON BAĞLANTI</th></tr></thead>
          <tbody>${subeler}</tbody>
        </table>`
      })}
      ${katliBolum({
        state: state, anahtar: 'gecmis:calisma', varsayilanAcik: true,
        baslik: 'ÇALIŞMA SÜRESİ', baslikEk: ' <span>son 24 saat</span>',
        ozet: 'Oynatıcının bıraktığı olaylardan hesaplanır: “çalmaya başladı” ile “durdu” arası çalışma, “durdu” '
          + 'ile bir sonraki başlama arası kesintidir ve kesinti, durdurmayı kim yaptıysa ona yazılır. Şubeye tanımlı yayın saatleri '
          + 'dışındaki süre hiç sayılmaz. Kayıt yoksa yüzde uydurulmaz.',
        icerik: `<table>
          <thead><tr><th>ŞUBE</th><th>DOLULUK</th><th>ÇALIŞTI</th><th>KESİNTİ</th></tr></thead>
          <tbody>${calismaTablosu(D, ui, state.q) || bos(4, D.players.length ? 'Aramayla eşleşen şube yok.' : 'Henüz şube yok.')}</tbody>
        </table>`
      })}
      ${katliBolum({
        state: state, anahtar: 'gecmis:trend', varsayilanAcik: true,
        baslik: 'HAFTALIK TREND', baslikEk: ' <span>son 7 gün</span>',
        ozet: 'Aynı olay geçmişi gün gün kesilir: hangi şube hafta içinde bozulup düzeliyor? Renkli kutu o günün '
          + 'doluluğu, son sütun haftanın toplam kesintisi ve kimin tarafında olduğu. “—” o gün için kayıt olmadığını söyler; '
          + 'cihazın kurulmadığı güne yüzde sıfır yazılmaz. Günler şubenin yayın saatlerine göre hesaplanır.',
        icerik: `<table>
          <thead><tr><th>ŞUBE</th>${sonGunler(now, 7).map(b => `<th>${esc(gunEtiketi(b, now).toUpperCase())}</th>`).join('')}<th>7 GÜN</th></tr></thead>
          <tbody>${trendTablosu(D, ui, state.q) || bos(9, D.players.length ? 'Aramayla eşleşen şube yok.' : 'Henüz şube yok.')}</tbody>
        </table>`
      })}
      ${katliBolum({
        state: state, anahtar: 'gecmis:olaylar', varsayilanAcik: true,
        baslik: `BAĞLANTI GEÇMİŞİ (${olaylariAl(D, { kodlar: true }).length})`,
        ozet: 'Kafe sunumunda kod girildiğinde, oynatıcı açıldığında, personel liste değiştirdiğinde ve yayın '
          + 'durduğunda buraya bir satır düşer. Geçmiş tablosu henüz kurulmadıysa '
          + '(supabase/radio-baglanti-gecmisi.sql) yalnızca kod girişleri görünür.',
        icerik: `<table>
          <thead><tr><th>KAFE / ŞUBE</th><th>OLAY</th><th>TARAF</th><th>ZAMAN</th></tr></thead>
          <tbody>${satirlar || bos(4, 'Kayıtlı olay yok.')}</tbody>
        </table>`
      })}`;
  }

  // Yayın hücresinin ikinci satırı: ses gerçekten akıyor mu, bu bilgi ne kadar
  // taze ve cihaz hangi listeyi çalıyor? Çevrimdışıysa susar; bağlantı durumunu
  // zaten DURUM sütunu yazıyor.
  function yayinDurumu(p, k, now, kaynakTekrar, farkliListe) {
    if (!canliMi(p, now)) return '';
    const damga = esc(goreli(p.last_seen_at, now));
    const nisan = p.is_playing ? chip('live', '▶ ÇALIYOR', true) : chip('gold', 'DURAKLATILDI');
    // Parça adı üstte yazıyorsa kaynağı burada tekrar ederiz (bağlam için);
    // üstte kaynak adı yazıyorsa tekrara gerek yok. Cihaz atanmıştan başka bir
    // liste çalıyorsa atanmış kaynağı hiç yazmayız: "şu an ne çalıyor" sorusuna
    // yan yana iki farklı cevap durmasın.
    const kaynak = (kaynakTekrar && !farkliListe && k && k.ad) ? ' · ' + esc(k.ad) : '';
    const liste = farkliListe ? ' · <b>çalınan liste:</b> ' + esc(farkliListe.ad) : '';
    return nisan + ' <span class="sub">' + damga + kaynak + liste + '</span>';
  }

  // Canlı durum ekranındaki yayın hücresi. Oynatıcı parça bildirdiyse gerçekten
  // çalan parçanın adı üstte yazar; bildirim yoksa (kurulum eskiyse) markaya
  // atanmış kaynak adı gösterilir ve altta tekrar edilmez.
  function yayinHucresi(p, k, now, D) {
    // Çevrimdışı bir şubede "şu an bu çalıyor" demeyiz: ses akmıyordur, elimizdeki
    // bayrak da son görülme zamanı kadar eskidir.
    const calan = (canliMi(p, now) && p.is_playing && parcaTaze(p, now)) ? p.now_title : null;
    const ust = calan
      ? esc(calan)
      : (k && k.ad ? esc(k.ad) : '<span class="sub">yayın atanmadı</span>');
    const farkli = p.is_playing ? personelListesi(p, k, D, now) : null;
    return ust + ' <span class="sub">' + yayinDurumu(p, k, now, !!calan, farkli) + '</span>';
  }
  const kilitChip = p => p.bound_device_id ? chip('lock', 'KİLİTLİ') : chip('off', 'serbest');
  const bos = (kolon, metin) => `<tr><td colspan="${kolon}"><div class="empty">${esc(metin)}</div></td></tr>`;

  // ---------- Marka yayın kaynağı ----------
  // Markanın o an ne çaldığı brand_broadcast kaydında tutulur: ya bir klasör
  // ya da markaya özel bir çalma listesi.
  function kaynak(D, brandId) {
    const b = D.broadcast.find(x => x.brand_id === brandId);
    if (!b) return { tip: null, ad: null, kayit: null };
    if (b.playlist_id) {
      const pl = D.playlists.find(p => p.id === b.playlist_id);
      return { tip: 'liste', ad: pl ? pl.name : 'Silinmiş liste', kayit: b };
    }
    if (b.folder_id) {
      const f = D.folders.find(x => x.id === b.folder_id);
      return { tip: 'klasör', ad: f ? f.name : 'Silinmiş klasör', kayit: b };
    }
    return { tip: null, ad: null, kayit: b };
  }

  // Şubeye özel canlı yayın (supabase/radio-subeye-ozel-yayin.sql). Marka genel
  // kaynağı varsayılandır; şube için ayrı kayıt varsa o şube genelden ayrılır.
  function subeKaynagi(D, playerId) {
    const kayit = (D.playerBroadcast || []).find(x => x.player_id === playerId);
    if (!kayit) return { tip: null, ad: null, kayit: null };
    if (kayit.playlist_id) {
      const pl = D.playlists.find(p => p.id === kayit.playlist_id);
      return { tip: 'liste', ad: pl ? pl.name : 'Silinmiş liste', kayit: kayit };
    }
    if (kayit.folder_id) {
      const f = D.folders.find(x => x.id === kayit.folder_id);
      return { tip: 'klasör', ad: f ? f.name : 'Silinmiş klasör', kayit: kayit };
    }
    return { tip: null, ad: null, kayit: null };
  }

  // Şubenin gerçekten çalacağı kaynak: özel atama varsa o, yoksa markanın geneli.
  function etkinKaynak(D, p) {
    const ozel = subeKaynagi(D, p.id);
    return ozel.tip ? ozel : kaynak(D, p.brand_id);
  }

  const subeKullanan = (D, playlistId) => (D.playerBroadcast || [])
    .filter(x => x.playlist_id === playlistId).length;

  const kapakYolu = (path, ui) => (path ? ui.cover(path) : null);

  function kapakHucre(path, ui, yedek, ekSinif) {
    const url = kapakYolu(path, ui);
    return url
      ? `<span class="cover ${ekSinif || ''}"><img src="${esc(url)}" alt="" loading="lazy"></span>`
      : `<span class="cover ${ekSinif || ''}">${yedek || '♪'}</span>`;
  }

  // Kapağı olmayan kayıt: parça, liste ve klasör satırlarında küçük bir uyarı
  // olarak görünür. Kapak yerleştirme işi kaydın kendi sayfasından yapılır
  // (satırdaki düğme/pencere); panel ayrıca bir denetim listesi tutmaz.
  const kapakYok = kayit => !(kayit && kayit.cover_path);

  // ---------- Yan menü ----------
  function nav(state, counts, kullanici) {
    // `uyari`: mesai içinde susan şube sayısı. Rozet kırmızı çizilir; sessiz
    // şube yokken hiç görünmez.
    // Menüde kendi satırı olan alt bölümler. Canlı durumun dört ekranı var ama
    // menüde tek satırı var; yayın başlatma/sağlık/geçmiş seçiliyken o satır
    // işaretli kalır (seçimi sekmeler gösterir). İçerik ve Müşteri'de ise her
    // sekmenin menüde kendi satırı olduğu için yalnız eşleşen satır işaretlenir;
    // aksi halde bölümün bütün satırları birden seçili görünürdü.
    const MENU_SATIRLARI = {
      canli: ['subeler'],
      icerik: ['klasorler', 'anonslar'],
      musteri: ['markalar', 'listeler', 'abonelikler', 'talepler']
    };
    const aktifMi = (nav, sub) => state.nav === nav
      && (state.sub === sub || !(MENU_SATIRLARI[nav] || []).includes(state.sub));
    const oge = (nav, sub, baslik, alt, sayi, ikon, uyari) => `
      <button class="nav-item${aktifMi(nav, sub) ? ' active' : ''}"
        data-nav="${nav}" data-sub="${sub}" type="button">
        ${ikon}<span>${esc(baslik)}<small>${esc(alt)}</small></span>
        ${uyari ? `<span class="say uyari">${esc(uyari)}</span>` : ''}
        ${sayi != null ? `<span class="say">${esc(sayi)}</span>` : ''}
      </button>`;
    const ikonlar = {
      canli: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="2.6"/><path d="M6.2 6.2a8 8 0 000 11.6M17.8 17.8a8 8 0 000-11.6"/></svg>',
      klasor: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M9 18V6l10-2v12"/><circle cx="6" cy="18" r="3"/><circle cx="16" cy="16" r="3"/></svg>',
      anons: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0014 0M12 18v3"/></svg>',
      marka: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M20.6 13.4l-7.2 7.2a2 2 0 01-2.8 0l-7.2-7.2A2 2 0 013 12V4h8a2 2 0 011.4.6l7.2 7.2a2 2 0 010 1.6z"/><circle cx="7.5" cy="7.5" r="1.2"/></svg>',
      liste: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 6h16M4 12h10M4 18h7"/></svg>',
      abonelik: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="2.5" y="5" width="19" height="14" rx="3"/><path d="M2.5 10h19"/></svg>',
      talep: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M3 7l9 6 9-6"/><rect x="3" y="5" width="18" height="14" rx="3"/></svg>',
      saglik: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M3 12h4l2 6 4-14 2 8h6"/></svg>',
      gecmis: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>',
      yayin: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M10 8.6l6 3.4-6 3.4z"/></svg>'
    };
    return `
      <div class="brand">
        <span class="dot"></span>
        <div><b>DERİN RECORD</b><span>RADYO KONTROLÜ</span></div>
      </div>
      <nav class="nav">
        <div class="nav-title">GÜNLÜK</div>
        ${oge('canli', 'subeler', 'Canlı durum', 'Şubeler, yayın başlat, sağlık', counts.players, ikonlar.canli, counts.sessiz)}

        <div class="nav-title">İÇERİK</div>
        ${oge('icerik', 'klasorler', 'Yayın klasörleri', 'Parçalar, sıra, kapak', counts.folders, ikonlar.klasor)}
        ${oge('icerik', 'anonslar', 'Anonslar', 'Mikrofon kayıtları', counts.announcements, ikonlar.anons)}

        <div class="nav-title">MÜŞTERİ</div>
        ${oge('musteri', 'markalar', 'Markalar', 'Şubeler ve listeler', counts.brands, ikonlar.marka)}
        ${oge('musteri', 'listeler', 'Çalma listeleri', 'Marka akışları', counts.playlists, ikonlar.liste)}
        ${oge('musteri', 'abonelikler', 'Abonelikler', 'Paket ve süreler', null, ikonlar.abonelik)}
        ${oge('musteri', 'talepler', 'Talepler', 'Gelen başvurular', counts.requests, ikonlar.talep)}
      </nav>
      <div class="rail-foot">
        <div class="who"><i>${esc((kullanici && kullanici.basHarf) || 'DR')}</i>
          <div><b>${esc((kullanici && kullanici.ad) || 'Yönetici')}</b><small>${esc((kullanici && kullanici.alt) || '')}</small></div></div>
        <button class="btn sm" data-act="cikis" type="button">ÇIKIŞ YAP</button>
        <a class="btn sm" href="index.html">SİTEYE DÖN</a>
      </div>`;
  }

  const BASLIKLAR = {
    'canli/yayin': ['Yayın başlat', 'Marka, şube, kaynak ve başlangıç parçasını seç, sonra yayını başlat'],
    'canli/subeler': ['Canlı durum', 'Şubelerin bağlantısı, o an çalan akış ve cihaz kilidi'],
    'canli/gecmis': ['Bağlantı geçmişi', 'Kim açtı, kim durdurdu; çalışma süresi ve haftalık trend'],
    'canli/saglik': ['Yayın sağlığı', 'Bütün şubelerin yayın zinciri tek ekranda denetlenir'],
    'icerik/klasorler': ['Yayın klasörleri', 'Parçaları yükle, sırala, kapağı değiştir'],
    'icerik/anonslar': ['Anonslar', 'Mikrofonla kaydedilen duyurular'],
    'musteri/markalar': ['Markalar', 'Şubeler, yayın linkleri ve çalma listeleri'],
    'musteri/listeler': ['Çalma listeleri', 'Markalara özel akış sıraları'],
    'musteri/abonelikler': ['Abonelikler', 'Paketler, deneme ve lisans süreleri'],
    'musteri/talepler': ['Talepler', 'Kahve markalarından gelen başvurular']
  };
  const ALT_SEKME = { klasorler: 'Yayın klasörleri', anonslar: 'Anonslar' };

  function topbar(state, D, now) {
    const anahtar = state.nav + '/' + state.sub;
    const bas = BASLIKLAR[anahtar] || ['Radyo kontrolü', ''];
    const caliyor = D.players.filter(p => p.is_playing && canliMi(p, now)).length;
    const bagli = D.players.filter(p => canliMi(p, now)).length;
    return {
      baslik: bas[0],
      alt: bas[1] + (state.sub === 'subeler' ? ` · ${bagli}/${D.players.length} şube bağlı` : ''),
      canli: caliyor
    };
  }

  // ---------- CANLI DURUM ----------
  function canliView(state, D, ui) {
    const now = ui.now();
    const q = norm(state.q);
    const yayinda = D.broadcast.filter(b => b.folder_id || b.playlist_id).length;
    const bagli = D.players.filter(p => canliMi(p, now)).length;
    const caliyor = D.players.filter(p => p.is_playing && canliMi(p, now)).length;
    const kilitli = D.players.filter(p => p.bound_device_id).length;

    const satirlar = D.players
      .filter(p => {
        const marka = D.brands.find(b => b.id === p.brand_id);
        const k = etkinKaynak(D, p);
        return hit(q, p.label, marka ? marka.name : '', k.ad || '');
      })
      .sort((a, b) => (a.label || '').localeCompare(b.label || '', 'tr'))
      .map(p => {
        const marka = D.brands.find(b => b.id === p.brand_id);
        const k = etkinKaynak(D, p);
        return `<tr class="selectable" data-act="branch-open" data-id="${esc(p.id)}">
          <td><div class="cell-main"><span class="cover">📻</span><span><b>${esc(p.label)}</b>
            <span class="sub">${esc(marka ? marka.name : '—')}</span></span></div></td>
          <td class="tight">${bagliChip(p, now)}</td>
          <td>${yayinHucresi(p, k, now, D)}</td>
          <td class="tight">${esc(hhmm(p.open_time) || '—')}–${esc(hhmm(p.close_time) || '—')}</td>
          <td class="tight">${kilitChip(p)}</td>
          <td><div class="row-actions">
            <button class="btn sm" data-act="player-copy" data-id="${esc(p.id)}" type="button">LİNK</button>
            <button class="btn sm" data-act="branch-open" data-id="${esc(p.id)}" type="button">YÖNET ›</button>
          </div></td>
        </tr>`;
      }).join('');

    return `
      <div class="tiles">
        <div class="tile gold"><span>YAYINDA</span><b>${yayinda}</b><small>markaya akış atanmış</small></div>
        <div class="tile"><span>ŞUBE</span><b>${D.players.length}</b><small>${bagli} bağlı · ${D.players.length - bagli} çevrimdışı</small></div>
        <div class="tile"><span>ŞU AN ÇALIYOR</span><b>${caliyor}</b><small>canlı yayında</small></div>
        <div class="tile"><span>KİLİTLİ CİHAZ</span><b>${kilitli}</b><small>başka cihazda açılamaz</small></div>
      </div>
      <div class="panel">
        <h3>ŞUBELER (${D.players.length})</h3>
        <table>
          <thead><tr><th>ŞUBE</th><th>DURUM</th><th title="Şu an çalan parça. Oynatıcı parça adını henüz bildirmiyorsa markaya atanmış yayın kaynağı yazılır. Personel cihazdan başka bir çalma listesi seçtiyse o liste de burada görünür.">ŞU AN ÇALAN</th><th>SAAT</th><th>CİHAZ</th><th></th></tr></thead>
          <tbody>${satirlar || bos(6, 'Eşleşen şube yok.')}</tbody>
        </table>
      </div>`;
  }

  // ---------- YAYIN SAĞLIĞI ----------
  // Aşağıdaki denetim, oynatıcının sunucudan istediği radio_now_playing
  // fonksiyonunun aradığı zinciri panelin elindeki veriden tek tek yoklar:
  // marka aktif mi, canlı yayın kaynağı var mı, kaynakta parça var mı,
  // abonelik geçerli mi, anahtar duruyor mu. Sunucuya hiç gitmez, bu yüzden
  // ekran anında doludur; "Sunucuyla doğrula" düğmesi ayrıca gerçek cevabı alır.

  // Sunucu yayın anahtarını uuid olarak bekler. Kayıtta anahtar boş kalmışsa
  // panelin kopyaladığı link "...?key=null" olur; oynatıcı hiç açılmaz, sunucu
  // 400 döner. Boş anahtar bu yüzden zincirin en başında anılmalı.
  function anahtarGecerli(deger) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(deger || ''));
  }

  // Markanın canlı yayında çalacağı parçalar (liste ya da klasör kaynağından).
  function kaynakParcalari(D, yayin) {
    if (!yayin) return [];
    if (yayin.playlist_id) {
      return D.playlistTracks
        .filter(x => x.playlist_id === yayin.playlist_id)
        .map(x => D.tracks.find(t => t.id === x.track_id))
        .filter(Boolean);
    }
    if (yayin.folder_id) return D.tracks.filter(t => t.folder_id === yayin.folder_id);
    return [];
  }

  // Bir şubenin yayın zincirindeki kopuk halkalar.
  function saglikTani(p, D, now) {
    const t = now || Date.now();
    const b = D.brands.find(x => x.id === p.brand_id);
    // Şubeye özel kaynak (supabase/radio-subeye-ozel-yayin.sql) marka genelini
    // geçersiz kılar: denetim gerçekte çalınacak kaynağa bakmalı.
    const ozel = subeKaynagi(D, p.id);
    const yayin = D.broadcast.find(x => x.brand_id === p.brand_id);
    const etkin = ozel.kayit || yayin;
    const parcalar = kaynakParcalari(D, etkin);
    const ab = D.subscriptions.find(s => s.brand_id === p.brand_id);
    const bitis = abonelikBitis(ab);
    const k = ozel.tip ? ozel : kaynak(D, p.brand_id);
    const sorunlar = [];
    // Her sorunun yanında oyunda tek tıkla çözümü de taşınır (tip + etiket +
    // hedef). Böylece ekran “ne eksik” ile “nasıl düzeltilir” ayrışmasın.
    const duzeltmeler = [];

    if (!b) sorunlar.push('Marka kaydı bulunamadı.');
    else if (b.is_active === false) {
      sorunlar.push('Marka pasif: sunucu pasif markaya yayın vermez.');
      duzeltmeler.push({ tip: 'marka-aktif', etiket: 'MARKAYI YAYINA AL' });
    }
    if (!anahtarGecerli(p.player_key)) {
      sorunlar.push(p.player_key
        ? 'Yayın anahtarı bozuk; kopyalanan link oynatıcıyı açmaz.'
        : 'Yayın anahtarı boş; kopyalanan link oynatıcıyı açmaz.');
      duzeltmeler.push({ tip: 'anahtar', etiket: 'ANAHTARI YENİLE' });
    }
    if (!etkin) {
      sorunlar.push('Canlı yayın kaydı yok: markaya hiç kaynak atanmamış.');
      duzeltmeler.push({ tip: 'kaynak', etiket: 'KAYNAK ATA' });
    } else if (!ozel.kayit && !k.tip) {
      sorunlar.push('Canlı yayına kaynak seçilmemiş (klasör ya da liste).');
      duzeltmeler.push({ tip: 'kaynak', etiket: 'KAYNAK SEÇ' });
    } else if (!parcalar.length) {
      sorunlar.push(ozel.kayit
        ? 'Bu şubeye özel seçilen kaynakta hiç parça yok.'
        : 'Seçili kaynakta hiç parça yok.');
      duzeltmeler.push({
        tip: 'parca', etiket: 'PARÇA YÜKLE',
        hedef: etkin.playlist_id ? '#/listeler/' + etkin.playlist_id : '#/klasorler/' + etkin.folder_id
      });
    }
    if (!ab) {
      sorunlar.push('Abonelik tanımlı değil.');
      duzeltmeler.push({ tip: 'abonelik', etiket: 'ABONELİK BAŞLAT' });
    } else if (bitis && new Date(bitis).getTime() <= t) {
      sorunlar.push('Aboneliğin süresi ' + uzunTarih(bitis) + ' tarihinde dolmuş.');
      duzeltmeler.push({ tip: 'abonelik', etiket: 'SÜRE EKLE' });
    }

    // Kopuk halka yoksa şube sağlamdır; ama hiç bağlanmamış bir şube henüz
    // kurulmamış olabilir, bunu hata değil uyarı sayarız.
    const seviye = sorunlar.length ? 'kotu' : (p.last_seen_at ? 'iyi' : 'uyari');
    return {
      seviye: seviye, sorunlar: sorunlar, duzeltmeler: duzeltmeler,
      kaynak: k, parcalar: parcalar, bitis: bitis, marka: b
    };
  }

  function saglikOzet(D, now) {
    const t = now || Date.now();
    let kotu = 0, uyari = 0, iyi = 0;
    D.players.forEach(p => {
      const s = saglikTani(p, D, t).seviye;
      if (s === 'kotu') kotu++;
      else if (s === 'uyari') uyari++;
      else iyi++;
    });
    return { kotu: kotu, uyari: uyari, iyi: iyi };
  }

  const saglikChip = (durum, metin) => durum === 'kotu'
    ? chip('danger', metin)
    : (durum === 'uyari' ? chip('gold', metin) : (durum === 'iyi' ? chip('live', metin, true) : chip('off', metin)));

  const SIRA = { kotu: 0, uyari: 1, iyi: 2 };

  function saglikView(state, D, ui) {
    const now = ui.now();
    const q = norm(state.q);
    const tumu = D.players.map(p => ({ p: p, t: saglikTani(p, D, now) }));
    const ozet = { kotu: 0, uyari: 0, iyi: 0 };
    tumu.forEach(x => { ozet[x.t.seviye]++; });

    const satirlar = tumu
      .filter(x => {
        const marka = x.t.marka ? x.t.marka.name : '';
        return hit(q, x.p.label, marka, x.t.sorunlar.join(' '), x.t.kaynak.ad || '');
      })
      .sort((a, b) => (SIRA[a.t.seviye] - SIRA[b.t.seviye]) || (a.p.label || '').localeCompare(b.p.label || '', 'tr'))
      .map(x => {
        const p = x.p, t = x.t;
        const saniye = t.parcalar.reduce((n, parca) => n + (Number(parca.duration_sec) || 0), 0);
        const sunucu = ui.saglikSonuc ? ui.saglikSonuc(p.id) : null;
        const icerik = t.kaynak.ad
          ? `<b>${esc(t.kaynak.ad)}</b><span class="sub">${t.parcalar.length} parça · ${mmss(saniye)}</span>`
          : '<span class="sub">yayın kaynağı yok</span>';
        const sorun = t.seviye === 'iyi'
          ? chip('live', p.last_seen_at ? 'SAĞLAM' : 'HAZIR', true)
          : (t.seviye === 'uyari' ? chip('gold', 'KURULUM BEKLİYOR') : chip('danger', 'YAYIN ÇALIŞMAZ'));
        return `<tr class="selectable" data-act="branch-open" data-id="${esc(p.id)}">
          <td><div class="cell-main"><span class="cover">${t.seviye === 'kotu' ? '⚠' : (t.seviye === 'uyari' ? '⏳' : '📻')}</span>
            <span><b>${esc(p.label)}</b><span class="sub">${esc(t.marka ? t.marka.name : '—')}
              · ${p.bound_device_id ? 'cihaza kilitli' : 'cihaz serbest'}</span></span></div></td>
          <td>${sorun}${t.sorunlar.length ? `<span class="sub">${esc(t.sorunlar[0])}</span>` : ''}
            ${t.seviye === 'uyari' ? '<span class="sub">Bağlantı hazır; cihaz henüz açılmamış.</span>' : ''}
            ${t.duzeltmeler.length ? `<div class="row-actions" style="margin-top:8px;justify-content:flex-start">${t.duzeltmeler.map((d, i) =>
              `<button class="btn sm${i === 0 ? ' primary' : ''}" data-act="saglik-fix" data-tip="${esc(d.tip)}"
                data-id="${esc(p.id)}"${d.hedef ? ` data-hedef="${esc(d.hedef)}"` : ''} type="button">${esc(d.etiket)}</button>`).join('')}</div>` : ''}</td>
          <td>${icerik}</td>
          <td class="tight" data-sunucu="${esc(p.id)}">${sunucu
            ? saglikChip(sunucu.durum, sunucu.metin)
            : '<span class="sub">denenmedi</span>'}</td>
          <td><div class="row-actions">
            <button class="btn sm" data-act="player-check" data-id="${esc(p.id)}" type="button">SINA</button>
            <button class="btn sm" data-act="player-copy" data-id="${esc(p.id)}" type="button">LİNK</button>
            <button class="btn sm" data-act="branch-open" data-id="${esc(p.id)}" type="button">YÖNET ›</button>
          </div></td>
        </tr>`;
      }).join('');

    return `
      <div class="tiles">
        <div class="tile ${ozet.kotu ? 'danger' : 'gold'}"><span>YAYIN ÇALIŞMAZ</span><b>${ozet.kotu}</b><small>zincirde kopuk halka var</small></div>
        <div class="tile"><span>KURULUM BEKLİYOR</span><b>${ozet.uyari}</b><small>bağlantı hazır, cihaz açılmamış</small></div>
        <div class="tile"><span>SAĞLAM</span><b>${ozet.iyi}</b><small>sunucudan yayın alıyor</small></div>
        <div class="tile"><span>ŞUBE</span><b>${D.players.length}</b><small>${D.brands.length} marka · ${D.players.filter(p => canliMi(p, now)).length} şu an bağlı</small></div>
      </div>
      <div class="panel">
        <h3>YAYIN SAĞLIĞI <span>${D.players.length} şube denetlendi</span></h3>
        <p class="panel-sub">Oynatıcı yayını isterken sunucu şu zinciri arar: şube anahtarı → markanın canlı yayın kaydı → markanın
          aktif olması → kaynakta parça → abonelik. Kopuk halka varsa şube “bu link tanınmadı” der. Buradaki denetim
          zinciri panelin elindeki kayıtlardan yoklar; “SUNUCUYLA DOĞRULA” düğmesi aynı kontrolü gerçek sunucuya da sorar.</p>
        <div class="row" style="margin-bottom:14px">
          <button class="btn primary" data-act="saglik-denetle" type="button">SUNUCUYLA DOĞRULA</button>
          <span class="sub">Cihaz kilidi bilerek denenmez: sınama, hiçbir cihazı şubeye kilitlemez.</span>
        </div>
        <span class="sub" id="saglik-msg"></span>
        <table>
          <thead><tr><th>ŞUBE</th><th>DURUM</th><th>YAYIN İÇERİĞİ</th><th>SUNUCU</th><th></th></tr></thead>
          <tbody>${satirlar || bos(5, D.players.length ? 'Aramayla eşleşen şube yok.' : 'Henüz şube yok.')}</tbody>
        </table>
      </div>`;
  }

  // ---------- YAYIN KLASÖRLERİ ----------
  function klasorListesi(state, D, ui) {
    const q = norm(state.q);
    const now = ui.now();
    const satirlar = D.folders.filter(f => hit(q, f.name, f.description)).map(f => {
      const adet = D.tracks.filter(t => t.folder_id === f.id).length;
      const kapaksiz = D.tracks.filter(t => t.folder_id === f.id && kapakYok(t)).length;
      const yayinda = D.broadcast.some(b => b.folder_id === f.id);
      return `<tr class="selectable" data-act="folder-open" data-id="${esc(f.id)}">
        <td><div class="cell-main">${kapakHucre(f.cover_path, ui, '🎵', 'gold')}
          <span><b>${esc(f.name)}</b><span class="sub">${esc(f.description || 'açıklama yok')}</span></span></div></td>
        <td class="tight">${adet} parça${kapaksiz ? ' ' + chip('gold', kapaksiz + ' KAPAK YOK') : ''}</td>
        <td class="tight">${yayinda ? chip('live', 'YAYINDA', true) : chip('off', 'beklemede')}</td>
        <td class="tight">${f.shuffle === false ? '<span class="sub">sırayla</span>' : '<span class="sub">karışık</span>'}</td>
        <td><div class="row-actions">
          <button class="btn sm" data-act="folder-open" data-id="${esc(f.id)}" type="button">AÇ ›</button>
          <button class="btn sm danger" data-act="folder-del" data-id="${esc(f.id)}" type="button">SİL</button>
        </div></td>
      </tr>`;
    }).join('');

    return `
      <div class="panel" style="margin-bottom:18px">
        <h3>YENİ KLASÖR</h3>
        <div class="form-grid">
          <div class="field"><label for="folder-name">AD</label>
            <input id="folder-name" placeholder="Örn. Öğle Arası — Caz" autocomplete="off"></div>
          <div class="field"><label for="folder-desc">AÇIKLAMA</label>
            <input id="folder-desc" placeholder="İsteğe bağlı" autocomplete="off"></div>
          <button class="btn primary" data-act="folder-add" type="button">KLASÖR OLUŞTUR</button>
        </div>
      </div>
      <div class="panel">
        <h3>YAYIN KLASÖRLERİ (${D.folders.length})</h3>
        <table>
          <thead><tr><th>KLASÖR</th><th>İÇERİK</th><th>DURUM</th><th>ÇALMA</th><th></th></tr></thead>
          <tbody>${satirlar || bos(5, 'Henüz klasör yok. Yukarıdan ilk klasörü oluştur.')}</tbody>
        </table>
      </div>`;
  }

  function klasorDetay(state, D, ui) {
    const f = D.folders.find(x => x.id === state.openFolder);
    if (!f) return klasorListesi(state, D, ui);
    const q = norm(state.q);
    const liste = D.tracks.filter(t => t.folder_id === f.id)
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    const toplam = liste.reduce((s, t) => s + (Number(t.duration_sec) || 0), 0);
    const kapaksiz = liste.filter(kapakYok).length;
    const gorunen = liste.filter(t => hit(q, clean(t.title)));

    const satirlar = gorunen.map((t, i) => `<tr draggable="true" data-act="track-open"
        data-id="${esc(t.id)}" data-idx="${i}" data-sira="${esc(t.sort_order == null ? '' : t.sort_order)}">
      <td class="no">${String(liste.indexOf(t) + 1).padStart(2, '0')}</td>
      <td class="tight"><span class="drag" title="Sürükleyerek sırala">⋮⋮</span></td>
      <td><div class="cell-main"><span class="cover">${t.cover_path
        ? `<img src="${esc(kapakYolu(t.cover_path, ui))}" alt="" loading="lazy">` : '♪'}</span>
        <span><b>${esc(clean(t.title))}</b><span class="sub">${esc(t.storage_path)}</span>${kapakYok(t)
          ? ' ' + chip('gold', 'KAPAK YOK') : ''}</span></div></td>
      <td class="tight">${mmss(t.duration_sec)}</td>
      <td><div class="row-actions">
        <button class="btn sm" data-act="track-play" data-id="${esc(t.id)}" type="button">DİNLE</button>
        <button class="btn sm" data-act="track-rename" data-id="${esc(t.id)}" type="button">AD</button>
        <button class="btn sm" data-act="track-img" data-id="${esc(t.id)}" type="button">KAPAK</button>
        <button class="btn sm" data-act="track-move" data-id="${esc(t.id)}" type="button">TAŞI</button>
        <button class="btn sm danger" data-act="track-del" data-id="${esc(t.id)}"
          data-path="${esc(t.storage_path)}" type="button">SİL</button>
      </div></td>
    </tr>`).join('');

    return `
      ${geriCubugu('klasorler', 'KLASÖRLERE DÖN', [f.name, liste.length + ' parça' + (toplam ? ' · ' + Math.round(toplam / 60) + ' dk' : '')])}
      <div class="panel" style="margin-bottom:18px">
        <h3>PARÇA YÜKLE</h3>
        <label class="drop" id="track-drop" for="track-file">
          <b>PARÇA YÜKLE — dosyayı buraya bırak veya seç</b>
          <small>${esc(ui.desteklenenler())} · ${esc(ui.parcaNotu())}</small>
          <input id="track-file" type="file" multiple accept="${esc(ui.accept())}">
        </label>
        <div class="row" style="margin-top:14px">
          <button class="btn primary" data-act="track-upload" type="button">YÜKLE</button>
          <span class="sub" id="track-msg"></span>
        </div>
        <div class="progress" id="up-bar" hidden><i></i></div>
      </div>
      <div class="panel" style="margin-bottom:18px">
        <h3>PARÇALAR (${liste.length})${kapaksiz ? ' ' + chip('gold', kapaksiz + ' KAPAK YOK') : ''}</h3>
        <table>
          <thead><tr><th>#</th><th></th><th>PARÇA</th><th>SÜRE</th><th></th></tr></thead>
          <tbody>${satirlar || bos(5, liste.length ? 'Aramayla eşleşen parça yok.' : 'Bu klasörde henüz parça yok.')}</tbody>
        </table>
        ${liste.length > 1 ? '<p class="panel-sub" style="margin:12px 0 0">Sırayı ⋮⋮ tutamacından sürükleyerek ya da dokunarak değiştirebilirsin.</p>' : ''}
      </div>
      <div class="panel">
        <h3>KLASÖR AYARLARI</h3>
        <div class="form-grid">
          <div class="field"><label for="f-name">KLASÖR ADI</label>
            <input id="f-name" value="${esc(f.name)}" autocomplete="off"></div>
          <button class="btn" data-act="folder-rename" type="button">ADI KAYDET</button>
          <div class="field"><label>KAPAK GÖRSELİ</label>
            <button class="btn" data-act="cover-open" type="button">${f.cover_path ? 'KAPAĞI DEĞİŞTİR' : 'KAPAK YERLEŞTİR'}</button></div>
          <button class="btn" data-act="folder-shuffle" type="button">${f.shuffle === false ? 'KARIŞIK ÇALMAYA GEÇ' : 'SIRAYLA ÇALMAYA GEÇ'}</button>
        </div>
        <hr class="divider">
        <div class="row">
          <button class="btn danger" data-act="folder-del" data-id="${esc(f.id)}" type="button">KLASÖRÜ SİL</button>
          <span class="sub">Klasör ve içindeki parça kayıtları silinir; ses dosyaları depoda temizlenir.</span>
        </div>
        <span class="sub" id="f-msg"></span>
      </div>`;
  }

  // ---------- ANONSLAR ----------
  function anonsListesi(state, D, ui) {
    const q = norm(state.q);
    const satirlar = D.announcements
      .filter(a => {
        const b = D.brands.find(x => x.id === a.brand_id);
        return hit(q, a.label, b ? b.name : '');
      })
      .map(a => {
        const b = D.brands.find(x => x.id === a.brand_id);
        return `<tr>
          <td><div class="cell-main"><span class="cover">🎙</span><span><b>${esc(a.label || 'Anons')}</b>
            <span class="sub">${esc(b ? b.name : '—')} · ${esc(tarih(a.created_at))}</span></span></div></td>
          <td><div class="row-actions">
            <button class="btn sm" data-act="anons-play" data-path="${esc(a.storage_path)}" type="button">DİNLE</button>
            <button class="btn sm danger" data-act="anons-del" data-id="${esc(a.id)}"
              data-path="${esc(a.storage_path)}" type="button">SİL</button>
          </div></td>
        </tr>`;
      }).join('');

    return `
      <div class="panel" style="margin-bottom:18px">
        <h3>YENİ ANONS</h3>
        <p class="panel-sub">Markayı seç, kaydı başlat ve bitir; anons markanın bütün şubelerine gönderilir.</p>
        <div class="form-grid">
          <div class="field"><label for="anons-brand">MARKA</label>
            <select id="anons-brand"><option value="">Marka seçin</option>
              ${D.brands.map(b => `<option value="${esc(b.id)}">${esc(b.name)}</option>`).join('')}</select></div>
          <div class="field"><label for="anons-label">NOT</label>
            <input id="anons-label" placeholder="Örn. Kampanya duyurusu" autocomplete="off"></div>
          <button class="btn primary" data-act="mic" type="button" id="anons-rec">🎙 MİKROFONU AÇ</button>
        </div>
        <span class="sub" id="anons-msg"></span>
      </div>
      <div class="panel">
        <h3>KAYITLAR (${D.announcements.length})</h3>
        <table><tbody>${satirlar || bos(2, 'Henüz anons kaydı yok.')}</tbody></table>
      </div>`;
  }

  // ---------- MARKALAR ----------
  function markaListesi(state, D, ui) {
    const q = norm(state.q);
    const now = ui.now();
    const satirlar = D.brands
      .filter(b => hit(q, b.name))
      .map(b => {
        const k = kaynak(D, b.id);
        const subeler = D.players.filter(p => p.brand_id === b.id);
        const listeler = D.playlists.filter(p => p.brand_id === b.id);
        const canli = subeler.some(p => p.is_playing && canliMi(p, now));
        const ab = D.subscriptions.find(s => s.brand_id === b.id);
        const paket = ab ? D.plans.find(p => p.id === ab.plan_id) : null;
        return `<tr class="selectable" data-act="brand-open" data-id="${esc(b.id)}">
          <td><div class="cell-main"><span class="cover gold">🏷</span><span><b>${esc(b.name)}</b>
            <span class="sub">${listeler.length} çalma listesi · ${esc(k.ad || 'yayın atanmadı')}</span></span></div></td>
          <td class="tight">${subeler.length} şube</td>
          <td class="tight">${ab
            ? chip(ab.status === 'trial' ? 'gold' : (ab.status === 'active' ? 'live' : 'danger'),
                ((paket && paket.name) || 'paket'), ab.status === 'active')
            : chip('off', 'abonelik yok')}</td>
          <td class="tight">${esc(abonelikBitis(ab) ? uzunTarih(abonelikBitis(ab)) : '—')}</td>
          <td class="tight">${canli ? chip('live', '▶ CANLI', true) : (k.ad ? chip('gold', 'YAYINDA') : chip('off', 'kapalı'))}</td>
          <td><div class="row-actions">
            <button class="btn sm" data-act="brand-open" data-id="${esc(b.id)}" type="button">AÇ ›</button>
          </div></td>
        </tr>`;
      }).join('');

    return `
      <div class="panel" style="margin-bottom:18px">
        <h3>YENİ MARKA</h3>
        <div class="form-grid">
          <div class="field"><label for="brand-name">MARKA ADI</label>
            <input id="brand-name" placeholder="Örn. Kahve Dünyası" autocomplete="off"></div>
          <div class="field"><label for="brand-contact">İLETİŞİM</label>
            <input id="brand-contact" placeholder="İsteğe bağlı" autocomplete="off"></div>
          <button class="btn primary" data-act="brand-add" type="button">MARKA OLUŞTUR</button>
        </div>
        <span class="sub" id="brand-msg"></span>
      </div>
      <div class="panel">
        <h3>MARKALAR (${D.brands.length})</h3>
        <table>
          <thead><tr><th>MARKA</th><th>ŞUBE</th><th>PAKET</th><th>BİTİŞ</th><th>YAYIN</th><th></th></tr></thead>
          <tbody>${satirlar || bos(6, 'Henüz marka yok.')}</tbody>
        </table>
      </div>`;
  }

  // ---------- Katlanabilir bölüm ----------
  // Katlanma tercihini tarayıcıda saklamak için kullanılan saf yardımcılar.
  // Yalnız `true` işaretleri saklanır: kapatılmış bir bölümü "açık değil" diye
  // yazmak varsayılanı tekrarlar ve kaydı şişirirdi. Bozuk/eski kayıt paneli
  // çökertmez, boş durum döner (bölümler varsayılan hâliyle gelir).
  function katliIsaretler(v) {
    const out = {};
    if (v && typeof v === 'object') for (const k in v) if (v[k] === true) out[k] = true;
    return out;
  }
  function katliDurumOku(metin) {
    if (!metin) return { acik: {}, kapali: {} };
    let kayit = null;
    try { kayit = JSON.parse(metin); } catch { return { acik: {}, kapali: {} }; }
    if (!kayit || typeof kayit !== 'object') return { acik: {}, kapali: {} };
    return { acik: katliIsaretler(kayit.acik), kapali: katliIsaretler(kayit.kapali) };
  }
  function katliDurumYaz(durum) {
    return JSON.stringify({
      acik: katliIsaretler(durum && durum.acik),
      kapali: katliIsaretler(durum && durum.kapali)
    });
  }

  // Kayıt listeleri (anons geçmişi, giriş denemeleri, olay geçmişi) sayfanın
  // altında birikip asıl işi aşağı itiyordu. Bu bölümler kapalı gelir: başlık ve
  // tek satır özet yerinde kalır, liste istenince açılır. Açık bölümler
  // `state.acik` içinde tutulur; panel yeniden çizildiğinde (arama, kayıt
  // sonrası tazeleme) kendiliğinden kapanmaz. `alt` her zaman görünür: kimi
  // bölümde liste değil, altındaki düğme (mikrofon, tüm geçmiş) asıl iştir.
  // `baslikEk`: başlığın yanına küçük punto ile yazılan kapsam etiketi (ör.
  // “son 24 saat”); kaçışlanmamış HTML olarak geçer.
  function katliBolum(a) {
    // `varsayilanAcik`: bölüm ekranın asıl içeriği olduğunda açık gelir ve
    // kapatma işareti `state.kapali` içinde tutulur (Bağlantı geçmişi sekmesi
    // gibi). Aksi hâlde bölüm kapalı gelir ve `state.acik` içinde tutulur.
    const acik = a.varsayilanAcik
      ? !(a.state.kapali || {})[a.anahtar]
      : !!(a.state.acik || {})[a.anahtar];
    const act = a.varsayilanAcik ? 'katla-alt' : 'katla';
    return `
      <div class="panel" style="margin-bottom:18px">
        <div class="panel-head">
          <h3>${esc(a.baslik)}${a.baslikEk || ''}</h3>
          <button class="btn sm" data-act="${act}" data-id="${esc(a.anahtar)}" type="button"
            aria-expanded="${acik ? 'true' : 'false'}">${acik ? 'KAPAT ▴' : 'AÇ ▾'}</button>
        </div>
        ${a.ozet ? `<p class="panel-sub">${a.ozet}</p>` : ''}
        ${acik ? `<div class="katli-govde" data-katli="${esc(a.anahtar)}">${a.icerik}</div>` : ''}
        ${a.alt || ''}
      </div>`;
  }

  // Katlanabilir bölümün ikinci seviyesi: marka sayfasında her şubenin bağlantı
  // geçmişi kendi tablosunda durur. Dış bölümle aynı fikri paylaşır ama iki
  // farkı var: panel yerine hafif bir başlık kullanır (iç içe paneller sayfayı
  // ağırlaştırıyordu) ve **açık gelir**. Bölümü açan yönetici kayıtları hemen
  // görmeli; kalabalık yapan şubeleri tek tek kapatabilir.
  function katliAlt(a) {
    const acik = !(a.state.kapali || {})[a.anahtar];
    return `
      <div class="katli-alt">
        <div class="katli-alt-head">
          <span class="katli-alt-ad">${esc(a.baslik)}</span>
          <span class="sub">${a.ozet || ''}</span>
          <button class="btn sm" data-act="katla-alt" data-id="${esc(a.anahtar)}" type="button"
            aria-expanded="${acik ? 'true' : 'false'}">${acik ? 'KAPAT ▴' : 'AÇ ▾'}</button>
        </div>
        ${acik ? `<div class="katli-govde" data-katli="${esc(a.anahtar)}">${a.icerik}</div>` : ''}
        ${a.alt || ''}
      </div>`;
  }

  function markaDetay(state, D, ui) {
    const b = D.brands.find(x => x.id === state.openBrand);
    if (!b) return markaListesi(state, D, ui);
    const now = ui.now();
    const q = norm(state.q);
    const k = kaynak(D, b.id);
    const subeler = D.players.filter(p => p.brand_id === b.id);
    const listeler = D.playlists.filter(p => p.brand_id === b.id);
    const anonslar = D.announcements.filter(a => a.brand_id === b.id);
    const denemeler = D.coffeeAttempts.filter(a => a.brand_id === b.id).slice(0, 8);
    const sonBasarisiz = D.coffeeAttempts.filter(a => a.brand_id === b.id && !a.success
      && (now - new Date(a.created_at).getTime()) < 86400000).length;
    // Bağlantı geçmişi bölümünün özeti: bölüm kapalıyken de “son 24 saatte ne
    // oldu” okunsun.
    const ozetOlay = gecmisOzet(D, ui, { brandId: b.id });
    const olaySayi = olaylariAl(D, { brandId: b.id }).length;
    // Şube bağlantı geçmişi şube şube ayrılır: tek uzun tabloda bütün şubelerin
    // kayıtları karışıyordu, "hangi kafe ne yapıyor" sorusu kayboluyordu. Her
    // şube kendi tablosunda ve kendi silme düğmesiyle durur.
    const subeGecmisleri = subeler.map(p => {
      const kayitlar = olaylariAl(D, { playerId: p.id });
      const son = kayitlar[0];
      return katliAlt({
        state: state, anahtar: 'marka:' + b.id + ':sube:' + p.id, baslik: p.label,
        ozet: son
          ? `${kayitlar.length} kayıt · son ${esc(goreli(son.at, now))}`
          : 'Bu şube için kayıt yok.',
        icerik: `<table>
            <thead><tr><th>OLAY</th><th>TARAF</th><th>ZAMAN</th></tr></thead>
            <tbody>${olayTablosu(D, ui, { playerId: p.id, yer: false }, 12)
              || bos(3, 'Bu şube için henüz olay kaydı yok.')}</tbody>
          </table>`,
        alt: kayitlar.length
          ? `<div class="row" style="margin-top:10px">
              <button class="btn sm danger" data-act="gecmis-del" data-id="${esc(p.id)}" type="button">GEÇMİŞİ SİL</button>
              <span class="sub">Yalnız bu şubenin kayıtları silinir; geri alınamaz.</span>
            </div>`
          : ''
      });
    }).join('');

    const subeSatirlari = subeler
      .filter(p => hit(q, p.label, p.player_key))
      .map(p => {
        // Personel cihazdan başka bir liste seçtiyse şube satırında görünsün:
        // marka sayfası "şubeler gerçekten ne çalıyor" sorusunun cevabı olsun.
        // Şubeye özel yayın verildiyse karşılaştırma onun üzerinden yapılır.
        const ozel = subeKaynagi(D, p.id);
        const kp = ozel.tip ? ozel : k;
        const farkli = p.is_playing ? personelListesi(p, kp, D, now) : null;
        return `<tr class="selectable" data-act="branch-open" data-id="${esc(p.id)}">
        <td><b>${esc(p.label)}</b><span class="sub">${esc(p.player_key)}</span>${ozel.tip
          ? `<span class="sub">özel yayın: <b>${esc(ozel.ad)}</b></span>` : ''}${farkli
          ? `<span class="sub">çalıyor: <b>${esc(farkli.ad)}</b></span>` : ''}</td>
        <td class="tight">${bagliChip(p, now)}${ozel.tip ? chip('gold', 'ÖZEL YAYIN', true) : ''}${farkli ? chip('gold', 'FARKLI LİSTE', true) : ''}</td>
        <td class="tight">${p.last_seen_at ? esc(tarih(p.last_seen_at)) : 'hiç bağlanmadı'}</td>
        <td class="tight">${kilitChip(p)}</td>
        <td><div class="row-actions">
          <button class="btn sm" data-act="player-copy" data-id="${esc(p.id)}" type="button">LİNK</button>
          <button class="btn sm" data-act="branch-open" data-id="${esc(p.id)}" type="button">YÖNET ›</button>
        </div></td>
      </tr>`;
      }).join('');

    const listeSatirlari = listeler.map(pl => {
      const adet = D.playlistTracks.filter(x => x.playlist_id === pl.id).length;
      const kapaksiz = D.playlistTracks.filter(x => x.playlist_id === pl.id)
        .map(x => D.tracks.find(t => t.id === x.track_id)).filter(kapakYok).length;
      const kullanan = D.broadcast.filter(x => x.playlist_id === pl.id).length + subeKullanan(D, pl.id);
      return `<tr class="selectable" data-act="list-open" data-id="${esc(pl.id)}">
        <td><b>${esc(pl.name)}</b><span class="sub">${esc(pl.description || 'açıklama yok')}${kapakYok(pl) ? ' · kapağı yok' : ''}</span></td>
        <td class="tight">${adet} parça${kapaksiz ? ' · ' + kapaksiz + ' kapağı yok' : ''}</td>
        <td class="tight">${kullanan ? chip('live', 'YAYINDA', true) : chip('off', 'kullanılmıyor')}</td>
        <td><div class="row-actions">
          <button class="btn sm" data-act="list-open" data-id="${esc(pl.id)}" type="button">AÇ ›</button>
          <button class="btn sm danger" data-act="list-del" data-id="${esc(pl.id)}" type="button">SİL</button>
        </div></td>
      </tr>`;
    }).join('');

    const anonsSatirlari = anonslar.map(a => `<tr>
      <td><b>${esc(a.label || 'Anons')}</b><span class="sub">${esc(tarih(a.created_at))}</span></td>
      <td><div class="row-actions">
        <button class="btn sm" data-act="anons-play" data-path="${esc(a.storage_path)}" type="button">DİNLE</button>
        <button class="btn sm danger" data-act="anons-del" data-id="${esc(a.id)}"
          data-path="${esc(a.storage_path)}" type="button">SİL</button>
      </div></td>
    </tr>`).join('');

    const denemeSatirlari = denemeler.map(a => `<tr>
      <td class="tight">${a.success ? chip('live', 'DOĞRU KOD', true) : chip('danger', 'YANLIŞ KOD')}</td>
      <td class="tight">${esc(tarih(a.created_at))}</td>
      <td class="tight"><span class="sub">${a.ip ? esc(a.ip) : '—'}</span></td>
    </tr>`).join('');

    return `
      ${geriCubugu('markalar', 'MARKALARA DÖN', [b.name,
        subeler.length + ' şube · ' + listeler.length + ' liste',
        k.ad || 'yayın atanmadı'])}
      <div class="panel" style="margin-bottom:18px">
        <h3>CANLI YAYIN</h3>
        <p class="panel-sub">Markanın bütün şubeleri bu akışı çalar. Bir şubeye kendi yayınını verdiyseniz (<b>Canlı durum › Yayın başlat</b> ekranında şubeyi seçerek) yalnız o şube buradan ayrılır. Marka pasifse, canlı yayın kaydı yoksa ya da kaynak seçilmemişse şubeler yayın bekler ve oynatıcı “bu link tanınmadı” der.</p>
        <div class="row" style="margin-bottom:16px">
          ${b.is_active === false ? chip('danger', 'MARKA PASİF — YAYIN VERİLMEZ') : chip('live', 'MARKA AKTİF', true)}
          <button class="btn${b.is_active === false ? ' primary' : ''}" data-act="brand-active" data-id="${esc(b.id)}" type="button">${b.is_active === false ? 'MARKAYI YAYINA AL' : 'MARKAYI DURDUR'}</button>
          <span class="sub">${b.is_active === false
            ? 'Pasif markanın anahtarı sunucuda tanınmaz; bütün şubeler “bu link tanınmadı” görür.'
            : 'Durdurursanız bu markanın bütün yayın linkleri anında devre dışı kalır.'}</span>
        </div>
        <div class="row" style="margin-top:16px">
          ${k.tip === 'liste' ? chip('live', 'AKTİF LİSTE', true) : (k.tip ? chip('gold', 'AKTİF KLASÖR') : chip('off', 'YAYIN KAPALI'))}
          <b>${esc(k.ad || 'yayın atanmadı')}</b>
          <span class="sub">Kaynağı başlatmak ya da durdurmak <b>Canlı durum › Yayın başlat</b> ekranının işi.</span>
        </div>
        <div class="row" style="margin-top:12px">
          <button class="btn" data-act="marka-yayin-ac" data-id="${esc(b.id)}" type="button">YAYIN BAŞLAT EKRANINA GEÇ</button>
        </div>
        <span class="sub" id="live-msg"></span>
      </div>

      <div class="panel" style="margin-bottom:18px">
        <h3>MÜŞTERİ SUNUMU — LİNK VE ERİŞİM KODU</h3>
        <p class="panel-sub">Markaya verdiğin link ve kod ile sunum sayfasını yalnızca müşteri açabilir.</p>
        <div class="form-grid">
          <div class="field"><label for="brand-slug">LİNK ADI</label>
            <input id="brand-slug" value="${esc(b.slug || '')}" placeholder="link-adi" autocomplete="off"></div>
          <button class="btn" data-act="brand-slug-set" data-id="${esc(b.id)}" type="button">LİNK ADINI KAYDET</button>
          <div class="field"><label for="brand-code">ERİŞİM KODU</label>
            <input id="brand-code" value="${esc(b.access_code || '')}" placeholder="Örn. KAHVE2026" autocomplete="off"></div>
          <button class="btn" data-act="brand-code-set" data-id="${esc(b.id)}" type="button">${b.access_code ? 'KODU GÜNCELLE' : 'KODU KAYDET'}</button>
        </div>
        <span class="sub" id="brand-slug-msg">${b.access_code
          ? 'Kodu değiştirirsen markanın eski kodu ve linki çalışmaz olur.'
          : 'Bu markanın henüz erişim kodu yok.'}</span>
        <hr class="divider">
        <div class="row">
          <span class="key">${esc(ui.brandUrl(b.slug))}</span>
          <button class="btn sm" data-act="copy" data-copy="${esc(ui.brandUrl(b.slug))}" type="button">LİNKİ KOPYALA</button>
          <a class="btn sm" href="${esc(ui.brandUrl(b.slug))}" target="_blank" rel="noopener">SUNUMU AÇ ↗</a>
          ${b.access_code ? `<button class="btn sm" data-act="copy" data-copy="${esc(b.access_code)}" type="button">KODU KOPYALA</button>` : ''}
        </div>
      </div>

      <div class="panel" style="margin-bottom:18px">
        <h3>ŞUBELER (${subeler.length})</h3>
        <table>
          <thead><tr><th>ŞUBE</th><th>DURUM</th><th>SON BAĞLANTI</th><th>CİHAZ</th><th></th></tr></thead>
          <tbody>${subeSatirlari || bos(5, subeler.length ? 'Aramayla eşleşen şube yok.' : 'Bu markanın henüz şubesi yok.')}</tbody>
        </table>
        <hr class="divider">
        <div class="form-grid">
          <div class="field"><label for="p-label">YENİ ŞUBE ADI</label>
            <input id="p-label" placeholder="Örn. Alsancak" autocomplete="off"></div>
          <div class="field"><label for="p-open">AÇILIŞ</label><input id="p-open" type="time"></div>
          <div class="field"><label for="p-close">KAPANIŞ</label><input id="p-close" type="time"></div>
          <button class="btn primary" data-act="player-add" data-id="${esc(b.id)}" type="button">ŞUBE EKLE</button>
        </div>
        <span class="sub" id="p-msg">Saat boş bırakılırsa yayın kesintisiz sürer.</span>
      </div>

      <div class="panel" style="margin-bottom:18px">
        <h3>ÇALMA LİSTELERİ (${listeler.length})</h3>
        <p class="panel-sub">Listedeki değişiklikler yalnızca bu markayı etkiler; genel klasörler değişmez.</p>
        <table>
          <thead><tr><th>LİSTE</th><th>PARÇA</th><th>DURUM</th><th></th></tr></thead>
          <tbody>${listeSatirlari || bos(4, 'Bu markanın henüz çalma listesi yok.')}</tbody>
        </table>
        <hr class="divider">
        <div class="form-grid">
          <div class="field"><label for="playlist-name">YENİ LİSTE ADI</label>
            <input id="playlist-name" placeholder="Örn. Akşam Akışı" autocomplete="off"></div>
          <div class="field"><label for="playlist-source">KAYNAK KLASÖR</label>
            <select id="playlist-source"><option value="">Boş liste oluştur</option>
              ${D.folders.map(f => `<option value="${esc(f.id)}">${esc(f.name)} klasöründen kopyala</option>`).join('')}</select></div>
          <button class="btn primary" data-act="playlist-add" data-id="${esc(b.id)}" type="button">LİSTE OLUŞTUR</button>
        </div>
        <span class="sub" id="playlist-msg">Kaynak klasör seçilirse parçalar bu markaya özel sırayla kopyalanır.</span>
      </div>

      ${katliBolum({
        state: state, anahtar: 'marka:' + b.id + ':anons', baslik: `ANONS GEÇMİŞİ (${anonslar.length})`,
        ozet: anonslar.length
          ? `Son anons ${esc(goreli(anonslar[0].created_at, now))} · “${esc(anonslar[0].label || 'Anons')}”`
          : 'Bu markaya henüz anons gönderilmedi.',
        icerik: `<table><tbody>${anonsSatirlari || bos(2, 'Bu markaya henüz anons gönderilmedi.')}</tbody></table>`,
        alt: `<div class="row" style="margin-top:14px">
          <button class="btn" data-act="mic" data-id="${esc(b.id)}" type="button">🎙 MİKROFONU AÇ</button>
          <span class="sub">Anons, markanın bütün şubelerinde çalan akışın önüne girer.</span>
        </div>`
      })}

      ${katliBolum({
        state: state, anahtar: 'marka:' + b.id + ':giris', baslik: `SUNUM GİRİŞ DENEMELERİ (${denemeler.length})`,
        ozet: denemeler.length
          ? `Son deneme ${esc(goreli(denemeler[0].created_at, now))} · ${sonBasarisiz
            ? sonBasarisiz + ' başarısız (son 24 saat)' : 'son 24 saatte başarısız deneme yok'}`
          : 'Bu markanın sunum sayfasına giriş denemesi olmadı.',
        icerik: `<table><tbody>${denemeSatirlari || bos(3, 'Bu markanın sunum sayfasına giriş denemesi olmadı.')}</tbody></table>`
      })}

      ${katliBolum({
        state: state, anahtar: 'marka:' + b.id + ':olay', baslik: `ŞUBE BAĞLANTI GEÇMİŞİ (${olaySayi})`,
        ozet: ozetOlay.toplam
          ? `<b>Son 24 saat:</b> ${ozetOlay.toplam} olay · bizim tarafta ${ozetOlay.bizde} · kafede ${ozetOlay.kafe}`
          : 'Son 24 saatte kayıtlı olay yok.',
        icerik: `<p class="panel-sub">Kafenin oynatıcıyı açması, personelin liste değiştirmesi ve yayının durması. Her şube kendi tablosunda:
            açtığınızda yalnız o şubenin kayıtları görünür, kalabalık yapan şubeleri kapatabilirsiniz.</p>
          ${subeGecmisleri || bos(3, 'Bu markanın henüz şubesi yok.')}`,
        alt: `<div class="row" style="margin-top:12px">
          <button class="btn sm" data-act="gecmis-ac" data-q="${esc(b.name)}" type="button">TÜM GEÇMİŞİ GEÇMİŞ EKRANINDA AÇ</button>
          ${olaySayi ? `<button class="btn sm danger" data-act="marka-gecmis-del" data-id="${esc(b.id)}" type="button">TÜM GEÇMİŞİ SİL</button>` : ''}
          <span class="sub">Geçmiş ekranı bu markanın şubelerine göre süzülür.</span>
        </div>`
      })}

      <div class="panel">
        <h3>BAKIM</h3>
        <div class="row">
          <button class="btn danger" data-act="brand-del" data-id="${esc(b.id)}" type="button">MARKAYI SİL</button>
          <span class="sub">Şubeler, yayın linkleri, çalma listeleri ve abonelik birlikte silinir. Geri alınamaz.</span>
        </div>
      </div>`;
  }

  // ---------- ÇALMA LİSTELERİ ----------
  function listeListesi(state, D, ui) {
    const q = norm(state.q);
    const satirlar = D.playlists
      .filter(pl => {
        const b = D.brands.find(x => x.id === pl.brand_id);
        return hit(q, pl.name, b ? b.name : '');
      })
      .map(pl => {
        const b = D.brands.find(x => x.id === pl.brand_id);
        const adet = D.playlistTracks.filter(x => x.playlist_id === pl.id).length;
        const kapaksiz = D.playlistTracks.filter(x => x.playlist_id === pl.id)
          .map(x => D.tracks.find(t => t.id === x.track_id)).filter(kapakYok).length;
        const kullanan = D.broadcast.filter(x => x.playlist_id === pl.id).length + subeKullanan(D, pl.id);
        return `<tr class="selectable" data-act="list-open" data-id="${esc(pl.id)}">
          <td><div class="cell-main">${pl.cover_path
            ? `<span class="cover"><img src="${esc(kapakYolu(pl.cover_path, ui))}" alt="" loading="lazy"></span>`
            : '<span class="cover">🎧</span>'}<span><b>${esc(pl.name)}</b>
            <span class="sub">${esc(pl.description || uzunTarih(pl.created_at) + ' tarihinde oluşturuldu')}${kapakYok(pl) ? ' · kapağı yok' : ''}</span></span></div></td>
          <td class="tight">${esc(b ? b.name : '—')}</td>
          <td class="tight">${adet} parça${kapaksiz ? ' · ' + kapaksiz + ' kapağı yok' : ''}</td>
          <td class="tight">${kullanan ? chip('live', kullanan + ' ŞUBEDE', true) : chip('off', 'kullanılmıyor')}</td>
          <td><div class="row-actions">
            <button class="btn sm" data-act="list-open" data-id="${esc(pl.id)}" type="button">AÇ ›</button>
            <button class="btn sm danger" data-act="list-del" data-id="${esc(pl.id)}" type="button">SİL</button>
          </div></td>
        </tr>`;
      }).join('');

    return `
      <div class="panel">
        <h3>ÇALMA LİSTELERİ (${D.playlists.length})</h3>
        <p class="panel-sub">Listeler markaya özeldir; yayın kaynağı olarak markanın sayfasından seçilir.</p>
        <table>
          <thead><tr><th>LİSTE</th><th>MARKA</th><th>PARÇA</th><th>DURUM</th><th></th></tr></thead>
          <tbody>${satirlar || bos(5, 'Henüz çalma listesi yok. Marka sayfasından oluşturabilirsin.')}</tbody>
        </table>
      </div>`;
  }

  function listeDetay(state, D, ui) {
    const pl = D.playlists.find(x => x.id === state.openPlaylist);
    if (!pl) return listeListesi(state, D, ui);
    const b = D.brands.find(x => x.id === pl.brand_id);
    const q = norm(state.q);
    const kayitlar = D.playlistTracks.filter(x => x.playlist_id === pl.id)
      .sort((a, c) => (a.sort_order || 0) - (c.sort_order || 0))
      .map(x => ({ x, t: D.tracks.find(t => t.id === x.track_id) }))
      .filter(r => r.t);
    const gorunen = kayitlar.filter(r => hit(q, clean(r.t.title)));
    const kullanan = D.broadcast.filter(x => x.playlist_id === pl.id).length;
    const kapaksiz = kayitlar.filter(r => kapakYok(r.t)).length;

    const satirlar = gorunen.map((r, i) => {
      const klasor = D.folders.find(f => f.id === r.t.folder_id);
      return `<tr data-idx="${i}" data-kayit="${esc(r.x.id)}">
        <td class="no">${String(kayitlar.indexOf(r) + 1).padStart(2, '0')}</td>
        <td><b>${esc(clean(r.t.title))}</b>${kapakYok(r.t) ? ' ' + chip('gold', 'KAPAK YOK') : ''}</td>
        <td class="tight">${klasor ? chip('off', klasor.name) : chip('off', 'klasör silinmiş')}</td>
        <td class="tight">${mmss(r.t.duration_sec)}</td>
        <td><div class="row-actions">
          <button class="btn sm" data-act="ptrack-play" data-id="${esc(r.t.id)}" type="button">DİNLE</button>
          <button class="btn sm" data-act="ptrack-up" data-id="${esc(r.x.id)}" ${i === 0 ? 'disabled' : ''} type="button">↑</button>
          <button class="btn sm" data-act="ptrack-down" data-id="${esc(r.x.id)}" ${i === gorunen.length - 1 ? 'disabled' : ''} type="button">↓</button>
          <button class="btn sm danger" data-act="ptrack-del" data-id="${esc(r.x.id)}" type="button">ÇIKAR</button>
        </div></td>
      </tr>`;
    }).join('');

    return `
      ${geriCubugu(null, b ? b.name + ' SAYFASINA DÖN' : 'LİSTELERE DÖN', [pl.name,
        (b ? b.name + ' · ' : '') + kayitlar.length + ' parça' + (kullanan ? ' · ' + kullanan + ' şubede' : '')])}
      <div class="row" style="margin-bottom:18px">
        <button class="btn primary" data-act="list-addtrack" data-id="${esc(pl.id)}" type="button">+ ŞARKI EKLE</button>
        <button class="btn danger" data-act="list-del" data-id="${esc(pl.id)}" type="button">LİSTEYİ SİL</button>
        <span class="sub" id="list-msg"></span>
      </div>
      <div class="panel" style="margin-bottom:18px">
        <h3>LİSTE KAPAĞI</h3>
        <p class="panel-sub">Kapak, müşteri sunumunda ve panelde bu listenin simgesi olur. Görseli kendi dosyalarından elle seçersin.</p>
        <div class="row">
          ${kapakHucre(pl.cover_path, ui, '🎧')}
          <button class="btn" data-act="list-img" data-id="${esc(pl.id)}" type="button">${pl.cover_path ? 'KAPAĞI DEĞİŞTİR' : 'KAPAK YERLEŞTİR'}</button>
          <span class="sub">${pl.cover_path ? 'Kapak yerleştirildi.' : 'Bu listenin henüz kapağı yok; sunumda simge görünür.'}</span>
        </div>
      </div>
      <div class="panel" style="margin-bottom:18px">
        <h3>LİSTE ADI</h3>
        <p class="panel-sub">Ad; panelde, müşteri sunumunda ve kafedeki personelin cihazındaki seçicide görünür. Yazım hatası olan adları buradan düzeltebilirsin.</p>
        <div class="form-grid">
          <div class="field"><label for="pl-name">YENİ AD</label>
            <input id="pl-name" value="${esc(pl.name)}" placeholder="Örn. Öğle Molası" autocomplete="off"></div>
          <button class="btn" data-act="list-rename" data-id="${esc(pl.id)}" type="button">ADI KAYDET</button>
        </div>
        <span class="sub" id="list-name-msg">${kullanan
          ? 'Bu liste ' + kullanan + ' şubede yayında; adı değişince panelde ve sunumda yeni ad görünür.'
          : 'Bu liste hiçbir şubeye atanmamış; personel cihazdan seçerse çalar.'}</span>
      </div>
      <div class="panel">
        <h3>AKIŞ (${kayitlar.length})${kapaksiz ? ' ' + chip('gold', kapaksiz + ' KAPAK YOK') : ''}</h3>
        <table>
          <thead><tr><th>#</th><th>PARÇA</th><th>KAYNAK KLASÖR</th><th>SÜRE</th><th></th></tr></thead>
          <tbody>${satirlar || bos(5, kayitlar.length ? 'Aramayla eşleşen parça yok.' : 'Liste boş. “+ ŞARKI EKLE” ile klasörlerden parça seç.')}</tbody>
        </table>
      </div>`;
  }

  // ---------- ABONELİKLER ----------
  const abonelikBitis = ab => !ab ? null : (ab.status === 'trial' ? ab.trial_ends_at : ab.current_end);

  function kalanGun(v) {
    if (!v) return null;
    return Math.ceil((new Date(v).getTime() - Date.now()) / 86400000);
  }
  const DURUM_ETIKET = { trial: 'Deneme', active: 'Aktif', past_due: 'Ödeme gecikti', canceled: 'İptal edildi', expired: 'Süresi doldu' };

  function abonelikListesi(state, D, ui) {
    const q = norm(state.q);
    const planlar = D.plans;
    const satirlar = D.brands
      .filter(b => hit(q, b.name))
      .map(b => {
        const ab = D.subscriptions.find(s => s.brand_id === b.id);
        const plan = ab ? planlar.find(p => p.id === ab.plan_id) : null;
        const kalan = ab ? kalanGun(abonelikBitis(ab)) : null;
        const tutar = plan ? (plan.per_branch ? plan.monthly_price * (ab.branch_count || 1) : plan.monthly_price) : 0;
        const durum = ab ? (DURUM_ETIKET[ab.status] || ab.status) : 'Abonelik yok';
        const renk = kalan == null ? '' : (kalan < 0 ? 'danger' : (kalan <= 3 ? 'gold' : 'live'));
        return `<tr>
          <td><b>${esc(b.name)}</b><span class="sub">${D.players.filter(p => p.brand_id === b.id).length} şube</span></td>
          <td class="tight">
            <select data-ab-plan="${esc(b.id)}" aria-label="Paket">
              <option value="">— paket seç —</option>
              ${planlar.map(p => `<option value="${esc(p.id)}"${ab && ab.plan_id === p.id ? ' selected' : ''}>${esc(p.name)}${p.monthly_price ? ' · ' + p.monthly_price.toLocaleString('tr-TR') + ' TL' : ''}</option>`).join('')}
            </select>
          </td>
          <td class="tight">
            <input type="number" min="1" value="${esc(ab ? ab.branch_count || 1 : 1)}" data-ab-sube="${esc(b.id)}"
              aria-label="Şube sayısı" style="width:74px">
          </td>
          <td class="tight">${ab ? chip(renk, durum) : chip('off', 'yok')}
            <span class="sub">${ab && kalan != null ? (kalan < 0 ? Math.abs(kalan) + ' gün geçti' : kalan + ' gün kaldı') : ''}</span></td>
          <td class="tight">${ab ? esc(uzunTarih(abonelikBitis(ab))) : '—'}
            <span class="sub">${tutar ? tutar.toLocaleString('tr-TR') + ' TL/ay' : ''}</span></td>
          <td><div class="row-actions">
            <button class="btn sm" data-act="ab-extend" data-id="${esc(b.id)}" type="button">SÜRE EKLE</button>
            ${ab ? `<button class="btn sm" data-act="ab-cancel" data-id="${esc(b.id)}" type="button">İPTAL</button>` : ''}
            <button class="btn sm danger" data-act="brand-del" data-id="${esc(b.id)}" type="button">SİL</button>
          </div></td>
        </tr>`;
      }).join('');

    return `
      <div class="panel" style="margin-bottom:18px">
        <h3>YENİ MARKA</h3>
        <div class="form-grid">
          <div class="field"><label for="ab-brand-name">MARKA ADI</label>
            <input id="ab-brand-name" placeholder="Örn. Roast & Co." autocomplete="off"></div>
          <div class="field"><label for="ab-brand-contact">İLETİŞİM</label>
            <input id="ab-brand-contact" placeholder="İsteğe bağlı" autocomplete="off"></div>
          <button class="btn primary" data-act="ab-brand-add" type="button">MARKA OLUŞTUR</button>
        </div>
        <span class="sub" id="ab-brand-msg"></span>
      </div>
      <div class="panel">
        <h3>MARKA ABONELİKLERİ (${D.brands.length})</h3>
        <p class="panel-sub">Paketi seç, şube sayısını yaz, sonra “SÜRE EKLE” ile deneme veya aktif süre ver.</p>
        <table>
          <thead><tr><th>MARKA</th><th>PAKET</th><th>ŞUBE</th><th>DURUM</th><th>BİTİŞ</th><th></th></tr></thead>
          <tbody>${satirlar || bos(6, 'Henüz marka yok.')}</tbody>
        </table>
        <span class="sub" id="ab-msg">${D.subscriptions.length} abonelik kaydı · ${D.plans.length} paket tanımlı</span>
      </div>`;
  }

  // ---------- TALEPLER ----------
  const TALEP_DURUM = { new: 'Yeni', contacted: 'İletişime geçildi', closed: 'Kapandı' };

  function talepListesi(state, D, ui) {
    const q = norm(state.q);
    const list = (D.requests || []).filter(r => hit(q, r.company, r.contact_name, r.email, r.phone));
    const satirlar = list.map(r => `<tr>
      <td><div class="cell-main"><span class="cover">📩</span><span><b>${esc(r.company)}</b>
        <span class="sub">${esc(r.contact_name || '—')} · ${esc(r.email || '—')}${r.phone ? ' · ' + esc(r.phone) : ''}</span></span></div></td>
      <td>${r.branch_count ? esc(r.branch_count + ' şube') : '<span class="sub">—</span>'}
        ${r.message ? `<span class="sub">“${esc(r.message)}”</span>` : ''}</td>
      <td class="tight">${esc(tarih(r.created_at))}</td>
      <td class="tight">
        <select data-act="req-status" data-id="${esc(r.id)}" aria-label="Durum">
          ${Object.keys(TALEP_DURUM).map(s => `<option value="${s}"${r.status === s ? ' selected' : ''}>${TALEP_DURUM[s]}</option>`).join('')}
        </select>
      </td>
      <td><div class="row-actions">
        <button class="btn sm" data-act="req-convert" data-id="${esc(r.id)}" type="button">MARKAYA ÇEVİR</button>
        <button class="btn sm danger" data-act="req-del" data-id="${esc(r.id)}" type="button">SİL</button>
      </div></td>
    </tr>`).join('');

    return `
      <div class="panel">
        <h3>TEKLİF TALEPLERİ (${(D.requests || []).length})</h3>
        <p class="panel-sub">Kahve markalarından gelen başvurular. “MARKAYA ÇEVİR” başvuruyu marka kaydına dönüştürür.</p>
        <table>
          <thead><tr><th>TALEP</th><th>NOT</th><th>GELDİĞİ ZAMAN</th><th>DURUM</th><th></th></tr></thead>
          <tbody>${satirlar || bos(5, (D.requests || []).length ? 'Aramayla eşleşen talep yok.' : 'Henüz talep yok.')}</tbody>
        </table>
      </div>`;
  }

  const SEKMELER = {
    // Canlı durum tek bölüm: şube listesi, yayın başlatma, sağlık denetimi ve
    // bağlantı geçmişi onun alt sekmeleridir.
    canli: [['subeler', 'Şubeler'], ['yayin', 'Yayın başlat'], ['saglik', 'Yayın sağlığı'], ['gecmis', 'Bağlantı geçmişi']],
    icerik: [['klasorler', 'Yayın klasörleri'], ['anonslar', 'Anonslar']],
    musteri: [['markalar', 'Markalar'], ['listeler', 'Çalma listeleri'], ['abonelikler', 'Abonelikler'], ['talepler', 'Talepler']]
  };

  // Canlı durum sekmelerinin başlığına, o sekmenin aciliyeti yazılır: kaç
  // şubede yayın zinciri kopuk, son 24 saatte kaç durma oldu. Menü tek satıra
  // inse bile "iş nerede" bilgisi ekrandan kaybolmaz.
  function sekmeler(state, D) {
    const liste = SEKMELER[state.nav];
    if (!liste) return '';
    const sayilar = state.nav === 'canli' && D
      ? { saglik: saglikOzet(D).kotu || null, gecmis: olaySorunSayi(D) || null }
      : {};
    return `<div class="tabs">${liste.map(([k, l]) => {
      const n = sayilar[k];
      return `<button type="button" data-sub="${k}" class="${state.sub === k ? 'active' : ''}">${esc(n ? `${l} · ${n}` : l)}</button>`;
    }).join('')}</div>`;
  }

  function geriCubugu(sub, metin, cipsler) {
    const hedef = sub === 'klasorler' ? 'klasorler' : (sub === 'markalar' ? 'markalar' : 'listeler');
    return `<div class="row" style="margin-bottom:18px">
      <button class="btn sm" data-act="geri" data-hedef="${hedef}" type="button">← ${esc(metin)}</button>
      ${(cipsler || []).filter(Boolean).map((c, i) => i === 0 ? chip('gold', c) : chip('off', c)).join('')}
    </div>`;
  }

  // ---------- Ana giriş ----------
  // state: {nav, sub, openFolder, openBrand, openPlaylist, q}
  // ---------- YAYIN BAŞLAT ----------
  // Yayını tek ekrandan kurma: marka → şube (ya da bütün şubeler) → kaynak
  // (klasör/çalma listesi) → başlangıç parçası. Hiçbir seçim kendiliğinden
  // yayına geçmez; kararı "YAYINI BAŞLAT" düğmesi verir.
  function yayinView(state, D, ui) {
    const secim = state.yayin || {};
    const marka = D.brands.find(x => x.id === secim.brandId) || null;
    const subeler = marka ? D.players.filter(p => p.brand_id === marka.id) : [];
    const sube = secim.playerId ? (subeler.find(p => p.id === secim.playerId) || null) : null;
    const listeler = marka ? D.playlists.filter(p => p.brand_id === marka.id) : [];
    const [tur, kaynakId] = String(secim.kaynak || '').split(':');
    const kaynakKayit = kaynakId
      ? (tur === 'folder' ? D.folders.find(f => f.id === kaynakId)
        : listeler.find(l => l.id === kaynakId))
      : null;
    const parcalar = kaynakKayit ? kaynakParcalari(D, {
      folder_id: tur === 'folder' ? kaynakId : null,
      playlist_id: tur === 'playlist' ? kaynakId : null
    }) : [];
    const parca = secim.parcaId ? (parcalar.find(t => t.id === secim.parcaId) || null) : null;

    // Şu an ne yayında? Kullanıcı neyi değiştirdiğini görsün.
    const simdiki = sube ? etkinKaynak(D, sube) : (marka ? kaynak(D, marka.id) : null);
    const hedefAd = !marka ? '—' : (sube ? sube.label : 'bütün şubeler');
    const simdikiAd = simdiki && simdiki.ad ? simdiki.ad : 'yayın atanmamış';

    const eksik = !marka ? 'Önce markayı seçin.'
      : (!kaynakKayit ? 'Yayın kaynağını (klasör ya da liste) seçin.'
        : (!parcalar.length ? 'Seçilen kaynakta hiç parça yok; önce parça yükleyin.' : null));

    const secenek = (deger, etiket, secili) =>
      `<option value="${esc(deger)}"${secili ? ' selected' : ''}>${esc(etiket)}</option>`;

    return `
      <div class="panel" style="margin-bottom:18px">
        <h3>YAYINI BAŞLAT</h3>
        <p class="panel-sub">Sırayla seçin: marka, şube, kaynak ve istersen başlangıç parçası. Hiçbir seçim kendiliğinden yayına geçmez;
          yayın, <b>YAYINI BAŞLAT</b> düğmesine basıldığında değişir. Şube seçmezseniz kaynak markanın bütün şubelerine verilir.</p>
        <div class="form-grid">
          <div class="field"><label for="yayin-marka">1 · MARKA</label>
            <select id="yayin-marka" data-act="yayin-marka">
              ${secenek('', '— marka seçin —', !secim.brandId)}
              ${D.brands.map(b => secenek(b.id, b.name + (b.is_active === false ? ' (pasif)' : ''), secim.brandId === b.id)).join('')}
            </select></div>
          <div class="field"><label for="yayin-sube">2 · ŞUBE</label>
            <select id="yayin-sube" data-act="yayin-sube"${marka ? '' : ' disabled'}>
              ${secenek('', '— bütün şubeler (marka geneli) —', !secim.playerId)}
              ${subeler.map(p => secenek(p.id, p.label, secim.playerId === p.id)).join('')}
            </select></div>
        </div>
        <div class="form-grid" style="margin-top:16px">
          <div class="field"><label for="yayin-kaynak">3 · KAYNAK</label>
            <select id="yayin-kaynak" data-act="yayin-kaynak"${marka ? '' : ' disabled'}>
              ${secenek('', '— kaynak seçin —', !kaynakKayit)}
              <optgroup label="Yayın klasörleri">
                ${D.folders.map(f => secenek('folder:' + f.id, f.name, secim.kaynak === 'folder:' + f.id)).join('')}
              </optgroup>
              <optgroup label="${esc(marka ? marka.name : 'Marka')} listeleri">
                ${listeler.map(pl => secenek('playlist:' + pl.id, pl.name, secim.kaynak === 'playlist:' + pl.id)).join('')}
              </optgroup>
            </select></div>
          <div class="field"><label for="yayin-parca">4 · BAŞLANGIÇ PARÇASI</label>
            <select id="yayin-parca" data-act="yayin-parca"${parcalar.length ? '' : ' disabled'}>
              ${secenek('', '— baştan —', !secim.parcaId)}
              ${parcalar.map((t, sira) => secenek(t.id, (sira + 1) + '. ' + t.title, secim.parcaId === t.id)).join('')}
            </select></div>
        </div>

        <hr class="divider">
        <div class="block"><h4>YAYINA GEÇECEK</h4>
          <p class="sub">${marka
            ? `<b>${esc(marka.name)}</b> · ${esc(hedefAd)} · ${kaynakKayit ? '<b>' + esc(kaynakKayit.name) + '</b>' : '<b>kaynak seçilmedi</b>'}${parca ? ' · “' + esc(parca.title) + '” parçasından başlar' : (kaynakKayit && parcalar.length ? ' · baştan başlar' : '')}`
            : 'Henüz marka seçilmedi.'}</p>
          <p class="sub">Şu an bu hedefte: <b>${esc(simdikiAd)}</b>${simdiki && simdiki.tip === 'liste' ? ' (çalma listesi)' : (simdiki && simdiki.tip ? ' (klasör)' : '')}</p>
          <div class="row" style="margin-top:14px">
            <button class="btn primary" data-act="yayin-basla" type="button">YAYINI BAŞLAT</button>
            ${marka && !sube && simdiki && simdiki.tip
              ? `<button class="btn danger" data-act="yayin-durdur" data-id="${esc(marka.id)}" type="button">YAYINI DURDUR</button>`
              : ''}
            <span class="sub">${eksik ? esc(eksik) : (parcalar.length + ' parça · yayın bu seçimle başlar')}</span>
          </div>
          ${marka && !sube && simdiki && simdiki.tip
            ? '<p class="sub">Durdurursanız markanın yayın kaynağı kaldırılır; şubelerde çalmakta olan şarkı kesilmez, cihazlar yüklü listelerini çalmaya devam eder. Yeni bir kaynak atadığınızda kendiliğinden ona geçerler. Markası kapatılan ya da aboneliği biten şubeler yine durur.</p>'
            : ''}
          <span class="sub" id="yayin-msg"></span>
        </div>

        ${sube && subeKaynagi(D, sube.id).tip
          ? `<hr class="divider">
        <div class="block"><h4>ŞUBEYE ÖZEL YAYIN</h4>
          <p class="sub"><b>${esc(sube.label)}</b> markanın genel yayınından ayrılmış ve kendi kaynağını çalıyor.
            Bu atamayı kaldırırsanız şube yeniden <b>${esc(marka.name)}</b> genel yayınını çalar.</p>
          <button class="btn sm danger" data-act="yayin-genel" data-id="${esc(sube.id)}" type="button">GENEL YAYINA DÖNDÜR</button>
        </div>` : ''}
      </div>

      <div class="panel">
        <h3>ŞU AN YAYINDA OLANLAR</h3>
        <p class="panel-sub">Başlatmadan önce mevcut durumu görün: marka geneli kaynak ve ondan ayrılan şubeler.</p>
        <table>
          <thead><tr><th>HEDEF</th><th>KAYNAK</th><th>DURUM</th></tr></thead>
          <tbody>${yayinDurumTablosu(D, ui) || bos(3, 'Henüz marka yok.')}</tbody>
        </table>
      </div>`;
  }

  // Yayın başlatma ekranının altındaki özet: hangi markanın hangi şubesinde ne
  // çalıyor. Marka geneli ve şubeye özel kaynaklar ayrı satırlarda görünür.
  function yayinDurumTablosu(D, ui) {
    const satirlar = [];
    D.brands.forEach(b => {
      const k = kaynak(D, b.id);
      satirlar.push(`<tr>
        <td><b>${esc(b.name)}</b><span class="sub">bütün şubeler${b.is_active === false ? ' · marka pasif' : ''}</span></td>
        <td>${k && k.ad ? esc(k.ad) : '<span class="sub">yayın atanmadı</span>'}</td>
        <td class="tight">${b.is_active === false ? chip('danger', 'YAYIN VERİLMEZ') : (k && k.tip ? chip('live', k.tip === 'liste' ? 'CANLI LİSTE' : 'CANLI KLASÖR', true) : chip('off', 'yayın kapalı'))}</td>
      </tr>`);
      D.players.filter(p => p.brand_id === b.id).forEach(p => {
        const ozel = subeKaynagi(D, p.id);
        if (!ozel.tip) return;
        satirlar.push(`<tr class="selectable" data-act="branch-open" data-id="${esc(p.id)}">
          <td><b>${esc(p.label)}</b><span class="sub">${esc(b.name)} · şubeye özel</span></td>
          <td>${esc(ozel.ad)}</td>
          <td class="tight">${chip('gold', 'ŞUBEYE ÖZEL', true)}</td>
        </tr>`);
      });
    });
    return satirlar.join('');
  }

  function gorunum(state, D, ui) {
    const bas = topbar(state, D, ui.now());
    const kabuk = html => ({ baslik: bas.baslik, alt: bas.alt, html: html });
    if (state.nav === 'canli') {
      const govde = state.sub === 'yayin' ? yayinView(state, D, ui)
        : (state.sub === 'saglik' ? saglikView(state, D, ui)
          : (state.sub === 'gecmis' ? gecmisView(state, D, ui) : canliView(state, D, ui)));
      return kabuk(sekmeler(state, D) + govde);
    }
    if (state.nav === 'icerik') {
      const govde = state.openFolder
        ? klasorDetay(state, D, ui)
        : (state.sub === 'anonslar' ? anonsListesi(state, D, ui) : klasorListesi(state, D, ui));
      return kabuk(sekmeler(state, D) + govde);
    }
    let govde;
    if (state.openPlaylist) govde = listeDetay(state, D, ui);
    else if (state.openBrand) govde = markaDetay(state, D, ui);
    else if (state.sub === 'listeler') govde = listeListesi(state, D, ui);
    else if (state.sub === 'abonelikler') govde = abonelikListesi(state, D, ui);
    else if (state.sub === 'talepler') govde = talepListesi(state, D, ui);
    else govde = markaListesi(state, D, ui);
    return kabuk(sekmeler(state, D) + govde);
  }

  // ---------- Çekmece (şube detayı) ----------
  function subeCekmecesi(id, D, ui) {
    const p = D.players.find(x => x.id === id);
    if (!p) return '';
    const b = D.brands.find(x => x.id === p.brand_id);
    const now = ui.now();
    // Şubenin gerçekte çalacağı kaynak: özel atama varsa o, yoksa markanın geneli.
    const genel = b ? kaynak(D, b.id) : null;
    const ozel = subeKaynagi(D, p.id);
    const k = ozel.tip ? ozel : genel;
    const link = ui.playerBase() + p.player_key;
    const farkli = p.is_playing ? personelListesi(p, k, D, now) : null;
    const kilitBilgi = [
      p.bound_at ? 'kilitlenme: ' + tarih(p.bound_at) : null,
      p.last_ip ? 'IP: ' + p.last_ip : null,
      p.last_ip_at ? 'son görülme: ' + tarih(p.last_ip_at) : null
    ].filter(Boolean).join(' · ');
    return `
      <h3>${esc(p.label)}</h3>
      <p class="sub">${esc(b ? b.name : '—')}${k && k.ad ? ' · ' + esc(k.ad) : ''}</p>
      <div class="row">${bagliChip(p, now)}${caliyorChip(p, now)}${kilitChip(p)}</div>
      ${(canliMi(p, now) && p.is_playing && parcaTaze(p, now))
        ? `<p class="sub">Şu an çalıyor: <b>${esc(p.now_title)}</b> · ${esc(goreli(p.last_seen_at, now))}</p>`
        : ''}
      ${farkli
        ? `<p class="sub">Personel cihazdan başka bir liste seçmiş: <b>${esc(farkli.ad)}</b> · yönetimin atadığı kaynak: <b>${esc(k && k.ad ? k.ad : 'atanmamış')}</b></p>`
        : ''}

      <div class="block"><h4>CANLI YAYIN</h4>
        <p class="sub">Yayın seçimi tek yerden yapılır: <b>Canlı durum › Yayın başlat</b>. Burası yalnız bu şubede ne çaldığını gösterir.</p>
        <div class="row">
          ${ozel.tip ? chip('gold', 'ŞUBEYE ÖZEL', true) : chip('off', 'MARKA GENELİ')}
          <b>${esc(k && k.ad ? k.ad : 'yayın atanmamış')}</b>
        </div>
        <p class="sub">${ozel.tip
          ? 'Bu şube genel yayından ayrılmış: marka genelini değiştirseniz bile buradaki kaynak çalar. Ayrılığı <b>Yayın başlat</b> ekranından kaldırabilirsiniz.'
          : (b ? 'Bu şube ' + esc(b.name) + ' markasının genel yayınını çalar; genel yayın değişince burası da değişir.' : '')}</p>
        <div class="row" style="margin-top:12px">
          <button class="btn" data-act="yayin-ac" data-id="${esc(p.id)}" type="button">YAYIN BAŞLAT EKRANINA GEÇ</button>
        </div>
      </div>

      <div class="block"><h4>YAYIN LİNKİ</h4>
        <div class="key">${esc(link)}</div>
        <div class="row" style="margin-top:12px">
          <button class="btn sm" data-act="copy" data-copy="${esc(link)}" type="button">LİNKİ KOPYALA</button>
          <button class="btn sm" data-act="player-check" data-id="${esc(p.id)}" type="button">BAĞLANTIYI SINA</button>
          <button class="btn sm" data-act="player-kiosk" data-id="${esc(p.id)}" type="button">DOKUNUŞSUZ KURULUM</button>
        </div>
        <p class="sub" style="margin-top:10px">Yayın linki şubeye aittir ve yalnız şube cihazında açılır; buradan link açılmaz, kopyalayıp cihaza verirsiniz.</p>
        ${p.bound_device_id
          ? `<p class="sub">Bu şube <b>başka bir cihaza kilitli</b> (${esc(tarih(p.bound_at))}); yayın yalnızca o cihazda çalar. Başka bir cihazda açmak için önce kilidi sıfırlayın.</p>`
          : '<p class="sub">Bu şube henüz bir cihaza kilitlenmedi; bağlantı <b>ilk açıldığı cihaza kilitlenir</b>.</p>'}
        ${p.last_seen_at ? `<p class="sub">son bağlantı: ${esc(tarih(p.last_seen_at))}</p>` : '<p class="sub">hiç bağlanmadı</p>'}
        ${kilitBilgi ? `<p class="sub">${esc(kilitBilgi)}</p>` : ''}
      </div>

      <div class="block"><h4>YAYIN SAATLERİ</h4>
        <div class="form-grid">
          <div class="field"><label for="d-open">AÇILIŞ</label>
            <input id="d-open" type="time" value="${esc(hhmm(p.open_time))}"
              data-hours="open" data-player="${esc(p.id)}"></div>
          <div class="field"><label for="d-close">KAPANIŞ</label>
            <input id="d-close" type="time" value="${esc(hhmm(p.close_time))}"
              data-hours="close" data-player="${esc(p.id)}"></div>
        </div>
        <p class="sub" style="margin-top:10px">Boş bırakılırsa yayın kesintisiz sürer.</p>
        <span class="sub" id="drawer-msg"></span>
      </div>

      <div class="block"><h4>ANLIK ANONS</h4>
        <p class="sub">Mikrofonla duyuru gönder; ${esc(b ? b.name : 'bu marka')} şubelerinde çalan akışın önüne girer.</p>
        <button class="btn" data-act="mic" data-id="${esc(p.brand_id)}" type="button">🎙 MİKROFONU AÇ</button>
      </div>

      <div class="block">
        <div class="block-head">
          <h4>BAĞLANTI GEÇMİŞİ</h4>
          <button class="btn sm" data-act="katla-yerel" type="button" aria-expanded="false">AÇ ▾</button>
        </div>
        <p class="sub">Bu şubede son olaylar. Duraklama satırındaki taraf, yayını kimin durdurduğunu söyler.</p>
        <p class="sub"><b>${esc(calismaOzeti(D, p, now))}</b></p>
        <div data-yerel-katli hidden>
          <table><tbody>${olayTablosu(D, ui, { playerId: p.id, yer: false }, 12)
            || bos(3, 'Bu şube için henüz olay kaydı yok.')}</tbody></table>
          <div class="row" style="margin-top:12px">
            <button class="btn sm" data-act="gecmis-ac" data-q="${esc(p.label)}" type="button">TÜM GEÇMİŞİ AÇ</button>
          </div>
        </div>
      </div>

      <div class="block"><h4>BAKIM</h4>
        <div class="row">
          ${p.bound_device_id ? `<button class="btn sm" data-act="player-lock" data-id="${esc(p.id)}" type="button">KİLİDİ SIFIRLA</button>` : ''}
          <button class="btn sm danger" data-act="player-del" data-id="${esc(p.id)}" type="button">ŞUBEYİ SİL</button>
        </div>
      </div>`;
  }

  // Şube cihazını "dokunuşsuz" çalıştırma kurulumu. Tarayıcılar sesli otomatik
  // çalmayı engellediği için cihazın bir kez kiosk olarak işaretlenmesi gerekir;
  // komutu şubenin gerçek linkiyle hazır veririz ki kimse elle birleştirmesin.
  function kioskKurulum(link) {
    // Cihazın sayfa açılışında çalması bağlantıdaki kiosk işaretine bağlıdır:
    // normal linkte yayın, biri YAYINI BAŞLAT'a basmadan başlamaz.
    const hedef = link + (link.includes('?') ? '&' : '?') + 'kiosk=1';
    const mac = 'open -a "Google Chrome" --args --autoplay-policy=no-user-gesture-required --kiosk "' + hedef + '"';
    const win = '"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" --autoplay-policy=no-user-gesture-required --kiosk "' + hedef + '"';
    const kopyala = (metin, etiket) => `<div class="key">${esc(metin)}</div>
        <div class="row" style="margin-top:10px">
          <button class="btn sm" data-act="copy" data-copy="${esc(metin)}" type="button">${etiket}</button>
        </div>`;
    return `
      <p class="sub">Bu ayar şube cihazında <b>bir kez</b> yapılır. Komut, şube linkinin sonuna <b>kiosk=1</b> ekler: o işaret olmadan yayın sayfa açılışında başlamaz, çünkü linki açan herkesin bilgisayarında ses çalması istenmez. Bu kurulumdan sonra radyo, cihaz açıldığında ve mesai saatinde kimse düğmeye basmadan çalar.</p>

      <div class="block"><h4>1 · MACOS</h4>
        ${kopyala(mac, 'KOMUTU KOPYALA')}
        <p class="sub" style="margin-top:10px">Terminal'e yapıştırıp çalıştırın: Chrome tam ekran açılır ve yayın kendiliğinden başlar. Her açılışta çalışması için Sistem Ayarları → Genel → Oturum Açma Öğeleri'ne ekleyin.</p>
      </div>

      <div class="block"><h4>2 · WINDOWS</h4>
        ${kopyala(win, 'HEDEFİ KOPYALA')}
        <p class="sub" style="margin-top:10px">Chrome kısayoluna sağ tıklayıp Özellikler → <b>Hedef</b> alanına yapıştırın. Kısayolu Başlangıç klasörüne koyarsanız cihaz açılışında kendiliğinden çalışır.</p>
      </div>

      <div class="block"><h4>3 · BU AYAR YAPILMAZSA</h4>
        <p class="sub">Yayın kendiliğinden başlamaz: sayfa açıldığında ekranda <b>YAYINI BAŞLAT</b> düğmesi çıkar ve bir kez dokunmak gerekir. Şube mesai dışındaysa bu dokunuş yayını hazırlar; çalma, açılış saatinde kendiliğinden başlar.</p>
      </div>`;
  }

  // ---------- Kapak yerleştirme (pencere içeriği) ----------
  // Kapaklar sahada görünüyor: oynatıcı ekranında, müşteri sunumunda ve panelde.
  // Yönetim kapağı elle yerleştirir (indirilmiş görseli seçer), bu yüzden
  // pencerede **seçtiği görseli kaydetmeden önce** görür: hangi görselin hangi
  // parçaya gittiği karışmasın. Aynı pencere parça, liste ve klasör için
  // kullanılır; kayıt düğmesinin adı bile aynı kalır.
  function kapakPenceresi({ kapakUrl, alt, mevcutVar }) {
    return `
      <div style="text-align:center;margin-bottom:16px">
        <span id="kapak-kutu" style="display:inline-grid;place-items:center;width:190px;height:190px;border-radius:16px;overflow:hidden;background:rgba(255,255,255,.07)">
          <img id="kapak-onizleme" src="${esc(kapakUrl || '')}" alt=""${kapakUrl ? '' : ' hidden'}
            style="width:100%;height:100%;object-fit:cover">
          <span id="kapak-bos"${kapakUrl ? ' hidden' : ''} style="font-size:40px;opacity:.45">♪</span>
        </span>
        <p class="sub" style="margin:10px 0 0">${esc(alt || '')}</p>
      </div>
      <div class="field"><label for="kapak-file">GÖRSEL SEÇ</label>
        <input id="kapak-file" type="file" accept="image/*"></div>
      <p class="sub" id="kapak-msg">Seçtiğin görsel yukarıda görünür; kaydettiğinde yayına geçer. Kare (1:1) görseller en iyi sonucu verir.</p>
      ${mevcutVar
        ? '<button class="btn danger" data-act="kapak-sil" type="button" style="margin-top:12px">KAPAĞI KALDIR</button>'
        : ''}`;
  }

  // ---------- Parça detayı (pencere içeriği) ----------
  function parcaDetay(t, alt, kapakUrl) {
    return `<div style="text-align:center">
      ${kapakUrl
        ? `<img src="${esc(kapakUrl)}" alt="" style="width:220px;height:220px;border-radius:18px;object-fit:cover;display:block;margin:0 auto 18px">`
        : '<div style="width:220px;height:220px;border-radius:18px;background:rgba(255,255,255,.08);margin:0 auto 18px;display:grid;place-items:center;font-size:46px;opacity:.45">♪</div>'}
      <h3 style="margin:0 0 6px;font-size:19px">${esc(clean(t.title))}</h3>
      <p style="margin:0;color:var(--muted);font-size:13px">${esc(alt || '')}</p>
    </div>`;
  }

  const api = {
    esc: esc,
    clean: clean,
    mmss: mmss,
    hhmm: hhmm,
    canliMi: canliMi,
    kaynak: kaynak,
    abonelikBitis: abonelikBitis,
    kalanGun: kalanGun,
    nav: nav,
    topbar: topbar,
    gorunum: gorunum,
    subeCekmecesi: subeCekmecesi,
    subeKaynagi: subeKaynagi,
    anahtarGecerli: anahtarGecerli,
    kioskKurulum: kioskKurulum,
    saglikTani: saglikTani,
    saglikOzet: saglikOzet,
    saglikView: saglikView,
    saglikChip: saglikChip,
    goreli: goreli,
    yayinHucresi: yayinHucresi,
    parcaTaze: parcaTaze,
    bildirimTaze: bildirimTaze,
    calanListe: calanListe,
    personelListesi: personelListesi,
    olayBilgi: olayBilgi,
    olaylariAl: olaylariAl,
    olayTablosu: olayTablosu,
    yayinView: yayinView,
    yayinDurumTablosu: yayinDurumTablosu,
    gecmisOzet: gecmisOzet,
    olaySorunSayi: olaySorunSayi,
    sureMetni: sureMetni,
    mesaiParcalari: mesaiParcalari,
    kesintiHesap: kesintiHesap,
    calismaOzeti: calismaOzeti,
    calismaTablosu: calismaTablosu,
    suanTablosu: suanTablosu,
    gecmisView: gecmisView,
    sonGunler: sonGunler,
    gunEtiketi: gunEtiketi,
    gunlukSeri: gunlukSeri,
    trendTablosu: trendTablosu,
    mesaideMi: mesaideMi,
    suanDurum: suanDurum,
    sessizSubeler: sessizSubeler,
    sessizSayi: sessizSayi,
    sureCumle: sureCumle,
    uyariSeridi: uyariSeridi,
    kapakYok: kapakYok,
    kapakPenceresi: kapakPenceresi,
    parcaDetay: parcaDetay,
    geriCubugu: geriCubugu,
    katliDurumOku: katliDurumOku,
    katliDurumYaz: katliDurumYaz
  };

  if (typeof window !== 'undefined') window.DerinRadyoViews = api;
  if (typeof module !== 'undefined') module.exports = api;
})();
