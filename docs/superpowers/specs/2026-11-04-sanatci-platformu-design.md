# Derin Record Sanatçı Platformu — 1. aşama: Vitrin — tasarım

Tarih: 2026-11-04 · Durum: Derin'in onayını bekliyor

## Amaç
Derin Record yalnız antrenörlere değil, bağımsız sanatçılara da açılır: sanatçı şarkısını yükler,
Derin onaylar, şarkı sitedeki **Sanatçılar** vitrininde dinlenir. Site baştan değişmez; mevcut
ana sayfa, branş demoları, Projelerim ve radyo paneli olduğu gibi kalır.

## Kararlar (Derin söyledi)
- Amaç: hepsi (D) — sıra: 1) vitrin, 2) mekân radyosu kataloğu, 3) prodüksiyon hizmeti satışı.
- Katılım: **açık başvuru** (Derin onaylar) **+ davet** (davetle gelen beklemeden onaylı).
- Tarz: Derin Record kimliği korunur (koyu zemin, pembe/sarı, kaset kartları, halftone, intro, logo).
  ChatGPT denemesinin (derin-record-next) pastel görünümü ALINMAZ.
- ChatGPT denemesinden alınacak fikirler: altta sabit çalar, tür çipleri, kalp/favori,
  "Ben de üretiyorum" düğmesi, metinler ("Sesin burada başlar", "Odandan çıkan ses, birinin dünyası
  olsun"), Dinle / Üret / Sahneye taşı üç adımı.

## Bu aşamada ne var
1. **Sanatçı başvurusu** (`sanatci-basvuru.html`): sahne adı, şehir, tür(ler), kısa biyografi,
   fotoğraf, sosyal bağlantılar (Instagram, Spotify, YouTube; isteğe bağlı), örnek şarkı (isteğe bağlı).
   Önce normal hesap açılır/giriş yapılır, sonra başvuru doldurulur. Derin'e Telegram bildirimi.
   Davet bağlantısıyla (`?davet=KOD`) gelen başvuru kendiliğinden onaylanır; kod tek kullanımlık.
2. **Onay** (yönetici): Bildirimler sayfasında "Sanatçı başvuruları" ve "Onay bekleyen şarkılar"
   bölümleri; ONAYLA / REDDET (ret nedeni isteğe bağlı). Kullanıcılar sayfasında "Davet bağlantısı
   oluştur" düğmesi.
3. **Sanatçı stüdyosu** (`sanatci-studyo.html`, yalnız onaylı sanatçı): profilini düzenler, şarkı
   yükler (ses + kapak + ad + tür + açıklama), şarkılarının durumunu görür (onay bekliyor / yayında /
   reddedildi). Her şarkıda zorunlu kutu: "Bu şarkının tüm hakları bana ait / yayınlama iznim var;
   cover veya izinsiz sample içermiyor." (kabul zamanı kaydedilir).
4. **Sanatçılar vitrini** (`sanatcilar.html`, herkese açık): tür çipleri (Tümü + türler + Favorilerim),
   kaset kartlarıyla şarkılar ve sanatçılar, "Ben de üretiyorum" → başvuru, Dinle/Üret/Sahneye taşı.
5. **Sanatçı profili** (`sanatci.html?s=<slug>`): kapak/foto, biyografi, sosyal bağlantılar, şarkılar.
6. **Altta sabit çalar** (vitrin ve profil sayfalarında): çal/durdur, ileri/geri, ilerleme, kalp.
   Not: sayfa değişince müzik durur (sitede tek sayfa yapısı yok); uygulamada da aynı.
7. **Favoriler**: giriş yapmış herkes kalp ile şarkıyı favorilerine ekler; "Favorilerim" çipi.
8. Ana sayfaya ve menüye **SANATÇILAR** bağlantısı (ana sayfanın geri kalanı değişmez).

## Bu aşamada YOK (sonraki aşamalar)
- Mekân radyosuna aktarım ve şarkı başına "radyoda çalınabilir" izni (2. aşama).
- Sanatçıya "Mix / Master / Prodüksiyon iste" (3. aşama; Proje iste altyapısı).
- Dinlenme başına ödeme, dinlenme istatistikleri, paylaşılabilir hikâye görselleri.

## Veri (Supabase) — SQL'i Derin çalıştırır, Claude SELECT ile doğrular
- `app_role` türüne **artist** eklenir.
- `sanatcilar`: kullanıcı kimliği, sahne adı, slug (benzersiz), şehir, türler, biyografi (≤600),
  foto yolu, sosyal bağlantılar, durum (bekliyor / onayli / reddedildi), ret nedeni, davet kodu,
  zamanlar.
- `sanatci_sarkilari`: sanatçı, başlık, tür, açıklama, ses yolu, kapak yolu, süre, durum
  (bekliyor / yayinda / reddedildi), ret nedeni, hak onayı zamanı, sıra, zamanlar.
- `sanatci_davetleri`: kod, oluşturan, kullanan, kullanılma zamanı.
- `favoriler`: kullanıcı + şarkı (benzersiz çift).

**RLS (yeni tablolar; mevcut politikalar değişmez):**
- Herkes yalnız **onaylı** sanatçıları ve **yayında** şarkıları okur.
- Sanatçı kendi kaydını ve tüm şarkılarını okur; kendi profilini düzenler (durum/onay alanları
  hariç); şarkı ekler (durum her zaman "bekliyor" başlar), bekleyen şarkısını siler.
- Durum değiştirme (onay/ret) yalnız yönetici.
- Favori: kullanıcı yalnız kendi favorilerini okur/ekler/siler.
- Davet kodu kullanımı tek bir güvenli fonksiyonla (kod geçerliyse başvuru onaylı + rol artist).
- Onaylanan başvuruda rol yönetici fonksiyonuyla **artist** olur.

## Dosyalar (Cloudflare R2)
- Klasör: `sanatci/<kullanıcı kimliği>/…` (ses ve kapak). Sunucudaki yetki kuralına eklenir:
  sanatçı yalnız kendi klasörüne yükler/siler; yönetici hepsine.
- Okuma herkese açık adresle (radyo/demo gibi); dosya adı rastgele parça içerir. Reddedilen
  şarkının dosyası silinir.
- Sınırlar: ses en çok 150 MB (WAV/MP3/FLAC/M4A), kapak en çok 5 MB (JPG/PNG/WEBP), kare önerilir.

## Hukuki metinler
- Kullanıcı Sözleşmesi'ne "Sanatçı içeriği" bölümü: hak beyanı, Derin Record'a vitrinde yayın
  izni (münhasır değil, sanatçı istediğinde kaldırır), telif şikâyeti ve kaldırma süreci.
- Aydınlatma Metni'ne sanatçı profili verileri. Metinleri Claude taslak hazırlar; Derin'in bir
  hukukçuya kontrol ettirmesi önerilir.

## Tasarım
- Vitrin ve profil için **2–3 tasarım seçeneği** sunulur (kaset dili korunarak); Derin seçer.
- Başlık yazı tipi: mevcut (Macabro Danger lisansı alınınca sonradan uygulanır).

## Kurallar
- Her adım önizleme (telefon 390 + bilgisayar 1280) → "canlıya al".
- config.js'e gizli anahtar girmez; RLS içeren SQL gerekçeyle sunulur, Derin çalıştırır.
- Testler: node --test (yetki kuralları, saf yardımcılar, sayfa bağları).

## Önce çözülen güvenlik açığı
- `handle_new_user()` rolü kayıt bilgisinden alıyordu (doğrudan çağrıyla admin olunabilirdi).
  Düzeltme: yeni hesap her zaman `coach`; rolü yalnız yönetici değiştirir
  (`supabase/kayit-rol-guvenligi.sql`). Sanatçı rolü yalnız onay/davet fonksiyonuyla verilir.
