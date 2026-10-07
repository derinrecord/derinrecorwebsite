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

// ---------- Hücre detayı ve gün etiketi ----------
// Kareler boş durmasın: günün iş ilerlemesi, ödeme tutarı ve ilk kaydın kısa
// metni hücreye basılır. Detayı görmek için kareye tıklanıp güne girilir.

test('gün bilgisi iş ilerlemesini, ödeme toplamını ve önizlemeyi verir', () => {
  const m = [
    { gun: '2026-10-27', tur: 'madde', metin: 'Fatura gönder', bitti: true },
    { gun: '2026-10-27', tur: 'madde', metin: 'Liste güncelle', bitti: false },
    { gun: '2026-10-27', tur: 'odeme', marka: 'Chemex', tutar: 2000, bitti: false },
    { gun: '2026-10-27', tur: 'not', metin: 'havale bekleniyor', bitti: false }
  ];
  const b = P.gunBilgi(m, '2026-10-27');
  assert.equal(b.isToplam, 2);
  assert.equal(b.isBitti, 1);
  assert.equal(b.odemeToplam, 2000);
  assert.equal(b.odemeAdet, 1);
  assert.equal(b.varNot, true);
  assert.equal(b.onizleme, 'Fatura gönder', 'ilk iş metni önizlenmeli');
});

test('gün bilgisi notu iş saymaz, yalnız önizlemede gösterir', () => {
  const m = [{ gun: '2026-10-27', tur: 'not', metin: 'havale bekleniyor', bitti: false }];
  const b = P.gunBilgi(m, '2026-10-27');
  assert.equal(b.isToplam, 0);
  assert.equal(b.odemeToplam, 0);
  assert.equal(b.varNot, true);
  assert.equal(b.onizleme, 'havale bekleniyor');
});

