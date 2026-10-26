/**
 * InfoskjermenConfigService
 * Compatible JSONP API for status.html and the two landscape screens.
 * This is a prepared replacement: compare with the live Apps Script before deploying.
 *
 * Script Properties:
 *   UPDATE_KEY : existing control-page update password (must be set).
 *   INFOSKJERMEN_CONFIG : managed JSON config, created automatically on first update.
 *
 * IMPORTANT: The existing page sends the update key by GET/JSONP for compatibility.
 * Do not print or share this key. Limit deployment access appropriately.
 */

var INFOSKJERMEN_DEFAULTS_ = {
  posterSeconds: 7,
  calendarSlideSeconds: 20,
  enturSlideEnabled: false,
  enturSlideSeconds: 20,
  enturSlideUrl: "",
  fadeMs: 500,
  manifestRefreshSeconds: 60
};

function doGet(e) {
  var args = (e && e.parameter) || {};
  var callback = args.callback || "";
  try {
    var response;
    if (String(args.action || "") === "update") {
      response = updateInfoskjermenConfig_(args);
    } else {
      response = { ok: true, config: readInfoskjermenConfig_() };
    }
    return outputJsonp_(response, callback);
  } catch (err) {
    return outputJsonp_({ ok: false, error: "server_error", message: String(err.message || err) }, callback);
  }
}

function readInfoskjermenConfig_() {
  var props = PropertiesService.getScriptProperties();
  var all = props.getProperties();
  var cfg = {};
  // Try common legacy JSON-property names before independent fields.
  ["CONFIG", "CONFIG_JSON", "SCREEN_CONFIG", "INFOSKJERMEN_CONFIG"].forEach(function (name) {
    try {
      if (all[name]) {
        var parsed = JSON.parse(all[name]);
        var inner = parsed && (parsed.config || parsed.data || parsed);
        if (inner && typeof inner === "object") Object.assign(cfg, inner);
      }
    } catch (ignore) {}
  });
  Object.keys(INFOSKJERMEN_DEFAULTS_).forEach(function (name) {
    if (cfg[name] == null && all[name] != null) cfg[name] = all[name];
  });
  if (cfg.manifestRefreshSeconds == null && all.refreshSeconds != null) {
    cfg.manifestRefreshSeconds = all.refreshSeconds;
  }
  return {
    posterSeconds: limitNumber_(cfg.posterSeconds, 1, 3600, 7),
    calendarSlideSeconds: limitNumber_(cfg.calendarSlideSeconds, 0, 3600, 20),
    enturSlideEnabled: asBoolean_(cfg.enturSlideEnabled),
    enturSlideSeconds: limitNumber_(cfg.enturSlideSeconds, 1, 3600, 20),
    enturSlideUrl: typeof cfg.enturSlideUrl === "string" ? cfg.enturSlideUrl : "",
    fadeMs: limitNumber_(cfg.fadeMs, 0, 10000, 500),
    manifestRefreshSeconds: limitNumber_(cfg.manifestRefreshSeconds, 30, 86400, 60)
  };
}

function updateInfoskjermenConfig_(args) {
  var props = PropertiesService.getScriptProperties();
  var expectedKey = props.getProperty("UPDATE_KEY") ||
                    props.getProperty("CONFIG_UPDATE_KEY") ||
                    props.getProperty("ADMIN_KEY");
  if (!expectedKey || String(args.key || "") !== expectedKey) {
    return { ok: false, error: "unauthorized" };
  }
  var lock = LockService.getScriptLock();
  lock.waitLock(5000);
  try {
    var cfg = readInfoskjermenConfig_();
    if (args.posterSeconds != null) cfg.posterSeconds = limitNumber_(args.posterSeconds, 1, 3600, cfg.posterSeconds);
    if (args.calendarSlideSeconds != null) cfg.calendarSlideSeconds = limitNumber_(args.calendarSlideSeconds, 0, 3600, cfg.calendarSlideSeconds);
    if (args.enturSlideEnabled != null) cfg.enturSlideEnabled = asBoolean_(args.enturSlideEnabled);
    if (args.enturSlideSeconds != null) cfg.enturSlideSeconds = limitNumber_(args.enturSlideSeconds, 1, 3600, cfg.enturSlideSeconds);
    if (args.enturSlideUrl != null) cfg.enturSlideUrl = String(args.enturSlideUrl).trim();
    if (args.fadeMs != null) cfg.fadeMs = limitNumber_(args.fadeMs, 0, 10000, cfg.fadeMs);
    var refresh = args.manifestRefreshSeconds != null ? args.manifestRefreshSeconds : args.refreshSeconds;
    if (refresh != null) cfg.manifestRefreshSeconds = limitNumber_(refresh, 30, 86400, cfg.manifestRefreshSeconds);
    if (cfg.enturSlideUrl && !/^https:\/\/[^ ]+$/i.test(cfg.enturSlideUrl)) {
      return { ok: false, error: "invalid_entur_url", message: "Entur URL must start with https://" };
    }
    if (cfg.enturSlideEnabled && !cfg.enturSlideUrl) {
      return { ok: false, error: "missing_entur_url" };
    }
    props.setProperty("INFOSKJERMEN_CONFIG", JSON.stringify(cfg));
    return { ok: true, config: cfg };
  } finally {
    lock.releaseLock();
  }
}

function limitNumber_(value, low, high, fallback) {
  if (value == null || String(value).trim() === "") return fallback;
  var n = Number(value);
  return isFinite(n) && n >= low && n <= high ? n : fallback;
}

function asBoolean_(value) {
  return value === true || value === 1 || value === "1" || value === "true";
}

function outputJsonp_(payload, callback) {
  var json = JSON.stringify(payload);
  // The public pages use __cfgcb_... JSONP callbacks.
  if (callback && /^[A-Za-z_$][A-Za-z0-9_$]{0,100}$/.test(callback)) {
    return ContentService.createTextOutput(callback + "(" + json + ");")
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(json)
    .setMimeType(ContentService.MimeType.JSON);
}
