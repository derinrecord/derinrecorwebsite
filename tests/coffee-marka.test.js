// Marka paneli (coffee-marka, erişim koduyla açılan sunum sayfası).
//
// Karar: hangi listelerin bir şubede çalacağını YALNIZ yönetim belirler
// (marka → şube → birden fazla çalma listesi, yönetim panelinden). Marka paneli
// okumaya devam eder; burada seçim yapılmaz. Bir dönem eklenen "marka kendi
// seçimini yapsın" katmanı bilinçli olarak kaldırıldı; geri sızmasın diye
// aşağıdaki testler onu yasaklar.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync(require.resolve('../coffee-marka.js'), 'utf8');
const css = fs.readFileSync(require.resolve('../marka-sunum.css'), 'utf8');
const sayfa = fs.readFileSync(require.resolve('../coffee-marka.html'), 'utf8');

test('marka paneli listeleri okur ve sunar', () => {
  assert.match(source, /client\.rpc\('coffee_brand_auth', \{ p_slug: slug, p_code: kod \}\)/);
  assert.match(source, /client\.rpc\('coffee_brand_liste', \{ p_slug: slug, p_code: kod \}\)/);
  assert.match(source, /function tabsCiz\(\)/, 'listeler sekme olarak çizilmeli');
  assert.match(source, /function listeCiz\(\)/, 'seçilen listenin parçaları çizilmeli');
  assert.match(sayfa, /coffee-marka\.js\?v=\d+/, 'betik sürüm damgası taşımalı');
});

