# Facebook Pixel + GDPR Consent — Design

**Date:** 2026-06-08
**Repo:** `listinggems-site` (marketing website only — the desktop app is untouched)
**Status:** Approved design, pending implementation plan

## Goal

Add Facebook (Meta) Pixel to the marketing site so paid Meta (Facebook/Instagram)
ad campaigns can optimize toward and measure the site's real conversion event,
**trial start (= download click)**, while staying compliant with GDPR / ePrivacy.

The purchase happens days later, offline, in the desktop app, with no browser
session reliably tied back to the ad click — so **download/trial-start is the
event Meta can actually attribute and optimize toward**, not purchase.

## Scope decisions (locked during brainstorming)

| Decision | Choice | Rationale |
|---|---|---|
| What we track | **Trial start (download click)** + PageView | Purchase is offline/delayed; Meta can't attribute it. |
| Consent model | **Geo-gated opt-in** | Banner + tracking gate for EU/EEA/UK only; non-EU tracked immediately. |
| Geo detection | **Background `/cdn-cgi/trace`** | Built-in to Cloudflare, no cold start, non-blocking — zero render delay. |
| CAPI now? | **No — Pixel only** | For a no-PII top-of-funnel free-trial event, CAPI's payoff is single-digit %. Deferred to the future Purchase event where it pays off. |
| Desktop app | **Untouched** | "No telemetry, photos never leave your machine" story stays intact. |

### Why CAPI is deferred (not dropped permanently)

CAPI's value is (a) recovering events Pixel loses to ad-blockers/iOS and (b)
better match quality via hashed PII (email/phone). For **this** event neither is
strong: there is **no PII at trial-start** (no email captured on the download
page), and the conversion is a browser click we already control (no server-truth
event the browser structurally misses). CAPI earns its keep on **purchases** —
a real server-side event, real money, and Creem provides the buyer's email to
hash for high match quality. Build CAPI then, via Creem webhook → Worker, where
it pays off. Until then, Pixel alone captures ~70–90% of trial-starts, and the
**GDPR machinery is identical either way** — deferring CAPI costs nothing on
compliance.

## Architecture

Everything lives in the **site repo**. Three concerns:

1. **Consent + Pixel loader** — a shared partial (`partials/tracking.html`)
   injected on every page by the existing `build.js` inliner, plus logic in
   `assets/site.js`. Decides region, shows a banner to EU visitors, initializes
   `fbq` only when allowed, fires `PageView` + `StartTrial`.
2. **Legal/policy updates** — `privacy.html` rewrite (the page currently *claims*
   "cookieless, no consent banner required" — that becomes false), plus a
   cookie/consent disclosure and a "Cookie settings" reopen link.
3. **CSP** — net-new `Content-Security-Policy` in `_headers` allowing Meta's
   `fbevents.js` and beacon endpoints (shipped in Report-Only first, then enforced).

**The core principle:** No Meta script loads and no event fires until there is a
lawful basis. For EU/EEA/UK visitors that basis is **prior opt-in consent**; for
everyone else, tracking starts immediately (geo-gating). The Pixel base code is
therefore *conditionally initialized* — not a normal `<script>` in `<head>`.

## Consent state machine

Persisted in `localStorage` under `lg_consent` as
`{"state":"granted|denied|pending","ts":<unix>,"v":1}`. The `v` (version) lets us
re-prompt if the policy materially changes.

| State | Meaning | Pixel fires? |
|---|---|---|
| `granted` | Non-EU visitor (auto) **or** EU visitor who clicked Accept | ✅ |
| `denied` | EU visitor who clicked Reject | ❌ never |
| `pending` | EU visitor who hasn't answered yet (banner showing) | ❌ not yet |
| *(unset)* | New visitor, geo not yet resolved | ❌ not yet |

### Resolution flow (runs after first paint, non-blocking)

```
Page paints
  └─ read lg_consent
       ├─ granted → init Pixel (skip geo fetch)
       ├─ denied  → do nothing (skip geo fetch)
       └─ unset   → background fetch /cdn-cgi/trace
                      ├─ loc ∈ EU/EEA/UK → state=pending, show banner
                      └─ otherwise       → state=granted, init Pixel
                           banner Accept → state=granted, init Pixel
                           banner Reject → state=denied,  do nothing

Withdrawal (any state → denied), via footer "Cookie settings":
  set state=denied → fbq('consent','revoke') → delete _fbp/_fbc cookies →
  (fbevents.js already loaded this session stays inert; no new events fire;
   next page load starts in `denied` and never inits Pixel)
```

