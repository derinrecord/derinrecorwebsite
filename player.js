const cassetteStyles = document.createElement('link');
cassetteStyles.rel = 'stylesheet';
cassetteStyles.href = 'branch-cassette.css';
document.head.append(cassetteStyles);

const timeText = (seconds) => {
  if (!Number.isFinite(seconds)) return '--:--';
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
};

document.querySelectorAll('.player-controls').forEach((controls) => {
  const button = controls.querySelector('.play');
  const seek = controls.querySelector('.seek');
  const time = controls.querySelector('.time');
  const media = document.querySelector(button?.dataset.media);
  if (!button || !seek || !time || !media) return;

  const updateProgress = () => {
    seek.max = Number.isFinite(media.duration) ? media.duration : 0;
    seek.value = Number.isFinite(media.currentTime) ? media.currentTime : 0;
    time.textContent = `${timeText(media.currentTime)} / ${timeText(media.duration)}`;
  };
  const resetButton = () => { button.textContent = '▶'; button.setAttribute('aria-label', 'Demoyu dinle'); };

  media.addEventListener('contextmenu', (event) => event.preventDefault());
  media.addEventListener('loadedmetadata', updateProgress);
  media.addEventListener('durationchange', updateProgress);
  media.addEventListener('timeupdate', updateProgress);
  media.addEventListener('ended', resetButton);
  media.addEventListener('pause', resetButton);
  media.addEventListener('play', () => { button.textContent = 'Ⅱ'; button.setAttribute('aria-label', 'Demoyu duraklat'); });
  const playFromSelectedTime = () => {
    if (!Number.isFinite(media.duration)) return;
    const sliderMaximum = Number(seek.max) || 100;
    media.currentTime = Math.min(Math.max((Number(seek.value) / sliderMaximum) * media.duration, 0), media.duration);
    updateProgress();
    if (media.paused) media.play().catch(() => { resetButton(); });
  };
  seek.addEventListener('input', playFromSelectedTime);
  seek.addEventListener('change', playFromSelectedTime);
  seek.addEventListener('pointerdown', (event) => {
    if (!Number.isFinite(media.duration)) return;
    const bounds = seek.getBoundingClientRect();
    const position = Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width));
    seek.value = position * (Number(seek.max) || 100);
    media.currentTime = position * media.duration;
    updateProgress();
    media.play().catch(() => { resetButton(); });
  });
  button.addEventListener('click', () => {
    document.querySelectorAll('audio, video').forEach((item) => { if (item !== media) item.pause(); });
    document.querySelectorAll('.play').forEach((item) => { if (item !== button) { item.textContent = '▶'; item.setAttribute('aria-label', 'Demoyu dinle'); } });
    if (media.paused) { media.play().catch(() => { resetButton(); time.textContent = 'Ses açılamadı. Tekrar dene.'; }); }
    else { media.pause(); resetButton(); }
  });
});
