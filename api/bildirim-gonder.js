// Vercel sunucu fonksiyonu — web bildirimi (Web Push) gönderir (4 Kasım 2026).
//
// Yalnız yönetici çağırır: isteği yapanın yönetici olduğu Supabase'in is_admin()
// kuralıyla doğrulanır; abone listesi de yöneticinin oturumuyla okunur (RLS).
// Ek paket yok: şifreleme (RFC 8291, aes128gcm) ve VAPID imzası (RFC 8292)
// Node'un kendi crypto modülüyle yapılır.
//
// Gövde: { baslik, metin, adres, kullanici? }   (adres: site içi yol, ör. "/ritmik.html")
// kullanici verilirse bildirim yalnız o kişinin cihazlarına gider (Projelerim bildirimleri).
//
// Gerekli ortam değişkenleri (Vercel → Settings → Environment Variables):
//   VAPID_ACIK  — herkese açık anahtar (bildirim.js'tekiyle aynı)
//   VAPID_GIZLI — gizli anahtar; depoya ve siteye ASLA yazılmaz.

const crypto = require('crypto');

// Bunlar gizli değil; config.js'deki herkese açık değerlerin aynısı.
const SUPABASE_URL = 'https://abqhakgoluntpzgfyjye.supabase.co';
const SUPABASE_ANON = 'sb_publishable_FrRGXIb3-x8-Lzx1Ijg75w_teFbP2oa';
const VAPID_SUB = 'https://www.derinrecord.com';

// Bildirimler yalnız tarayıcıların resmi bildirim sunucularına gönderilir
// (veritabanındaki adres ne olursa olsun başka yere istek atılmaz).
const IZINLI_UCLAR = [
  /^fcm\.googleapis\.com$/,
  /^web\.push\.apple\.com$/,
  /^updates\.push\.services\.mozilla\.com$/,
  /^[a-z0-9-]+\.notify\.windows\.com$/
];
function izinliUc(adres) {
  try {
    const u = new URL(String(adres || ''));
    return u.protocol === 'https:' && !u.port && IZINLI_UCLAR.some(r => r.test(u.hostname));
  } catch (e) {
    return false;
  }
}

