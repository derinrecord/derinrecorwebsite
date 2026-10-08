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

// Supabase'de kurulmamış bir fonksiyonu çağırmak hata döndürür (PGRST202).
// Provada da "bu fonksiyon sunucuda yok" hâlini bu işaretle taklit ederiz ki
// oynatıcının eski yola düşmesi gerçekte olduğu gibi sınansın.
const FONKSIYON_YOK = Symbol('fonksiyon-yok');

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
      if (id === 'start') d.hidden = true;      // gerçek sayfada <button id="start" hidden>
      if (id === 'kod-kap') d.hidden = true;    // ve <form id="kod-kap" hidden>
      dugumler.set(id, d);
    }
    return dugumler.get(id);
  };
  // Oynatıcının bağladığı ses olaylarını kaydederiz: gerçek tarayıcıda bu
  // olayları tarayıcı yollar, provada test kendisi tetikler.
  const sesDinleyici = new Map();
  // Kaç kez çalma denendi? Normal bağlantıda bu sayı açılışta sıfır kalmalı:
  // yayını yalnız kişi başlatır.
  let calmaDenemesi = 0;
  const audio = Object.assign(dugum(), {
    paused: true, duration: 0, currentTime: 0, volume: 1, src: '',
    addEventListener: (ad, fn) => { sesDinleyici.set(ad, fn); },
    // 'otomatik: true' tarayıcının sesli otomatik çalmaya izin verdiği cihazı
    // taklit eder (kiosk kurulumundaki Chrome bayrağı). Varsayılanda engeller.
    play: () => {
      calmaDenemesi++;
      return senaryo.otomatik
        ? Promise.resolve()
        : Promise.reject(new Error('provada ses çalınmaz'));
    },
    pause() {}, load() {}
  });
  dugumler.set('audio', audio);

  const cagrilar = [];
  const sayaclar = [];
  // Anons sesleri: gerçek sayfada <audio> açılır; provada yalnız hangi dosyanın
  // çalınmak istendiğini kaydederiz.
  const anonsSesleri = [];
  const depo = new Map(Object.entries(senaryo.depoBaslangic || {}));

  // Personelin liste seçimi, üç tabloyu okur (liste başlıkları, listenin
  // parçaları, parçaların dosya yolları). Hepsini taklit ediyoruz.
  const okumaSayaci = new Map();
  const tabloVerisi = tabloAd => {
    const n = (okumaSayaci.get(tabloAd) || 0) + 1;
    okumaSayaci.set(tabloAd, n);
    if (tabloAd === 'brand_playlists') {
      // 'listelerSonra': yönetim panelden adı değiştirdi ya da listeyi sildi;
      // ikinci okumada yeni hâli gelir (cihazın tazeleme davranışını sınar).
      if (senaryo.listelerSonra && n > 1) return senaryo.listelerSonra;
      return senaryo.listeler || [];
    }
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
      // Şube kodu kapısı (supabase/radio-sube-kodu.sql). 'kodDogru' verilirse
      // sunucu gerçekte olduğu gibi davranır: kodsuz çağrı "code_required",
      // yanlış kod "invalid_code", doğru kod geçer.
      if (senaryo.kodDogru) {
        const gelen = String((p && p.p_kod) || '').toUpperCase();
        if (!gelen) return [{ ok: false, reason: 'code_required' }];
        if (gelen !== String(senaryo.kodDogru).toUpperCase()) {
          return [{ ok: false, reason: 'invalid_code' }];
        }
      }
      return [{ ok: true }];
    }
    // Konum kanıtı (radio-sube-kodu.sql): reddedilen cihazın konumu ayrı bir
    // fonksiyonla yazılır, yoklama sayacı artmaz.
    if (ad === 'radio_kanit') return [true];
    if (ad === 'radio_now_report') return [{ ok: true }];
    // 'baslangicParca': yönetim yayını o parçadan başlattı (panelden seçilen
    // başlangıç parçası sunucudan her satırla birlikte gelir).
    // 'yayinDamgasi': yönetim yayını yeniden atadığında damga ilerler; cihaz
    // yalnız damga değiştiğinde kuyruğu baştan kurar.
    if (ad === 'radio_now_playing') {
      if (!senaryo.parca) return [];
      return PARCALAR.map(x => Object.assign({}, x, {
        start_track_id: senaryo.baslangicParca || null,
        updated_at: senaryo.yayinDamgasi || x.updated_at
      }));
    }
    if (ad === 'abonelik_durumu') {
      // 'bos': sunucu anahtarı hiç tanımıyor (boş dizi). 'yok': anahtar tanınıyor
      // ama abonelik kaydı yok, sunucu { gecerli:false, durum:'yok' } döner.
      if (senaryo.abonelik === 'bos') return [];
      if (senaryo.abonelik === 'yok') return [{ gecerli: false, durum: 'yok' }];
      if (senaryo.abonelik === 'bitti') return [{ gecerli: false, durum: 'bitti' }];
      return [{ gecerli: true, durum: 'aktif' }];
    }
    // 'listelerRpc': marka listeleri sunucudan gelir (supabase/radio-erisim.sql).
    // Verilmezse fonksiyon kurulmamış sayılır ve oynatıcı eski tablo okumasına düşer.
    if (ad === 'radio_listeler') return senaryo.listelerRpc || FONKSIYON_YOK;
    // 'subeListeleri' (supabase/radio-sube-listeleri.sql): şubeye yüklenen
    // listeler. Boş dizi "yönetim bu şubeye liste yüklemedi" demektir ve şube
    // susar; senaryo hiç verilmezse fonksiyon sunucuda yokmuş gibi davranılır.
    if (ad === 'radio_sube_listeler') {
      if (senaryo.subeListeleri === undefined) return FONKSIYON_YOK;
      return senaryo.subeListeleri;
    }
    // 'anonslar': yoklamayla gelen anonslar. Sunucu yalnız p_since'ten sonrasını
    // döndürür; aynı süzgeci burada da uygularız ki cihazın damgayı ilerlettiği
    // (aynı anonu iki kez çalmadığı) gerçekten sınansın.
    if (ad === 'radio_anonslar') {
      if (!senaryo.anonslar) return FONKSIYON_YOK;
      return senaryo.anonslar.filter(a => !p.p_since || a.created_at > p.p_since);
    }
    // 'yayinDurumu' (supabase/radio-yayin-durdurma.sql): boş cevabın sebebini
    // ayırır. 'kaynak-yok' yönetim "YAYINI DURDUR"a bastı demektir ve cihaz
    // susmamalıdır; diğer hâllerde yayın kesilir. Senaryo verilmezse fonksiyon
    // sunucuda yokmuş gibi davranılır (boş dizi).
    if (ad === 'radio_yayin_durumu') {
      if (senaryo.yayinDurumu === 'yok') return [];
      if (senaryo.yayinDurumu === 'marka-pasif') return [{ marka_aktif: false, gecerli: true, kaynak_var: false }];
      if (senaryo.yayinDurumu === 'abonelik-yok') return [{ marka_aktif: true, gecerli: false, kaynak_var: false }];
      if (senaryo.yayinDurumu === 'kaynak-yok') return [{ marka_aktif: true, gecerli: true, kaynak_var: false }];
      return [{ marka_aktif: true, gecerli: true, kaynak_var: true }];
    }
    return [];
  };

  // Konum kanıtı: tarayıcı konum izni vermezse oynatıcı /api/konum-coz'a sorar.
  // 'konumApi' senaryosu o uç noktanın cevabını taklit eder; istek adresleri
  // kaydedilir ki "gerçekten soruldu mu" sınanabilsin.
  const konumIstekleri = [];
  const fetchSahte = senaryo.konumApi ? adres => {
    konumIstekleri.push(String(adres));
    return Promise.resolve({ ok: true, json: () => Promise.resolve(senaryo.konumApi) });
  } : undefined;

  const icerik = {
    console, Date: SahteDate, Math, JSON, Promise, Object, Array, String, Number, isFinite, RegExp, Intl,
    URLSearchParams, fetch: fetchSahte,
    setTimeout: (fn) => setTimeout(fn, 0),
    clearTimeout,
    // Zamanlayıcılar kaydedilir ama kendiliğinden çalışmaz: test hangi
    // davranışı sınadığını bilerek tetikler (tikla).
    setInterval: (fn, ms) => { sayaclar.push({ fn, ms }); return sayaclar.length; },
    clearInterval: () => {},
    // 'kiosk: true' şube cihazının dokunuşsuz kurulumunu taklit eder: bağlantıda
    // kiosk=1 işareti olur ve yayın sayfa açılışında başlar.
    location: { search: '?key=' + (senaryo.key || PROVA_ANAHTAR) + (senaryo.kiosk ? '&kiosk=1' : '') },
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
          // 'gecmisHatasi': olay günlüğü tablosu henüz kurulmamış gibi davranır;
          // oynatıcı bunu yok sayıp çalmaya devam etmeli.
          if (senaryo.gecmisHatasi && ad === 'radio_log_event') {
            return Promise.reject(new Error('relation "radio_player_events" does not exist'));
          }
          if (senaryo.listeAlaniYok && ad === 'radio_now_report' && p && 'p_playlist_id' in p) {
            return Promise.resolve({ data: null, error: { message: 'PGRST202: could not find the function public.radio_now_report' } });
          }
          const sonuc = rpc(ad, p || {});
          if (sonuc === FONKSIYON_YOK) {
            return Promise.resolve({ data: null, error: { message: 'PGRST202: could not find the function' } });
          }
          return Promise.resolve({ data: sonuc, error: null });
        },
        from: tablo,
        storage: { from: () => ({ getPublicUrl: p => ({ data: { publicUrl: 'prova://' + p } }) }) },
        channel: () => kanal
      })
    },
    // Anonslar sunucudan yoklamayla gelir; sesi gerçek sayfada tarayıcı çalar.
    Audio: function (src) {
      anonsSesleri.push(src);
      return { play: () => Promise.resolve(), pause() {}, onended: null, onerror: null };
    },
    DERIN_CONFIG: { supabaseUrl: 'https://prova.test', supabasePublishableKey: 'prova' },
    // Ses, kapak ve anonslar R2'den gelir (r2-depo.js). Provada ağa çıkılmaz;
    // adresler sahte önekle üretilir, böylece hangi yolun istendiği görülür.
    DerinR2: { adres: (kova, p) => (p ? 'prova://' + kova + '/' + p : null) }
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
    // Bağlantı geçmişi: oynatıcının sunucuya bıraktığı olaylar.
    get olaylar() { return cagrilar.filter(c => c.ad === 'radio_log_event').map(c => c.p || {}); },
    olayTuru(kind) { return this.olaylar.filter(o => o.p_kind === kind); },
    // Tarayıcı sesi gerçekten çalmaya başladı ('playing' olayı).
    async yayinda() {
      const f = sesDinleyici.get('playing');
      if (f) await f();
      await new Promise(done => setTimeout(done, 20));
    },
    // Kafe cihazdan yayını durdurur: oynatıcı bunu kendisi istemedi.
    async cihazdanDurdur() {
      const f = sesDinleyici.get('pause');
      if (f) await f();
      await new Promise(done => setTimeout(done, 20));
    },
    // Parça sonuna geldi: tarayıcı 'pause' yollar ama yayın durmamıştır.
    async parcaBitti() {
      audio.ended = true; audio.duration = 180; audio.currentTime = 180;
      const f = sesDinleyici.get('pause');
      if (f) await f();
      await new Promise(done => setTimeout(done, 20));
    },
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
    // Yoklamayla gelip çalınan anons dosyaları.
    get anonsSesleri() { return anonsSesleri.slice(); },
    get calmaDenemesi() { return calmaDenemesi; },
    // Şube kodu kapısı: form görünür mü, girilen kod ne, cihazda saklandı mı?
    get kodKapisi() { return al('kod-kap').hidden === false; },
    get kayitliKod() { return depo.get('derin_record_kod_' + (senaryo.key || PROVA_ANAHTAR)) || null; },
    get konumIstekleri() { return konumIstekleri.slice(); },
    get kanitlar() { return cagrilar.filter(c => c.ad === 'radio_kanit').map(c => c.p || {}); },
    // Personel kodu yazıp DOĞRULA'ya basmış gibi davranır (form gönderimi).
    async koduGir(deger) {
      // al(): oynatıcının document.getElementById'iyle AYNI düğümü verir;
      // ayrı bir nesne üretilirse yazdığımız kod oynatıcıya ulaşmaz.
      al('kod-gir').value = deger;
      const kap = al('kod-kap');
      if (kap.onsubmit) await kap.onsubmit({ preventDefault() {} });
      await new Promise(done => setTimeout(done, 40));
    },
    // "YAYINI BAŞLAT" düğmesine dokunulmuş gibi davranır.
    async basla() {
      const d = dugumAl('start');
      if (d && d.onclick) await d.onclick();
      await new Promise(done => setTimeout(done, 20));
    },
    // Personel seçim yapmış gibi davranır (onchange tetiklenir).
    async sec(kimlik) {
      const kutu = dugumAl('liste-sec');
      kutu.value = kimlik;
      await kutu.onchange();
      await new Promise(done => setTimeout(done, 20));
    },
    // Belirli aralıkla kurulan bütün zamanlayıcıları bir kez çalıştırır:
    // "cihaz gün boyu açık kaldığında ne olur" sorusunu sınar.
    async tikla(ms) {
      for (const s of sayaclar.filter(x => x.ms === ms)) await s.fn();
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
  // Açılışta ses hiç denenmez: sayfa açıldı diye müzik başlamaz, düğme bekler.
  assert.equal(s.calmaDenemesi, 0, 'sayfa açılışında çalma denenmemeli');
  assert.ok(s.baslatGorunur, 'başlat düğmesi görünmeli');
  assert.match(s.durum, /Başlatmak için/);

  // Düğmeye basılınca çalma denenir; bu senaryoda tarayıcı engellediği için
  // düğme yerinde kalır ve sebebini söyler.
  await s.basla();
  assert.equal(s.calmaDenemesi, 1, 'düğmeye basınca çalma denenmeli');
  assert.ok(s.baslatGorunur, 'tarayıcı engellediğinde düğme görünür kalmalı');
  assert.match(s.durum, /otomatik çalmayı engelledi/);
});

