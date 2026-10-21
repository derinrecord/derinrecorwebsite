# Site Geneli Dil Ayarları Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Yan menüden erişilen Türkçe/English Ayarlar panelini oluşturmak ve bütün üretim sayfalarını eksiksiz iki dilli hâle getirmek.

**Architecture:** Mevcut `dil.js` tek dil motoru ve durum sahibi olarak kalır; `dil.css` ortak Ayarlar çekmecesini biçimlendirir. Sayfalar açık `data-i18n` anahtarları veya `data-dil-otomatik` sözlüğüyle çevrilir; kök HTML envanteri ve dinamik kullanıcı metinleri otomatik testlerle kapsanır.

**Tech Stack:** Vanilla HTML/CSS/JavaScript, Node.js `node:test`, mevcut `DerinDil` global API, `localStorage`

**Spec:** `docs/superpowers/specs/2026-10-21-site-geneli-dil-ayarlari-design.md`

## Global Constraints

- Kayıtlı tercih veya geçerli `?dil=` yoksa varsayılan dil Türkçedir.
- Tercih mevcut `derin-dil` anahtarında saklanır ve hesap oturumundan bağımsızdır.
- Yeni çeviri bağımlılığı eklenmez; `dil.js` tek motor olarak kalır.
- Şarkı, kişi, marka, kullanıcı ve veritabanı içerikleri çevrilmez.
- Çevrilen `<option>` metni gönderilen kaynak değeri değiştirmez.
- `tests/` ve `graphify-out/` dışındaki bütün kök HTML sayfaları denetlenir.
- Hukuki sayfalarda Türkçe kaynak sürüm bağlayıcı, İngilizce karşılık bilgilendirme amaçlıdır.
- GitHub güncellemesi ve canlı yayın ayrı doğrulanır.

## Review Focus

- `localStorage` hata verdiğinde açık sayfada dil değişimi çalışmaya devam etmeli; Task 2 runtime testi kapsar.
- `?dil=en` kayıtlı Türkçe tercihini o ziyaret için geçersiz kılmalı; Task 2 runtime testi kapsar.
- Çevrilen `<option>` gönderildiğinde Türkçe iş değeri korunmalı; Task 5 otomatik mod testi kapsar.
- Sonradan eklenen hata/başarı metinleri İngilizceye çevrilmeli; Task 5 MutationObserver testi kapsar.
- Dil değişimi giriş penceresi, hesap çekmecesi ve Ayarlar panelini birlikte güncellemeli; Task 3 testi kapsar.

---

### Task 1: Üretim Sayfası Envanterini Otomatikleştir

**Files:**
- Modify: `tests/dil-destegi.test.js`
- Test: `tests/dil-destegi.test.js`

**Interfaces:**
- Consumes: Git tarafından izlenen kök `*.html` dosyaları
- Produces: `URETIM_SAYFALARI`, `ANAHTARLI_SAYFALAR`, `OTOMATIK_SAYFALAR`

- [ ] **Step 1: Sabit listelerin yerine kök HTML envanterini kullanan başarısız testi yaz**

```js
const { execFileSync } = require('node:child_process');
const URETIM_SAYFALARI = execFileSync('git', ['ls-files', '*.html'], {
  cwd: KOK, encoding: 'utf8'
}).trim().split('\n').filter(Boolean).filter(dosya =>
  !dosya.startsWith('tests/') && !dosya.startsWith('graphify-out/')
);

test('bütün üretim sayfaları dil sözleşmesini taşır', () => {
  const eksik = URETIM_SAYFALARI.flatMap(sayfa => {
    const html = oku(sayfa); const hata = [];
    if (!/<html lang="tr"/.test(html)) hata.push('lang');
    if (!/data-baslik-en="[^"]+"/.test(html)) hata.push('data-baslik-en');
    if (!/<script src="dil\.js\?v=\d+" defer><\/script>/.test(html)) hata.push('dil.js');
    if (!/<link rel="stylesheet" href="dil\.css\?v=\d+"/.test(html)) hata.push('dil.css');
    if (!/data-dil-otomatik|data-i18n=/.test(html)) hata.push('çeviri modu');
    return hata.map(ad => `${sayfa} → ${ad}`);
  });
  assert.deepEqual(eksik, []);
});
```

- [ ] **Step 2: Testi çalıştır ve mevcut açıkları doğrula**

Run: `node --test tests/dil-destegi.test.js`

Expected: FAIL; `chat.html`, `qr-davet-prova.html`, `radyo-panel-prova.html` ve `radyo.html` dahil eksikler dosya bazında görünür.

