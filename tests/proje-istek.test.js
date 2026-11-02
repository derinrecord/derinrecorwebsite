// Proje iste (2 Kasım): antrenör Projelerim'den bağlantı ve dosya (ses, video, PDF, resim)
// göndererek yeni proje ister. Sunucu, antrenörün YALNIZ kendi proje klasörüne yazmasına izin verir.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const oku = d => fs.readFileSync(path.join(__dirname, '..', d), 'utf8');
const { yetki } = require('../api/r2-yukleme-izni.js');

const BEN = '90658be3-f11a-4c03-bb4e-cf83426e0a97', BASKA = '5b263d0a-a8e7-4ff8-88d1-e091585aaf70';

test('yönetici her izinli klasöre yükler ve siler', () => {
  for (const key of ['radyo/a.mp3', 'demo/x.wav', `proje/${BASKA}/p.wav`]) {
    assert.equal(yetki('yukle', key, true, null), null, key);
    assert.equal(yetki('sil', key, true, null), null, key);
  }
});

test('antrenör yalnız kendi proje klasörüne yükler ve oradan siler', () => {
  assert.equal(yetki('yukle', `proje/${BEN}/istek-1.mp4`, false, BEN), null);
  assert.equal(yetki('sil', `proje/${BEN}/istek-1.mp4`, false, BEN), null);
  assert.equal(yetki('yukle', `proje/${BASKA}/x.wav`, false, BEN).kod, 403);
  assert.equal(yetki('sil', `proje/${BASKA}/x.wav`, false, BEN).kod, 403);
  for (const key of ['radyo/a.mp3', 'demo/x.wav', 'kapak/k.jpg', 'anons/a.mp3', 'dj/d.wav']) assert.equal(yetki('yukle', key, false, BEN).kod, 403, key);
  assert.equal(yetki('yukle', `proje/${BEN}`, false, BEN).kod, 403); // klasörün kendisi değil, içindeki dosya
});

test('oturumu doğrulanamayan kişi hiçbir şey yazamaz', () => {
  assert.equal(yetki('yukle', `proje/${BEN}/a.wav`, false, null).kod, 401);
});

test('okuma kuralı değişmedi: antrenör yalnız kendi proje klasörünü okur, DJ kapalı', () => {
  assert.equal(yetki('oku', `proje/${BEN}/a.wav`, false, BEN), null);
  assert.equal(yetki('oku', `proje/${BASKA}/a.wav`, false, BEN).kod, 403);
  assert.equal(yetki('oku', 'dj/a.wav', false, BEN).kod, 403);
  assert.equal(yetki('oku', 'radyo/a.mp3', true, null).kod, 403);
});

test('SQL: iki alan eklenir, RLS politikalarına dokunulmaz', () => {
  const s = oku('supabase/proje-istek.sql');
  assert.match(s, /add column if not exists istek_baglanti text/);
  assert.match(s, /add column if not exists istek_ekleri jsonb not null default '\[\]'::jsonb/);
  assert.doesNotMatch(s, /create policy|drop policy|alter policy/i);
});

// ---------- Saf yardımcılar (proje-istek.js) ----------
const P = require('../proje-istek.js');

test('dosya türü: ses, video, pdf, resim; başkası reddedilir', () => {
  assert.equal(P.tur({ name: 'a.WAV', type: 'audio/wav' }), 'ses');
  assert.equal(P.tur({ name: 'a.mp3', type: '' }), 'ses');
  assert.equal(P.tur({ name: 'k.mov', type: 'video/quicktime' }), 'video');
  assert.equal(P.tur({ name: 'k.mp4', type: '' }), 'video');
  assert.equal(P.tur({ name: 'liste.pdf', type: 'application/pdf' }), 'pdf');
  assert.equal(P.tur({ name: 'foto.HEIC', type: '' }), 'resim');
  assert.equal(P.tur({ name: 'foto.jpg', type: 'image/jpeg' }), 'resim');
  assert.equal(P.tur({ name: 'virus.exe', type: 'application/x-msdownload' }), null);
  assert.equal(P.tur({ name: 'x.zip', type: 'application/zip' }), null);
});

test('bağlantı: yalnız http(s), boşluk kırpılır, www eksikse https eklenir', () => {
  assert.equal(P.baglanti('  https://youtu.be/abc  '), 'https://youtu.be/abc');
  assert.equal(P.baglanti('www.youtube.com/watch?v=1'), 'https://www.youtube.com/watch?v=1');
  assert.equal(P.baglanti('open.spotify.com/track/1'), 'https://open.spotify.com/track/1');
  assert.equal(P.baglanti(''), null);
  assert.equal(P.baglanti('javascript:alert(1)'), false);
  assert.equal(P.baglanti('merhaba dünya'), false);
});

