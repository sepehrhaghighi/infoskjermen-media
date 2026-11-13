"use strict";
(() => {
  // Only an exact normalized movie-title/filename match supplies a missing DX landscape poster.
  function normalizeTitle(value) {
    return String(value || "")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/æ/gi, "ae")
      .replace(/ø/gi, "o")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim()
      .replace(/\s+/g, " ");
  }

  function titleOf(film) {
    return String(film?.title || film?.name || film?.film || film?.movie ||
      film?.programTitle || film?.originalTitle || "");
  }

  function keyFromFilename(filename) {
    const name = String(filename || "").replace(/\.(?:jpg|jpeg|png)$/i, "");
    return normalizeTitle(name);
  }

  function suggestedFilename(title) {
    const stem = String(title || "")
      .normalize("NFC")
      .replace(/[\\/:*?"<>|]+/g, " ")
      .replace(/\s+/g, " ")
      .replace(/^[. ]+|[. ]+$/g, "");
    return (stem || "Filmplakat") + ".jpg";
  }

  function buildFilmPlaylist(films, manualImages, makeDx, makeManual) {
    const images = (Array.isArray(manualImages) ? manualImages : []).slice().sort((a, b) =>
      String(a.originalName || a.name || "").localeCompare(
        String(b.originalName || b.name || ""), "nb", { numeric: true, sensitivity: "base" }
      )
    );
    const uniqueByTitle = new Map();
    const ambiguous = new Set();
    for (const image of images) {
      const key = keyFromFilename(image.originalName || image.name);
      if (!key) continue;
      if (uniqueByTitle.has(key)) ambiguous.add(key);
      else uniqueByTitle.set(key, image);
    }
    for (const key of ambiguous) uniqueByTitle.delete(key);

    const orderedFilms = (Array.isArray(films) ? films : []).map((film, index) => ({ film, index }))
      .sort((a, b) => {
        const left = String(a.film?.begin || "").trim();
        const right = String(b.film?.begin || "").trim();
        if (!left || !right) return a.index - b.index;
        return left.localeCompare(right) || a.index - b.index;
      });

    const consumed = new Set();
    const playlist = [];
    for (const { film } of orderedFilms) {
      const image = uniqueByTitle.get(normalizeTitle(titleOf(film)));
      if (film?.landscape) {
        playlist.push(makeDx(film));
        if (image) consumed.add(image); // DX poster takes priority: no duplicate.
      } else if (image) {
        playlist.push(makeManual(image, film)); // Insert at the DX screening position.
        consumed.add(image);
      }
    }
    for (const image of images) {
      if (!consumed.has(image)) playlist.push(makeManual(image, null));
    }
    return playlist;
  }

  window.FilmPosterMatching = Object.freeze({
    normalizeTitle, titleOf, keyFromFilename, suggestedFilename, buildFilmPlaylist
  });
})();
