// dalga-tepeleri.js: dalga formu verisi (Ableton tarzı: her dilimde en düşük,
// en yüksek ve ortalama ses düzeyi). WAV, ses inerken parça parça işlenir; böylece
// dalga dosyanın tamamı inmeden soldan sağa çizilebilir.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function yukle() {
  const window = {};
  const kod = fs.readFileSync(path.join(__dirname, '..', 'dalga-tepeleri.js'), 'utf8');
  vm.runInNewContext(kod, {
    window, Float32Array, Int8Array, Uint8Array, DataView, ArrayBuffer, Math, String, Number, Infinity,
    btoa: s => Buffer.from(s, 'binary').toString('base64'),
    atob: s => Buffer.from(s, 'base64').toString('binary')
  });
  return window.DerinDalga;
}

// Basit PCM WAV üretici: örnekler -1..1 arası, kanallar sırayla (interleaved).
function wav({ sr = 8000, kanal = 1, bit = 16, ornekler, bicim = 1, boySifir = false }) {
  const bps = bit / 8, veri = Buffer.alloc(ornekler.length * bps);
  ornekler.forEach((v, i) => {
    const o = i * bps;
    if (bicim === 3) veri.writeFloatLE(v, o);
    else if (bit === 16) veri.writeInt16LE(Math.round(v * 32767), o);
    else if (bit === 24) veri.writeIntLE(Math.round(v * 8388607), o, 3);
    else if (bit === 32) veri.writeInt32LE(Math.round(v * 2147483647), o);
  });
  const fmt = Buffer.alloc(24);
  fmt.write('fmt ', 0); fmt.writeUInt32LE(16, 4); fmt.writeUInt16LE(bicim, 8); fmt.writeUInt16LE(kanal, 10);
  fmt.writeUInt32LE(sr, 12); fmt.writeUInt32LE(sr * kanal * bps, 16); fmt.writeUInt16LE(kanal * bps, 20); fmt.writeUInt16LE(bit, 22);
  const list = Buffer.concat([Buffer.from('LIST'), Buffer.from([3, 0, 0, 0]), Buffer.from('abc'), Buffer.from([0])]);
  const dh = Buffer.alloc(8); dh.write('data', 0); dh.writeUInt32LE(boySifir ? 0xffffffff : veri.length, 4);
  const govde = Buffer.concat([Buffer.from('WAVE'), fmt, list, dh, veri]);
  const riff = Buffer.alloc(8); riff.write('RIFF', 0); riff.writeUInt32LE(govde.length, 4);
  return Buffer.concat([riff, govde]);
}
const ab = b => b.buffer.slice(b.byteOffset, b.byteOffset + b.length);

test('16 bit mono WAV: süre, dilim sayısı, en düşük/en yüksek ve ortalama düzey', () => {
  const D = yukle();
  // 2 sn @8000: ilk saniye sessiz, ikinci saniye +0.5/-0.25 kare dalga.
  const o = Array.from({ length: 16000 }, (_, i) => (i < 8000 ? 0 : (i % 2 ? 0.5 : -0.25)));
  const r = D.wavTepeleri(ab(wav({ ornekler: o })), 10);
  assert.ok(r, 'WAV okunmalı');
  assert.equal(r.duration, 2);
  assert.equal(r.n, 20);
  assert.equal(r.hazir, 20);
  // Normalize: en büyük mutlak değer 1 olur (0.5 → 1, -0.25 → -0.5).
  assert.equal(r.kanal, 1);
  assert.equal(r.mx[0][0], 0); assert.equal(r.mn[0][0], 0);
  assert.ok(Math.abs(r.mx[0][15] - 1) < 1e-3);
  assert.ok(Math.abs(r.mn[0][15] + 0.5) < 1e-3);
});

test('24 bit stereo WAV: sol ve sağ kanal ayrı şeritlerde tutulur', () => {
  const D = yukle();
  const o = [];
  for (let i = 0; i < 8000; i++) { o.push(i < 4000 ? 0.4 : 0); o.push(i >= 4000 ? 0.8 : 0); }
  const r = D.wavTepeleri(ab(wav({ kanal: 2, bit: 24, ornekler: o })), 4);
  assert.equal(r.duration, 1);
  assert.equal(r.kanal, 2);
  // Sol: ilk yarıda 0.4 (normalize → 0.5), ikinci yarı sessiz. Sağ: tersi, 0.8 → 1.
  assert.ok(Math.abs(r.mx[0][0] - 0.5) < 1e-3); assert.equal(r.mx[0][3], 0);
  assert.equal(r.mx[1][0], 0); assert.ok(r.mx[1][3] > 0.99);
});

test('32 bit float WAV okunur', () => {
  const D = yukle();
  const o = Array.from({ length: 8000 }, (_, i) => (i > 6000 ? -0.25 : 0.1));
  const r = D.wavTepeleri(ab(wav({ bit: 32, bicim: 3, ornekler: o })), 4);
  assert.ok(r);
  assert.ok(r.mn[0][3] < -0.99);
  assert.ok(r.mx[0][0] > 0.3 && r.mx[0][0] < 0.5);
});

