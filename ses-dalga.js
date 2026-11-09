// Ses dalgası çıkarma (9 Kasım 2026): bir ses ya da video adresini tarayıcıda
// çözüp Ableton tarzı üst/alt dalga (DerinMekanVitrini.ustAlt, 600 dilim) ve
// saniye cinsinden süre döndürür. Branş sayfasında yönetici kullanır.
(function () {
  'use strict';
  async function cikar(adres) {
    var MV = window.DerinMekanVitrini;
    if (!MV) throw new Error('Dalga yardımcısı yüklenmedi');
    var veri = await (await fetch(adres)).arrayBuffer();
    var Ctx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    var buf = await new Ctx(1, 44100, 44100).decodeAudioData(veri);
    var kanallar = [];
    for (var k = 0; k < Math.min(2, buf.numberOfChannels); k++) kanallar.push(buf.getChannelData(k));
    return { dalga: MV.ustAlt(kanallar, MV.DALGA_NOKTA), sure: Math.round(buf.duration) };
  }
  window.DerinSesDalga = { cikar: cikar };
})();
