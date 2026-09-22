const test = require('node:test');
const assert = require('node:assert/strict');
const { renderTrackControls } = require('../project-track-controls.js');

test('renders icon-only play and delete controls for an admin track', () => {
  const html = renderTrackControls({ id: 'track-1', audio_path: 'coach/track.mp3' }, true);
  assert.match(html, /aria-label="Parçayı oynat"/);
  assert.match(html, /aria-label="Parçayı sil"/);
  assert.doesNotMatch(html, />Oynat</);
});

test('does not render deletion for a coach view', () => {
  const html = renderTrackControls({ id: 'track-1', audio_path: 'coach/track.mp3' }, false);
  assert.doesNotMatch(html, /Parçayı sil/);
});
