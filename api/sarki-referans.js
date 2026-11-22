// Vercel sunucu fonksiyonu — Şarkı Avcısı için referans şarkı adaylarını getirir.
//
// Neden var: GetSongBPM'in API anahtarı tarayıcıya konulamaz. Bu fonksiyon anahtarı
// sunucuda tutar, isteği yapanın YÖNETİCİ olduğunu Supabase'e doğrulatır, ölçülen
// tempoya yakın şarkıları GetSongBPM'den çeker ve sarki-avcisi-cekirdek.js ile
// en uygun 10 tanesini seçer. Ses dosyası buraya HİÇ gelmez (analiz tarayıcıda yapılır).
//
// Gövde: { bpm: 150, camelot: "8A", turler: ["pop"], haric: ["sanatci|baslik", …], adet: 10 }
//
// Kaynak: GETSONGBPM_API_KEY ortam değişkeni varsa GetSongBPM (tempo + ton); yoksa Deezer
// (anahtarsız, ücretsiz: BPM aralığıyla arama). Deezer adaylarının tonu tarayıcıda, 30 sn
// önizleme dinlenerek ölçülür (api/sarki-onizleme.js). GetSongBPM formu 2026-11 itibarıyla
// anahtar göndermediği için varsayılan yol Deezer'dır.

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

// ───────── Deezer (anahtarsız) ─────────
const DEEZER = 'https://api.deezer.com';

async function deezerAra(enAz, enCok, index) {
  const yol = `deezer:${enAz}-${enCok}:${index}`;
  const kayit = onbellek.get(yol);
  if (kayit && Date.now() - kayit.zaman < SURE_MS) return kayit.adaylar;
  const q = encodeURIComponent(`bpm_min:"${enAz}" bpm_max:"${enCok}"`);
  const yanit = await fetch(`${DEEZER}/search?q=${q}&limit=100&index=${index}`, { headers: { accept: 'application/json' } });
  if (!yanit.ok) throw new Error('Deezer ' + yanit.status);
  const govde = await yanit.json().catch(() => null);
  if (govde && govde.error) throw new Error('Deezer ' + (govde.error.message || 'hata'));
  const adaylar = S.deezerCoz(govde).map(a => ({ ...a, bpm: Math.round((enAz + enCok) / 2) }));
  if (onbellek.size > 400) onbellek.clear();
  onbellek.set(yol, { zaman: Date.now(), adaylar });
  return adaylar;
}

async function albumTurleri(albumId) {
  const yol = `album:${albumId}`;
  const kayit = onbellek.get(yol);
  if (kayit) return kayit.adaylar;
  const j = await fetch(`${DEEZER}/album/${albumId}`).then(r => r.json()).catch(() => null);
  const bilgi = {
    turler: (j && j.genres && Array.isArray(j.genres.data) ? j.genres.data.map(g => String(g.name)) : []),
    yil: j && j.release_date ? Number(String(j.release_date).slice(0, 4)) || null : null
  };
  onbellek.set(yol, { zaman: Date.now(), adaylar: bilgi });
  return bilgi;
}

const bekle = ms => new Promise(r => setTimeout(r, ms));

async function deezerJson(yol) {
  const kayit = onbellek.get(yol);
  if (kayit && Date.now() - kayit.zaman < SURE_MS) return kayit.adaylar;
  const j = await fetch(DEEZER + yol, { headers: { accept: 'application/json' } }).then(r => r.json());
  if (j && j.error) throw new Error('Deezer ' + (j.error.message || 'hata'));
  if (onbellek.size > 400) onbellek.clear();
  onbellek.set(yol, { zaman: Date.now(), adaylar: j });
  return j;
}

