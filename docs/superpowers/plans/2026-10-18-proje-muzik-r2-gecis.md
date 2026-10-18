# Antrenör proje müziği + DJ dosyaları → R2 geçişi — Uygulama Planı (2026-10-18)

> **Durum:** PLAN — henüz hiçbir uygulama dosyası değişmedi. Onay gelince görev sırasıyla uygulanır.
>
> Akış: her görevde önce failing test (`node --test tests/<ad>.test.js` → FAIL), sonra uygulama, sonra `node --test tests/*.test.js` → PASS, sonra commit. Repo kuralı: "for agentic workers" akışı AGENTS.md + bu repo plan geleneğiyle uyumlu.

**Amaç:** Antrenör proje müzikleri (Supabase `project-audio` kovası) ve harmonik mikser DJ dosyaları (`dj-audio` kovası) yüklenme/çalma/indirme/silme akışlarını Cloudflare R2'ye bağlamak. Bununla Supabase'in 50 MiB tek-dosya tavanı ve 1 GB storage kotasının baskısı proje/dj tarafında kalkar; radyo sesleri zaten R2'de.

**Neden bu kolay:** Altyapı yarı yolda zaten hazır:
- `api/r2-yukleme-izni.js`'teki `IZINLI_ONEK` listesi `proje/` ve `dj/`'yi **zaten** kapsıyor.
- `r2-depo.js`'in `yukle()` fonksiyonu Supabase `upload()` ile **aynı çağrı sonucunu döndürür** (`{ data:{ path }, error }`). Yani çağrı yerleri aynı kalır.
- `Ses.parcaliYukle({ yukle, sil })` soyutlaması (audio-file-types.js) hem projects.js hem chat.js hem harmonic-mixer.js'te aynı kalıpta kullanılıyor; sadece `yukle`/`sil` fonksiyonlarının gövdesi R2'ye bağlanır.

**Yol değişmiyor:** DB'de saklanan yollar aynen kalır; R2'de karşılıkları `proje/<aynı-yol>` ve `dj/<aynı-yol>` önekleriyle durur. `project_tracks` veya diğer tablolarda **hiçbir şema/yol güncellemesi gerekmez** (radyo geçişinde uygulanan aynı yaklaşım).

---

## Global Kurallar

- `config.js`'e secret girilmez. `chat-crypto.js`'e dokunulmaz. UI metinleri değişmez (yeni uyarı gerekmez).
- RLS/SQL dosyalarına **dokunulmaz** (`supabase/proje-dosya-deposu.sql` aynı kalır); boş bucket + var olan politikalar maliyet üretmez. Veritabanı şeması değişmez.
- `tests/` klasöründeki taşıma betiği canlıya girmez (`.vercelignore` zaten `tests/` hariç tutuyor). Secret'lar sadece betik anında ortam değişkeni olarak verilir; depoya yazılmaz.
- Parçalı yükleme (45 MB) kalır — R2'de tek dosya limiti çok daha yüksek olsa da parçalama sistemi zararsızdır ve kod aynı kalmaya devam eder (DERIN-RECORD-YAPILANLAR.md §7'de bunun uzun vadeli notu zaten var).
- `?v=` sürüm numarası değişen her JS dosyasının HTML referanslarında artırılır.
- Geçiş (veri taşıma) bitmeden **yeni kodu canlıya alan deploy yapılmaz**; aksi halde ESKİ dosyaları (henüz R2'de yokken) arayan sayfalar kırılır.

---

## Karar 1 (kullanıcıya): Çalma adresleri nasıl üretilir?

Şu an `project-audio` kovası **gizli** (`public:false`) ve erişim RLS'le kısıtlı; okuma hep `createSignedUrl` (1 saatlik) ile yapılıyor. R2'ye geçince iki yol var:

**A — Ortak (public) okuma alanı (radyo gibi):**
- Çalma adresi: `https://muzik.derinrecord.com/proje/<coach-id>/<proje-id>/...`
- Artı: en az kod; extra API değişikliği gerekmez.
- Eksi: yolu bilen herkes dosyayı açabilir. Yayın içi içeriğin gizliliği (antrenörün kendi doğru hafızası) artık RLS koruması dışında olur. Yol UUID'li olduğundan tahmin zor ama tam anlamıyla gizli de değil.

**B — İmzalı GET adresi (önerilen):**
- `api/r2-yukleme-izni.js`'e `islem: 'oku'` desteği eklenir; 10 dk geçerli GET imza döner.
- Yetki kontrolü basit ve **veritabanı sorgusu gerektirmez**: `proje/` altındaki istekte yolun ilk klasörü `auth.uid()`'e eşitse antrenöre izin; `admin` her yol; başka herkese 403. (Bu, Supabase'deki mevcut RLS kuralının — `storage.foldername(name)[1] = auth.uid()` — birebir karşılığıdır.)
- Eksi: +25–30 satır API değişikliği; her çalma/indirme öncesi kısa bir imza isteği.
- Artı: antrenör dosyalarının gizliliği Supabase'deki davranışla aynı kalır.

