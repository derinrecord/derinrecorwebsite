// Profilim (24 Ekim): fotoğraf, ad, kulüp, şehir, telefon/WhatsApp, şifre.
// Fotoğrafı sahibi ve yönetici görür (antrenörler birbirini görmez);
// antrenörler yöneticinin (Derin Record) fotoğrafını görebilir.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const KOK = path.join(__dirname, '..');
const oku = d => fs.readFileSync(path.join(KOK, d), 'utf8');
const P = require('../profil-yardim.js');

// ---------- Saf yardımcılar ----------
test('fotoğraf kare kırpılır: kısa kenar ortadan alınır, çıktı 256', () => {
  assert.deepEqual(P.kareKirp(1200, 800), { sx: 200, sy: 0, kenar: 800, cikti: 256 });
  assert.deepEqual(P.kareKirp(600, 900), { sx: 0, sy: 150, kenar: 600, cikti: 256 });
  assert.deepEqual(P.kareKirp(100, 100), { sx: 0, sy: 0, kenar: 100, cikti: 100 }, 'küçük foto büyütülmez');
});

test('foto yolu kullanıcının kendi klasöründe, zamanlı ve .jpg', () => {
  assert.match(P.fotoYolu('u-1', 1700000000000), /^u-1\/foto-1700000000000\.jpg$/);
});

test('yalnız resim dosyası kabul edilir', () => {
  assert.equal(P.resimMi({ type: 'image/jpeg' }), true);
  assert.equal(P.resimMi({ type: 'image/heic' }), true);
  assert.equal(P.resimMi({ type: 'audio/wav' }), false);
  assert.equal(P.resimMi(null), false);
});

test('form temizlenir; telefon yalnız rakam, + ve boşluk; uzunluk sınırları', () => {
  assert.deepEqual(P.formKaydi({ ad: '  Kristina  ', kulup: ' Sofia RG ', sehir: '', telefon: '+359 88 123 45 67' }),
    { kayit: { full_name: 'Kristina', kulup: 'Sofia RG', sehir: null, phone: '+359 88 123 45 67' } });
  assert.match(P.formKaydi({ ad: '' }).hata, /Ad soyad/);
  assert.match(P.formKaydi({ ad: 'A', telefon: '0532-abc' }).hata, /Telefon/);
  assert.match(P.formKaydi({ ad: 'x'.repeat(81) }).hata, /uzun/);
});

test('şifre: en az 8 karakter ve iki alan aynı', () => {
  assert.equal(P.sifreHatasi('abc', 'abc'), 'Şifre en az 8 karakter olmalı.');
  assert.equal(P.sifreHatasi('abcdefgh', 'abcdefgx'), 'İki şifre aynı değil.');
  assert.equal(P.sifreHatasi('abcdefgh', 'abcdefgh'), null);
});

test('baş harf: ad yoksa e-postadan, o da yoksa ?', () => {
  assert.equal(P.basHarf('ikra', 'x@y'), 'İ');
  assert.equal(P.basHarf('', 'derin@x.com'), 'D');
  assert.equal(P.basHarf('', ''), '?');
});

// ---------- SQL ----------
const sql = oku('supabase/profil.sql').replace(/--[^\n]*/g, '');

test('SQL: profile foto, kulüp, şehir alanları; gizli ve sınırlı foto kovası', () => {
  assert.match(sql, /add column if not exists avatar_path text/);
  assert.match(sql, /add column if not exists kulup\s+text/);
  assert.match(sql, /add column if not exists sehir\s+text/);
  assert.match(sql, /'profil-foto', 'profil-foto', false, 1048576/);
  assert.match(sql, /array\['image\/jpeg', 'image\/png', 'image\/webp'\]/);
});

