// Parça kaynak kaydı: her parçanın nereden geldiği (Suno / FMA-CC0 / kendi
// kaydı / diğer), Suno parçalarında üretim günü, o gün aboneliğin açık olup
// olmadığı ve indirme günü. Amaç: "bu müziği kullanma hakkın var mı" sorusuna
// kanıt. Bilgiler yalnız yöneticide görünür; sunum ve şube ekranı okumaz.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const sqlHam = fs.readFileSync(require.resolve('../supabase/parca-kaynak.sql'), 'utf8');
const sql = sqlHam.replace(/--[^\n]*/g, '');
const yonetim = fs.readFileSync(require.resolve('../radyo-yonetim.js'), 'utf8');
const sunum = fs.readFileSync(require.resolve('../coffee-marka.js'), 'utf8');
const V = require('../radyo-panel-views.js');

// ---------- SQL ----------
test('SQL ayrı tablo kurar; parça silinince kayıt da silinir', () => {
  assert.match(sql, /create table if not exists public\.radio_track_kaynak/);
  assert.match(sql, /track_id\s+uuid primary key references public\.radio_tracks\(id\) on delete cascade/);
  assert.match(sql, /kaynak\s+text check \(kaynak in \('suno', 'cc', 'kendi', 'diger'\)\)/);
  ['uretim_tarihi\\s+date', 'abonelik_acik\\s+boolean', 'indirme_tarihi\\s+date', 'kanit_notu\\s+text']
    .forEach(s => assert.match(sql, new RegExp(s), s));
  assert.ok(!/alter table public\.radio_tracks/.test(sql), 'parça tablosuna sütun eklenmemeli');
});

test('SQL yalnız yöneticiye açar; başka tablonun iznine dokunmaz', () => {
  assert.match(sql, /alter table public\.radio_track_kaynak enable row level security/);
  assert.match(sql, /revoke all on public\.radio_track_kaynak from anon/);
  const politikalar = sql.match(/create policy[\s\S]*?;/g) || [];
  assert.equal(politikalar.length, 1, 'tek politika olmalı');
  assert.match(politikalar[0], /on public\.radio_track_kaynak/);
  assert.match(politikalar[0], /using \(public\.is_admin\(\)\)/);
  assert.match(politikalar[0], /with check \(public\.is_admin\(\)\)/);
  // Başka tabloların politikası değişmez.
  (sql.match(/(drop|alter) policy[^;]*;/g) || []).forEach(p =>
    assert.match(p, /on public\.radio_track_kaynak/, 'yalnız kendi tablosu: ' + p));
});

test('sunum ve şube ekranı kaynak tablosunu okumaz', () => {
  assert.ok(!sunum.includes('radio_track_kaynak'));
});

// ---------- Durum etiketi ----------
test('kaydı olmayan parça KAYNAK YOK', () => {
  const d = V.parcaKaynakDurumu(null);
  assert.equal(d.eksik, true);
  assert.equal(d.etiket, 'KAYNAK YOK');
  assert.equal(V.parcaKaynakDurumu({ kaynak: null }).etiket, 'KAYNAK YOK');
});

test('tam Suno kaydı üretim gününü gösterir', () => {
  const d = V.parcaKaynakDurumu({ kaynak: 'suno', uretim_tarihi: '2026-10-12', abonelik_acik: true, indirme_tarihi: '2026-10-13' });
  assert.equal(d.eksik, false);
  assert.equal(d.tehlike, false);
  assert.equal(d.etiket, 'SUNO · 12.10.2026');
});

test('Suno kaydında tarih ya da abonelik bilgisi yoksa eksik sayılır', () => {
  assert.equal(V.parcaKaynakDurumu({ kaynak: 'suno', uretim_tarihi: '2026-10-12', abonelik_acik: true }).etiket, 'SUNO · EKSİK');
  assert.equal(V.parcaKaynakDurumu({ kaynak: 'suno', uretim_tarihi: '2026-10-12', indirme_tarihi: '2026-10-13' }).eksik, true);
});

test('abonelik kapalıyken yapılan Suno parçası tehlike olarak işaretlenir', () => {
  const d = V.parcaKaynakDurumu({ kaynak: 'suno', uretim_tarihi: '2026-10-12', abonelik_acik: false, indirme_tarihi: '2026-10-13' });
  assert.equal(d.tehlike, true);
  assert.equal(d.etiket, 'SUNO · ABONELİK YOK');
});

