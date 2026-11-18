/**
 * Arrangements Landscape -> Films Landscape scheduler.
 *
 * Configured from Status & Timing Control, stored in the existing Apps Script
 * DISPLAY_CONFIG. All dates and times are interpreted in Europe/Oslo (including DST).
 * The original Arrangements page remains open and resumes after a takeover.
 */
"use strict";
(() => {
  const CONFIG_SERVICE_URL =
    "https://script.google.com/macros/s/AKfycbwTw7_A4V68NbmGn2aFmo-r3ddEWvO9G9VcIf0pc4W_EaMhiVgCi4JV3jNIqtQTa9pqsA/exec";
  const CACHE_KEY = "infoskjermen:arrangements-film-schedule:v1";
  const CHECK_EVERY_MS = 5000;
  const UPDATE_EVERY_MS = 30000;
  const TIME_ZONE = "Europe/Oslo";
  const osloFormatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: TIME_ZONE, year:"numeric", month:"2-digit", day:"2-digit",
    hour:"2-digit", minute:"2-digit", hourCycle:"h23"
  });

  let schedule = {enabled:false, windows:[], weekly:[]};
  let takeover = null;
  let loading = false;

  function clock() {
    const parts = Object.fromEntries(osloFormatter.formatToParts(new Date())
      .filter(p => p.type !== "literal").map(p => [p.type, p.value]));
    const date = parts.year + "-" + parts.month + "-" + parts.day;
    const time = parts.hour + ":" + parts.minute;
    const weekday = new Date(Date.UTC(Number(parts.year), Number(parts.month)-1,
      Number(parts.day))).getUTCDay() || 7;
    const previousWeekday = weekday === 1 ? 7 : weekday - 1;
    return {dateTime:date + "T" + time, time, weekday, previousWeekday};
  }
  function validClockTime(value) {
    return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
  }
  function validDateTime(value) {
    if(typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))return false;
    const [y,m,d] = value.slice(0,10).split("-").map(Number);
    const date = new Date(Date.UTC(y,m-1,d));
    return date.getUTCFullYear()===y && date.getUTCMonth()===m-1 && date.getUTCDate()===d &&
      validClockTime(value.slice(11));
  }
  function normalize(raw) {
    const x = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
    return {
      enabled:x.enabled === true,
      windows:(Array.isArray(x.windows)?x.windows:[]).slice(0,24).filter(w=>
        w && validDateTime(w.start) && validDateTime(w.end) && w.start < w.end
      ).map(w=>({start:w.start,end:w.end})),
      weekly:(Array.isArray(x.weekly)?x.weekly:[]).slice(0,16).filter(w=>
        w && Array.isArray(w.days) && validClockTime(w.start) && validClockTime(w.end) &&
        w.start !== w.end
      ).map(w=>({
        days:w.days.map(Number).filter(d=>Number.isInteger(d)&&d>=1&&d<=7),
        start:w.start, end:w.end
      }))
    };
  }

  function isScheduled(now, cfg) {
    if (!cfg.enabled) return false;
    if (cfg.windows.some(w => now.dateTime >= w.start && now.dateTime < w.end)) return true;
    return cfg.weekly.some(rule => {
      const startsToday = rule.days.includes(now.weekday);
      if (rule.end > rule.start) {
        return startsToday && now.time >= rule.start && now.time < rule.end;
      }
      // Crossing midnight: e.g. Friday 20:00 -> Saturday 02:00
      return (startsToday && now.time >= rule.start) ||
        (rule.days.includes(now.previousWeekday) && now.time < rule.end);
    });
  }

  function showFilms() {
    if (takeover) return;
    window.ArrangementsFilmScheduleActive = true;
    const overlay = document.createElement("div");
    overlay.id = "arrangementsFilmsTakeover";
    Object.assign(overlay.style, {
      position:"fixed", inset:"0", width:"100%", height:"100%",
      background:"#000", zIndex:"99999"
    });
    const frame = document.createElement("iframe");
    frame.title = "Films shown on Arrangements Landscape by schedule";
    frame.setAttribute("allow", "autoplay");
    frame.referrerPolicy = "no-referrer";
    Object.assign(frame.style, {
      width:"100%", height:"100%", border:"0", display:"block", background:"#000"
    });
    frame.src = "./films-landscape.html?arrangementsTakeover=1";
    overlay.appendChild(frame);
    document.body.appendChild(overlay);
    takeover = overlay;
  }

  function showArrangements() {
    if (!takeover) return;
    takeover.remove();
    takeover = null;
    window.ArrangementsFilmScheduleActive = false;
  }
  function applySchedule() {
    if (isScheduled(clock(), schedule)) showFilms();
    else showArrangements();
  }

  function fetchJSONP() {
    return new Promise(resolve => {
      const callback = "__arrFilmSchedule_" + Math.random().toString(36).slice(2);
      const script = document.createElement("script");
      let done = false;
      const finish = data => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        script.remove();
        try { delete window[callback]; } catch { window[callback] = undefined; }
        resolve(data);
      };
      window[callback] = payload => finish(payload);
      script.onerror = () => finish(null);
      const timer = setTimeout(() => finish(null), 12000);
      script.src = CONFIG_SERVICE_URL + "?callback=" + encodeURIComponent(callback) +
        "&_=" + Date.now();
      document.head.appendChild(script);
    });
  }

  async function sync() {
    if (loading) return;
    loading = true;
    try {
      const payload = await fetchJSONP();
      const config = payload?.config && typeof payload.config === "object" ? payload.config : payload;
      if (payload?.ok === false || !config ||
          !Object.prototype.hasOwnProperty.call(config, "arrangementsLandscapeFilmSchedule")) return;
      schedule = normalize(config.arrangementsLandscapeFilmSchedule);
      try { localStorage.setItem(CACHE_KEY, JSON.stringify(schedule)); } catch {}
      applySchedule();
    } catch (err) {
      console.warn("Arrangements schedule refresh failed:", err);
    } finally {
      loading = false;
    }
  }
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) schedule = normalize(JSON.parse(cached));
  } catch {}
  window.ArrangementsFilmScheduleActive = false;
  applySchedule();
  void sync();
  setInterval(applySchedule, CHECK_EVERY_MS);
  setInterval(() => {void sync();}, UPDATE_EVERY_MS);
})();
