# Uygulama 1. aşama: Android deneme paketi — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Derin'in Android telefonuna kurabileceği, derinrecord.com'u uygulama olarak açan bir deneme paketi (APK); uygulamada yönetici sayfalarından yalnız Radyo Yönetimi görünür.

**Architecture:** Capacitor kabuğu `app/` klasöründe; kabuk canlı siteyi (`https://derinrecord.com`) açar ve tarayıcı kimliğine `DerinRecordApp/1` ekler. Site bu imzayı `uygulama.js` ile tanır (`window.DerinApp`, `<html class="uygulama">`) ve menüyü buna göre süzer. APK, GitHub Actions'ta derlenir (bu çalışma ortamından Google/Gradle/Maven indirmeleri politika gereği kapalı — 31 Ekim'de 403 ile doğrulandı).

**Tech Stack:** Vanilla JS (IIFE + `window.Derin*`), node:test, Capacitor 6 (`@capacitor/core`, `@capacitor/cli`, `@capacitor/android`), GitHub Actions (ubuntu, JDK 17, Node 20).

**Spec:** `docs/superpowers/specs/2026-10-31-derin-record-app-design.md`

**Bu plan spec'in yalnız 1. çalışma adımını kapsar.** Sonraki planlar (ayrı belgeler): (2) uygulamaya özel parçalar — kilit ekranı, internetsiz açılış, bildirim, hesap silme, mekân girişi, ekran koruması; (3) sitede zorlaştırmalar; (4) iPhone; (5) mağaza hazırlığı ve gönderim.

## Global Constraints

- config.js'e secret/service_role girmez; RLS değişikliği gerekçe + onay ister.
- Siteye dokunan her değişiklik: önizleme (telefon 390 + bilgisayar 1280) → "canlıya al".
- Mağazaya hiçbir şey Derin "tamam" demeden gitmez.
- Her JS dosyası IIFE; paylaşım `window.Derin*`; dosya adları Türkçe kebab-case; `?v=N` önbellek kırma.
- Uygulama kimliği: `com.derinrecord.app`; görünen ad: `Derin Record`.
- Kullanıcı arayüzü metinleri sade Türkçe.

## Review Focus

1. Uygulamada siteden dışarı giden bağlantılar (WhatsApp, Instagram, mailto) uygulama içinde değil, telefonun kendi uygulamasında açılmalı — yoksa kullanıcı geri dönemez.
2. Telefonun geri tuşu: önce sayfada geri gitmeli, ana sayfadaysa uygulamadan çıkmalı; hiç geri gitmemesi ya da beyaz ekran olmamalı.
3. Yönetici olmayan kullanıcı adres yazarak `radyo-yonetim.html`'ye gelirse: sayfa zaten RLS + rol kontrolüyle boş kalır; uygulama menüsü ona bağlantı göstermemeli.
4. Normal tarayıcıda (uygulama dışı) hiçbir şey değişmemeli: `uygulama` sınıfı yok, menü aynı.
5. İnternet yokken uygulama ilk açılışta boş beyaz ekran yerine anlaşılır bir mesaj göstermeli (asıl internetsiz açılış 2. planda; burada en az hata sayfası).

---

### Task 1: Site uygulamayı tanır (`uygulama.js`)

**Files:**
- Create: `uygulama.js`
- Modify: tüm `*.html` sayfalarında `auth.js`'ten ÖNCE `<script src="uygulama.js?v=1"></script>` (head içinde, eşzamanlı)
- Test: `tests/uygulama.test.js`