### Key behaviors

1. **Returning visitors never re-fetch geo.** If `lg_consent` is already
   `granted`/`denied`, act on the stored decision and skip `/cdn-cgi/trace`.
   Geo is fetched at most once, only for a brand-new visitor.
2. **Geo-fetch failure → fail safe (treat as EU).** On error, timeout (~1.5s cap),
   or missing `loc`, default to showing the banner (`pending`). Failing toward
   consent is the compliant default — never track when region is unknown.
3. **EU/EEA/UK/CH country set** — hardcoded `Set` of ISO-2 codes in `site.js`
   (27 EU + IS/LI/NO + GB + CH). Switzerland (CH) included because the revised
   Swiss FADP (in force Sept 2023) carries GDPR-like consent expectations. Inline
   constant, no external lookup. **Geo source is IP-based (`/cdn-cgi/trace` `loc`),
   so it is best-effort, not authoritative** — a VPN/proxy can misplace a visitor.
   This is the industry norm and defensible; the fail-safe (treat-as-EU on unknown)
   covers the ambiguous case.
4. **`initPixel()` is idempotent** — a `window.__lgPixelInit` flag prevents
   double-injecting `fbevents.js` or double-counting `PageView`.
5. **Download click is consent-aware, not consent-blocking.** Clicking Download
   **always works** regardless of consent — we only conditionally fire tracking
   around it. Consent must never gate the product.
6. **Pending-state click** — if an EU visitor clicks Download while the banner is
   still up, the download proceeds and no event fires (we don't retroactively fire
   on a later Accept). Small accepted signal loss, simpler + compliant.
7. **Withdrawal actually revokes (GDPR Art. 7(3) parity).** The footer "Cookie
   settings" link does NOT merely reopen the banner — it transitions to `denied`,
   calls `fbq('consent','revoke')`, and **deletes the `_fbp`/`_fbc` cookies**.
   `fbevents.js` already loaded in the current session is left inert (no new events);
   the next page load starts in `denied` and never initializes Pixel. Withdrawing
   must be as easy as granting.

### Pixel ID & snippet refactor

**Pixel ID: `1479028413910220`** (public by nature — inlined in the snippet, no secret).

Meta's standard base snippet **must be refactored, not pasted** — the stock version
auto-fires on load, which is exactly what the consent gate forbids:

- The stock snippet calls `fbq('init', '1479028413910220')` and
  `fbq('track', 'PageView')` **immediately** on script execution. In our design these
  two calls move **inside the consent-gated `initPixel()`** and run only when
  `state === 'granted'`. The `fbq` bootstrap/queue stub (the `!function(f,b,e,…)` IIFE
  that loads `fbevents.js`) may exist, but **`init` + `PageView` must not run until
  consent**. Concretely: `initPixel()` injects `fbevents.js`, then calls `init` then
  `track('PageView')`, guarded by `window.__lgPixelInit`.
- **Drop the `<noscript>` fallback** (`<img …facebook.com/tr?…ev=PageView…>`). It fires
  unconditionally for JS-disabled visitors with **no way to gate consent** (no JS = no
  banner). That is an ungateable tracking call for EU visitors. The signal loss from
  omitting it is negligible (virtually no real users browse with JS off) and it removes
  a compliance hole. Do **not** include the `<noscript>` pixel in `partials/tracking.html`.

### The banner

Minimal, bottom-anchored. Two buttons — **Accept** / **Reject** — equal visual
weight (no dark-pattern hiding of Reject, which GDPR enforcers penalize). One line
of text + a privacy-policy link. Rendered from `partials/tracking.html`, hidden by
default (`display:none`), shown only when state resolves to `pending`. No external
CMP vendor — ~30 lines of vanilla JS, consistent with the zero-dependency site.

## Events

