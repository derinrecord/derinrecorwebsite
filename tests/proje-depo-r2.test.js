// Antrenör proje müziği + DJ dosyalarının R2'ye geçişi — Görev 1 testi.
// r2-depo.js haritasının yeni kovaları ve api imzalı okuma ('oku') kuralını
// kaynağın kendisinde sabitler. Plan: docs/superpowers/plans/2026-10-18-proje-muzik-r2-gecis.md
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const KOK = path.join(__dirname, '..');
const oku = y => fs.readFileSync(path.join(KOK, y), 'utf8');

test('r2-depo haritası proje ve dj kovalarını tanımlar', () => {
  const depo = oku('r2-depo.js');
  assert.ok(depo.includes("'project-audio': 'proje/'"), 'ONEK içinde project-audio → proje/ olmalı');
  assert.ok(depo.includes("'dj-audio': 'dj/'"), 'ONEK içinde dj-audio → dj/ olmalı');
});

test('r2-depo imzalı okuma fonksiyonu (korumaliAdres) tanımlı ve dışa açık', () => {
  const depo = oku('r2-depo.js');
  assert.ok(/function korumaliAdres|korumaliAdres\s*=\s*async/.test(depo), 'korumaliAdres fonksiyonu tanımlı olmalı');
  assert.ok(/'oku'/.test(depo), 'korumaliAdres imza isteği oku işlemiyle yapılmalı');
  assert.ok(/korumaliAdres,/.test(depo), 'korumaliAdres DerinR2 dışa aktarımında olmalı');
});

test('r2-depo Node ortamında da yüklenebilir (window koruması)', () => {
  const depo = oku('r2-depo.js');
  assert.ok(/typeof window !== 'undefined'/.test(depo), 'window ataması korumalı olmalı');
  const r2 = require('../r2-depo.js');
  assert.equal(typeof r2.korumaliAdres, 'function', 'Node tarafında korumaliAdres export edilmeli');
  // korumaliAdres boş yol için imza istemesin (null dönsün) — imza ağına çıkılmaz.
  return r2.korumaliAdres('project-audio', '').then(x => assert.equal(x, null));
});

test('api oku işlemini, süresini ve yetki kuralını taşır', () => {
  const api = oku('api/r2-yukleme-izni.js');
  assert.ok(/islem\s*=\s*'oku'|'oku'/.test(api), "'oku' işlemi tanınmalı");
  assert.ok(/Yalnızca POST/.test(api), 'oku için de POST kapısı korunmalı');
  assert.ok(/auth\/v1\/user/.test(api), 'antrenör kimliği /auth/v1/user ile doğrulanmalı (imzasız JWT okunamaz)');
  assert.ok(/600/.test(api), 'oku imzası 600 saniye geçerli olmalı');
  // Yetki: api yöneticiyi is_admin ile bilir; antrenöre yalnız kendi ilk klasörü açılır.
  assert.ok(/split\('\/'\)\[1\]/.test(api), "proje/ yolunun ilk klasörü kullanıcı kimliğiyle karşılaştırılmalı");
  assert.ok(/403/.test(api), 'yetkisiz oku isteği 403 dönmeli');
  // oku yalnız proje/ ve dj/ yolunu imzalar; radyo kova adresleri imzaya gerek duymaz.
  assert.ok(/proje\/'|'dj\//.test(api), "oku yalnız 'proje/' ve 'dj/' öneklerinde çalışmalı");
});

test('mevcut yükleme/silme akışı değişmeden kalır', () => {
  const api = oku('api/r2-yukleme-izni.js');
  // Yönetici yükleme/silme için salt admin kuralı sürsün; ŞUBE-kubbe prefix listesi dokunulmaz.
  assert.ok(/YükSleme|Yukleme|yukle\s*=\s*'PUT'|'yukle'/.test(api), 'yukle işlemi dursun');
  assert.ok(/'yukle'|'sil'/.test(api), 'iki eski işlem metni de durmalı');
  const depo = oku('r2-depo.js');
  assert.ok(depo.includes("'radio-audio': 'radyo/'"), 'radio haritası korunmalı');
  assert.ok(depo.includes("'radio-covers': 'kapak/'"), 'kapak haritası korunmalı');
  assert.ok(depo.includes("'radio-announcements': 'anons/'"), 'anons haritası korunmalı');
});
