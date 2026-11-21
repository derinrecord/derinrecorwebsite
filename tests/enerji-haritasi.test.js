// Enerji Haritası sayfasının kalıcı sözleşmesi.
//
// 21 Kasım 2026: Derin tasarım B'yi ("Katmanlı") seçti. Sayfa artık üç katman çizer:
// enerji (dolgulu eğri, LUFS benzeri algılanan yükseklik), tempo eğrisi ve spektrum.
// 20 Ekim'deki "spektrum yok" kararı Derin'in isteğiyle kaldırıldı. Antrenör
// Projelerim parçalarını tek tıkla açar; dışarıdan dosya seçmek de mümkündür.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const KOK = path.join(__dirname, '..');
const oku = y => fs.readFileSync(path.join(KOK, y), 'utf8');

const html = oku('energy-map.html');
const css = oku('energy-map.css');
const js = oku('energy-map.js');
const Cekirdek = require('../energy-map-cekirdek.js');

// Sentetik vuruş: verilen BPM'de kısa, sönümlü "kick" + her vuruşta hi-hat gürültüsü.
function vurusSesi(bpm, saniye, sr = 22050) {
  const n = Math.round(saniye * sr), v = new Float32Array(n);
  const aralik = (60 / bpm) * sr;
  let tohum = 7;
  const rast = () => ((tohum = (tohum * 16807) % 2147483647) / 2147483647) * 2 - 1;
  for (let b = 0; b * aralik < n; b++) {
    const bas = Math.round(b * aralik);
    for (let i = 0; i < sr * 0.12 && bas + i < n; i++) {
      const t = i / sr;
      v[bas + i] += Math.sin(2 * Math.PI * (60 + 90 * Math.exp(-t * 30)) * t) * Math.exp(-t * 18) * 0.8;
      if (i < sr * 0.02) v[bas + i] += rast() * Math.exp(-t * 200) * 0.3;
    }
  }
  return v;
}

test('tempo yarıya ya da üçte ikiye kaymaz', () => {
  for (const bpm of [100, 128, 156, 168]) {
    const r = Cekirdek.analizEt(vurusSesi(bpm, 20), 22050, { dilim: 80, sutun: 60, bant: 24 });
    assert.ok(Math.abs(r.tempo - bpm) <= 1.5, `${bpm} BPM beklenirken ${r.tempo} bulundu`);
    assert.ok(r.tempoEgri.length > 5, 'tempo eğrisi olmalı');
  }
});

test('çekirdek enerji, yükseklik ve spektrum üretir', () => {
  const r = Cekirdek.analizEt(vurusSesi(140, 12), 22050, { dilim: 50, sutun: 40, bant: 24 });
  assert.equal(r.egri.length, 50);
  assert.ok(r.egri.every(v => v >= 0 && v <= 1), 'enerji 0..1 arası');
  assert.ok(r.tumlesikLufs < 0 && r.tumlesikLufs > -40, 'LUFS makul aralıkta');
  assert.equal(r.spektrum.length, 40 * 24);
  assert.ok(r.tepeBas >= 0 && r.tepeBas + r.tepeGenislik <= 50);
});

test('sayfa B tasarımını çizer: enerji, tempo, spektrum', () => {
  assert.equal((html.match(/<canvas/g) || []).length, 1, 'tek canvas olmalı');
  assert.match(html, /<canvas id="energy-chart"[^>]*role="img"/);
  assert.match(js, /function enerjiKatmani/);
  assert.match(js, /function tempoKatmani/);
  assert.match(js, /function spektrumKatmani/);
  assert.match(js, /quadraticCurveTo/, 'eğri düzgün yaylarla çizilmeli');
  assert.match(js, /shadowBlur/, 'enerji hattı parlak çizilmeli');
  assert.match(html, /energy-map-cekirdek\.js\?v=\d+/, 'analiz çekirdeği yüklenmeli');
  assert.ok(fs.existsSync(path.join(KOK, 'energy-map-isci.js')), 'analiz ayrı iş parçacığında çalışmalı');
});

test('antrenör çalışmalarını tek tıkla açar, dosya seçmek de mümkün', () => {
  assert.match(html, /id="calisma-liste"/);
  assert.match(js, /from\('music_projects'\)/, 'projeler RLS ile okunmalı');
  assert.match(js, /from\('project_tracks'\)/, 'parçalar RLS ile okunmalı');
  assert.match(js, /korumaliAdres\('project-audio'/, 'ses imzalı adresle alınmalı');
  assert.match(js, /parcalariCoz/, 'parçalı yüklenmiş dosyalar birleştirilmeli');
  assert.match(html, /id="audio-file"[^>]*type="file"/, 'dosya seç kalmalı');
  ['dragenter', 'dragover', 'drop'].forEach(o => assert.ok(js.includes(o), o + ' dinlenmeli'));
  assert.match(js, /escapeHtml\(i\.ad\)/, 'parça adı DOM\'a kaçışlı basılmalı');
});

test('grafik klavye ve ekran okuyucu ile okunabilir', () => {
  assert.match(html, /id="energy-chart"[^>]*tabindex="0"/);
  assert.match(html, /id="enerji-okuma"[^>]*aria-live="polite"/);
  assert.match(css, /\.ekran-okuyucu\s*\{/);
  assert.match(js, /ArrowRight/);
  assert.match(js, /aria-label/);
  assert.match(js, /pointerdown/);
});

test('özel oynatıcı: gizli ses, kare döngüsü, konum kaydırıcısı', () => {
  assert.match(html, /id="audio"[^>]*hidden/);
  assert.ok(!/<audio[^>]*controls/.test(html));
  assert.match(html, /id="oynat"/);
  assert.match(html, /id="konum"[^>]*type="range"/);
  assert.match(js, /requestAnimationFrame\(kareCiz\)/);
  assert.match(js, /cancelAnimationFrame/);
  assert.match(js, /if \(audio\.paused\)/);
});

test('stil ve betik dosyaları sürüm etiketiyle yüklenir', () => {
  assert.match(html, /energy-map\.css\?v=\d+/);
  assert.match(html, /energy-map\.js\?v=\d+/);
});

// 21 Kasım 2026: spektrum açılıp kapanabilir; sayfa her açılışta spektrum AÇIK karşılar.
test('spektrum düğmesi var ve sayfa spektrum açık açılır', () => {
  assert.match(html, /id="spek-dugme"[^>]*aria-pressed="true"/);
  assert.match(html, /id="spek-durum">açık</);
  assert.match(js, /let spekAcik = true;/);
  assert.match(js, /if \(spekAcik\) spektrumKatmani/);
  assert.doesNotMatch(js, /localStorage[^\n]*spek/);
});
