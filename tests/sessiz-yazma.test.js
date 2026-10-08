const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Sitede tekrar eden bir hata sınıfı: Supabase, hiçbir satırı etkilemeyen
// güncelleme/silmede hata döndürmez (RLS engeli ya da artık var olmayan
// kimlik). Panel/portal "kaydedildi/silindi" der, kayıt yerinde kalır;
// kullanıcı için "düğme çalışmıyor" gibi görünür. Bu test, tek satırı
// hedefleyen her yazmanın etkilenen satırı geri isteyip doğrulamasını bekler:
// zincirin sonunda .select('id') olur ya da çağrı bir doğrulama yardımcısıyla
// (yazDogrula / tekSatir / tekSatirDogrula) sarılır.
const KOK = path.join(__dirname, '..');
const dosyalar = fs.readdirSync(KOK)
  .filter(f => f.endsWith('.js') && fs.statSync(path.join(KOK, f)).isFile());

test('tek satırı hedefleyen yazmaların hepsi doğrulanır', () => {
  const eksik = [];
  let sayi = 0;
  for (const ad of dosyalar) {
    const satirlar = fs.readFileSync(path.join(KOK, ad), 'utf8').split('\n');
    satirlar.forEach((satir, i) => {
      if (!/\.(delete|update)\(/.test(satir)) return;
      // Aynı satırda ya da bir sonraki satırda .eq('id', ...) ile tek satır hedeflenir.
      if (!/\.eq\('id',/.test(satir + '\n' + (satirlar[i + 1] || ''))) return;
      sayi++;
      const pencere = satirlar.slice(Math.max(0, i - 2), i + 3).join('\n');
      if (!/\.select\('id'\)|Dogrula\(|tekSatir\(/.test(pencere)) eksik.push(ad + ':' + (i + 1));
    });
  }
  assert.ok(sayi >= 40, 'tarama dosyaları gerçekten okumalı (bulunan yazma: ' + sayi + ')');
  assert.deepEqual(eksik, [], 'doğrulanmayan tek satır yazmaları: ' + eksik.join(', '));
});

test('doğrulama yardımcıları 0 satır silinmesini/yazılmamasını hata sayar', () => {
  const radyo = fs.readFileSync(path.join(KOK, 'radyo-yonetim.js'), 'utf8');
  assert.match(radyo, /async function yazDogrula/, 'panelde ortak yardımcı olmalı');
  assert.match(radyo, /if \(!data \|\| !data\.length\)/, 'yazDogrula 0 satırı hata saymalı');
  ['projects.js', 'feedback.js'].forEach(ad => {
    const s = fs.readFileSync(path.join(KOK, ad), 'utf8');
    assert.match(s, /async function tekSatir/, ad + ' doğrulama yardımcısı içermeli');
    assert.match(s, /!\s*data\s*\|\|\s*!\s*data\.length/, ad + ': 0 satır hata sayılmalı');
  });
});

test('panelde tıklama ve değişiklik işleri beklenmeyen hatayı kullanıcıya söyler', () => {
  const radyo = fs.readFileSync(path.join(KOK, 'radyo-yonetim.js'), 'utf8');
  ['click', 'change'].forEach(olay => {
    const bas = radyo.indexOf("document.addEventListener('" + olay + "'");
    assert.ok(bas > 0, olay + ' dinleyicisi bulunmalı');
    const sonraki = radyo.indexOf("document.addEventListener('", bas + 10);
    const blok = radyo.slice(bas, sonraki > 0 ? sonraki : bas + 60000);
    assert.match(blok, /catch \(err\)[\s\S]{0,240}hata\('İşlem yapılamadı/, olay + ': catch kullanıcıya bildirmeli');
  });
});
