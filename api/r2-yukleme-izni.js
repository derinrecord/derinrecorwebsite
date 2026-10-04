// Vercel sunucu fonksiyonu — R2'ye yükleme izni üretir.
//
// Neden var: R2'nin gizli anahtarı tarayıcıya konulamaz; konulsa siteyi açan
// herkes müzik dosyalarını değiştirebilir. Bu fonksiyon anahtarı sunucuda
// tutar, isteği yapanın yönetici olduğunu Supabase'e doğrulatır ve yalnızca
// tek bir dosya için, kısa süreli bir yükleme adresi döndürür.
//
// Gerekli ortam değişkenleri (Vercel → Settings → Environment Variables):
//   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET
// Bunlar gizlidir; depoya yazılmaz.

const crypto = require('crypto');

// Bunlar gizli değil; config.js'deki herkese açık değerlerin aynısı.
const SUPABASE_URL = 'https://abqhakgoluntpzgfyjye.supabase.co';
const SUPABASE_ANON = 'sb_publishable_FrRGXIb3-x8-Lzx1Ijg75w_teFbP2oa';

// İzin verilen klasörler. Panel yalnızca bu öneklere yazabilir.
const IZINLI_ONEK = ['radyo/', 'kapak/', 'anons/', 'dj/', 'proje/'];

const SURE = 300; // yükleme adresinin geçerlilik süresi (saniye)

// --- AWS imza yardımcıları (R2, S3 ile uyumlu) ---
const hmac = (key, str) => crypto.createHmac('sha256', key).update(str, 'utf8').digest();
const sha256hex = str => crypto.createHash('sha256').update(str, 'utf8').digest('hex');
// RFC 3986: encodeURIComponent'in kaçırdığı karakterleri de kodlar
const enc = s => encodeURIComponent(s).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());

function imzaliYuklemeAdresi({ accountId, accessKeyId, secretAccessKey, bucket, key, host }) {
  const bolge = 'auto', servis = 's3';

  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
  const gun = amzDate.slice(0, 8);
  const kapsam = `${gun}/${bolge}/${servis}/aws4_request`;

  // Ozel alan adi dogrudan kovaya bagli oldugu icin yolda kova adi yer almaz.
  // Ham S3 ucunda ise yol /kova/anahtar seklindedir.
  const ozelAlan = host !== `${accountId}.r2.cloudflarestorage.com`;
  const yol = (ozelAlan ? '' : '/' + enc(bucket)) + '/' + key.split('/').map(enc).join('/');

  const sorgu = [
    ['X-Amz-Algorithm', 'AWS4-HMAC-SHA256'],
    ['X-Amz-Credential', `${accessKeyId}/${kapsam}`],
    ['X-Amz-Date', amzDate],
    ['X-Amz-Expires', String(SURE)],
    ['X-Amz-SignedHeaders', 'host']
  ].sort((a, b) => (a[0] < b[0] ? -1 : 1))
   .map(([k, v]) => `${enc(k)}=${enc(v)}`).join('&');

  const kanonik = ['PUT', yol, sorgu, `host:${host}\n`, 'host', 'UNSIGNED-PAYLOAD'].join('\n');
  const imzalanacak = ['AWS4-HMAC-SHA256', amzDate, kapsam, sha256hex(kanonik)].join('\n');

  const kGun = hmac('AWS4' + secretAccessKey, gun);
  const kBolge = hmac(kGun, bolge);
  const kServis = hmac(kBolge, servis);
  const kImza = hmac(kServis, 'aws4_request');
  const imza = crypto.createHmac('sha256', kImza).update(imzalanacak, 'utf8').digest('hex');

  const adres = `https://${host}${yol}?${sorgu}&X-Amz-Signature=${imza}`;
  return { adres, kanonik, imzalanacak };
}

