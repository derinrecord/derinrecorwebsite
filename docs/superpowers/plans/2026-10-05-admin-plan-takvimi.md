# Yönetici Plan Takvimi — Uygulama Planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Radyo panelinde, yalnızca yöneticinin gördüğü bir plan takvimi: ay ızgarası, güne tıklayınca açılan madde/not paneli, kenarda yaklaşan abonelik ödemeleri.

**Architecture:** Takvimin gövdesi yeni ve bağımsız bir dosyada (`plan-takvim.js`) durur; mevcut iki büyük panel dosyasına yalnızca bölümü tanıtan birkaç satır eklenir. Saf fonksiyonlar (ızgara üretimi, gün özeti, ödeme hesabı) DOM'suz çalışır, böylece node testleriyle doğrudan sınanır. Veri `plan_maddeleri` tablosunda; yetki tek bir RLS kuralıyla `is_admin()`'e bağlı.

**Tech Stack:** Vanilla JS (IIFE + `window.Derin*` global), Supabase JS v2 (CDN), `node:test`. Build aracı yok.

**Spec:** `docs/superpowers/specs/2026-10-05-admin-plan-takvimi-design.md`

## Global Constraints

- Her JS dosyası IIFE içinde; dışarıya `window.DerinPlan` ve `module.exports` ile açılır (projedeki mevcut kalıp).
- Kullanıcıdan gelen metin DOM'a basılmadan önce yerel `escapeHtml`/`esc` fonksiyonundan geçer.
- Dosya adları kebab-case, kod ve arayüz metinleri Türkçe.
- Script/style etiketlerinde cache-busting için `?v=N`.
- Tarihler gün bazında `YYYY-AA-GG` metni olarak taşınır; saat dilimi kaymasını önlemek için gün hesapları UTC ile yapılır.
- Veritabanı tablosu `plan_maddeleri` **zaten kurulu ve doğrulanmış** (10 sütun: `id, gun, tur, metin, bitti, marka, tutar, sira, created_at, updated_at`; RLS açık, tek kural `is_admin()`, günde tek not için kısmi tekil indeks). `tur` ∈ `madde | not | odeme`. Yeniden kurulmayacak.
- Abonelikten gelen ödemeler `plan_maddeleri`'ne **yazılmaz**; `subscriptions`/`plans` canlı okunur. Elle eklenen ödemeler `tur='odeme'` satırlarıdır.
- **Elle yönetim her yerde:** eklenen her şey silinebilir, her bölüm katlanabilir. Katlanmış bölümler `localStorage`'da hatırlanır.

## Review Focus

Tasarımın ima ettiği ama hiçbir görevin testinin kendiliğinden kapsamadığı, kullanıcıyı ısırması en olası girdiler. Her biri, kodun sahibi olan göreve test olarak eklendi.

1. **Ay sonu + saat dilimi:** İstanbul UTC+3; `new Date('2026-10-31')` yerel saate çevrilirse 30 Ekim görünebilir. Gün hesapları UTC olmalı. → Görev 1
2. **Boş `current_end`:** Dönem bitişi olmayan abonelik ödeme sütununda görünmemeli, çökmemeli. → Görev 3
3. **İptal edilmiş ama "active" abonelik:** Gizlenmemeli, "iptal edilmiş" etiketiyle görünmeli (starbucks kaydı şu an tam olarak böyle). → Görev 3
4. **Metin içinde HTML:** Maddeye `<script>` ya da `"` yazılırsa ekrana ham basılmamalı. → Görev 4
5. **Aynı güne ikinci not:** Veritabanı kısmi tekil indeksle reddeder; arayüz bunu hata olarak göstermeli, sessizce yutmamalı. → Görev 5

---

### Görev 1: Ay ızgarası

**Files:**
- Create: `plan-takvim.js`
- Test: `tests/plan-takvim.test.js`

