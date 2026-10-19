#!/usr/bin/env node
// Görev 3 — Antrenör proje müziği + DJ dosyaları: Supabase Storage → Cloudflare R2 taşınması.
// Plan: docs/superpowers/plans/2026-10-18-proje-muzik-r2-gecis.md (Görev 3 ve 5)
//
// Koşu biçimleri (yerel):
//   node tests/proje-depo-tasimasi.js                      # kuru-çalıştırma: yalnız listeler + istatistik yazar, hiçbir şey değiştirmez
//   node tests/proje-depo-tasimasi.js --uygula             # gerçek kopyalama (Supabase → R2 PUT)
//   node tests/proje-depo-tasimasi.js --dogrula [--sha]    # Supabase ↔ R2 karşılaştırması (boyut; --sha ile SHA-256)
//   node tests/proje-depo-tasimasi.js --temizle --uygula   # 30 gün penceresi sonrası: doğrulama yeşilse Supabase kovalarını boşaltır
//
// Gerekli ortam değişkenleri (yalnız koşu anında terminalden verilir; depoya YAZILMAZ):
//   SUPABASE_SERVICE_KEY   (service_role — gizli kovaları okumak/silmek için)
//   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET
//   (Supabase URL secret değildir; tarayıcı config.js'ten okunur.)

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

// ---------- Kapsam (Görev 3 kuralı) ----------

// Yalnız bu iki kova taşınır. feedback-audio ve project-voice-notes Supabase'de
// kalır (düşük boyut); onların yükleme/okuma politikalarına hiçbir şey değişmez.
const KAPSAM_KOVALARI = ['project-audio', 'dj-audio'];

// ---------- Saf yardımcılar (tests tarafından denenir) ----------

// Komut satırı bayraklarını güvenli biçime çevirir. Varsayılan: kuru-çalıştırma.
function argTopla(argv) {
  const bayraklar = new Set(argv || []);
  const bilinen = ['--uygula', '--dogrula', '--temizle', '--sha'];
  const bilinmeyen = [...bayraklar].filter(b => !bilinen.includes(b));
  if (bilinmeyen.length) throw new Error('Bilinmeyen bayrak: ' + bilinmeyen.join(', '));
  const temizle = bayraklar.has('--temizle');
  const uygula = bayraklar.has('--uygula');
  const dogrula = bayraklar.has('--dogrula');
  if (temizle && !uygula) {
    throw new Error('--temizle bayrağı yalnız --uygula ile birlikte kullanılabilir (silme için ek güvenlik).');
  }
  if (dogrula && uygula) throw new Error('--uygula ve --dogrula aynı koşuda birlikte kabul edilmez; önce kopyala, sonra doğrula.');
  const mod = dogrula ? 'dogrula' : (uygula ? 'uygula' : 'plan');
  return { mod, uygula, dogrula, temizle, sha: bayraklar.has('--sha') };
}

// Kova adı → R2 tam anahtarı. Harita doğrudan r2-depo.js'ten gelir (tek kaynak).
function r2Anahtari(kova, yol) {
  if (!KAPSAM_KOVALARI.includes(kova)) {
    throw new Error(`'${kova}' kovası taşıma kapsamı dışında (yalnız ${KAPSAM_KOVALARI.join(', ')}).`);
  }
  if (!yol || yol.includes('..') || yol.startsWith('/') || yol.includes('\\')) {
    throw new Error(`Geçersiz dosya yolu: ${yol}`);
  }
  const { ONEK } = require('../r2-depo.js');
  const onek = ONEK[kova];
  if (!onek) throw new Error(`${kova} için r2-depo haritasında önek yok`);
  return onek + yol;
}

// Manifest (işlem durumu) — lokal dosya, git'e girmez (.gitignore'da).
function manifestYaz(dosya, kayitlar) {
  fs.writeFileSync(dosya, JSON.stringify({ yazilma: new Date().toISOString(), kayitlar }, null, 1));
}

function manifestOku(dosya) {
  try {
    const veri = JSON.parse(fs.readFileSync(dosya, 'utf8'));
    if (Array.isArray(veri.kayitlar)) return veri.kayitlar;
    if (Array.isArray(veri)) return veri;
    return [];
  } catch (e) {
    return [];
  }
}

