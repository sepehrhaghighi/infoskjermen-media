
  // Move image-error handling out of inline HTML attributes for CSP.
  document.querySelectorAll("img[data-hide-on-error]").forEach(img => {
    const hide = () => {
      const mode = img.getAttribute("data-hide-on-error");
      if (mode === "parent" && img.parentElement) img.parentElement.style.display = "none";
      else if (mode === "opacity") img.style.opacity = "0";
      else img.style.display = "none";
    };
    img.addEventListener("error", hide);
    if (img.complete && img.naturalWidth === 0) hide();
  });

(async () => {
  const CONFIG_SERVICE_URL = "https://script.google.com/macros/s/AKfycbwTw7_A4V68NbmGn2aFmo-r3ddEWvO9G9VcIf0pc4W_EaMhiVgCi4JV3jNIqtQTa9pqsA/exec";
  const FILMS_URL = "./assets/films.json";
  const ARR_URL   = "./assets/arrangements.json";

  const EXTRA_MANIFEST_URL = "./assets/landscape_extra_films/manifest.json";
  const ARR_EXTRA_MANIFEST_URL = "./assets/landscape_extra_arrangements/manifest.json";

  const FIELD = "landscape";

  const CONFIG_TIMEOUT_MS = 7000;
  const CONFIG_CACHE_KEY = "infoskjermenSharedConfigFromService";

  let enturSeconds = 0;
  let calendarSeconds = 0;
  let posterSeconds = 7;
  let fadeMs = 500;
  let refreshSeconds = 60;
  let filmVideosEnabled = false;
  let arrangementVideosEnabled = false;
  let refreshTimer = null;

  let items = []; // { url, v, source, date }
  let idx = 0;
  let pendingItems = null; // Apply manifest changes only between complete rotations.
  let activeCalendarSeconds = 0;
  let activeEnturSeconds = 0;
  let frontIsA = true;
  let heldVideo = null;

  function releaseHeldVideo() {
    if (!heldVideo) return;
    heldVideo.release();
    heldVideo = null;
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  const emptyEl = document.getElementById("empty");
  const A = document.getElementById("a");
  const B = document.getElementById("b");
  const dateA = document.getElementById("dateA");
  const dateB = document.getElementById("dateB");
  const qrWrap = document.getElementById("qrWrap");
  const enturSlide = window.EnturSlide.create(() => fadeMs);
  const calendarSlide = window.EnturSlide.create(() => fadeMs, "./calendar-slide.html", "Kalenderslide");

  function readNumericParam(name) {
    const v = new URLSearchParams(location.search).get(name);
    if (v === null || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  function positiveParam(name, fallback) {
    const n = readNumericParam(name);
    return n !== null && n > 0 ? n : fallback;
  }

  function pickNumber(...values) {
    for (const value of values) {
      if (value === "" || value == null) continue;
      const n = Number(value);
      if (Number.isFinite(n)) return n;
    }
    return null;
  }

  function readCachedConfig() {
    try {
      return JSON.parse(localStorage.getItem(CONFIG_CACHE_KEY) || "{}");
    } catch {
      return {};
    }
  }

  function writeCachedConfig(cfg) {
    try {
      localStorage.setItem(CONFIG_CACHE_KEY, JSON.stringify(cfg || {}));
    } catch {}
  }

  function normalizeConfig(raw) {
    if (!raw) return {};
    if (typeof raw === "string") {
      try { return JSON.parse(raw); } catch { return {}; }
    }
    if (raw.data && typeof raw.data === "object") return raw.data;
    if (raw.config && typeof raw.config === "object") return raw.config;
    if (typeof raw === "object") return raw;
    return {};
  }

  function isMeaningfulCfg(raw) {
    const cfg = normalizeConfig(raw);
    const refresh = cfg.manifestRefreshSeconds ?? cfg.refreshSeconds;
    return (
      pickNumber(cfg.posterSeconds) !== null ||
      pickNumber(cfg.fadeMs) !== null ||
      pickNumber(refresh) !== null
    );
  }

  function parseDateParts(value) {
    if (!value) return null;
    const m = String(value).match(
      /^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})(?::(\d{2}))?$/
    );
    if (!m) return null;

    return {
      year: Number(m[1]),
      month: Number(m[2]),
      day: Number(m[3]),
      hour: Number(m[4]),
      minute: Number(m[5]),
      second: Number(m[6] || 0)
    };
  }

  function formatArrangementDateTimeRange(begin, end) {
    const b = parseDateParts(begin);
    if (!b) return begin || "";

    const beginDate = new Date(b.year, b.month - 1, b.day, b.hour, b.minute, b.second);
    if (Number.isNaN(beginDate.getTime())) return begin || "";

    const dateText = new Intl.DateTimeFormat("nb-NO", {
      day: "numeric",
      month: "long",
      year: "numeric"
    }).format(beginDate);

    const beginTime = new Intl.DateTimeFormat("nb-NO", {
      hour: "2-digit",
      minute: "2-digit"
    }).format(beginDate);

    const e = parseDateParts(end);
    if (!e) return `${dateText} kl. ${beginTime}`;

    const endDate = new Date(e.year, e.month - 1, e.day, e.hour, e.minute, e.second);
    if (Number.isNaN(endDate.getTime())) return `${dateText} kl. ${beginTime}`;

    const endTime = new Intl.DateTimeFormat("nb-NO", {
      hour: "2-digit",
      minute: "2-digit"
    }).format(endDate);

    return `${dateText} kl. ${beginTime} - ${endTime}`;
  }

  async function fetchJson(url, timeoutMs = 12000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const r = await fetch(url, { cache: "no-store", signal: controller.signal });
      if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
      return await r.json();
    } finally {
      clearTimeout(timer);
    }
  }

  function normalizeExtraUrl(url) {
    if (!url) return "";
    if (url.startsWith("/assets/")) return "." + url;
    return url;
  }

  async function loadManualExtras(manifestUrl) {
    try {
      const m = await fetchJson(manifestUrl);
      const rawItems = Array.isArray(m.items) ? m.items : [];

      return rawItems
        .map(it => ({
          kind: it?.kind === "video" ? "video" : "image",
          originalName: String(it?.originalName || it?.name || ""),
          url: normalizeExtraUrl(it?.url || ""),
          v: it?.v ? ("?v=" + encodeURIComponent(it.v)) : ""
        }))
        .filter(it => it.url && (it.kind !== "video" || window.SignageVideo.validUrl(it.url)));
    } catch {
      return [];
    }
  }

  function mergeUniqueItems(primary, extra) {
    const seen = new Set(primary.map(it => it.url));
    const out = primary.slice();

    for (const it of extra) {
      if (it.url && !seen.has(it.url)) {
        seen.add(it.url);
        out.push(it);
      }
    }

    return out;
  }

  function loadConfigJSONP(timeoutMs = CONFIG_TIMEOUT_MS) {
    return new Promise((resolve) => {
      const cbName = "__cfgcb_" + Math.random().toString(16).slice(2);
      let finished = false;
      let called = false;

      window[cbName] = (cfg) => {
        called = true;
        finish(cfg || {});
      };

      const s = document.createElement("script");
      s.src = CONFIG_SERVICE_URL + "?callback=" + cbName + "&_=" + Date.now();

      s.onerror = () => finish({});
      s.onload = () => {
        setTimeout(() => {
          if (!finished && !called) finish({});
        }, 250);
      };

      document.head.appendChild(s);

      const t = setTimeout(() => {
        if (!finished) finish({});
      }, timeoutMs);

      function cleanup() {
        clearTimeout(t);
        try { delete window[cbName]; } catch {}
        s.remove();
      }

      function finish(val) {
        if (finished) return;
        finished = true;
        cleanup();
        resolve(val);
      }
    });
  }

  async function loadConfigFromService(timeoutMs = CONFIG_TIMEOUT_MS) {
    try {
      const raw = await loadConfigJSONP(timeoutMs);
      const cfg = normalizeConfig(raw);

      if (isMeaningfulCfg(cfg)) {
        writeCachedConfig(cfg);
        return cfg;
      }
    } catch (err) {
      console.error("Config service read failed:", err);
    }

    return normalizeConfig(readCachedConfig());
  }

  function applyConfigToUi() {
    const dur = fadeMs + "ms";
    A.style.transitionDuration = dur;
    B.style.transitionDuration = dur;
    dateA.style.transitionDuration = dur;
    dateB.style.transitionDuration = dur;
    if (qrWrap) qrWrap.style.transitionDuration = dur;
  }

  async function load() {
    const cachedCfg = readCachedConfig();

    const [cfg, filmsData, arrData, filmExtraItems, arrExtraItems] = await Promise.all([
      loadConfigFromService(CONFIG_TIMEOUT_MS),
      fetchJson(FILMS_URL),
      fetchJson(ARR_URL),
      loadManualExtras(EXTRA_MANIFEST_URL),
      loadManualExtras(ARR_EXTRA_MANIFEST_URL)
    ]);

    filmVideosEnabled = (cfg.videoEnabledByPage?.["films-landscape.html"] ?? cachedCfg.videoEnabledByPage?.["films-landscape.html"]) === true;
    arrangementVideosEnabled = (cfg.videoEnabledByPage?.["arrangements-landscape.html"] ?? cachedCfg.videoEnabledByPage?.["arrangements-landscape.html"]) === true;

    posterSeconds = positiveParam(
      "p",
      pickNumber(cfg.posterSeconds, cachedCfg.posterSeconds, 12)
    );

    calendarSeconds = Math.max(0, pickNumber(
      cfg.calendarSlideSecondsByPage?.["landscape-all.html"],
      cachedCfg.calendarSlideSecondsByPage?.["landscape-all.html"], 0
    ));

    enturSeconds = Math.max(0, pickNumber(
      cfg.enturSlideSecondsByPage?.["landscape-all.html"],
      cachedCfg.enturSlideSecondsByPage?.["landscape-all.html"], 0
    ));

    fadeMs = positiveParam(
      "fade",
      pickNumber(cfg.fadeMs, cachedCfg.fadeMs, 900)
    );

    refreshSeconds = positiveParam(
      "r",
      pickNumber(
        cfg.manifestRefreshSeconds,
        cfg.refreshSeconds,
        cachedCfg.manifestRefreshSeconds,
        cachedCfg.refreshSeconds,
        300
      )
    );

    applyConfigToUi();

    const v1 = filmsData.updated ? ("?v=" + encodeURIComponent(filmsData.updated)) : "";
    const v2 = arrData.updated ? ("?v=" + encodeURIComponent(arrData.updated)) : "";

    const films = (filmsData.films || [])
      .filter(x => x?.[FIELD])
      .map(x => ({
        url: x[FIELD],
        v: v1,
        source: "film",
        date: ""
      }));

    const filmExtras = window.SignageVideo.sort(filmExtraItems.filter(it => it.kind !== "video")).map(it => ({
      ...it, source: "film_extra", date: ""
    }));
    const filmVideos = filmVideosEnabled ? window.SignageVideo.sort(
      filmExtraItems.filter(it => it.kind === "video" && window.SignageVideo.validUrl(it.url, "films"))
    ).map(it => ({...it, source: "film_extra", date: ""})) : [];

    const arrs = (arrData.arrangements || [])
      .filter(x => x?.[FIELD])
      .map(x => ({
        url: x[FIELD],
        v: v2,
        source: "arrangement",
        date: formatArrangementDateTimeRange(x.begin, x.end)
      }));

    const arrExtras = window.SignageVideo.sort(arrExtraItems.filter(it => it.kind !== "video")).map(it => ({
      ...it, source: "arrangement_extra", date: ""
    }));
    const arrVideos = arrangementVideosEnabled ? window.SignageVideo.sort(
      arrExtraItems.filter(it => it.kind === "video" && window.SignageVideo.validUrl(it.url, "arrangements"))
    ).map(it => ({...it, source: "arrangement_extra", date: ""})) : [];

    // Order: films -> film manual extras -> arrangements -> arrangement manual extras
    const nextItems = mergeUniqueItems(
      films,
      filmExtras.concat(filmVideos, arrs, arrExtras, arrVideos)
    );

    const changed =
      nextItems.length !== items.length ||
      nextItems.some((it, i) =>
        it.url !== items[i]?.url ||
        it.v !== items[i]?.v ||
        it.source !== items[i]?.source ||
        it.kind !== items[i]?.kind ||
        it.date !== items[i]?.date
      );

    if (changed) {
      if (!items.length) items = nextItems;
      else pendingItems = nextItems;
    } else {
      pendingItems = null;
    }

    emptyEl.style.display = (items.length || enturSeconds > 0 || calendarSeconds > 0) ? "none" : "flex";
  }

  async function preload(item) {
    await new Promise(resolve => {
      const img = new Image();
      img.onload = resolve;
      img.onerror = resolve;
      img.src = item.url + item.v;
    });
  }

  function swapTo(item) {
    const frontImg  = frontIsA ? A : B;
    const backImg   = frontIsA ? B : A;
    const frontDate = frontIsA ? dateA : dateB;
    const backDate  = frontIsA ? dateB : dateA;

    backImg.src = item.url + item.v;

    const showArrangementOverlay =
      item.source === "arrangement" ||
      item.source === "arrangement_extra";

    const text = showArrangementOverlay ? (item.date || "").trim() : "";

    backDate.textContent = text;

    if (text) {
      backDate.classList.add("show");
    } else {
      backDate.classList.remove("show");
    }

    backImg.classList.add("show");
    frontImg.classList.remove("show");
    frontDate.classList.remove("show");

    if (qrWrap) {
      if (showArrangementOverlay) {
        qrWrap.classList.add("show");
      } else {
        qrWrap.classList.remove("show");
      }
    }

    frontIsA = !frontIsA;
  }

  async function tick() {
    // Keep both the manifest and optional-slide durations fixed throughout
    // an entire poster cycle. Refreshes cannot move Tavla into the middle.
    const oldCount = items.length + (activeCalendarSeconds > 0 ? 1 : 0) +
      (activeEnturSeconds > 0 ? 1 : 0);
    if (oldCount > 0 && idx > 0 && idx % oldCount === 0) {
      if (pendingItems) {
        items = pendingItems;
        pendingItems = null;
      }
      activeCalendarSeconds = calendarSeconds;
      activeEnturSeconds = enturSeconds;
      idx = 0;
      if (window.KioskAutoReload.reloadAtBoundary(idx)) return;
    }

    const withCalendar = activeCalendarSeconds > 0;
    const withEntur = activeEnturSeconds > 0;
    const count = items.length + (withCalendar ? 1 : 0) + (withEntur ? 1 : 0);
    if (!count) {
      setTimeout(tick, 2000);
      return;
    }

    const slot = idx % count;
    idx += 1;

    if (slot < items.length) {
      const item = items[slot];
      if (item.kind === "video") {
        qrWrap?.classList.remove("show");
        dateA.classList.remove("show");
        dateB.classList.remove("show");
        const previousVideo = heldVideo;
        heldVideo = null;
        const finalFrame = await window.SignageVideo.play(item, {
          hold: true,
          onPlaying: () => {
            previousVideo?.release();
            // Keep calendar / Entur visible until the video starts.
            if (calendarSlide.isActive()) void calendarSlide.hide();
            if (enturSlide.isActive()) void enturSlide.hide();
          }
        });
        if (!finalFrame) previousVideo?.release();
        heldVideo = finalFrame;
        setTimeout(tick, 0);
        return;
      }
      await preload(item);
      if (calendarSlide.isActive()) await calendarSlide.hide();
      if (enturSlide.isActive()) await enturSlide.hide();
      swapTo(item);
      if (heldVideo) {
        if (fadeMs > 0) await sleep(fadeMs);
        releaseHeldVideo();
      }
      setTimeout(tick, posterSeconds * 1000);
      return;
    }

    if (withCalendar && slot === items.length) {
      if (enturSlide.isActive()) await enturSlide.hide();
      const ready = await calendarSlide.show();
      if (ready) releaseHeldVideo();
      setTimeout(tick, ready ? activeCalendarSeconds * 1000 : 1000);
      return;
    }

    if (withEntur && slot === items.length + (withCalendar ? 1 : 0)) {
      if (calendarSlide.isActive()) await calendarSlide.hide();
      const ready = await enturSlide.show();
      if (ready) releaseHeldVideo();
      setTimeout(tick, ready ? activeEnturSeconds * 1000 : 1000);
      return;
    }
  }

  function scheduleReload() {
    clearTimeout(refreshTimer);

    refreshTimer = setTimeout(async () => {
      try {
        await load();
      } catch (err) {
        console.error("Landscape manifest/config reload failed:", err);
      }

      scheduleReload();
    }, refreshSeconds * 1000);
  }

  const resumeIndex = window.KioskAutoReload.takeIndex();
  window.KioskAutoReload.start(() => idx);
  await load();
  activeCalendarSeconds = calendarSeconds;
  activeEnturSeconds = enturSeconds;
  const slideCount = items.length + (activeCalendarSeconds > 0 ? 1 : 0) + (activeEnturSeconds > 0 ? 1 : 0);
  if (resumeIndex !== null && slideCount > 0) idx = resumeIndex % slideCount;
  tick();
  scheduleReload();
})();
