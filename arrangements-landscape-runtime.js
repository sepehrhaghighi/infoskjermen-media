
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
  const MANIFEST_URL = "./assets/arrangements.json";
  const EXTRA_MANIFEST_URL = "./assets/landscape_extra_arrangements/manifest.json";
  const CALENDAR_SLIDE_URL = "https://sepehrhaghighi.github.io/infoskjermen-media/calendar-slide.html";
  const FIELD = "landscape";
  const ENTUR_TAVLA_URL = "https://vis-tavla.entur.no/vB3ZXkgI42ecuHXY9X7I";

  const CONFIG_TIMEOUT_MS = 7000;
  const CALENDAR_FRAME_TIMEOUT_MS = 12000;
  const CONFIG_CACHE_KEY = "infoskjermenSharedConfigFromService";

  let posterSeconds = 7;
  let calendarSlideSeconds = 20;
  let enturSlideSeconds = 0;
  let fadeMs = 500;
  let refreshSeconds = 60;
  let videoEnabled = false;

  let refreshTimer = null;
  let tickTimer = null;
  let heldVideo = null;

  function releaseHeldVideo() {
    if (!heldVideo) return;
    heldVideo.release();
    heldVideo = null;
  }

  let items = [];
  let idx = 0;
  let pendingItems = null; // Manifest changes wait until the current rotation is complete.
  let frontIsA = true;

  let calendarReady = false;
  let calendarLoadingPromise = null;

  const emptyEl = document.getElementById("empty");
  const posterScene = document.getElementById("posterScene");
  const calendarScene = document.getElementById("calendarScene");
  const calendarFrame = document.getElementById("calendarFrame");
  const enturScene = document.getElementById("enturScene");
  const enturFrame = document.getElementById("enturFrame");

  const A = document.getElementById("a");
  const B = document.getElementById("b");
  const dateA = document.getElementById("dateA");
  const dateB = document.getElementById("dateB");
  const qrWrap = document.getElementById("qrWrap");

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

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

  function nonNegativeParam(name, fallback) {
    const n = readNumericParam(name);
    return n !== null && n >= 0 ? n : fallback;
  }

  function pickNumber(...values) {
    for (const value of values) {
      if (value === "" || value == null) continue;
      const n = Number(value);
      if (Number.isFinite(n)) return n;
    }
    return null;
  }

  function pickBoolean(...values) {
    for (const value of values) {
      if (value == null || value === "") continue;
      if (value === true || value === "true" || value === 1 || value === "1") return true;
      if (value === false || value === "false" || value === 0 || value === "0") return false;
    }
    return false;
  }

  function validEnturUrl(value) {
    try { return new URL(value).protocol === "https:"; } catch { return false; }
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
      pickNumber(cfg.calendarSlideSeconds) !== null ||
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
    if (!e) {
      return `${dateText} kl. ${beginTime}`;
    }

    const endDate = new Date(e.year, e.month - 1, e.day, e.hour, e.minute, e.second);
    if (Number.isNaN(endDate.getTime())) {
      return `${dateText} kl. ${beginTime}`;
    }

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
      const r = await fetch(url, {
        cache: "no-store",
        signal: controller.signal
      });
      if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
      return await r.json();
    } finally {
      clearTimeout(timer);
    }
  }

  function loadConfigJSONP(extraParams = {}, timeoutMs = CONFIG_TIMEOUT_MS) {
    return new Promise((resolve) => {
      const cbName = "__cfgcb_" + Math.random().toString(16).slice(2);
      let finished = false;
      let called = false;

      window[cbName] = (cfg) => {
        called = true;
        finish(cfg || {});
      };

      const params = new URLSearchParams({
        callback: cbName,
        _: String(Date.now()),
        ...Object.fromEntries(
          Object.entries(extraParams).filter(([, v]) => v != null && String(v).length > 0)
        )
      });

      const s = document.createElement("script");
      s.src = CONFIG_SERVICE_URL + "?" + params.toString();

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
      const raw = await loadConfigJSONP({}, timeoutMs);
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

  function normalizeExtraUrl(url) {
    if (!url) return "";
    if (url.startsWith("/assets/")) return "." + url;
    return url;
  }

  async function loadManualExtras(manifestUrl, baseSeconds) {
    try {
      const m = await fetchJson(manifestUrl, 12000);
      const rawItems = Array.isArray(m.items) ? m.items : [];

      return rawItems
        .map((it) => ({
          kind: it?.kind === "video" ? "video" : "image",
          originalName: String(it?.originalName || it?.name || ""),
          url: normalizeExtraUrl(it?.url || ""),
          v: it?.v ? ("?v=" + encodeURIComponent(it.v)) : "",
          date: "",
          seconds: baseSeconds
        }))
        .filter((it) => it.url && (it.kind !== "video" || window.SignageVideo.validUrl(it.url, "arrangements")));
    } catch {
      return [];
    }
  }

  function mergeUniqueItems(primary, extra) {
    const seen = new Set(primary.map((it) => it.url));
    const out = primary.slice();

    for (const it of extra) {
      if (it.url && !seen.has(it.url)) {
        seen.add(it.url);
        out.push(it);
      }
    }

    return out;
  }

  function itemsChanged(nextItems) {
    if (nextItems.length !== items.length) return true;

    for (let i = 0; i < nextItems.length; i += 1) {
      const a = nextItems[i];
      const b = items[i];
      if (!b) return true;
      if (a.kind !== b.kind) return true;
      if ((a.url || "") !== (b.url || "")) return true;
      if ((a.v || "") !== (b.v || "")) return true;
      if ((a.date || "") !== (b.date || "")) return true;
      if ((a.seconds || 0) !== (b.seconds || 0)) return true;
    }

    return false;
  }

  function applyFadeDurations() {
    const dur = fadeMs + "ms";
    A.style.transitionDuration = dur;
    B.style.transitionDuration = dur;
    dateA.style.transitionDuration = dur;
    dateB.style.transitionDuration = dur;
    qrWrap.style.transitionDuration = dur;
    posterScene.style.transitionDuration = dur;
    calendarScene.style.transitionDuration = dur;
    enturScene.style.transitionDuration = dur;
  }

  function isExternalSlideActive() {
    return calendarScene.classList.contains("active") || enturScene.classList.contains("active");
  }

  async function fadeToEntur() {
    enturScene.classList.add("active");
    calendarScene.classList.remove("active");
    posterScene.classList.remove("active");
    if (fadeMs > 0) await sleep(fadeMs);
  }

  function ensureEnturReady(url) {
    if (!validEnturUrl(url)) return Promise.resolve(false);
    return new Promise((resolve) => {
      let done = false;
      const finish = (ok) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        enturFrame.removeEventListener("load", loaded);
        enturFrame.removeEventListener("error", failed);
        resolve(ok);
      };
      const loaded = () => finish(true);
      const failed = () => finish(false);
      const timer = setTimeout(() => finish(false), 12000);
      enturFrame.addEventListener("load", loaded);
      enturFrame.addEventListener("error", failed);
      const nextUrl = new URL(url);
      nextUrl.searchParams.set("_", String(Date.now()));
      enturFrame.src = nextUrl.href;
    });
  }

  function isCalendarActive() {
    return calendarScene.classList.contains("active");
  }

  async function fadeToCalendar() {
    if (isCalendarActive()) return;
    calendarScene.classList.add("active");
    enturScene.classList.remove("active");
    posterScene.classList.remove("active");
    if (fadeMs > 0) await sleep(fadeMs);
  }

  async function fadeToPoster() {
    if (!isExternalSlideActive()) return;
    posterScene.classList.add("active");
    calendarScene.classList.remove("active");
    enturScene.classList.remove("active");
    if (fadeMs > 0) await sleep(fadeMs);
  }

  function clearLayer(el) {
    while (el.firstChild) el.removeChild(el.firstChild);
  }

  function setLayerImage(el, item) {
    clearLayer(el);

    const img = document.createElement("img");
    img.className = "mediaImg";
    img.alt = "";
    img.src = item.url + (item.v || "");
    el.appendChild(img);
  }

  function setPosterImmediate(item) {
    setLayerImage(A, item);
    A.classList.add("show");
    B.classList.remove("show");

    const text = (item.date || "").trim();
    dateA.textContent = text;
    dateB.textContent = "";
    if (text) dateA.classList.add("show");
    else dateA.classList.remove("show");
    dateB.classList.remove("show");

    qrWrap.classList.add("show");
    frontIsA = true;
  }

  async function preloadPoster(item) {
    if (!item || item.kind !== "image") return;

    await new Promise((resolve) => {
      const img = new Image();
      img.onload = resolve;
      img.onerror = resolve;
      img.src = item.url + (item.v || "");
    });
  }

  async function primeFirstPoster() {
    const firstPoster = items.find((it) => it.kind === "image");
    if (!firstPoster) return;
    await preloadPoster(firstPoster);
    setPosterImmediate(firstPoster);
  }

  function swapToPoster(item) {
    const frontLayer = frontIsA ? A : B;
    const backLayer = frontIsA ? B : A;
    const frontDate = frontIsA ? dateA : dateB;
    const backDate = frontIsA ? dateB : dateA;

    setLayerImage(backLayer, item);

    const text = (item.date || "").trim();
    backDate.textContent = text;

    if (text) backDate.classList.add("show");
    else backDate.classList.remove("show");

    qrWrap.classList.add("show");

    backLayer.classList.add("show");
    frontLayer.classList.remove("show");
    frontDate.classList.remove("show");

    frontIsA = !frontIsA;
  }

  function refreshCalendarInBackground(forceReload = true) {
    if (calendarSlideSeconds <= 0) {
      calendarReady = false;
      return Promise.resolve(false);
    }

    if (calendarLoadingPromise) return calendarLoadingPromise;

    calendarReady = false;

    calendarLoadingPromise = new Promise((resolve) => {
      let settled = false;

      function finish(ok) {
        if (settled) return;
        settled = true;
        calendarReady = !!ok;
        calendarLoadingPromise = null;
        resolve(!!ok);
      }

      const timer = setTimeout(() => {
        calendarFrame.removeEventListener("load", onLoad);
        finish(false);
      }, CALENDAR_FRAME_TIMEOUT_MS);

      function onLoad() {
        clearTimeout(timer);
        calendarFrame.removeEventListener("load", onLoad);
        finish(true);
      }

      calendarFrame.addEventListener("load", onLoad, { once: true });

      if (forceReload || !calendarFrame.src) {
        const sep = CALENDAR_SLIDE_URL.includes("?") ? "&" : "?";
        calendarFrame.src = CALENDAR_SLIDE_URL + sep + "_=" + Date.now();
      } else {
        clearTimeout(timer);
        calendarFrame.removeEventListener("load", onLoad);
        finish(true);
      }
    });

    return calendarLoadingPromise;
  }

  async function ensureCalendarReady() {
    if (calendarSlideSeconds <= 0) return false;
    if (calendarReady && calendarFrame.src) return true;
    return await refreshCalendarInBackground(true);
  }

  async function load() {
    const cachedCfg = readCachedConfig();

    const [cfg, data] = await Promise.all([
      loadConfigFromService(CONFIG_TIMEOUT_MS),
      fetchJson(MANIFEST_URL, 12000)
    ]);

    videoEnabled = (cfg.videoEnabledByPage?.["arrangements-landscape.html"] ?? cachedCfg.videoEnabledByPage?.["arrangements-landscape.html"]) === true;

    posterSeconds = positiveParam(
      "p",
      pickNumber(cfg.posterSeconds, cachedCfg.posterSeconds, 12)
    );

    calendarSlideSeconds = Math.max(0, pickNumber(
      cfg.calendarSlideSecondsByPage?.["arrangements-landscape.html"],
      cachedCfg.calendarSlideSecondsByPage?.["arrangements-landscape.html"],
      cfg.calendarSlideSeconds, cachedCfg.calendarSlideSeconds, 0
    ));
    enturSlideSeconds = Math.max(0, pickNumber(
      cfg.enturSlideSecondsByPage?.["arrangements-landscape.html"],
      cachedCfg.enturSlideSecondsByPage?.["arrangements-landscape.html"], 0
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

    applyFadeDurations();

    const baseVersion = data.updated ? ("?v=" + encodeURIComponent(data.updated)) : "";

    const posters = (data.arrangements || [])
      .filter((x) => x?.[FIELD])
      .map((x) => ({
        kind: "image",
        url: x[FIELD],
        v: baseVersion,
        date: formatArrangementDateTimeRange(x.begin, x.end),
        seconds: posterSeconds
      }));

    const extraItems = await loadManualExtras(EXTRA_MANIFEST_URL, posterSeconds);
    const extraImages = window.SignageVideo.sort(extraItems.filter(it => it.kind !== "video"));
    const extraVideos = videoEnabled ? window.SignageVideo.sort(extraItems.filter(it => it.kind === "video")) : [];
    let nextItems = mergeUniqueItems(posters, extraImages).concat(extraVideos);

    if (calendarSlideSeconds > 0) {
      nextItems.push({
        kind: "calendar",
        url: CALENDAR_SLIDE_URL,
        seconds: calendarSlideSeconds
      });
    }

    if (enturSlideSeconds > 0) {
      nextItems.push({ kind: "entur", url: ENTUR_TAVLA_URL, seconds: enturSlideSeconds });
    }

    const changed = itemsChanged(nextItems);
    if (changed) {
      if (!items.length) items = nextItems;
      else pendingItems = nextItems; // Never restart the poster sequence mid-cycle.
    } else {
      pendingItems = null;
    }

    emptyEl.style.display = items.length ? "none" : "flex";
  }

  async function tick() {
    if (!items.length) {
      tickTimer = setTimeout(tick, 2000);
      return;
    }

    if (idx > 0 && idx % items.length === 0) {
      if (pendingItems) {
        items = pendingItems;
        pendingItems = null;
        idx = 0;
      }
      if (window.KioskAutoReload.reloadAtBoundary(idx)) return;
    }

    const item = items[idx % items.length];
    idx += 1;

    if (item.kind === "video") {
      qrWrap.classList.remove("show");
      dateA.classList.remove("show");
      dateB.classList.remove("show");
      const previousVideo = heldVideo;
      heldVideo = null;
      const finalFrame = await window.SignageVideo.play(item, {
        hold: true,
        onPlaying: () => {
          previousVideo?.release();
          if (isExternalSlideActive()) void fadeToPoster();
        }
      });
      // If this video fails, release the previous held frame too.
      if (!finalFrame) previousVideo?.release();
      heldVideo = finalFrame;
      tickTimer = setTimeout(tick, 0);
      return;
    }

    if (item.kind === "entur") {
      const ready = await ensureEnturReady(item.url);
      if (!ready) {
        tickTimer = setTimeout(tick, 1000);
        return;
      }
      await fadeToEntur();
      releaseHeldVideo();
      tickTimer = setTimeout(tick, (item.seconds || enturSlideSeconds) * 1000);
      return;
    }

    if (item.kind === "calendar") {
      const ready = await ensureCalendarReady();

      if (!ready) {
        tickTimer = setTimeout(tick, 1000);
        return;
      }

      await fadeToCalendar();
      releaseHeldVideo();

      tickTimer = setTimeout(async () => {
        const nextItem = items[idx % items.length];

        if (nextItem?.kind === "image") {
          await preloadPoster(nextItem);
          swapToPoster(nextItem);
          idx += 1;
        }

        if (nextItem?.kind === "image") {
          await fadeToPoster();
          if (calendarSlideSeconds > 0) void refreshCalendarInBackground(true);
          tickTimer = setTimeout(tick, (nextItem.seconds || posterSeconds) * 1000);
        } else {
          tick();
        }
      }, (item.seconds || 15) * 1000);

      return;
    }

    await preloadPoster(item);

    if (isExternalSlideActive()) {
      swapToPoster(item);
      await fadeToPoster();

      if (calendarSlideSeconds > 0) {
        void refreshCalendarInBackground(true);
      }
    } else {
      swapToPoster(item);
    }
    if (heldVideo) {
      // Allow the new image layer to settle behind the last video frame.
      if (fadeMs > 0) await sleep(fadeMs);
      releaseHeldVideo();
    }

    tickTimer = setTimeout(tick, (item.seconds || posterSeconds) * 1000);
  }

  function scheduleReload() {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(async () => {
      try {
        await load();
      } catch (err) {
        console.error("Manifest/config reload failed:", err);
      }
      scheduleReload();
    }, refreshSeconds * 1000);
  }

  const resumeIndex = window.KioskAutoReload.takeIndex();
  window.KioskAutoReload.start(() => idx);
  await load();
  if (resumeIndex !== null && items.length) idx = resumeIndex % items.length;

  posterScene.classList.remove("active");
  calendarScene.classList.remove("active");
  enturScene.classList.remove("active");

  const startsWithCalendar = resumeIndex === null && items[0]?.kind === "calendar";

  if (startsWithCalendar) {
    const ready = await refreshCalendarInBackground(true);

    if (ready) {
      qrWrap.classList.remove("show");
      dateA.classList.remove("show");
      dateB.classList.remove("show");
      calendarScene.classList.add("active");
      idx = 1;
      tickTimer = setTimeout(tick, calendarSlideSeconds * 1000);
    } else {
      await primeFirstPoster();
      posterScene.classList.add("active");
      if (calendarSlideSeconds > 0) {
        void refreshCalendarInBackground(true);
      }
      tick();
    }
  } else {
    await primeFirstPoster();
    posterScene.classList.add("active");

    if (calendarSlideSeconds > 0) {
      void refreshCalendarInBackground(true);
    }

    tick();
  }

  scheduleReload();
})();
