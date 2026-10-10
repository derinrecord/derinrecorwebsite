# Satış Takibi ve Marka İletişim Kartı — Uygulama Planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Radyo panelindeki Talepler sekmesini aşamalı bir Satış takibine çevirmek ve markalara iletişim kartı eklemek.

**Architecture:** Saf hesaplar yeni `satis-takibi.js` modülünde (`window.DerinSatis` / `module.exports`, `plan-takvim.js` kalıbı). HTML üretimi `radyo-panel-views.js`'te, olay ve veri yazma `radyo-yonetim.js`'te kalır. Veritabanı değişikliği tek idempotent `supabase/satis-takibi.sql` dosyası; RLS politikalarına dokunulmaz, ziyaretçi eklemesi bir `before insert` tetikleyicisiyle sınırlanır.

**Tech Stack:** Vanilla JS (IIFE), Supabase JS 2.81.1 (CDN), Postgres 17, `node --test`.

**Spec:** `docs/superpowers/specs/2026-10-10-satis-takibi-design.md`

## Global Constraints

- Build yok, `package.json` yok; testler: `node --test tests/*.test.js` (başlangıç: 405 geçen, 0 kalan).
- Her JS dosyası IIFE; global `window.Derin*`.
- Kullanıcı verisi DOM'a yalnız `esc()` ile basılır.
- Değişen script/style etiketlerinde `?v=` artırılır.
- `config.js`'e dokunulmaz. RLS politikaları değişmez.
- Sekme iç anahtarı `talepler` kalır (mevcut testler `data-sub="talepler"` ve `talepler: { nav: 'musteri', sub: 'talepler' }` arar); yalnız görünen etiket "Satış" olur.
- Aşama kodları ve etiketleri tam olarak: `new` Yeni · `contacted` Görüşüldü · `offer` Teklif gönderildi · `trial` Denemede · `won` Anlaştı · `lost` Olmadı.
- `source`: `form` (etiket "Site") · `manual` (etiket "Elle").
- Deneme süresi: 7 gün.
- Supabase projesi: `abqhakgoluntpzgfyjye`. SQL **Derin'in açık onayından sonra** uygulanır.
- Push'tan önce Derin'e önizleme + ekran görüntüsü gönderilir; `main`'e birleştirme yalnız onayıyla.

## Review Focus

1. Ziyaretçi /coffee formundan `status:'won'` veya `notes` göndererek kayıt eklerse → kayıt `new`, notlar boş düşmeli (Task 2 DB doğrulaması).
2. `next_step_date` boş / geçmiş / bugün / gelecek karışık liste → yalnız açık ve tarihi ≤ bugün olanlar "Bugün" panelinde, en eski üstte (Task 1).
3. Firma adı veya not içinde `<script>` / `"` → her yerde kaçışlı basılmalı (Task 3 testi).
4. Markaya çevirmede paket yoksa (`D.plans` boş) ve deneme işaretliyse → marka açılır, deneme atlanır ve "Önce bir paket oluşturun" hatası görünür; talep yine `won` olur (Task 5).
5. Telefon/e-posta boş markada iletişim kartı → "—" gösterir, kırık `tel:`/`mailto:` linki üretmez (Task 6 testi).

---

### Task 1: Satış mantık modülü

**Files:**
- Create: `satis-takibi.js`
- Test: `tests/satis-takibi.test.js`

**Interfaces:**
- Produces (`window.DerinSatis` ve `module.exports`):
  - `ASAMALAR: Array<{kod:string, etiket:string}>` — Global Constraints'teki sırayla
  - `asamaEtiket(kod:string) -> string` (bilinmeyen kod → kodun kendisi)
  - `KAYNAK_ETIKET: {form:'Site', manual:'Elle'}`
  - `acikMi(t) -> boolean` — `status` `won`/`lost` değilse true
  - `bugunYapilacaklar(talepler, bugunIso:'YYYY-MM-DD') -> talep[]`
  - `asamaSayilari(talepler) -> {tumu:number, new:number, contacted:number, offer:number, trial:number, won:number, lost:number}`
  - `sirala(talepler) -> talep[]` (yeni dizi; girdiyi değiştirmez)
  - `markayaAktarilacak(t) -> {name, contact_name, contact_phone, contact_email}` (boş metin → `null`, kırpılmış)

