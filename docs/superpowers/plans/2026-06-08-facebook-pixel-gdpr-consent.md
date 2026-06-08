# Facebook Pixel + GDPR Consent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Meta Pixel (ID `1405950224693628`) to the marketing site, firing a `StartTrial` conversion on download clicks, gated behind GDPR-compliant geo-targeted opt-in consent (banner for EU/EEA/UK/CH only), and update the privacy policy to reflect the new tracking.

**Architecture:** A new `partials/tracking.html` carries the consent banner DOM (hidden by default). All consent + Pixel logic lives in the existing `assets/site.js` (already loaded site-wide via the nav partial). A background `/cdn-cgi/trace` fetch determines region; the Pixel only `init`s + fires after consent is `granted` (auto for non-EU, post-Accept for EU). `build.js` gains a build-time assertion that every page carries the tracking markers. The privacy page is rewritten to disclose the Pixel.

**Tech Stack:** Vanilla JS (zero dependencies), static HTML, Node.js `build.js` inliner, Cloudflare Pages (`_headers` for CSP). No build tooling beyond `node build.js`. No test framework exists — the one automated test is a standalone Node script for the build assertion; all other verification is manual browser/devtools steps with exact expected output.

**Working directory:** All paths are relative to `~/proekti/listinggems-site` (the site repo), NOT the `listinglens` app repo. `cd ~/proekti/listinggems-site` before any command.

**Reference spec:** `docs/superpowers/specs/2026-06-08-facebook-pixel-gdpr-consent-design.md`

**Execution notes (read first):**
- **Cited line numbers are approximate — match by content.** Task 3 inserts a marker
  line before `</body>` in every page, shifting later line numbers. All edits in Tasks
  5/6/8 are exact-string replaces keyed on content, so this is safe — but do NOT trust
  absolute line numbers after Task 3; locate the quoted text instead.
- **Tasks 2 and 3 must not have a deploy between them.** Task 2 commits the build
  assertion, which intentionally **fails the build** (`exit=1`) until Task 3 adds the
  markers. Commit them back-to-back; do not run a deploy pipeline (`node build.js`)
  against the Task 2 commit alone. Every other task leaves a deployable state.
- **Only Task 7 (CSP) requires a live Cloudflare preview** — `_headers` and
  `/cdn-cgi/trace` don't exist on the local `http.server`. Everything else is fully
  verifiable locally.

---

## File structure

| File | Responsibility |
|---|---|
| `partials/tracking.html` | **New.** Consent banner DOM (hidden by default). No `<script>`, no `<noscript>` pixel — logic lives in site.js. |
| `assets/site.js` | **Modify.** Add a self-contained consent+Pixel IIFE block: state machine, geo fetch, `initPixel()`, banner handlers, download-click `StartTrial`, withdrawal. |
| `build.js` | **Modify.** Register `tracking` partial + add a build-time assertion that every walked `.html` contains the tracking markers. |
| `partials/footer-links.html` | **Modify.** Add a "Cookie settings" link that withdraws consent. |
| `_headers` | **Modify.** Add CSP (Report-Only first, then enforce). |
| `privacy.html` | **Modify.** Rewrite analytics section, add Meta to third-party list, consent/withdrawal copy, meta-description fix, date bump. |
| `terms.html` | **Verify only.** No change expected. |
| All 14 walked `.html` files + `blog/_template.html` | **Modify.** Insert `<!-- @begin tracking --><!-- @end tracking -->` markers before `</body>`. |
| `scripts/assert-tracking-markers.test.js` | **New.** Standalone Node test for the build assertion logic. |

---

## Task 1: Create the consent banner partial

**Files:**
- Create: `partials/tracking.html`

The banner is hidden by default (`hidden` attribute). site.js reveals it only when state resolves to `pending`. Two equal-weight buttons. No script, no `<noscript>` pixel (ungateable — see spec).

- [ ] **Step 1: Create the partial**

Create `partials/tracking.html`:

```html
<div id="lg-consent-banner" class="lg-consent-banner" role="dialog" aria-modal="true" aria-label="Cookie consent" hidden>
  <p class="lg-consent-text">
    We use the Meta Pixel to measure our ads. It sets cookies and shares data with Meta.
    See our <a href="/privacy">Privacy Policy</a>.
  </p>
  <div class="lg-consent-actions">
    <button type="button" id="lg-consent-reject" class="lg-consent-btn lg-consent-btn-reject">Reject</button>
    <button type="button" id="lg-consent-accept" class="lg-consent-btn lg-consent-btn-accept">Accept</button>
  </div>
</div>
```

- [ ] **Step 2: Add banner styles to the shared stylesheet**

Append to `assets/site.css` (confirm the file exists first: `ls assets/site.css`). Equal visual weight for both buttons is a GDPR requirement — Reject is NOT visually de-emphasized:

