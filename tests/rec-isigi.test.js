// Logodaki kırmızı nokta (2 Kasım, Derin): "•" karakteri yerine düzgün yuvarlak; REC ışığı gibi yavaşça yanıp söner.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const oku = d => fs.readFileSync(path.join(__dirname, '..', d), 'utf8');

test('nokta: tüm sayfalarda ortak auth.css içinde yuvarlak ve yanıp sönen', () => {
  const c = oku('auth.css');
  assert.match(c, /\.wordmark>b\{[^}]*border-radius:50%[^}]*animation:recIsigi/);
  assert.match(c, /@keyframes recIsigi/);
  assert.match(c, /prefers-reduced-motion:reduce\)\{\.wordmark>b\{animation:none/);
});

test('logolu her sayfa ortak stili yükler', () => {
  for (const f of fs.readdirSync(path.join(__dirname, '..')).filter(f => f.endsWith('.html') && !f.endsWith('-prova.html'))) {
    const h = oku(f);
    if (h.includes('class="wordmark"')) assert.match(h, /auth\.css\?v=20261102a/, f);
  }
});
