const test = require('node:test');
const assert = require('node:assert/strict');

const P = require('../plan-takvim.js');

// ---------- Ay ızgarası ----------
// Takvim her zaman 6 hafta basar: ay kısa da olsa uzun da olsa ekran
// zıplamaz. Pazartesi başlangıcı Türkiye'deki alışkanlık.

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

// ---------- Gün özeti ----------
// Takvim hücresindeki rozet: o günde kaç iş var, kaçı bitmiş. Not bir iş
// değildir, sayıma girmemeli.

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

// ---------- Yaklaşan ödemeler ----------
// Aboneliklerden canlı okunur, plan_maddeleri'nde tutulmaz. Abonelik tarihi
// değişince takvim de değişsin diye.

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

// ---------- Görünüm ----------
// takvimView DOM'a dokunmaz, HTML metni döndürür. Böylece burada sınanabiliyor.

const UI = { now: () => Date.parse('2026-10-05T09:00:00Z') };
const ile = (ek) => Object.assign({}, DD, ek);

test('görünüm ayın günlerini ve rozeti basar', () => {
  const D2 = ile({ planItems: [
    { id: 'p1', gun: '2026-10-27', tur: 'madde', metin: 'Chemex ara', bitti: false, sira: 0 },
    { id: 'p2', gun: '2026-10-27', tur: 'madde', metin: 'Fatura', bitti: true, sira: 1 }
  ] });
  const h = P.takvimView({ planYil: 2026, planAy: 10 }, D2, UI);
  assert.ok(h.includes('data-act="plan-gun"'));
  assert.ok(h.includes('data-id="2026-10-27"'));
  assert.ok(h.includes('1/2'));
});

test('açık günün maddeleri ve notu görünür', () => {
  const D2 = ile({ planItems: [
    { id: 'p1', gun: '2026-10-27', tur: 'madde', metin: 'Chemex ara', bitti: false, sira: 0 },
    { id: 'p9', gun: '2026-10-27', tur: 'not', metin: 'havale bekleniyor', bitti: false, sira: 0 }
  ] });
  const h = P.takvimView({ planYil: 2026, planAy: 10, planAcikGun: '2026-10-27' }, D2, UI);
  assert.ok(h.includes('Chemex ara'));
  assert.ok(h.includes('havale bekleniyor'));
  assert.ok(h.includes('data-act="plan-yeni"'));
});

test('metindeki HTML kaçırılır', () => {
  const D2 = ile({ planItems: [
    { id: 'p1', gun: '2026-10-27', tur: 'madde', metin: '<script>x</script>', bitti: false, sira: 0 }
  ] });
  const h = P.takvimView({ planYil: 2026, planAy: 10, planAcikGun: '2026-10-27' }, D2, UI);
  assert.ok(!h.includes('<script>x</script>'));
  assert.ok(h.includes('&lt;script&gt;'));
});

test('yaklaşan ödemeler sütunu basılır', () => {
  const h = P.takvimView({ planYil: 2026, planAy: 10 }, ile({ planItems: [] }), UI);
  assert.ok(h.includes('Chemex'));
  assert.ok(h.includes('2.000'));
});

test('elle eklenen ödeme satırı silinebilir ve işaretlenebilir', () => {
  const D2 = ile({ planItems: [
    { id: 'o1', gun: '2026-10-27', tur: 'odeme', marka: 'Elle Marka', tutar: 1800, bitti: true, metin: '', sira: 0 }
  ] });
  const h = P.takvimView({ planYil: 2026, planAy: 10, planAcikGun: '2026-10-27' }, D2, UI);
  assert.ok(h.includes('Elle Marka'));
  assert.ok(h.includes('1.800'));
  assert.ok(h.includes('data-act="plan-sil"'));
  assert.ok(h.includes('data-act="plan-isaret"'));
  assert.ok(h.includes('data-act="plan-yeni"'));
});

