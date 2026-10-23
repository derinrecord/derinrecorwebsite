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
  const m = kaynak.match(/async function dosyaIndir\(yol,ad,bicim\)\{[\s\S]*?\n  \}/);
  assert.ok(m, 'dosyaIndir(yol,ad,bicim) yardımcısı tanımlı olmalı');
  const govde = m[0];
  assert.ok(govde.includes('sesBlob(yol)'), 'dosya fetch ile Blob olarak çekilmeli (tek ya da parçalı)');
  assert.ok(govde.includes('URL.createObjectURL'), 'kaydetme sayfanın kendi blob: adresiyle yapılmalı');
  assert.ok(govde.includes('a.download=Donustur.dosyaAdi(ad,bicim)'), 'dosya adı istenen uzantıyla verilmeli');
  assert.ok(govde.includes('Donustur.cevir(kaynak,yol,bicim,'), 'gerekirse istenen biçime çevrilmeli');
});

test('antrenör parça detayında WAV ve MP3 için iki indirme düğmesi görür', () => {
  ['wav', 'mp3'].forEach(b => assert.ok(
    new RegExp(`data-dl="\\$\\{tr\\.id\\}"[^>]*data-bicim="${b}"`).test(kaynak), b + ' düğmesi olmalı'));
  assert.ok(kaynak.includes('⤓ WAV') && kaynak.includes('⤓ MP3'));
  assert.ok(!kaynak.includes('⤓ İNDİR'), 'tek İNDİR düğmesi kalmamalı');
});

test('sayfa çeviriciyi projects.js\'ten önce yükler', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'my-projects.html'), 'utf8');
  const i = html.indexOf('<script src="ses-donustur.js?v=');
  assert.ok(i > 0 && i < html.indexOf('<script src="projects.js?v='));
});

test('İNDİR düğmeleri imzalı R2 adresini doğrudan bağlantıya vermez', () => {
  // Eski hatalı kalıp: const url=await signed(...); a.href=url; a.download=...
  assert.ok(!/const url=await signed\(b\.dataset\.path\);[\s\S]{0,140}a\.download=ad/.test(kaynak),
    'İNDİR, signed() adresini a.download ile kullanmamalı');
  const cagrilar = kaynak.match(/querySelectorAll\('\[data-dl\]'\)\.forEach\(b=>b\.onclick=async\(\)=>\{[\s\S]*?\}\);/g) || [];
  assert.equal(cagrilar.length, 2, 'antrenör ve yönetici görünümünde iki İNDİR işleyicisi olmalı');
  cagrilar.forEach(c => assert.ok(c.includes('dosyaIndir(b.dataset.path,b.dataset.name,b.dataset.bicim'), 'işleyici biçimi dosyaIndir\'e geçirmeli'));
});

test('sesBlob dosyanın gerçek türünü korur (mp3 wav olarak işaretlenmez)', () => {
  const m = kaynak.match(/async function sesBlob\(path\)\{[\s\S]*?\n  \}/);
  assert.ok(m, 'sesBlob tanımlı olmalı');
  assert.ok(!m[0].includes("type:'audio/wav'"), 'tür sabit audio/wav olmamalı');
  assert.ok(m[0].includes('sesTipi'), 'tür dosya uzantısından gelmeli');
});
