(() => {
  // Dokunmatik cihazlarda basılı tutarak sıralama.
  // Kopya oluşturmaz; satırın kendisini hareket ettirir.
  const BEKLE = 250;   // basılı tutma süresi (ms)
  const OYNA  = 10;    // kaydırma toleransı (px)

  let kaynak = null, zaman = null, basladi = false;
  let baslaX = 0, baslaY = 0, sonHedef = null;

  const satirBul = el => {
    while (el && el !== document.body) {
      if (el.getAttribute && el.getAttribute('draggable') === 'true') return el;
      el = el.parentElement;
    }
    return null;
  };

  const olayGonder = (hedef, tip) => {
    const dt = new DataTransfer();
    hedef.dispatchEvent(new DragEvent(tip, { bubbles:true, cancelable:true, dataTransfer:dt }));
  };

  function temizle() {
    clearTimeout(zaman);
    if (kaynak) {
      kaynak.style.transform = '';
      kaynak.style.transition = '';
      kaynak.style.zIndex = '';
      kaynak.style.boxShadow = '';
      kaynak.style.opacity = '';
      if (basladi) olayGonder(kaynak, 'dragend');
    }
    if (sonHedef) { olayGonder(sonHedef, 'dragleave'); sonHedef = null; }
    kaynak = null; basladi = false;
    document.body.style.userSelect = '';
    document.body.style.overflow = '';
  }

  document.addEventListener('touchstart', e => {
    if (e.touches.length !== 1) return;
    const satir = satirBul(e.target);
    if (!satir) return;
    if (e.target.closest('button, a, input, select, textarea, canvas')) return;

    kaynak = satir;
    baslaX = e.touches[0].clientX;
    baslaY = e.touches[0].clientY;

    zaman = setTimeout(() => {
      basladi = true;
      document.body.style.userSelect = 'none';
      document.body.style.overflow = 'hidden';
      kaynak.style.transition = 'box-shadow .18s, opacity .18s';
      kaynak.style.zIndex = '999';
      kaynak.style.position = 'relative';
      kaynak.style.boxShadow = '0 16px 34px rgba(0,0,0,.55)';
      kaynak.style.opacity = '.96';
      if (navigator.vibrate) navigator.vibrate(15);
      olayGonder(kaynak, 'dragstart');
    }, BEKLE);
  }, { passive:true });

  document.addEventListener('touchmove', e => {
    if (!kaynak) return;
    const t = e.touches[0];

    if (!basladi) {
      if (Math.abs(t.clientX - baslaX) > OYNA || Math.abs(t.clientY - baslaY) > OYNA) {
        clearTimeout(zaman); kaynak = null;
      }
      return;
    }

    e.preventDefault();
    kaynak.style.transition = 'none';
    kaynak.style.transform = `translateY(${t.clientY - baslaY}px)`;

    kaynak.style.pointerEvents = 'none';
    const alt = document.elementFromPoint(t.clientX, t.clientY);
    kaynak.style.pointerEvents = '';
    const hedef = satirBul(alt);

    if (hedef !== sonHedef) {
      if (sonHedef) olayGonder(sonHedef, 'dragleave');
      sonHedef = (hedef && hedef !== kaynak) ? hedef : null;
      if (sonHedef) olayGonder(sonHedef, 'dragover');
    }
  }, { passive:false });

  document.addEventListener('touchend', () => {
    if (!kaynak) return;
    if (!basladi) { clearTimeout(zaman); kaynak = null; return; }
    if (sonHedef) olayGonder(sonHedef, 'drop');
    temizle();
  });

  document.addEventListener('touchcancel', temizle);
})();
