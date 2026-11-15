# 05 — API sözleşmesi

Yol biçimi kendi yığınına göre değişir (`/api/crm/...`, `/api/v1/crm/...`). Önemli olan
**uçların bölünmesi** ve hangi işin tek istekte bittiği.

Tümü kimlik doğrulamalı + CRM sahibi kontrolü (§9 iş kuralları). Yazma uçları idempotent.

## Firma

```
POST   accounts                 liste + filtre (gövdede, çünkü filtre uzun)
GET    accounts/{id}            kart: kişiler + açık görevler + son 20 aktivite + ödemeler
POST   account                  hızlı oluştur (ad zorunlu + opsiyonel ilk kişi)
PUT    accounts/{id}            alanları güncelle
PUT    accounts/{id}/stage      { stage, lostReason?, task? }   waiting → task zorunlu
DELETE accounts/{id}            soft delete
GET    accounts/{id}/activities tam zaman tüneli (sayfalı)
POST   accounts/{id}/merge      { sourceAccountId } → taşı + kaynağı soft delete
POST   accounts/bulk            { accountIds[], action, payload }
GET    duplicates?phone=&name=&excludeAccountId=
```

**Liste isteği** (gövde):
```json
{ "stages": ["new","contacted"], "branches": ["..."], "cityId": null, "ownerUserId": null,
  "heat": null, "tag": null, "search": "ali", "untouchedDays": 30, "hasOpenTask": false,
  "competitorEndsWithinDays": 90, "needsReview": null,
  "pageNumber": 1, "pageSize": 30, "sort": "lastActivity" }
```
`sort`: `lastActivity | nextTask | name | created`.

## Kişi

```
POST   accounts/{id}/contacts
PUT    contacts/{contactId}
DELETE contacts/{contactId}
```
Gövde: `{ name?, role?, isDecisionMaker, isPrimary, receivesPaymentReminder, phone?,
isWhatsapp, email?, note?, sortOrder }` — sunucu `phone`'u normalize edip `phoneRaw` +
`phoneE164` olarak saklar.

## Aktivite

```
POST   activities    { accountId, contactId?, activityType, direction?, outcome?, occurredAt,
                       summary, materials?, offerAmount?, offerNote?,
                       nextTask? { taskType, dueDate, dueTime?, dueIsApprox, dueLabel?, priority, note?, contactId? } }
PUT    activities/{id}
DELETE activities/{id}
```
`nextTask` verilirse **aynı transaction'da** görev açılır. Bu, "üç tık" akışının tek isteği.

## Görev

```
GET    agenda?ownerUserId=&horizonDays=7
POST   accounts/{id}/tasks
PUT    tasks/{id}
POST   tasks/{id}/complete   { activity {...}, nextTask? {...} }   → done + aktivite + yeni görev
POST   tasks/{id}/snooze     { dueDate, dueTime?, dueIsApprox, dueLabel? }
POST   tasks/{id}/cancel
```

**Ajanda yanıtı:**
```json
{ "today": "2026-11-15",
  "overdue": [taskDto], "todayTasks": [taskDto], "week": [taskDto],
  "opportunities": [accountListItem], "untouched": [accountListItem] }
```
`taskDto` görevin yanında firma ve kişi bilgisini **taşır** (`accountName`, `accountStage`,
`contactName`, `contactPhoneE164`, `contactIsWhatsapp`) — ajanda listesi ek istek atmasın.

## Ödeme ve gelir

