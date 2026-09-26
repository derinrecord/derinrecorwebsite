const test = require('node:test');
const assert = require('node:assert/strict');
const Ses = require('../audio-file-types.js');

test('WAV dosyasını uzantısından tanır ve doğru içerik tipini üretir', () => {
  const wav = { name: 'darbuka remix 1.WAV', size: 12 * 1048576, type: '' };
  assert.equal(Ses.gecerli(wav), true);
  assert.equal(Ses.tip(wav), 'audio/wav');
  assert.equal(Ses.uzanti(wav.name), 'wav');
});

test('tarayıcının gönderdiği yanlış WAV tipini uzantıya göre düzeltir', () => {
  // Chrome/Windows .wav için audio/wave, bazı tarayıcılar boş tip gönderebiliyor.
  assert.equal(Ses.tip({ name: 'a.wav', type: 'audio/wave' }), 'audio/wav');
  assert.equal(Ses.tip({ name: 'a.wave', type: 'application/octet-stream' }), 'audio/wav');
  assert.equal(Ses.tip({ name: 'a.mp3', type: '' }), 'audio/mpeg');
  assert.equal(Ses.tip({ name: 'a.flac', type: '' }), 'audio/flac');
});

test('WAV, MP3 ve FLAC kabul listesinde; desteklenmeyen uzantı reddedilir', () => {
  assert.equal(Ses.gecerli({ name: 'parca.wav' }), true);
  assert.equal(Ses.gecerli({ name: 'parca.mp3' }), true);
  assert.equal(Ses.gecerli({ name: 'parca.flac' }), true);
  assert.equal(Ses.gecerli({ name: 'belge.pdf' }), false);
  assert.equal(Ses.gecerli(null), false);
});

test('kabul listesi hem uzantıları hem audio/* tipini içerir', () => {
  const accept = Ses.accept();
  assert.match(accept, /\.wav/);
  assert.match(accept, /\.mp3/);
  assert.match(accept, /audio\/\*/);
});

test('dosya boyutunu okunur biçimde gösterir', () => {
  assert.equal(Ses.boyut(1048576), '1.0 MB');
  assert.equal(Ses.boyut(52 * 1048576), '52.0 MB');
  assert.equal(Ses.boyut(2048), '2 KB');
  assert.equal(Ses.boyut(undefined), '0 KB');
});

// --- Parçalı yükleme ------------------------------------------------------
// Supabase ücretsiz planında tek nesne sınırı 52.428.800 bayt (50 MiB);
// canlıda ölçülerek doğrulandı (52.428.801 bayt HTTP 413 ile reddediliyor).

test('parça boyutu, servis tavanının altında kalır', () => {
  assert.equal(Ses.YUKLEME_SINIRI, 52428800);
  assert.ok(Ses.PARCA_BOYUTU < Ses.YUKLEME_SINIRI, 'parça boyutu tavanın altında olmalı');
});

test('45 MB üzeri dosyalar parçalanacak olarak işaretlenir', () => {
  assert.equal(Ses.buyukMu({ name: 'a.wav', size: 53 * 1048576 }), true);
  assert.equal(Ses.buyukMu({ name: 'a.wav', size: 45 * 1048576 }), false);
  assert.equal(Ses.buyukMu({ name: 'a.wav', size: 10 * 1048576 }), false);
  assert.equal(Ses.buyukMu(null), false);
});

test('parça sayısını doğru hesaplar', () => {
  assert.equal(Ses.parcaSayisi(0), 1);
  assert.equal(Ses.parcaSayisi(10 * 1048576), 1);
  assert.equal(Ses.parcaSayisi(45 * 1048576), 1);
  assert.equal(Ses.parcaSayisi(45 * 1048576 + 1), 2);
  assert.equal(Ses.parcaSayisi(53 * 1048576), 2);
  assert.equal(Ses.parcaSayisi(100 * 1048576), 3);
});

test('53 MB dosya parçalara ayrılır ve hiçbir parça tavanı aşmaz', () => {
  const boyut = 53 * 1048576;
  const sinirlar = Ses.dilimSinirlari(boyut);
  assert.equal(sinirlar.length, 2);
  assert.deepEqual(sinirlar[0], [0, 45 * 1048576]);
  assert.deepEqual(sinirlar[1], [45 * 1048576, boyut]);
  for (const [bas, son] of sinirlar) {
    assert.ok(son - bas <= Ses.YUKLEME_SINIRI, 'parça boyutu servis tavanını aşmamalı');
    assert.ok(bas < son);
  }
});

test('parçalar birleştirildiğinde dosya bit düzeyinde birebir aynı çıkar', () => {
  const boyut = 53 * 1048576;
  const kaynak = Buffer.alloc(boyut);
  for (let i = 0; i < boyut; i += 997) kaynak[i] = i % 251; // desen: sessiz sıfırlardan ayırt edilebilsin
  const parcalar = Ses.dilimSinirlari(boyut).map(([a, b]) => kaynak.subarray(a, b));
  const birlesik = Buffer.concat(parcalar);
  assert.equal(birlesik.length, boyut);
  assert.equal(birlesik.equals(kaynak), true);
});

