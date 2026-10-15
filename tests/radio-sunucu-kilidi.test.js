// Sunucu tarafı kilitler: cihaz kilidi, şube kodu ve katalog kapatma SQL'leri.
// (Eski kafe oynatıcısı radyo.js kaldırıldı; bu sınamalar SQL dosyalarına
// bakar ve şube sunum ekranı için de geçerlidir.)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const KOK = path.join(__dirname, '..');

test('panel bağlantı sınaması cihaz kilidini yöneticinin tarayıcısına bağlamaz', () => {
  // Sınama aracı yalnızca iki okuma çağrısı yapar; radio_ping çağırırsa
  // yöneticinin tarayıcısı şubeye kilitlenir ve sahadaki cihaz dışarıda kalır.
  const kaynak = fs.readFileSync(path.join(KOK, 'radyo-yonetim.js'), 'utf8');
  const govde = kaynak.slice(kaynak.indexOf('async function baglantiSina'));
  const govdeSonu = govde.indexOf('function bosSlug');
  assert.ok(govdeSonu > 0);
  assert.ok(!govde.slice(0, govdeSonu).includes('radio_ping'), 'sınama radio_ping çağırmamalı');
  assert.ok(govde.includes("rpc('radio_now_playing'"));
  assert.ok(govde.includes("rpc('abonelik_durumu'"));
});

// Kafe linki cihaza bağlı olmalı: içerik fonksiyonları cihaz kimliği sormazsa,
// linki ele geçiren biri rest çağrısıyla bütün listeyi ve dosya yollarını okuyup
// müziği başka bir cihazda çalabilir (cihaz kilidi yalnız ping'de kalır).
test('içerik fonksiyonları cihaz kimliğini sorar', () => {
  const sql = fs.readFileSync(path.join(KOK, 'supabase', 'radio-baglanti-korumasi.sql'), 'utf8');

  // Ortak kapı: yönetici muaf, bağlı cihaz eşleşmeli, kimlik boş gönderilemez.
  assert.match(sql, /function public\.radio_cihaz_uygun\(p_player_key uuid, p_device_id text\)/);
  assert.match(sql, /when public\.is_admin\(\) then true/);
  assert.match(sql, /p\.bound_device_id = nullif\(btrim\(coalesce\(p_device_id/);

  // İçerik ve bilgi fonksiyonlarının hepsi kapıdan geçmeli.
  ['radio_now_playing', 'radio_listeler', 'radio_sube_listeler',
    'radio_anonslar', 'radio_yayin_durumu'].forEach(fonksiyon => {
    assert.match(sql, new RegExp('function public\\.' + fonksiyon + '\\([\\s\\S]{0,160}?p_device_id text default null'),
      fonksiyon + ' cihaz kimliği almalı');
  });
  const kapiSayisi = (sql.match(/radio_cihaz_uygun\(p_player_key, p_device_id\)/g) || []).length;
  assert.ok(kapiSayisi >= 6, 'her içerik yolu kapıdan geçmeli (bulunan: ' + kapiSayisi + ')');

  // Yazma yolları da kapıdan geçer: kilitli cihaz paneli kandıramasın.
  assert.match(sql, /function public\.radio_now_report\([\s\S]{0,400}?p_device_id text default null/);
  assert.match(sql, /function public\.radio_log_event\([\s\S]{0,400}?p_device_id text default null/);

  // Eski tek parametreli imzalar düşürülmeli: iki imza kalırsa PostgREST
  // hangisini çağıracağını bilemez (PGRST203) ve oynatıcı içerik alamaz.
  ['radio_now_playing', 'radio_listeler', 'radio_sube_listeler', 'radio_yayin_durumu']
    .forEach(fonksiyon => assert.match(sql, new RegExp('drop function if exists public\\.' + fonksiyon + '\\(uuid\\)')));
  assert.match(sql, /drop function if exists public\.radio_anonslar\(uuid, timestamp with time zone\)/);

  // Ping: bağlı cihazda kimlik göndermemek kilidi atlamamalı.
  assert.match(sql, /v_row\.bound_device_id is not null\s*\n?\s*and \(v_device is null or v_row\.bound_device_id <> v_device\)/);
});

test('şube kodu kapısı sunucuda zorunlu ve yanlış kod alarm üretir', () => {
  const sql = fs.readFileSync(path.join(KOK, 'supabase', 'radio-sube-kodu.sql'), 'utf8');

  // Kolon + benzersizlik: kod büyük/küçük harf duyarsız tekil olmalı.
  assert.match(sql, /add column if not exists player_code\s+text/);
  assert.match(sql, /create unique index if not exists brand_players_player_code_uniq[\s\S]{0,120}?upper\(player_code\)/);

  // Kapı: bağlanmamış şubede kod yoksa "code_required", yanlışsa "invalid_code".
  assert.match(sql, /p_kod text default null/);
  assert.match(sql, /if v_row\.bound_device_id is null and v_row\.player_code is not null then/);
  assert.match(sql, /if v_kod is null then[\s\S]{0,80}?return query select false, 'code_required'/);
  assert.match(sql, /if v_kod <> upper\(v_row\.player_code\) then/);
  assert.match(sql, /son_ihlal_tur = 'kod'/);
  assert.match(sql, /son_ihlal_tur = 'cihaz'/);
  assert.ok(sql.includes("'kod-denemesi'"), 'yanlış kod geçmişe düşmeli');

  // Denenen kod ASLA kaydedilmez: geçmiş satırı yalnız konum ve IP taşır.
  const bas = sql.indexOf('insert into public.radio_player_events');
  const kayit = sql.slice(bas, bas + 420);
  assert.ok(bas > 0 && !kayit.includes('p_kod') && !kayit.includes('v_kod'),
    'yanlış kod kanıt kaydına yazılmamalı');

  // Konum kanıtı ayrı fonksiyondan: yoklama sayacı iki kez artmasın.
  assert.match(sql, /create or replace function public\.radio_kanit\(/);
  assert.match(sql, /if not found or v_row\.son_ihlal_at is null then/);

  // Eski imza düşürülmeli: iki imza kalırsa PostgREST hangisini çağıracağını
  // bilemez ve oynatıcı hiçbir cevap alamaz.
  assert.match(sql, /drop function if exists public\.radio_ping\(uuid, text, boolean, text\)/);
});

// Kapatma dosyası, katalog verisini taşıyan bütün tabloları kapatmalı: yeni
// bir radyo tablosu eklenip buraya yazılmazsa liste yine dışarıdan okunabilir.
test('kapatma dosyası katalog tablolarının hepsini dışarıya kapatır', () => {
  const sql = fs.readFileSync(path.join(KOK, 'supabase', 'radio-erisim-kapat.sql'), 'utf8');
  ['radio_folders', 'radio_tracks', 'brand_playlists', 'brand_playlist_tracks',
    'brand_broadcast', 'player_broadcast', 'radio_announcements',
    'brand_players'].forEach(tablo => {
    assert.ok(sql.includes('revoke select on public.' + tablo),
      tablo + ' dışarıya kapatılmalı');
  });
  assert.match(sql, /to anon/, 'kapı girişsiz ziyaretçi rolüne kapanmalı');
});