| Event | When | Meta name |
|---|---|---|
| **PageView** | every page, right after `initPixel()` | `PageView` |
| **Trial start** | download-link click (Windows or Linux) | `StartTrial` (custom) |

- Custom `StartTrial` is used (not `Lead`/`CompleteRegistration`) — semantically
  honest (no purchase/lead happened); Meta optimizes toward custom conversions fine.
- **No `Purchase` event** anywhere — offline/delayed, out of scope.
- Hook the existing download triggers (`download.html`, tagged
  `data-umami-event="download-windows"` / `download-linux`) via one delegated
  click listener on `[data-umami-event^="download-"]`, so Umami and Pixel fire off
  the identical action with no duplicate markup.
- **Intentionally NOT hooked:** the nav/hero `trial-start-*` CTAs. Those are links
  *to* the `/download` page, not the download itself — they navigate, they don't
  start a trial. StartTrial fires only on the actual `.exe`/`.AppImage` download
  click, which matches "trial start = download." (If we later want a softer
  top-of-funnel signal, a separate `ViewDownloadPage` event is the clean way, not
  overloading StartTrial onto nav clicks.)

**Delivery reliability.** The download buttons are `<a href="https://dl.listinggems.com/…">`
that trigger a **file download, not a same-tab navigation** — the page is not torn
down, so a normal async `fbq` beacon flushes fine. To be robust anyway (and to
survive the rare case of a browser that navigates), fire via a delivery that
tolerates unload: prefer the Pixel's own beacon, and do not `await` anything on the
click path. Never block or delay the download to send the event.

## Content Security Policy

The site currently has no CSP (only `X-Content-Type-Options`, `X-Frame-Options`,
HSTS, `Referrer-Policy`). Adding Meta means the browser must be allowed to load
`fbevents.js` and reach Meta. We add a CSP — net-new hardening, not a loosening:

```
Content-Security-Policy:
  default-src 'self';
  script-src 'self' 'unsafe-inline' https://connect.facebook.net https://cloud.umami.is;
  connect-src 'self' https://www.facebook.com https://connect.facebook.net https://cloud.umami.is;
  img-src 'self' data: https://www.facebook.com;
  style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
  font-src 'self' https://fonts.gstatic.com;
  frame-src https://www.facebook.com;
  frame-ancestors 'none';
```

> `frame-src https://www.facebook.com` is required: `fbevents.js` injects a hidden
> tracking iframe to `www.facebook.com`. Without it, `default-src 'self'` blocks
> that iframe and degrades match/attribution. (`frame-ancestors 'none'` is a
> different directive — it controls who may embed *us*, not what we embed.)

(Exact directive list finalized during implementation against what each page
actually loads — fonts, umami, inline scripts, OG images.)

**De-risking:** ship first as `Content-Security-Policy-Report-Only`, verify zero
violations in the browser console across **all** pages, then flip to enforcing.
A CSP typo must not take down live styling or analytics.

## Privacy & legal copy (`privacy.html`)

The page currently claims (line ~122) "cookieless… no cookie consent banner is
required." Adding Pixel makes that false — required rewrite, not just an addition:

