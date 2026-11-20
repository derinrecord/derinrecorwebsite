// Vercel sunucu fonksiyonu — antrenörün yüklediği dekontu tarar (2026-11-20).
//
// Kimin çağırdığı: yalnız veritabanı (supabase/dekont-tarama.sql → pg_net),
// dekont yüklendikten hemen sonra. Gövde: { track_id, anahtar }.
// anahtar, Vercel'deki DEKONT_TARAMA_ANAHTARI ile aynı olmalı; değilse 401.
//
// Ne yapar:
//   1) dekont_tarama_bilgi() ile dekont yolunu, tutarı, alıcı adını ve IBAN'ı alır.
//   2) Dekontu R2'den (proje/<müşteri>/dekont/...) imzalı adresle indirir.
//   3) Yazısını çıkarır (_dekont-oku.js) ve dört bilgiyi arar (_dekont-cekirdek.js).
//   4) Sonucu dekont_tarama_sonuc() ile yazar; indirmeyi açmak ve Telegram
//      mesajı veritabanının işidir.
// Hata olursa da sonuç "doğrulanamadı" olarak yazılır ki Derin haberdar olsun.
//
// Ortam değişkenleri: DEKONT_TARAMA_ANAHTARI, R2_ACCOUNT_ID, R2_ACCESS_KEY_ID,
// R2_SECRET_ACCESS_KEY, R2_BUCKET. Hepsi gizli; depoya yazılmaz.

const crypto = require('crypto');
const { degerlendir } = require('./_dekont-cekirdek');
const { yaziCikar, uzanti } = require('./_dekont-oku');

// config.js'deki herkese açık değerlerin aynısı.
const SUPABASE_URL = 'https://abqhakgoluntpzgfyjye.supabase.co';
const SUPABASE_ANON = 'sb_publishable_FrRGXIb3-x8-Lzx1Ijg75w_teFbP2oa';
const EN_COK = 10 * 1024 * 1024; // dekont sınırı (istemcideki ile aynı)

const hmac = (key, str) => crypto.createHmac('sha256', key).update(str, 'utf8').digest();
const sha256hex = str => crypto.createHash('sha256').update(str, 'utf8').digest('hex');
const enc = s => encodeURIComponent(s).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());

function r2OkumaAdresi(key) {
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET } = process.env;
  const host = `${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
  const gun = amzDate.slice(0, 8);
  const kapsam = `${gun}/auto/s3/aws4_request`;
  const yol = '/' + enc(R2_BUCKET) + '/' + key.split('/').map(enc).join('/');
  const sorgu = [
    ['X-Amz-Algorithm', 'AWS4-HMAC-SHA256'],
    ['X-Amz-Credential', `${R2_ACCESS_KEY_ID}/${kapsam}`],
    ['X-Amz-Date', amzDate],
    ['X-Amz-Expires', '120'],
    ['X-Amz-SignedHeaders', 'host']
  ].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([k, v]) => `${enc(k)}=${enc(v)}`).join('&');
  const kanonik = ['GET', yol, sorgu, `host:${host}\n`, 'host', 'UNSIGNED-PAYLOAD'].join('\n');
  const imzalanacak = ['AWS4-HMAC-SHA256', amzDate, kapsam, sha256hex(kanonik)].join('\n');
  const kImza = hmac(hmac(hmac(hmac('AWS4' + R2_SECRET_ACCESS_KEY, gun), 'auto'), 's3'), 'aws4_request');
  const imza = crypto.createHmac('sha256', kImza).update(imzalanacak, 'utf8').digest('hex');
  return `https://${host}${yol}?${sorgu}&X-Amz-Signature=${imza}`;
}

