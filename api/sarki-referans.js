// Vercel sunucu fonksiyonu — Şarkı Avcısı için referans şarkı adaylarını getirir.
//
// Neden var: GetSongBPM'in API anahtarı tarayıcıya konulamaz. Bu fonksiyon anahtarı
// sunucuda tutar, isteği yapanın YÖNETİCİ olduğunu Supabase'e doğrulatır, ölçülen
// tempoya yakın şarkıları GetSongBPM'den çeker ve sarki-avcisi-cekirdek.js ile
// en uygun 10 tanesini seçer. Ses dosyası buraya HİÇ gelmez (analiz tarayıcıda yapılır).
//
// Gövde: { bpm: 150, camelot: "8A", turler: ["pop"], haric: ["sanatci|baslik", …], adet: 10 }
//
// Ortam değişkeni (Vercel → Settings → Environment Variables):
//   GETSONGBPM_API_KEY  — https://getsongbpm.com/api adresinden ücretsiz alınır.
// Ücretsiz kullanım şartı: sayfada getsongbpm.com'a görünür bir bağlantı (sarki-avcisi.html altbilgisi).

const S = require('../sarki-avcisi-cekirdek.js');

// Bunlar gizli değil; config.js'deki herkese açık değerlerin aynısı.
const SUPABASE_URL = 'https://abqhakgoluntpzgfyjye.supabase.co';
const SUPABASE_ANON = 'sb_publishable_FrRGXIb3-x8-Lzx1Ijg75w_teFbP2oa';
const SERVIS = 'https://api.getsong.co';

// Aynı tempo sorgusu 24 saat bellekte tutulur: aynı şarkı tekrar analiz edilince
// GetSongBPM'e tekrar çıkılmaz (ücretsiz sınırı korur).
const SURE_MS = 24 * 60 * 60 * 1000;
const onbellek = new Map();

// Yöneticiyi Supabase doğrular: önce belirteç (auth/v1/user), sonra is_admin() RPC'si
// kullanıcının KENDİ belirteciyle çağrılır; RLS'teki aynı fonksiyon karar verir.
async function yoneticiMi(yetki) {
  if (!/^Bearer\s+\S+$/.test(yetki || '')) return false;
  try {
    const k = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SUPABASE_ANON, Authorization: yetki } });
    if (!k.ok) return false;
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/is_admin`, {
      method: 'POST',
      headers: { apikey: SUPABASE_ANON, Authorization: yetki, 'content-type': 'application/json' },
      body: '{}'
    });
    if (!r.ok) return false;
    return (await r.json().catch(() => false)) === true;
  } catch (e) {
    return false;
  }
}

// Tek GetSongBPM sorgusu (önbellekli). yol: "tempo/?bpm=150" ya da "key/?key_of=9&mode=0".
async function sorgula(anahtar, yol) {
  const kayit = onbellek.get(yol);
  if (kayit && Date.now() - kayit.zaman < SURE_MS) return kayit.adaylar;
  const adres = `${SERVIS}/${yol}&api_key=${encodeURIComponent(anahtar)}`;
  const yanit = await fetch(adres, { headers: { accept: 'application/json' } });
  if (!yanit.ok) throw new Error('GetSongBPM ' + yanit.status);
  const adaylar = S.getsongbpmCoz(await yanit.json().catch(() => null));
  if (onbellek.size > 400) onbellek.clear();
  onbellek.set(yol, { zaman: Date.now(), adaylar });
  return adaylar;
}

// /tempo/ yanıtında ton yoktur; uyumlu tonların /key/ listeleri aynı şarkı kimliğiyle eşlenir.
function tonSorgulari(camelot) {
  return S.uyumluTonlar(camelot).map(S.camelotParametre).filter(Boolean)
    .map(p => `key/?key_of=${p.key_of}&mode=${p.mode}&limit=500`);
}

// Sorgulanacak tempolar: ölçülen tempo ±3 ve yarım tempo ±1 (en çok 10 istek; + 4 ton isteği).
function tempolar(bpm) {
  const t = new Set();
  const b = Math.round(bpm);
  for (let d = -3; d <= 3; d++) t.add(b + d);
  const y = Math.round(bpm / 2);
  for (let d = -1; d <= 1; d++) t.add(y + d);
  return [...t].filter(x => x >= 40 && x <= 220);
}

module.exports = async (req, res) => {
  res.setHeader('cache-control', 'no-store');
  if (req.method !== 'POST') { res.status(405).json({ hata: 'yalniz-post' }); return; }

  if (!(await yoneticiMi(req.headers && req.headers.authorization))) {
    res.status(403).json({ hata: 'yetki-yok' });
    return;
  }

  const anahtar = process.env.GETSONGBPM_API_KEY;
  if (!anahtar) {
    res.status(503).json({ hata: 'anahtar-yok' });
    return;
  }

  let govde = req.body;
  if (typeof govde === 'string') { try { govde = JSON.parse(govde); } catch (e) { govde = null; } }
  const bpm = Number(govde && govde.bpm);
  if (!(bpm >= 60 && bpm <= 200)) {
    res.status(400).json({ hata: 'bpm-gecersiz' });
    return;
  }
  const hedef = {
    bpm,
    camelot: S.tonCamelot(govde.camelot),
    turler: Array.isArray(govde.turler) ? govde.turler.map(String).slice(0, 6) : []
  };
  const haric = Array.isArray(govde.haric) ? govde.haric.map(String).slice(0, 2000) : [];
  const adet = Math.min(20, Math.max(1, Number(govde.adet) || 10));

  try {
    const [tempoSonuc, tonSonuc] = await Promise.all([
      Promise.allSettled(tempolar(bpm).map(t => sorgula(anahtar, `tempo/?bpm=${t}`))),
      Promise.allSettled(tonSorgulari(hedef.camelot).map(y => sorgula(anahtar, y)))
    ]);
    const sonuclar = tempoSonuc;
    const tonlu = tonSonuc.filter(s => s.status === 'fulfilled').flatMap(s => s.value);
    const adaylar = S.tonlariEsle(sonuclar.filter(s => s.status === 'fulfilled').flatMap(s => s.value), tonlu);
    if (!adaylar.length && sonuclar.every(s => s.status === 'rejected')) throw new Error('servis');
    const secilen = S.referansSec(adaylar, hedef, haric, adet);
    res.status(200).json({ referanslar: secilen, adaySayisi: adaylar.length });
  } catch (e) {
    res.status(502).json({ hata: 'servis-ulasilamadi' });
    return;
  }
};
