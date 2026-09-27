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

// Sunucu yayın anahtarını uuid olarak bekler; prova da gerçekçi olsun.
const PROVA_ANAHTAR = 'a1b2c3d4-e5f6-4a7b-8c9d-0000000000aa';

const MARKA = {
  brand_id: 'b-prova-0001', brand_name: 'Mokka Coffee', player_label: 'Alsancak',
  open_time: '09:00:00', close_time: '22:00:00', folder_id: 'f1',
  folder_name: 'Öğleden Sonra', cover_path: null, shuffle: false,
  updated_at: '2026-09-27T10:00:00.000Z'
};
const PARCALAR = ['Sabah Işığı', 'Yavaş Yağmur'].map((title, i) => ({
  ...MARKA, track_id: 't' + i, title, storage_path: 'f1/p' + i + '.wav', sort_order: i
}));

// Oynatıcı yayın saatlerine göre açık/kapalı kararı verir; testin günün saatine
// göre değişmemesi için "şimdi"yi sabitliyoruz: İstanbul 10:00.
const SIMDI = new Date('2026-09-27T07:00:00.000Z');
function SahteDate(...args) {
  return args.length ? new Date(...args) : new Date(SIMDI.getTime());
}
SahteDate.now = () => SIMDI.getTime();
SahteDate.parse = Date.parse;
SahteDate.UTC = Date.UTC;
SahteDate.prototype = Date.prototype;

function dugum() {
  return {
    textContent: '', innerHTML: '', value: '', hidden: false, style: {}, dataset: {},
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
    // 'otomatik: true' kiosk cihazı taklit eder: tarayıcı sesli otomatik
    // çalmaya izin verir. Varsayılanda tarayıcı engeller.
    play: () => (senaryo.otomatik
      ? Promise.resolve()
      : Promise.reject(new Error('provada ses çalınmaz'))),
    pause() {}, load() {}
  });
  dugumler.set('audio', audio);

  const cagrilar = [];
  const depo = new Map(Object.entries(senaryo.depoBaslangic || {}));

  // Personelin liste seçimi, üç tabloyu okur (liste başlıkları, listenin
  // parçaları, parçaların dosya yolları). Hepsini taklit ediyoruz.
  const tabloVerisi = tabloAd => {
    if (tabloAd === 'brand_playlists') return senaryo.listeler || [];
    if (tabloAd === 'brand_playlist_tracks') return senaryo.listeParcalari || [];
    if (tabloAd === 'radio_tracks') return senaryo.studioParcalari || [];
    return [];
  };
  const tablo = tabloAd => {
    const zincir = {
      select: () => zincir, eq: () => zincir, order: () => zincir, in: () => zincir,
      then: (res, red) => Promise.resolve({ data: tabloVerisi(tabloAd), error: null }).then(res, red)
    };
    return zincir;
  };
  const kanal = { on() { return kanal; }, subscribe() { return kanal; } };

  const rpc = (ad, p) => {
    cagrilar.push({ ad, p });
    if (ad === 'radio_ping') {
      if (senaryo.ping === 'kilitli') return [{ ok: false, reason: 'locked_to_other_device' }];
      if (senaryo.ping === 'taninmiyor') return [{ ok: false, reason: 'invalid_key' }];
      return [{ ok: true }];
    }
    if (ad === 'radio_now_report') return [{ ok: true }];
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
    console, Date: SahteDate, Math, JSON, Promise, Object, Array, String, Number, isFinite, RegExp, Intl,
    URLSearchParams,
    setTimeout: (fn) => setTimeout(fn, 0),
    clearTimeout,
    setInterval: () => 0,
    clearInterval: () => {},
    location: { search: '?key=' + (senaryo.key || PROVA_ANAHTAR) },
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
          // 'bildirimHatasi': radio_now_report ve alanları henüz eklenmemiş gibi
          // davranır; oynatıcı bunu yok sayıp çalmaya devam etmeli.
          if (senaryo.bildirimHatasi && ad === 'radio_now_report') {
            return Promise.resolve({ data: null, error: { message: 'column "now_title" does not exist' } });
          }
          // 'listeAlaniYok': sunucu henüz supabase/radio-liste-bildirimi.sql ile
          // güncellenmemiş; beş parametreli çağrıyı tanımaz, eski imzayı tanır.
          if (senaryo.listeAlaniYok && ad === 'radio_now_report' && p && 'p_playlist_id' in p) {
            return Promise.resolve({ data: null, error: { message: 'PGRST202: could not find the function public.radio_now_report' } });
          }
          return Promise.resolve({ data: rpc(ad, p || {}), error: null });
        },
        from: tablo,
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
  const dugumAl = id => dugumler.get(id);
  // Ekranı okurken ANLIK durumu vermeliyiz: seçim yapıldıktan sonra okunan
  // değer, seçimden önceki hâli olmamalı.
  return {
    get marka() { return metin('brand'); },
    get sub() { return metin('branch'); },
    get durum() { return metin('state'); },
    get tani() { return metin('tani'); },
    get liste() { return (dugumAl('playlist') || {}).innerHTML || ''; },
    get baslatGorunur() { return !(dugumAl('start') || {}).hidden; },
    get saatler() { return metin('hours'); },
    get cihazKimligi() { return depo.get('derin_record_device_id') || null; },
    get pingler() { return cagrilar.filter(c => c.ad === 'radio_ping'); },
    get bildirimler() { return cagrilar.filter(c => c.ad === 'radio_now_report'); },
    // Liste seçici
    get secenekler() { return (dugumAl('liste-sec') || {}).innerHTML || ''; },
    get secili() { return (dugumAl('liste-sec') || {}).value || ''; },
    get listeGorunur() {
      const kap = dugumAl('liste-kap');
      return !!(kap && kap.hidden === false);
    },
    get kayitliListe() {
      return depo.get('derin_record_liste_' + (senaryo.key || PROVA_ANAHTAR)) || null;
    },
    get calinan() { return audio.src; },
    // Personel seçim yapmış gibi davranır (onchange tetiklenir).
    async sec(kimlik) {
      const kutu = dugumAl('liste-sec');
      kutu.value = kimlik;
      await kutu.onchange();
      await new Promise(done => setTimeout(done, 20));
    }
  };
}

