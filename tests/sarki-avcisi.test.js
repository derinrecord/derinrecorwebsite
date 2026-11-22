// Şarkı Avcısı (2026-11-20) — yalnız yöneticiye açık: şarkıyı ölçer, 10 referans önerir.
// Kilitlenen kararlar:
//   1. Sayfa yönetici kapısı olmadan içerik göstermez; menüde yalnız yöneticiye görünür.
//   2. Ses dosyası sunucuya yüklenmez (analiz tarayıcıda); sunucu yalnız sayıları alır.
//   3. GetSongBPM anahtarı tarayıcıda değil, sunucu fonksiyonunda (ortam değişkeni).
//   4. Kullanılan / istenmeyen şarkılar tekrar önerilmez; en çok 10 öneri, sanatçı başına en çok 2.
//   5. Ücretsiz kullanım şartı: sayfada getsongbpm.com bağlantısı bulunur.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const KOK = path.join(__dirname, '..');
const oku = d => fs.readFileSync(path.join(KOK, d), 'utf8');
const S = require('../sarki-avcisi-cekirdek.js');

function tikSesi(bpm, sn, sr, guc) {
  const n = sr * sn, ch = new Float32Array(n);
  for (let b = 0; b * 60 / bpm < sn; b++) {
    const i = Math.round(b * 60 / bpm * sr);
    const g = guc ? guc(b) : 1;
    for (let k = 0; k < 400 && i + k < n; k++) ch[i + k] = g * Math.sin(k / 5) * Math.exp(-k / 80);
  }
  return ch;
}

test('tempo ölçümü 1 BPM içinde doğru (aerobik tempoları dahil)', () => {
  for (const bpm of [128, 140, 150, 155]) {
    const t = S.tempoBul(tikSesi(bpm, 30, 22050), 22050);
    assert.ok(Math.abs(t.bpm - bpm) <= 1.2, `${bpm} → ${t.bpm}`);
    assert.ok(Math.abs(t.yarim - t.bpm / 2) < 0.1, 'yarım tempo da dönmeli');
  }
});

test('enerji blokları 8 vuruşluk; sessizden güçlüye geçiş drop olarak işaretlenir', () => {
  const sr = 22050;
  const ch = tikSesi(150, 40, sr, b => (b < 32 ? 0.25 : 1));
  const bl = S.enerjiBloklari(ch, sr, 150);
  assert.ok(Math.abs((bl[0].bit - bl[0].bas) - 3.2) < 0.1, '150 BPM\'de bir sekizlik 3.2 sn');
  const anlar = S.onemliAnlar(bl);
  const drop = anlar.find(a => a.tur === 'drop');
  assert.ok(drop && Math.abs(drop.bas - 12.8) < 0.3, 'drop 32. vuruşta (12.8 sn)');
  assert.ok(S.enerjiOzeti(bl, anlar).some(s => s.includes('drop')));
});

test('ton yazımları Camelot koduna çevrilir', () => {
  assert.equal(S.tonCamelot('Em'), '9A');
  assert.equal(S.tonCamelot('E minor'), '9A');
  assert.equal(S.tonCamelot('F#m'), '11A');
  assert.equal(S.tonCamelot('Bb'), '6B');
  assert.equal(S.tonCamelot('C♯ major'), '3B');
  assert.equal(S.tonCamelot('Dbm'), '12A');
  assert.equal(S.tonCamelot('8a'), '8A');
  assert.equal(S.tonCamelot('Cmaj'), '8B');
  assert.equal(S.tonCamelot('saçma'), null);
  assert.equal(S.openKeyCamelot('1d'), '8B');
  assert.equal(S.openKeyCamelot('2m'), '9A');
});

test('/tempo/ adaylarına ton, /key/ listelerinden şarkı kimliğiyle eklenir', () => {
  assert.deepEqual(S.camelotParametre('8A'), { key_of: 9, mode: 0 }, '8A = A minor');
  assert.deepEqual(S.camelotParametre('8B'), { key_of: 0, mode: 1 }, '8B = C major');
  assert.equal(S.camelotParametre('xx'), null);
  const tempo = S.getsongbpmCoz({ tempo: [{ song_id: 's1', song_title: 'Bir', tempo: 150, artist: { name: 'A' } }, { song_id: 's2', song_title: 'İki', tempo: 151, artist: { name: 'B' } }] });
  const ton = S.getsongbpmCoz({ key: [{ song_id: 's1', song_title: 'Bir', music_key: { raw: '9', key_of: 'A', mode: 'minor' }, artist: { name: 'A' } }] });
  assert.equal(ton[0].camelot, '8A');
  const esli = S.tonlariEsle(tempo, ton);
  assert.equal(esli[0].camelot, '8A');
  assert.equal(esli[1].camelot, null, 'eşleşmeyen şarkının tonu bilinmiyor kalır');
});

