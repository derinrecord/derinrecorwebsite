# 08 — Test senaryoları ve bilinen tuzaklar

Fazlara bölünmüş kabul testleri. Her faz kendi testleri geçmeden kapanmaz.

## Faz 1 — CRM çekirdeği

1. **Aktivite + sonraki görev tek transaction.** `nextTask` ile aktivite ekle: ikisi de
   yazılmalı. Görev yazımı kasten hata verdirildiğinde aktivite de yazılmamalı.
2. **Tamamla üçlüsü.** `complete` → görev `done` + `doneAt` dolu + aktivite oluştu +
   `doneActivityId` bağlandı + (verildiyse) yeni görev açıldı.
3. **Kapalı görev yeniden tamamlanamaz** → `TaskAlreadyClosed`.
4. **`waiting` görev zorunluluğu.** Açık görevi olmayan firmayı `waiting` yapmak
   `WaitingRequiresTask` döndürmeli; istekle birlikte görev gönderilirse geçmeli.
5. **Rakip bitişi → görev senkronu.** (a) bitiş gir → `must` öncelikli, bitiş−45 gün vadeli,
   `sourceKind=competitor_contract` görev açılır. (b) bitişi değiştir → **yeni görev açılmaz**,
   mevcut güncellenir. (c) bitişi 10 gün sonraya al → vade geçmişe düşmez, **bugün** olur.
   (d) bitişi sil → açık görev `cancelled`.
6. **Ajanda gruplaması gün sınırında.** Yerel saat 23:50 ve 00:10 iken "bugün" grubu aynı günü
   göstermeli. (En sık kaçırılan hata; ham sistem saati kullanıldığı anda düşer.)
7. **Ajanda kişi düşürmez.** Görevde kişi yoksa satır firmanın birincil kişisini taşır.
8. **Silinmiş firma ajandaya girmez.**
9. **Telefon ayrıştırma.** `0555 1112233`, `555 1112233`, `0 555 111 22 33`, `+90 …` ve görünmez
   yön karakteri içeren değerler aynı `905xxxxxxxxx`'e normalize olur. `0532 / 0212 000 0000`
   gibi çözülemeyen değer `phoneE164=NULL` + `phoneRaw` korunur + `needsReview=1`.
10. **Mükerrer uyarısı kaydı engellemez.** Aynı numara ikinci firmaya eklenebilir; `duplicates`
    ucu her ikisini döndürür.
11. **`lastActivityAt`** her aktivite eklemesinde güncellenir; silmede geri alınmaz.
12. **Liste filtreleri birleşir.** Aşama + branş + etiket + "30+ gün dokunulmamış" aynı
    istekte çalışır; sayfalama toplamı doğru döner.

## Faz 2 — Arayüz

13. "Üç tık" akışı **tek** ağ isteği atar (ağ sekmesinden doğrula).
14. Listeye dönüşte filtre ve kaydırma konumu korunur.
15. Hızlı ekle kaydettikten sonra form açık kalır; eklenen kayıt listede işaretlenir.
16. 375px genişlikte yatay kaydırma yok; alt sekme çubuğu içeriği kapatmıyor.
17. Her durum rozeti renk + kelime taşıyor (renk körlüğü denetimi: ekran görüntüsünü gri
    tonlamaya çevirip oku).

## Faz 3 — Ödeme ve gelir

18. **Abonelik ödemesi vadeyi ilerletir**, `paymentReminder = 0` olur, fatura bayrağı ödeme
    satırına geçer ve karttan sıfırlanır, vade notu ödeme satırına taşınır ve karttan temizlenir.
19. **Ek ödeme (`extra`)** vadeye, sayaca, fatura bayrağına ve vade notuna dokunmaz;
    `nextPaymentDate` NULL kalır; tahsilatta ayrı toplanır.
20. **Ödeme güncelleme** vadeye ve sayaca dokunmaz.
21. **Ödeme silme** vadeyi geri almaz.
22. **Sabit ödeme günü türetmesi.** `paymentDayOfMonth=31`, mevcut vade 31 Ocak → sonraki vade
    28/29 Şubat; **ondan sonraki** 31 Mart (kırpılan gün kalıcı olmuyor).
23. **Mutabakat eşitliği.** Her firma ve toplam için `beklenen = ödendi + gecikmiş + bekleyen`.
    Fazla ödeme `prepaid`e gider, eşitliği bozmaz.
24. **Yıllık sözleşme** aylık eşdeğerinde 1/12 görünür; özet hem "yıllıklar hariç" hem
    "tümü dahil" mutabakatı döndürür.
25. **Kısmi aralık payı.** 10–20 Kasım aralığında aylık 3.000 sözleşmenin beklediği
    3.000 × 11/30 = 1.100.
26. **Başlamamış firma.** Sözleşme başlangıcı ve ödemesi aralıktan sonraysa beklenen 0,
    durum `notStarted`.
