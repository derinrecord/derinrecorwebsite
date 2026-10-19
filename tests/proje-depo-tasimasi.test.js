// Görev 3 testi — taşıma betiğinin ağı kullanmayan saf parçaları.
// Betiğin kendisi (tests/proje-depo-tasimasi.js) burada ÇALIŞTIRILMAZ;
// yalnızca require ile dışa açılan yardımcılar denenir.
// Plan: docs/superpowers/plans/2026-10-18-proje-muzik-r2-gecis.md (Görev 3)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const T = require('./proje-depo-tasimasi.js');

test('bayraklar: bayraksız koşu kuru-çalıştırma (plan) demektir', () => {
  const a = T.argTopla([]);
  assert.equal(a.mod, 'plan');
  assert.equal(a.uygula, false);
  assert.equal(a.dogrula, false);
  assert.equal(a.temizle, false);
  assert.equal(a.sha, false);
});

test('bayraklar: --uygula kopyalama moduna alır', () => {
  const a = T.argTopla(['--uygula']);
  assert.equal(a.mod, 'uygula');
  assert.equal(a.uygula, true);
});

test('bayraklar: --dogrula doğrulama moduna alır; --sha eklenince SHA-256 denetimi açılır', () => {
  assert.equal(T.argTopla(['--dogrula']).mod, 'dogrula');
  const a = T.argTopla(['--dogrula', '--sha']);
  assert.equal(a.mod, 'dogrula');
  assert.equal(a.sha, true);
});

test('bayraklar: --temizle tek başına reddedilir (kural: yalnız --uygula ile)', () => {
  assert.throws(() => T.argTopla(['--temizle']), /--uygula/);
  const a = T.argTopla(['--temizle', '--uygula']);
  assert.equal(a.mod, 'uygula');
  assert.equal(a.temizle, true);
});

test('kapsam: yalnızca proje ve dj kovaları taşınır; feedback ve sesli notlar dışarıda', () => {
  assert.deepEqual([...T.KAPSAM_KOVALARI].sort(), ['dj-audio', 'project-audio']);
  const kaynak = fs.readFileSync(path.join(__dirname, 'proje-depo-tasimasi.js'), 'utf8');
  assert.ok(kaynak.includes('feedback-audio'), 'betik kapsam dışı kovaları açıkça belirtmeli');
  assert.ok(kaynak.includes('project-voice-notes'), 'betik sesli not kovasını açıkça dışarıda bırakmalı');
});

test('r2Anahtari: kova adı → R2 öneki dönüşümü r2-depo haritasıyla uyumlu', () => {
  assert.equal(T.r2Anahtari('project-audio', 'antrenor-1/p1-123.wav'), 'proje/antrenor-1/p1-123.wav');
  assert.equal(T.r2Anahtari('dj-audio', 'musteri/set.mp3'), 'dj/musteri/set.mp3');
  // Parçalı dosya adları (-p01of02) olduğu gibi korunur.
  assert.equal(
    T.r2Anahtari('project-audio', 'a/b-c-1760000-p02of03.wav'),
    'proje/a/b-c-1760000-p02of03.wav'
  );
});

test('r2Anahtari: kapsam dışı kova reddedilir (yanlış kovaya yazma güvenliği)', () => {
  assert.throws(() => T.r2Anahtari('feedback-audio', 'x.wav'), /kapsam/);
  assert.throws(() => T.r2Anahtari('radio-audio', 'radyo/x.wav'), /kapsam/);
  assert.throws(() => T.r2Anahtari('bilmemne', 'x.wav'), /kapsam/);
});

test('üst klasör saldırısı: yol içinde ".." geçen kayıt reddedilir', () => {
  assert.throws(() => T.r2Anahtari('project-audio', 'a/../sizma.wav'), /Geçersiz/);
  assert.throws(() => T.r2Anahtari('project-audio', '../sizma.wav'), /Geçersiz/);
});

test('manifest: yaz ve oku tam tur başarılı (geçici dizinde)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tasima-'));
  const dosya = path.join(dir, 'tasima-durumu.json');
  const kayitlar = [
    { yol: 'antrenor-1/p1.wav', boyut: 123, durum: 'kopyaladi' },
    { yol: 'antrenor-1/p1-p02of02.wav', boyut: 45, durum: 'atlandi' }
  ];
  T.manifestYaz(dosya, kayitlar);
  assert.deepEqual(T.manifestOku(dosya), kayitlar);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('manifest: boş/olmayan dosya boş dizi döner (patlamaz)', () => {
  assert.deepEqual(T.manifestOku(path.join(os.tmpdir(), 'yok-boyle-dosya-tasima.json')), []);
});

test('env denetimi: eksik değişkenleri Türkçe listeler', () => {
  const hata = T.eksikDegiskenler({});
  assert.ok(/SUPABASE_SERVICE_KEY/.test(hata));
  assert.ok(/R2_ACCOUNT_ID/.test(hata));
  assert.ok(/R2_BUCKET/.test(hata));
  const yeterli = T.eksikDegiskenler({
    SUPABASE_SERVICE_KEY: 'x', R2_ACCOUNT_ID: 'a', R2_ACCESS_KEY_ID: 'b',
    R2_SECRET_ACCESS_KEY: 'c', R2_BUCKET: 'd'
  });
  assert.equal(yeterli, null);
});
