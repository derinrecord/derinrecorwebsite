# 03 — İş kuralları

Bu dosyadaki her kural gerçek kullanımda bir hatadan sonra yazıldı. Claude'a "bu kuralları
uygula, kendi başına iyileştirme önerme" diye verilmeli.

## 1. Zaman

* Modülde işletme/müşteri bağlamı yok → **tek yerel saat dilimi**. Tüm "bugün" karşılaştırmaları
  o dilime göre.
* Sunucu UTC çalışıyorsa, ham `now()` **yasak**. Tek bir `Clock.Now()` / `Clock.Today()`
  yardımcısı yaz, her yer onu çağırsın. Gerekçe: UTC sunucuda gece yarısından sonra "bugünün
  görevleri" bir gün kayar; kullanıcı sabah ajandayı boş görür.
* Tarih alanları `DATE`, zaman damgaları `DATETIME`. Vade saat tutmaz.

## 2. Ödeme ve vade

Akış, kasıtlı olarak basit:

```
Ödeme gir → "sonraki ödeme tarihi" → VADE → vade geçince "Ödemedi" (kırmızı)
         → vade + N gün (varsayılan 1) sonra BİR KEZ otomatik mesaj → sonrası elle "Hatırlat"
```

**Abonelik ödemesi (`paymentKind = subscription`) kaydedilince, tek işlemde (transaction):**
1. Ödeme satırı yazılır.
2. `account.invoiceIssued` / `invoiceNo` ödeme satırına **kopyalanır** (snapshot) ve karttan
   sıfırlanır — bayrak mevcut vadeye aittir, ödemeyle o vade kapanır.
3. `account.paymentNote` doluysa ve ödeme notu boşsa, vade notu ödeme satırına **taşınır**
   (300 karaktere kırpılır) ve karttan temizlenir.
4. Sonraki vade: istek gönderdiyse o; göndermemişse `paymentDayOfMonth` doluysa türetilir
   (mevcut vadenin bir ay sonrası, günü = D); ikisi de yoksa **vade değişmez**.
5. Vade değiştiyse `paymentReminder = 0` (yeni dönem, yeni otomatik hatırlatma hakkı).

**Ek ödeme (`paymentKind = extra`)** vadeye, sayaca, fatura bayrağına ve vade notuna
**dokunmaz**; `nextPaymentDate` daima NULL. Tahsilatta ayrı toplanır.

**Ödeme güncelleme vadeye ve sayaca dokunmaz.** Doğru vadenin ne olduğu belirsiz; kullanıcı
elle düzeltir.

**Ödeme silme vadeyi geri almaz.** Geri alma denendi: yanlış silinen bir ödeme, zaten
gönderilmiş hatırlatmayı tekrar tetikliyor.

**Kısmi ödeme ve taksit yok.** Fark not alanına yazılır.

**Ay sonu türetmesi:** `paymentDayOfMonth = 31` ise sonraki vade Şubat'ta ayın son günüdür.
Her seferinde **başlangıçtan** hesapla, kırpılan günü sonraki aya taşıma.

## 3. Otomatik ödeme hatırlatması

**Aday filtresi** (zamanlanmış iş):
```
stage = 'member' AND contractType = 'paid' AND autoReminderEnabled = 1
AND nextDueDate IS NOT NULL
AND nextDueDate + COALESCE(reminderOffsetDays, 1) <= bugün
AND paymentReminder = 0
AND en az bir alıcı var (receivesPaymentReminder AND isWhatsapp AND phoneE164 IS NOT NULL)
```

* Gönderim firmanın **hatırlatma alıcısı işaretli tüm kişilerine** gider; her kişi için ayrı
  gönderim ve ayrı log satırı.
* **Tutar girilmemiş firmaya hiçbir şey gönderilmez** — tutarsız hatırlatma yanlış mesajdır;
  atlama sebebi yanıt gövdesinde döner.
* En az bir alıcıya ulaştıysa `paymentReminder += 1` → bu vade için otomatik hak tükenir.
* İş **saat başı** tetiklenebilir olmalı. Bunu güvenli kılan iki şey: başarılı gönderimde sayaç,
  başarısızlıkta **günlük deneme sınırı** (ör. 3). Sınır, o gün `triggeredBy='auto'` ve
  `status='failed'` log satırları sayılarak uygulanır; ertesi gün kendiliğinden sıfırlanır.
* İkinci (gecikme) hatırlatması **elle** gönderilir; ayrı şablon, gecikme günü parametresiyle.
  Kademe alanı yok — birinci/ikinci ayrımı log'daki `templateKey`'den okunur.
* `contractType != 'paid'` (barter/hediye/deneme) → otomatik kapalı.
* Elle hatırlatmada sayaca bakılmaz, cooldown yok, ama **idempotent** olmalı (çift tık iki mesaj
  göndermesin).
* Hatırlatma kullanıcının mesaj bakiyesinden/kotasından **düşmez** (sistem tetikli gönderim).

