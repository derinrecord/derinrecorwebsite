// Derin Record — marka sunumu (coffee-marka) görsel ölçü sözleşmesi.
//
// Neden: sunumun üç bölgesi birbirine ve cam başlığa göre hizalı durur —
// kahraman (marka adı + filigran), sahne (kapak + kumandalar) ve alt mini
// oynatıcı. Bu dosya o hizayı kuran sayıları dondurur: bir genişlik, opaklık,
// kırılım noktası ya da katman sırası farkında olmadan değişirse test kırmızıya
// döner ve değişikliğin bilinçli olduğunu kanıtlaman istenir.
//
// Test ortamında tarayıcı yok (package.json/node_modules yok), bu yüzden iki
// katman denetlenir: (1) CSS'teki sabit sayılar, (2) bu sayılardan değişik
// ekran genişlikleri için hesaplanan gerçek piksel değerleri. Sayfa ayrıca
// `node tests/onizleme-olustur.js marka` ile tek dosyaya çevrilip gözle
// doğrulanabilir; oradaki ölçümler buradaki sözleşmeyle aynı olmalıdır.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const css = fs.readFileSync(require.resolve('../marka-sunum.css'), 'utf8');
const kaynak = fs.readFileSync(require.resolve('../coffee-marka.js'), 'utf8');

// ---------- Küçük CSS ayrıştırıcı ----------
// Yorumları atar, @media bloklarını içerideki kurallarla birlikte düzleştirir.
function blokBul(metin, baslangic) {
  let derinlik = 0;
  for (let i = baslangic; i < metin.length; i++) {
    if (metin[i] === '{') derinlik++;
    else if (metin[i] === '}') {
      derinlik--;
      if (derinlik === 0) return { govde: metin.slice(baslangic + 1, i), son: i };
    }
  }
  throw new Error('CSS: kapanmayan blok');
}

