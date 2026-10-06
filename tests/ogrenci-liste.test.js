const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const O = require('../ogrenciler.js');

// Klasör artık takvimin ayını ve bugününü de alıyor (yoklama şeridi ve ödeme
// özeti takvimde görünen ayı izler). Testler tek yerden bu bağlamı veriyor.
const AY = { yil: 2026, ay: 10, bugun: '2026-10-05' };
const bolum = (liste, s, kayitlar) => O.ogrenciListesi(liste, kayitlar || [], s, AY);

// ---------- Arama ----------
// Liste ad, veli ve telefonda aranır; harf büyüklüğünden bağımsız, Türkçe
// yerelle ("İ"→"i" doğru çevrilmeli).

test('arama boşken tüm liste döner', () => {
  const l = [
    { id: '1', ad: 'Elif', veli: 'Ayşe', telefon: '531' },
    { id: '2', ad: 'Mert', veli: 'Ali', telefon: '532' }
  ];
  assert.equal(O.ogrenciFiltrele(l, '').length, 2);
  assert.equal(O.ogrenciFiltrele(l, null).length, 2);
});

test('arama ad, veli ve telefonda eşleşir', () => {
  const l = [
    { id: '1', ad: 'Elif', veli: 'Ayşe Yılmaz', telefon: '0531' },
    { id: '2', ad: 'Mert', veli: 'Ali', telefon: '0532' }
  ];
  assert.deepEqual(O.ogrenciFiltrele(l, 'elif').map(x => x.id), ['1']);
  assert.deepEqual(O.ogrenciFiltrele(l, 'yılmaz').map(x => x.id), ['1']);
  assert.deepEqual(O.ogrenciFiltrele(l, '0532').map(x => x.id), ['2']);
});

test('arama Türkçe büyüklükten bağımsız', () => {
  const l = [{ id: '1', ad: 'İpek', veli: '', telefon: '' }];
  assert.deepEqual(O.ogrenciFiltrele(l, 'ipek').map(x => x.id), ['1']);
  assert.deepEqual(O.ogrenciFiltrele(l, 'İPEK').map(x => x.id), ['1']);
});

// ---------- Klasör görünümü ----------
// Klasör DOM'a dokunmaz, HTML metni döndürür. Böylece burada sınanabiliyor.

test('klasör arama, ekle düğmesi ve satırları basar', () => {
  const h = bolum([
    { id: '1', ad: 'Elif', veli: 'Ayşe', telefon: '0531', notlar: '' }
  ], {});
  assert.ok(h.includes('data-act="ogrenci-ara"'), 'arama kutusu olmalı');
  assert.ok(h.includes('data-act="ogrenci-yeni"'), 'ekle düğmesi olmalı');
  assert.ok(h.includes('Elif'), 'ad görünmeli');
  assert.ok(h.includes('Ayşe'), 'veli görünmeli');
  assert.ok(h.includes('data-act="ogrenci-duzenle" data-id="1"'), 'düzenle düğmesi olmalı');
  assert.ok(h.includes('data-act="ogrenci-sil" data-id="1"'), 'sil düğmesi olmalı');
});

test('boş listede davet metni çıkar', () => {
  const h = bolum([], {});
  assert.ok(h.includes('Henüz öğrenci yok'));
  const aranmis = bolum([], { ogrenciAra: 'elif' });
  assert.ok(aranmis.includes('eşleşen öğrenci yok'));
});

test('ekleme formu açıkken bütün alanlar ve ekle düğmesi basılır', () => {
  const h = bolum([], { ogrenciYeni: true });
  ['ad', 'veli', 'telefon', 'gun_sayisi', 'aylik_tutar', 'notlar'].forEach(a =>
    assert.ok(h.includes(`data-ogrenci-gir="${a}"`), a + ' alanı olmalı'));
  assert.ok(h.includes('data-act="ogrenci-kaydet"'), 'ekle düğmesi olmalı');
  assert.ok(h.includes('data-act="ogrenci-yeni-kapat"'), 'vazgeç düğmesi olmalı');
});

