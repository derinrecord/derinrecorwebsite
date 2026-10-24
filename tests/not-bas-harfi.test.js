// Not yanındaki yuvarlak: "Sen" etiketinin harfi (S) değil, yazanın baş harfi.
// Derin Record notları "D", antrenör notları antrenörün adının baş harfi
// (antrenör kendi notuna bakarken de kendi harfini görür).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const kaynak = fs.readFileSync(path.join(__dirname, '..', 'projects.js'), 'utf8');
const govde = kaynak.match(/const yazarHarfi=\(id,project\)=>\{[\s\S]*?\n  \};/);

test('yazarHarfi tanımlı ve Derin Record için D, antrenör için adının baş harfi', () => {
  assert.ok(govde, 'yazarHarfi olmalı');
  const yazarHarfi = new Function('names', 'me', 'benimAdim', govde[0] + ' return yazarHarfi;');
  const proje = { coach_id: 'hoca' };
  const f = yazarHarfi({ hoca: 'kristina Rangelova' }, 'derin', 'Derin UYGUR');
  assert.equal(f('derin', proje), 'D', 'yöneticinin kendi notu');
  assert.equal(f('hoca', proje), 'K', 'antrenörün notu (yönetici görünümü)');
  const hocaGorur = yazarHarfi({}, 'hoca', 'İrem Hoca');
  assert.equal(hocaGorur('hoca', proje), 'İ', 'antrenör kendi notunda kendi harfini görür');
  assert.equal(hocaGorur('derin', proje), 'D');
  assert.equal(yazarHarfi({}, 'x', '')('hoca', proje), 'A', 'ad bilinmiyorsa A(ntrenör)');
});

test('not listelerinde yuvarlak harf yazarHarfi\'nden gelir', () => {
  assert.ok(!kaynak.includes("yazarAdi(f.author_id,detail.proje).charAt(0)"), 'Genel klasörde "Sen"in S\'si kalmamalı');
  // Fotoğraf yoksa avatarHtml baş harfi (yazarHarfi) basar.
  assert.ok(kaynak.includes('${avatarHtml(f.author_id,detail.proje)}'));
  assert.ok(kaynak.includes('${avatarHtml(f.author_id,p)}'));
  assert.match(kaynak, /benimAdim=a\.profile\?\.full_name\|\|''/);
});