function kurallariAyikla(metin, medya = '') {
  const temiz = metin.replace(/\/\*[\s\S]*?\*\//g, '');
  const cikti = [];
  let i = 0;
  while (i < temiz.length) {
    const at = temiz.indexOf('{', i);
    if (at < 0) break;
    const secici = temiz.slice(i, at).trim().replace(/\s+/g, ' ');
    const { govde, son } = blokBul(temiz, at);
    if (secici.startsWith('@media')) cikti.push(...kurallariAyikla(govde, secici));
    else if (secici) cikti.push({ medya, secici, govde: govde.replace(/\s+/g, ' ').trim() });
    i = son + 1;
  }
  return cikti;
}

const kurallar = kurallariAyikla(css);

function kural(secici, medya = '') {
  const bulunan = kurallar.find(k => k.secici === secici && k.medya === medya);
  assert.ok(bulunan, `CSS'te kural yok: ${secici}${medya ? ' (' + medya + ')' : ''}`);
  return bulunan.govde;
}

// Bir kuralın içinde aynı özellik birden çok kez yazılmış olabilir (ör. önce
// 56px, sonra 96px). CSS'te sonuncusu geçerli olduğu için sondan geriye ararız.
function deger(secici, ozellik, medya = '') {
  const parcalar = kural(secici, medya).split(';');
  const desen = new RegExp('^\\s*' + ozellik + '\\s*:(.+)$');
  for (let i = parcalar.length - 1; i >= 0; i--) {
    const m = parcalar[i].match(desen);
    if (m) return m[1].trim();
  }
  assert.fail(`${secici} içinde ${ozellik} yok`);
}

// ---------- Hesaplayıcılar ----------
// min(680px,92vw) → ekran genişliğine göre gerçek piksel değeri.
function minPx(ifade, vw) {
  const m = /^min\((\d+(?:\.\d+)?)px,\s*(\d+(?:\.\d+)?)vw\)$/.exec(ifade);
  assert.ok(m, `çözülemeyen min(): ${ifade}`);
  return Math.min(Number(m[1]), (Number(m[2]) * vw) / 100);
}
// clamp(20px,4vw,44px) → alt/üst sınırlara kıskaçlanmış değer.
function clampPx(ifade, vw) {
  const m = /^clamp\((\d+(?:\.\d+)?)px,\s*(\d+(?:\.\d+)?)vw,\s*(\d+(?:\.\d+)?)px\)$/.exec(ifade);
  assert.ok(m, `çözülemeyen clamp(): ${ifade}`);
  return Math.max(Number(m[1]), Math.min((Number(m[2]) * vw) / 100, Number(m[3])));
}

const YAKIN = (a, b) => Math.abs(a - b) < 0.01;

// ---------- 1) Bölüm iskeleti ----------
test('kahraman, sahne ve mini oynatıcı iskeleti yerinde', () => {
  // Kahraman: marka adı + filigran katmanı.
  assert.match(kaynak, /<section class="mk-hero mk-shell">/, 'kahraman bölümü çizilmeli');
  assert.match(kaynak, /class="mk-hero-logo"[^>]*><img src="\/assets\/kaset-filigran\.png"/,
    'filigran katmanı kaset görselini taşımalı');
  // Sahne: kapak + bilgi/kumanda kolonu.
  assert.match(kaynak, /<div class="mk-stage" id="mk-stage">/, 'sahne çizilmeli');
  assert.match(kaynak, /<div class="mk-art" id="mk-art">/, 'sahne kapağı çizilmeli');
  assert.match(kaynak, /<div class="mk-meta">/, 'sahne bilgi kolonu çizilmeli');
  // Mini oynatıcı: kapak + başlık + üç kumanda.
  for (const parca of ['mk-dock', 'mk-dock-art', 'mk-dock-baslik', 'mk-dock-alt',
    'mk-dock-geri', 'mk-dock-oyna', 'mk-dock-ileri']) {
    assert.match(kaynak, new RegExp(`id="${parca}"`), `mini oynatıcıda ${parca} olmalı`);
  }
});

// ---------- 2) Kahraman ölçüleri ----------
test('kahraman ölçüleri sabit: kolon hizası ve filigran', () => {
  // Kolon, cam başlıkla aynı genişlikte; admin sınırı kaldırılmış olmalı.
  assert.equal(deger('.mk-shell', 'width'), 'min(1180px,94vw)', 'kahraman kolonu');
  assert.equal(deger('.mk-root', 'max-width'), 'none', 'admin sınırı kaldırılmalı');
  assert.equal(deger('.mk-root', 'padding-left'), '0');
  assert.equal(deger('.mk-root', 'padding-right'), '0');
  // Alt mini oynatıcı sabit durduğu için sayfa altında onun boyu kadar nefes.
  assert.equal(deger('.mk-root', 'padding-bottom'), '96px', 'mini oynatıcı payı');

  // Filigran: sağ kenarda, sola yaslı marka adına değmeyecek konumda.
  const logo = kural('.mk-hero-logo');
  assert.equal(deger('.mk-hero-logo', 'position'), 'absolute');
  assert.equal(deger('.mk-hero-logo', 'right'), '0', 'işaret sağ kenara oturmalı');
  assert.equal(deger('.mk-hero-logo', 'top'), '-10%');
  assert.equal(deger('.mk-hero-logo', 'width'), 'min(440px,44vw)');
  assert.equal(deger('.mk-hero-logo', 'opacity'), '.15', 'filigran soluk kalmalı');
  assert.equal(deger('.mk-hero-logo', 'mask-image'), 'linear-gradient(104deg,transparent 0%,#000 44%)',
    'sol kenar eritilmeli ki harflere binmesin');
  assert.equal(deger('.mk-hero-logo', '-webkit-mask-image'),
    'linear-gradient(104deg,transparent 0%,#000 44%)', 'webkit eşi de aynı olmalı');
  assert.ok(logo, 'filigran kuralı okunmalı');
  assert.equal(deger('.mk-hero-logo img', 'width'), '100%');

  // Başlık ve şeritler.
  assert.equal(deger('.mk-hero h1', 'font-size'), 'clamp(36px,8vw,84px)');
  assert.equal(deger('.mk-tag', 'max-width'), '620px');
});

// ---------- 3) Sahne ölçüleri ----------
test('sahne ölçüleri sabit: kolon oranı, kapak ve kumandalar', () => {
  assert.equal(deger('.mk-stage', 'grid-template-columns'), 'minmax(200px,290px) 1fr',
    'kapak sabit, bilgi kolonu esnek olmalı');
  assert.equal(deger('.mk-stage', 'gap'), 'clamp(20px,4vw,44px)');
  assert.equal(deger('.mk-stage', 'align-items'), 'center');
  assert.equal(deger('.mk-art', 'aspect-ratio'), '1', 'kapak kare kalmalı');
  assert.equal(deger('.mk-meta', 'max-width'), '620px');
  assert.equal(deger('.mk-cmds .mk-main', 'width'), '58px', 'ana oynat düğmesi');
  assert.equal(deger('.mk-cmds .mk-main', 'height'), '58px');
  assert.equal(deger('.mk-cmds .mk-shuffle', 'width'), '42px', 'karışık çal düğmesi');
});

// ---------- 4) Mini oynatıcı ölçüleri ----------
test('mini oynatıcı ölçüleri sabit: genişlik, hiza ve katman sırası', () => {
  assert.equal(deger('.mk-dock', 'position'), 'fixed');
  assert.equal(deger('.mk-dock', 'width'), 'min(680px,92vw)');
  assert.equal(deger('.mk-dock', 'bottom'), '18px');
  assert.equal(deger('.mk-dock', 'left'), '50%', 'yatayda ortalanmalı');
  assert.match(kural('.mk-dock'), /transform:translateX\(-50%\) translateY\(16px\)/,
    'kapalı hâlde hafif aşağıda durmalı');
  assert.match(kural('.mk-dock.acik'), /transform:translateX\(-50%\) translateY\(0\)/,
    'açıkken yerine oturmalı');
  assert.equal(deger('.mk-dock-art', 'width'), '46px', 'çubuk kapağı');
  assert.equal(deger('.mk-dock-art', 'height'), '46px');
  assert.equal(deger('.mk-dock-cmds .mk-dock-main', 'width'), '40px');
  // Detay penceresi mini oynatıcının ÜSTÜNDE kalmalı; ters olursa pencere
  // açıldığında çubuk onu keser.
  assert.ok(Number(deger('.mk-dock', 'z-index')) < Number(deger('.mk-ov', 'z-index')),
    'detay penceresi mini oynatıcının üstünde olmalı');
});

// ---------- 5) Duyarlı kırılımlar ----------
test('duyarlı kırılımlar sabit: sahne tek kolon, filigran küçülür/silinir', () => {
  const m820 = '@media(max-width:820px)';
  assert.equal(deger('.mk-stage', 'grid-template-columns', m820), '1fr',
    'dar ekranda sahne tek kolona düşmeli');
  assert.equal(deger('.mk-art', 'width', m820), 'min(260px,66vw)');
  assert.equal(deger('.mk-hero-logo', 'width', m820), 'min(260px,58vw)');
  assert.equal(deger('.mk-hero-logo', 'opacity', m820), '.12');

  const m560 = '@media(max-width:560px)';
  assert.equal(deger('.mk-hero-logo', 'display', m560), 'none',
    'telefonda başlık tüm genişliği kaplar: filigran gizlenmeli');
  assert.equal(deger('.mk-list-head,.mk-item', 'grid-template-columns', m560), '26px 1fr 52px');
});

// ---------- 6) Hesaplanan görünüm ----------
test('hesaplanan genişlikler ekrana sığar ve hizayı bozmaz', () => {
  const kabuk = deger('.mk-shell', 'width');
  const cubuk = deger('.mk-dock', 'width');
  const sahneBosluk = deger('.mk-stage', 'gap');
  const logo = deger('.mk-hero-logo', 'width');

  for (const vw of [390, 480, 768, 1024, 1280, 1440]) {
    const K = minPx(kabuk, vw);
    const C = minPx(cubuk, vw);
    const L = minPx(logo, vw);

    assert.ok(K <= vw + 0.01, `kahraman kolonu ekrandan geniş: ${K} > ${vw}`);
    assert.ok(C <= vw + 0.01, `mini oynatıcı ekrandan geniş: ${C} > ${vw}`);
    assert.ok(C <= K + 0.01, `mini oynatıcı kolondan geniş: ${C} > ${K}`);
    // Çubuk 46px kapak + metin + 40px ana düğme taşır: en dar ekranda da
    // kırpılmasın diye genişliği bu üçünün altına inmemeli.
    assert.ok(C >= 220, `mini oynatıcı çok dar: ${C}`);
    // Filigran ekranın yarısından geniş olursa başlığa biner.
    assert.ok(L <= vw * 0.44 + 0.01, `filigran çok geniş: ${L} @ ${vw}`);
    // Sahne arası boşluk alt sınırın altına düşmemeli.
    assert.ok(clampPx(sahneBosluk, vw) >= 20 - 0.01, `sahne boşluğu çok dar @ ${vw}`);
  }

  // Sabit değerler: büyük ekranda üst sınıra, telefonda vw sınırına oturur.
  assert.ok(YAKIN(minPx(kabuk, 1280), 1180), 'kabuk 1180px üst sınırı');
  assert.ok(YAKIN(minPx(kabuk, 390), 366.6), 'kabuk 94vw (390)');
  assert.ok(YAKIN(minPx(cubuk, 1280), 680), 'çubuk 680px üst sınırı');
  assert.ok(YAKIN(minPx(cubuk, 390), 358.8), 'çubuk 92vw (390)');
});

// ---------- 7) Filigranın soluk kalma sözü ----------
// Filigran marka adının arkasına biner; belirginleşirse başlık okunmaz olur.
// Bu yüzden opaklık üst sınırı hem ana hem dar ekranda sözleşmeye bağlıdır.
test('filigran solukluk sınırı içinde kalır', () => {
  for (const medya of ['', '@media(max-width:820px)']) {
    const o = Number(deger('.mk-hero-logo', 'opacity', medya));
    assert.ok(o > 0.1 && o <= 0.2, `${medya || 'ana'} opaklık sınır dışı: ${o}`);
  }
});
