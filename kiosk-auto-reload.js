/**
 * Kiosk browser reload: refresh the actual HTML/JS every five minutes.
 *
 * This is separate from manifestRefreshSeconds, which checks poster/config
 * changes without reloading the browser.
 *
 * Save the next playlist position in sessionStorage before reloading, so
 * long playlists continue instead of restarting every five minutes.
 */
(() => {
  "use strict";

  const RELOAD_EVERY_MS = 5 * 60 * 1000;
  const STORAGE_KEY = "infoskjermen:kiosk-resume:" + location.pathname;

  function takeIndex() {
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY);
      sessionStorage.removeItem(STORAGE_KEY);
      if (saved === null) return null;
      const index = Number(saved);
      return Number.isSafeInteger(index) && index >= 0 ? index : null;
    } catch {
      return null;
    }
  }

  let reloadDue = false;

  // A reload can only happen at the end of a full slide rotation.
  // Do not tear down the current poster when five minutes elapse.
  function start() {
    setTimeout(() => { reloadDue = true; }, RELOAD_EVERY_MS);
  }

  function reloadAtBoundary(nextIndex) {
    if (!reloadDue) return false;
    try {
      const index = Number(nextIndex);
      if (Number.isSafeInteger(index) && index >= 0) {
        sessionStorage.setItem(STORAGE_KEY, String(index));
      }
    } catch (error) {
      console.warn("Kiosk reload: could not save playlist position:", error);
    }
    const nextPage = new URL(location.href);
    nextPage.searchParams.set("_kioskReload", String(Date.now()));
    location.replace(nextPage.href);
    return true;
  }

  window.KioskAutoReload = { takeIndex, start, reloadAtBoundary };
})();
