// Hızlı yükleme (25 Ekim): büyük ses dosyaları küçük dilimlere bölünüp aynı
// anda birkaç dilim gönderilir; ilerleme bayt üzerinden yüzde verir; takılan
// dilim yeniden denenir. Dilimler sırayla birleşince dosya birebir aynıdır.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Ses = require('../audio-file-types.js');
const MB = 1048576;
const sahteDosya = (bayt, ad = 'a.wav') => {
  const veri = new Uint8Array(bayt).map((_, i) => i % 251);
  return { name: ad, type: 'audio/wav', size: bayt, slice: (a, b) => ({ size: b - a, bas: a, son: b, veri: veri.subarray(a, b) }) };
};

test('dilim boyutu ve sayısı seçenekle verilir', () => {
  assert.equal(Ses.parcaSayisi(100 * MB, 16 * MB), 7);
  assert.equal(Ses.parcaSayisi(100 * MB), 3, 'varsayılan 45 MB değişmedi');
});

test('aynı anda en çok 4 dilim gönderilir; hepsi doğru yola, doğru baytla', async () => {
  const dosya = sahteDosya(100 * MB);
  let anlik = 0, enCok = 0; const gelen = {};
  const io = { yukle: async (yol, dilim) => { anlik++; enCok = Math.max(enCok, anlik); await new Promise(r => setTimeout(r, 5)); gelen[yol] = [dilim.bas, dilim.son]; anlik--; return { error: null }; } };
  const s = await Ses.parcaliYukle(io, 'k/p-1', dosya, null, { parcaBoyutu: 16 * MB, esZaman: 4, tekrar: 2 });
  assert.equal(s.error, null);
  assert.equal(s.path, 'k/p-1-p01of07.wav');
  assert.equal(enCok, 4);
  assert.equal(Object.keys(gelen).length, 7);
  assert.deepEqual(gelen['k/p-1-p07of07.wav'], [96 * MB, 100 * MB]);
});

test('ilerleme bayt üzerinden: son çağrıda yüklenen = toplam', async () => {
  const dosya = sahteDosya(40 * MB);
  const cagrilar = [];
  await Ses.parcaliYukle({ yukle: async () => ({ error: null }) }, 't', dosya, (bitti, toplam, bayt, tumBayt) => cagrilar.push([bitti, toplam, bayt, tumBayt]), { parcaBoyutu: 16 * MB, esZaman: 4, tekrar: 2 });
  const son = cagrilar[cagrilar.length - 1];
  assert.deepEqual(son, [3, 3, 40 * MB, 40 * MB]);
});

test('takılan dilim 2 kez daha denenir; yine olmazsa yüklenenler silinir', async () => {
  const dosya = sahteDosya(40 * MB);
  const deneme = {};
  const io1 = { yukle: async (yol) => { deneme[yol] = (deneme[yol] || 0) + 1; return { error: yol.includes('p02') && deneme[yol] < 3 ? new Error('ağ') : null }; } };
  const s1 = await Ses.parcaliYukle(io1, 't', dosya, null, { parcaBoyutu: 16 * MB, esZaman: 4, tekrar: 2 });
  assert.equal(s1.error, null);
  assert.equal(deneme['t-p02of03.wav'], 3);
  let silinen = null;
  const io2 = { yukle: async (yol) => ({ error: yol.includes('p02') ? new Error('kalıcı') : null }), sil: async y => { silinen = y; } };
  const s2 = await Ses.parcaliYukle(io2, 't', dosya, null, { parcaBoyutu: 16 * MB, esZaman: 4, tekrar: 2 });
  assert.match(s2.error.message, /kalıcı/);
  assert.ok(silinen && silinen.includes('t-p01of03.wav') && !silinen.includes('t-p02of03.wav'));
});

test('Projelerim yüklemesi hızlı ayarı ve yüzdeyi kullanır', () => {
  const j = fs.readFileSync(path.join(__dirname, '..', 'projects.js'), 'utf8');
  assert.match(j, /const HIZLI_YUKLEME=\{parcaBoyutu:16\*1048576,esZaman:4,tekrar:2\};/);
  assert.match(j, /Ses\.parcaliYukle\(\{[\s\S]{0,200}\},temelYol,file,ilerleme,HIZLI_YUKLEME\)/);
  assert.match(j, /const yuzdeYazi=\(bayt,tum\)=>/);
});
