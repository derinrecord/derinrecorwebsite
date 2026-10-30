// Öğretici mod · tur adımları (24 Ekim). Her adım: hedef (CSS seçici; null =
// ekranın ortasında genel açıklama), başlık ve metin (Türkçe / İngilizce).
// Hedefi sayfada olmayan ya da görünmeyen adım kendiliğinden atlanır.
(function () {
  'use strict';
  var A = function (hedef, btr, ben, mtr, men) { return { hedef: hedef, baslik: { tr: btr, en: ben }, metin: { tr: mtr, en: men } }; };

  var TURLAR = {
    projelerim: [
      A(null, 'Proje odana hoş geldin', 'Welcome to your project room',
        'Derin Record ile birlikte yaptığın müziklerin hepsi burada. Kısa bir turla nasıl kullanılacağını gösterelim.',
        'All the music you make with Derin Record lives here. Let us show you around in a few steps.'),
      A('.pj-ozet', 'Özet', 'Overview',
        'Kaç projenin yapımda, onay beklediğini ve teslim edildiğini bir bakışta gör.',
        'See at a glance how many projects are in production, awaiting approval or delivered.'),
      A('.proj-card .stage-bar', 'Üretim aşaması', 'Production stage',
        'Bu çubuk müziğinin hangi aşamada olduğunu gösterir: onay, başlangıç, yapım, bitim ve teslim.',
        'This bar shows where your music is: approved, started, in production, finishing and delivered.'),
      A('.proj-track', 'Parçayı aç', 'Open a track',
        'Parçaya dokun: dinleme, indirme ve zamanlı not bırakma odası açılır.',
        'Tap a track to open its room: listen, download and leave time-stamped notes.'),
      A('.fb-box', 'Projeye genel not', 'General project note',
        'Projenin tamamıyla ilgili mesajını buraya yaz ve GÖNDER\'e bas. Derin Record anında haber alır.',
        'Write a message about the whole project here and tap SEND. Derin Record is notified instantly.')
    ],
    'proje-detay': [
      A('.td-player', 'Dinle', 'Listen',
        'Oynat düğmesiyle parçayı dinle; çubuğu kaydırarak istediğin yerden başlat.',
        'Play the track; drag the bar to start from any point.'),
      A('.td-tools', 'İndir', 'Download',
        'Parçayı orijinal WAV ya da MP3 olarak indirebilirsin.',
        'Download the track as the original WAV or as an MP3.'),
      A('.td-wave-wrap', 'Dalga formu', 'Waveform',
        'Müziğin şekli. Dokunduğun yere gider; − / + ile yakınlaştırıp ayrıntılı bakabilirsin.',
        'The shape of the music. Tap to jump there; zoom with − / + for detail.'),
      A('.td-addbtn', 'İşaret koy', 'Add a marker',
        'Dinlerken değişmesini istediğin anda bas. O saniyeye bir işaret ve ona ait bir not klasörü açılır.',
        'Tap at the moment you want changed. A marker and its own note folder open at that second.'),
      A('.td-klasorler', 'Parçanın notları', 'Track notes',
        'Bu parçaya yazılan bütün notlar burada, tek klasörde. Belirli bir ana bağlı notların başında süresi var; dokununca o saniyeye gider.',
        'Every note for this track is here, in one folder. Notes tied to a moment show their time; tap it to jump there.'),
      A('.td-back', 'Geri dön', 'Go back',
        'Projelerine dönmek için buraya bas. Turu menüdeki ÖĞRETİCİ ile istediğin zaman tekrar açabilirsin.',
        'Tap here to return to your projects. Reopen this tour any time from TUTORIAL in the menu.')
    ],
    brans: [
      A('.player-controls', 'Demoyu dinle', 'Play the demo',
        'Kaseti oynat; çubuğu kaydırarak müziği istediğin yerden başlat.',
        'Play the tape; drag the bar to start anywhere in the music.'),
      A('.player-list', 'Demo kasetleri', 'Demo tapes',
        'Bu branşın demoları alt alta sıralanır; istediğine dokunup dinle.',
        'This discipline\'s demos are listed one under another; tap any to listen.'),
      A('.home', 'Demolara dön', 'Back to demos',
        'Diğer branşların demolarını dinlemek için buradan ana sayfaya dön.',
        'Go back to the home page to listen to other disciplines\' demos.')
    ]
  };

  if (typeof window !== 'undefined') window.DerinOgreticiTurlar = TURLAR;
  if (typeof module !== 'undefined') module.exports = TURLAR;
})();
