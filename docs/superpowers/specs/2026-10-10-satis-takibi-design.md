# Satış Takibi ve Marka İletişim Kartı — Tasarım

Tarih: 10 Ekim 2026
Durum: onay bekliyor

## 1. Amaç

"Derin Record Ofisi"nin ilk yeni modülü. Radyo panelindeki **Talepler**
sekmesi, teklif götürülen kafe/zincir firmalarını adım adım izleyen bir
**Satış** takibine dönüşür. Ayrıca her markaya bir iletişim kartı eklenir.

Yalnızca Derin (admin) görür ve düzenler. Ziyaretçi /coffee formundan yalnızca
yeni başvuru bırakabilir.

### Başarı ölçütü

Derin panelde **Müşteriler → Satış**'a girer; siteden gelen başvuruları ve
elle eklediği firmaları aşamalarıyla görür. En üstte "Bugün yapılacaklar"
listesi, sonraki adım tarihi gelmiş firmaları gösterir. Bir firma anlaşınca
"MARKAYA ÇEVİR" ile tek adımda marka kaydı açılır, iletişim bilgileri markaya
taşınır ve istenirse 7 günlük deneme başlatılır.

### Kapsam dışı (bilerek)

- Otomatik e-posta / SMS / hatırlatma bildirimi
- Firma başına geçmiş (aktivite günlüğü) — tek "notlar" alanı yeterli
- Teklif PDF'i üretme
- Birden fazla yetkili kişi
- Sürükle-bırak kanban panosu (liste + aşama süzgeci yeterli)

## 2. Mevcut durum (10 Ekim 2026)

- `coffee_requests`: `id, company, contact_name, email, phone, branch_count,
  message, status ('new' varsayılan), created_at`. 0 satır.
- RLS: `coffee: insert` → anon+authenticated, `with check (true)`;
  select/update/delete yalnızca `is_admin()`.
- **Bulunan açık:** insert kuralı her şeye izin veriyor; ziyaretçi `status`
  veya `created_at` alanını kendisi yazabilir. Bu tasarım bunu kapatır.
- `brands`: `contact` (tek serbest metin) kolonu var; marka oluşturma
  formlarında "İLETİŞİM" alanı bunu yazar.
- `radyo-yonetim.js` içinde `req-convert` (markaya çevir), `req-status`,
  `req-del` eylemleri; `radyo-panel-views.js` içinde `talepListesi()`.

## 3. Veri modeli (`supabase/satis-takibi.sql`, idempotent)

### 3.1 `coffee_requests` — yeni kolonlar

| Kolon | Tür | Not |
|---|---|---|
| `source` | text, varsayılan `'form'`, check in (`form`,`manual`) | nereden geldi |
| `plan_id` | uuid → `plans(id)` on delete set null | düşünülen paket |
| `next_step` | text | ör. "Pazartesi ara" |
| `next_step_date` | date | "Bugün yapılacaklar" bunu kullanır |
| `notes` | text | yalnız admin notu |
| `brand_id` | uuid → `brands(id)` on delete set null | dönüşünce bağlanır |
| `updated_at` | timestamptz, varsayılan now() | |

`status` değerleri genişler (check kısıtı eklenir):
`new` Yeni · `contacted` Görüşüldü · `offer` Teklif gönderildi ·
`trial` Denemede · `won` Anlaştı · `lost` Olmadı.
Eski `closed` değeri varsa `lost`'a çevrilir (şu an 0 satır).

`contact_name` ve `email` NOT NULL kalır; elle eklenen firmada boşsa `''`
yazılır (arayüz bunu "—" gösterir).

### 3.2 Güvenlik — ziyaretçi eklemesi tetikleyicisi (RLS'e dokunmadan)

`before insert` tetikleyicisi `coffee_requests_ziyaretci_sinirla()`:
`is_admin()` değilse şu alanları zorla sıfırlar:
`status='new', source='form', plan_id=null, next_step=null,
next_step_date=null, notes=null, brand_id=null, created_at=now(),
updated_at=now()`. Ayrıca `company`/`email` boşsa hata verir.

Mevcut RLS politikaları **değişmez**; yalnız bu tetikleyici eklenir.
(CLAUDE.md kuralı gereği bu değişiklik uygulanmadan önce Derin'e ayrıca
gösterilip onay alınır.)

`before update` tetikleyicisi `updated_at = now()` yazar.

### 3.3 `brands` — iletişim kartı kolonları

`contact_name text, contact_phone text, contact_email text, notes text`.
Tek seferlik taşıma: eski `contact` içinde `@` varsa `contact_email`'e, yoksa
`contact_phone`'a kopyalanır (yalnız hedef boşsa). `contact` kolonu silinmez.
`brands` RLS'i zaten `is_admin()` ile ALL; değişmez.

