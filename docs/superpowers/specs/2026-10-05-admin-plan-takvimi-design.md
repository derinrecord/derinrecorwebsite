# Yönetici Plan Takvimi — Tasarım

Tarih: 5 Ekim 2026
Durum: onay bekliyor

## 1. Amaç

Derin'in günlük planlarını, ödeme takibini ve notlarını tek yerde tuttuğu,
radyo panelinin içinde yaşayan bir takvim ekranı.

Bu bir ekip aracı değil. **Yalnızca Derin görür.** Antrenörler, kahve markaları
ve şube cihazları bu veriye hiçbir şekilde erişemez.

### Başarı ölçütü

Derin panele girip "Plan" bölümüne bastığında bu ayın takvimini görür, bir güne
tıklayıp o güne madde ve not ekler, kenarda hangi aboneliğin ne zaman ödeme
getireceğini görür. Hiçbir şeyi kaydet düğmesine basarak saklamak zorunda
kalmaz.

### Kapsam dışı (bilerek)

- Tekrar eden maddeler ("her ayın 1'i")
- Hatırlatma, bildirim, e-posta
- Dosya ekleme
- Başkasıyla paylaşma, atama
- Sürükle-bırak sıralama
- Cimnastik sporcularının ödeme takibi — ayrı bir iş, kendi tasarımını hak
  ediyor. Aynı projede, ayrı bölüm olarak sonra yapılacak.

## 2. Nerede duracak

Panelde yeni bir bölüm: **Plan → Takvim** (`plan/takvim`).

Takvimin gövdesi **yeni bir dosyada** durur: `plan-takvim.js`. Mevcut iki panel
dosyası (`radyo-yonetim.js` 2.365 satır, `radyo-panel-views.js` 2.481 satır)
zaten büyük; takvimi oraya gömmek ikisini de şişirir ve çalışan yayını riske
atar. Bu dosyalara yalnızca bölümü tanıtan birkaç satır eklenir.

### Dokunulacak yerler

| Dosya | Değişiklik |
|---|---|
| `plan-takvim.js` | **yeni** — takvim, gün paneli, ödeme sütunu, kaydetme |
| `radyo-panel-views.js` | menü satırı, başlık, `gorunum()` içinde yönlendirme |
| `radyo-yonetim.js` | plan verisini yükleme, tıklama olaylarını `plan-takvim.js`'e geçirme |
| `radyo-yonetim.html` | `<script src="plan-takvim.js">` |
| `supabase/plan-takvimi.sql` | **yeni** — tablo ve yetki kuralı |

## 3. Veri

Tek tablo: `plan_maddeleri`

| Sütun | Tip | Not |
|---|---|---|
| `id` | uuid | birincil anahtar |
| `gun` | date | maddenin ait olduğu gün |
| `tur` | text | `'madde'`, `'not'` ya da `'odeme'` |
| `metin` | text | içerik |
| `bitti` | boolean | `madde`'de yapıldı, `odeme`'de ödendi |
| `marka` | text | yalnız `odeme` için |
| `tutar` | numeric | yalnız `odeme` için |
| `sira` | integer | gün içindeki sıra |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

**Günde tek not.** `tur = 'not'` satırları için `gun` üzerinde kısmi tekil
indeks var; böylece aynı güne iki not kaydı düşemez ve not yazma işlemi basit
bir ekle-ya-da-güncelle'ye iner.

**Yetki.** Tabloda satır düzeyinde güvenlik açık, tek kural:

```sql
create policy "plan: yalnizca yonetici" on public.plan_maddeleri
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
```

Yönetici olmayan biri bu tabloyu sorgularsa boş döner — yasak hatası bile
almaz, veri olduğunu anlamaz. `is_admin()` zaten projede kullanılan mevcut
fonksiyon; yeni bir yetki mekanizması kurulmuyor.

## 4. Ekran

### Ay takvimi

- Haftalar pazartesiden başlar
- Ay başındaki ve sonundaki boş hücreler komşu ayın günleriyle soluk doldurulur
- Bugün vurgulu
- Her gün hücresinde küçük rozet: `2/5` → o günde 5 madde var, 2'si bitmiş
- Üstte ay adı ve ileri/geri okları

### Gün paneli

Bir güne tıklayınca takvimin altında o gün açılır. Panelde her şey elle
yönetilir — **ekle, sil, katla**:

- `+ madde ekle` — yazıp Enter'a basınca kaydolur
- `+ ödeme ekle` — marka adı ve tutar; sistemde karşılığı olmayan ödemeler için
- Maddeler kutucuklu liste; kutucuğa tıklayınca üstü çizilir
- Ödeme satırında "ödendi" işareti; tutarı sonradan değiştirebilirsin
- **Her satırın yanında sil** — eklediğin hiçbir şey kalıcı değil
- Altında serbest not alanı (o güne ait tek not)