test('katlanmış bölümün içeriği basılmaz, başlığı kalır', () => {
  const D2 = ile({ planItems: [
    { id: 'p1', gun: '2026-10-27', tur: 'madde', metin: 'gizlenecek', bitti: false, sira: 0 }
  ] });
  const acik = P.takvimView({ planYil: 2026, planAy: 10, planAcikGun: '2026-10-27', planKatli: [] }, D2, UI);
  const katli = P.takvimView({ planYil: 2026, planAy: 10, planAcikGun: '2026-10-27', planKatli: ['maddeler'] }, D2, UI);
  assert.ok(acik.includes('gizlenecek'));
  assert.ok(!katli.includes('gizlenecek'));
  assert.ok(katli.includes('data-act="plan-katla"'));
});

test('planItems yoksa çökmez', () => {
  const h = P.takvimView({ planYil: 2026, planAy: 10 }, { brands: [], plans: [], subscriptions: [] }, UI);
  assert.ok(h.includes('data-act="plan-gun"'));
});

// ---------- Satır içi ekleme ----------
// Tarayıcının prompt() penceresi yok: düğmeye basınca panelin içinde yazı
// alanı açılır. Odak panelde kalır, dokunmatikte de çalışır.

test('satır içi madde formu açılınca yazı alanı basılır', () => {
  const h = P.takvimView(
    { planYil: 2026, planAy: 10, planAcikGun: '2026-10-27', planYeni: 'madde:2026-10-27' },
    ile({ planItems: [] }), UI);
  assert.ok(h.includes('data-plan-gir="madde"'), 'madde yazı alanı olmalı');
  assert.ok(h.includes('data-act="plan-yeni-kapat"'), 'vazgeç düğmesi olmalı');
});

test('satır içi ödeme formu marka ve tutar alanı basar', () => {
  const h = P.takvimView(
    { planYil: 2026, planAy: 10, planAcikGun: '2026-10-27', planYeni: 'odeme:2026-10-27' },
    ile({ planItems: [] }), UI);
  assert.ok(h.includes('data-plan-gir="odeme-marka"'), 'marka alanı olmalı');
  assert.ok(h.includes('data-plan-gir="odeme-tutar"'), 'tutar alanı olmalı');
  assert.ok(h.includes('data-act="plan-odeme-kaydet"'), 'ekle düğmesi olmalı');
});

test('başka gün için açık form o güne basılmaz', () => {
  const h = P.takvimView(
    { planYil: 2026, planAy: 10, planAcikGun: '2026-10-27', planYeni: 'madde:2026-10-28' },
    ile({ planItems: [] }), UI);
  assert.ok(!h.includes('data-plan-gir="madde"'), 'form kapalı kalmalı');
});

// ---------- Kaydedilemedi durumu ----------
// Kayıt düşerse satır silinmez: metin ekranda durur, satır kırmızı işaretlenir
// ve altında "tekrar dene" belirir. Sessiz kayıp yok.

test('kaydedilemeyen madde silinmez, tekrar dene ile işaretlenir', () => {
  const D2 = ile({ planItems: [
    { id: 'yerel-1', gun: '2026-10-27', tur: 'madde', metin: 'Chemex ara', bitti: false, sira: 0, hata: 'ağ hatası' }
  ] });
  const h = P.takvimView({ planYil: 2026, planAy: 10, planAcikGun: '2026-10-27' }, D2, UI);
  assert.ok(h.includes('Chemex ara'), 'metin ekranda kalmalı');
  assert.ok(h.includes('kaydedilemedi — tekrar dene'));
  assert.ok(h.includes('data-act="plan-tekrar"'));
  assert.ok(/class="plan-satir[^"]*hata/.test(h), 'satır hata olarak işaretlenmeli');
});

test('kaydedilemeyen ödeme satırı da işaretlenir, tutarı korunur', () => {
  const D2 = ile({ planItems: [
    { id: 'yerel-2', gun: '2026-10-27', tur: 'odeme', marka: 'Elle Marka', tutar: 1800, bitti: false, metin: '', sira: 0, hata: 'ağ hatası' }
  ] });
  const h = P.takvimView({ planYil: 2026, planAy: 10, planAcikGun: '2026-10-27' }, D2, UI);
  assert.ok(h.includes('Elle Marka'));
  assert.ok(h.includes('1.800'));
  assert.ok(h.includes('data-act="plan-tekrar"'));
});

