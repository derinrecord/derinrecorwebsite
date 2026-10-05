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
  assert.ok(h.includes('data-act="plan-madde-ekle"'));
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
  assert.ok(h.includes('data-act="plan-odeme-ekle"'));
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
  ['plan-gun', 'plan-ay', 'plan-madde-ekle', 'plan-odeme-ekle', 'plan-sil', 'plan-isaret', 'plan-katla', 'plan-odeme-aktar', 'plan-not']
    .forEach(act => assert.ok(panelKaynak.includes(act), act + ' işlenmeli'));
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