test('denetim: ad zorunlu; bağlantı ya da dosyadan en az biri; en çok 10 dosya; dosya başına 500 MB', () => {
  const dosya = (name, size = 1000, type = '') => ({ name, size, type });
  assert.match(P.denetle({ ad: ' ', baglanti: 'https://a.co', dosyalar: [] }).hata, /Proje adı/);
  // 2 Kasım: bağlantı ve dosya isteğe bağlı (Derin); yalnız proje adı zorunlu.
  assert.equal(P.denetle({ ad: 'Kuğu', baglanti: '', dosyalar: [] }).hata, undefined);
  assert.match(P.denetle({ ad: 'Kuğu', baglanti: 'kötü bağlantı', dosyalar: [] }).hata, /bağlantı geçerli değil/);
  assert.match(P.denetle({ ad: 'Kuğu', baglanti: '', dosyalar: [dosya('a.exe')] }).hata, /a\.exe/);
  assert.match(P.denetle({ ad: 'Kuğu', baglanti: '', dosyalar: Array.from({ length: 11 }, (_, i) => dosya(i + '.mp3')) }).hata, /en çok 10/);
  assert.match(P.denetle({ ad: 'Kuğu', baglanti: '', dosyalar: [dosya('v.mp4', 501 * 1024 * 1024)] }).hata, /500 MB/);
  const iyi = P.denetle({ ad: ' Kuğu Gölü ', baglanti: 'youtu.be/x', dosyalar: [dosya('a.mp3'), dosya('k.pdf')] });
  assert.equal(iyi.hata, undefined);
  assert.equal(iyi.ad, 'Kuğu Gölü');
  assert.equal(iyi.baglanti, 'https://youtu.be/x');
});

test('R2 yolu: antrenörün kendi klasörü, güvenli dosya adı', () => {
  const y = P.yol('U1', 'P1', 2, 'Koreografi Videosu (son).MOV');
  assert.match(y, /^U1\/P1-istek-2-[a-z0-9-]+\.mov$/);
  assert.ok(!y.includes(' ') && !y.includes('('));
  assert.match(P.yol('U1', 'P1', 0, 'çiçek.pdf'), /^U1\/P1-istek-0-cicek\.pdf$/);
});

test('Telegram notu: istek özeti (branş, açıklama, bağlantı, dosyalar)', () => {
  const n = P.notMetni({ brans: 'ritmik', aciklama: '2:30 sürsün', baglanti: 'https://youtu.be/x', dosyalar: [{ name: 'a.mp3' }, { name: 'k.pdf' }] });
  assert.match(n, /^📩 YENİ PROJE İSTEĞİ/);
  assert.match(n, /Branş: RİTMİK/);
  assert.match(n, /2:30 sürsün/);
  assert.match(n, /https:\/\/youtu\.be\/x/);
  assert.match(n, /Dosyalar: a\.mp3, k\.pdf/);
});

test('istek kutusu: bağlantı güvenli, dosyalar türüne göre, kaçışlı', () => {
  const h = P.kutuHtml({ istek_baglanti: 'https://youtu.be/x"><script>', istek_ekleri: [{ yol: 'U/a.pdf', ad: '<b>liste</b>.pdf', tur: 'pdf', boyut: 2048 }] });
  assert.match(h, /href="https:\/\/youtu\.be\/x&quot;&gt;&lt;script&gt;"/);
  assert.match(h, /rel="noopener noreferrer"/);
  assert.match(h, /data-istek-ek="U\/a\.pdf"/);
  assert.match(h, /&lt;b&gt;liste&lt;\/b&gt;\.pdf/);
  assert.equal(P.kutuHtml({ istek_baglanti: 'javascript:alert(1)', istek_ekleri: [] }), '');
  assert.equal(P.kutuHtml({}), '');
});

test('Projelerim: antrenöre PROJE İSTE formu; yönetici eski panelini görür; istek kutusu kartta', () => {
  const k = oku('projects.js');
  assert.match(k, /admin\?'YENİ PROJE':'PROJE İSTE'/);
  assert.match(k, /if\(!admin&&PI\)return istekPanel\(\)/);
  assert.match(k, /istek_baglanti:v\.baglanti/);
  assert.match(k, /update\(\{istek_ekleri:ekler\}\)/);
  assert.match(k, /kind:'note',\s*\n?\s*body:PI\.notMetni/);
  assert.match(k, /PI\.kutuHtml\(p\)/);
  assert.match(k, /korumaliAdres\('project-audio',b\.dataset\.istekEk\)/);
  assert.match(k, /SUTUNLAR='[^']*istek_baglanti,istek_ekleri'/);
  const h = oku('my-projects.html');
  assert.ok(h.indexOf('proje-istek.js?v=') > -1 && h.indexOf('proje-istek.js?v=') < h.indexOf('projects.js?v='));
});

test('A tasarımı: branş çipleri, sürükle-bırak dosya alanı, dosya listesi kaldırılabilir; beyaz yerli düğme gizli', () => {
  const k = oku('projects.js');
  assert.match(k, /name="istek-brans"/);
  assert.match(k, /class="istek-birak"/);
  assert.match(k, /data-istek-kaldir/);
  assert.match(k, /istekDosyalari/);
  const h = oku('my-projects.html');
  assert.match(h, /\.istek-birak input\[type=file\]\{[^}]*(position:absolute|display:none)/);
});
