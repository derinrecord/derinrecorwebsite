# Şube Sunum Ekranı — Uygulama Planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Her şubenin kendi linki ve kodu, müşteri sunumu görünümündeki tek ekranı açsın; cihaz kilidi, sızıntı kaydı/Telegram alarmı, yayın saatleri, canlı durum ve geçmiş bugünkü gibi çalışsın; ayrı kafe oynatıcı ve marka sunum linki kalksın.

**Architecture:** Güvenlik ve yayın motoru yeniden yazılmaz: `radyo.js` motoru olduğu gibi kullanılır (testleri `tests/radio-device-lock.test.js` ile korunuyor). Yeni sayfa `sunum.html`, motorun beklediği DOM kimliklerini (`brand`, `branch`, `now`, `folder`, `cover`, `playlist`, `start`, `state`, `tani`, `hours`, `kod-kap`, `kod-gir`, `liste-kap`, `liste-sec`, `audio`) sunum tasarımı (`marka-sunum.css` dili) içinde sunar. Link `/coffee/s/<anahtar>` olur; motor anahtarı yoldan da okur. Son görevde motor `sube-yayin.js` adına taşınır, `radyo.html` ve `coffee-marka.js` silinir.

**Tech Stack:** Vanilla HTML/CSS/JS (IIFE), Supabase JS 2.81.1 (CDN), Vercel rewrites/redirects, `node --test`.

**Spec:** `docs/superpowers/specs/2026-10-11-sube-sunum-design.md`

**Spec'ten sapma (gerekçeli):** Spec "motoru ortak modüle ayır" diyordu. Kafe oynatıcı zaten silineceği için iki tüketici olmayacak; modül ayırmak yerine motor yeni sayfaya taşınır (YAGNI, testler aynen kalır). Parça başı kapak/süre için DB fonksiyonu gerekmiyor: ilk sürümde listenin/klasörün kapağı (`cover_path`, motor zaten okuyor) gösterilir. Parça başı kapak istenirse ayrı iş, ayrı onay.

## Global Constraints

- Veritabanına DDL/DML yok; RLS, `config.js`, `chat-crypto.js`, auth akışına dokunulmaz.
- Motorun güvenlik davranışı (kod kapısı, cihaz kimliği, `radio_ping`, `radio_log_event`, mesai, abonelik) değişmez; yalnız anahtarın okunduğu yer genişler.
- Her JS dosyası IIFE; kullanıcı verisi DOM'a `safe()`/`esc()` ile.
- Değişen css/js linklerinde `?v=` artırılır.
- Panel düğme metinleri birebir: `YENİ LİNK ÜRET`, `YENİ KOD ÜRET`, `LİNKİ KOPYALA`, `KODU KOPYALA`, `DAVETİ KOPYALA`.
- Yeni link biçimi: `<siteRoot>coffee/s/<uuid>`.
- Her görev ayrı dal (`sube-sunum/1-...` vb.), main'e push yok; Derin "canlıya al" demeden yayına çıkmaz.
- Silme (Görev 5) yalnız Derin yeni ekranı deneyip "canlıya al" dedikten sonra.
- `node --test tests/*.test.js` her görev sonunda tamamen yeşil.

## Review Focus

1. Eski biçimdeki link (`radyo.html?key=…`) açık kalan bir cihazda: Görev 5'e kadar çalışmaya devam etmeli; Görev 5 sonrası yeni adrese yönlenmeli, kilit/kod tekrar sorulmamalı (cihaz kimliği aynı origin'de `localStorage`'da) → Görev 5 testi.
2. `/coffee/s/` altında uuid olmayan/bozuk anahtar: motor bugünkü "anahtar-yok / link tanınmadı" ekranını göstermeli, çökmemeli → Görev 2 testi.
3. YENİ LİNK ÜRET sonrası eski link: sunucu anahtarı tanımaz → "link tanınmadı"; yeni link ilk cihaza kilitlenir (kilit alanları boşaltıldı) → Görev 1 testi (güncelleme alanları).
4. Telefonda (390px) kod kapısı ve başlat düğmesi: dokunma alanı ≥ 40px, yatay kaydırma yok → Görev 2 ölçü testi.
5. `/coffee/<slug>` marka linkini hâlâ bilen biri: kod sormadan "bu link artık kullanılmıyor" görmeli, katalog okunmamalı → Görev 4 testi.