test('hatasız satırda tekrar dene düğmesi çıkmaz', () => {
  const D2 = ile({ planItems: [
    { id: 'p1', gun: '2026-10-27', tur: 'madde', metin: 'Chemex ara', bitti: false, sira: 0 }
  ] });
  const h = P.takvimView({ planYil: 2026, planAy: 10, planAcikGun: '2026-10-27' }, D2, UI);
  assert.ok(!h.includes('data-act="plan-tekrar"'));
});

// ---------- Ödeme işareti ve geçmiş ----------
// Abonelikten gelen ödemeler canlı okunur; ödendi/ödenmedi işareti ise
// plan_maddeleri'ne bir 'odeme' satırı yazar. Böylece geçmişe bakınca kimin
// ödediği kalıcı olarak görülür.

test('yaklaşan ödeme satırında ödendi/ödenmedi düğmeleri basılır', () => {
  const h = P.takvimView({ planYil: 2026, planAy: 10 }, ile({ planItems: [] }), UI);
  assert.ok(h.includes('data-act="plan-odeme-durum"'), 'işaret düğmesi olmalı');
  assert.ok(h.includes('>ödendi</button>'));
  assert.ok(h.includes('>ödenmedi</button>'));
});

test('işaretlenmiş ödeme sütunda seçili gelir', () => {
  const D2 = ile({ planItems: [
    { id: 'o1', gun: '2026-10-27', tur: 'odeme', marka: 'Chemex', tutar: 2000, bitti: true, metin: '', sira: 0 }
  ] });
  const h = P.takvimView({ planYil: 2026, planAy: 10 }, D2, UI);
  assert.ok(/d-odendi secili/.test(h), 'ödendi işareti seçili görünmeli');
  assert.ok(!/d-odenmedi secili/.test(h));
});

test('işaretlenmiş ödeme satırı ve kutusu birlikte işaretli görünür', () => {
  // Kullanıcının istediği: kutu altınsa satırın kendisi de işaretli olmalı,
  // yalnız düğme değil. Ödendi → altın kutu ✓ ve satır altın.
  const D2 = ile({ planItems: [
    { id: 'o1', gun: '2026-10-27', tur: 'odeme', marka: 'Chemex', tutar: 2000, bitti: true, metin: '', sira: 0 }
  ] });
  const h = P.takvimView({ planYil: 2026, planAy: 10 }, D2, UI);
  assert.ok(/<li class="[^"]*odendi[^"]*">/.test(h), 'satır odendi sınıfı taşımalı');
  assert.ok(/<i class="kutu odendi"[^>]*>✓<\/i>/.test(h), 'kutu altın ve işaretli olmalı');
});

test('ödenmedi işaretli ödeme kırmızı kutu ve satırla görünür', () => {
  const D2 = ile({ planItems: [
    { id: 'o1', gun: '2026-10-27', tur: 'odeme', marka: 'Chemex', tutar: 2000, bitti: false, metin: '', sira: 0 }
  ] });
  const h = P.takvimView({ planYil: 2026, planAy: 10 }, D2, UI);
  assert.ok(/<li class="[^"]*odenmedi[^"]*">/.test(h));
  assert.ok(/<i class="kutu odenmedi"[^>]*>×<\/i>/.test(h));
});

test('işaretlenmemiş ödemede kutu boş kalır', () => {
  const h = P.takvimView({ planYil: 2026, planAy: 10 }, ile({ planItems: [] }), UI);
  assert.ok(h.includes('<i class="kutu" aria-hidden="true"></i>'), 'boş kutucuk olmalı');
});