**Katlama.** Gün paneli, ödeme sütunu ve gün içindeki her bölüm (maddeler,
ödemeler, not) ayrı ayrı açılıp kapanır. Başlığa tıklamak katlar. Hangi
bölümün kapalı olduğu tarayıcıda hatırlanır; her açılışta hepsi yeniden
açılmaz.

Başka bir güne tıklamak açık günü değiştirir. Aynı güne tekrar tıklamak kapatır.

### Yaklaşan ödemeler

Sağda dar sütun. Önümüzdeki **60 gün** içinde dönemi biten abonelikler, tarihe
göre sıralı. Her satır: tarih, marka, tutar.

Tutar hesabı `plans` tablosundan: paket şube başına fiyatlıysa
`monthly_price × branch_count`, değilse `monthly_price`.

Dönem bitişi (`current_end`) boş olan abonelikler listede yer almaz — ne zaman
ödeneceği belli olmayan bir satır takvimde işe yaramaz.

**Sistemdeki markalar kendiliğinden gelir.** `subscriptions` tablosunda kaydı
olan her marka takvime otomatik düşer; abonelik tarihi değişirse takvim de
değişir, elle güncellemek gerekmez. Bu satırlar `plan_maddeleri` tablosunda
tutulmaz, canlı okunur.

Bu satırlar düzenlenemez — kaynakları abonelik kaydı. Yanlarındaki
**"takvime ekle"** düğmesine basınca o ödeme, o günün elle düzenlenebilir
`odeme` satırına dönüşür; tutarını değiştirebilir, ödendi işaretleyebilir,
silebilirsin. Havaleyle 1.800 geldiyse 1.800 yazarsın.

**Sistemde olmayan ödemeler** için gün panelindeki `+ ödeme ekle`
kullanılır. Böylece otomatik gelenle elle eklenen birbirine karışmaz: biri
aboneliğin aynası, diğeri senin defterin.

**Tutarsız kayıtlar gizlenmez.** Örneğin bir aboneliğin `canceled_at` tarihi
dolu ama durumu hâlâ `active` ise satır "iptal edilmiş" etiketiyle gösterilir.
Veriyi olduğu gibi göstermek, sessizce filtrelemekten iyidir — şu anda
starbucks kaydı tam olarak bu durumda.

## 5. Kaydetme ve hata

Kaydet düğmesi yok.

- Madde ekleme, işaretleme, silme: anında kaydedilir
- Not yazma: yazmayı bıraktıktan ~1 saniye sonra kaydedilir

Kaydedilemezse (internet gitti, oturum düştü) madde ya da not kırmızı kenarlıkla
işaretlenir ve yanında "kaydedilemedi — tekrar dene" yazar. **Yazılan metin
ekranda durur, silinmez.** Tekrar dene'ye basınca aynı kayıt yeniden gönderilir.

Sessiz başarısızlık yok: bir şey kaydedilmediyse ekranda görünür.

## 6. Test

`tests/` altında, projedeki mevcut düzene uygun node testleri:

**Takvim ızgarası**
- Ay başı ve sonu doğru hizalanıyor mu (pazartesi başlangıcı)
- Artık yıl: Şubat 2028 → 29 gün
- Ay geçişleri: Aralık'tan Ocak'a, Ocak'tan Aralık'a

**Yaklaşan ödeme hesabı**
- Şube başına fiyatlı pakette tutar `fiyat × şube sayısı`
- Sabit fiyatlı pakette tutar `fiyat`
- 60 günden uzaktaki abonelik listede yok
- Sıralama tarihe göre

**Yetki**
- Sorgu kuralının yalnızca `is_admin()` ile çalıştığı, SQL dosyasında kontrol
  edilir (mevcut `radio-management-render.test.js` kaynak kontrolü kalıbı gibi)

## 7. Riskler

| Risk | Karşılık |
|---|---|
| Panel dosyaları zaten büyük, değişiklik radyoyu bozabilir | Gövde ayrı dosyada; panele yalnız birkaç satır eklenir. Değişiklikten sonra 12 testin tamamı çalıştırılır |
| Yetki kuralı yanlış yazılırsa veri sızar | Tek kural, mevcut `is_admin()` üzerine. Kurduktan sonra yönetici olmayan bir oturumla sorgulanıp boş döndüğü doğrulanır |
| Otomatik kaydetme sessizce başarısız olur | Her başarısız kayıt ekranda kırmızı işaretle görünür, metin korunur |
