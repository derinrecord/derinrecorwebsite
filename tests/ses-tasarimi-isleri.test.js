// Ses Tasarımı işleri (27 Ekim): yönetici ekler/düzenler/siler; video Derin'in
// yüklediği dosyadan oynar (Drive değil); ters/yan video döndürülebilir.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const oku = d => fs.readFileSync(path.join(__dirname, '..', d), 'utf8');
const S = require('../ses-tasarimi-isleri.js');

test('döndürme: 180 baş aşağı, 90/270 yan; çevirmeler eklenir', () => {
  assert.deepEqual(S.donusum({ donme: 0 }), { yan: false, transform: '' });
  assert.deepEqual(S.donusum({ donme: 180 }), { yan: false, transform: 'rotate(180deg)' });
  assert.deepEqual(S.donusum({ donme: 90, yatay_cevir: true }), { yan: true, transform: 'rotate(90deg) scaleX(-1)' });
  assert.deepEqual(S.donusum({ donme: 270, dikey_cevir: true }), { yan: true, transform: 'rotate(270deg) scaleY(-1)' });
  assert.deepEqual(S.donusum({ donme: 45 }), { yan: false, transform: '' });
});

test('R2 yolu: demo/ altında ses-tasarimi, Türkçe harfler sadeleşir', () => {
  assert.equal(S.r2Yolu('video', 'Düne Şahne 2.MP4', 'abc'), 'ses-tasarimi/video/abc-dune-sahne-2.mp4');
  assert.equal(S.r2Yolu('kapak', '', 'x'), 'ses-tasarimi/kapak/x-dosya');
});

test('dosya türleri ve sıra değişimi', () => {
  assert.ok(S.videoMu({ name: 'a.mov', type: '' }));
  assert.ok(!S.videoMu({ name: 'a.jpg', type: 'image/jpeg' }));
  assert.ok(S.resimMi({ name: 'a.webp', type: '' }));
  const isler = [{ id: 'a', sira: 10 }, { id: 'b', sira: 20 }];
  assert.deepEqual(S.siraDegistir(isler, 'b', -1), [{ id: 'b', sira: 10 }, { id: 'a', sira: 20 }]);
  assert.equal(S.siraDegistir(isler, 'a', -1), null);
});

test('kart: ad kaçışlanır; yönetim düğmeleri yalnız yöneticide', () => {
  const is = { id: '1', baslik: '<b>x</b>', kapak_url: 'k.jpg' };
  assert.doesNotMatch(S.kartHtml(is, false), /<b>x<\/b>|data-st-sil/);
  assert.match(S.kartHtml(is, true), /data-st-duzenle="1"[\s\S]*data-st-sil="1"/);
});

test('SQL: yeni tablo, herkes okur, yalnız yönetici yönetir; döndürme sütunları', () => {
  const sql = oku('supabase/ses-tasarimi-isleri.sql');
  assert.match(sql, /create table if not exists public\.ses_tasarimi_isleri/);
  assert.match(sql, /for select to anon, authenticated using \(true\)/);
  assert.match(sql, /for all to authenticated\s+using \(public\.is_admin\(\)\) with check \(public\.is_admin\(\)\)/);
  assert.match(sql, /donme in \(0, 90, 180, 270\)/);
  // başka tablonun kuralına dokunmaz
  assert.deepEqual([...sql.matchAll(/on public\.(\w+)/g)].map(m => m[1]).filter(t => t !== 'ses_tasarimi_isleri'), []);
});

test('sayfa: oturum ve R2 betikleri yüklü; eski Drive betiği kalktı', () => {
  const h = oku('ses-tasarimi.html');
  for (const b of ['config.js', 'auth.js?v=20261027a', 'r2-depo.js?v=3', 'ses-tasarimi-isleri.js?v=2']) assert.ok(h.includes(`src="${b}"`), b);
  assert.doesNotMatch(h, /iframe\.src = 'https:\/\/drive\.google\.com/);
});

// 27 Ekim: Megatron düzenleme formu açıkken silindi; kaydet "kayıt bulunamadı" dedi
// ve yüklenen video boşa gitti. Artık iş aynı sırada yeniden eklenir.
test('form açıkken silinen iş, yüklenen yeni videoyla yeniden eklenir', () => {
  const eski = { id: 'm', baslik: 'Megatron', sira: 10, kapak_url: 'assets/k.jpg', video_id: '1Det9SdiRmOYBL6R2XanFG', kapak_r2: null, video_r2: null };
  const satir = { baslik: 'Megatron', donme: 180, yatay_cevir: false, dikey_cevir: false, video_url: 'https://m/v.mp4', video_r2: 'ses-tasarimi/video/v.mp4', video_id: null };
  assert.deepEqual(S.yenidenEklenecek(eski, satir), {
    baslik: 'Megatron', sira: 10, donme: 180, yatay_cevir: false, dikey_cevir: false,
    kapak_url: 'assets/k.jpg', kapak_r2: null, video_url: 'https://m/v.mp4', video_r2: 'ses-tasarimi/video/v.mp4', video_id: null
  });
  const kod = fs.readFileSync(path.join(__dirname, '..', 'ses-tasarimi-isleri.js'), 'utf8');
  assert.match(kod, /if \(!sonuc\.error && sonuc\.data && !sonuc\.data\.length\) \{\s*sonuc = await client\.from\('ses_tasarimi_isleri'\)\.insert\(yenidenEklenecek\(duzenlenen, satir\)\)/);
  assert.match(kod, /form\.silindi\(is\.id\);/);
});