// Gerekli değişkenlerin denetimi; eksik varsa Türkçe liste döner, yeterse null.
function eksikDegiskenler(env) {
  const gerekli = ['SUPABASE_SERVICE_KEY', 'R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET'];
  const eksik = gerekli.filter(ad => !env[ad]);
  if (!eksik.length) return null;
  // Secret değeri ASLA yazdırmayız; yalnız adını listeleriz.
  return 'Eksik ortam değişkenleri: ' + eksik.join(', ') +
    '\nÖrnek: SUPABASE_SERVICE_KEY=... R2_ACCOUNT_ID=... node tests/proje-depo-tasimasi.js';
}

// Supabase projesinin URL'i tarayıcı config.js'ten okunur (publishable bilgi, secret değil).
function supabaseUrl(kokDir) {
  const envUrl = (process.env.SUPABASE_URL || '').trim();
  if (envUrl) return envUrl;
  const icerik = fs.readFileSync(path.join(kokDir, 'config.js'), 'utf8');
  const eslesme = icerik.match(/supabaseUrl:\s*'([^']+)'/);
  if (!eslesme) throw new Error('config.js içinde supabaseUrl bulunamadı');
  return eslesme[1];
}

const mb = bayt => (bayt / 1048576).toFixed(2) + ' MB';

// ---------- R2 imzalama (api/r2-yukleme-izni.js ile aynı yaklaşım) ----------

const hmac = (key, str) => crypto.createHmac('sha256', key).update(str, 'utf8').digest();
const sha256hex = str => crypto.createHash('sha256').update(str, 'utf8').digest('hex');
// RFC 3986: encodeURIComponent'in kaçırdığı karakterleri de kodlar
const enc = s => encodeURIComponent(s).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());

// Kısa ömürlü imzalı R2 adresi (PUT/GET/HEAD). Gövde imzası UNSIGNED: R2, önceden
// imzalanmış isteklerde gövde karma zorunluluğu uygulamaz.
function r2ImzaliAdres(env, yontem, anahtar) {
  const host = `${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
  const bolge = 'auto', servis = 's3';
  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
  const gun = amzDate.slice(0, 8);
  const kapsam = `${gun}/${bolge}/${servis}/aws4_request`;

  // Ham S3 ucunda yol /kova/anahtar şeklindedir.
  const yol = '/' + enc(env.R2_BUCKET) + '/' + anahtar.split('/').map(enc).join('/');

  const sorgu = [
    ['X-Amz-Algorithm', 'AWS4-HMAC-SHA256'],
    ['X-Amz-Credential', `${env.R2_ACCESS_KEY_ID}/${kapsam}`],
    ['X-Amz-Date', amzDate],
    ['X-Amz-Expires', '600'],
    ['X-Amz-SignedHeaders', 'host']
  ].sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([k, v]) => `${enc(k)}=${enc(v)}`).join('&');

  const kanonik = [yontem, yol, sorgu, `host:${host}\n`, 'host', 'UNSIGNED-PAYLOAD'].join('\n');
  const imzalanacak = ['AWS4-HMAC-SHA256', amzDate, kapsam, sha256hex(kanonik)].join('\n');

  const kGun = hmac('AWS4' + env.R2_SECRET_ACCESS_KEY, gun);
  const kBolge = hmac(kGun, bolge);
  const kServis = hmac(kBolge, servis);
  const kImza = hmac(kServis, 'aws4_request');
  const imza = crypto.createHmac('sha256', kImza).update(imzalanacak, 'utf8').digest('hex');

  return `https://${host}${yol}?${sorgu}&X-Amz-Signature=${imza}`;
}

// R2 listeleme (ListObjectsV2) için başlık-imzalı istek başlıkları.
// Presigned sorgu kurulumunu gerektirmediği için bu yol daha az hata yüzeylidir.
function r2ListeBasliklari(env, yontem, yol, sorguMetni) {
  const host = `${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
  const bolge = 'auto', servis = 's3';
  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
  const gun = amzDate.slice(0, 8);
  const kapsam = `${gun}/${bolge}/${servis}/aws4_request`;

  const sorgu = sorguMetni.split('&').map(x => x.split('=').map(k => decodeURIComponent(k)))
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([k, v]) => `${enc(k)}=${enc(v)}`).join('&');

  const imzaliBasliklar = 'host;x-amz-content-sha256;x-amz-date';
  const kanonik = [yontem, yol, sorgu,
    `host:${host}\nx-amz-content-sha256:UNSIGNED-PAYLOAD\nx-amz-date:${amzDate}\n`,
    imzaliBasliklar, 'UNSIGNED-PAYLOAD'].join('\n');
  const imzalanacak = ['AWS4-HMAC-SHA256', amzDate, kapsam, sha256hex(kanonik)].join('\n');

  const kGun = hmac('AWS4' + env.R2_SECRET_ACCESS_KEY, gun);
  const kBolge = hmac(kGun, bolge);
  const kServis = hmac(kBolge, servis);
  const kImza = hmac(kServis, 'aws4_request');
  const imza = crypto.createHmac('sha256', kImza).update(imzalanacak, 'utf8').digest('hex');

  return {
    'x-amz-content-sha256': 'UNSIGNED-PAYLOAD',
    'x-amz-date': amzDate,
    'Authorization': `AWS4-HMAC-SHA256 Credential=${env.R2_ACCESS_KEY_ID}/${kapsam}, SignedHeaders=${imzaliBasliklar}, Signature=${imza}`
  };
}

// ---------- Supabase Storage (service key) ----------

function sbBasliklar(env) {
  return { apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}` };
}