```
POST   accounts/{id}/payments   { amount, vatIncluded, currency?, paymentDate, method?,
                                  nextPaymentDate?, note?, paymentKind?, extraType?,
                                  paymentDayOfMonth?, updatePaymentDayOfMonth }
PUT    payments/{paymentId}     vadeye ve sayaca DOKUNMAZ
DELETE payments/{paymentId}     vadeyi geri ALMAZ
GET    accounts/{id}/payments
PUT    accounts/{id}/due-date         { nextDueDate, paymentNote? } → paymentReminder = 0
PUT    accounts/{id}/payment-terms    { contractType, billingPeriod, amountInclVat, currency,
                                        paymentDayOfMonth?, reminderOffsetDays?, autoReminderEnabled }
PUT    accounts/{id}/invoice          { invoiceIssued, invoiceNo? }
GET    accounts/{id}/reminders         gönderim geçmişi
POST   send-reminder                   { accountIds[], second? }
GET    summary?from=&to=
GET    revenue-table?from=&to=
GET    extra-payments?from=&to=
GET    expenses?from=&to=  ·  POST expense  ·  DELETE expenses/{id}
GET    bank-accounts  ·  POST bank-account  ·  DELETE bank-accounts/{id}
GET    settings  ·  PUT settings
GET    lookups                         tüm sözlükler + kullanıcı listesi
```

**Ödeme yanıtı** sonucu da döndürür — arayüz kartı yeniden çekmesin:
`{ payment: {...}, nextDueDate: "2026-12-01", invoiceIssued: false }`

**Özet yanıtı** (ana alanlar): huni sayıları (`funnel: { stage: adet }`), `totalAccounts`,
`needsReviewCount`, `openTaskCount`, `overdueTaskCount`, `activitiesThisMonth`;
ödeme tarafı `memberCount`, `paidCount`, `overdueCount`, `noTrackingCount`, `overdueAmount`,
`overdueWithoutAmountCount`; aralık tarafı `rangeFrom/rangeTo`, `collectedInRange`,
`collectedSubscriptionInRange`, `collectedExtraInRange`, `extraByTypeInRange`, `paymentsInRange`,
MRR (yıllıklar hariç / dahil) ve mutabakat blokları.

**Gelir tablosu satırı:** `name, contractType, billingPeriod, amountInclVat, monthlyEquivalent,
isYearly, expected, nextDueDate, invoiceIssued, paymentNote, status, overdueDays, overdueAmount,
collectedSubscription, collectedExtra, extraByType, paymentCount, lastPaymentDate,
paidTowardExpected, prepaidExcess, overdueExpected, pendingExpected, periodState`.
Toplamlar bloğunda **mutabakat eşitliği** korunur (§7 iş kuralları).

## Faturalama

```
GET    accounts/{id}/billing   ·  PUT accounts/{id}/billing
GET    accounts/{id}/invoices
POST   accounts/{id}/invoice/preview    kesmeden önce ne kesileceğini göster
POST   accounts/{id}/invoice            kes (ETTN önce yazılır — §10 iş kuralları)
POST   invoices/{invoiceId}/recheck     belirsiz sonucu sağlayıcıdan sorgula
GET    invoice-settings  ·  PUT invoice-settings  ·  POST invoice-settings/verify
```

## Zamanlanmış işler

```
GET    jobs/crm-reminder    hatırlatma işi   (saat başı çağrılabilir)
GET    jobs/crm-agenda      günlük özet işi  (saat başı; sabah eşiğinden önce özet göndermez)
```
Dışarıdan çağrılır → **ayrı anahtarla** korunmalı (oturum değil). Yanıt sayılarla döner:
`{ candidates, sent, failed, notifiedAccounts, skipped: ["Firma: tutar girilmemiş", ...] }`.
Atlama sebeplerini **yanıtta döndürmek**, "neden mesaj gitmedi" sorusunu loga bakmadan çözüyor.

## Hata sözleşmesi

Sabit hata **anahtarı** döndür, cümle değil; arayüz çeviriyle gösterir. Örnekler:
`AccountNotFound`, `ContactNotFound`, `ContactNotInAccount`, `TaskNotFound`,
`TaskAlreadyClosed`, `WaitingRequiresTask`, `PhoneInvalid`, `InvalidStage`,
`InvalidPaymentDayOfMonth`, `InvalidReminderOffsetDays`, `NoReminderRecipients`,
`PayeeNameRequired`, `InvalidIban`, `IbanAlreadyExists`, `BulkNoSelection`,
`BulkUnknownAction`, `ExpenseInvalidPeriod`, `ExpenseInvalidDates`, `UnauthorizedAccess`.

Mükerrer telefon **hata değil**: `duplicates` ucunun döndürdüğü uyarı.