- [ ] **Step 3: Mevcut testleri türetilmiş listelere geçir**

```js
const OTOMATIK_SAYFALAR = URETIM_SAYFALARI.filter(s => /data-dil-otomatik/.test(oku(s)));
const ANAHTARLI_SAYFALAR = URETIM_SAYFALARI.filter(s => /data-i18n(?:=|-)/.test(oku(s)));
```

- [ ] **Step 4: Testin yalnız gerçek sayfa açıkları nedeniyle başarısız olduğunu doğrula**

Run: `node --test tests/dil-destegi.test.js`

Expected: Test kodu hatası yok; yalnız dil sözleşmesi eksikleri FAIL olur.

- [ ] **Step 5: Commit**

```bash
git add tests/dil-destegi.test.js
git commit -m "test: tüm üretim sayfalarını dil denetimine al"
```

### Task 2: Ortak Ayarlar Çekmecesini Oluştur

**Files:**
- Modify: `dil.js`
- Modify: `dil.css`
- Create: `tests/dil-ayarlar-runtime.test.js`

**Interfaces:**
- Consumes: `DerinDil.uygula(dil)`, `derin-dil`, `derin:dil`
- Produces: `DerinDil.ayarlariAc()`, `DerinDil.ayarlariKapat()`, `#dil-ayarlar-paneli`

- [ ] **Step 1: Runtime sözleşmesi için başarısız testleri yaz**

`node:vm` ve küçük fake DOM ile şu beklentileri sabitle:

```js
assert.equal(document.documentElement.lang, 'tr');
assert.equal(typeof window.DerinDil.ayarlariAc, 'function');
assert.equal(typeof window.DerinDil.ayarlariKapat, 'function');
assert.ok(document.querySelector('#dil-ayarlar-paneli'));
```

Ayrı testlerde `?dil=en`, localStorage hatası, English seçiminin saklanması, `derin:dil` olayı, Escape ile kapanma ve kapanınca odağın tetikleyiciye dönmesini doğrula.

- [ ] **Step 2: Testi çalıştır ve başarısızlığı doğrula**

Run: `node --test tests/dil-ayarlar-runtime.test.js`

Expected: FAIL; Ayarlar API'si ve panel yoktur, kayıtsız İngilizce tarayıcı mevcut kodda İngilizce açılır.

- [ ] **Step 3: Varsayılan dili ve panel API'sini uygula**

```js
function dilSec() {
  const parametre = new URLSearchParams(location.search).get('dil');
  if (/^(tr|en)$/.test(parametre)) return parametre;
  try {
    const kayitli = localStorage.getItem(DEPO) || '';
    if (/^(tr|en)$/.test(kayitli)) return kayitli;
  } catch (e) { /* geçici tercih */ }
  return 'tr';
}
```

Panel `role="dialog"`, `aria-modal`, başlık, kapat düğmesi, backdrop ve Türkçe/English radio grubu taşısın. Açılışta odağı seçili radioya al; Tab/Shift+Tab odağını panel içinde tut; Escape, backdrop ve kapat düğmesiyle kapanınca odağı son tetikleyiciye döndür. Seçimde localStorage yaz, `uygula(yeni)` çağır ve `derin:dil` yayınla. `window.DerinDil` içine `ayarlariAc`/`ayarlariKapat` ekle.

- [ ] **Step 4: Çekmece stillerini ekle**

`dil.css` içinde sağdan açılan panel, `[hidden]`, seçili dil, odak görünümü, `min(92vw, 340px)` mobil genişlik ve `prefers-reduced-motion` davranışını tanımla.

- [ ] **Step 5: Runtime testini çalıştır**

