"use strict";
(() => {
  const page = location.pathname.split("/").pop();
  const groups = Object.freeze({
    "kafe_sandbeck.html": "kafe_sandbeck",
    "bibliotek.html": "bibliotek"
  });
  const group = groups[page];
  if (!group) return;
  const MANIFEST_URL = "./assets/" + group + "/manifest.json";
  const IMAGE_MS = 10000;
  const FADE_MS = 300;
  const REFRESH_MS = 60000;
  const posterA = document.getElementById("posterA");
  const posterB = document.getElementById("posterB");
  const message = document.getElementById("message");
  const resumeIndex = window.KioskAutoReload.takeIndex();
  let items = [];
  let pending = null;
  let index = 0;
  let frontIsA = false;
  let heldVideo = null;
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

  function imageUrl(item) {
    if (!item || typeof item.url !== "string") return "";
    try {
      const base = new URL("./assets/" + group + "/", document.baseURI);
      const url = new URL(item.url, document.baseURI);
      if (url.origin !== base.origin || !url.pathname.startsWith(base.pathname) ||
          !/\.(jpg|jpeg|png)$/i.test(url.pathname) || url.username || url.password) return "";
      if (item.v != null && item.v !== "") url.searchParams.set("v", String(item.v));
      return url.href;
    } catch { return ""; }
  }

  async function reload() {
    try {
      const res = await fetch(MANIFEST_URL + "?_=" + Date.now(), {cache:"no-store"});
      if (!res.ok) throw new Error("Manifest HTTP " + res.status);
      const data = await res.json();
      if (!Array.isArray(data.items)) throw new Error("Invalid manifest");
      const pictures = [], movies = [];
      for (const entry of data.items) {
        if (entry?.kind === "video") {
          if (!window.SignageVideo.validUrl(entry.url, group)) continue;
          const url = new URL(entry.url);
          if (entry.v != null && entry.v !== "") url.searchParams.set("v", String(entry.v));
          movies.push({kind:"video", name:String(entry.name||""), originalName:String(entry.originalName||""), url:url.href, v:""});
        } else {
          const url = imageUrl(entry);
          if (url) pictures.push({kind:"image",name:String(entry.name||""),originalName:String(entry.originalName||entry.name||""),url});
        }
      }
      const next = window.SignageVideo.sort(pictures).concat(window.SignageVideo.sort(movies));
      if (!items.length) {
        items = next;
        index = Math.min(index, Math.max(0, items.length - 1));
      } else if (JSON.stringify(items) !== JSON.stringify(next)) {
        pending = next;
      }
    } catch (err) {
      console.error("Media refresh failed:", err);
      if (!items.length) {
        message.textContent = "Kunne ikke laste medier.";
        message.style.display = "flex";
      }
    }
  }

  function preload(url) {
    return new Promise(resolve => {
      const img = new Image();
      img.onload = () => resolve(true);
      img.onerror = () => resolve(false);
      img.src = url;
    });
  }

  async function showImage(item) {
    const loaded = await preload(item.url);
    if (!loaded) { await sleep(500); return; }
    message.style.display = "none";
    const next = frontIsA ? posterB : posterA;
    const previous = frontIsA ? posterA : posterB;
    next.src = item.url;
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    next.classList.add("show");
    previous.classList.remove("show");
    await sleep(FADE_MS + 50);
    if (heldVideo) { heldVideo.release(); heldVideo = null; }
    previous.removeAttribute("src");
    frontIsA = !frontIsA;
    await sleep(IMAGE_MS);
  }

  async function showVideo(item) {
    message.style.display = "none";
    const previous = heldVideo;
    heldVideo = null;
    const result = await window.SignageVideo.play(item,{
      hold:true,
      onPlaying: () => previous?.release()
    });
    if (!result) previous?.release();
    heldVideo = result;
  }

  async function run() {
    window.KioskAutoReload.start();
    await reload();
    if (resumeIndex !== null && items.length) index = resumeIndex % items.length;
    setInterval(() => { void reload(); }, REFRESH_MS);
    for (;;) {
      if (!items.length) {
        if (pending) { items = pending; pending = null; }
        if (!items.length) {
          if (window.KioskAutoReload.reloadAtBoundary(0)) return;
          if (heldVideo) { heldVideo.release(); heldVideo = null; }
          posterA.classList.remove("show");
          posterB.classList.remove("show");
          message.style.display = "flex";
          await sleep(1000);
          continue;
        }
      }
      if (index >= items.length) {
        index = 0;
        if (pending) { items = pending; pending = null; }
        if (window.KioskAutoReload.reloadAtBoundary(0)) return;
        if (!items.length) continue;
      }
      const item = items[index++];
      if (item.kind === "video") await showVideo(item);
      else await showImage(item);
    }
  }
  void run();
})();