async function rpc(ad, govde) {
  const y = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${ad}`, {
    method: 'POST',
    headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${SUPABASE_ANON}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(govde)
  });
  const metin = await y.text();
  if (!y.ok) throw new Error(`${ad}: ${y.status} ${metin.slice(0, 200)}`);
  return metin ? JSON.parse(metin) : null;
}

function anahtarDogru(gelen) {
  const beklenen = process.env.DEKONT_TARAMA_ANAHTARI || '';
  if (beklenen.length < 32 || typeof gelen !== 'string') return false;
  const a = Buffer.from(gelen), b = Buffer.from(beklenen);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

module.exports = async (req, res) => {
  // GEÇİCİ (yayın öncesi kontrol): okuma motoru Vercel'de çalışıyor mu?
  if (req.method === 'GET' && req.query && req.query.kontrol === 'gecici') {
    try {
      const bas = Date.now();
      const metin = await yaziCikar(Buffer.from('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', 'base64'), 'k.png');
      res.status(200).json({ sure_ms: Date.now() - bas, metin });
    } catch (e) { res.status(500).json({ hata: String(e && e.stack || e).slice(0, 800) }); }
    return;
  }
  if (req.method !== 'POST') { res.status(405).json({ hata: 'Yalnızca POST' }); return; }
  const govde = typeof req.body === 'string' ? (() => { try { return JSON.parse(req.body); } catch (e) { return {}; } })() : (req.body || {});
  const { track_id: trackId, anahtar } = govde;
  if (!anahtarDogru(anahtar)) { res.status(401).json({ hata: 'Yetkisiz' }); return; }

  // Deneme: yayındaki okuma motorunu veritabanına dokunmadan sınamak için
  // (yalnız gizli anahtarla). Gövde: { anahtar, deneme: { dosya_b64, ad, alici, iban, tutar } }
  if (govde.deneme && typeof govde.deneme === 'object') {
    const d = govde.deneme;
    try {
      const buf = Buffer.from(String(d.dosya_b64 || ''), 'base64');
      if (!buf.length || buf.length > EN_COK) { res.status(400).json({ hata: 'Dosya yok ya da çok büyük' }); return; }
      const bas = Date.now();
      const metin = await yaziCikar(buf, String(d.ad || ''));
      const karar = degerlendir({ metin, alici: d.alici, iban: d.iban, tutar: d.tutar });
      res.status(200).json({ sure_ms: Date.now() - bas, karar, metin_basi: metin.slice(0, 300) });
    } catch (e) {
      res.status(500).json({ hata: String(e && e.message || e).slice(0, 200) });
    }
    return;
  }

  if (!/^[0-9a-f-]{36}$/i.test(String(trackId || ''))) { res.status(400).json({ hata: 'Parça kimliği geçersiz' }); return; }

  let bilgi;
  try {
    bilgi = await rpc('dekont_tarama_bilgi', { p_track: trackId, p_anahtar: anahtar });
  } catch (e) {
    res.status(502).json({ hata: 'Bilgi alınamadı' }); return;
  }
  if (!bilgi || !bilgi.dekont_path) { res.status(200).json({ sonuc: 'atlandi' }); return; }

  const yaz = (gecti, not) => rpc('dekont_tarama_sonuc', {
    p_track: trackId, p_anahtar: anahtar, p_gecti: gecti, p_not: not, p_path: bilgi.dekont_path
  });

  try {
    const uz = uzanti(bilgi.dekont_path);
    if (uz === 'heic' || uz === 'heif') {
      const s = await yaz(false, 'iPhone HEIC fotoğrafı otomatik okunamıyor');
      res.status(200).json({ sonuc: s }); return;
    }
    const indir = await fetch(r2OkumaAdresi('proje/' + bilgi.dekont_path));
    if (!indir.ok) throw new Error('Dekont indirilemedi: ' + indir.status);
    const buf = Buffer.from(await indir.arrayBuffer());
    if (buf.length > EN_COK) throw new Error('Dekont 10 MB sınırını aşıyor');

    const metin = await yaziCikar(buf, bilgi.dekont_path);
    const karar = degerlendir({
      metin, alici: bilgi.alici, iban: bilgi.iban, tutar: bilgi.tutar, baslangic: bilgi.istendi_at
    });
    const s = await yaz(karar.gecti, karar.eksikler.join('; '));
    res.status(200).json({ sonuc: s, gecti: karar.gecti });
  } catch (e) {
    try { await yaz(false, 'Tarama hatası: ' + String(e && e.message || e).slice(0, 150)); } catch (e2) { /* zaman aşımı görevi yakalar */ }
    res.status(200).json({ sonuc: 'hata' });
  }
};
