# Takvim İçi Öğrenci Takibi — Tasarım

## Amaç

Derin geçici olarak öğrenci çalıştırıyor. Bu öğrencilerin **adı, velisi, telefonu**,
**hangi gün geldiği** ve **ne kadar ödediği** tek yerde durmalı; ama bu iş için
ayrı bir yönetim ekranı, ayrı bir menü ve ayrı bir giriş akışı istemiyoruz.

Bu yüzden öğrenci takibi, yöneticinin zaten her gün açtığı **Plan → Takvim**
sayfasının yan panelinde **ayrı bir klasör** olarak yaşar. Takvimin ay okları
hem yoklama şeridini hem ödeme özetini birlikte kaydırır: "bu ay kaç gün geldi"
sorusunun cevabı, ekranda görünen ayla aynı yerden okunur.

Öğrenci işi **takvim kayıtlarıyla karışmaz.** Takvim ödeme/madde/not akışı
`plan_maddeleri` tablosunda; öğrenci verisi ise kendi iki tablosunda durur.

## Mevcut durum

Panelde plan takvimi var (`plan-takvim.js` + `plan_maddeleri`). Abonelik ve
marka ödemeleri takvime bağlı. Öğrenci diye bir kavram yok; geçici öğrenciler
takvime "madde" olarak yazılıyor, böylece ad/yoklama/ödeme ayrımı kayboluyor.

## Seçilen tasarım

### Veri: iki tablo

- `public.ogrenciler` — `id`, `ad`, `veli`, `telefon`, `notlar`, `aktif`,
  `created_at`, `updated_at`. Silmek yerine `aktif=false` ile arşivlenebilir.
- `public.ogrenci_kayitlari` — `id`, `ogrenci_id` (→ `on delete cascade`), `tur`,
  `gun`, `durum`, `tutar`, `metin`, `bitti`, `created_at`, `updated_at`.

Tek tablo yerine "öğrenci + kayıtları" ayrımı seçildi: yoklama ve ödeme aynı
şekle sahip (tarih + tür + bir değer) ama farklı kısıtlara tabi.

- `tur='katilim'`: `durum ∈ {geldi, gelmedi, mazeret}`, `tutar` anlamsız.
- `tur='odeme'`: `durum is null`, `tutar` dolu, `bitti` tahsil edildi mi.

Tek kısıt (`ogrenci_kayitlari_tur_ck`) bu tutarlılığı veritabanında bağlar.
`where tur='katilim'` koşullu kısmi tekil indeks **günde tek yoklama** kuralını
verir; ödemede böyle bir sınır yok (aynı gün iki tahsilat olabilir).

### Yetki

Her şey yalnız yönetici. İki tabloda da RLS açık, tek kural
`for all to authenticated using (public.is_admin()) with check (public.is_admin())`.
`anon`'a açık hiçbir şey yok. İstemcide ek yetki kontrolü yok — doğru yer RLS.

### Kod: takvimden bağımsız saf modül

`ogrenciler.js` DOM'a dokunmaz, ağa çıkmaz: yalnız hesap ve HTML üretimi.
Panel (`radyo-yonetim.js`) veriyi yükler, eylemleri Supabase'e yazar; takvim
(`plan-takvim.js`) klasörü yan panele basar. Aynı kalıp `plan-takvim.js`'te de var
ve node testleriyle doğrudan sınanabilmeyi sağlıyor.

### Aşamalar

1. **Liste** — ad/veli/telefon/not; ekle, düzenle, sil, ara.
2. **Yoklama** — ayın her günü bir düğme; tek düğme dört hâl arasında döner
   (geldi → gelmedi → mazeret → işaretsiz). Dördüncü basış işareti siler, yani
   yanlış işaret tek basışla geri alınır.
3. **Ödeme** — açıklama + tutar; ödendi işareti, yerinde düzenleme, sil.
4. **Özet** — klasör başlığında ay özeti, satırda devreden borç ve eşik üstü
   devamsızlık rozetleri, "Tümü / Borçlular / Gelmedi ≥ 3" uyarı süzgeçleri.

## Uygulama kararları

- **İyimser kayıt.** Yoklama işareti anında ekranda değişir; yazma düşerse liste
  eski hâline döner ve hata söylenir. Tek hücre için beklemek akışı bozardı.
- **Sessiz kayıp yok.** Kaydedilemeyen satır silinmez; "kaydedilemedi — tekrar
  dene" ile ekranda kalır. Üstüne yazılan metin kaybolmaz.
- **İyimser satırda detay yok.** Yerel (`yerel-*` / `hata`) satırın gerçek
  `id`'si olmadığı için yoklama/ödeme yanlış satıra yazardı; orada ok ve düzenle
  düğmesi hiç basılmaz.
- **Borç ay sınırı tanımaz.** "Bu ay bekleyen" ayrı, "devreden borç" ayrı yazılır
  ki aynı tutar iki kez görünmesin.
- **Türkçe arama.** Küçültme `toLocaleLowerCase('tr')`; "İ" doğru çevrilsin.
- **Gün hesabı UTC.** Ayın son günü saat dilimi kaymasıyla bir gün öne gelmesin.
- **Tekrar çalıştırılabilir SQL.** `supabase/ogrenciler.sql` yalnız
  `if not exists` / `drop policy if exists` kullanır; veri silmez, tablo düşürmez.
  Aşama 1 kurulmuş olsa da aynı dosya yeniden çalıştırılabilir.

## Kapsam dışı

- Veliye mesaj/hatırlatma gönderme.
- Aylık aidatı kendiliğinden oluşturma (her ay elle eklenir).
- Öğrenci başına ayrı giriş hesabı; öğrenci verisi yalnız yöneticide.
- Yoklama/ödeme geçmişini dışa aktarma (çizelge, CSV).
