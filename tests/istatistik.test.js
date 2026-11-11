// İstatistikler (11 Kasım 2026): yalnız yöneticinin gördüğü sayfa — üye kutuları,
// günlük giriş ve haftalık kayıt grafikleri, üye listesi, ziyaretçi grafikleri (Vercel).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const oku = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const IS = require('../istatistik.js');
const API = require('../api/istatistik.js');

const SIMDI = new Date('2026-11-11T18:00:00Z'); // İstanbul 21:00

test('ozet: toplam, bugün / 7 gün / 30 gün giriş yapan, bu ay yeni kayıt', () => {
  const u = [
    { last_sign_in_at: '2026-11-11T08:00:00Z', created_at: '2026-11-02T10:00:00Z' },
    { last_sign_in_at: '2026-11-06T08:00:00Z', created_at: '2026-10-02T10:00:00Z' },
    { last_sign_in_at: '2026-10-20T08:00:00Z', created_at: '2026-10-01T10:00:00Z' },
    { last_sign_in_at: null, created_at: '2026-09-01T10:00:00Z' }
  ];
  assert.deepEqual(IS.ozet(u, SIMDI), { toplam: 4, bugun: 1, gun7: 2, gun30: 3, buAyYeni: 1 });
});

test('gunluk: son N gün, boş günler 0; her üye günde bir kez sayılır', () => {
  const g = IS.gunluk([{ gun: '2026-11-11' }, { gun: '2026-11-11' }, { gun: '2026-11-09' }, { gun: '2026-10-01' }], 3, SIMDI);
  assert.deepEqual(g, [{ gun: '2026-11-09', deger: 1 }, { gun: '2026-11-10', deger: 0 }, { gun: '2026-11-11', deger: 2 }]);
});

test('haftalik: pazartesiden başlayan haftalara yeni kayıtlar', () => {
  const h = IS.haftalik([{ created_at: '2026-11-10T10:00:00Z' }, { created_at: '2026-11-03T10:00:00Z' }, { created_at: '2026-11-08T10:00:00Z' }], 2, SIMDI);
  assert.deepEqual(h, [{ gun: '2026-11-02', deger: 2 }, { gun: '2026-11-09', deger: 1 }]);
});

test('onceYazi: son giriş zamanı sade Türkçe', () => {
  assert.equal(IS.onceYazi(null, SIMDI), 'hiç girmedi');
  assert.equal(IS.onceYazi('2026-11-11T17:58:00Z', SIMDI), 'az önce');
  assert.equal(IS.onceYazi('2026-11-11T15:00:00Z', SIMDI), '3 saat önce');
  assert.equal(IS.onceYazi('2026-11-08T15:00:00Z', SIMDI), '3 gün önce');
});

test('cubukGrafik: her değer için bir çubuk, değerler kaçışlı, boş veride çökmez', () => {
  const s = IS.cubukGrafik([{ etiket: '<a>', deger: 3 }, { etiket: 'b', deger: 0 }]);
  assert.match(s, /^<svg/);
  assert.equal((s.match(/<rect /g) || []).length, 2);
  assert.ok(!s.includes('<a>'));
  assert.match(IS.cubukGrafik([]), /^<svg/);
});

test('SQL: giriş günlüğü yalnız yöneticiye okunur, yazma yalnız giris_kaydet ile; üye listesi yalnız yöneticiye', () => {
  const s = oku('supabase/istatistik.sql');
  assert.match(s, /create table if not exists public\.giris_gunluk/);
  assert.match(s, /enable row level security/);
  assert.match(s, /for select to authenticated using \(public\.is_admin\(\)\)/);
  assert.doesNotMatch(s, /for (insert|update|delete|all)/);
  assert.match(s, /if not public\.is_admin\(\) then\s+raise exception/);
  assert.match(s, /revoke all on function public\.istatistik_uyeler\(\) from public, anon/);
  assert.doesNotMatch(s, /alter table public\.(profiles|demo_access|feedback_notes)/);
});

test('giriş yapınca günde bir kez giris_kaydet çağrılır', () => {
  const a = oku('auth.js');
  assert.match(a, /rpc\('giris_kaydet'\)/);
});

test('sayfa: yalnız yönetici; menüde İSTATİSTİKLER yalnız yöneticiye', () => {
  const h = oku('istatistik.html');
  assert.match(h, /istatistik\.js\?v=\d+/);
  const j = oku('istatistik.js');
  assert.match(j, /role !== 'admin'/);
  assert.match(j, /rpc\('istatistik_uyeler'\)/);
  assert.match(j, /\/api\/istatistik/);
  const a = oku('auth.js');
  assert.match(a, /state\.profile\?\.role === 'admin' \? '[^']*<a href="istatistik\.html">İSTATİSTİKLER<\/a>/);
  assert.match(a, /'istatistik\.html'/); // uygulamada gizli sayfalar listesinde
});

test('sunucu: anahtar yoksa bağlı değil der; yönetici değilse reddeder; anahtar depoda yok', async () => {
  const s = oku('api/istatistik.js');
  assert.match(s, /process\.env\.VERCEL_ISTATISTIK_ANAHTARI/);
  assert.match(s, /rpc\/is_admin/);
  assert.match(s, /api\.vercel\.com\/v1\/query\/web-analytics\/visits\/aggregate/);
  const yanit = () => { const r = { kod: 0, govde: null, status(k) { r.kod = k; return r; }, json(g) { r.govde = g; return r; }, setHeader() {} }; return r; };
  const eski = process.env.VERCEL_ISTATISTIK_ANAHTARI;
  delete process.env.VERCEL_ISTATISTIK_ANAHTARI;
  const r1 = yanit(); await API({ method: 'GET', headers: {} }, r1);
  assert.equal(r1.kod, 401);
  process.env.VERCEL_ISTATISTIK_ANAHTARI = 'deneme';
  const asil = global.fetch;
  global.fetch = async () => ({ ok: true, json: async () => false });
  const r2 = yanit(); await API({ method: 'GET', headers: { authorization: 'Bearer x' } }, r2);
  assert.equal(r2.kod, 403);
  global.fetch = asil;
  if (eski === undefined) delete process.env.VERCEL_ISTATISTIK_ANAHTARI; else process.env.VERCEL_ISTATISTIK_ANAHTARI = eski;
});
