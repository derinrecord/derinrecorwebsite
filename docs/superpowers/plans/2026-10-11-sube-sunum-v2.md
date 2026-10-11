# Şube Sunum Ekranı v2 — Uygulama Planı (mevcut sunum görünümü korunur)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Mevcut müşteri sunumu ekranı (`coffee-marka.*`) birebir korunarak şube linki + şube koduyla açılsın ve kafe oynatıcının güvenlik/yayın işlerini (cihaz kilidi, kod kapısı, canlı durum, geçmiş, çalan parça, yayın saatleri, abonelik, anons) üstlensin.

**Architecture:** Görünüm kodu (`coffee-marka.js` çizim/oynatma kısmı, `marka-sunum.css`) değişmez. Veri kaynağı marka slug/kodundan şube anahtarı/cihaz kimliğine geçer (yeni okuma fonksiyonları). Güvenlik işleri yeni küçük `sube-guvenlik.js` modülünde; `coffee-marka.js` onu çağırır.

**Tech Stack:** Vanilla JS (IIFE), Supabase JS 2.81.1, Postgres SQL fonksiyonları (security definer, yalnız okuma), Vercel rewrites, `node --test`.

**Spec:** `docs/superpowers/specs/2026-10-11-sube-sunum-design.md` — "REVİZYON 2026-10-11" bölümü geçerlidir.

**Önceki plandan kalanlar (dokunulmaz):** v1 Görev 1 (YENİ LİNK ÜRET / YENİ KOD ÜRET), Görev 3 (panel linki `coffee/s/`), Görev 4'ün panel kısmı (marka sunum linki bölümünün kaldırılması).

## Global Constraints
- Sunum görünümü (düzen, yazılar, düğmeler, `marka-sunum.css`) değişmez; ekran görüntüsü bugünkü `/coffee/<slug>` sunumuyla aynı olmalı.
- Veritabanına yalnız `supabase/sube-sunum.sql` (3 okuma fonksiyonu + `grant execute ... to anon`); Derin onaylamadan çalıştırılmaz. Tablo/RLS/veri değişikliği yok. `config.js`, `chat-crypto.js` yok.
- Sunucu tarafı güvenlik fonksiyonları (`radio_ping`, `radio_log_event`, `radio_now_report`, `radio_cihaz_uygun`, `abonelik_gecerli`, Telegram tetikleyicisi) değişmez; yalnız çağrılır.
- Cihaz kimliği `localStorage['derin_record_device_id']`, şube kodu `localStorage['derin_record_kod_' + anahtar]` — kafe oynatıcıyla aynı anahtarlar.
- Her JS IIFE; kullanıcı verisi `safe()` ile; değişen js/css linklerinde `?v=` artır.
- Silme (Görev 5) yalnız Derin "canlıya al" + yeni ekranı denedikten sonra.
- `node --test tests/*.test.js` her görev sonunda yeşil.

## Review Focus
1. Kafede zaten kilitli cihaz yeni linki açtığında kod SORULMAMALI (aynı cihaz kimliği) → Görev 3 testi.
2. Başka cihazda açılan link: sunum hiç açılmamalı, "Bu link başka bir cihaza bağlı" yazmalı; liste verisi okunmamalı → Görev 3 + Görev 2 (SQL kapısı) testleri.
3. Yanlış kod: hata yazısı, form açık kalır, ikinci denemede doğru kod çalışır → Görev 3.
4. Yayın saati dışı: çalma durur, "Yayın saatleri dışında" yazar; içerik görünür kalabilir → Görev 4.
5. Abonelik bitmiş / marka pasif: sunum açılmaz, "Yayın şu an kapalı. Derin Record ile iletişime geçin." → Görev 4.

---

