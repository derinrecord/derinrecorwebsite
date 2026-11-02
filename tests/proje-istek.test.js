// Proje iste (2 Kasım): antrenör Projelerim'den bağlantı ve dosya (ses, video, PDF, resim)
// göndererek yeni proje ister. Sunucu, antrenörün YALNIZ kendi proje klasörüne yazmasına izin verir.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const oku = d => fs.readFileSync(path.join(__dirname, '..', d), 'utf8');
const { yetki } = require('../api/r2-yukleme-izni.js');

const BEN = '90658be3-f11a-4c03-bb4e-cf83426e0a97', BASKA = '5b263d0a-a8e7-4ff8-88d1-e091585aaf70';

test('yönetici her izinli klasöre yükler ve siler', () => {
  for (const key of ['radyo/a.mp3', 'demo/x.wav', `proje/${BASKA}/p.wav`]) {
    assert.equal(yetki('yukle', key, true, null), null, key);
    assert.equal(yetki('sil', key, true, null), null, key);
  }
});

test('antrenör yalnız kendi proje klasörüne yükler ve oradan siler', () => {
  assert.equal(yetki('yukle', `proje/${BEN}/istek-1.mp4`, false, BEN), null);
  assert.equal(yetki('sil', `proje/${BEN}/istek-1.mp4`, false, BEN), null);
  assert.equal(yetki('yukle', `proje/${BASKA}/x.wav`, false, BEN).kod, 403);
  assert.equal(yetki('sil', `proje/${BASKA}/x.wav`, false, BEN).kod, 403);
  for (const key of ['radyo/a.mp3', 'demo/x.wav', 'kapak/k.jpg', 'anons/a.mp3', 'dj/d.wav']) assert.equal(yetki('yukle', key, false, BEN).kod, 403, key);
  assert.equal(yetki('yukle', `proje/${BEN}`, false, BEN).kod, 403); // klasörün kendisi değil, içindeki dosya
});

test('oturumu doğrulanamayan kişi hiçbir şey yazamaz', () => {
  assert.equal(yetki('yukle', `proje/${BEN}/a.wav`, false, null).kod, 401);
});

test('okuma kuralı değişmedi: antrenör yalnız kendi proje klasörünü okur, DJ kapalı', () => {
  assert.equal(yetki('oku', `proje/${BEN}/a.wav`, false, BEN), null);
  assert.equal(yetki('oku', `proje/${BASKA}/a.wav`, false, BEN).kod, 403);
  assert.equal(yetki('oku', 'dj/a.wav', false, BEN).kod, 403);
  assert.equal(yetki('oku', 'radyo/a.mp3', true, null).kod, 403);
});

test('SQL: iki alan eklenir, RLS politikalarına dokunulmaz', () => {
  const s = oku('supabase/proje-istek.sql');
  assert.match(s, /add column if not exists istek_baglanti text/);
  assert.match(s, /add column if not exists istek_ekleri jsonb not null default '\[\]'::jsonb/);
  assert.doesNotMatch(s, /create policy|drop policy|alter policy/i);
});
