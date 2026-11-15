# 04 — Ekranlar

**Yerleşim kararı:** yönetim panelinin içinde sekme **değil**, ayrı rota (`/admin/crm`) ve
**mobil öncelikli** düzen. Gerekçe: asıl kullanım "aramadan hemen sonra, ayakta, tek elle"
kayıt. Masaüstü tablo/modal deseni bunu vermiyor. Masaüstünde aynı bileşenler geniş düzende.

**Alt sekme çubuğu (4 giriş):** `Bugün` · `Firmalar` · `＋` (ortada, vurgulu) · `Ödeme`.
Çubuk sabit, güvenli alan boşluğuna (`safe-area-inset-bottom`) saygılı. Ayrı rota olduğu için
ana panele dönüş bağlantısını koymayı unutma — ilk sürümde çıkış yolu yoktu.

---

## ① Bugün (ajanda) — açılış ekranı

Gruplu liste; kaynak `GET agenda`:

```
⚠ Gecikmiş (2)      <Firma> · <Kişi> · 📞 💬 · "görev notu" · [Tamamla] [Ertele]
📅 Bugün (4)        ~ <Firma> · "tekrar görüşelim"        (~ = yaklaşık tarih)
                    14:00 <Firma> · demo
🗓 Bu hafta (6)
🔥 Fırsatlar (3)    rakip sözleşmesi ≤ 60 gün içinde bitenler
💤 Dokunulmamış     30+ gündür aktivite yok, aşama aktif takipte
```

Satır içeriği: firma, kişi, `tel:` ve mesaj (`wa.me`) ikonları, **arama öncesi not**, önem
rozeti (`MUTLAKA`). Eylemler: **Tamamla** (→ ③ akışı), **Ertele** (yarın · 3 gün · haftaya ·
ay sonu · tarih seç), Firmaya git. Ufuk seçici: 7 / 30 / 90 gün.

## ② Firmalar

Arama kutusu (ad / kişi / telefon) + filtre çipleri: aşama, branş, il, sorumlu, sıcaklık,
etiket, "açık görevi yok", "30+ gün dokunulmamış", "rakip bitişi ≤ 90 gün", "kontrol bekliyor".
Sıralama: son aktivite / sonraki görev / ad / eklenme.

Satır: ad · aşama çipi · il · sıcaklık · sonraki görev · son temas.
Masaüstünde ek olarak **pipeline (kanban)** görünümü; sürükleme = aşama değişikliği.

Liste satırı için gereken minimum alan kümesi (mobil yük):
`accountId, name, stage, heat, branches, cityName, ownerUserId,
primaryContact{name, phoneE164, isWhatsapp}, nextTask{dueDate, dueTime, dueIsApprox, taskType},
lastActivityAt, competitorContractEndsAt, nextDueDate, tags, needsReview`

## ③ Arama sonrası akış — **üç tık**

Paketin en önemli ekranı. "Tamamla"dan ya da firma kartından "Aktivite ekle":

```
1. Sonuç seç     [Görüştüm] [Cevap yok] [Müsait değil, tekrar] [Bilgi gönderdim]
                 [Demo yapıldı] [Olumlu] [Karar aşamasında] [İlgilenmiyor] [Yanlış numara]
2. Not yaz       uzun serbest metin (işletim sisteminin sesle yazdırması kullanılır),
                 kişi seç (varsayılan birincil), gönderilen materyal çipleri, teklifse tutar
3. Sonraki görev tip + tarih kısayolları (yarın · 3 gün · haftaya · ay başı/ortası/sonu ·
                 +1/+3/+6 ay · tarih+saat) + "yaklaşık" + önem + arama öncesi not
   [Kaydet] → tek istek, tek transaction
```

* "İlgilenmiyor" seçilirse 3. adım yerine **kayıp nedeni** seçimi (aşama → `lost`).
* "Müsait değil, tekrar" seçilirse 3. adım **zorunlu**.
* Metin alanı kısa olmasın: gerçek kullanımda tek not 1.300 karaktere çıkıyor.

## ④ Firma kartı

