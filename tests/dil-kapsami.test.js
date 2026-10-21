const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const KOK = path.join(__dirname, '..');
const oku = dosya => fs.readFileSync(path.join(KOK, dosya), 'utf8');
const dil = oku('dil.js');
const metinBlok = dil.slice(dil.indexOf('const METIN = {'), dil.indexOf('const TR = {'));
const metinler = new Set([...metinBlok.matchAll(/^ {4}'((?:[^'\\]|\\.)+)':/gm)].map(([, tr]) => tr.replace(/\\'/g, "'")));
const normal = deger => String(deger).replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const turkce = /[ğĞıİşŞüÜöÖçÇ]/;

const URETIM_SAYFALARI = execFileSync('git', ['ls-files', '*.html'], { cwd: KOK, encoding: 'utf8' })
  .trim().split('\n').filter(Boolean).filter(dosya => !dosya.startsWith('tests/') && !dosya.startsWith('graphify-out/'));

const CEVIRME = [
  /^DERİN(?: RECORD)?$/i, /^MP3$/i, /^WAV$/i, /^Supabase$/i, /^WhatsApp$/i,
  /^\d/, /^[-—–·•↗←→✓×+%/:. ]+$/, /^(THE WITCHER|HORON KAFKAS|WP ACRO|MOKKA)$/i
];
const HUKUKI = new Set(['gizlilik-politikasi.html', 'cerez-politikasi.html', 'kullanici-sozlesmesi.html', 'aydinlatma-metni.html']);
const cevrilmez = metin => CEVIRME.some(kural => kural.test(metin));

function htmlMetinleri(html) {
  let temiz = (html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i) || ['', html])[1]
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|template|code|pre|textarea)\b[\s\S]*?<\/\1>/gi, '')
    .replace(/<([a-z][\w-]*)\b[^>]*data-dil-yok[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<([a-z][\w-]*)\b[^>]*data-i18n(?:=|-)[^>]*>[\s\S]*?<\/\1>/gi, '');
  const bulunan = [];
  for (const [, ham] of temiz.matchAll(/>([^<>]+)</g)) {
    const metin = normal(ham);
    if (metin.length > 1 && turkce.test(metin) && !cevrilmez(metin)) bulunan.push(metin);
  }
  for (const [, , ham] of temiz.matchAll(/\b(placeholder|aria-label|title|alt)="([^"]+)"/g)) {
    const metin = normal(ham);
    if (metin.length > 1 && turkce.test(metin) && !cevrilmez(metin)) bulunan.push(metin);
  }
  return [...new Set(bulunan)];
}

test('otomatik üretim sayfalarındaki görünür Türkçe metinlerin İngilizce karşılığı vardır', () => {
  const eksik = [];
  URETIM_SAYFALARI.forEach(dosya => {
    const html = oku(dosya);
    if (!/data-dil-otomatik/.test(html) || HUKUKI.has(dosya)) return;
    htmlMetinleri(html).forEach(metin => { if (!metinler.has(metin)) eksik.push({ dosya, metin }); });
  });
  assert.deepEqual(eksik, [], eksik.map(x => `${x.dosya} → ${x.metin}`).join('\n'));
});

const UI_JS = [
  'admin.js', 'auth.js', 'bildirimler.js', 'chat.js', 'coffee-marka.js', 'coffee.js',
  'energy-map.js', 'feedback.js', 'harmonic-mixer.js', 'kullanicilar.js', 'license.js',
  'music-request-page.js', 'plan-takvim.js', 'projects.js',
  'radyo-panel-views.js', 'radyo-yonetim.js', 'satis-takibi.js', 'taleplerim.js'
];

const DINAMIK_GEREKLI = {
  'auth.js': ['Beni hatırla'],
  'bildirimler.js': ["ONAYLA — PROJELERİM'E EKLE", 'Bu isteğin parça bilgisi okunamadı.'],
  'chat.js': ['Sohbet bağlantısı hazırlanıyor.', 'Mesaj şifrelenemedi.'],
  'coffee-marka.js': ['Tarayıcı otomatik çalmayı engelledi. Başlatmak için oynat düğmesine dokunun.', 'Yayın saatleri dışında.', 'Parça açılamadı.'],
  'coffee.js': ['Şirket, yetkili ve e-posta alanları gerekli.', 'Gönderiliyor…', 'Talebiniz alındı. En kısa sürede size dönüş yapacağız.'],
  'energy-map.js': ['Analiz ediliyor…', 'Bu dosya analiz edilemedi. Başka bir ses dosyası dene.'],
  'feedback.js': ['Bu demo için henüz erişimin yok. Yönetici erişim verdiğinde not bırakabilirsin.', 'Bu nokta için bir mesaj yaz veya ses kaydet.', 'Mikrofon açılamadı. Tarayıcı iznini kontrol et veya yazılı not ekle.'],
  'harmonic-mixer.js': ['Bu araç yalnızca yöneticilere açıktır.', 'Parça adı gerekli.', 'Bütün geçişler uyumlu.'],
  'kullanicilar.js': ['Oturum bulunamadı, lütfen tekrar giriş yapın.', 'Beklenmeyen bir hata oluştu.', 'Davet gönderildi.'],
  'license.js': ['Bilgileri doldurup PDF beyanını indir.', 'Bu form, beyan sahibinin verdiği bilgilere dayanır; telif lisansı veya FIG onayı değildir.'],
  'music-request-page.js': ['Araç hazırlanıyor.', 'Önce şarkı adını yaz.', 'Gönderildi. Derin onaylayınca Projelerim sayfasından takip edebilirsin.'],
  'plan-takvim.js': ['Filtreyle eşleşen bekleyen ödeme yok.', 'Önümüzdeki 60 günde ödemesi gelen abonelik yok.', 'Ödeme yöntemi'],
  'projects.js': ['Projeler alınamadı:', 'Not gönderildi.', 'Ses açılamadı.'],
  'radyo-panel-views.js': ['Yeni token (değiştirmek için)', 'BotFather tokenı: 123456789:AA…'],
  'radyo-yonetim.js': ['Bu panel yalnızca yöneticilere açıktır.', 'En az bir şube işaretle.', 'Bu klasörde çalınacak parça yok.', 'Yayın saati güncellendi.', 'Sayfa yüklenemedi:'],
  'satis-takibi.js': ['Görüşüldü', 'Teklif gönderildi', 'Anlaştı', 'Olmadı'],
  'taleplerim.js': ['Ses Tasarımı', 'Ses Tasarımı & Film Scoring']
};

test('dinamik kullanıcı arayüzü dizelerinin otomatik sözlükte İngilizcesi vardır', () => {
  const eksik = [];
  UI_JS.forEach(dosya => {
    const kaynak = oku(dosya);
    (DINAMIK_GEREKLI[dosya] || []).forEach(metin => {
      if (!metinler.has(metin)) eksik.push({ dosya, metin });
    });
  });
  assert.deepEqual(eksik, [], eksik.map(x => `${x.dosya} → ${x.metin}`).join('\n'));
});