test('ilk cihazdan açılışta yayın tanınır ve başlat düğmesi görünür', async () => {
  const s = await calistir({ ping: 'ok', parca: true, abonelik: 'gecerli' });
  assert.equal(s.marka, 'Mokka Coffee');
  assert.equal(s.sub, 'Alsancak');
  assert.ok(s.liste.includes('Sabah Işığı'), 'çalma listesi çizilmeli');
  assert.ok(s.saatler.includes('09:00'), 'yayın saatleri yazılmalı');
  // Cihaz kimliği üretilip saklanmalı: aynı mekânda yeniden açan cihaz tanınır.
  assert.equal(s.cihazKimligi, 'cihaz-test-1');
  assert.equal(s.pingler.length, 1);
  assert.equal(s.pingler[0].p.p_device_id, 'cihaz-test-1');
  assert.equal(s.pingler[0].p.p_player_key, PROVA_ANAHTAR);
  // Oynatıcı açılışta kendiliğinden başlatmayı dener; tarayıcı engellediği için
  // başlat düğmesi çıkar ve bunu açıkça söyler.
  assert.ok(s.baslatGorunur, 'ses engellenince başlat düğmesi görünmeli');
  assert.match(s.durum, /otomatik çalmayı engelledi/);
});

// Kiosk olarak işaretlenmiş cihazda (tarayıcı sesli otomatik çalmaya izin verir)
// hiç kimse düğmeye basmak zorunda kalmaz: yayın sayfa açılır açılmaz başlar.
test('kiosk cihazda yayın kendiliğinden başlar, başlat düğmesi hiç çıkmaz', async () => {
  const s = await calistir({ ping: 'ok', parca: true, abonelik: 'gecerli', otomatik: true });
  assert.equal(s.baslatGorunur, false, 'düğme çıkmamalı');
  assert.equal(s.durum, '');
  assert.equal(s.tani, '');
  assert.ok(s.liste.includes('Sabah Işığı'));
});

