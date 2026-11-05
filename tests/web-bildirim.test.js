// Web bildirimi (4 Kasım): site telefona bildirim gönderir (Web Push, RFC 8291 + VAPID RFC 8292).
// Şifreleme ek paket olmadan Node crypto ile yazıldı; RFC 8291 Ek A test örneğiyle doğrulanır.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const oku = d => fs.readFileSync(path.join(__dirname, '..', d), 'utf8');
const B = require('../api/bildirim-gonder.js');
const b64 = s => Buffer.from(s, 'base64url');

test('RFC 8291 Ek A: şifreli gövde bire bir aynı', () => {
  const govde = B.sifrele({
    metin: Buffer.from('When I grow up, I want to be a watermelon'),
    alici: b64('BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4'),
    yetki: b64('BTBZMqHH6r4Tts7J_aSIgg'),
    gondericiGizli: b64('yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw'),
    tuz: b64('DGv6ra1nlYgDCS1FRnbzlw')
  });
  assert.equal(govde.toString('base64url'),
    'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN');
});

test('rastgele anahtarla şifrele → alıcı tarafında çözülür', () => {
  const alici = crypto.createECDH('prime256v1'); alici.generateKeys();
  const yetki = crypto.randomBytes(16);
  const govde = B.sifrele({ metin: Buffer.from('{"baslik":"Yeni şarkı"}'), alici: alici.getPublicKey(), yetki });
  const tuz = govde.subarray(0, 16), idlen = govde[20], gonderen = govde.subarray(21, 21 + idlen), sifreli = govde.subarray(21 + idlen);
  const ortak = alici.computeSecret(gonderen);
  const h = (k, d) => crypto.createHmac('sha256', k).update(d).digest();
  const ikm = h(h(yetki, ortak), Buffer.concat([Buffer.from('WebPush: info\0'), alici.getPublicKey(), gonderen, Buffer.from([1])]));
  const prk = h(tuz, ikm);
  const cek = h(prk, Buffer.from('Content-Encoding: aes128gcm\0\x01', 'binary')).subarray(0, 16);
  const nonce = h(prk, Buffer.from('Content-Encoding: nonce\0\x01', 'binary')).subarray(0, 12);
  const c = crypto.createDecipheriv('aes-128-gcm', cek, nonce); c.setAuthTag(sifreli.subarray(-16));
  const acik = Buffer.concat([c.update(sifreli.subarray(0, -16)), c.final()]);
  assert.equal(acik.subarray(0, -1).toString(), '{"baslik":"Yeni şarkı"}');
  assert.equal(acik.at(-1), 2);
});

test('VAPID başlığı: ES256 imzası açık anahtarla doğrulanır; aud uç noktanın kökeni', () => {
  const e = crypto.createECDH('prime256v1'); e.generateKeys();
  const acik = e.getPublicKey().toString('base64url'), gizli = e.getPrivateKey().toString('base64url');
  const baslik = B.vapidBasligi('https://fcm.googleapis.com/fcm/send/abc', acik, gizli, 1800000000);
  const m = /^vapid t=([^,]+), k=(.+)$/.exec(baslik); assert.ok(m);
  assert.equal(m[2], acik);
  const [h, p, s] = m[1].split('.');
  const yuk = JSON.parse(Buffer.from(p, 'base64url'));
  assert.equal(yuk.aud, 'https://fcm.googleapis.com');
  assert.equal(yuk.exp, 1800000000 + 12 * 3600);
  assert.equal(yuk.sub, 'https://www.derinrecord.com');
  const pub = e.getPublicKey();
  const anahtar = crypto.createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: pub.subarray(1, 33).toString('base64url'), y: pub.subarray(33).toString('base64url') }, format: 'jwk' });
  assert.ok(crypto.verify('sha256', Buffer.from(h + '.' + p), { key: anahtar, dsaEncoding: 'ieee-p1363' }, Buffer.from(s, 'base64url')));
});

