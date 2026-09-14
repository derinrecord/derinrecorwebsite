(() => {
  document.querySelectorAll('.player-controls').forEach(controls => {
    const seek = controls.querySelector('.seek');
    const play = controls.querySelector('.play');
    const media = document.querySelector(play?.dataset.media);
    if (!seek || !media) return;
    const seekToPointer = event => {
      if (!Number.isFinite(media.duration)) return;
      const rect = seek.getBoundingClientRect();
      const progress = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
      media.currentTime = progress * media.duration;
      seek.value = progress * (Number(seek.max) || 100);
      if (media.paused) media.play().catch(() => {});
    };
    seek.addEventListener('pointerdown', seekToPointer);
    seek.addEventListener('input', () => {
      if (!Number.isFinite(media.duration)) return;
      const progress = Number(seek.value) / (Number(seek.max) || 100);
      media.currentTime = Math.max(0, Math.min(media.duration, progress * media.duration));
    });
  });
})();