test('akış: parça parça verilen WAV, tek seferde okunanla aynı sonucu verir ve yolda ilerler', () => {
  const D = yukle();
  const o = Array.from({ length: 24000 }, (_, i) => Math.sin(i / 7) * (i / 24000));
  const dosya = wav({ kanal: 1, bit: 24, ornekler: o });
  const tek = D.wavTepeleri(ab(dosya), 50);
  const akis = D.wavAkis(50);
  let sonHazir = 0, arttiMi = false;
  for (let i = 0; i < dosya.length; i += 997) { // tek sayılı dilim: örnek ortadan bölünür
    akis.ekle(new Uint8Array(dosya.subarray(i, i + 997)));
    const v = akis.veri();
    if (v && v.hazir > sonHazir) { if (sonHazir > 0) arttiMi = true; sonHazir = v.hazir; }
  }
  const r = akis.bitir();
  assert.ok(arttiMi, 'dalga yolda ilerlemeli');
  assert.equal(r.n, tek.n);
  for (let i = 0; i < r.n; i++) {
    assert.ok(Math.abs(r.mx[0][i] - tek.mx[0][i]) < 1e-6);
    assert.ok(Math.abs(r.mn[0][i] - tek.mn[0][i]) < 1e-6);
  }
  // Başlık okununca süre baştan bilinir (dalga tam genişlikte çizilir).
  const a2 = D.wavAkis(50); a2.ekle(new Uint8Array(dosya.subarray(0, 200)));
  assert.equal(a2.veri().duration, 3);
});

test('veri boyu yazılmamış WAV (0xFFFFFFFF) da sonuna kadar okunur', () => {
  const D = yukle();
  const o = Array.from({ length: 8000 }, () => 0.3);
  const r = D.wavTepeleri(ab(wav({ ornekler: o, boySifir: true })), 10);
  assert.equal(r.n, 10);
  assert.ok(r.mx[0][9] > 0.99);
});

test('WAV olmayan dosyada null döner (MP3 için tarayıcı çözücüsü kullanılır)', () => {
  const D = yukle();
  assert.equal(D.wavTepeleri(ab(Buffer.from('ID3\u0003\u0000 mp3 verisi')), 60), null);
  assert.equal(D.wavMi(new Uint8Array(Buffer.from('ID3\u0003'))), false);
  assert.equal(D.wavMi(new Uint8Array(wav({ ornekler: [0, 0] }).subarray(0, 12))), true);
});

test('çözülmüş ses kanallarından (MP3) aynı yapıda veri üretilir', () => {
  const D = yukle();
  const sol = new Float32Array(8000).map((_, i) => (i < 4000 ? 0 : 0.5));
  const sag = new Float32Array(8000).map(() => -0.25);
  const r = D.pcmTepeleri([sol, sag], 8000, 4);
  assert.equal(r.n, 4); assert.equal(r.kanal, 2);
  assert.equal(r.mx[0][0], 0);
  assert.ok(Math.abs(r.mx[0][3] - 1) < 1e-6);
  assert.ok(Math.abs(r.mn[1][0] + 0.5) < 1e-6);
});

test('saklama metni: yeni biçim geri çözülür; eski biçim (d1) "eski" işaretiyle okunur', () => {
  const D = yukle();
  const o = [];
  for (let i = 0; i < 8000; i++) { o.push(Math.sin(i / 3) * 0.7); o.push(Math.cos(i / 5) * 0.3); }
  const r = D.wavTepeleri(ab(wav({ kanal: 2, ornekler: o })), 20);
  const metin = D.kodla(r);
  assert.match(metin, /^d3\|/);
  const geri = D.coz(metin);
  assert.equal(geri.n, r.n); assert.equal(geri.kanal, 2);
  assert.equal(geri.duration, r.duration);
  assert.equal(geri.hazir, r.n);
  assert.ok(!geri.eski);
  for (let c = 0; c < 2; c++) for (let i = 0; i < r.n; i++) {
    assert.ok(Math.abs(geri.mx[c][i] - r.mx[c][i]) < 2 / 127);
    assert.ok(Math.abs(geri.mn[c][i] - r.mn[c][i]) < 2 / 127);
  }
  // Önceki biçimler de okunur ama "eski" işaretlenir (yerine yenisi yazılır).
  const eski = D.coz('d1|2|' + Buffer.from([0, 128, 255]).toString('base64'));
  assert.ok(eski.eski); assert.equal(eski.n, 3); assert.equal(eski.kanal, 1);
  assert.ok(Math.abs(eski.mx[0][2] - 1) < 1e-6 && Math.abs(eski.mn[0][2] + 1) < 1e-6);
  const d2 = D.coz('d2|1|3|' + Buffer.from([0x81, 0x7f, 200, 0, 0, 0, 0, 0, 0]).toString('base64'));
  assert.ok(d2.eski); assert.equal(d2.n, 3); assert.ok(d2.mx[0][0] > 0.99 && d2.mn[0][0] < -0.99);
  assert.equal(D.coz('bozuk'), null);
});
