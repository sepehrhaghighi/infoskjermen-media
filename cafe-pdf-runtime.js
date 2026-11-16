"use strict";
(() => {
  const FADE_MS = 300;
  const PAGE_MS = 10000;
  const WORKER_URL = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

  async function play(item, { onReady } = {}) {
    const stage = document.querySelector("#stage.stage");
    if (!stage || !window.pdfjsLib || typeof window.pdfjsLib.getDocument !== "function") {
      console.warn("Café document viewer is unavailable; skipping", item?.originalName);
      return null;
    }
    const url = new URL(item.url, document.baseURI);
    const base = new URL("./assets/kafe_sandbeck/", document.baseURI);
    if (url.origin !== base.origin || !url.pathname.startsWith(base.pathname) ||
        !url.pathname.toLowerCase().endsWith(".pdf")) return null;

    window.pdfjsLib.GlobalWorkerOptions.workerSrc = WORKER_URL;
    const overlay = document.createElement("div");
    Object.assign(overlay.style, {
      position: "absolute", inset: "0", zIndex: "30", display: "flex",
      alignItems: "center", justifyContent: "center",
      background: "#000", opacity: "0", pointerEvents: "none",
      transition: "opacity " + FADE_MS + "ms ease-in-out"
    });
    stage.appendChild(overlay);
    let pdf = null;
    let released = false;
    let firstPage = true;
    let currentCanvas = null;
    const release = () => {
      if (released) return;
      released = true;
      overlay.remove();
      if (pdf) void pdf.destroy().catch(() => {});
      pdf = null;
    };
    try {
      const loading = window.pdfjsLib.getDocument({url: url.href, isEvalSupported: false, useSystemFonts: true});
      pdf = await loading.promise;
      if (!Number.isInteger(pdf.numPages) || pdf.numPages < 1) throw new Error("Empty PDF");
      for (let number = 1; number <= pdf.numPages && !released; number++) {
        const page = await pdf.getPage(number);
        const original = page.getViewport({scale: 1});
        const width = Math.max(1, stage.clientWidth || innerWidth);
        const height = Math.max(1, stage.clientHeight || innerHeight);
        const scale = Math.min(width / original.width, height / original.height);
        const dpr = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
        const viewport = page.getViewport({scale: scale * dpr});
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.floor(viewport.width));
        canvas.height = Math.max(1, Math.floor(viewport.height));
        Object.assign(canvas.style, {
          position: "absolute", left: "50%", top: "50%", transform: "translate(-50%,-50%)",
          width: (viewport.width / dpr) + "px", height: (viewport.height / dpr) + "px",
          maxWidth: "100%", maxHeight: "100%", opacity: "0",
          transition: "opacity " + FADE_MS + "ms ease-in-out"
        });
        await page.render({canvasContext: canvas.getContext("2d", {alpha: false}), viewport}).promise;
        if (released) return null;
        overlay.appendChild(canvas);
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        canvas.style.opacity = "1";
        if (firstPage) {
          overlay.style.opacity = "1";
          await pause(FADE_MS + 50);
          if (typeof onReady === "function") onReady();
          firstPage = false;
        } else {
          await pause(FADE_MS + 50);
          currentCanvas?.remove();
        }
        currentCanvas = canvas;
        await pause(PAGE_MS);
      }
      return {release};
    } catch (err) {
      console.warn("Unable to display Café PDF", item?.originalName, err);
      release();
      return null;
    }
  }
  window.CafePdfRenderer = Object.freeze({play});
})();
