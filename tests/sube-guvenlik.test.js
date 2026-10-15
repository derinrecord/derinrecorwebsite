// Şube sunum ekranının güvenlik katmanı (sube-guvenlik.js): şube kodu kapısı,
// cihaz kilidi ve yoklama, sahte Supabase istemcisiyle gerçek kodla sınanır.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const kaynak = fs.readFileSync(path.join(__dirname, '..', 'sube-guvenlik.js'), 'utf8');
const ANAHTAR = 'a1b2c3d4-e5f6-4a7b-8c9d-0000000000aa';

function ortam(baslangic = {}) {
  const kayit = new Map(Object.entries(baslangic));
  const olaylar = [];
  const zamanlayicilar = [];
  const window = {
    localStorage: {
      getItem: k => (kayit.has(k) ? kayit.get(k) : null),
      setItem: (k, v) => kayit.set(k, String(v)),
      removeItem: k => kayit.delete(k)
    },
    crypto: { randomUUID: () => 'yeni-cihaz-0001' },
    dispatchEvent: e => olaylar.push(e)
  };
  class CustomEvent { constructor(type, init) { this.type = type; this.detail = init && init.detail; } }
  const sandbox = {
    window, CustomEvent, Date, Promise,
    setInterval: (fn, ms) => { zamanlayicilar.push(fn); return zamanlayicilar.length; },
    clearInterval: () => {}
  };
  vm.runInNewContext(kaynak, sandbox);
  return { G: window.DerinSubeGuvenlik, kayit, olaylar, zamanlayicilar };
}

function istemci(cevap) {
  const cagrilar = [];
  return {
    cagrilar,
    rpc(ad, p) { cagrilar.push({ ad, p }); return Promise.resolve(cevap(ad, p)); }
  };
}
const pingCevap = satir => (ad) => (ad === 'radio_ping' ? { data: [satir], error: null } : { data: null, error: null });

test('anahtar yalnız /coffee/s/<uuid> yolundan okunur', () => {
  const { G } = ortam();
  assert.equal(G.anahtarOku({ pathname: '/coffee/s/' + ANAHTAR }), ANAHTAR);
  assert.equal(G.anahtarOku({ pathname: '/coffee/s/' + ANAHTAR.toUpperCase() }), ANAHTAR);
  assert.equal(G.anahtarOku({ pathname: '/coffee/s/null' }), null);
  assert.equal(G.anahtarOku({ pathname: '/coffee/chemex' }), null);
});

test('kayıtlı cihaz kimliği yeniden üretilmez', () => {
  const { G, kayit } = ortam({ derin_record_device_id: 'kafe-cihazi' });
  assert.equal(G.cihazKimligi(), 'kafe-cihazi');
  const bos = ortam();
  assert.equal(bos.G.cihazKimligi(), 'yeni-cihaz-0001');
  assert.equal(bos.kayit.get('derin_record_device_id'), 'yeni-cihaz-0001');
  assert.equal(kayit.get('derin_record_device_id'), 'kafe-cihazi');
});

test('doğru kod: tamam döner ve cihazda saklanır', async () => {
  const { G, kayit } = ortam({ derin_record_device_id: 'kafe-cihazi' });
  const c = istemci(pingCevap({ ok: true, reason: null }));
  const s = await G.baglan({ client: c, anahtar: ANAHTAR, kod: ' g5lv-s8vd ' });
  assert.equal(s.durum, 'tamam');
  assert.equal(kayit.get('derin_record_kod_' + ANAHTAR), 'G5LV-S8VD');
  assert.equal(c.cagrilar[0].p.p_kod, 'G5LV-S8VD');
  assert.equal(c.cagrilar[0].p.p_device_id, 'kafe-cihazi');
});

test('yanlış kod: kod-yanlis döner ve saklı kod silinir', async () => {
  const { G, kayit } = ortam({ ['derin_record_kod_' + ANAHTAR]: 'ESKI-KOD1' });
  const c = istemci(pingCevap({ ok: false, reason: 'invalid_code' }));
  const s = await G.baglan({ client: c, anahtar: ANAHTAR, kod: 'YANLIS' });
  assert.equal(s.durum, 'kod-yanlis');
  assert.equal(s.mesaj, 'Kod doğru değil.');
  assert.ok(!kayit.has('derin_record_kod_' + ANAHTAR));
});

