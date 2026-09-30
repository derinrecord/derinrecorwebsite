// Marka paneli (coffee-marka, erişim koduyla açılan sunum sayfası).
//
// Karar: hangi listelerin bir şubede çalacağını YALNIZ yönetim belirler
// (marka → şube → birden fazla çalma listesi, yönetim panelinden). Marka paneli
// okumaya devam eder; burada seçim yapılmaz. Bir dönem eklenen "marka kendi
// seçimini yapsın" katmanı bilinçli olarak kaldırıldı; geri sızmasın diye
// aşağıdaki testler onu yasaklar.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync(require.resolve('../coffee-marka.js'), 'utf8');
const css = fs.readFileSync(require.resolve('../marka-sunum.css'), 'utf8');
const sayfa = fs.readFileSync(require.resolve('../coffee-marka.html'), 'utf8');

test('marka paneli listeleri okur ve sunar', () => {
  assert.match(source, /client\.rpc\('coffee_brand_auth', \{ p_slug: slug, p_code: kod \}\)/);
  assert.match(source, /client\.rpc\('coffee_brand_liste', \{ p_slug: slug, p_code: kod \}\)/);
  assert.match(source, /function tabsCiz\(\)/, 'listeler sekme olarak çizilmeli');
  assert.match(source, /function listeCiz\(\)/, 'seçilen listenin parçaları çizilmeli');
  assert.match(sayfa, /coffee-marka\.js\?v=\d+/, 'betik sürüm damgası taşımalı');
});

// Yazma yolu yok: marka panelinden hiçbir tablo satırı değişmez. Atama kararı
// tek yerde (yönetim paneli) verilir; iki ekrandan yazmak karışıklığı getirir.
test('marka paneli hiçbir şey yazmaz', () => {
  assert.ok(!/coffee_brand_havuz|coffee_brand_secim/.test(source),
    'marka seçimi fonksiyonları çağrılmamalı');
  assert.ok(!/from\('player_playlists'\)/.test(source), 'atama tablosu okunmamalı');
  assert.ok(!/\.insert\(|\.update\(|\.delete\(|\.upsert\(|\.upload\(/.test(source),
    'marka panelinden yazma denenmemeli');
  assert.ok(!/data-sube-kaydet|data-sube-hepsi|data-sube-hicbiri/.test(source),
    'seçim düğmeleri kalmamalı');
  assert.ok(!/id="mk-secim"/.test(source), 'seçim bölümü hiç çizilmemeli');
});

// Seçim bölümünün stilleri de gitti: kullanılmayan CSS bırakmıyoruz, yoksa
// ileride "bu bölüm nerede?" diye aranıyor.
test('seçim bölümünden kalan stil yok', () => {
  assert.ok(!/mk-secim|mk-sube\b|mk-btn/.test(css), 'seçim stilleri temizlenmeli');
  const acik = (css.match(/{/g) || []).length, kapali = (css.match(/}/g) || []).length;
  assert.equal(acik, kapali, 'CSS blokları dengeli olmalı');
});
