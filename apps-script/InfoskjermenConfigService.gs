const VERSION_TAG = "display-config-2026-10-26-entur-v2";

const DEFAULTS = {
  posterSeconds: 7,
  calendarSlideSeconds: 20,   // 0 = off
  enturSlideEnabled: false,  // Entur Tavla off until explicitly enabled
  enturSlideSeconds: 20,
  enturSlideUrl: "",
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

    enturSlideEnabled: parseBoolean_(cfg.enturSlideEnabled),

    enturSlideSeconds: clampInt(
      cfg.enturSlideSeconds,
      1,
      3600,
      DEFAULTS.enturSlideSeconds
    ),

    enturSlideUrl: String(cfg.enturSlideUrl || "").trim(),

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

  if (Object.prototype.hasOwnProperty.call(params, "enturSlideEnabled")) {
    incoming.enturSlideEnabled = parseBoolean_(params.enturSlideEnabled);
  }

  if (Object.prototype.hasOwnProperty.call(params, "enturSlideSeconds")) {
    incoming.enturSlideSeconds = Number(params.enturSlideSeconds);
  }

  if (Object.prototype.hasOwnProperty.call(params, "enturSlideUrl")) {
    incoming.enturSlideUrl = String(params.enturSlideUrl || "").trim();
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
  const preview = normalizeConfig_(Object.assign({}, getConfig_(), incoming));

  if (preview.enturSlideEnabled && !/^https:\/\/\S+$/i.test(preview.enturSlideUrl)) {
    return {
      ok: false,
      error: "invalid_entur_url",
      message: "Entur Tavla must have a public HTTPS display URL.",
      version: VERSION_TAG
    };
  }

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
    enturSlideEnabled: "false",
    enturSlideSeconds: "20",
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
