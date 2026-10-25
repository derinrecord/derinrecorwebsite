// İndirme izni parça parça (25 Ekim, Derin): "3'ü indirsin istiyorsam sadece
// onun indirmesi açık olsun". Proje düzeyindeki toplu izin kalktı.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const oku = d => fs.readFileSync(path.join(__dirname, '..', d), 'utf8');
const j = oku('projects.js');
const sql = oku('supabase/parca-indirme-izni.sql').replace(/--[^\n]*/g, '');

test('SQL: parçaya indirme izni; yalnız yönetici değiştirir; mevcut açık projeler korunur', () => {
  assert.match(sql, /alter table public\.project_tracks add column if not exists indirme_izni boolean not null default false/);
  assert.match(sql, /update public\.project_tracks t set indirme_izni = true from public\.music_projects m\s+where m\.id = t\.project_id and m\.download_allowed/);
  assert.match(sql, /if not public\.is_admin\(\) then/);
  assert.match(sql, /new\.indirme_izni := (old\.indirme_izni|false)/);
  assert.match(sql, /create trigger parca_indirme_izni_koru\s+before insert or update on public\.project_tracks/);
  assert.doesNotMatch(sql, /(create|drop|alter) policy/i);
});

test('antrenör indirme düğmelerini yalnız izinli parçada görür', () => {
  assert.match(j, /const indirmeAcik=tr=>tr\.indirme_izni===undefined\?!!\(detail\.proje&&detail\.proje\.download_allowed\):!!tr\.indirme_izni;/);
  assert.match(j, /\$\{\(!admin && indirmeAcik\(tr\) && has\) \?/);
  assert.doesNotMatch(j, /!admin && project\.download_allowed && has/);
});

test('yönetici parça odasında parçaya özel izin düğmesi; toplu proje düğmesi yok', () => {
  assert.match(j, /data-tddlizin="\$\{tr\.id\}"/);
  assert.match(j, /from\('project_tracks'\)\.update\(\{indirme_izni:yeni\}\)\.eq\('id',b\.dataset\.tddlizin\)/);
  assert.doesNotMatch(j, /data-dlallow=/);
});

test('parça listesinde indirmesi açık olana ⤓ işareti', () => {
  assert.match(j, /class="pt-indir"/);
});

test('yazısız ⤓ düğmesi: yöneticiye her parça satırında, basınca aç/kapa (25 Ekim)', () => {
  assert.doesNotMatch(j, /İNDİRME İZİNLERİ/);
  assert.doesNotMatch(j, /İNDİRMEYE İZİN VER/);
  assert.match(j, /<div class="pt-sar">/);
  assert.match(j, /class="pt-indir-dugme\$\{acik\?' aktif':''\}" data-tddlizin="\$\{tr\.id\}" data-on="\$\{acik\?1:0\}" aria-pressed="\$\{acik\}" aria-label="\$\{acik\?L\('İndirme açık — kapatmak için bas'/);
  assert.match(j, /list\.querySelectorAll\('\[data-tddlizin\]'\)\.forEach\(b=>b\.onclick=\(\)=>indirmeIzniDegistir\(b\)\)/);
  assert.match(j, /root\.querySelectorAll\('\[data-tddlizin\]'\)\.forEach\(b=>b\.onclick=\(\)=>indirmeIzniDegistir\(b\)\)/);
});
