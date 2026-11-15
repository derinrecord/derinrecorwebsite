# 09 — Referans: özgün uygulama nasıl yapıldı

Bu paket yığından bağımsız yazıldı. Aşağıdaki bölüm yalnızca **referans**: özgün modülün
hangi yığında, nasıl kurulduğu ve geriye dönüp bakınca neyin farklı yapılacağı. Kendi yığınında
bunları birebir taklit etme; karşılıklarını kullan.

## Yığın

| Katman | Seçim |
|---|---|
| Sunucu | .NET 8, CQRS (MediatR), katmanlı: Domain / Application / Persistance / Api |
| Veritabanı | MySQL 8, EF Core — **migration yok**, elle SQL betikleri |
| Arayüz | Next.js (App Router), TypeScript, Tailwind, mobil öncelikli ayrı rota |
| Mesaj | WhatsApp Business Cloud API (yalnız onaylı şablon) |
| E-posta | SMTP üzerinden basit bir servis |
| Push | Web Push (VAPID) + cihaz belirteçleri (FCM) |
| Zamanlama | Dış zamanlayıcı → ayrı anahtarla korunan HTTP uçları |
| Fatura | Yerel e-fatura entegratörü (UBL üreten ortak servis) |

## Dosya düzeni (sunucu)

```
Domain/Entities/            AdminCrm*Entity.cs            (11 varlık)
Persistance/Configurations/ AdminCrm*EntityConfiguration.cs
Application/Features/AdminCrm/
  Constants/   AdminCrmConstants.cs        tüm sözlükler + eşikler + ayar anahtarları
               AdminCrmMessages.cs         sabit hata/başarı anahtarları
  Models/      AdminCrmModels.cs           istek + çıktı modelleri
  Commands/    hesap, kişi, aktivite, görev, ödeme, gider, banka, ayar, birleştirme,
               toplu işlem, hatırlatma, e-fatura + ortak doğrulayıcılar
  Queries/     liste, kart, ödeme, gelir tablosu, gider, alıcı, ayar, sözlük
  Services/    Clock · PhoneNormalizer · Mapper · TaskFactory · AgendaBuilder
               ReminderSender · RevenueMath · ExpenseMath · EInvoice
  Jobs/        ReminderJob · AgendaJob
Api/Controllers/  AdminCrmController.cs    (tek denetleyici, ~90 eylem)
Api/Filters/      AdminCrmOwnerFilter.cs   rolün üstünde sahip listesi kontrolü
```

**İşe yarayan ayrımlar:**
* **Matematik ayrı sınıflarda** (`RevenueMath`, `ExpenseMath`): saf fonksiyonlar, veritabanı
  yok → birim testi kolay, mutabakat eşitliği test edilebiliyor.
* **`AgendaBuilder` tek kaynak**: ekran ucu ve zamanlanmış iş aynı fonksiyonu çağırıyor →
  "mail'de görünen ile ekranda görünen farklı" sınıfı hatalar imkânsız.
* **`Constants` tek dosya**: yeni aşama/etiket eklemek tek yerde.
* **`ReminderSender` tek yerde**: otomatik iş ve elle gönderim aynı kodu paylaşıyor.
* **Sahip filtresi** rolün üstünde ayrı bir katman: ileride ikinci yönetici hesabı açılsa bile
  CRM verisine erişemiyor.

## Dosya düzeni (arayüz)

```
app/[locale]/adminPanel/crm/
  layout.tsx            CrmShell'i sarar (oturum belirteci + sağlayıcı)
  page.tsx              ① Bugün
  accounts/page.tsx     ② Firmalar      accounts/[id]/page.tsx  ④ Firma kartı
  new/page.tsx          ⑤ Hızlı ekle
  payments/page.tsx     ⑥ Ödeme
  components/
    CrmShell.tsx        alt sekme çubuğu + bildirim şeridi + panele dönüş
    CrmContext.tsx      istemci tarafı istek yardımcısı + bildirim
    AgendaScreen · AccountsScreen · AccountDetailScreen · QuickAddScreen · PaymentsScreen
    *Sheet.tsx          ~20 alt yan panel (ödeme, gider, fatura, hatırlatma, erteleme…)
    listState.ts / returnState.ts   filtre ve kaydırma konumunun korunması
    ui.tsx              ortak küçük bileşenler (rozet, çip, alan)
lib/adminCrmApi.ts      tek tipli API katmanı (~1.000 satır; tüm uçlar burada)
```

**İşe yarayan ayrımlar:** tek bir API dosyası (uç adı tek yerde), tek bir bağlam sağlayıcı
(belirteç + bildirim), ekran bileşenlerinin sayfalardan ayrı olması (masaüstü/mobil aynı
bileşeni farklı genişlikte kullanıyor).

## Geriye dönük dersler

1. **Şema değişikliğini elle SQL ile yönetmek pahalıya geldi.** "Önce SQL, sonra kod" sırası
   bir kez atlandığında ödeme ekranı 500 döndü. Yeni projede **migration aracı kullan.**
2. **Tasarım dokümanını iki repoya bölmek** (sunucu notları + arayüz notları) senkron tutma
   yükü yarattı. **Tek şartname dosyası** tut — bu paket zaten öyle.
3. **Gelir tablosu sonradan eklendi** ve ödeme ekranını yeniden yazdırdı. Gider / net gelir
   ihtiyacı daha baştan belliydi: Faz 3'ü tasarlarken giderleri de hesaba kat.
4. **Para birimi tek varsayıldı.** Gider ve tahsilat toplamları tek para biriminde toplanıyor;
   ikinci bir para birimi girerse toplamlar yanlış olur. Ya baştan para birimi başına topla,
   ya da tek para birimini **şemada zorla**.
5. **Takvim yansıtması hiç yapılmadı** ve eksikliği duyulmadı: e-posta + push yetti.
   Takvimi en sona bırakmak doğru karardı.
6. **"Üç tık" akışının tek istek olması** en çok işe yarayan tasarım kararı. Bunu bölmeye
   çalışan her değişiklik geri alındı.
7. **`needsReview` bayrağı** içe aktarımı kurtardı: 260 satırın yarısı belirsizdi, hiçbiri
   kaybolmadı, kullanıcı ilk hafta liste üzerinden düzeltti.
8. **Her mesaj denemesinin loglanması** (başarısızlar dahil) saat başı çalışan işi güvenli
   kıldı; sınır mekanizmasının dayanağı bu log.
9. **Kişi başına "hatırlatma alıcısı" bayrağı** sonradan eklendi; başta birincil kişiye
   gönderiliyordu ve muhasebe kaçıyordu. Baştan böyle kur.
10. **HTTP istemcisini her çağrıda yeniden yaratmak** (mesaj servisinde) teknik borç olarak
    kaldı. Kendi yığınında havuzdan/fabrikadan al.

## Boyut fikri

Sunucu: ~4.300 satır (11 varlık, ~90 eylem, 2 zamanlanmış iş, 4 test dosyası).
Arayüz: ~7.600 satır (5 ekran, ~20 yan panel, tek API katmanı).
Sıfırdan, bu paketle ve faz faz çalışarak: çekirdek + ekranlar + ödeme (Faz 0-3) makul bir
hedef; hatırlatma ve içe aktarım onun üstüne gelir.
