// Uygulama kabuğu (31 Ekim): app/ klasöründeki Capacitor paketi canlı siteyi açar,
// kendini "DerinRecordApp/1" diye tanıtır; Android deneme paketi GitHub'da derlenir.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const KOK = path.join(__dirname, '..');
const oku = d => fs.readFileSync(path.join(KOK, d), 'utf8');

test('kabuk canlı siteyi açar ve kendini tanıtır', () => {
  const c = JSON.parse(oku('app/capacitor.config.json'));
  assert.equal(c.appId, 'com.derinrecord.app');
  assert.equal(c.appName, 'Derin Record');
  assert.equal(c.webDir, 'www');
  assert.equal(c.server.url, 'https://derinrecord.com');
  assert.equal(c.server.errorPath, 'index.html');
  assert.equal(c.android.appendUserAgent, 'DerinRecordApp/1');
  assert.equal(c.ios.appendUserAgent, 'DerinRecordApp/1');
  assert.ok(c.server.allowNavigation.includes('derinrecord.com'));
  assert.ok(!/service_role|secret/i.test(JSON.stringify(c)));
});

test('kabuk paketleri Capacitor 8', () => {
  const p = JSON.parse(oku('app/package.json'));
  for (const b of ['@capacitor/core', '@capacitor/cli', '@capacitor/android']) assert.match(String((p.dependencies || {})[b] || (p.devDependencies || {})[b]), /^\^?8\./, b);
});

test('internetsiz sayfa var; app/ yayına girmez', () => {
  const h = oku('app/www/index.html');
  assert.match(h, /İnternet bağlantısı yok/);
  assert.match(h, /YENİDEN DENE/);
  assert.match(oku('.vercelignore'), /^app\/$/m);
});

test('android deneme iş akışı: apk üretir, gizli anahtar kullanmaz', () => {
  const y = oku('.github/workflows/android-deneme.yml');
  assert.match(y, /workflow_dispatch/);
  assert.match(y, /paths:[\s\S]*'app\/\*\*'/);
  assert.match(y, /java-version: '21'/);
  assert.match(y, /node-version: '22'/);
  assert.match(y, /npx cap add android/);
  assert.match(y, /assembleDebug/);
  assert.match(y, /derin-record-deneme\.apk/);
  assert.doesNotMatch(y, /secrets\./);
});
