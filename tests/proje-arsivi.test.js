// Proje arşivi (26 Ekim): SİL yerine ARŞİVE AT; arşiv yalnız yöneticide.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const kok = path.join(__dirname, '..');
const js = fs.readFileSync(path.join(kok, 'projects.js'), 'utf8');
const sql = fs.readFileSync(path.join(kok, 'supabase/proje-arsivi.sql'), 'utf8');

test('SQL: sütunlar ve yalnız yöneticinin değiştirebildiği koruma; RLS politikasına dokunmaz', () => {
  assert.match(sql, /add column if not exists arsivde boolean not null default false/);
  assert.match(sql, /add column if not exists arsiv_tarihi timestamptz/);
  assert.match(sql, /if not public\.is_admin\(\) then/);
  assert.match(sql, /before insert or update on public\.music_projects/);
  assert.doesNotMatch(sql, /create policy|drop policy|alter policy/i);
});

test('antrenörün sorgusu arşivdekileri hiç çekmez', () => {
  assert.match(js, /if\(!admin\)q=q\.eq\('coach_id',me\)\.eq\('arsivde',false\);/);
});

test('arşivdekiler ana listeden ayrılır', () => {
  assert.match(js, /arsivProjeleri=admin\?hepsi\.filter\(p=>p\.arsivde\):\[\];/);
  assert.match(js, /projects=hepsi\.filter\(p=>!p\.arsivde\);/);
});

test('kartta SİL yerine ARŞİVE AT; arşiv bölümünde ARŞİVDEN ÇIKAR ve kalıcı SİL', () => {
  assert.match(js, /data-arsivat="\$\{p\.id\}"/);
  // 29 Ekim: ARŞİVE AT'ın yanında kalıcı SİL de var.
  assert.match(js, /data-arsivat="\$\{p\.id\}"[^\n]*ARŞİVE AT<\/button>\s*<button type="button" data-del="\$\{p\.id\}" class="tehlike"[^>]*>SİL<\/button><\/div>/);
  assert.match(js, /if\(dosyalar\.length\) await window\.DerinR2\.sil\('project-audio',dosyalar\);/);
  assert.match(js, /data-arsivcikar=/);
  assert.match(js, /function arsivBolumu\(\)\{\s*if\(!admin\|\|!arsivProjeleri\.length\)return '';/);
});

test('arşiv sütunu henüz yoksa sayfa eskisi gibi açılır', () => {
  assert.match(js, /42703/);
});
