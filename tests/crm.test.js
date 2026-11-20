// CRM modülü (15 Kasım 2026): mekân radyo lisansı satış takibi. Şartname docs/crm/.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const oku = d => fs.readFileSync(path.join(__dirname, '..', d), 'utf8');

const sozluk = (() => { const ctx = { window: {} }; vm.runInNewContext(oku('crm-sozluk.js'), ctx); const s = ctx.window.DerinCrmSozluk; return Object.assign(JSON.parse(JSON.stringify(s)), { hataMetni: s.hataMetni }); })();
const sql = oku('supabase/crm.sql');
const kisit = (sutun) => { const m = sql.match(new RegExp(sutun + "[^\\n]*\\n?[^\\n]*check \\(" + sutun + " in \\(([^)]*)\\)")); assert.ok(m, sutun + ' kısıtı bulunamadı'); return m[1].match(/'([^']+)'/g).map(s => s.slice(1, -1)); };

test('sayfa: oturum, sözlük ve ekran betikleri; arama motoruna kapalı; mobil katman', () => {
  const h = oku('crm.html');
  for (const b of ['config.js', 'auth.js?v=20261120b', 'crm-sozluk.js?v=1', 'crm.js?v=2']) assert.ok(h.includes(`src="${b}"`), b);
  assert.ok(h.indexOf('crm-sozluk.js') < h.indexOf('crm.js?v'), 'sözlük önce yüklenmeli');
  assert.match(h, /<meta name="robots" content="noindex">/);
  assert.match(h, /href="mobil\.css\?v=5"/);
  assert.match(h, /safe-area-inset-bottom/);
});

test('alt sekmeler: Bugün · Firmalar · ＋ · Ödeme ve ana sayfaya dönüş yolu', () => {
  const h = oku('crm.html');
  const sira = ['data-sekme="bugun"', 'data-sekme="firmalar"', 'id="crm-ekle"', 'data-sekme="odeme"'].map(s => h.indexOf(s));
  sira.forEach(i => assert.ok(i > 0));
  assert.deepEqual([...sira].sort((a, b) => a - b), sira);
  assert.match(h, /class="home" href="index\.html"/);
});

test('menü: CRM bağlantısı yalnız yönetici listesinde', () => {
  const a = oku('auth.js');
  const i = a.indexOf('<a href="crm.html" class="menu-crm">CRM</a>');
  assert.ok(i > a.indexOf("state.profile?.role === 'admin' ?"), 'yönetici dalında olmalı');
  assert.ok(i < a.indexOf("' : '<a href=\"music-request.html\">"), 'müşteri dalında olmamalı');
});

test('sözlük kodları veritabanı kısıtlarıyla birebir aynı', () => {
  assert.deepEqual(sozluk.ASAMA_SIRA, kisit('stage'));
  assert.deepEqual(Object.keys(sozluk.ASAMA), kisit('stage'));
  assert.deepEqual(sozluk.SONUC_SIRA, kisit('outcome'));
  assert.deepEqual(Object.keys(sozluk.AKTIVITE), kisit('activity_type'));
  assert.deepEqual(Object.keys(sozluk.GOREV), kisit('task_type'));
  assert.deepEqual(Object.keys(sozluk.KAYIP), kisit('lost_reason'));
  assert.deepEqual(Object.keys(sozluk.ROL), kisit('role'));
  assert.deepEqual(Object.keys(sozluk.KAYNAK), kisit('source'));
  assert.deepEqual(Object.keys(sozluk.YON), kisit('direction'));
});

test('ajanda türev listeleri şartnameyle ve SQL ile aynı', () => {
  assert.deepEqual([...sozluk.AKTIF_TAKIP], ['contacted', 'followup', 'demo', 'profile', 'offer']);
  assert.deepEqual([...sozluk.FIRSAT], ['new', 'contacted', 'followup', 'demo', 'profile', 'offer', 'waiting']);
  assert.match(sql, /a\.stage in \('new','contacted','followup','demo','profile','offer','waiting'\)/);
  assert.match(sql, /a\.stage in \('contacted','followup','demo','profile','offer'\)/);
});

test('sunucu hata anahtarlarının hepsi Türkçeye çevrili; "bir şeyler ters gitti" yok', () => {
  const anahtarlar = [...new Set([...sql.matchAll(/raise exception '([A-Za-z]+)'/g)].map(m => m[1]))];
  assert.ok(anahtarlar.length >= 8);
  for (const k of anahtarlar) assert.ok(sozluk.HATA[k], k + ' çevrilmeli');
  assert.equal(sozluk.hataMetni({ message: 'TaskAlreadyClosed' }), 'Bu görev zaten kapatılmış.');
  assert.doesNotMatch(oku('crm.js') + oku('crm-sozluk.js'), /ters gitti/i);
});

