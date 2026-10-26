// Shared optional full-screen iframe slide for Calendar and Entur Tavla.
(() => {
  const BOARD_URL = "https://vis-tavla.entur.no/vB3ZXkgI42ecuHXY9X7I";

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  let nextOverlayId = 0;
  function create(getFadeMs, pageUrl = BOARD_URL, title = "Entur Tavla") {
    const overlay = document.createElement("div");
    overlay.id = "infoSlideOverlay" + (++nextOverlayId);
    Object.assign(overlay.style, {
      position: "fixed", inset: "0", zIndex: "1500", opacity: "0",
      background: "#000", pointerEvents: "none", transition: "opacity 500ms ease-in-out"
    });

    const iframe = document.createElement("iframe");
    iframe.title = title;
    iframe.setAttribute("referrerpolicy", "no-referrer-when-downgrade");
    Object.assign(iframe.style, {
      display: "block", width: "100%", height: "100%", border: "0",
      background: "#000"
    });
    overlay.appendChild(iframe);
    document.body.appendChild(overlay);

    let frameLoaded = false;
    let pendingLoad = null;
    let active = false;

    function ensureReady() {
      if (frameLoaded) return Promise.resolve(true);
      if (pendingLoad) return pendingLoad;
      pendingLoad = new Promise(resolve => {
        let settled = false;
        const finish = ok => {
          if (settled) return;
          settled = true;
          frameLoaded = ok;
          clearTimeout(timer);
          iframe.removeEventListener("load", onLoad);
          iframe.removeEventListener("error", onError);
          pendingLoad = null;
          resolve(ok);
        };
        const onLoad = () => finish(true);
        const onError = () => finish(false);
        const timer = setTimeout(() => finish(false), 12000);
        iframe.addEventListener("load", onLoad);
        iframe.addEventListener("error", onError);
        iframe.src = pageUrl;
      });
      return pendingLoad;
    }

    async function show() {
      if (!(await ensureReady())) return false;
      const fadeMs = Math.max(0, Number(getFadeMs()) || 0);
      overlay.style.transitionDuration = fadeMs + "ms";
      overlay.style.opacity = "1";
      active = true;
      if (fadeMs) await sleep(fadeMs);
      return true;
    }

    async function hide() {
      if (!active) return;
      const fadeMs = Math.max(0, Number(getFadeMs()) || 0);
      overlay.style.transitionDuration = fadeMs + "ms";
      overlay.style.opacity = "0";
      active = false;
      if (fadeMs) await sleep(fadeMs);
    }

    return { show, hide, isActive: () => active };
  }

  window.EnturSlide = { create }; // Backward compatible name for existing pages.
})();