---

### Task 1: Panel — YENİ LİNK ÜRET ve YENİ KOD ÜRET

**Files:**
- Modify: `radyo-panel-views.js` (ŞUBE LİNKİ / ŞUBE KODU blokları, ~2737-2768)
- Modify: `radyo-yonetim.js` (`handle` içinde yeni `player-link-yenile` vakası; `player-kod-yenile` onay metinleri)
- Modify: `radyo-yonetim.html` (`?v=` artırımı)
- Test: `tests/sube-link-yenile.test.js`

**Interfaces:**
- Produces: `data-act="player-link-yenile"` düğmesi; `V.linkYenileAlanlari(uuid) -> {player_key, bound_device_id:null, bound_at:null, first_ip:null, last_ip:null, last_ip_at:null}` (`radyo-panel-views.js`, export edilir).

- [ ] **Step 1: Failing test** — `tests/sube-link-yenile.test.js`:
  - `şube çekmecesinde YENİ LİNK ÜRET düğmesi her zaman var`: `V.subeCekmecesi(id, D, ui)` HTML'i `data-act="player-link-yenile"` ve metin `YENİ LİNK ÜRET` içerir (kilitli ve kilitsiz şube için ayrı ayrı).
  - `kod düğmesinin adı YENİ KOD ÜRET`: kodlu şubede `YENİ KOD ÜRET` var, `KODU YENİLE` düğme metni yok.
  - `yeni link kilidi de sıfırlar`: `V.linkYenileAlanlari('u-1')` derin eşit `{player_key:'u-1', bound_device_id:null, bound_at:null, first_ip:null, last_ip:null, last_ip_at:null}`.
  - `yönetim yeni link vakasını yazar`: `radyo-yonetim.js` kaynağı `case 'player-link-yenile'` ve `V.linkYenileAlanlari(crypto.randomUUID())` içerir.
- [ ] **Step 2:** `node --test tests/sube-link-yenile.test.js` → FAIL.
- [ ] **Step 3:** `V.linkYenileAlanlari` ekle; ŞUBE LİNKİ satırına `YENİ LİNK ÜRET` (`btn sm`) ekle; `KODU YENİLE` → `YENİ KOD ÜRET` (bilgi metnindeki `<b>KODU YENİLE</b>` de). `player-link-yenile`: `kullanici.adminMi` şartı, `onaySor({baslik:'Yeni link üretilsin mi?', govde:'“<şube>” için rastgele yeni bir link üretilir. Eski link hemen çalışmaz olur ve cihaz kilidi sıfırlanır; yeni linki şubeye iletin.', onayMetni:'YENİ LİNK ÜRET'})`, `yazDogrula(update(V.linkYenileAlanlari(crypto.randomUUID())))`, `yenile(false)`, `bildir('Yeni link üretildi; LİNKİ KOPYALA ile şubeye iletin.')`. Mevcut `tip==='anahtar'` onarım yolu da aynı alanları kullansın.
- [ ] **Step 4:** Tüm testler: `node --test tests/*.test.js` → PASS (eski `KODU YENİLE` beklentisi olan testler yeni metne güncellenir).
- [ ] **Step 5:** Önizleme (`node tests/onizleme-olustur.js sube`) 390/1280 ekran görüntüsü; commit + dal push.

### Task 2: Şube sunum sayfası (`sunum.html`) ve yoldan anahtar okuma