test('günü geçmiş ve işaretlenmemiş ödeme listede kalır ve gecikmiş görünür', () => {
  // Abonelik dönemi geçmişte; satır kaybolmamalı, yoksa işaretlemek
  // imkânsızlaşır ve ödemenin yapılıp yapılmadığı kayda geçmez.
  const DD2 = Object.assign({}, DD, { subscriptions: [
    { brand_id: 'b1', plan_id: 'tek', branch_count: 1, current_end: '2026-09-20T00:00:00Z', canceled_at: null }
  ] });
  const o = P.yaklasanOdemeler(DD2, '2026-10-05', 60);
  assert.equal(o.length, 1, 'geçmiş dönem listede olmalı');
  assert.equal(o[0].gecmis, true);
  const h = P.takvimView({ planYil: 2026, planAy: 9 }, Object.assign(DD2, { planItems: [] }), UI);
  assert.ok(h.includes('gecikmis'), 'işaretlenmemiş geçmiş ödeme vurgulanmalı');
});

test('ödeme durumu gün ve marka eşleşmesinden bulunur', () => {
  const m = [
    { gun: '2026-10-27', tur: 'odeme', marka: 'Chemex', bitti: true },
    { gun: '2026-11-28', tur: 'odeme', marka: 'starbucks', bitti: false }
  ];
  assert.equal(P.odemeDurumu(m, { iso: '2026-10-27', marka: 'Chemex' }), 'odendi');
  assert.equal(P.odemeDurumu(m, { iso: '2026-11-28', marka: 'starbucks' }), 'odenmedi');
  assert.equal(P.odemeDurumu(m, { iso: '2026-10-27', marka: 'Başka' }), null);
  assert.equal(P.odemeDurumu(null, { iso: '2026-10-27', marka: 'Chemex' }), null);
});

test('ödeme geçmişi en yeni gün en üstte, özet doğru sayar', () => {
  const m = [
    { id: 'a', gun: '2026-10-27', tur: 'odeme', marka: 'Chemex', tutar: 2000, bitti: true },
    { id: 'b', gun: '2026-09-20', tur: 'odeme', marka: 'Uzak', tutar: 6000, bitti: false },
    { id: 'c', gun: '2026-09-20', tur: 'madde', metin: 'iş', bitti: false }
  ];
  const g = P.odemeGecmisi(m);
  assert.deepEqual(g.map(x => x.gun), ['2026-10-27', '2026-09-20'], 'yalnız ödemeler, yeni önce');
  assert.deepEqual(P.odemeOzeti(m), { toplam: 2, odendi: 1, odenmedi: 1 });
});

test('ödeme geçmişi bölümü işaretli ödemeleri basar', () => {
  const D2 = ile({ planItems: [
    { id: 'o1', gun: '2026-10-27', tur: 'odeme', marka: 'Chemex', tutar: 2000, bitti: true, metin: '', sira: 0 },
    { id: 'o2', gun: '2026-09-20', tur: 'odeme', marka: 'Uzak', tutar: 6000, bitti: false, metin: '', sira: 0 }
  ] });
  const h = P.takvimView({ planYil: 2026, planAy: 10 }, D2, UI);
  assert.ok(h.includes('ÖDEME GEÇMİŞİ'));
  assert.ok(h.includes('2 kayıt · 1 ödendi · 1 ödenmedi'));
  assert.ok(/class="plan-gecmis"/.test(h), 'geçmiş sarmalayıcısı olmalı (CSS buna bağlı)');
  assert.ok(h.includes('plan-gecmis-liste'));
  assert.ok(h.includes('Chemex'));
  assert.ok(h.includes('Uzak'));
});

test('işaretlenmiş ödeme yokken geçmiş bölümü yönlendirir, çökmez', () => {
  const h = P.takvimView({ planYil: 2026, planAy: 10 }, ile({ planItems: [] }), UI);
  assert.ok(h.includes('Henüz işaretlenmiş ödeme yok'));
  assert.ok(!h.includes('plan-gecmis-liste'));
});

