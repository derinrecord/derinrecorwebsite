# 06 — Claude'a verilecek promptlar

Kullanım: paketi repona `docs/crm/` olarak kopyala, `CLAUDE.md`'yi kur
(`07-CLAUDE-MD-SABLONU.md`), sonra aşağıdaki blokları **sırayla** ver. Her fazın sonunda
derle/çalıştır/gör; geçmeden sonrakine başlama.

## Nasıl çalışılır (promptlardan önce okunacak kısa liste)

* **Plan modunu kullan.** Her fazın başında Claude'dan önce plan iste, planı oku, sonra onayla.
  (Claude Code'da `shift+tab` ile plan moduna geçilir.)
* **Faz başına bir dal.** `feature/crm-faz-1` gibi; her faz ayrı pull request.
* **"Sen karar ver" deme.** Bu paket kararları zaten içeriyor. Claude kuralı değiştirmek
  isterse gerekçesini sor, `03-IS-KURALLARI.md`'ye bak, gerekiyorsa paketi güncelle.
* **Her fazın sonunda test yaz/çalıştır.** `08-TEST-SENARYOLARI.md` fazlara bölünmüş hâlde.
* **Bağlam dolunca** yeni oturum aç ve "`docs/crm/` altındaki dosyaları oku, Faz N'deyiz" de.
  Paket repoda olduğu için bağlam kaybı maliyetsiz.

---

## Faz 0 — Şema ve sözlükler

```
docs/crm/ altındaki 01-URUN-BRIEFI.md, 02-VERI-MODELI.md ve sema/schema.sql dosyalarını oku.

Bu projede bir "satış + abonelik takip CRM" modülü kuracağız. Faz 0'ın işi yalnızca temel:

1. Veri modelini bu projenin veritabanı yığınına göre kur (tablo/entity/migration —
   projede hangisi kullanılıyorsa onunla). Tüm tablolar yeni ve additive; var olan
   şemaya dokunma. Tablo adlarında crm_ öneki kullan.
2. 02-VERI-MODELI.md'nin sonundaki tüm sabit sözlükleri TEK bir sabitler dosyasında topla.
   Veritabanında kod durur, arayüzde çeviri gösterilir — serbest metin yok.
3. Sözlükleri ve (varsa) kullanıcı listesini döndüren tek bir "lookups" ucu yaz.
4. Tek bir Clock yardımcısı yaz: projenin yerel saat dilimine göre Now() ve Today().
   Modülün başka hiçbir yerinde ham sistem saati kullanılmayacak.

Şunu YAPMA: henüz CRUD ucu, ekran, hatırlatma ya da ödeme mantığı yazma.

Bitirince: migration'ı/DDL'i çalıştır, "lookups" ucunu çağır ve sonucu göster.
```

## Faz 1 — CRM çekirdeği (firma, kişi, aktivite, görev)

```
docs/crm/02-VERI-MODELI.md, 03-IS-KURALLARI.md (§1, §4, §5, §8) ve 05-API-SOZLESMESI.md oku.

Faz 1: CRM çekirdeğinin sunucu tarafı.

- Firma: liste (filtre + sayfalama + sıralama), kart detayı, hızlı oluştur, güncelle,
  aşama değiştir, soft delete, mükerrer kontrolü ucu.
- Kişi: ekle/güncelle/sil. Telefon normalizasyonu tek bir yardımcıda; çözülemeyen numarada
  veri ATILMAZ (phoneRaw korunur, needsReview=1).
- Aktivite: ekle/güncelle/sil. Ekleme sonrası account.lastActivityAt güncellenir.
  Aktivite ucu opsiyonel "nextTask" alabilir ve görevi AYNI transaction'da açar.
- Görev: ekle/güncelle/tamamla/ertele/iptal. "Tamamla" tek uçta üç işi yapar:
  görev done + aktivite + (varsa) yeni görev.
- Aşama "waiting" yapılırken açık görev zorunlu (sunucu doğrular).
- Rakip sözleşme bitişi girildiğinde/değiştiğinde otomatik görev senkronu (03 §4.4'teki
  kurala birebir uy: güncelle / aç / bitiş silinirse iptal et).
- Ajanda ucu: beş grup (gecikmiş, bugün, bu hafta, fırsatlar, dokunulmamış), 03 §5'teki
  sorgularla. Görev satırları firma ve kişi bilgisini taşır; ajanda ek istek atmaz.

Kurallar: tüm gün karşılaştırmaları Clock.Today() üzerinden. Hata mesajları sabit anahtar.
Yazma uçları idempotent.

Bitirince: 08-TEST-SENARYOLARI.md'nin "Faz 1" bölümündeki testleri yaz ve çalıştır.
```

## Faz 2 — Mobil öncelikli ekranlar

```
docs/crm/04-EKRANLAR.md oku, 05-API-SOZLESMESI.md'yi uç adları için kullan.

Faz 2: arayüz. Ayrı rota /admin/crm, mobil öncelikli, alt sekme çubuğu
(Bugün · Firmalar · ＋ · Ödeme — Ödeme sekmesi Faz 3'te dolacak, şimdilik yer tutucu).

Ekranlar: ① Bugün (ajanda, beş grup) ② Firmalar (arama + filtre çipleri + sayfalama)
③ "üç tık" aktivite akışı ④ Firma kartı ⑤ Hızlı ekle.

Zorunlu davranışlar:
- Tüm eylemler alt yan panel (bottom sheet) ile, modal ile değil.
- Listeye dönüşte filtre ve kaydırma konumu korunur.
- Hızlı ekle kaydettikten sonra form açık kalır (arka arkaya kayıt girilir).
- "Üç tık" akışı TEK istek atar (aktivite + nextTask).
- Her satırda tel: ve mesaj bağlantısı tek dokunuşla.
- Durum/aşama rozetlerinde renk tek sinyal değil: yanında kelime var.
- Yazım dili 04-EKRANLAR.md'nin sonundaki kurallara uyar.

Mevcut tasarım sistemini/bileşenlerini kullan, yeni kütüphane ekleme.

Bitirince: uygulamayı çalıştır, telefon genişliğinde (375px) ekran görüntüsü al ve göster.
```

## Faz 3 — Ödeme takibi

```
docs/crm/03-IS-KURALLARI.md (§2, §3, §7) ve 04-EKRANLAR.md (⑥) ve 05-API-SOZLESMESI.md oku.

Faz 3: abonelik ödeme takibi.

- Ödeme ekle/güncelle/sil + firma ödeme geçmişi. 03 §2'deki kurallara BİREBİR uy:
  abonelik ödemesi vadeyi ilerletir ve sayacı sıfırlar; fatura bayrağı ödeme satırına
  snapshot olarak geçer ve karttan sıfırlanır; vade notu ödeme satırına taşınır;
  ek ödeme (extra) vadeye/sayaca/faturaya DOKUNMAZ; güncelleme vadeye dokunmaz;
  silme vadeyi geri ALMAZ.
- Vade, ödeme koşulları ve fatura bayrağı uçları.
- Gider CRUD + banka hesapları + ayarlar.
- Özet ve gelir tablosu uçları: 03 §7'deki matematiği uygula. Mutabakat eşitliği
  (beklenen = ödendi + gecikmiş + bekleyen) her firma ve toplamda SAĞLANMALI.
  Gider ödendiği güne tam tutarıyla yazılır, paylaştırılmaz; ay sonu taşmasında her adım
  başlangıç tarihinden hesaplanır.
- Ödeme ekranı: 04-EKRANLAR.md ⑥'daki kolonlar, satır içi vade düzenleme, durum rozetleri
  (kelime + renk), özet kartları, yan paneller.

Bitirince: 08-TEST-SENARYOLARI.md "Faz 3" testlerini yaz ve çalıştır. Özellikle mutabakat
eşitliği ve ay sonu gider türetmesi testleri geçmeden fazı kapatma.
```

## Faz 4 — Hatırlatma ve günlük özet

```
docs/crm/03-IS-KURALLARI.md (§3, §6) ve 05-API-SOZLESMESI.md'nin "Zamanlanmış işler" bölümünü oku.

Faz 4: otomatik hatırlatma + günlük ajanda özeti.

1. Ödeme hatırlatma işi: 03 §3'teki aday filtresine birebir uy. Tutarı girilmemiş firmaya
   gönderme. Alıcılar "hatırlatma alıcısı" işaretli TÜM kişiler; her gönderim ayrı log satırı
   (başarısızlar dahil). Başarılı gönderimde sayaç artar. İş SAAT BAŞI çağrılabilir olmalı:
   günlük başarısızlık sınırı (3) log'dan sayılarak uygulanır.
2. Elle hatırlatma ucu: sayaca bakmaz, idempotent, ikinci (gecikme) şablonunu da gönderebilir.
3. Günlük özet işi: ajanda sorgusunu kullanır; gecikmiş 0 ve bugün 0 ise e-posta GÖNDERMEZ;
   aynı gün aynı görev listesi için ikinci kez göndermez (setting tablosunda damga);
   sabah eşiğinden önce özet göndermez; saatli görevler için ayrı damgayla saatinde uyarı.
   E-posta ve push ayrı try/catch — hataları işi düşürmez.
4. İki iş ucu da dışarıdan çağrılacağı için oturum değil ayrı bir anahtarla korunur.
   Yanıt sayılarla ve atlama sebepleriyle döner.

Mesaj sağlayıcısı şablon zorunluluğu getiriyorsa 03 §3'ün sonundaki parametre kurallarına uy
(satır sonu/tab/4+ boşluk yasak; tutar ve para birimi ayrı parametre; hitap sabit).

Bitirince: işleri elle çağır, log tablosunu ve yanıtı göster.
```

## Faz 5 — Birleştirme, toplu işlem, içe aktarım

```
docs/crm/03-IS-KURALLARI.md §8 oku.

Faz 5:
- Firma birleştirme ucu: kişiler, aktiviteler, görevler, ödemeler hedefe taşınır; kaynak
  soft delete; aynı numara iki kez kalmaz.
- Toplu işlem ucu: seçili firmalara etiket ekle/çıkar, sorumlu ata, aşama değiştir, görev aç.
  Arayüzde seçim çubuğu.
- Elektronik tablodan içe aktarım betiği (tek seferlik, tekrar çalıştırılabilir):
  * importKey = "<sayfa>:<satır>", tekil indeks → yeniden çalıştırma günceller, kopya üretmez.
  * Telefon: tüm yazım varyantlarını normalize et; tek hücrede birden çok kişi varsa
    (etiket + numara) her birini ayrı kişi yap; çözülemeyeni phoneRaw olarak sakla + needsReview.
  * Firma/kişi ayrımı belirsizse: account.name = "<İl> — <Kişi>", needsReview=1, etiket ekle.
  * Temas notları sırayla aktivite olur (tarih yakalanabiliyorsa o, yoksa NULL).
  * Hatırlatma notundan tarih çıkarılabiliyorsa görev açılır (ay düzeyinde → dueIsApprox=1,
    dueLabel orijinal metin); tarihsiz notlardan görev AÇILMAZ.
  * Aşama sınıflaması anahtar kelimeyle yapılır ve sonuç needsReview ile işaretlenir.
  * Çıktı: eşleşmeler, needsReview listesi ve geçersiz telefonları içeren bir rapor dosyası.
- Arayüzde "kontrol bekliyor" filtresi + satır başına tek tık "kontrol edildi".
```

## Faz 6 — Faturalama (isteğe bağlı)

```
docs/crm/03-IS-KURALLARI.md §10 ve 02-VERI-MODELI.md §10 oku.

Faz 6: e-fatura entegratörüyle fatura kesme.
- Satıcı bilgileri ve API anahtarları ayar tablosunda, şifreli; arayüzde yalnız son 4 hane.
- Alıcı fatura bilgileri ayrı tabloda (1:1), vergi/kimlik numarası şifreli.
- Belge türü alıcının mükellefliğine göre sağlayıcıdan sorgulanır.
- ÇİFT FATURA KORUMASI: satır sağlayıcıya gitmeden önce status='sending' + tekil ETTN ile
  yazılır; belirsiz sonuçta aynı ETTN ile durum sorgulanır, yeni fatura kesilmez.
- "Önizleme" ucu kesmeden önce ne kesileceğini gösterir.
- Kesilen fatura hangi vadeye ait olduğunu saklar.
- Ayar doğrulama ucu (anahtarlar geçerli mi, kontör ne kadar).

Bu faz olmadan sistem çalışır; acelesi yoksa en sona bırak.
```

## Faz 7 — Takvim yansıtması (isteğe bağlı, en sona)

```
docs/crm/09-REFERANS-YIGIN.md'deki "Takvim" notunu oku.

Faz 7: görevleri bir takvime TEK YÖNLÜ yansıt (CRM → takvim).
- Servis hesabı + paylaşılan takvim yolunu kullan: kullanıcı bir takvim açar, servis hesabına
  düzenleme yetkisi verir, takvim kimliği ayara yazılır. OAuth onay akışı ve kullanıcı
  başına belirteç bakımı YOK.
- Görev create/update/snooze/complete/cancel → takvim çağrısı. Hata YUTULUR ve loglanır;
  takvim yan kanaldır, CRM işlemini düşürmez. task.googleEventId saklanır.
- Saatli görev → 30 dakikalık blok + 30 dk önce hatırlatma; saatsiz → tüm gün;
  yaklaşık tarihli → tüm gün ve başlıkta "~".
- Özellik KAPALI doğar; açılınca mevcut açık görevleri yazan bir "yeniden eşitle" ucu olur.

ICS abonelik akışını kullanma: abone takvimlerde bildirim yok ve yenileme 8-24 saat gecikiyor.
```

---

## Faz sonrası küçük promptlar (işe yarayan kalıplar)

```
docs/crm/03-IS-KURALLARI.md'yi oku ve kodun bu kurallardan SAPTIĞI yerleri listele.
Düzeltme yapma, yalnız dosya:satır ve hangi kuralı ihlal ettiğini yaz.
```

```
Ajanda sorgusunu gün sınırında test et: yerel saat 23:50 ve 00:10 iken "bugün" grubunun
aynı günü göstermesi gerekiyor. Testi yaz, geçmiyorsa Clock kullanımını düzelt.
```

```
Ödeme ekranındaki her sayı için nereden geldiğini açıkla: hangi uç, hangi alan, hangi formül.
Mutabakat eşitliğinin (beklenen = ödendi + gecikmiş + bekleyen) bozulduğu bir senaryo bul.
```
