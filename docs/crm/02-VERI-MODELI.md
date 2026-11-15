# 02 — Veri modeli

Tabloların tamamı yeni ve **additive**: var olan şemaya dokunulmaz. Önek kullan (`crm_` ya da
`t_admin_crm_`), böylece "bu tablo kimin" sorusu hiç sorulmaz. Taşınabilir DDL: `sema/schema.sql`.

```
account 1—N contact          kişi + tek numara (rol, karar verici, hatırlatma alıcısı)
account 1—N activity         temas günlüğü — GEÇMİŞ
account 1—N task             görev — GELECEK (ajanda/e-posta/push/takvim tek kaynağı)
account 1—N payment          tahsilat (abonelik | ek ödeme)
account 1—N reminder_log     gönderim logu (WhatsApp/e-posta/push)
account 1—1 billing          fatura bilgileri (ayrı tablo — yoksa CRM çalışmaya devam eder)
account 1—N invoice          e-fatura kesim denemeleri
setting      anahtar/değer   modül ayarları (IBAN, satıcı bilgisi, gönderim damgaları)
bank_account                 birden çok IBAN
expense                      gider kalemi (net gelir hesabı)
```

## 1. `account` — firma kartı

Alanlar gruplandırılmış hâlde; tip ve uzunluklar `sema/schema.sql`'de.

**Kimlik ve durum:** `accountId`, `name` (zorunlu; adı bilinmeyen firma "İl — Kişi Adı" biçiminde
kaydedilebilir), `stage`, `stageChangedAt`, `ownerUserId` (sorumlu), `heat` (1 soğuk · 2 ılık ·
3 sıcak), `source`, `referralNote`, `lostReason`, `needsReview`, `importKey`, `notes`,
`lastActivityAt` (türetilmiş ama saklanır — liste sıralaması için), `createdAt`, `updatedAt`,
`createdByUserId`, `isDeleted`.

**Konum ve profil:** `cityId`, `districtId`, `branches` (virgüllü sözlük kodları — çok branşlı
firma tek kayıt), `organizationType`, `parentAccountId` (şube → üst kuruluş), `websiteUrl`,
`instagramUrl`, `facilityNote`, `tags` (virgüllü sabit sözlük).

