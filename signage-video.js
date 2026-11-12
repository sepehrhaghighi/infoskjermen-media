"use strict";
(() => {
  const HOST = "infoskjermen-video-gateway.sepehr-infoskjermen.workers.dev";
  function validUrl(value, group) {
    try {
      const u = new URL(value, document.baseURI);
      return u.protocol === "https:" && u.hostname === HOST &&
        /^\/media\/(films|arrangements)\/[A-Za-z0-9._!-]+\.mp4$/i.test(u.pathname) &&
        (!group || u.pathname.startsWith("/media/" + group + "/"));
    } catch { return false; }
  }
  function sort(items) {
    return items.slice().sort((a, b) =>
      String(a.originalName || a.name || "").localeCompare(
        String(b.originalName || b.name || ""), "nb", { numeric: true, sensitivity: "base" }
      )
    );
  }
  async function play(item, options = {}) {
    const hold = options.hold === true;
    if (!validUrl(item?.url)) return hold ? null : false;
    const stage = document.querySelector(".stage");
    if (!stage) return hold ? null : false;
    const video = document.createElement("video");
    video.muted = true;
    video.defaultMuted = true;
    video.autoplay = true;
    video.playsInline = true;
    video.setAttribute("muted", "");
    video.setAttribute("playsinline", "");
    video.controls = false;
    video.loop = false;
    video.preload = "auto";
    video.style.position = "absolute";
    video.style.inset = "0";
    video.style.width = "100%";
    video.style.height = "100%";
    video.style.zIndex = "20";
    video.style.background = "#000";
    video.style.objectFit = "contain";
    return new Promise(resolve => {
      let finished = false, startTimer, stopTimer;
      function cleanup() {
        video.pause();
        video.removeAttribute("src");
        video.load();
        video.remove();
      }
      function end(ok) {
        if (finished) return;
        finished = true;
        clearTimeout(startTimer);
        clearTimeout(stopTimer);
        video.pause();
        if (ok && hold) {
          // Keep the final video frame visible until the next scene is ready.
          resolve({ release: cleanup });
        } else {
          cleanup();
          resolve(hold ? null : ok);
        }
      }
      video.addEventListener("ended", () => end(true), { once: true });
      video.addEventListener("error", () => end(false), { once: true });
      video.addEventListener("playing", () => {
        clearTimeout(startTimer);
        if (typeof options.onPlaying === "function") options.onPlaying();
      }, { once: true });
      video.addEventListener("loadedmetadata", () => {
        if (Number.isFinite(video.duration) && video.duration > 0) {
          clearTimeout(stopTimer);
          stopTimer = setTimeout(() => end(false), Math.min(30 * 60 * 1000, Math.ceil(video.duration * 1000) + 60000));
        }
      }, { once: true });
      startTimer = setTimeout(() => end(false), 45000);
      stopTimer = setTimeout(() => end(false), 30 * 60 * 1000);
      video.src = item.url + (item.v || "");
      stage.appendChild(video);
      const result = video.play();
      if (result && typeof result.catch === "function") result.catch(() => end(false));
    });
  }
  window.SignageVideo = Object.freeze({ validUrl, sort, play });
})();