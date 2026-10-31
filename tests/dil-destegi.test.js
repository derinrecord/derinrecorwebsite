// TR/EN dil desteği: tanıtım sayfalarındaki her metin anahtarının İngilizce
// karşılığı olmak zorunda. Eksik anahtar siteyi bozmaz (metin Türkçe kalır)
// ama ziyaretçiye yarım çeviri gösterir; bu test onu yakalar.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const KOK = path.join(__dirname, '..');
const oku = d => fs.readFileSync(path.join(KOK, d), 'utf8');

const URETIM_SAYFALARI = execFileSync('git', ['ls-files', '*.html'], {
  cwd: KOK,
  encoding: 'utf8'
}).trim().split('\n').filter(Boolean).filter(dosya =>
  !dosya.startsWith('tests/') && !dosya.startsWith('graphify-out/') && !dosya.startsWith('app/') // app/: uygulama kabuğu, yayına girmez
);

// Açık anahtarlı ve otomatik mod sayfaları depodaki gerçek üretim envanterinden türetilir.
const ANAHTARLI_SAYFALAR = URETIM_SAYFALARI.filter(sayfa => /data-i18n(?:=|-)/.test(oku(sayfa)));
const OTOMATIK_SAYFALAR = URETIM_SAYFALARI.filter(sayfa => /data-dil-otomatik/.test(oku(sayfa)));

// Bu anahtarlar HTML'de değil, JS içinden metin olarak çağrılır.
const DINAMIK = [
  'sd.hata', 'sd.gonderiliyor', 'sd.tesekkur', 'sd.basarisiz',
  'hesap.hesabim', 'auth.sozlesme', 'auth.aydinlatma', 'auth.onay',
  'auth.yenidenGonder', 'auth.onayBekliyor', 'auth.sayacEtiket',
  'cf.alanlar', 'cf.gonderiliyor', 'cf.hata', 'cf.tesekkur'
];

const dilKaynagi = oku('dil.js');
const authKaynagi = oku('auth.js');
const enBlok = dilKaynagi.slice(dilKaynagi.indexOf('const EN = {'), dilKaynagi.indexOf('const METIN = {'));
const metinBlok = dilKaynagi.slice(dilKaynagi.indexOf('const METIN = {'), dilKaynagi.indexOf('const TR = {'));

const sozluk = new Map();
enBlok.replace(/^ {4}'([A-Za-z0-9.\-]+)':\s*(.*),\s*$/gm, (satir, anahtar, ham) => {
  const deger = ham.replace(/^['"]|['"]$/g, '');
  sozluk.set(anahtar, deger);
  return satir;
});

test('İngilizce sözlük okunabiliyor ve boş değer içermiyor', () => {
  assert.ok(sozluk.size > 80, 'sözlük beklenenden küçük: ' + sozluk.size);
  sozluk.forEach((deger, anahtar) => {
    assert.ok(deger.trim().length > 0, anahtar + ' boş olmamalı');
  });
});

test('sayfalardaki her data-i18n anahtarının İngilizcesi var', () => {
  const eksik = [];
  ANAHTARLI_SAYFALAR.forEach(sayfa => {
    const html = oku(sayfa);
    const bulunan = html.matchAll(/data-i18n(?:-etiket|-yerine|-alt)?="([^"]+)"/g);
    for (const [, anahtar] of bulunan) {
      if (!sozluk.has(anahtar)) eksik.push(sayfa + ' → ' + anahtar);
    }
  });
  assert.deepEqual(eksik, [], 'eksik çeviri: ' + eksik.join(', '));
});

test('sözlükte kullanılmayan anahtar kalmaz', () => {
  const kullanilan = new Set(DINAMIK);
  URETIM_SAYFALARI.forEach(sayfa => {
    const html = oku(sayfa);
    for (const [, anahtar] of html.matchAll(/data-i18n(?:-etiket|-yerine|-alt)?="([^"]+)"/g)) {
      kullanilan.add(anahtar);
    }
  });
  // JS'ten çağrılan anahtarlar (sd.*, em.*, shell.*, cf.*) kaynak dosyalarda geçer.
  fs.readdirSync(KOK).filter(dosya => dosya.endsWith('.js')).forEach(dosya => {
    for (const [, anahtar] of oku(dosya).matchAll(/'([a-z][A-Za-z0-9]*\.[A-Za-z0-9.]+)'/g)) kullanilan.add(anahtar);
  });
  // JS'ten çağrılan enerji haritası bant adları tek tek de yazılabilir.
  const olu = [...sozluk.keys()].filter(anahtar => !kullanilan.has(anahtar));
  assert.deepEqual(olu, [], 'kullanılmayan anahtar: ' + olu.join(', '));
});

