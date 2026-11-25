const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const V = require('../radyo-panel-views.js');

// 25 Kasım 2026: şarkı, liste ve ses değişimi panelde anında görünür.
test('yeni hareket türleri geçmişte okunur adla görünür', () => {
  assert.equal(V.olayBilgi({ kind: 'sarki-degisti', detail: 'Kitchen Slow Dance' }).ad, 'Şarkı değişti');
  assert.equal(V.olayBilgi({ kind: 'liste-degisti', detail: 'Lofi → Afro' }).ad, 'Çalma listesi değişti');
  const ses = V.olayBilgi({ kind: 'ses-degisti', detail: '%40 → %80' });
  assert.equal(ses.ad, 'Ses seviyesi değişti');
  assert.equal(ses.sorun, false);
});

test('şube ekranı sesi değiştiği anda bildirir; panel hareketleri ayrı okur', () => {
  const sube = fs.readFileSync(require.resolve('../coffee-marka.js'), 'utf8');
  assert.match(sube, /audio\.volume = seviye;\n\s+sesDegisti\(\);/);
  assert.match(sube, /\}, 400\);/);
  const panel = fs.readFileSync(require.resolve('../radyo-yonetim.js'), 'utf8');
  assert.match(panel, /\.not\('kind', 'in', '\(sarki-degisti,ses-degisti,liste-degisti\)'\)/);
  assert.match(panel, /\.in\('kind', \['sarki-degisti', 'ses-degisti', 'liste-degisti'\]\)/);
  assert.match(fs.readFileSync(require.resolve('../coffee-marka.html'), 'utf8'), /coffee-marka\.js\?v=40/);
});
