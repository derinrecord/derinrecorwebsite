const test = require('node:test');
const assert = require('node:assert/strict');

const { resolveQueue, fromRpcRows } = require('../radio-playlist-queue.js');

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

test('normalizes RPC rows into ordered playlist data for the phone player', () => {
  const rows = [
    { brand_id: 'brand', brand_name: 'Chemex', folder_name: 'Akşam Akışı', track_id: 'two', title: 'Two', storage_path: 'two.mp3', sort_order: 2 },
    { brand_id: 'brand', brand_name: 'Chemex', folder_name: 'Akşam Akışı', track_id: 'one', title: 'One', storage_path: 'one.mp3', sort_order: 1 }
  ];

  const result = fromRpcRows(rows);

  assert.equal(result.head.brand_name, 'Chemex');
  assert.equal(result.playlistName, 'Akşam Akışı');
  assert.deepEqual(result.tracks.map(track => track.title), ['One', 'Two']);
});

test('keeps playlist metadata visible when an active playlist is empty', () => {
  const result = fromRpcRows([
    { brand_id: 'brand', brand_name: 'Chemex', folder_name: 'Yeni Liste', track_id: null }
  ]);

  assert.equal(result.playlistName, 'Yeni Liste');
  assert.deepEqual(result.tracks, []);
});