Run: `node --test tests/dil-ayarlar-runtime.test.js`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add dil.js dil.css tests/dil-ayarlar-runtime.test.js
git commit -m "feat: ortak dil ayarları çekmecesi ekle"
```

### Task 3: Ayarları Gezinme ve Hesap Menüsüne Bağla

**Files:**
- Modify: `dil.js`
- Modify: `auth.js`
- Modify: `dil.css`
- Modify: `tests/dil-ayarlar-runtime.test.js`
- Modify: `tests/dil-destegi.test.js`

**Interfaces:**
- Consumes: `DerinDil.ayarlariAc()`
- Produces: Genel gezinme ve `.account-menu-links` içinde aynı paneli açan tetikleyiciler

- [ ] **Step 1: İki erişim noktasını isteyen başarısız testleri yaz**

```js
assert.match(dilKaynagi, /className = 'dil-ayarlar-ac'/);
assert.match(authKaynagi, /data-settings/);
assert.match(authKaynagi, /DerinDil\.ayarlariAc/);
assert.match(authKaynagi, /shell\.ayarlar/);
```

Runtime testinde panel açıkken başlığın `AYARLAR` → `SETTINGS`, etiketin `DİL` → `LANGUAGE` olduğunu doğrula.

- [ ] **Step 2: Testleri çalıştır ve başarısızlığı doğrula**

Run: `node --test tests/dil-ayarlar-runtime.test.js tests/dil-destegi.test.js`

Expected: FAIL; gezinme ve hesap bağlantıları yoktur.

- [ ] **Step 3: Genel Ayarlar tetikleyicisini yerleştir**

Eski `.dil-dugme` yerine `.dil-ayarlar-ac` oluştur. Varsa `#nav`/header nav içine, yoksa wordmark yanına ekle. `aria-expanded` panel durumuyla eşleşsin.

- [ ] **Step 4: Hesap çekmecesine Ayarlar düğmesini ekle**

```html
<button class="account-menu-settings" type="button" data-settings>AYARLAR</button>
```

Tıklamada hesap menüsünü kapat ve `window.DerinDil?.ayarlariAc()` çağır. EN/TR sözlüklerine `shell.ayarlar`, `ayarlar.baslik`, `ayarlar.dil`, `ayarlar.turkce`, `ayarlar.ingilizce` ekle.

- [ ] **Step 5: Entegrasyon testlerini çalıştır**

Run: `node --test tests/dil-ayarlar-runtime.test.js tests/dil-destegi.test.js tests/bildirim-sayac.test.js tests/uyelik-onayi.test.js`

Expected: Ayarlar/auth testleri PASS; yalnız sayfa kapsamı açıkları kalabilir.

- [ ] **Step 6: Commit**

```bash
git add dil.js dil.css auth.js tests/dil-destegi.test.js tests/dil-ayarlar-runtime.test.js
git commit -m "feat: ayarları gezinme ve hesap menüsüne bağla"
```

### Task 4: Bütün Üretim Sayfalarına Dil Sözleşmesini Uygula

**Files:**
- Modify: Kök dizindeki bütün üretim `*.html` dosyaları
- Test: `tests/dil-destegi.test.js`

**Interfaces:**
- Consumes: Task 1 `URETIM_SAYFALARI`, `dil.js`, `dil.css`
- Produces: Her üretim sayfasında aynı dil başlatma sözleşmesi

- [ ] **Step 1: Eksiklerin tam listesini üret**

Run: `node --test tests/dil-destegi.test.js`

Expected: Her sayfa için eksik `lang`, `data-baslik-en`, mod, CSS veya JS ayrı raporlanır.

- [ ] **Step 2: Her sayfanın belge sözleşmesini düzelt**

Araç/portal sayfalarında:

```html
<html lang="tr" data-dil-otomatik data-baslik-en="English Title — Derin Record">
<link rel="stylesheet" href="dil.css?v=20261021">
```

Tanıtım sayfalarında `data-i18n` korunur; `lang`, İngilizce başlık ve CSS yine zorunludur.

Meta açıklaması bulunan sayfalarda kaynak `content` değerini koru ve İngilizce karşılığı `data-en` niteliğine ekle; Task 1 testinde bu eşleşmeyi de doğrula.

- [ ] **Step 3: Dil motorunu doğru sırada yükle**

```html
<script src="dil.js?v=20261021" defer></script>
```

`auth.js` ve kullanıcı metni üreten sayfa betiklerinden önce yerleştir.

- [ ] **Step 4: Sayfa, temizlik ve mobil testlerini çalıştır**

Run: `node --test tests/dil-destegi.test.js tests/site-temizlik.test.js tests/mobil-kullanilabilirlik.test.js`

Expected: Sayfa sözleşmesi, temizlik ve mobil testleri PASS; yalnız içerik çeviri açıkları kalabilir.

- [ ] **Step 5: Commit**

```bash
git add -- '*.html' tests/dil-destegi.test.js
git commit -m "feat: tüm üretim sayfalarını dil motoruna bağla"
```

### Task 5: Çeviri Kapsam Denetimini Güçlendir

**Files:**
- Create: `tests/dil-kapsami.test.js`
- Modify: `tests/dil-ayarlar-runtime.test.js`

