// Önizleme (Preview) paneli bir seferde yalnızca kayıtlı HTML dosyasını sunar;
// sayfanın kardeş <script src="..."> istekleri 404 döner ve oynatıcı hiç
// başlamaz. Bu yüzden prova sayfalarını tarayıcıda gözle doğrulamak için önce
// tek dosyaya çevirmek gerekir. Betik bunu yapar.
//
// Kullanım:  node tests/onizleme-olustur.js <senaryo> [cikti]
// Örnek:     node tests/onizleme-olustur.js zincir-kopuk
// Çıktı bilinçli olarak tests/ altına yazılır: .vercelignore bu klasörü yayına
// almaz, böylece prova dosyası canlıya sızmaz.
const fs = require('fs');
const path = require('path');

const kok = path.join(__dirname, '..');
const oku = f => fs.readFileSync(path.join(kok, f), 'utf8');

const senaryo = process.argv[2] || 'zincir-kopuk';
const cikti = process.argv[3] || path.join('tests', 'onizleme.html');
const ciktiYolu = path.resolve(kok, cikti);

let sayfa = oku('radyo-cihaz-prova.html');
const kuyruk = oku('radio-playlist-queue.js');
// Oynatıcı anahtarı yalnızca sorgu dizesinden okur; provada sorgu dizesi
// olmadığı için taklidin kullandığı anahtarı varsayılan yapıyoruz.
const radyo = oku('radyo.js')
  .replace("new URLSearchParams(location.search).get('key')", "(new URLSearchParams(location.search).get('key') || 'provakey')");

// Dış bağımlılıkları çıkar: yapılandırma satır içine gömülür, CDN'e gidilmez.
sayfa = sayfa
  .replace('<script src="config.js"></script>\n', '')
  .replace('<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.81.1"></script>\n', '')
  .replace('<script src="radio-playlist-queue.js?v=20260926a"></script>', '<script>\n' + kuyruk + '\n</script>')
  .replace('<script src="radyo.js?v=20260927a"></script>', '<script>\n' + radyo + '\n</script>');

// Senaryo seçimi: sorgu dizesi olmadan da çalışsın.
sayfa = sayfa.replace("|| 'ilk';", "|| '" + senaryo + "';");
sayfa = sayfa.replace(
  '<script>\n// ---- Sunucu taklidi',
  '<script>window.DERIN_CONFIG = { supabaseUrl: \'https://prova.test\', supabasePublishableKey: \'prova\' };</script>\n<script>\n// ---- Sunucu taklidi'
);

fs.writeFileSync(ciktiYolu, sayfa);
console.log(path.relative(kok, ciktiYolu) + ' yazıldı · senaryo=' + senaryo + ' · ' + sayfa.length + ' bayt');
if (sayfa.includes('src="radyo.js')) throw new Error('radyo.js gömülmedi');
if (sayfa.includes('src="radio-playlist-queue.js')) throw new Error('kuyruk gömülmedi');
if (sayfa.includes('src="config.js')) throw new Error('config.js kaldırılmadı');
