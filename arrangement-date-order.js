"use strict";
(() => {
  // The date prefix controls placement; everything after " - " is only a staff label.
  // Accepted: YYYY-MM-DD - Any name.jpg/png, or YYYY-MM-DD.jpg/png.
  function dateFromFilename(filename) {
    const m = /^(\d{4})-(\d{2})-(\d{2})(?:\s+-\s+.*)?\.(?:jpe?g|png)$/i.exec(String(filename || "").trim());
    if (!m) return null;
    const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
    if (y < 1 || mo < 1 || mo > 12 || d < 1) return null;
    const leap = y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);
    const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    return d <= days[mo - 1] ? m[1] + "-" + m[2] + "-" + m[3] : null;
  }

  function sortNames(items) {
    return items.slice().sort((a, b) =>
      String(a.originalName || a.name || "").localeCompare(
        String(b.originalName || b.name || ""), "nb",
        { numeric: true, sensitivity: "base" }
      )
    );
  }

  function buildArrangementPlaylist(arrangements, manualImages, makeDx, makeManual) {
    const timeline = [], unmatched = [];
    (Array.isArray(arrangements) ? arrangements : []).forEach((entry, index) => {
      if (!entry?.landscape) return;
      const begin = String(entry.begin || "").trim();
      const date = /^\d{4}-\d{2}-\d{2}/.exec(begin)?.[0] || "9999-99-99";
      timeline.push({ date, type: "dx", begin, index, item: makeDx(entry) });
    });

    sortNames(Array.isArray(manualImages) ? manualImages : []).forEach((entry, index) => {
      const date = dateFromFilename(entry.originalName || entry.name);
      const item = makeManual(entry, date);
      if (!date) unmatched.push(item);
      else timeline.push({ date, type: "manual", begin: "", index, item });
    });

    timeline.sort((a, b) => {
      const byDate = a.date.localeCompare(b.date);
      if (byDate) return byDate;
      // With date only, a manual poster has no time: place it after DX events on that day.
      if (a.type !== b.type) return a.type === "dx" ? -1 : 1;
      return a.type === "dx" ? a.begin.localeCompare(b.begin) || a.index - b.index
                             : a.index - b.index;
    });

    // Unmatched images remain alphabetical, at the end of the arrangement images.
    return timeline.map(x => x.item).concat(unmatched);
  }

  window.ArrangementDateOrder = Object.freeze({ dateFromFilename, buildArrangementPlaylist });
})();
