// Marka paneli (coffee-marka, erişim koduyla açılan sunum) şube listesi seçimi.
//
// İki aşamalı yapı: yönetim her şubenin havuzunu belirler, marka kendi
// panelinden bu havuzun içinden hangilerinin çalacağını seçer. Marka paneli
// giriş yapmaz, bu yüzden okuma ve yazma yolu sunucuda erişim kodunu doğrulayan
// fonksiyonlardan geçmek zorundadır; tabloya doğrudan dokunamaz.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync(require.resolve('../coffee-marka.js'), 'utf8');
const css = fs.readFileSync(require.resolve('../marka-sunum.css'), 'utf8');
const sayfa = fs.readFileSync(require.resolve('../coffee-marka.html'), 'utf8');

test('marka paneli havuzu kod doğrulayan fonksiyondan okur', () => {
  assert.match(source, /client\.rpc\('coffee_brand_havuz', \{ p_slug: slug, p_code: kod \}\)/,
    'havuz okuması erişim kodunu sunucuda doğrulatmalı');
  assert.ok(!source.includes("from('player_playlists')"),
    'tablo marka panelinden doğrudan okunmamalı');
});

// Seçim kalıcıdır: sunucuya yazılır, marka değiştirene kadar kalır. Yazma yolu
// da kod doğrulamasından geçer ve yalnız o şubenin havuzuna dokunur.
test('marka seçimi sunucuya kalıcı yazılır', () => {
  const blok = source.slice(source.indexOf('async function secimKaydet'), source.indexOf('// ---------- Açılış'));
  assert.match(blok, /client\.rpc\('coffee_brand_secim'/, 'seçim fonksiyonla yazılmalı');
  ['p_slug: slug', 'p_code: sonKod', 'p_player_id: playerId', 'p_playlist_ids: secili']
    .forEach(alan => assert.ok(blok.includes(alan), alan + ' gönderilmeli'));
  assert.match(source, /sonKod = kod/, 'kaydetme için erişim kodu elde tutulmalı');

  // Yalnız o şubenin kutuları okunur: başka şubenin seçimi bozulmaz.
  assert.match(blok, /filter\(k => es\(k\.dataset\.sube, playerId\) && k\.checked\)/);
  // Kaydedilen seçim yerel duruma da yazılır ki ekran hemen doğruyu göstersin.
  assert.match(blok, /x\.secili = secili\.some\(v => es\(v, x\.playlist_id\)\)/);
  assert.match(blok, /'Kaydedilemedi: ' \+ error\.message/,
    'sunucu reddederse marka sebebini okumalı');
});

// Şube başına liste sayısında sınır yoktur: Alsancak'a berber, spor salonu ve
// daha fazlası aynı anda yüklenebilir. İşaret kutuları havuzun tamamı için
// çizilir; hepsi kapanırsa o şube susar ve bu açıkça söylenir.
test('bir şubeye birden çok liste seçilebilir, hepsi kapanırsa söylenir', () => {
  assert.match(source, /g\.listeler\.map\(x => `/, 'havuzdaki her liste kutu olarak çizilmeli');
  assert.match(source, /istediğiniz kadar liste/, 'sınır olmadığı yazılmalı');
  assert.match(source, /adet === 0[\s\S]*?'Hiç liste seçilmedi: bu şubede müzik çalmaz\.'/,
    'hiç seçim yoksa şubenin susacağı söylenmeli');
  assert.match(source, /'Kaydedildi: bu şubede ' \+ adet \+ ' liste çalacak\.'/);
  assert.match(source, /\$\{seciliAdet\} \/ \$\{g\.listeler\.length\} liste çalıyor/,
    'şube başlığında kaç listenin çaldığı yazılmalı');
});

// Marka panelindeki seçim, yönetim panelindeki şube penceresiyle aynı akıştır:
// tek sütun satırlar ve toplu seçim kısayolları. Toplu işaretleme kaydetmez,
// kayıt yine düğmeye bırakılır: yanlışlıkla "tümünü seç + kaydet" olmasın.
test('toplu seçim kısayolları var, kayıt yine düğmeyle oluyor', () => {
  assert.match(source, /data-sube-hepsi="\$\{safe\(g\.player_id\)\}"\$\{kilitli \? ' disabled' : ''\}>TÜMÜNÜ SEÇ</);
  assert.match(source, /data-sube-hicbiri="\$\{safe\(g\.player_id\)\}"[\s\S]{0,40}HİÇBİRİNİ SEÇ</);
  const blok = source.slice(source.indexOf("byId('mk-secim').addEventListener"), source.indexOf('// ---------- Açılış'));
  assert.match(blok, /if \(es\(k\.dataset\.sube, playerId\)\) k\.checked = !!hepsi;/, 'yalnız o şubenin kutuları işaretlenmeli');
  assert.ok(!/secimKaydet\(playerId/.test(blok), 'toplu seçim kendiliğinden kaydetmemeli');
  assert.match(blok, /'Henüz kaydedilmedi: SEÇİMİ KAYDET demeden değişmez\.'/,
    'kaydedilmediği açıkça söylenmeli');
  // Yönetim panelindeki pencereyle aynı düzen: tek sütun, tam genişlik satırlar.
  assert.match(css, /\.mk-secim-kutu\{margin:12px 0 14px\}/, 'satırlar tek sütunda akmamalı');
  assert.match(css, /\.mk-btn2\{/, 'ikincil düğme stili olmalı');
  assert.match(source, /Birden çok liste seçebilirsiniz\./, 'çoklu seçim açıkça yazılmalı');
});

// Kalıcı seçim aboneliği olan markanın hakkı: sunucu yazmayı reddeder, panel de
// önceden söyler. Fonksiyon kurulmadıysa bölüm hiç görünmez (eksik kurulum
// markaya hata gibi gösterilmez).
test('seçim aboneliğe bağlı, kurulum yoksa bölüm çizilmez', () => {
  assert.match(source, /if \(havuz === null\) \{ host\.innerHTML = ''; return; \}/,
    'fonksiyon yoksa bölüm görünmemeli');
  assert.match(source, /Aboneliğiniz aktif olmadığı için seçim kaydedilemez/,
    'abonelik yokken sebebi yazılmalı');
  assert.match(source, /data-sube-kaydet="\$\{safe\(g\.player_id\)\}"\$\{kilitli \? ' disabled' : ''\}/,
    'abonelik yokken kaydetme kapalı olmalı');
});

// Markaya şubeye özel link verilebilir: linke gelen marka yalnız o şubeyi
// seçer, başka şubeyi görmesine gerek kalmaz.
test('marka paneli şubeye özel linkle daraltılabilir', () => {
  assert.match(source, /new URLSearchParams\(location\.search\)\.get\('sube'\)/);
  assert.match(source, /if \(filtre && !es\(s\.player_id, filtre\)\) return;/,
    'verilen şube dışındaki satırlar gösterilmemeli');
});

// Akış sayfada canlı kalır: seçim yönetimin atamasını değiştirmez, yalnız hangi
// listelerin çalacağını belirler. Sunum kendi listesini göstermeye devam eder.
test('seçim bölümü sunumun kendi çizimine dokunmaz', () => {
  assert.match(source, /<div id="mk-secim"><\/div>/);
  assert.match(source, /byId\('mk-secim'\)\.addEventListener\('click'/);
  assert.match(source, /secimYukle\(kod\)\.catch\(\(\) => \{\}\);/,
    'havuz okunamazsa sunum çalışmaya devam etmeli');
  assert.ok(!/tabssCiz|acikListe = havuz/.test(source), 'seçim listeyi ele geçirmemeli');
});

test('seçim bölümünün stilleri tanımlı ve damgalar taze', () => {
  ['.mk-secim-kutu', '.mk-secim-satir', '.mk-secim-satir input:checked', '.mk-sube-ust', '.mk-btn']
    .forEach(sec => assert.ok(css.includes(sec), sec + ' stili olmalı'));
  assert.match(sayfa, /marka-sunum\.css\?v=\d+/);
  assert.match(sayfa, /coffee-marka\.js\?v=\d+/);
});