### Task 1: Yanlış denemeyi geri al, sunumu şube adresine bağla
**Files:** Delete (git rm, canlıya hiç çıkmadı): `sunum.html`, `sube-sunum.css`, `tests/sube-sunum.test.js`. Restore from `origin/main`: `coffee-marka.html`, `radyo.js`, `tests/coffee-marka.test.js`, `tests/radio-management-render.test.js` (yalnız v1-Görev-4'ün coffee-marka.js?v= satırını geri getir; Görev 4'ün panel kısmına dokunma), `tests/marka-emekli.test.js` içindeki "eski marka linki" testini kaldır (panel testleri kalsın). Modify: `vercel.json`.
- [ ] Test (`tests/sube-adres.test.js`): vercel.json rewrites'ta `{source:'/coffee/s/:key', destination:'/coffee-marka.html'}` var ve `/coffee/:slug`'dan önce; `sunum.html` yok; `coffee-marka.html` `coffee-marka.js?v=` yüklüyor.
- [ ] FAIL → uygula → `node --test tests/*.test.js` PASS → commit.

### Task 2: Okuma fonksiyonları (SQL dosyası; çalıştırma ayrı onayla)
**Files:** Create `supabase/sube-sunum.sql`; Test `tests/sube-sunum-sql.test.js`.
**Interfaces (Produces):**
- `sube_sunum_marka(p_player_key uuid, p_device_id text default null) returns table(brand_id uuid, name text, player_label text, tagline text, accent_color text, roast_profile text, tasting_notes text[], open_time time, close_time time)`
- `sube_sunum_liste(p_player_key uuid, p_device_id text default null) returns table(playlist_id uuid, name text, cover_path text, created_at timestamptz, track_id uuid, title text, storage_path text, track_cover text, duration_sec integer, sort_order integer)` — şubeye `player_playlists` ataması varsa onlar (`pp.sort_order` sırası), yoksa markanın tüm listeleri (`bp.created_at` sırası); parça sırası `coalesce(bpt.sort_order, t.sort_order, 0)`.
- `sube_sunum_kapak(p_player_key uuid, p_device_id text default null) returns text` (brands.cover_path).
- Hepsinde kapı: `b.is_active and public.abonelik_gecerli(b.id) and public.radio_cihaz_uygun(p_player_key, p_device_id)`; `language sql stable security definer set search_path = public`; sonda `grant execute on function ... to anon, authenticated`.
- `open_time/close_time` kaynağı: `radio_now_playing`'in kullandığı sütunlar (`brand_players` üstünde; dosyayı yazmadan önce `supabase/radio-baglanti-korumasi.sql` içindeki radio_now_playing'den doğrula).
- [ ] Test: dosya 3 fonksiyonu tanımlar; her fonksiyon gövdesinde `radio_cihaz_uygun(p_player_key, p_device_id)` ve `abonelik_gecerli` geçer; `insert|update|delete|alter table|drop|policy` yok; `grant execute` var.
- [ ] FAIL → yaz → PASS → commit. **Çalıştırma:** kontrolcü Derin'e gösterir; onaydan sonra `apply_migration` ile çalıştırır ve `select` ile sınar.

### Task 3: `sube-guvenlik.js` — kod kapısı, cihaz kilidi, canlı durum
**Files:** Create `sube-guvenlik.js`; Test `tests/sube-guvenlik.test.js` (vm + sahte supabase; `tests/radio-device-lock.test.js` düzenini örnek al).
**Interfaces (Produces):** `window.DerinSubeGuvenlik = { anahtarOku(location) -> string|null, cihazKimligi() -> string, kayitliKod(anahtar) -> string, baglan({client, anahtar, kod}) -> Promise<{durum:'tamam'|'kod-gerekli'|'kod-yanlis'|'kilitli'|'tanınmadı'|'baglanti', mesaj:string}>, nabizBaslat({client, anahtar, calarMi: () => boolean}) -> stop(), olay({client, anahtar}, kind, detail), calaniBildir({client, anahtar}, {title, track_id, playlist_id, playlist_name}) }`.
- `anahtarOku`: `/coffee/s/<uuid>` yolundan; uuid değilse null.
- `baglan`: `radio_ping({p_player_key, p_device_id, p_playing:false, p_kod})`; `reason` eşlemesi `radyo.js`'teki `ping()`/`koduDene()` ile aynı (o fonksiyonları oku, aynı reason değerlerini kullan). `tamam` ise kodu `localStorage`'a yazar; `kod-yanlis` ise siler.
- `nabizBaslat`: 60 sn'de bir `radio_ping(p_playing)`; `kilitli` dönerse `olay('kilitlendi')` ve `window.dispatchEvent(new CustomEvent('derin:sube-kapandi',{detail:{sebep}}))`.
- Mesajlar (birebir): kod-gerekli `Şube kodunu girin.` · kod-yanlis `Kod doğru değil.` · kilitli `Bu link başka bir cihaza bağlı. Derin Record ile iletişime geçin.` · tanınmadı `Bu link tanınmadı.` · baglanti `Bağlantı kurulamadı, tekrar deneniyor…`.
- [ ] Testler: yoldan anahtar; bozuk anahtar null; kayıtlı cihaz kimliği yeniden üretilmez; doğru kod → tamam + saklanır; yanlış kod → kod-yanlis + silinir; kilitli → kilitli; ping'e `p_device_id` her zaman gider; nabızda kilitli → olay + event.
- [ ] FAIL → uygula → PASS → commit.