test('İngilizce değerlerde Türkçe harf kalmaz', () => {
  const turkce = /[ğĞıİşŞüÜöÖçÇ]/;
  const kalan = [];
  sozluk.forEach((deger, anahtar) => {
    const duz = deger.replace(/&[a-z]+;/g, ' ');
    if (turkce.test(duz)) kalan.push(anahtar + ': ' + deger);
  });
  assert.deepEqual(kalan, [], 'çevrilmemiş metin: ' + kalan.join(' | '));
});

test('bütün üretim sayfaları dil sözleşmesini taşır', () => {
  const eksik = URETIM_SAYFALARI.flatMap(sayfa => {
    const html = oku(sayfa);
    const hata = [];
    if (!/<html lang="tr"/.test(html)) hata.push('lang');
    if (!/data-baslik-en="[^"]+"/.test(html)) hata.push('data-baslik-en');
    if (!/<script src="dil\.js\?v=\d+" defer><\/script>/.test(html)) hata.push('dil.js');
    if (!/<link rel="stylesheet" href="dil\.css\?v=\d+"/.test(html)) hata.push('dil.css');
    if (!/data-dil-otomatik|data-i18n=/.test(html)) hata.push('çeviri modu');
    return hata.map(ad => `${sayfa} → ${ad}`);
  });
  assert.deepEqual(eksik, []);
});

test('meta açıklaması bulunan sayfalar İngilizce karşılığını taşır', () => {
  const eksik = URETIM_SAYFALARI.filter(sayfa => {
    const html = oku(sayfa);
    return /<meta name="description"/.test(html) && !/<meta name="description"[^>]*data-en="[^"]+"/.test(html);
  });
  assert.deepEqual(eksik, []);
});

test('her sayfa dil motorunu ve stilini yükler', () => {
  URETIM_SAYFALARI.forEach(sayfa => {
    const html = oku(sayfa);
    assert.match(html, /<script src="dil\.js\?v=\d+" defer><\/script>/, sayfa + ' dil.js yüklemeli');
    assert.match(html, /<link rel="stylesheet" href="dil\.css\?v=\d+"/, sayfa + ' dil.css yüklemeli');
  });
});

test('otomatik mod sayfaları işaretli ve İngilizce başlıklı', () => {
  OTOMATIK_SAYFALAR.forEach(sayfa => {
    const html = oku(sayfa);
    assert.match(html, /<html lang="tr" data-dil-otomatik/, sayfa + ' data-dil-otomatik taşımalı');
    assert.match(html, /data-baslik-en="[^"]+"/, sayfa + ' İngilizce başlık taşımalı');
  });
});

test('sayfalar Türkçe varsayılanı ve İngilizce başlığı korur', () => {
  ANAHTARLI_SAYFALAR.forEach(sayfa => {
    const html = oku(sayfa);
    assert.match(html, /<html lang="tr"/, sayfa + ' lang="tr" ile açılmalı');
    if (/<title>/.test(html)) {
      assert.match(html, /data-baslik-en="[^"]+"/, sayfa + ' İngilizce başlık taşımalı');
    }
  });
});

test('otomatik mod sözlüğü dolu ve İngilizce değerlerde Türkçe harf yok', () => {
  const kayitlar = [...metinBlok.matchAll(/^ {4}'((?:[^'\\]|\\.)+)':\s*'((?:[^'\\]|\\.)+)',?\s*$/gm)]
    .map(([, tr, en]) => [tr, en]);
  assert.ok(kayitlar.length > 100, 'otomatik sözlük beklenenden küçük: ' + kayitlar.length);
  const turkce = /[ğĞıİşŞüÜöÖçÇ]/;
  // Marka adı Türkçe yazımıyla kalır (DERİN RECORD); kalan Türkçe harf hata sayılır.
  const marka = /DERİN RECORD/g;
  const hatali = kayitlar
    .filter(([, en]) => turkce.test(en.replace(marka, 'DERIN RECORD')))
    .map(([tr]) => tr);
  assert.deepEqual(hatali, [], 'çevrilmemiş metin: ' + hatali.join(' | '));
  const ayni = kayitlar.filter(([tr, en]) => tr === en).map(([tr]) => tr);
  assert.deepEqual(ayni, [], 'kendine eşit çeviri: ' + ayni.join(' | '));
  const anahtarlar = kayitlar.map(([tr]) => tr);
  assert.equal(new Set(anahtarlar).size, anahtarlar.length, 'yinelenen anahtar var');
});

