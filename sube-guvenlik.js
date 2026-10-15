/* Derin Record — şube sunum ekranının güvenlik katmanı.
   Müşteri sunumu şube linkiyle (/coffee/s/<anahtar>) açıldığında: şube kodu
   kapısı, cihaz kilidi, canlı durum yoklaması, bağlantı geçmişi ve çalan parça
   bildirimi burada. Kafe oynatıcısıyla (eski radyo.js) aynı sunucu
   fonksiyonlarını ve aynı tarayıcı anahtarlarını kullanır: kafede zaten
   kilitli olan cihaz yeni ekranda kod sorulmadan açılır. */
(() => {
const ANAHTAR_DESENI = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CIHAZ_ANAHTARI = 'derin_record_device_id';
const kodAnahtari = anahtar => 'derin_record_kod_' + anahtar;
// Sunucu yeni alanları (p_kod, p_konum) tanımıyorsa isteği daraltarak tekrarlarız.
const IMZA_YOK = /could not find the function|does not exist|PGRST202|schema cache/i;
const imzaYok = r => !!(r && r.error
  && IMZA_YOK.test([r.error.message, r.error.code, r.error.details, r.error.hint].filter(Boolean).join(' ')));

const MESAJ = {
  'kod-gerekli': 'Şube kodunu girin.',
  'kod-yanlis': 'Kod doğru değil.',
  kilitli: 'Bu link başka bir cihaza bağlı. Derin Record ile iletişime geçin.',
  'tanınmadı': 'Bu link tanınmadı.',
  baglanti: 'Bağlantı kurulamadı, tekrar deneniyor…',
  tamam: ''
};
const sonuc = durum => ({ durum, mesaj: MESAJ[durum] });

function depo() {
  try { return window.localStorage; } catch { return null; }
}

function anahtarOku(loc) {
  const yol = String((loc && loc.pathname) || '');
  const m = yol.match(/\/coffee\/s\/([^/?#]+)/);
  const aday = m ? decodeURIComponent(m[1]) : null;
  return aday && ANAHTAR_DESENI.test(aday) ? aday.toLowerCase() : null;
}

function cihazKimligi() {
  const d = depo();
  try {
    let id = d && d.getItem(CIHAZ_ANAHTARI);
    if (!id) {
      id = window.crypto.randomUUID();
      if (d) d.setItem(CIHAZ_ANAHTARI, id);
    }
    return id;
  } catch { return null; }
}

function kayitliKod(anahtar) {
  const d = depo();
  try { return (d && d.getItem(kodAnahtari(anahtar))) || ''; } catch { return ''; }
}
function koduSakla(anahtar, kod) {
  const d = depo();
  try { if (d) d.setItem(kodAnahtari(anahtar), kod); } catch { /* saklanamadı */ }
}
function koduSil(anahtar) {
  const d = depo();
  try { if (d) d.removeItem(kodAnahtari(anahtar)); } catch { /* yok say */ }
}

async function pingRpc(client, anahtar, calarMi, kod) {
  const cihaz = cihazKimligi();
  const tam = { p_player_key: anahtar, p_device_id: cihaz, p_playing: !!calarMi };
  if (kod) tam.p_kod = kod;
  let r = await client.rpc('radio_ping', tam);
  if (imzaYok(r) && kod) {
    r = await client.rpc('radio_ping', { p_player_key: anahtar, p_device_id: cihaz, p_playing: !!calarMi });
  }
  return r;
}

const REASON = {
  locked_to_other_device: 'kilitli',
  invalid_key: 'tanınmadı',
  code_required: 'kod-gerekli',
  invalid_code: 'kod-yanlis'
};

async function baglan({ client, anahtar, kod, calarMi = false }) {
  const girilen = String(kod || '').trim().toUpperCase();
  let r;
  try { r = await pingRpc(client, anahtar, calarMi, girilen); } catch { return sonuc('baglanti'); }
  if (!r || r.error) return sonuc('baglanti');
  const satir = Array.isArray(r.data) ? r.data[0] : r.data;
  if (satir && satir.ok === false) {
    const durum = REASON[satir.reason] || 'baglanti';
    // Yanlış kod saklanmaz: yoklama aynı yanlış kodu tekrar gönderip alarmı şişirmesin.
    if (durum === 'kod-yanlis') koduSil(anahtar);
    return sonuc(durum);
  }
  if (girilen) koduSakla(anahtar, girilen);
  return sonuc('tamam');
}

// Bağlantı geçmişi: aynı olay kısa sürede tekrar yazılmaz.
const SEYREK = { kilitlendi: 21600000, yuklenemedi: 1800000 };
const sonOlay = { kod: '', an: 0 };
function olay({ client, anahtar }, kind, detail) {
  if (!client || !anahtar) return;
  const kodu = kind + '|' + (detail || '');
  const an = Date.now();
  if (sonOlay.kod === kodu && an - sonOlay.an < (SEYREK[kind] || 5000)) return;
  sonOlay.kod = kodu;
  sonOlay.an = an;
  try {
    Promise.resolve(client.rpc('radio_log_event', {
      p_player_key: anahtar, p_kind: kind, p_detail: detail || null, p_device_id: cihazKimligi()
    })).catch(() => {});
  } catch { /* geçmiş yayını etkilemez */ }
}

function calaniBildir({ client, anahtar }, parca) {
  if (!client || !anahtar) return;
  const p = parca || {};
  const tam = {
    p_player_key: anahtar, p_device_id: cihazKimligi(),
    p_track_id: p.track_id || null, p_title: p.title || null,
    p_playlist_id: p.playlist_id || null, p_playlist_name: p.playlist_name || null
  };
  try {
    Promise.resolve(client.rpc('radio_now_report', tam)).catch(() => {});
  } catch { /* bildirim yayını etkilemez */ }
}

// Dakikada bir yoklama: panel şubeyi "canlı" görür. Kilit dönerse (panelde
// başka cihaza bağlandı, kod yenilendi vb.) ekran kapanır.
function nabizBaslat({ client, anahtar, calarMi = () => false, aralik = 60000 }) {
  const yokla = async () => {
    const s = await baglan({ client, anahtar, kod: kayitliKod(anahtar), calarMi: calarMi() });
    if (s.durum === 'kilitli' || s.durum === 'kod-gerekli' || s.durum === 'kod-yanlis' || s.durum === 'tanınmadı') {
      if (s.durum === 'kilitli') olay({ client, anahtar }, 'kilitlendi', 'bu link başka bir cihaza kayıtlı');
      window.dispatchEvent(new CustomEvent('derin:sube-kapandi', { detail: { sebep: s.durum, mesaj: s.mesaj } }));
    }
  };
  const zaman = setInterval(yokla, aralik);
  return () => clearInterval(zaman);
}

window.DerinSubeGuvenlik = { anahtarOku, cihazKimligi, kayitliKod, baglan, nabizBaslat, olay, calaniBildir, MESAJ };
})();