## 4. Mantık modülü (`satis-takibi.js`, yeni)

`plan-takvim.js` gibi tarayıcıda `window.DerinSatis`, Node'da `module.exports`.
Saf fonksiyonlar, DOM yok:

- `ASAMALAR` — sıralı aşama listesi ve Türkçe etiketleri
- `acikMi(talep)` — `won`/`lost` değilse true
- `bugunYapilacaklar(talepler, bugunIso)` — açık ve `next_step_date <= bugün`,
  en eski tarih en üstte
- `asamaSayilari(talepler)` — süzgeç çipleri için sayılar
- `sirala(talepler)` — önce sonraki adım tarihi olan açıklar (tarihe göre),
  sonra tarihsiz açıklar (yeniden eskiye), en sonda kapananlar
- `markayaAktarilacak(talep)` — marka insert alanları:
  `{ name, contact_name, contact_phone, contact_email }`

## 5. Arayüz

### 5.1 Satış sekmesi (`#/satis`; eski `#/talepler` aynı yere gider)

- Menü ve sekme etiketi: **Satış** — alt yazı "Teklif ve görüşme takibi".
- Üstte **+ FİRMA EKLE** (modal: firma, yetkili, telefon, e-posta, şube
  sayısı, paket, sonraki adım + tarih, not → `source='manual'`).
- **Bugün yapılacaklar** paneli (boşsa gizli): firma, sonraki adım, tarih;
  tarihi geçmişse kırmızı.
- Aşama çipleri: Tümü · Yeni · Görüşüldü · Teklif · Denemede · Anlaştı ·
  Olmadı (sayılarla).
- Tablo: FİRMA (yetkili · telefon · e-posta) · AŞAMA (seçim kutusu, mevcut
  `req-status` gibi anında kaydeder) · SONRAKİ ADIM · KAYNAK (Site/Elle) ·
  eylemler: DÜZENLE · MARKAYA ÇEVİR (marka bağlıysa "MARKAYA GİT") · SİL.
- DÜZENLE → yan çekmece (`drawer`) içinde tüm alanlar + KAYDET.

### 5.2 Markaya çevir (mevcut `req-convert` genişler)

1. Onay penceresi: "Marka kaydı açılacak. 7 günlük deneme de başlasın mı?"
   (iki düğme: SADECE MARKA · MARKA + DENEME).
2. `brands` insert: ad, slug, iletişim alanları (`markayaAktarilacak`).
3. Talep: `status='won'`, `brand_id` = yeni marka.
4. Deneme seçildiyse mevcut deneme başlatma kodu (`subscriptions`
   `status:'trial'`) aynı şekilde çağrılır; paketi talepteki `plan_id`.
5. Marka sayfasına gidilir.

### 5.3 Marka iletişim kartı

Marka sayfasına **İLETİŞİM** paneli: yetkili, telefon (tıklanınca `tel:`),
e-posta (`mailto:`), not; DÜZENLE ile çekmecede değiştirilir. Marka
oluşturma formlarındaki tek "İLETİŞİM" alanı yetkili/telefon/e-posta
alanlarına bölünür.

## 6. Hata durumları

- Her yazma mevcut `yazDogrula()` ile yapılır; hata `hata()` ile gösterilir.
- Markaya çevirmede marka oluştu ama talep güncellenemediyse: kullanıcıya
  "Marka açıldı ama talep işaretlenemedi" denir, marka silinmez.
- Deneme başlatılamazsa marka ve talep kalır, hata gösterilir.
- Kullanıcı girdisi her yerde `esc()` ile basılır.

## 7. Test

- `tests/satis-takibi.test.js`: bölüm 4'teki her fonksiyon (`node --test`).
- `tests/radio-panel-views.test.js`'e: Satış sekmesi çizimi, bugün paneli,
  aşama çipleri, kaçırılmış (escape) firma adı.
- Veritabanı: tetikleyici, uygulamadan sonra iki SQL denemesiyle doğrulanır
  (anon olarak `status='won'` ile insert → `new` olarak düşmeli; admin
  insert → alanlar korunmalı) ve deneme satırları silinir.
- Push'tan önce Derin'e önizleme sayfası (`tests/onizleme-satis.html`) ve
  ekran görüntüsü gönderilir; onaydan sonra push.

## 8. Dosyalar

Yeni: `satis-takibi.js`, `supabase/satis-takibi.sql`,
`tests/satis-takibi.test.js`, `tests/onizleme-satis.html`.
Değişen: `radyo-panel-views.js` (talepListesi → satisListesi, marka iletişim
paneli, menü etiketi), `radyo-yonetim.js` (rota, eylemler, veri yükleme),
`radyo-yonetim.html` (script etiketi + `?v=` artışı), `radyo-panel.css`.
