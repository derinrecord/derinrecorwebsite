// Ses dosyası tipleri, boyut sınırı ve parçalama yardımcıları.
//
// Hem tarayıcıda (window.DerinAudioTypes) hem Node testlerinde (require) kullanılır.
//
// NEDEN PARÇALAMA VAR
// Supabase ücretsiz planında tek nesne (object) sınırı tam olarak 52.428.800 bayt
// (50 MiB). Canlıda ölçülerek doğrulandı: 52.428.800 bayt kabul edilir,
// 52.428.801 bayt "The object exceeded the maximum allowed size" (HTTP 413) ile
// reddedilir. WAV yaklaşık 10 MB/dakika olduğu için 5 dakikadan uzun kayıtlar bu
// sınırı aşar. Çözüm: dosyayı 45 MB'lık parçalara bölüp sırayla yüklemek.
//
// Parçalar orijinal dosyanın kesintisiz dilimleridir (parça 1 dosya başlığını
// taşır, sonraki parçalar ham devamıdır). Sırayla birleştirildiğinde dosya
// BİT DÜZEYİNDE birebir aynı çıkar; kayıp yoktur, yeniden kodlama yoktur.
(function () {
  var TIPLER = {
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
    wave: 'audio/wav',
    flac: 'audio/flac',
    m4a: 'audio/mp4',
    mp4: 'audio/mp4',
    aac: 'audio/aac',
    ogg: 'audio/ogg',
    oga: 'audio/ogg',
    opus: 'audio/opus',
    aif: 'audio/aiff',
    aiff: 'audio/aiff',
    aifc: 'audio/aiff',
    webm: 'audio/webm',
    caf: 'audio/x-caf'
  };

  // Tek nesne için servis tavanı (ölçülen değer).
  var YUKLEME_SINIRI = 52428800;
  // Parça boyutu sınırın altında tutulur (pay bırakılır).
  var PARCA_BOYUTU = 45 * 1048576;

  var UZANTILAR = Object.keys(TIPLER);

  function uzanti(ad) {
    return (String(ad == null ? '' : ad).split('.').pop() || '').toLowerCase();
  }

  function tip(dosya) {
    var uz = uzanti(dosya && dosya.name);
    return TIPLER[uz] || (dosya && dosya.type) || 'audio/mpeg';
  }

  function gecerli(dosya) {
    return UZANTILAR.indexOf(uzanti(dosya && dosya.name)) !== -1;
  }

  function accept() {
    return UZANTILAR.map(function (e) { return '.' + e; }).join(',') + ',audio/*';
  }

  function desteklenenler() {
    return UZANTILAR.join(', ');
  }

  function boyut(bayt) {
    if (typeof bayt !== 'number' || !isFinite(bayt) || bayt < 0) return '0 KB';
    return bayt >= 1048576
      ? (bayt / 1048576).toFixed(1) + ' MB'
      : Math.max(1, Math.round(bayt / 1024)) + ' KB';
  }

  // Dosyanın bayt aralıklarını döner: 53 MB / 45 MB → [[0,47185920],[47185920,55574528]]
  function dilimSinirlari(toplamBayt, parcaBoyutu) {
    var limit = parcaBoyutu || PARCA_BOYUTU;
    if (!toplamBayt || toplamBayt <= 0) return [[0, 0]];
    var sinirlar = [];
    for (var bas = 0; bas < toplamBayt; bas += limit) {
      sinirlar.push([bas, Math.min(toplamBayt, bas + limit)]);
    }
    return sinirlar;
  }

  function parcaSayisi(toplamBayt) {
    return dilimSinirlari(toplamBayt).length;
  }

  // Yol sonuna eklenen parça etiketi: -p02of03
  function parcaEki(index, toplam) {
    var i = String(index); while (i.length < 2) i = '0' + i;
    var n = String(toplam); while (n.length < 2) n = '0' + n;
    return '-p' + i + 'of' + n;
  }

  var PARCA_DESENI = /-p(\d{2})of(\d{2})(\.[^.\/]+)$/;

  function parcaliMi(path) {
    return PARCA_DESENI.test(String(path == null ? '' : path));
  }

  // "<antrenor>/<proje>-<zaman>-p02of03.wav" → üç parçanın da yolları.
  // Parçalı olmayan yolda tek elemanlı liste döner.
  function parcalariCoz(path) {
    var yol = String(path == null ? '' : path);
    var eslesme = PARCA_DESENI.exec(yol);
    if (!eslesme) return [{ path: yol, index: 1, toplam: 1 }];
    var toplam = parseInt(eslesme[2], 10) || 1;
    var liste = [];
    for (var i = 1; i <= toplam; i++) {
      liste.push({
        path: yol.replace(PARCA_DESENI, parcaEki(i, toplam) + '$3'),
        index: i,
        toplam: toplam
      });
    }
    return liste;
  }

  // Dosya parçalanacak mı? (kullanıcıya bilgi vermek için)
  function buyukMu(dosya) {
    return !!dosya && dosya.size > PARCA_BOYUTU;
  }

  var api = {
    TIPLER: TIPLER,
    UZANTILAR: UZANTILAR,
    YUKLEME_SINIRI: YUKLEME_SINIRI,
    PARCA_BOYUTU: PARCA_BOYUTU,
    uzanti: uzanti,
    tip: tip,
    gecerli: gecerli,
    accept: accept,
    desteklenenler: desteklenenler,
    boyut: boyut,
    dilimSinirlari: dilimSinirlari,
    parcaSayisi: parcaSayisi,
    parcaEki: parcaEki,
    parcaliMi: parcaliMi,
    parcalariCoz: parcalariCoz,
    buyukMu: buyukMu
  };

  if (typeof window !== 'undefined') window.DerinAudioTypes = api;
  if (typeof module !== 'undefined') module.exports = api;
})();
