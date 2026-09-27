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
// olmadığı için taklitte varsayılan anahtarı kullanırız. Anahtar geçerli bir
// uuid olmalı, yoksa oynatıcı onu bozuk sanıp hiç açılmaz.
const PROVA_ANAHTAR = 'a1b2c3d4-e5f6-4a7b-8c9d-0000000000aa';
let sayfaHam = fs.readFileSync(path.join(kok, 'radyo-cihaz-prova.html'), 'utf8');
if (!sayfaHam.includes("'" + PROVA_ANAHTAR + "'")) {
  throw new Error('prova sayfasının anahtarı değişmiş; buradaki PROVA_ANAHTAR ile eşleşmeli');
}
const radyo = oku('radyo.js')
  .replace("new URLSearchParams(location.search).get('key')", "(new URLSearchParams(location.search).get('key') || '" + PROVA_ANAHTAR + "')");

// Dış bağımlılıkları çıkar: yapılandırma satır içine gömülür, CDN'e gidilmez.
sayfa = sayfa
  .replace(/<script src="config\.js"><\/script>\n?/, '')
  .replace(/<script src="https:\/\/cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js@[^"]+"><\/script>\n?/, '')
  // Sürüm damgası değişebilir; sabit metne bağlanmayalım.
  .replace(/<script src="radio-playlist-queue\.js\?v=[^"]+"><\/script>/, '<script>\n' + kuyruk + '\n</script>')
  .replace(/<script src="radyo\.js\?v=[^"]+"><\/script>/, '<script>\n' + radyo + '\n</script>');

// Senaryo seçimi: sorgu dizesi olmadan da çalışsın.
sayfa = sayfa.replace("|| 'ilk';", "|| '" + senaryo + "';");
sayfa = sayfa.replace(
  '<script>\n// ---- Sunucu taklidi',
  '<script>window.DERIN_CONFIG = { supabaseUrl: \'https://prova.test\', supabasePublishableKey: \'prova\' };</script>\n<script>\n// ---- Sunucu taklidi'
);

fs.writeFileSync(ciktiYolu, sayfa);
console.log(path.relative(kok, ciktiYolu) + ' yazıldı · senaryo=' + senaryo + ' · ' + sayfa.length + ' bayt');
['radyo.js', 'radio-playlist-queue.js', 'config.js'].forEach(dis => {
  if (sayfa.includes('src="' + dis)) throw new Error(dis + ' hâlâ dışarıdan yükleniyor');
});
if (!sayfa.includes('window.DERIN_CONFIG')) throw new Error('DERIN_CONFIG gömülmedi');