**DJ (`dj-audio`) için:** harmonik mikser yalnızca oturum açmış kullanıcıların görebildiği bir sayfa; aynı imzalı GET yaklaşımı (`dj/` için admin koşulu) uygulanır. DJ dosyalarının hacmi küçük olduğu için yük azdır.

**Etkilenecek kod sayısı:** Karar A alınırsa `api/` değişmez; Karar B alınırsa `api/r2-yukleme-izni.js` + `r2-depo.js`'e "korumalı okuma" işlevi eklenir.

---

## Görev 1 — `r2-depo.js` haritasını genişlet + API'ye okuma imzası

**Yeni test dosyası:** `tests/proje-depo-r2.test.js` — kaynak metin beklentileri (repo test geleneği):
- `r2-depo.js` `ONEK` içinde `'project-audio': 'proje/'` ve `'dj-audio': 'dj/'` satırları var.
- Karar B seçilirse: `api/r2-yukleme-izni.js` `islem: 'oku'` işleyen blok var; `proje/` yolunun ilk klasörünü istek sahibinin `auth.uid()`'i ile karşılaştıran bir satır var; `r2-depo.js` `korumaliAdres` fonksiyonu tanımlı.
- Karar A seçilirse: bu iki blok gerekmez.

**Uygulama:**
- `r2-depo.js` `ONEK`'e iki kova eklenir:
  - `'project-audio': 'proje/'`
  - `'dj-audio': 'dj/'`
- Karar B: `api/r2-yukleme-izni.js` `islem: 'oku'` kabul eder; imzalı GET adresi (S3 uç noktası, 600 sn) döndürür; yetki: admin her yolu imzalayabilir, antrenör yalnız ilk klasörü kendi `auth.uid()`'i olan `proje/` yollarını; diğer herkese 403. `r2-depo.js`'e `korumaliAdres(kova, yol)` fonksiyonu eklenir (imzalı adresi döndürür; çalan kod bunu `fetch`/`<audio>` ile kullanır).
- `?v=` numarası `r2-depo.js?v=2`'ye çıkarılır (radyo-yonetim.html, coffee-marka.html güncellenir).

---

## Görev 2 — Yükleme/çalma/indirme/silme kodlarını R2'ye bağla

**Failing testler:** kaynak dize beklentileri: bu 3 dosyada artık `client.storage.from('project-audio')` ya da `client.storage.from('dj-audio')` **yok**; `window.DerinR2` referansları var; sayfa etiket testleri: `chat.html`, `my-projects.html`, `harmonic-mixer.html` artık `<script src="r2-depo.js?v=2">` yüklüyor.

**Uygulama satır-satır hedefleri:**

