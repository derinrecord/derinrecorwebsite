const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const D = require('../ajan-durumu.js');
const kok = path.join(__dirname, '..');

// AJANLAR sayfasının canlı durumu: ajanlar her çalışmanın sonunda
// public.ajan_durumu tablosuna tek satır yazar; sayfa yalnız okur (11 Ekim 2026).
const satir = (ajan, sonuc, zaman, ek = {}) => ({ ajan, sonuc, ozet: '', dal: null, created_at: zaman, ...ek });

test('her ajanın en son kaydı alınır', () => {
  const son = D.sonDurumlar([
    satir('radyo', 'sorunsuz', '2026-10-11T07:22:00Z'),
    satir('radyo', 'hata', '2026-10-12T07:22:00Z'),
    satir('talep', 'is_yapildi', '2026-10-12T04:52:00Z')
  ]);
  assert.equal(son.radyo.sonuc, 'hata');
  assert.equal(son.talep.sonuc, 'is_yapildi');
  assert.equal(son.guvenlik, undefined);
});

test('onay bekleyen işler: ajanın son kaydı onay bekliyorsa', () => {
  const liste = D.onayBekleyenler([
    satir('arayuz', 'onay_bekliyor', '2026-10-12T07:00:00Z', { dal: 'arayuz/2026-10-12-radyo-canli' }),
    satir('arayuz', 'onay_bekliyor', '2026-10-12T11:00:00Z', { dal: 'arayuz/2026-10-12-sunum' }),
    satir('site-bakim', 'onay_bekliyor', '2026-10-11T04:50:00Z', { dal: 'onarim/2026-10-11' }),
    satir('site-bakim', 'sorunsuz', '2026-10-12T04:50:00Z')
  ]);
  assert.deepEqual(liste.map(x => x.dal), ['arayuz/2026-10-12-sunum', 'arayuz/2026-10-12-radyo-canli']);
});

test('özet sayılar son 24 saate bakar', () => {
  const simdi = '2026-10-12T12:00:00Z';
  const s = D.ozetSayilar([
    satir('radyo', 'hata', '2026-10-12T07:22:00Z'),
    satir('talep', 'is_yapildi', '2026-10-12T04:52:00Z'),
    satir('arayuz', 'onay_bekliyor', '2026-10-12T07:00:00Z', { dal: 'arayuz/x' }),
    satir('instagram', 'is_yapildi', '2026-10-10T05:52:00Z')
  ], simdi);
  assert.deepEqual(s, { son24: 3, hata: 1, onay: 1 });
});

test('zaman İstanbul saatiyle ve gün adıyla yazılır', () => {
  const simdi = '2026-10-12T12:00:00Z'; // 15:00 İstanbul, Pazartesi
  assert.equal(D.goreliZaman('2026-10-12T04:46:00Z', simdi), 'bugün 07:46');
  assert.equal(D.goreliZaman('2026-10-11T16:53:00Z', simdi), 'dün 19:53');
  assert.equal(D.goreliZaman('2026-10-08T03:52:00Z', simdi), '8 Eki 06:52');
  assert.equal(D.goreliZaman(null, simdi), '');
});

test('sonuç etiketleri Türkçe', () => {
  assert.equal(D.SONUC.sorunsuz.ad, 'Sorunsuz');
  assert.equal(D.SONUC.onay_bekliyor.ad, 'Onayını bekliyor');
  assert.equal(D.SONUC.hata.ad, 'Tamamlanamadı');
  assert.equal(D.SONUC.is_yapildi.ad, 'İş hazır');
});

test('SQL: tabloyu yalnız yönetici okur, siteden kimse yazamaz', () => {
  const sql = fs.readFileSync(path.join(kok, 'supabase', 'ajan-durumu.sql'), 'utf8');
  assert.match(sql, /create table if not exists public\.ajan_durumu/);
  assert.match(sql, /enable row level security/);
  assert.match(sql, /for select to authenticated using \(public\.is_admin\(\)\)/);
  assert.ok(!/for (insert|update|delete|all)/i.test(sql), 'site kullanıcılarına yazma politikası olmamalı');
  assert.match(sql, /revoke insert, update, delete on public\.ajan_durumu from anon, authenticated/);
  D.AJANLAR.forEach(k => assert.ok(sql.includes(`'${k}'`), k + ' kodu tabloda izinli olmalı'));
});

test('AJANLAR sayfası durumu okur ve bütün çalışan ajanları gösterir', () => {
  const html = fs.readFileSync(path.join(kok, 'ajanlar.html'), 'utf8');
  assert.match(html, /<script src="ajan-durumu\.js\?v=\d+"><\/script>/);
  assert.match(html, /from\('ajan_durumu'\)/);
  assert.match(html, /id="durum"/);
  const kodlar = [...html.matchAll(/kod: '([a-z-]+)'/g)].map(m => m[1]);
  D.AJANLAR.filter(k => k !== 'koordinator').forEach(k => assert.ok(kodlar.includes(k), k + ' haritada olmalı'));
  assert.ok(html.includes('esc(d.ozet)') || html.includes('esc(kayit.ozet)'), 'özet kaçışlı basılmalı');
});
