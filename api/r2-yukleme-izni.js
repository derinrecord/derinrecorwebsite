// Vercel sunucu fonksiyonu — R2 için kısa süreli yetki adresi üretir.
//
// Neden var: R2'nin gizli anahtarı tarayıcıya konulamaz; konulsa siteyi açan
// herkes müzik dosyalarını değiştirebilir. Bu fonksiyon anahtarı sunucuda
// tutar, isteği yapanın yönetici olduğunu Supabase'e doğrulatır ve yalnızca
// tek bir dosya için, kısa süreli bir adres döndürür.
//
// Gövde: { key: "radyo/...", islem: "yukle" | "sil" }  (islem boşsa "yukle")
//
// Gerekli ortam değişkenleri (Vercel → Settings → Environment Variables):
//   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET
// Bunlar gizlidir; depoya yazılmaz.

const crypto = require('crypto');

// Bunlar gizli değil; config.js'deki herkese açık değerlerin aynısı.
const SUPABASE_URL = 'https://abqhakgoluntpzgfyjye.supabase.co';
const SUPABASE_ANON = 'sb_publishable_FrRGXIb3-x8-Lzx1Ijg75w_teFbP2oa';

// İzin verilen klasörler. Panel yalnızca bu öneklere dokunabilir.
// demo/: branş sayfalarındaki demo şarkılar (24 Ekim); herkese açık okunur,
// yalnız yönetici yükler/siler.
const IZINLI_ONEK = ['radyo/', 'kapak/', 'anons/', 'dj/', 'proje/', 'demo/'];

// İmzalı okuma ('oku') yalnız bu klasörlerde anlam taşır: radyo kovaları
// muzik.derinrecord.com'dan imzasız okunuyor; gizli kovalar (proje/dj)
// RLS'e benzer yetkilendirme ister.
const OKU_ONEK = ['proje/', 'dj/'];

const SURE = 300; // yükleme/silme adresinin geçerlilik süresi (saniye)
const OKU_SURE = 600; // imzalı okuma (GET) adresinin geçerlilik süresi (saniye)

// --- AWS imza yardımcıları (R2, S3 ile uyumlu) ---
const hmac = (key, str) => crypto.createHmac('sha256', key).update(str, 'utf8').digest();
const sha256hex = str => crypto.createHash('sha256').update(str, 'utf8').digest('hex');
// RFC 3986: encodeURIComponent'in kaçırdığı karakterleri de kodlar
const enc = s => encodeURIComponent(s).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());

// Antrenörün kimliğini belirteçten Supabase'e doğrulatır. JWT gövdesini burada
// okuyup 'sub' alanına güvenmek değildir: imzayı yalnız Supabase doğrular,
// yanıtın id'si gerçek kullanıcının kimliğidir. Token geçersizse null.
async function kullaniciId(sifre) {
  try {
    const yanit = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SUPABASE_ANON, Authorization: sifre }
    });
    if (!yanit.ok) return null;
    const govde = await yanit.json().catch(() => null);
    return govde && govde.id ? String(govde.id) : null;
  } catch (e) {
    return null;
  }
}

function imzaliAdres({ accessKeyId, secretAccessKey, bucket, key, host, yontem }) {  const bolge = 'auto', servis = 's3';

  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
  const gun = amzDate.slice(0, 8);
  const kapsam = `${gun}/${bolge}/${servis}/aws4_request`;

  // Ham S3 ucunda yol /kova/anahtar şeklindedir.
  const yol = '/' + enc(bucket) + '/' + key.split('/').map(enc).join('/');

  const sorgu = [
    ['X-Amz-Algorithm', 'AWS4-HMAC-SHA256'],
    ['X-Amz-Credential', `${accessKeyId}/${kapsam}`],
    ['X-Amz-Date', amzDate],
    ['X-Amz-Expires', String(SURE)],
    ['X-Amz-SignedHeaders', 'host']
  ].sort((a, b) => (a[0] < b[0] ? -1 : 1))
   .map(([k, v]) => `${enc(k)}=${enc(v)}`).join('&');

  const kanonik = [yontem, yol, sorgu, `host:${host}\n`, 'host', 'UNSIGNED-PAYLOAD'].join('\n');
  const imzalanacak = ['AWS4-HMAC-SHA256', amzDate, kapsam, sha256hex(kanonik)].join('\n');

  const kGun = hmac('AWS4' + secretAccessKey, gun);
  const kBolge = hmac(kGun, bolge);
  const kServis = hmac(kBolge, servis);
  const kImza = hmac(kServis, 'aws4_request');
  const imza = crypto.createHmac('sha256', kImza).update(imzalanacak, 'utf8').digest('hex');

  return `https://${host}${yol}?${sorgu}&X-Amz-Signature=${imza}`;
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

  // Gövde
  let govde = req.body;
  if (typeof govde === 'string') { try { govde = JSON.parse(govde); } catch (e) { govde = {}; } }
  const key = String((govde && govde.key) || '');
  const islem = String((govde && govde.islem) || 'yukle');

  if (islem !== 'yukle' && islem !== 'sil' && islem !== 'oku') {
    res.status(400).json({ hata: 'Geçersiz işlem.' });
    return;
  }

  // Yol denetimi: üst klasöre çıkma, mutlak yol ve izinsiz klasör reddedilir.
  if (!key || key.length > 400 || key.includes('..') || key.startsWith('/') || key.includes('\\')) {
    res.status(400).json({ hata: 'Geçersiz dosya yolu.' });
    return;
  }
  if (!IZINLI_ONEK.some(o => key.startsWith(o))) {
    res.status(400).json({ hata: 'Bu klasöre yazılamaz.' });
    return;
  }

  // İşleme göre yetkilendirme:
  // - yukle/sil: eski davranış, yalnızca yönetici.
  // - oku: yönetici her gizli klasörü; antrenör yalnız kendi proje klasörünü.
  //   Antrenörün kimliği belirteçle Supabase'e doğrulatılır — imzasız JWT
  //   gövdesi burada okunmaz, karar Supabase tarafında verilir.
  if (islem === 'oku') {
    if (!OKU_ONEK.some(o => key.startsWith(o))) {
      res.status(403).json({ hata: 'Bu klasör imzalı okumaya kapalı.' });
      return;
    }
    if (!yonetici) {
      if (key.startsWith('dj/')) {
        res.status(403).json({ hata: 'DJ deposu yalnızca yöneticilerce okunabilir.' });
        return;
      }
      const kimlik = await kullaniciId(auth);
      if (!kimlik) {
        res.status(401).json({ hata: 'Oturum doğrulanamadı.' });
        return;
      }
      if (key.split('/')[1] !== kimlik) {
        res.status(403).json({ hata: 'Bu proje klasörü size ait değil.' });
        return;
      }
    }
  } else if (!yonetici) {
    res.status(403).json({ hata: 'Bu işlem için yönetici olmanız gerekiyor.' });
    return;
  }

  const saniye = islem === 'oku' ? OKU_SURE : SURE;
  const adres = imzaliAdres({
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
    bucket: R2_BUCKET,
    key,
    // Yükleme ve silme yalnızca S3 ucuna yapılabilir. R2'nin özel alan adları
    // (muzik.derinrecord.com) sadece okuma içindir; PUT/DELETE kabul etmezler.
    host: `${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    yontem: islem === 'sil' ? 'DELETE' : islem === 'oku' ? 'GET' : 'PUT'
  });

  res.status(200).json({ adres, key, islem, saniye });
};