```css
/* --- Consent banner --- */
.lg-consent-banner {
  position: fixed;
  left: 16px;
  right: 16px;
  bottom: 16px;
  z-index: 9999;
  max-width: 720px;
  margin: 0 auto;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px 20px;
  padding: 16px 20px;
  background: #18181b;
  border: 1px solid #3f3f46;
  border-radius: 16px;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.4);
}
.lg-consent-banner[hidden] { display: none; }
.lg-consent-text { flex: 1 1 280px; margin: 0; font-size: 14px; line-height: 1.5; color: #d4d4d8; }
.lg-consent-text a { color: #34d399; }
.lg-consent-actions { display: flex; gap: 10px; flex: 0 0 auto; }
.lg-consent-btn {
  padding: 9px 18px;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  border: 1px solid #52525b;
}
.lg-consent-btn-reject { background: transparent; color: #e4e4e7; }
.lg-consent-btn-reject:hover { background: #27272a; }
.lg-consent-btn-accept { background: #059669; color: #fff; border-color: #059669; }
.lg-consent-btn-accept:hover { background: #047857; }
```

- [ ] **Step 3: Commit**

```bash
cd ~/proekti/listinggems-site
git add partials/tracking.html assets/site.css
git commit -m "feat(consent): add consent banner partial + styles"
```

---

## Task 2: Wire the tracking partial into build.js and add the marker assertion

