// Projelerim · İNDİR düğmesi (23 Ekim hatası): antrenör "indirmeye izin ver"
// açıkken dosyayı indiremiyordu. Sebep: tek parçalı dosyada <a download>
// doğrudan R2'nin imzalı adresine (başka alan adı) veriliyordu; tarayıcılar
// başka alan adındaki dosyada download komutunu yok sayar, dosyayı sekmede
// açar ya da hiçbir şey yapmaz. Doğrusu: dosyayı fetch ile Blob olarak çekip
// sayfanın kendi adresi (blob:) üzerinden kaydettirmek.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const kaynak = fs.readFileSync(path.join(__dirname, '..', 'projects.js'), 'utf8');

test('indirme tek yardımcıdan geçer ve dosyayı Blob olarak kaydettirir', () => {
  const m = kaynak.match(/async function dosyaIndir\(yol,ad\)\{[\s\S]*?\n  \}/);
  assert.ok(m, 'dosyaIndir(yol,ad) yardımcısı tanımlı olmalı');
  const govde = m[0];
  assert.ok(govde.includes('sesBlob(yol)'), 'dosya fetch ile Blob olarak çekilmeli (tek ya da parçalı)');
  assert.ok(govde.includes('URL.createObjectURL'), 'kaydetme sayfanın kendi blob: adresiyle yapılmalı');
  assert.ok(govde.includes('a.download=ad'), 'dosya adı verilmeli');
});

test('İNDİR düğmeleri imzalı R2 adresini doğrudan bağlantıya vermez', () => {
  // Eski hatalı kalıp: const url=await signed(...); a.href=url; a.download=...
  assert.ok(!/const url=await signed\(b\.dataset\.path\);[\s\S]{0,140}a\.download=ad/.test(kaynak),
    'İNDİR, signed() adresini a.download ile kullanmamalı');
  const cagrilar = kaynak.match(/querySelectorAll\('\[data-dl\]'\)\.forEach\(b=>b\.onclick=async\(\)=>\{[\s\S]*?\}\);/g) || [];
  assert.equal(cagrilar.length, 2, 'antrenör ve yönetici görünümünde iki İNDİR işleyicisi olmalı');
  cagrilar.forEach(c => assert.ok(c.includes('dosyaIndir(b.dataset.path,'), 'işleyici dosyaIndir kullanmalı'));
});

test('sesBlob dosyanın gerçek türünü korur (mp3 wav olarak işaretlenmez)', () => {
  const m = kaynak.match(/async function sesBlob\(path\)\{[\s\S]*?\n  \}/);
  assert.ok(m, 'sesBlob tanımlı olmalı');
  assert.ok(!m[0].includes("type:'audio/wav'"), 'tür sabit audio/wav olmamalı');
  assert.ok(m[0].includes('sesTipi'), 'tür dosya uzantısından gelmeli');
});