**Interfaces:**
- Consumes: —
- Produces: `aylikIzgara(yil, ay) -> Array<{ iso: string, gunNo: number, ayIcinde: boolean }>` — `ay` 1-12. Her zaman 42 eleman (6 hafta × 7 gün), pazartesiden başlar. `iso` biçimi `YYYY-AA-GG`. Ay dışındaki hücreler komşu ayın gerçek günleriyle dolar ve `ayIcinde: false` taşır.

- [ ] **Step 1: Write the failing test**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../plan-takvim.js');

test('ay ızgarası pazartesiden başlar ve 42 hücre üretir', () => {
  const g = P.aylikIzgara(2026, 10);
  assert.equal(g.length, 42);
  // 1 Ekim 2026 perşembe: pazartesi başlangıcında 3 hücre önden dolar
  assert.equal(g[3].iso, '2026-10-01');
  assert.equal(g[3].ayIcinde, true);
  assert.equal(g[2].ayIcinde, false);
  assert.equal(g[2].iso, '2026-09-30');
});

test('artık yıl: Şubat 2028 yirmi dokuz gün', () => {
  const g = P.aylikIzgara(2028, 2).filter(h => h.ayIcinde);
  assert.equal(g.length, 29);
  assert.equal(g[28].iso, '2028-02-29');
});

test('yıl sınırı: Aralık 2026 sonrası Ocak 2027 ile dolar', () => {
  const g = P.aylikIzgara(2026, 12);
  const sonAyIci = g.filter(h => h.ayIcinde).pop();
  assert.equal(sonAyIci.iso, '2026-12-31');
  assert.equal(g[g.indexOf(sonAyIci) + 1].iso, '2027-01-01');
});