**Interfaces:**
- Produces: `window.DerinApp = { uygulamada: boolean, platform: 'android' | 'ios' | null }`; uygulamadaysa `document.documentElement.classList` içinde `uygulama` ve `uygulama-android|uygulama-ios`. Saf fonksiyon: `DerinApp.tani(ajan: string) -> { uygulamada, platform }` (Node'da `module.exports`).

- [ ] **Step 1: Failing test**
```js
const A = require('../uygulama.js');
test('uygulama imzası tanınır', () => {
  assert.deepEqual(A.tani('Mozilla/5.0 (Linux; Android 14) Chrome/120 DerinRecordApp/1'), { uygulamada: true, platform: 'android' });
  assert.deepEqual(A.tani('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) DerinRecordApp/1'), { uygulamada: true, platform: 'ios' });
  assert.deepEqual(A.tani('Mozilla/5.0 (Linux; Android 14) Chrome/120'), { uygulamada: false, platform: null });
  assert.deepEqual(A.tani(''), { uygulamada: false, platform: null });
});
test('her sayfa uygulama.js\'i auth.js\'ten önce yükler', () => {
  for (const f of fs.readdirSync(KOK).filter(f => f.endsWith('.html') && !f.endsWith('-prova.html'))) {
    const s = oku(f); if (!s.includes('auth.js')) continue;
    assert.ok(s.indexOf('uygulama.js') > -1 && s.indexOf('uygulama.js') < s.indexOf('auth.js'), f);
  }
});
```
- [ ] **Step 2:** `node --test tests/uygulama.test.js` → FAIL (`Cannot find module '../uygulama.js'`).
- [ ] **Step 3:** `uygulama.js` yaz; imza `/DerinRecordApp\/\d+/`; platform `iPhone|iPad` → ios, `Android` → android. Sayfalara script etiketini ekle.
- [ ] **Step 4:** `node --test tests/*.test.js` → hepsi PASS.
- [ ] **Step 5:** Commit `Uygulama: site uygulama içinde açıldığını tanır`.

### Task 2: Uygulamada menü süzülür

**Files:**
- Modify: `auth.js:77` (yönetici menü bağlantıları)
- Test: `tests/uygulama.test.js`

**Interfaces:**
- Consumes: `window.DerinApp.uygulamada`
- Produces: `auth.js` içinde saf `menuBaglantilari(rol: string|null, uygulamada: boolean) -> string[]` (href listesi), `window.DerinAuth.menuBaglantilari` olarak da erişilir; HTML bu listeden üretilir.

- [ ] **Step 1: Failing test** (auth.js tarayıcı kodu olduğundan fonksiyon metni `vm` ile çıkarılıp çalıştırılır; yöntem tests/ içindeki mevcut örneklere uyar)
```js
test('uygulamada yönetici yalnız radyo yönetimini görür', () => {
  const m = menuBaglantilari('admin', true);
  assert.ok(m.includes('radyo-yonetim.html'));
  for (const h of ['kullanicilar.html','bildirimler.html','taleplerim.html','ajanlar.html','harmonic-mixer.html','mp3-donusturucu.html','chat.html']) assert.ok(!m.includes(h), h);
  assert.ok(m.includes('profilim.html') && m.includes('my-projects.html'));
});
test('tarayıcıda menü değişmez', () => {
  assert.deepEqual(menuBaglantilari('admin', false), ['profilim.html','kullanicilar.html','bildirimler.html','taleplerim.html','radyo-yonetim.html','ajanlar.html','harmonic-mixer.html','music-request.html','mp3-donusturucu.html','my-projects.html','energy-map.html','license.html']);
});
test('antrenör uygulamada radyo görmez', () => {
  assert.ok(!menuBaglantilari('coach', true).includes('radyo-yonetim.html'));
});
```
- [ ] **Step 2:** Çalıştır → FAIL (`menuBaglantilari is not defined`).
- [ ] **Step 3:** `menuBaglantilari`'ı yaz, `auth.js:77`'deki sabit HTML'yi bu listeden üret (etiketler ve `.bildirim-sayac` aynı kalır); `auth.js?v=` artır.
- [ ] **Step 4:** Tüm testler PASS.
- [ ] **Step 5:** Commit `Uygulama: menüde yönetici sayfalarından yalnız radyo`.

### Task 3: Capacitor kabuğu (`app/`)

**Files:**
- Create: `app/package.json` (bağımlılıklar: `@capacitor/core`, `@capacitor/cli`, `@capacitor/android` — 6.x sabit sürüm), `app/capacitor.config.json`, `app/www/index.html` (internet yokken görünen sade sayfa: logo + "İnternet bağlantısı yok. Bağlanınca yeniden dene." + YENİDEN DENE düğmesi)
- Modify: `.vercelignore` (`app/` ekle)
- Test: `tests/uygulama-kabuk.test.js`

**Interfaces:**
- Produces: `capacitor.config.json` alanları — `appId: "com.derinrecord.app"`, `appName: "Derin Record"`, `webDir: "www"`, `server.url: "https://derinrecord.com"`, `server.errorPath: "index.html"`, `android.appendUserAgent: "DerinRecordApp/1"`, `ios.appendUserAgent: "DerinRecordApp/1"`, `server.allowNavigation: ["derinrecord.com", "*.supabase.co"]`.

- [ ] **Step 1: Failing test**
```js
const c = JSON.parse(oku('app/capacitor.config.json'));
test('kabuk canlı siteyi açar ve kendini tanıtır', () => {
  assert.equal(c.appId, 'com.derinrecord.app');
  assert.equal(c.appName, 'Derin Record');
  assert.equal(c.server.url, 'https://derinrecord.com');
  assert.equal(c.android.appendUserAgent, 'DerinRecordApp/1');
  assert.equal(c.ios.appendUserAgent, 'DerinRecordApp/1');
  assert.ok(!JSON.stringify(c).includes('service_role'));
});
test('internetsiz sayfa var; app/ yayına girmez', () => {
  assert.match(oku('app/www/index.html'), /İnternet bağlantısı yok/);
  assert.match(oku('.vercelignore'), /^app\/$/m);
});
```
- [ ] **Step 2:** Çalıştır → FAIL (dosya yok).
- [ ] **Step 3:** Dosyaları yaz (signature'lar yukarıda). Dış bağlantılar (Review Focus 1) Capacitor'ın `allowNavigation` dışı adresleri sistem tarayıcısında açma davranışına bırakılır; Task 4'teki cihaz denemesinde doğrulanır.
- [ ] **Step 4:** Tüm testler PASS.
- [ ] **Step 5:** Commit `Uygulama: Capacitor kabuğu (app/)`.

### Task 4: APK'yı GitHub'da derle ve Derin'e gönder

**Files:**
- Create: `.github/workflows/android-deneme.yml`
- Test: `tests/uygulama-kabuk.test.js` (iş akışı dosyası denetimi)

**Interfaces:**
- Consumes: `app/` (Task 3)
- Produces: elle başlatılan (`workflow_dispatch`) iş; çıktı `derin-record-deneme.apk` adında GitHub artifact'ı.

- [ ] **Step 1: Failing test**
```js
test('android deneme iş akışı: elle başlar, apk üretir, gizli anahtar kullanmaz', () => {
  const y = oku('.github/workflows/android-deneme.yml');
  assert.match(y, /workflow_dispatch/);
  assert.match(y, /java-version: '17'/);
  assert.match(y, /npx cap add android/);
  assert.match(y, /assembleDebug/);
  assert.match(y, /derin-record-deneme\.apk/);
  assert.doesNotMatch(y, /secrets\./);
});
```
- [ ] **Step 2:** Çalıştır → FAIL.
- [ ] **Step 3:** İş akışı: checkout → setup-node 20 → setup-java 17 (temurin) → `cd app && npm install && npx cap add android && npx cap sync android` → `cd android && ./gradlew assembleDebug` → çıktıyı `derin-record-deneme.apk` adıyla upload-artifact. Simge: `icon-512.png`'den (bu planda Capacitor varsayılan simgesi kabul; asıl simge 5. planda).
- [ ] **Step 4:** Testler PASS; dalı it, `gh workflow run android-deneme.yml --ref <dal>`, `gh run watch` → başarılı; `gh run download` ile APK'yı al.
- [ ] **Step 5:** Commit `Uygulama: Android deneme paketi GitHub'da derlenir`.
- [ ] **Step 6:** APK'yı Derin'e gönder + kurulum adımları (sade Türkçe: "Bilinmeyen kaynaklardan yüklemeye izin ver" nerede). Derin'in denemesi: açılış ekranı, kasetler, demo çalma, HESABIM girişi, yönetici menüsünde yalnız RADYO YÖNETİMİ, geri tuşu (Review Focus 2), WhatsApp/Instagram bağlantısı (Review Focus 1), uçak modunda açılış (Review Focus 5).

**Not (site tarafı):** Task 1–2 siteye dokunur; uygulamanın onları görmesi için önizleme → "canlıya al" gerekir. Canlıya alınmadan önce APK yine çalışır, yalnız menü süzmesi görünmez.
