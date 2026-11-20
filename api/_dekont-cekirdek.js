// Dekont tarama çekirdeği (2026-11-20) — saf fonksiyonlar, Node testlerinde de çalışır.
//
// Derin: "öyle bir sistem olsun ki dekont olduğunu tarasın." Antrenörün yüklediği
// dosyadan çıkarılan yazıda dört şey aranır:
//   1) alıcı adı (ödeme ayarlarındaki ad, ör. DERİN UYGUR)
//   2) IBAN'ın son 4 hanesi (bankalar dekontta IBAN'ı çoğu zaman yıldızlar)
//   3) parçanın tutarı (5.500,00 / 5500,00 / 5,500.00 / 5.500 TL …)
//   4) satın alma talebinden sonraki (ya da son 10 günün) bir tarih
// Dördü de bulunursa dekont "doğrulandı" sayılır. Bu, paranın hesaba geçtiğinin
// kanıtı DEĞİLDİR; yalnız rastgele/ilgisiz dosyaları ayıklar.
//
// Fotoğraftan okunan yazıda (OCR) harf hataları olur; ad karşılaştırması bir
// harf hatasını (5+ harfli kelimede) hoş görür.

const TR_MAP = { 'ı': 'i', 'İ': 'i', 'I': 'i', 'ş': 's', 'Ş': 's', 'ğ': 'g', 'Ğ': 'g', 'ü': 'u', 'Ü': 'u', 'ö': 'o', 'Ö': 'o', 'ç': 'c', 'Ç': 'c' };

// Türkçe harfleri sadeleştirir, küçük harfe çevirir.
function sade(metin) {
  return String(metin || '')
    .replace(/[ıİIşŞğĞüÜöÖçÇ]/g, h => TR_MAP[h])
    .toLowerCase()
    .normalize('NFKD').replace(/[̀-ͯ]/g, '');
}

function kelimeler(metin) {
  return sade(metin).split(/[^a-z0-9]+/).filter(Boolean);
}

// İki kelime arasındaki düzenleme uzaklığı (en çok 2'ye kadar hesaplanır yeter).
function uzaklik(a, b) {
  if (Math.abs(a.length - b.length) > 2) return 3;
  const s = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let onceki = s[0]; s[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const t = s[j];
      s[j] = Math.min(s[j] + 1, s[j - 1] + 1, onceki + (a[i - 1] === b[j - 1] ? 0 : 1));
      onceki = t;
    }
  }
  return s[b.length];
}

// Alıcı adının her kelimesi yazıda geçiyor mu? (5+ harfli kelimede 1 hata hoş görülür)
function isimVar(metin, ad) {
  const aranan = kelimeler(ad).filter(k => k.length >= 2);
  if (!aranan.length) return false;
  const var_ = new Set(kelimeler(metin));
  const liste = [...var_];
  return aranan.every(k => var_.has(k) || (k.length >= 5 && liste.some(w => uzaklik(w, k) <= 1)));
}

// IBAN'ın son 4 hanesi yazıda (boşluklar atılarak) geçiyor mu?
function ibanVar(metin, iban) {
  const rakam = String(iban || '').replace(/\D/g, '');
  if (rakam.length < 4) return false;
  const son4 = rakam.slice(-4);
  // OCR'da sık karışanlar: O→0, l/I→1, S→5, B→8
  const duz = String(metin || '').replace(/[Oo]/g, '0').replace(/[lI|]/g, '1').replace(/\s+/g, '');
  return duz.replace(/\D/g, ' ').split(' ').some(p => p.endsWith(son4) || p.includes(son4));
}

