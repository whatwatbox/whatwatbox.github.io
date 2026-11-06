const dialog = document.querySelector('.lightbox');
if (dialog) {
  let opener;
  document.querySelectorAll('.photo-open').forEach(button => {
    button.addEventListener('click', () => {
      opener = button;
      dialog.querySelector('img').src = button.dataset.photo;
      dialog.querySelector('img').alt = button.querySelector('img').alt;
      dialog.querySelector('p').textContent = button.dataset.caption;
      dialog.showModal();
    });
  });
  dialog.querySelector('.lightbox-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
  dialog.addEventListener('close', () => { if (opener) opener.focus(); });
}

// Motion is decorative. Content stays readable if scripts or observers fail.
(() => {
  const preference = matchMedia('(prefers-reduced-motion: reduce)');
  const root = document.documentElement;
  let paused = false;
  const hero = document.querySelector('.hero');
  let toggle;
  if (hero) {
    hero.classList.add('motion-hero');
    const decor = document.createElement('div');
    decor.className = 'floating-decor';
    decor.setAttribute('aria-hidden', 'true');
    ['07', '58', '23'].forEach((number, index) => {
      const ball = document.createElement('span');
      ball.className = `floating-ball ball-${index + 1}`;
      ball.textContent = number;
      decor.append(ball);
    });
    for (let index = 0; index < 14; index++) {
      const piece = document.createElement('i');
      piece.className = 'confetti-piece';
      piece.style.setProperty('--piece-x', `${4 + (index * 23) % 93}%`);
      piece.style.setProperty('--piece-y', `${8 + (index * 31) % 79}%`);
      piece.style.setProperty('--piece-delay', `${-index * 0.83}s`);
      piece.style.setProperty('--piece-color', ['#f7c531', '#ef7164', '#177d82'][index % 3]);
      decor.append(piece);
    }
    hero.prepend(decor);
    toggle = document.createElement('button');
    toggle.className = 'motion-toggle';
    toggle.type = 'button';
    toggle.addEventListener('click', () => {
      paused = !paused;
      updateMotion();
    });
    hero.append(toggle);
  }
  const targets = document.querySelectorAll('.section-title, .overview-body, .photo, .album-note, .join-card, .preparing, .sub-hero-row');
  const observer = 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.removeAttribute('data-pending');
        observer.unobserve(entry.target);
      }
    });
  }, {threshold: 0.08}) : null;
  targets.forEach((target, index) => {
    target.classList.add('motion-reveal');
    target.style.setProperty('--reveal-delay', `${index % 2 * 100}ms`);
    if (observer && !preference.matches) {
      // Do not hide elements already on screen when the document loads.
      if (target.getBoundingClientRect().top > innerHeight) target.setAttribute('data-pending', '');
      observer.observe(target);
    }
  });
  function updateMotion() {
    root.classList.toggle('motion-running', !preference.matches && !paused);
    root.classList.toggle('motion-paused', paused || preference.matches);
    if (toggle) {
      toggle.hidden = preference.matches;
      toggle.textContent = paused ? '▶ 動きを再開' : 'Ⅱ 動きを止める';
      toggle.setAttribute('aria-pressed', String(paused));
    }
    if (paused || preference.matches) targets.forEach(target => target.removeAttribute('data-pending'));
  }
  preference.addEventListener('change', updateMotion);
  root.classList.add('motion-ready');
  updateMotion();
})();
