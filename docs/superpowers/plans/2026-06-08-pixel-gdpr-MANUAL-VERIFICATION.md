# Facebook Pixel + GDPR Consent — Implementation Status & Manual Verification

**Branch:** `facebook-pixel-gdpr-consent`
**Date implemented:** 2026-06-08
**Plan:** `2026-06-08-facebook-pixel-gdpr-consent.md` · **Spec:** `../specs/2026-06-08-facebook-pixel-gdpr-consent-design.md`

## What is DONE (committed on the branch)

All code is implemented, statically verified, and reviewed (per-task spec + code-quality review). Tasks 1–6 and 8 are fully complete; Task 9's contradiction scan is complete (see below). Build is idempotent (`node build.js` → 0 changes) and the marker-assertion test passes.

- **Consent banner** (`partials/tracking.html`) inlined on every page, hidden by default.
- **Consent state machine + geo gate** (`assets/site.js`): `lg_consent` localStorage, `/cdn-cgi/trace` region detection (fail-safe EU on timeout/error/missing), gated set = EU-27 + IS/LI/NO + GB + CH.
- **Meta Pixel** (ID `1479028413910220`): `init` + `PageView` only fire from `initPixel()` after consent is `granted` (auto non-EU / post-Accept EU). `StartTrial` custom event on download-button clicks. No `<noscript>` pixel. No `Purchase`.
- **Withdrawal / change choice:** footer "Cookie settings" link → `reopenConsent()` re-shows the banner so the user can pick Accept or Reject. **Reject = full revoke** (`deny()` sets denied + `fbq('consent','revoke')` + deletes `_fbp`/`_fbc`), so it works as a withdrawal of a prior Accept too.
- **CSP** (`_headers`): **ENFORCING** (flipped 2026-06-08 after a clean live soak). One fix was needed during soak — Umami posts its data to `gateway.umami.is` (not `cloud.umami.is`), now in `connect-src`. No other violations.
- **privacy.html:** Meta Pixel / consent / joint-controller disclosure; false "no consent banner required" claim removed; meta-description rescoped; Meta added to third-party list; date bumped to June 8, 2026.

### Contradiction scan result (Task 9)
Scanned all HTML for `no tracking | cookieless | consent banner | no cookies`. The only non-privacy hits are **app-scoped and remain true** — they describe the desktop app's offline image processing, not the website:
- `features.html:618` — "No cloud uploads, no API calls, no tracking" (under "100% Offline / works on airplane mode").
- `photoroom-alternative.html:467` & `:912` — FAQ: "the app runs entirely offline … no tracking. Works on airplane mode."

No edits needed: the Meta Pixel is website-only and never touches the app or photos, so these claims are accurate. `terms.html` has no blanket no-cookies statement.

## What REMAINS — requires a live Cloudflare deploy (cannot be done locally)

`_headers` and `/cdn-cgi/trace` only exist on Cloudflare, and the Pixel can't reach `localhost`. These steps need a deployed preview:

1. **Interactive consent walk** (deploy → open the site):
   - Non-EU (or geo-stub): no banner, Pixel loads, `connect.facebook.net/fbevents.js` + a `PageView` to `facebook.com/tr` appear in Network.
   - EU (or fail-safe via blocked `/cdn-cgi/trace`): banner shows; **no** Meta requests until **Accept**; after Accept, Pixel loads.
   - **Reject**: zero Meta requests in any state; download still works.
   - **Download click** after Accept: a `facebook.com/tr` request with `ev=StartTrial`.
   - **Cookie settings** (footer): `_fbp`/`_fbc` cleared in Application→Cookies; `lg_consent` → denied; reload → no Pixel.
   - In every state, clicking Download still downloads the file.

2. **CSP soak → enforce** (Task 7, MANDATORY order):
   - With Report-Only live, visit all 14 pages in both consent states; confirm **zero** `[Report Only]` CSP violations in the console.
   - Only then, in `_headers`, change `Content-Security-Policy-Report-Only:` → `Content-Security-Policy:` (same value) and re-deploy. Re-verify fonts/umami/Pixel all still work.
   - **Never** add + enforce in the same deploy.

3. **Meta Events Manager → Test Events** (before first ad campaign): confirm `PageView` + `StartTrial` arrive and attribute to Pixel `1479028413910220`. Remove any test code before final deploy.

## Notes
- The site repo has untracked `.wrangler/` and `releases/` dirs — pre-existing, intentionally NOT committed.
- CAPI remains deferred to a future Purchase event (Creem webhook → Worker), per the spec.
