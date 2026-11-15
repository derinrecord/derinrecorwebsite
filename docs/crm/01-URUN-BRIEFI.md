# 01 — Ürün brifi

## Problem

Küçük bir yazılım/hizmet satıcısı müşteri ve aday takibini elektronik tabloda tutar. Tipik hâli:

* Her aday satırı farklı doluluk oranında: bir kısmında yalnız ad + telefon var.
* Temas geçmişi "TAKİP 1 / TAKİP 2 / TAKİP 3" kolonlarına sığmaz; tek hücreye ayraçla eklenir.
* Hatırlatmalar serbest metin: "bayramdan sonra ara", "Mart ortalarında", "sözleşmesi bitince".
  Gün belirten çok az; dolayısıyla hiçbiri hatırlatma üretemez.
* Aynı firma iki sayfada iki kez: biri "aranmayacak", biri "üye".
* Ödeme takibi ayrı bir sayfada; kimin vadesi geçti el yordamıyla bulunur.

İstenen: **telefondan rahat kullanılan**, detaylı not alınabilen, **kendisi hatırlatan** bir sistem.

## Kullanıcı

Bir ya da iki kişi. Sahibi = satıcı. Çok kiracılı değil; rol matrisi yok; yetki tek sorudur:
"bu kullanıcı CRM'i görebilir mi?" Veri hassas (fiyat, rakip, görüşme notu), bu yüzden erişim
**listeyle** açılır (bkz. `03-IS-KURALLARI.md` §9).

## Baştan verilmiş kararlar

Bunlar tasarım turunu kısaltan kararlardır; her birinin gerekçesi yanında.

| Karar | Gerekçe |
|---|---|
| **Tek kayıt + yaşam döngüsü aşaması.** Aday ve müşteri ayrı tablo değil; `stage` alanıyla aynı kayıt. | Aday müşteri olunca veri ikinci kez girilmiyor; "hem aranmayacak hem üye" çelişkisi imkânsızlaşıyor. |
| **Geçmiş ve gelecek ayrı tablo.** `activity` = oldu, `task` = olacak. | Ajanda, e-posta, push ve takvim tek kaynaktan (`task`) beslenir. Karışık tabloda "açık iş" sorgusu her zaman yanlış çıkar. |
| **Görevde tarih zorunlu, belirsizlik bayrakla taşınır.** `dueDate` somut; `dueIsApprox` + `dueLabel` orijinal ifadeyi saklar. | "Bayramdan sonra" hatırlatma üretemez. Kullanıcı tarih seçer, metin kaybolmaz. |
| **Kişi birinci sınıf varlık, telefon değil.** | Karar verici zinciri (antrenör → işletmeci → yönetim) notların ana konusu. Aynı kişide iki numara = iki satır. |
| **Ödeme takibi kasıtlı olarak basit.** Ödeme gir → sonraki vade gir → vade geçince bir kez otomatik hatırlatma. | Kademeli hatırlatma, cooldown, kısmi ödeme, taksit: hepsi denendi, hiçbiri kullanılmadı, hepsi hata kaynağı oldu. |
| **Mobil öncelikli ayrı rota.** Alt sekme çubuğu: Bugün · Firmalar · ＋ · Ödeme. | Asıl kullanım "aramadan hemen sonra, ayakta, tek elle" kayıt. Masaüstü tablo/modal deseni bunu vermiyor. |
| **Sabit sözlükler kodda, veritabanında kod.** | Serbest metin altı ay sonra filtrelenemez hâle gelir. |
| **Yan kanal hatası ana işlemi düşürmez.** E-posta, push, takvim, fatura sağlayıcısı. | Takvim erişilemez olduğu için görev kaydedilememesi kabul edilemez. |
| **Tek saat dilimi.** Modülde işletme bağlamı yok; tüm gün karşılaştırmaları tek yerel saate göre. | Sunucu UTC iken "bugünün görevleri" sorgusu 03:00'te yanlış gün gösterir. |

## Kapsam dışı (bilinçli)

* Kısmi ödeme ve taksit modeli — not alanı yeter.
* Kademeli hatırlatma, sessize alma penceresi, hatırlatma şablonu yönetim ekranı.
* Çok kiracılılık, rol/yetki matrisi, denetim izi (audit trail).
* Takvimden CRM'e geri yazma (çift yönlü eşitleme).
* Teklif için ayrı tablo — `activityType = offer` + tutar/not yeterli. Teklif sayısı yüzleri
  geçerse ayrı tablo additive olarak açılır.

## Modülün dört parçası

1. **CRM çekirdeği** — firma, kişi, aktivite (temas günlüğü), görev, aşama hunisi.
2. **Ajanda ve hatırlatma** — gecikmiş/bugün/bu hafta/fırsatlar/dokunulmamış; günlük özet
   e-postası + push.
3. **Abonelik ödeme takibi** — vade, otomatik WhatsApp hatırlatması, tahsilat, gider, net gelir.
4. **Faturalama** (isteğe bağlı) — e-fatura entegratörüyle fatura kesme.

Faz sırası `06-PROMPTLAR.md`'de; 1 → 2 → 3 → 4 bağımlılık sırasıdır. 4 olmadan sistem çalışır.
