# Şube sunum ekranı — tasarım (2026-10-11)

## Amaç (Derin'in sözleriyle)
- Her şey **müşteri sunumu ekranında** olmalı. Ayrı bir "kafe oynatıcı" ekranına gerek yok.
- **Her şubeye ayrı link ve ayrı kod** verilir.
- Link ya da kod başka bir yere sızdırılırsa **alarm ve güvenlik** devreye girer.
- Panelde link ve kod için **rastgele yeni üret** düğmeleri olur (her basışta değişir); Derin kopyalayıp müşteriye atar.
- **İki ayrı düğme**: YENİ LİNK ÜRET ve YENİ KOD ÜRET.
- Şu an gerçek müşteri yok; Chemex ve starbucks deneme markası olarak kalır (silinmez).

## Bugünkü durum
- `coffee-marka.html` (sunum): **marka** başına link (`/coffee/<slug>`) + marka erişim kodu. Kilit, alarm, canlı durum, geçmiş yok.
- `radyo.html` (kafe oynatıcı): **şube** başına link (`radyo.html?key=<uuid>`) + şube kodu (`player_code`).
  Cihaz kilidi, yanlış kod/başka cihaz kaydı (IP, konum), Telegram alarmı, yayın saatleri,
  canlı durum (`radio_ping`), yayın geçmişi (`radio_log_event`), abonelik kontrolü burada.

## Hedef
Şubenin linki ve kodu **sunum ekranını** açar; güvenlik ve yayın işleri bugünkü test edilmiş
sunucu fonksiyonlarıyla aynen çalışır. Güvenlik baştan yazılmaz, yeniden kullanılır.

### 1. Ekran
- Şube linki: `/coffee/s/<anahtar>` (anahtar = rastgele, tahmin edilemez). Sunum tasarımında açılır:
  kapak, çalan parça, çalma listesi, ilerleme çubuğu.
- İlk açılış: ekran **şube kodunu** sorar → doğruysa cihaz o şubeye kilitlenir. Sonraki açılışlarda kod sorulmaz.
- Sızıntı: başka cihaz / yanlış kod → ekran açılmaz, kayıt + Telegram alarmı (bugünkü `radio_ping` davranışı).
- Yayın saatleri dışında, abonelik bitince, kaynak yokken ekran sade bir durum yazısı gösterir.

### 2. Arka plan (yeniden kullanılır)
- Yayın/güvenlik mantığı `radyo.js`'ten ortak bir dosyaya ayrılır (ör. `sube-yayin.js`, IIFE,
  `window.DerinSubeYayin`): kod kapısı, cihaz kimliği, `radio_ping`, olay kaydı, mesai, kuyruk.
