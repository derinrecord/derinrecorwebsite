# Derin Record — CLAUDE.md

## Proje

Derin Record, cimnastik/aerobik performansları için özel müzik prodüksiyonu yapan bir stüdyonun tanıtım sitesi ve antrenör portalı. Ziyaretçiler branşa göre demo dinler; giriş yapan antrenörler zaman damgalı geri bildirim bırakır, müzik ister ve şifreli sohbet üzerinden iletişim kurar.

## Stack

- **Vanilla HTML/CSS/JS** — build aracı yok, bundler yok, framework yok. Her sayfa kendi `.html` dosyası, kendi `<link>`/`<script>` listesiyle.
- **Supabase** (`@supabase/supabase-js@2`, CDN üzerinden yüklenir) — auth, Postgres, storage.
- **PWA** — `manifest.webmanifest` + `service-worker.js`.
- Bağımlılık yönetimi yok (`package.json` yok); dış kütüphaneler doğrudan CDN'den.

## Komutlar

- **Dev**: Yerel bir statik sunucu ile aç (ör. `npx serve .` veya VS Code Live Server). Build adımı yok.
- **Test**: Otomatik test bulunmuyor.
- **Lint**: Lint yapılandırması yok.
- **Deploy**: Vercel, GitHub reposuna bağlı otomatik deploy ile (`vercel.json` yönlendirmeleri; `.vercelignore` supabase/, tests/, *.md ve prova dosyalarını yayın dışı bırakır).

## Mimari

