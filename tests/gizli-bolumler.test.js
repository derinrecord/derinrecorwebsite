// 2026-11-20: Derin'in isteğiyle Ses Efektleri mağazası, Ses Tasarımı menü maddesi
// ve Sanatçılar bölümü şimdilik gizli. Sayfalar, JS ve veritabanı SİLİNMEDİ.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const KOK = path.join(__dirname, '..');
const oku = y => fs.readFileSync(path.join(KOK, y), 'utf8');
const yorumsuz = s => s.replace(/<!--[\s\S]*?-->/g, '');

test('gizli sayfalar ana sayfaya yönlenir, dosyalar durur', () => {
  for (const d of ['sanatcilar.html', 'sanatci-paneli.html', 'ses-efektleri.html']) {
    const s = oku(d);
    assert.ok(s.includes("location.replace('index.html')"), d + ' yönlenmeli');
    assert.ok(s.includes('onizle=1'), d + ' önizleme kapısı olmalı');
  }
  for (const d of ['sanatcilar.js', 'sanatci-paneli.js', 'ses-efektleri.js', 'ses-efektleri-yonetim.html',
    'supabase/sanatcilar.sql', 'supabase/ses-efektleri.sql', 'ses-tasarimi.html'])
    assert.ok(fs.existsSync(path.join(KOK, d)), d + ' durmalı');
});

test('menülerde gizli bölümlere bağlantı yok', () => {
  assert.ok(/const GIZLI_BOLUMLER = true;/.test(oku('ortak-ust.js')));
  const ana = yorumsuz(oku('index.html'));
  for (const h of ['href="sanatcilar.html"', 'href="ses-efektleri.html"', 'data-i18n="nav.ses"'])
    assert.ok(!ana.includes(h), 'index.html → ' + h);
  assert.ok(ana.includes('data-i18n="nav.film"'), 'Film Müziği menüde kalmalı');
  const auth = oku('auth.js');
  assert.ok(!auth.includes('sanatci-paneli.html') && !auth.includes('ses-efektleri-yonetim.html'));
});
