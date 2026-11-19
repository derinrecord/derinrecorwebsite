/* Üst menü açılır kısımları: tıklayınca / masaüstünde üzerine gelince açılır,
   dışarı tıklayınca ya da Esc ile kapanır. */
(() => {
  const kutular = [...document.querySelectorAll('.site-header .um-acilir')];
  if (!kutular.length) return;
  const masaustu = () => window.matchMedia('(min-width:1000px) and (hover:hover)').matches;
  const ayarla = (kutu, acik) => {
    kutu.classList.toggle('acik', acik);
    kutu.querySelector('.um-tetik').setAttribute('aria-expanded', String(acik));
  };
  const hepsiniKapat = (haric) => kutular.forEach((k) => { if (k !== haric) ayarla(k, false); });
  kutular.forEach((kutu) => {
    const tetik = kutu.querySelector('.um-tetik');
    tetik.addEventListener('click', (e) => {
      e.stopPropagation();
      const acik = !kutu.classList.contains('acik');
      hepsiniKapat(kutu); ayarla(kutu, acik);
    });
    // Fare çıkınca hemen değil, kısa bir gecikmeyle kapanır; geri gelirse açık kalır.
    let kapanmaZamani = null;
    const beklemeyiIptal = () => { if (kapanmaZamani) { clearTimeout(kapanmaZamani); kapanmaZamani = null; } };
    kutu.addEventListener('mouseenter', () => {
      if (!masaustu()) return;
      beklemeyiIptal(); hepsiniKapat(kutu); ayarla(kutu, true);
    });
    kutu.addEventListener('mouseleave', () => {
      if (!masaustu()) return;
      beklemeyiIptal();
      kapanmaZamani = setTimeout(() => { kapanmaZamani = null; ayarla(kutu, false); }, 300);
    });
  });
  document.addEventListener('click', (e) => { if (!e.target.closest('.um-acilir')) hepsiniKapat(); });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const acik = kutular.find((k) => k.classList.contains('acik'));
    if (acik) { ayarla(acik, false); acik.querySelector('.um-tetik').focus(); }
  });
})();
