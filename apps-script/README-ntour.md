# N-tour table slide — deployment notes

This branch adds a separate **Show N-tour table** checkbox, duration, and URL to `status.html`. When enabled, the same N-tour slide appears in both `films-landscape.html` and `arrangements-landscape.html`, alongside the existing calendar slide and posters.

## Important: not yet live

- The N-tour URL has not been supplied. Enter the final **public HTTPS embeddable table URL** on the status page (a Google Sheet edit link may refuse to be embedded; use a published/embeddable view).
- The new slide is **off by default** and not added to the playlist until the checkbox is checked and a valid URL exists.
- The Apps Script project is located in Drive: [InfoskjermenConfigService](https://script.google.com/d/1PeHcLj7ZHa3lecrp9DIbMyZYNcOri-27ldUstPAYJCZ6z3LCUyFdghja/edit).
- The linked Drive integration can identify that project but **cannot read its source**. The file `InfoskjermenConfigService.gs` in this folder is a *compatibility replacement based on the documented API*, not a verified edit of the current live source. **Make a copy of the current Apps Script first** and compare before replacing. If the original has additional functions, preserve them.

## Suggested deployment order

1. Open the existing Apps Script project and back up the current `Code.gs`.
2. Compare the old code with `apps-script/InfoskjermenConfigService.gs`. It handles GET JSONP read and `action=update` for the six numeric/boolean/string settings in status.
3. In Apps Script **Project Settings → Script properties**, keep your existing key, or set a property named `UPDATE_KEY` with your existing update password. Do not put this password in GitHub. Optional compatible names in the replacement: `CONFIG_UPDATE_KEY` and `ADMIN_KEY`.
4. Check the current values of poster timing, calendar timing, fade, and refresh against the defaults in the new script (7, 20, 500, 60). To preserve nondefault values, enter them in the status page after deployment, or copy them into `INFOSKJERMEN_CONFIG` JSON.
5. In the **existing Apps Script deployment**, choose **Deploy → Manage deployments → Edit → New version → Deploy**. Editing the same deployment normally keeps its `/exec` URL; do not choose **New deployment** unless necessary.
6. After the config endpoint is upgraded, merge the GitHub feature branch into `main` (GitHub Pages should publish it).
7. On `status.html`, enter the table URL, set seconds, check **Show N-tour table**, and click **Apply** using the update password. Confirm **Applied successfully** and reload to ensure it is saved.
8. Test both landscape screens on the target display. Ensure the external table **allows iframe embedding** and is readable without signing in. HTTPS is required. If it blocks embedding, we will need a published view or a locally rendered table instead.

### Compatibility warning

Publishing updated GitHub pages **before** deploying the Apps Script can make the new control fail its read-back verification, even when the legacy settings still work. That is why this branch is held in a pull request until you deploy.

The N-tour table is intentionally not added to portrait screens or `landscape-all.html`; the current calendar-slide mechanism only targets the two named landscape slideshow pages.