// Bir klasörü (öneki) sayfalar; klasör işaretçilerine iner. Döner: [{yol, boyut}].
async function sbListe(sUrl, env, kova, onek) {
  const Adres = `${sUrl}/storage/v1/object/list/${kova}`;
  const cikti = [];
  let offset = 0;
  for (;;) {
    const yanit = await fetch(Adres, {
      method: 'POST', headers: { ...sbBasliklar(env), 'content-type': 'application/json' },
      body: JSON.stringify({ prefix: onek, limit: 1000, offset, sortBy: { column: 'name', order: 'asc' }, delimiter: '/' })
    });
    if (!yanit.ok) throw new Error(`Supabase liste hatası (${kova}/${onek}): ${yanit.status} ${await yanit.text().catch(() => '')}`);
    const sayfa = await yanit.json();
    for (const kayit of sayfa) {
      if (kayit.id === null) {
        // id'si null olan satırlar klasör işaretçisidir; içine iniyoruz.
        cikti.push(...await sbListe(sUrl, env, kova, onek + kayit.name + '/'));
      } else {
        cikti.push({ yol: onek + kayit.name, boyut: kayit.metadata ? kayit.metadata.size : kayit.size });
      }
    }
    if (sayfa.length < 1000) break;
    offset += 1000;
  }
  return cikti;
}