test('parça yollarını adlandırır ve geri çözer', () => {
  const taban = 'antrenor-1/proje-2-1758880000000';
  const yol = taban + Ses.parcaEki(1, 3) + '.wav';
  assert.equal(yol, 'antrenor-1/proje-2-1758880000000-p01of03.wav');
  assert.equal(Ses.parcaliMi(yol), true);
  assert.equal(Ses.parcaliMi(taban + '.wav'), false);
  assert.deepEqual(
    Ses.parcalariCoz(yol).map((p) => p.path),
    [taban + '-p01of03.wav', taban + '-p02of03.wav', taban + '-p03of03.wav']
  );
});

test('parçalı olmayan yol tek elemanlı liste döner', () => {
  const yol = 'antrenor-1/proje-2-1758880000000.wav';
  assert.deepEqual(Ses.parcalariCoz(yol), [{ path: yol, index: 1, toplam: 1 }]);
  assert.deepEqual(Ses.parcalariCoz(null), [{ path: '', index: 1, toplam: 1 }]);
});

// --- Parçalı yükleme (Ses.parcaliYukle) -------------------------------------
// Sahte io ile çalışır: gerçek Supabase çağrısı yok.

function sahteDosya(ad, boyut) {
  const veri = Buffer.alloc(boyut);
  for (let i = 0; i < boyut; i += 997) veri[i] = i % 251;
  return {
    name: ad,
    size: boyut,
    type: '',
    slice(bas, son) { return veri.subarray(bas, son); },
    veri
  };
}

test('53 MB dosya iki parça olarak yüklenir ve parça yolları doğru üretilir', async () => {
  const dosya = sahteDosya('darbuka remix 1.wav', 53 * 1048576);
  const yuklenenler = [];
  const sonuc = await Ses.parcaliYukle({
    yukle: async (yol, dilim, tip) => { yuklenenler.push({ yol, boyut: dilim.length, tip }); return { error: null }; }
  }, 'antrenor-1/proje-2-1758880000000', dosya);

  assert.equal(sonuc.error, null);
  assert.equal(sonuc.toplam, 2);
  assert.equal(sonuc.path, 'antrenor-1/proje-2-1758880000000-p01of02.wav');
  assert.deepEqual(yuklenenler.map((y) => y.yol), [
    'antrenor-1/proje-2-1758880000000-p01of02.wav',
    'antrenor-1/proje-2-1758880000000-p02of02.wav'
  ]);
  assert.ok(yuklenenler.every((y) => y.boyut <= Ses.YUKLEME_SINIRI), 'parça servis tavanını aşmamalı');
  assert.ok(yuklenenler.every((y) => y.tip === 'audio/wav'), 'WAV içerik tipi korunmalı');
});

test('tek parçalı dosyada yol parça eki almaz', async () => {
  const dosya = sahteDosya('kisa.mp3', 3 * 1048576);
  const yollar = [];
  const sonuc = await Ses.parcaliYukle({
    yukle: async (yol) => { yollar.push(yol); return { error: null }; }
  }, 'antrenor-1/proje-2-1758880000000', dosya);

  assert.equal(sonuc.toplam, 1);
  assert.deepEqual(yollar, ['antrenor-1/proje-2-1758880000000.mp3']);
  assert.equal(sonuc.path, yollar[0]);
});

test('ortada hata olursa yüklenmiş parçalar silinir ve hata bilgisi döner', async () => {
  const dosya = sahteDosya('buyuk.wav', 53 * 1048576);
  const silinen = [];
  let cagri = 0;
  const sonuc = await Ses.parcaliYukle({
    yukle: async () => (++cagri === 2
      ? { error: new Error('The object exceeded the maximum allowed size') }
      : { error: null }),
    sil: async (yollar) => { silinen.push(...yollar); }
  }, 'antrenor-1/proje-2', dosya);

  assert.equal(sonuc.path, null);
  assert.equal(sonuc.parca, 2);
  assert.equal(sonuc.toplam, 2);
  assert.equal(sonuc.yol, 'antrenor-1/proje-2-p02of02.wav');
  assert.match(sonuc.error.message, /exceeded the maximum allowed size/);
  assert.deepEqual(silinen, ['antrenor-1/proje-2-p01of02.wav'], 'yarım kalan parça temizlenmeli');
});

test('ilk parçada hata olursa silinecek parça yoktur', async () => {
  const dosya = sahteDosya('buyuk.wav', 53 * 1048576);
  let silmeCagrildi = false;
  const sonuc = await Ses.parcaliYukle({
    yukle: async () => ({ error: new Error('row-level security policy') }),
    sil: async () => { silmeCagrildi = true; }
  }, 'antrenor-1/proje-2', dosya);

  assert.equal(sonuc.parca, 1);
  assert.equal(sonuc.yol, 'antrenor-1/proje-2-p01of02.wav');
  assert.equal(silmeCagrildi, false);
});

test('parçalı yükleme kayıpsızdır: yüklenen dilimler birleşince kaynakla bit düzeyinde aynı', async () => {
  const dosya = sahteDosya('master.wav', 53 * 1048576);
  const dilimler = [];
  const sonuc = await Ses.parcaliYukle({
    yukle: async (yol, dilim) => { dilimler.push(Buffer.from(dilim)); return { error: null }; }
  }, 'antrenor-1/proje-2', dosya);

  assert.equal(sonuc.toplam, 2);
  const birlesik = Buffer.concat(dilimler);
  assert.equal(birlesik.length, dosya.size);
  assert.equal(birlesik.equals(dosya.veri), true, 'birleştirilen dosya orijinalle birebir aynı olmalı');
});