test('gün etiketi tarihi ve haftanın gününü yazar', () => {
  assert.equal(P.gunEtiketi('2026-10-27'), '27 Ekim 2026 · Salı');
  assert.equal(P.gunEtiketi('2026-10-05'), '5 Ekim 2026 · Pazartesi');
  assert.equal(P.gunEtiketi(''), '');
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

test('ay görünümünde hücre içi detaylar basılır', () => {
  const D2 = ile({ planItems: [
    { id: 'o1', gun: '2026-10-27', tur: 'odeme', marka: 'Chemex', tutar: 2000, bitti: false, metin: '', sira: 0 },
    { id: 'p1', gun: '2026-10-27', tur: 'madde', metin: 'Fatura gönder', bitti: false, sira: 0 }
  ] });
  const h = P.takvimView({ planYil: 2026, planAy: 10 }, D2, UI);
  assert.ok(h.includes('plan-izgara'), 'ay görünümünde ızgara olmalı');
  assert.ok(h.includes('h-tutar'), 'hücrede tutar etiketi olmalı');
  assert.ok(h.includes('2.000 ₺'), 'tutar hücrede görünmeli');
  assert.ok(h.includes('Fatura gönder'), 'ilk kaydın önizlemesi hücrede olmalı');
});

test('güne girilince ay ızgarası yerine gün sekmesi açılır', () => {
  const h = P.takvimView({ planYil: 2026, planAy: 10, planAcikGun: '2026-10-27' }, ile({ planItems: [] }), UI);
  assert.ok(!h.includes('plan-izgara'), 'gün sekmesinde ay ızgarası basılmamalı');
  assert.ok(h.includes('data-act="plan-gun-kapat"'), 'aya dön düğmesi olmalı');
  assert.ok(h.includes('data-act="plan-gun-kaydir"'), 'gün gezinme düğmeleri olmalı');
  assert.ok(h.includes('plan-gun-paneli'), 'gün paneli açılmalı');
  assert.ok(h.includes('27 Ekim 2026 · Salı'), 'başlıkta tarih ve gün olmalı');
});

test('aya dön düğmesi ay adını taşır', () => {
  const h = P.takvimView({ planYil: 2026, planAy: 10, planAcikGun: '2026-10-27' }, ile({ planItems: [] }), UI);
  assert.ok(h.includes('‹ EKİM 2026'), 'geri düğmesi hedef ayı yazmalı');
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

// ---------- Yan liste ↔ ana takvim senkronu ----------
// Abonelikten gelen ödeme hem yandaki listede hem ana takvimde açılan gün
// panelinde görünür. İkisi de aynı işaret kimliğini taşır, yani tek kaydı
// yazar; böylece nerede işaretlerse işaretle ikisi birlikte günceller.

test('gün paneli o günün abonelik ödemesini gösterir', () => {
  const h = P.takvimView({ planYil: 2026, planAy: 10, planAcikGun: '2026-10-27' }, ile({ planItems: [] }), UI);
  assert.ok(h.includes('>abonelik</i>'), 'abonelikten gelen ödeme gün panelinde olmalı');
  assert.ok(h.includes('data-id="2026-10-27:odendi:Chemex:2000"'));
});

test('yandaki liste ve gün paneli aynı işaret kimliğini paylaşır', () => {
  // Senkronun sözleşmesi: iki yerin de yazdığı işaret aynı olmalı. Farklı
  // kimlik olsaydı biri "ödendi" derken diğeri "ödenmedi" yazabilirdi.
  const h = P.takvimView({ planYil: 2026, planAy: 10, planAcikGun: '2026-10-27' }, ile({ planItems: [] }), UI);
  const adet = (h.match(/data-id="2026-10-27:odendi:Chemex:2000"/g) || []).length;
  assert.ok(adet >= 2, 'aynı işaret hem yanda hem gün panelinde olmalı');
});

test('işaretlenince gün panelindeki beklenen satır kalkar', () => {
  const D2 = ile({ planItems: [
    { id: 'o1', gun: '2026-10-27', tur: 'odeme', marka: 'Chemex', tutar: 2000, bitti: true, metin: '', sira: 0 }
  ] });
  const h = P.takvimView({ planYil: 2026, planAy: 10, planAcikGun: '2026-10-27' }, D2, UI);
  assert.ok(!h.includes('>abonelik</i>'), 'işaretlenince beklenen satır kalkmalı');
  assert.ok(h.includes('data-act="plan-isaret"'), 'kaydedilmiş satır kutucuklu görünmeli');
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

// ---------- Satır düzenleme ----------
// Ödeme satırının markası ve tutarı sonradan değiştirilebilir: havale eksik
// ya da geç geldiğinde kayıt gerçeği yansıtsın. Kalem simgesi satırı yerinde
// forma çevirir; düzenleme açıkken normal satır görünümü kaybolur.

test('ödeme satırında düzenle düğmesi çıkar', () => {
  const D2 = ile({ planItems: [
    { id: 'o1', gun: '2026-10-27', tur: 'odeme', marka: 'Chemex', tutar: 2000, bitti: true, metin: '', sira: 0 }
  ] });
  const h = P.takvimView({ planYil: 2026, planAy: 10, planAcikGun: '2026-10-27' }, D2, UI);
  assert.ok(h.includes('data-act="plan-duzenle"'), 'düzenle düğmesi olmalı');
  assert.ok(h.includes('aria-label="Düzenle"'));
});

test('düzenleme açıkken satır yerinde forma dönüşür', () => {
  const D2 = ile({ planItems: [
    { id: 'o1', gun: '2026-10-27', tur: 'odeme', marka: 'Chemex', tutar: 2000, bitti: true, metin: '', sira: 0 }
  ] });
  const h = P.takvimView(
    { planYil: 2026, planAy: 10, planAcikGun: '2026-10-27', planDuzenle: 'o1' }, D2, UI);
  assert.ok(h.includes('data-plan-duzenle="odeme-marka"'), 'marka alanı olmalı');
  assert.ok(h.includes('data-plan-duzenle="odeme-tutar"'), 'tutar alanı olmalı');
  assert.ok(h.includes('data-act="plan-duzenle-kaydet"'), 'kaydet düğmesi olmalı');
  assert.ok(h.includes('data-act="plan-duzenle-kapat"'), 'vazgeç düğmesi olmalı');
  assert.ok(/class="plan-satir[^"]*duzenliyor/.test(h), 'satır düzenleme hâlinde işaretlenmeli');
  assert.ok(!h.includes('data-act="plan-duzenle"'), 'normal satır düğmesi basılmamalı');
});

test('düzenleme formu mevcut marka ve tutarı taşır', () => {
  const D2 = ile({ planItems: [
    { id: 'o1', gun: '2026-10-27', tur: 'odeme', marka: 'Chemex', tutar: 2000, bitti: true, metin: '', sira: 0 }
  ] });
  const h = P.takvimView(
    { planYil: 2026, planAy: 10, planAcikGun: '2026-10-27', planDuzenle: 'o1' }, D2, UI);
  assert.ok(/value="Chemex"/.test(h), 'marka alanı dolu gelmeli');
  assert.ok(/value="2000"/.test(h), 'tutar alanı dolu gelmeli');
});

test('başka satır düzenlenirken bu satır normal kalır', () => {
  const D2 = ile({ planItems: [
    { id: 'o1', gun: '2026-10-27', tur: 'odeme', marka: 'Chemex', tutar: 2000, bitti: false, metin: '', sira: 0 },
    { id: 'o2', gun: '2026-10-27', tur: 'odeme', marka: 'Kira', tutar: 12500, bitti: false, metin: '', sira: 1 }
  ] });
  const h = P.takvimView(
    { planYil: 2026, planAy: 10, planAcikGun: '2026-10-27', planDuzenle: 'o2' }, D2, UI);
  assert.ok(/value="Kira"/.test(h), 'yalnız seçili satır form olmalı');
  assert.ok(h.includes('data-act="plan-duzenle"'), 'diğer satırda düzenle düğmesi kalmalı');
});

test('kaydedilemeyen satırda düzenle düğmesi çıkmaz', () => {
  // Böyle bir satırın gerçek id'si yok (yerel-…); düzenleme yanlış satıra
  // yazardı. Orada zaten "tekrar dene" var.
  const D2 = ile({ planItems: [
    { id: 'yerel-2', gun: '2026-10-27', tur: 'odeme', marka: 'Elle Marka', tutar: 1800, bitti: false, metin: '', sira: 0, hata: 'ağ hatası' }
  ] });
  const h = P.takvimView({ planYil: 2026, planAy: 10, planAcikGun: '2026-10-27' }, D2, UI);
  assert.ok(!h.includes('data-act="plan-duzenle"'), 'hata satırında düzenleme olmamalı');
  assert.ok(h.includes('data-act="plan-tekrar"'));
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
  ['plan-gun', 'plan-gun-kapat', 'plan-gun-kaydir', 'plan-ay', 'plan-yeni', 'plan-yeni-kapat', 'plan-odeme-kaydet', 'plan-duzenle', 'plan-duzenle-kapat', 'plan-duzenle-kaydet', 'plan-sil', 'plan-isaret', 'plan-katla', 'plan-odeme-durum', 'plan-not', 'plan-tekrar']
    .forEach(act => assert.ok(panelKaynak.includes(act), act + ' işlenmeli'));
});

test('düzenleme kaydı marka ve tutarı birlikte yazar', () => {
  // Satır düzenleme, işaret değişikliğinden farklı iki alan taşır. Güncelleme
  // yazıcısı yalnız 'bitti' yazsaydı marka/tutar değişikliği sessizce düşerdi.
  assert.ok(panelKaynak.includes('planDuzenleKaydet'), 'planDuzenleKaydet bulunmalı');
  const m = panelKaynak.match(/async function planYazDene\([\s\S]*?\n  \}/);
  assert.ok(m, 'planYazDene gövdesi bulunmalı');
  assert.ok(/marka/.test(m[0]) && /tutar/.test(m[0]), 'güncelleme marka ve tutarı kapsamalı');
  assert.ok(/'marka' in veri|'tutar' in veri|a in veri/.test(m[0]), 'yalnız gönderilen alanlar yazılmalı');
});

test('düzenleme formunda Enter kaydeder', () => {
  // Alanlar data-id taşımaz; id satırdaki kaydet düğmesinden okunur.
  const m = panelKaynak.match(/document\.addEventListener\('keydown'[\s\S]*?\n  \}\);/);
  assert.ok(m, 'keydown dinleyicisi bulunmalı');
  assert.ok(m[0].includes('data-plan-duzenle'), 'düzenleme alanı yakalanmalı');
  assert.ok(/planDuzenleKaydet/.test(m[0]), 'Enter planDuzenleKaydet çağırmalı');
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

// ---------- Ödeme takip özeti ----------
// Abonelikten gelen ödeme işaretlenince plan_maddeleri'ne bir 'odeme' satırı
// düşer. İki kaynak aynı ödemeyi gösterdiği için tutar iki kez sayılmamalı:
// özet şeridinde "2.000" iki kere toplanırsa tahsilat yanlış okunur.

test('ödeme kalemleri abonelik ve elle satırı tekilleştirir', () => {
  const m = [
    { id: 'o1', gun: '2026-10-27', tur: 'odeme', marka: 'Chemex', tutar: 2000, bitti: true, metin: '', sira: 0 },
    { id: 'x', gun: '2026-10-10', tur: 'odeme', marka: 'Başka', tutar: 500, bitti: false, metin: '', sira: 0 }
  ];
  const k = P.odemeKalemleri(DD, m, '2026-10-05', 400, 400);
  const chemex = k.filter(x => x.marka === 'Chemex');
  assert.equal(chemex.length, 1, 'abonelik ödemesi iki kez sayılmamalı');
  assert.equal(chemex[0].bitti, true, 'işaret elle satırdan okunmalı');
  assert.equal(chemex[0].kaynak, 'abonelik');
  assert.ok(k.some(x => x.marka === 'Başka' && x.kaynak === 'elle'));
});

// Aynı markanın farklı günlerdeki iki ödemesi ayrı kalem kalmalı; tekilleştirme
// yalnız gün + marka aynıyken devreye girer.
test('farklı gün aynı marka iki ayrı kalem', () => {
  const m = [
    { id: 'o1', gun: '2026-10-27', tur: 'odeme', marka: 'Chemex', tutar: 2000, bitti: true, metin: '', sira: 0 },
    { id: 'o2', gun: '2026-11-27', tur: 'odeme', marka: 'Chemex', tutar: 1800, bitti: false, metin: '', sira: 0 }
  ];
  const k = P.odemeKalemleri(DD, m, '2026-10-05', 400, 400).filter(x => x.marka === 'Chemex');
  assert.equal(k.length, 2);
});

test('aylık özet tahsil/bekleyen/gecikmişi sayar', () => {
  const m = [
    { id: 'o1', gun: '2026-10-27', tur: 'odeme', marka: 'Chemex', tutar: 2000, bitti: true, metin: '', sira: 0 },
    { id: 'o2', gun: '2026-10-01', tur: 'odeme', marka: 'Elle', tutar: 500, bitti: false, metin: '', sira: 0 }
  ];
  const o = P.aylikOzet(DD, m, 2026, 10, '2026-10-05');
  assert.equal(o.tahsil, 2000);
  assert.equal(o.tahsilAdet, 1);
  assert.equal(o.bekleyen, 500);
  assert.equal(o.gecikmis, 500, 'günü geçmiş ödenmemiş ödeme gecikmiş sayılmalı');
  assert.equal(o.gecikmisAdet, 1);
});

// Kasım ayında Chemex'in 27 Ekim tahsilatı sayılmamalı: şerit her ay için ayrı.
test('aylık özet yalnız o ayın kalemlerini toplar', () => {
  const m = [{ id: 'o1', gun: '2026-10-27', tur: 'odeme', marka: 'Chemex', tutar: 2000, bitti: true, metin: '', sira: 0 }];
  const o = P.aylikOzet(DD, m, 2026, 11, '2026-10-05');
  assert.equal(o.tahsil, 0);
  assert.equal(o.gecikmis, 0);
});

test('iptal edilmiş abonelik özet sayımına girmez', () => {
  const o = P.aylikOzet(DD, [], 2026, 11, '2026-10-05');
  // Kasım'da yalnız iptal edilmiş starbucks aboneliği var: hiçbir tutar sayılmaz.
  assert.equal(o.toplam, 0);
  assert.equal(o.bekleyen, 0);
});

// ---------- Tahsilat trendi ----------

test('tahsilat trendi son 12 ayı üretir ve yıl toplamını verir', () => {
  const m = [{ id: 'o1', gun: '2026-10-27', tur: 'odeme', marka: 'Chemex', tutar: 2000, bitti: true, metin: '', sira: 0 }];
  const t = P.tahsilatTrendi(DD, m, '2026-10-05', 12);
  assert.equal(t.aylar.length, 12);
  assert.equal(t.aylar[11].onek, '2026-10'); // en yeni ay en sonda
  assert.equal(t.aylar[11].tahsil, 2000);
  assert.equal(t.yil, 2026);
  assert.equal(t.yilToplam, 2000);
  assert.ok(t.enBuyuk >= 2000, 'ölçek en büyük sütuna göre kurulmalı');
});

test('trend yıl sınırını aşar, ocak aralık sırası bozulmaz', () => {
  const t = P.tahsilatTrendi(DD, [], '2026-02-10', 12);
  assert.equal(t.aylar[0].onek, '2025-03');
  assert.equal(t.aylar[11].onek, '2026-02');
});

// ---------- Filtre ----------

test('durum süzgeci ödendi/ödenmedi/gecikmiş ayırır', () => {
  const o = { iso: '2026-10-27', marka: 'Chemex', tutar: 2000 };
  const mOdendi = [{ gun: '2026-10-27', tur: 'odeme', marka: 'Chemex', bitti: true }];
  const mOdenmedi = [{ gun: '2026-10-27', tur: 'odeme', marka: 'Chemex', bitti: false }];
  assert.equal(P.kalemUyuyor(o, mOdendi, { q: '', durum: 'odendi' }, '2026-10-05'), true);
  assert.equal(P.kalemUyuyor(o, mOdendi, { q: '', durum: 'odenmedi' }, '2026-10-05'), false);
  assert.equal(P.kalemUyuyor(o, mOdenmedi, { q: '', durum: 'odenmedi' }, '2026-10-05'), true);
  // Gecikmiş: günü geçmiş ve ödendi işaretlenmemiş.
  const gecmis = { iso: '2026-09-20', marka: 'Chemex', tutar: 2000 };
  assert.equal(P.kalemUyuyor(gecmis, [], { q: '', durum: 'gecikmis' }, '2026-10-05'), true);
  assert.equal(P.kalemUyuyor(o, [], { q: '', durum: 'gecikmis' }, '2026-10-05'), false);
  // Marka araması harf büyüklüğünden bağımsız.
  assert.equal(P.kalemUyuyor(o, [], { q: 'chem', durum: '' }, '2026-10-05'), true);
  assert.equal(P.kalemUyuyor(o, [], { q: 'yok', durum: '' }, '2026-10-05'), false);
});

test('geçmiş süzgeci ödenen ve ödenmeyeni ayırır', () => {
  assert.equal(P.gecmisUyuyor({ marka: 'A', bitti: true }, { q: '', durum: 'odendi' }), true);
  assert.equal(P.gecmisUyuyor({ marka: 'A', bitti: true }, { q: '', durum: 'odenmedi' }), false);
  assert.equal(P.gecmisUyuyor({ marka: 'A', bitti: false }, { q: '', durum: 'gecikmis' }), true);
  assert.equal(P.gecmisUyuyor({ marka: 'Beta', bitti: true }, { q: 'bet', durum: '' }), true);
});

// ---------- Görünüm: özet, filtre, trend ----------

test('özet şeridi, filtre çubuğu ve trend bölümü basılır', () => {
  const m = [{ id: 'o1', gun: '2026-10-27', tur: 'odeme', marka: 'Chemex', tutar: 2000, bitti: true, metin: '', sira: 0 }];
  const h = P.takvimView({ planYil: 2026, planAy: 10 }, ile({ planItems: m }), UI);
  assert.ok(/class="tiles plan-ozet"/.test(h), 'özet şeridi olmalı');
  assert.ok(h.includes('TAHSİL EDİLEN'));
  assert.ok(h.includes('GECİKMİŞ'));
  assert.ok(h.includes('TAHSİLAT TRENDİ (12 AY)'));
  assert.ok(h.includes('data-act="plan-arama"'), 'arama kutusu olmalı');
  assert.ok(h.includes('data-act="plan-durum"'), 'durum süzgeci olmalı');
});

test('durum süzgeci listeyi daraltır ve filtre boş mesajını basar', () => {
  const h = P.takvimView({ planYil: 2026, planAy: 10, planDurum: 'odendi' }, ile({ planItems: [] }), UI);
  // Chemex (27 Ekim) henüz işaretlenmemiş: "ödendi" süzgecinde görünmemeli.
  assert.ok(!h.includes('Chemex'), 'işaretlenmemiş ödeme ödendi süzgecinde olmamalı');
  assert.ok(h.includes('Filtreyle eşleşen bekleyen ödeme yok'));
});

test('marka araması listeyi süzer', () => {
  const h0 = P.takvimView({ planYil: 2026, planAy: 10 }, ile({ planItems: [] }), UI);
  assert.ok(h0.includes('starbucks'), 'süzgeçsiz listede ikinci marka görünmeli');
  const h = P.takvimView({ planYil: 2026, planAy: 10, planAra: 'chem' }, ile({ planItems: [] }), UI);
  assert.ok(h.includes('Chemex'));
  assert.ok(!h.includes('starbucks'));
});

test('panel ödeme süzgeci ve araması eylemlerini karşılıyor', () => {
  assert.ok(panelKaynak.includes('plan-durum'), 'durum süzgeci işlenmeli');
  assert.ok(panelKaynak.includes('plan-arama'), 'arama kutusu işlenmeli');
});

// ---------- Ödeme yöntemi ----------
// Nakit / kart / havale ayrımı hem ekleme hem düzenlemede seçilebilmeli,
// satırda da okunabilmeli. Eski kayıtlarda alan yoktur: veri uydurulmaz,
// rozet hiç basılmaz. Değerler veritabanındaki kontrol listesiyle aynıdır.

test('ödeme ekleme formunda yöntem seçici çıkar', () => {
  const h = P.takvimView(
    { planYil: 2026, planAy: 10, planAcikGun: '2026-10-27', planYeni: 'odeme:2026-10-27' },
    ile({ planItems: [] }), UI);
  assert.ok(h.includes('data-plan-gir="odeme-yontem"'), 'yöntem seçici olmalı');
  ['nakit', 'kart', 'havale'].forEach(k =>
    assert.ok(h.includes(`value="${k}"`), k + ' seçeneği olmalı'));
  assert.ok(/<option value=""[^>]*selected/.test(h), 'varsayılan "belirtilmedi" olmalı');
  // Seçici ayrı form sınıfıyla sarılır: dar ekranda satır kırılsın.
  assert.ok(h.includes('plan-yeni odeme-yeni'), 'ödeme formu kendi sınıfını taşımalı');
});

test('satır düzenleme formunda mevcut yöntem seçili gelir', () => {
  const D2 = ile({ planItems: [
    { id: 'o1', gun: '2026-10-27', tur: 'odeme', marka: 'Kira', tutar: 12500, bitti: true, metin: '', sira: 0, yontem: 'havale' }
  ] });
  const h = P.takvimView(
    { planYil: 2026, planAy: 10, planAcikGun: '2026-10-27', planDuzenle: 'o1' }, D2, UI);
  assert.ok(h.includes('data-plan-duzenle="odeme-yontem"'), 'yöntem seçici olmalı');
  assert.ok(h.includes('<option value="havale" selected>'), 'mevcut yöntem seçili gelmeli');
  assert.ok(!h.includes('<option value="nakit" selected>'), 'yanlış seçenek seçili olmamalı');
});

test('yöntemli satır rozetle gösterilir, methodsiz satır rozetsiz kalır', () => {
  const D2 = ile({ planItems: [
    { id: 'o1', gun: '2026-10-27', tur: 'odeme', marka: 'Chemex', tutar: 2000, bitti: true, metin: '', sira: 0, yontem: 'kart' },
    { id: 'o2', gun: '2026-10-27', tur: 'odeme', marka: 'Kira', tutar: 12500, bitti: false, metin: '', sira: 1 }
  ] });
  const h = P.takvimView({ planYil: 2026, planAy: 10, planAcikGun: '2026-10-27' }, D2, UI);
  assert.ok(h.includes('<i class="yontem-etiket">Kart</i>'), 'yöntem rozeti basılmalı');
  // Kira satırında yöntem yok: eski kayıt olduğu gibi kalmalı.
  const satirlar = h.match(/<li class="plan-satir odeme[^"]*">[\s\S]*?<\/li>/g) || [];
  const kira = satirlar.find(s => s.includes('Kira')) || '';
  assert.ok(kira && !kira.includes('yontem-etiket'), 'methodsiz satır rozet almamalı');
});

test('ödeme geçmişinde yöntem yanına yazılır', () => {
  const D2 = ile({ planItems: [
    { id: 'o1', gun: '2026-10-01', tur: 'odeme', marka: 'Chemex', tutar: 2000, bitti: true, metin: '', sira: 0, yontem: 'nakit' }
  ] });
  const h = P.takvimView({ planYil: 2026, planAy: 10 }, D2, UI);
  assert.ok(h.includes('ödendi · Nakit'), 'geçmişte yöntem yazılmalı');
});

test('yöntem ödeme akışında ve geçmişinde taşınır', () => {
  const m = [{ id: 'o1', gun: '2026-10-01', tur: 'odeme', marka: 'Kira', tutar: 500, bitti: true, metin: '', sira: 0, yontem: 'kart' }];
  const k = P.odemeKalemleri({}, m, '2026-10-05', 400, 400).find(x => x.marka === 'Kira');
  assert.equal(k && k.yontem, 'kart', 'akışta yöntem kaybolmamalı');
  assert.equal(P.odemeGecmisi(m)[0].yontem, 'kart', 'geçmişte yöntem kaybolmamalı');
  // Yöntemsiz kayıt: alan boş kalmalı, uydurulmamalı.
  const bos = [{ id: 'o2', gun: '2026-10-01', tur: 'odeme', marka: 'A', tutar: 1, bitti: false, metin: '', sira: 0 }];
  assert.equal(P.odemeGecmisi(bos)[0].yontem, '');
});

test('yöntem listesi veritabanı kontrolüyle aynı', () => {
  assert.deepEqual(P.ODEME_YONTEMLERI.map(x => x[0]), ['nakit', 'kart', 'havale']);
  assert.equal(P.yontemEtiket('havale'), 'Havale');
  assert.equal(P.yontemEtiket(''), '', 'belirtilmemiş yöntemin etiketi olmamalı');
  assert.equal(P.yontemEtiket('bozuk'), '', 'tanınmayan değer etiketlenmemeli');
  const sql = fs.readFileSync(require.resolve('../supabase/plan-takvimi.sql'), 'utf8');
  P.ODEME_YONTEMLERI.forEach(([k]) =>
    assert.ok(sql.includes(`'${k}'`), `SQL kontrolü '${k}' içermeli`));
});

test('plan_maddeleri yöntem kolonunu ve yükseltme cümlesini taşıyor', () => {
  const sql = fs.readFileSync(require.resolve('../supabase/plan-takvimi.sql'), 'utf8');
  // Kolon + kısıt...
  assert.match(sql, /yontem text check \(yontem is null or yontem in \('nakit', 'kart', 'havale'\)\)/);
  // ...ve kurulu veritabanı için yükseltme: create table if not exists kolon eklemez.
  assert.match(sql, /add column if not exists yontem text/);
  assert.match(sql, /plan_maddeleri_yontem_ck/);
  // Yetki değişmedi: kural yalnız is_admin(), RLS'e dokunulmamalı.
  assert.match(sql, /create policy "plan: yalnizca yonetici"[\s\S]*?using \(public\.is_admin\(\)\) with check \(public\.is_admin\(\)\)/);
});

test('panel yöntemi yazıyor ve eksik kolonu anlaşılır söylüyor', () => {
  const yazici = panelKaynak.match(/async function planYazDene\([\s\S]*?\n  \}/);
  assert.ok(yazici, 'planYazDene gövdesi bulunmalı');
  assert.ok(/'yontem'/.test(yazici[0]), 'güncelleme yontem alanını da kapsamalı');
  // Her iki form da yöntemi okur; önekleri ayrı, çünkü ikisi aynı anda açık.
  const gir = panelKaynak.match(/function planGirOdeme\([\s\S]*?\n  \}/);
  assert.ok(gir && /yontem: planYontemOku\('gir'\)/.test(gir[0]), 'ekleme yöntemi okumalı');
  const duzenle = panelKaynak.match(/async function planDuzenleKaydet\([\s\S]*?\n  \}/);
  assert.ok(duzenle && /yontem: planYontemOku\('duzenle'\)/.test(duzenle[0]), 'düzenleme yöntemi okumalı');
  assert.ok(panelKaynak.includes("hata.code === '42703'"), 'eksik kolon hatası ayırt edilmeli');
  assert.ok(panelKaynak.includes('plan-takvimi.sql'), 'eksik kolonda çalıştırılacak dosya söylenmeli');
  // Yeniden denemede de yöntem kaybolmamalı.
  const tekrar = panelKaynak.match(/case 'plan-tekrar'[\s\S]*?\n      \}/);
  assert.ok(tekrar && /yontem: satir\.yontem/.test(tekrar[0]), 'tekrar denemede yöntem taşınmalı');
});