**Şablonlu mesajlaşma kullanıyorsan (WhatsApp Business API gibi):**
* Serbest metin yok, yalnız onaylı şablon. Şablon adı kodda sabit.
* Parametrelerde satır sonu, tab ve 4+ ardışık boşluk **yasak** → her parametreyi tek boşluğa
  indir, boşsa `"-"` yaz.
* Tutar ve para birimi **ayrı parametre** olsun ("4.800" + "TL"): gövdede bitişik yazıldığında
  biçimlendirme şablonda kalır, kodda değişmez.
* Hitabı sabit tut ("Değerli Üyemiz"). Kişi adını parametre yapmak, şablon onayı her
  değiştiğinde parametre sırasını kaydırıyor.
* Numara biçimi tek: `905xxxxxxxxx` (artı yok) — sağlayıcıya ne gönderileceğini tek yerde
  normalize et.

## 4. Görev kuralları

### 4.1 Belirsiz tarih dönüşümü
Arayüzde kısayol, sunucuda doğrulama:
* "ay başı / ortası / sonu" → ayın 1'i / 15'i / son günü, `dueIsApprox = 1`
* "X ay sonra" → bugün + X ay, approx
* "bayramdan sonra / okullar açılınca" → kullanıcı tarih seçer, `dueLabel` orijinali saklar
* Rakip sözleşmesi → bitiş − 45 gün (§4.4)

### 4.2 Görev tamamlama — tek uç, tek transaction
`POST task/{id}/complete` gövdesi: `{ activity {...}, nextTask? {...} }` → üç iş birlikte:
görev `done` + aktivite yazılır + (varsa) yeni görev açılır. `doneActivityId` bağlanır.
Ayrı üç istek yapılırsa kullanıcı ikinci adımda vazgeçtiğinde yarım kayıt kalıyor.

### 4.3 Erteleme
`POST task/{id}/snooze` → `dueDate` (+ `dueTime`, `dueLabel`) değişir, `snoozeCount++`.
Arayüz kısayolları: yarın · 3 gün · haftaya · ay sonu · tarih seç.
`snoozeCount` işe yarıyor: 5 kez ertelenen görev gerçekte yapılmayacak bir iştir.

### 4.4 Otomatik görev üretimi (komut içinde, zamanlanmış işte değil)
`competitorContractEndsAt` girildi/değişti:
* Açık `sourceKind = competitor_contract` görevi varsa **güncellenir**, yoksa açılır.
* `dueDate = bitiş − 45 gün`; geçmişe düşüyorsa **bugün**.
* `dueIsApprox = 1`, `priority = must`, `note = "Rakip sözleşmesi <tarih> bitiyor (<yazılım>) — yenilemeden önce ara"`.
* Bitiş tarihi **silindiyse** açık görev `cancelled` olur.

Ayrıca: `stage = waiting`'e geçişte **açık görev zorunlu** (tetikleyici tarih olmadan "bekleme"
kaybolur). Sunucu doğrular, hata anahtarı `WaitingRequiresTask`.

**Ödeme gecikmesi görev üretmez** — ödeme kendi ekranında takip edilir; aynı iş iki yerde durmaz.

## 5. Ajanda — beş grup

Tek sorgu; hem ekran hem günlük özet aynı kodu çağırır. `ownerUserId = null` → hepsi.

```
gecikmiş      : status=open AND dueDate <  bugün
bugün         : status=open AND dueDate =  bugün     (dueTime'a göre sıralı)
bu hafta      : status=open AND bugün < dueDate <= bugün + (horizon-1)   [horizon: 7/30/90]
fırsatlar     : stage IN OpportunityStages AND competitorContractEndsAt <= bugün + 60
dokunulmamış  : stage IN ActiveFollowUpStages AND (lastActivityAt IS NULL OR < bugün - 30)
```

* Çok sorumlu varsa: **sahipsiz kayıtlar herkese** görünür (`ownerUserId IS NULL OR = ?`),
  görevler yalnız sahibine.
* Her görev satırı, görevde kişi yoksa firmanın **birincil kişisini** gösterir — "kimi arayacağım"
  her zaman dolu olmalı.
* Silinmiş firmaların görevleri ajandaya girmez.

## 6. Günlük özet (e-posta + push)

* Zamanlanmış iş saat başı çağrılabilir; **sabah eşiğinden önce** (ör. 08:00) özet göndermez.
* **Gecikmiş 0 ve bugün 0 ise e-posta gönderilmez.** Boş mail spam'dir ve kullanıcı üçüncüsünden
  sonra filtreye atar.
* **Aynı gün, aynı görev listesi için ikinci kez gönderilmez.** `setting` tablosunda
  `agenda_sent_<userId>` = `"yyyy-MM-dd|görevId,görevId"`; liste değiştiyse (yeni görev düştü)
  yeniden gönderilir.
* Saatli görevler için ayrı damga (`agenda_hour_<userId>` = `"yyyy-MM-dd HH|..."`): "14:30'da ara"
  görevi o saatin başında tek uyarı üretir.