**Interfaces:**
- Consumes: Üretim HTML'leri, `EN`, `METIN`, kullanıcı arayüzü JS dosyaları
- Produces: Dosya/metin bazında eksik çeviri raporu

- [ ] **Step 1: Görünür HTML metinlerini denetleyen başarısız testi yaz**

`script`, `style`, `template`, `code`, `pre`, `textarea` ve `[data-dil-yok]` alanlarını çıkar. Metin düğümleri ile `placeholder`, `aria-label`, `title`, `alt` değerlerini EN/METIN kapsamıyla karşılaştır:

```js
assert.deepEqual(eksik, [], eksik.map(x => `${x.dosya} → ${x.metin}`).join('\n'));
```

Marka/şarkı/URL/sayı değerleri açık `CEVIRME` allowlist'inde olabilir; genel Türkçe cümleler olamaz.

- [ ] **Step 2: Dinamik JavaScript metin envanterini ekle**

`admin.js`, `auth.js`, `bildirimler.js`, `chat.js`, `coffee-marka.js`, `coffee.js`, `energy-map.js`, `feedback.js`, `harmonic-mixer.js`, `kullanicilar.js`, `license.js`, `music-request-page.js`, `my-projects.js`, `plan-takvim.js`, `projects.js`, `radyo-panel-views.js`, `radyo-yonetim.js`, `satis-takibi.js`, `taleplerim.js` dosyalarındaki kullanıcı metinlerinin `DerinDil.metin`, `DerinDil.cevir`, EN veya METIN ile kapsandığını denetle.

- [ ] **Step 3: Testi çalıştır ve gerçek eksikleri doğrula**

Run: `node --test tests/dil-kapsami.test.js`

Expected: FAIL; dosya ve Türkçe metin bazında eksik listesi verir.

- [ ] **Step 4: Otomatik mod runtime testini genişlet**

Sonradan eklenen `div` ve değersiz `option` kullan. İngilizce metni, Türkçe `option.value` değerini ve Türkçeye dönüşte özgün metni doğrula.

- [ ] **Step 5: Testlerin kararlı olduğunu doğrula ve commit et**

Run: `node --test tests/dil-kapsami.test.js tests/dil-ayarlar-runtime.test.js`

Expected: Runtime PASS; kapsam yalnız gerçek eksikler nedeniyle FAIL.

```bash
git add tests/dil-kapsami.test.js tests/dil-ayarlar-runtime.test.js
git commit -m "test: eksik site çevirilerini dosya bazında raporla"
```

### Task 6: Pazarlama, Portal ve Araç Çevirilerini Tamamla

**Files:**
- Modify: `dil.js`
- Modify: Task 5 raporundaki üretim HTML ve kullanıcı arayüzü JS dosyaları
- Test: `tests/dil-kapsami.test.js`
- Test: `tests/*.test.js`

**Interfaces:**
- Consumes: Task 5 eksik raporu, `DerinDil.metin`, `DerinDil.cevir`
- Produces: İngilizce modda Türkçe arayüz sızıntısı olmayan site

- [ ] **Step 1: Marka metinlerini açık anahtarlarla tamamla**

Ana sayfa, branşlar, haberler ve ses tasarımı metinlerini `data-i18n` ile işaretle; EN/TR sözlüklerine karşılıklarını ekle.

- [ ] **Step 2: Portal/araç sabit metinlerini METIN'e ekle**

```js
'Dosya seçilmedi.': 'No file selected.',
'Kaydediliyor…': 'Saving…',
'Henüz kayıt yok.': 'No records yet.'
```

Task 5 raporundaki her sabit UI dizesini çevir; form değerlerinin kaynak dilini koru.

- [ ] **Step 3: Dinamik JS metinlerini ortak API'ye bağla**

```js
const t = (anahtar, tr) => window.DerinDil?.metin(anahtar, tr) || tr;
durum.textContent = t('proje.kaydediliyor', 'Kaydediliyor…');
```

Kullanıcı/veritabanı içeriğini çeviri fonksiyonundan geçirme. Yeniden çizim gereken modüllerde `derin:dil` dinle; mükerrer ağ isteği veya event listener üretme.

- [ ] **Step 4: Kapsam ve bütün modül testlerini çalıştır**

