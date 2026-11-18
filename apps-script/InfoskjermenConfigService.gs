const VERSION_TAG = "display-config-2026-11-18-expired-window-cleanup-v8";

const SCREEN_PAGES = ["films-portrait.html","films-landscape.html","arrangements-portrait.html","arrangements-landscape.html","portrait-all.html","landscape-all.html"];
const VIDEO_PAGES = ["films-landscape.html","arrangements-landscape.html","kafe_sandbeck.html","bibliotek.html"];
const DEFAULTS = {
  posterSeconds: 7,
  calendarSlideSeconds: 20,   // 0 = off
  calendarSlideSecondsByPage: {"films-portrait.html":0,"films-landscape.html":20,"arrangements-portrait.html":0,"arrangements-landscape.html":20,"portrait-all.html":0,"landscape-all.html":0},
  enturSlideSecondsByPage: {"films-portrait.html":0,"films-landscape.html":0,"arrangements-portrait.html":0,"arrangements-landscape.html":0,"portrait-all.html":0,"landscape-all.html":0},
  videoEnabledByPage: {"films-landscape.html":false,"arrangements-landscape.html":false,"kafe_sandbeck.html":false,"bibliotek.html":false},
  fadeMs: 500,
  manifestRefreshSeconds: 60,
  arrangementsLandscapeFilmSchedule: { enabled: false, windows: [], weekly: [] }
};

function getScriptProps_() {
  return PropertiesService.getScriptProperties();
}

function getUpdateKey_() {
  return String(getScriptProps_().getProperty("UPDATE_KEY") || "").trim();
}

function clampInt(v, min, max, fallback) {
  v = Number(v);
  if (!isFinite(v)) v = fallback;
  if (!isFinite(v)) v = min;
  v = Math.round(v);
  return Math.min(max, Math.max(min, v));
}

function parseBoolean_(value) {
  return value === true || value === 1 ||
    String(value).toLowerCase() === "true" || String(value) === "1";
}

function normalizeDurationPages_(raw, fallbacks) {
  const pages = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const defaults = fallbacks || {};
  const result = {};
  SCREEN_PAGES.forEach(function(page) {
    result[page] = clampInt(pages[page], 0, 3600, Number(defaults[page]) || 0);
  });
  return result;
}

function normalizeVideoPages_(raw) {
  const value = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const result = {};
  VIDEO_PAGES.forEach(function(page) { result[page] = parseBoolean_(value[page]); });
  return result;
}


/**
 * Norway-local schedule values; datetime strings are local wall-clock times
 * (YYYY-MM-DDTHH:mm) rather than UTC timestamps.
 * One-off windows: [start,end). Weekly rules allow crossing midnight.
 */
function validLocalDateTime_(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return false;
  const y = Number(value.slice(0,4));
  const m = Number(value.slice(5,7));
  const d = Number(value.slice(8,10));
  const h = Number(value.slice(11,13));
  const min = Number(value.slice(14,16));
  const date = new Date(Date.UTC(y,m-1,d));
  return y >= 2020 && y <= 2100 && m >= 1 && m <= 12 && h <= 23 && min <= 59 &&
    date.getUTCFullYear() === y && date.getUTCMonth() === m-1 && date.getUTCDate() === d;
}
function validClockTime_(value) {
  return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}
function osloLocalDateTimeNow_() {
  return Utilities.formatDate(new Date(), "Europe/Oslo", "yyyy-MM-dd'T'HH:mm");
}
function normalizeArrangementsFilmSchedule_(raw) {
  const cfg = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const windows = Array.isArray(cfg.windows) ? cfg.windows : [];
  const weekly = Array.isArray(cfg.weekly) ? cfg.weekly : [];
  const nowOslo = osloLocalDateTimeNow_();
  const activeWindows = windows.slice(0,24).filter(function(w) {
    return w && validLocalDateTime_(w.start) && validLocalDateTime_(w.end) &&
      w.start < w.end && w.end > nowOslo;
  }).map(function(w) { return {start:w.start, end:w.end}; });
  const weeklyRules = weekly.slice(0,16).filter(function(w) {
      return w && Array.isArray(w.days) && validClockTime_(w.start) &&
        validClockTime_(w.end) && w.start !== w.end &&
        w.days.some(function(d){ return Number.isInteger(Number(d)) && Number(d) >= 1 && Number(d) <= 7; });
    }).map(function(w) {
      const days = w.days.map(Number).filter(function(d) {
        return Number.isInteger(d) && d >= 1 && d <= 7;
      });
      return {days:Array.from(new Set(days)).sort(function(a,b){ return a-b; }), start:w.start, end:w.end};
    });
  return {
    enabled: parseBoolean_(cfg.enabled) && (activeWindows.length > 0 || weeklyRules.length > 0),
    windows: activeWindows,
    weekly: weeklyRules
  };
}