- [ ] **Step 1: Failing testleri yaz** — `tests/satis-takibi.test.js`, `const S = require('../satis-takibi.js')`:
  - `ASAMALAR.map(a=>a.kod)` deepEqual `['new','contacted','offer','trial','won','lost']`; `asamaEtiket('offer') === 'Teklif gönderildi'`; `asamaEtiket('closed') === 'closed'`.
  - `acikMi({status:'won'}) === false`, `acikMi({status:'lost'}) === false`, `acikMi({status:'trial'}) === true`.
  - bugün `'2026-10-10'`; girdi: a(açık, `2026-10-08`), b(açık, `2026-10-10`), c(açık, `2026-10-11`), d(açık, null), e(`won`, `2026-10-01`) → `bugunYapilacaklar` id'leri `['a','b']`.
  - `next_step_date` bir timestamp string ise (`'2026-10-09T00:00:00'`) ilk 10 karakter kullanılır → listeye girer.
  - `asamaSayilari` 3 kayıtla (`new`,`new`,`won`) → `{tumu:3,new:2,contacted:0,offer:0,trial:0,won:1,lost:0}`.
  - `sirala`: [kapalı-won, açık-tarihsiz(created 09-01), açık-10-12, açık-10-05, açık-tarihsiz(created 09-20)] → id sırası: `10-05`, `10-12`, tarihsiz-09-20, tarihsiz-09-01, won; girdi dizisi değişmemiş.
  - `markayaAktarilacak({company:' X Kafe ', contact_name:'', phone:' 0555 ', email:'a@b.co'})` deepEqual `{name:'X Kafe', contact_name:null, contact_phone:'0555', contact_email:'a@b.co'}`.

- [ ] **Step 2: Çalıştır, kaldığını gör** — `node --test tests/satis-takibi.test.js` → FAIL (`Cannot find module`).
- [ ] **Step 3: `satis-takibi.js` yaz** — `plan-takvim.js` başlık yorumu ve export kalıbıyla (başta spec yolu yorumu). Tarih karşılaştırması `String(x).slice(0,10)` sözlük sırasıyla.
- [ ] **Step 4: Çalıştır, geçtiğini gör** — aynı komut → PASS; `node --test tests/*.test.js` → 0 fail.
- [ ] **Step 5: Commit** — `git add satis-takibi.js tests/satis-takibi.test.js && git commit -m "Satış takibi: saf mantık modülü ve testleri"`

### Task 2: Veritabanı değişikliği (SQL dosyası → onay → uygulama → doğrulama)

**Files:**
- Create: `supabase/satis-takibi.sql`

**Interfaces:**
- Produces: `coffee_requests` kolonları `source, plan_id, next_step, next_step_date, notes, brand_id, updated_at`; `status` check'i 6 koda genişler; `brands` kolonları `contact_name, contact_phone, contact_email, notes`; fonksiyonlar `coffee_requests_ziyaretci_sinirla()`, `coffee_requests_guncellendi()`.

