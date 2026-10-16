// Parça kredisi: sunumda adın altında sanatçı, (i) ile kredi notu; panelde KREDİ düğmesi.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const sql = fs.readFileSync(require.resolve('../supabase/parca-kredi.sql'), 'utf8').replace(/--[^\n]*/g, '');
const sunum = fs.readFileSync(require.resolve('../coffee-marka.js'), 'utf8');
const yonetim = fs.readFileSync(require.resolve('../radyo-yonetim.js'), 'utf8');
const V = require('../radyo-panel-views.js');

test('SQL sütun ekler ve sunum listesi sanatçı/krediyi aynı kapıyla döndürür', () => {
  assert.match(sql, /add column if not exists sanatci text/);
  assert.match(sql, /add column if not exists kredi\s+text/);
  assert.ok(sql.includes('radio_cihaz_uygun(p_player_key, p_device_id)') && sql.includes('abonelik_gecerli'));
  assert.match(sql, /sort_order integer, sanatci text, kredi text/);
  assert.ok(!/policy/i.test(sql));
});

test('sunumda sanatçı adı adın altında, (i) kredi kartını açar; boşsa Derin Record', () => {
  assert.match(sunum, /const sanatciAdi = t => \(t && t\.sanatci\) \? String\(t\.sanatci\) : 'Derin Record'/);
  assert.match(sunum, /<small class="alt">\$\{safe\(sanatciAdi\(t\)\)\}<\/small>/);
  assert.match(sunum, /class="mk-info" type="button" data-info=/);
  assert.match(sunum, /mk-card-kredi/);
});

test('panelde KREDİ düğmesi yalnız SQL kuruluyken çizilir ve iki alanı kaydeder', () => {
  const src = fs.readFileSync(require.resolve('../radyo-panel-views.js'), 'utf8');
  assert.match(src, /kurulumVar\(D, 'parca-kredi\.sql'\) \? `<button class="btn sm" data-act="track-kredi"/);
  assert.match(yonetim, /update\(\{ sanatci: deger\.sanatci \|\| null, kredi: deger\.kredi \|\| null \}\)/);
  assert.ok(V);
});
