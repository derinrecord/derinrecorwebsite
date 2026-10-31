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
  // derinrecord.com 308 ile www'ye yönlenir; yönlenme uygulamada intro'yu ve bağlantıları bozuyordu (31 Ekim, Derin'in telefon denemesi)
  assert.equal(c.server.url, 'https://www.derinrecord.com');
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

test('deneme APK telefondan indirilebilsin diye ön sürüme konur', () => {
  const y = oku('.github/workflows/android-deneme.yml');
  assert.match(y, /gh release upload android-deneme derin-record-deneme\.apk --clobber/);
  assert.match(y, /--prerelease/);
});

test('uygulama simgesi ve açılış görseli Derin Record logosundan üretilir', () => {
  const { execFileSync } = require('node:child_process');
  const olcu = f => execFileSync('python3', ['-c', `from PIL import Image;print(*Image.open('${path.join(KOK, f)}').size)`], { encoding: 'utf8' }).trim();
  assert.equal(olcu('app/assets/icon-only.png'), '1024 1024');
  assert.equal(olcu('app/assets/icon-foreground.png'), '1024 1024');
  assert.equal(olcu('app/assets/icon-background.png'), '1024 1024');
  assert.equal(olcu('app/assets/splash.png'), '2732 2732');
  const p = JSON.parse(oku('app/package.json'));
  assert.match(String(p.devDependencies['@capacitor/assets']), /^\^?3\./);
  assert.match(oku('.github/workflows/android-deneme.yml'), /npx capacitor-assets generate --android/);
});

// Android'in kendi açılış ekranı (simge) görünmesin; intro zaten var (31 Ekim, Derin).
test('sessiz açılış: sistem açılış ekranı simgesiz ve intro renginde', () => {
  const { sessizlestir, BOS_SIMGE } = require('../app/sessiz-acilis.js');
  const ornek = `<resources>
    <style name="AppTheme.NoActionBar" parent="Theme.AppCompat.DayNight.NoActionBar">
        <item name="windowActionBar">false</item>
    </style>
    <style name="AppTheme.NoActionBarLaunch" parent="Theme.SplashScreen">
        <item name="android:background">@drawable/splash</item>
    </style>
</resources>`;
  const s = sessizlestir(ornek);
  assert.match(s, /<item name="windowSplashScreenAnimatedIcon">@drawable\/bos_simge<\/item>/);
  assert.match(s, /<item name="windowSplashScreenBackground">#0b0b0d<\/item>/);
  assert.match(s, /<item name="android:windowBackground">#0b0b0d<\/item>/);
  assert.match(s, /<item name="postSplashScreenTheme">@style\/AppTheme.NoActionBar<\/item>/);
  assert.doesNotMatch(s, /@drawable\/splash/);
  assert.match(s, /AppTheme.NoActionBar" parent="Theme.AppCompat.DayNight.NoActionBar"/);
  assert.throws(() => sessizlestir('<resources></resources>'), /NoActionBarLaunch/);
  assert.match(BOS_SIMGE, /android:color="@android:color\/transparent"/);
  assert.match(oku('.github/workflows/android-deneme.yml'), /node \.\.\/sessiz-acilis\.js|node sessiz-acilis\.js/);
});
