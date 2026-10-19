// MP3 Dönüştürücü (2026-10-19) — yalnız yöneticiye açık kurulum/kullanım sayfası.
//
// Sayfa dönüştürme yapmaz: linki indirip MP3/WAV'a çeviren araç kullanıcının
// Mac'inde çalışır. Bu test üç kararı kilitler:
//   1. Sayfa yönetici kapısı olmadan içerik göstermez.
//   2. Sayfa bir ses indirme servisi değildir (dosya yüklemez, dış servise
//      istek atmaz); bu yüzden herkese açık bir ripper'a dönüşemez.
//   3. Yönetim panelinden bağlantı verilir, sayfa aramaya kapalıdır.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const KOK = path.join(__dirname, '..');
const oku = d => fs.readFileSync(path.join(KOK, d), 'utf8');

test('sayfa var, başlığı MP3 Dönüştürücü ve aramaya kapalı', () => {
  const html = oku('mp3-donusturucu.html');
  assert.match(html, /<title>MP3 Dönüştürücü — Derin Record<\/title>/);
  assert.match(html, /<meta name="robots" content="noindex">/);
});

test('yönetici kapısı: giriş yoksa ve rol admin değilse içerik açılmaz', () => {
  const js = oku('mp3-donusturucu.js');
  assert.match(js, /profile\?\.role !== 'admin'/, 'admin rolü denetlenmeli');
  assert.match(js, /DerinAuth\.open\(\)/, 'girişsiz kullanıcıya giriş düğmesi verilmeli');
  assert.match(js, /uygulama\.hidden = false/, 'içerik yalnız yetki sonrası açılmalı');
  const html = oku('mp3-donusturucu.html');
  assert.match(html, /<section id="mp3-uygulama" hidden>/, 'içerik başlangıçta gizli olmalı');
});

test('sayfa ses indirme servisi değil: dosya yüklemez, dış servise istek atmaz', () => {
  const html = oku('mp3-donusturucu.html');
  const js = oku('mp3-donusturucu.js');
  assert.ok(!/type=["']file["']/.test(html), 'dosya yükleme alanı olmamalı');
  assert.ok(!/fetch\(|XMLHttpRequest/.test(js), 'sayfa dışarıya istek atmamalı');
  assert.ok(!/youtube\.com|youtu\.be|googlevideo/i.test(js), 'indirme adresi koda gömülmemeli');
});

test('yönetim panelinden bağlantı verilir', () => {
  const admin = oku('admin.js');
  assert.match(admin, /href="mp3-donusturucu\.html"/, 'admin.js sayfaya bağlanmalı');
  assert.match(admin, /<h2>MP3 DÖNÜŞTÜRÜCÜ<\/h2>/, 'panel başlığı görünmeli');
});

test('sayfa çıktı biçimlerini ve klasörü doğru anlatır', () => {
  const html = oku('mp3-donusturucu.html');
  assert.match(html, /WAV 24-bit \/ 48 kHz/);
  assert.match(html, /MP3 320 kbps/);
  assert.match(html, /~\/Music\/Derin Record/);
  assert.match(html, /~\/bin\/derin-ses-al/, 'kullanım komutu yazılmalı');
});

test('betik yüklemeleri sürümlü ve doğru sırada', () => {
  const html = oku('mp3-donusturucu.html');
  const auth = html.indexOf('auth.js?v=');
  const sayfa = html.indexOf('mp3-donusturucu.js?v=');
  assert.ok(auth > -1 && sayfa > auth, 'auth.js önce yüklenmeli');
  assert.match(html, /config\.js/);
});
