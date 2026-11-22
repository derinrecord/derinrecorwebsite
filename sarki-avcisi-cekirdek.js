// Şarkı Avcısı çekirdeği (2026-11-20) — tarayıcıda da Node'da da çalışan saf fonksiyonlar.
//
// İki iş yapar:
//   1. "Dinleme": ses örneklerinden (Float32Array) tempo, ton, 8'lik blok enerjisi ve
//      önemli anlar (drop, nefes, zirve) ÖLÇÜLÜR. Ton ve tempo tahmindir; sayfa bunu yazar.
//   2. "Referans seçimi": GetSongBPM'den gelen aday şarkılar, ölçülen şarkıya göre
//      puanlanır; kullanılmış/istenmeyen şarkılar çıkarılır, en uygun 10 tanesi seçilir.
// Ağ isteği yapmaz; api/sarki-referans.js ve sarki-avcisi.js bu dosyayı kullanır.
(() => {
  'use strict';

  const PC = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const CAMELOT_MAJ = { C: '8B', G: '9B', D: '10B', A: '11B', E: '12B', B: '1B', 'F#': '2B', 'C#': '3B', 'G#': '4B', 'D#': '5B', 'A#': '6B', F: '7B' };
  const CAMELOT_MIN = { A: '8A', E: '9A', B: '10A', 'F#': '11A', 'C#': '12A', 'G#': '1A', 'D#': '2A', 'A#': '3A', F: '4A', C: '5A', G: '6A', D: '7A' };
  const MAJ = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
  const MIN = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
  const BEMOL = { DB: 'C#', EB: 'D#', GB: 'F#', AB: 'G#', BB: 'A#', CB: 'B', FB: 'E', 'E#': 'F', 'B#': 'C' };

  // ───────── 1. Dinleme (ölçüm) ─────────

  const korelasyon = (a, b) => {
    const ma = a.reduce((s, x) => s + x, 0) / 12, mb = b.reduce((s, x) => s + x, 0) / 12;
    let n = 0, da = 0, db = 0;
    for (let i = 0; i < 12; i++) { const x = a[i] - ma, y = b[i] - mb; n += x * y; da += x * x; db += y * y; }
    return n / Math.sqrt(da * db || 1);
  };

  function goertzel(buf, sr, frekans) {
    const k = 2 * Math.cos(2 * Math.PI * frekans / sr);
    let s0 = 0, s1 = 0, s2 = 0;
    for (let i = 0; i < buf.length; i++) { s0 = buf[i] + k * s1 - s2; s2 = s1; s1 = s0; }
    return Math.sqrt(Math.max(0, s1 * s1 + s2 * s2 - k * s1 * s2));
  }

  // Tempo: enerji artışlarının öz-ilintisi (harmonic-analyze.js ile aynı yöntem).
  // Sonuç 85–175 aralığına katlanır; yarım ve çift tempo da döner (aerobikte 75 ↔ 150 karışır).
  function tempoBul(ch, sr) {
    // ~11.6 ms adım: harmonic-analyze.js'in 1024 örneklik adımından ~4 kat ince;
    // tepe noktası parabolle aradeğerlenir, böylece 150 ile 152 ayırt edilir.
    const boy = Math.max(64, Math.round(sr / 86));
    const enerji = [];
    for (let i = 0; i + boy < ch.length; i += boy) {
      let s = 0;
      for (let j = 0; j < boy; j += 2) s += ch[i + j] * ch[i + j];
      enerji.push(s);
    }
    const fark = enerji.map((v, i) => (i ? Math.max(0, v - enerji[i - 1]) : 0));
    const fps = sr / boy;
    const enAz = Math.max(2, Math.floor(fps * 60 / 180)), enCok = Math.ceil(fps * 60 / 70);
    const ilinti = lag => {
      let s = 0;
      for (let i = 0; i + lag < fark.length; i++) s += fark[i] * fark[i + lag];
      return s / Math.max(1, fark.length - lag);
    };
    let iyi = null;
    for (let lag = enAz; lag <= enCok; lag++) {
      const s = ilinti(lag);
      if (!iyi || s > iyi.s) iyi = { s, lag };
    }
    if (!iyi || !iyi.s) return { bpm: null, yarim: null, cift: null };
    const a = ilinti(iyi.lag - 1), c = ilinti(iyi.lag + 1), pay = a - 2 * iyi.s + c;
    const ince = pay ? iyi.lag + Math.max(-0.5, Math.min(0.5, 0.5 * (a - c) / pay)) : iyi.lag;
    let bpm = (fps * 60) / ince;
    while (bpm < 85) bpm *= 2;
    while (bpm > 175) bpm /= 2;
    bpm = Math.round(bpm * 10) / 10;
    return { bpm, yarim: Math.round(bpm * 5) / 10, cift: Math.round(bpm * 20) / 10 };
  }

  // Ton: şarkının ortasındaki 30 sn'nin kromasıyla Krumhansl profilleri (tahmin).
  function tonBul(ch, sr) {
    const kroma = new Array(12).fill(0);
    const pencere = Math.min(ch.length, sr * 30);
    const basla = Math.floor((ch.length - pencere) / 2);
    const parca = ch.subarray(basla, basla + pencere);
    const adim = Math.floor(sr * 0.5);
    const blok = 4096;
    for (let oct = 2; oct <= 5; oct++) {
      for (let p = 0; p < 12; p++) {
        const f = 440 * Math.pow(2, (p - 9) / 12 + (oct - 4));
        let toplam = 0, n = 0;
        for (let off = 0; off + blok < parca.length; off += adim * 4) {
          toplam += goertzel(parca.subarray(off, off + blok), sr, f); n++;
        }
        if (n) kroma[p] += toplam / n;
      }
    }
    let en = null;
    for (let r = 0; r < 12; r++) {
      const don = kroma.slice(r).concat(kroma.slice(0, r));
      const cM = korelasyon(don, MAJ), cm = korelasyon(don, MIN);
      if (!en || cM > en.p) en = { p: cM, kok: PC[r], mod: 'major' };
      if (cm > en.p) en = { p: cm, kok: PC[r], mod: 'minor' };
    }
    return {
      ton: en.kok + (en.mod === 'minor' ? ' minor' : ' major'),
      camelot: en.mod === 'minor' ? CAMELOT_MIN[en.kok] : CAMELOT_MAJ[en.kok],
      guven: Math.round(Math.max(0, en.p) * 100)
    };
  }

  // 8 vuruşluk (bir "sekizlik") bloklar: her bloğun RMS'i, en güçlüye göre 0–1.
  function enerjiBloklari(ch, sr, bpm) {
    if (!bpm || !ch || !ch.length) return [];
    const blokSn = 8 * 60 / bpm;
    const blokOrnek = Math.max(1, Math.round(blokSn * sr));
    const ham = [];
    for (let bas = 0; bas < ch.length; bas += blokOrnek) {
      const bit = Math.min(ch.length, bas + blokOrnek);
      let s = 0, n = 0;
      for (let i = bas; i < bit; i += 16) { s += ch[i] * ch[i]; n++; }
      ham.push({ bas: bas / sr, bit: bit / sr, rms: Math.sqrt(s / Math.max(1, n)) });
    }
    const enCok = Math.max(...ham.map(b => b.rms), 1e-9);
    return ham.map(b => ({ bas: Math.round(b.bas * 10) / 10, bit: Math.round(b.bit * 10) / 10, enerji: Math.round(b.rms / enCok * 100) / 100 }));
  }

  // Önemli anlar: drop (ani yükselişle gelen güçlü blok), nefes (belirgin düşüş), zirve.
  function onemliAnlar(bloklar) {
    const anlar = [];
    if (!bloklar.length) return anlar;
    let zirve = 0;
    bloklar.forEach((b, i) => {
      if (b.enerji > bloklar[zirve].enerji) zirve = i;
      const onceki = i ? bloklar[i - 1].enerji : 0;
      if (i && b.enerji >= 0.75 && b.enerji - onceki >= 0.25) anlar.push({ tur: 'drop', bas: b.bas, bit: b.bit });
      else if (i && i < bloklar.length - 1 && b.enerji <= 0.4 && onceki - b.enerji >= 0.25) anlar.push({ tur: 'nefes', bas: b.bas, bit: b.bit });
    });
    anlar.push({ tur: 'zirve', bas: bloklar[zirve].bas, bit: bloklar[zirve].bit });
    return anlar.sort((a, b) => a.bas - b.bas);
  }

  // "Remix'e açık" blokları özetleyen tek cümleler (rapor için).
  function enerjiOzeti(bloklar, anlar) {
    if (!bloklar.length) return [];
    const sure = bloklar[bloklar.length - 1].bit;
    const satirlar = [];
    const drop = anlar.find(a => a.tur === 'drop');
    if (drop) satirlar.push(`${zaman(drop.bas)}–${zaman(drop.bit)} ilk drop: açılış ya da büyük element için güçlü bölüm.`);
    const nefes = anlar.find(a => a.tur === 'nefes');
    if (nefes) satirlar.push(`${zaman(nefes.bas)}–${zaman(nefes.bit)} nefes bölümü: yer serisi / koreografik geçiş için uygun.`);
    const zirve = anlar.find(a => a.tur === 'zirve');
    if (zirve) satirlar.push(`${zaman(zirve.bas)}–${zaman(zirve.bit)} en yüksek enerji: final için aday.`);
    const ilk = bloklar[0];
    if (ilk.enerji >= 0.7) satirlar.push('Şarkı baştan güçlü başlıyor ("baştan güçlü" kalıbı).');
    else satirlar.push('Şarkı alçak başlayıp yükseliyor ("yükselen dalga" kalıbı).');
    satirlar.push(`Toplam ${zaman(sure)}, ${bloklar.length} sekizlik.`);
    return satirlar;
  }

  const zaman = sn => {
    const t = Math.max(0, Math.round(sn));
    return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
  };

  // ───────── 2. Ton yardımcıları ─────────

  // "Em", "E minor", "F#m", "Bb", "C♯ major", "Dbm", "8A" → Camelot kodu (bilinmiyorsa null).
  function tonCamelot(deger) {
    const s = String(deger || '').trim();
    if (!s) return null;
    const kod = /^(\d{1,2})\s*([AB])$/i.exec(s);
    if (kod && +kod[1] >= 1 && +kod[1] <= 12) return `${+kod[1]}${kod[2].toUpperCase()}`;
    const m = /^([A-Ga-g])\s*([#♯b♭]?)\s*(m(?!aj)|min(?:or)?|maj(?:or)?|major)?$/i.exec(s.replace(/\s+/g, ' '));
    if (!m) return null;
    let kok = m[1].toUpperCase() + (m[2] === '♯' || m[2] === '#' ? '#' : (m[2] === '♭' || m[2] === 'b' ? 'B' : ''));
    if (BEMOL[kok]) kok = BEMOL[kok];
    else if (kok.endsWith('B') && kok.length === 2) return null;
    const minor = !!m[3] && /^m(in|$)/i.test(m[3]) && !/^maj/i.test(m[3]);
    return (minor ? CAMELOT_MIN : CAMELOT_MAJ)[kok] || null;
  }

  // Open Key ("1d" = C major, "1m" = A minor) → Camelot ("8B", "8A").
  function openKeyCamelot(deger) {
    const m = /^(\d{1,2})\s*([dm])$/i.exec(String(deger || '').trim());
    if (!m || +m[1] < 1 || +m[1] > 12) return null;
    return `${((+m[1] + 6) % 12) + 1}${m[2].toLowerCase() === 'd' ? 'B' : 'A'}`;
  }

  // Camelot → GetSongBPM /key/ parametreleri: key_of (0 = C … 11 = B), mode (1 major, 0 minor).
  function camelotParametre(k) {
    const K = String(k || '').toUpperCase();
    for (const [kok, kod] of Object.entries(CAMELOT_MAJ)) if (kod === K) return { key_of: PC.indexOf(kok), mode: 1 };
    for (const [kok, kod] of Object.entries(CAMELOT_MIN)) if (kod === K) return { key_of: PC.indexOf(kok), mode: 0 };
    return null;
  }

  // Tempo listesindeki adaylara, ton listelerinden (aynı şarkı kimliğiyle) ton ekler.
  function tonlariEsle(adaylar, tonAdaylari) {
    const harita = new Map();
    for (const t of tonAdaylari || []) if (t.camelot) harita.set(t.id, t.camelot);
    return (adaylar || []).map(a => (a.camelot || !harita.has(a.id) ? a : { ...a, camelot: harita.get(a.id) }));
  }

  const camelotCoz = k => { const m = /^(\d{1,2})([AB])$/i.exec(String(k || '').trim()); return m ? { n: +m[1], L: m[2].toUpperCase() } : null; };
  const sar = n => ((n - 1 + 12) % 12) + 1;

  function uyumluTonlar(k) {
    const K = camelotCoz(k);
    if (!K) return [];
    return [`${K.n}${K.L}`, `${K.n}${K.L === 'A' ? 'B' : 'A'}`, `${sar(K.n + 1)}${K.L}`, `${sar(K.n - 1)}${K.L}`];
  }

  // 'ayni' | 'komsu' | 'uyumsuz' | null (ton bilinmiyorsa)
  function tonUyumu(a, b) {
    if (!camelotCoz(a) || !camelotCoz(b)) return null;
    if (camelotCoz(a).n === camelotCoz(b).n && camelotCoz(a).L === camelotCoz(b).L) return 'ayni';
    return uyumluTonlar(a).includes(`${camelotCoz(b).n}${camelotCoz(b).L}`) ? 'komsu' : 'uyumsuz';
  }

  // ───────── 3. Referans seçimi ─────────

  const sade = s => String(s || '').toLocaleLowerCase('tr-TR')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\(.*?\)|\[.*?\]/g, ' ').replace(/\b(feat|ft)\.?\b.*$/, ' ')
    .replace(/[^a-z0-9ığüşöç]+/g, ' ').trim();

  const sarkiAnahtari = (baslik, sanatci) => `${sade(sanatci)}|${sade(baslik)}`;

  // Kaynak tempodan hedef tempoya kaç yüzde germe gerekir (+ hızlandırma, − yavaşlatma).
  function germe(kaynak, hedef) {
    if (!kaynak || !hedef) return null;
    return Math.round((hedef / kaynak - 1) * 1000) / 10;
  }

  // Yarım/çift tempoyu da hesaba katan germe: 75 BPM şarkı 150'ye +%100 değil, %0 germeyle oturur.
  function germeEnYakin(kaynak, hedef) {
    if (!kaynak || !hedef) return null;
    let en = null;
    for (const kat of [1, 2, 0.5]) {
      const y = germe(kaynak * kat, hedef);
      if (!en || Math.abs(y) < Math.abs(en.yuzde)) en = { yuzde: Math.abs(y) < 0.5 ? 0 : y, kat };
    }
    return en;
  }

  // Tempo farkı: yarım/çift tempo da aynı his sayılır (75 BPM şarkı 150'lik akışa oturur).
  function tempoFarki(a, b) {
    if (!a || !b) return null;
    return Math.min(Math.abs(a - b), Math.abs(a * 2 - b), Math.abs(a - b * 2));
  }

  // GetSongBPM yanıtını sade adaylara çevirir. Yanıt biçimi kesin bilinmediği için savunmacı:
  // { tempo:[…] } / { search:[…] } / { key:[…] } / { song:{…} } ya da düz dizi.
  function getsongbpmCoz(govde) {
    if (!govde || typeof govde !== 'object') return [];
    const dizi = Array.isArray(govde) ? govde
      : (govde.tempo || govde.search || govde.key || govde.songs || (govde.song ? [govde.song] : []));
    if (!Array.isArray(dizi)) return [];
    return dizi.map(o => {
      if (!o || typeof o !== 'object') return null;
      const baslik = String(o.song_title || o.title || '').trim();
      const sanatci = String((o.artist && o.artist.name) || o.artist_name || '').trim();
      if (!baslik || !sanatci) return null;
      const bpm = Number(o.tempo || o.bpm) || null;
      const mk = o.music_key && typeof o.music_key === 'object' ? o.music_key : null;
      const camelot = tonCamelot(o.key_of) || openKeyCamelot(o.open_key) || tonCamelot(o.camelot)
        || (mk ? tonCamelot(String(mk.key_of || '') + (/minor/i.test(mk.mode || '') ? 'm' : '')) : null) || null;
      const turler = Array.isArray(o.artist && o.artist.genres) ? o.artist.genres.map(String) : [];
      const yil = Number((o.album && o.album.year) || o.year) || null;
      return {
        id: String(o.song_id || o.id || sarkiAnahtari(baslik, sanatci)),
        baslik, sanatci, bpm, camelot, turler, yil,
        kaynak: String(o.song_uri || o.uri || '')
      };
    }).filter(Boolean);
  }

  // Deezer /search yanıtı → adaylar. Arama sonucunda BPM, ton ve yıl yoktur: BPM pencereden
  // gelir (yaklaşık), ton ve kesin BPM önizleme dinlenince (sarki-onizleme) eklenir.
  function deezerCoz(govde) {
    const dizi = govde && Array.isArray(govde.data) ? govde.data : [];
    return dizi.map(o => {
      if (!o || o.type !== 'track' || o.readable === false) return null;
      const baslik = String(o.title_short || o.title || '').trim();
      const sanatci = String((o.artist && o.artist.name) || '').trim();
      const id = Number(o.id);
      if (!baslik || !sanatci || !id) return null;
      return {
        id: 'dz' + id, deezerId: id, baslik, sanatci,
        bpm: null, camelot: null, turler: [], yil: null,
        albumId: Number(o.album && o.album.id) || null,
        kaynak: String(o.link || `https://www.deezer.com/track/${id}`),
        sira: Number(o.rank) || 0
      };
    }).filter(Boolean);
  }

  // Türkçe tür yazımlarını Deezer tür adlarıyla eşleştirmek için.
  const TUR_ESLE = { dans: 'dance', elektronik: 'electro', latin: 'latin', 'hip hop': 'rap', rap: 'rap', klasik: 'classical', caz: 'jazz', turk: 'turk', turkce: 'turk' };
  function turEslesir(istenen, var_) {
    const ist = (istenen || []).map(t => { const x = sade(t); return TUR_ESLE[x] || x; }).filter(Boolean);
    if (!ist.length) return true;
    const v = (var_ || []).map(sade);
    return ist.some(t => v.some(g => g.includes(t) || t.includes(g)));
  }

  function puanla(aday, hedef) {
    let puan = 0;
    const fark = tempoFarki(aday.bpm, hedef.bpm);
    if (fark != null) puan += Math.max(0, 40 - fark * 6); // ±0 → 40, ±6 → 4
    const uyum = tonUyumu(hedef.camelot, aday.camelot);
    if (uyum === 'ayni') puan += 30; else if (uyum === 'komsu') puan += 22; else if (uyum === null) puan += 8;
    const istenen = (hedef.turler || []).map(sade).filter(Boolean);
    if (istenen.length) {
      const var_ = aday.turler.map(sade);
      if (istenen.some(t => var_.some(v => v.includes(t) || t.includes(v)))) puan += 20;
    }
    if (aday.yil && hedef.yilSonra && aday.yil >= hedef.yilSonra) puan += 6;
    return { puan, fark, uyum };
  }

  function neden(aday, hedef, p) {
    const parcalar = [];
    if (p.fark != null) {
      const yarim = aday.bpm && hedef.bpm && Math.abs(aday.bpm * 2 - hedef.bpm) < Math.abs(aday.bpm - hedef.bpm);
      parcalar.push(p.fark < 0.5 ? 'tempo birebir aynı' : `tempo ${Math.round(p.fark * 10) / 10} BPM farkla${yarim ? ' (yarım tempo)' : ''}`);
    }
    if (p.uyum === 'ayni') parcalar.push(`ton aynı (${aday.camelot})`);
    else if (p.uyum === 'komsu') parcalar.push(`ton uyumlu (${aday.camelot})`);
    else if (p.uyum === 'uyumsuz') parcalar.push(`ton farklı (${aday.camelot}), geçişte efekt gerekebilir`);
    else parcalar.push('ton bilgisi yok');
    if (aday.turler.length) parcalar.push(aday.turler.slice(0, 2).join(', '));
    return parcalar.join(' · ');
  }

  // Adaylardan en uygun `adet` şarkı: tekrarsız, kullanılmışlar hariç, sanatçı başına en çok 2.
  function referansSec(adaylar, hedef, haric, adet) {
    const sinir = adet || 10;
    const cikar = new Set((haric || []).map(String));
    const gorulen = new Set();
    const puanli = [];
    for (const a of adaylar || []) {
      const anahtar = sarkiAnahtari(a.baslik, a.sanatci);
      if (cikar.has(anahtar) || gorulen.has(anahtar)) continue;
      gorulen.add(anahtar);
      const p = puanla(a, hedef);
      puanli.push({ ...a, anahtar, puan: p.puan, tonUyumu: p.uyum, tempoFarki: p.fark, neden: neden(a, hedef, p) });
    }
    puanli.sort((x, y) => y.puan - x.puan || (y.yil || 0) - (x.yil || 0));
    const sanatciSay = new Map();
    const secilen = [];
    for (const a of puanli) {
      const s = sade(a.sanatci);
      if ((sanatciSay.get(s) || 0) >= 2) continue;
      sanatciSay.set(s, (sanatciSay.get(s) || 0) + 1);
      secilen.push(a);
      if (secilen.length >= sinir) break;
    }
    return secilen;
  }

  // Bir referansı dinlemek için arama bağlantıları (API anahtarı gerektirmez).
  function dinlemeLinkleri(baslik, sanatci) {
    const q = encodeURIComponent(`${sanatci} ${baslik}`.trim());
    return {
      spotify: `https://open.spotify.com/search/${q}`,
      youtube: `https://www.youtube.com/results?search_query=${q}`
    };
  }

  const api = {
    tempoBul, tonBul, enerjiBloklari, onemliAnlar, enerjiOzeti, zaman,
    tonCamelot, openKeyCamelot, camelotParametre, tonlariEsle, uyumluTonlar, tonUyumu,
    sarkiAnahtari, germe, germeEnYakin, tempoFarki, getsongbpmCoz, deezerCoz, turEslesir, puanla, referansSec, dinlemeLinkleri
  };

  if (typeof window !== 'undefined') window.DerinSarkiAvcisi = api;
  if (typeof module !== 'undefined') module.exports = api;
})();
