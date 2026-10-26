# Entur Tavla — deployment steps

This change adds a separate **Show Entur Tavla** checkbox, duration, and HTTPS display URL to `status.html`. Entur is optionally shown in `films-landscape.html` and `arrangements-landscape.html`. The original calendar slide remains independently enabled by its duration (0 = off).

## Important — authentic original Apps Script now provided

The user supplied the original **InfoskjermenConfigService** code (`display-config-2026-04-21-v1`). `apps-script/InfoskjermenConfigService.gs` is now based on that **exact original architecture**, rather than the earlier proposed replacement. It retains:

- Script Property `UPDATE_KEY` (existing password)
- Script Property `DISPLAY_CONFIG` (existing saved settings)
- `doGet`, `doPost`, JSONP response format and update authentication
- existing timing ranges, reset/test helpers and form parsing

It adds only `enturSlideEnabled`, `enturSlideSeconds`, `enturSlideUrl` and validation for an enabled board URL. By retaining `DISPLAY_CONFIG` and merging the existing data, it preserves current saved settings. The Entur checkbox defaults to **off**.

## Deploy in this order

1. Open the existing [Google Apps Script project](https://script.google.com/d/1PeHcLj7ZHa3lecrp9DIbMyZYNcOri-27ldUstPAYJCZ6z3LCUyFdghja/edit).
2. Back up the current `Code.gs`, then replace its contents with [the revised code](./InfoskjermenConfigService.gs). **Save**. Never post your update password in GitHub or chat.
3. Use **Deploy → Manage deployments → Edit (pencil) → Version: New version → Deploy**, selecting the existing web-app deployment, *not* New deployment. This normally preserves the current `/exec` URL already hardcoded in the screen pages.
4. Verify the existing [script URL](https://script.google.com/macros/s/AKfycbwTw7_A4V68NbmGn2aFmo-r3ddEWvO9G9VcIf0pc4W_EaMhiVgCi4JV3jNIqtQTa9pqsA/exec) responds with `version: "display-config-2026-10-26-entur-v2"`. Confirm previous calendar and timing settings remain as before.
5. Merge [Entur Tavla draft PR #4](https://github.com/sepehrhaghighi/infoskjermen-media/pull/4) into `main`. This publishes GitHub Pages; the PR remains intentionally unmerged until the Apps Script is deployed.
6. Open the published `status.html`, enter your **public HTTPS Entur Tavla board URL**, select its duration, tick **Show Entur Tavla**, enter your existing update key and click **Apply**. Confirm "Applied successfully" and that the checkbox stays checked on refresh.
7. Test `films-landscape.html` and `arrangements-landscape.html` on the display to confirm the board renders. A successfully loaded iframe does **not** guarantee that Entur allows embedding; verify visually. If Entur blocks embedded display, a different embedding/rendering approach is needed.

### Additional notes

- The Entur URL was not provided yet; no fixed URL is hardcoded and the board stays disabled.
- The feature is intentionally limited to the two landscape slideshows, consistent with the existing calendar-slide design.
- Do not execute `resetConfigFile_()` during deployment — it resets your current live settings.
- The source code was syntax-checked and its config read/write operations tested in a mock Apps Script environment; live Entur embedding and real deployment are not verified.
