// Parça DEMO işareti (27 Kasım 2026): demo parçalar ödemelerde ve CRM gelirinde sayılmaz.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const oku = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

test('SQL: demo sütunu, yalnız yönetici değiştirir, CRM gelirinden düşer', () => {
  const sql = oku('supabase/parca-demo.sql');
  assert.match(sql, /add column if not exists demo boolean not null default false/);
  assert.match(sql, /if public\.is_admin\(\) then return new; end if;/);
  assert.match(sql, /new\.demo := old\.demo/);
  assert.match(sql, /before insert or update on public\.project_tracks/);
  assert.equal((sql.match(/and not (t\.)?demo/g) || []).length, 3);
  assert.equal((oku('supabase/crm.sql').match(/and not (t\.)?demo/g) || []).length, 3);
});

test('Ödemelerim: demo parçaları çekmez', () => {
  assert.match(oku('odemelerim.js'), /\.eq\('demo', false\)/);
});

test('Projelerim: v1 yerinde DEMO / ORİJİNAL; yönetici değiştirir, müşteri yalnız görür', () => {
  const js = oku('projects.js');
  assert.doesNotMatch(js, /class="pt-surum/);
  assert.match(js, /\n      \$\{demoEtiketi\(tr\)\}\n/);
  assert.match(js, /demo\?'DEMO':L\('ORİJİNAL','ORIGINAL'\)/);
  assert.match(js, /if\(!admin\)\{/);
  assert.match(js, /data-tddemo=/);
  assert.match(js, /update\(\{demo:yeni\}\)/);
  assert.match(js, /e\.stopPropagation\(\)/);
  const html = oku('my-projects.html');
  assert.match(html, /\.pt-demo\.acik\{/);
  assert.match(html, /\.pt-demo\.orijinal\{background:#e8d15a;border-color:#e8d15a;color:#0b0b0d\}/);
  assert.match(html, /projects\.js\?v=20261127d/);
});