test('tek saat: CRM SQL\'inde ham now()/current_date yalnız crm_simdi içinde', () => {
  const temiz = sql.split('\n').filter(s => !s.trim().startsWith('--')).join('\n');
  const now = [...temiz.matchAll(/\bnow\(\)/g)].length;
  assert.equal(now, 1, 'now() yalnız crm_simdi tanımında');
  assert.doesNotMatch(temiz, /current_date/);
  assert.match(temiz, /Europe\/Istanbul/);
  assert.match(oku('crm.js'), /timeZone: 'Europe\/Istanbul'/);
});

test('yetki: tablolar RLS ile yalnız CRM sahibine; anon fonksiyon çağıramaz', () => {
  assert.match(sql, /public\.is_admin\(\) and exists \(select 1 from public\.crm_sahip where user_id = auth\.uid\(\)\)/);
  assert.match(sql, /create policy "crm: yalnız CRM sahibi" on public\.%I for all to authenticated using \(public\.crm_yetkili\(\)\) with check \(public\.crm_yetkili\(\)\)/);
  assert.match(sql, /revoke execute on function public\.%s from public, anon/);
  assert.match(oku('crm.js'), /rpc\('crm_yetkili'\)/);
});

test('ekranın çağırdığı her RPC SQL\'de tanımlı ve yetkiye bağlı', () => {
  const js = oku('crm.js');
  const cagrilar = [...new Set([...js.matchAll(/rpc\('([a-z_]+)'/g)].map(m => m[1]))];
  for (const f of cagrilar) {
    assert.match(sql, new RegExp(`create or replace function public\\.${f}\\(`), f);
    if (f !== 'crm_yetkili') assert.match(sql, new RegExp(`function public\\.${f}\\([^]*?crm_yetki_kontrol\\(\\)`), f + ' yetki kontrolü');
  }
});

test('üç tık akışı: tek istek (tamamla ya da aktivite+görev), idempotent istek kimliği', () => {
  const js = oku('crm.js');
  assert.match(js, /rpc\('crm_gorev_tamamla', \{ p_task: gorev\.task_id, p_aktivite: akt, p_sonraki: next \}\)/);
  assert.match(js, /rpc\('crm_aktivite_ekle', \{ p: Object\.assign\(\{ account_id: hesap, next_task: next \}, akt\) \}\)/);
  assert.match(js, /istek_id: st\.istek/);
  assert.match(js, /st\.sonuc === 'busy_callback' && !next/);
  assert.match(js, /akt\.stage = 'lost'; akt\.lost_reason = st\.kayip;/);
  assert.match(js, /rows="7"/, 'not alanı uzun olmalı');
});

test('hızlı ekle: kaydettikten sonra açık kalır, mükerrer uyarır ama engellemez', () => {
  const js = oku('crm.js');
  assert.match(js, /rpc\('crm_mukerrer'/);
  assert.match(js, /Aynı yer mi\? Değilse kaydetmeye devam edebilirsin\./);
  assert.match(js, /istek = uuid\(\); al\('name'\)\.focus\(\);/);
});

test('liste: 30\'luk sayfa, "daha fazla", filtre ve kaydırma konumu saklanır', () => {
  const js = oku('crm.js');
  assert.match(js, /page_size: 30/);
  assert.match(js, />Daha fazla</);
  assert.match(js, /sessionStorage\.setItem\(F_ANAHTAR/);
  assert.match(js, /window\.scrollTo\(0, f\.scroll\)/);
});

test('XSS: kullanıcı verisi kaçışla basılır; derin link görevi açar', () => {
  const js = oku('crm.js');
  assert.match(js, /const kacis = /);
  assert.match(js, /\$\{kacis\(a\.name\)\}/);
  assert.match(js, /\$\{kacis\(g\.summary\)\}/);
  assert.match(js, /q\.get\('task'\)/);
});

test('şartname yayına çıkmaz', () => {
  assert.match(oku('.vercelignore'), /^docs\/?$/m);
});

test('gelir: parça satışları onaylandığı aya düşer; veri kopyalanmaz; yalnız CRM sahibi', () => {
  assert.match(sql, /create or replace function public\.crm_gelir\(p_yil int default null\)/);
  assert.match(sql, /function public\.crm_gelir[^]*?crm_yetki_kontrol\(\)[^]*?from public\.project_tracks t[^]*?satin_alma_durum = 'odendi'/);
  assert.match(sql, /odendi_at at time zone 'Europe\/Istanbul'/);
  assert.match(sql, /satin_alma_durum in \('istendi', 'dekont'\)/, 'onay bekleyenler ayrı gösterilir');
  assert.doesNotMatch(sql, /insert into public\.crm_\w+[^;]*project_tracks/, 'satışlar CRM tablosuna kopyalanmaz');
  const js = oku('crm.js');
  assert.match(js, /rpc\('crm_gelir', \{ p_yil: gelirYil \}\)/);
  assert.match(js, /henüz gelire sayılmadı/);
});
