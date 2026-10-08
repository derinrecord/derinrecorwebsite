const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const views = require('../radyo-panel-views.js');
const source = fs.readFileSync(require.resolve('../radyo-yonetim.js'), 'utf8');

// Panel 2026-09'da yeniden düzenlendi: ana sayfadaki 6 kart yerine her işin
// kendi menü girdisi var. Abonelikler ve Talepler ayrı ekranlar olarak kalmalı
// (biri müşteri sözleşmeleri, diğeri gelen başvurular).
// Yayın başlatma ekranı: marka → şube → kaynak → parça seçilir, hiçbir seçim
// kendi başına yayına geçmez; yayın yalnız "YAYINI BAŞLAT" ile değişir. Şube
// seçilmezse marka geneline (brand_broadcast), seçilirse o şubeye yazılır.
test('yayın başlatma ekranı seçimleri ancak düğmeyle yayına alır', () => {
  assert.match(source, /yayin: \{ nav: 'canli', sub: 'yayin' \}/);
  ['yayin-marka', 'yayin-sube', 'yayin-kaynak', 'yayin-parca'].forEach(act => {
    assert.ok(source.includes("'" + act + "'"), act + ' seçimi dinlenmeli');
  });

  const bas = source.indexOf("case 'yayin-basla'");
  assert.ok(bas > 0, 'yayın başlatma düğmesi bağlanmalı');
  const blok = source.slice(bas, source.indexOf("case 'branch-open'", bas));
  assert.ok(blok.includes("from('brand_broadcast')"), 'şube seçilmezse marka geneline yazılmalı');
  assert.ok(blok.includes("from('player_broadcast')"), 'şube seçilirse o şubeye yazılmalı');
  assert.ok(blok.includes('start_track_id'), 'başlangıç parçası kaydedilmeli');
  assert.match(blok, /onaySor\(/, 'yayına geçmeden önce onay alınmalı');

  // Seçim dinleyicileri yalnız ekranı tazeler; sunucuya yazmaz.
  const secim = source.slice(
    source.indexOf("if (act === 'yayin-marka'"),
    source.indexOf("if (act === 'req-status'")
  );
  assert.ok(secim.includes('ciz()'), 'seçim ekranı yeniden çizmeli');
  assert.ok(!secim.includes('client.from('), 'seçim tek başına yayına yazmamalı');

  // Şube çekmecesi yayın başlatmanın ikinci yolu değildir: yalnız durumu
  // gösterip yöneticiyi yayın ekranına taşır, geri alma kararı da oradan verilir.
  assert.match(source, /case 'yayin-ac'/);
  assert.match(source, /case 'yayin-genel'/);
  // Marka sayfasındaki kaynak seçicisi kaldırıldı: başlatma/durdurma da yalnız
  // yayın ekranında. Marka sayfası oraya yollar.
  assert.match(source, /case 'marka-yayin-ac'/);
  assert.match(source, /case 'yayin-durdur'/);
  assert.ok(!source.includes("'live-source'"), 'marka sayfasından kaynak yazılmamalı');
});

test('abonelikler ve talepler ayrı menü girdileri olarak kalır', () => {
  const html = views.nav(
    { nav: 'musteri', sub: 'markalar' },
    { players: 0, folders: 0, announcements: 0, brands: 0, playlists: 0, requests: 0 },
    { ad: 'Yönetici', alt: '', basHarf: 'Y' }
  );

  const abonelikler = html.indexOf('data-sub="abonelikler"');
  const talepler = html.indexOf('data-sub="talepler"');
  assert.ok(abonelikler >= 0, 'Abonelikler menüde olmalı');
  assert.ok(talepler > abonelikler, 'Talepler ayrı bir girdi olmalı');
});

test('panel hem abonelik hem talep ekranını yönlendirir', () => {
  assert.match(source, /abonelikler: \{ nav: 'musteri', sub: 'abonelikler' \}/);
  assert.match(source, /talepler: \{ nav: 'musteri', sub: 'talepler' \}/);
});

// Yeni marka oluştururken is_active yazılmazsa sunucu yayını vermez ve şube
// linki "bu link tanınmadı" der; bu yüzden alan açıkça true yazılmalı ve
// yayına al/durdur düğmesi bulunmalı.
test('panel markayı aktif yazar ve yayın durumunu değiştirebilir', () => {
  assert.match(source, /case 'brand-active'/);
  assert.match(source, /is_active: acilacak/);
  const ekler = source.match(/is_active: true/g) || [];
  assert.ok(ekler.length >= 2, 'marka oluşturan iki akış da is_active: true yazmalı');
});

// Bağlantı sınaması oynatıcının sunucudaki koşullarını panelde de kontrol eder.
test('bağlantı sınaması yerel koşulları tek tek raporlar', () => {
  ['Marka durumu', 'Canlı yayın satırı', 'Yayın kaynağı', 'Kaynaktaki parça', 'Abonelik']
    .forEach(satir => assert.ok(source.includes(satir), `${satir} satırı raporlanmalı`));
  assert.match(source, /panel_eksikleri/);
});

// "Yayın sağlığı" ekranı bütün şubelerin zincirini tek listede denetler;
// sunucu doğrulaması da cihaz kilidini bağlamamalıdır.
test('yayın sağlığı ekranı rotalanır ve cihaz kilidini bağlamaz', () => {
  assert.match(source, /saglik: \{ nav: 'canli', sub: 'saglik' \}/);
  assert.match(source, /case 'saglik-denetle'/);
  const bas = source.indexOf("case 'saglik-denetle'");
  const son = source.indexOf("case 'branch-open'", bas);
  assert.ok(son > bas);
  assert.ok(!source.slice(bas, son).includes("rpc('radio_ping'"), 'denetim radio_ping çağırmamalı');
  assert.match(source, /V\.saglikChip\(/);
  assert.match(source, /saglikSonuc: id =>/);
  assert.match(source, /V\.saglikTani\(p, D\)/);
});

// abonelik_durumu yalnızca anahtarı tanıdığında satır döner. Satır geçerliyse
// anahtar tanınıyordur; bu durumda "anahtar tanınmadı" demek kullanıcıyı yanlış
// halkaya (linke) baktırıyordu. Doğru cevap "yayın zinciri kopuk" olmalı.
test('sınama, anahtar tanınırken yayın boşsa yanlış halkayı göstermez', () => {
  const sina = source.slice(
    source.indexOf('async function sunucuSina'),
    source.indexOf('function kaynakPenceresi')
  );
  assert.ok(sina.includes("'anahtar var, yayın zinciri kopuk'"), 'sınama doğru teşhisi vermeli');
  assert.ok(sina.indexOf('abRow.gecerli') < sina.indexOf("'anahtar tanınmadı'"), 'abonelik satırı varsa önce o değerlendirilmeli');

  const cekmece = source.slice(source.indexOf('async function baglantiSina'));
  assert.ok(cekmece.includes('Anahtar tanınıyor ama yayın boş'), 'çekmece raporu da aynı ayrımı yapmalı');
});

// Sağlık ekranındaki düzeltmeler yerinde uygulanır: kayıt güncellenir, eski
// sunucu cevabı silinir ve satır yeniden hesaplanıp yeşile döner.
test('sağlık ekranı düzeltmeleri yerinde uygular', () => {
  assert.match(source, /case 'saglik-fix'/);
  ['marka-aktif', 'kaynak', 'abonelik', 'parca', 'cekmece', 'anahtar'].forEach(tip =>
    assert.ok(source.includes(`'${tip}'`), `${tip} düzeltmesi bağlanmalı`));
  assert.match(source, /from\('brands'\)\.update\(\{ is_active: true \}\)/);
  assert.match(source, /from\('brand_broadcast'\)\.upsert\(/);
  assert.match(source, /from\('subscriptions'\)\.upsert\(/);
  // Eski sunucu cevabı kalırsa satır yeşile dönse de kırmızı görünürdü.
  assert.ok((source.match(/delete saglikSonuc\[/g) || []).length >= 2);
});

// Sunucu yayın anahtarını uuid olarak bekler. Şube eklerken anahtarı açıkça
// üretmezsek veritabanı varsayılanına kalırız; alan boş kalırsa panelin
// kopyaladığı link "...?key=null" olur ve sahadaki oynatıcı hiç açılmaz.
test('şube eklerken anahtar açıkça üretilir ve bozuk anahtar kopyalanmaz', () => {
  const ekle = source.slice(source.indexOf("case 'player-add'"), source.indexOf("case 'folder-open'"));
  assert.ok(ekle.includes('player_key: crypto.randomUUID()'), 'anahtar istemcide üretilip gönderilmeli');

  const kopyala = source.slice(source.indexOf("case 'player-copy'"), source.indexOf("case 'player-check'"));
  assert.ok(kopyala.includes('V.anahtarGecerli'), 'kopyalamadan önce anahtar doğrulanmalı');

  // Bozuk anahtar şubeyi silmeyi gerektirmez: kayıt yerinde kalır, anahtar tazelenir.
  const yenile = source.slice(source.indexOf("if (tip === 'anahtar')"), source.indexOf("case 'saglik-denetle'"));
  assert.ok(yenile.includes('player_key: crypto.randomUUID()'), 'yeni anahtar üretilmeli');
  assert.ok(yenile.includes(".update("), 'anahtar yerinde güncellenmeli');
});

// Kurulum komutu yalnızca geçerli anahtarla verilmeli: bozuk anahtarla verilen
// komut, cihazı hiç açılmayan bir linke kilitler.
test('dokunuşsuz kurulum yalnızca geçerli anahtarla açılır', () => {
  assert.match(source, /case 'player-kiosk'/);
  const kol = source.slice(source.indexOf("case 'player-kiosk'"), source.indexOf("case 'player-check'"));
  assert.ok(kol.includes('V.anahtarGecerli'), 'anahtar doğrulanmalı');
  assert.ok(kol.includes('V.kioskKurulum'), 'komut görünüm katmanından gelmeli');
});

// Markaya liste eklenmemişse (ya da listeler okunamıyorsa) sunum sessizce boş
// kalıyordu ve "bu listede parça yok" diyordu; ortada liste olmadığını söylemeli.
test('sunum, liste yokken yanıltıcı boş liste mesajı vermez', () => {
  const kaynak = fs.readFileSync(require.resolve('../coffee-marka.js'), 'utf8');
  assert.ok(kaynak.includes('function bosSunum'), 'boş sunum durumu tanımlanmalı');
  assert.match(kaynak, /if \(!listeler\.length\) bosSunum\(\)/);
  assert.ok(kaynak.includes('henüz çalma listesi eklenmemiş'));
  assert.ok(kaynak.includes('Sunum hazırlanmayı bekliyor'));
});

// Çalan parça alanları sonradan eklendi; panel onları ayrı ve hataya toleranslı
// bir sorguyla çekmeli. Ana veri sorgusuna karıştırılsaydı, alanlar eklenmeden
// panel hiç açılmazdı.
test('panel çalan parça alanlarını hataya toleranslı yükler', () => {
  assert.match(source, /from\('brand_players'\)\.select\('id,now_title,now_at'\)/);
  assert.match(source, /calanlar\.error/, 'sorgu hatası ana yüklemeyi bozmamalı');
});

// Kurulum SQL'i depoda olmalı: kurulumu yapan kişi neyi çalıştırdığını görebilsin.
test('çalan parça kurulumu SQL dosyası olarak depoda', () => {
  const sql = fs.readFileSync(require.resolve('../supabase/radio-calan-parca.sql'), 'utf8');
  assert.match(sql, /add column if not exists now_title text/);
  assert.match(sql, /add column if not exists now_at timestamptz/);
  assert.match(sql, /create or replace function public\.radio_now_report/);
  assert.match(sql, /security definer/);
  assert.match(sql, /grant execute on function public\.radio_now_report/);
  // Var olan radio_ping yeniden tanımlanmamalı: cihaz kilidi bozulmasın.
  assert.ok(!/create or replace function public\.radio_ping/.test(sql));
});

// Liste adı sahaya çıkıyor (panel, müşteri sunumu, personelin cihaz seçicisi).
// Yazım hatası olan bir adı düzeltebilmek için panel kaydetmeyi bilmeli ve
// kaydedilen ad temizlenmeli; " oğğle  molası " gibi bir ad yeniden sahaya
// düşmemeli.
test('panel liste adını düzenleyip kaydedebilir', () => {
  assert.match(source, /case 'list-rename'/);
  assert.ok(/from\('brand_playlists'\)\.update\(\{ name: ad \}\)/.test(source), 'ad güncellenmeli');
  assert.match(source, /replace\(\/\\s\+\/g, ' '\)/, 'çoklu boşluklar temizlenmeli');
  assert.ok(source.includes('Liste adı boş olamaz'), 'boş ad reddedilmeli');
});

// Kapaklar elle yerleştirilir: yönetim indirdiği görseli kendi seçer. Üç kayıt
// türü de aynı akışı kullanmalı ve değiştirilen kapağın eski dosyası depodan
// silinmeli; yoksa depoda kimsenin görmediği eski görseller birikir.
test('panel kapakları elle yerleştirir ve eskisini depodan temizler', () => {
  ['cover-open', 'track-img', 'list-img', 'kapak-sil'].forEach(act =>
    assert.ok(source.includes(`case '${act}'`), `${act} işlenmeli`));
  assert.ok(source.includes("DerinR2.yukle(KAPAK_BUCKET"), 'kapaklar R2\'deki radio-covers klasörüne yüklenmeli');
  assert.ok(source.includes("KAPAK_BUCKET = 'radio-covers'"), 'kapak kovası radio-covers olmalı');
  ['radio_tracks', 'brand_playlists', 'radio_folders'].forEach(tablo =>
    assert.ok(new RegExp('from\\(' + "'" + tablo + "'" + '\\)\\.update\\(\\{ cover_path: yol \\}\\)').test(source),
      `${tablo} kapağı kaydedilmeli`));
  assert.match(source, /kapakDosyaSil\(s\.kapak\)/, 'değiştirilen kapağın dosyası silinmeli');
  assert.ok(source.includes('function kapakOnizlemeBirak'), 'önizleme blob adresi bırakılmalı');
  // Kayıt tutmazsa yüklenen dosya geri silinmeli: depoda sahipsiz görsel kalmasın.
  assert.match(source, /if \(kayitHatasi\) \{ await kapakDosyaSil\(yol\)/);
  // Önizlemesiz eski tek yol kalkmalı: tek akış kalsın.
  assert.ok(!source.includes("hedef.id === 'cover-file'"), 'eski dosya alanı akışı kalkmalı');
});

test('parça ya da klasör silinince kapak dosyası da temizlenir', () => {
  const parcaSil = source.slice(source.indexOf("case 'track-del'"));
  assert.ok(parcaSil.slice(0, 900).includes('kapakDosyaSil(t.cover_path)'));
  // Sabit karakter penceresi yerine işleyicinin tamamına bakılır: araya yorum
  // ya da yeni bir adım girmesi bu korumayı düşürmemeli.
  const klasorBas = source.indexOf("case 'folder-del'");
  const klasorSil = source.slice(klasorBas, source.indexOf("case '", klasorBas + 10));
  assert.ok(klasorSil.includes('kapakDosyaSil(f && f.cover_path)'));
  assert.ok(klasorSil.includes('for (const t of parcalar) await kapakDosyaSil(t.cover_path)'));
});

test('liste bildirimi kurulumu SQL dosyası olarak depoda', () => {
  const sql = fs.readFileSync(require.resolve('../supabase/radio-liste-bildirimi.sql'), 'utf8');
  assert.match(sql, /add column if not exists now_playlist_id uuid/);
  assert.match(sql, /add column if not exists now_playlist_name text/);
  assert.match(sql, /p_playlist_id uuid default null/);
  assert.match(sql, /grant execute on function public\.radio_now_report\(uuid, text, uuid, uuid, text\)/);
  // Eski üç parametreli sürüm düşürülmeli: aynı ada iki imza kalırsa PostgREST
  // hangisini çağıracağını bilemez (PGRST203) ve bildirim reddedilir.
  assert.match(sql, /drop function if exists public\.radio_now_report\(uuid, text, uuid\)/);
  // Cihaz kilidi bozulmasın.
  assert.ok(!/create or replace function public\.radio_ping/.test(sql));
});

test('sunum sayfası yeni tasarımı ve fade geçişlerini yükler', () => {
  const sunum = fs.readFileSync(require.resolve('../coffee-marka.html'), 'utf8');
  assert.match(sunum, /marka-sunum\.css/);
  assert.match(sunum, /coffee-marka\.js\?v=\d+/);

  const kaynak = fs.readFileSync(require.resolve('../coffee-marka.js'), 'utf8');
  ['KAPANMA_MS', 'ACILMA_MS', 'uctanGecis', 'fade('].forEach(iz =>
    assert.ok(kaynak.includes(iz), `${iz} geçiş kodunda olmalı`));
  assert.ok(!kaynak.includes('sp-player'), 'eski sabit oynatıcı barı kullanılmamalı');
});

test('panel sayfası görünüm modülünü ve stil dosyasını yükler', () => {
  const sayfa = fs.readFileSync(require.resolve('../radyo-yonetim.html'), 'utf8');
  assert.match(sayfa, /radyo-panel-views\.js/);
  assert.match(sayfa, /radyo-panel\.css/);
  assert.match(sayfa, /audio-file-types\.js/);
  // Bozuk HTML: script etiketi </html> sonrasına yazılmamalı.
  assert.ok(sayfa.trimEnd().endsWith('</html>'), 'dosya </html> ile bitmeli');
});

// Kapak penceresi kaydı iki yerden açabilmeli: satırdaki düğme data-id ile
// seçer, klasör sayfasındaki düğme ise açık klasörü kullanır.
test('kapak penceresi hem satırdan hem açık klasörden açılabilir', () => {
  assert.ok(source.includes('x.id === (id || state.openFolder)'),
    'kapak penceresi data-id ile klasör seçebilmeli');
  assert.ok(!source.includes('kapaksizSayi'), 'kapak denetimi ekranı kaldırıldı: menüde sayaç olmaz');
});

// Bağlantı geçmişi: sahada "yayın durdu" diye gelen şikâyetin kimden çıktığını
// gösterecek ekran, yönlendirmesi ve verisi panelde eksiksiz bağlı olmalı.
test('panel bağlantı geçmişi ekranını yönlendirir ve olayları yükler', () => {
  assert.match(source, /gecmis: \{ nav: 'canli', sub: 'gecmis' \}/);
  assert.match(source, /'#\/gecmis'/, 'adres çubuğu geçmiş ekranını yazabilmeli');
  assert.ok(source.includes("from('radio_player_events')"), 'olaylar panelde okunmalı');
  assert.match(source, /olaylar: olaylar\.data \|\| \[\]/);
  assert.match(source, /olaySorun: V\.olaySorunSayi\(D\)/, 'menü son 24 saatteki arızayı okumalı');
  assert.match(source, /case 'gecmis-ac'/, 'çekmeceden geçmişe geçiş işlenmeli');
});

// Çekmece içeriği tek seferlik HTML olarak yazılır (panel gibi yeniden çizilmez),
// bu yüzden çekmecedeki katlama durum tutmaz; gövdeyi yerinde açar/kapatır.
test('çekmecedeki katlama yerinde işlenir, paneli yeniden çizmez', () => {
  assert.match(source, /case 'katla-yerel'/);
  const blok = source.slice(source.indexOf("case 'katla-yerel'"), source.indexOf("case 'cikis'"));
  assert.ok(blok.includes('data-yerel-katli'), 'gövde yerinde bulunmalı');
  assert.ok(!blok.includes('ciz()'), 'çekmece katlaması paneli yeniden çizmemeli');
});

// Katlanma tercihi tarayıcıda saklanır: yönetici canlı durum ekranında uzun bir
// tabloyu kapattıysa, sayfayı yenilediğinde (ya da canlı veri ekranı yeniden
// çizdiğinde) onu kapalı bulmalı. Aksi hâlde her açılışta dört uzun tabloyu
// yeniden kapatmak zorunda kalırdı.
test('katlanma tercihi tarayıcıda saklanır ve açılışta geri okunur', () => {
  assert.match(source, /'derin:katli-radyo'/);
  assert.match(source, /V\.katliDurumOku\(localStorage\.getItem/, 'açılışta kayıttan okunmalı');
  assert.match(source, /V\.katliDurumYaz\(state\)/, 'tercih görünüm katmanının saf yardımcısıyla yazılmalı');

  // İki katlama yolu da kaydı güncellemeli; biri atlarsa tercih yarı yarıya
  // hatırlanır (bölüm ekran değişince eski hâline döner).
  ["case 'katla'", "case 'katla-alt'"].forEach(etiket => {
    const blok = source.slice(source.indexOf(etiket), source.indexOf('return;', source.indexOf(etiket)));
    assert.ok(blok.includes('katliYaz()'), etiket + ' tercihi kaydetmeli');
  });

  // Depo kapalı/bozuk olduğunda panel çalışmaya devam etmeli; kayıt okuma ve
  // yazma try/catch içinde olmalı (gizli sekme, kota dolu).
  assert.match(source, /try \{ localStorage\.setItem\(KATLI_ANAHTARI/);
  assert.match(source, /try \{\s*const kayit = V\.katliDurumOku/);
});

// Çalma listeleri sekmesi ve elle yayın atama formu tümüyle kaldırıldı. Liste
// oluşturma/silme marka sayfasında, şubeye liste atama şube çekmecesindeki
// "LİSTE ATA" penceresinde. Panel kendiliğinden hiçbir şey atamaz.
test('çalma listeleri sekmesi ve elle yayın atama tümüyle kalktı', () => {
  assert.ok(!source.includes("listeler: { nav: 'musteri', sub: 'listeler' }"), 'liste rotası kalmamalı');
  assert.ok(!source.includes("state.sub === 'listeler'"), 'liste sekmesi adresi üretilmemeli');
  assert.ok(!source.includes("case 'liste-ata'"), 'elle atama yazma yolu kalmamalı');
  assert.ok(!source.includes('ata-hedef-'), 'hedef kutusu okunmamalı');
  assert.ok(!source.includes('ata-kaynak-'), 'kaynak kutusu okunmamalı');

  const views = fs.readFileSync(require.resolve('../radyo-panel-views.js'), 'utf8');
  assert.ok(!views.includes('ELLE YAYIN ATAMA'), 'elle atama formu çizilmemeli');
  assert.ok(!views.includes('function ataFormu'), 'elle atama formu kalmamalı');
  assert.ok(!views.includes('function listeListesi'), 'liste indeksi ekranı kalmamalı');
  assert.ok(!views.includes('function markaKlasoru'), 'marka klasörü kalmamalı');
  assert.ok(!views.includes('function subeDurumTablosu'), 'şube durum tablosu kalmamalı');
  // Şubeye atamanın tek girişi şube çekmecesi: düğme orada kalmalı.
  assert.ok(views.includes('data-act="sube-listeler"'), 'atama düğmesi çekmecede olmalı');

  // Klasör tablosu geri gelmez: gruplama marka sayfasındadır, SQL gerekmez.
  assert.ok(!source.includes('brand_playlist_folders'), 'klasör tablosu okunmamalı');
  ['liste-tasi', 'liste-klasor-ekle', 'liste-klasor-sil', 'ata-ac'].forEach(act =>
    assert.ok(!source.includes("'" + act + "'"), act + ' olayı olmamalı'));
});

// Şubeye liste yükleme: markanın her listesi her şubeye ait değildir. Panel
// şubeye yüklenenleri yazar; cihaz yalnız bunları gösterir, hiçbiri yoksa susar.
test('panel şubeye liste yüklemeyi bağlar', () => {
  // Özellik tablosu kurulmadan panel çalışmaya devam etmeli: sorgu hataya
  // toleranslı okunur ve tablo yokken yükleme sütunu hiç çizilmez.
  assert.match(source,
    /from\('player_playlists'\)\s*\.select\('player_id,playlist_id,sort_order'\)/);
  assert.match(source, /D\.subeListeleriVar = true/, 'tablo varsa özellik açılmalı');
  assert.match(source, /case 'sube-listeler'/);
  assert.match(source, /V\.subeListePenceresi\(D, ui, p\)/);
  assert.match(source, /case 'sube-liste-hepsi'/, 'toplu işaretleme bağlanmalı');

  const blok = source.slice(source.indexOf('async function subeListeleriKaydet'), source.indexOf('// ---------- Çekmece'));
  assert.match(blok, /if \(!kullanici\.adminMi\) return hata\('Şube listesi yüklemek/,
    'yükleme yönetici kapısından geçmeli');
  // Hedef de kaynak da elle: şubeler ayrı kutulardan okunur, hiçbiri seçilmezse
  // kayıt yapılmaz.
  assert.match(blok, /querySelectorAll\('\[data-sube-hedef\]'\)/, 'işaretli şubeler okunmalı');
  assert.match(blok, /En az bir şube işaretle/, 'şubesiz kayıt engellenmeli');
  assert.match(blok, /querySelectorAll\('\[data-sube-liste\]'\)/, 'işaretli kutular okunmalı');
  // Tek KAYDET, işaretli her şubeyi dolaşır: aynı liste kümesi hepsine yazılır.
  assert.match(blok, /for \(const p of hedefler\)/, 'her işaretli şube için yazılmalı');
  assert.ok(blok.includes("from('player_playlists').insert("), 'işaretlenenler yazılmalı');
  assert.match(blok, /\.delete\(\)[\s\S]*?\.in\('playlist_id'/, 'işareti kaldırılanlar silinmeli');
  // Boş liste kaydedilebilir; ama kayıttan sonra yönetici "çalıyor" sanmasın
  // diye bildirim parçasız listeleri ayrıca sayar.
  assert.match(blok, /bosSecilen/, 'parçasız seçilen listeler hesaplanmalı');
  assert.match(blok, /listede hiç parça yok/, 'bildirim boş listeyi söylemeli');
});

// Veritabanı tarafı: tablo yalnız yöneticiye açık, cihaz listeleri şube
// anahtarını doğrulayan fonksiyondan alır; ilk kurulum mevcut davranışı yazar.
test('şube listeleri SQL\'i yöneticiye kapalı cihaza fonksiyonla açık', () => {
  const sql = fs.readFileSync(require.resolve('../supabase/radio-sube-listeleri.sql'), 'utf8');
  assert.match(sql, /create table if not exists public\.player_playlists/);
  assert.match(sql, /unique \(player_id, playlist_id\)/);
  assert.match(sql, /create policy "player playlists: admin manages"/);
  assert.match(sql, /for all using \(public\.is_admin\(\)\) with check \(public\.is_admin\(\)\)/);
  assert.ok(!/to anon/.test(sql), 'tablo cihaza doğrudan açılmamalı');

  assert.match(sql, /create or replace function public\.radio_sube_listeler/);
  assert.match(sql, /join public\.player_playlists pp on pp\.player_id = h\.player_id/,
    'cihaz yalnız şubeye yüklenen listeleri görmeli');
  assert.match(sql, /on conflict \(player_id, playlist_id\) do nothing/,
    'geçiş tohumu idempotent olmalı');
});

// Atama tek katmanlıdır: yönetim markayı, şubeyi ve listeleri seçer, biter.
// Markanın kendi panelinden seçim yapması denemesi kaldırıldı; veritabanında
// ikinci bir işaret ya da marka adına yazan bir fonksiyon kalmamalı.
test('atama yalnız yöneticide, marka adına yazan fonksiyon yok', () => {
  const sql = fs.readFileSync(require.resolve('../supabase/radio-sube-listeleri.sql'), 'utf8');
  assert.ok(!/secili/.test(sql), 'ikinci bir seçim işareti olmamalı');
  assert.ok(!/coffee_brand_havuz|coffee_brand_secim/.test(sql),
    'marka adına yazan fonksiyon bulunmamalı');
  assert.match(sql, /create or replace function public\.radio_sube_listeler/);
  assert.ok(!/where pp\.secili/.test(sql), 'cihaz yalnız atanmış listeleri görür, ayrıca süzülmez');
});

// Kurulum sırası: SQL bir kez çalıştırıldığı anda tohum her şubeye markasının
// listelerini yazar, yoksa bütün şubeler susmuş olurdu.
test('şube listeleri kurulumu sahayı susturmaz', () => {
  const sql = fs.readFileSync(require.resolve('../supabase/radio-sube-listeleri.sql'), 'utf8');
  const tohum = sql.slice(sql.indexOf('insert into public.player_playlists'), sql.indexOf('create or replace function'));
  assert.match(tohum, /from public\.brand_players p/);
  assert.match(tohum, /join public\.brand_playlists bp on bp\.brand_id = p\.brand_id/,
    'tohum her şubeye markasının listelerini yazmalı');
  assert.match(tohum, /on conflict \(player_id, playlist_id\) do nothing/);
});

// Bu deneme bir kez sahaya çıktı: seçim kolonu ve marka fonksiyonları kurulu
// veritabanında kalmış olabilir. Temizlik dosyası SIRAYI korumalıdır: önce cihaz
// fonksiyonu süzgeçsiz hâline döner, sonra kolon ve fonksiyonlar düşer.
test('geri alma dosyası kalan parçaları sırayla temizler', () => {
  const sql = fs.readFileSync(require.resolve('../supabase/radio-liste-secimi-temizle.sql'), 'utf8');
  const cihaz = sql.indexOf('create or replace function public.radio_sube_listeler');
  const fonksiyonlar = sql.indexOf('drop function if exists public.coffee_brand_havuz');
  const kolon = sql.indexOf('drop column if exists secili');
  assert.ok(cihaz >= 0 && fonksiyonlar > cihaz && kolon > fonksiyonlar,
    'oluşan sıra: önce cihaz fonksiyonu, sonra fonksiyonlar, en son kolon');
  assert.match(sql, /drop function if exists public\.coffee_brand_secim\(text, text, uuid, uuid\[\]\)/);
  assert.ok(!/where pp\.secili/.test(sql), 'geri alınan cihaz fonksiyonu süzgeçsiz olmalı');
});

// Liste detayı marka sayfasının altında yaşar: adres markayı taşır, geri dönüş
// marka sayfasına olur; liste silinmişse boş ekran yerine marka listesine düşülür.
test('liste detayı marka sayfası altında rotalanır', () => {
  assert.match(source, /'#\/markalar\/' \+ pl\.brand_id \+ '\/listeler\/' \+ id/,
    'liste açılışı markalı adres üretmeli');
  assert.match(source, /'#\/markalar\/' \+ state\.openBrand \+ '\/listeler\/' \+ state\.openPlaylist/,
    'görünüm adresi markayı taşımalı');
  assert.ok(!source.includes("git('#/listeler/' + id)"), 'eski liste adresi üretilmemeli');
  assert.match(source, /else if \(sayfa === 'listeler' && id\)/,
    'eski yer imi marka sayfasına çevrilmeli');

  const views = fs.readFileSync(require.resolve('../radyo-panel-views.js'), 'utf8');
  assert.match(views, /geriCubugu\('markalar', b \? b\.name \+ ' SAYFASINA DÖN' : 'MARKALARA DÖN'/);
  assert.match(views, /if \(!pl\) return markaListesi\(state, D, ui\)/,
    'silinmiş listede marka listesine düşülmeli');
});

// Oynatıcı pencere katmanının üstünde durur: bir pencere açıkken de parça
// dinlenebilmeli. Bildirim ise her şeyin üstünde kalır ki kaydın sonucu görünsün.
test('oynatıcı pencere katmanının üstünde durur', () => {
  const css = fs.readFileSync(require.resolve('../radyo-panel.css'), 'utf8');
  const zIndex = sec => Number((css.match(new RegExp('\\.' + sec + '\\{[^}]*z-index:(\\d+)')) || [])[1]);
  const oynatici = zIndex('player');
  assert.ok(oynatici > zIndex('modal-wrap'), 'oynatıcı pencere katmanının üstünde olmalı');
  assert.ok(zIndex('toast') > oynatici, 'bildirim oynatıcının üstünde kalmalı');
  assert.match(css, /padding:24px 24px 112px/, 'pencerenin altında oynatıcı için yer bırakılmalı');
});
// Panel dosyaları her değişiklikte sürüm damgası taşımalı; yoksa tarayıcı eski
// dosyayı önbellekten çalar ve sahadaki düzeltme kimseye görünmez.
test('panel dosyaları sürüm damgasıyla yüklenir', () => {
  const sayfa = fs.readFileSync(require.resolve('../radyo-yonetim.html'), 'utf8');
  ['radyo-panel\.css', 'radyo-panel-views\.js', 'radyo-yonetim\.js', 'audio-file-types\.js']
    .forEach(dosya => {
      const kalip = new RegExp(dosya + '\\?v=[0-9a-z]+');
      assert.match(sayfa, kalip, dosya + ' sürüm damgası taşımalı');
    });
});

// Kesinti uyarısı iki yere birden bağlanmalı: menüdeki kırmızı rozet ve sayfanın
// üstündeki şerit. Yalnızca geçmiş ekranında kalan bir uyarı, kimse oraya
// bakmadıkça işe yaramaz.
test('panel kesinti uyarısını menüye ve üst şeride bağlar', () => {
  const sayfa = fs.readFileSync(require.resolve('../radyo-yonetim.html'), 'utf8');
  assert.match(sayfa, /id="uyari"/, 'şerit için kabukta bir yer olmalı');
  assert.match(source, /sessiz: V\.sessizSayi\(D\) \|\| null/, 'menü rozeti sessiz şube sayısını okumalı');
  assert.match(source, /V\.uyariSeridi\(D, ui\)/, 'şerit görünümü panelden gelmeli');
  assert.match(source, /kutu\.hidden = !html/, 'sessiz şube yokken şerit gizlenmeli');
  assert.match(source, /seritYaz\(\)/, 'şerit her çizimde tazelenmeli');
});

// Geçmişi silme yalnız yöneticiye açık ve yalnız oynatıcı olaylarını kapsar.
// Sunum kodu denemeleri (coffee_access_attempts) ayrı bir güvenlik kaydıdır;
// "geçmişi sil" onlara dokunmaz.
test('geçmişi silme yalnız yöneticiye açık ve yalnız olay tablosunu kapsar', () => {
  assert.match(source, /case 'gecmis-del'/, 'şube geçmişi silinebilmeli');
  assert.match(source, /case 'marka-gecmis-del'/, 'marka geneli geçmiş silinebilmeli');
  assert.match(source, /from\('radio_player_events'\)\.delete\(\)/);
  assert.ok((source.match(/!kullanici\.adminMi\) return hata\('Geçmişi silmek/g) || []).length >= 2,
    'iki silme yolu da yönetici kapısından geçmeli');
  assert.ok(!/coffee_access_attempts'\)\.delete\(\)/.test(source),
    'sunum kodu denemeleri silinmemeli');
  // Silme geri alınamaz: kaç kaydın silineceği onay penceresinde yazılmalı.
  assert.match(source, /bağlantı geçmişi kayıtları silinir/);
});

// Eksik kurulumu hızlı tamamlama: panel, eksik SQL dosyalarını tek metinde
// birleştirip kopyalatabilmeli; yönetici SQL Editor'e tek seferde yapıştırsın.
test('eksik kurulum dosyaları tek SQL olarak birleştirilir', () => {
  assert.match(source, /case 'kurulum-tumu'/, 'tek-SQL düğmesi işlenmeli');
  const blok = source.slice(source.indexOf('function kurulumTumEksikGoster'),
    source.indexOf('// ---------- Şube listeleri ----------'));
  assert.ok(blok.includes('V.KURULUM') && blok.includes('=== false'),
    'yalnız eksik dosyalar toplanmalı');
  assert.ok(blok.includes('raw.githubusercontent.com') && blok.includes('supabase/'),
    'dosyalar depodan okunmalı');
  assert.ok(blok.includes('join('), 'dosyalar tek metinde birleştirilmeli');
  assert.ok(blok.includes('kurulum-sql-kopyala'), 'birleşik metin kopyalanabilmeli');
  // Ağ yoksa hata vermek yerine yol göstermeli.
  assert.ok(!/throw /.test(blok), 'ağ yoksa çökmeden yol göstermeli');
});

// Marka kapağı: panel markaya ait görseli elle yerleştirebilmeli; kapak yalnız
// o markayı etkiler, parça/klasör görsellerine dokunmaz.
test('panel marka kapağını elle yerleştirir', () => {
  assert.match(source, /case 'brand-cover'/, 'marka kapağı düğmesi işlenmeli');
  const blok = source.slice(source.indexOf("case 'brand-cover'"), source.indexOf("case 'list-img'"));
  assert.match(blok, /from\('brands'\)\.update\(\{ cover_path: yol \}\)/, 'kapak brands.cover_path alanına yazılmalı');
  assert.ok(blok.includes("onEk: 'markalar'"), 'kapak kendi klasörüne yüklenmeli');
  assert.match(blok, /kapakDosyaSil\(b\.cover_path\)/, 'kaldırılan kapağın dosyası temizlenmeli');
  // Kolon yoklaması: kurulmadıysa özellik kapanmalı, ana yükleme bozulmamalı.
  assert.match(source, /D\.kurulum\['marka-kapagi\.sql'\]/);
});

// Kurulum dosyası gerçekten kolonu ve okuma fonksiyonunu kurmalı: panelin
// gösterdiği düğme yalnız bu dosya çalıştırıldığında işe yarar.
test('marka kapağı kurulum dosyası kolonu ve okuma fonksiyonunu kurar', () => {
  const sql = fs.readFileSync(require.resolve('../supabase/marka-kapagi.sql'), 'utf8');
  assert.match(sql, /alter table public\.brands add column if not exists cover_path text/);
  assert.match(sql, /create or replace function public\.coffee_brand_kapak/);
  assert.match(sql, /grant execute on function public\.coffee_brand_kapak/);
});

// Katalog kapısını kapatma: erişim kapısı kurulduktan sonra panel, kataloğu
// dışarıya kapatan SQL'i gösterebilmeli; kapatma sırası (fonksiyonlar önce)
// yöneticiye açıkça hatırlatılmalı.
test('katalog kapısını kapatma SQL\'i panelden gösterilir ve sırası uyarılır', () => {
  assert.match(source, /case 'kurulum-kapat-sql'/, 'kapatma düğmesi işlenmeli');
  const blok = source.slice(source.indexOf('function kurulumKapatGoster'),
    source.indexOf('// ---------- Şube listeleri ----------'));
  assert.ok(blok.includes('radio-erisim-kapat.sql'), 'kapatma dosyası okunmalı');
  assert.ok(blok.includes('raw.githubusercontent.com') && blok.includes('supabase/'), 'dosya depodan okunmalı');
  assert.ok(blok.includes('kurulum-sql-kopyala'), 'SQL kopyalanabilmeli');
  assert.ok(/kapıyı ancak/i.test(blok), 'kapatma sıra uyarısı verilmeli');
  assert.ok(!/throw /.test(blok), 'ağ yoksa çökmeden yol göstermeli');
});

// Veritabanı tarafı: silme izni yalnız yönetici oturumuna verilir; oynatıcı
// (anon) ne okur ne siler.
test('geçmiş silme izni veritabanında yalnız yöneticide', () => {
  const sql = fs.readFileSync(require.resolve('../supabase/radio-baglanti-gecmisi.sql'), 'utf8');
  assert.match(sql, /radio_player_events_admin_delete/);
  assert.match(sql, /for delete to authenticated using \(public\.is_admin\(\)\)/);
  assert.match(sql, /grant delete on table public\.radio_player_events to authenticated/);
  assert.ok(!/grant delete[^;]*to anon/.test(sql), 'anon silememeli');
});

// Silme sessizce başarısız olmasın: Supabase, RLS ya da eşleşmeyen kimlik
// yüzünden 0 satır sildiğinde hata döndürmez. Panel silinen satırları geri
// isteyip sayıyı kontrol etmeli; yoksa "silindi" der, kayıt yerinde kalır
// (yöneticinin bildirdiği "klasörü silemiyorum" durumu).
test('klasör ve liste silme 0 satır silinmesini sessizce yutmaz', () => {
  ['folder-del', 'list-del'].forEach(act => {
    const bas = source.indexOf("case '" + act + "'");
    assert.ok(bas > 0, act + ' işlenmeli');
    const blok = source.slice(bas, source.indexOf("case '", bas + 10));
    assert.match(blok, /yazDogrula\(\s*\n?\s*client\.from\('[a-z_]+'\)\s*\n?\s*\.delete\(\)\.eq\('id', id\)/,
      act + ': silinen satırlar geri istenmeli');
    assert.ok(/if \(silmeSorunu\)[\s\S]{0,400}?return hata\(/.test(blok),
      act + ': başarısızlık hata olarak bildirilmeli');
  });
});

// Yöneticinin bildirdiği "Klasör silinemedi: ... player_broadcast ..." hatası:
// klasör/liste bir şubenin özel yayın kaynağıysa veritabanı yabancı anahtarı
// boşaltır, satır kaynaksız kalır ve kural (folder_id ya da playlist_id
// zorunlu) silmeyi geri alır. Panel önce atamayı kaldırıp sonra silmeli ve
// kural adını kullanıcıya ham hâlde göstermemeli.
test('şubeye özel yayın kaynağı silinmeden önce atamalar kaldırılır', () => {
  [['folder-del', 'radio_folders'], ['list-del', 'brand_playlists']].forEach(([act, tablo]) => {
    const bas = source.indexOf("case '" + act + "'");
    assert.ok(bas > 0, act + ' işlenmeli');
    const blok = source.slice(bas, source.indexOf("case '", bas + 10));
    const atamaSil = blok.indexOf("client.from('player_broadcast')");
    const kaynakSil = blok.indexOf("client.from('" + tablo + "').delete()");
    assert.ok(atamaSil > 0, act + ': şube yayın ataması kaldırılmalı');
    assert.ok(kaynakSil > 0, act + ': kaynak satır silinmeli');
    assert.ok(atamaSil < kaynakSil, act + ': atamalar silmeden ÖNCE kaldırılmalı');
    assert.match(blok, /player_broadcast_check/, act + ': kural hatası tanınmalı');
    assert.match(blok, /özel yayın kaynağı/, act + ': kullanıcıya ne yapacağını söyleyen mesaj verilmeli');
    assert.ok(!/return hata\('Klasör silinemedi: ' \+ silmeSorunu\)/.test(blok),
      act + ': ham kural adı kullanıcıya gösterilmemeli');
  });
});

// Aynı sınıfın panelin tamamında kapandığını korur: tek satırı hedefleyen her
// güncelleme/silme yazDogrula() ile sarılmalı, yoksa RLS engelinde panel
// "kaydedildi/silindi" der, kayıt değişmez. Toplu silmeler (ör. şubenin bütün
// geçmişi: .eq('player_id', ...)) kapsam dışıdır; orada 0 satır normaldir.
test('tek satırı hedefleyen yazmaların hepsi doğrulanır', () => {
  const satirlar = source.split('\n');
  const kapsamDisi = [];
  satirlar.forEach((satir, i) => {
    if (!/\.(delete|update)\(/.test(satir)) return;
    // Aynı satırda ya da bir sonraki satırda .eq('id', ...) ile tek satır hedeflenir.
    if (!/\.eq\('id',/.test(satir + '\n' + (satirlar[i + 1] || ''))) return;
    const pencere = satirlar.slice(Math.max(0, i - 2), i + 3).join('\n');
    if (!/yazDogrula\(|\.select\('id'\)/.test(pencere)) kapsamDisi.push(i + 1);
  });
  assert.deepEqual(kapsamDisi, [], 'doğrulanmayan tek satır yazması kaldı: satırlar ' + kapsamDisi.join(', '));
  assert.match(source, /if \(!data \|\| !data\.length\)/, 'yazDogrula 0 satırı hata saymalı');
});

// Düğme tıklaması işlenirken beklenmeyen bir hata sessizce yutulmamalı:
// async dinleyicide hata yakalanmazsa tıklama "hiçbir şey olmuyor" gibi
// görünür (onay penceresi hiç açılmıyor geri bildirimi).
test('düğme tıklamasındaki beklenmeyen hatalar kullanıcıya söylenir', () => {
  const bas = source.indexOf("document.addEventListener('click'");
  const blok = source.slice(bas, source.indexOf("document.addEventListener('input'", bas));
  assert.ok(bas > 0 && blok.length > 1000, 'tıklama dinleyicisi bulunmalı');
  assert.match(blok, /try \{\s*\n\s*switch \(act\) \{/, 'düğme işleri try içinde olmalı');
  assert.match(blok, /catch \(err\)[\s\S]{0,240}hata\('İşlem yapılamadı/, 'catch kullanıcıya bildirmeli');
});

// Pencere kabuğu (#modal-wrap / #modal) eksikse onay penceresi açılamaz ve
// SİL düğmesi sessizce boşa düşerdi; panel kabuğu yerinde üretmeli.
test('pencere kabuğu eksikse panel onu yerinde üretir', () => {
  const bas = source.indexOf('function pencere(s) {');
  const blok = source.slice(bas, source.indexOf('function pencereKapat()', bas));
  assert.ok(bas > 0, 'pencere fonksiyonu bulunmalı');
  assert.match(blok, /if \(!el\('modal-wrap'\) \|\| !el\('modal'\)\)/, 'eksik kabuk yoklanmalı');
  assert.match(blok, /document\.createElement\('div'\)/, 'kabuk üretilmeli');
  assert.match(blok, /document\.body\.appendChild\(sarma\)/, 'kabuk gövdeye eklenmeli');
  assert.ok(blok.indexOf("el('modal').innerHTML") > blok.indexOf('appendChild'),
    'üretim, içerik yazılmadan önce olmalı');
});

// Şube kodu ve paylaşım alarmı (supabase/radio-sube-kodu.sql): panel kodu
// üretebilmeli/yenileyebilmeli, alarmı temizleyebilmeli ve şube eklerken kodu
// da hazırlamalı. Bunlar yalnız yöneticinin elindeki işlerdir.
test('panel şube kodunu üretir, yeniler ve alarmı temizler', () => {
  assert.match(source, /case 'player-kod-yenile'/, 'kod üretme/yenileme işlenmeli');
  assert.match(source, /case 'player-kod-kaldir'/, 'kod kaldırma işlenmeli');
  assert.match(source, /case 'ihlal-temizle'/, 'paylaşım kaydı temizlenebilmeli');

  const yenile = source.slice(source.indexOf("case 'player-kod-yenile'"), source.indexOf("case 'player-kod-kaldir'"));
  assert.ok(yenile.includes('V.kodUret()'), 'kod görünüm katmanından üretilmeli');
  assert.ok(yenile.includes('yazDogrula'), 'yazma doğrulanmalı (sessiz başarısızlık olmasın)');
  assert.ok(yenile.includes('duplicate|unique|23505'), 'benzersizlik çakışmasında yeniden denenmeli');
  assert.match(yenile, /!kullanici\.adminMi\) return hata/, 'yönetici kapısı olmalı');

  const temizle = source.slice(source.indexOf("case 'ihlal-temizle'"), source.indexOf('"Şubedeki cihaz çalmıyor"'));
  assert.match(temizle, /rpc\('radio_ihlal_temizle'/, 'temizleme sunucu işlevinden geçmeli');
  assert.ok(temizle.includes('data !== true'), 'sunucu hayır dediyse panel başarı yazmamalı');
  assert.ok(temizle.includes('radio-sube-kodu.sql'), 'işlev yoksa kurulum dosyası söylenmeli');

  // Şube eklenirken kod da üretilmeli: yeni şube kodsuz kalırsa koruma yok demektir.
  const ekle = source.slice(source.indexOf("case 'player-add'"), source.indexOf("case 'folder-open'"));
  assert.ok(ekle.includes('player_code: V.kodUret()'), 'yeni şubeye kod üretilmeli');

  // Kod ve alarm alanları şube sorgusunda istenmeli; yoksa ekran boş kalır.
  assert.match(source, /select\('id,brand_id,label,player_key,player_code,[^']*ihlal_sayisi[^']*son_ihlal_konum'\)/,
    'kod ve ihlal alanları yüklenmeli');
  assert.match(source, /D\.kurulum\['radio-sube-kodu\.sql'\]/, 'kurulum durumu yoklanmalı');
});

// Alarm yalnız panel önündeyken görünür kalırsa "bana hemen haber gelsin" sözü
// yarım kalır: yönetici başka bir sekmede çalışırken gelen deneme sessizce
// birikir. Yeni bir alarm doğduğunda masaüstü bildirimi de düşmelidir.
test('yeni şube alarmı masaüstü bildirimi olarak da düşer', () => {
  assert.match(source, /function ihlalBildir\(\)/, 'alarm karşılaştırması tanımlanmalı');
  assert.ok(source.includes('ihlalBildir();'), 'veri yüklendikten sonra çağrılmalı');

  const blok = source.slice(source.indexOf('function ihlalBildir()'), source.indexOf('// ---------- Plan takvimi yardımcıları'));
  // İlk yüklemede susmalı: açılışta eski bir alarm için pencere açmak gürültüdür.
  assert.match(blok, /if \(!onceki\) return/, 'ilk yükleme bildirim göndermemeli');
  // Aynı alarm tekrar tekrar bildirilmemeli; yalnız sayaç/zaman değişince.
  assert.match(blok, /onceki\[id\] === simdi\[id\]/, 'yalnız değişen alarm bildirilmeli');
  assert.match(blok, /new Notification\(/, 'görünür bildirim üretilmeli');
  assert.match(blok, /tag: 'radyo-ihlal-' \+ id/, 'aynı şube için tek pencere (etiket) kullanılmalı');
  // Bildirim gövdesi ihlalin türünü ve konumunu taşımalı: "kim, nereden".
  const ozet = source.slice(source.indexOf('function ihlalOzet(p)'), source.indexOf('function ihlalBildir()'));
  assert.ok(ozet.includes('V.ihlalCumlesi(p)'), 'tür okunur cümleye çevrilmeli');
  assert.ok(ozet.includes('V.konumBilgi(p.son_ihlal_konum)'), 'konum bildirime girmeli');
  assert.ok(ozet.includes('V.paylasanSube(D, p)'), 'IP başka şubeye aitse söylenmeli');
});

// Bildirim izni yalnız kullanıcı dokunuşuyla istenebilir: izin verilmemişse
// alarm şeridinde bir düğme çıkar ve izin oradan alınır.
test('bildirim izni alarm şeridindeki düğmeden istenir', () => {
  assert.match(source, /case 'bildirim-ac'/, 'izin düğmesi işlenmeli');
  const blok = source.slice(source.indexOf("case 'bildirim-ac'"), source.indexOf("case 'gecmis-ac'"));
  assert.match(blok, /Notification\.requestPermission\(\)/, 'izin tarayıcıdan istenmeli');
  assert.ok(blok.includes('seritYaz()'), 'izin sonrası şerit tazelenmeli (düğme kalksın)');
  assert.ok(blok.includes('typeof Notification'), 'bildirimi olmayan tarayıcı çökmemeli');
  // Görünüm katmanı düğmeyi yalnız izin yokken çizmeli.
  assert.match(source, /bildirimGerekli: \(\) => typeof Notification !== 'undefined' && Notification\.permission !== 'granted'/);
});

// Davet QR'ı: 40 karakterlik linki kafedeki kiosk klavyesinden yazmak yerine
// kamerayla okutmak için var. Kodu bilerek taşımaz — kod da kareye girseydi
// QR'ın fotoğrafı, tek başına yayını açan bir anahtar olurdu (linki ele
// geçirmek yayını açmaya yetmesin istiyoruz). Kodlayıcı CDN'den gelir;
// yüklenmezse pencere çökmez, link yazı olarak çizilir.
test('davet QR\'ı yalnız linki taşır ve kodlayıcı yoksa yazıya düşer', () => {
  const kod = source.slice(source.indexOf('function kodPenceresi'), source.indexOf('function pencere(s) {'));
  assert.match(kod, /data-qr="\$\{esc\(link\)\}"/, 'QR yayın linkini taşımalı');
  assert.ok(!/&kod=|kod=/.test(kod), 'QR metnine şube kodu eklenmemeli');
  assert.ok(kod.includes('qrCiz()'), 'QR pencere açıldıktan sonra çizilmeli');

  const blok = source.slice(source.indexOf('function qrCiz()'), source.indexOf('// ---------- Kapak yerleştirme ----------'));
  assert.ok(blok.includes('V.qrGorsel(veri, kutuphane)'), 'kodlama görünüm katmanından gelmeli');
  assert.ok(blok.includes("el('modal')"), 'kutu pencere içinden alınmalı');
  assert.ok(blok.includes('qr-metin'), 'kodlayıcı yoksa metne düşülmeli');
  assert.ok(!/throw /.test(blok), 'kodlayıcı yokken pencere çökmemeli');

  // Kodlayıcı panelin kendi dosyasında değil, CDN'den gelir.
  const sayfa = fs.readFileSync(require.resolve('../radyo-yonetim.html'), 'utf8');
  assert.match(sayfa, /qrcode-generator@[0-9.]+/, 'kodlayıcı sayfaya eklenmeli');
});