### Task 4: `coffee-marka.js` şube moduna geçer
**Files:** Modify `coffee-marka.js` (yalnız açılış/veri/olay bağlantıları — `ciz`, `listeCiz`, oynatma, fade, dock kodu değişmez), `coffee-marka.html` (kilit kartı yazıları: eyebrow `ŞUBE YAYINI`, başlık `Bu yayın şubenize özeldir.`, açıklama `Size iletilen şube kodunu girin. Kod bu cihazda bir kez sorulur.`, input placeholder `ŞUBE KODU`, düğme `YAYINI AÇ`; `sube-guvenlik.js?v=1` yüklenir; `coffee-marka.js?v=` artar; `referrer no-referrer` ve `robots noindex` meta), Tests `tests/coffee-marka.test.js` güncellenir, `tests/sube-sunum-akis.test.js` yeni.
- Açılış: `anahtarOku` → null ise kilit kartında `Bu link tanınmadı.`; kayıtlı kod varsa otomatik `baglan`; `tamam` → `sube_sunum_marka/kapak/liste` (p_device_id ile) → mevcut `ciz(brand, listeler)`; boş marka sonucu → `Yayın şu an kapalı. Derin Record ile iletişime geçin.`
- Olaylar: ilk çalışta `olay('caliyor', başlık · liste)`, duraklatmada `olay('durakladi','cihaz')`, devamda `olay('devam')`; her parça değişiminde `calaniBildir`; nabız `calarMi = () => !audio.paused`; `derin:sube-kapandi` → ses durur, kilit kartı mesajla geri gelir.
- Yayın saatleri: `open_time/close_time` doluysa dakikada bir kontrol; dışarıdaysa ses durur, `durum('Yayın saatleri dışında.')`, `olay('mesai','disi')`; içeri girince çalmaya kendiliğinden başlamaz (personel oynat'a basar).
- Anonslar: 15 sn'de bir `radio_anonslar(p_player_key, p_since, p_device_id)`; gelirse müzik fade ile kısılır, anons çalar, müzik geri açılır (`radyo.js` `playAnnouncement` mantığı).
- `coffee_brand_auth/coffee_brand_liste/coffee_brand_kapak` çağrıları ve `sessionStorage 'br-'` kaldırılır.
- [ ] Testler: kaynak `coffee_brand_auth` içermez; `sube_sunum_liste` `p_device_id` ile çağrılır; vm akışı: kayıtlı kod + tamam → `ciz` çalışır (`#mk-app` görünür); kilitli → kart + mesaj; mesai dışı → ses duraklatılır. `marka-sunum-olculer.test.js` dokunulmadan geçer.
- [ ] FAIL → uygula → PASS → 390/1280 ekran görüntüsü (sahte veriyle; bugünkü sunumla yan yana) → commit.

### Task 5: Kafe oynatıcıyı sil (yalnız Derin "canlıya al" + deneme sonrası)
`git rm radyo.html radyo.js radyo-cihaz-prova.html tests/radio-device-lock.test.js` (yerini `sube-guvenlik.test.js` aldı); `vercel.json` redirect `/radyo.html?key=<k>` → `/coffee/s/<k>` (permanent); `tests/onizleme-olustur.js` radyo.js referansları kaldırılır; `CLAUDE.md` mimari güncellenir. Test: dosyalar yok, redirect var, hiçbir html/js `radyo.js`/`radyo.html` anmıyor.
