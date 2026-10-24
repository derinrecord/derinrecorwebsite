// Projelerim · Genel klasör notlarını düzenle / sil (24 Ekim).
// Kural: herkes yalnız KENDİ notunu düzenler ve siler; yönetici ayrıca
// antrenörün notunu SİLEBİLİR ama metnini değiştiremez. Sistem mesajları ve
// sesli notlar bu düğmelerle değişmez.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const N = require('../not-islemleri.js');
const oku = y => fs.readFileSync(path.join(__dirname, '..', y), 'utf8');

const BEN = 'u-ben', HOCA = 'u-hoca';
const not = ek => Object.assign({ id: 'n1', kind: 'note', author_id: BEN, body: 'merhaba', voice_path: null }, ek);

// ---------- Yetki ----------
test('kendi yazı notunu düzenler ve siler', () => {
  assert.deepEqual(N.yetki(not(), BEN, false), { duzenle: true, sil: true });
  assert.deepEqual(N.yetki(not(), BEN, true), { duzenle: true, sil: true });
});

test('antrenör başkasının notuna dokunamaz', () => {
  assert.deepEqual(N.yetki(not({ author_id: 'u-yonetici' }), HOCA, false), { duzenle: false, sil: false });
});

test('yönetici antrenörün notunu siler ama düzenleyemez', () => {
  assert.deepEqual(N.yetki(not({ author_id: HOCA }), BEN, true), { duzenle: false, sil: true });
});

test('sistem mesajı ve sesli not bu düğmelerle değişmez', () => {
  assert.deepEqual(N.yetki(not({ kind: 'system' }), BEN, true), { duzenle: false, sil: false });
  assert.deepEqual(N.yetki(not({ voice_path: 'a/b.webm' }), BEN, true), { duzenle: false, sil: false });
  assert.deepEqual(N.yetki(null, BEN, true), { duzenle: false, sil: false });
});

test('kimliği olmayan kullanıcı hiçbir şey yapamaz', () => {
  assert.deepEqual(N.yetki(not(), null, false), { duzenle: false, sil: false });
});

// ---------- Düzenleme denetimi ----------
test('yeni metin kırpılır; boş, aynı ya da çok uzun metin reddedilir', () => {
  assert.deepEqual(N.yeniMetin('eski', '  yeni  '), { metin: 'yeni' });
  assert.match(N.yeniMetin('eski', '   ').hata, /boş/);
  assert.equal(N.yeniMetin('eski', ' eski ').degismedi, true);
  assert.match(N.yeniMetin('eski', 'x'.repeat(N.EN_UZUN + 1)).hata, /uzun/);
});

// ---------- SQL ----------
const sql = oku('supabase/not-duzenle-sil.sql').replace(/--[^\n]*/g, '');

test('SQL: antrenöre yalnız kendi projesindeki kendi yazı notunu silme izni', () => {
  const sil = sql.match(/create policy "feedback: coach deletes own note"[\s\S]*?;/);
  assert.ok(sil, 'silme politikası olmalı');
  assert.match(sil[0], /for delete to authenticated/);
  assert.match(sil[0], /author_id = auth\.uid\(\)/);
  assert.match(sil[0], /public\.proje_sahibi\(project_id\) = auth\.uid\(\)/);
  assert.match(sil[0], /kind = 'note'/);
  assert.match(sil[0], /voice_path is null/);
});

test('SQL: koruma metne izin verir, diğer alanları kilitli tutar, düzenlenme zamanını yazar', () => {
  assert.match(sql, /add column if not exists duzenlendi_at timestamptz/);
  const fn = sql.match(/create or replace function public\.not_yalniz_zaman_degissin\(\)[\s\S]*?\$\$;/)[0];
  ['id', 'project_id', 'author_id', 'track_id', 'kind', 'voice_path', 'created_at']
    .forEach(a => assert.match(fn, new RegExp(`new\\.${a}\\s+is distinct from old\\.${a}`), a + ' kilitli olmalı'));
  assert.ok(!/new\.body\s+is distinct from old\.body then\s*raise/.test(fn), 'metin artık kilitli değil');
  assert.match(fn, /if new\.body is distinct from old\.body then[\s\S]*?new\.duzenlendi_at := now\(\)/);
  assert.match(fn, /old\.kind is distinct from 'note'/, 'sistem mesajının metni değişemez');
  assert.match(fn, /btrim\(coalesce\(new\.body, ''\)\) = ''/, 'boş metin kaydedilemez');
});

test('SQL: başka tablo ya da politika değişmez', () => {
  (sql.match(/(create|drop|alter) policy[^;]*;/g) || []).forEach(p =>
    assert.match(p, /on public\.project_feedback/, p));
  const politikalar = (sql.match(/create policy "([^"]+)"/g) || []);
  assert.deepEqual(politikalar, ['create policy "feedback: coach deletes own note"']);
});

// ---------- Ekran ----------
const kaynak = oku('projects.js');

test('genel klasörde WhatsApp gibi küçük açılır menü: ⌄ → Düzenle / Sil', () => {
  const g = kaynak.match(/function genelGovdesi\(\)\{[\s\S]*?\n  \}/)[0];
  assert.ok(g.includes('NotIslem.yetki(f,me,admin)'));
  assert.ok(g.includes('class="not-menu-ac" data-notmenu="${safe(f.id)}" aria-haspopup="menu"'), 'küçük ⌄ düğmesi');
  assert.ok(g.includes('class="not-menu" role="menu"'), 'açılır menü');
  assert.ok(g.includes('data-notduzenle="${safe(f.id)}"'));
  assert.ok(g.includes('data-notsil="${safe(f.id)}"'));
  assert.ok(g.includes('detail.acikNotMenu===f.id'), 'menü yalnız tıklanınca açık');
  assert.ok(g.includes('f.duzenlendi_at'), 'düzenlendi bilgisi görünmeli');
  assert.ok(g.includes('data-notyeni'), 'düzenleme kutusu');
});

test('menü dışına tıklayınca ya da Esc ile kapanır', () => {
  assert.match(kaynak, /detail\.acikNotMenu=null/);
  assert.match(kaynak, /key==='Escape'[\s\S]{0,120}acikNotMenu/);
});

test('silme onay sorar ve tek satırı siler; düzenleme yalnız metni yazar', () => {
  assert.match(kaynak, /\[data-notsil\][\s\S]{0,400}confirm\(/);
  assert.match(kaynak, /from\('project_feedback'\)\.delete\(\)\.eq\('id',id\)/);
  assert.match(kaynak, /from\('project_feedback'\)\.update\(\{body:sonuc\.metin\}\)\.eq\('id',id\)/);
});

test('sayfa not-islemleri.js modülünü projects.js\'ten önce yükler', () => {
  const html = oku('my-projects.html');
  const i = html.indexOf('<script src="not-islemleri.js?v=');
  assert.ok(i > 0 && i < html.indexOf('<script src="projects.js?v='));
});
