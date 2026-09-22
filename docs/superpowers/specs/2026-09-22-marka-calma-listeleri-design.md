# Marka Bazlı Çalma Listeleri

## Amaç

Radyo yöneticisi, her markanın yayınını diğer markalardan bağımsız olarak
hazırlayabilmeli. Bir markanın parça sırası, kapak görseli veya karışık çalma
tercihi değiştiğinde başka bir markanın yayını etkilenmemeli.

Teklif Talepleri panel kartı da bağımsız bir kart olarak yerleşecek; mevcut
iç içe bağlantı yapısı kaldırılacak.

## Mevcut durum

`brand_broadcast` doğrudan tek bir `radio_folders` kaydına işaret ediyor.
Bu nedenle aynı klasörü kullanan markalar ortak listeyi değiştiriyor. Klasör
ekranı, bir seçimde birden çok ses dosyasını yükleyebiliyor; uygulama düzeyinde
parça sayısı sınırı bulunmuyor. Gerçek sınır Supabase Storage kotası ve dosya
yükleme sınırlarıdır.

## Seçilen tasarım

Her marka için bağımsız çalma listesi oluşturulacak.

- `brand_playlists`: marka, ad, açıklama, kapak, karışık çalma tercihi ve
  aktiflik bilgisini tutar.
- `brand_playlist_tracks`: bir liste içindeki parça kaydını ve sırasını tutar.
  Parçalar `radio_tracks` kayıtlarına referans verir; ses dosyası tekrar
  depolanmaz.
- Liste oluştururken mevcut bir yayın klasöründeki parça sırası başlangıç
  kopyası olarak alınabilir. Sonraki ekleme, çıkarma ve sıralama işlemleri
  yalnızca marka listesini değiştirir.
- Bir markanın aktif yayını `brand_broadcast.playlist_id` ile seçilir.
  Geçiş sırasında mevcut `folder_id` yayınları korunur; oynatıcı önce
  `playlist_id`, yoksa mevcut `folder_id` yolunu kullanır.

Bu yaklaşım depolama maliyetini artırmadan marka izolasyonu sağlar. Ortak
klasörler yeni listelere başlangıç şablonu olarak kullanılmaya devam eder.

## Yönetim akışı

Marka ayrıntısına “ÇALMA LİSTELERİ” bölümü eklenir. Yönetici liste oluşturur,
isteğe bağlı olarak bir yayın klasöründen parça sırasını içeri alır, ardından
parça ekler, çıkarır ve sürükleyerek sıralar. “Canlı yayına al” düğmesi yalnızca
o markanın aktif listesini değiştirir.

Yayın klasörü ayrıntısına da “Marka listesi oluştur” kısayolu eklenir; seçilen
klasör, yeni marka listesinin başlangıç kaynağı olur.

## Geçiş ve hata davranışı

Geçiş SQL'i yeni tabloları ve `brand_broadcast.playlist_id` alanını ekler;
mevcut satırları silmez. Yayın oynatıcısı liste boşsa veya yeni alan yoksa
mevcut klasör yayınını oynatmaya devam eder. Marka listesi boşken canlıya alma
engellenir ve yöneticiye açıklayıcı mesaj verilir.

## Doğrulama

- Teklif Talepleri ve Abonelikler kartları ayrı bağlantılar olarak doğrulanır.
- Bir klasörden iki farklı marka listesi üretilir; birindeki parça sırası
  değiştirilince diğerinin değişmediği doğrulanır.
- Yeni bir marka listesi yayına alınır; marka oynatıcısının yalnızca bu
  sırayı alması doğrulanır.
- Eski `folder_id` ile yayında olan bir marka, geçişten sonra çalmaya devam
  eder.
