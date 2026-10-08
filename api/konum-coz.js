// Vercel sunucu fonksiyonu — isteği yapanın bulunduğu şehri IP'sinden çözer.
//
// Neden var: bir şube linkini/kodunu başka bir yerde deneyen cihazın nereden
// geldiği yönetime görünsün. Tarayıcı konum izni kiosk cihazlarında olağan
// olarak verilmez; o durumda elimizdeki tek iz cihazın IP'sidir. Bu fonksiyon
// IP'yi dış servise (ipwho.is — anahtarsız, HTTPS) sorup şehir/ülke/operatör
// döndürür, oynatıcı da bunu kanıt olarak (radio_kanit) şubeye yazar.
//
// GÜVENLİK: yalnız İSTEĞİ YAPANIN kendi IP'sini çözer; sorgu parametresi
// kabul etmez, yani başkalarının konumunu öğrenmek için kullanılamaz. Anahtar
// veya oturum da istemez: döndürdüğü tek bilgi zaten isteği yapanın kendi
// çevresidir (şehir/ülke/operatör). Hiçbir veri saklanmaz; önbellek yalnız
// sıcak çalışan örneğin belleğindedir ve sahadaki cihaz zaten aynı sonucu
// (kendi IP'sini) tekrar tekrar sormaz.

const SERVIS = 'https://ipwho.is/';
// Aynı IP için 6 saat: bir şube yoklamada ısrar etse bile dış servise
// tekrar tekrar çıkılmaz (servisin ücretsiz sınırı günde ~1000 istek).
const SURE_MS = 6 * 60 * 60 * 1000;
const EN_FAZLA = 500;

const onbellek = new Map();

function istemciIp(req) {
  const zincir = String((req.headers && (req.headers['x-forwarded-for'] ||
    req.headers['x-real-ip'])) || '');
  const ilk = zincir.split(',')[0].trim();
  // Yalnız IP biçiminde bir metin kabul edilir: başlık kurcalanmış olsa bile
  // dış servise giden adres yalnız bu kalıba uyan bir dize olur.
  return /^[0-9a-fA-F:.]{3,45}$/.test(ilk) ? ilk : '';
}

// Özel ve yerel adresler çözülemez (yerelde çalışırken de gürültü çıkmasın).
function yerelMi(ip) {
  return /^(10\.|127\.|0\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|::1$|f[cd])/i.test(ip);
}

module.exports = async (req, res) => {
  res.setHeader('cache-control', 'no-store');

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.status(405).json({ hata: 'Yalnızca GET' });
    return;
  }

  const ip = istemciIp(req);
  if (!ip || yerelMi(ip)) {
    // Çözülemeyen durum hata değildir: konum \"olsa iyi olur\" katmanıdır ve
    // oynatıcı bu cevabı yok sayıp kanıt alanını boş bırakır.
    res.status(200).json({ sehir: null, ip: ip || null });
    return;
  }

  const kayit = onbellek.get(ip);
  if (kayit && Date.now() - kayit.at < SURE_MS) {
    res.status(200).json(kayit.sonuc);
    return;
  }

  let sonuc = { sehir: null, ip };
  try {
    const yanit = await fetch(SERVIS + encodeURIComponent(ip), { signal: AbortSignal.timeout(5000) });
    if (yanit.ok) {
      const v = await yanit.json();
      if (v && v.success !== false) {
        sonuc = {
          sehir: v.city || null,
          bolge: v.region || null,
          ulke: v.country || null,
          iss: (v.connection && v.connection.isp) || null,
          ip
        };
      }
    }
  } catch { /* dış servis kapalı/yanıt vermiyor: konum boş kalır, alarm yine tutulur */ }

  if (onbellek.size >= EN_FAZLA) onbellek.clear();
  onbellek.set(ip, { sonuc, at: Date.now() });
  res.status(200).json(sonuc);
};
