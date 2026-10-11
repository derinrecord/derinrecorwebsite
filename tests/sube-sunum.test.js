// Şube sunum ekranı (sunum.html): sunum tasarımında açılan şube sayfası,
// radyo.js motorunu değiştirmeden çalıştırır. Bu testler (1) motorun yayın
// anahtarını /coffee/s/<uuid> yolundan da okuduğunu, (2) sayfanın motorun
// beklediği bütün kimlikleri ve güvenlik meta'larını taşıdığını, (3) Vercel
// yönlendirmesinin doğru sırada durduğunu ve (4) dokunma alanlarının telefonda
// yeterli büyüklükte olduğunu sınar.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const KOK = path.join(__dirname, '..');
const oku = ad => fs.readFileSync(path.join(KOK, ad), 'utf8');
const radyoKaynak = oku('radyo.js');
const kuyrukKaynak = oku('radio-playlist-queue.js');

const ANAHTAR = 'a1b2c3d4-e5f6-4a7b-8c9d-0000000000aa';

function dugum() {
  return {
    textContent: '', innerHTML: '', value: '', hidden: false, style: {}, dataset: {},
    classList: { add() {}, remove() {}, toggle() {} },
    querySelectorAll: () => [],
    addEventListener() {}, onclick: null
  };
}

// radio-device-lock.test.js'teki düzenin en küçük hâli: sahte DOM + sahte
// Supabase; motor gerçek kaynak koduyla vm içinde çalışır.
async function calistir(konum) {
  const dugumler = new Map();
  const al = id => {
    if (!dugumler.has(id)) {
      const d = dugum();
      if (id === 'start' || id === 'kod-kap' || id === 'tani') d.hidden = true;
      dugumler.set(id, d);
    }
    return dugumler.get(id);
  };
  dugumler.set('audio', Object.assign(dugum(), {
    paused: true, duration: 0, currentTime: 0, volume: 1, src: '',
    play: () => Promise.reject(new Error('provada ses çalınmaz')), pause() {}, load() {}
  }));
  const cagrilar = [];
  const depo = new Map();
  const zincir = {
    select: () => zincir, eq: () => zincir, order: () => zincir, in: () => zincir,
    then: (res, red) => Promise.resolve({ data: [], error: null }).then(res, red)
  };
  const kanal = { on() { return kanal; }, subscribe() { return kanal; } };
  const icerik = {
    console, Date, Math, JSON, Promise, Object, Array, String, Number, isFinite, RegExp, Intl,
    URLSearchParams,
    setTimeout: fn => setTimeout(fn, 0), clearTimeout,
    setInterval: () => 0, clearInterval: () => {},
    location: konum,
    localStorage: {
      getItem: k => (depo.has(k) ? depo.get(k) : null),
      setItem: (k, v) => depo.set(k, v),
      removeItem: k => depo.delete(k)
    },
    crypto: { randomUUID: () => 'cihaz-test-1' },
    document: { getElementById: al, addEventListener() {}, body: {}, querySelectorAll: () => [] },
    supabase: {
      createClient: () => ({
        rpc: (ad, p) => {
          cagrilar.push({ ad, p: p || {} });
          if (ad === 'radio_ping') return Promise.resolve({ data: [{ ok: true }], error: null });
          if (ad === 'abonelik_durumu') return Promise.resolve({ data: [{ gecerli: true, durum: 'aktif' }], error: null });
          return Promise.resolve({ data: [], error: null });
        },
        from: () => zincir,
        storage: { from: () => ({ getPublicUrl: p => ({ data: { publicUrl: 'prova://' + p } }) }) },
        channel: () => kanal
      })
    },
    Audio: function () { return { play: () => Promise.resolve(), pause() {} }; },
    DERIN_CONFIG: { supabaseUrl: 'https://prova.test', supabasePublishableKey: 'prova' },
    DerinR2: { adres: (kova, p) => (p ? 'prova://' + kova + '/' + p : null) }
  };
  icerik.window = icerik;
  icerik.globalThis = icerik;
  const ctx = vm.createContext(icerik);
  vm.runInContext(kuyrukKaynak, ctx, { filename: 'radio-playlist-queue.js' });
  vm.runInContext(radyoKaynak, ctx, { filename: 'radyo.js' });
  await new Promise(done => setTimeout(done, 40));
  const metin = id => (dugumler.get(id) || {}).textContent || '';
  return {
    cagrilar,
    marka: metin('brand'),
    durum: metin('state'),
    tani: metin('tani'),
    taniGorunur: (dugumler.get('tani') || {}).hidden === false
  };
}

