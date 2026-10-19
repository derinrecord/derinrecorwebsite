# Mobil Kullanılabilirlik — 2026-10-19

## Amaç

Site telefonda gerçekten kolay ve pratik olsun: tek elle kullanılabilir başlık,
kaybolmayan menü, üst üste binmeyen hero, en az 44 px dokunma hedefleri,
klavye açılınca sayfayı bozmayan formlar ve çentiğe saygılı sabit düğmeler.

## Ölçülen sorunlar (390×844 ve 320×844, misafir ziyaretçi)

1. Ana sayfada `nav` ve `menu-toggle` HTML'de `hidden`; `auth.js` misafirde
   `setNavigation(false)` çağırıyor. Sonuç: ziyaretçinin menüsü yok; Haberler ve
   Ses Tasarımı sayfalarına ana sayfadan ulaşmak imkânsız.
2. Ana sayfa hero: `.hero-art` (341×437 px) `absolute` konumda `hero-copy`
   üstüne biniyor; metin ve “MÜZİĞİNİ OLUŞTUR” düğmesi logonun altında kalıyor.
3. Alt sayfa başlığı (`.header`) iki satıra sarıyor: 108–111 px, 320 px'de
   153 px. Sabit başlık ekranın ~%18'ini yiyor.
4. Giriş/Kayıt düğmeleri 29–35 px; haber bağlantıları 38 px; kafe sekmeleri
   32 px. 44 px altı hedefler tek elle kullanımda ıskalanıyor.
5. `news.html` 320 px'de 333 px genişliğe taşıyor (HABERLER. başlığı).
6. Radyo panelindeki metin alanı 15 px; iOS odaklanınca sayfayı yakınlaştırıyor.
7. TEKLİF AL + WHATSAPP sabit düğmeleri 143×102 px alanı kaplıyor ve içeriği
   (özellikle 320 px'de) kapatıyor; `env(safe-area-inset-*)` yok.
8. Demo oynatıcıda seek çubuğu 5 px, tutamak 15 px; parmakla tutmak zor.
9. `side-menu.css` menü yüksekliği `100vh`; iOS araç çubuğu açılınca menünün
   altı kesiliyor.
10. `viewport-fit=cover` yok; çentikli telefonlarda sabit öğeler güvenli alana
    girmiyor.

## Çözüm

- Yeni `mobil.css` (yalnız `@media (max-width:760px)` ve 360 px ince ayar):
  - Başlıklar tek satır, 44 px düğmeler, güvenli alan boşlukları.
  - Ana sayfa menüsü: başlığın altından açılan tam genişlik panel; arka plan
    karartması; dışarı tıklama ve Escape ile kapanma; `100dvh`.
  - Hero: metin + CTA üstte, kaset altında (`position:relative`), tek sütun.
  - Bölüm boşlukları mobilde küçültülür; kaset kartlarının düzensiz kayması
    kalkar.
  - Sabit aksiyonlar 52 px daire ikonlara iner; çentik/ana çubuk boşluğu.
  - Form alanları 16 px + 44 px; tablolar yatay kaydırılır.
  - 320 px taşmaları (haber başlığı) kapatılır.
- `auth.js`: ziyaretçide menü gizlenmez; yalnız hesap düğmeleri yönetilir.
  Bildirim sayacı davranışı değişmez.
- `script.js`: menü aç/kapa + dışarı tıklama + Escape + gövde kaydırma kilidi.
- `index.html`: `nav` / `menu-toggle` üzerindeki `hidden` kaldırılır.
- Tüm sayfalara `mobil.css` ve `viewport-fit=cover` eklenir.
- `auth.js` sürümü tüm sayfalarda artırılır.

## Kısıtlar

- Masaüstü görünümü değişmez (tüm kurallar medya sorgusu içinde).
- `chat-crypto.js`, RLS, Supabase şeması, silinmiş özellik kararları ellenmez.
- Kullanıcı verisi yeni bir yere basılmaz; yeni global yok.
- Testler: `node --test tests/*.test.js` tümü geçer; yeni
  `tests/mobil-kullanilabilirlik.test.js` kuralları kilitler.

## Doğrulama

- 390 ve 320 px'de: yatay taşma yok, menü açılıyor, hero CTA görünür,
  düğmeler ≥44 px, form alanları 16 px, sabit düğmeler içeriği kapatmıyor.
- 1440 px'de önce/sonra ekran görüntüsü aynı kalır.
