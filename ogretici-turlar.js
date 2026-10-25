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
      A('.feedback-access', 'Geri bildirim alanı', 'Feedback area',
        'Bu demoya not bırakmak için giriş yapman ve Derin Record\'un sana erişim vermesi gerekir.',
        'To leave notes on this demo you need to log in and be granted access by Derin Record.'),
      A('.feedback .load-wave', 'Dalga formunu aç', 'Open the waveform',
        'Önce dalga formunu aç; müziğin şekli görünür.',
        'First open the waveform to see the shape of the music.'),
      A('.feedback .wave-wrap', 'Nokta ekle', 'Add points',
        'Dalgada değişmesini istediğin yere dokun. Birden fazla nokta ekleyebilir, sürükleyerek yerini değiştirebilirsin.',
        'Tap where you want a change. Add several points and drag them to move.'),
      A('.feedback .movement-picker', 'Yaş ve kategori', 'Age and category',
        'Sporcunun yaş grubunu ve yarışma kategorisini seç; FIG kuralları buna göre gösterilir.',
        'Choose the athlete\'s age group and category; FIG rules are shown accordingly.'),
      A('.feedback .note-actions', 'Not ve sesli not', 'Text and voice notes',
        'Notunu yaz ya da SESLİ NOT KAYDET ile anlat, sonra BU NOKTAYI KAYDET\'e bas.',
        'Type your note or record a voice note, then tap SAVE THIS POINT.')
    ]
  };

  if (typeof window !== 'undefined') window.DerinOgreticiTurlar = TURLAR;
  if (typeof module !== 'undefined') module.exports = TURLAR;
})();