- `index.html` — ana sayfa (hero, hizmetler, demo kasetler, sezon, iletişim).
- **Açılış ekranı (2026-10-29):** `intro.js` + `intro.css` + `assets/intro/` (logo 41 KB + kırmızı nokta). Spotify gibi sessiz, 4 sn: logo koyu ekrandan fade in ile belirir ve yavaşça yakınlaşır, sarı bantta ışık geçer, kırmızı nokta REC ışığı gibi yavaş yanıp söner, sonunda `.hero-art` içindeki kaset logosunun yerine oturur. Yalnız ana sayfada, oturumda bir kez (`sessionStorage: derin-intro-goruldu`); aramadan/site içinden/`#` bağlantısıyla gelenler ve botlar görmez; dokunan hemen geçer. Betik `<body>` başında eşzamanlı yüklenir (stil `<head>`'de). Deneme: `/?intro=1`, kapatma: `/?intro=0` (test: `tests/intro.test.js`).
- `aerobik.html` / `akrobatik.html` / `artistik.html` / `ritmik.html` / `cocuk-fitness.html` — branş bazlı demo/dinleme sayfaları.
- **Sohbet gizli (2026-10-14):** `chat.html` ana sayfaya yönlenir, menüde SOHBET bağlantısı yoktur (test: `tests/sohbet-gizli.test.js`). Dosyalar ve `direct_messages` verisi SİLİNMEDİ. Müzik Araştır istekleri yöneticinin `bildirimler.html` + `bildirimler.js` sayfasında onaylanır.
- `chat.html` + `chat.js` + `chat-crypto.js` — (gizli) uçtan uca şifreli (ECDH P-256 + AES-GCM) antrenör sohbeti. Özel anahtarlar tarayıcıda IndexedDB'de tutulur (`derin-record-private-keys`); cihazlar arası taşıma PBKDF2 tabanlı yedekleme koduyla yapılır.
- `auth.js` — tüm sayfalarda ortak giriş/kayıt kabuğu; `window.DerinAuth` global state'ini yönetir, `derin:authchange` event'i yayınlar.
- `admin.js` / `admin.html` — sadece `profiles.role = 'admin'` olan kullanıcılara açık yönetim paneli (antrenörlere demo erişimi verme/kaldırma).
- **Öğrenci takvimi bu depodan çıkarıldı (2026-10-07):** `ogrenci-takvimi/` klasörü, öğrenci testleri, `tests/masaustu-olustur.js`, öğrenci önizlemeleri ve `supabase/ogrenciler.sql` silindi; uygulama bağımsız bir çalışmaya taşındı. Bu sitede öğrenci sayfası, menü linki, dosya veya bağlantı **yoktur** (test korur). Veri iki yerde durur: (1) masaüstündeki tek dosya panel (`Öğrenci Takvimi.html` — ilk açılışta gömülü başlangıç verisi 5 öğrenci + 35 kaydı depoya yazar), (2) uygulamanın kendi ayrı Supabase projesi (`ogrenci-takvimi`, ref `qhheazmfrtkumogmgezi`). Yedek akışı: masaüstü YEDEK AL → JSON → herhangi bir kopyada YEDEK YÜKLE.
- `config.js` — Supabase Project URL ve **publishable (anon)** anahtarı. Secret/service_role anahtarı buraya asla girilmez.
- `supabase/*.sql` — şema ve RLS politikaları:
  - `derin-record.sql`: `profiles`, `demo_access`, `feedback_notes` tabloları + `is_admin()` / `has_demo_access()` güvenlik fonksiyonları.
  - `chat-encryption.sql`, `chat-key-backup.sql`, `sohbet.sql`, `demo-catalog.sql`: ek şema parçaları.
  - `kurulum.md`: kurulum adım adım talimatları.
- `fig-kaynaklari.md` — geri bildirim panelindeki FIG (Uluslararası Cimnastik Federasyonu) hareket seçicisinin kaynak/kapsam dokümantasyonu; resmi FIG Code of Points referansları içerir.
- `energy-map.js/html/css` — Enerji Grafiği (2026-11-21, eski adı Enerji Haritası, tasarım B "Katmanlı"): enerji (LUFS benzeri, K-ağırlıklı) · tempo eğrisi · spektrum. Analiz `energy-map-cekirdek.js` (tarayıcı + Node, `window.DerinEnerji`; harmonik tarak tempo — 156'yı 104/78'e kaydırmaz) ve `energy-map-isci.js` (Web Worker). Solda "Çalışmalarım": antrenörün Projelerim parçaları (RLS) tek tıkla imzalı R2 adresinden açılır; "Dosya seç" de durur. 20 Ekim'deki "spektrum yok" kararı Derin'in isteğiyle kaldırıldı (test: `tests/enerji-haritasi.test.js`).
- `music-request.*`, `projects.*`, `my-projects.html`, `news.*`, `license.*`, `feedback.*` — antrenör portalının diğer akışları.

## Kod Kuralları (tespit edilen)

- Her JS dosyası bir IIFE (`(() => { ... })()`) içinde, global sızıntıyı önlemek için.
- Global paylaşım `window.Derin*` isimlendirmesiyle yapılıyor (`window.DerinAuth`, `window.DerinChatCrypto`, `window.DERIN_CONFIG`).
- Kullanıcıdan gelen veri DOM'a basılmadan önce her dosyada tekrar tanımlanan yerel bir `escapeHtml()` fonksiyonundan geçiriliyor — XSS'e karşı tutarlı bir pratik.
- Dosya isimleri kebab-case, Türkçe iş terimleriyle (`aerobik.html`, `akrobatik-horon-kafkas`).
- Cache-busting için script/style linklerinde `?v=N` sorgu parametresi kullanılıyor (ör. `side-menu-clean.css?v=3`).
- Supabase sorguları RLS'e güveniyor; istemci tarafında ekstra yetki kontrolü asgari düzeyde tutuluyor (doğru yaklaşım, ama değişiklik yaparken RLS politikasını bozmamaya dikkat).

## Sabit Kurallar — Sormadan Dokunma

- `config.js` içine **asla** `service_role` veya başka bir secret key eklenmez; sadece publishable/anon key.
- `supabase/*.sql` dosyalarındaki RLS politikaları değiştirilmeden önce mutlaka gerekçesi açıklanır ve onay istenir — bu proje yetkilendirmeyi tamamen bu politikalara bırakıyor.
- `chat-crypto.js`'deki şifreleme mantığı (anahtar üretimi, ECDH/AES-GCM akışı) değiştirilecekse önce plan sunulur; hatalı bir değişiklik mevcut kullanıcıların şifreli geçmiş mesajlarını okunamaz hale getirebilir.

## Yeni Bir Geliştiricinin İlk Haftada Karşılaşabileceği Noktalar

- Build/bundler yok — bir dosyayı değiştirip kaydettikten sonra tarayıcıyı yenilemek yeterli, ama tarayıcı cache'i eski CSS/JS'i gösterebilir (`?v=` parametresini artırmak gerekebilir).
- `config.js` doldurulmadan (`DERIN_CONFIG` boşsa) `auth.js` "HESAP SİSTEMİ HAZIRLANIYOR" moduna düşer; giriş/kayıt formu görünmez. Yerelde test ederken önce Supabase bağlantısının kurulu olduğundan emin olun.
- Admin paneline erişim tamamen `profiles.role = 'admin'` alanına bağlı; bu satır `derin-record.sql`'in sonundaki örnek `update` komutuyla elle set ediliyor — otomatik bir "ilk admin" akışı yok.
- Chat özelliğini yeni bir cihazda test ederken, önceden `chat_public_keys` tablosunda kayıtlı bir kullanıcı için IndexedDB temizse "aktarım kodu" akışı devreye giriyor; bu normal, hata değil.

## CRM modülü (2026-11-15)

Mekân (kafe, restoran, salon…) radyo lisansı satışı için tek sahipli satış + abonelik takip CRM'i.
Şartname: `docs/crm/` (paket: 01–09 + `sema/schema.sql`). **CRM'e dokunan her işten önce
`docs/crm/03-IS-KURALLARI.md` okunur; kurallar tartışmaya açık değil, kendi başına "iyileştirme" yapılmaz.**

- Yığın uyarlaması: paket .NET/MySQL/Next.js için yazıldı; burada Supabase (Postgres) + düz HTML/JS.
  Şema/işlemler `supabase/crm.sql` (tablolar `crm_` önekli, additive). Sunucu mantığı Postgres
  fonksiyonlarında (RPC) — tek transaction gereken işler (görüşme+görev, tamamla) tek fonksiyon.
- Ekran: `crm.html` + `crm.js` + `crm-sozluk.js` (tüm sabit sözlükler ve Türkçe etiketler tek dosyada).
- Tek saat: `crm_bugun()` / `crm_simdi()` (Europe/Istanbul). CRM SQL'inde ham `now()`/`current_date` yok.
- Yetki: `crm_yetkili()` = admin **ve** `crm_sahip` listesinde. Yeni bir admin hesabı CRM'i kendiliğinden görmez.
- Hata: fonksiyonlar sabit anahtar fırlatır (`TaskAlreadyClosed`, `WaitingRequiresTask`…); arayüz Türkçeye çevirir.
- Telefon: `crm_telefon()` → `905xxxxxxxxx`; çözülemeyen numara atılmaz (`phone_raw` + `needs_review`).
- Faz durumu: Faz 0–2 (çekirdek + ekranlar). Faz 3 ödeme takibi, Faz 4 hatırlatma henüz yok.

## Müzik kataloğu, ses efektleri ve sanatçı platformu (2026-11-19/20)

- **Müzik kataloğu:** `muzik.html/js/css` (şarkı satırı, DAW dalga formu, sağ lisans paneli, Lisanslarım) + yönetim `muzik-yonetim.html/js` + ortak yükleme `muzik-yukle.js`. Şema `supabase/muzik-lisans.sql`. Lisans türleri: kisisel/dijital/genisletilmis/tum_medya; fiyat null = "Yakında" (Derin henüz fiyat girmedi). Ödeme: istendi → dekont → yönetici 'odendi' → imzalı indirme.
- **R2:** `api/r2-yukleme-izni.js` + `r2-depo.js`. muzik/ ve efekt/ gizli (satış klasörü, RPC `*_indirebilir`), muzik-onizleme/ ve efekt-onizleme/ açık (muzik.derinrecord.com).
- **Ortak üst menü:** `ortak-ust.js/css` (alt sayfalar), ana sayfada `ust-menu`. `GIZLI_BOLUMLER = true`.
- **GİZLİ (2026-11-20, silinmedi):** Ses Efektleri mağazası (`ses-efektleri.*`, `supabase/ses-efektleri.sql`), "Ses Tasarımı" menü maddesi, Sanatçılar (`sanatcilar.*`, `sanatci-paneli.*`, `gorsel-kirp.js`, `sanatci.css`). Sayfalar `index.html`'e yönlenir, `?onizle=1` ile açılır (test: `tests/gizli-bolumler.test.js`). Film Müziği (`ses-tasarimi.html`) AÇIK.
- **Sanatçı platformu** (`supabase/sanatcilar.sql`, uygulandı): sanatcilar (+ gizli sanatci_ozel), şarkıda sanatci_id + durum taslak/inceleme/yayinda/reddedildi, Ek-1 `muzik_parca_beyan`. Yayına alma yalnız yönetici. Gelir: lisans %25, radyo aylık Net Gelir %25 havuzu çalınma oranıyla (`radio_calmalar`, `radyo_aylik_gelir`, `radyo_havuz_ozeti`). Parça 30 sn çalınınca sayılır (`coffee-marka.js` → `sube-guvenlik.js calmaSay`). Radyo izni kapanınca şarkı radyodan otomatik silinir. Sözleşme taslağı Claude Docs'ta ("Sanatçı Lisans Sözleşmesi").
- **Testler:** `node --test tests/*.test.js` (917). Yeni sayfa → `data-dil-otomatik` + dil.js EN çevirileri; tek satır update/delete `.select('id')`; auth.js sürümü `20261121a`.
- **Sırada:** lisans fiyatları (öneri 750/2.500/6.000/15.000 TL, Derin karar vermedi), Google ile giriş (3. aşama).

## Şarkı Avcısı (2026-11-20)

Yalnız yönetici (Derin) için remix referans aracı: şarkıyı "dinler" (ölçer), 10 referans önerir.
- Ekran: `sarki-avcisi.html` + `sarki-avcisi.js`; ölçüm ve seçim mantığı `sarki-avcisi-cekirdek.js` (tarayıcı + Node, `window.DerinSarkiAvcisi`). Menü: HESABIM → ŞARKI AVCISI (yalnız admin), admin.js panelinde de bağlantı var.
- Analiz tarayıcıda (Web Audio): tempo (±1 BPM, yarım tempo), ton (Camelot, tahmin), 8'lik enerji blokları, drop/nefes/zirve. Ses dosyası hiçbir sunucuya yüklenmez.
- Referanslar: `api/sarki-referans.js` (Vercel) → yönetici doğrulaması (auth/v1/user + rpc is_admin) → `referansSec` (tempo + ton uyumu + tür puanı, sanatçı başına en çok 2, kullanılanlar hariç).
  - **Varsayılan kaynak Deezer (2026-11-22, anahtarsız):** `/search?q=bpm_min:"x" bpm_max:"y"` (tempo ±3 üç sayfa + yarım tempo ±1), en popüler 40 adayın albüm türü/yılı (`/album/{id}`), 20 aday döner. Tarayıcı her adayın 30 sn önizlemesini `api/sarki-onizleme.js` (yalnız admin, yalnız *.dzcdn.net) üzerinden alır, tonu/tempoyu ölçer, en iyi 10'u seçer.
  - GetSongBPM yalnız `GETSONGBPM_API_KEY` tanımlıysa kullanılır (`/tempo/` + tonlar `/key/` ile eşlenir). Kayıt formu 2026-11'de boş yanıt döndü, anahtar gelmedi. Altbilgideki getsongbpm.com bağlantısı başvuru şartıdır, kaldırılmaz.
- **Tarza özel arama (2026-11-22):** analizden sonra "SONRAKİ ŞARKININ TARZI" kutusu (`#sa-tur`). Yazılırsa sunucu `/search/playlist?q=<tarz>` → en iyi 4 listenin şarkıları (iç içe) → ilk 36'nın BPM'i `/track/{id}` (6'şar, 700 ms ara; `vercel.json` maxDuration 30) → tempoya 10 BPM'den uzaklar elenir, BPM'i bilinmeyen kalır (önizlemeden ölçülür). Deezer şarkı aramasında serbest metin ve `artist:` alanı BPM filtresiyle çalışmıyor (denendi). Boşsa tempo bazlı popüler arama.
- Takip: `supabase/sarki-avcisi.sql` → `sarki_avcisi_takip` (yeni tablo, RLS: is_admin() ve kendi satırı). Tablo kurulmadıysa liste localStorage'da tutulur.
- Test: `tests/sarki-avcisi.test.js`.

## Ikonlar (2026-11-21)

Derin'in seçtiği karışık set, `assets/ikonlar/` (16 SVG): dosya türleri `dosya-*.svg` "makara bant" belgesi (WAV sarı, MP3 yeşil, FLAC turuncu, AIFF mor, M4A turkuaz, OGG kırmızı, video/MP4 pembe, görsel, dekont); `dosya-ekle.svg` yuvarlak köşeli kare; `buton-*.svg` pembe yuvarlak (indir, yükle, oynat, klasör, bilgi, sürükle-bırak).
- `dr-ikonlar.js` her sayfaya `uygulama.js` sonundaki yükleyiciyle gelir; sayfa koduna dokunmaz: görünen `input[type=file]` yerinde kalır, gizlenir, yanına "Dosya ekle" butonu + seçilen dosyanın adı/ikonu çizilir; gizli girişi saran etikete ikon eklenir; `[data-dl][data-bicim]` ve `[data-indir][data-ad]` indirme düğmeleri format ikonunu alır. `.istek-birak` kutusu olduğu gibi kalır. Başka yerde: `window.DerinIkon.dosya('ad.wav')` ya da `data-dosya-ikon="ad.wav"`.
- İkon değişince `dr-ikonlar.js` içindeki `SURUM` artırılır (test: `tests/dr-ikonlar.test.js`).
