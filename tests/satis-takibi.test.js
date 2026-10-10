const test = require('node:test');
const assert = require('node:assert/strict');

const S = require('../satis-takibi.js');

// Tasarım: docs/superpowers/specs/2026-10-10-satis-takibi-design.md

test('aşamalar sabit sırada ve Türkçe etiketli', () => {
  assert.deepEqual(S.ASAMALAR.map(a => a.kod), ['new', 'contacted', 'offer', 'trial', 'won', 'lost']);
  assert.equal(S.asamaEtiket('offer'), 'Teklif gönderildi');
  assert.equal(S.asamaEtiket('won'), 'Anlaştı');
});

test('bilinmeyen aşama kodu olduğu gibi gösterilir', () => {
  assert.equal(S.asamaEtiket('closed'), 'closed');
});

test('kaynak etiketleri', () => {
  assert.deepEqual(S.KAYNAK_ETIKET, { form: 'Site', manual: 'Elle' });
});

test('anlaşan ve olmayan kapalı sayılır', () => {
  assert.equal(S.acikMi({ status: 'won' }), false);
  assert.equal(S.acikMi({ status: 'lost' }), false);
  assert.equal(S.acikMi({ status: 'trial' }), true);
});

test('bugün yapılacaklar: açık ve tarihi bugün ya da geçmiş, en eski üstte', () => {
  const liste = [
    { id: 'c', status: 'new', next_step_date: '2026-10-11' },
    { id: 'b', status: 'offer', next_step_date: '2026-10-10' },
    { id: 'd', status: 'new', next_step_date: null },
    { id: 'e', status: 'won', next_step_date: '2026-10-01' },
    { id: 'a', status: 'contacted', next_step_date: '2026-10-08' }
  ];
  assert.deepEqual(S.bugunYapilacaklar(liste, '2026-10-10').map(t => t.id), ['a', 'b']);
});

test('bugün yapılacaklar zaman damgalı tarihi de gün olarak okur', () => {
  const liste = [{ id: 'z', status: 'new', next_step_date: '2026-10-09T00:00:00' }];
  assert.deepEqual(S.bugunYapilacaklar(liste, '2026-10-10').map(t => t.id), ['z']);
});

test('aşama sayıları', () => {
  const liste = [{ status: 'new' }, { status: 'new' }, { status: 'won' }];
  assert.deepEqual(S.asamaSayilari(liste),
    { tumu: 3, new: 2, contacted: 0, offer: 0, trial: 0, won: 1, lost: 0 });
});

test('sıralama: tarihli açıklar tarihe göre, sonra tarihsiz açıklar yeniden eskiye, en sonda kapananlar', () => {
  const liste = [
    { id: 'kapali', status: 'won', next_step_date: null, created_at: '2026-10-09T00:00:00Z' },
    { id: 'eski', status: 'new', next_step_date: null, created_at: '2026-09-01T00:00:00Z' },
    { id: 't12', status: 'offer', next_step_date: '2026-10-12', created_at: '2026-09-02T00:00:00Z' },
    { id: 't05', status: 'new', next_step_date: '2026-10-05', created_at: '2026-09-03T00:00:00Z' },
    { id: 'yeni', status: 'new', next_step_date: null, created_at: '2026-09-20T00:00:00Z' }
  ];
  const kopya = liste.map(x => x.id);
  assert.deepEqual(S.sirala(liste).map(t => t.id), ['t05', 't12', 'yeni', 'eski', 'kapali']);
  assert.deepEqual(liste.map(x => x.id), kopya, 'girdi dizisi değişmemeli');
});

test('markaya aktarılacak alanlar kırpılır, boşlar null olur', () => {
  assert.deepEqual(
    S.markayaAktarilacak({ company: ' X Kafe ', contact_name: '', phone: ' 0555 ', email: 'a@b.co' }),
    { name: 'X Kafe', contact_name: null, contact_phone: '0555', contact_email: 'a@b.co' });
});