async function sbIndir(sUrl, env, kova, yol) {
  const r = await fetch(`${sUrl}/storage/v1/object/${kova}/${yol.split('/').map(enc).join('/')}`, { headers: sbBasliklar(env) });
  if (!r.ok) throw new Error(`Supabase indirme hatası (${kova}/${yol}): ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

async function sbSil(sUrl, env, kova, yol) {
  const r = await fetch(`${sUrl}/storage/v1/object/${kova}/${yol.split('/').map(enc).join('/')}`, { method: 'DELETE', headers: sbBasliklar(env) });
  if (!r.ok && r.status !== 404) throw new Error(`Supabase silme hatası (${kova}/${yol}): ${r.status}`);
}

// ---------- R2 işlemleri ----------

async function r2Boyut(env, anahtar) {
  const r = await fetch(r2ImzaliAdres(env, 'HEAD', anahtar), { method: 'HEAD' });
  if (!r.ok) return null; // dosya yok
  const boyut = Number(r.headers.get('content-length'));
  return Number.isFinite(boyut) ? boyut : null;
}

async function r2Yukle(env, anahtar, baytlar) {
  const r = await fetch(r2ImzaliAdres(env, 'PUT', anahtar), { method: 'PUT', body: baytlar });
  if (!r.ok) throw new Error(`R2 yükleme hatası (${anahtar}): ${r.status} ${await r.text().catch(() => '')}`);
}

// R2 tarafında anahtar yığını: ListObjectsV2, önek sayfalı.
async function r2Liste(env, onek) {
  const cikti = [];
  let token = null;
  for (;;) {
    const yok = { 'list-type': '2', 'max-keys': '1000', prefix: onek };
    if (token) yok['continuation-token'] = token;
    const sorguMetni = Object.entries(yok).map(([k, v]) => `${enc(k)}=${enc(v)}`).join('&');
    const host = `${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
    const yol = '/' + enc(env.R2_BUCKET) + '/';
    const r = await fetch(`https://${host}${yol}?${sorguMetni}`, { headers: r2ListeBasliklari(env, 'GET', yol, sorguMetni) });
    if (!r.ok) throw new Error(`R2 liste hatası: ${r.status} ${await r.text().catch(() => '')}`);
    const xml = await r.text();
    for (const eslesme of xml.matchAll(/<Key>([^<]+)<\/Key>[\s\S]*?<Size>(\d+)<\/Size>/g)) {
      cikti.push({ anahtar: decodeURIComponent(eslesme[1]), boyut: Number(eslesme[2]) });
    }
    const sonraki = xml.match(/<NextContinuationToken>([^<]+)<\/NextContinuationToken>/);
    if (!sonraki) break;
    token = sonraki[1];
  }
  return cikti;
}

// ---------- Ana akış ----------

async function main() {
  const kokDir = path.join(__dirname, '..');
  const mod = argTopla(process.argv.slice(2));
  const env = process.env;
  const hata = eksikDegiskenler(env);
  if (hata) { console.error(hata); process.exit(1); }
  const sUrl = supabaseUrl(kokDir);
  const manifestDosya = path.join(__dirname, 'tasima-durumu.json');

  // Kaynak listeler (her modda gerekir).
  const kaynak = {};
  let toplamBayt = 0, toplamDosya = 0;
  for (const kova of KAPSAM_KOVALARI) {
    const liste = await sbListe(sUrl, env, kova, '');
    kaynak[kova] = liste;
    toplamDosya += liste.length;
    toplamBayt += liste.reduce((t, k) => t + (k.boyut || 0), 0);
  }
  console.log('=== Kaynak (Supabase) ===');
  for (const kova of KAPSAM_KOVALARI) {
    const bayt = kaynak[kova].reduce((t, k) => t + (k.boyut || 0), 0);
    console.log(`${kova}: ${kaynak[kova].length} dosya, ${mb(bayt)}`);
    for (const kayit of kaynak[kova].slice(0, 5)) console.log(`   örn. ${kayit.yol} (${mb(kayit.boyut || 0)})`);
  }
  console.log(`TOPLAM: ${toplamDosya} dosya, ${mb(toplamBayt)}`);

  // --- Kuru-çalıştırma: hiçbir şey değiştirmez ---
  if (mod.mod === 'plan') {
    console.log('Kuru-çalıştırma tamam: hiçbir dosya yazılmadı/silinmedi.');
    console.log('Kopyalamak için: --uygula   | Doğrulamak için: --dogrula');
    return;
  }

  if (mod.mod === 'uygula') {
    const kayitlar = [];
    let kopya = 0, atlanan = 0;
    const hatalar = [];
    for (const kova of KAPSAM_KOVALARI) {
      for (const kayit of kaynak[kova]) {
        const anahtar = r2Anahtari(kova, kayit.yol);
        try {
          const mevcut = await r2Boyut(env, anahtar);
          if (mevcut !== null && mevcut === kayit.boyut) {
            // İdempotent: aynı boyutta zaten varsa tekrar kopyalamaz.
            atlanan++;
            kayitlar.push({ kova, yol: kayit.yol, anahtar, boyut: kayit.boyut, durum: 'atlandi' });
            manifestYaz(manifestDosya, kayitlar);
            continue;
          }
          const baytlar = await sbIndir(sUrl, env, kova, kayit.yol);
          if (baytlar.length !== kayit.boyut) {
            throw new Error(`Supabase boyutu (${kayit.boyut}) akış boyutuyla (${baytlar.length}) uyuşmadı`);
          }
          await r2Yukle(env, anahtar, baytlar);
          kopya++;
          kayitlar.push({ kova, yol: kayit.yol, anahtar, boyut: baytlar.length, durum: 'kopyaladi' });
          // Her adımda yaz: betik ortada bozulsa kalan koşu idempotent kaldığı yerden sürer.
          manifestYaz(manifestDosya, kayitlar);
        } catch (e) {
          const satir = `${kova}/${kayit.yol}: ${e.message}`;
          hatalar.push(satir);
          console.error('HATA', satir);
        }
      }
    }
    manifestYaz(manifestDosya, kayitlar);
    console.log('=== Kopyalama sonucu ===');
    console.log(`kopyalandı: ${kopya}, zaten vardı (atlandı): ${atlanan}, hatalı: ${hatalar.length}`);
    console.log(`Durum dosyası: ${manifestDosya}`);
    if (hatalar.length) {
      console.log('HATALI LİSTE:');
      hatalar.forEach(h => console.log(' -', h));
      process.exit(1);
    }
    console.log('Doğrulama koşun: node tests/proje-depo-tasimasi.js --dogrula');

    // --- Temizlik (yalnız --temizle ile; 30 gün penceresi sonrası) ---
    if (mod.temizle) {
      console.log('\n!!! TEMİZLE MODU: Supabase kaynak kovalarındaki dosyalar SİLİNECEK.');
      console.log('Bu betik silmeden önce R2 tarafını tek tek boyutla denetler; herhangi');
      console.log('bir eksik/farklı dosya varsa silmeyi reddeder.');
      // Safeguard: tam doğrulama (boyut) R2'de her dosya için koşulur.
      let tamam = 0;
      for (const kova of KAPSAM_KOVALARI) {
        for (const kayit of kaynak[kova]) {
          const anahtar = r2Anahtari(kova, kayit.yol);
          const mevcut = await r2Boyut(env, anahtar);
          if (mevcut === null || mevcut !== kayit.boyut) {
            console.error(`SİLME İPTAL: R2'de aynı boyutta yok: ${anahtar}`);
            process.exit(1);
          }
          tamam++;
        }
      }
      console.log(`Denetim yeşil: ${tamam} dosya R2'de Supabase ile aynı boyutta.`);
      // İnsan onayı: kullanıcı "SIL" yazmalı (yazıyla; tek harflik Enter yanlışlığını Önler).
      process.stdout.write('Supabase silmesi için "SIL" (büyük harfle) yazıp Enter: ');
      const cevap = await new Promise(ara => {
        const g = process.stdin;
        g.setEncoding('utf8');
        g.once('data', veri => { g.pause(); ara(String(veri).trim()); });
      });
      if (cevap !== 'SIL') { console.log('Silme yapılmadı.'); return; }
      let sil = 0;
      const silmeHatalar = [];
      for (const kova of KAPSAM_KOVALARI) {
        for (const kayit of kaynak[kova]) {
          try { await sbSil(sUrl, env, kova, kayit.yol); sil++; }
          catch (e) { silmeHatalar.push(`${kova}/${kayit.yol}: ${e.message}`); }
        }
      }
      console.log(`Supabase'den silundı: ${sil}, hata: ${silmeHatalar.length}`);
      if (silmeHatalar.length) { silmeHatalar.forEach(h => console.log(' -', h)); process.exit(1); }
      console.log('TEMİZLE TAMAM: kota artık bu kovalardan kalktı.');
    }
    return;
  }

  if (mod.mod === 'dogrula') {
    let eksik = 0, boyutUyusmadi = 0, shaUyusmadi = 0;
    const hatalar = [];
    for (const kova of KAPSAM_KOVALARI) {
      const haritasi = new Map((await r2Liste(env, require('../r2-depo.js').ONEK[kova])).map(r => [r.anahtar, r.boyut]));
      for (const kayit of kaynak[kova]) {
        const anahtar = r2Anahtari(kova, kayit.yol);
        const r2Boyutu = haritasi.get(anahtar);
        if (r2Boyutu === undefined) { eksik++; hatalar.push(`R2 tarafında YOK: ${anahtar}`); continue; }
        if (r2Boyutu !== kayit.boyut) { boyutUyusmadi++; hatalar.push(`BOYUT farklı: ${anahtar} sb=${kayit.boyut} r2=${r2Boyutu}`); }
        if (mod.sha) {
          const sbThumb = crypto.createHash('sha256').update(await sbIndir(sUrl, env, kova, kayit.yol)).digest('hex');
          const r2Donen = await fetch(r2ImzaliAdres(env, 'GET', anahtar));
          if (!r2Donen.ok) { hatalar.push(`R2 GET hatası: ${anahtar} ${r2Donen.status}`); continue; }
          const r2Thumb = crypto.createHash('sha256').update(Buffer.from(await r2Donen.arrayBuffer())).digest('hex');
          if (sbThumb !== r2Thumb) { shaUyusmadi++; hatalar.push(`SHA-256 farklı: ${anahtar}`); }
        }
      }
    }
    console.log('=== Doğrulama sonucu ===');
    console.log(`eksik: ${eksik}, boyut farklı: ${boyutUyusmadi}, SHA farklı: ${shaUyusmadi}`);
    if (hatalar.length) {
      hatalar.forEach(h => console.log(' -', h));
      process.exit(1);
    }
    console.log('DOĞRULAMA YEŞİL: taşınan her dosya R2 tarafında Supabase ile aynı (boyut' + (mod.sha ? ' + SHA-256)' : ')') + ' doğrulandı.');
    return;
  }

  throw new Error('Tanınmayan mod: ' + mod.mod);
}

if (require.main === module) {
  main().catch(e => { console.error('Beklenmeyen hata:', e); process.exit(1); });
}

// Ağsız test koşuları için saf yardımcılar dışa açık.
module.exports = { argTopla, r2Anahtari, manifestYaz, manifestOku, eksikDegiskenler, KAPSAM_KOVALARI };