// Yazıdaki para tutarlarını sayıya çevirir. "5.500,00" → 5500, "5,500.00" → 5500,
// "5500" → 5500, "5.500" → 5500.
function tutarlar(metin) {
  const sonuc = [];
  const re = /\d{1,3}(?:[.,\s]\d{3})+(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?/g;
  const m = String(metin || '').match(re) || [];
  for (let s of m) {
    s = s.replace(/\s/g, '');
    let ondalik = '';
    const son = s.match(/[.,](\d{1,2})$/);
    if (son && !/[.,]\d{3}$/.test(s)) { ondalik = son[1]; s = s.slice(0, -son[0].length); }
    const tam = s.replace(/[.,]/g, '');
    if (!tam) continue;
    const n = Number(tam + (ondalik ? '.' + ondalik : ''));
    if (Number.isFinite(n)) sonuc.push(n);
  }
  return sonuc;
}

function tutarVar(metin, tutar) {
  const t = Number(tutar);
  if (!(t > 0)) return false;
  return tutarlar(metin).some(n => Math.abs(n - t) < 0.01);
}

// Yazıdaki tarihleri bulur: 20.11.2026, 20/11/2026, 20-11-2026, 2026-11-20, 20 Kasım 2026.
const AYLAR = ['ocak', 'subat', 'mart', 'nisan', 'mayis', 'haziran', 'temmuz', 'agustos', 'eylul', 'ekim', 'kasim', 'aralik'];
function tarihler(metin) {
  const s = sade(metin);
  const out = [];
  const ekle = (g, a, y) => {
    g = +g; a = +a; y = +y; if (y < 100) y += 2000;
    if (g >= 1 && g <= 31 && a >= 1 && a <= 12 && y >= 2020 && y <= 2100) out.push(Date.UTC(y, a - 1, g));
  };
  let m;
  const r1 = /(\d{1,2})\s?[./-]\s?(\d{1,2})\s?[./-]\s?(\d{4}|\d{2})(?!\d)/g;
  while ((m = r1.exec(s))) ekle(m[1], m[2], m[3]);
  const r2 = /(\d{4})-(\d{1,2})-(\d{1,2})/g;
  while ((m = r2.exec(s))) ekle(m[3], m[2], m[1]);
  const r3 = new RegExp('(\\d{1,2})\\s+(' + AYLAR.join('|') + ')\\s+(\\d{4})', 'g');
  while ((m = r3.exec(s))) ekle(m[1], AYLAR.indexOf(m[2]) + 1, m[3]);
  return out;
}

// Tarih, talepten 2 gün önce ile şimdiden 1 gün sonra arasında mı?
// Talep zamanı bilinmiyorsa son 10 gün kabul edilir.
function tarihVar(metin, baslangic, simdi) {
  const gun = 86400000;
  const now = simdi ? new Date(simdi).getTime() : Date.now();
  const bas = baslangic ? new Date(baslangic).getTime() - 2 * gun : now - 10 * gun;
  return tarihler(metin).some(t => t >= bas - gun && t <= now + gun);
}

// Ana karar. Dönüş: { gecti, eksikler: [...] } — eksikler Türkçe, Telegram'a yazılır.
function degerlendir({ metin, alici, iban, tutar, baslangic, simdi }) {
  const eksikler = [];
  if (!String(metin || '').trim()) {
    return { gecti: false, eksikler: ['Dosyada okunabilir yazı bulunamadı'] };
  }
  if (!alici) eksikler.push('Ödeme ayarlarında alıcı adı yok');
  else if (!isimVar(metin, alici)) eksikler.push('Alıcı adı (' + alici + ') bulunamadı');
  if (!iban) eksikler.push('Ödeme ayarlarında IBAN yok');
  else if (!ibanVar(metin, iban)) eksikler.push('IBAN son haneleri bulunamadı');
  if (!(Number(tutar) > 0)) eksikler.push('Parçaya tutar girilmemiş');
  else if (!tutarVar(metin, tutar)) eksikler.push('Tutar (' + Number(tutar).toLocaleString('tr-TR') + ' ₺) bulunamadı');
  if (!tarihVar(metin, baslangic, simdi)) eksikler.push('Güncel bir işlem tarihi bulunamadı');
  return { gecti: eksikler.length === 0, eksikler };
}

module.exports = { sade, kelimeler, uzaklik, isimVar, ibanVar, tutarlar, tutarVar, tarihler, tarihVar, degerlendir };
