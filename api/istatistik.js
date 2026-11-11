// Vercel sunucu fonksiyonu — İSTATİSTİKLER sayfasının ziyaretçi bilgisi (11 Kasım 2026).
//
// Neden var: Vercel Web Analytics bilgisini okumak bir erişim anahtarı ister; anahtar
// tarayıcıya konulamaz. Bu fonksiyon anahtarı sunucuda tutar, isteği yapanın yönetici
// olduğunu Supabase'e doğrulatır ve yalnız sayıları (ziyaretçi / sayfa) döndürür.
//
// Gerekli ortam değişkeni (Vercel → Settings → Environment Variables):
//   VERCEL_ISTATISTIK_ANAHTARI — Vercel hesabından oluşturulan erişim anahtarı.
// Gizlidir; depoya yazılmaz. Yoksa sayfa "bağlanmadı" der.

// Bunlar gizli değil; config.js'deki herkese açık değerlerin ve proje kimliğinin aynısı.
const SUPABASE_URL = 'https://abqhakgoluntpzgfyjye.supabase.co';
const SUPABASE_ANON = 'sb_publishable_FrRGXIb3-x8-Lzx1Ijg75w_teFbP2oa';
const PROJE = 'prj_bpMFM1IOdKo13M7zjH1HVES6i2gU';
const EKIP = 'team_Y00tSlNV9SszGBM1DlbVikMc';
const GUN = 30;

async function sorgu(anahtar, by, limit, since, until) {
  const q = new URLSearchParams({ projectId: PROJE, teamId: EKIP, since, until, limit: String(limit) });
  q.append('by', by);
  const r = await fetch('https://api.vercel.com/v1/query/web-analytics/visits/aggregate?' + q, {
    headers: { Authorization: 'Bearer ' + anahtar }
  });
  if (!r.ok) throw new Error('Vercel ' + r.status);
  const g = await r.json();
  return Array.isArray(g && g.data) ? g.data : [];
}

module.exports = async (req, res) => {
  if (req.method !== 'GET') { res.status(405).json({ hata: 'Yalnızca GET' }); return; }

  const auth = (req.headers && req.headers.authorization) || '';
  if (!auth.startsWith('Bearer ')) { res.status(401).json({ hata: 'Oturum bulunamadı.' }); return; }

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
  if (!yonetici) { res.status(403).json({ hata: 'Bu bilgi yalnız yöneticiye açık.' }); return; }

  const anahtar = process.env.VERCEL_ISTATISTIK_ANAHTARI;
  if (!anahtar) { res.status(200).json({ bagli: false }); return; }

  const until = new Date().toISOString();
  const since = new Date(Date.now() - (GUN - 1) * 864e5).toISOString().slice(0, 10) + 'T00:00:00.000Z';
  try {
    const [gunluk, sayfalar, ulkeler, cihazlar] = await Promise.all([
      sorgu(anahtar, 'day', GUN, since, until),
      sorgu(anahtar, 'requestPath', 8, since, until),
      sorgu(anahtar, 'country', 8, since, until),
      sorgu(anahtar, 'deviceType', 5, since, until)
    ]);
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.status(200).json({ bagli: true, gunluk, sayfalar, ulkeler, cihazlar });
  } catch (e) {
    res.status(502).json({ hata: 'Ziyaretçi bilgisi alınamadı (' + (e && e.message) + '). Anahtarın doğru girildiğini kontrol et.' });
  }
};