Run: `node --test tests/dil-kapsami.test.js tests/dil-destegi.test.js tests/*.test.js`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add dil.js -- '*.html' '*.js' tests/dil-kapsami.test.js
git commit -m "feat: site genelindeki İngilizce çevirileri tamamla"
```

### Task 7: Hukuki Sayfaların İngilizce Bilgilendirme Sürümlerini Ekle

**Files:**
- Modify: `gizlilik-politikasi.html`
- Modify: `cerez-politikasi.html`
- Modify: `kullanici-sozlesmesi.html`
- Modify: `aydinlatma-metni.html`
- Modify: `hukuki.css`
- Modify: `tests/dil-destegi.test.js`

**Interfaces:**
- Consumes: `data-dil`
- Produces: `.hk-tr` bağlayıcı ve `.hk-en` bilgilendirme blokları

- [ ] **Step 1: Tam İngilizce blokları isteyen başarısız testi yaz**

```js
HUKUKI.forEach(sayfa => {
  const html = oku(sayfa);
  assert.match(html, /class="hk-metin hk-tr"/);
  assert.match(html, /class="hk-metin hk-en" lang="en"/);
  assert.match(html, /The Turkish version is legally binding/);
});
```

- [ ] **Step 2: Testi çalıştır ve başarısızlığı doğrula**

Run: `node --test tests/dil-destegi.test.js`

Expected: FAIL; mevcut sayfalar yalnız kısa İngilizce not taşır.

- [ ] **Step 3: Dört sayfaya tam İngilizce bilgilendirme bloklarını ekle**

Madde yapısı, tarihler, e-posta ve bağlantılar Türkçe kaynakla eşleşsin. İngilizce blok `data-dil-yok` taşısın ve şu notla başlasın:

```html
<p class="hk-dil-not">This English translation is provided for information. The Turkish version is legally binding.</p>
```

- [ ] **Step 4: Hukuk bloklarının görünürlüğünü bağla**

```css
.hk-en { display: none; }
html[data-dil="en"] .hk-tr { display: none; }
html[data-dil="en"] .hk-en { display: block; }
```

- [ ] **Step 5: Hukuk/kapsam testlerini çalıştır ve commit et**

Run: `node --test tests/dil-destegi.test.js tests/dil-kapsami.test.js`

Expected: PASS.

```bash
git add gizlilik-politikasi.html cerez-politikasi.html kullanici-sozlesmesi.html aydinlatma-metni.html hukuki.css tests/dil-destegi.test.js
git commit -m "feat: hukuki sayfalara İngilizce bilgilendirme sürümü ekle"
```

### Task 8: Tam Test, Görsel QA ve Canlı Yayın

**Files:**
- Modify: Yalnız doğrulamada bulunan hataların sahibi dosyalar
- Test: `tests/*.test.js`

**Interfaces:**
- Consumes: Tasks 1–7 tamamlanmış dal
- Produces: Test edilmiş commit, GitHub `main` ve canlı doğrulama kanıtı

- [ ] **Step 1: Bütün otomatik testleri çalıştır**

Run: `node --test tests/*.test.js`

Expected: PASS; başarısız veya atlanan dil testi yok.

- [ ] **Step 2: Statik kalite kapılarını çalıştır**

Run: `node --check dil.js && node --check auth.js && git diff --check`

Expected: Exit 0.

- [ ] **Step 3: Yerel masaüstü ve mobil senaryoları kontrol et**

Run: `python3 -m http.server 4173`

Giriş yapmadan Ayarlar/English, yenileme ve sayfalar arası kalıcılık, giriş penceresi, hesap menüsü, Türkçeye birebir dönüş, 390×844 görünüm, Escape/backdrop/kapat ve temsilî ana/branş/haber/chat/radyo/yönetici/proje/kurumsal/hukuk sayfalarını kontrol et.

- [ ] **Step 4: Görsel QA bulgularını sahibi dosyada düzelt**

Her düzeltmeden sonra ilgili testi ve ardından `node --test tests/*.test.js` çalıştır. Değişiklik varsa `git add -A && git commit -m "fix: dil ayarlarının site geneli QA bulgularını gider"` ile commit et; boş commit oluşturma.

- [ ] **Step 5: Ana dala gönder**

```bash
git fetch origin main
git rebase origin/main
git push origin HEAD:main
```

Expected: Uzak `main` HEAD yerel HEAD ile aynıdır.

- [ ] **Step 6: Canlı yayını doğrula**

`https://www.derinrecord.com/` ve temsilî alt sayfalarda yeni `dil.js`/`dil.css` sürümünü, Ayarlar panelini, mobil/masaüstü görünümü, Türkçe/English geçişini, kalıcılığı ve giriş metinlerini kontrol et.

Expected: Canlı alan adı yeni commit içeriğini sunar; kaynak, işlev ve görsel doğrulama birlikte geçer.
