# AGENTS.md — Derin Record

Cimnastik/aerobik performans müziği stüdyosunun tanıtım sitesi + antrenör portalı. Vanilla HTML/CSS/JS + Supabase + Vercel; build aracı yok. Ayrıntılı rehber: [CLAUDE.md](CLAUDE.md). Uygulama günlüğü: [DERIN-RECORD-YAPILANLAR.md](DERIN-RECORD-YAPILANLAR.md). Özellik planları: `docs/superpowers/plans/` ve `specs/`.

## Doğrulama

`package.json` yok; build, bundler ve lint yapılandırması yok. Tek doğrulama yolu Node'un kendi test koşucusu:

```bash
node --test tests/*.test.js     # tümü (~495 test, ~2 sn) — her değişiklikten sonra koş
node --test tests/<ad>.test.js  # tek dosya
node --check <değişen>.js       # sözdizimi kontrolü (yalnız JS; lint yok)
```

- Testler `node:test` + `node:assert/strict` kullanır, saf Node'dur; ağ veya dış servis gerektirmez, saniyeler içinde biter. Hepsi geçmelidir.

## Mimari

Ürün alanları ve giriş dosyaları:

| Ürün alanı | Giriş dosyaları |
| --- | --- |
| Tanıtım sitesi | `index.html`, branş sayfaları (`aerobik.html`, `akrobatik.html`, `artistik.html`, `ritmik.html`, `cocuk-fitness.html`), `demo-catalog.js` |
| Antrenör portalı | `auth.js` (`window.DerinAuth`), `projects.js`/`my-projects.html`, `feedback.js`, `bildirimler.js`, `admin.js`, `license.js` |
| Şifreli sohbet | `chat.html`, `chat.js`, `chat-crypto.js` (şu an sayfadan gizli, aşağıda) |
| Radyo/şube paneli | `radyo-yonetim.js` (~175 KB), `radyo-panel-views.js` (~180 KB), `radyo-panel.css` |
| Kafe/marka oynatıcı | `coffee.js`, `coffee-marka.js` (URL `/coffee/...` rewrites `vercel.json`'da) |
| Harmonik mikser | `harmonic-set.js`, `harmonic-mixer.js`, `harmonic-analyze.js` |
| Ses deposu | `audio-file-types.js` — 50 MiB üstü dosyaları parçalar; hem tarayıcı hem Node testi aynı kaynağı kullanır |
| Vercel fonksiyonları | `api/konum-coz.js` (IP→şehir, anahtarsız), `api/r2-yukleme-izni.js` (R2 imzalı PUT/DELETE) |

- Veri katmanı Supabase (Postgres + RLS). Şema kaynağı `supabase/*.sql` — elle Supabase SQL editöründe çalıştırılır; migration tool yok.
- `api/*.js` Vercel serverless fonksiyonlarıdır: CommonJS (`require`/`module.exports`) — root'taki IIFE tarayıcı betiklerinden farklıdır; ikisine de `node --check` uygulanabilir.
- R2 gizli anahtarı tarayıcıya konulmaz; `api/r2-yukleme-izni.js` sunucuda imzalar. Gerekli ortam değişkenleri: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` (Vercel → Settings → Environment Variables).

## Yayın zinciri (kritik)

- Deploy GitHub → Vercel otomatiktir (`derinrecord/derinrecorwebsite`). Bu yerel klasör git deposu değildir; canlıya girmesi için dosyaların GitHub'a gönderilmesi gerekir.
- Yalnızca bu klasörü düzenlemek yayını etkilemez — daha önce bu yüzden canlı eski kod çalışmaya devam etti (bkz. [DERIN-RECORD-YAPILANLAR.md](DERIN-RECORD-YAPILANLAR.md)).
- Yayın sonrası doğrulama: değişen dosyanın yeni URL'i (ör. `/projects.js?v=yeni`) ulaşılabilir; `/CLAUDE.md`, `/tests/*`, `/supabase/derin-record.sql`, `*-prova.html` ise 404 dönmeli (bkz. `.vercelignore`).

## Yetki kuralları (ihlal edilirse site bozulur)

- `config.js` yalnızca Supabase publishable (anon) key içerir. `service_role` / secret yazmak yasaktır; bir test bunu denetler (`tests/site-temizlik.test.js`).
- `supabase/*.sql` RLS politikası değişiklikleri öncesi kullanıcıdan onay istenir; proje yetkilendirmeyi tamamen RLS'e bırakmıştır. Agent SQL'i doğrudan koşmaz; kullanıcı Supabase dashboard'da çalıştırır.
- `chat-crypto.js` şifreleme akışı (ECDH + AES-GCM) değiştirilecekse önce plan sunulur — hatalı değişiklik kullanıcıların şifreli geçmişini okunamaz yapar.
- Silinmiş özellikler geri getirilmez: sohbet gizli (`chat.html` ana sayfaya yönlendirir, test korur) ve öğrenci takvimi çıkışı (`tests/site-temizlik.test.js` öğrenci adı geçen hiçbir dosyaya izin vermez). Bunlar kusur değil, kasıtlı karar; "düzeltmeye" çalışmak yanlıştır.

## Önemli alışkanlıklar

- **`?v=N` cache-busting**: JS veya CSS dosyasının içeriği değişince, ona bağlanan her HTML'deki `?v=` parametresi de artırılır — aksi halde tarayıcı eski sürümü önbellekten sunmaya devam eder. Tarihsel biçim kullanılıyor (ör. `projects.js?v=20260925b` → `?v=20260926c`).
- **Kullanıcı verisi DOM'a basılırken** her JS dosyasının kendi yerel `escapeHtml()` / `safe()` fonksiyonundan geçirilir — bu alışkanlık her yeni dosyada sürdürülür.
- **JS stil**: her tarayıcı JS dosyası IIFE (`(() => { ... })()`) içinde yazılır; global paylaşım `window.Derin*` önekiyle yapılır (ör: `window.DERIN_CONFIG`, `window.DerinAuth`, `window.DerinChatCrypto`).
- **Dosya adları kebab-case, Türkçe** (`aerobik.html`, `sube-guvenlik.js`); UI metinleri ve test adları Türkçe.
- **Tasarım provaları** `*-prova.html` adıyla kaydedilir; `.vercelignore` canlıya almaz.
- **Özellik işleri plan dosyasıyla yürütülür** (`docs/superpowers/plans/`): test-önce-uygula akışı (`node --test tests/<yeni>.test.js` FAIL → uygula → PASS) ve planın "Global Constraints" satırları bağlayıcıdır.
- **Test dosyaları beklentileri sabitler**: `tests/` altındaki testler geçmiş kararları (silinen özellik, kaldırılan link/menü satırı) da kilitler; bir testi geçmek için testi değil, testin dayandığı kararı yeniden değerlendir — gerekirse kullanıcıya sor.