test('Creative Commons ve diğer kaynaklar kanıt notu ister; kendi kaydı istemez', () => {
  assert.equal(V.parcaKaynakDurumu({ kaynak: 'cc' }).etiket, 'CREATIVE COMMONS · EKSİK');
  assert.equal(V.parcaKaynakDurumu({ kaynak: 'cc', kanit_notu: 'HoliznaCC0 · CC0' }).etiket, 'CREATIVE COMMONS');
  assert.equal(V.parcaKaynakDurumu({ kaynak: 'diger' }).eksik, true);
  assert.equal(V.parcaKaynakDurumu({ kaynak: 'kendi' }).etiket, 'KENDİ KAYDI');
  assert.equal(V.parcaKaynakDurumu({ kaynak: 'kendi' }).eksik, false);
});

// ---------- Kayıt doğrulama ----------
test('form kaydı temizlenir; boş alan null olur', () => {
  const r = V.parcaKaynakKaydi({ kaynak: 'suno', uretim: '2026-10-12', abonelik: 'evet', indirme: '2026-10-13', not: '  suno.com/song/abc  ' }, '2026-10-22');
  assert.deepEqual(r, { kayit: { kaynak: 'suno', uretim_tarihi: '2026-10-12', abonelik_acik: true, indirme_tarihi: '2026-10-13', kanit_notu: 'suno.com/song/abc' } });
  const bos = V.parcaKaynakKaydi({ kaynak: 'kendi', uretim: '', abonelik: '', indirme: '', not: '' }, '2026-10-22');
  assert.deepEqual(bos.kayit, { kaynak: 'kendi', uretim_tarihi: null, abonelik_acik: null, indirme_tarihi: null, kanit_notu: null });
});

test('Suno dışı kaynakta abonelik bilgisi tutulmaz', () => {
  const r = V.parcaKaynakKaydi({ kaynak: 'cc', uretim: '', abonelik: 'evet', indirme: '', not: 'link' }, '2026-10-22');
  assert.equal(r.kayit.abonelik_acik, null);
});

test('hatalı girişler reddedilir', () => {
  assert.match(V.parcaKaynakKaydi({ kaynak: '' }, '2026-10-22').hata, /Kaynağı seç/);
  assert.match(V.parcaKaynakKaydi({ kaynak: 'baska' }, '2026-10-22').hata, /Kaynağı seç/);
  assert.match(V.parcaKaynakKaydi({ kaynak: 'suno', uretim: '2026-10-14', indirme: '2026-10-13' }, '2026-10-22').hata, /İndirme tarihi üretimden önce olamaz/);
  assert.match(V.parcaKaynakKaydi({ kaynak: 'suno', uretim: '2026-11-01' }, '2026-10-22').hata, /İleri bir tarih/);
  assert.match(V.parcaKaynakKaydi({ kaynak: 'suno', uretim: '12.10.2026' }, '2026-10-22').hata, /tarih/);
});

// ---------- Pencere ----------
test('kaynak penceresi mevcut kaydı doldurur ve metni kaçırır', () => {
  const html = V.parcaKaynakPenceresi({ title: '<b>Gece</b>' },
    { kaynak: 'suno', uretim_tarihi: '2026-10-12', abonelik_acik: true, indirme_tarihi: '2026-10-13', kanit_notu: '"><script>' });
  ['kaynak-tur', 'kaynak-uretim', 'kaynak-abonelik', 'kaynak-indirme', 'kaynak-not'].forEach(id => assert.ok(html.includes(`id="${id}"`), id));
  assert.match(html, /<option value="suno" selected>/);
  assert.match(html, /<option value="evet" selected>/);
  assert.match(html, /id="kaynak-uretim" type="date" value="2026-10-12"/);
  assert.ok(html.includes('&lt;b&gt;Gece&lt;/b&gt;'));
  assert.ok(!html.includes('"><script>'));
  assert.match(html, /Yalnız sen görürsün/);
});

test('boş pencerede kaynak seçilmemiş gelir', () => {
  const html = V.parcaKaynakPenceresi({ title: 'Parça' }, null);
  assert.match(html, /<option value="" selected>Seç…<\/option>/);
});

