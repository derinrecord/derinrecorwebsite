// Vercel sunucu fonksiyonu — Şarkı Avcısı'nın referansları "dinlemesi" için Deezer'ın 30 sn
// önizlemesini aktarır. Tarayıcı bu sesi çözüp tonu ve tempoyu ölçer (sarki-avcisi-cekirdek.js).
//
// Neden sunucudan geçiyor: Deezer önizleme bağlantıları imzalı ve kısa ömürlü; tarayıcıdan
// doğrudan okunmaları (CORS) güvenilir değil. Yalnız yönetici kullanabilir.
//
// GET /api/sarki-onizleme?id=<deezer şarkı no>   (Authorization: Bearer <oturum>)
// Yanıt: audio/mpeg; başlıklarda X-Deezer-Bpm ve X-Deezer-Yil (Deezer biliyorsa).

const { yoneticiMi } = require('./sarki-referans.js');

const DEEZER = 'https://api.deezer.com';
const EN_FAZLA = 2 * 1024 * 1024; // 30 sn MP3 ~0,5 MB; 2 MB üstü reddedilir

module.exports = async (req, res) => {
  res.setHeader('cache-control', 'no-store');
  if (req.method !== 'GET') { res.status(405).json({ hata: 'yalniz-get' }); return; }
  if (!(await yoneticiMi(req.headers && req.headers.authorization))) { res.status(403).json({ hata: 'yetki-yok' }); return; }

  const id = String((req.query && req.query.id) || '');
  if (!/^\d{1,15}$/.test(id)) { res.status(400).json({ hata: 'id-gecersiz' }); return; }

  try {
    const sarki = await fetch(`${DEEZER}/track/${id}`).then(r => r.json());
    const adres = sarki && sarki.preview;
    // Yalnız Deezer'ın kendi CDN'inden ses çekilir (başka adrese istek atılmaz).
    if (!adres || !/^https:\/\/[a-z0-9-]+\.dzcdn\.net\//i.test(adres)) { res.status(404).json({ hata: 'onizleme-yok' }); return; }
    const ses = await fetch(adres);
    if (!ses.ok) { res.status(502).json({ hata: 'onizleme-alinamadi' }); return; }
    const veri = Buffer.from(await ses.arrayBuffer());
    if (veri.length > EN_FAZLA) { res.status(413).json({ hata: 'onizleme-buyuk' }); return; }
    if (Number(sarki.bpm) > 0) res.setHeader('x-deezer-bpm', String(sarki.bpm));
    const yil = Number(String(sarki.release_date || '').slice(0, 4));
    if (yil) res.setHeader('x-deezer-yil', String(yil));
    res.setHeader('content-type', 'audio/mpeg');
    res.status(200).send(veri);
  } catch (e) {
    res.status(502).json({ hata: 'servis-ulasilamadi' });
  }
};