// Kiosk olarak işaretlenmiş cihazda (tarayıcı sesli otomatik çalmaya izin verir)
// hiç kimse düğmeye basmak zorunda kalmaz: yayın sayfa açılır açılmaz başlar.
test('kiosk cihazda yayın kendiliğinden başlar, başlat düğmesi hiç çıkmaz', async () => {
  const s = await calistir({ ping: 'ok', parca: true, abonelik: 'gecerli', otomatik: true, kiosk: true });
  assert.equal(s.baslatGorunur, false, 'düğme çıkmamalı');
  assert.equal(s.calmaDenemesi, 1, 'kiosk cihazda yayın açılışta başlar');
  assert.equal(s.durum, '');
  assert.equal(s.tani, '');
  assert.ok(s.liste.includes('Sabah Işığı'));
});

// Panelden "şu parçadan başlat" denmişse yayın o parçadan başlar; listenin geri
// kalanı kendi sırasında devam eder.
test('yönetim bir parçadan başlattıysa kuyruk o parçadan başlar', async () => {
  const s = await calistir({
    ping: 'ok', parca: true, abonelik: 'gecerli', otomatik: true, kiosk: true,
    baslangicParca: 't1'
  });
  assert.ok(s.calinan.includes('f1/p1.wav'), 'ikinci parça ilk çalınan olmalı');

  const bastan = await calistir({ ping: 'ok', parca: true, abonelik: 'gecerli', otomatik: true, kiosk: true });
  assert.ok(bastan.calinan.includes('f1/p0.wav'), 'başlangıç parçası yoksa kuyruk baştan başlar');
});