// ---------- Panele bağlanma ----------
// Takvimin gövdesi ayrı dosyada; panele yalnız birkaç satırla tanıtılıyor.
// Bu testler o bağlantının kopmadığını kaynak üzerinden doğrular.

const fs = require('node:fs');
const viewsKaynak = fs.readFileSync(require.resolve('../radyo-panel-views.js'), 'utf8');
const panelKaynak = fs.readFileSync(require.resolve('../radyo-yonetim.js'), 'utf8');
const sayfaKaynak = fs.readFileSync(require.resolve('../radyo-yonetim.html'), 'utf8');

test('panel plan bölümünü tanıyor', () => {
  assert.ok(viewsKaynak.includes("'plan/takvim'"), 'plan bölümünün başlığı olmalı');
  assert.ok(viewsKaynak.includes("oge('plan'"), 'menüde plan satırı olmalı');
  assert.ok(viewsKaynak.includes('DerinPlan'), 'görünüm plan-takvim.js modülüne bağlanmalı');
});

test('panel plan verisini yüklüyor', () => {
  assert.ok(panelKaynak.includes("from('plan_maddeleri')"), 'plan_maddeleri sorgulanmalı');
  assert.ok(panelKaynak.includes('planItems'), 'veri D.planItems olarak taşınmalı');
});

test('panel plan eylemlerini karşılıyor', () => {
  // plan-not bir tıklama değil, metin alanı: switch yerine yazma
  // dinleyicisinde seçiciyle yakalanıyor. Bu yüzden tırnak türüne
  // bakmıyoruz — önemli olan eylemin karşılanması.
  ['plan-gun', 'plan-ay', 'plan-yeni', 'plan-yeni-kapat', 'plan-odeme-kaydet', 'plan-sil', 'plan-isaret', 'plan-katla', 'plan-odeme-durum', 'plan-not', 'plan-tekrar']
    .forEach(act => assert.ok(panelKaynak.includes(act), act + ' işlenmeli'));
});

test('plan ekleme tarayıcı prompt() penceresi kullanmaz', () => {
  // prompt() bloklar, odak kaybettirir ve dokunmatikte kötü durur. Ekleme
  // panelin içindeki satır içi formla yapılmalı.
  assert.ok(!/prompt\(/.test(panelKaynak), 'satır içi form kullanılmalı');
});

test('ekleme iyimser: kayıt düşerse satır hata ile ekranda kalır', () => {
  assert.ok(panelKaynak.includes('planEkle'), 'planEkle bulunmalı');
  const m = panelKaynak.match(/async function planEkle\([\s\S]*?\n  \}/);
  assert.ok(m, 'planEkle gövdesi bulunmalı');
  assert.ok(/hata: null/.test(m[0]), 'satır hata alanıyla doğmalı');
  assert.ok(/yerel\.hata/.test(m[0]), 'başarısızlık satıra yazılmalı, kaybolmamalı');
});

test('plan yazması ekranı yeniden çiziyor', () => {
  // yenile(true) "sessiz" moddur: yalnız yan menüyü tazeler, içeriği çizmez.
  // Arka plan yoklaması için doğru, ama kullanıcı bir madde eklediğinde
  // ekranda hiçbir şey olmaz — kayıt gider, liste eski kalır.
  const m = panelKaynak.match(/async function planYaz\([\s\S]*?\n  \}/);
  assert.ok(m, 'planYaz bulunmalı');
  // Yorum satırları çıkarılır: aranan şey çağrının kendisi, ondan söz eden
  // bir açıklama değil.
  const kod = m[0].replace(/^\s*\/\/.*$/gm, '');
  assert.ok(!/yenile\(true\)/.test(kod), 'sessiz yenileme kullanılmamalı');
  assert.ok(/yenile\(\)/.test(kod), 'tam yenileme çağrılmalı');
});

test('plan rotası adres tablosunda tanımlı', () => {
  // #/plan/takvim adresi tabloda yoksa sayfa sessizce "canlı durum"a düşer:
  // menüde Takvim görünür, içerik başka bir bölüm olur.
  const m = panelKaynak.match(/const ROTALAR = (\{[\s\S]*?\n  \});/);
  assert.ok(m, 'ROTALAR tablosu bulunmalı');
  const R = eval('(' + m[1] + ')');
  assert.deepEqual(R.plan, { nav: 'plan', sub: 'takvim' });
});

test('plan görünümü kendi adresini yazıyor', () => {
  // gorunumHash() plan'ı tanımazsa menüden Takvim'e basmak #/markalar'a
  // yönlendirir ve bölüm hiç açılmaz.
  const m = panelKaynak.match(/function gorunumHash\(\)[\s\S]*?\n  \}/);
  assert.ok(m, 'gorunumHash bulunmalı');
  assert.ok(/'#\/plan\/takvim'/.test(m[0]), 'plan için adres döndürmeli');
});

