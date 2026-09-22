const test = require('node:test');
const assert = require('node:assert/strict');

const { resolveQueue } = require('../radio-playlist-queue.js');

test('falls back to folder tracks when a broadcast has no playlist', () => {
  const broadcast = { playlist_id: null, folder_id: 'morning' };
  const tracks = [
    { id: 'one', folder_id: 'morning', title: 'Morning One', sort_order: 0 },
    { id: 'two', folder_id: 'evening', title: 'Evening Two', sort_order: 0 }
  ];

  assert.deepEqual(resolveQueue(broadcast, [], tracks), [tracks[0]]);
});

test('uses a brand playlist order without changing its source folder', () => {
  const broadcast = { playlist_id: 'brand-list', folder_id: 'morning' };
  const tracks = [
    { id: 'one', folder_id: 'morning', title: 'One', sort_order: 0 },
    { id: 'two', folder_id: 'morning', title: 'Two', sort_order: 1 }
  ];
  const playlistTracks = [
    { playlist_id: 'brand-list', track_id: 'two', sort_order: 0 },
    { playlist_id: 'brand-list', track_id: 'one', sort_order: 1 }
  ];

  assert.deepEqual(resolveQueue(broadcast, playlistTracks, tracks), [tracks[1], tracks[0]]);
});
