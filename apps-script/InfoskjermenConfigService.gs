const VERSION_TAG = "display-config-2026-10-26-calendar-entur-per-page-v4";

const SCREEN_PAGES = ["films-portrait.html","films-landscape.html","arrangements-portrait.html","arrangements-landscape.html","portrait-all.html","landscape-all.html"];
const DEFAULTS = {
  posterSeconds: 7,
  calendarSlideSeconds: 20,   // 0 = off
  calendarSlideSecondsByPage: {"films-portrait.html":0,"films-landscape.html":20,"arrangements-portrait.html":0,"arrangements-landscape.html":20,"portrait-all.html":0,"landscape-all.html":0},
  enturSlideSecondsByPage: {"films-portrait.html":0,"films-landscape.html":0,"arrangements-portrait.html":0,"arrangements-landscape.html":0,"portrait-all.html":0,"landscape-all.html":0},
  fadeMs: 500,
  manifestRefreshSeconds: 60,
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
// - action=update: update config using query params
// Supports JSONP through ?callback=fnName
function doGet(e) {
  const params = (e && e.parameter) ? e.parameter : {};
  const callback = params.callback || "";
  const action = String(params.action || "").toLowerCase();

  try {
    if (action === "update") {
      return buildResponse_(applyUpdateFromParams_(params), callback);
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
// keeps compatibility with form posts to ?key=UPDATE_KEY
function doPost(e) {
  try {
    const queryParams = (e && e.parameter) ? e.parameter : {};
    const body = (e && e.postData && e.postData.contents) ? e.postData.contents : "";
    const bodyParams = parseFormBody_(body);

    const params = Object.assign({}, bodyParams, queryParams);
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