test('sayfa plan-takvim.js dosyasını yüklüyor', () => {
  assert.ok(/plan-takvim\.js/.test(sayfaKaynak), 'script etiketi olmalı');
});

test('paneldeki her script dosyası gerçekten var', () => {
  // Yanlış yazılmış ya da eklenmeyi unutulmuş bir script etiketi tarayıcıda
  // sessizce 404 olur ve ilgili bölüm hiç açılmaz. Burada erken yakalanır.
  const kok = require('node:path').dirname(require.resolve('../radyo-yonetim.html'));
  const yollar = [...sayfaKaynak.matchAll(/<script src="([^"]+)"/g)]
    .map(m => m[1])
    .filter(y => !/^https?:\/\//.test(y))
    .map(y => y.split('?')[0]);
  assert.ok(yollar.length > 3, 'script etiketleri bulunmalı');
  yollar.forEach(y => assert.ok(fs.existsSync(require('node:path').join(kok, y)), y + ' bulunamadı'));
});

// ---------- Yetki ----------
// Derin'in planları yalnızca ona görünür. Antrenör, kahve markası ve şube
// cihazı bu tabloyu hiç görmez — yasak hatası bile almaz, boş döner. Bu,
// tek bir RLS kuralıyla mevcut is_admin() üzerine kurulur; yeni bir yetki
// mekanizması yok. Test, kaynağı okuyup kuralın gerçekten öyle olduğunu
// doğrular (mevcut radio-management-render.test.js kalıbı).
test('plan takvimi SQL\'i yalnızca yöneticiye açık', () => {
  const sql = fs.readFileSync(require.resolve('../supabase/plan-takvimi.sql'), 'utf8');
  assert.match(sql, /create table if not exists public\.plan_maddeleri/);
  assert.match(sql, /check \(tur in \('madde', 'not', 'odeme'\)\)/, 'türler sınırlı olmalı');
  assert.match(sql, /alter table public\.plan_maddeleri enable row level security/,
    'satır düzeyi güvenlik açık olmalı');
  assert.match(sql, /create policy "plan: yalnizca yonetici" on public\.plan_maddeleri/);
  assert.match(sql, /for all to authenticated\s*\n?\s*using \(public\.is_admin\(\)\) with check \(public\.is_admin\(\)\)/,
    'kural yalnızca is_admin() ile çalışmalı');
  // Cihaz (anon) ve girişsiz erişim olmamalı: veri sızmasın.
  assert.ok(!/to anon/.test(sql), 'tablo anon\'a açılmamalı');
  assert.ok(!/using \(true\)|using \(auth\.uid\(\) is not null\)/.test(sql),
    'herkese açık bir kural olmamalı');
});

test('günde tek not veritabanında da tek: kısmi tekil indeks var', () => {
  // Arayüz ekle-ya-da-güncelle yapsa da, iki not kaydı düşememeli. Kısmi
  // tekil indeks bunu veritabanında garanti eder.
  const sql = fs.readFileSync(require.resolve('../supabase/plan-takvimi.sql'), 'utf8');
  assert.match(sql, /create unique index if not exists plan_maddeleri_gunluk_not_idx[\s\S]*?where tur = 'not'/);
});
