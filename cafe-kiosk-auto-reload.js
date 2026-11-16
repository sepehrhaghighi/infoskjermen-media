/**
 * Café Sandbeck kiosk page reload only.
 *
 * On the first load of this version, do one immediate cache-busted page reload.
 * Afterwards, reload the whole page every three hours, even during a video or
 * document. Remember the current playlist item to resume close to where the
 * refresh occurred. This does not affect the six-hour refresh on other displays.
 */
(() => {
  "use strict";

  const RELOAD_EVERY_MS = 3 * 60 * 60 * 1000;
  const VERSION = "20261116-3h-v1";
  const INIT_PARAM = "_cafeRefreshVersion";
  const STORAGE_KEY = "infoskjermen:kiosk-resume:" + location.pathname;
  let currentIndex = 0;
  let started = false;
  let reloading = false;

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

  function rememberIndex(value) {
    const index = Number(value);
    if (Number.isSafeInteger(index) && index >= 0) currentIndex = index;
  }

  function hardReload() {
    if (reloading) return;
    reloading = true;
    try {
      sessionStorage.setItem(STORAGE_KEY, String(currentIndex));
    } catch (error) {
      console.warn("Café kiosk: could not save playlist position:", error);
    }
    const nextPage = new URL(location.href);
    nextPage.searchParams.set(INIT_PARAM, VERSION);
    // Changing the HTML URL forces a new page request without changing the
    // public display URL. Manifest fetches already use cache:no-store.
    nextPage.searchParams.set("_kioskReload", String(Date.now()));
    location.replace(nextPage.href);
  }

  function start() {
    if (started) return;
    started = true;
    const current = new URL(location.href);
    if (current.searchParams.get(INIT_PARAM) !== VERSION) {
      // One immediate reload on adopting this version, not on every page load.
      setTimeout(hardReload, 0);
      return;
    }
    setTimeout(hardReload, RELOAD_EVERY_MS);
  }

  // Kept for compatibility with the shared slideshow runtime. The Café refresh
  // is time-based rather than waiting for a full playlist rotation.
  function reloadAtBoundary() { return false; }

  window.KioskAutoReload = Object.freeze({
    takeIndex, rememberIndex, start, reloadAtBoundary
  });
})();
