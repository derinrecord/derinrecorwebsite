// Derin Record ikonları (21 Kasım 2026): dosya türleri "makara bant", Dosya ekle kare,
// diğer butonlar pembe yuvarlak. uygulama.js her sayfaya dr-ikonlar.js'i yükler.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const kok = path.join(__dirname, '..');

test('uygulama.js dr-ikonlar.js dosyasını yükler', () => {
  assert.match(fs.readFileSync(path.join(kok, 'uygulama.js'), 'utf8'), /dr-ikonlar\.js\?v=\d+/);
});

test('dr-ikonlar.js içindeki her ikon dosyası assets/ikonlar altında var', () => {
  const js = fs.readFileSync(path.join(kok, 'dr-ikonlar.js'), 'utf8');
  const turler = new Set(Object.values(eval('(' + js.match(/const TUR = (\{[\s\S]*?\});/)[1] + ')')));
  const adlar = [...turler].map((t) => 'dosya-' + t).concat(['dosya-ekle', 'buton-yukle']);
  for (const ad of adlar) assert.ok(fs.existsSync(path.join(kok, 'assets/ikonlar', ad + '.svg')), ad + '.svg eksik');
});

test('renkler: MP3 yeşil, video (MP4) pembe', () => {
  assert.match(fs.readFileSync(path.join(kok, 'assets/ikonlar/dosya-mp3.svg'), 'utf8'), /#9be15d/);
  assert.match(fs.readFileSync(path.join(kok, 'assets/ikonlar/dosya-video.svg'), 'utf8'), /#cb2468/);
});

test('FLAC turuncu (MP3 yeşilinden ayrı)', () => {
  assert.match(fs.readFileSync(path.join(kok, 'assets/ikonlar/dosya-flac.svg'), 'utf8'), /#ff9f43/);
});