1. **`projects.js`** (antrenör paneli):
   - § `yukleSes()` (~361) içindeki `client.storage.from('project-audio')` çağrısı → `window.DerinR2.yukle('project-audio', path, file, ct)`. MIME fallback bloğu zararsızdır (R2, Supabase gibi MIME reddi üretmez; blok düşük ihtimalle boş geçer) — repo kuralına göre değişiklik en aza indirilir ve korumaya devam edilir.
   - § `yukleSesParcali()` içinde `sil` fonksiyonu → `window.DerinR2.sil('project-audio', yollar)`.
   - § Dalga (waveform) yan dosyası yükleme (~494) → aynı R2 yolu; yan dosyalar da `proje/` öneki altına gider.
   - § Çalma ve indirme: yerler ~252 (`signed` helper), ~485, ~1465, ~1685:
     - Karar A: `DerinR2.adres('project-audio', path)` doğrudan adres döndürür.
     - Karar B: `await DerinR2.korumaliAdres('project-audio', path)` her çalma/indirme öncesi.
     - İndirme isim korunması: parça-birleştirilen yol (`sesBlob` + `a.download` özniteliği) zaten var; `{download: ad}` imzalı URL kullanılan yerlerde R2 tarafında aynı isim `url.download` özniteliğiyle korunur (R2'nin ortak alan adı `response-content-disposition` sorgusunu desteklemeyebilir; bu yüzden `a.download` özniteliğine güvenilir).
   - § Silme (~1475, ~1722, eski parça temizliği ~1742) → `DerinR2.sil('project-audio', yollar)`.
2. **`chat.js`** (Müzik Araştır üzerinden ses gönderimi ~536–558):
   - `yukle` gövdesi → `DerinR2.yukle('project-audio', …)`; `sil` → `DerinR2.sil('project-audio', …)`.
   - Yarım kalan proje silme bloklu geçiş aynen korunur.
3. **`harmonic-mixer.js`** (DJ dosyaları):
   - `djDepo()` yerine tek yerde: `window.DerinR2` üzerinden `adres/yukle/sil` çağrıları kova parametresiyle `dj-audio`/`dj/` bağlanır (satır ~33, 38–41, 48, 757, 847).
   - `createSignedUrl(path, 3600)` yerine: Karar A → `adres('dj-audio', path)`; Karar B → `korumaliAdres('dj-audio', path)`.
4. **HTML referansları:**
   - `radyo-yonetim.html`, `coffee-marka.html` içindeki `r2-depo.js?v=1` → `?v=2`.
   - `chat.html`, `my-projects.html`, `harmonic-mixer.html` — artık `r2-depo.js?v=2` etiketi **eklenir** (bu sayfaların mevcut script yükleme sırasına uygun yerde).
5. `bildirimler.js` (yönetici onay akışı) üzerinde yalnız DB `project_tracks.insert` var — **kod değişikliği gerekmez** (yol yine aynı biçimde kalır).

---

## Görev 3 — Veri taşıma betiği (yerel, bir kez)

**Dosya:** `tests/proje-depo-tasimasi.js` (Vercel yayın dışı); **koşu**:
```
node tests/proje-depo-tasimasi.js            # kuru-çalıştırma: yalnız plan/istatistik yazar, hiçbir şey yapmaz
node tests/proje-depo-tasimasi.js --uygula   # gerçek kopyalama
node tests/proje-depo-tasimasi.js --dogrula  # R2 ve Supabase tarafını karşılaştırır (boyut/SHA)
```
**Gerekli ortam değişkenleri** (yalnız koşu anında, terminalden verilir; depoya/commit'e girmez):
- `SUPABASE_SERVICE_KEY` (gizli kovadan okumak için — export/csv çıktı almamak için GET isteğiyle parça parça akış çekilir)
- `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` (R2 imzalı PUT/GET üretimi için — bunlar zaten Vercel'de tanımlı; betik aynı değerleri yerelde kullanır)

**Davranış:**
- Kapsam: `project-audio` ve `dj-audio` kovaları. `feedback-audio` ve `project-voice-notes` **dışarıda** (takip eden başka bir geçiş olabilir).
- Liste kaynağı: Supabase Storage REST list (service key ile) — klasör düzeyinde recurse: `folder` prefix içinde `nextPageToken` takip eder. (Doldurulan hatalı yüklemeleri de kapsar; DB'de `project_tracks` kaydı olmayan yetim dosyaların öneki `proje/` altında orijinal yol şeklinde taşınır.)
- Kopyalama: GET (service key) → PUT (R2 S3 uç; SigV4 imza). **Yol korunur**: `proje/<aynı relative path>`.
- **Idempotent:** manifest dosyası `tests/tasima-durumu.json` (lokal, git'e girmez): koşulda önce `HEAD` ile R2'de var mı + `Content-Length` eşleşmesi kontrol edilir, varsa atlanır.
- **Doğrulama:** her dosya için boyut eşleşmesi zorunlu; `--dogrula` optional SHA-256 karşılaştırma (büyük WAV'lar için parametre) — bu, DERIN-RECORD-YAPILANLAR.md §3'te uygulanmış olan "bit düzeyinde birebir" formunun küçük-ölçek tekrarıdır.
- Durum çıktısı: kaç dosya taşındı, toplam byte, hata listesi (varsa).
**Küçük unit tests:** yol↔R2 anahtar dönüşümü (`r2-depo.js` `ONEK`'e bağlı), manifest okuma/yazma fonksiyonları.

---

## Görev 4 — Canlıya alış ve doğrulama

- `node --test tests/*.test.js` PASS; `node --check` değişen JS'ler.
- Commit + push dal `proje-r2-gecis`; Vercel production READY.
- **Taşıma betiği ÖNCE koşulur, sonra deploy** (bir ters sıralama canlıda kırılmaya yol açabilir).
- Doğrulama listesi (canlı):
  1. `my-projects.html` → küçük WAV yükle → panelden çal → istek adresi `muzik.derinrecord.com/proje/…` (Karar B ile: URL'de kısa ömürlü imza) olur.
  2. Chat → Müzik Araştır → küçük ses gönder → proje açılır, parça kartında çalınır.
  3. Harmonik mikser → DJ dosyası yükle → kayıt kapısı + çalma çalışır.
  4. 53 MB master WAV → `parça 1/2, parça 2/2` ilerleme akışın R2'de de çalışır.
  5. **Eski proje** (Supabase'den taşınmış) üzerinde çalma/indirme çalışır (yollar aynı, R2'de karşılıkları var).
  6. Karar B: imza API antrenörün *kendi* klasörü dışındaki `proje/` yollarına 403 döner.
  7. CORS kontrolü: `curl -H "Origin: https://derinrecord.com" -D - -o /dev/null https://muzik.derinrecord.com/proje/<test-dosya>` — `Access-Control-Allow-Origin` başlığı (indirme-merge fetch'i için).
- Başarılıysa dal `main`'e birleştirilir ve `DERIN-RECORD-YAPILANLAR.md`'ye kısa bir "proje/dj sesleri artık R2'de" bölümü eklenir; `CLAUDE.md` / `AGENTS.md` mimari satırları güncellenir.

---

## Görev 5 — Supabase'de duran eski dosyaların akıbeti

- **Geçiş anında:** taşınan proje/dj dosyaları **hemen silinmez**. Supabase'deki orijinaller yedek olarak durur; canlı doğrulama listesi tamamen yeşil olduktan sonra bile "30 gün acil dönüş penceresi" açık kalır.
- **Süreç:** kullanıcı 30 gün sonunda onay verince `tests/proje-depo-tasimasi.js --temizle --uygula` Supabase `project-audio` ve `dj-audio` içeriğini boşaltır.
  - Güvenlik ön koşulu: `--dogrula` çıktısı 0 hata ve 0 eksik dosya göstermeli; aksi halde betik silmeyi reddeder.
- **Silmeme seçeneği:** kullanıcı sürekli saklamak isterse hiçbir şey silinmez; Supabase 1 GB dolana kadar orijinaller pasif yedek olarak kalır (etkisi: kota baskısı sürer).
- **Kapsam dışı:** `feedback-audio` ve `project-voice-notes` kovaları Supabase'de kalır (düşük boyut); onların yüklemeleri, politikaları ve okuma imzaları hiç değişmez.
- **Rollback planı:** canlı doğrulamada sorun çıkarsa dal geri alınır/eski sürdürülür; Supabase'de hâlâ orijinaller durduğu için ESKİ kod (eski `?v=` sürümü) her zaman geri yüklenebilir: `project-audio/dj-audio` yolları DB'de hiç değişmediği için eski kod da aynı verileri Supabase üzerinden bulur. Süreç çift taraflı güvenli.

---

## Kaynakça (kod satır numaraları bu plana)

| Dosya | Satırlar | Konu |
| --- | --- | --- |
| `r2-depo.js` | 1–97 | R2 haritası + `yukle/sil/adres`; `ONEK` 23–27, `yukle` 63–74, `sil` 78–93 |
| `api/r2-yukleme-izni.js` | 20–23 | `IZINLI_ONEK` zaten `proje/`, `dj/` içerir |
| `projects.js` | 252, 361–370, 381–392, 485–494, 1465, 1475, 1685, 1722, 1742 | Yükleme/çalma/indirme/silme |
| `chat.js` | 536–558 | Müzik Araştır ses gönderimi |
| `harmonic-mixer.js` | 33, 38–41, 48, 757, 847 | DJ yükleme/çalma/silme |
| `supabase/proje-dosya-deposu.sql` | 44, 76–96 | `project-audio` gizli bucket + RLS (referans; değişmez) |
| `assets/audio/*.wav` | — | Ana sayfa demo kasetleri; depo içinde statik, kapsam dışı |
