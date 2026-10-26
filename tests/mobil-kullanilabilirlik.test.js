// Mobil kullanılabilirlik: telefonda tek elle kullanım kurallarını kilitler.
// Kaynak: docs/superpowers/plans/2026-10-19-mobil-kullanilabilirlik.md
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const KOK = path.join(__dirname, '..');
const oku = y => fs.readFileSync(path.join(KOK, y), 'utf8');

// Canlıya çıkan sayfalar (tasarım provaları hariç).
const SAYFALAR = fs.readdirSync(KOK)
  .filter(ad => ad.endsWith('.html') && !ad.includes('-prova'))
  .sort();

const kural = (css, secici) => {
  const temiz = secici.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(temiz + '\\s*\\{[^}]*\\}').test(css);
};

test('her sayfa mobil katmanını ve güvenli alan görünümünü yükler', () => {
  for (const sayfa of SAYFALAR) {
    const html = oku(sayfa);
    assert.match(html, /href="mobil\.css\?v=4"/, `${sayfa}: mobil.css eklenmeli`);
    assert.match(html, /viewport-fit=cover/, `${sayfa}: viewport-fit=cover olmalı`);
  }
});

test('mobil katman yalnız dar ekranda devreye girer', () => {
  const css = oku('mobil.css');
  assert.match(css, /@media\s*\(max-width:\s*760px\)/);
  assert.ok(css.trim().startsWith('/*'), 'dosya açıklamayla başlamalı');
});

test('menü misafir ziyaretçiye açık', () => {
  const index = oku('index.html');
  assert.ok(!/<button class="menu-toggle"[^>]*\bhidden\b/.test(index), 'menü düğmesi gizli olmamalı');
  assert.ok(!/<nav id="nav"[^>]*\bhidden\b/.test(index), 'menü gizli olmamalı');
  const auth = oku('auth.js');
  assert.ok(!/setNavigation\(false\)/.test(auth), 'auth.js ziyaretçide menüyü kapatmamalı');
});

test('menü paneli dar ekranda tam genişlik ve kaydırılabilir', () => {
  const css = oku('mobil.css');
  assert.match(css, /100dvh/, 'iOS araç çubuğu için 100dvh kullanılmalı');
  assert.ok(kural(css, '.site-header nav'), 'menü paneli kuralı olmalı');
  assert.match(css, /\.site-header nav a\s*\{[^}]*min-height:\s*48px/s, 'menü satırı en az 48px olmalı');
  assert.match(css, /body\.menu-open/, 'menü açıkken gövde kaydırma kilidi olmalı');
});

test('ana sayfa hero kaseti metnin üstüne binmez', () => {
  const css = oku('mobil.css');
  assert.match(css, /\.hero-art\s*\{[^}]*position:\s*relative/s, 'kaset mobilde akışa girmeli');
  assert.match(css, /\.hero\s*\{[^}]*min-height:\s*0/s, 'hero yüksekliği içeriğe bırakılmalı');
});

test('dokunma hedefleri en az 44px', () => {
  const css = oku('mobil.css');
  assert.match(css, /\.account-button\s*\{[^}]*min-height:\s*44px/s);
  assert.match(css, /\.hero-actions \.button\s*\{[^}]*min-height:\s*48px/s);
  assert.match(css, /\.float-wa[\s\S]{0,40}\{[^}]*width:\s*52px/s);
  assert.match(css, /\.float-teklif[\s\S]{0,40}\{[^}]*width:\s*52px/s);
});

test('form alanları iOS yakınlaştırmasını tetiklemez', () => {
  const css = oku('mobil.css');
  assert.match(css, /font-size:\s*16px\s*!important/, 'giriş alanları 16px olmalı');
  assert.match(css, /input:not\([^)]*\)[\s\S]{0,160}min-height:\s*44px/, 'alanlar 44px yüksekliğinde olmalı');
});

test('sabit düğmeler çentik ve ana çubuk boşluğuna saygı duyar', () => {
  const css = oku('mobil.css');
  assert.match(css, /env\(safe-area-inset-bottom\)/);
  assert.match(css, /env\(safe-area-inset-top\)/);
});

test('320px yatay taşması kapatılır', () => {
  const css = oku('mobil.css');
  assert.match(css, /@media\s*\(max-width:\s*360px\)/);
  assert.match(css, /\.news-main h1[^{]*\{[^}]*font-size:\s*clamp/s, 'haber başlığı dar ekranda küçülmeli');
});

test('auth.js sürümü tüm sayfalarda aynı ve güncel', () => {
  for (const sayfa of SAYFALAR) {
    const html = oku(sayfa);
    if (html.includes('auth.js')) {
      assert.match(html, /auth\.js\?v=20261027a/, `${sayfa}: auth.js sürümü artırılmalı`);
    }
  }
});