27. **Gider yalnız ödeme gününde.** Yıllık 12.000, başlangıç 15 Mart → yalnız Mart ayında
    12.000; diğer aylarda 0.
28. **Gider ay sonu taşması.** Aylık gider, başlangıç 31 Ocak → Şubat'ta ayın son günü,
    Mart'ta yine 31.
29. **Gider bitiş tarihi** dahil; `endDate` NULL süresiz.
30. **Durum eşikleri.** Vade bugün → `today`; 7 gün → `soon`; 8 gün → `ok`; dün → `overdue`.

## Faz 4 — Hatırlatma ve özet

31. **Tek gönderim.** Aday firmaya mesaj gider, sayaç artar; iş aynı gün ikinci kez
    çağrıldığında firma **aday bile olmaz**.
32. **Tutarsız firmaya gönderim yok**; atlama sebebi yanıtta döner.
33. **Alıcı yoksa gönderim yok**; `NoReminderRecipients` / atlama sebebi.
34. **Çok alıcı.** İki kişi işaretliyse iki gönderim, iki log satırı, bir sayaç artışı.
35. **Günlük başarısızlık sınırı.** Sağlayıcı sürekli hata verirken iş 24 kez çağrıldığında
    gün içinde en çok 3 deneme olur; ertesi gün sayaç sıfırlanır.
36. **`contractType != 'paid'`** firma otomatik hatırlatma almaz.
37. **Elle hatırlatma** sayaca bakmaz; çift tık ikinci mesaj göndermez (idempotans).
38. **Boş ajandada e-posta gitmez.** Gecikmiş 0 + bugün 0 → gönderim yok.
39. **Aynı gün ikinci özet gitmez**; listeye yeni görev düşerse gider.
40. **Sabah eşiği.** İş 03:00'te çağrıldığında özet göndermez; saatli uyarı ayrı damgadan gider.
41. **Yan kanal hatası işi düşürmez.** E-posta sağlayıcısı patlatıldığında push yine gider ve
    iş başarıyla döner.
42. **Şablon parametreleri temiz.** Satır sonu/tab/4+ boşluk içeren bir nota rağmen
    parametreler tek boşluğa indirgenmiş gider; boş parametre `"-"` olur.

## Faz 5 — Birleştirme, toplu işlem, içe aktarım

43. **Birleştirme** kişileri, aktiviteleri, görevleri, ödemeleri taşır; kaynak soft delete;
    hedefte tekrarlanan numara kalmaz.
44. **Toplu işlem** seçim boşsa `BulkNoSelection`; bilinmeyen eylemde `BulkUnknownAction`.
45. **İçe aktarım tekrar çalıştırılabilir.** Aynı dosya ikinci kez işlendiğinde kayıt sayısı
    artmaz, alanlar güncellenir (`importKey` tekil).
46. **Tarihsiz hatırlatma notundan görev açılmaz**; ay düzeyindeki tarihten `dueIsApprox=1` +
    `dueLabel` orijinal metinle açılır.
47. **Geçmiş tarihli hatırlatma** bugüne çekilir, etiketi orijinali saklar.

## Faz 6 — Faturalama

48. **Çift fatura koruması.** Sağlayıcı çağrısı zaman aşımına düştüğünde ikinci deneme yeni
    fatura kesmez; aynı ETTN ile durum sorgular. `attemptCount` artar.
49. **Şifreli alanlar** veritabanında okunabilir düz metin değil; arayüze yalnız son 4 hane.
50. **Önizleme** kesmeden hiçbir satır yazmaz.
51. **Fatura bilgisi tabloları yokken** CRM listesi, kartı ve ödeme takibi çalışmaya devam eder.

---

## Bilinen tuzaklar

* **Sistem saati.** Modülün bir yerinde ham `now()` kalırsa ajanda gün sınırında kayar. Tek
  yardımcıyı zorla, derlemede ara.
* **Ödeme ekranı yükü.** Gelir tablosu firma × ay hesabı yapıyor; bunu tek sorguya sıkıştırmaya
  çalışmak okunmaz SQL üretiyor. Ödemeleri aralığa göre çek, hesabı bellekte yap, matematiği
  **ayrı ve test edilebilir** bir modülde tut.
* **Şablon parametre sırası.** Mesaj şablonu her onaydan sonra değişebilir; sırayı tek yerde,
  yorumla birlikte tut. Kişi adını parametre yapmamak bir sadeleştirmeydi.
* **Hatırlatma alıcısını "birincil kişi" ile karıştırmak.** Muhasebe + işletmeci birlikte alır;
  bunlar ayrı bayraklar.
* **Vade notunu ödeme notuyla ezmek.** Kullanıcı ödeme notu yazdıysa vade notu taşınmaz.
* **İçe aktarımda "temizlik".** Anlaşılmayan satırı atlamak en pahalı hata; sakla ve işaretle.
* **Şemayı koddan sonra basmak.** Kolon yokken yeni kod deploy edilirse ödeme listesi ve firma
  kartı 500 döner. Sıra: şema → sunucu → arayüz.
