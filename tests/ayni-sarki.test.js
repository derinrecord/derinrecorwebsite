const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const kaynak = fs.readFileSync(require.resolve('../radyo-yonetim.js'), 'utf8');
const yukle = kaynak.slice(kaynak.indexOf('async function parcalariYukle('), kaynak.indexOf('function sureOku('));

test('yükleme öncesi aynı şarkı uyarısı var ve yüklemeden önce sorulur', () => {
  assert.match(yukle, /YİNE DE DEĞİŞTİR/);
  assert.ok(yukle.indexOf('degisecek.size') < yukle.indexOf('Ses.parcaliYukle'), 'uyarı yüklemeden önce gelmeli');
});

test('değiştirmede eski kayıt güncellenir, yeni kayıt açılmaz ve eski dosya silinir', () => {
  assert.match(yukle, /update\(\{ storage_path: sonuc\.path, duration_sec: sure \}\)\.eq\('id', eski\.id\)/);
  assert.match(yukle, /parcalariCoz\(eski\.storage_path\)/);
});
