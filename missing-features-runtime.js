"use strict";
(() => {
  const FILMS_URL = "./assets/films.json";
  const MANUAL_URL = "./assets/landscape_extra_films/manifest.json";
  const REFRESH_MS = 30 * 60 * 1000;
  const matching = window.FilmPosterMatching;

  const metaEl = document.getElementById("meta");
  const listEl = document.getElementById("list");
  const reloadBtn = document.getElementById("reloadBtn");
  const copyStatus = document.getElementById("copyStatus");

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  async function fetchJson(url) {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new Error("Kunne ikke hente data (HTTP " + response.status + ").");
    return response.json();
  }

  function manualImageCounts(manifest) {
    if (!Array.isArray(manifest?.items)) return null; // Could not check manual uploads.
    const counts = new Map();
    for (const file of manifest.items) {
      if (file?.kind === "video") continue;
      const key = matching.keyFromFilename(file?.originalName || file?.name);
      if (key) counts.set(key, (counts.get(key) || 0) + 1);
    }
    return counts;
  }

  function renderMissing(data, manualManifest) {
    const films = Array.isArray(data?.films) ? data.films : [];
    const seen = new Set();
    const missing = [];

    for (const film of films) {
      if (!film?.poster || film?.landscape) continue;
      const title = matching.titleOf(film);
      const key = matching.normalizeTitle(title);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      missing.push({ title, key, filename: matching.suggestedFilename(title) });
    }

    const counts = manualImageCounts(manualManifest);
    const covered = counts ? missing.filter(entry => counts.get(entry.key) === 1).length : 0;
    const updatedText = data?.updated
      ? "films.json oppdatert: " + data.updated
      : "films.json har ingen updated-verdi";

    metaEl.innerHTML =
      '<span class="' + (missing.length ? "warn" : "ok") + '">' +
      (missing.length ? missing.length + " film(er) mangler liggende plakat fra DX" :
        "Ingen filmer mangler liggende plakat fra DX") + "</span>" +
      (counts ? " · " + covered + " har en manuell plakat" : "") +
      " · " + escapeHtml(updatedText) +
      " · Sist sjekket: " + escapeHtml(new Date().toLocaleString("nb-NO"));

    if (!missing.length) {
      listEl.innerHTML = '<div class="empty ok">Ingen filmer mangler liggende plakat fra DX akkurat nå.</div>';
      return;
    }

    listEl.innerHTML = '<div class="card"><ol>' + missing.map(entry => {
      const count = counts ? counts.get(entry.key) || 0 : null;
      const state = count === null
        ? '<span class="small">Kunne ikke kontrollere manuelle filer nå.</span>'
        : count > 1
          ? '<span class="warn small">Flere manuelle filer matcher denne tittelen. Behold kun én fil for sikker plassering.</span>'
          : count === 1
            ? '<span class="ok small">Manuell plakat er publisert og blir plassert etter filmens visningstid.</span>'
            : '<span class="small">Ingen tilsvarende manuell plakat er publisert ennå.</span>';
      return '<li><strong>' + escapeHtml(entry.title) + '</strong>' +
        '<div class="small">Filnavn: <code class="filename">' + escapeHtml(entry.filename) + '</code> ' +
        '<button type="button" class="copyName" data-filename="' + escapeHtml(entry.filename) + '">Kopier filnavn</button></div>' +
        '<div>' + state + '</div></li>';
    }).join("") + "</ol></div>";
  }

  async function load() {
    metaEl.textContent = "Laster…";
    try {
      const [data, manualManifest] = await Promise.all([
        fetchJson(FILMS_URL),
        fetchJson(MANUAL_URL).catch(() => null)
      ]);
      renderMissing(data, manualManifest);
    } catch (err) {
      metaEl.innerHTML = '<span class="warn">Kunne ikke laste films.json</span>';
      listEl.innerHTML = '<div class="empty">Feil ved lasting: ' +
        escapeHtml(err instanceof Error && /^Kunne ikke hente data/.test(err.message) ? err.message : "Kontroller nettforbindelsen og prøv igjen.") + '</div>';
    }
  }

  listEl.addEventListener("click", async event => {
    const btn = event.target.closest("button.copyName");
    if (!btn) return;
    const filename = btn.dataset.filename;
    if (!filename) return;
    try {
      await navigator.clipboard.writeText(filename);
      copyStatus.textContent = "Filnavn kopiert: " + filename;
    } catch {
      copyStatus.textContent = "Kunne ikke kopiere automatisk. Marker filnavnet og kopier det.";
    }
  });

  reloadBtn.addEventListener("click", load);
  load();
  setInterval(load, REFRESH_MS);
})();
