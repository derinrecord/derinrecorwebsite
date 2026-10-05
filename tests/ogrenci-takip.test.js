const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const O = require('../ogrenciler.js');

// ---------- Gün ve ay hesabı ----------
// Ayın gün sayısı UTC'den okunur: yerel saat dilimi ayın son gününü bir
// önceki güne kaydırmasın (plan-takvim.js ile aynı kural).

test('ayın gün sayısı, artık yıl dahil', () => {
  assert.equal(O.ayGunSayisi(2026, 10), 31);
  assert.equal(O.ayGunSayisi(2026, 2), 28);
  assert.equal(O.ayGunSayisi(2028, 2), 29);
  assert.equal(O.ayGunSayisi(2026, 4), 30);
});

test('gün kısa etiketi gün + ay adı', () => {
  assert.equal(O.gunKisa('2026-10-05'), '5 Ekim');
  assert.equal(O.gunKisa('2026-01-31'), '31 Ocak');
});

// ---------- Yoklama döngüsü ----------
// Tek düğme dört hâl arasında döner; dördüncü basış işareti kaldırır.

test('yoklama işareti dört hâl arasında döner', () => {
  assert.equal(O.katilimSonraki(''), 'geldi');
  assert.equal(O.katilimSonraki(null), 'geldi');
  assert.equal(O.katilimSonraki('geldi'), 'gelmedi');
  assert.equal(O.katilimSonraki('gelmedi'), 'mazeret');
  assert.equal(O.katilimSonraki('mazeret'), '', 'dördüncü basış işareti silmeli');
  assert.equal(O.katilimEtiket('gelmedi'), 'Gelmedi');
  assert.equal(O.katilimEtiket(null), 'İşaretsiz');
});

// ---------- Yoklama verisi ----------

const KAYIT = [
  { id: 'k1', ogrenci_id: 'o1', tur: 'katilim', gun: '2026-10-01', durum: 'geldi' },
  { id: 'k2', ogrenci_id: 'o1', tur: 'katilim', gun: '2026-10-06', durum: 'gelmedi' },
  { id: 'k3', ogrenci_id: 'o1', tur: 'katilim', gun: '2026-10-08', durum: 'mazeret' },
  { id: 'k4', ogrenci_id: 'o1', tur: 'katilim', gun: '2026-09-30', durum: 'geldi' },
  { id: 'k5', ogrenci_id: 'o2', tur: 'katilim', gun: '2026-10-01', durum: 'geldi' },
  { id: 'p1', ogrenci_id: 'o1', tur: 'odeme', gun: '2026-10-03', metin: 'Ekim aidatı', tutar: 2000, bitti: true },
  { id: 'p2', ogrenci_id: 'o1', tur: 'odeme', gun: '2026-10-20', metin: 'Kasım aidatı', tutar: 1500, bitti: false },
  { id: 'p3', ogrenci_id: 'o1', tur: 'odeme', gun: '2026-09-15', metin: 'Eylül aidatı', tutar: 2000, bitti: true }
];
const AY = { yil: 2026, ay: 10, bugun: '2026-10-05' };
const OGR = { id: 'o1', ad: 'Elif Yılmaz', veli: 'Ayşe', telefon: '0531', notlar: '' };

test('kayıtlar öğrenciye ve türe göre süzülür', () => {
  assert.equal(O.ogrenciKayitlari(KAYIT, 'o1', 'katilim').length, 4);
  assert.equal(O.ogrenciKayitlari(KAYIT, 'o1', 'odeme').length, 3);
  assert.equal(O.ogrenciKayitlari(KAYIT, 'o2', 'katilim').length, 1);
  assert.equal(O.ogrenciKayitlari(null, 'o1').length, 0);
});

test('günün işareti okunur, işaretsiz gün null', () => {
  assert.equal(O.katilimDurum(KAYIT, 'o1', '2026-10-06'), 'gelmedi');
  assert.equal(O.katilimDurum(KAYIT, 'o1', '2026-10-07'), null);
  // Başka öğrencinin aynı gündeki işareti karışmamalı.
  assert.equal(O.katilimDurum(KAYIT, 'o2', '2026-10-06'), null);
});