function normalizeConfig_(cfg) {
  cfg = cfg || {};

  return {
    posterSeconds: clampInt(
      cfg.posterSeconds,
      1,
      60,
      DEFAULTS.posterSeconds
    ),

    calendarSlideSeconds: clampInt(
      cfg.calendarSlideSeconds,
      0,
      3600,
      DEFAULTS.calendarSlideSeconds
    ),

    // When upgrading from the old global calendar setting, retain its value
    // for the two screens which already showed the calendar.
    calendarSlideSecondsByPage: normalizeDurationPages_(cfg.calendarSlideSecondsByPage, {
      "films-landscape.html": clampInt(cfg.calendarSlideSeconds, 0, 3600, DEFAULTS.calendarSlideSeconds),
      "arrangements-landscape.html": clampInt(cfg.calendarSlideSeconds, 0, 3600, DEFAULTS.calendarSlideSeconds)
    }),

    enturSlideSecondsByPage: normalizeDurationPages_(cfg.enturSlideSecondsByPage),
    videoEnabledByPage: normalizeVideoPages_(cfg.videoEnabledByPage),
    arrangementsLandscapeFilmSchedule: normalizeArrangementsFilmSchedule_(cfg.arrangementsLandscapeFilmSchedule),

    fadeMs: clampInt(
      cfg.fadeMs,
      0,
      5000,
      DEFAULTS.fadeMs
    ),

    manifestRefreshSeconds: clampInt(
      cfg.manifestRefreshSeconds,
      30,
      3600,
      DEFAULTS.manifestRefreshSeconds
    ),
  };
}

function getConfig_() {
  try {
    const raw = getScriptProps_().getProperty("DISPLAY_CONFIG");
    if (!raw) return normalizeConfig_({});
    return normalizeConfig_(JSON.parse(raw));
  } catch (err) {
    return normalizeConfig_({});
  }
}

function setConfig_(partialCfg) {
  const current = getConfig_();
  const merged = Object.assign({}, current, partialCfg || {});
  const cleaned = normalizeConfig_(merged);

  getScriptProps_().setProperty(
    "DISPLAY_CONFIG",
    JSON.stringify(cleaned)
  );

  return cleaned;
}

function parseFormBody_(body) {
  const params = {};
  if (!body) return params;

  body.split("&").forEach(function (pair) {
    if (!pair) return;

    const parts = pair.split("=");
    const rawKey = parts.shift();
    const rawVal = parts.join("=");

    if (!rawKey) return;

    const key = decodeURIComponent(String(rawKey).replace(/\+/g, " "));
    const val = decodeURIComponent(String(rawVal || "").replace(/\+/g, " "));

    params[key] = val;
  });

  return params;
}

function sanitizeCallback_(cb) {
  cb = String(cb || "").trim();
  return /^[A-Za-z_$][0-9A-Za-z_$\.]{0,100}$/.test(cb) ? cb : "";
}

function buildResponse_(obj, callback) {
  const text = JSON.stringify(obj);
  const cb = sanitizeCallback_(callback);

  if (cb) {
    return ContentService
      .createTextOutput(cb + "(" + text + ");")
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }

  return ContentService
    .createTextOutput(text)
    .setMimeType(ContentService.MimeType.JSON);
}

function incomingFromParams_(params) {
  const incoming = {};

  if (Object.prototype.hasOwnProperty.call(params, "posterSeconds")) {
    incoming.posterSeconds = Number(params.posterSeconds);
  }

  if (Object.prototype.hasOwnProperty.call(params, "calendarSlideSeconds")) {
    incoming.calendarSlideSeconds = Number(params.calendarSlideSeconds);
  }

  if (Object.prototype.hasOwnProperty.call(params, "calendarSlideSecondsByPage")) {
    incoming.calendarSlideSecondsByPage = JSON.parse(String(params.calendarSlideSecondsByPage));
    if (!incoming.calendarSlideSecondsByPage ||
        Array.isArray(incoming.calendarSlideSecondsByPage) ||
        typeof incoming.calendarSlideSecondsByPage !== "object") {
      throw new Error("calendarSlideSecondsByPage must be a JSON object.");
    }
  }

  if (Object.prototype.hasOwnProperty.call(params, "enturSlideSecondsByPage")) {
    incoming.enturSlideSecondsByPage = JSON.parse(String(params.enturSlideSecondsByPage));
    if (!incoming.enturSlideSecondsByPage ||
        Array.isArray(incoming.enturSlideSecondsByPage) ||
        typeof incoming.enturSlideSecondsByPage !== "object") {
      throw new Error("enturSlideSecondsByPage must be a JSON object.");
    }
  }

  if (Object.prototype.hasOwnProperty.call(params, "videoEnabledByPage")) {
    incoming.videoEnabledByPage = JSON.parse(String(params.videoEnabledByPage));
    if (!incoming.videoEnabledByPage || Array.isArray(incoming.videoEnabledByPage) ||
        typeof incoming.videoEnabledByPage !== "object") {
      throw new Error("videoEnabledByPage must be a JSON object.");
    }
  }

  if (Object.prototype.hasOwnProperty.call(params, "arrangementsLandscapeFilmSchedule")) {
    incoming.arrangementsLandscapeFilmSchedule = JSON.parse(String(params.arrangementsLandscapeFilmSchedule));
    if (!incoming.arrangementsLandscapeFilmSchedule ||
        typeof incoming.arrangementsLandscapeFilmSchedule !== "object" ||
        Array.isArray(incoming.arrangementsLandscapeFilmSchedule)) {
      throw new Error("arrangementsLandscapeFilmSchedule must be a JSON object.");
    }
  }

  if (Object.prototype.hasOwnProperty.call(params, "fadeMs")) {
    incoming.fadeMs = Number(params.fadeMs);
  }

  if (Object.prototype.hasOwnProperty.call(params, "manifestRefreshSeconds")) {
    incoming.manifestRefreshSeconds = Number(params.manifestRefreshSeconds);
  }

  return incoming;
}

