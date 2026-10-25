// Parça başına tek not klasörü (25 Ekim, Derin): antrenörün bir parçaya yazdığı
// bütün notlar (zamanlı ve genel) o parçanın tek klasöründe alt alta durur.
// Zamanlı notun başında süre etiketi vardır, dokununca o saniyeye gider.
// Dalgadaki işaretler kalır. Başka parçanın notu bu klasörde görünmez.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const j = fs.readFileSync(path.join(__dirname, '..', 'projects.js'), 'utf8');

test('parçanın tüm notları tek listede: önce zamanlılar (süreye göre), sonra genel', () => {
  assert.match(j, /function parcaNotListesi\(\)/);
  assert.match(j, /detail\.tumNotlar=hepsi;/);
  assert.match(j, /zamanlilar\.sort\(\(a,b\)=>notZamani\(a\)-notZamani\(b\)\)/);
});

test('klasör sekmeleri yok; tek klasör başlığı ve sayısı', () => {
  const v = j.slice(j.indexOf('function trackDetailView'), j.indexOf('function renderDetail'));
  assert.doesNotMatch(v, /td-sekmeler/);
  assert.match(v, /PARÇANIN NOTLARI/);
  assert.match(v, /\$\{tekKlasorGovdesi\(\)\}/);
});

test('zamanlı notta süre etiketi o işarete gider; genel notta tire', () => {
  assert.match(j, /class="td-not-zaman" data-tdsec="\$\{nokta\.localId\}"/);
  assert.match(j, /class="td-not-zaman genel" aria-hidden="true">—<\/span>/);
});

test('notlar yalnız bu parçanın: liste parcaNotlari(project, track) ile kurulur', () => {
  assert.match(j, /const \{zamanli,genel,hepsi\}=parcaNotlari\(project\.id,tr\.id\);/);
});

test('düzenleme zamanlı notlarda da çalışır', () => {
  assert.match(j, /const f=\(detail\.tumNotlar\|\|\[\]\)\.find\(x=>x\.id===id\);/);
});

test('varsayılan: taslak yoksa hiçbir işaret seçili değil (liste görünür)', () => {
  assert.match(j, /if\(!genelSecili\(\)&&!seciliNokta\(\)\)detail\.selPointLocalId=\(points\.find\(p=>!p\.saved\)\|\|\{\}\)\.localId\|\|GENEL;/);
});
