(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.DerinRadioPlaylistQueue = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, () => {
  function resolveQueue(broadcast, playlistTracks, tracks) {
    const trackById = new Map(tracks.map(track => [track.id, track]));
    if (broadcast?.playlist_id) {
      return playlistTracks
        .filter(item => item.playlist_id === broadcast.playlist_id)
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
        .map(item => trackById.get(item.track_id))
        .filter(Boolean);
    }
    return tracks
      .filter(track => track.folder_id === broadcast?.folder_id)
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  }

  function fromRpcRows(rows) {
    const list = Array.isArray(rows) ? rows : [];
    const head = list[0] || null;
    const tracks = list
      .filter(row => row?.track_id && row?.storage_path)
      .slice()
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    return {
      head,
      playlistName: head?.folder_name || '',
      tracks
    };
  }

  return { resolveQueue, fromRpcRows };
});
