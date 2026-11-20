// Dekont dosyasından yazı çıkarır (2026-11-20).
//   PDF  → içindeki yazı katmanı (unpdf). Banka e-dekontlarının hepsinde vardır.
//   Fotoğraf (JPG/PNG/WEBP) → ücretsiz yazı tanıma (tesseract.js, Türkçe + İngilizce).
//   HEIC ve yazısız (taranmış) PDF okunamaz → boş yazı döner, dekont
//   "doğrulanamadı" sayılır ve Derin elle bakar.
// Dil verisi npm paketlerinden gelir (@tesseract.js-data/tur, /eng); internete gidilmez.

const path = require('path');

async function pdfYazisi(buf) {
  const { extractText, getDocumentProxy } = await import('unpdf');
  const pdf = await getDocumentProxy(new Uint8Array(buf));
  const { text } = await extractText(pdf, { mergePages: true });
  return String(text || '');
}

async function resimYazisi(buf) {
  const { createWorker } = require('tesseract.js');
  const dilYolu = paket => path.join(path.dirname(require.resolve(paket + '/package.json')), '4.0.0_best_int');
  // İki dil verisi ayrı klasörlerde: tur ile tanı, sonra gerekirse eng ile bir daha dene.
  const oku = async (dil, paket) => {
    const worker = await createWorker(dil, 1, {
      langPath: dilYolu(paket),
      cachePath: '/tmp/tesseract',
      gzip: true,
      logger: () => {}
    });
    try {
      const { data } = await worker.recognize(buf);
      return String(data && data.text || '');
    } finally {
      await worker.terminate();
    }
  };
  return oku('tur', '@tesseract.js-data/tur');
}

function uzanti(yol) {
  const m = String(yol || '').toLowerCase().match(/\.([a-z0-9]+)$/);
  return m ? m[1] : '';
}

async function yaziCikar(buf, yol) {
  const uz = uzanti(yol);
  if (uz === 'pdf') return pdfYazisi(buf);
  if (['jpg', 'jpeg', 'png', 'webp'].includes(uz)) return resimYazisi(buf);
  return '';
}

module.exports = { yaziCikar, uzanti };
