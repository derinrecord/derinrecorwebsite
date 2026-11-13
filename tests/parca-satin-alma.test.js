// Parça satın alma + dekont (13 Kasım, Derin): müşteri "satın almak istiyorum"a
// basar (buton yeşil olur), ÖDEME'de IBAN + tutarı görür, dekontu yükler; Derin
// dekontu görüp indirmeyi açar. Tutarı ve "ödendi"yi yalnız yönetici yazar.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const oku = d => fs.readFileSync(path.join(__dirname, '..', d), 'utf8');
const SA = require('../satin-alma.js');
const j = oku('projects.js');
const html = oku('my-projects.html');
const sql = oku('supabase/parca-satin-alma.sql').replace(/--[^\n]*/g, '');

test('tutar ve IBAN biçimleri', () => {
  assert.equal(SA.tutarCoz('3.000'), 3000);
  assert.equal(SA.tutarCoz('3000,50'), 3000.5);
  assert.equal(SA.tutarCoz('3500 TL'), 3500);
  assert.equal(SA.tutarCoz('abc'), null);
  assert.equal(SA.tutarCoz('0'), null);
  assert.equal(SA.tutarGoster(3000), '3.000 ₺');
  assert.equal(SA.tutarGoster(1500.5), '1.500,50 ₺');
  assert.equal(SA.tutarGoster(null), '');
  assert.equal(SA.ibanTemiz('tr12 0006 2000 0000 0000 0000 01'), 'TR120006200000000000000001');
  assert.equal(SA.ibanGoster('TR120006200000000000000001'), 'TR12 0006 2000 0000 0000 0000 01');
  assert.ok(SA.ibanGecerliMi('TR12 0006 2000 0000 0000 0000 01'));
  assert.ok(!SA.ibanGecerliMi('TR12 0006'));
});

test('dekont: PDF/fotoğraf, 10 MB sınırı, müşterinin kendi klasörü', () => {
  assert.equal(SA.dekontHatasi({ name: 'dekont.pdf', size: 1000 }), null);
  assert.equal(SA.dekontHatasi({ name: 'IMG.JPG', size: 1000 }), null);
  assert.ok(SA.dekontHatasi({ name: 'virus.exe', size: 1000 }));
  assert.ok(SA.dekontHatasi({ name: 'a.pdf', size: 11 * 1024 * 1024 }));
  assert.ok(SA.dekontHatasi(null));
  assert.equal(SA.dekontYolu('u1', 't9', 'Dekont.PDF', 42), 'u1/dekont/t9-42.pdf');
});

test('müşteri kutusu: metin, yeşil onay, ödeme paneli ve dekont alanı', () => {
  const tr = { id: 't1', label: 'Final', satin_alma_durum: null, satin_alma_tutar: null };
  const bos = SA.musteriKutusu({ tr, ayar: {} });
  assert.doesNotMatch(bos, /Projelerinizdeki parçayı beğendiyseniz/);
  assert.doesNotMatch(bos, /senin<\/em> olsun/);
  assert.match(bos, /Satın almak istiyorum/);
  assert.doesNotMatch(bos, /class="sa-istek onayli"/);
  assert.match(bos, /data-saodeme="t1"[^>]*disabled/);

  const istendi = SA.musteriKutusu({ tr: { ...tr, satin_alma_durum: 'istendi', satin_alma_tutar: 3000 }, ayar: { iban: 'TR120006200000000000000001', alici: 'Derin' }, acik: true });
  assert.match(istendi, /class="sa-istek onayli"/);
  assert.match(istendi, /KDV dahil/);
  assert.doesNotMatch(istendi, /\+ KDV/);
  assert.match(istendi, /3\.000<em class="sa-lira">₺<\/em>/);
  assert.match(istendi, /TR12 0006 2000 0000 0000 0000 01/);
  assert.match(istendi, /data-sadekont="t1"/);
  assert.match(istendi, /Dekontu buraya bırak/);

  const dekont = SA.musteriKutusu({ tr: { ...tr, satin_alma_durum: 'dekont' }, ayar: {}, acik: true });
  assert.match(dekont, /Dekontunuz alındı/);
  assert.match(dekont, /yakında/);
});

test('müşteri verisi kaçışlanır', () => {
  const h = SA.musteriKutusu({ tr: { id: 't1', label: '<img onerror=x>', satin_alma_durum: 'istendi' }, ayar: { alici: '<b>x</b>' }, acik: true });
  assert.doesNotMatch(h, /<img onerror/);
  assert.doesNotMatch(h, /<b>x<\/b>/);
});

test('yönetici kutusu: tutar, dekontu gör, ödeme alındı, IBAN ayarı', () => {
  const h = SA.yoneticiKutusu({ tr: { id: 't1', satin_alma_durum: 'dekont', dekont_path: 'u1/dekont/t1-1.pdf', satin_alma_tutar: 3000 }, ayar: {} });
  assert.match(h, /data-satutar="t1" value="3\.000"/);
  assert.match(h, /data-sadekontgor="u1\/dekont\/t1-1\.pdf"/);
  assert.match(h, /Ödeme alındı · indirmeyi aç/);
  assert.match(h, /data-saiban/);
  const odendi = SA.yoneticiKutusu({ tr: { id: 't1', satin_alma_durum: 'odendi' }, ayar: {} });
  assert.doesNotMatch(odendi, /data-saonayla/);
});

test('projects.js: kutu yalnız indirme kapalıyken müşteriye; onay indirmeyi açar', () => {
  assert.match(j, /if\(indirmeAcik\(tr\)\)return '';/);
  assert.match(j, /update\(alanlar\)\.eq\('id',tr\.id\)/);
  assert.match(j, /kaydet\(\{satin_alma_durum:'odendi',indirme_izni:true\}/);
  assert.match(j, /window\.DerinR2\.yukle\('project-audio',yol,file/);
  assert.match(j, /from\('odeme_ayarlari'\)/);
  assert.ok(html.indexOf('satin-alma.js?v=') > -1 && html.indexOf('satin-alma.js?v=') < html.indexOf('projects.js?v='));
});

test('SQL: tutar/ödendi yalnız yönetici; mevcut izin kurallarına dokunulmaz', () => {
  assert.match(sql, /add column if not exists satin_alma_durum text/);
  assert.match(sql, /new\.satin_alma_tutar := old\.satin_alma_tutar;/);
  assert.match(sql, /new\.dekont_path like v_ben \|\| '\/dekont\/%'/);
  assert.match(sql, /create trigger parca_satin_alma_koru\s+before insert or update on public\.project_tracks/);
  // Yalnız yeni odeme_ayarlari tablosuna kural yazılır.
  const politikalar = sql.match(/create policy[^\n]*/gi) || [];
  assert.equal(politikalar.length, 2);
  politikalar.forEach(p => assert.match(p, /on public\.odeme_ayarlari/));
  assert.doesNotMatch(sql, /policy[^\n]*on public\.project_tracks/i);
});
