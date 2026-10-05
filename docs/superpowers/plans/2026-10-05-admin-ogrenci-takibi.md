# Takvim İçi Öğrenci Takibi — Uygulama Planı

> **Durum:** Aşama 1–4 uygulandı ve doğrulandı (425/425 `node --test`). Bu dosya
> yapılan işin kaydıdır; adımlar `- [x]` ile işaretlidir.

**Goal:** Radyo panelindeki Plan → Takvim sayfasının yan panelinde, yalnızca
yöneticinin gördüğü ayrı bir ÖĞRENCİLER klasörü: ad/veli/telefon kaydı, gün gün
yoklama ve ödeme takibi, ay özeti ve "kim borçlu, kim aksıyor" süzgeçleri.

**Architecture:** Modül (`ogrenciler.js`) saf hesap + HTML üretir; DOM'a ve ağa
dokunmaz. Veri `ogrenciler` + `ogrenci_kayitlari` tablolarından gelir, panel
(`radyo-yonetim.js`) yükler ve yazar, takvim (`plan-takvim.js`) klasörü yan
panele basar.

**Tech Stack:** Vanilla JS (IIFE + `window.Derin*` global + `module.exports`),
Supabase JS v2 (CDN), `node:test`. Build aracı yok.

**Spec:** `docs/superpowers/specs/2026-10-05-admin-ogrenci-takibi-design.md`

## Global Constraints

