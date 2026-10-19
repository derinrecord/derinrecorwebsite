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

// ---------- Görev 2: kodu R2'ye bağlama ----------

test('proye/dj kova çağrıları artık Supabase storage dosyanın içinde yok', () => {
  for (const ad of ['projects.js', 'chat.js', 'harmonic-mixer.js']) {
    const icerik = oku(ad);
    assert.ok(!icerik.includes("storage.from('project-audio')"), ad + ' artık Supabase proje kovasına erişmemeli');
    assert.ok(!icerik.includes("storage.from('dj-audio')"), ad + ' artık Supabase dj kovasına erişmemeli');
    assert.ok(icerik.includes('DerinR2'), ad + ' R2 depo kütüphanesini (r2-depo.js) kullanmalı');
  }
});

test('çalma/indirme imzalı okuma (korumaliAdres), yükleme/silme DerinR2 ile bağlanır', () => {
  const pro = oku('projects.js');
  assert.ok(/korumaliAdres\('project-audio'/.test(pro), 'projects.js çalma/indirme korumalı okuma adresiyle olmalı');
  assert.ok(/DerinR2\.yukle\('project-audio'/.test(pro), 'projects.js yüklemesi DerinR2 ile olmalı');
  assert.ok(/DerinR2\.sil\('project-audio'/.test(pro), 'projects.js silmesi DerinR2 ile olmalı');
  const chat = oku('chat.js');
  assert.ok(/DerinR2\.yukle\('project-audio'/.test(chat), 'chat.js müzik gönderimi DerinR2 ile olmalı');
  assert.ok(/DerinR2\.sil\('project-audio'/.test(chat), 'chat.js silmesi DerinR2 ile olmalı');
  const mix = oku('harmonic-mixer.js');
  assert.ok(/DerinR2\.yukle\('dj-audio'/.test(mix), 'harmonic-mixer yükleme DerinR2 ile olmalı');
  assert.ok(/korumaliAdres\('dj-audio'/.test(mix), 'harmonic-mixer çalma korumalı okuma adresiyle olmalı');
  assert.ok(/DerinR2\.sil\('dj-audio'/.test(mix), 'harmonic-mixer silmesi DerinR2 ile olmalı');
});

test('r2-depo.js v2, R2 kullanan üç sayfada sayfa betiğinden önce yüklenir', () => {
  const ciftler = [
    ['chat.html', 'chat.js?v='],
    ['my-projects.html', 'projects.js?v='],
    ['harmonic-mixer.html', 'harmonic-mixer.js?v=']
  ];
  for (const [ad, betik] of ciftler) {
    const html = oku(ad);
    assert.ok(html.includes('r2-depo.js?v=2'), ad + ' r2-depo.js?v=2 yüklemeli');
    const depoAni = html.indexOf('r2-depo.js?v=2');
    const betikAni = html.indexOf(betik);
    assert.ok(betikAni >= 0 && depoAni < betikAni, ad + ' tarafında r2-depo.js ' + betik + "'ten önce gelmeli");
  }
  // Sayfa betik sürümleri değişen JS'te yükseltilmiş olmalı.
  assert.ok(/projects\.js\?v=202610/.test(oku('my-projects.html')), 'projects.js sürümü artırılmış olmalı');
  assert.ok(/chat\.js\?v=28/.test(oku('chat.html')), 'chat.js sürümü artırılmış olmalı');
  assert.ok(/harmonic-mixer\.js\?v=12/.test(oku('harmonic-mixer.html')), 'harmonic-mixer.js sürümü artırılmış olmalı');
});