test('aylık yoklama özeti yalnız o ayı sayar', () => {
  const oz = O.katilimOzeti(KAYIT, 'o1', 2026, 10);
  assert.deepEqual(oz, { geldi: 1, gelmedi: 1, mazeret: 1, toplam: 3 });
  // 30 Eylül kaydı Ekim özetine girmemeli.
  assert.equal(O.katilimOzeti(KAYIT, 'o1', 2026, 9).geldi, 1);
  assert.equal(O.katilimOzeti(KAYIT, 'o1', 2026, 9).toplam, 1);
});

// ---------- Ödeme verisi ----------

test('ödemeler yeni tarih başta sıralanır', () => {
  assert.deepEqual(O.ogrenciOdemeleri(KAYIT, 'o1').map(x => x.id), ['p2', 'p1', 'p3']);
  assert.equal(O.ogrenciOdemeleri(KAYIT, 'o2').length, 0);
});

test('ödeme özeti tahsili ve bekleyeni ayırır', () => {
  const oz = O.odemeOzeti(KAYIT, 'o1', 2026, 10);
  assert.equal(oz.tahsil, 2000);
  assert.equal(oz.bekleyen, 1500);
  assert.equal(oz.adet, 2);
  // Eylül tahsilatı Ekim özetine karışmamalı.
  assert.equal(O.odemeOzeti(KAYIT, 'o1', 2026, 9).tahsil, 2000);
  assert.equal(O.odemeOzeti(KAYIT, 'o1', 2026, 9).adet, 1);
});

// ---------- Yoklama şeridi ----------

test('şerit ayın her günü için bir düğme basar', () => {
  const h = O.katilimSeridi(KAYIT, OGR, AY);
  assert.equal((h.match(/data-act="ogrenci-katilim"/g) || []).length, 31);
});

test('şerit işaretleri ve bugünü işaretler', () => {
  const h = O.katilimSeridi(KAYIT, OGR, AY);
  assert.ok(h.includes('class="ogr-gun geldi"'), 'geldi günü altın olmalı');
  assert.ok(h.includes('class="ogr-gun gelmedi"'), 'gelmedi günü kırmızı olmalı');
  assert.ok(h.includes('class="ogr-gun mazeret"'), 'mazeret günü ayrı renkte olmalı');
  assert.ok(h.includes('class="ogr-gun bugun"'), 'işaretsiz bugün çerçevelenmeli');
  // Düğme mevcut durumu taşır; panel döngüyü buradan sürdürür.
  assert.ok(h.includes('data-id="o1:2026-10-06:gelmedi"'), 'gün ve durum düğmede olmalı');
  assert.ok(h.includes('data-id="o1:2026-10-05:"'), 'işaretsiz gün boş durum taşımalı');
});

test('şerit üstünde ay özeti yazılır', () => {
  const h = O.katilimSeridi(KAYIT, OGR, AY);
  assert.ok(h.includes('Ekim 2026'));
  assert.ok(h.includes('1 geldi'));
  assert.ok(h.includes('1 gelmedi'));
  assert.ok(h.includes('1 mazeret'));
});

test('işaretsiz öğrencide şerit boş ama basılır', () => {
  const h = O.katilimSeridi([], OGR, AY);
  assert.equal((h.match(/data-act="ogrenci-katilim"/g) || []).length, 31);
  assert.ok(!h.includes('ogr-gun geldi'));
  assert.ok(h.includes('0 geldi'));
});

// ---------- Ödeme satırı ----------

test('ödeme satırı tutarı, tarihi ve düğmeleri taşır', () => {
  const h = O.odemeSatiri(KAYIT[5], null);
  assert.ok(h.includes('Ekim aidatı'));
  assert.ok(h.includes('3 Ekim'));
  assert.ok(h.includes('2.000 ₺'));
  assert.ok(h.includes('class="plan-satir ogr-odeme bitti"'), 'ödendi işareti satırda görünmeli');
  assert.ok(h.includes('data-act="ogrenci-odeme-isaret" data-id="p1"'));
  assert.ok(h.includes('data-act="ogrenci-odeme-duzenle" data-id="p1"'));
  assert.ok(h.includes('data-act="ogrenci-odeme-sil" data-id="p1"'));
});