This is the highest-risk task (see spec's build.js caveat). `build.js` only *replaces between existing markers* — it never inserts them. A page missing the markers ships with no banner/Pixel and no error. The assertion converts that silent gap into a hard build failure.

**Files:**
- Modify: `build.js:30-33` (PARTIALS array), `build.js:95-120` (main)
- Create: `scripts/assert-tracking-markers.test.js`

- [ ] **Step 1: Register the tracking partial**

In `build.js`, change the `PARTIALS` array (lines 30-33) from:

```js
const PARTIALS = [
  { name: 'nav', file: 'nav.html' },
  { name: 'footer-links', file: 'footer-links.html' },
];
```

to:

```js
const PARTIALS = [
  { name: 'nav', file: 'nav.html' },
  { name: 'footer-links', file: 'footer-links.html' },
  { name: 'tracking', file: 'tracking.html' },
];
```

- [ ] **Step 2: Add the assertion function**

In `build.js`, immediately before `function main() {` (line 95), insert:

```js
// Every walked .html file MUST carry the tracking markers, so the consent
// banner + Pixel ship on every page. build.js only replaces between existing
// markers — it never inserts them — so a file missing them would silently ship
// untracked. This assertion turns that silent gap into a hard build failure.
function assertTrackingMarkers(files) {
  const re = /<!--\s*@begin\s+tracking\s*-->[\s\S]*?<!--\s*@end\s+tracking\s*-->/;
  const missing = [];
  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8');
    if (!re.test(content)) {
      missing.push(path.relative(ROOT, file).split(path.sep).join('/'));
    }
  }
  if (missing.length) {
    console.error('\nERROR: these .html files are missing the tracking markers:');
    for (const m of missing) console.error('  - ' + m);
    console.error('\nAdd <!-- @begin tracking --><!-- @end tracking --> before </body> in each.');
    process.exit(1);
  }
}
```

- [ ] **Step 3: Call the assertion in main()**

In `build.js`, in `main()`, after `const files = walk(ROOT, []);` (line 97), add the assertion call:

```js
function main() {
  const partials = loadPartials();
  const files = walk(ROOT, []);
  assertTrackingMarkers(files);   // <-- ADD THIS LINE
  let updated = 0;
  let skipped = 0;
```

- [ ] **Step 4: Write the standalone assertion test**

Create `scripts/assert-tracking-markers.test.js`. This exercises the regex used by the assertion (kept in sync by copy — the build's real function isn't exported, and we don't want to refactor build.js into a module for this). Pure Node, no framework:

```js
'use strict';
// Standalone test for the tracking-marker regex used by build.js assertTrackingMarkers.
// Run: node scripts/assert-tracking-markers.test.js
const assert = require('assert');

const re = /<!--\s*@begin\s+tracking\s*-->[\s\S]*?<!--\s*@end\s+tracking\s*-->/;

// Present (empty between markers) -> matches
assert.ok(re.test('<body><!-- @begin tracking --><!-- @end tracking --></body>'),
  'empty markers should match');

// Present (content between markers) -> matches
assert.ok(re.test('<!-- @begin tracking -->\n<div>x</div>\n<!-- @end tracking -->'),
  'filled markers should match');

// Extra whitespace variants -> matches
assert.ok(re.test('<!--   @begin   tracking   -->y<!--  @end  tracking  -->'),
  'whitespace variants should match');

// Missing entirely -> does NOT match
assert.ok(!re.test('<body><p>no markers here</p></body>'),
  'absent markers should not match');

// Only begin, no end -> does NOT match
assert.ok(!re.test('<!-- @begin tracking --> dangling'),
  'unpaired begin should not match');

// Only end, no begin -> does NOT match (mirror of the unpaired-begin case)
assert.ok(!re.test('dangling <!-- @end tracking -->'),
  'unpaired end should not match');

console.log('OK: assert-tracking-markers regex tests passed');
```

- [ ] **Step 5: Run the test, verify it passes**

```bash
cd ~/proekti/listinggems-site
node scripts/assert-tracking-markers.test.js
```

Expected output: `OK: assert-tracking-markers regex tests passed`

- [ ] **Step 6: Verify the build now FAILS (markers not yet added to pages)**

```bash
cd ~/proekti/listinggems-site
node build.js; echo "exit=$?"
```

Expected: an `ERROR:` block listing all 14 walked `.html` files as missing markers, and `exit=1`. This proves the assertion fires before any markers exist. (We add the markers in Task 3.)

- [ ] **Step 7: Commit**

```bash
cd ~/proekti/listinggems-site
git add build.js scripts/assert-tracking-markers.test.js
git commit -m "feat(build): register tracking partial + assert markers on every page"
```

---

## Task 3: Insert tracking markers into every page

`build.js` cannot insert markers — it only fills them. So this is manual: add the empty marker pair before `</body>` in each file. After this, the build from Task 2 must pass.

**Files (insert `<!-- @begin tracking --><!-- @end tracking -->` immediately before `</body>` in each):**
- `about.html`, `blog/how-to-erase-restore-brush.html`, `blog/index.html`, `blog/why-marketplaces-ban-stock-photos.html`, `changelog.html`, `contact.html`, `download.html`, `features.html`, `index.html`, `photoroom-alternative.html`, `privacy.html`, `refund.html`, `removebg-alternative.html`, `terms.html`
- Also `blog/_template.html` (excluded from the walk/assertion, but new posts copy it — it must carry the markers so they inherit tracking)

- [ ] **Step 1: Insert markers before `</body>` in every file**

For each file above, locate the closing `</body>` and insert the marker pair on the line directly before it. Example for `privacy.html` (`</body>` is at line 166) — the result should read:

```html
  <!-- @begin tracking --><!-- @end tracking -->
</body>
```

Do this for all 15 files (14 walked + `blog/_template.html`). Use the editor's exact-match replace per file: replace `</body>` with `  <!-- @begin tracking --><!-- @end tracking -->\n</body>`. (Each file has exactly one `</body>` — verified.)

- [ ] **Step 2: Verify every file got the markers**

```bash
cd ~/proekti/listinggems-site
for f in about.html blog/how-to-erase-restore-brush.html blog/index.html blog/why-marketplaces-ban-stock-photos.html changelog.html contact.html download.html features.html index.html photoroom-alternative.html privacy.html refund.html removebg-alternative.html terms.html blog/_template.html; do
  grep -q "@begin tracking" "$f" && echo "ok: $f" || echo "MISSING: $f"
done
```

Expected: `ok:` for all 15 files, no `MISSING:`.

- [ ] **Step 3: Run the build — it must now PASS and inline the banner**

```bash
cd ~/proekti/listinggems-site
node build.js; echo "exit=$?"
```

Expected: `updated:` lines for the 14 walked files (now that tracking markers exist and get filled with the banner), `exit=0`, no `ERROR:` block.

- [ ] **Step 4: Verify the banner DOM is inlined on a sample of pages**

```bash
cd ~/proekti/listinggems-site
grep -c "lg-consent-banner" index.html privacy.html download.html blog/index.html
```

Expected: `1` for each (the banner DOM is now present between the markers).

- [ ] **Step 5: Commit**

```bash
cd ~/proekti/listinggems-site
git add -A
git commit -m "feat(consent): inline tracking markers + banner on every page"
```

---

## Task 4: Consent state machine + geo detection in site.js (no Pixel yet)

Build the consent logic incrementally: first the state machine and banner show/hide, WITHOUT firing the Pixel. This lets us verify the gate before any Meta code exists. The Pixel `init` is added in Task 5.

**Files:**
- Modify: `assets/site.js` (append a new IIFE after the existing one, before the final line)

- [ ] **Step 1: Append the consent IIFE (state machine + geo + banner, Pixel stubbed)**

In `assets/site.js`, after the closing `})();` of the existing IIFE (line 146), append a new self-contained block. `initPixel()` is a stub here that just logs — Task 5 replaces its body:

```js
// --- Consent + Meta Pixel gate ---------------------------------------------
// Pixel ID is public by nature (inlined). The Pixel only initializes when
// consent state is 'granted' (auto for non-EU, post-Accept for EU/EEA/UK/CH).
(function () {
  if (window.__lgConsent) return;
  window.__lgConsent = true;

  var STORAGE_KEY = 'lg_consent';
  var CONSENT_VERSION = 1;
  // EU + EEA + UK + Switzerland (ISO-3166 alpha-2). CH included for the Swiss FADP.
  var GATED = new Set([
    'AT','BE','BG','HR','CY','CZ','DK','EE','FI','FR','DE','GR','HU','IE','IT',
    'LV','LT','LU','MT','NL','PL','PT','RO','SK','SI','ES','SE',     // EU 27
    'IS','LI','NO',                                                   // EEA non-EU
    'GB','CH'                                                         // UK + Switzerland
  ]);

  function readState() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      var obj = JSON.parse(raw);
      if (!obj || obj.v !== CONSENT_VERSION) return null; // re-prompt on version bump
      return obj.state || null;
    } catch (e) { return null; }
  }

  function writeState(state) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        state: state, v: CONSENT_VERSION, ts: Math.floor(Date.now() / 1000)
      }));
    } catch (e) { /* storage blocked — treat as no persisted choice */ }
  }

  function showBanner() {
    var el = document.getElementById('lg-consent-banner');
    if (el) el.hidden = false;
  }
  function hideBanner() {
    var el = document.getElementById('lg-consent-banner');
    if (el) el.hidden = true;
  }

  // Replaced in Task 5 with real Pixel init. Stub for now.
  function initPixel() {
    if (window.__lgPixelInit) return;
    window.__lgPixelInit = true;
    console.log('[consent] initPixel() — would init Pixel + PageView here');
  }

  // Background, non-blocking geo check. Resolves to 'EU'/'NONEU' (fail-safe: EU).
  function detectRegion() {
    return new Promise(function (resolve) {
      var done = false;
      var timer = setTimeout(function () {
        if (!done) { done = true; resolve('EU'); } // timeout -> fail safe
      }, 1500);
      fetch('/cdn-cgi/trace', { cache: 'no-store' })
        .then(function (r) { return r.text(); })
        .then(function (txt) {
          if (done) return;
          done = true; clearTimeout(timer);
          var m = /(?:^|\n)loc=([A-Z]{2})/.exec(txt);
          var loc = m ? m[1] : null;
          resolve(loc && GATED.has(loc) ? 'EU' : (loc ? 'NONEU' : 'EU'));
        })
        .catch(function () {
          if (done) return;
          done = true; clearTimeout(timer);
          resolve('EU'); // error -> fail safe
        });
    });
  }

  function grant() { writeState('granted'); hideBanner(); initPixel(); }
  function deny() { writeState('denied'); hideBanner(); }

  function wireBanner() {
    var accept = document.getElementById('lg-consent-accept');
    var reject = document.getElementById('lg-consent-reject');
    if (accept) accept.addEventListener('click', grant);
    if (reject) reject.addEventListener('click', deny);
  }

  function resolveConsent() {
    var state = readState();
    if (state === 'granted') { initPixel(); return; }  // persisted grant: no geo fetch
    if (state === 'denied') { return; }                // persisted deny: no geo fetch
    // unset or pending -> detect region (fail-safe: re-prompt on every reload-while-pending)
    detectRegion().then(function (region) {
      if (region === 'NONEU') {
        grant();                 // non-EU: auto-consent, init Pixel
      } else {
        // EU/EEA/UK/CH: ask first. Don't re-stamp ts if already pending.
        if (readState() !== 'pending') writeState('pending');
        showBanner();
      }
    });
  }

  // Expose for the withdrawal link (Task 6) and external triggers.
  window.lgConsent = { grant: grant, deny: deny, readState: readState };

  function start() { wireBanner(); resolveConsent(); }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
```

- [ ] **Step 2: Verify the gate in a browser — non-EU path**

Serve the site locally and open the console:

```bash
cd ~/proekti/listinggems-site
python3 -m http.server 8787
```

In a browser at `http://localhost:8787/`:
- Open DevTools console. Run `localStorage.clear()` then reload.
- Because `localhost`'s `/cdn-cgi/trace` does NOT exist (404/non-Cloudflare), `detectRegion()` will fail and **fail-safe to EU** → the banner should appear.

Expected: the consent banner is visible at the bottom; console shows NO `initPixel()` log (pending state).

- [ ] **Step 3: Verify Accept and Reject transitions**

In the same browser:
- Click **Accept** → banner disappears, console logs `[consent] initPixel() …`, and `localStorage.getItem('lg_consent')` shows `{"state":"granted",...}`.
- Run `localStorage.clear()`, reload, click **Reject** → banner disappears, NO initPixel log, `lg_consent` shows `{"state":"denied",...}`.
- Reload after Reject → banner does NOT reappear, NO initPixel log (denied persists).
- Run `localStorage.setItem('lg_consent', JSON.stringify({state:'granted',v:1,ts:1}))`, reload → NO banner, initPixel log fires immediately (granted persists, no geo fetch).

Expected: all four transitions behave as described.

- [ ] **Step 4: Verify the non-EU auto-grant path (stubbed geo, no reload)**

The local `http.server` has no `/cdn-cgi/trace`, so to exercise the non-EU branch directly, run `resolveConsent`'s decision with a stubbed region in the console on the loaded page:

```js
// Region-decision logic mirror (same as detectRegion's parse + GATED check):
const GATED = new Set(['AT','BE','BG','HR','CY','CZ','DK','EE','FI','FR','DE','GR','HU','IE','IT','LV','LT','LU','MT','NL','PL','PT','RO','SK','SI','ES','SE','IS','LI','NO','GB','CH']);
const parse = (txt) => { const m=/(?:^|\n)loc=([A-Z]{2})/.exec(txt); return m?m[1]:null; };
const region = (txt) => { const loc = parse(txt); return loc && GATED.has(loc) ? 'EU' : (loc ? 'NONEU' : 'EU'); };
console.log(region('fl=x\nloc=DE\nwarp=off'));  // -> "EU"     (Germany, gated -> banner)
console.log(region('loc=US'));                  // -> "NONEU"  (US -> auto-grant, no banner)
console.log(region('loc=CH'));                  // -> "EU"     (Switzerland, gated)
console.log(region('no-loc-here'));             // -> "EU"     (missing loc -> fail-safe)
```

Expected: `EU`, `NONEU`, `EU`, `EU` respectively. This confirms non-EU (`US`) auto-grants while EU/CH/unknown gate.

- [ ] **Step 5: Commit**

```bash
cd ~/proekti/listinggems-site
git add assets/site.js
git commit -m "feat(consent): state machine + geo-gated banner (Pixel stubbed)"
```

---

## Task 5: Real Pixel init + StartTrial on download click

Replace the `initPixel()` stub with the real (refactored) Meta snippet — `init` + `PageView` only run here, never on page load. Then hook download clicks to fire `StartTrial`, only when consent is granted.

**Files:**
- Modify: `assets/site.js` (the `initPixel` stub + add a download-click hook)

- [ ] **Step 1: Replace the initPixel stub with the real refactored snippet**

In `assets/site.js`, replace the entire stub `function initPixel() { ... }` with:

```js
  var PIXEL_ID = '1405950224693628';

  function initPixel() {
    if (window.__lgPixelInit) return;
    window.__lgPixelInit = true;
    // Meta Pixel bootstrap (loads fbevents.js + sets up the fbq queue).
    // NOTE: init + PageView are called HERE (consent-gated), not on page load.
    !function (f, b, e, v, n, t, s) {
      if (f.fbq) return; n = f.fbq = function () {
        n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
      };
      if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = '2.0';
      n.queue = []; t = b.createElement(e); t.async = !0;
      t.src = v; s = b.getElementsByTagName(e)[0];
      s.parentNode.insertBefore(t, s);
    }(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
    window.fbq('init', PIXEL_ID);
    window.fbq('track', 'PageView');
  }
```

- [ ] **Step 2: Add a `trackStartTrial()` helper and the download-click hook**

In the same IIFE, add a helper that fires StartTrial only when granted, and a delegated click listener on the download buttons. Add these functions before `function start()`:

```js
  function consentGranted() {
    return window.__lgPixelInit === true && window.fbq;
  }

  function trackStartTrial() {
    // Only fires if the Pixel was initialized (i.e., consent granted).
    if (consentGranted()) {
      window.fbq('trackCustom', 'StartTrial');
    }
  }

  function wireDownloadTracking() {
    // Delegated: one listener, survives any re-render. The download links trigger
    // a file download (not a navigation), so the async beacon flushes fine. We
    // never block or delay the download to send the event.
    document.addEventListener('click', function (e) {
      var a = e.target.closest && e.target.closest('a[data-umami-event^="download-"]');
      if (a) trackStartTrial();
    });
  }
```

- [ ] **Step 3: Call `wireDownloadTracking()` from `start()`**

Update `start()` to also wire download tracking:

```js
  function start() { wireBanner(); wireDownloadTracking(); resolveConsent(); }
```

- [ ] **Step 4: Verify Pixel loads only after consent**

Rebuild and serve (the banner DOM is in the built HTML):

```bash
cd ~/proekti/listinggems-site
node build.js && python3 -m http.server 8787
```

In the browser at `http://localhost:8787/download` with DevTools **Network** tab filtered to `facebook`:
- `localStorage.clear()`, reload. Banner shows (fail-safe EU). **No** request to `connect.facebook.net` (Pixel not initialized).
- Click a **Download** button while banner is still up → file downloads; **no** `facebook` request (pending → not granted).
- `localStorage.clear()`, reload, click **Accept** → now `connect.facebook.net/en_US/fbevents.js` loads and a `PageView` request to `facebook.com/tr` appears.
- Click **Download** again → a second `facebook.com/tr` request with `ev=StartTrial` (custom event) appears.

Expected: zero Meta requests before Accept; `fbevents.js` + `PageView` + `StartTrial` after.

- [ ] **Step 5: Verify denied state never loads the Pixel**

- `localStorage.clear()`, reload, click **Reject**. Click **Download**.

Expected: file downloads; **zero** requests to any `facebook` domain at any point.

- [ ] **Step 6: Commit**

```bash
cd ~/proekti/listinggems-site
git add assets/site.js
git commit -m "feat(pixel): consent-gated init + StartTrial on download click"
```

---

## Task 6: Consent withdrawal ("Cookie settings" link)

GDPR Art. 7(3): withdrawing consent must be as easy as giving it. The link revokes consent, calls `fbq('consent','revoke')`, and deletes the `_fbp`/`_fbc` cookies.

**Files:**
- Modify: `partials/footer-links.html` (add the link)
- Modify: `assets/site.js` (add `withdraw()` + wire the link)

- [ ] **Step 1: Add the footer link**

In `partials/footer-links.html`, add a "Cookie settings" entry. Insert after the `Privacy` link (line 7):

```html
  <a href="/privacy">Privacy</a>
  <a href="#" id="lg-cookie-settings" data-umami-event="cookie-settings">Cookie settings</a>
```

- [ ] **Step 2: Add the `withdraw()` function in site.js**

In the consent IIFE, add a withdrawal function (place it after `deny()`):

```js
  function deleteCookie(name) {
    // Delete on the current host and on the registrable-domain (.listinggems.com),
    // since fbevents.js sets _fbp/_fbc on the eTLD+1.
    var host = location.hostname;
    var base = host.replace(/^www\./, '');
    var expires = 'expires=Thu, 01 Jan 1970 00:00:00 GMT';
    document.cookie = name + '=; ' + expires + '; path=/';
    document.cookie = name + '=; ' + expires + '; path=/; domain=' + host;
    document.cookie = name + '=; ' + expires + '; path=/; domain=.' + base;
  }

  function withdraw() {
    writeState('denied');
    if (window.fbq) { try { window.fbq('consent', 'revoke'); } catch (e) {} }
    deleteCookie('_fbp');
    deleteCookie('_fbc');
    // fbevents.js already loaded this session is left inert; no new events fire.
    // Next page load starts in 'denied' and never inits the Pixel.
  }
```

- [ ] **Step 3: Wire the footer link**

In `start()` (or a small wiring function it calls), attach the handler. Add to `wireBanner()`:

```js
  function wireBanner() {
    var accept = document.getElementById('lg-consent-accept');
    var reject = document.getElementById('lg-consent-reject');
    if (accept) accept.addEventListener('click', grant);
    if (reject) reject.addEventListener('click', deny);
    var settings = document.getElementById('lg-cookie-settings');
    if (settings) settings.addEventListener('click', function (e) {
      e.preventDefault();
      withdraw();
      // Light confirmation without a dependency: reuse the banner as an ack is
      // overkill — a native alert is fine and accessible.
      alert('Ad cookies turned off. The Meta Pixel will not load on future visits.');
    });
  }
```

- [ ] **Step 4: Expose withdraw on the public object**

Update the `window.lgConsent` assignment:

```js
  window.lgConsent = { grant: grant, deny: deny, withdraw: withdraw, readState: readState };
```

- [ ] **Step 5: Verify withdrawal**

```bash
cd ~/proekti/listinggems-site
node build.js && python3 -m http.server 8787
```

In the browser at `http://localhost:8787/` with DevTools **Application → Cookies**:
- `localStorage.clear()`, reload, click **Accept** (Pixel loads; `_fbp` cookie appears).
- Click the footer **Cookie settings** link → `alert` shows; in Application → Cookies, `_fbp` (and `_fbc` if present) are gone; `localStorage` `lg_consent` is now `{"state":"denied",...}`.
- Reload → banner does NOT appear, no `facebook` requests (denied persists).

Expected: cookies cleared, state flips to denied, Pixel never reloads.

- [ ] **Step 6: Commit**

```bash
cd ~/proekti/listinggems-site
git add partials/footer-links.html assets/site.js
git commit -m "feat(consent): withdrawal via Cookie settings (revoke + clear fbp/fbc)"
```

---

## Task 7: Content Security Policy (Report-Only, then enforce)

The site currently has no CSP. Adding one is net-new hardening, but a typo can break styling/analytics — so ship `Report-Only` first, verify zero violations across all pages, THEN flip to enforcing.

**Files:**
- Modify: `_headers`

- [ ] **Step 1: Add CSP in Report-Only mode**

In `_headers`, under the existing `/*` block (after the `Referrer-Policy` line), add a single-line `Content-Security-Policy-Report-Only` header (CSP headers must be one physical line):

```
/*
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Strict-Transport-Security: max-age=31536000; includeSubDomains
  Referrer-Policy: strict-origin-when-cross-origin
  Content-Security-Policy-Report-Only: default-src 'self'; script-src 'self' 'unsafe-inline' https://connect.facebook.net https://cloud.umami.is; connect-src 'self' https://www.facebook.com https://connect.facebook.net https://cloud.umami.is; img-src 'self' data: https://www.facebook.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; frame-src https://www.facebook.com; frame-ancestors 'none'; base-uri 'self'
```

- [ ] **Step 2: Deploy to preview and check for violations**

Deploy the site to a Cloudflare Pages preview (or production if that's the workflow — `_headers` only applies on Cloudflare, not the local `http.server`). Then, in a browser, visit each of these pages with DevTools **Console** open, in BOTH consent states (reject, then accept):

`/`, `/features`, `/download`, `/privacy`, `/terms`, `/refund`, `/about`, `/contact`, `/changelog`, `/photoroom-alternative`, `/removebg-alternative`, `/blog/`, `/blog/why-marketplaces-ban-stock-photos`, `/blog/how-to-erase-restore-brush`

Expected: **zero** `[Report Only]` CSP violation messages in the console on any page in either state. If a violation appears (e.g., an OG image origin, an inline handler, a font), note the blocked URI and add its origin to the matching directive, then re-deploy and re-check. Do not proceed to Step 3 until the console is clean everywhere.

- [ ] **Step 3: Flip to enforcing**

Once Step 2 is clean, change `Content-Security-Policy-Report-Only` to `Content-Security-Policy` (same value):

```
  Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline' https://connect.facebook.net https://cloud.umami.is; connect-src 'self' https://www.facebook.com https://connect.facebook.net https://cloud.umami.is; img-src 'self' data: https://www.facebook.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; frame-src https://www.facebook.com; frame-ancestors 'none'; base-uri 'self'
```

- [ ] **Step 4: Re-verify enforcing mode doesn't break anything**

Re-visit the same page list. Confirm: fonts render, umami still records (check umami dashboard or the `/api/send` request succeeds), the Pixel still loads after Accept, and no enforced CSP errors block resources.

Expected: site fully functional, Pixel works post-consent, no blocked resources.

- [ ] **Step 5: Commit**

```bash
cd ~/proekti/listinggems-site
git add _headers
git commit -m "feat(security): add CSP allowing Meta Pixel (report-only then enforce)"
```

> **MANDATORY soak — do not skip.** The CSP is the ONLY part of this feature that
> cannot be verified on the local `python3 -m http.server` — `_headers` only applies
> on Cloudflare. Steps 1-2 (Report-Only) MUST deploy to a live Cloudflare preview and
> show a clean console across all 14 pages in both consent states BEFORE Step 3 flips
> to enforcing. Never add the CSP and flip it to enforcing in the same deploy — a typo
> or missing origin would break live styling/analytics/Pixel with no prior signal.

---

## Task 8: Update privacy.html

Rewrite the privacy policy to disclose the Pixel honestly. The current page actively claims "cookieless… no cookie consent banner is required" (line ~122) and the meta description claims "no tracking" (line 9) — both become false for the website.

**Files:**
- Modify: `privacy.html`

- [ ] **Step 1: Fix the meta description (line 9)**

Current `privacy.html:9`:

```html
  <meta name="description" content="ListingGems privacy policy. Your images never leave your computer. No cloud uploads, no tracking, no data collection.">
```

Replace with (scopes the no-tracking claim to the app/photos, which stays true):

```html
  <meta name="description" content="ListingGems privacy policy. Your photos never leave your computer — the desktop app has no tracking or telemetry. Our marketing website uses cookieless analytics and, with your consent, the Meta Pixel for ads.">
```

- [ ] **Step 2: Rewrite the "Website Analytics" section**

Replace the existing "Website Analytics" `<h2>` block with two subsections — Umami (unchanged) plus a new Advertising & Cookies disclosure. The current block reads **exactly** as below — match this verbatim as the `old_string` (it contains the false "no cookie consent banner is required" sentence we must remove):

```html
    <h2>Website Analytics</h2>
    <p>Our marketing website (listinggems.com) uses <a href="https://umami.is/" rel="noopener noreferrer" target="_blank">Umami</a>, a privacy-friendly analytics tool, to understand aggregate traffic such as page views and referring sites. Umami is cookieless: it does not set cookies, does not track you across other websites, does not store your IP address, and does not build a profile of you. Because no personal data is collected or stored, no cookie consent banner is required. This analytics applies only to the website &mdash; the desktop application contains no analytics or telemetry.</p>
```

Replace it with:

```html
    <h2>Website Analytics</h2>
    <p>Our marketing website (listinggems.com) uses <a href="https://umami.is/" rel="noopener noreferrer" target="_blank">Umami</a>, a privacy-friendly analytics tool, to understand aggregate traffic such as page views and referring sites. Umami is cookieless: it does not set cookies, does not track you across other websites, does not store your IP address, and does not build a profile of you. This analytics applies only to the website &mdash; the desktop application contains no analytics or telemetry.</p>

    <h2>Advertising &amp; Cookies (Meta Pixel)</h2>
    <p>To measure our advertising on Facebook and Instagram, our marketing website uses the <strong>Meta Pixel</strong>. When active, the Pixel sets cookies (<code>_fbp</code>, and <code>_fbc</code> if you arrive from an ad) and sends event data &mdash; such as a page view or a trial download &mdash; to Meta Platforms Ireland Ltd. For this data, we and Meta act as <strong>joint controllers</strong> as described in Meta&rsquo;s <a href="https://www.facebook.com/legal/controller_addendum" rel="noopener noreferrer" target="_blank">Controller Addendum</a>. The data is used to measure ad performance and build advertising audiences. See Meta&rsquo;s <a href="https://www.facebook.com/privacy/policy/" rel="noopener noreferrer" target="_blank">Privacy Policy</a> for how Meta processes it.</p>
    <p>The Meta Pixel does <strong>not</strong> load until you allow it. For visitors in the EU, EEA, UK, and Switzerland, we show a consent banner and the Pixel only runs after you click &ldquo;Accept.&rdquo; You can change your mind at any time using the <strong>&ldquo;Cookie settings&rdquo;</strong> link in the site footer, which turns the Pixel off and deletes its cookies. The Pixel runs only on the marketing website &mdash; never in the desktop app, and never on your photos.</p>
```

- [ ] **Step 3: Add Meta to the "Third-Party Services" list**

In the `<h2>Third-Party Services</h2>` `<ul>` (around `privacy.html:124-133`), add a Meta entry after the Umami `<li>`:

```html
      <li><strong>Umami</strong> &mdash; Cookieless, privacy-friendly analytics on the marketing website only</li>
      <li><strong>Meta Platforms</strong> &mdash; The Meta Pixel on the marketing website, used (with your consent) to measure Facebook/Instagram ads. Sets cookies; not present in the desktop app.</li>
```

- [ ] **Step 4: Bump the "Last updated" date**

Change `privacy.html` (`<p class="last-updated">Last updated: June 1, 2026</p>`) to:

```html
    <p class="last-updated">Last updated: June 8, 2026</p>
```

- [ ] **Step 5: Rebuild and verify**

```bash
cd ~/proekti/listinggems-site
node build.js && python3 -m http.server 8787
```

Open `http://localhost:8787/privacy`:
- The page renders, shows the new "Advertising & Cookies (Meta Pixel)" section.
- Search the page text — it no longer claims "no cookie consent banner is required."
- The footer shows the "Cookie settings" link (from Task 6).

Expected: updated copy present, contradictory claims gone.

- [ ] **Step 6: Commit**

```bash
cd ~/proekti/listinggems-site
git add privacy.html
git commit -m "docs(privacy): disclose Meta Pixel, consent, joint controllership"
```

---

## Task 9: Verify terms.html + final full-build sanity

**Files:**
- Verify: `terms.html` (no change expected)
- Verify: full build

- [ ] **Step 1: Scan ALL pages for contradictions, not just terms.html**

The "no tracking / cookieless / no consent banner" claim may appear on multiple pages. Scan the whole site:

```bash
cd ~/proekti/listinggems-site
grep -rniE "no tracking|cookieless|consent banner|no cookies|we use no" --include="*.html" . | grep -v docs/
```

Known hits to evaluate (from the plan review): `features.html` and `photoroom-alternative.html` (incl. JSON-LD/FAQ) contain "no tracking" phrases. **For each hit, decide:** is the claim scoped to the **desktop app** (e.g. "the app runs offline, no tracking") — which stays TRUE — or does it describe the **website** — which is now FALSE once the Pixel ships?
- App-scoped claims: leave unchanged (still true; the Pixel is website-only and never touches photos).
- Website-scoped blanket claims (e.g. "this site uses no cookies"): fix minimally to match the new reality, then commit.
- `terms.html` specifically: confirm it has no blanket no-cookies statement.

If any edits are made, commit them: `git commit -am "docs: scope no-tracking claims to the desktop app after Pixel"`. Otherwise no change.

- [ ] **Step 2: Full clean build + assertion passes**

```bash
cd ~/proekti/listinggems-site
node build.js; echo "exit=$?"
node scripts/assert-tracking-markers.test.js
```

Expected: build prints `updated/skipped` summary with `exit=0` and NO `ERROR:` block; the marker test prints `OK:`.

- [ ] **Step 3: Confirm git working tree is clean and review the full diff**

```bash
cd ~/proekti/listinggems-site
git status
git log --oneline -9
```

Expected: clean tree (build is idempotent), and the 8 feature commits present.

- [ ] **Step 4 (optional): Meta Events Manager live validation**

Before the first ad campaign, in Meta Events Manager → **Test Events**, enter the live site URL (deployed), accept consent, and confirm `PageView` + `StartTrial` arrive and are attributed to Pixel `1405950224693628`. This requires the deployed site (Pixel can't reach `localhost`). No code change — purely a go-live confirmation.

---

## Done

After Task 9, the site has: a geo-gated consent banner (EU/EEA/UK/CH), a Pixel that only loads after consent, a `StartTrial` event on download clicks, working consent withdrawal, a CSP allowing Meta, a build-time guarantee that every page carries tracking, and an honest privacy policy. CAPI remains deferred to the future Purchase event per the spec.
