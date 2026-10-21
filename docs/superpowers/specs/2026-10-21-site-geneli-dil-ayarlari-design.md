# Site Geneli Dil Ayarları Tasarımı

## Amaç

Derin Record sitesindeki Türkçe ve İngilizce deneyimini tek bir Ayarlar panelinden yönetmek. Dil seçimi giriş gerektirmeden her ziyaretçiye açık olacak, tarayıcıda saklanacak ve site içindeki bütün üretim sayfalarında uygulanacak.

Başarı ölçütleri:

- Her üretim sayfasında Ayarlar paneline ulaşılabilir.
- Kullanıcı Türkçe veya English seçebilir.
- Seçim sayfalar arasında, yenilemede, tarayıcı yeniden açıldığında ve hesaptan çıkışta korunur.
- İngilizce seçildiğinde arayüzde çevrilmemiş Türkçe metin kalmaz.
- Dinamik JavaScript mesajları, form durumları, hata metinleri, erişilebilirlik etiketleri, sayfa başlıkları ve açıklamalar seçili dile uyar.
- Dil sistemi mevcut giriş, radyo, proje, müzik ve yönetim akışlarının veri değerlerini değiştirmez.

## Kapsam

Kapsama Git tarafından izlenen ve tarayıcıda açılabilen bütün üretim HTML sayfaları girer. `tests/` ve `graphify-out/` altındaki test/rapor çıktıları ürün sayfası kabul edilmez. Prova adı taşısa bile doğrudan yayımlanan kök HTML dosyaları kapsamda kalır.

Çeviri kapsamı:

- Genel gezinme, başlıklar, açıklamalar ve çağrı düğmeleri
- Giriş, kayıt, şifre sıfırlama ve hesap menüsü
- Ayarlar panelinin kendisi
- Yönetici, antrenör, radyo, kurumsal yayın, proje ve müzik araçları
- Form etiketleri, seçenekler, yer tutucular ve doğrulama mesajları
- Yükleniyor, boş, başarı ve hata durumları
- `aria-label`, `title`, `alt`, sayfa `<title>` ve meta açıklamaları
- JavaScript ile sonradan oluşturulan metinler

Şarkı adları, kişi/marka adları, kullanıcı tarafından girilen içerik ve veritabanında saklanan iş değerleri çevrilmez. Form seçeneklerinin görünen metni çevrilebilir; gönderilen değer sabit kalır.

Hukuki sayfalar İngilizce arayüzde açıklayıcı İngilizce karşılık sunar. Türkçe metnin bağlayıcı sürüm olduğu açıkça belirtilir; İngilizce metin hukuki kaynak sürümün yerini almaz.

## Kullanıcı Deneyimi

### Ayarlar erişimi

`dil.js`, hesap durumundan bağımsız çalışan ortak bir Ayarlar tetikleyicisi oluşturur. Tetikleyici mevcut sayfa yapısına göre ana gezinmeye veya başlık alanına yerleşir. Telefonda açılır yan menünün içinde görünür; masaüstünde aynı Ayarlar panelini açan erişilebilir bir menü öğesi olarak sunulur.

Giriş yapmış kullanıcının hesap çekmecesinde de Ayarlar bağlantısı bulunur. Her iki bağlantı aynı paneli açar; iki ayrı ayar sistemi oluşturulmaz.

### Ayarlar paneli

Panel sağdan açılan bir çekmece ve arka plan katmanından oluşur. İçerik:

- Başlık: `Ayarlar` / `Settings`
- Grup etiketi: `Dil` / `Language`
- Seçenekler: `Türkçe` ve `English`
- Kapat düğmesi

Etkin dil açıkça işaretlenir. Seçim yapıldığı anda açık sayfa çevrilir; sayfa yenilemesi gerekmez. Panel dışına tıklama, kapat düğmesi ve Escape paneli kapatır. Klavye odağı panel içinde yönetilir ve kapanınca tetikleyiciye döner.

### Varsayılan ve kalıcılık

- Daha önce seçim yapılmamışsa varsayılan dil Türkçedir.
- `?dil=tr` veya `?dil=en` bağlantı parametresi o ziyaret için önceliklidir ve seçimi panelde doğru gösterir.
- Kullanıcının panelden yaptığı seçim `localStorage` içindeki mevcut `derin-dil` anahtarında saklanır.
- Dil tercihi hesap oturumundan bağımsızdır; çıkış yapmak tercihi silmez.

## Teknik Tasarım

### Tek dil motoru

Mevcut `dil.js` tek kaynak olarak korunur. Yeni bir çeviri kütüphanesi veya ikinci durum deposu eklenmez. Dosya şu sorumlulukları taşır:

1. Başlangıç dilini belirlemek.
2. Ayarlar tetikleyicisini ve panelini oluşturmak.
3. Statik `data-i18n` alanlarını çevirmek.
4. Otomatik moddaki metin ve nitelik eşleşmelerini çevirmek.
5. `MutationObserver` ile dinamik içerikleri çevirmek.
6. `derin:dil` olayını yayınlamak.

