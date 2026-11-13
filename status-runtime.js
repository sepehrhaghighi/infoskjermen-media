
(() => {
  const CONFIG_SERVICE_URL = "https://script.google.com/macros/s/AKfycbwTw7_A4V68NbmGn2aFmo-r3ddEWvO9G9VcIf0pc4W_EaMhiVgCi4JV3jNIqtQTa9pqsA/exec";
  const FILMS_URL = "./assets/films.json";
  const ARR_URL   = "./assets/arrangements.json";
  const EXTRA_URL = "./assets/landscape_extra_films/manifest.json";
  const ARR_EXTRA_URL = "./assets/landscape_extra_arrangements/manifest.json";
  const BG_REL    = "./assets/status-bg.jpg";

  const DEFAULTS = {
    posterSeconds: 7,
    calendarSlideSecondsByPage: {"films-portrait.html":0,"films-landscape.html":20,"arrangements-portrait.html":0,"arrangements-landscape.html":20,"portrait-all.html":0,"landscape-all.html":0},
    enturSlideSecondsByPage: {"films-portrait.html":0,"films-landscape.html":0,"arrangements-portrait.html":0,"arrangements-landscape.html":0,"portrait-all.html":0,"landscape-all.html":0},
    videoEnabledByPage: {"films-landscape.html":false,"arrangements-landscape.html":false},
    fadeMs: 500,
    manifestRefreshSeconds: 60
  };

  const SCREEN_PAGES = ["films-portrait.html","films-landscape.html","arrangements-portrait.html","arrangements-landscape.html","portrait-all.html","landscape-all.html"];
  let enturSecondsDraft = { ...DEFAULTS.enturSlideSecondsByPage };
  let calendarSecondsDraft = { ...DEFAULTS.calendarSlideSecondsByPage };
  const VIDEO_PAGES = ["films-landscape.html","arrangements-landscape.html"];
  let videoEnabledDraft = { ...DEFAULTS.videoEnabledByPage };

  const els = {
    posterSeconds: document.getElementById("posterSeconds"),

    fadeMs: document.getElementById("fadeMs"),
    refreshSeconds: document.getElementById("refreshSeconds"),
    updateKey: document.getElementById("updateKey"),
    applyBtn: document.getElementById("applyBtn"),
    tbody: document.getElementById("tbody"),
    statusBox: document.getElementById("statusBox"),
    bgLayer: document.getElementById("bgLayer")
  };

  function setStatus(msg, tone = "muted") {
    els.statusBox.textContent = msg || "";
    els.statusBox.className = "statusLine small " + (
      tone === "ok" ? "status-ok" :
      tone === "bad" ? "status-bad" :
      tone === "warn" ? "status-warn" :
      "status-muted"
    );
  }

  function disableUi(disabled) {
    els.posterSeconds.disabled = disabled;
    els.tbody.querySelectorAll(".calendar-seconds, .entur-seconds, .video-enabled").forEach(input => { input.disabled = disabled; });
    els.fadeMs.disabled = disabled;
    els.refreshSeconds.disabled = disabled;
    els.applyBtn.disabled = disabled;
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, ch => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[ch]);
  }

  function pill(text, cls = "ok") {
    return `<span class="pill ${cls}">${text}</span>`;
  }

  function fmtDuration(seconds) {
    seconds = Math.max(0, Math.round(seconds));
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  async function fetchJson(url) {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error(`Kunne ikke hente data (HTTP ${r.status}) fra ${url}`);
    return await r.json();
  }

  function safeNumber(x) {
    const n = Number(x);
    return Number.isFinite(n) ? n : null;
  }

  function normalizeCfg(raw) {
    if (!raw) return {};
    if (typeof raw === "string") {
      try { return JSON.parse(raw); } catch { return {}; }
    }
    if (raw.data && typeof raw.data === "object") return raw.data;
    if (raw.config && typeof raw.config === "object") return raw.config;
    return raw;
  }

  function isMeaningfulCfg(raw) {
    const cfg = normalizeCfg(raw);
    const refresh = cfg.manifestRefreshSeconds ?? cfg.refreshSeconds;
    return (
      cfg.posterSeconds != null ||
      cfg.calendarSlideSeconds != null ||
      cfg.fadeMs != null ||
      refresh != null
    );
  }

  function normalizeDurationMap(raw) {
    const source = raw && typeof raw === "object" ? raw : {};
    return Object.fromEntries(SCREEN_PAGES.map(page => [
      page, Math.max(0, Math.min(3600, Math.round(safeNumber(source[page]) ?? 0)))
    ]));
  }

  function normalizeVideoMap(raw) {
    const src = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
    return Object.fromEntries(VIDEO_PAGES.map(page => [page, src[page] === true]));
  }
  function configsMatch(a, b) {
    const enturLeft = normalizeDurationMap(a.enturSlideSecondsByPage);
    const enturRight = normalizeDurationMap(b.enturSlideSecondsByPage);
    const calendarLeft = normalizeDurationMap(a.calendarSlideSecondsByPage);
    const calendarRight = normalizeDurationMap(b.calendarSlideSecondsByPage);
    const videoA = normalizeVideoMap(a.videoEnabledByPage);
    const videoB = normalizeVideoMap(b.videoEnabledByPage);
    return Number(a.posterSeconds) === Number(b.posterSeconds) &&
      Number(a.fadeMs) === Number(b.fadeMs) &&
      Number(a.manifestRefreshSeconds) === Number(b.manifestRefreshSeconds) &&
      SCREEN_PAGES.every(page => enturLeft[page] === enturRight[page] && calendarLeft[page] === calendarRight[page]) &&
      VIDEO_PAGES.every(page => videoA[page] === videoB[page]);
  }

  function loadConfigJSONP(extraParams = {}, timeoutMs = 16000) {
    return new Promise((resolve) => {
      const cbName = "__cfgcb_" + Math.random().toString(16).slice(2);
      let called = false;
      let finished = false;

      window[cbName] = (payload) => {
        called = true;
        finish({ ok: true, payload: payload || {} });
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

      s.onerror = () => finish({
        ok: false,
        error: "network_error",
        message: "Kunne ikke hente innstillingene."
      });

      s.onload = () => {
        setTimeout(() => {
          if (!finished && !called) {
            finish({
              ok: false,
              error: "empty_response",
              message: "Tjenesten for innstillinger sendte ikke noe svar."
            });
          }
        }, 250);
      };

      document.head.appendChild(s);

      const t = setTimeout(() => {
        if (!finished) {
          finish({
            ok: false,
            error: "timeout",
            message: "Forespørselen om innstillinger tok for lang tid."
          });
        }
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

  function setUiConfig(rawCfg) {
    const cfg = normalizeCfg(rawCfg);
    const refresh = cfg.manifestRefreshSeconds ?? cfg.refreshSeconds;

    if (cfg.posterSeconds != null) els.posterSeconds.value = cfg.posterSeconds;
    enturSecondsDraft = normalizeDurationMap(cfg.enturSlideSecondsByPage);
    calendarSecondsDraft = normalizeDurationMap(cfg.calendarSlideSecondsByPage);
    videoEnabledDraft = normalizeVideoMap(cfg.videoEnabledByPage);
    if (cfg.fadeMs != null) els.fadeMs.value = cfg.fadeMs;
    if (refresh != null) els.refreshSeconds.value = refresh;
  }

  function readUiConfig() {
    return {
      posterSeconds: Math.max(1, safeNumber(els.posterSeconds.value) ?? DEFAULTS.posterSeconds),
      calendarSlideSecondsByPage: normalizeDurationMap(calendarSecondsDraft),
      enturSlideSecondsByPage: normalizeDurationMap(enturSecondsDraft),
      videoEnabledByPage: normalizeVideoMap(videoEnabledDraft),
      fadeMs: Math.max(0, safeNumber(els.fadeMs.value) ?? DEFAULTS.fadeMs),
      manifestRefreshSeconds: Math.max(30, safeNumber(els.refreshSeconds.value) ?? DEFAULTS.manifestRefreshSeconds)
    };
  }

  function countField(items, field) {
    return (items || []).map(x => x?.[field]).filter(Boolean).length;
  }

  function countExtraItems(extraData) {
    return Array.isArray(extraData?.items) ? extraData.items.filter(x => x?.url && x.kind !== "video").length : 0;
  }

  function countVideos(data) { return Array.isArray(data?.items) ? data.items.filter(x => x?.url && x.kind === "video").length : 0; }
  async function renderCounts() {
    const posterSeconds = Math.max(1, safeNumber(els.posterSeconds.value) ?? DEFAULTS.posterSeconds);
    const calendarMap = normalizeDurationMap(calendarSecondsDraft);
    const calendarFor = page => calendarMap[page] || 0;
    const enturMap = normalizeDurationMap(enturSecondsDraft);
    const enturFor = page => enturMap[page] || 0;

    els.tbody.innerHTML = `<tr><td colspan="7" class="muted">Laster…</td></tr>`;

    try {
      const [filmsData, arrData, extraData, arrExtraData] = await Promise.all([
        fetchJson(FILMS_URL),
        fetchJson(ARR_URL),
        fetchJson(EXTRA_URL).catch(() => ({ items: [] })),
        fetchJson(ARR_EXTRA_URL).catch(() => ({ items: [] }))
      ]);

      const films = filmsData.films || [];
      const arrs  = arrData.arrangements || [];
      const extraLandscape = countExtraItems(extraData);
      const extraArrLandscape = countExtraItems(arrExtraData);
      const filmVideos = countVideos(extraData);
      const arrangementVideos = countVideos(arrExtraData);

      const filmsPortrait      = countField(films, "poster");
      const filmsLandscapeBase = countField(films, "landscape");
      const arrPortrait        = countField(arrs, "poster");
      const arrLandscape       = countField(arrs, "landscape");

      const filmsLandscapeImageCount = filmsLandscapeBase + extraLandscape;
      const arrangementsLandscapeImageCount = arrLandscape + extraArrLandscape;
      const portraitAll = filmsPortrait + arrPortrait;
      const landscapeAll = filmsLandscapeImageCount + arrangementsLandscapeImageCount;

      const rows = [
        { page:"films-portrait.html", desc:"DX-filmplakater (stående format)", imageCount:filmsPortrait },
        { page:"films-landscape.html", desc:`DX-filmplakater + ${extraLandscape} bilde(r) fra OneDrive — landscape_extra_films`, imageCount:filmsLandscapeImageCount },
        { page:"arrangements-portrait.html", desc:"DX-arrangementsplakater (stående format)", imageCount:arrPortrait },
        { page:"arrangements-landscape.html", desc:`DX-arrangementsplakater + ${extraArrLandscape} bilde(r) fra OneDrive — landscape_extra_arrangements`, imageCount:arrangementsLandscapeImageCount },
        { page:"portrait-all.html", desc:"DX-filmer og arrangementer (stående format)", imageCount:portraitAll },
        { page:"landscape-all.html", desc:`DX-filmer og arrangementer + ${extraLandscape + extraArrLandscape} bilde(r) fra OneDrive (begge mappene for liggende format)`, imageCount:landscapeAll }
      ];
      rows.forEach(row => {
        row.videoCount = row.page === "films-landscape.html" ? (videoEnabledDraft["films-landscape.html"] ? filmVideos : 0) :
          row.page === "arrangements-landscape.html" ? (videoEnabledDraft["arrangements-landscape.html"] ? arrangementVideos : 0) :
          row.page === "landscape-all.html" ? ((videoEnabledDraft["films-landscape.html"] ? filmVideos : 0) +
            (videoEnabledDraft["arrangements-landscape.html"] ? arrangementVideos : 0)) : 0;
        row.calendar = calendarFor(row.page);
        row.entur = enturFor(row.page);
        if (row.calendar > 0) row.desc += " + kalender";
        if (row.entur > 0) row.desc += " + Entur-tavle";
        row.count = row.imageCount + row.videoCount + (row.calendar > 0 ? 1 : 0) + (row.entur > 0 ? 1 : 0);
        row.seconds = row.imageCount * posterSeconds + row.calendar + row.entur;
      });

      els.tbody.innerHTML = rows.map(r => `
        <tr>
          <td>${pill("OK","ok")} <a href="./${r.page}" target="_blank" rel="noopener noreferrer">${r.page}</a></td>
          <td class="muted">${r.desc}</td>
          <td class="right">${SCREEN_PAGES.includes(r.page) ?
            '<input class="calendar-seconds" type="number" min="0" max="3600" step="1" data-page="' +
            r.page + '" value="' + r.calendar + '" aria-label="Kalender, sekunder for ' + r.page + '">' : "—"}</td>
          <td class="right">${SCREEN_PAGES.includes(r.page) ?
            '<input class="entur-seconds" type="number" min="0" max="3600" step="1" data-page="' +
            r.page + '" value="' + r.entur + '" aria-label="Entur-tavle, sekunder for ' + r.page + '">' : "—"}</td>
          <td class="right">${VIDEO_PAGES.includes(r.page) ?
            '<input type="checkbox" class="video-enabled" data-page="' + r.page + '" ' +
            (videoEnabledDraft[r.page] ? 'checked' : '') + ' aria-label="Video uten lyd for ' + r.page + '">' :
            (r.page === "landscape-all.html" ? "Følger kildene" : "—")}</td>
          <td class="right mono">${r.count}</td>
          <td class="right mono">${fmtDuration(r.seconds)}${r.videoCount ? " + videolengde" : ""}</td>
        </tr>
      `).join("");

    } catch (e) {
      els.tbody.innerHTML = `<tr><td colspan="7">${pill("FEIL","bad")} <span class="mono">${escapeHtml(e instanceof Error && /^Kunne ikke hente data/.test(e.message) ? e.message : "Kunne ikke laste oversikten. Kontroller nettforbindelsen og prøv igjen.")}</span></td></tr>`;
    }
  }

  async function reloadConfig() {
    let result = await loadConfigJSONP({}, 16000);

    // Apps Script can take longer to start just after a new deployment.
    // Retry one failed read before falling back to defaults.
    if (!result.ok && ["timeout", "network_error", "empty_response"].includes(result.error)) {
      setStatus("Tjenesten for innstillinger svarte ikke. Prøver igjen…", "warn");
      await new Promise(resolve => setTimeout(resolve, 800));
      result = await loadConfigJSONP({}, 16000);
    }

    if (!result.ok) {
      return {
        ok: false,
        error: result.error || "read_failed",
        message: result.message || "Kunne ikke lese innstillingene."
      };
    }

    const payload = result.payload || {};

    if (payload.ok === false) {
      return {
        ok: false,
        error: payload.error || "read_failed",
        message: payload.message || "Kunne ikke lese innstillingene."
      };
    }

    const cfg = normalizeCfg(payload);
    if (isMeaningfulCfg(cfg)) {
      setUiConfig(cfg);
      return { ok: true, config: normalizeCfg(cfg) };
    }

    return {
      ok: false,
      error: "empty_config",
      message: "Tjenesten returnerte ingen gyldige innstillinger."
    };
  }


  // Submit the passkey in a POST body, not a query-string URL.
  function submitConfigPost(cfg, key) {
    const name = "__config_post_" + Math.random().toString(36).slice(2);
    const frame = document.createElement("iframe");
    frame.name = name;
    frame.title = "Svar fra oppdatering av innstillinger";
    frame.hidden = true;
    frame.referrerPolicy = "no-referrer";
    const form = document.createElement("form");
    form.action = CONFIG_SERVICE_URL;
    form.method = "POST";
    form.enctype = "application/x-www-form-urlencoded";
    form.target = name;
    form.style.display = "none";
    const params = {
      key,
      posterSeconds: String(cfg.posterSeconds),
      calendarSlideSecondsByPage: JSON.stringify(cfg.calendarSlideSecondsByPage),
      enturSlideSecondsByPage: JSON.stringify(cfg.enturSlideSecondsByPage),
      videoEnabledByPage: JSON.stringify(cfg.videoEnabledByPage),
      fadeMs: String(cfg.fadeMs),
      manifestRefreshSeconds: String(cfg.manifestRefreshSeconds)
    };
    for (const [fieldName, value] of Object.entries(params)) {
      const input = document.createElement("input");
      input.type = "hidden";
      input.name = fieldName;
      input.value = value;
      form.appendChild(input);
    }
    document.body.appendChild(frame);
    document.body.appendChild(form);
    try {
      form.submit();
    } finally {
      setTimeout(() => form.remove(), 1200);
      setTimeout(() => frame.remove(), 30000);
    }
  }

  async function verifyConfigPost(cfg) {
    let lastRead = null;
    for (let attempt = 0; attempt < 6; attempt++) {
      await new Promise(resolve => setTimeout(resolve, attempt === 0 ? 1500 : 1100));
      lastRead = await reloadConfig();
      if (lastRead.ok && configsMatch(cfg, lastRead.config)) return { ok: true, read: lastRead };
    }
    return { ok: false, read: lastRead };
  }


  async function applyConfig() {
    const key = (els.updateKey.value || "").trim();
    if (!key) {
      setStatus("Tilgangsnøkkel må fylles ut.", "bad");
      
      return;
    }
    const cfg = readUiConfig();
    setStatus("Lagrer innstillingene via HTTPS POST…", "warn");
    
    try {
      submitConfigPost(cfg, key);
    } catch (error) {
      els.updateKey.value = "";
      setStatus("Kunne ikke sende forespørselen om å lagre innstillingene.", "bad");
      
      return;
    }
    els.updateKey.value = "";
    const result = await verifyConfigPost(cfg);
    if (!result.ok) {
      setStatus("Kunne ikke bekrefte at endringene ble lagret. Kontroller Apps Script og prøv igjen.", "warn");
      
      return;
    }
    setUiConfig(result.read.config);
    await renderCounts();
    setStatus("Innstillingene er lagret.", "ok");
    
  }

  function preload(url) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(true);
      img.onerror = () => resolve(false);
      const u = new URL(url, location.href);
      u.searchParams.set("v", String(Date.now()));
      img.src = u.href;
    });
  }

  async function initBackground() {
    const repo = location.pathname.split("/")[1] || "";
    const candidates = [
      new URL(BG_REL, location.href).href,
      new URL("/" + repo + "/assets/status-bg.jpg", location.origin).href,
      new URL("/assets/status-bg.jpg", location.origin).href
    ];

    for (const c of candidates) {
      if (await preload(c)) {
        const u = new URL(c);
        u.searchParams.set("v", "1");
        els.bgLayer.style.backgroundImage = `url("${u.href}")`;
        return;
      }
    }
  }

  els.applyBtn.addEventListener("click", applyConfig);
  window.addEventListener("beforeunload", () => { els.updateKey.value = ""; });

  els.posterSeconds.addEventListener("input", renderCounts);
  els.tbody.addEventListener("change", event => {
    const input = event.target.closest("input.entur-seconds, input.calendar-seconds, input.video-enabled");
    if (!input) return;
    if (input.classList.contains("video-enabled")) {
      if (!VIDEO_PAGES.includes(input.dataset.page)) return;
      videoEnabledDraft[input.dataset.page] = input.checked;
      renderCounts();
      return;
    }
    if (!SCREEN_PAGES.includes(input.dataset.page)) return;
    const value = Math.max(0, Math.min(3600, Math.round(safeNumber(input.value) ?? 0)));
    if (input.classList.contains("calendar-seconds")) calendarSecondsDraft[input.dataset.page] = value;
    else enturSecondsDraft[input.dataset.page] = value;
    renderCounts();
  });

  (async () => {
    disableUi(true);
    setStatus("Laster innstillinger…", "warn");
    

    els.updateKey.value = "";
    initBackground();

    const loaded = await reloadConfig();

    if (!loaded.ok) {
      els.posterSeconds.value = DEFAULTS.posterSeconds;
      calendarSecondsDraft = { ...DEFAULTS.calendarSlideSecondsByPage };
      enturSecondsDraft = { ...DEFAULTS.enturSlideSecondsByPage };
      videoEnabledDraft = { ...DEFAULTS.videoEnabledByPage };
      els.fadeMs.value = DEFAULTS.fadeMs;
      els.refreshSeconds.value = DEFAULTS.manifestRefreshSeconds;

      setStatus("Kunne ikke laste lagrede innstillinger. Oppdater siden. Lagring er deaktivert for å beskytte innstillingene.", "bad");
      
    } else {
      setStatus("Innstillingene er lastet inn.", "ok");
      
    }

    disableUi(false);
    // Never let placeholder defaults overwrite saved settings when the read failed.
    if (!loaded.ok) els.applyBtn.disabled = true;
    await renderCounts();
  })();
})();
