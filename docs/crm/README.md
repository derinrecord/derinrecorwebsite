# Tek Kişilik B2B Satış + Abonelik Takip CRM — Claude Code Başlangıç Paketi

Bu paket, **çalışan bir CRM modülünün** ürün kararlarını, veri modelini, iş kurallarını,
ekranlarını ve API sözleşmesini; Claude Code'un doğrudan uygulayabileceği biçimde taşır.
Amaç: sıfırdan tasarım turu yapmadan, bilinen tuzaklara düşmeden, faz faz çalışan bir modül
çıkarmak.

Modül ne işe yarıyor: **kendi müşterilerinizi ve aday müşterilerinizi** telefondan yöneteceğiniz
bir satış takibi + **abonelik ödemesi** takibi. Yani "Excel'de müşteri listesi tutuyorum,
kimi ne zaman arayacağımı kaçırıyorum, kim ödedi kim ödemedi bilmiyorum" probleminin çözümü.
Müşterinizin kendi müşterilerini yönettiği bir sistem **değildir** (orası çok kiracılı başka
bir iştir; bu modül tek sahipli ve tek saat dilimlidir).

## Dosyalar — okuma sırası

| Dosya | Ne işe yarar |
|---|---|
| `01-URUN-BRIEFI.md` | Ne inşa ediliyor, hangi kararlar baştan verilmiş, neler kapsam dışı |
| `02-VERI-MODELI.md` | 10 tablo, alanlar, sabit sözlükler, indeksler |
| `03-IS-KURALLARI.md` | **En önemli dosya.** Vade, hatırlatma, görev, ajanda, gelir matematiği |
| `04-EKRANLAR.md` | Mobil öncelikli 6 ekran, "3 tık" akışı, rozetler |
| `05-API-SOZLESMESI.md` | Uç listesi, istek/yanıt şekilleri, hata anahtarları |
| `06-PROMPTLAR.md` | Claude'a sırayla verilecek prompt blokları (kopyala-yapıştır) |
| `07-CLAUDE-MD-SABLONU.md` | Alıcının repo köküne koyacağı `CLAUDE.md` |
| `08-TEST-SENARYOLARI.md` | Kabul testleri ve bilinen tuzaklar |
| `09-REFERANS-YIGIN.md` | Özgün uygulamanın yığını (.NET + Next.js) ve geriye dönük dersler |
| `sema/schema.sql` | Taşınabilir DDL (MySQL; Postgres notları içinde) |

## 20 dakikada başlama

1. **Paketi projenin içine koy.** Kendi repona `docs/crm/` açıp bu dosyaları oraya kopyala.
   Claude'un dosyaları okuyabilmesi gerekiyor; sohbete yapıştırmak yerine repoda tutmak
   her oturumda yeniden anlatmaktan iyidir.
2. **`CLAUDE.md`'yi kur.** `07-CLAUDE-MD-SABLONU.md` içindeki metni repo köküne `CLAUDE.md`
   olarak yaz, köşeli parantezli yerleri kendi yığınına göre doldur.
3. **Faz 0 promptunu ver.** `06-PROMPTLAR.md` → "Faz 0". Claude önce şemayı ve sözlükleri
   kurar; sen doğrularsın; sonra Faz 1'e geçersin.

## Üç kural (bunlara uymazsan paket işe yaramaz)

* **Faz faz git.** Tek promptla "CRM yap" deme. Her fazın sonunda derle, çalıştır, gör.
  Fazlar `06-PROMPTLAR.md`'de ve birbirine bağımlı sırada.
* **`03-IS-KURALLARI.md` tartışılmaz.** Oradaki kuralların her biri gerçek kullanımda bir
  hata sonrası yazıldı. Claude "daha iyisini" önerirse, önce o kuralın neden orada olduğunu
  oku.
* **Sözlükler koda, etiketler arayüze.** Veritabanında `stage = "offer"` durur, ekranda
  "Teklif verildi" yazar. Sözlüğü serbest metne çevirmek, altı ay sonra hiçbir filtrenin
  çalışmaması demektir.

## Bu paket neyi vaat etmiyor

Hazır kod vermiyor. Yığından bağımsız bir **şartname + prompt** paketi: veri modeli,
davranış kuralları, ekran akışı ve API sözleşmesi. Kodu kendi yığınında Claude yazacak.
Özgün uygulamanın yığını ve dosya düzeni `09-REFERANS-YIGIN.md`'de, yalnızca referans olarak.