test('ödenmemiş satır işaretsiz ve vurgusuz', () => {
  const h = O.odemeSatiri(KAYIT[6], null);
  assert.ok(h.includes('class="plan-satir ogr-odeme"'));
  assert.ok(!h.includes('bitti'));
  assert.ok(h.includes('1.500 ₺'));
});

test('ödeme satırı yerinde düzenleme formuna dönüşür', () => {
  const h = O.odemeSatiri(KAYIT[5], 'p1');
  assert.ok(h.includes('duzenliyor'), 'düzenlenen satır işaretlenmeli');
  assert.ok(h.includes('data-ogrenci-odeme-duzenle="metin"'));
  assert.ok(h.includes('data-ogrenci-odeme-duzenle="tutar"'));
  assert.ok(h.includes('data-act="ogrenci-odeme-duzenle-kaydet" data-id="p1"'));
  assert.ok(h.includes('data-act="ogrenci-odeme-duzenle-kapat"'));
  assert.ok(!h.includes('data-act="ogrenci-odeme-sil"'), 'form açıkken satır düğmeleri basılmamalı');
});

// ---------- Öğrenci detayı ----------

test('detay iki bölüm basar: yoklama ve ödemeler', () => {
  const h = O.ogrenciDetay(OGR, KAYIT, {}, AY);
  assert.ok(h.includes('ogr-detay'));
  assert.ok(h.includes('YOKLAMA'));
  assert.ok(h.includes('ÖDEMELER'));
  assert.ok(h.includes('data-act="ogrenci-katilim"'), 'yoklama şeridi olmalı');
  assert.ok(h.includes('data-act="ogrenci-odeme-yeni" data-id="o1"'), 'ödeme ekleme düğmesi olmalı');
  assert.ok(h.includes('2.000 ₺ tahsil'));
  assert.ok(h.includes('1.500 ₺ bekliyor'));
});

test('ödeme ekleme formu açıkken alanlar basılır', () => {
  const h = O.ogrenciDetay(OGR, KAYIT, { ogrenciOdemeYeni: 'o1' }, AY);
  assert.ok(h.includes('data-ogrenci-odeme-gir="metin"'));
  assert.ok(h.includes('data-ogrenci-odeme-gir="tutar"'));
  assert.ok(h.includes('data-act="ogrenci-odeme-kaydet" data-id="o1"'));
  assert.ok(h.includes('data-act="ogrenci-odeme-kapat"'));
  assert.ok(!h.includes('data-act="ogrenci-odeme-yeni"'), 'düğme yerine form görünmeli');
});

test('ödeme kaydı olmayan öğrencide davet metni çıkar', () => {
  const h = O.ogrenciDetay({ id: 'o2', ad: 'Mert' }, KAYIT, {}, AY);
  assert.ok(h.includes('henüz ödeme kaydı yok'));
});

test('ödeme açıklaması kaçışlı basılır', () => {
  const k = [{ id: 'p9', ogrenci_id: 'o1', tur: 'odeme', gun: '2026-10-02', metin: '<b>x</b>', tutar: 10, bitti: false }];
  const h = O.odemeSatiri(k[0], null);
  assert.ok(!h.includes('<b>x</b>'), 'ham HTML basılmamalı');
  assert.ok(h.includes('&lt;b&gt;x&lt;/b&gt;'));
});

// ---------- Satır: katlanmış / açık ----------

test('katlanmış satırda ay özeti çipleri görünür', () => {
  const h = O.ogrenciSatiri(OGR, {}, KAYIT, AY);
  assert.ok(h.includes('aria-expanded="false"'));
  assert.ok(h.includes('ogr-cip'));
  assert.ok(h.includes('1 geldi'));
  assert.ok(h.includes('1 gelmedi'));
  assert.ok(h.includes('2.000 ₺ ödendi'));
  assert.ok(h.includes('1.500 ₺ bekliyor'));
  assert.ok(!h.includes('ogr-detay'), 'detay kapalıyken basılmamalı');
});