test('saat dilimi kaymıyor: ay sonu günü kaybolmuyor', () => {
  // UTC+3'te yerel tarih kullanılsaydı 31 Ekim 30'a düşerdi
  const ekim = P.aylikIzgara(2026, 10).filter(h => h.ayIcinde).map(h => h.iso);
  assert.equal(ekim.length, 31);
  assert.ok(ekim.includes('2026-10-31'));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/plan-takvim.test.js`
Expected: FAIL — `Cannot find module '../plan-takvim.js'`

- [ ] **Step 3: Implement `aylikIzgara(yil, ay)` in `plan-takvim.js`**

Dosyayı projedeki IIFE kalıbıyla aç (`window.DerinPlan` + `module.exports`). Tüm gün aritmetiği `Date.UTC` ile; pazartesi ofseti `(ilkGununHaftaGunu + 6) % 7`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node tests/plan-takvim.test.js`
Expected: 4 test PASS

- [ ] **Step 5: Commit**

```bash
git add plan-takvim.js tests/plan-takvim.test.js
git commit -m "Plan takvimi: ay izgarasi"
```

---

### Görev 2: Gün özeti rozeti

**Files:**
- Modify: `plan-takvim.js`
- Test: `tests/plan-takvim.test.js`

**Interfaces:**
- Consumes: —
- Produces: `gunOzeti(maddeler, iso) -> { toplam: number, bitti: number }` — `maddeler` `plan_maddeleri` satırları dizisi. Yalnız `tur === 'madde'` sayılır; notlar sayıma girmez.

- [ ] **Step 1: Write the failing test**

```js
test('gün özeti yalnız maddeleri sayar, notu saymaz', () => {
  const m = [
    { gun: '2026-10-27', tur: 'madde', bitti: true },
    { gun: '2026-10-27', tur: 'madde', bitti: false },
    { gun: '2026-10-27', tur: 'not', metin: 'bir şey' },
    { gun: '2026-10-28', tur: 'madde', bitti: false }
  ];
  assert.deepEqual(P.gunOzeti(m, '2026-10-27'), { toplam: 2, bitti: 1 });
  assert.deepEqual(P.gunOzeti(m, '2026-10-29'), { toplam: 0, bitti: 0 });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/plan-takvim.test.js`
Expected: FAIL — `P.gunOzeti is not a function`

- [ ] **Step 3: Implement `gunOzeti(maddeler, iso)` in `plan-takvim.js`**

- [ ] **Step 4: Run test to verify it passes**

Run: `node tests/plan-takvim.test.js`
Expected: tüm testler PASS

- [ ] **Step 5: Commit**

```bash
git add plan-takvim.js tests/plan-takvim.test.js
git commit -m "Plan takvimi: gun ozeti"
```

---

### Görev 3: Yaklaşan ödemeler hesabı

**Files:**
- Modify: `plan-takvim.js`
- Test: `tests/plan-takvim.test.js`

**Interfaces:**
- Consumes: `D.subscriptions`, `D.plans`, `D.brands` (panelin mevcut veri paketi).
- Produces: `yaklasanOdemeler(D, bugunIso, gunSayisi) -> Array<{ iso, marka, tutar, iptal }>` — `tutar` sayı, `iptal` boolean, tarihe göre artan sıralı. Varsayılan pencere 60 gün.

Tutar: paket `per_branch` ise `monthly_price × branch_count`, değilse `monthly_price`.

- [ ] **Step 1: Write the failing test**

```js
const DD = {
  brands: [{ id: 'b1', name: 'Chemex' }, { id: 'b2', name: 'starbucks' }, { id: 'b3', name: 'Uzak' }],
  plans: [
    { id: 'tek', monthly_price: 2000, per_branch: false },
    { id: 'zincir', monthly_price: 1500, per_branch: true }
  ],
  subscriptions: [
    { brand_id: 'b1', plan_id: 'tek', branch_count: 1, current_end: '2026-10-27T00:00:00Z', canceled_at: null },
    { brand_id: 'b2', plan_id: 'tek', branch_count: 1, current_end: '2026-11-28T00:00:00Z', canceled_at: '2026-09-26T00:00:00Z' },
    { brand_id: 'b3', plan_id: 'zincir', branch_count: 4, current_end: '2027-05-01T00:00:00Z', canceled_at: null },
    { brand_id: 'b1', plan_id: 'tek', branch_count: 1, current_end: null, canceled_at: null }
  ]
};

test('yaklaşan ödemeler: pencere, sıra, tutar', () => {
  const o = P.yaklasanOdemeler(DD, '2026-10-05', 60);
  assert.deepEqual(o.map(x => x.iso), ['2026-10-27', '2026-11-28']);
  assert.equal(o[0].marka, 'Chemex');
  assert.equal(o[0].tutar, 2000);
});

test('şube başına fiyatlı pakette tutar şube sayısıyla çarpılır', () => {
  const o = P.yaklasanOdemeler(DD, '2026-10-05', 400);
  const uzak = o.find(x => x.marka === 'Uzak');
  assert.equal(uzak.tutar, 6000);
});

test('dönem bitişi boş olan abonelik listede yok', () => {
  const o = P.yaklasanOdemeler(DD, '2026-10-05', 400);
  assert.ok(o.every(x => x.iso));
  assert.equal(o.length, 3);
});

test('iptal edilmiş abonelik gizlenmez, etiketlenir', () => {
  const o = P.yaklasanOdemeler(DD, '2026-10-05', 60);
  const sb = o.find(x => x.marka === 'starbucks');
  assert.equal(sb.iptal, true);
  assert.equal(o[0].iptal, false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/plan-takvim.test.js`
Expected: FAIL — `P.yaklasanOdemeler is not a function`

- [ ] **Step 3: Implement `yaklasanOdemeler(D, bugunIso, gunSayisi)` in `plan-takvim.js`**

Pencere: `bugunIso <= iso <= bugunIso + gunSayisi`. Karşılaştırma `YYYY-AA-GG` metinleri üzerinden yapılabilir (sözlük sırası tarih sırasıyla aynı).

- [ ] **Step 4: Run test to verify it passes**

Run: `node tests/plan-takvim.test.js`
Expected: tüm testler PASS

- [ ] **Step 5: Commit**

```bash
git add plan-takvim.js tests/plan-takvim.test.js
git commit -m "Plan takvimi: yaklasan odemeler hesabi"
```

---

### Görev 4: Görünüm üretimi

**Files:**
- Modify: `plan-takvim.js`
- Test: `tests/plan-takvim.test.js`

**Interfaces:**
- Consumes: `aylikIzgara`, `gunOzeti`, `yaklasanOdemeler`.
- Produces: `takvimView(state, D, ui) -> string` — HTML metni döndürür, DOM'a dokunmaz. `state.planYil`, `state.planAy`, `state.planAcikGun`, `state.planKatli` (katlanmış bölüm adları dizisi) okur; yoksa `ui.now()`'dan bugünün ayını kullanır.

Üretilen eylem kancaları:

| `data-act` | `data-id` | ne yapar |
|---|---|---|
| `plan-gun` | `<iso>` | günü aç/kapat |
| `plan-ay` | `onceki` \| `sonraki` | ay değiştir |
| `plan-madde-ekle` | `<iso>` | madde ekle |
| `plan-odeme-ekle` | `<iso>` | elle ödeme satırı ekle |
| `plan-sil` | `<satır id>` | satırı sil |
| `plan-isaret` | `<satır id>` | yapıldı / ödendi işaretini çevir |
| `plan-katla` | `<bölüm adı>` | bölümü katla / aç |
| `plan-odeme-aktar` | `<iso>:<marka>:<tutar>` | otomatik ödemeyi düzenlenebilir satıra çevir |

- [ ] **Step 1: Write the failing test**

```js
const UI = { now: () => Date.parse('2026-10-05T09:00:00Z') };

test('görünüm ayın günlerini ve rozeti basar', () => {
  const D2 = Object.assign({}, DD, {
    planItems: [
      { id: 'p1', gun: '2026-10-27', tur: 'madde', metin: 'Chemex ara', bitti: false, sira: 0 },
      { id: 'p2', gun: '2026-10-27', tur: 'madde', metin: 'Fatura', bitti: true, sira: 1 }
    ]
  });
  const h = P.takvimView({ planYil: 2026, planAy: 10 }, D2, UI);
  assert.ok(h.includes('data-act="plan-gun"'));
  assert.ok(h.includes('data-id="2026-10-27"'));
  assert.ok(h.includes('1/2'));
});

test('açık günün maddeleri ve notu görünür', () => {
  const D2 = Object.assign({}, DD, {
    planItems: [
      { id: 'p1', gun: '2026-10-27', tur: 'madde', metin: 'Chemex ara', bitti: false, sira: 0 },
      { id: 'p9', gun: '2026-10-27', tur: 'not', metin: 'havale bekleniyor', bitti: false, sira: 0 }
    ]
  });
  const h = P.takvimView({ planYil: 2026, planAy: 10, planAcikGun: '2026-10-27' }, D2, UI);
  assert.ok(h.includes('Chemex ara'));
  assert.ok(h.includes('havale bekleniyor'));
  assert.ok(h.includes('data-act="plan-madde-ekle"'));
});

test('metindeki HTML kaçırılır', () => {
  const D2 = Object.assign({}, DD, {
    planItems: [{ id: 'p1', gun: '2026-10-27', tur: 'madde', metin: '<script>x</script>', bitti: false, sira: 0 }]
  });
  const h = P.takvimView({ planYil: 2026, planAy: 10, planAcikGun: '2026-10-27' }, D2, UI);
  assert.ok(!h.includes('<script>x</script>'));
  assert.ok(h.includes('&lt;script&gt;'));
});

test('yaklaşan ödemeler sütunu basılır', () => {
  const h = P.takvimView({ planYil: 2026, planAy: 10 }, Object.assign({}, DD, { planItems: [] }), UI);
  assert.ok(h.includes('Chemex'));
  assert.ok(h.includes('2.000'));
});

test('elle eklenen ödeme satırı silinebilir ve işaretlenebilir', () => {
  const D2 = Object.assign({}, DD, {
    planItems: [{ id: 'o1', gun: '2026-10-27', tur: 'odeme', marka: 'Elle Marka', tutar: 1800, bitti: true, metin: '', sira: 0 }]
  });
  const h = P.takvimView({ planYil: 2026, planAy: 10, planAcikGun: '2026-10-27' }, D2, UI);
  assert.ok(h.includes('Elle Marka'));
  assert.ok(h.includes('1.800'));
  assert.ok(h.includes('data-act="plan-sil"'));
  assert.ok(h.includes('data-act="plan-isaret"'));
  assert.ok(h.includes('data-act="plan-odeme-ekle"'));
});

test('katlanmış bölümün içeriği basılmaz, başlığı kalır', () => {
  const D2 = Object.assign({}, DD, {
    planItems: [{ id: 'p1', gun: '2026-10-27', tur: 'madde', metin: 'gizlenecek', bitti: false, sira: 0 }]
  });
  const acik = P.takvimView({ planYil: 2026, planAy: 10, planAcikGun: '2026-10-27', planKatli: [] }, D2, UI);
  const katli = P.takvimView({ planYil: 2026, planAy: 10, planAcikGun: '2026-10-27', planKatli: ['maddeler'] }, D2, UI);
  assert.ok(acik.includes('gizlenecek'));
  assert.ok(!katli.includes('gizlenecek'));
  assert.ok(katli.includes('data-act="plan-katla"'));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/plan-takvim.test.js`
Expected: FAIL — `P.takvimView is not a function`

- [ ] **Step 3: Implement `takvimView(state, D, ui)` in `plan-takvim.js`**

Yerel bir `esc()` tanımla (projedeki her dosyada olduğu gibi) ve ekrana basılan her metni ondan geçir. Tutarı `tr-TR` binlik ayracıyla yaz.

- [ ] **Step 4: Run test to verify it passes**

Run: `node tests/plan-takvim.test.js`
Expected: tüm testler PASS

- [ ] **Step 5: Commit**

```bash
git add plan-takvim.js tests/plan-takvim.test.js
git commit -m "Plan takvimi: gorunum uretimi"
```

---

### Görev 5: Panele bağlama ve kaydetme

**Files:**
- Modify: `radyo-panel-views.js:860-864` (MENU_SATIRLARI), `:892-906` (nav), `:918-927` (BASLIKLAR), `:2203-2225` (`gorunum`)
- Modify: `radyo-yonetim.js:515-535` (veri yükleme), `:1036` (`switch (act)`)
- Modify: `radyo-yonetim.html` (script etiketi)
- Test: `tests/radio-panel-views.test.js`

**Interfaces:**
- Consumes: `window.DerinPlan.takvimView(state, D, ui)`.
- Produces: `D.planItems` — `plan_maddeleri` satırları; panelin veri paketine eklenir.

- [ ] **Step 1: Write the failing test**

`tests/radio-panel-views.test.js` içine, mevcut kaynak-kontrolü kalıbıyla:

```js
test('panel plan bölümünü tanıyor', () => {
  assert.ok(source.includes("'plan/takvim'"), 'plan bölümünün başlığı olmalı');
  assert.ok(source.includes("data-nav=\"plan\"") || source.includes("oge('plan'"), 'menüde plan satırı olmalı');
  assert.ok(source.includes('DerinPlan'), 'görünüm plan-takvim.js modülüne bağlanmalı');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/radio-panel-views.test.js`
Expected: FAIL — "plan bölümünün başlığı olmalı"

- [ ] **Step 3: Panele bağla**

- `MENU_SATIRLARI`'na `plan: ['takvim']`
- `nav` bloğuna `<div class="nav-title">PLAN</div>` ve `oge('plan', 'takvim', 'Takvim', 'Günlük plan, notlar, ödemeler', null, ikonlar.plan)`; `ikonlar`'a sade bir takvim SVG'si ekle
- `BASLIKLAR`'a `'plan/takvim': ['Takvim', 'Günlük planlar, notlar ve yaklaşan ödemeler']`
- `gorunum()` başına: `if (state.nav === 'plan') return kabuk(window.DerinPlan.takvimView(state, D, ui));`
- `radyo-yonetim.js` veri yüklemesine `client.from('plan_maddeleri').select('*').order('gun')` ekle, sonucu `D.planItems`'a yaz; tablo yoksa `[]` kalsın ve panelin geri kalanı çalışmaya devam etsin (mevcut opsiyonel tablo kalıbı)
- `radyo-yonetim.html`'e `<script src="plan-takvim.js?v=1"></script>`, `radyo-yonetim.js`'ten önce

- [ ] **Step 4: Kaydetme işlemlerini ekle**

`switch (act)` içine dört durum. Her biri değişikliği önce ekranda gösterir, sonra Supabase'e yazar; yazma başarısızsa satırı `kaydedilemedi` işaretiyle bırakır ve metni silmez.

`switch (act)` içine, Görev 4'teki tablonun her satırı için bir durum. Her biri
değişikliği önce ekranda gösterir, sonra Supabase'e yazar; yazma başarısızsa
satırı `kaydedilemedi` işaretiyle bırakır ve metni silmez.

- `plan-gun`, `plan-ay` — yalnız `state` değiştirir, veritabanına gitmez
- `plan-katla` — `state.planKatli` listesine ekler/çıkarır ve `localStorage`'a yazar
- `plan-madde-ekle` — `insert { gun, tur: 'madde', metin, sira }`
- `plan-odeme-ekle` — `insert { gun, tur: 'odeme', marka, tutar }`
- `plan-odeme-aktar` — otomatik ödemeyi `insert { gun, tur: 'odeme', marka, tutar }` ile düzenlenebilir satıra çevirir
- `plan-isaret` — `update { bitti: !bitti }`
- `plan-sil` — `delete`, önce ekrandan kaldırır
- `plan-not` — `upsert { gun, tur: 'not', metin }`, yazmayı bıraktıktan 1 sn sonra

Günde tek not kısıtı veritabanında: aynı güne ikinci not denemesi hata döner ve bu hata kullanıcıya gösterilir, sessizce yutulmaz.

- [ ] **Step 5: Run tests to verify they pass**

Run: `for f in tests/*.test.js; do node "$f" || echo "FAIL $f"; done`
Expected: 13 dosyanın tamamı PASS (12 mevcut + 1 yeni)

- [ ] **Step 6: Commit**

```bash
git add plan-takvim.js radyo-panel-views.js radyo-yonetim.js radyo-yonetim.html tests/
git commit -m "Plan takvimini panele bagla"
```

---

### Görev 6: Şema dosyası ve canlı doğrulama

**Files:**
- Create: `supabase/plan-takvimi.sql` (yerelde yazıldı, depoya girecek)

- [ ] **Step 1: SQL dosyasını depoya al**

Tablo canlıda zaten kurulu; dosya şemanın kaydı olarak durur ve yeniden çalıştırılabilir (`if not exists`).

- [ ] **Step 2: Canlı doğrulama**

Panelde Plan → Takvim, sırayla:

- Bir güne madde ekle, işaretle, **sil** — üçü de çalışıyor mu
- Not yaz, sayfayı yenile — duruyor mu
- `+ ödeme ekle` ile elle bir ödeme gir, tutarını değiştir, ödendi işaretle, sil
- Chemex'in 27 Ekim ödemesi otomatik görünüyor mu; "takvime ekle" ile düzenlenebilir satıra dönüyor mu
- Bir bölümü **katla**, sayfayı yenile — katlı kalıyor mu (`localStorage`)
- Ay oklarıyla Kasım'a ve Aralık'tan Ocak'a geç

- [ ] **Step 3: Yetki doğrulaması**

Yönetici olmayan bir oturumla `plan_maddeleri` sorgulanır; boş dönmeli.

- [ ] **Step 4: Commit**

```bash
git add supabase/plan-takvimi.sql
git commit -m "Plan takvimi sema dosyasi"
```
