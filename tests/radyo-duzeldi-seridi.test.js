const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const V = require('../radyo-panel-views.js');

// 25 Kasım 2026: sorun düzelince kırmızı uyarı yeşil "DÜZELDİ" olur, 1 dk sonra kapanır.
test('düzelen yayın alarmı yeşil şeride döner ve bir dakika sonra kapanır', () => {
  let simdi = Date.parse('2026-11-25T07:00:00Z');
  const ui = { now: () => simdi, duzelme: { acik: null, biten: [] } };
  const once = sn => new Date(simdi - sn * 1000).toISOString();
  const sorunlu = { brands: [], players: [{ id: 'a1', label: 'Selçuk', alarm_tur: 'ses-kapali', alarm_at: once(200) }] };
  const ilk = V.uyariSeridi(sorunlu, ui);
  assert.ok(ilk.includes('YAYIN ALARMI'));
  assert.ok(!ilk.includes('DÜZELDİ'), 'sorun sürerken yeşil şerit yok');

  simdi += 10 * 1000;
  const duzeldi = { brands: [], players: [{ id: 'a1', label: 'Selçuk', alarm_tur: null }] };
  const yesil = V.uyariSeridi(duzeldi, ui);
  assert.ok(!yesil.includes('YAYIN ALARMI'), 'kırmızı şerit kalktı');
  assert.ok(yesil.includes('uyari-serit duzeldi') && yesil.includes('DÜZELDİ') && yesil.includes('Selçuk · ses kapalı'));

  simdi += 61 * 1000;
  assert.equal(V.uyariSeridi(duzeldi, ui), '', 'bir dakika sonra şerit kapanır');
});

test('ilk açılışta, veri gelmeden ve silinen şubede yanlış "düzeldi" çizilmez', () => {
  const simdi = Date.parse('2026-11-25T07:00:00Z');
  const ui = { now: () => simdi, duzelme: { acik: null, biten: [] } };
  assert.equal(V.uyariSeridi({ brands: [], players: [{ id: 'a1', label: 'A', alarm_tur: null }] }, ui), '');
  V.uyariSeridi({ brands: [], players: [{ id: 'a1', label: 'A', alarm_tur: 'takildi', alarm_at: new Date(simdi).toISOString() }] }, ui);
  assert.equal(V.uyariSeridi({ brands: [], players: [] }, ui), '', 'şube listesi boşken karşılaştırma yok');
  assert.equal(V.uyariSeridi({ brands: [], players: [{ id: 'b2', label: 'B', alarm_tur: null }] }, ui), '', 'silinen şube düzeldi sayılmaz');
});

test('sorun yeniden başlarsa yeşil satır silinir; hafızasız ui eskisi gibi çalışır', () => {
  const simdi = Date.parse('2026-11-25T07:00:00Z');
  const ui = { now: () => simdi, duzelme: { acik: null, biten: [] } };
  const kotu = { brands: [], players: [{ id: 'a1', label: 'A', alarm_tur: 'takildi', alarm_at: new Date(simdi).toISOString() }] };
  const iyi = { brands: [], players: [{ id: 'a1', label: 'A', alarm_tur: null }] };
  V.uyariSeridi(kotu, ui); V.uyariSeridi(iyi, ui);
  const tekrar = V.uyariSeridi(kotu, ui);
  assert.ok(tekrar.includes('YAYIN ALARMI') && !tekrar.includes('DÜZELDİ'));
  assert.equal(V.uyariSeridi(iyi, { now: () => simdi }), '');
  const panel = fs.readFileSync(require.resolve('../radyo-yonetim.js'), 'utf8');
  assert.match(panel, /duzelme: \{ acik: null, biten: \[\] \}/);
  assert.match(panel, /setTimeout\(seritYaz, 5000\)/);
});