test('ton uyumu: aynı, komşu (±1 ve A/B), uyumsuz, bilinmiyor', () => {
  assert.equal(S.tonUyumu('8A', '8A'), 'ayni');
  assert.equal(S.tonUyumu('8A', '8B'), 'komsu');
  assert.equal(S.tonUyumu('8A', '9A'), 'komsu');
  assert.equal(S.tonUyumu('12A', '1A'), 'komsu');
  assert.equal(S.tonUyumu('8A', '3B'), 'uyumsuz');
  assert.equal(S.tonUyumu('8A', null), null);
});

test('germe yüzdesi ve yarım tempo farkı', () => {
  assert.equal(S.germe(140, 150), 7.1);
  assert.equal(S.germe(150, 150), 0);
  assert.deepEqual(S.germeEnYakin(75, 150), { yuzde: 0, kat: 2 }, 'yarım tempo germe gerektirmez');
  assert.deepEqual(S.germeEnYakin(150.3, 150), { yuzde: 0, kat: 1 }, 'çok küçük fark sıfır sayılır');
  assert.equal(S.germeEnYakin(140, 150).yuzde, 7.1);
  assert.equal(S.tempoFarki(75, 150), 0, '75 BPM şarkı 150\'lik akışa oturur');
  assert.equal(S.tempoFarki(148, 150), 2);
});

test('GetSongBPM yanıtı savunmacı çözülür', () => {
  const adaylar = S.getsongbpmCoz({ tempo: [
    { song_id: 'a1', song_title: 'Şarkı Bir', tempo: '150', key_of: 'Am', artist: { name: 'Sanatçı', genres: ['pop', 'dance'] }, album: { year: 2025 }, song_uri: 'https://getsongbpm.com/song/x' },
    { song_id: 'a2', song_title: 'Open Key', tempo: 149, open_key: '2m', artist: { name: 'Başka' } },
    { song_title: '', artist: { name: 'Eksik' } },
    null
  ] });
  assert.equal(adaylar.length, 2);
  assert.deepEqual(adaylar[0], { id: 'a1', baslik: 'Şarkı Bir', sanatci: 'Sanatçı', bpm: 150, camelot: '8A', turler: ['pop', 'dance'], yil: 2025, kaynak: 'https://getsongbpm.com/song/x' });
  assert.equal(adaylar[1].camelot, '9A');
  assert.deepEqual(S.getsongbpmCoz(null), []);
  assert.deepEqual(S.getsongbpmCoz({ tempo: 'hata' }), []);
});

test('referans seçimi: en çok 10, tekrarsız, kullanılmış hariç, sanatçı başına en çok 2, uygun olan önde', () => {
  const adaylar = [];
  for (let i = 0; i < 30; i++) adaylar.push({ baslik: 'Parça ' + i, sanatci: 'Sanatçı ' + (i % 6), bpm: 150 + (i % 5), camelot: i % 2 ? '8A' : '3B', turler: i % 3 ? ['pop'] : ['rock'], yil: 2020 + (i % 6) });
  adaylar.push({ ...adaylar[0] }); // aynı şarkı iki kez gelirse tek sayılır
  const haric = [S.sarkiAnahtari('Parça 1', 'Sanatçı 1')];
  const sec = S.referansSec(adaylar, { bpm: 150, camelot: '8A', turler: ['pop'] }, haric, 10);
  assert.equal(sec.length, 10);
  assert.ok(!sec.some(r => r.anahtar === haric[0]), 'kullanılan şarkı önerilmez');
  assert.equal(new Set(sec.map(r => r.anahtar)).size, 10, 'tekrar yok');
  const say = {};
  sec.forEach(r => { say[r.sanatci] = (say[r.sanatci] || 0) + 1; });
  assert.ok(Object.values(say).every(n => n <= 2), 'sanatçı başına en çok 2');
  assert.ok(sec[0].tonUyumu === 'ayni' && sec[0].bpm === 150, 'en uygun önde');
  assert.match(sec[0].neden, /tempo birebir aynı · ton aynı \(8A\)/);
});

test('sayfa: yönetici kapısı, aramaya kapalı, içerik başlangıçta gizli', () => {
  const html = oku('sarki-avcisi.html');
  const js = oku('sarki-avcisi.js');
  assert.match(html, /<title>Şarkı Avcısı — Derin Record<\/title>/);
  assert.match(html, /<meta name="robots" content="noindex">/);
  assert.match(html, /<section id="sa-uygulama" hidden>/);
  assert.match(html, /data-dil-otomatik/);
  assert.match(js, /profile\?\.role !== 'admin'/);
  assert.match(js, /DerinAuth\.open\(\)/);
  assert.match(js, /uygulama\.hidden = false/);
});

test('ses dosyası sunucuya gitmez; sunucuya yalnız sayılar gider', () => {
  const js = oku('sarki-avcisi.js');
  assert.match(js, /decodeAudioData/, 'analiz tarayıcıda');
  const istek = js.slice(js.indexOf("fetch('/api/sarki-referans'"));
  assert.match(istek, /JSON\.stringify\(\{ bpm, camelot, turler, haric, adet: 10 \}\)/);
  assert.ok(!/FormData|r2-depo|storage\.from/.test(js), 'dosya yükleme yok');
});

