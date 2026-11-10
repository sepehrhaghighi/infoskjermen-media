# Infoskjermen Media — security notes

Security hardening: 2026-11-10.

## Implemented
- Each display/admin HTML page declares a Content Security Policy with SHA-256 hashes of its inline scripts. Recompute script hashes when editing embedded scripts.
- Display images are restricted by CSP to same-origin / existing GitHub Pages resources. Café Sandbeck additionally accepts only same-origin images within `assets/kafe_sandbeck/`.
- Inline image-error event handlers were replaced with event listeners, and the status page escapes error text before HTML insertion.
- `status.html` sends the update key in an HTTPS form POST body, never in the URL, and verifies completion by a read-only JSONP fetch.
- The source-controlled Apps Script disables state-changing GET requests; the key remains in Google Apps Script Script Properties, not in the public repo.

## Action required: redeploy the Apps Script
**A GitHub commit does not update the deployed Google Apps Script.** Copy `apps-script/InfoskjermenConfigService.gs` into the actual Apps Script project and deploy a new web-app version, preserving `UPDATE_KEY` in Script Properties. The new status page uses the existing `doPost` handler and should work even before this redeployment, but the old deployed GET update endpoint remains enabled until the deployment is updated.

If the update key has ever been sent in the old URL-based flow, rotate it after redeployment. Use a strong randomly generated value.

## Operational checks
- Test all slideshow pages, Café Sandbeck, calendar, weather, Entur and status read/write/readback after deployment.
- Protect GitHub account with 2FA/passkey; restrict automated GitHub publishing credentials and check branch protection compatible with your manifest-writing automation.
- Server headers such as HSTS, X-Frame-Options and frame-ancestors cannot be implemented via HTML meta tags; manage them at the hosting layer.
- A source-code review does not verify live deployment, account permissions or third-party script behavior.

The current CSP permits the specific Google Apps Script hosts necessary for existing read-only JSONP, the Entur board, Met.no weather, and local/GitHub Pages images. This deliberately avoids introducing new external dependencies.