test('düzenlenen satır yerinde form olur', () => {
  const h = bolum([
    { id: '1', ad: 'Elif', veli: 'Ayşe', telefon: '0531', notlar: 'esnek' },
    { id: '2', ad: 'Mert', veli: '', telefon: '', notlar: '' }
  ], { ogrenciDuzenle: '1' });
  assert.ok(h.includes('data-ogrenci-duzenle="ad"'), 'düzenleme alanları olmalı');
  assert.ok(h.includes('data-act="ogrenci-duzenle-kaydet" data-id="1"'), 'kaydet düğmesi olmalı');
  assert.ok(h.includes('data-act="ogrenci-duzenle-kapat"'), 'vazgeç düğmesi olmalı');
  assert.ok(h.includes('data-act="ogrenci-duzenle" data-id="2"'), 'diğer satırda düzenle düğmesi kalmalı');
  assert.ok(!h.includes('data-act="ogrenci-duzenle" data-id="1"'), 'düzenlenen satırda düğme basılmamalı');
});

test('kaydedilemeyen satırda düzenle düğmesi çıkmaz', () => {
  const h = bolum([
    { id: 'yerel-1', ad: 'Elif', veli: '', telefon: '', notlar: '', hata: 'ağ hatası' }
  ], {});
  assert.ok(!h.includes('data-act="ogrenci-duzenle"'), 'hata satırında düzenleme olmamalı');
  assert.ok(h.includes('data-act="ogrenci-tekrar"'), 'tekrar dene olmalı');
  assert.ok(h.includes('kaydedilemedi — tekrar dene'), 'söz takvimle aynı olmalı');
});

test('kullanıcı girdisi kaçışlı basılır', () => {
  const h = bolum([
    { id: '1', ad: '<img src=x onerror=1>', veli: '', telefon: '', notlar: '' }
  ], {});
  assert.ok(!h.includes('<img src=x'), 'ham HTML basılmamalı');
  assert.ok(h.includes('&lt;img'), 'kaçışlı basılmalı');
});

// ---------- Panele bağlanma: Plan → Öğrenciler ----------
// Öğrenci takibi marka takviminin yan panelinde bir klasör ya da altında bir
// bölüm DEĞİL: Plan bölümünün ikinci sayfası (menüde "Takvim"in altında kendi
// satırı). Bu testler iki işin ayrı kaldığını doğrular.

const P = require('../plan-takvim.js');
const V = require('../radyo-panel-views.js');
const UI = { now: () => Date.parse('2026-10-05T09:00:00Z') };

// Modüller pencere üzerinden okunur; node'da pencere yok, burada kurulur.
global.window = Object.assign(global.window || {}, { DerinOgrenci: O, DerinPlan: P });

const temelD = ek => Object.assign({
  brands: [], folders: [], tracks: [], players: [], broadcast: [], announcements: [],
  playlists: [], playlistTracks: [], coffeeAttempts: [], subscriptions: [], plans: [],
  requests: [], olaylar: [], planItems: [], kurulum: {}
}, ek || {});

const planDurum = ek => Object.assign({
  nav: 'plan', sub: 'takvim', openFolder: null, openBrand: null, openPlaylist: null, q: ''
}, ek || {});