test('sunucu fonksiyonu: yönetici doğrulaması, anahtar ortam değişkeninde, gizli değer depoda yok', () => {
  const api = oku('api/sarki-referans.js');
  assert.match(api, /auth\/v1\/user/);
  assert.match(api, /rpc\/is_admin/);
  assert.match(api, /process\.env\.GETSONGBPM_API_KEY/);
  assert.match(api, /status\(403\)/);
  assert.ok(!/api_key=[a-z0-9]{16,}/i.test(api), 'anahtar koda gömülmemeli');
  assert.ok(!/GETSONGBPM/.test(oku('sarki-avcisi.js')) || /Environment Variables/.test(oku('sarki-avcisi.js')), 'tarayıcıda anahtar yok');
});

test('takip tablosu yalnız yöneticinin kendi satırları (RLS)', () => {
  const sql = oku('supabase/sarki-avcisi.sql');
  assert.match(sql, /enable row level security/);
  assert.match(sql, /using \(public\.is_admin\(\) and user_id = auth\.uid\(\)\)/);
  assert.match(sql, /unique \(user_id, anahtar\)/);
});

test('menüde ve yönetim panelinde yalnız yöneticiye görünür; GetSongBPM bağlantısı var', () => {
  const auth = oku('auth.js');
  const satir = auth.split('\n').find(s => s.includes("account-menu-links').innerHTML"));
  const [yonetici, herkes] = satir.split("' : '");
  assert.ok(yonetici.includes('href="sarki-avcisi.html"'));
  assert.ok(!herkes.includes('sarki-avcisi.html'));
  assert.match(oku('admin.js'), /href="sarki-avcisi\.html"/);
  assert.match(oku('sarki-avcisi.html'), /href="https:\/\/getsongbpm\.com"/);
});

test('betik sırası: auth → çekirdek → sayfa', () => {
  const html = oku('sarki-avcisi.html');
  const a = html.indexOf('auth.js?v='), c = html.indexOf('sarki-avcisi-cekirdek.js?v='), s = html.indexOf('sarki-avcisi.js?v=');
  assert.ok(a > -1 && c > a && s > c);
});

test('referans durumu düğmenin hemen altında da yazılır', () => {
  const html = oku('sarki-avcisi.html');
  const bul = html.indexOf('id="sa-bul"'), durum = html.indexOf('id="sa-bul-durum"'), ref = html.indexOf('id="sa-referans"');
  assert.ok(bul > -1 && durum > bul && durum < ref);
  assert.match(oku('sarki-avcisi.js'), /byId\('sa-bul-durum'\)/);
});

test('Deezer arama yanıtı adaylara çevrilir (ton ve kesin BPM sonra dinlenerek eklenir)', () => {
  const a = S.deezerCoz({ data: [
    { type: 'track', id: 2263033, readable: true, title: 'Sultans Of Swing', title_short: 'Sultans Of Swing', link: 'https://www.deezer.com/track/2263033', rank: 958351, artist: { name: 'Dire Straits' }, album: { id: 1 } },
    { type: 'track', id: 5, readable: false, title: 'Kapalı', artist: { name: 'X' } },
    { type: 'artist', id: 6, name: 'Y' }
  ] });
  assert.equal(a.length, 1);
  assert.equal(a[0].deezerId, 2263033);
  assert.equal(a[0].camelot, null);
  assert.equal(a[0].kaynak, 'https://www.deezer.com/track/2263033');
  assert.deepEqual(S.deezerCoz(null), []);
});

test('tür eşleşmesi Türkçe yazımları da tanır', () => {
  assert.ok(S.turEslesir(['dans'], ['Dance', 'Pop']));
  assert.ok(S.turEslesir(['elektronik'], ['Electro']));
  assert.ok(!S.turEslesir(['rock'], ['Pop']));
  assert.ok(S.turEslesir([], ['Pop']), 'tür yazılmadıysa her şey uyar');
});

test('anahtar yoksa Deezer kullanılır; önizleme aktarıcısı yalnız yöneticiye ve yalnız Deezer CDN\'ine', () => {
  const api = oku('api/sarki-referans.js');
  assert.match(api, /if \(!anahtar\) \{[\s\S]*deezerAdaylari/);
  assert.match(api, /kaynak: 'deezer'/);
  const on = oku('api/sarki-onizleme.js');
  assert.match(on, /yoneticiMi\(req\.headers && req\.headers\.authorization\)/);
  assert.match(on, /\^\\d\{1,15\}\$/, 'id yalnız rakam');
  assert.match(on, /dzcdn\\\.net/, 'yalnız Deezer CDN adresi');
  const js = oku('sarki-avcisi.js');
  assert.match(js, /\/api\/sarki-onizleme\?id=/);
  assert.match(js, /onizlemeleriDinle/);
});
