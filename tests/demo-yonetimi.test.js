// Demo şarkı yönetimi (24 Ekim): branş sayfasında yalnız yönetici demo ekler/siler.
// Demolar veritabanından (demo_parcalari) gelir; sitede duran 4 demo aynı
// anahtarlarla taşınır ki erişimler ve antrenör notları korunsun.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const KOK = path.join(__dirname, '..');
const oku = d => fs.readFileSync(path.join(KOK, d), 'utf8');
const D = require('../demo-yardim.js');

// ---------- Saf yardımcılar ----------
test('demo anahtarı: branş + Türkçe harfsiz ad + kısa ek', () => {
  assert.equal(D.demoAnahtari('ritmik', 'Çiçek Dansı Ğüş', 'ab12'), 'ritmik-cicek-dansi-gus-ab12');
  assert.equal(D.demoAnahtari('aerobik', '   ', 'x9'), 'aerobik-demo-x9');
  assert.ok(D.demoAnahtari('artistik', 'a'.repeat(200), 'k').length <= 70);
});

test('dosya türü: ses ya da mp4 video; başka şey reddedilir', () => {
  assert.equal(D.dosyaTuru({ name: 'a.wav', type: 'audio/wav' }), 'audio');
  assert.equal(D.dosyaTuru({ name: 'a.mp3', type: '' }), 'audio');
  assert.equal(D.dosyaTuru({ name: 'a.m4a', type: 'audio/x-m4a' }), 'audio');
  assert.equal(D.dosyaTuru({ name: 'v.mp4', type: 'video/mp4' }), 'video');
  assert.equal(D.dosyaTuru({ name: 'x.pdf', type: 'application/pdf' }), null);
  assert.equal(D.dosyaTuru(null), null);
});

test('R2 yolu: branş klasörü + anahtar + uzantı', () => {
  assert.equal(D.r2Yolu('ritmik', 'ritmik-x-ab', 'Şarkı.WAV'), 'ritmik/ritmik-x-ab.wav');
  assert.equal(D.r2Yolu('aerobik', 'aerobik-y', 'dosya'), 'aerobik/aerobik-y.bin');
});

test('medya adresi: tam adres ya da site içi yol; tehlikeli şema yok', () => {
  assert.equal(D.guvenliAdres('assets/audio/a.wav'), 'assets/audio/a.wav');
  assert.equal(D.guvenliAdres('https://muzik.derinrecord.com/demo/a.wav'), 'https://muzik.derinrecord.com/demo/a.wav');
  assert.equal(D.guvenliAdres('javascript:alert(1)'), '');
  assert.equal(D.guvenliAdres('//kotu.com/a.wav'), '');
});

test('kaset HTML: başlık ve not kaçışlı; oynatıcı ve medya bağlı; yöneticiye SİL', () => {
  const demo = { id: 'u-1', demo_key: 'ritmik-x', brans: 'ritmik', baslik: '<b>X</b>', not_metni: 'Not "1"', medya_url: 'assets/a.wav', medya_tur: 'audio' };
  const h = D.kasetHtml(demo, false);
  assert.match(h, /<article class="track" data-demo-key="ritmik-x"/);
  assert.match(h, /&lt;B&gt;X&lt;\/B&gt;/, 'başlık büyük harf ve kaçışlı');
  assert.match(h, /Not &quot;1&quot;/);
  assert.match(h, /data-media="#demo-u-1"/);
  assert.match(h, /<audio id="demo-u-1" preload="metadata"><source src="assets\/a\.wav"/);
  assert.match(h, /data-i18n="ritmik\.tur">RİTMİK CİMNASTİK</);
  assert.doesNotMatch(h, /data-demo-sil/);
  assert.match(D.kasetHtml(demo, true), /<button type="button" class="demo-sil" data-demo-sil="u-1"/);
  assert.match(D.kasetHtml({ ...demo, medya_tur: 'video', medya_url: 'v.mp4' }, false), /<video id="demo-u-1" preload="metadata" playsinline><source src="v\.mp4" type="video\/mp4">/);
});

// ---------- SQL ----------
const sql = oku('supabase/demo-parcalari.sql').replace(/--[^\n]*/g, '');
test('SQL: tablo, herkes okur, yalnız yönetici yazar', () => {
  assert.match(sql, /create table if not exists public\.demo_parcalari/);
  assert.match(sql, /demo_key\s+text not null unique/);
  assert.match(sql, /check \(brans in \('aerobik', 'akrobatik', 'artistik', 'ritmik', 'cocuk-fitness'\)\)/);
  assert.match(sql, /create policy "demo parcalari: herkes okur" on public\.demo_parcalari\s+for select to anon, authenticated using \(true\)/);
  assert.match(sql, /create policy "demo parcalari: yonetici yonetir" on public\.demo_parcalari\s+for all to authenticated\s+using \(public\.is_admin\(\)\) with check \(public\.is_admin\(\)\)/);
  (sql.match(/(create|drop|alter) policy[^;]*;/g) || []).forEach(p => assert.match(p, /on public\.demo_parcalari/, p));
});

test('SQL: sitedeki 4 demo aynı anahtarlarla taşınır', () => {
  ['aerobik-the-witcher', 'akrobatik-wp-acro', 'artistik-007', 'akrobatik-horon-kafkas'].forEach(k => assert.match(sql, new RegExp(`'${k}'`), k));
  assert.match(sql, /on conflict \(demo_key\) do nothing/);
});

