# Entur Tavla — independent duration for all six screens

This update follows the user-approved layout:

- Top controls stay **Seconds per poster**, **Calendar slide**, **Fade**, **Refresh**, **Update key**, and **Apply**.
- The existing table of six screen pages has an additional column **Entur Tavla (sec, 0=off)**, with one number input per page.
- `0` means no Entur slide; `10` displays the board for 10 seconds; `20` for 20 seconds, independently for each page.
- With a positive value, the Entur slide appears in the **What it shows** description, **Count** increases by 1, and the entered time is added to **Suggested duration**.
- The Entur board URL is fixed in the screen code: **https://vis-tavla.entur.no/vB3ZXkgI42ecuHXY9X7I**. No URL field or checkbox is needed.
- The calendar slide keeps its existing timing and remains present on the two landscape-specific screens.

## Google Apps Script: new version required

Your Apps Script **Version 8 (2026-10-26, 9:32 AM)** is the previous interface. The updated source `apps-script/InfoskjermenConfigService.gs` adds `enturSlideSecondsByPage`, an object with six keys (the HTML filenames). This is based on the exact `Code.gs` source you provided and preserves **UPDATE_KEY**, **DISPLAY_CONFIG**, JSONP, GET, POST and the old poster/calendar/fade/refresh values. Existing v8 Entur checkbox settings are superseded and all six per-page durations start at 0.

1. **Back up** your current `Code.gs` in [InfoskjermenConfigService](https://script.google.com/d/1PeHcLj7ZHa3lecrp9DIbMyZYNcOri-27ldUstPAYJCZ6z3LCUyFdghja/edit).
2. Replace its source with [the revised source](./InfoskjermenConfigService.gs) and **Save**. Keep Script Properties, especially `UPDATE_KEY` and `DISPLAY_CONFIG`.
3. Choose **Deploy → Manage deployments → Edit → New version → Deploy** for the **existing** deployment. Do not create a separate new deployment. The `/exec` URL should remain the same.
4. Open [your existing endpoint](https://script.google.com/macros/s/AKfycbwTw7_A4V68NbmGn2aFmo-r3ddEWvO9G9VcIf0pc4W_EaMhiVgCi4JV3jNIqtQTa9pqsA/exec); confirm the response includes `display-config-2026-10-26-entur-per-page-v3` and `enturSlideSecondsByPage`.
5. Only **then** merge the GitHub feature pull request to `main`.
6. Open [status.html](https://sepehrhaghighi.github.io/infoskjermen-media/status.html), set Entur seconds in whichever of the six page rows you want, enter the update key and click **Apply**. Confirm success, refresh to verify saved settings, and test the selected screens.

### Important

Entur documents opening Tavla boards directly in browsers. It is not yet verified whether **vis-tavla.entur.no** allows its board to be embedded in an iframe inside your GitHub Pages displays. Test on a physical screen after deployment. A loaded iframe may still display an embedding error or blank page.

Do not run `resetConfigFile_()` during deployment, as it resets your stored timings.