- Sunum ekranı bu modülü kullanır, yalnız görünümü kendisi çizer.
- Kapak ve süre için şube cihazına özel **yeni okuma fonksiyonu** gerekebilir
  (`radio_listeler`'in kapak/süre döndüren hâli, aynı cihaz kilidi kapısıyla).
  → Ayrı adım: SQL önce Derin'e gösterilir, onaysız çalıştırılmaz. RLS politikalarına dokunulmaz.

### 3. Panel (Şubeler bölümü, her şube için)
- **ŞUBE LİNKİ**: link + `LİNKİ KOPYALA` + **`YENİ LİNK ÜRET`**
  - Rastgele yeni anahtar üretir; eski link anında çalışmaz.
  - Cihaz kilidi de sıfırlanır: yeni link ilk açıldığı cihaza kilitlenir.
  - Onay penceresi: "Eski link çalışmayı durdurur, yeni linki şubeye iletin."
- **ŞUBE KODU**: kod + `KODU KOPYALA` + **`YENİ KOD ÜRET`** (bugünkü KODU YENİLE'nin adı).
  - Zaten kilitli cihaz kod sormaz; yeni kod kilit sıfırlanınca/cihaz değişince istenir.
- **`DAVETİ KOPYALA`**: link + kod tek mesaj (bugün var, korunur).
- Markadaki "MÜŞTERİ SUNUMU — LİNK VE ERİŞİM KODU" bölümü kaldırılır (marka linki artık yok).

### 4. Eski ekranlar (Derin'in kararı: en sonda silinir)
- Sonunda yalnız müşteri sunumu kalır. Kafe oynatıcı (`radyo.html`, `radyo.js`) **son adımda silinir**:
  yeni ekran denenip Derin "canlıya al" dedikten sonra. Önce silinmez ki güvenlik parçaları ortada kalmasın.
- Silmeden sonra `radyo.html?key=…` → yeni şube linkine yönlenir (vercel.json yönlendirmesi).
- `/coffee/<slug>` marka linki → "Bu link artık kullanılmıyor" sayfası.

## Hata durumları
- Kod yanlış → "Kod doğru değil" + deneme kaydı. Link tanınmıyor → "Bu link tanınmadı".
- Başka cihaza kilitli → "Bu link başka bir cihaza bağlı. Derin Record ile iletişime geçin."
- Ağ kopması → bugünkü yeniden bağlanma davranışı.

## Test
- `node --test tests/*.test.js` — mevcut testler (coffee-marka, cihaz kilidi, şube kodu) geçmeli.
- Yeni testler: kod kapısı akışı, yeni link/yeni kod düğmeleri, eski link yönlendirmesi.
- Prova sayfası + 390px / 1280px ekran görüntüleri Derin'e gönderilir.

## Yapılmayacaklar
- Veritabanında onaysız değişiklik yok; marka/şube silinmez (Chemex, starbucks deneme verisi); `chat-crypto.js`, `config.js`, RLS'e dokunulmaz.
- Canlıya alma yalnız Derin "canlıya al" dedikten sonra.

## Sıra
1. Ortak yayın modülünü ayır (davranış değişmez, testler geçer).
2. Panel: YENİ LİNK ÜRET / YENİ KOD ÜRET düğmeleri.
3. (Onayla) kapak/süre okuma fonksiyonu.
4. Sunum ekranının şube hâli.
5. Marka sunum bölümünün kaldırılması, eski linklerin yönlendirilmesi.
6. Derin onaylayınca kafe oynatıcının silinmesi.

---

## REVİZYON 2026-10-11 (Derin: "BU GÖRÜNÜM KALACAK")
İlk uygulama (sunum.html, kafe motoru üstüne sade görünüm) yanlıştı: Derin'in istediği **mevcut müşteri
sunumu görünümünün birebir** kalmasıydı. Geçerli tasarım bu bölümdür; üstteki "Ekran" ve "Arka plan"
maddelerinin yerine geçer.

### Kararlar (Derin)
- Görünüm: `coffee-marka.html` + `coffee-marka.js` + `marka-sunum.css` olduğu gibi kalır (parça kapakları,
  süreler, ilerleme çubuğu, geri/oynat/ileri/karışık, ses, istatistikler, KENDİ ÜRETİMİMİZ yazıları).
- Kafedeki personel de düğmeleri kullanabilir (sunumdaki gibi serbest).
- Açılış: marka linki+kodu yerine **şube linki (`/coffee/s/<anahtar>`) + şube kodu**.

### Nasıl
- `coffee-marka.js` şube moduna geçer: anahtar yoldan okunur; kilit kartı (`mk-lock`) "ŞUBE KODU" ister.
  Kod `radio_ping(p_kod)` ile doğrulanır (bugünkü kafe oynatıcının yaptığı gibi; yanlış kod/başka cihaz
  kaydı ve Telegram alarmı sunucuda aynen çalışır). Kod cihazda saklanır, sonraki açılışta sorulmaz.
- Cihaz kimliği aynı `localStorage` anahtarı (`derin_record_device_id`): kafede kilitli cihazlar yeniden
  kod sormaz.
- Güvenlik/yayın işleri küçük bir ortak dosyada: `sube-guvenlik.js` (`window.DerinSubeGuvenlik`):
  cihaz kimliği, kod kapısı, düzenli `radio_ping` (canlı durum), `radio_log_event` (geçmiş),
  `radio_now_report` (çalan parça), yayın saatleri (açık/kapalı), kilit/abonelik durumunda sunumu kapatma.
- Veri: şube anahtarı + cihaz kimliğiyle çalışan **yeni okuma fonksiyonları** (`supabase/sube-sunum.sql`):
  `sube_sunum_marka`, `sube_sunum_liste`, `sube_sunum_kapak` — coffee_brand_* ile aynı sütunlar;
  kapı: marka aktif + abonelik geçerli + `radio_cihaz_uygun`. Şubeye atanmış liste varsa onlar, yoksa
  markanın listeleri. Yalnız okur; tablo/RLS değişmez. **Derin onaylamadan çalıştırılmaz.**
- Anonslar: kafe oynatıcıdaki anons yoklaması (`radio_anonslar`) da taşınır.

### Silinecekler (son adım, Derin "canlıya al" + deneme sonrası)
- Kafe oynatıcı: `radyo.html`, `radyo.js` ve yalnız onu sınayan testler (yerine `sube-guvenlik.js` testleri).
- İlk yanlış deneme: `sunum.html`, `sube-sunum.css` (canlıya hiç çıkmadı).
- Marka slug/kod yolu (`coffee_brand_auth` çağrısı) `coffee-marka.js`'ten çıkar.
