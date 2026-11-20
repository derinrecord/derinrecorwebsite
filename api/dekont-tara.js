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
