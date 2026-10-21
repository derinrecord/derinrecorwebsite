// Enerji haritası sayfasının kalıcı sözleşmesi.
//
// 2026-10-20'de sayfa yeniden tasarlandı: salon önizlemesi (akustik profiller,
// yankı, EQ) ve canlı spektrum tamamen kaldırıldı. Sayfa artık tek bir iş
// yapıyor: yüklenen parçanın enerji dağılım grafiğini göstermek. Bu test
// kaldırılan parçaların geri gelmesini ve grafiğin erişilebilir kalmasını korur.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const KOK = path.join(__dirname, '..');
const oku = y => fs.readFileSync(path.join(KOK, y), 'utf8');

const html = oku('energy-map.html');
const css = oku('energy-map.css');
const js = oku('energy-map.js');

test('salon önizlemesi ve canlı spektrum geri gelmez', () => {
  [['energy-map.html', html], ['energy-map.css', css], ['energy-map.js', js]].forEach(([ad, icerik]) => {
    assert.ok(!/arena/i.test(icerik), ad + ' → salon önizlemesi izi olmamalı');
    assert.ok(!/spektrum/i.test(icerik), ad + ' → spektrum izi olmamalı');
  });
  // Ses zinciri (yankı + filtre) ve canlı spektrum tamamen çıkarıldı.
  ['getByteFrequencyData', 'createConvolver', 'createBiquadFilter'].forEach(ad =>
    assert.ok(!js.includes(ad), 'energy-map.js → ' + ad + ' kullanılmamalı'));
});

test('sayfa tek grafik çizer, sesi gizli tutar', () => {
  assert.equal((html.match(/<canvas/g) || []).length, 1, 'tek canvas olmalı');
  assert.match(html, /<canvas id="energy-chart"[^>]*role="img"/, 'canvas role="img" taşımalı');
  assert.match(html, /id="audio"[^>]*hidden/, 'ses öğesi gizli olmalı; oynatıcı sayfanın kendi');
  assert.ok(!/<audio[^>]*controls/.test(html), 'tarayıcının kendi oynatıcısı gösterilmemeli');
  assert.match(js, /decodeAudioData/, 'ses dosyası Web Audio ile çözülmeli');
  assert.match(js, /DILIM = 160/, 'grafik 160 dilime bölünmeli');
  // Grafik sütun dizisi değil, genel enerji akışını özetleyen ince bir hat.
  assert.match(js, /quadraticCurveTo/, 'eğri düzgün yaylarla çizilmeli');
  assert.match(js, /shadowBlur/, 'hat neon hale ile çizilmeli');
  assert.ok(!js.includes('closePath'), 'alan kapatılıp boyanmamalı');
  assert.match(html, /isaret-egri/, 'gösterge işareti hat olmalı');
  assert.match(css, /\.isaret-egri\s*\{/, 'hat işareti stilli olmalı');
});

test('grafik klavye ve ekran okuyucu ile okunabilir', () => {
  assert.match(html, /id="energy-chart"[^>]*tabindex="0"/, 'canvas odaklanabilmeli');
  assert.match(html, /id="enerji-okuma"[^>]*aria-live="polite"/, 'canlı okuma bölgesi olmalı');
  assert.match(css, /\.ekran-okuyucu\s*\{/, 'canlı okuma bölgesi görsel olarak gizlenmeli');
  assert.match(js, /ArrowRight/, 'ok tuşlarıyla gezinilebilmeli');
  assert.match(js, /aria-label/, 'grafik özeti erişilebilir etikete yazılmalı');
  assert.match(js, /pointerdown/, 'grafiğe tıklayınca parça o noktadan çalmalı');
});

test('sürükle-bırak ve özel oynatıcı bağlı', () => {
  ['dragenter', 'dragover', 'drop'].forEach(olay =>
    assert.ok(js.includes(olay), 'energy-map.js → ' + olay + ' dinlenmeli'));
  assert.match(html, /id="oynat"/, 'oynat düğmesi olmalı');
  assert.match(html, /id="konum"[^>]*type="range"/, 'konum kaydırıcısı olmalı');
});

test('oynatma imleci kare kare akar, duraklayınca durur', () => {
  // timeupdate saniyede ~4 kez geldiği için imleç sıçrıyordu; artık yalnız
  // oynatma sırasında dönen tek bir döngü imleci ve dolguyu ilerletir.
  assert.match(js, /requestAnimationFrame\(kareCiz\)/, 'imleç döngüsü olmalı');
  assert.match(js, /cancelAnimationFrame/, 'duraklayınca döngü iptal edilmeli');
  assert.match(js, /if \(audio\.paused\)/, 'döngü çalmıyorken kendini durdurmalı');
  assert.match(html, /id="oynat-imlec"/, 'imleç kendi katmanında olmalı');
  assert.match(css, /\.oynat-imlec\s*\{/, 'imleç stili tanımlı olmalı');
  assert.match(css, /will-change: transform/, 'imleç transform ile kaydırılmalı');
});

test('tanıtım açıklaması (i) düğmesiyle açılıp kapanır', () => {
  // Bilgi yazısı sürekli görünmek yerine (i) düğmesinin arkasında durur.
  assert.match(
    html,
    /id="bilgi-dugme"[^>]*aria-expanded="false"[^>]*aria-controls="analiz-bilgi"/,
    '(i) düğmesi kapalı başlamalı ve açıklamayı işaret etmeli'
  );
  assert.match(html, /id="analiz-bilgi"[^>]*hidden/, 'açıklama başta gizli olmalı');
  assert.match(js, /aria-expanded/, 'düğme durumu güncellenmeli');
  assert.match(js, /bilgiMetni\.hidden = !acik/, 'açıklama gizlenip gösterilmeli');
  assert.match(js, /Escape/, 'Escape ile kapanabilmeli');
  // Simge, marka oynatıcısındaki pembe bilgi işaretiyle (.mk-info) aynı dilde.
  const blok = css.match(/\.bilgi-dugme\s*\{([\s\S]*?)\}/);
  assert.ok(blok, '(i) düğmesi stili tanımlı olmalı');
  assert.match(blok[1], /background:\s*var\(--pink\)/, 'simge pembe olmalı');
  assert.match(blok[1], /color:\s*var\(--cream\)/, 'i harfi krem olmalı');
  assert.match(blok[1], /font-style:\s*normal/, 'marka işareti eğik olmamalı');
});

test('stil ve betik dosyaları sürüm etiketiyle yüklenir', () => {
  assert.match(html, /energy-map\.css\?v=\d+/, 'CSS önbellek sürümü olmalı');
  assert.match(html, /energy-map\.js\?v=\d+/, 'JS önbellek sürümü olmalı');
});
