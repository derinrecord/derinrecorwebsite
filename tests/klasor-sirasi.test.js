const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const V = require('../radyo-panel-views.js');

function ciz(sirali) {
  const base = {
    folders: [{ id: 'f1', name: 'Sabah', sort_order: 0 }, { id: 'f2', name: 'Akşam', sort_order: 1 }],
    klasorSirasiVar: sirali
  };
  const D = new Proxy(base, { get: (t, k) => k in t ? t[k] : (typeof k === 'string' && /Var$/.test(k) ? false : []) });
  const state = new Proxy({ nav: 'icerik', sub: 'klasorler' }, { get: (t, k) => k in t ? t[k] : undefined });
  const ui = new Proxy({}, { get: (t, k) => k === 'now' ? () => Date.now() : () => '' });
  return V.gorunum(state, D, ui).html;
}

test('klasör satırları sıra sütunu kuruluysa sürüklenir', () => {
  const html = ciz(true);
  assert.match(html, /draggable="true" data-klasor="f1"/);
  assert.match(html, /draggable="true" data-klasor="f2"/);
});

test('sıra sütunu yoksa klasörler sürüklenmez', () => {
  assert.doesNotMatch(ciz(false), /data-klasor=/);
});

test('sıra radio_folders tablosuna yazılır, SQL dosyası RLS politikasına dokunmaz', () => {
  const kaynak = fs.readFileSync(require.resolve('../radyo-yonetim.js'), 'utf8');
  assert.match(kaynak, /folder: 'radio_folders'/);
  const sql = fs.readFileSync(require.resolve('../supabase/radio-klasor-sirasi.sql'), 'utf8');
  assert.match(sql, /add column if not exists sort_order/);
  assert.doesNotMatch(sql, /create policy|drop policy|alter policy/i);
});
