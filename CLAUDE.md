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
- **Deploy**: Netlify, GitHub reposuna bağlı otomatik deploy ile.

## Mimari

- `index.html` — ana sayfa (hero, hizmetler, demo kasetler, sezon, iletişim).
- `aerobik.html` / `akrobatik.html` / `artistik.html` / `ritmik.html` / `cocuk-fitness.html` — branş bazlı demo/dinleme sayfaları.
- `chat.html` + `chat.js` + `chat-crypto.js` — uçtan uca şifreli (ECDH P-256 + AES-GCM) antrenör sohbeti. Özel anahtarlar tarayıcıda IndexedDB'de tutulur (`derin-record-private-keys`); cihazlar arası taşıma PBKDF2 tabanlı yedekleme koduyla yapılır.
- `auth.js` — tüm sayfalarda ortak giriş/kayıt kabuğu; `window.DerinAuth` global state'ini yönetir, `derin:authchange` event'i yayınlar.
- `admin.js` / `admin.html` — sadece `profiles.role = 'admin'` olan kullanıcılara açık yönetim paneli (antrenörlere demo erişimi verme/kaldırma).
- `config.js` — Supabase Project URL ve **publishable (anon)** anahtarı. Secret/service_role anahtarı buraya asla girilmez.
- `supabase/*.sql` — şema ve RLS politikaları:
  - `derin-record.sql`: `profiles`, `demo_access`, `feedback_notes` tabloları + `is_admin()` / `has_demo_access()` güvenlik fonksiyonları.
  - `chat-encryption.sql`, `chat-key-backup.sql`, `sohbet.sql`, `demo-catalog.sql`: ek şema parçaları.
  - `kurulum.md`: kurulum adım adım talimatları.
- `fig-kaynaklari.md` — geri bildirim panelindeki FIG (Uluslararası Cimnastik Federasyonu) hareket seçicisinin kaynak/kapsam dokümantasyonu; resmi FIG Code of Points referansları içerir.
- `energy-map.js/html/css` — tempo/enerji haritası özelliği.
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