test("Plan menüsünde Takvim'in altında Öğrenciler satırı var", () => {
  // Yan menü ayrı çizilir (radyo-yonetim.js nav'ı kendi yuvasına basar).
  const h = V.nav(planDurum(), {
    players: 0, folders: 0, announcements: 0, brands: 0, playlists: 0, requests: 0, olaySorun: 0
  }, { ad: 'Derin Record', alt: 'yonetici@ornek.test', basHarf: 'DR' });
  assert.ok(h.includes('data-nav="plan" data-sub="takvim"'), 'Takvim satırı olmalı');
  assert.ok(h.includes('data-nav="plan" data-sub="ogrenciler"'), 'Öğrenciler satırı olmalı');
  assert.ok(h.indexOf('data-sub="ogrenciler"') > h.indexOf('data-sub="takvim"'),
    'Öğrenciler satırı Takvim’in altında durmalı');
  assert.ok(h.includes('Yoklama, borç ve ödeme'), 'menü satırı sayfanın içeriğini söylemeli');
  // Yalnız görünen sayfa işaretlenir: iki plan satırı birden seçili görünmemeli.
  assert.equal(h.split('nav-item active').length - 1, 1);
});

test('Öğrenciler sayfası açıkken menüde o satır işaretlenir', () => {
  const h = V.nav(planDurum({ sub: 'ogrenciler' }), {
    players: 0, folders: 0, announcements: 0, brands: 0, playlists: 0, requests: 0, olaySorun: 0
  }, { ad: 'Derin Record', alt: 'yonetici@ornek.test', basHarf: 'DR' });
  const aktif = h.match(/nav-item active"[^>]*data-sub="([a-z]+)"/);
  assert.ok(aktif, 'bir satır işaretli olmalı');
  assert.equal(aktif[1], 'ogrenciler', 'işaret Öğrenciler satırında olmalı');
});

test('Plan → Öğrenciler sayfası öğrenci takvimini basar', () => {
  const D = temelD({
    ogrenciler: [{ id: 'o1', ad: 'Elif', veli: 'Ayşe', telefon: '0531', notlar: '' }],
    ogrenciKayitlari: [{ id: 'k1', ogrenci_id: 'o1', tur: 'katilim', gun: '2026-10-01', durum: 'geldi' }]
  });
  const h = V.gorunum(planDurum({ sub: 'ogrenciler' }), D, UI).html;
  assert.ok(h.includes('class="ogr-takvim"'), 'öğrenci takvimi basılmalı');
  assert.ok(h.includes('data-act="ogrenci-ay"'), 'ay okları olmalı');
  assert.ok(h.includes('data-act="ogrenci-gun"'), 'gün kutuları olmalı');
  assert.ok(h.includes('data-act="ogrenci-ara"'), 'listede arama olmalı');
  assert.ok(h.includes('data-act="ogrenci-yeni"'), 'listede ekleme olmalı');
  assert.ok(h.includes('Elif'), 'öğrenci listesi basılmalı');
  assert.ok(!h.includes('class="plan-izgara"'), 'marka takvimi bu sayfada olmamalı');
  assert.ok(!h.includes('YAKLAŞAN ÖDEMELER'), 'marka ödeme panelleri bu sayfada olmamalı');
});

test('Plan → Takvim sayfasında öğrenci bölümü kalmaz', () => {
  const h = V.gorunum(planDurum({ planYil: 2026, planAy: 10 }), temelD(), UI).html;
  assert.ok(h.includes('class="plan-izgara"'), 'marka takvimi basılmalı');
  assert.ok(h.includes('YAKLAŞAN ÖDEMELER'), 'marka panelleri yerinde kalmalı');
  assert.ok(!h.includes('ogr-takvim'), 'öğrenci takvimi bu sayfada olmamalı');
  assert.ok(!h.includes('ÖĞRENCİLER'), 'öğrenci başlığı bu sayfada olmamalı');
  assert.ok(!h.includes('data-act="ogrenci-ara"'), 'öğrenci araması bu sayfada olmamalı');
  assert.ok(!h.includes('data-act="plan-katla" data-id="ogrenciler"'),
    'öğrenciler katlanabilir marka klasörü olmamalı');
});

test('öğrenci sayfası ilk açılışta içinde bulunulan ayı gösterir', () => {
  const h = V.gorunum(planDurum({ sub: 'ogrenciler' }), temelD(), UI).html;
  // Kurgu tarihi 5 Ekim 2026: seçim yoksa ekim ayı basılır.
  assert.ok(h.includes('Ekim 2026'), 'varsayılan ay bugünün ayı olmalı');
  assert.ok(h.includes('data-id="2026-10-05"'), 'bugünün kutusu ızgarada olmalı');
});

test('öğrenci takviminin ayı marka takviminden bağımsız yürür', () => {
  const D = temelD({ ogrenciler: [{ id: 'o1', ad: 'Elif', veli: '', telefon: '', notlar: '' }] });
  const h = V.gorunum(planDurum({ sub: 'ogrenciler', ogrenciYil: 2026, ogrenciAy: 11 }), D, UI).html;
  assert.ok(h.includes('Kasım 2026'), 'seçilen ay gösterilmeli');
  assert.ok(h.includes('data-id="2026-11-01"'), 'ızgara o ayın günlerini basmalı');
  assert.ok(!h.includes('data-id="2026-10-05"'), 'başka ayın kutusu basılmamalı');
});

test('öğrenci verisi yokken sayfa boş açılır, çöker değil', () => {
  const h = V.gorunum(planDurum({ sub: 'ogrenciler' }), temelD(), UI).html;
  assert.ok(h.includes('class="ogr-takvim"'), 'sayfa yine de basılmalı');
  assert.ok(h.includes('Henüz öğrenci yok.'), 'boş liste yol göstermeli');
  assert.ok(h.includes('data-act="ogrenci-gun"'), 'ızgara çalışmalı');
});

// ---------- Panele bağlanma ----------

const panelKaynak = fs.readFileSync(require.resolve('../radyo-yonetim.js'), 'utf8');
const sayfaKaynak = fs.readFileSync(require.resolve('../radyo-yonetim.html'), 'utf8');

test('panel öğrenci verisini yüklüyor', () => {
  assert.ok(panelKaynak.includes("from('ogrenciler')"), 'ogrenciler sorgulanmalı');
  assert.ok(panelKaynak.includes('D.ogrenciler') || panelKaynak.includes('ogrenciler:'),
    'veri D.ogrenciler olarak taşınmalı');
  assert.ok(panelKaynak.includes("D.kurulum['ogrenciler.sql']"), 'kurulum bayrağı yazılmalı');
});

test('panel öğrenci eylemlerini karşılıyor', () => {
  ['ogrenci-yeni', 'ogrenci-yeni-kapat', 'ogrenci-kaydet', 'ogrenci-duzenle',
    'ogrenci-duzenle-kapat', 'ogrenci-duzenle-kaydet', 'ogrenci-sil', 'ogrenci-tekrar',
    'ogrenci-ara']
    .forEach(act => assert.ok(panelKaynak.includes(act), act + ' işlenmeli'));
});

test('öğrenci sayfası adres çözücüye ve menü adresine bağlı', () => {
  // #/plan/ogrenciler adresi tanınmazsa sayfa sessizce marka takvimine düşer.
  assert.ok(panelKaynak.includes("if (sayfa === 'plan' && id === 'ogrenciler') state.sub = 'ogrenciler';"),
    'adres çözücü ikinci takvim yolunu tanımalı');
  assert.ok(panelKaynak.includes("return state.sub === 'ogrenciler' ? '#/plan/ogrenciler' : '#/plan/takvim';"),
    'menü işareti doğru adrese dönmeli');
  const views = fs.readFileSync(require.resolve('../radyo-panel-views.js'), 'utf8');
  assert.ok(views.includes("'plan/ogrenciler'"), 'sayfa başlığı tabloda olmalı');
  assert.ok(views.includes("state.sub === 'ogrenciler' ? ogrenciView") || views.includes("if (state.sub === 'ogrenciler')"),
    'görünüm öğrenci sayfasını çizmeli');
});

test('ekleme iyimser: kayıt düşerse satır hata ile ekranda kalır', () => {
  assert.ok(panelKaynak.includes('ogrenciEkle'), 'ogrenciEkle bulunmalı');
  const m = panelKaynak.match(/async function ogrenciEkle\([\s\S]*?\n  \}/);
  assert.ok(m, 'ogrenciEkle gövdesi bulunmalı');
  assert.ok(/hata: null/.test(m[0]), 'satır hata alanıyla doğmalı');
  assert.ok(/yerel\.hata/.test(m[0]), 'başarısızlık satıra yazılmalı, kaybolmamalı');
});

test('güncelleme yalnız gönderilen alanları yazar', () => {
  const m = panelKaynak.match(/async function ogrenciYazDene\([\s\S]*?\n  \}/);
  assert.ok(m, 'ogrenciYazDene gövdesi bulunmalı');
  assert.ok(/'ad' in veri|'veli' in veri|a in veri/.test(m[0]), 'yalnız gönderilen alanlar yazılmalı');
});

test('öğrenci ekleme tarayıcı prompt() penceresi kullanmaz', () => {
  assert.ok(!/prompt\(/.test(panelKaynak), 'satır içi form kullanılmalı');
});

test('sayfa ogrenciler.js dosyasını yüklüyor ve dosya gerçekten var', () => {
  assert.ok(/ogrenciler\.js\?v=\d+/.test(sayfaKaynak), 'sürümlü script etiketi olmalı');
  const kok = require('node:path').dirname(require.resolve('../radyo-yonetim.html'));
  const yollar = [...sayfaKaynak.matchAll(/<script src="([^"]+)"/g)]
    .map(m => m[1])
    .filter(y => !/^https?:\/\//.test(y))
    .map(y => y.split('?')[0]);
  yollar.forEach(y => assert.ok(fs.existsSync(require('node:path').join(kok, y)), y + ' bulunamadı'));
});

// ---------- Yetki ----------
// Öğrenci listesi de yalnızca yöneticiye görünür: tek RLS kuralı, mevcut
// is_admin() üzerine. Yönetici olmayan oturum boş döner.

test('öğrenci SQL\'i yalnızca yöneticiye açık', () => {
  const sql = fs.readFileSync(require.resolve('../supabase/ogrenciler.sql'), 'utf8');
  assert.match(sql, /create table if not exists public\.ogrenciler/);
  assert.match(sql, /alter table public\.ogrenciler enable row level security/,
    'satır düzeyi güvenlik açık olmalı');
  assert.match(sql, /create policy "ogrenci: yalnizca yonetici" on public\.ogrenciler/);
  assert.match(sql, /create table if not exists public\.ogrenci_kayitlari/,
    'yoklama ve ödeme tablosu da bu dosyada kurulmalı');
  assert.match(sql, /alter table public\.ogrenci_kayitlari enable row level security/);
  assert.match(sql, /create policy "ogrenci kaydi: yalnizca yonetici" on public\.ogrenci_kayitlari/);
  assert.match(sql, /for all to authenticated\s*\n?\s*using \(public\.is_admin\(\)\) with check \(public\.is_admin\(\)\)/,
    'kural yalnızca is_admin() ile çalışmalı');
  assert.ok(!/to anon/.test(sql), 'tablo anon\'a açılmamalı');
  assert.ok(!/using \(true\)|using \(auth\.uid\(\) is not null\)/.test(sql),
    'herkese açık bir kural olmamalı');
  // Mevcut kurallara dokunulmamalı: plan tablosu için kural ya da
  // politika bu dosyada yok (adı açıklamada geçebilir, önemli olan kural).
  assert.ok(!/on public\.plan_maddeleri/.test(sql), 'plan tablosuna kural yazılmamalı');
  assert.ok(!/plan_maddeleri enable row level security/.test(sql), 'plan tablosunun RLS\'i ellememeli');
});