- **Rewrite "Website Analytics"** → split into *Umami* (unchanged, cookieless) and
  a new **"Advertising & Cookies"** subsection: discloses Meta Pixel, that it sets
  cookies (`_fbp`, `_fbc`), and that we and **Meta act as joint controllers** for
  the data the Pixel collects and transmits (per CJEU *Fashion ID* C-40/17 and
  Meta's Controller Addendum) — use "joint controllers," not the looser "shares
  data with." State it is used for ad measurement and audiences, **fires only after
  consent for EU/EEA/UK/CH visitors**, with a link to Meta's data policy.
- **Fix the page `<meta name="description">`** (currently `privacy.html:9`,
  "No cloud uploads, no tracking, no data collection") — "no tracking" becomes
  misleading once the website Pixel ships. Reword to scope the no-tracking claim to
  the desktop app / your photos (which stays true), not the website.
- **Add Meta Platforms** to the "Third-Party Services" list.
- **New "Your Choices / Consent"** line — how to withdraw consent (the "Cookie
  settings" link revokes consent and clears the Meta cookies) + link to Meta's opt-out.
- **Bump "Last updated"** to June 8, 2026.
- `terms.html` — light check only, no change expected.
- **Footer "Cookie settings" link** (in `partials/footer-links.html`) that
  withdraws consent (see behavior #7 — revoke + clear cookies, not just reopen) —
  GDPR requires withdrawal to be as easy as giving consent.

## File-by-file changes (site repo only)

| File | Change |
|---|---|
| `partials/tracking.html` | **New.** Banner markup (hidden) + conditional Pixel snippet container. Inlined site-wide. |
| `build.js` | Register `tracking` partial in `PARTIALS`. **Add a build-time assertion** (see below) that fails the build if any non-excluded `.html` is missing the `tracking` markers. |
| *(every non-excluded `.html` file, by hand)* | Insert `<!-- @begin tracking --><!-- @end tracking -->` markers before `</body>`. **This is NOT automatic** — see the build.js caveat below. ~20+ files including all `blog/*.html`. |
| `assets/site.js` | Consent state machine, background `/cdn-cgi/trace` geo, EU country set, idempotent `initPixel()`, banner handlers, delegated download-click → `StartTrial`, "Cookie settings" reopen. |
| `partials/footer-links.html` | Add "Cookie settings" link. |
| `_headers` | Add CSP — Report-Only first, then enforce. |
| `privacy.html` | Rewrite analytics section, add Meta to third-party list, consent/withdrawal copy, meta-description fix, date bump. |

**No `functions/` directory, no Meta access-token secret, no Worker changes.**
The only config is the Pixel ID `1479028413910220`, which is public (inlined in
the snippet) — no environment variable or secret required.

### ⚠️ build.js caveat — inlining is NOT fully automatic (highest practical risk)

`build.js` only **replaces content between markers that already exist** in a file
(`build.js:74-93`); it does **not insert** markers. A file with no `tracking`
markers is silently skipped ("no markers"), shipping **with no banner and no Pixel
and no error**. On a GDPR feature this is the dangerous failure mode in two
directions:

- **Compliance:** a page where the consent-gate JS didn't load but a banner partial
  is half-present could, if mis-wired, fire Pixel pre-consent to an EU visitor.
- **Revenue:** a page missing the tracking block produces no `StartTrial`.

**Mitigation — a build-time assertion in `build.js`:** after inlining, assert that
**every** non-excluded `.html` file contains the `@begin tracking`/`@end tracking`
markers; if any is missing, **fail the build** with the offending file list. This
converts "silently missing on some page" into a hard, pre-deploy error. The
`EXCLUDED_FILES`/`EXCLUDED_DIRS` sets (`build.js:27-28`) define the allowlist of
files that legitimately have no markers (e.g. `blog/_template.html`).

## Testing / verification

1. **Build assertion:** `node build.js` passes only when every non-excluded `.html`
   carries the `tracking` markers; deliberately remove markers from one file and
   confirm the build **fails** with that file named.
2. **Coverage:** grep the built output — every page (incl. all `blog/*.html`)
   contains the inlined banner + Pixel snippet container.
3. **Render:** pages paint immediately; no banner flash for a simulated non-EU visitor.
4. **State walk:** force `denied`/`pending`/`granted` (+ a stubbed `loc`); confirm
   `connect.facebook.net` / `www.facebook.com` calls appear **only** in `granted`,
   never in `pending`/`denied`.
5. **Withdrawal:** from `granted`, click "Cookie settings" → confirm `_fbp`/`_fbc`
   cookies are deleted, `fbq('consent','revoke')` fires, and no further events go out;
   reload → starts `denied`, Pixel never inits.
6. **Download integrity:** in every consent state, clicking Download still downloads.
7. **Meta Events Manager → Test Events:** with a temporary test code, verify
   `PageView` + `StartTrial` arrive and attribute; remove test code before deploy.
8. **CSP:** Report-Only → zero console violations across all pages (fonts, umami,
   inline scripts/JSON-LD, FB iframe) → then enforce.
9. **Fail-safe:** block `/cdn-cgi/trace` → banner shows (fails toward consent).

## Out of scope (deferred)

- **CAPI** — deferred to the future **Purchase** event (Creem webhook → Worker),
  where server-truth + hashable email make it worthwhile.
- **Desktop app** — untouched.
