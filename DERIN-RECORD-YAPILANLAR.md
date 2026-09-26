# Derin Record — Ses Dosyası Yükleme Sorunu: Yapılanlar

Bu döküman, antrenör portalındaki **“Yeni proje klasörü → ses dosyası yükle”** akışının
neden çalışmadığını, ne yapıldığını ve yayına almak için ne kaldığını anlatır.

---

## 1. Sorun

Yönetici, bir antrenör adına yeni proje klasörü açıp bir WAV seçiyor ve ✓'ye basıyor.
Sonuç: **proje kaydı oluşuyor ama ses dosyası hiç yüklenmiyor**, kartta
“Henüz parça eklenmedi.” yazıyor. Antrenöre parça atanamıyor.

## 2. Kök neden (canlıda ölçülerek kanıtlandı)

Sorun kodda değildi; **Supabase'in dosya boyutu tavanıydı.**

| Gönderilen boyut | Servis yanıtı |
|---|---|
| 5 MB | kabul (izin kontrolüne geçti) |
| 48 MB | kabul |
| **52.428.800 bayt (50 MiB)** | kabul |
| **52.428.801 bayt (50 MiB + 1)** | **HTTP 413 — “The object exceeded the maximum allowed size”** |
| **53 MB (kullanıcının WAV'ı)** | **HTTP 413 — aynı hata** |

- Tek nesne tavanı **tam olarak 52.428.800 bayt**. Bu, Supabase **ücretsiz planının
  üst sınırıdır** ve panelden yükseltilemez (Pro planda 500 GB'a kadar çıkar).
- Boyut kontrolü, yetki (RLS) kontrolünden **önce** çalışır. Yani hiçbir politika/Rol
  düzeltmesi 53 MB'lık dosyayı yüklenebilir hale getiremez.
- WAV yaklaşık **10 MB/dakika** olduğundan 5 dakikadan uzun kayıtlar bu tavanı aşar.

## 3. Çözüm: parçalı (chunked) yükleme

`PARCA_BOYUTU = 45 MB` üzerindeki dosyalar yüklenirken dilimlere bölünür:

- Adlandırma: `<antrenor-id>/<proje-id>-<zaman>-p01of02.wav`, `…-p02of02.wav`
- Dilimler orijinal dosyanın **kesintisiz parçalarıdır** (1. parça dosya başlığını taşır,
  sonrakiler ham devamıdır). Sırayla birleştirildiğinde dosya **bit düzeyinde birebir**
  aynı çıkar — yeniden kodlama yok, kayıp yok.
- **Oynatma** ve **indirme**: parçalar tarayıcıda birleştirilir; indirilen dosya
  orijinalin kendisidir.
- **Silme / yeni sürüm**: ilgili tüm parçalar birlikte temizlenir.
- **Şema değişikliği gerekmez**: parça bilgisi dosya adında taşınır, `project_tracks`
  tablosuna ek kolon eklenmemiştir.

Kayıpsızlığın kanıtı (gerçek bir 53 MB WAV, üretimdeki parçalama mantığıyla):

```
Orijinal   SHA-256 : 4663da504da8b68d54464dc5b4cdd21f1565fc044eabfdd7179f4abcea2fe5eb
Parçalar          : parça 1/2 = 45.00 MB, parça 2/2 = 7.99 MB
Birleşik   SHA-256 : 4663da504da8b68d54464dc5b4cdd21f1565fc044eabfdd7179f4abcea2fe5eb
Bayt bayt aynı mı? EVET · başlık: 44100 Hz, 2 kanal, 16 bit, 315.0 saniye
```

## 4. Veritabanı tarafı

`supabase/proje-dosya-deposu.sql` **canlıya uygulandı.** Doğrulama:

```
public.is_admin()      → HTTP 200 (önceden de vardı)
public.proje_sahibi()  → HTTP 200 (önceden 404'tü)
```

Bu dosya; yöneticinin antrenör klasörüne yazabilmesi, antrenörün yalnız kendi klasörünü
görüp yükleyebilmesi ve parça/geri bildirim kayıtlarının yazılabilmesi için gereken
politikaları tanımlar. **Birden fazla çalıştırılabilir** (idempotent); depolama ve tablo
bölümleri ayrı `DO` bloklarında olduğu için biri hata verse bile diğerleri uygulanır ve
betiğin sonundaki **ÖZET** sorgusu neyin uygulandığını tek satırda gösterir.

## 5. Uygulama tarafında yapılanlar

### Yeni dosyalar

| Dosya | İşlevi |
|---|---|
| `audio-file-types.js` | Ses tipi/uzantı eşlemesi, 50 MiB sınırı, parçalama yardımcıları. Tek doğruluk kaynağı; hem tarayıcıda hem Node testlerinde kullanılır. |
| `tests/audio-file-types.test.js` | Sınır, dilimleme, **bit düzeyinde birleştirme** ve yol çözümleme testleri. |
| `tests/projects-boot.test.js` | Sayfanın hatasız yüklenmesi ve panelin WAV dosyasını kabul etmesi testleri. |
| `.vercelignore` | `supabase/`, `tests/`, `*.md` dosyalarının canlı sitede yayınlanmasını engeller (şema ve iç notlar herkese açık olmamalı). |
| `favicon.svg` | Sayfalarda referans verilen ama repoda olmayan favicon. |
| `supabase/proje-dosya-deposu.sql` | Yeni: depolama + tablo politikaları ve WAV/FLAC MIME ayarları. |

### Değişen davranışlar (`projects.js`, `my-projects.html`)

- **Parçalı yükleme** + panelde `parça 1/2` ilerleme bilgisi; hata olursa yarım kalan
  parçalar depodan temizlenir.
- **WAV/FLAC/MP3** kabulü; dosya tipi uzantıdan türetilir (bazı tarayıcılar `.wav` için
  boş ya da `audio/x-wav` gönderiyor, kova MIME listesiyle uyuşmuyordu).
- **Hata mesajları Türkçe ve eyleme dönük**: yetki hatası → SQL dosyasını çalıştır,
  boyut hatası → sınır, MIME hatası → kova ayarları.
- **Yarım kalan klasör geri alınır**: dosya yüklenemezse boş proje listede kalmaz
  (eski hatada tam olarak bu oluyordu).
- **İndirme**: dosya uzantısı korunur (eskiden indirilen dosya adı hep `.mp3` oluyordu);
  parçalı dosyalar tek dosya olarak birleştirilip indirilir.
- Sayfa oturum yokken hatalı sorgu atması engellendi (`coach_id=eq.null` → HTTP 400).

**Test durumu:** `node --test tests/*.test.js` → **22/22 geçiyor.**

## 6. Kalan tek adım: yayına alma

Site `derinrecord/derinrecorwebsite` GitHub reposundan Vercel ile otomatik yayınlanıyor.
Değişiklikler yalnızca yerel klasörde olduğu için **canlıda hâlâ eski kod çalışıyor**
(`projects.js?v=20260925b`, `audio-file-types.js` 404).

Yapılacak: değişen dosyaları repoya commit etmek (GitHub → **Add file → Upload files**),
Vercel gerisini kendisi yapar.

**Yayın sonrası doğrulama listesi**

1. `my-projects.html` → `projects.js?v=20260926c` ve `audio-file-types.js?v=2`
2. `/audio-file-types.js` → HTTP 200 (önceden 404)
3. `/projects.js` içinde `yukleSesParcali` bulunmalı
4. `.vercelignore` işini yaptıysa `/supabase/derin-record.sql`, `/CLAUDE.md`,
   `/tests/...` → **404** olmalı (önceden 200'dü)

Sonra 53 MB'lık WAV ile “Yeni proje klasörü” akışını deneyin: panelde sırayla
`parça 1/2` ve `parça 2/2` yazısını görüp parçanın karta düşmesi gerekir.

## 7. Uzun vadeli not

Ücretsiz planın depolama kotası küçüktür; 53 MB'lık master'lardan yalnızca ~18 tanesi
sığar. Çok sayıda proje tutulacaksa Supabase **Pro** plana geçip
*Storage → Settings → Global file size limit* değerini yükseltmek, hem 50 MiB tavanını
hem kota sınırını tek hamlede kaldırır. Parçalı yükleme o zaman da zararsızdır
(45 MB altındaki dosyalarda hiç devreye girmez).