// Yazma yolu yok: marka panelinden hiçbir tablo satırı değişmez. Atama kararı
// tek yerde (yönetim paneli) verilir; iki ekrandan yazmak karışıklığı getirir.
test('marka paneli hiçbir şey yazmaz', () => {
  assert.ok(!/coffee_brand_havuz|coffee_brand_secim/.test(source),
    'marka seçimi fonksiyonları çağrılmamalı');
  assert.ok(!/from\('player_playlists'\)/.test(source), 'atama tablosu okunmamalı');
  assert.ok(!/\.insert\(|\.update\(|\.delete\(|\.upsert\(|\.upload\(/.test(source),
    'marka panelinden yazma denenmemeli');
  assert.ok(!/data-sube-kaydet|data-sube-hepsi|data-sube-hicbiri/.test(source),
    'seçim düğmeleri kalmamalı');
  assert.ok(!/id="mk-secim"/.test(source), 'seçim bölümü hiç çizilmemeli');
});

// Seçim bölümünün stilleri de gitti: kullanılmayan CSS bırakmıyoruz, yoksa
// ileride "bu bölüm nerede?" diye aranıyor.
test('seçim bölümünden kalan stil yok', () => {
  assert.ok(!/mk-secim|mk-sube\b|mk-btn/.test(css), 'seçim stilleri temizlenmeli');
  const acik = (css.match(/{/g) || []).length, kapali = (css.match(/}/g) || []).length;
  assert.equal(acik, kapali, 'CSS blokları dengeli olmalı');
});

// Karışık çal: müşteri sunumda listeyi karıştırıp dinleyebilmeli. Düğme yalnız
// görünmekle kalmamalı; çalma SIRASINI gerçekten değiştirmeli ve o an çalan
// parçayı kaybetmemeli (karışık açılınca başa dönmesin).
test('sunumda karışık çal seçeneği çalma sırasını değiştirir', () => {
  assert.match(source, /id="mk-karisik"/, 'karışık düğmesi çizilmeli');
  assert.match(source, /function duzenKur\(\)/, 'çalma sırası kurulmalı');
  assert.match(source, /if \(!karisik\) return idx/, 'karışık kapalıyken doğal sıra dönmeli');
  assert.match(source, /Math\.random\(\)/, 'karışık sıra rastgele olmalı');
  // Sıradaki parça doğal komşu değil, kurulu sıradaki komşu olmalı.
  const sonraki = source.slice(source.indexOf('function sonraki('), source.indexOf('function kaynakYukle('));
  assert.match(sonraki, /duzen\.indexOf\(sira\)/, 'sıra kuruludan okunmalı');
  assert.match(sonraki, /duzen\[\(p \+ yon/, 'komşu kurulu sıradan seçilmeli');
  // Düğme bağlanmalı ve açık/kapalı durumu erişilebilir biçimde yansıtılmalı.
  assert.match(source, /byId\('mk-karisik'\)/, 'düğme bağlanmalı');
  assert.match(source, /aria-pressed/, 'durum erişilebilir olmalı');
  assert.match(source, /idx\.unshift\(sira\)/, 'çalan parça sıranın başında kalmalı');
  assert.match(css, /\.mk-shuffle\[aria-pressed="true"\]/, 'açıkken belirginleşmeli');
});

// Marka kapağı (supabase/marka-kapagi.sql): sunum, markaya ait görseli kendi
// kapağı olmayan liste/parçaların varsayılanı olarak kullanmalı. Fonksiyon
// kurulmadıysa sessizce atlanmalı; sunum bozulmamalı.
test('sunum marka kapağını varsayılan görsel olarak kullanır', () => {
  assert.match(source, /rpc\('coffee_brand_kapak', \{ p_slug: slug, p_code: kod \}\)/);
  assert.match(source, /t\.cover_path \|\| t\._playlistCover \|\| markaKapak/, 'marka kapağı en son yedek olmalı');
  const i = source.indexOf('coffee_brand_kapak');
  const blok = source.slice(Math.max(0, i - 220), i + 260);
  assert.ok(!/throw /.test(blok), 'fonksiyon yoksa çökmeden devam etmeli');
});

// Alt mini oynatıcı: kısa listelerde/uzun kaydırmada "şu an çalan" hep gözde
// olsun. Sahne ekrandan çıkınca belirir, aynı parçayı gösterir ve kumandaları
// ikinci bir çalma mantığı kurmadan sahne düğmelerine delege eder.
test('sunumda alt mini oynatıcı sahneyle aynı parçayı ve kumandaları paylaşır', () => {
  assert.match(source, /id="mk-dock"/, 'alt çubuk çizilmeli');
  assert.match(source, /function dockYaz\(t\)/, 'çubuk sahneyle beslenmeli');
  assert.match(source, /IntersectionObserver/, 'görünürlüğe göre açılıp kapanmalı');
  assert.match(source, /dok\.classList\.toggle\('acik', !gorunur && kuyruk\.length > 0\)/,
    'sahne görünürken değil, liste varken açılmalı');
  // Kumandalar sahnenin düğmelerine delege edilmeli: tek çalma mantığı.
  assert.match(source, /dokOyna\.onclick = \(\) => byId\('mk-oyna'\)\.click\(\)/);
  assert.match(source, /byId\('mk-dock-ileri'\)\.onclick = \(\) => byId\('mk-ileri'\)\.click\(\)/);
  assert.match(css, /\.mk-dock\.acik\{/, 'çubuk açık durumu stillenmeli');
});

// Kahraman görseli: marka/liste fotoğrafı varsa arka plana çok soluk serilir,
// yoksa bölüm yalın kalır (boş kutu çizilmez).
test('kahraman, varsa marka görselini arka plana serer', () => {
  assert.match(source, /markaKapak \|\| \(listeler\.find\(l => l\.cover_path\) \|\| \{\}\)\.cover_path/,
    'marka kapağı, yoksa ilk kapaklı liste seçilmeli');
  assert.match(source, /class="mk-hero-bg"/, 'arka plan katmanı çizilmeli');
  assert.match(css, /\.mk-hero-bg\{/, 'katman stillenmeli');
});

// Sunum kolonu, cam başlıkla (`min(1180px,94vw)`) aynı genişlikte ortalanmalı.
// admin-main'in 70rem sınırı bırakılırsa .mk-shell kapsayıcısından taşar: dar
// masaüstü genişliklerinde yatay kaydırma çubuğu çıkar ve içerik sağa yaslanır.
test('sunum kolonu kapsayıcıdan taşmaz, cam başlıkla hizalanır', () => {
  assert.match(css, /\.mk-shell\{[^}]*width:min\(1180px,94vw\)/,
    'kolon genişliği başlıkla aynı olmalı');
  const mkRoot = css.slice(css.indexOf('.mk-root{'), css.indexOf('.mk-lock{'));
  assert.match(mkRoot, /max-width:none/, 'admin-main sınırı kaldırılmalı');
  assert.match(mkRoot, /padding-left:0/, 'sol dolgu sıfırlanmalı');
  assert.match(mkRoot, /padding-right:0/, 'sağ dolgu sıfırlanmalı');
});