**Rakip:** `currentSoftware` (sözlükten öneri + serbest metin), `competitorContractEndsAt`
(yalnız ay biliniyorsa ayın 1'i), `competitorAnnualFee`, `competitorNote`.
→ Bitiş tarihi girildiğinde **otomatik görev** üretilir (`03-IS-KURALLARI.md` §4.4).

**Sözleşme ve ödeme (stage = member):** `companyId` (ürün tarafındaki müşteri kaydıyla eşleme),
`contractType` (paid|barter|gift|trial), `contractStartsAt`, `contractEndsAt`, `billingPeriod`,
`amountInclVat` (**KDV dahil** — hatırlatma mesajında birebir bu tutar yazılır), `currency`,
`nextDueDate` (vade), `paymentDayOfMonth` (1-31; doluysa sonraki vade bu günden önerilir),
`paymentReminder` (bu vade için otomatik mesaj gitti mi — sayaç), `reminderOffsetDays`
(NULL = 1 gün), `autoReminderEnabled`, `invoiceIssued` + `invoiceIssuedAt` + `invoiceNo`
(bayrak **mevcut vadeye** aittir), `paymentNote` (bu vadeyle ilgili kısa not; ödeme kaydedilince
ödeme satırına taşınır ve temizlenir).

> **Tutarı KDV dahil tutma kararı bilinçli.** KDV hariç tutar + oran saklandığında hatırlatma
> mesajında yazılacak sayı her seferinde yeniden hesaplanıyor ve kuruş farkı çıkıyordu. Tahsil
> edilecek sayı neyse o saklanır.

**İndeksler:** `stage`, `nextDueDate`, `ownerUserId`, `lastActivityAt`,
`competitorContractEndsAt`, `companyId`, `importKey` (tekil, NULL hariç).

**Kurallar:** `contractType != 'paid'` → `autoReminderEnabled = 0`. `nextDueDate` elle değişince
`paymentReminder = 0`. `stage` değişince `stageChangedAt` yazılır. `stage = member` olurken açık
görevler kapatılmaz (kurulum görevleri olabilir).

## 2. `contact` — kişi

`contactId`, `accountId`, `name` (NULL olabilir — "telefona çıkan kişi, ismi öğrenilecek"),
`role`, `isDecisionMaker`, `isPrimary`, `phoneRaw` (girildiği gibi), `phoneE164` (normalize),
`isWhatsapp`, `receivesPaymentReminder`, `email`, `note` ("akşam 6'dan sonra müsait"),
`sortOrder`, `createdAt`, `updatedAt`, `isDeleted`.

* Aynı kişide iki numara → **iki satır**. Aynı kişi iki firmada → iki satır.
* `phoneE164` üzerinde indeks **tekil değil**: mükerrer **uyarı** üretir, kaydı engellemez.
* `isPrimary` firma başına en fazla bir (uygulama kuralı) — tek tık arama ve varsayılan muhatap.
* Hatırlatma alıcısı `isPrimary` **değil**, `receivesPaymentReminder` ile belirlenir: muhasebe +
  işletmeci birlikte alabilir.

## 3. `activity` — temas günlüğü (geçmiş)

`activityId`, `accountId`, `contactId` (kiminle görüşüldü), `activityType`
(call|whatsapp|email|demo|visit|offer|note), `direction` (outbound|inbound), `outcome`,
`occurredAt` (NULL yalnız içe aktarımda; arayüzde zorunlu, varsayılan şimdi), `summary`
(**uzun** serbest metin — gerçek kullanımda tek not 1.300 karaktere çıktı), `materials`
(gönderilen: video,screenshots,links,mail,offer), `offerAmount`, `offerNote`,
`createdByUserId` (= görüşen kişi), `createdAt`, `updatedAt`, `isDeleted`.

İndeks: `(accountId, occurredAt DESC)`. Her eklemede `account.lastActivityAt` güncellenir.
Düzenlenebilir (yazım hatası), silme soft delete.

## 4. `task` — görev (gelecek)

`taskId`, `accountId`, `contactId`, `taskType` (call|whatsapp|email|demo|visit|other),
`dueDate` (**zorunlu, somut**), `dueTime` (NULL = tüm gün), `dueIsApprox`, `dueLabel`
(orijinal ifade: "bayramdan sonra"), `priority` (normal|must), `note` (**arama öncesi** not:
"yetkili mi diye sor"), `status` (open|done|cancelled), `doneAt`, `doneActivityId`,
`ownerUserId` (kime hatırlatılacak; varsayılan `account.ownerUserId`), `sourceKind`
(manual|competitor_contract|import), `snoozeCount`, `googleEventId`, `createdByUserId`,
`createdAt`, `updatedAt`.

İndeksler: `(status, dueDate)` — ajanda sorgusu; `accountId`; `(ownerUserId, status, dueDate)`.

Bir firmada birden çok açık görev olabilir; liste "en yakın açık görev"i gösterir.

## 5. `payment` — tahsilat

`paymentId`, `accountId`, `amount`, `vatIncluded`, `currency`, `paymentDate`, `method`
(transfer|card|cash|barter|offset), `nextPaymentDate` (→ `account.nextDueDate`),
`invoiceIssued` + `invoiceNo` (ödeme anındaki **snapshot**), `note`, `paymentKind`
(subscription|extra), `extraType` (extra ise kalem: credit|other), `createdByUserId`,
`createdAt`, `updatedAt`. İndeks: `(accountId, paymentDate)`.

**`extra`** = vadeye, sayaca, fatura bayrağına dokunmayan ödeme (kontör, tek seferlik iş).
Tahsilatta ayrı toplanır. Bu ayrım olmadan gelir tablosu okunmaz hâle geliyor.

## 6. `reminder_log` — gönderim logu

`logId`, `accountId`, `contactId`, `channel` (whatsapp|email|push), `templateKey`, `sentAt`,
`status` (sent|failed), `providerMessageId`, `errorCode`, `dueDateSnapshot`, `triggeredBy`
(auto|manual), `createdByUserId`. İndeks: `(accountId, sentAt)`.

**Her deneme yazılır** — başarısız olanlar dahil. Otomatik işin gün içinde kaç kez denediğini
buradan sayıyor (§3 iş kuralları, günlük başarısızlık sınırı).

## 7. `setting` — anahtar/değer

`settingKey` (PK), `settingValue`, `updatedAt`, `updatedByUserId`.

Kullanımlar: hatırlatma mesajındaki alıcı adı / IBAN / banka, dekont WhatsApp numarası,
satıcı fatura bilgileri (`invoice_` önekli; vergi no ve API anahtarları **şifreli**),
günlük özetin gönderim damgası (`agenda_sent_<userId>` = `"yyyy-MM-dd|görevId,görevId"`).

> Damgayı ayarlar tablosunda tutmak, "aynı gün aynı görev listesi için ikinci mail atma"
> kuralını ek tablo açmadan çözer. Değer uzunluğunu sınırla (ör. 480 karakter) ve taşarsa kırp.

## 8. `bank_account`

`bankAccountId`, `bankName`, `payeeName`, `iban` (tekil), `currency`, `note`, `sortOrder`,
`isActive`, `createdAt`, `updatedAt`. Birden çok IBAN; hatırlatma mesajı ve "ödeme bilgileri"
sayfası buradan okur.

## 9. `expense` — gider kalemi

`expenseId`, `name`, `amount` (tahsilatla aynı taban: KDV dahil), `currency`, `period`
(daily|weekly|monthly|yearly|once), `startDate`, `endDate` (NULL = süresiz), `note`,
`isDeleted`, `createdByUserId`, `createdAt`, `updatedAt`. İndeks: `(isDeleted, startDate)`.

Gider **ödendiği güne tam tutarıyla** yazılır, aylara paylaştırılmaz: yıllık 12.000 yalnız
ödeme gününün düştüğü ayda 12.000 görünür. (Gerekçe ve ay sonu taşma kuralı: §3 iş kuralları.)

## 10. `billing` + `invoice` (faturalama fazı)

`billing` (1:1 account): `legalName`, `taxNumberEnc` (**şifreli** — şahıs işletmesinde kimlik
numarası olabilir), `taxOffice`, `address`, `district`, `city`, `email`, `phone`,
`personFirstName`, `personLastName`, `updatedAt`, `updatedByUserId`.

`invoice`: `invoiceId`, `accountId`, `ettn` (**tekil** — sağlayıcıya gitmeden önce yazılır),
`provider`, `documentType`, `status` (sending|issued|failed|unknown|cancelled), `invoiceNo`,
`pdfLink`, `invoiceDate`, `dueDate` (kesim anındaki vade), `lineName`, `quantity`, `unitCode`,
`vatRate`, `exemptionCode`, `exemptionReason`, `amountNet`, `amountGross`, `note`,
`providerStatus`, `lastError`, `attemptCount`, zaman damgaları.

> Fatura bilgilerini firma tablosundan ayırmak işe yaradı: bu iki tablo hiç yaratılmamışken
> CRM listesi, kartı ve ödeme takibi etkilenmiyor; yalnız fatura uçları hata veriyor.

---

## Sabit sözlükler

Hepsi **tek bir sabitler dosyasında** durur; veritabanında kod, arayüzde çeviri.

**`stage` — huni.** `new` (ham kayıt, temas yok) · `contacted` (görüşüldü / bilgi gönderildi) ·
`followup` (aktif peşinde olunan) · `demo` (demo planlandı/yapıldı) · `profile` (ücretsiz
kullanmaya başladı, teklif aşamasında değil) · `offer` (fiyat verildi, karar bekleniyor) ·
`onboarding` (anlaşıldı, kurulum) · `member` (ödeyen aktif müşteri) · `waiting` (beklemede,
tarihli tetikleyici var) · `passive` (ayrıldı) · `lost` (olumsuz).

Türev listeler — ajanda bunları kullanır:
* `ActiveFollowUpStages` = contacted, followup, demo, profile, offer → "dokunulmamış" listesi.
* `OpportunityStages` = new, contacted, followup, demo, profile, offer, waiting → "fırsatlar".

**`lostReason`** · competitor_contract · own_software · too_small · price · manual_ok · closed ·
decision_maker_no · unreachable · other.

**`outcome`** (aktivite sonucu) · reached · no_answer · busy_callback (müsait değil, tekrar ara) ·
info_sent · demo_done · positive · deciding · not_interested · wrong_number.

**`activityType`** call · whatsapp · email · demo · visit · offer · note
**`direction`** outbound · inbound
**`materials`** video · screenshots · links · mail · offer
**`taskType`** call · whatsapp · email · demo · visit · other
**`priority`** normal · must
**`status`** (görev) open · done · cancelled
**`sourceKind`** manual · competitor_contract · import
**`role`** (kişi) owner · manager · coach · partner · board · accounting · reception · other
**`source`** cold · referral · inbound · event · other
**`organizationType`** — kendi pazarına göre yaz (ör. club, academy, hotel, university,
municipality, association, chain, community)
**`branches`** — sattığın ürünün müşteri tipleri; kısa kodlar, virgüllü saklanır
**`contractType`** paid · barter · gift · trial
**`billingPeriod`** monthly · quarterly · yearly · oneoff
**`paymentMethod`** transfer · card · cash · barter · offset
**`paymentKind`** subscription · extra · **`extraType`** credit · other
**`expensePeriod`** daily · weekly · monthly · yearly · once

**`tags`** — iki aileyi tek sözlükte tut:
* `feat_*` → **özellik talepleri** ("bu özelliği isteyen firmalar" tek sorgu; özellik çıkınca
  kimleri arayacağını bu liste söyler). Bu, paketin en çok işe yarayan küçük fikri.
* nitelikler → `multi_branch`, `new_facility`, `no_website`, `import_review`, `likes_*` …

**`currentSoftware`** — kendi pazarındaki rakip yazılımların adları + `own` (kendi yazılımı var) ·
`manual` (elle yetiyor) · `unknown`. Serbest metin de kabul edilir.
