// Android 12+ her uygulamada kendi açılış ekranını (ortada simge) gösterir; kapatılamaz.
// Derin Record'un kendi intro'su olduğu için (31 Ekim, Derin) bu ekran simgesiz ve
// intro'nun koyu renginde (#0b0b0d) yapılır: telefonda yalnız koyu ekran görünür, sonra intro başlar.
// GitHub'daki derlemede "npx cap add android"dan sonra çalışır (app/ içinden: node sessiz-acilis.js).
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const RENK = '#0b0b0d';
const BOS_SIMGE = `<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle">
    <solid android:color="@android:color/transparent" />
    <size android:width="1dp" android:height="1dp" />
</shape>
`;

function sessizlestir(stiller) {
  const kalip = /<style name="AppTheme\.NoActionBarLaunch"[^>]*>[\s\S]*?<\/style>/;
  if (!kalip.test(stiller)) throw new Error('styles.xml içinde AppTheme.NoActionBarLaunch bulunamadı');
  return stiller.replace(kalip, `<style name="AppTheme.NoActionBarLaunch" parent="Theme.SplashScreen">
        <item name="windowSplashScreenBackground">${RENK}</item>
        <item name="windowSplashScreenAnimatedIcon">@drawable/bos_simge</item>
        <item name="android:windowBackground">${RENK}</item>
        <item name="postSplashScreenTheme">@style/AppTheme.NoActionBar</item>
    </style>`);
}

if (require.main === module) {
  const res = path.join(__dirname, 'android', 'app', 'src', 'main', 'res');
  const stilYolu = path.join(res, 'values', 'styles.xml');
  fs.writeFileSync(stilYolu, sessizlestir(fs.readFileSync(stilYolu, 'utf8')));
  fs.mkdirSync(path.join(res, 'drawable'), { recursive: true });
  fs.writeFileSync(path.join(res, 'drawable', 'bos_simge.xml'), BOS_SIMGE);
  console.log('Sessiz açılış uygulandı');
}

module.exports = { sessizlestir, BOS_SIMGE, RENK };