// Tarza özel arama (2026-11-22): Deezer'ın şarkı aramasında serbest metin BPM filtresiyle
// birlikte yok sayılıyor; bu yüzden tarz yazısıyla ÇALMA LİSTESİ aranır, en iyi 4 listenin
// şarkıları toplanır, ilk 36'sının BPM'i /track/{id} ile okunur (Deezer sınırı: 5 sn'de 50
// istek → 6'şar, aralarda 700 ms). BPM'i bilinmeyenler elenmez; tarayıcı önizlemeden ölçer.
async function tarzAdaylari(tarz, bpm, haric) {
  const pl = await deezerJson(`/search/playlist?q=${encodeURIComponent(tarz)}&limit=8`);
  const listeler = (pl && Array.isArray(pl.data) ? pl.data : []).filter(p => Number(p.nb_tracks) >= 8).slice(0, 4);
  if (!listeler.length) return { adaylar: [], listeler: [] };
  const parcalar = await Promise.allSettled(listeler.map(p => deezerJson(`/playlist/${p.id}/tracks?limit=100`)));
  // Listeleri sırayla değil iç içe dizer: her listeden sırayla birer şarkı (tek listeye boğulmaz).
  const diziler = parcalar.map((x, i) => (x.status === 'fulfilled' ? S.deezerCoz(x.value).map(a => ({ ...a, liste: String(listeler[i].title || '').slice(0, 80) })) : []));
  const cikar = new Set(haric), gorulen = new Set(), sirali = [];
  for (let i = 0; i < 100; i++) for (const d of diziler) {
    const a = d[i]; if (!a) continue;
    const k = S.sarkiAnahtari(a.baslik, a.sanatci);
    if (gorulen.has(k) || cikar.has(k)) continue;
    gorulen.add(k); sirali.push(a);
  }
  const ilk = sirali.slice(0, 36);
  for (let i = 0; i < ilk.length; i += 6) {
    if (i) await bekle(700);
    await Promise.all(ilk.slice(i, i + 6).map(async a => {
      const t = await deezerJson(`/track/${a.deezerId}`).catch(() => null);
      if (!t) return;
      if (Number(t.bpm) > 0) a.bpm = Math.round(Number(t.bpm) * 10) / 10;
      const yil = Number(String(t.release_date || '').slice(0, 4));
      if (yil) a.yil = yil;
    }));
  }
  // Tempoya (yarım/çift dahil) 10 BPM'den uzak olanlar elenir; bilinmeyenler kalır.
  const adaylar = ilk.filter(a => !a.bpm || S.tempoFarki(a.bpm, bpm) <= 10).map(a => ({ ...a, turler: [tarz] }));
  return { adaylar, listeler: listeler.map(p => String(p.title || '')) };
}

// Tempo ±3 (3 sayfa) ve yarım tempo ±1 (1 sayfa). Tür istenmişse en popüler 40 adayın
// albüm türüne bakılır (Deezer sınırı: 5 sn'de 50 istek; 6'şar paralel).
async function deezerAdaylari(bpm, turler, haric) {
  const b = Math.round(bpm), y = Math.round(bpm / 2);
  const isler = [0, 100, 200].map(i => deezerAra(b - 3, b + 3, i)).concat([deezerAra(y - 1, y + 1, 0)]);
  const sonuc = await Promise.allSettled(isler);
  if (sonuc.every(x => x.status === 'rejected')) throw new Error('deezer');
  const cikar = new Set(haric);
  const gorulen = new Set();
  let adaylar = sonuc.filter(x => x.status === 'fulfilled').flatMap(x => x.value)
    .filter(a => { const k = S.sarkiAnahtari(a.baslik, a.sanatci); if (gorulen.has(k) || cikar.has(k)) return false; gorulen.add(k); return true; })
    .sort((a, c) => c.sira - a.sira);
  const ilk = adaylar.slice(0, 40);
  for (let i = 0; i < ilk.length; i += 6) {
    await Promise.all(ilk.slice(i, i + 6).map(async a => {
      if (!a.albumId) return;
      const bilgi = await albumTurleri(a.albumId);
      a.turler = bilgi.turler; a.yil = bilgi.yil;
    }));
  }
  adaylar = ilk;
  if (turler && turler.length) {
    const uyan = adaylar.filter(a => S.turEslesir(turler, a.turler));
    if (uyan.length >= 5) adaylar = uyan;
  }
  return adaylar;
}

const isle = async (req, res) => {
  res.setHeader('cache-control', 'no-store');
  if (req.method !== 'POST') { res.status(405).json({ hata: 'yalniz-post' }); return; }

  if (!(await yoneticiMi(req.headers && req.headers.authorization))) {
    res.status(403).json({ hata: 'yetki-yok' });
    return;
  }

  const anahtar = process.env.GETSONGBPM_API_KEY;

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

  const tarz = String((govde && govde.tarz) || '').trim().slice(0, 80);
  if (tarz) {
    try {
      const { adaylar, listeler } = await tarzAdaylari(tarz, bpm, haric);
      const secilen = S.referansSec(adaylar, { ...hedef, camelot: null, turler: [] }, haric, Math.max(adet, 20));
      res.status(200).json({ referanslar: secilen, adaySayisi: adaylar.length, kaynak: 'deezer', tarz, listeler });
    } catch (e) {
      res.status(502).json({ hata: 'servis-ulasilamadi' });
    }
    return;
  }

  if (!anahtar) {
    try {
      const adaylar = await deezerAdaylari(bpm, hedef.turler, haric);
      // Ton henüz bilinmiyor: tarayıcı önizlemeleri dinleyip son 10'u seçecek, bu yüzden daha geniş liste döner.
      const secilen = S.referansSec(adaylar, { ...hedef, camelot: null }, haric, Math.max(adet, 20));
      res.status(200).json({ referanslar: secilen, adaySayisi: adaylar.length, kaynak: 'deezer' });
    } catch (e) {
      res.status(502).json({ hata: 'servis-ulasilamadi' });
    }
    return;
  }

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
    res.status(200).json({ referanslar: secilen, adaySayisi: adaylar.length, kaynak: 'getsongbpm' });
  } catch (e) {
    res.status(502).json({ hata: 'servis-ulasilamadi' });
    return;
  }
};

module.exports = isle;
module.exports.yoneticiMi = yoneticiMi;