test('kilitli, kod gerekli, tanınmadı ve bağlantı hatası ayrı ayrı döner', async () => {
  const durumlar = [
    [{ ok: false, reason: 'locked_to_other_device' }, 'kilitli', 'Bu link başka bir cihaza bağlı. Derin Record ile iletişime geçin.'],
    [{ ok: false, reason: 'code_required' }, 'kod-gerekli', 'Şube kodunu girin.'],
    [{ ok: false, reason: 'invalid_key' }, 'tanınmadı', 'Bu link tanınmadı.']
  ];
  for (const [satir, durum, mesaj] of durumlar) {
    const { G } = ortam();
    const s = await G.baglan({ client: istemci(pingCevap(satir)), anahtar: ANAHTAR, kod: '' });
    assert.equal(s.durum, durum);
    assert.equal(s.mesaj, mesaj);
  }
  const { G } = ortam();
  const s = await G.baglan({ client: istemci(() => ({ data: null, error: { message: 'ağ' } })), anahtar: ANAHTAR });
  assert.equal(s.durum, 'baglanti');
});

test('ping her zaman cihaz kimliği gönderir; kodsuz çağrıda p_kod yok', async () => {
  const { G } = ortam({ derin_record_device_id: 'kafe-cihazi' });
  const c = istemci(pingCevap({ ok: true }));
  await G.baglan({ client: c, anahtar: ANAHTAR, kod: '' });
  assert.equal(c.cagrilar[0].p.p_device_id, 'kafe-cihazi');
  assert.ok(!('p_kod' in c.cagrilar[0].p));
});

test('yoklamada kilit dönerse olay yazılır ve ekran kapanma sinyali gider', async () => {
  const { G, olaylar, zamanlayicilar } = ortam({ derin_record_device_id: 'kafe-cihazi' });
  const c = istemci(pingCevap({ ok: false, reason: 'locked_to_other_device' }));
  G.nabizBaslat({ client: c, anahtar: ANAHTAR, calarMi: () => true });
  assert.equal(zamanlayicilar.length, 1);
  await zamanlayicilar[0]();
  assert.equal(c.cagrilar[0].p.p_playing, true);
  assert.ok(c.cagrilar.some(x => x.ad === 'radio_log_event' && x.p.p_kind === 'kilitlendi'));
  assert.equal(olaylar.length, 1);
  assert.equal(olaylar[0].type, 'derin:sube-kapandi');
  assert.equal(olaylar[0].detail.sebep, 'kilitli');
});

test('çalan parça bildirimi şube anahtarı ve cihazla gider', () => {
  const { G } = ortam({ derin_record_device_id: 'kafe-cihazi' });
  const c = istemci(() => ({ data: null, error: null }));
  G.calaniBildir({ client: c, anahtar: ANAHTAR }, { track_id: 't1', title: 'Sabah', playlist_id: 'p1', playlist_name: 'SABAH' });
  const x = c.cagrilar[0];
  assert.equal(x.ad, 'radio_now_report');
  assert.equal(x.p.p_device_id, 'kafe-cihazi');
  assert.equal(x.p.p_playlist_name, 'SABAH');
});

test('ses bildirimi seviyeyi 0–100 aralığında ve cihaz kimliğiyle gönderir', () => {
  const { G } = ortam({ derin_record_device_id: 'kafe-cihazi' });
  const c = istemci(() => ({ data: true, error: null }));
  G.sesBildir({ client: c, anahtar: ANAHTAR }, { seviye: 140.4, ilerliyor: false });
  const x = c.cagrilar[0];
  assert.equal(x.ad, 'radio_ses_bildir');
  assert.equal(x.p.p_seviye, 100);
  assert.equal(x.p.p_ilerliyor, false);
  assert.equal(x.p.p_device_id, 'kafe-cihazi');
});