test('otomatik mod JS içerikli sayfalarda da çalışır', () => {
  assert.match(dilKaynagi, /MutationObserver/, 'sonradan basılan metinler gözlenmeli');
  assert.match(dilKaynagi, /document\.documentElement\.hasAttribute\('data-dil-otomatik'\)/, 'otomatik mod sayfa işaretinden okunmalı');
  assert.match(dilKaynagi, /cevir,/, 'DerinDil.cevir JS içinden erişilebilir olmalı');
  // Form değerleri Türkçe kalmalı: option metni değişmeden önce value sabitlenir.
  assert.match(dilKaynagi, /setAttribute\('value', kirp\)/);
});

test('hukuki metinler Türkçe bağlayıcı ve tam İngilizce bilgilendirme blokları taşır', () => {
  ['gizlilik-politikasi.html', 'cerez-politikasi.html', 'kullanici-sozlesmesi.html', 'aydinlatma-metni.html'].forEach(sayfa => {
    const html = oku(sayfa);
    assert.match(html, /class="hk-metin hk-tr"/, sayfa + ' Türkçe bağlayıcı blok taşımalı');
    assert.match(html, /class="hk-metin hk-en" lang="en" data-dil-yok/, sayfa + ' İngilizce bilgilendirme bloğu taşımalı');
    assert.match(html, /The Turkish version is legally binding/, sayfa + ' bağlayıcı sürümü açıklamalı');
    const trBaslangic = html.indexOf('<div class="hk-metin hk-tr">');
    const enBaslangic = html.indexOf('<div class="hk-metin hk-en"');
    const trBlok = html.slice(trBaslangic, enBaslangic);
    const enBlok = html.slice(enBaslangic, html.indexOf('</main>', enBaslangic));
    assert.equal((enBlok.match(/<h2>/g) || []).length, (trBlok.match(/<h2>/g) || []).length, sayfa + ' İngilizce bölüm sayısı Türkçe ile eşleşmeli');
  });
  const css = oku('hukuki.css');
  assert.match(css, /\.hk-en\s*\{[^}]*display:\s*none/s, 'İngilizce blok varsayılan olarak gizli olmalı');
  assert.match(css, /html\[data-dil="en"\] \.hk-tr\s*\{[^}]*display:\s*none/s, 'İngilizce arayüzde Türkçe blok gizlenmeli');
  assert.match(css, /html\[data-dil="en"\] \.hk-en\s*\{[^}]*display:\s*block/s, 'İngilizce arayüzde İngilizce blok görünmeli');
});

test('dil motoru seçimi kalıcı saklar ve düğme üretir', () => {
  assert.match(dilKaynagi, /localStorage\.setItem\(DEPO/, 'seçim localStorage’a yazılmalı');
  assert.match(dilKaynagi, /localStorage\.getItem\(DEPO/, 'seçim geri okunmalı');
  assert.match(dilKaynagi, /URLSearchParams\(location\.search\)\.get\('dil'\)/, '?dil= bağlantısı desteklenmeli');
  assert.match(dilKaynagi, /className = 'dil-dugme'/, 'kompakt dil düğmesi oluşturulmalı');
  assert.match(dilKaynagi, /window\.DerinDil =/, 'global API yayınlanmalı');
});

test('Ayarlar çekmecesi kaldırılmış ve dil doğrudan logo altından değiştirilir', () => {
  assert.doesNotMatch(authKaynagi, /data-settings/);
  assert.doesNotMatch(dilKaynagi, /dil-ayarlar-paneli/);
  assert.match(dilKaynagi, /sarma\.append\(marka, dugme\)/, 'dil düğmesi logo altında aynı grupta olmalı');
  assert.match(dilKaynagi, /'shell\.beniHatirla': 'Remember me'/, 'girişte Beni Hatırla seçeneği İngilizceye çevrilmeli');
});