// ---------- Sayfalar ----------
const SAYFALAR = { aerobik: 'aerobik', akrobatik: 'akrobatik', artistik: 'artistik', ritmik: 'ritmik', 'cocuk-fitness': 'cocuk-fitness' };
test('branş sayfaları demo listesini yükler; oynatıcı listeden sonra bağlanır (geri bildirim yok)', () => {
  for (const [sayfa, brans] of Object.entries(SAYFALAR)) {
    const h = oku(sayfa + '.html');
    assert.match(h, new RegExp(`<script src="demo-parcalar\\.js\\?v=\\d+" data-brans="${brans}"></script>`), sayfa);
    assert.match(h, /<script src="r2-depo\.js\?v=\d+"><\/script>/, sayfa);
    assert.match(h, /<script src="demo-yardim\.js\?v=\d+"><\/script>/, sayfa);
    assert.doesNotMatch(h, /<script src="player\.js/, sayfa + ': player.js listeden sonra yüklenir');
    assert.doesNotMatch(h, /feedback\.(js|css)/, sayfa + ': demo sayfasında geri bildirim (dalga formu, not) yok');
    assert.match(h, /demo-yonetim\.css\?v=\d+/, sayfa);
  }
  const j = oku('demo-parcalar.js');
  assert.match(j, /'player\.js\?v=2'/);
  assert.doesNotMatch(j, /feedback/, 'demo kasetlerinde yalnız dinleme var');
});

test('demo-parcalar.js: yalnız yönetici formu görür; yükleme yüzdeli; silme doğrulanır', () => {
  const j = oku('demo-parcalar.js');
  assert.match(j, /profile\?\.role === 'admin'/);
  assert.match(j, /from\('demo_parcalari'\)\.select\('\*'\)\.eq\('brans', BRANS\)/);
  assert.match(j, /upload\.onprogress/);
  assert.match(j, /DerinR2\.imzaAdresi\('demo-audio', yol, 'yukle'\)/);
  assert.match(j, /\.delete\(\)\.eq\('id', id\)\.select\('id'\)/);
  assert.match(j, /DerinR2\.sil\('demo-audio', /);
});

test('R2: demo/ klasörü yalnız yönetici yükler; depo öneki tanımlı', () => {
  assert.match(oku('api/r2-yukleme-izni.js'), /const IZINLI_ONEK = \[[^\]]*'demo\/'/);
  assert.doesNotMatch(oku('api/r2-yukleme-izni.js'), /const OKU_ONEK = \[[^\]]*'demo\/'/);
  const r = oku('r2-depo.js');
  assert.match(r, /'demo-audio': 'demo\/'/);
  assert.match(r, /imzaAdresi/);
});

test('Kullanıcılar sayfası: erişim verilecek demolar listeden gelir', () => {
  assert.match(oku('admin.js'), /from\('demo_parcalari'\)\.select\('demo_key,brans,baslik'\)/);
});

// 30 Ekim: yönetici branş sayfasında demoları radyo panelindeki gibi basılı tutup sürükleyerek sıralar;
// ilk sıradaki ana sayfa kasetinde yazar.
test('sıra: kaset yalnız yöneticiye sürüklenebilir; ok düğmesi yok', () => {
  const demo = { id: 'u-1', demo_key: 'k', brans: 'aerobik', baslik: 'A', medya_url: 'a.wav', medya_tur: 'audio' };
  assert.match(D.kasetHtml(demo, true), /<article class="track" draggable="true" data-demo-key="k" data-demo-id="u-1">/);
  assert.doesNotMatch(D.kasetHtml(demo, false), /draggable/);
  assert.doesNotMatch(D.kasetHtml(demo, true), /demo-sira|▲|▼/);
});

test('sıra: bırakılan yere taşınır, hepsi 10, 20, 30… diye yeniden numaralanır', () => {
  const liste = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  assert.deepEqual(D.siraTasi(liste, 'c', 'a'), [{ id: 'c', sira: 10 }, { id: 'a', sira: 20 }, { id: 'b', sira: 30 }]);
  assert.deepEqual(D.siraTasi(liste, 'a', 'c'), [{ id: 'b', sira: 10 }, { id: 'c', sira: 20 }, { id: 'a', sira: 30 }]);
  assert.deepEqual(D.siraTasi(liste, 'a', 'b'), [{ id: 'b', sira: 10 }, { id: 'a', sira: 20 }, { id: 'c', sira: 30 }]);
  assert.equal(D.siraTasi(liste, 'a', 'a'), null);
  assert.equal(D.siraTasi(liste, 'yok', 'a'), null);
});

test('sürükle-bırak veritabanına yazılır; telefonda basılı tutma (sortable-touch) yüklü', () => {
  const j = oku('demo-parcalar.js');
  assert.match(j, /D\.siraTasi\(demolar, kaynakId, hedef\.dataset\.demoId\)/);
  assert.match(j, /from\('demo_parcalari'\)\.update\(\{ sira: s\.sira \}\)\.eq\('id', s\.id\)/);
  for (const sayfa of Object.keys(SAYFALAR)) assert.match(oku(sayfa + '.html'), /<script src="sortable-touch\.js\?v=\d+"><\/script>/, sayfa);
});
