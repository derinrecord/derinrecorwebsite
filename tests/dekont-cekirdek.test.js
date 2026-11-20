// Dekont tarama çekirdeği (2026-11-20): alıcı, IBAN son 4, tutar, tarih.
const test = require('node:test');
const assert = require('node:assert');
const D = require('../api/_dekont-cekirdek');

const ortak = { alici: 'Derin Uygur', iban: 'TR33 0006 1005 1978 6457 8413 26', tutar: 5500, baslangic: '2026-11-20T10:00:00Z', simdi: '2026-11-20T19:00:00Z' };
const iyi = 'ZİRAAT BANKASI\nİşlem Tarihi: 20.11.2026 21:14\nAlıcı: DERİN UYGUR\nAlıcı IBAN: TR33 **** **** **** **** 8413 26\nTutar: 5.500,00 TL';

test('gerçek dekont geçer', () => {
  assert.deepStrictEqual(D.degerlendir({ ...ortak, metin: iyi }), { gecti: true, eksikler: [] });
});
test('boş yazı / rastgele dosya geçmez', () => {
  assert.strictEqual(D.degerlendir({ ...ortak, metin: '' }).gecti, false);
  assert.strictEqual(D.degerlendir({ ...ortak, metin: 'Merhaba dünya' }).eksikler.length, 4);
});
test('yanlış tutar, başka alıcı, eski tarih geçmez', () => {
  assert.match(D.degerlendir({ ...ortak, metin: iyi.replace('5.500,00', '550,00') }).eksikler.join(), /Tutar/);
  assert.match(D.degerlendir({ ...ortak, metin: iyi.replace('DERİN UYGUR', 'MEHMET YILMAZ') }).eksikler.join(), /Alıcı adı/);
  assert.match(D.degerlendir({ ...ortak, metin: iyi.replace('20.11.2026', '02.09.2026') }).eksikler.join(), /tarih/);
});
test('tutar biçimleri', () => {
  for (const m of ['5.500,00 TL', '5500,00', '5,500.00', '5.500 TL', 'TRY 5500']) assert.ok(D.tutarVar(m, 5500), m);
  assert.ok(!D.tutarVar('55.000,00', 5500));
});
test('OCR harf hatası hoş görülür, Türkçe harfler sadeleşir', () => {
  assert.ok(D.isimVar('ALICI: DERIN UYQUR', 'Derin Uygur'));
  assert.ok(D.isimVar('derin uygur', 'DERİN UYGUR'));
  assert.ok(!D.isimVar('DERYA UYSAL', 'Derin Uygur'));
});
test('tarih biçimleri', () => {
  assert.ok(D.tarihVar('20 Kasım 2026', ortak.baslangic, ortak.simdi));
  assert.ok(D.tarihVar('2026-11-20 21:14', ortak.baslangic, ortak.simdi));
  assert.ok(D.tarihVar('20/11/2026', ortak.baslangic, ortak.simdi));
});
test('ayar eksikse geçmez', () => {
  assert.strictEqual(D.degerlendir({ ...ortak, tutar: null, metin: iyi }).gecti, false);
});