test('SQL: herkes yalnız kendi klasörüne yazar/siler; okuma sahibi, yönetici ve yönetici fotoğrafı', () => {
  const kendi = /\(storage\.foldername\(name\)\)\[1\] = auth\.uid\(\)::text/;
  ['insert', 'update', 'delete'].forEach(k => {
    const p = sql.match(new RegExp(`create policy "profil-foto: [^"]+" on storage\\.objects\\s+for ${k}[\\s\\S]*?;`));
    assert.ok(p, k + ' politikası');
    assert.match(p[0], /bucket_id = 'profil-foto'/);
    assert.match(p[0], kendi);
  });
  const oku_ = sql.match(/create policy "profil-foto: [^"]+" on storage\.objects\s+for select[\s\S]*?;/)[0];
  assert.match(oku_, /public\.profil_foto_okunur\(\(storage\.foldername\(name\)\)\[1\]\)/);
  const fn = sql.match(/create or replace function public\.profil_foto_okunur[\s\S]*?\$\$;/)[0];
  assert.match(fn, /p_sahip = auth\.uid\(\)::text/);
  assert.match(fn, /public\.is_admin\(\)/);
  assert.match(fn, /p\.role::text = 'admin'/);
});

test('SQL: profil foto yolu başkasının klasörünü gösteremez; başka tablo politikası değişmez', () => {
  assert.match(sql, /new\.avatar_path not like new\.id::text \|\| '\/%'/);
  (sql.match(/(create|drop|alter) policy[^;]*;/g) || []).forEach(p => assert.match(p, /on storage\.objects/, p));
});

test('SQL: antrenörler yöneticinin foto yolunu güvenli fonksiyonla alır', () => {
  assert.match(sql, /create or replace function public\.yonetici_profil_fotolari\(\)/);
  assert.match(sql, /grant execute on function public\.yonetici_profil_fotolari\(\) to authenticated/);
});

// ---------- Sayfa ----------
test('profilim.html: foto, alanlar, şifre ve gerekli dosyalar', () => {
  const h = oku('profilim.html');
  ['pf-foto', 'pf-foto-sec', 'pf-foto-kaldir', 'pf-ad', 'pf-kulup', 'pf-sehir', 'pf-telefon', 'pf-kaydet', 'pf-sifre', 'pf-sifre2', 'pf-sifre-kaydet']
    .forEach(id => assert.ok(h.includes(`id="${id}"`), id));
  assert.ok(h.includes('accept="image/*"'));
  ['auth.js?v=', 'profil-yardim.js?v=', 'profilim.js?v=', 'dil.js?v=', 'mobil.css?v=', 'dil.css?v=']
    .forEach(d => assert.ok(h.includes(d), d));
  assert.match(h, /<meta name="robots" content="noindex">/);
});

test('profilim.js: fotoğrafı tarayıcıda küçültür, kendi klasörüne yükler, eskisini siler', () => {
  const j = oku('profilim.js');
  assert.match(j, /P\.ayarKirp\(/);
  assert.match(j, /toBlob\([\s\S]{0,240}'image\/jpeg', 0\.85\)/);
  assert.match(j, /storage\.from\('profil-foto'\)\.upload\(yol, blob, \{ contentType: 'image\/jpeg'/);
  assert.match(j, /update\(\{ avatar_path: yol \}\)/);
  assert.match(j, /storage\.from\('profil-foto'\)\.remove\(\[eski\]\)/);
  assert.match(j, /auth\.updateUser\(\{ password/);
});

test('hesap menüsünde herkese PROFİLİM bağlantısı', () => {
  const a = oku('auth.js');
  assert.ok(a.includes('<a href="profilim.html">PROFİLİM</a>'));
});

test('Projelerim not yuvarlağında fotoğraf varsa resim, yoksa baş harf', () => {
  const j = oku('projects.js');
  assert.match(j, /const avatarHtml=\(id,project\)=>/);
  assert.match(j, /fotoUrl\[id\]\?`<img src="\$\{safe\(fotoUrl\[id\]\)\}" alt="" loading="lazy">`:safe\(yazarHarfi\(id,project\)\)/);
  assert.match(j, /createSignedUrls\(/);
  assert.match(j, /rpc\('yonetici_profil_fotolari'\)/);
});
