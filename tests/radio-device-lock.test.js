// Şube oynatıcısının (radyo.js) ekranda ne yazdığını, sunucu cevaplarını taklit
// ederek gerçek kodla sınar. Amaç: "yayını aç" başka bir mekândan/cihazdan
// denendiğinde ve yayın zinciri kopuk olduğunda oynatıcının davranışını
// kalıcı bir teste bağlamak.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const KOK = path.join(__dirname, '..');
const radyoKaynak = fs.readFileSync(path.join(KOK, 'radyo.js'), 'utf8');
const kuyrukKaynak = fs.readFileSync(path.join(KOK, 'radio-playlist-queue.js'), 'utf8');

const MARKA = {
  brand_id: 'b-prova-0001', brand_name: 'Mokka Coffee', player_label: 'Alsancak',
  open_time: '09:00:00', close_time: '22:00:00', folder_id: 'f1',
  folder_name: 'Öğleden Sonra', cover_path: null, shuffle: false,
  updated_at: '2026-09-27T10:00:00.000Z'
};
const PARCALAR = ['Sabah Işığı', 'Yavaş Yağmur'].map((title, i) => ({
  ...MARKA, track_id: 't' + i, title, storage_path: 'f1/p' + i + '.wav', sort_order: i
}));

function dugum() {
  return {
    textContent: '', innerHTML: '', hidden: false, style: {}, dataset: {},
    classList: { add() {}, remove() {}, toggle() {} },
    querySelectorAll: () => [],
    addEventListener() {}, onclick: null
  };
}

// Oynatıcıyı tek bir senaryoyla baştan çalıştırır ve ekranın son hâlini verir.
async function calistir(senaryo) {
  const dugumler = new Map();
  const al = id => {
    if (!dugumler.has(id)) {
      const d = dugum();
      if (id === 'start') d.hidden = true;   // gerçek sayfada <button id="start" hidden>
      dugumler.set(id, d);
    }
    return dugumler.get(id);
  };
  const audio = Object.assign(dugum(), {
    paused: true, duration: 0, currentTime: 0, volume: 1, src: '',
    play: () => Promise.reject(new Error('provada ses çalınmaz')),
    pause() {}, load() {}
  });
  dugumler.set('audio', audio);

  const cagrilar = [];
  const depo = new Map();
  const kanal = { on() { return kanal; }, subscribe() { return kanal; } };

  const rpc = (ad, p) => {
    cagrilar.push({ ad, p });
    if (ad === 'radio_ping') {
      return senaryo.ping === 'kilitli'
        ? [{ ok: false, reason: 'locked_to_other_device' }]
        : [{ ok: true }];
    }
    if (ad === 'radio_now_playing') return senaryo.parca ? PARCALAR : [];
    if (ad === 'abonelik_durumu') {
      // 'bos': sunucu anahtarı hiç tanımıyor (boş dizi). 'yok': anahtar tanınıyor
      // ama abonelik kaydı yok, sunucu { gecerli:false, durum:'yok' } döner.
      if (senaryo.abonelik === 'bos') return [];
      if (senaryo.abonelik === 'yok') return [{ gecerli: false, durum: 'yok' }];
      if (senaryo.abonelik === 'bitti') return [{ gecerli: false, durum: 'bitti' }];
      return [{ gecerli: true, durum: 'aktif' }];
    }
    return [];
  };

  const icerik = {
    console, Date, Math, JSON, Promise, Object, Array, String, Number, isFinite, RegExp, Intl,
    URLSearchParams,
    setTimeout: (fn) => setTimeout(fn, 0),
    clearTimeout,
    setInterval: () => 0,
    clearInterval: () => {},
    location: { search: '?key=k-prova' },
    localStorage: {
      getItem: k => (depo.has(k) ? depo.get(k) : null),
      setItem: (k, v) => depo.set(k, v)
    },
    crypto: { randomUUID: () => 'cihaz-test-1' },
    document: { getElementById: al, addEventListener() {}, body: {}, querySelectorAll: () => [] },
    supabase: {
      createClient: () => ({
        rpc: (ad, p) => Promise.resolve({ data: rpc(ad, p || {}), error: null }),
        storage: { from: () => ({ getPublicUrl: p => ({ data: { publicUrl: 'prova://' + p } }) }) },
        channel: () => kanal
      })
    },
    DERIN_CONFIG: { supabaseUrl: 'https://prova.test', supabasePublishableKey: 'prova' }
  };
  icerik.window = icerik;
  icerik.globalThis = icerik;

  const ctx = vm.createContext(icerik);
  vm.runInContext(kuyrukKaynak, ctx, { filename: 'radio-playlist-queue.js' });
  vm.runInContext(radyoKaynak, ctx, { filename: 'radyo.js' });
  await new Promise(done => setTimeout(done, 40));

  const metin = id => (dugumler.get(id) || {}).textContent || '';
  return {
    marka: metin('brand'),
    sub: metin('branch'),
    durum: metin('state'),
    liste: (dugumler.get('playlist') || {}).innerHTML || '',
    baslatGorunur: !(dugumler.get('start') || {}).hidden,
    saatler: metin('hours'),
    cihazKimligi: depo.get('derin_record_device_id') || null,
    pingler: cagrilar.filter(c => c.ad === 'radio_ping')
  };
}

