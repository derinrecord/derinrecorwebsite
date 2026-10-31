// Uygulama (31 Ekim): site, Derin Record uygulamasının içinde açıldığını tarayıcı kimliğindeki
// "DerinRecordApp/1" imzasından anlar. Normal tarayıcıda hiçbir şey değişmez.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const KOK = path.join(__dirname, '..');
const oku = d => fs.readFileSync(path.join(KOK, d), 'utf8');
const A = require('../uygulama.js');

test('uygulama imzası tanınır', () => {
  assert.deepEqual(A.tani('Mozilla/5.0 (Linux; Android 14) Chrome/120 DerinRecordApp/1'), { uygulamada: true, platform: 'android' });
  assert.deepEqual(A.tani('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) DerinRecordApp/1'), { uygulamada: true, platform: 'ios' });
  assert.deepEqual(A.tani('Mozilla/5.0 (Linux; Android 14) Chrome/120'), { uygulamada: false, platform: null });
  assert.deepEqual(A.tani(''), { uygulamada: false, platform: null });
  assert.deepEqual(A.tani(undefined), { uygulamada: false, platform: null });
});

test("her sayfa uygulama.js'i auth.js'ten önce yükler", () => {
  for (const f of fs.readdirSync(KOK).filter(f => f.endsWith('.html') && !f.endsWith('-prova.html'))) {
    const s = oku(f); if (!s.includes('src="auth.js')) continue;
    const u = s.indexOf('uygulama.js?v=');
    assert.ok(u > -1 && u < s.indexOf('src="auth.js'), f);
  }
});