Mevcut küçük `TR/EN` düğmesi kaldırılır. Yerine açıklamalı Ayarlar paneli gelir.

### Çeviri stratejisi

İki yöntem birlikte devam eder:

- Pazarlama ve marka metinleri `data-i18n` anahtarlarıyla çevrilir. HTML içeren kontrollü başlıklar bu yöntemde kalır.
- Portal ve araç sayfaları `data-dil-otomatik` ile Türkçe kaynak metni sözlükte arar. Dinamik mesajlar da aynı sözlükten çevrilir.

Otomatik modda eşleşmeyen metin sessizce Türkçe bırakılmayacaktır. Denetim testi üretim sayfalarındaki ve ilgili JavaScript dosyalarındaki kullanıcıya görünen Türkçe dizeleri raporlayacak; her raporlanan dize çevrilecek veya marka/veri içeriği olarak açıkça hariç tutulacaktır.

### Sayfa sözleşmesi

Her üretim HTML sayfası:

- `lang="tr"` ile kaynak dili belirtir.
- İngilizce sayfa başlığını `data-baslik-en` ile sağlar.
- İçeriğine uygun olarak `data-i18n` veya `data-dil-otomatik` kullanır.
- `dil.js` dosyasını yükler.

Dil uygulandığında belge `lang` değeri ve `data-dil` durumu birlikte güncellenir. Meta açıklaması bulunan sayfalar İngilizce karşılığını da taşır.

### Auth ve diğer modüller

`auth.js` Ayarlar bağlantısını hesap çekmecesine ekler ve metni `DerinDil.metin` üzerinden alır. Ayarlar panelinin sahibi `dil.js` olur; `auth.js` yalnızca ortak açma işlevini çağırır.

Diğer JavaScript modülleri, dile göre yeniden çizilmesi gereken içeriklerde mevcut `derin:dil` olayını dinler. Veritabanına giden değerler çevrilmiş ekran metninden türetilmez.

## Hata ve Geri Dönüş Davranışı

- `localStorage` kullanılamazsa seçim mevcut sayfada çalışır, ancak sonraki ziyarette kalıcı olmayabilir.
- Bir çeviri anahtarı eksikse Türkçe kaynak metin gösterilir ve otomatik denetim testi eksikliği yakalar.
- `dil.js` yüklenemezse site Türkçe kaynak içeriğiyle kullanılabilir kalır.
- Dinamik içerikte çeviri hatası ana işlevi durdurmaz; içerik kaynak diliyle gösterilir.

## Erişilebilirlik

- Ayarlar tetikleyicisi gerçek `button` veya bağlantı semantiği kullanır.
- `aria-expanded`, `aria-controls`, panel başlığı ve kapat düğmesi doğru etiketlenir.
- Dil seçenekleri tek seçimli grup olarak sunulur ve etkin değer ekran okuyucuya bildirilir.
- Panel Escape ile kapanır, odak kapanınca başlangıç tetikleyicisine döner.
- Renk tek başına seçim göstergesi değildir; metin ve işaret kullanılır.
- Hareket azaltma tercihi açıkken panel geçişi animasyonsuz çalışır.

## Doğrulama

Otomatik kontroller:

1. Bütün üretim HTML sayfalarının `dil.js`, doğru dil işaretleri ve İngilizce başlık taşıdığını doğrulayan envanter testi.
2. Sözlük anahtarlarının benzersiz ve iki dilde erişilebilir olduğunu doğrulayan test.
3. Türkçe → İngilizce → Türkçe geçişinde metinlerin birebir geri döndüğünü doğrulayan test.
4. Dinamik düğme, hata mesajı, placeholder ve `aria-label` çevirilerini doğrulayan test.
5. Ayarlar panelinin varsayılan Türkçe, kalıcı English ve URL parametresi önceliği davranışlarını doğrulayan test.
6. Üretim sayfalarında İngilizce modda kalan kullanıcı arayüzü Türkçesini listeleyen kapsama testi.

Manuel kontroller:

- Telefon ve masaüstünde Ayarlar panelini açma, kapatma ve dil değiştirme
- Giriş yapmadan, giriş yaptıktan sonra ve çıkış sonrasında dil kalıcılığı
- Ana sayfa, her branş sayfası, haberler, ses tasarımı ve kurumsal sayfalar
- Giriş/kayıt/şifre sıfırlama akışları
- Yönetici, kullanıcı, proje, radyo ve müzik araçları
- Form hata, başarı, yükleniyor ve boş durumları

Yayın sonrasında canlı siteden HTML ve `dil.js` sürümü doğrulanır; en az bir masaüstü ve bir mobil görünümde Türkçe/İngilizce geçişi görsel olarak kontrol edilir.

## Yayın Sınırı

Kodun GitHub ana dalına gönderilmesi ile canlı yayın ayrı kanıtlardır. Değişiklikler testlerden geçtikten sonra ana dala gönderilir; canlı alan adında yeni Ayarlar paneli ve çeviri kapsamı görülmeden yayın tamamlandı denmez.