// ---------- Klasör ekranı ----------
const D = {
  brands: [], players: [], broadcast: [], announcements: [], playlists: [], playlistTracks: [],
  coffeeAttempts: [], subscriptions: [], plans: [], requests: [],
  folders: [{ id: 'f1', name: 'Sabah', cover_path: null, shuffle: true }],
  tracks: [
    { id: 't1', folder_id: 'f1', title: 'Bir', storage_path: 'f1/a.wav', sort_order: 0, duration_sec: 60, cover_path: 'x.jpg' },
    { id: 't2', folder_id: 'f1', title: 'İki', storage_path: 'f1/b.wav', sort_order: 1, duration_sec: 60, cover_path: 'x.jpg' },
    { id: 't3', folder_id: 'f1', title: 'Üç', storage_path: 'f1/c.wav', sort_order: 2, duration_sec: 60, cover_path: 'x.jpg' }
  ],
  kaynaklar: { t1: { kaynak: 'suno', uretim_tarihi: '2026-10-12', abonelik_acik: true, indirme_tarihi: '2026-10-13' } },
  kurulum: { 'parca-kaynak.sql': true }
};
const ui = { cover: p => '/k/' + p, ses: p => p, anons: p => p, playerBase: () => '', accept: () => '', desteklenenler: () => '', parcaNotu: () => '', now: () => Date.now() };
const durum = { nav: 'icerik', sub: 'klasorler', openFolder: 'f1', openBrand: null, openPlaylist: null, q: '' };

test('klasörde her parçada KAYNAK düğmesi ve durum etiketi; başlıkta eksik sayısı', () => {
  const { html } = V.gorunum(durum, D, ui);
  assert.equal((html.match(/data-act="track-kaynak"/g) || []).length, 3);
  assert.ok(html.includes('SUNO · 12.10.2026'));
  assert.equal((html.match(/>KAYNAK YOK</g) || []).length, 2);
  assert.ok(html.includes('2 KAYNAK EKSİK'), 'başlıkta eksik sayısı');
});

test('SQL kurulmadıysa kaynak düğmesi ve etiketleri çizilmez', () => {
  const kurulmamis = Object.assign({}, D, { kurulum: { 'parca-kaynak.sql': false } });
  const { html } = V.gorunum(durum, kurulmamis, ui);
  assert.ok(!html.includes('track-kaynak'));
  assert.ok(!html.includes('KAYNAK YOK'));
  assert.ok(!html.includes('KAYNAK EKSİK'));
});

test('kurulum ekranı kaynak kaydını listeler', () => {
  const { html } = V.gorunum({ nav: 'kurulum', sub: null, q: '' }, D, ui);
  assert.ok(html.includes('Parça kaynak kaydı'));
});

// ---------- Toplu düzenle ----------
test('toplu düzenlemede kaynak alanları ve parçanın kaynak durumu görünür', () => {
  const html = V.topluDuzenlePenceresi(D.tracks.map(t => Object.assign({ kaynakKaydi: D.kaynaklar[t.id] || null }, t)), 'Sabah', false, true);
  ['toplu-kaynak-tur', 'toplu-kaynak-uretim', 'toplu-kaynak-abonelik', 'toplu-kaynak-indirme', 'toplu-kaynak-not']
    .forEach(id => assert.ok(html.includes(`id="${id}"`), id));
  assert.ok(html.includes('data-act="toplu-kaynaksiz"'), 'kaynaksızları seç düğmesi');
  assert.ok(html.includes('SUNO · 12.10.2026'));
  const yok = V.topluDuzenlePenceresi(D.tracks, '', false, false);
  assert.ok(!yok.includes('toplu-kaynak-tur'));
});

// ---------- Yönetim bağlantısı ----------
test('panel kaynakları ayrı ve hataya toleranslı yükler, upsert ile yazar', () => {
  assert.match(yonetim, /client\.from\('radio_track_kaynak'\)\s*\.select\('track_id,kaynak,uretim_tarihi,abonelik_acik,indirme_tarihi,kanit_notu'\)/);
  assert.match(yonetim, /D\.kurulum\['parca-kaynak\.sql'\] = !kaynak\.error/);
  assert.match(yonetim, /case 'track-kaynak':/);
  assert.match(yonetim, /from\('radio_track_kaynak'\)\s*\.upsert\(/);
  assert.match(yonetim, /onConflict: 'track_id'/);
  // Tabloda id sütunu yok: yazDogrula (select('id')) bu tabloya kullanılmamalı.
  assert.ok(!/yazDogrula\(\s*client\.from\('radio_track_kaynak'\)/.test(yonetim));
});
