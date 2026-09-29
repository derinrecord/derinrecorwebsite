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
  assert.ok(source.includes("storage.from('radio-covers')"), 'kapaklar radio-covers kovasına yüklenmeli');
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
  const klasorSil = source.slice(source.indexOf("case 'folder-del'"));
  assert.ok(klasorSil.slice(0, 1200).includes('kapakDosyaSil(f && f.cover_path)'));
  assert.ok(klasorSil.slice(0, 1200).includes('for (const t of parcalar) await kapakDosyaSil(t.cover_path)'));
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

// Çalma listesi klasörleri: ekranda "hangi şubede hangi liste var" okunacağı
// için listeler marka içinde klasörlere ayrılır. Klasör tablosu kurulmadan da
// panel çalışmalı; o yüzden sorgu hataya toleranslı okunur.
test('panel liste klasörlerini yükler ve klasör işlerini bağlar', () => {
  assert.match(source, /from\('brand_playlist_folders'\)\.select\('id,brand_id,name,sort_order,created_at'\)/);
  assert.match(source, /listeKlasorleriVar: !playlistFolders\.error/,
    'tablo yoksa ekran klasörsüz hâle düşmeli');

  // Gruplama kolonu ana liste sorgusunda istenmez: kolon henüz eklenmemişse
  // bütün liste sorgusu düşer ve ekranda hiç liste kalmaz. Onun yerine ayrı ve
  // hataya toleranslı çekilir (radyo-yonetim.js · veriYukle).
  assert.ok(source.includes("select('id,brand_id,name,description,cover_path,shuffle,created_at')"),
    'ana liste sorgusu playlist_folder_id istememeli');
  assert.match(source, /from\('brand_playlists'\)\.select\('id,playlist_folder_id'\)/,
    'gruplama kolonu ayrı ve toleranslı çekilmeli');
  assert.match(source, /harita\.get\(pl\.id\)/, 'okunan klasör listelere birleştirilmeli');
  ['liste-yeni', 'liste-klasor-ekle', 'liste-klasor-ad', 'liste-klasor-sil', 'liste-tasi']
    .forEach(act => assert.ok(source.includes("'" + act + "'"), act + ' işlenmeli'));

  // Yeni liste markaya ve seçilen klasöre yazılmalı; kaynak klasör seçilirse
  // parçalar kopyalanır (boş liste de geçerli).
  const blok = source.slice(source.indexOf("case 'liste-yeni'"), source.indexOf("case 'liste-klasor-ekle'"));
  assert.ok(blok.includes('from(\'brand_playlists\')'), 'liste brand_playlists tablosuna yazılmalı');
  assert.ok(blok.includes('playlist_folder_id'), 'seçilen klasör kaydedilmeli');
  assert.ok(blok.includes("from('brand_playlist_tracks')"), 'kaynak klasörün parçaları kopyalanmalı');

  // Klasörü silmek liste silmez: kayıtlar klasörsüz kalır (SQL tarafında
  // on delete set null).
  const sil = source.slice(source.indexOf("case 'liste-klasor-sil'"), source.indexOf("case 'liste-tasi'"));
  assert.ok(!sil.includes("from('brand_playlists')"), 'klasör silmek listeleri silmemeli');
  assert.match(sil, /from\('brand_playlist_folders'\)\.delete\(\)/);
});

// Veritabanı tarafı: klasörler yalnız yöneticiye açık; liste klasörü silinince
// liste kaybolmaz, klasörsüz kalır.
test('liste klasörü SQL\'i yöneticiye açık ve listeyi silmiyor', () => {
  const sql = fs.readFileSync(require.resolve('../supabase/radio-liste-klasorleri.sql'), 'utf8');
  assert.match(sql, /create table if not exists public\.brand_playlist_folders/);
  assert.match(sql, /add column if not exists playlist_folder_id uuid/);
  assert.match(sql, /references public\.brand_playlist_folders\(id\) on delete set null/,
    'klasör silinince liste klasörsüz kalmalı');
  assert.match(sql, /create policy brand_playlist_folders_admin/);
  assert.match(sql, /for all to authenticated using \(public\.is_admin\(\)\) with check \(public\.is_admin\(\)\)/);
  assert.ok(!/to anon/.test(sql), 'klasörler oynatıcıya (anon) açılmamalı');
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

// Veritabanı tarafı: silme izni yalnız yönetici oturumuna verilir; oynatıcı
// (anon) ne okur ne siler.
test('geçmiş silme izni veritabanında yalnız yöneticide', () => {
  const sql = fs.readFileSync(require.resolve('../supabase/radio-baglanti-gecmisi.sql'), 'utf8');
  assert.match(sql, /radio_player_events_admin_delete/);
  assert.match(sql, /for delete to authenticated using \(public\.is_admin\(\)\)/);
  assert.match(sql, /grant delete on table public\.radio_player_events to authenticated/);
  assert.ok(!/grant delete[^;]*to anon/.test(sql), 'anon silememeli');
});