// --- İstek işleyici ---
module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ hata: 'Yalnızca POST' });
    return;
  }

  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET } = process.env;
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET) {
    res.status(500).json({ hata: 'R2 ayarları eksik. Vercel ortam değişkenlerini kontrol edin.' });
    return;
  }

  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Bearer ')) {
    res.status(401).json({ hata: 'Oturum bulunamadı.' });
    return;
  }

  // Yönetici mi? Karar veritabanındaki mevcut is_admin() kuralına bırakılır.
  let yonetici = false;
  try {
    const kontrol = await fetch(`${SUPABASE_URL}/rest/v1/rpc/is_admin`, {
      method: 'POST',
      headers: { apikey: SUPABASE_ANON, Authorization: auth, 'content-type': 'application/json' },
      body: '{}'
    });
    yonetici = kontrol.ok && (await kontrol.json()) === true;
  } catch (e) {
    res.status(502).json({ hata: 'Yetki doğrulanamadı.' });
    return;
  }
  if (!yonetici) {
    res.status(403).json({ hata: 'Bu işlem için yönetici olmanız gerekiyor.' });
    return;
  }

  // Gövde
  let govde = req.body;
  if (typeof govde === 'string') { try { govde = JSON.parse(govde); } catch (e) { govde = {}; } }

  // Teşhis modu: imzayı sunucudan dener. Tarayıcı araya girmediği için
  // CORS engeli ile imza hatasını birbirinden ayırır.
  if (govde && govde.sinama === true) {
    const host = `${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
    const imzali = imzaliYuklemeAdresi({
      accountId: R2_ACCOUNT_ID, accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY, bucket: R2_BUCKET,
      key: 'radyo/sunucu-sinamasi.txt', host
    });
    let durum = null, yanit = null;
    try {
      const y = await fetch(imzali.adres, { method: 'PUT', body: 'sunucu sinamasi' });
      durum = y.status; yanit = (await y.text()).slice(0, 1600);
    } catch (e) {
      durum = 'baglanti-hatasi'; yanit = String(e && e.message);
    }
    // Anahtarin kendisi degil, yalnizca bicim bilgisi dondurulur: bastaki/sondaki
    // bosluk ya da satir sonu gibi kopyalama hatalarini gorebilmek icin.
    const sk = R2_SECRET_ACCESS_KEY;
    res.status(200).json({
      durum, yanit,
      benimKanonik: imzali.kanonik,
      benimImzalanacak: imzali.imzalanacak,
      anahtarBicimi: {
        kimlikUzunluk: R2_ACCESS_KEY_ID.length,
        kimlikTemiz: R2_ACCESS_KEY_ID === R2_ACCESS_KEY_ID.trim(),
        gizliUzunluk: sk.length,
        gizliTemiz: sk === sk.trim(),
        gizliSadeceOnaltilik: /^[0-9a-f]+$/.test(sk),
        kova: R2_BUCKET,
        hesapUzunluk: R2_ACCOUNT_ID.length
      }
    });
    return;
  }

  const key = String((govde && govde.key) || '');

  // Yol denetimi: üst klasöre çıkma, mutlak yol ve izinsiz klasör reddedilir.
  if (!key || key.length > 400 || key.includes('..') || key.startsWith('/') || key.includes('\\')) {
    res.status(400).json({ hata: 'Geçersiz dosya yolu.' });
    return;
  }
  if (!IZINLI_ONEK.some(o => key.startsWith(o))) {
    res.status(400).json({ hata: 'Bu klasöre yazılamaz.' });
    return;
  }

  const imzali = imzaliYuklemeAdresi({
    accountId: R2_ACCOUNT_ID,
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
    bucket: R2_BUCKET,
    key,
    // Yukleme yalnizca S3 ucuna yapilabilir. R2'nin ozel alan adlari (ornegin
    // muzik.derinrecord.com) sadece okuma icindir; PUT kabul etmezler.
    // Dinleme/indirme tarafi ozel alan adini kullanmaya devam eder.
    host: `${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`
  });

  res.status(200).json({ adres: imzali.adres, key, saniye: SURE });
};
