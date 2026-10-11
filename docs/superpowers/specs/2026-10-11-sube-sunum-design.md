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

### 4. Eski ekranlar
- `radyo.html?key=…` → yeni şube sunum linkine yönlenir (dosya silinmez).
- `/coffee/<slug>` marka linki → "Bu link artık kullanılmıyor" sayfası (dosya silinmez).

## Hata durumları
- Kod yanlış → "Kod doğru değil" + deneme kaydı. Link tanınmıyor → "Bu link tanınmadı".
- Başka cihaza kilitli → "Bu link başka bir cihaza bağlı. Derin Record ile iletişime geçin."
- Ağ kopması → bugünkü yeniden bağlanma davranışı.

## Test
- `node --test tests/*.test.js` — mevcut testler (coffee-marka, cihaz kilidi, şube kodu) geçmeli.
- Yeni testler: kod kapısı akışı, yeni link/yeni kod düğmeleri, eski link yönlendirmesi.
- Prova sayfası + 390px / 1280px ekran görüntüleri Derin'e gönderilir.

## Yapılmayacaklar
- Veritabanında onaysız değişiklik yok; marka/şube silinmez; `chat-crypto.js`, `config.js`, RLS'e dokunulmaz.
- Canlıya alma yalnız Derin "canlıya al" dedikten sonra.

## Sıra
1. Ortak yayın modülünü ayır (davranış değişmez, testler geçer).
2. Panel: YENİ LİNK ÜRET / YENİ KOD ÜRET düğmeleri.
3. (Onayla) kapak/süre okuma fonksiyonu.
4. Sunum ekranının şube hâli.
5. Eski linklerin yönlendirilmesi, marka sunum bölümünün kaldırılması.
