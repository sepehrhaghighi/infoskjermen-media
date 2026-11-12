"use strict";
(() => {
  // These screens are not media playlists, so check for a due refresh
  // at the end of their natural update/display intervals.
  const page = location.pathname.split("/").pop();
  const boundaryMs = page === "klubben.html" ? 30000 :
    page === "missing-features.html" ? 30 * 60 * 1000 : 0;
  if (!boundaryMs || !window.KioskAutoReload) return;
  window.KioskAutoReload.takeIndex();
  window.KioskAutoReload.start();
  setInterval(() => { window.KioskAutoReload.reloadAtBoundary(0); }, boundaryMs);
})();