// Tarayıcı sesli otomatik çalmaya izin verse bile kiosk işareti olmayan bağlantı
// ses çıkarmaz: panelden linke bakan yöneticinin bilgisayarında müzik patlamasın.
test('tarayıcı izin verse de normal bağlantıda yayın kendiliğinden başlamaz', async () => {
  const s = await calistir({ ping: 'ok', parca: true, abonelik: 'gecerli', otomatik: true });
  assert.equal(s.calmaDenemesi, 0, 'izin olsa bile açılışta çalmamalı');
  assert.ok(s.baslatGorunur, 'başlat düğmesi görünmeli');
  assert.ok(s.liste.includes('Sabah Işığı'), 'ne çalacağı yine görünmeli');
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

// Cihaz kilidi sunucuya taşındığında (radio-baglanti-korumasi.sql) kilitli cihaz
// artık içerik de alamaz: çağrı hata değil BOŞ döner. O anda yanlış teşhis
// ("yayın zinciri kopuk") yazılırsa ekip markada/kaynakta arar; doğru ekran
// kilit ekranıdır.
test('kilitliyken içerik boş dönerse yanlış teşhis yazılmaz', async () => {
  const s = await calistir({ ping: 'kilitli', parca: false, abonelik: 'gecerli' });
  assert.equal(s.marka, 'Bu cihaz yetkili değil');
  assert.match(s.durum, /başka bir cihaza kayıtlı/);
  assert.ok(!/zinciri kopuk|marka yayında değil/.test(s.durum + s.marka), 'kaynak arızası gibi gösterilmemeli');
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
  const s = await calistir({ ping: 'ok', parca: true, abonelik: 'gecerli', otomatik: true, kiosk: true });
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
  const s = await calistir({ ping: 'ok', parca: true, abonelik: 'gecerli', otomatik: true, kiosk: true });
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
    ping: 'ok', parca: true, abonelik: 'gecerli', otomatik: true, kiosk: true,
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

// Yönetim panelden bir listeyi yeniden adlandırdığında kafedeki cihaz gün boyu
// açık kalsa da seçici yeni adı göstermeli; personelin seçimi ve çalan parça
// bundan etkilenmemeli.
test('liste adı sonradan değişirse cihazdaki seçici kendiliğinden tazelenir', async () => {
  const s = await calistir({
    ping: 'ok', parca: true, abonelik: 'gecerli', otomatik: true,
    listeler: LISTELER, listeParcalari: LISTE_PARCALARI, studioParcalari: STUDIO_PARCALARI,
    listelerSonra: [
      { id: 'L1', name: 'Öğle Molası', shuffle: false },
      { id: 'L2', name: 'Akşam Sesi', shuffle: true }
    ]
  });
  await s.sec('L1');
  const calan = s.calinan;

  await s.tikla(600000);
  assert.ok(s.secenekler.includes('Öğle Molası'), 'yeni ad seçicide görünmeli');
  assert.ok(!s.secenekler.includes('Sabah Kahve'), 'eski ad kalmamalı');
  assert.equal(s.secili, 'L1', 'personelin seçimi korunmalı');
  assert.equal(s.calinan, calan, 'çalan parça değişmemeli');
  assert.ok(s.liste.includes('Filtre Kahve'), 'kuyruk aynı kalmalı');

  // Bildirim de yeni adı taşımalı: panel adı sunucudaki kayıttan da okuyor ama
  // cihazın kendi raporu da güncel olmalı.
  await s.tikla(60000);
  assert.equal(s.bildirimler[s.bildirimler.length - 1].p.p_playlist_name, 'Öğle Molası');
});

// Personelin seçtiği liste panelden silinirse cihaz sessizce boşta kalmamalı:
// seçim temizlenip yönetimin atadığı yayına dönülür.
test('seçili liste silinirse otomatiğe dönülür', async () => {
  const s = await calistir({
    ping: 'ok', parca: true, abonelik: 'gecerli', otomatik: true,
    listeler: LISTELER, listeParcalari: LISTE_PARCALARI, studioParcalari: STUDIO_PARCALARI,
    listelerSonra: [{ id: 'L2', name: 'Akşam Sesi', shuffle: true }]
  });
  await s.sec('L1');
  assert.equal(s.kayitliListe, 'L1');

  await s.tikla(600000);
  assert.equal(s.secili, '', 'seçim temizlenmeli');
  assert.equal(s.kayitliListe, null);
  assert.ok(s.liste.includes('Sabah Işığı'), 'otomatik yayının parçaları dönmeli');
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
  const s = await calistir({ ping: 'ok', parca: true, abonelik: 'gecerli', otomatik: true, kiosk: true, bildirimHatasi: true });
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

// ---- Bağlantı geçmişi -------------------------------------------------------
// Oynatıcı durum değiştirdiğinde sunucuya olay bırakır. Panelde “sorun bizde mi,
// kafede mi” ayrımı tam olarak bu kayıtlara dayanır: yayını kafe cihazdan mı
// durdurdu, biz mi (mesai, kaynak, cihaz kilidi) durdurduk.

test('oynatıcı açılışı ve çalmaya başlamayı geçmişe yazar', async () => {
  const s = await calistir({ ping: 'ok', parca: true, abonelik: 'gecerli', otomatik: true, kiosk: true });
  const acilislar = s.olayTuru('acildi');
  assert.equal(acilislar.length, 1, 'açılış bir kez yazılmalı');
  assert.equal(acilislar[0].p_player_key, PROVA_ANAHTAR);
  assert.equal(acilislar[0].p_device_id, 'cihaz-test-1', 'olay cihaz kimliğiyle eşleşmeli');

  const calanlar = s.olayTuru('caliyor');
  assert.equal(calanlar.length, 1, 'yayın başladığında bir kez yazılmalı');
  assert.match(calanlar[0].p_detail, /Sabah Işığı/);
});

test('kilitli cihazdan deneme de geçmişe düşer', async () => {
  const s = await calistir({ ping: 'kilitli', parca: true, abonelik: 'gecerli' });
  assert.equal(s.olayTuru('acildi').length, 1, 'yanlış cihazdan deneme kaydedilmeli');
  const kilit = s.olayTuru('kilitlendi');
  assert.equal(kilit.length, 1, 'cihaz kilidi kaydı düşmeli');
  assert.match(kilit[0].p_detail, /başka bir cihaza kayıtlı/);
});

test('kafe cihazdan durdurduğunda sebep cihaz olarak yazılır', async () => {
  const s = await calistir({ ping: 'ok', parca: true, abonelik: 'gecerli', otomatik: true });
  await s.yayinda();
  await s.cihazdanDurdur();
  const duraklar = s.olayTuru('durakladi');
  assert.equal(duraklar.length, 1);
  assert.equal(duraklar[0].p_detail, 'cihaz',
    'oynatıcı sebebi bilmiyorsa duraklatma cihazdan gelmiştir');

  // Yayın zaten durmuşken cihaz yeniden duraklatırsa geçmiş şişmemeli.
  await s.cihazdanDurdur();
  assert.equal(s.olayTuru('durakladi').length, 1, 'durmuş yayın için ikinci kayıt düşmez');
});

test('parça bitişi yayın durması olarak yazılmaz', async () => {
  const s = await calistir({ ping: 'ok', parca: true, abonelik: 'gecerli', otomatik: true });
  await s.yayinda();
  await s.parcaBitti();
  assert.equal(s.olayTuru('durakladi').length, 0, 'parça bitti diye “yayın durdu” yazılmamalı');
});

test('geçmiş tablosu kurulmadıysa oynatıcı çalmaya devam eder', async () => {
  const s = await calistir({
    ping: 'ok', parca: true, abonelik: 'gecerli', otomatik: true, kiosk: true, gecmisHatasi: true
  });
  assert.ok(s.liste.includes('Sabah Işığı'), 'yayın geçmişe bağlı değil');
  assert.equal(s.durum, '', 'geçmiş yazılamasa bile ekranda hata çıkmaz');
});

// ---- Yayını durdurmak müziği kesmez -----------------------------------------
// Panelde "YAYINI DURDUR" yalnız canlı yayın kaynağını kaldırır. Kafede çalmakta
// olan müzik bundan etkilenmemeli: cihaz yüklü listesini çalmaya devam eder ve
// yönetim yeni bir kaynak atadığında kendiliğinden ona geçer. Yoksa her kaynak
// değişiminde mekân sessiz kalıyordu.

test('yayın kaynağı durdurulunca kafede çalan şarkı kesilmez', async () => {
  const senaryo = { ping: 'ok', parca: true, abonelik: 'gecerli', otomatik: true, kiosk: true };
  const s = await calistir(senaryo);
  assert.ok(s.calinan.includes('f1/p0.wav'), 'yayın çalıyor olmalı');
  // Cihaz bir süredir çalıyor: mesai kontrolü bir kez çalışmış olsun ki aşağıdaki
  // turda durum satırını kendiliğinden tazelemesin (gerçekte de öyle olur).
  await s.tikla(30000);
  const calan = s.calinan;

  // Yönetim panelde "YAYINI DURDUR"a bastı: yayın kaynağı satırı silindi.
  senaryo.parca = false;
  senaryo.yayinDurumu = 'kaynak-yok';
  await s.tikla(30000);

  assert.equal(s.calinan, calan, 'çalan parça değişmemeli');
  assert.ok(s.liste.includes('Sabah Işığı'), 'yüklü liste ekranda kalmalı');
  assert.equal(s.marka, 'Mokka Coffee', 'marka adı silinmemeli');
  assert.match(s.durum, /çalmaya devam ediyor/);
  assert.equal(s.tani, '', 'yayın sürdüğü için teşhis kodu çıkmaz');
  const kayit = s.olayTuru('serbest');
  assert.equal(kayit.length, 1, 'geçmişe bir kez yazılmalı');
  assert.match(kayit[0].p_detail, /Sabah Işığı/);
});

// MARKAYI DURDUR müziği kesmelidir: "yayını durdurdum ama cihaz çalıyor"
// gevşemesi bu kararın önüne geçemez, yoksa yayın vermeyi kesmek işe yaramaz.
test('marka kapatıldığında yayın yine durur', async () => {
  const senaryo = { ping: 'ok', parca: true, abonelik: 'gecerli', otomatik: true, kiosk: true };
  const s = await calistir(senaryo);
  await s.tikla(30000);   // cihaz bir süredir çalıyor (mesai kontrolü çalışmış)
  senaryo.parca = false;
  senaryo.yayinDurumu = 'marka-pasif';
  await s.tikla(30000);

  assert.equal(s.marka, 'Yayın zinciri kopuk');
  assert.equal(s.liste, '', 'liste ekrandan kalkmalı');
  assert.equal(s.tani, 'Teşhis kodu: marka-pasif-veya-kaynak-yok');
  assert.equal(s.olayTuru('serbest').length, 0, 'kapatılan markada serbest mod olmaz');
});

test('abonelik geçersizse yayın yine durur', async () => {
  const senaryo = { ping: 'ok', parca: true, abonelik: 'gecerli', otomatik: true, kiosk: true };
  const s = await calistir(senaryo);
  await s.tikla(30000);   // cihaz bir süredir çalıyor (mesai kontrolü çalışmış)
  senaryo.parca = false;
  senaryo.abonelik = 'bitti';
  senaryo.yayinDurumu = 'abonelik-yok';
  await s.tikla(30000);

  assert.equal(s.marka, 'Yayın duraklatıldı');
  assert.match(s.durum, /süresi doldu/);
  assert.equal(s.olayTuru('serbest').length, 0, 'abonelik durduysa serbest mod olmaz');
});

// Ayrımı veren sunucu fonksiyonu kurulmadıysa oynatıcı eski davranışını korur:
// kaynak kalkınca yayın durur. Böylece SQL çalıştırılmadan da panel güvenli kalır.
test('ayrım fonksiyonu sunucuda yoksa eski davranış korunur', async () => {
  const senaryo = {
    ping: 'ok', parca: true, abonelik: 'gecerli', otomatik: true, kiosk: true, yayinDurumu: 'yok'
  };
  const s = await calistir(senaryo);
  senaryo.parca = false;
  await s.tikla(30000);

  assert.equal(s.marka, 'Yayın zinciri kopuk');
  assert.equal(s.liste, '');
});

// Yönetim markanın listesinden bir parça seçip yayını yeniden başlattığında cihaz
// kendiliğinden yeni kaynağa geçmeli; serbest mod notu ekrandan silinmeli.
test('yeni kaynak atanınca cihaz kendiliğinden yeni yayına geçer', async () => {
  const senaryo = { ping: 'ok', parca: true, abonelik: 'gecerli', otomatik: true, kiosk: true };
  const s = await calistir(senaryo);
  await s.tikla(30000);   // cihaz bir süredir çalıyor (mesai kontrolü çalışmış)

  senaryo.parca = false;
  senaryo.yayinDurumu = 'kaynak-yok';
  await s.tikla(30000);
  assert.match(s.durum, /çalmaya devam ediyor/);

  senaryo.parca = true;
  senaryo.yayinDurumu = 'kaynak-var';
  senaryo.yayinDamgasi = '2026-09-27T12:00:00.000Z';
  await s.tikla(30000);

  assert.equal(s.durum, '', 'yeni yayın gelince uyarı silinmeli');
  assert.ok(s.calinan.includes('f1/p0.wav'), 'yeni kaynak çalınmalı');
  assert.ok(s.liste.includes('Sabah Işığı'));
  assert.equal(s.tani, '');
});

// ---- Katalog dışarıya kapandığında cihaz sunucudan okur ----------------------
// Liste ve parçalar eskiden tablolardan doğrudan okunuyordu; o tablolar artık
// girişsiz ziyaretçiye kapalı (supabase/radio-erisim-kapat.sql). Cihaz veriyi
// şube anahtarını doğrulayan radio_listeler'den alır; seçici ve çalma aynı kalır.

const LISTE_RPC = [
  { playlist_id: 'L1', name: 'Sabah Kahve', shuffle: false, track_id: 't9',
    title: 'Filtre Kahve', storage_path: 'listeler/filtre.wav', sort_order: 0 },
  // Parçası olmayan liste de seçicide görünür (seçilince boş liste uyarısı verir).
  { playlist_id: 'L2', name: 'Akşam Sesi', shuffle: true, track_id: null,
    title: null, storage_path: null, sort_order: 0 }
];

test('tablolar kapalıyken liste ve parçalar sunucudan alınır', async () => {
  const s = await calistir({
    ping: 'ok', parca: true, abonelik: 'gecerli', otomatik: true,
    listelerRpc: LISTE_RPC,
    listeler: []   // tablo okuması kapalı: boş döner
  });
  assert.ok(s.listeGorunur, 'seçici sunucudan gelen listelerle görünmeli');
  assert.ok(s.secenekler.includes('Sabah Kahve') && s.secenekler.includes('Akşam Sesi'),
    'parçasız liste de seçicide olmalı');

  await s.sec('L1');
  assert.ok(s.calinan.includes('listeler/filtre.wav'), 'seçilen listenin parçası çalınmalı');
  assert.ok(s.liste.includes('Filtre Kahve'));
});

// ---- Şubeye yüklenen listeler (supabase/radio-sube-listeleri.sql) ---------
// Markanın her listesi her şubeye ait değildir: Alsancak'a yüklenen listeler
// onun cihazında görünür, Colmar'daki berber listesi görünmez. Şubeye hiç liste
// yüklenmemişse cihaz çalmaz ve bunu yönetime söyler.
const SUBE_RPC = [
  { playlist_id: 'L1', name: 'Sabah Kahve', shuffle: false, track_id: 'p1',
    title: 'Filtre Kahve', storage_path: 'listeler/filtre.wav', sort_order: 0 },
  { playlist_id: 'L4', name: 'Spor Salonu', shuffle: true, track_id: 'p9',
    title: 'Tempolu Set', storage_path: 'listeler/tempolu.wav', sort_order: 1 }
];

test('seçici yalnız şubeye yüklenen listeleri gösterir', async () => {
  const s = await calistir({
    ping: 'ok', parca: true, abonelik: 'gecerli', otomatik: true,
    subeListeleri: SUBE_RPC,
    listeler: LISTELER, listeParcalari: LISTE_PARCALARI, studioParcalari: STUDIO_PARCALARI
  });
  assert.ok(s.listeGorunur, 'yüklü liste varsa seçici görünmeli');
  assert.ok(s.secenekler.includes('Sabah Kahve') && s.secenekler.includes('Spor Salonu'));
  assert.ok(!s.secenekler.includes('Akşam Sesi'), 'yüklenmemiş marka listesi seçicide olmamalı');

  await s.sec('L4');
  assert.ok(s.calinan.includes('listeler/tempolu.wav'), 'yüklenen liste çalınabilmeli');
});

test('şubeye liste yüklenmemişse cihaz çalmaz ve ne yapılacağını söyler', async () => {
  const s = await calistir({
    ping: 'ok', parca: true, abonelik: 'gecerli', otomatik: true,
    subeListeleri: [],   // yönetim bu şubeye liste yüklemedi
    listeler: LISTELER, listeParcalari: LISTE_PARCALARI, studioParcalari: STUDIO_PARCALARI
  });
  assert.equal(s.listeGorunur, false, 'liste yokken seçici çıkmamalı');
  assert.equal(s.calmaDenemesi, 0, 'yayın kaynağı atanmış olsa bile çalınmamalı');
  assert.match(s.durum, /çalma listesi yüklenmedi/, 'yönetime ne yapılacağı söylenmeli');
  assert.ok(!s.liste.includes('Sabah Işığı'), 'marka geneli kaynağı kuyruğa alınmamalı');
});

test('yükleme sonradan gelirse cihaz kendiliğinden çalmaya başlar', async () => {
  // Yönetim listeyi yükleyene kadar cihaz susar; yükleme geldiğinde elle
  // dokunmak gerekmez (kafede kimse panele bakmıyor).
  const yuklu = [];
  const s = await calistir({
    ping: 'ok', parca: true, abonelik: 'gecerli', otomatik: true, kiosk: true,
    subeListeleri: yuklu,
    listeler: LISTELER, listeParcalari: LISTE_PARCALARI, studioParcalari: STUDIO_PARCALARI
  });
  assert.equal(s.calmaDenemesi, 0);

  yuklu.push(SUBE_RPC[0]);
  await s.tikla(60000);
  await s.tikla(30000);
  assert.ok(s.listeGorunur, 'yükleme gelince seçici çıkmalı');
  assert.ok(s.liste.includes('Sabah Işığı'), 'otomatik yayın yeniden kurulmalı');
});

test('şube listeleri fonksiyonu yoksa markanın bütün listeleri gösterilir', async () => {
  const s = await calistir({
    ping: 'ok', parca: true, abonelik: 'gecerli', otomatik: true,
    listeler: LISTELER, listeParcalari: LISTE_PARCALARI, studioParcalari: STUDIO_PARCALARI
  });
  assert.ok(s.listeGorunur, 'eski davranış korunmalı');
  assert.ok(s.secenekler.includes('Sabah Kahve') && s.secenekler.includes('Akşam Sesi'));
});

test('liste fonksiyonu sunucuda yoksa eski tablo okuması çalışır', async () => {
  const s = await calistir({
    ping: 'ok', parca: true, abonelik: 'gecerli', otomatik: true,
    listeler: LISTELER, listeParcalari: LISTE_PARCALARI, studioParcalari: STUDIO_PARCALARI
  });
  assert.ok(s.listeGorunur);
  await s.sec('L1');
  assert.ok(s.calinan.includes('listeler/filtre.wav'));
});

test('anonslar yoklamayla gelir ve aynı anons iki kez çalınmaz', async () => {
  const s = await calistir({
    ping: 'ok', parca: true, abonelik: 'gecerli', otomatik: true, kiosk: true,
    anonslar: [{
      id: 'a1', storage_path: 'b1/anons.webm', label: 'Kapanış',
      created_at: '2026-09-27T07:00:30.000Z'
    }]
  });
  await s.tikla(15000);
  assert.equal(s.anonsSesleri.length, 1, 'anons bir kez çalınmalı');
  assert.ok(s.anonsSesleri[0].includes('b1/anons.webm'));

  await s.tikla(15000);
  assert.equal(s.anonsSesleri.length, 1, 'aynı anons ikinci turda tekrarlanmamalı');
  assert.equal(s.durum, '', 'anons yayının durumunu bozmamalı');
});

test('anons fonksiyonu sunucuda yoksa oynatıcı sessizce devam eder', async () => {
  const s = await calistir({
    ping: 'ok', parca: true, abonelik: 'gecerli', otomatik: true, kiosk: true
  });
  await s.tikla(15000);
  assert.equal(s.anonsSesleri.length, 0);
  assert.equal(s.durum, '');
  assert.ok(s.liste.includes('Sabah Işığı'), 'yayın etkilenmemeli');
});

// Katalog okuması önce sunucu fonksiyonundan geçmeli; eski doğrudan tablo okuması
// yalnız yedek olarak durmalı. İleride biri fonksiyonu kaldırıp eski yola dönerse
// kapı kapandığında sahada liste/duyuru sessizce kaybolur; bu test onu hatırlatır.
test('oynatıcı ve sunum sayfası katalog verisini sunucu fonksiyonundan ister', () => {
  const radyo = fs.readFileSync(path.join(KOK, 'radyo.js'), 'utf8');
  // Önce şubeye yüklenen listeler, sonra markanın listeleri: ikisi de sunucu
  // fonksiyonundan gelir, tablo doğrudan okunmaz (kapı kapalıyken çalışsın).
  assert.match(radyo, /rpcListeler\('radio_sube_listeler'\)/);
  assert.match(radyo, /rpcListeler\('radio_listeler'\)/);
  assert.match(radyo, /rpcListeler\('radio_anonslar'\)|icerikRpc\('radio_anonslar'|rpc\('radio_anonslar'/);
  // Cihaz kimliği de gitmeli: bağlantı koruması (radio-baglanti-korumasi.sql)
  // içerik fonksiyonlarını cihaza bağlar, kimlik gönderilmezse liste boş döner.
  assert.match(radyo, /const r = await icerikRpc\(ad, \{ p_player_key: key \}\)/);
  assert.match(radyo, /from\('brand_playlists'\)/, 'yedek yol durmalı');

  const sunum = fs.readFileSync(path.join(KOK, 'coffee-marka.js'), 'utf8');
  assert.match(sunum, /rpc\('coffee_brand_liste'/);
  assert.match(sunum, /from\('brand_playlists'\)/, 'yedek yol durmalı');
});

// Kafe linki cihaza bağlı olmalı: içerik fonksiyonları cihaz kimliği sormazsa,
// linki ele geçiren biri rest çağrısıyla bütün listeyi ve dosya yollarını okuyup
// müziği başka bir cihazda çalabilir (cihaz kilidi yalnız ping'de kalır).
test('içerik fonksiyonları cihaz kimliğini sorar', () => {
  const sql = fs.readFileSync(path.join(KOK, 'supabase', 'radio-baglanti-korumasi.sql'), 'utf8');

  // Ortak kapı: yönetici muaf, bağlı cihaz eşleşmeli, kimlik boş gönderilemez.
  assert.match(sql, /function public\.radio_cihaz_uygun\(p_player_key uuid, p_device_id text\)/);
  assert.match(sql, /when public\.is_admin\(\) then true/);
  assert.match(sql, /p\.bound_device_id = nullif\(btrim\(coalesce\(p_device_id/);

  // İçerik ve bilgi fonksiyonlarının hepsi kapıdan geçmeli.
  ['radio_now_playing', 'radio_listeler', 'radio_sube_listeler',
    'radio_anonslar', 'radio_yayin_durumu'].forEach(fonksiyon => {
    assert.match(sql, new RegExp('function public\\.' + fonksiyon + '\\([\\s\\S]{0,160}?p_device_id text default null'),
      fonksiyon + ' cihaz kimliği almalı');
  });
  const kapiSayisi = (sql.match(/radio_cihaz_uygun\(p_player_key, p_device_id\)/g) || []).length;
  assert.ok(kapiSayisi >= 6, 'her içerik yolu kapıdan geçmeli (bulunan: ' + kapiSayisi + ')');

  // Yazma yolları da kapıdan geçer: kilitli cihaz paneli kandıramasın.
  assert.match(sql, /function public\.radio_now_report\([\s\S]{0,400}?p_device_id text default null/);
  assert.match(sql, /function public\.radio_log_event\([\s\S]{0,400}?p_device_id text default null/);

  // Eski tek parametreli imzalar düşürülmeli: iki imza kalırsa PostgREST
  // hangisini çağıracağını bilemez (PGRST203) ve oynatıcı içerik alamaz.
  ['radio_now_playing', 'radio_listeler', 'radio_sube_listeler', 'radio_yayin_durumu']
    .forEach(fonksiyon => assert.match(sql, new RegExp('drop function if exists public\\.' + fonksiyon + '\\(uuid\\)')));
  assert.match(sql, /drop function if exists public\.radio_anonslar\(uuid, timestamp with time zone\)/);

  // Ping: bağlı cihazda kimlik göndermemek kilidi atlamamalı.
  assert.match(sql, /v_row\.bound_device_id is not null\s*\n?\s*and \(v_device is null or v_row\.bound_device_id <> v_device\)/);
});

// ---- Şube kodu kapısı ---------------------------------------------------
// Linki ele geçirmek yayını açmaya yetmemeli: şube henüz bir cihaza bağlanmamışken
// sunucu kodu da sorar (supabase/radio-sube-kodu.sql). Oynatıcının bu kapıyı
// doğru göstermesi, yanlış kodu kanıt olarak bırakması ve kodu bir kez sorup
// cihazda saklaması gerekir.
test('kodu olan şube ilk açılışta kod ister ve yayını hazırlamaz', async () => {
  const s = await calistir({ parca: true, abonelik: 'gecerli', kodDogru: 'K7M2-4QPD' });
  assert.equal(s.kodKapisi, true, 'kod alanı görünmeli');
  assert.match(s.durum, /şube kodunu girin/i);
  assert.equal(s.baslatGorunur, false, 'kod girilmeden yayın başlatılamaz');
  assert.ok(!s.liste.includes('Sabah Işığı'), 'liste hazırlanmamalı');
  assert.equal(s.olayTuru('kod-yanlis').length, 0, 'kod istemek alarm değildir');
});

test('doğru kod girilince yayın açılır ve kod cihazda saklanır', async () => {
  const s = await calistir({ parca: true, abonelik: 'gecerli', kodDogru: 'k7m2-4qpd' });
  await s.koduGir('K7M2-4QPD');
  assert.equal(s.kodKapisi, false, 'kod ekranı kapanmalı');
  assert.equal(s.kayitliKod, 'K7M2-4QPD', 'kod cihazda saklanmalı (her açılışta sorulmasın)');
  assert.equal(s.marka, 'Mokka Coffee');
  assert.ok(s.liste.includes('Sabah Işığı'), 'yayın hazırlanmalı');
});

test('yanlış kod yayını açmaz: kanıt ve konum kaydedilir, kod saklanmaz', async () => {
  const s = await calistir({
    parca: true, abonelik: 'gecerli', kodDogru: 'K7M2-4QPD',
    konumApi: { sehir: 'İzmir', ulke: 'Türkiye' }
  });
  await s.koduGir('AAAA-1111');

  assert.equal(s.kodKapisi, true, 'kod ekranı kalmalı');
  assert.match(s.durum, /ait değil/i);
  assert.ok(!s.liste.includes('Sabah Işığı'), 'yanlış kodla yayın açılmamalı');
  assert.equal(s.kayitliKod, null, 'yanlış kod cihaza saklanmamalı');
  assert.equal(s.olayTuru('kod-yanlis').length, 1, 'deneme geçmişe düşmeli');

  // Konum: tarayıcı izni yok → IP'den çözülen şehir kanıt olarak gider.
  assert.ok(s.konumIstekleri.includes('/api/konum-coz'), 'IP konumu sorulmalı');
  assert.equal(s.kanitlar.length, 1, 'kanıt ayrı fonksiyonla yazılmalı');
  assert.equal(s.kanitlar[0].p_konum, 'IP: İzmir, Türkiye');

  // Yanlış kod bellekte bırakılırsa her yoklama aynı denemeyi tekrarlar ve
  // alarm sayacı şişer: kod temizlenmeli.
  const pingSayisi = s.pingler.length;
  await s.tikla(60000);
  assert.equal(s.pingler.length, pingSayisi, 'yanlış kod kendiliğinden tekrar gönderilmemeli');
});

test('bağlı şube başka cihazda kilitli kalır: kod ekranı kilidin önüne geçmez', async () => {
  const s = await calistir({ ping: 'kilitli', kodDogru: 'K7M2-4QPD', parca: true });
  assert.equal(s.marka, 'Bu cihaz yetkili değil');
  assert.equal(s.kodKapisi, false, 'kilit ekranı kod ekranından önce gelir');
  assert.match(s.durum, /başka bir cihaza kayıtlı/);
});

test('oynatıcı kodu gönderir, sunucu tanımıyorsa kodsuz tekrarlar ve kod linkte taşınmaz', () => {
  const radyo = fs.readFileSync(path.join(KOK, 'radyo.js'), 'utf8');
  const yardimci = radyo.slice(radyo.indexOf('async function pingRpc'), radyo.indexOf('function reportPlaying'));
  assert.match(yardimci, /if \(kod\) tam\.p_kod = kod/, 'kod yoklamada gönderilmeli');
  assert.match(yardimci, /imzaYok\(r\)/, 'eski imzaya düşme ölçütü olmalı');
  // Kod adres çubuğundan gelmemeli: link kopyalandığında kod da kopyalanmasın.
  assert.ok(!/url\.get\('k'\)/.test(radyo), 'kod bağlantıda taşınmamalı');
  assert.match(radyo, /localStorage\.getItem\(KOD_ANAHTARI\)/);
});

test('şube kodu kapısı sunucuda zorunlu ve yanlış kod alarm üretir', () => {
  const sql = fs.readFileSync(path.join(KOK, 'supabase', 'radio-sube-kodu.sql'), 'utf8');

  // Kolon + benzersizlik: kod büyük/küçük harf duyarsız tekil olmalı.
  assert.match(sql, /add column if not exists player_code\s+text/);
  assert.match(sql, /create unique index if not exists brand_players_player_code_uniq[\s\S]{0,120}?upper\(player_code\)/);

  // Kapı: bağlanmamış şubede kod yoksa "code_required", yanlışsa "invalid_code".
  assert.match(sql, /p_kod text default null/);
  assert.match(sql, /if v_row\.bound_device_id is null and v_row\.player_code is not null then/);
  assert.match(sql, /if v_kod is null then[\s\S]{0,80}?return query select false, 'code_required'/);
  assert.match(sql, /if v_kod <> upper\(v_row\.player_code\) then/);
  assert.match(sql, /son_ihlal_tur = 'kod'/);
  assert.match(sql, /son_ihlal_tur = 'cihaz'/);
  assert.ok(sql.includes("'kod-denemesi'"), 'yanlış kod geçmişe düşmeli');

  // Denenen kod ASLA kaydedilmez: geçmiş satırı yalnız konum ve IP taşır.
  const bas = sql.indexOf('insert into public.radio_player_events');
  const kayit = sql.slice(bas, bas + 420);
  assert.ok(bas > 0 && !kayit.includes('p_kod') && !kayit.includes('v_kod'),
    'yanlış kod kanıt kaydına yazılmamalı');

  // Konum kanıtı ayrı fonksiyondan: yoklama sayacı iki kez artmasın.
  assert.match(sql, /create or replace function public\.radio_kanit\(/);
  assert.match(sql, /if not found or v_row\.son_ihlal_at is null then/);

  // Eski imza düşürülmeli: iki imza kalırsa PostgREST hangisini çağıracağını
  // bilemez ve oynatıcı hiçbir cevap alamaz.
  assert.match(sql, /drop function if exists public\.radio_ping\(uuid, text, boolean, text\)/);
});

// Oynatıcı, cihaz kimliğini içerik çağrılarının hepsinde göndermeli; biri
// atlanırsa o çağrı kilitli cihaza da boş döner ve yayın sebepsiz susar.
test('oynatıcı cihaz kimliğini bütün içerik çağrılarında gönderir', () => {
  const radyo = fs.readFileSync(path.join(KOK, 'radyo.js'), 'utf8');

  // Tek yardımcı: kimliği ekler, sunucu eski imzadaysa cihazsız tekrarlar.
  // İkinci deneme şart: SQL dosyası uygulanmadan dağıtım yapılırsa çağrı
  // PGRST202 ile reddedilir ve kafeler susardı.
  const yardimci = radyo.slice(radyo.indexOf('async function icerikRpc'),
    radyo.indexOf('async function listeleriGetir'));
  assert.match(yardimci, /p_device_id: deviceId/, 'yardımcı cihaz kimliği eklemeli');

  // Eski imzaya düşme ölçütü, sunucunun GERÇEK hata metnini tanımalı. Bir kez
  // yalnız PGRST202 aranmıştı; PostgREST bunu sözcükle döndürdüğü için kafeler
  // susmuştu. Metni burada sabitliyoruz.
  const desen = radyo.match(/const IMZA_YOK = (\/[^\n]+\/[a-z]*);/);
  assert.ok(desen, 'imza tanıma deseni bulunmalı');
  const imzaYok = new RegExp(desen[1].slice(1, desen[1].lastIndexOf('/')), desen[1].slice(desen[1].lastIndexOf('/') + 1));
  [
    'Could not find the function public.radio_now_playing(p_device_id, p_player_key) in the schema cache',
    'function public.radio_listeler(p_device_id, p_player_key) does not exist',
    'PGRST202'
  ].forEach(metin => assert.ok(imzaYok.test(metin), 'tanınmalı: ' + metin));

  // İçerik yolları yardımcıdan geçmeli: doğrudan çağrı kalırsa o çağrı kilitli
  // cihaza da içerik verir (yani koruma yarım kalır).
  ['radio_now_playing', 'radio_yayin_durumu', 'radio_anonslar', 'radio_now_report']
    .forEach(ad => {
      assert.ok(!radyo.includes("client.rpc('" + ad + "'"), ad + ' yardımcıdan geçmeli');
    });
  assert.match(radyo, /icerikRpc\('radio_now_playing'/);
  assert.match(radyo, /icerikRpc\('radio_yayin_durumu'/);
  assert.match(radyo, /icerikRpc\('radio_anonslar'/);
  assert.match(radyo, /icerikRpc\('radio_now_report'/);
  assert.match(radyo, /const r = await icerikRpc\(ad, \{ p_player_key: key \}\)/);
  assert.match(radyo, /rpcListeler\('radio_sube_listeler'\)/);
  assert.match(radyo, /rpcListeler\('radio_listeler'\)/);

  // Yoklama ve geçmiş yazımı imzalarında zaten cihaz kimliği taşır.
  ['radio_ping', 'radio_log_event'].forEach(ad => {
    const bas = radyo.indexOf("rpc('" + ad + "'");
    assert.ok(bas > 0, ad + ' çağrılmalı');
    assert.match(radyo.slice(bas, bas + 420), /p_device_id: deviceId/, ad + ' çağrısında cihaz kimliği olmalı');
  });
});

// Kapatma dosyası, katalog verisini taşıyan bütün tabloları kapatmalı: yeni
// bir radyo tablosu eklenip buraya yazılmazsa liste yine dışarıdan okunabilir.
test('kapatma dosyası katalog tablolarının hepsini dışarıya kapatır', () => {
  const sql = fs.readFileSync(path.join(KOK, 'supabase', 'radio-erisim-kapat.sql'), 'utf8');
  ['radio_folders', 'radio_tracks', 'brand_playlists', 'brand_playlist_tracks',
    'brand_broadcast', 'player_broadcast', 'radio_announcements',
    'brand_players'].forEach(tablo => {
    assert.ok(sql.includes('revoke select on public.' + tablo),
      tablo + ' dışarıya kapatılmalı');
  });
  assert.match(sql, /to anon/, 'kapı girişsiz ziyaretçi rolüne kapanmalı');
});