test('yalnız bilinen bildirim sunucularına gönderilir (başka adrese istek atılmaz)', () => {
  for (const u of ['https://fcm.googleapis.com/fcm/send/x', 'https://web.push.apple.com/QAbc', 'https://updates.push.services.mozilla.com/wpush/v2/x', 'https://wns2-db5p.notify.windows.com/w/?token=x'])
    assert.equal(B.izinliUc(u), true, u);
  for (const u of ['http://fcm.googleapis.com/x', 'https://evil.com/fcm.googleapis.com', 'https://fcm.googleapis.com.evil.com/x', 'https://127.0.0.1/x', 'javascript:alert(1)', ''])
    assert.equal(B.izinliUc(u), false, u);
});

test('bildirim içeriği denetlenir: başlık zorunlu, uzunluk sınırı, adres yalnız site içi', () => {
  assert.match(B.icerik({ baslik: ' ', metin: 'x' }).hata, /Başlık/);
  assert.deepEqual(B.icerik({ baslik: ' Yeni demo ', metin: ' Ritmik ', adres: '/ritmik.html' }), { baslik: 'Yeni demo', metin: 'Ritmik', adres: '/ritmik.html' });
  assert.equal(B.icerik({ baslik: 'a', adres: 'https://kotu.site' }).adres, '/');
  assert.equal(B.icerik({ baslik: 'a', adres: '//kotu.site' }).adres, '/');
  assert.equal(B.icerik({ baslik: 'a'.repeat(200) }).baslik.length, 80);
});

test('SQL: abone tablosu, yalnız yönetici okur; abone ol/çık güvenli fonksiyonla; uç adres sınırlı', () => {
  const s = oku('supabase/web-bildirim.sql');
  assert.match(s, /create table if not exists public\.bildirim_aboneleri/);
  assert.match(s, /enable row level security/);
  assert.match(s, /using \(public\.is_admin\(\)\)/);
  assert.match(s, /function public\.bildirim_abone_ol/);
  assert.match(s, /function public\.bildirim_abonelikten_cik/);
  assert.match(s, /fcm\\\.googleapis\\\.com/);
  assert.doesNotMatch(s, /service_role/);
});

test('istemci: abone olur, servis çalışanı bildirimi gösterir ve tıklanınca sayfayı açar', () => {
  const b = oku('bildirim.js');
  assert.match(b, /pushManager\.subscribe/);
  assert.match(b, /rpc\('bildirim_abone_ol'/);
  assert.match(b, /ACIK_ANAHTAR = '[A-Za-z0-9_-]{80,}'/);
  const sw = oku('service-worker.js');
  assert.match(sw, /addEventListener\('push'/);
  assert.match(sw, /showNotification/);
  assert.match(sw, /notificationclick/);
  assert.doesNotMatch(b + sw + oku('config.js'), /VAPID_GIZLI|vapidGizli/);
});

test('sayfalar: ana sayfa davet betiğini, Bildirimler sayfası gönderme kutusunu yükler', () => {
  const i = oku('index.html'), b = oku('bildirimler.html');
  assert.ok(i.includes('bildirim.js?v=') && i.includes('bildirim.css?v='));
  assert.ok(b.includes('bildirim.js?v=') && b.includes('bildirim-panel.js?v='));
  const p = oku('bildirim-panel.js');
  assert.match(p, /profile\?\.role !== 'admin'/);
  assert.match(p, /\/api\/bildirim-gonder/);
  assert.match(p, /Bearer /);
});

test('davet: izin önceden verilmiş ama abonelik yoksa da çıkar; Projelerim ve alt bağlantıdan her zaman açılır', () => {
  const b = oku('bildirim.js');
  assert.doesNotMatch(b, /Notification\.permission !== 'default'\) return/);
  assert.ok(b.includes('my-projects\\.html'));
  assert.match(b, /\[data-bildirim-ac\]/);
  assert.ok(oku('index.html').includes('data-bildirim-ac'));
  const m = oku('my-projects.html');
  assert.ok(m.includes('data-bildirim-ac') && m.includes('bildirim.js?v='));
});

test('bildirimi açık cihaz giriş yapınca aboneliği kendiliğinden o hesaba bağlanır', () => {
  const b = oku('bildirim.js');
  assert.match(b, /async function hesabaBagla\(/);
  assert.match(b, /derin:authchange', hesabaBagla/);
  assert.match(b, /Notification\.permission !== 'granted'\) return/);
});