function applyUpdateFromParams_(params) {
  const providedKey = String(params.key || "").trim();
  const expectedKey = getUpdateKey_();

  if (!expectedKey) {
    return {
      ok: false,
      error: "missing_server_key",
      message: "UPDATE_KEY is not set in Script Properties.",
      version: VERSION_TAG
    };
  }

  if (providedKey !== expectedKey) {
    return {
      ok: false,
      error: "unauthorized",
      message: "Incorrect update key.",
      version: VERSION_TAG
    };
  }

  const incoming = incomingFromParams_(params);
  const saved = setConfig_(incoming);

  return {
    ok: true,
    message: "Config updated.",
    version: VERSION_TAG,
    config: saved
  };
}

// Optional helper: reset property to defaults
function resetConfigFile_() {
  const config = normalizeConfig_(DEFAULTS);
  getScriptProps_().setProperty("DISPLAY_CONFIG", JSON.stringify(config));
  Logger.log("DISPLAY_CONFIG reset to: " + JSON.stringify(config));
}

// Optional helper: log current config
function testConfig_() {
  Logger.log(JSON.stringify({
    version: VERSION_TAG,
    config: getConfig_()
  }, null, 2));
}

// Optional helper: test update logic directly from editor
function testUpdateFlow_() {
  const result = applyUpdateFromParams_({
    key: getUpdateKey_(),
    posterSeconds: "8",
    calendarSlideSeconds: "20",
    fadeMs: "500",
    manifestRefreshSeconds: "60"
  });

  Logger.log(JSON.stringify(result, null, 2));
  Logger.log(JSON.stringify(getConfig_(), null, 2));
}

// GET:
// - default: read config
// - action=update: rejected; use doPost for configuration updates
// Supports JSONP through ?callback=fnName
function doGet(e) {
  const params = (e && e.parameter) ? e.parameter : {};
  const callback = params.callback || "";
  const action = String(params.action || "").toLowerCase();

  try {
    // Read-only GET: never authenticate or mutate state with query-string keys.
    if (action === "update") {
      return buildResponse_({
        ok: false,
        error: "method_not_allowed",
        message: "Use HTTPS POST to update configuration.",
        version: VERSION_TAG
      }, callback);
    }

    return buildResponse_({
      ok: true,
      version: VERSION_TAG,
      mode: "read",
      config: getConfig_()
    }, callback);

  } catch (err) {
    return buildResponse_({
      ok: false,
      error: "server_error",
      message: String((err && err.message) || err || "Unknown error"),
      version: VERSION_TAG
    }, callback);
  }
}

// POST:
// configuration changes require a URL-encoded POST body
function doPost(e) {
  try {
    const queryParams = (e && e.parameter) ? e.parameter : {};
    const body = (e && e.postData && e.postData.contents) ? e.postData.contents : "";
    const bodyParams = parseFormBody_(body);

    // Reject legacy POSTs that put the authentication key in the URL.
    if (!String(bodyParams.key || "").trim()) {
      return ContentService
        .createTextOutput(JSON.stringify({
          ok: false, error: "unauthorized",
          message: "An update key is required in the POST request body.",
          version: VERSION_TAG
        }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    const params = Object.assign({}, queryParams, bodyParams);
    const result = applyUpdateFromParams_(params);

    return ContentService
      .createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({
        ok: false,
        error: "server_error",
        message: String((err && err.message) || err || "Unknown error"),
        version: VERSION_TAG
      }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
// Routine maintenance