test('eksik kopyalanmış bağlantı sunucuya hiç gitmeden yakalanır', async () => {
  // Panelde anahtar boş kalmışsa kopyalanan link "...?key=null" olur. Eskiden
  // bu sunucuya gidip 400 alıyor, ekranda anlamsız bir bağlantı hatası ve boşuna
  // tekrar denemeler görünüyordu.
  const s = await calistir({ key: 'null', ping: 'ok', parca: true, abonelik: 'gecerli' });
  assert.equal(s.marka, 'Bağlantı eksik kopyalanmış');
  assert.match(s.durum, /LİNKİ KOPYALA/);
  assert.equal(s.tani, 'Teşhis kodu: anahtar-bozuk');
  assert.equal(s.pingler.length, 0, 'sunucuya hiç sorulmamalı');
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

test('anahtar geçerli ama yayın zinciri kopuksa oynatıcı doğru halkayı gösterir', async () => {
  // radio_now_playing boş döner, oysa radio_ping anahtarı tanıyor ve abonelik
  // geçerli: yani kopukluk markada (pasif) ya da canlı yayın kaynağında.
  // Kullanıcının gördüğü ekran buydu; eskiden yalnızca "bu link tanınmadı"
  // yazdığı için ekip yanlış halkaya bakıyordu.
  const s = await calistir({ ping: 'ok', parca: false, abonelik: 'gecerli' });
  assert.equal(s.marka, 'Yayın zinciri kopuk');
  assert.match(s.durum, /marka yayında değil ya da canlı yayın kaynağı atanmamış/);
  assert.equal(s.tani, 'Teşhis kodu: marka-pasif-veya-kaynak-yok');
  assert.ok(!s.liste.includes('Sabah Işığı'));
  assert.equal(s.baslatGorunur, false);
});

test('sunucu anahtarı hiç tanımıyorsa oynatıcı bunu ayrı söyler', async () => {
  const s = await calistir({ ping: 'taninmiyor', parca: false, abonelik: 'bos' });
  assert.equal(s.marka, 'Yayın anahtarı tanınmıyor');
  assert.match(s.durum, /sistemde yok/);
  assert.equal(s.tani, 'Teşhis kodu: anahtar-yok');
  // Hata ekranında "henüz şarkı eklenmemiş" yazısı çıkmamalı: yayın çalışıyormuş
  // gibi okunuyor.
  assert.equal(s.liste, '');
});

test('teşhis kodu abonelik arızasını da ayırır', async () => {
  const yok = await calistir({ ping: 'ok', parca: false, abonelik: 'yok' });
  assert.equal(yok.tani, 'Teşhis kodu: abonelik-yok');
  const bitti = await calistir({ ping: 'ok', parca: false, abonelik: 'bitti' });
  assert.equal(bitti.tani, 'Teşhis kodu: abonelik-bitmis');
});

test('yayın çalışıyorsa ekranda teşhis kodu kalmaz', async () => {
  const s = await calistir({ ping: 'ok', parca: true, abonelik: 'gecerli', otomatik: true });
  assert.equal(s.tani, '');
  assert.equal(s.durum, '');
});

// ---- Personelin çalma listesi seçimi ----------------------------------
// Kafedeki personel, yönetimin atadığı yayının yanında markanın kendi
// listelerinden birini seçip çaldırabilir; seçim cihazda saklanır.

const LISTELER = [
  { id: 'L1', name: 'Sabah Kahve', shuffle: false },
  { id: 'L2', name: 'Akşam Sesi', shuffle: true }
];
const LISTE_PARCALARI = [{ track_id: 't9', sort_order: 0 }];
const STUDIO_PARCALARI = [{ id: 't9', title: 'Filtre Kahve', storage_path: 'listeler/filtre.wav' }];

test('personel kendi çalma listesini seçip çaldırabilir ve seçim saklanır', async () => {
  const s = await calistir({
    ping: 'ok', parca: true, abonelik: 'gecerli', otomatik: true,
    listeler: LISTELER, listeParcalari: LISTE_PARCALARI, studioParcalari: STUDIO_PARCALARI
  });
  assert.ok(s.listeGorunur, 'marka listeleri okunabiliyorsa seçici görünür');
  assert.ok(s.secenekler.includes('OTOMATİK'), 'otomatik seçeneği her zaman olmalı');
  assert.ok(s.secenekler.includes('Sabah Kahve') && s.secenekler.includes('Akşam Sesi'));
  assert.equal(s.secili, '', 'başlangıçta otomatik seçili');

  await s.sec('L1');
  assert.equal(s.kayitliListe, 'L1', 'seçim cihazda saklanmalı');
  assert.ok(s.liste.includes('Filtre Kahve'), 'seçilen listenin parçaları çizilmeli');
  assert.ok(s.calinan.includes('listeler/filtre.wav'), 'seçilen listenin parçası çalınmalı');

  // Otomatiğe dönüş yönetimin atadığı kaynağa döner.
  await s.sec('');
  assert.equal(s.kayitliListe, null, 'otomatik seçilince kayıt silinmeli');
  assert.ok(s.liste.includes('Sabah Işığı'));
});

test('listenin kendi sırası korunur ve karıştırma listenin ayarından gelir', async () => {
  const s = await calistir({
    ping: 'ok', parca: true, abonelik: 'gecerli', otomatik: true,
    listeler: [{ id: 'L3', name: 'Sıralı Liste', shuffle: false }],
    listeParcalari: [{ track_id: 'b', sort_order: 0 }, { track_id: 'a', sort_order: 1 }],
    studioParcalari: [
      { id: 'a', title: 'A Parçası', storage_path: 'l/a.wav' },
      { id: 'b', title: 'B Parçası', storage_path: 'l/b.wav' }
    ]
  });
  await s.sec('L3');
  assert.ok(s.calinan.includes('l/b.wav'), 'listenin ilk parçası çalınmalı');
  assert.ok(s.liste.indexOf('B Parçası') < s.liste.indexOf('A Parçası'), 'sıra listeden gelmeli');
});

test('marka listeleri okunamıyorsa seçici çıkmaz, yayın eskisi gibi çalar', async () => {
  // Yönetim brand_playlists tablosunu oynatıcıya açmadıysa sorgu boş döner;
  // bu durumda seçici hiç görünmemeli ve otomatik yayın bozulmamalı.
  const s = await calistir({ ping: 'ok', parca: true, abonelik: 'gecerli', otomatik: true, listeler: [] });
  assert.equal(s.listeGorunur, false);
  assert.ok(s.liste.includes('Sabah Işığı'), 'otomatik yayın çalışmaya devam etmeli');
});

test('açılışta kayıtlı liste seçimi kendiliğinden uygulanır', async () => {
  const s = await calistir({
    ping: 'ok', parca: true, abonelik: 'gecerli', otomatik: true,
    listeler: LISTELER, listeParcalari: LISTE_PARCALARI, studioParcalari: STUDIO_PARCALARI,
    depoBaslangic: { ['derin_record_liste_' + PROVA_ANAHTAR]: 'L2' }
  });
  assert.equal(s.secili, 'L2', 'seçici kayıtlı listeyi göstermeli');
  assert.ok(s.liste.includes('Filtre Kahve'), 'kayıtlı listenin parçaları kurulmalı');
});

test('silinmiş liste kayıtlıysa otomatiğe düşülür', async () => {
  const s = await calistir({
    ping: 'ok', parca: true, abonelik: 'gecerli', otomatik: true,
    listeler: [{ id: 'L9', name: 'Yeni Liste', shuffle: false }],
    listeParcalari: LISTE_PARCALARI, studioParcalari: STUDIO_PARCALARI,
    depoBaslangic: { ['derin_record_liste_' + PROVA_ANAHTAR]: 'silinmis-liste' }
  });
  assert.equal(s.secili, '', 'geçersiz kayıt yok sayılmalı');
  assert.ok(s.liste.includes('Sabah Işığı'), 'otomatik yayın çalınmalı');
});

// ---- Çalan parça bildirimi ---------------------------------------------
// Panel "şu an çalan" bilgisini yalnızca oynatıcı bildirirse gösterebilir.

test('oynatıcı hangi parçayı çaldığını sunucuya bildirir', async () => {
  const s = await calistir({ ping: 'ok', parca: true, abonelik: 'gecerli', otomatik: true });
  assert.equal(s.bildirimler.length, 1);
  assert.equal(s.bildirimler[0].p.p_title, 'Sabah Işığı');
  assert.equal(s.bildirimler[0].p.p_track_id, 't0');
  assert.equal(s.bildirimler[0].p.p_player_key, PROVA_ANAHTAR);
  // Yönetimin atadığı kaynak bir klasörse bildirilecek bir liste yoktur.
  assert.equal(s.bildirimler[0].p.p_playlist_id, null);
  assert.equal(s.bildirimler[0].p.p_playlist_name, null);
});

test('personel listesinden çalınan parça ve liste adı bildirilir', async () => {
  const s = await calistir({
    ping: 'ok', parca: true, abonelik: 'gecerli', otomatik: true,
    listeler: LISTELER, listeParcalari: LISTE_PARCALARI, studioParcalari: STUDIO_PARCALARI
  });
  await s.sec('L1');
  const son = s.bildirimler[s.bildirimler.length - 1];
  assert.equal(son.p.p_title, 'Filtre Kahve', 'seçilen listenin parçası bildirilmeli');
  // Panel "personel başka liste mi seçti" sorusunu ancak bu iki alanla cevaplar.
  assert.equal(son.p.p_playlist_id, 'L1');
  assert.equal(son.p.p_playlist_name, 'Sabah Kahve');
});

// Personel otomatiğe döndüğünde sunucuda liste bilgisi kalmamalı; yoksa panel
// hâlâ "personel şu listeyi seçmiş" yazar.
test('otomatiğe dönünce liste bildirimi temizlenir', async () => {
  const s = await calistir({
    ping: 'ok', parca: true, abonelik: 'gecerli', otomatik: true,
    listeler: LISTELER, listeParcalari: LISTE_PARCALARI, studioParcalari: STUDIO_PARCALARI
  });
  await s.sec('L1');
  assert.equal(s.bildirimler[s.bildirimler.length - 1].p.p_playlist_id, 'L1');

  await s.sec('');
  const son = s.bildirimler[s.bildirimler.length - 1];
  assert.equal(son.p.p_playlist_id, null, 'liste bilgisi silinmeli');
  assert.equal(son.p.p_playlist_name, null);
  assert.ok(son.p.p_title, 'otomatik yayının parçası yine bildirilmeli');
});

// Boş bir liste seçilirse çalınacak parça yoktur: sunucuda eski parça adı asılı
// kalmamalı, yoksa panel hâlâ o parça çalıyormuş gibi gösterir.
test('boş liste seçilince parça bildirimi temizlenir', async () => {
  const s = await calistir({
    ping: 'ok', parca: true, abonelik: 'gecerli', otomatik: true,
    listeler: LISTELER, listeParcalari: [], studioParcalari: []
  });
  await s.sec('L1');
  assert.match(s.durum, /henüz parça yok/);
  const son = s.bildirimler[s.bildirimler.length - 1];
  assert.equal(son.p.p_title, null);
  assert.equal(son.p.p_track_id, null);
});

// supabase/radio-liste-bildirimi.sql henüz çalıştırılmadıysa sunucu beş
// parametreli çağrıyı reddeder. Oynatıcı o zaman eski imzayla tekrar dener:
// panelde parça adı görünmeye devam eder, kaybedilen yalnızca liste satırı olur.
test('liste alanları sunucuda yoksa eski imzayla bildirim yapılır', async () => {
  const s = await calistir({
    ping: 'ok', parca: true, abonelik: 'gecerli', otomatik: true, listeAlaniYok: true,
    listeler: LISTELER, listeParcalari: LISTE_PARCALARI, studioParcalari: STUDIO_PARCALARI
  });
  await s.sec('L1');
  const yeni = s.bildirimler.filter(c => 'p_playlist_id' in c.p);
  assert.equal(yeni.length, 0, 'liste alanı olmayan sunucuya liste parametresi gönderilmemeli');
  const son = s.bildirimler[s.bildirimler.length - 1];
  assert.equal(son.p.p_title, 'Filtre Kahve', 'parça adı yine bildirilmeli');
  assert.ok(!('p_playlist_id' in son.p));
  // Yayın bundan etkilenmemeli.
  assert.equal(s.durum, '');
  assert.equal(s.baslatGorunur, false);
});

test('bildirim yapılamasa da yayın çalmaya devam eder', async () => {
  // supabase/radio-calan-parca.sql çalıştırılmadıysa sunucu hata döner; bu,
  // sahadaki yayını etkilememeli.
  const s = await calistir({ ping: 'ok', parca: true, abonelik: 'gecerli', otomatik: true, bildirimHatasi: true });
  assert.equal(s.durum, '');
  assert.equal(s.tani, '');
  assert.equal(s.baslatGorunur, false);
  assert.ok(s.liste.includes('Sabah Işığı'));
  assert.ok(s.calinan.includes('f1/p0.wav'));
});

test('teşhis satırı ve liste seçici oynatıcı sayfasında bulunur', () => {
  const sayfa = fs.readFileSync(path.join(KOK, 'radyo.html'), 'utf8');
  assert.match(sayfa, /id="tani"/);
  assert.match(sayfa, /id="liste-kap"/);
  assert.match(sayfa, /id="liste-sec"/);
  // Sürüm damgası her değişiklikte tazelenmeli, yoksa tarayıcı eski dosyayı
  // önbellekten çalar ve sahadaki düzeltme görünmez.
  assert.match(sayfa, /radyo\.js\?v=\d{8}[a-z]/);
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
