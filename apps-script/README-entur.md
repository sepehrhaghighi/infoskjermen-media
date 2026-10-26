# Calendar + Entur Tavla — individual timing on all six info screens

The status page now keeps only **Seconds per poster**, **Fade**, **Refresh**, **Update key**, and **Apply** at the top. Its existing six-page table has TWO duration columns, side by side:

- **Calendar (sec, 0=off)**
- **Entur Tavla (sec, 0=off)**

Each page has its own independent time for each slide. Zero omits that slide; entering 10 or 20 adds it for that many seconds on that particular page. The corresponding **What it shows**, **Count**, and **Suggested duration** values update.

- Calendar slide URL: existing `calendar-slide.html`
- Entur board: **https://vis-tavla.entur.no/vB3ZXkgI42ecuHXY9X7I**

The existing calendar setting automatically migrates to both `films-landscape.html` and `arrangements-landscape.html`. Its original value (including 0 = off) is retained there, while the other four pages start with Calendar disabled. The Entur durations start at zero if previously unset.

## Deploy Apps Script before merging PR #5

1. Open the existing [InfoskjermenConfigService Apps Script project](https://script.google.com/d/1PeHcLj7ZHa3lecrp9DIbMyZYNcOri-27ldUstPAYJCZ6z3LCUyFdghja/edit).
2. **Back up the current `Code.gs`.** Replace its contents with [the new source](./InfoskjermenConfigService.gs) and save. Do NOT modify the script's existing Properties, particularly `UPDATE_KEY` and `DISPLAY_CONFIG`.
3. Choose **Deploy → Manage deployments → Edit → New version → Deploy**, editing the existing deployment (not creating a new one).
4. Verify that the [same `/exec` endpoint](https://script.google.com/macros/s/AKfycbwTw7_A4V68NbmGn2aFmo-r3ddEWvO9G9VcIf0pc4W_EaMhiVgCi4JV3jNIqtQTa9pqsA/exec) returns `display-config-2026-10-26-calendar-entur-per-page-v4`, with the objects `calendarSlideSecondsByPage` and `enturSlideSecondsByPage`.
5. **Only after redeployment**, merge the pending [PR #5](https://github.com/sepehrhaghighi/infoskjermen-media/pull/5). The new GitHub Pages controls then become live.
6. On [status.html](https://sepehrhaghighi.github.io/infoskjermen-media/status.html), enter durations on whichever page rows you want, enter the **Update key** and select **Apply**.
7. Reload the page to verify the durations persist, and view all selected screens to verify both slides appear for the specified seconds.

Do not run `resetConfigFile_()`; it resets the saved timing values. Existing GET/POST, JSONP, `UPDATE_KEY`, and `DISPLAY_CONFIG` continue to work.

**Remaining live check:** The Entur board may block iframe embedding in external sites. A successful iframe load event does not guarantee that the board actually renders. Check the display visually.