**Files:**
- Create: `sunum.html` (sunum tasarımı; motorun DOM kimlikleri)
- Create: `sube-sunum.css` (yalnız bu sayfanın düzeni; `marka-sunum.css` değişkenlerini/dilini izler)
- Modify: `radyo.js:4-5` (anahtar okuma)
- Modify: `vercel.json` (rewrite, `/coffee/:slug`'dan ÖNCE)
- Test: `tests/sube-sunum.test.js`; mevcut `tests/radio-device-lock.test.js` dokunulmadan geçmeli

**Interfaces:**
- Produces: `/coffee/s/:key` → `/sunum.html`; motor `key` = `?key=` ya da yol `/coffee/s/<uuid>`.

- [ ] **Step 1: Failing tests** — `tests/sube-sunum.test.js`:
  - `motor anahtarı yoldan okur`: radyo.js'i `radio-device-lock.test.js`'teki vm düzeniyle `location = {pathname:'/coffee/s/a1b2c3d4-e5f6-4a7b-8c9d-0000000000aa', search:''}` ile çalıştır; ilk `radio_ping` çağrısının `p_player_key`'i bu uuid.
  - `bozuk anahtar çökmez`: `pathname:'/coffee/s/abc'` → `state`/`tani` "anahtar" teşhisini yazar, istisna yok.
  - `sunum.html motorun bütün kimliklerini taşır`: yukarıdaki 15 kimliğin her biri `id="..."` olarak var; `radyo.js?v=` ve `r2-depo.js`, `radio-playlist-queue.js`, supabase 2.81.1 yükleniyor; `<meta name="referrer" content="no-referrer">` ve `noindex` var.
  - `rewrite sırası`: `vercel.json` rewrites'ta `/coffee/s/:key` girdisi `/coffee/:slug`'dan önce.
  - `dokunma alanları`: `sube-sunum.css`'te `#start`, `#kod-gonder`, `#kod-gir`, `#liste-sec` için `min-height` ≥ 44px.
- [ ] **Step 2:** Çalıştır → FAIL.
- [ ] **Step 3:** `radyo.js`: `const key = url.get('key') || ((location.pathname.match(/\/coffee\/s\/([^/?#]+)/) || [])[1] || null);` (doğrulamayı mevcut `gecerliAnahtar` yapar). `sunum.html`: `radyo.html`'in güvenlik meta'ları + sunum düzeni (üstte marka adı `#brand`/şube `#branch`, solda büyük kapak `#cover` + "ŞİMDİ ÇALIYOR" `#now`/`#folder`, sağda liste `#playlist`, altta `#start`, `#state`, `#hours`, `#liste-kap`, kod kapısı `#kod-kap`). Görsel dil `marka-sunum.css` ile aynı (renkler, kaset filigranı, `mk-` sınıflarının karşılıkları `sube-sunum.css`'te). `vercel.json` rewrite ekle.
- [ ] **Step 4:** `node --test tests/*.test.js` → PASS.
- [ ] **Step 5:** `tests/onizleme-olustur.js`'e `sunum` senaryosu (motor sahte sunucuyla çalan/kod kapısı/kilitli hâller); 390 ve 1280 ekran görüntüleri; commit + push.

### Task 3: Panel linkleri yeni adrese

**Files:**
- Modify: `radyo-yonetim.js:90` (`playerBase`)
- Modify: `radyo-panel-prova.html`, `qr-davet-prova.html`, `tests/onizleme-olustur.js` (link biçimi)
- Test: `tests/radio-panel-views.test.js` beklentileri, `tests/sube-link-yenile.test.js`'e bir ek

**Interfaces:**
- Consumes: Görev 2'nin `/coffee/s/:key` yolu.
- Produces: `ui.playerBase() === siteRoot() + 'coffee/s/'`.

- [ ] **Step 1: Failing test** — `yönetim linki yeni biçimde`: `radyo-yonetim.js` kaynağı `playerBase: () => siteRoot() + 'coffee/s/'` içerir, `'radyo.html?key='` içermez. Kiosk linki (`player-kiosk`) `?kiosk=1` ekini yeni biçimde de doğru ekler (`.../coffee/s/<uuid>?kiosk=1`).
- [ ] **Step 2:** FAIL. **Step 3:** değiştir; testlerdeki `radyo.html?key=` örnek linklerini `coffee/s/` biçimine çevir. **Step 4:** PASS. **Step 5:** commit + push.

### Task 4: Marka sunum linkini emekliye ayır

**Files:**
- Modify: `radyo-panel-views.js` ("MÜŞTERİ SUNUMU — LİNK VE ERİŞİM KODU" panelini kaldır)
- Modify: `radyo-yonetim.js` (`brand-slug-set`, `brand-code-set` vakaları ve `ui.brandUrl` kaldırılır)
- Modify: `coffee-marka.html` → sabit "Bu link artık kullanılmıyor. Şubenize iletilen linki kullanın; yoksa Derin Record ile iletişime geçin." sayfası; `coffee-marka.js` artık yüklenmez
- Test: `tests/coffee-marka.test.js`, `tests/marka-sunum-olculer.test.js` yeni duruma göre; `tests/marka-emekli.test.js`

- [ ] **Step 1: Failing test** — `tests/marka-emekli.test.js`:
  - `marka çekmecesinde sunum linki bölümü yok`: marka görünümü HTML'i `MÜŞTERİ SUNUMU — LİNK VE ERİŞİM KODU`, `brand-slug`, `brand-code` içermez.
  - `eski marka linki katalog okumaz`: `coffee-marka.html` `coffee-marka.js` ve supabase betiğini yüklemez; "artık kullanılmıyor" metnini içerir.
- [ ] **Step 2:** FAIL. **Step 3:** uygula. `coffee-marka.test.js` / `marka-sunum-olculer.test.js`: `coffee-marka.js`'e bağlı testler bu görevde Görev 5'e kadar dosya yerinde durduğu için geçmeye devam eder; yalnız sayfa (`coffee-marka.html`) beklentileri güncellenir. **Step 4:** PASS. **Step 5:** commit + push. (Not: açık dallar `origin/sunum-telefon`, `origin/sunum-hiza`, `origin/arayuz/2026-10-11-sunum` `coffee-marka.*`'ya dokunuyor; bu görev onları geçersiz kılar — Derin'e "bu dallar artık gereksiz" diye bildirilir, dallara push yapılmaz.)

### Task 5: Kafe oynatıcıyı sil (yalnız Derin yeni ekranı deneyip "canlıya al" dedikten sonra)

**Files:**
- Rename: `radyo.js` → `sube-yayin.js` (`git mv`); `sunum.html` betik yolu `sube-yayin.js?v=1`
- Delete: `radyo.html`, `coffee-marka.js`, `radyo-cihaz-prova.html`'deki `radyo.html` bağımlılığı varsa güncellenir
- Modify: `vercel.json` (`/radyo.html?key=` → `/coffee/s/:key` kalıcı yönlendirme)
- Modify: testler (`radio-device-lock.test.js`, `onizleme-olustur.js` → `sube-yayin.js` / `sunum.html`); `coffee-marka.js`'i okuyan testler kaldırılır
- Modify: `CLAUDE.md` mimari satırları
- Test: `tests/sube-sunum.test.js`'e ekler

- [ ] **Step 1: Failing test** — `eski kafe linki yönlenir`: `vercel.json` `redirects` içinde `source:'/radyo.html'`, `has:[{type:'query', key:'key', value:'(?<k>.*)'}]`, `destination:'/coffee/s/:k'`, `permanent:true`. `radyo.html` ve `coffee-marka.js` dosyaları yok. Hiçbir `.html`/`.js` (testler hariç) `radyo.js` ya da `radyo.html` adını anmıyor.
- [ ] **Step 2:** FAIL. **Step 3:** taşı/sil/yönlendir. **Step 4:** `node --test tests/*.test.js` → PASS. **Step 5:** commit + push; Derin "canlıya al" derse main'e al, Vercel production READY doğrula, `/coffee/s/<chemex-şube-anahtarı>` ve eski `radyo.html?key=` adresini canlıda aç (kod kapısı görünmeli).

**Kapsam dışı (ayrı iş):** Arayüz ajanının zamanlanmış görevindeki dosya adları (`radyo.html`, `coffee-marka.*`) Görev 5 sonrası güncellenmeli — koordinatör işi, Derin'e sorulur.
