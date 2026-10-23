// Projelerim · WAV ve MP3 indirme: dosya tarayıcıda istenen biçime çevrilir.
// Saf parçalar (WAV yazımı, MP3 kodlama döngüsü, ad/biçim kararları) burada
// Node'da sınanır; çözme (decodeAudioData) ve lamejs tarayıcıda çalışır.
const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('../ses-donustur.js');

test('dosya adı istenen uzantıyla biter', () => {
  assert.equal(D.dosyaAdi('Epic Violin', 'mp3'), 'Epic Violin.mp3');
  assert.equal(D.dosyaAdi('Epic Violin.wav', 'mp3'), 'Epic Violin.mp3');
  assert.equal(D.dosyaAdi('', 'wav'), 'parca.wav');
});

test('kaynak zaten istenen biçimdeyse çevrilmez', () => {
  assert.equal(D.cevirmeGerekli('k/a-1.wav', 'wav'), false);
  assert.equal(D.cevirmeGerekli('k/a-1-p01of02.wav', 'wav'), false);
  assert.equal(D.cevirmeGerekli('k/a-1.mp3', 'mp3'), false);
  assert.equal(D.cevirmeGerekli('k/a-1.wav', 'mp3'), true);
  assert.equal(D.cevirmeGerekli('k/a-1.mp3', 'wav'), true);
  assert.equal(D.cevirmeGerekli('k/a-1.flac', 'wav'), true);
});

test('WAV yazıcı geçerli 16-bit PCM başlığı ve örnekleri üretir', () => {
  const sol = new Float32Array([0, 1, -1, 0.5]);
  const sag = new Float32Array([0, -1, 1, -0.5]);
  const buf = D.wavKodla([sol, sag], 48000);
  const v = new DataView(buf);
  const yazi = (o, n) => String.fromCharCode(...new Uint8Array(buf, o, n));
  assert.equal(yazi(0, 4), 'RIFF');
  assert.equal(yazi(8, 4), 'WAVE');
  assert.equal(v.getUint16(20, true), 1, 'PCM');
  assert.equal(v.getUint16(22, true), 2, 'iki kanal');
  assert.equal(v.getUint32(24, true), 48000);
  assert.equal(v.getUint16(34, true), 16);
  assert.equal(v.getUint32(40, true), 4 * 2 * 2, 'veri boyutu');
  assert.equal(buf.byteLength, 44 + 16);
  // İç içe (L,R) örnekler; 1 → 32767, -1 → -32768
  assert.equal(v.getInt16(44 + 4, true), 32767);
  assert.equal(v.getInt16(44 + 6, true), -32768);
  assert.equal(v.getInt16(44 + 8, true), -32768);
  assert.equal(v.getInt16(44 + 10, true), 32767);
});

test('WAV yazıcı taşan örnekleri kırpar', () => {
  const v = new DataView(D.wavKodla([new Float32Array([2, -3])], 44100));
  assert.equal(v.getUint16(22, true), 1);
  assert.equal(v.getInt16(44, true), 32767);
  assert.equal(v.getInt16(46, true), -32768);
});

test('MP3 kodlama 1152 örneklik bloklarla ilerler, 320 kbps ve stereo kullanır', async () => {
  const cagrilar = [];
  const sahteLame = {
    Mp3Encoder: function (kanal, hiz, kbps) {
      cagrilar.push(['yeni', kanal, hiz, kbps]);
      this.encodeBuffer = (l, r) => { cagrilar.push(['blok', l.length, r ? r.length : 0]); return new Int8Array([1, 2]); };
      this.flush = () => { cagrilar.push(['son']); return new Int8Array([9]); };
    }
  };
  const n = 1152 * 2 + 100;
  const ilerleme = [];
  const blob = await D.mp3Kodla([new Float32Array(n), new Float32Array(n)], 48000,
    { lame: sahteLame, Blob: class { constructor(p, o) { this.parcalar = p; this.type = o.type; } }, ilerleme: y => ilerleme.push(y) });
  assert.deepEqual(cagrilar[0], ['yeni', 2, 48000, 320]);
  assert.deepEqual(cagrilar.slice(1, 4).map(c => c[1]), [1152, 1152, 100]);
  assert.deepEqual(cagrilar[4], ['son']);
  assert.equal(blob.type, 'audio/mpeg');
  assert.equal(blob.parcalar.length, 4);
  assert.equal(ilerleme[ilerleme.length - 1], 100);
});

test('tek kanallı ses mono kodlanır', async () => {
  let kanalSayisi = 0;
  const sahteLame = { Mp3Encoder: function (k) { kanalSayisi = k; this.encodeBuffer = () => new Int8Array(0); this.flush = () => new Int8Array(0); } };
  await D.mp3Kodla([new Float32Array(10)], 44100, { lame: sahteLame, Blob: class { constructor() {} } });
  assert.equal(kanalSayisi, 1);
});

test('lamejs sabit sürümle ve yalnız gerektiğinde yüklenir', () => {
  assert.equal(D.LAME_ADRESI, 'https://cdn.jsdelivr.net/npm/lamejs@1.2.1/lame.min.js');
});
