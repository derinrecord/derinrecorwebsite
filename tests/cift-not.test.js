// Çift not hatası (25 Ekim): işaret notu kaydedilince taslak ekranda kalıyor,
// "KAYDET VE GÖNDER" yeniden görünüyordu; antrenör tekrar basınca aynı not iki
// kez kaydedildi (Epic Violin rhytmic 2, 0:20). Kayıt başarılı olunca taslak
// kaldırılır ve yeni kaydedilen not seçili gelir.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const j = fs.readFileSync(path.join(__dirname, '..', 'projects.js'), 'utf8');
const blok = j.slice(j.indexOf("root.querySelectorAll('[data-tdpointsave]')"), j.indexOf("root.querySelectorAll('[data-dl]')"));

test('kayıt yeni notun kimliğini döndürür', () => {
  assert.match(blok, /start_sec:p\.time,kind:'note',body:p\.body\|\|null,voice_path\s*\}\)\.select\('id'\)\.single\(\);/);
});

test('başarılı kayıttan sonra taslak listeden çıkar, yeni not seçilir', () => {
  const i = blok.indexOf("if(error)throw error;");
  const sonra = blok.slice(i, blok.indexOf('await load();', i));
  assert.match(sonra, /detail\.points=\(detail\.points\|\|\[\]\)\.filter\(x=>x\.localId!==p\.localId\);/);
  assert.match(sonra, /detail\.selPointLocalId='db-'\+data\.id;/);
});

test('aynı düğmeye ikinci kez basmak ikinci kaydı açmaz', () => {
  assert.match(blok, /if\(!p\|\|p\.gonderiliyor\)return;\s*p\.gonderiliyor=true;/);
});