- [ ] **Step 1: SQL dosyasını yaz** — spec §3 aynen: `alter table ... add column if not exists` (tipler/varsayılanlar/FK'ler spec tablosundaki gibi; `source` check `in ('form','manual')`); `update ... set status='lost' where status='closed'`; `drop constraint if exists coffee_requests_status_check` + `add constraint coffee_requests_status_check check (status in ('new','contacted','offer','trial','won','lost'))`; `security definer` olmayan `before insert` tetikleyici fonksiyonu: `if not public.is_admin()` ise spec §3.2'deki alanları sıfırla, `coalesce(trim(company),'')=''` veya `coalesce(trim(email),'')=''` ise `raise exception 'Şirket ve e-posta gerekli'`; `before update` tetikleyicisi `new.updated_at := now()`; `drop trigger if exists` + `create trigger` ikilileri; `brands` kolonları + `contact` taşıma `update`'leri (yalnız hedef null iken). Dosya başında: amaç, "RLS politikalarına dokunmaz", tekrar çalıştırılabilir notu.
- [ ] **Step 2: Derin'e göster ve onay iste** — tetikleyicinin ne yaptığını Türkçe 3 satırla anlat; **açık "evet" gelmeden uygulama.**
- [ ] **Step 3: Uygula** — `mcp__Supabase__apply_migration` (project `abqhakgoluntpzgfyjye`, name `satis_takibi`, query = dosya içeriği).
- [ ] **Step 4: Doğrula** — `execute_sql` ile tek işlem içinde, sonunda `rollback`:
  ```sql
  begin;
  set local role anon;
  insert into public.coffee_requests(company,contact_name,email,status,notes,source)
    values('Deneme','x','d@e.co','won','gizli','manual');
  reset role;
  select status, notes, source from public.coffee_requests where company='Deneme';
  rollback;
  ```
  Beklenen: `new | null | form`. Ayrıca `information_schema.columns` ile yeni kolonların varlığı; `coffee_requests` satır sayısı değişmemiş.
- [ ] **Step 5: Commit** — `git add supabase/satis-takibi.sql && git commit -m "Satış takibi: veritabanı kolonları ve ziyaretçi ekleme tetikleyicisi"`

### Task 3: Satış sekmesi görünümü

**Files:**
- Modify: `radyo-panel-views.js:2361-2392` (`TALEP_DURUM`, `talepListesi`), `:1248` ve `:1273` (menü/başlık etiketleri), `:2400` (sekme etiketi)
- Test: `tests/radio-panel-views.test.js` (mevcut 308. satırdaki talep testi güncellenir, yenileri eklenir)

**Interfaces:**
- Consumes: Task 1 `DerinSatis` — views içinde `const S = (typeof window!=='undefined' && window.DerinSatis) || (typeof require==='function' ? require('./satis-takibi.js') : null)` (2578'deki `DerinPlan` kalıbı).
- Produces: `ui.satisAsama` (çip süzgeci; yoksa `'tumu'`), `ui.bugunIso()` yoksa `new Date().toISOString().slice(0,10)`. Eylem adları: `data-act="req-status"` (mevcut, select), `req-add`, `req-edit`, `req-convert` (mevcut), `req-goto-brand`, `req-del` (mevcut), `sales-filter` (`data-asama`).

- [ ] **Step 1: Failing testleri yaz** — `durum({nav:'musteri',sub:'talepler'})` ile, `D.requests` içine: açık+bugün tarihli (`next_step:'Pazartesi ara'`), `won`+`brand_id:'b1'`, adı `'<b>"Kafe"</b>'` olan bir kayıt:
  - html `'Bugün yapılacaklar'` ve `'Pazartesi ara'` içerir.
  - 6 aşama etiketinin her biri select seçeneği olarak bulunur; `'Kapandı'` bulunmaz.
  - `data-act="req-add"` ve `data-act="sales-filter"` vardır; `'Anlaştı'` çipinde sayı `1`.
  - `won`+`brand_id` satırında `data-act="req-goto-brand"` var, `req-convert` yok.
  - ham `<b>"Kafe"</b>` geçmez, `&lt;b&gt;` geçer.
  - menüde `'Satış'` ve `data-sub="talepler"` birlikte bulunur.
  - `ui.satisAsama='won'` iken açık kaydın firma adı tabloda yoktur.
- [ ] **Step 2: Çalıştır, kaldığını gör** — `node --test tests/radio-panel-views.test.js` → yeni testler FAIL.
- [ ] **Step 3: Uygula** — `talepListesi` gövdesini spec §5.1'e göre yeniden yaz (fonksiyon adı aynı kalır): üstte `+ FİRMA EKLE`, `S.bugunYapilacaklar` paneli (boşsa hiç basılmaz; tarihi `< bugün` olan satıra `class="gecikti"`), çipler `S.asamaSayilari`, tablo `S.sirala` ile; satır kolonları FİRMA · AŞAMA · SONRAKİ ADIM (metin + tarih) · KAYNAK · eylemler. Menü alt yazısı "Teklif ve görüşme takibi"; başlık `['Satış', 'Teklif ve görüşme takibi']`; sekme etiketi `'Satış'`.
- [ ] **Step 4: Çalıştır** — `node --test tests/*.test.js` → 0 fail (eski "durum seçenekleri" testi yeni etiketlere göre güncellenmiş olarak).
- [ ] **Step 5: Commit** — `git commit -am "Satış sekmesi: aşamalar, bugün paneli, süzgeç"`

### Task 4: Satış verisi, ekle/düzenle ve rota

**Files:**
- Modify: `radyo-yonetim.js:1020-1026` (`talepleriYukle` select listesi), `:476-490` (`ROTALAR`'a `satis: { nav: 'musteri', sub: 'talepler' }`), `:2851-2858` (`req-status` mesajı), eylem anahtarı (`req-add`, `req-edit`, `sales-filter`)
- Modify: `radyo-yonetim.html:51` (`<script src="satis-takibi.js?v=1"></script>` `plan-takvim.js`'ten önce; `radyo-yonetim.js?v=` ve `radyo-panel-views.js?v=` artır)
- Test: `tests/radio-management-render.test.js` (kaynak metin testleri bu dosyanın kalıbında)

**Interfaces:**
- Consumes: Task 3 eylem adları; mevcut `pencere({baslik,onayMetni,govde,onOnay})`, `cekmeceAc(html)`, `cekmeceKapat()`, `yazDogrula(promise, mesaj)`, `hata`, `bildir`, `esc`, `D.plans`.
- Produces: `talepFormu(t|null) -> html` (yerel; alan id'leri `sf-company, sf-name, sf-email, sf-phone, sf-branch, sf-plan, sf-next, sf-next-date, sf-notes`), `talepFormuOku() -> object` (boş → `null`, `contact_name`/`email` boşsa `''`).

- [ ] **Step 1: Failing testler** — `radio-management-render.test.js`'e kaynak eşleşmeleri: `/satis: \{ nav: 'musteri', sub: 'talepler' \}/`; `talepleriYukle` select'i `next_step_date` ve `brand_id` içerir; `radyo-yonetim.html` içinde `satis-takibi.js` etiketi `plan-takvim.js`'ten önce.
- [ ] **Step 2: Kaldığını gör.**
- [ ] **Step 3: Uygula** — select'e yeni kolonlar; `req-add` → `pencere` içinde `talepFormu(null)`, onayda `insert({...talepFormuOku(), source:'manual', status:'new'})`, şirket boşsa `hata('Firma adı gerekli.')`; `req-edit` → `cekmeceAc` içinde `talepFormu(t)` + KAYDET düğmesi (`data-act="req-save"`), `update(talepFormuOku())`; `sales-filter` → `ui.satisAsama = data-asama; ciz()`; `req-status` bildirimi `'Aşama güncellendi.'`. Her yazmadan sonra `await talepleriYukle(); ciz();`.
- [ ] **Step 4: Testler** — `node --test tests/*.test.js` → 0 fail.
- [ ] **Step 5: Commit** — `git commit -am "Satış: firma ekleme/düzenleme, #/satis rotası"`

### Task 5: Markaya çevir (+ isteğe bağlı 7 günlük deneme)

**Files:**
- Modify: `radyo-yonetim.js:2742-2760` (`req-convert`), yeni `req-goto-brand`
- Test: `tests/radio-management-render.test.js`

**Interfaces:**
- Consumes: `S.markayaAktarilacak`, `bosSlug(slugify(ad))`, `D.plans`.
- Produces: yerel `denemeBaslat(brandId, planId, subeSayisi) -> Promise<string|null>` (hata metni veya null) — `subscriptions.upsert({brand_id, plan_id, branch_count, status:'trial', trial_ends_at: şimdi+7 gün ISO, current_start: şimdi ISO, current_end:null, updated_at}, {onConflict:'brand_id'})`.

- [ ] **Step 1: Failing test** — kaynakta `req-convert` bloğu `markayaAktarilacak` ve `denemeBaslat` çağırır; `status: 'won'` ve `brand_id:` yazar; `req-goto-brand` `git('#/markalar/'` çağırır.
- [ ] **Step 2: Kaldığını gör.**
- [ ] **Step 3: Uygula** — `onaySor` yerine `pencere`: gövdede "Marka kaydı açılacak" + `<label><input type="checkbox" id="sc-deneme"${t.status==='trial'?' checked':''}> 7 günlük deneme de başlasın</label>`, onay `MARKA OLUŞTUR`. Sıra spec §5.2; marka insert'ü başarısızsa dur; talep güncellemesi başarısızsa `hata('Marka açıldı ama talep işaretlenemedi.')` ve markaya git; deneme işaretli ve `D.plans` boşsa `hata('Önce Abonelikler ekranından bir paket oluşturun.')`, değilse `denemeBaslat(id, t.plan_id || D.plans[0].id, t.branch_count || 1)`. Sonunda `await yenile(false); git('#/markalar/'+id)`.
- [ ] **Step 4: Testler** → 0 fail.
- [ ] **Step 5: Commit** — `git commit -am "Satış: markaya çevirirken iletişim aktarımı ve isteğe bağlı deneme"`

### Task 6: Marka iletişim kartı

**Files:**
- Modify: `radyo-panel-views.js:1900+` (`markaDetay` içine İLETİŞİM paneli), `:1808-1809` ve `:2344-2345` (tek "İLETİŞİM" alanı → `brand-contact-name/phone/email` ve `ab-brand-contact-name/phone/email`)
- Modify: `radyo-yonetim.js:2378`, `:2389` (insert alanları), yeni `brand-contact-edit` / `brand-contact-save` eylemleri; marka verisini çeken select (`:838`) yeni kolonları da alır
- Test: `tests/radio-panel-views.test.js`

**Interfaces:**
- Consumes: `D.brands[i].contact_name/contact_phone/contact_email/notes`.
- Produces: eylemler `brand-contact-edit` (`data-id`), `brand-contact-save`.

- [ ] **Step 1: Failing testler** — markaDetay (`openBrand:'b1'`): `contact_phone:'0555 111'` → html `href="tel:0555111"` (boşluksuz) ve `İLETİŞİM`; `contact_email:'a@b.co'` → `href="mailto:a@b.co"`; iletişimsiz markada `tel:` ve `mailto:` geçmez, `—` geçer; `notes:'<i>x</i>'` kaçışlı basılır.
- [ ] **Step 2: Kaldığını gör.**
- [ ] **Step 3: Uygula** — panel + `DÜZENLE` (`cekmeceAc` içinde 4 alan, KAYDET → `brands.update`); oluşturma formları 3 alana bölünür ve insert'e `contact_name/contact_phone/contact_email` yazar (eski `contact` artık yazılmaz).
- [ ] **Step 4: Testler** → 0 fail.
- [ ] **Step 5: Commit** — `git commit -am "Markalara iletişim kartı"`

### Task 7: Stil, önizleme ve teslim

**Files:**
- Modify: `radyo-panel.css` (`.bugun-panel`, `.gecikti`, `.asama-cipleri` — mevcut panel/chip değişkenleriyle), `radyo-yonetim.html` (`radyo-panel.css?v=` artır)
- Create: `tests/onizleme-satis.html` (`tests/onizleme-olustur.js` kalıbıyla örnek veriyle Satış sekmesi + iletişim kartı)

- [ ] **Step 1:** CSS'i ekle; dar ekranda (≤ 640px) tablo yatay kaydırma yapmadan okunur olsun (mevcut tablo davranışını izle).
- [ ] **Step 2:** Önizlemeyi üret, Playwright/Chromium ile 1280px ve 390px ekran görüntüsü al, gözle kontrol et.
- [ ] **Step 3:** `node --test tests/*.test.js` → 0 fail; sayıyı not et.
- [ ] **Step 4:** Commit + `git push` (dal `satis-takibi`); Derin'e ekran görüntülerini gönder, `main`'e birleştirme için onay iste.
