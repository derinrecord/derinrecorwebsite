// Enerji Grafiği analizi ayrı iş parçacığında çalışır: uzun parçada sayfa donmasın.
/* global importScripts, DerinEnerji */
importScripts('energy-map-cekirdek.js?v=1');
self.onmessage = e => {
  try {
    const r = DerinEnerji.analizEt(e.data.veri, e.data.sr, { yan: e.data.yan || null });
    self.postMessage({ r }, [r.spektrum.buffer]);
  } catch (hata) {
    self.postMessage({ hata: String((hata && hata.message) || hata) });
  }
};