test('açık satırda detay basılır, çipler yerini detayla paylaşmaz', () => {
  const h = O.ogrenciSatiri(OGR, { ogrenciAcik: 'o1' }, KAYIT, AY);
  assert.ok(h.includes('aria-expanded="true"'));
  assert.ok(h.includes('class="plan-satir ogrenci acik"'));
  assert.ok(h.includes('ogr-detay'));
  assert.ok(!h.includes('ogr-cip'), 'detay açıkken özet çipi tekrarlanmamalı');
});

test('kaydedilemeyen satırda yoklama ve ödeme açılmaz', () => {
  // Yerel satırın gerçek id'si yok; yoklama/ödeme yanlış satıra yazardı.
  const h = O.ogrenciSatiri({ id: 'yerel-1', ad: 'Elif', hata: 'ağ hatası' }, {}, KAYIT, AY);
  assert.ok(!h.includes('data-act="ogrenci-detay"'), 'detay oku olmamalı');
  assert.ok(!h.includes('data-act="ogrenci-duzenle"'), 'düzenleme olmamalı');
  assert.ok(h.includes('data-act="ogrenci-tekrar"'), 'tekrar dene olmalı');
});

test('özet yalnız o öğrencinin kayıtlarını sayar', () => {
  // o2'nin Ekim'de tek işareti var (1 Ekim, geldi). o1'in gelmedi/mazeret
  // işaretleri ve ödemeleri o2'nin satırına sızmamalı.
  const h = O.ogrenciSatiri({ id: 'o2', ad: 'Mert' }, {}, KAYIT, AY);
  assert.ok(h.includes('1 geldi'));
  assert.ok(!h.includes('gelmedi'), 'başka öğrencinin işareti görünmemeli');
  assert.ok(!h.includes('mazeret'));
  assert.ok(!h.includes('ödendi'), 'başka öğrencinin ödemesi görünmemeli');
});

test('işareti ve ödemesi olmayan öğrencide çip çıkmaz', () => {
  const h = O.ogrenciSatiri({ id: 'o9', ad: 'Yeni' }, {}, KAYIT, AY);
  assert.ok(!h.includes('ogr-cip'));
});

// ---------- Takvime bağlanma ----------

const P = require('../plan-takvim.js');
const UI = { now: () => Date.parse('2026-10-05T09:00:00Z') };
global.window = Object.assign(global.window || {}, { DerinOgrenci: O });

test('takvim görünümü kayıtları klasöre taşır', () => {
  const D = {
    brands: [], plans: [], subscriptions: [], planItems: [],
    ogrenciler: [OGR], ogrenciKayitlari: KAYIT
  };
  const kapali = P.takvimView({ planYil: 2026, planAy: 10 }, D, UI);
  assert.ok(kapali.includes('Elif Yılmaz'));
  assert.ok(kapali.includes('2.000 ₺ ödendi'), 'ödeme özeti takvimde görünmeli');
  assert.ok(kapali.includes('data-act="ogrenci-detay"'), 'satır açılabilmeli');
  // Yoklama şeridi satır açılınca basılır; detay takvimin içinden gelmeli.
  const acik = P.takvimView({ planYil: 2026, planAy: 10, ogrenciAcik: 'o1' }, D, UI);
  assert.ok(acik.includes('data-act="ogrenci-katilim"'), 'yoklama şeridi takvimden erişilebilmeli');
  assert.ok(acik.includes('data-id="o1:2026-10-06:gelmedi"'), 'işaretli gün takvimde görünmeli');
});

test('takvim ayı değişince yoklama şeridi o ayı basar', () => {
  const D = {
    brands: [], plans: [], subscriptions: [], planItems: [],
    ogrenciler: [OGR], ogrenciKayitlari: KAYIT
  };
  const eylul = P.takvimView({ planYil: 2026, planAy: 9, ogrenciAcik: 'o1' }, D, UI);
  assert.equal((eylul.match(/data-act="ogrenci-katilim"/g) || []).length, 30,
    'Eylül 30 gün olmalı');
  assert.ok(eylul.includes('Eylül 2026'));
});