- Her JS dosyası IIFE içinde; dışarıya `window.DerinOgrenci` ve `module.exports`.
- Kullanıcıdan gelen metin DOM'a basılmadan önce yerel `esc`'ten geçer.
- Dosya adları kebab-case, arayüz metinleri Türkçe.
- Script/style etiketlerinde cache-busting `?v=N`.
- Tarihler `YYYY-AA-GG` metni; gün hesabı UTC.
- Script yükleme sırası: `ogrenciler.js` → `plan-takvim.js` → `radyo-yonetim.js`
  (panel, `window.DerinOgrenci`'yi IIFE başında okur).
- RLS politikası ve `chat-crypto.js` şifreleme mantığı bu işin kapsamı dışında,
  değiştirilmedi.

## Review Focus

Tasarımın ima ettiği ama görevlerin kendiliğinden kapsamadığı, kullanıcıyı
ısırması en olası girdiler:

1. **Ay sonu + saat dilimi:** 31 Ekim UTC okunmazsa 30 Ekim görünebilir. → Aşama 2
2. **Yanlış işaret:** gelmedi yerine geldi basıldı; geri alınabilmeli. → Aşama 2
3. **Aynı güne ikinci yoklama:** yalnız veritabanı engellerse arayüz bunu hata
   olarak göstermeli, sessiz yutmamalı. → Aşama 2
4. **Yazma düşerse tutar kaybolmasın:** ödeme formu hata dalında açık kalmalı.
   → Aşama 3
5. **Bekleyen ≠ borç:** geçen aydan devreden aidat "bu ay bekleyen" sayılmamalı;
   devir ayrı rozet olmalı, aynı tutar iki kez yazılmamalı. → Aşama 4
6. **Öğrenci silinince sahipsiz kayıt:** veritabanında `on delete cascade`.
   → Aşama 1

---

### Aşama 1: Liste

- [x] `supabase/ogrenciler.sql`: `ogrenciler` tablosu + `ad` indeksi + RLS
      (`is_admin()`), tekrar çalıştırılabilir.
- [x] `ogrenciFiltrele(liste, q)` — ad/veli/telefon, Türkçe küçültme.
- [x] `ogrenciBolumu(liste, kayitListesi, s, a)` — arama, ekleme formu, liste.
- [x] Panel: `ogrenci-yeni/-kapat/-kaydet/-duzenle/-duzenle-kapat/-duzenle-kaydet/-sil/-tekrar`,
      iyimser ekleme, debounce'lu arama (220 ms) + odak geri yükleme.
- [x] Takvim yan panelinde klasör: `bolum('ogrenciler', 'ÖĞRENCİLER', …)`.
- [x] `tests/ogrenci-liste.test.js`.

### Aşama 2: Yoklama

- [x] `ogrenci_kayitlari` tablosu + tür kısıtı + kısmi tekil indeks
      (`where tur='katilim'` → günde tek yoklama) + cascade + RLS.
- [x] `KATILIM_DONGU = ['', 'geldi', 'gelmedi', 'mazeret']`, `katilimSonraki`,
      `katilimEtiket`, `katilimKisa`.
- [x] `ayGunSayisi(yil, ay)` (UTC), `gunKisa(iso)`, `katilimOzeti` (yalnız o ay).
- [x] `katilimSeridi` — ayın her günü bir düğme; bugün çerçeveli.
- [x] Panel: `ogrenci-katilim` (iyimser + hata dalında listeyi geri al + `bildir`).
- [x] `tests/ogrenci-takip.test.js` — ay/döngü/şerit/iyimser yoklama.

### Aşama 3: Ödeme

- [x] `ogrenciOdemeleri` (yeni tarih başta), `odemeOzeti` → `{tahsil, bekleyen, adet}`.
- [x] `odemeSatiri` — ödendi kutusu, yerinde düzenleme (✎), sil (×).
- [x] `ogrenciDetay` — YOKLAMA + ÖDEMELER bölümleri, ödeme ekleme formu.
- [x] Panel: `ogrenci-odeme-yeni/-kapat/-kaydet/-isaret/-duzenle/-duzenle-kapat/-duzenle-kaydet/-sil`.
- [x] `tests/ogrenci-takip.test.js` — ödeme satırı/formu, hata dalı açık kalır.

### Aşama 4: Özet ve uyarılar

- [x] `borcOzeti(liste, id)` → tüm zamanların ödenmemiş toplamı (ay sınırı yok).
- [x] `DEVAMSIZLIK_ESIK = 3`, `ODAK` (borç/gelmedi), `dikkatOzeti`, `odakSayilari`,
      `ogrenciOdakla` (bilinmeyen anahtarı yok sayar).
- [x] `ogrenciToplam` + `toplamSatiri` — klasör başlığında ay özeti.
- [x] `odakCubugu` — "Tümü / Borçlular / Gelmedi ≥ 3", sayaçlı ve seçilebilir.
- [x] Satır rozetleri: devreden borç (`i.b`), eşik üstü devamsızlık (`i.y.d`).
- [x] Detayda "Toplam açık borç" satırı (birden çok kayıtta kayıt sayısı ile).
- [x] Panel: `ogrenci-odak` (aynı düğmeye ikinci basış süzgeci kaldırır).
- [x] CSS: `.ogr-toplam`, `.ogr-suzgec`, `.ogr-odak(.secili/.bos)`, `.ogr-acik-borc`,
      `.ogr-cip i.b`, `.ogr-cip i.y.d`.
- [x] `tests/ogrenci-ozet.test.js` — borç/süzgeç/özet/rozet/panel/CSS/sürüm eşitliği.

### Kapanış

- [x] Cache-bust: `ogrenciler.js?v=3`, `radyo-panel.css?v=22`,
      `radyo-yonetim.js?v=20261005k` (gerçek panel + prova sayfası aynı sürümler).
- [x] Önizleme senaryoları: `ogrenci`, `ogrenci-odeme`, `ogrenci-suzgec`
      (`node tests/onizleme-olustur.js <senaryo> <çıktı>`).
- [x] `node --check` temiz, `set -o pipefail` ile 425/425 test geçer.

## Kalan işler

- [ ] `supabase/ogrenciler.sql` Supabase SQL Editor'de çalıştırılmalı. Tablo
      yokken liste çalışır ama yoklama/ödeme boş görünür; dosya tekrar
      çalıştırılabilir, Aşama 1 kuruluysa veri korunur.
- [ ] Değişiklikler GitHub klonuna kopyalanıp push edilmeli (bu klasörde `.git`
      yok, canlıya çıkış Vercel'in otomatik deploy'una bağlı).
- [ ] Girişli uçtan uca deneme: öğrenci ekle → gün işaretle → ödeme gir.
