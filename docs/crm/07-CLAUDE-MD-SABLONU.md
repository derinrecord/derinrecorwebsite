# 07 — `CLAUDE.md` şablonu

Aşağıdaki metni repo köküne `CLAUDE.md` olarak koy. `[...]` yerlerini kendi projene göre
doldur. Claude Code bu dosyayı her oturumda kendiliğinden okur; paketin geri kalanına
buradan yönlendirildiği için her oturumda baştan anlatmak gerekmez.

---

```markdown
# CLAUDE.md

## Bu repo

[Projenin bir cümlelik tanımı.] CRM modülü `[src/.../crm]` altında; şartnamesi `docs/crm/`.

**CRM modülüne dokunan her işten önce `docs/crm/03-IS-KURALLARI.md` okunur.** O dosyadaki
kurallar tartışmaya açık değil; her biri gerçek bir hatadan sonra yazıldı. Bir kuralın yanlış
olduğunu düşünüyorsan önce gerekçesini sor, kendi başına "iyileştirme" yapma.

Diğer şartname dosyaları: `02-VERI-MODELI.md` (tablolar, sözlükler),
`04-EKRANLAR.md` (ekran akışı ve yazım dili), `05-API-SOZLESMESI.md` (uçlar),
`08-TEST-SENARYOLARI.md` (kabul testleri).

## Yığın

* Sunucu: `[.NET 8 / NestJS / Django / ...]` — `[dizin]`
* Arayüz: `[Next.js App Router / ...]` — `[dizin]`
* Veritabanı: `[MySQL 8 / PostgreSQL 16]`, şema değişikliği `[migration aracı / elle SQL]`

## Çalışmaya başlamadan

* `git fetch` ile dalın güncel olduğunu doğrula; geride ise kaç commit geride olduğunu söyle,
  sessizce eski kodun üstüne çalışmaya başlama.
* Her iş için `main`'den yeni dal: `<tip>/<kebab-konu>` (`feature`, `fix`, `chore`, `docs`).
* `main`'e doğrudan commit yok; her şey gözden geçirilmiş pull request ile girer.
* Kendi pull request'ini birleştirme.

## Tartışılmaz kurallar (CRM)

* **Tek saat dilimi, tek saat kaynağı.** Ham sistem saati yasak; yalnız `[Clock]` yardımcısı.
  "Bugün" karşılaştırmaları her yerde aynı yerel günden.
* **Sözlükler kodda, veritabanında kod.** Yeni bir aşama/sonuç/etiket serbest metinle
  eklenmez; `[sabitler dosyası]`na yazılır. Arayüz çeviriyle gösterir.
* **Geçmiş ve gelecek ayrı.** `activity` olanı, `task` olacağı tutar. Ajanda, e-posta, push ve
  takvim **yalnız** `task`'tan beslenir.
* **Vade kuralları değişmez.** Ödeme güncelleme vadeye dokunmaz, silme vadeyi geri almaz,
  ek ödeme vadeye dokunmaz. (Ayrıntı: `03 §2`.)
* **Hatırlatma hakkı sayaçla.** Bir vade için otomatik mesaj bir kez gider; sayaç yalnız vade
  değişince sıfırlanır. İş saat başı çağrılabilir olmalı.
* **Yan kanal ana işlemi düşürmez.** E-posta, push, takvim, fatura sağlayıcısı: her biri kendi
  try/catch'inde, hatası loglanır, işlem devam eder.
* **Veri atılmaz.** Çözülemeyen telefon, eşlenemeyen şehir, belirsiz satır: ham değer saklanır
  ve `needsReview` işaretlenir.
* **Renk tek sinyal değil.** Her durum rozetinde renk + kelime birlikte.
* **Boş alan "yok" demek değil.** Kayıt yoksa "kaydedilmedi" yazılır; boş bırakılmaz.
* **Şema additive.** Var olan tablolara dokunmadan yeni tablo/kolon; `crm_` öneki.
* **Mükerrer kayıt uyarıdır, engel değil.** Aynı numara iki firmada olabilir.
* **Yetki tek sorudur:** bu kullanıcı CRM'i görebilir mi? Rol matrisi yazma.

## Yazım dili (kullanıcıya görünen her metin)

* Dil: `[Türkçe]`. Kullanıcıya "siz" diye hitap et.
* Geçmiş zaman, özür yok, ünlem yok, emoji yok, "bir şeyler ters gitti" yok.
* Durum kelimeleri sabit anlamlı; birbirinin yerine kullanılmaz.

## Bitirmeden önce

```bash
[tipcheck komutu] && [lint komutu] && [test komutu] && [build komutu]
```

Ekrana dokunan değişiklik ayrıca telefon genişliğinde (375px) ve her iki renk şemasında
gözle kontrol edilir.
```