Üst blok: ad, aşama çipi (tıkla → değiştir), sıcaklık, branşlar, il, sorumlu, rakip + sözleşme
bitişi (≤ 60 gün ise kırmızı), etiketler. `needsReview` ise sarı şerit: "İçe aktarımdan geldi,
kontrol et" + tek tık "kontrol edildi".

Sonra: **kişiler** (ad · rol · karar verici ★ · 📞 💬 ✉ tek tık · hatırlatma alıcısı işareti),
**açık görevler**, **zaman tüneli** (tarih · tip ikonu · kişi · sonuç · not; uzun not "devamı"),
`member` ise **Ödeme** sekmesi.

Düzenleme alanları: profil (kuruluş tipi, web, sosyal, tesis notu, üst kuruluş), rakip bloğu
(yazılım + bitiş + yıllık ücret + not), sözleşme/ödeme bloğu, genel not, fatura bilgileri.

## ⑤ Hızlı ekle (＋)

Yeni firma: **ad zorunlu**, yanında kişi adı + telefon + il + branş. Kaydetmeden önce mükerrer
uyarısı. Alternatif giriş: "firma ara → ③ aktivite ekle".

Not: "Kaydetten sonra form açık kalsın mı?" sorusunun cevabı **evet** — arka arkaya kayıt
girerken her seferinde listeye dönmek iş yavaşlatıyor.

## ⑥ Ödeme takibi (masaüstü ağırlıklı, mobilde kart görünümü)

Tablo kolonları:
```
Firma | Branş | Kişi/Tel | Sözleşme | Tutar | Periyot | Son Ödeme | Vade (satır içi) |
Durum | Fatura ✓ | Hatırlat | ⋯
```
* **Vade satır içi düzenlenir**; periyot/ödeme günü doluysa sonraki tarih önerilir.
* **Durum rozetleri:** vade yok → "Ödeme Takibi Yok"; geçmiş → 🔴 "Ödemedi"; ≤ 7 gün →
  🟠 "N Gün Kaldı"; diğer → 🟢. Renk tek sinyal değil, yanında **kelime** var.
* "Hatırlat" yalnız gecikmiş satırda; yanında "son hatırlatma: 2 gün önce" (log'dan).
* `Fatura ✓` kart üstündeki bayrağı değiştirir (mevcut vadeye ait).

Özet kartları (tıklanabilir filtre): Toplam · Ödedi · Ödemedi · Takipsiz · 7 gün içinde vade ·
MRR (yıllıklar hariç ve dahil) · Faturasız vadeler · Bitecek sözleşmeler · Bu ay gönderim sayısı ·
**Net gelir** (tahsilat − gider).

Yan paneller (sheet): Ödeme gir · Ödeme geçmişi · Ek ödemeler · Giderler · Gelir tablosu ·
Ödeme bilgileri (IBAN'lar) · Hatırlatma alıcıları · Hatırlatma geçmişi · Fatura bilgileri ·
Fatura kes / fatura listesi.

---

## Mobil kuralları

* Tüm eylemler **alt yan panel** (bottom sheet) ile; modal ortası telefonda tek elle erişilemiyor.
* Dokunma hedefi ≥ 44px; `＋` ortada ve vurgulu.
* Liste sayfalı (30'luk); sonsuz kaydırma yerine "daha fazla" düğmesi — geri dönüşte yer kaybı
  olmuyor.
* Listeye dönüşte **filtre ve kaydırma konumu korunur** (durum nesnesini sakla). Bu, ikinci
  haftada en çok şikâyet edilen eksikti.
* Kaydetme geri bildirimi kısa bir bildirim şeridi (toast) ile; sayfa yenilemesi yok.
* Derin link: push ve e-posta `/admin/crm?task=<id>` ile doğrudan görevi açar.

## Yazım dili

* Durum kelimeleri sabit anlamlı: "Ödemedi" ≠ "Vadesi geçti" ≠ "Takip yok". Birini diğerinin
  yerine kullanma.
* Boş alan **boş bırakılmaz**: kayıt yoksa "kaydedilmedi" yazar. "Bilinmiyor" ile "yok" farklıdır.
* Hiçbir ekranda "bir şeyler ters gitti" yazmasın; ne olduğunu yaz.
