// Eski kafe oynatıcısı (radyo.html) kaldırıldı: kafede tek ekran müşteri sunumu.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const KOK = path.join(__dirname, '..');

test('kafe oynatıcı dosyaları yok', () => {
  ['radyo.html', 'radyo.js', 'radyo-cihaz-prova.html', 'radio-playlist-queue.js'].forEach(f =>
    assert.ok(!fs.existsSync(path.join(KOK, f)), f + ' silinmeli'));
});

test('eski kafe linki şube sunumuna kalıcı yönlenir', () => {
  const v = JSON.parse(fs.readFileSync(path.join(KOK, 'vercel.json'), 'utf8'));
  const r = (v.redirects || []).find(x => x.source === '/radyo.html' && x.has);
  assert.ok(r, 'yönlendirme olmalı');
  assert.equal(r.destination, '/coffee/s/:key');
  assert.equal(r.permanent, true);
});

test('hiçbir sayfa ya da betik eski oynatıcıyı yüklemez', () => {
  const dosyalar = fs.readdirSync(KOK).filter(f => /\.(html|js)$/.test(f));
  dosyalar.forEach(f => {
    const icerik = fs.readFileSync(path.join(KOK, f), 'utf8');
    assert.ok(!/src="\/?radyo\.js/.test(icerik), f + ' radyo.js yüklememeli');
    assert.ok(!/radyo\.html\?key=/.test(icerik), f + ' eski linki üretmemeli');
  });
});