test('kayıt tablosu yokken liste yine çalışır', () => {
  const D = {
    brands: [], plans: [], subscriptions: [], planItems: [],
    ogrenciler: [OGR]
  };
  const h = P.takvimView({ planYil: 2026, planAy: 10, ogrenciAcik: 'o1' }, D, UI);
  assert.ok(h.includes('Elif Yılmaz'));
  assert.ok(h.includes('data-act="ogrenci-katilim"'), 'işaretsiz şerit yine basılmalı');
  assert.ok(h.includes('0 geldi'));
  assert.ok(h.includes('data-act="plan-gun"'), 'takvim ızgarası bozulmamalı');
});

// ---------- Panele bağlanma ----------

const panelKaynak = fs.readFileSync(require.resolve('../radyo-yonetim.js'), 'utf8');

test('ogrenciler.js panelden önce yükleniyor', () => {
  // Panel `window.DerinOgrenci`'yi IIFE başında okuyor. Sıra bozulursa
  // yoklama düğmesi sessizce hiçbir şey yapmaz ve klasör "modül yüklenemedi"
  // der. Script etiketleri dosya sırasıyla okunur — yorum satırlarındaki
  // dosya adları sayılmaz.
  [['../radyo-yonetim.html', true], ['../radyo-panel-prova.html', false]].forEach(([yol, panelVar]) => {
    const kaynak = fs.readFileSync(require.resolve(yol), 'utf8');
    const sira = [...kaynak.matchAll(/<script src="([^"]+)"/g)]
      .map(m => m[1].split('?')[0]);
    const o = sira.indexOf('ogrenciler.js');
    const p = sira.indexOf('plan-takvim.js');
    const y = sira.indexOf('radyo-yonetim.js');
    assert.ok(o !== -1, yol + ': ogrenciler.js yüklenmeli');
    assert.ok(p !== -1, yol + ': plan-takvim.js yüklenmeli');
    assert.ok(o < p, yol + ': ogrenciler.js plan-takvim.js\'ten önce olmalı');
    if (panelVar) assert.ok(p < y, yol + ': plan-takvim.js panelden önce olmalı');
  });
});

test('panel kayıtları veri paketine koyuyor', () => {
  assert.ok(panelKaynak.includes("from('ogrenci_kayitlari')"), 'kayıtlar sorgulanmalı');
  assert.ok(panelKaynak.includes('ogrenciKayitlari: ogrenciKayitlari.data || []'),
    'veri D.ogrenciKayitlari olarak taşınmalı');
  assert.ok(panelKaynak.includes('!ogrenciKayitlari.error'),
    'kurulum bayrağı iki tabloyu birlikte bildirmeli');
});

test('panel yoklama ve ödeme eylemlerini karşılıyor', () => {
  ['ogrenci-detay', 'ogrenci-katilim', 'ogrenci-odeme-yeni', 'ogrenci-odeme-kapat',
    'ogrenci-odeme-kaydet', 'ogrenci-odeme-isaret', 'ogrenci-odeme-duzenle',
    'ogrenci-odeme-duzenle-kapat', 'ogrenci-odeme-duzenle-kaydet', 'ogrenci-odeme-sil']
    .forEach(act => assert.ok(panelKaynak.includes(act), act + ' işlenmeli'));
});