test('motor anahtarı yoldan okur', async () => {
  const s = await calistir({ pathname: '/coffee/s/' + ANAHTAR, search: '' });
  const ping = s.cagrilar.find(c => c.ad === 'radio_ping');
  assert.ok(ping, 'radio_ping çağrılmadı; motor anahtarı yoldan okuyamadı (' + s.marka + ' / ' + s.durum + ')');
  assert.equal(ping.p.p_player_key, ANAHTAR);
});

test('motor ?key= ile de çalışmaya devam eder', async () => {
  const s = await calistir({ pathname: '/radyo.html', search: '?key=' + ANAHTAR });
  const ping = s.cagrilar.find(c => c.ad === 'radio_ping');
  assert.ok(ping);
  assert.equal(ping.p.p_player_key, ANAHTAR);
});

test('bozuk anahtar çökmez', async () => {
  const s = await calistir({ pathname: '/coffee/s/abc', search: '' });
  assert.match(s.durum, /anahtar/i);
  assert.match(s.tani, /anahtar-bozuk/);
  assert.ok(s.taniGorunur);
  assert.equal(s.cagrilar.filter(c => c.ad === 'radio_ping').length, 0, 'bozuk anahtarla sunucuya gidilmemeli');
});

const MOTOR_KIMLIKLERI = [
  'brand', 'branch', 'now', 'folder', 'cover', 'playlist', 'start', 'state', 'tani',
  'hours', 'kod-kap', 'kod-gir', 'liste-kap', 'liste-sec', 'audio'
];

test('sunum.html motorun bütün kimliklerini taşır', () => {
  const html = oku('sunum.html');
  for (const id of MOTOR_KIMLIKLERI.concat('kod-gonder')) {
    const n = (html.match(new RegExp('id="' + id + '"', 'g')) || []).length;
    assert.equal(n, 1, `id="${id}" sayfada tam bir kez olmalı (bulunan: ${n})`);
  }
  assert.match(html, /<script src="\/radyo\.js\?v=[^"]+"><\/script>/);
  assert.match(html, /<script src="\/r2-depo\.js[^"]*"><\/script>/);
  assert.match(html, /<script src="\/radio-playlist-queue\.js[^"]*"><\/script>/);
  assert.match(html, /<script src="\/config\.js"><\/script>/);
  assert.match(html, /supabase-js@2\.81\.1/);
  assert.match(html, /<meta name="referrer" content="no-referrer">/);
  assert.match(html, /<meta name="robots" content="noindex,nofollow">/);
  // Sayfa /coffee/s/<uuid> adresinde açılır: göreli yollar yanlış klasöre gider.
  const yollar = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map(m => m[1]);
  for (const y of yollar) {
    assert.ok(/^(\/|https:\/\/|#)/.test(y), `göreli yol bulundu: ${y}`);
  }
  // Kod kapısı ve başlat düğmesi açılışta gizli; motor açar.
  assert.match(html, /<form[^>]*id="kod-kap"[^>]*hidden/);
  assert.match(html, /<button[^>]*id="start"[^>]*hidden/);
  assert.match(html, /<button[^>]*id="kod-gonder"[^>]*type="submit"/);
  // radyo.js'in kapsamadığı ama sayfanın ihtiyaç duyduğu: hidden her zaman kazanır.
  assert.match(oku('sube-sunum.css'), /\[hidden\]\s*\{\s*display:\s*none\s*!important/);
});

test('rewrite sırası', () => {
  const { rewrites } = JSON.parse(oku('vercel.json'));
  const i = rewrites.findIndex(r => r.source === '/coffee/s/:key');
  const j = rewrites.findIndex(r => r.source === '/coffee/:slug');
  assert.ok(i >= 0, '/coffee/s/:key yönlendirmesi yok');
  assert.equal(rewrites[i].destination, '/sunum.html');
  assert.ok(j >= 0);
  assert.ok(i < j, '/coffee/s/:key, /coffee/:slug girdisinden önce gelmeli');
});

test('dokunma alanları', () => {
  const css = oku('sube-sunum.css').replace(/\/\*[\s\S]*?\*\//g, '');
  for (const sec of ['#start', '#kod-gonder', '#kod-gir', '#liste-sec']) {
    const kurallar = [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)]
      .filter(m => m[1].split(',').map(s => s.trim()).includes(sec));
    const yukseklik = Math.max(0, ...kurallar.map(m => {
      const h = /min-height:\s*(\d+)px/.exec(m[2]);
      return h ? Number(h[1]) : 0;
    }));
    assert.ok(yukseklik >= 44, `${sec} için min-height ≥ 44px yok (bulunan: ${yukseklik})`);
  }
});
