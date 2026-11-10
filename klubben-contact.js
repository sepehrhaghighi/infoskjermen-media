/**
 * Klubben display contact.
 * The telephone number is provided by a separate, read-only Google Apps Script.
 * This endpoint is public; the phone number is not confidential to page visitors.
 */
(() => {
  "use strict";

  const ENDPOINT = "https://script.google.com/macros/s/AKfycbxw1okU0cSCk0eZfJPHXQ8MWcO0yzuczfv_4CBYBrHFZUGC_62BtmCerbAwOInu_s3Rww/exec";
  const CALLBACK = "klubbenReceiveContact";
  const REFRESH_MS = 5 * 60 * 1000;
  const TIMEOUT_MS = 15000;
  const contact = document.getElementById("klubben-contact");

  if (!contact) return;

  let activeRequest = null;
  let hasValidContact = false;

  function unavailable() {
    contact.removeAttribute("href");
    contact.textContent = "Sarah: Telefonnummer utilgjengelig";
    contact.setAttribute("aria-label", "Telefonnummeret til Sarah er ikke tilgjengelig");
    hasValidContact = false;
  }

  function displayNumber(value) {
    const phone = String(value ?? "").trim().replace(/[\s()-]/g, "");
    if (!/^(?:\+47)?\d{8}$/.test(phone)) return false;

    const local = phone.startsWith("+47") ? phone.slice(3) : phone;
    const formatted = local.replace(/(\d{2})(?=\d)/g, "$1 ").trim();

    contact.href = "tel:" + phone;
    contact.textContent = "Sarah: " + formatted;
    contact.setAttribute("aria-label", "Ring Sarah på " + formatted);
    hasValidContact = true;
    return true;
  }

  function finishRequest() {
    if (!activeRequest) return;
    clearTimeout(activeRequest.timeout);
    activeRequest.script.remove();
    activeRequest = null;
  }

  // The callback name is fixed in both this file and the Apps Script.
  // Never render the returned phone number with innerHTML.
  window.klubbenReceiveContact = (response) => {
    if (!activeRequest) return;
    finishRequest();

    if (!response || response.ok !== true || !displayNumber(response.phone)) {
      unavailable();
    }
  };

  function refreshContact() {
    if (activeRequest) return;

    const script = document.createElement("script");
    const params = new URLSearchParams({
      callback: CALLBACK,
      _: String(Date.now())
    });

    script.async = true;
    script.src = ENDPOINT + "?" + params.toString();
    script.referrerPolicy = "no-referrer";
    script.onerror = () => {
      finishRequest();
      // Keep the last successful number during a temporary network outage.
      if (!hasValidContact) unavailable();
    };

    const timeout = setTimeout(() => {
      finishRequest();
      if (!hasValidContact) unavailable();
    }, TIMEOUT_MS);

    activeRequest = { script, timeout };
    document.head.appendChild(script);
  }

  refreshContact();
  setInterval(refreshContact, REFRESH_MS);
})();
