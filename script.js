const button = document.querySelector('.menu-toggle');
const nav = document.querySelector('#nav');

const menuyuKapat = () => {
  if (!nav) return;
  nav.classList.remove('open');
  button?.setAttribute('aria-expanded', 'false');
  document.body.classList.remove('menu-open');
};

if (button && nav) {
  button.addEventListener('click', event => {
    event.stopPropagation();
    const open = nav.classList.toggle('open');
    button.setAttribute('aria-expanded', String(open));
    document.body.classList.toggle('menu-open', open);
  });

  nav.querySelectorAll('a').forEach(link => link.addEventListener('click', menuyuKapat));

  // Menü açıkken dışarı tıklama ve Escape ile kapanır.
  document.addEventListener('click', event => {
    if (!nav.classList.contains('open')) return;
    if (nav.contains(event.target) || button.contains(event.target)) return;
    menuyuKapat();
  });

  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || !nav.classList.contains('open')) return;
    menuyuKapat();
    button.focus();
  });
}
