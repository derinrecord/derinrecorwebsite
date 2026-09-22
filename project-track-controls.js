(function () {
  function renderTrackControls(track, isAdmin) {
    var play = '<button class="proj-play" data-play="' + track.id + '" data-path="' + track.audio_path + '" aria-label="Parçayı oynat">▶</button>';
    var remove = isAdmin ? '<button class="proj-delete-track" data-trackdel="' + track.id + '" data-path="' + track.audio_path + '" aria-label="Parçayı sil">×</button>' : '';
    return play + remove;
  }

  var api = { renderTrackControls: renderTrackControls };
  if (typeof window !== 'undefined') window.DerinProjectTrackControls = api;
  if (typeof module !== 'undefined') module.exports = api;
})();
