
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
    manifestRefreshSeconds: 60,
    arrangementsLandscapeFilmSchedule: {enabled:false,windows:[],weekly:[]}
  };

  const SCREEN_PAGES = ["films-portrait.html","films-landscape.html","arrangements-portrait.html","arrangements-landscape.html","portrait-all.html","landscape-all.html"];
  let enturSecondsDraft = { ...DEFAULTS.enturSlideSecondsByPage };
  let calendarSecondsDraft = { ...DEFAULTS.calendarSlideSecondsByPage };
  const VIDEO_PAGES = ["films-landscape.html","arrangements-landscape.html"];
  let videoEnabledDraft = { ...DEFAULTS.videoEnabledByPage };
  let scheduleSupported = false;

  const els = {
    posterSeconds: document.getElementById("posterSeconds"),

    fadeMs: document.getElementById("fadeMs"),
    refreshSeconds: document.getElementById("refreshSeconds"),
    updateKey: document.getElementById("updateKey"),
    applyBtn: document.getElementById("applyBtn"),
    tbody: document.getElementById("tbody"),
    statusBox: document.getElementById("statusBox"),
    bgLayer: document.getElementById("bgLayer"),
    scheduleEnabled: document.getElementById("scheduleEnabled"),
    scheduleWindows: document.getElementById("scheduleWindows"),
    scheduleWeekly: document.getElementById("scheduleWeekly"),
    scheduleAddWindow: document.getElementById("scheduleAddWindow"),
    scheduleAddWeekly: document.getElementById("scheduleAddWeekly"),
    scheduleSupport: document.getElementById("scheduleSupport")
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
    document.querySelectorAll("#arrangementsFilmScheduler input, #arrangementsFilmScheduler button")
      .forEach(input => { input.disabled = disabled || !scheduleSupported; });
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
    if (!r.ok) throw new Error(`${r.status} ${r.statusText} for ${url}`);
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

  const WEEKDAYS = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
  const OSLO_CLOCK = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Oslo", year:"numeric", month:"2-digit", day:"2-digit",
    hour:"2-digit", minute:"2-digit", hourCycle:"h23"
  });
  function osloLocalMinute() {
    const p = Object.fromEntries(OSLO_CLOCK.formatToParts(new Date())
      .filter(part => part.type !== "literal").map(part => [part.type,part.value]));
    return p.year + "-" + p.month + "-" + p.day + "T" + p.hour + ":" + p.minute;
  }
  function normalizeSchedule(raw) {
    const cfg = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
    const now = osloLocalMinute();
    const windows = (Array.isArray(cfg.windows) ? cfg.windows : []).slice(0,24)
      .map(w => ({ start: String(w?.start || ""), end: String(w?.end || "") }))
      .filter(w => !w.end || w.end > now);
    const weekly = (Array.isArray(cfg.weekly) ? cfg.weekly : []).slice(0,16).map(w => ({
      days: (Array.isArray(w?.days) ? w.days : []).map(Number)
        .filter(n => Number.isInteger(n) && n>=1 && n<=7).sort((a,b) => a-b),
      start:String(w?.start || ""), end:String(w?.end || "")
    }));
    return { enabled: cfg.enabled === true && (windows.length > 0 || weekly.length > 0),
      windows, weekly };
  }
  function removeExpiredWindowRows() {
    const now = osloLocalMinute();
    for (const row of Array.from(els.scheduleWindows.children)) {
      const start = row.querySelector(".windowStart")?.value || "";
      const end = row.querySelector(".windowEnd")?.value || "";
      if (start && end && start < end && end <= now) row.remove();
    }
    if (!els.scheduleWindows.children.length && !els.scheduleWeekly.children.length) {
      els.scheduleEnabled.checked = false;
    }
  }
  function addWindowRow(start = "", end = "") {
    if (els.scheduleWindows.children.length >= 24) return;
    const row = document.createElement("div");
    row.className = "scheduleEntry";
    row.innerHTML = '<label>From <input type="datetime-local" class="windowStart"></label>' +
      '<label>Until <input type="datetime-local" class="windowEnd"></label>' +
      '<button type="button" class="removeSchedule">Remove</button>';
    row.querySelector(".windowStart").value = start;
    row.querySelector(".windowEnd").value = end;
    els.scheduleWindows.appendChild(row);
  }
  function addWeeklyRow(days = [], start = "17:00", end = "22:00") {
    if (els.scheduleWeekly.children.length >= 16) return;
    const row = document.createElement("div");
    row.className = "scheduleEntry";
    const daysContainer = document.createElement("div");
    daysContainer.className = "weekDays";
    WEEKDAYS.forEach((day,i) => {
      const label = document.createElement("label");
      const input = document.createElement("input");
      input.type = "checkbox";
      input.className = "weekday";
      input.value = String(i+1);
      input.checked = days.includes(i+1);
      label.appendChild(input);
      label.appendChild(document.createTextNode(day));
      daysContainer.appendChild(label);
    });
    const wrap = document.createElement("div");
    const heading = document.createElement("div");
    heading.textContent = "Days";
    heading.className = "muted small";
    wrap.append(heading, daysContainer);
    row.appendChild(wrap);
    const from = document.createElement("label");
    from.textContent = "From ";
    const fromInput = document.createElement("input");
    fromInput.type = "time";
    fromInput.className = "weeklyStart";
    fromInput.value = start;
    from.appendChild(fromInput);
    const until = document.createElement("label");
    until.textContent = "Until ";
    const untilInput = document.createElement("input");
    untilInput.type = "time";
    untilInput.className = "weeklyEnd";
    untilInput.value = end;
    until.appendChild(untilInput);
    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "Remove";
    remove.className = "removeSchedule";
    row.append(from, until, remove);
    els.scheduleWeekly.appendChild(row);
  }
  function setScheduleUi(raw) {
    const cfg = normalizeSchedule(raw);
    els.scheduleEnabled.checked = cfg.enabled;
    els.scheduleWindows.replaceChildren();
    els.scheduleWeekly.replaceChildren();
    cfg.windows.forEach(w => addWindowRow(w.start,w.end));
    cfg.weekly.forEach(w => addWeeklyRow(w.days,w.start,w.end));
  }
  function readScheduleUi() {
    removeExpiredWindowRows();
    const windows = Array.from(els.scheduleWindows.children).map(row => ({
      start:row.querySelector(".windowStart").value,
      end:row.querySelector(".windowEnd").value
    }));
    const weekly = Array.from(els.scheduleWeekly.children).map(row => ({
      days:Array.from(row.querySelectorAll(".weekday:checked")).map(ch => Number(ch.value)),
      start:row.querySelector(".weeklyStart").value,
      end:row.querySelector(".weeklyEnd").value
    }));
    for (const w of windows) {
      if (!w.start || !w.end || w.start >= w.end) {
        throw new Error("Each date/time window must have an end after its start.");
      }
    }
    for (const w of weekly) {
      if (!w.days.length || !w.start || !w.end || w.start === w.end) {
        throw new Error("Each weekly row needs weekdays and different start/end times.");
      }
    }
    if (els.scheduleEnabled.checked && !windows.length && !weekly.length) {
      throw new Error("Add a date/time or weekly rule before enabling the Films schedule.");
    }
    return { enabled: els.scheduleEnabled.checked, windows, weekly };
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
      VIDEO_PAGES.every(page => videoA[page] === videoB[page]) &&
      (!scheduleSupported || JSON.stringify(normalizeSchedule(a.arrangementsLandscapeFilmSchedule)) ===
        JSON.stringify(normalizeSchedule(b.arrangementsLandscapeFilmSchedule)));
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
        message: "Could not load config service."
      });

      s.onload = () => {
        setTimeout(() => {
          if (!finished && !called) {
            finish({
              ok: false,
              error: "empty_response",
              message: "Config service returned no callback payload."
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
            message: "Config service request timed out."
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
    scheduleSupported = Object.prototype.hasOwnProperty.call(cfg, "arrangementsLandscapeFilmSchedule");
    setScheduleUi(cfg.arrangementsLandscapeFilmSchedule || DEFAULTS.arrangementsLandscapeFilmSchedule);
    els.scheduleSupport.textContent = scheduleSupported
      ? "Schedule settings are supported by the deployed configuration service."
      : "Deploy the updated Google Apps Script to enable scheduling.";
    document.querySelectorAll("#arrangementsFilmScheduler input, #arrangementsFilmScheduler button")
      .forEach(input => { input.disabled = !scheduleSupported; });
    if (cfg.fadeMs != null) els.fadeMs.value = cfg.fadeMs;
    if (refresh != null) els.refreshSeconds.value = refresh;
  }

  function readUiConfig() {
    return {
      posterSeconds: Math.max(1, safeNumber(els.posterSeconds.value) ?? DEFAULTS.posterSeconds),
      calendarSlideSecondsByPage: normalizeDurationMap(calendarSecondsDraft),
      enturSlideSecondsByPage: normalizeDurationMap(enturSecondsDraft),
      videoEnabledByPage: normalizeVideoMap(videoEnabledDraft),
      arrangementsLandscapeFilmSchedule: scheduleSupported ? readScheduleUi()
        : DEFAULTS.arrangementsLandscapeFilmSchedule,
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
  function formatCountBreakdown(row) {
    const posterCount = row.imageCount;
    const videoCount = row.videoCount;
    const calendarCount = row.calendar > 0 ? 1 : 0;
    const enturCount = row.entur > 0 ? 1 : 0;
    return posterCount + " posters/images · " + videoCount + " videos · " +
      calendarCount + " Calendar · " + enturCount + " Entur Tavla";
  }
  async function renderCounts() {
    const posterSeconds = Math.max(1, safeNumber(els.posterSeconds.value) ?? DEFAULTS.posterSeconds);
    const calendarMap = normalizeDurationMap(calendarSecondsDraft);
    const calendarFor = page => calendarMap[page] || 0;
    const enturMap = normalizeDurationMap(enturSecondsDraft);
    const enturFor = page => enturMap[page] || 0;

    els.tbody.innerHTML = `<tr><td colspan="7" class="muted">Loading…</td></tr>`;

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
        { page:"films-portrait.html", desc:"DX film posters (portrait)", imageCount:filmsPortrait },
        { page:"films-landscape.html", desc:`DX film posters + ${extraLandscape} OneDrive image(s) — landscape_extra_films`, imageCount:filmsLandscapeImageCount },
        { page:"arrangements-portrait.html", desc:"DX arrangement posters (portrait)", imageCount:arrPortrait },
        { page:"arrangements-landscape.html", desc:`DX arrangement posters + ${extraArrLandscape} OneDrive image(s) — landscape_extra_arrangements`, imageCount:arrangementsLandscapeImageCount },
        { page:"portrait-all.html", desc:"DX films + arrangements (portrait)", imageCount:portraitAll },
        { page:"landscape-all.html", desc:`DX films + arrangements, plus ${extraLandscape + extraArrLandscape} OneDrive image(s) (both landscape folders)`, imageCount:landscapeAll }
      ];
      rows.forEach(row => {
        row.videoCount = row.page === "films-landscape.html" ? (videoEnabledDraft["films-landscape.html"] ? filmVideos : 0) :
          row.page === "arrangements-landscape.html" ? (videoEnabledDraft["arrangements-landscape.html"] ? arrangementVideos : 0) :
          row.page === "landscape-all.html" ? ((videoEnabledDraft["films-landscape.html"] ? filmVideos : 0) +
            (videoEnabledDraft["arrangements-landscape.html"] ? arrangementVideos : 0)) : 0;
        row.calendar = calendarFor(row.page);
        row.entur = enturFor(row.page);
        if (row.calendar > 0) row.desc += " + Calendar";
        if (row.entur > 0) row.desc += " + Entur Tavla";
        row.count = row.imageCount + row.videoCount + (row.calendar > 0 ? 1 : 0) + (row.entur > 0 ? 1 : 0);
        row.seconds = row.imageCount * posterSeconds + row.calendar + row.entur;
      });

      els.tbody.innerHTML = rows.map(r => `
        <tr>
          <td>${pill("ok","ok")} <a href="./${r.page}" target="_blank" rel="noopener noreferrer">${r.page}</a></td>
          <td class="muted">${r.desc}</td>
          <td class="right">${SCREEN_PAGES.includes(r.page) ?
            '<input class="calendar-seconds" type="number" min="0" max="3600" step="1" data-page="' +
            r.page + '" value="' + r.calendar + '" aria-label="Calendar seconds for ' + r.page + '">' : "—"}</td>
          <td class="right">${SCREEN_PAGES.includes(r.page) ?
            '<input class="entur-seconds" type="number" min="0" max="3600" step="1" data-page="' +
            r.page + '" value="' + r.entur + '" aria-label="Entur Tavla seconds for ' + r.page + '">' : "—"}</td>
          <td class="right">${VIDEO_PAGES.includes(r.page) ?
            '<input type="checkbox" class="video-enabled" data-page="' + r.page + '" ' +
            (videoEnabledDraft[r.page] ? 'checked' : '') + ' aria-label="Muted video for ' + r.page + '">' :
            (r.page === "landscape-all.html" ? "Follows sources" : "—")}</td>
          <td class="right"><div class="mono countTotal">${r.count}</div>
            <div class="countBreakdown">(${formatCountBreakdown(r)})</div></td>
          <td class="right mono">${fmtDuration(r.seconds)}${r.videoCount ? " + video runtime" : ""}</td>
        </tr>
      `).join("");

    } catch (e) {
      els.tbody.innerHTML = `<tr><td colspan="7">${pill("ERROR","bad")} <span class="mono">${escapeHtml(String(e.message || e))}</span></td></tr>`;
    }
  }

  async function reloadConfig() {
    let result = await loadConfigJSONP({}, 16000);

    // Apps Script can take longer to start just after a new deployment.
    // Retry one failed read before falling back to defaults.
    if (!result.ok && ["timeout", "network_error", "empty_response"].includes(result.error)) {
      setStatus("Config service did not respond. Retrying…", "warn");
      await new Promise(resolve => setTimeout(resolve, 800));
      result = await loadConfigJSONP({}, 16000);
    }

    if (!result.ok) {
      return {
        ok: false,
        error: result.error || "read_failed",
        message: result.message || "Config read failed."
      };
    }

    const payload = result.payload || {};

    if (payload.ok === false) {
      return {
        ok: false,
        error: payload.error || "read_failed",
        message: payload.message || "Config read failed."
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
      message: "Config service returned no usable config."
    };
  }


  // Submit the passkey in a POST body, not a query-string URL.
  function submitConfigPost(cfg, key) {
    const name = "__config_post_" + Math.random().toString(36).slice(2);
    const frame = document.createElement("iframe");
    frame.name = name;
    frame.title = "Configuration update response";
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
    if (scheduleSupported) {
      params.arrangementsLandscapeFilmSchedule = JSON.stringify(cfg.arrangementsLandscapeFilmSchedule);
    }
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
      setStatus("Update key is required.", "bad");
      
      return;
    }
    let cfg;
    try { cfg = readUiConfig(); }
    catch (err) {
      setStatus(String(err.message || err), "bad");
      return;
    }
    setStatus("Applying configuration using HTTPS POST…", "warn");
    
    try {
      submitConfigPost(cfg, key);
    } catch (error) {
      els.updateKey.value = "";
      setStatus("Configuration request could not be submitted.", "bad");
      
      return;
    }
    els.updateKey.value = "";
    const result = await verifyConfigPost(cfg);
    if (!result.ok) {
      setStatus("Update could not be verified. Check Apps Script deployment and retry.", "warn");
      
      return;
    }
    setUiConfig(result.read.config);
    await renderCounts();
    setStatus("Applied successfully.", "ok");
    
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

  els.scheduleAddWindow.addEventListener("click", () => addWindowRow());
  els.scheduleAddWeekly.addEventListener("click", () => addWeeklyRow());
  // Remove expired one-time entries even when Status stays open all day.
  setInterval(removeExpiredWindowRows, 60 * 1000);
  document.getElementById("arrangementsFilmScheduler").addEventListener("click", event => {
    const remove = event.target.closest("button.removeSchedule");
    if (remove) remove.closest(".scheduleEntry")?.remove();
  });
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
    setStatus("Loading config…", "warn");
    

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

      setStatus("Could not load saved settings. Refresh the page; Apply is disabled to protect your settings.", "bad");
      
    } else {
      setStatus("Config loaded.", "ok");
      
    }

    disableUi(false);
    // Never let placeholder defaults overwrite saved settings when the read failed.
    if (!loaded.ok) els.applyBtn.disabled = true;
    await renderCounts();
  })();
})();
