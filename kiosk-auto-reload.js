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

  function start(getNextIndex) {
    setTimeout(() => {
      try {
        const index = Number(getNextIndex());
        if (Number.isSafeInteger(index) && index >= 0) {
          sessionStorage.setItem(STORAGE_KEY, String(index));
        }
      } catch (error) {
        console.warn("Kiosk reload: could not save playlist position:", error);
      }

      // Replace, rather than push, browser history. The changing query
      // parameter bypasses a stale HTML page while preserving URL overrides.
      const nextPage = new URL(location.href);
      nextPage.searchParams.set("_kioskReload", String(Date.now()));
      location.replace(nextPage.href);
    }, RELOAD_EVERY_MS);
  }

  window.KioskAutoReload = { takeIndex, start };
})();