test('yoklama iyimser: kayıt düşerse liste eski hâline döner', () => {
  // Tek hücreyi işaretleyen kullanıcı için doğru davranış sessiz kalmamak:
  // ekran gerçeğe döner ve hata söylenir.
  const m = panelKaynak.match(/async function ogrenciKatilimYaz\([\s\S]*?\n  \}/);
  assert.ok(m, 'ogrenciKatilimYaz gövdesi bulunmalı');
  assert.ok(/const onceki = /.test(m[0]), 'önceki liste saklanmalı');
  assert.ok(/D\.ogrenciKayitlari = liste/.test(m[0]), 'iyimser güncelleme yapılmalı');
  assert.ok(/D\.ogrenciKayitlari = onceki/.test(m[0]), 'başarısızlıkta eski liste geri gelmeli');
  assert.ok(/bildir\(/.test(m[0]), 'hata kullanıcıya söylenmeli');
});

test('ödeme ekleme tür ve gün yazar', () => {
  const m = panelKaynak.match(/async function ogrenciOdemeGir\([\s\S]*?\n  \}/);
  assert.ok(m, 'ogrenciOdemeGir gövdesi bulunmalı');
  assert.ok(/tur: 'odeme'/.test(m[0]), 'tür ödeme olmalı');
  assert.ok(/gun: bugunIso\(\)/.test(m[0]), 'gün bugünden gelmeli');
  assert.ok(/tutar: tutar/.test(m[0]), 'tutar yazılmalı');
});

test('ödeme formu kayıt düşerse açık kalır', () => {
  // Başarısızlıkta form kapanırsa yazılan tutar sessizce kaybolurdu.
  const m = panelKaynak.match(/async function ogrenciOdemeDuzenleKaydet\([\s\S]*?\n  \}/);
  assert.ok(m, 'ogrenciOdemeDuzenleKaydet bulunmalı');
  const kod = m[0].replace(/^\s*\/\/.*$/gm, '');
  assert.ok(/if \(hata\) \{ bildir\([\s\S]*?return; \}/.test(kod), 'hata dalı önce dönmeli');
  assert.ok(kod.indexOf('state.ogrenciOdemeDuzenle = null') > kod.indexOf('if (hata)'),
    'form yalnız başarıdan sonra kapanmalı');
});

test('öğrenci silinince açık detay da kapanır', () => {
  assert.ok(/case 'ogrenci-sil': \{[\s\S]*?state\.ogrenciAcik === id[\s\S]*?return ogrenciYaz\('sil'/.test(panelKaynak));
});

// ---------- Yetki ve bütünlük ----------

test('kayıt tablosu yalnız yöneticiye açık', () => {
  const sql = fs.readFileSync(require.resolve('../supabase/ogrenciler.sql'), 'utf8');
  assert.match(sql, /create table if not exists public\.ogrenci_kayitlari/);
  assert.match(sql, /alter table public\.ogrenci_kayitlari enable row level security/);
  assert.match(sql, /create policy "ogrenci kaydi: yalnizca yonetici" on public\.ogrenci_kayitlari\s*\n?\s*for all to authenticated\s*\n?\s*using \(public\.is_admin\(\)\) with check \(public\.is_admin\(\)\)/,
    'kural yalnızca is_admin() ile çalışmalı');
  assert.ok(!/to anon/.test(sql), 'tablo anon\'a açılmamalı');
});

test('günde tek yoklama veritabanında da tek', () => {
  const sql = fs.readFileSync(require.resolve('../supabase/ogrenciler.sql'), 'utf8');
  assert.match(sql, /create unique index if not exists ogrenci_katilim_gun_idx[\s\S]*?where tur = 'katilim'/);
});

test('öğrenci silinince kayıtları da gider', () => {
  const sql = fs.readFileSync(require.resolve('../supabase/ogrenciler.sql'), 'utf8');
  assert.match(sql, /references public\.ogrenciler\(id\) on delete cascade/,
    'sahipsiz yoklama kaydı kalmamalı');
});

test('tür ile alanların tutarlılığı veritabanında bağlanır', () => {
  const sql = fs.readFileSync(require.resolve('../supabase/ogrenciler.sql'), 'utf8');
  assert.match(sql, /constraint ogrenci_kayitlari_tur_ck check/);
  assert.match(sql, /tur = 'katilim' and durum in \('geldi', 'gelmedi', 'mazeret'\)/);
  assert.match(sql, /tur = 'odeme' and durum is null/);
});

test('SQL dosyası tekrar çalıştırılabilir kalır', () => {
  // Aşama 1 kurulmuş olsa da dosya bir kez daha çalıştırılabilsin diye her
  // adım korunuyor; bu, mevcut veriyi silmeden genişletmeyi mümkün kılar.
  const sql = fs.readFileSync(require.resolve('../supabase/ogrenciler.sql'), 'utf8');
  assert.ok(!/drop table/i.test(sql), 'tablo düşürülmemeli');
  assert.ok(!/delete from/i.test(sql), 'veri silinmemeli');
  const createTable = (sql.match(/create table(?! if not exists)/g) || []).length;
  assert.equal(createTable, 0, 'her create table "if not exists" olmalı');
});