function icerik(g) {
  const baslik = String((g && g.baslik) || '').trim().slice(0, 80);
  if (!baslik) return { hata: 'Başlık boş olamaz.' };
  const metin = String((g && g.metin) || '').trim().slice(0, 200);
  let adres = String((g && g.adres) || '/').trim();
  if (!/^\/(?!\/)[\w\-./?=&#%]*$/.test(adres)) adres = '/';
  return { baslik, metin, adres };
}

// Hedef kişi: yok → null (herkese), geçerli kimlik → kimlik, bozuk değer → false (reddedilir).
const KIMLIK = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function hedef(g) {
  const k = g && g.kullanici;
  if (k == null || k === '') return null;
  return KIMLIK.test(String(k)) ? String(k).toLowerCase() : false;
}

const hmac = (anahtar, veri) => crypto.createHmac('sha256', anahtar).update(veri).digest();

// RFC 8291 — aes128gcm ile tek kayıt. gondericiGizli/tuz yalnız testte verilir.
function sifrele({ metin, alici, yetki, gondericiGizli, tuz }) {
  const ecdh = crypto.createECDH('prime256v1');
  if (gondericiGizli) ecdh.setPrivateKey(gondericiGizli); else ecdh.generateKeys();
  const gonderen = ecdh.getPublicKey();
  const ortak = ecdh.computeSecret(alici);
  const salt = tuz || crypto.randomBytes(16);
  const ikm = hmac(hmac(yetki, ortak), Buffer.concat([Buffer.from('WebPush: info\0'), alici, gonderen, Buffer.from([1])]));
  const prk = hmac(salt, ikm);
  const cek = hmac(prk, Buffer.concat([Buffer.from('Content-Encoding: aes128gcm\0'), Buffer.from([1])])).subarray(0, 16);
  const nonce = hmac(prk, Buffer.concat([Buffer.from('Content-Encoding: nonce\0'), Buffer.from([1])])).subarray(0, 12);
  const c = crypto.createCipheriv('aes-128-gcm', cek, nonce);
  const sifreli = Buffer.concat([c.update(Buffer.concat([metin, Buffer.from([2])])), c.final(), c.getAuthTag()]);
  const kayitBoyu = Buffer.alloc(4); kayitBoyu.writeUInt32BE(4096);
  return Buffer.concat([salt, kayitBoyu, Buffer.from([gonderen.length]), gonderen, sifreli]);
}

// RFC 8292 — VAPID: ES256 imzalı kısa ömürlü belirteç.
function vapidBasligi(ucAdres, acik, gizli, simdi) {
  const pub = Buffer.from(acik, 'base64url');
  const anahtar = crypto.createPrivateKey({
    key: { kty: 'EC', crv: 'P-256', d: gizli, x: pub.subarray(1, 33).toString('base64url'), y: pub.subarray(33).toString('base64url') },
    format: 'jwk'
  });
  const t = Math.floor(simdi || Date.now() / 1000);
  const parca = o => Buffer.from(JSON.stringify(o)).toString('base64url');
  const govde = parca({ typ: 'JWT', alg: 'ES256' }) + '.' + parca({ aud: new URL(ucAdres).origin, exp: t + 12 * 3600, sub: VAPID_SUB });
  const imza = crypto.sign('sha256', Buffer.from(govde), { key: anahtar, dsaEncoding: 'ieee-p1363' });
  return `vapid t=${govde}.${imza.toString('base64url')}, k=${acik}`;
}

async function birineGonder(abone, yuk, acik, gizli) {
  if (!izinliUc(abone.endpoint)) return { durum: 0 };
  const govde = sifrele({ metin: Buffer.from(JSON.stringify(yuk)), alici: Buffer.from(abone.p256dh, 'base64url'), yetki: Buffer.from(abone.auth, 'base64url') });
  try {
    const y = await fetch(abone.endpoint, {
      method: 'POST',
      headers: {
        Authorization: vapidBasligi(abone.endpoint, acik, gizli),
        'Content-Encoding': 'aes128gcm',
        'Content-Type': 'application/octet-stream',
        TTL: '86400',
        Urgency: 'normal'
      },
      body: govde
    });
    return { durum: y.status };
  } catch (e) {
    return { durum: -1 };
  }
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ hata: 'Yalnızca POST' }); return; }
  const { VAPID_ACIK, VAPID_GIZLI } = process.env;
  if (!VAPID_ACIK || !VAPID_GIZLI) { res.status(500).json({ hata: 'Bildirim anahtarları eksik. Vercel ortam değişkenlerini kontrol edin.' }); return; }
  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Bearer ')) { res.status(401).json({ hata: 'Oturum bulunamadı.' }); return; }
  const basliklar = { apikey: SUPABASE_ANON, Authorization: auth, 'content-type': 'application/json' };

  let yonetici = false;
  try {
    const k = await fetch(`${SUPABASE_URL}/rest/v1/rpc/is_admin`, { method: 'POST', headers: basliklar, body: '{}' });
    yonetici = k.ok && (await k.json()) === true;
  } catch (e) { /* aşağıda reddedilir */ }
  if (!yonetici) { res.status(403).json({ hata: 'Bildirimi yalnız yönetici gönderebilir.' }); return; }

  let g = req.body;
  if (typeof g === 'string') { try { g = JSON.parse(g); } catch (e) { g = {}; } }
  const yuk = icerik(g);
  if (yuk.hata) { res.status(400).json({ hata: yuk.hata }); return; }
  const kisi = hedef(g);
  if (kisi === false) { res.status(400).json({ hata: 'Geçersiz kullanıcı.' }); return; }

  const filtre = kisi ? `&user_id=eq.${kisi}` : '';
  const liste = await fetch(`${SUPABASE_URL}/rest/v1/bildirim_aboneleri?select=id,endpoint,p256dh,auth${filtre}`, { headers: basliklar });
  if (!liste.ok) { res.status(502).json({ hata: 'Abone listesi okunamadı.' }); return; }
  const aboneler = await liste.json();

  let gonderilen = 0, basarisiz = 0;
  const silinecek = [];
  for (let i = 0; i < aboneler.length; i += 20) {
    const sonuc = await Promise.all(aboneler.slice(i, i + 20).map(a => birineGonder(a, yuk, VAPID_ACIK, VAPID_GIZLI).then(s => ({ a, s }))));
    for (const { a, s } of sonuc) {
      if (s.durum >= 200 && s.durum < 300) gonderilen++;
      else { basarisiz++; if (s.durum === 404 || s.durum === 410 || s.durum === 0) silinecek.push(a.id); }
    }
  }
  // Artık geçersiz abonelikler (telefon izni geri aldı vb.) listeden çıkarılır.
  if (silinecek.length) {
    await fetch(`${SUPABASE_URL}/rest/v1/bildirim_aboneleri?id=in.(${silinecek.join(',')})`, { method: 'DELETE', headers: basliklar }).catch(() => {});
  }
  res.status(200).json({ toplam: aboneler.length, gonderilen, basarisiz, silinen: silinecek.length });
};

module.exports.sifrele = sifrele;
module.exports.vapidBasligi = vapidBasligi;
module.exports.izinliUc = izinliUc;
module.exports.icerik = icerik;
module.exports.hedef = hedef;