test('ilk cihazdan açılışta yayın tanınır ve başlat düğmesi görünür', async () => {
  const s = await calistir({ ping: 'ok', parca: true, abonelik: 'gecerli' });
  assert.equal(s.marka, 'Mokka Coffee');
  assert.equal(s.sub, 'Alsancak');
  assert.equal(s.durum, '');
  assert.ok(s.liste.includes('Sabah Işığı'), 'çalma listesi çizilmeli');
  assert.ok(s.baslatGorunur, 'otomatik çalma için başlat düğmesi görünmeli');
  assert.ok(s.saatler.includes('09:00'), 'yayın saatleri yazılmalı');
  // Cihaz kimliği üretilip saklanmalı: aynı mekânda yeniden açan cihaz tanınır.
  assert.equal(s.cihazKimligi, 'cihaz-test-1');
  assert.equal(s.pingler.length, 1);
  assert.equal(s.pingler[0].p.p_device_id, 'cihaz-test-1');
  assert.equal(s.pingler[0].p.p_player_key, 'k-prova');
});

test('başka mekândaki cihazdan açılışta cihaz kilidi devreye girer', async () => {
  const s = await calistir({ ping: 'kilitli', parca: true, abonelik: 'gecerli' });
  assert.equal(s.marka, 'Bu cihaz yetkili değil');
  assert.match(s.durum, /başka bir cihaza kayıtlı/);
  assert.ok(!s.liste.includes('Sabah Işığı'), 'kilitliyken liste gösterilmez');
  assert.equal(s.baslatGorunur, false, 'kilitliyken başlat düğmesi çıkmaz');
  // Kilit reddedilince yayın sorgusu hiç yapılmaz: sunucu zaten kapıyı kapatır.
  assert.equal(s.pingler.length, 1);
});

test('yayın kaynağı/satırı olmayan markada oynatıcı "bu link tanınmadı" der', async () => {
  // radio_now_playing boş döner: markaya canlı yayın kaynağı atanmamış ya da
  // marka pasif. Kullanıcının bildirdiği ekranın birebir karşılığı.
  const s = await calistir({ ping: 'ok', parca: false, abonelik: 'gecerli' });
  assert.equal(s.marka, 'Geçersiz yayın anahtarı');
  assert.match(s.durum, /Bu link tanınmadı/);
  assert.ok(!s.liste.includes('Sabah Işığı'));
  assert.equal(s.baslatGorunur, false);
});

test('abonelik dolduysa oynatıcı yayını duraklatır', async () => {
  const s = await calistir({ ping: 'ok', parca: false, abonelik: 'bitti' });
  assert.equal(s.marka, 'Yayın duraklatıldı');
  assert.match(s.durum, /süresi doldu/);
});

test('abonelik hiç tanımlı değilse iletişim istenir', async () => {
  const s = await calistir({ ping: 'ok', parca: false, abonelik: 'yok' });

  assert.equal(s.marka, 'Yayın duraklatıldı');
  assert.match(s.durum, /abonelik tanımlı değil/);
});

test('sunucu anahtarı hiç tanımıyorsa yine "bu link tanınmadı" denir', async () => {
  const s = await calistir({ ping: 'ok', parca: false, abonelik: 'bos' });
  assert.equal(s.marka, 'Geçersiz yayın anahtarı');
  assert.match(s.durum, /Bu link tanınmadı/);
});

test('panel bağlantı sınaması cihaz kilidini yöneticinin tarayıcısına bağlamaz', () => {
  // Sınama aracı yalnızca iki okuma çağrısı yapar; radio_ping çağırırsa
  // yöneticinin tarayıcısı şubeye kilitlenir ve sahadaki cihaz dışarıda kalır.
  const kaynak = fs.readFileSync(path.join(KOK, 'radyo-yonetim.js'), 'utf8');
  const govde = kaynak.slice(kaynak.indexOf('async function baglantiSina'));
  const govdeSonu = govde.indexOf('function bosSlug');
  assert.ok(govdeSonu > 0);
  assert.ok(!govde.slice(0, govdeSonu).includes('radio_ping'), 'sınama radio_ping çağırmamalı');
  assert.ok(govde.includes("rpc('radio_now_playing'"));
  assert.ok(govde.includes("rpc('abonelik_durumu'"));
});
