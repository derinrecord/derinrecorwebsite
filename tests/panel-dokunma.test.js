// Derin paneli çoğunlukla telefondan kullanıyor. Küçük düğmeler (.btn.sm:
// KURULUMU AÇ, BİLDİRİMLERİ AÇ, CİHAZ LİNKİ, YÖNET…) ve bölüm sekmeleri
// (Şubeler, Yayın başlat…) 34–35px yüksekliğindeydi; telefonda en az 40px
// olmalı ki parmakla rahat basılsın. Bilgisayar görünümü değişmez.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const kok = path.join(__dirname, '..');
const css = fs.readFileSync(path.join(kok, 'radyo-panel.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

function telefonBloklari() {
  const bloklar = [];
  const re = /@media\s*\(max-width:\s*620px\)\s*\{/g;
  let m;
  while ((m = re.exec(css))) {
    let i = re.lastIndex, derinlik = 1;
    while (derinlik && i < css.length) { if (css[i] === '{') derinlik++; else if (css[i] === '}') derinlik--; i++; }
    bloklar.push(css.slice(re.lastIndex, i - 1));
  }
  return bloklar.join('\n');
}

test('telefonda küçük düğmeler ve sekmeler en az 40px yüksek', () => {
  const tel = telefonBloklari();
  for (const secici of ['.btn.sm', '.tabs button']) {
    const kural = tel.split('}').find(k => k.split('{')[0].split(',').map(s => s.trim()).includes(secici));
    assert.ok(kural, secici + ' için telefon kuralı yok');
    const h = /min-height:\s*(\d+)px/.exec(kural);
    assert.ok(h && Number(h[1]) >= 40, secici + ' telefonda min-height ≥ 40px olmalı');
  }
});

test('yeni css sürümü sayfalara yansıdı', () => {
  for (const f of ['radyo-yonetim.html', 'radyo-panel-prova.html']) {
    const m = /radyo-panel\.css\?v=(\d+)"/.exec(fs.readFileSync(path.join(kok, f), 'utf8'));
    assert.ok(m && Number(m[1]) >= 40, f);
  }
});
