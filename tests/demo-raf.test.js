// Ana sayfa demo rafı (9 Kasım 2026): branş kasetleri ilk ekranın hemen altında,
// yana kaydırılan raf; kasete tıklanınca altta o branşın demo listesi açılır
// (sarı çubuk dalga + alttaki çalar), mekân demolarıyla aynı anda çalmaz.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const oku = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const DR = require('../demo-raf.js');

test('grupla: branşa göre, sira sonra eklenme sırasıyla; adresi olmayan ve bilinmeyen branş atlanır', () => {
  const g = DR.grupla([
    { id: 1, brans: 'artistik', baslik: 'B', sira: 2, created_at: '2026-01-02', medya_url: 'https://muzik.derinrecord.com/demo/b.wav' },
    { id: 2, brans: 'artistik', baslik: 'A', sira: 1, created_at: '2026-01-03', medya_url: 'https://muzik.derinrecord.com/demo/a.wav' },
    { id: 3, brans: 'aerobik', baslik: 'X', sira: 0, medya_url: '' },
    { id: 4, brans: 'baska', baslik: 'Y', sira: 0, medya_url: 'https://muzik.derinrecord.com/demo/y.wav' },
    { id: 5, brans: 'aerobik', baslik: 'Z', sira: 0, medya_url: 'javascript:alert(1)' }
  ]);
  assert.deepEqual(g.artistik.map(d => d.baslik), ['A', 'B']);
  assert.deepEqual(g.aerobik, []);
  assert.equal(g.baska, undefined);
  assert.deepEqual(Object.keys(g), DR.BRANSLAR);
});

test('bransBul: kart sınıfından ya da bağlantısından branş', () => {
  assert.equal(DR.bransBul('cassette-card renk-cocuk-fitness', ''), 'cocuk-fitness');
  assert.equal(DR.bransBul('cassette-card', 'ritmik.html'), 'ritmik');
  assert.equal(DR.bransBul('cassette-card', 'https://kotu.example'), null);
  assert.equal(DR.BRANS_AD['cocuk-fitness'], 'ÇOCUK FITNESS');
});

test('ana sayfa: demo bölümü giriş ekranının hemen altında; betik ve stil yüklü', () => {
  const h = oku('index.html');
  const hero = h.indexOf('<section class="hero"'), heroSon = h.indexOf('</section>', hero), demo = h.indexOf('id="demolar"');
  assert.ok(demo > heroSon && demo < h.indexOf('id="kurumsal"'), 'demolar kurumsaldan önce, girişten sonra');
  assert.ok(h.slice(heroSon, demo).split('<section').length === 2, 'arada başka bölüm yok');
  assert.match(h, /demo-raf\.css\?v=\d+/);
  assert.match(h, /demo-raf\.js\?v=\d+/);
  assert.ok(h.indexOf('mekan-vitrini-yardim.js') < h.indexOf('demo-raf.js'), 'dalga çizimi için yardımcı önce yüklenir');
  const j = oku('demo-raf.js');
  assert.match(j, /from\('demo_parcalari'\)/);
  assert.match(j, /MV\.cubukSvg\(/);
});

test('çalarlar birbirini susturur: mekân ve branş demosu aynı anda çalmaz', () => {
  for (const [f, kaynak] of [['mekan-vitrini.js', 'mekan'], ['demo-raf.js', 'brans']]) {
    const j = oku(f);
    assert.match(j, new RegExp("new CustomEvent\\('derin:calar', \\{ detail: \\{ kaynak: '" + kaynak + "' \\} \\}\\)"));
    assert.match(j, /addEventListener\('derin:calar'/);
  }
});

test('SQL: demo tablosuna dalga ve süre; yalnız sütun, RLS değişmez', () => {
  const s = oku('supabase/demo-dalga.sql');
  assert.match(s, /alter table public\.demo_parcalari\s+add column if not exists dalga smallint\[\]/);
  assert.match(s, /add column if not exists sure integer/);
  assert.match(s, /cardinality\(dalga\) <= 1200/);
  assert.doesNotMatch(s, /create policy|drop policy|disable row level/);
});

test('branş sayfası: yönetici açınca dalgası olmayan demoların dalgası ve süresi çıkarılıp kaydedilir', () => {
  const j = oku('demo-parcalar.js');
  assert.match(j, /DerinSesDalga\.cikar\(/);
  assert.match(j, /update\(\{ dalga, sure \}\)\.eq\('id', d\.id\)\.select\('id'\)/);
  const sd = oku('ses-dalga.js');
  assert.match(sd, /decodeAudioData/);
  assert.match(sd, /MV\.ustAlt\(/);
  for (const b of ['aerobik', 'akrobatik', 'artistik', 'ritmik', 'cocuk-fitness']) {
    const h = oku(b + '.html');
    assert.ok(h.indexOf('mekan-vitrini-yardim.js') >= 0 && h.indexOf('ses-dalga.js') >= 0, b + ': dalga betikleri');
    assert.ok(h.indexOf('ses-dalga.js') < h.indexOf('demo-parcalar.js'), b + ': ses-dalga önce');
  }
});

test('demo listesi: oynat düğmesi satırın solunda (ilk sütun)', () => {
  const j = oku('demo-raf.js');
  const satir = j.slice(j.indexOf('<div class="mv-s"'), j.indexOf('</div>`', j.indexOf('<div class="mv-s"')));
  assert.ok(satir.indexOf('class="mv-cal"') >= 0 && satir.indexOf('class="mv-cal"') < satir.indexOf('dr-no'), 'düğme numaradan önce');
  const c = oku('demo-raf.css');
  assert.match(c, /\.dr-liste \.mv-s\{grid-template-columns:40px 150px 1fr 1\.3fr 52px\}/);
  assert.match(c, /\.dr-liste \.mv-s\{grid-template-columns:36px auto 1fr\}/);
});
