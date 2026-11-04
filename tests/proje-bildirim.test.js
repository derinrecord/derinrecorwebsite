const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const oku = d => fs.readFileSync(path.join(__dirname, '..', d), 'utf8');
const PB = require('../proje-bildirim.js');
const { hedef } = require('../api/bildirim-gonder.js');

test('her olay için Türkçe başlık + proje adı içeren metin + Projelerim adresi', () => {
  const p = { title: 'Ritmik Top 2027' };
  const beklenen = {
    parca: '🎵 Projene yeni parça eklendi', surum: '🔁 Yeni sürüm hazır', asama: '📍 Projen yeni aşamada',
    not: '💬 Derin Record not bıraktı', proje: '📁 Sana yeni proje açıldı', indirme: '⬇️ Parçanı indirebilirsin'
  };
  for (const [tur, baslik] of Object.entries(beklenen)) {
    const m = PB.mesaj(tur, { proje: p, parca: 'Final mix', asama: 'delivered' });
    assert.equal(m.baslik, baslik, tur);
    assert.match(m.metin, /Ritmik Top 2027/, tur);
    assert.equal(m.adres, '/my-projects.html');
  }
  assert.match(PB.mesaj('asama', { proje: p, asama: 'delivered' }).metin, /TESLİM EDİLDİ/);
  assert.match(PB.mesaj('parca', { proje: p, parca: 'Final mix' }).metin, /Final mix/);
});

test('bilinmeyen olay ya da projesiz çağrı bildirim üretmez', () => {
  assert.equal(PB.mesaj('sil', { proje: { title: 'x' } }), null);
  assert.equal(PB.mesaj('parca', {}), null);
});

test('hedef: yalnız geçerli kullanıcı kimliği kabul edilir', () => {
  assert.equal(hedef({ kullanici: '3f1c2b9a-1d2e-4f50-8a9b-0c1d2e3f4a5b' }), '3f1c2b9a-1d2e-4f50-8a9b-0c1d2e3f4a5b');
  assert.equal(hedef({}), null);
  assert.equal(hedef({ kullanici: 'x),user_id.neq.(' }), false);
});

test('sunucu hedefli gönderimde yalnız o kişinin aboneliklerini okur', () => {
  const s = oku('api/bildirim-gonder.js');
  assert.match(s, /user_id=eq\./);
});

test('Projelerim: yönetici işlemlerinde müşteriye bildirim gider, antrenörün kendi işinde gitmez', () => {
  const j = oku('projects.js');
  assert.match(j, /function musteriyeBildir\(/);
  assert.match(j, /if\(!admin\|\|!coach\|\|coach===me\)return;/);
  for (const tur of ['parca', 'surum', 'asama', 'not', 'proje', 'indirme']) {
    assert.ok(j.includes(`musteriyeBildir(`) && new RegExp(`musteriyeBildir\\(.*'${tur}'`).test(j), tur);
  }
  const h = oku('my-projects.html');
  assert.match(h, /proje-bildirim\.js\?v=\d+/);
});
