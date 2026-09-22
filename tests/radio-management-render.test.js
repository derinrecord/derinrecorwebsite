const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync(require.resolve('../radyo-yonetim.js'), 'utf8');

test('renders subscription and offer cards as separate links', () => {
  const subscriptions = source.indexOf('href="#/abonelikler"');
  const offers = source.indexOf('href="#/talepler"');
  const subscriptionsClose = source.indexOf('</a>', subscriptions);

  assert.ok(subscriptions >= 0);
  assert.ok(offers > subscriptionsClose, 'Teklif Talepleri kartı Abonelikler kartının dışında olmalı');
});