* E-posta gövdesi: firma · kişi · `tel:` linki · görev notu · panele derin link.
* E-posta ve push **yan kanal**: her biri kendi try/catch'inde, hatası işi düşürmez.
* Tek kullanıcı varsa her şey ona; birden fazlaysa sorumlusu olduğu + sahipsiz kayıtlar.

## 7. Gelir matematiği

**Aylık eşdeğer** (yalnız `contractType='paid'` ve tutar doluysa):
`monthly → tutar`, `quarterly → tutar/3`, `yearly → tutar/12`, periyot yok/oneoff → 0.

**Aralık için beklenen:** aralıktaki her takvim ayı için pay = (ayın aralıkta kalan günü) /
(ayın gün sayısı); beklenen = aylık eşdeğer × payların toplamı. Yalnız firmanın **başladığı**
aydan itibaren sayılır.

**Başlangıç tarihi (`activeFrom`):** sözleşme başlangıcı ile ilk ödemenin **erken olanı**;
ikisi de yoksa ilk vade; hiçbiri yoksa NULL = henüz başlamadı (`notStarted`).

**Mutabakat** — her firma için şu eşitlik **her zaman** sağlanmalı:
```
beklenen = beklenene sayılan tahsilat + gecikmiş + bekleyen
```
* `paid = min(abonelik tahsilatı, beklenen)`, fazlası `prepaid` (önden ödeme / başka dönem).
* Kalan, vade geçmişse `overdue`, değilse `pending`.
* Durum: kalan ≤ 0 → `paid`; biraz ödendi → `partial`; hiç ödenmedi ve vade geçti → `overdue`;
  değilse `pending`.
* Yıllık sözleşmeler toplamı şişirdiği için özet **iki** mutabakat döndürür: yıllıklar hariç ve
  tümü dahil.

**Vade durumu eşikleri:** vade yok → `none`; geçmiş → `overdue`; bugün → `today`;
≤ 7 gün → `soon`; diğer → `ok`.

**Gider:** ödendiği güne **tam tutarıyla** yazılır, paylaştırılmaz. Yinelenme günleri başlangıç
tarihinden türetilir; aylık/yıllıkta ay sonu taşması kırpılır (31 Ocak → 28 Şubat → **31** Mart;
yani her adım başlangıçtan hesaplanır, kırpılan gün kalıcı olmaz). `endDate` NULL = süresiz.

**Net gelir** = aralıktaki tahsilat (abonelik + ek) − aralıkta ödeme günü düşen giderler.

## 8. Telefon, mükerrer, birleştirme, toplu işlem

* Normalizasyon tek yerde: ülke kodu ekle, boşluk/tire/parantez ve görünmez yön karakterlerini
  (LRE/PDF) temizle, `905xxxxxxxxx` üret. Çözülemeyen numara → `phoneE164 = NULL`, `phoneRaw`
  korunur, `needsReview = 1`. **Veri atılmaz.**
* Kayıt öncesi `GET duplicates?phone=&name=` → "Bu numara X firmasında kayıtlı, aynı firma mı?"
  **Uyarı, engel değil.**
* **Birleştirme** (`POST account/{id}/merge`): kişiler, aktiviteler, görevler, ödemeler hedefe
  taşınır; kaynak soft delete. Aynı firmanın iki kez girilmesi kaçınılmaz.
* **Toplu işlem** (`POST accounts/bulk`): seçili firmalara etiket ekle/çıkar, sorumlu ata, aşama
  değiştir, görev aç. "Yeni özellik çıktı, bu etiketi taşıyan 14 firmaya arama görevi aç" bu uçla
  tek işte yapılır.

## 9. Yetki

* Tek soru: bu kullanıcı CRM'i görebilir mi? **Rol matrisi yok.**
* Rolün üstüne bir **sahip listesi** koy (ör. izinli kullanıcı/telefon listesi yapılandırmada).
  Gerekçe: ileride ikinci bir yönetici hesabı açıldığında, o hesap rakip/fiyat/görüşme notlarına
  kendiliğinden erişmesin.
* Reddetme `403` + sabit hata anahtarı; "bulunamadı" ile karıştırma.
* Yazma uçları idempotent olmalı (mobilde çift dokunma gerçek bir sorun).

## 10. Faturalama (isteğe bağlı faz)

* Satıcı bilgileri ve entegratör anahtarları `setting`'te, **şifreli**; arayüze yalnız son 4 hane.
* Alıcı bilgileri `billing` tablosunda; vergi/kimlik numarası **şifreli**.
* Belge türü alıcının mükellefliğine göre sağlayıcıda sorgulanır (e-Fatura / e-Arşiv).
* **Çift fatura koruması:** satır sağlayıcıya gitmeden **önce** `status='sending'` + üretilmiş
  `ettn` (tekil indeks) ile yazılır. Belirsiz sonuçta (timeout) aynı ETTN ile **durum sorgulanır**,
  yeni fatura kesilmez. `status`: sending → issued | failed | unknown | cancelled.
* `attemptCount` ve `lastError` satırda tutulur; "yeniden sorgula" ucu durumu günceller.
* Kesilen fatura `dueDate` ile hangi vadeye ait olduğunu saklar.
