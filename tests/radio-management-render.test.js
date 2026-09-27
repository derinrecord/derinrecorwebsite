const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const views = require('../radyo-panel-views.js');
const source = fs.readFileSync(require.resolve('../radyo-yonetim.js'), 'utf8');

// Panel 2026-09'da yeniden düzenlendi: ana sayfadaki 6 kart yerine her işin
// kendi menü girdisi var. Abonelikler ve Talepler ayrı ekranlar olarak kalmalı
// (biri müşteri sözleşmeleri, diğeri gelen başvurular).
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
