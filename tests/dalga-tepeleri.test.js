// dalga-tepeleri.js: WAV dosyasından tarayıcının ağır ses çözme adımı olmadan
// dalga formu tepelerini çıkarır ve sonucu tarayıcıda saklanacak kısa bir
// metne çevirir. Neden önemli: büyük WAV'larda decodeAudioData saniyeler
// sürüyordu ve parça detayında dalga formu geç geliyordu.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function yukle() {
  const window = {};
  const kod = fs.readFileSync(path.join(__dirname, '..', 'dalga-tepeleri.js'), 'utf8');
  vm.runInNewContext(kod, { window, Float32Array, Uint8Array, DataView, ArrayBuffer, Math, String, btoa: s => Buffer.from(s, 'binary').toString('base64'), atob: s => Buffer.from(s, 'base64').toString('binary') });
  return window.DerinDalga;
}

// Basit PCM WAV üretici: örnekler -1..1 arası, kanal sırası karışık (interleaved).
function wav({ sr = 8000, kanal = 1, bit = 16, ornekler, bicim = 1 }) {
  const bps = bit / 8, veri = Buffer.alloc(ornekler.length * bps);
  ornekler.forEach((v, i) => {
    const o = i * bps;
    if (bicim === 3) veri.writeFloatLE(v, o);
    else if (bit === 16) veri.writeInt16LE(Math.round(v * 32767), o);
    else if (bit === 24) { const x = Math.round(v * 8388607); veri.writeIntLE(x, o, 3); }
    else if (bit === 32) veri.writeInt32LE(Math.round(v * 2147483647), o);
  });
  const fmt = Buffer.alloc(24);
  fmt.write('fmt ', 0); fmt.writeUInt32LE(16, 4); fmt.writeUInt16LE(bicim, 8); fmt.writeUInt16LE(kanal, 10);
  fmt.writeUInt32LE(sr, 12); fmt.writeUInt32LE(sr * kanal * bps, 16); fmt.writeUInt16LE(kanal * bps, 20); fmt.writeUInt16LE(bit, 22);
  // Arada başka bir parça (LIST) olsa da veri bulunmalı.
  const list = Buffer.concat([Buffer.from('LIST'), Buffer.from([3, 0, 0, 0]), Buffer.from('abc'), Buffer.from([0])]);
  const dh = Buffer.alloc(8); dh.write('data', 0); dh.writeUInt32LE(veri.length, 4);
  const govde = Buffer.concat([Buffer.from('WAVE'), fmt, list, dh, veri]);
  const riff = Buffer.alloc(8); riff.write('RIFF', 0); riff.writeUInt32LE(govde.length, 4);
  const b = Buffer.concat([riff, govde]);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.length);
}

test('16 bit mono WAV: süre ve tepe noktaları doğru çıkar', () => {
  const D = yukle();
  // 2 saniye: ilk saniye sessiz, ikinci saniye yarım genlik.
  const o = Array.from({ length: 16000 }, (_, i) => (i < 8000 ? 0 : (i % 2 ? 0.5 : -0.5)));
  const r = D.wavTepeleri(wav({ ornekler: o }), 10);
  assert.ok(r, 'WAV okunmalı');
  assert.equal(r.duration, 2);
  assert.equal(r.peaks.length, 20);
  // Normalize edilir: en yüksek tepe 1 olur, sessiz bölüm 0 kalır.
  assert.equal(r.peaks[0], 0);
  assert.ok(Math.abs(r.peaks[15] - 1) < 1e-6);
});

test('24 bit stereo WAV okunur; sağ kanaldaki ses de tepeye yansır', () => {
  const D = yukle();
  const o = [];
  for (let i = 0; i < 8000; i++) { o.push(0); o.push(i >= 4000 ? 0.8 : 0); }
  const r = D.wavTepeleri(wav({ kanal: 2, bit: 24, ornekler: o }), 4);
  assert.equal(r.duration, 1);
  assert.equal(r.peaks[0], 0);
  assert.ok(r.peaks[3] > 0.99);
});

test('32 bit float WAV okunur', () => {
  const D = yukle();
  const o = Array.from({ length: 8000 }, (_, i) => (i > 6000 ? -0.25 : 0.1));
  const r = D.wavTepeleri(wav({ bit: 32, bicim: 3, ornekler: o }), 4);
  assert.ok(r);
  assert.ok(r.peaks[3] > 0.99 && r.peaks[0] > 0.3 && r.peaks[0] < 0.5);
});

test('WAV olmayan dosyada null döner (MP3/FLAC için tarayıcı çözücüsü kullanılır)', () => {
  const D = yukle();
  const b = Buffer.from('ID3\u0003\u0000 mp3 verisi');
  assert.equal(D.wavTepeleri(b.buffer.slice(b.byteOffset, b.byteOffset + b.length), 60), null);
});

test('önbellek metni geri çözülünce aynı dalga (8 bit hassasiyetle) elde edilir', () => {
  const D = yukle();
  const peaks = new Float32Array([0, 0.25, 0.5, 1, 0.75]);
  const metin = D.kodla({ peaks, duration: 12.5 });
  assert.equal(typeof metin, 'string');
  const geri = D.coz(metin);
  assert.equal(geri.duration, 12.5);
  assert.equal(geri.peaks.length, 5);
  geri.peaks.forEach((v, i) => assert.ok(Math.abs(v - peaks[i]) < 1 / 255 + 1e-6));
  assert.equal(D.coz('bozuk'), null);
});
