# Derin Record uygulaması (App Store + Google Play) — tasarım

Tarih: 2026-10-31 · Durum: Derin onayladı (31 Ekim); mekân girişi eklendi

## Amaç
Derin Record'u herkese tanıtan, App Store ve Google Play'den indirilen bir uygulama.
Ziyaretçi demoları dinler; antrenör HESABIM'a girer; yönetici (Derin) ayrıca radyo panelini kullanır.

## Kararlar (Derin söyledi)
- Mağazalarda olacak: App Store + Google Play.
- Kitle: herkese tanıtım.
- Yol: mevcut site uygulamanın içine konur (yeniden yazılmaz).
- HESABIM uygulamada olacak (antrenör girişi).
- Radyo paneli (yönetim: yayın, marka, liste, şube, anons) uygulamada yalnız yöneticiye görünür.
- Mekân sunum ekranı (Şube Yayını, `coffee-marka.html`) uygulamada da olacak: "Mekân girişi" ile şube kodu girilir (müşteri memnuniyeti için önemli).
- Derin'in Mac'i var → iPhone paketi onun Mac'inde Xcode ile yapılır.
- Ekran görüntüsü / ekran kaydı engellensin; sitede de zorlaştırılsın.

## Uygulamanın içi
**Siteden gelenler:** açılış ekranı (her açılışta), ana sayfa (hizmetler, 5 branş kaseti,
sezon, iletişim), branş demo sayfaları, film müziği ve lisans bölümleri, HESABIM.

**Uygulamaya özel (Apple 4.2 "siteden fazlası" şartı için):**
1. Kilit ekranında çalma: demo/radyo telefon kilitliyken sürer; kilit ekranında ad, kapak, düğmeler.
2. İnternetsiz açılış: ana sayfa ve kasetler internetsiz görünür; demolar internet gelince çalar.
3. Bildirim: yeni demo bildirimi; yalnız Derin gönderir, kullanıcı izin verirse gelir.
4. Hesap silme: HESABIM içinde düğme (Apple 5.1.1(v) zorunlu). Silme, Supabase'de sunucu
   tarafında küçük bir fonksiyonla yapılır; gizli anahtar telefona girmez, config.js'e eklenmez.
   Kurulmadan önce Derin'e ne yaptığı ayrıca anlatılıp onay alınır (RLS/SQL değişirse gerekçeyle).
5. Radyo paneli: yalnız profiles.role = 'admin' girişinde menüde görünür.
6. Mekân girişi: menüde "MEKÂN GİRİŞİ"; kafe şube kodunu (ya da şube linkini) girer, Şube Yayını
   ekranı açılır. Uygulama kodu hatırlar, sonraki açılışta doğrudan yayına gider (çıkış düğmesiyle silinir).
   Yayın telefon kilitliyken de sürer; ekran kararmasın seçeneği (mekân telefonu yayın cihazı olarak).
   Mevcut şube kodu/link, cihaz kilidi ve sızıntı alarmı kuralları aynen geçerli; yeni yetki eklenmez.

**Uygulamada yok:** sohbet, yönetici sayfaları (radyo paneli hariç), öğrenci işleri.

## Ekran koruması
| Yer | Ekran görüntüsü | Ekran kaydı |
|---|---|---|
| Android uygulama | Engellenir (siyah çıkar) | Engellenir (siyah çıkar) |
| iPhone uygulama | Engellenemez (Apple izin vermiyor); alındığı anlaşılır, uyarı gösterilir | Kayıt başlayınca içerik gizlenir, logo görünür |
| Web sitesi | Engellenemez | Engellenemez |

**Sitede zorlaştırma (Derin istedi):**
- Sağ tık ve metin seçme kapanır (form alanları ve HESABIM girişleri hariç; yazı yazılabilmeli).
- Demolarda indirme seçeneği kaldırılır (oynatıcıda indir yok, sağ tık yok).
- Kaset/kapak görsellerine Derin Record filigranı.
Not: sesin dışarıdan başka cihazla kaydı hiçbir yolla engellenemez.

## Yapım ve güncelleme
- Tek kod: site aynı kalır; depoda ayrı bir `app/` klasöründe iPhone/Android paketi.
- Site güncellenince uygulama içeriği de güncellenir; yalnız uygulamaya özel parçalar
  değişince mağazaya yeni sürüm gönderilir.
- Android paketini Claude hazırlar; iPhone paketi Derin'in Mac'inde (Xcode), adım adım yönergeyle.
- Mağaza için: ad, Türkçe+İngilizce açıklama, ekran görüntüleri, simge, sitede gizlilik sayfası.
- Hesaplar (Apple Developer 99$/yıl, Google Play 25$ tek sefer) Derin tarafından açılır;
  ödeme/kimlik bilgilerini Claude girmez.

## Çalışma sırası
1. Android deneme paketi → Derin telefonda dener.
2. Uygulamaya özel parçalar (kilit ekranı, internetsiz, bildirim, hesap silme, radyo, mekân girişi, ekran koruması);
   her biri test + önizleme.
3. Sitede zorlaştırmalar (önizleme → "canlıya al").
4. iPhone paketi (Mac + Xcode) → TestFlight ile deneme.
5. Mağaza hazırlığı (simge/görsellerde birkaç seçenek).
6. Gönderim: önce Google Play, sonra App Store; inceleme takibi.

## Kurallar
- Siteye dokunan her değişiklik: önizleme (telefon 390 + bilgisayar 1280) → "canlıya al".
- Mağazaya hiçbir şey Derin "tamam" demeden gitmez.
- config.js'e secret/service_role girmez; RLS değişikliği gerekçe + onay ister.

## Testler
- Her parça node --test ile önce test (ör. sitede sağ tık kapalı ama form alanlarında yazı yazılabiliyor;
  radyo bağlantısı yalnız yöneticide; hesap silme düğmesi yalnız girişte).
- Uygulama davranışları (kilit ekranı, ekran koruması) gerçek telefonda Derin'le denenir.
