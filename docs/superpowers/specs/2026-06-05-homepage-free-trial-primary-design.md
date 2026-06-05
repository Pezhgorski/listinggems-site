# Homepage: make the free 7-day trial the primary conversion vehicle

**Date:** 2026-06-05
**Repo:** `listinggems-site` (Cloudflare Pages)
**Status:** Approved design, ready for implementation plan

## Problem

ListingGems 0.3.x added a **free 7-day trial** (full features, no credit card, email
only, works offline — started inside the desktop app on first run). It is now the
biggest conversion lever, but the marketing site does not mention it anywhere:

- **`index.html`** leads every CTA with **"Buy Now — $49"** and uses the 45-day
  money-back guarantee as the only risk-reducer. That asks for a card before the
  visitor has seen the product work.
- **`download.html`** still says *"Free to download. Activate with your license key to
  unlock all features."* — which now **contradicts** the trial (you get full features
  for 7 days with no key).
- **The Windows download button points to `releases/0.2.0/`** (pre-trial) even though
  **Windows 0.3.1 is already live in R2** — a stale link, not a missing build.

## How the trial actually works (constraints this design must respect)

- The **website cannot start a trial.** The trial begins inside the app: the desktop
  client sends `{ email, machine_uid, app_version }` to the Worker (`/trial/start`),
  which returns a signed token + `expires_at`. The site has no machine ID and cannot
  mint a trial.
- Therefore every **"Start free trial"** button on the site routes to **`/download`**,
  and the download page is the trial on-ramp that explains the steps.
- Trial promise (verified against the app — `App.tsx:54-56`): the `TrialActive` gate
  sets the same `activated = true` flag as the paid `Active` gate, and the whole app
  gates only on `activated`. There is **no separate feature-gating for trial** — trial
  and paid render the identical full app. The gate validates the signed trial token
  locally, so it works offline like the paid license. The promise is therefore literally
  true: **7 days · every feature unlocked · no credit card · email only · works fully
  offline** (same as paid). (Note: the in-app WelcomeScreen copy only *says* "Try it
  free for 7 days" — the "every feature / offline" framing is new to the marketing copy
  but is accurate to the code.) After it ends, the user buys a license to continue
  (in-app `LicenseModal` or the website pricing CTA).

## Decision: trial fully primary

"Start free trial" becomes the primary CTA across the homepage; "Buy now — $49" stays
present as a quieter secondary option for ready-to-buy visitors. The 45-day money-back
guarantee remains true but moves out of the hero down to the pricing section (it is no
longer the headline reassurance — the no-card trial is).

## Scope

### 1. `index.html`

1. **Nav (desktop `nav-right` + mobile panel):** primary CTA becomes **"Start free
   trial"** → `/download`. Add a smaller secondary **"Buy $49"** link → `/#pricing`.
   New umami event `trial-start-nav`; keep `buy-now-nav` on the secondary link.
   **IMPORTANT — the nav is a shared partial.** Edit **`partials/nav.html`**, then run
   `node build.js` to re-inline it into all pages between the `@begin nav`/`@end nav`
   markers. Do NOT edit the nav block inside `index.html` directly (it will be
   overwritten). This change is site-wide by design — the primary CTA becomes "Start
   free trial" on every page, which is the intended trial-primary behavior. Note: the
   nav partial carries `<script src="/assets/site.js" defer>` inside the nav markers;
   it re-inlines correctly (not duplicated).

   **Shared partials in general:** `build.js` registers TWO partials — `nav`
   (`partials/nav.html`) AND `footer-links` (`partials/footer-links.html`). Both are
   re-inlined on every `node build.js` run. This design does not edit the footer, but
   if any footer change is added later, edit `partials/footer-links.html`, NOT the
   inlined `@begin footer-links` blocks in `index.html`/`download.html` (they get
   reverted on build).
2. **Hero (`hero-cta-group`):**
   - Badge unchanged ("Launch Sale — Save 38%").
   - Primary button **"Start your free 7-day trial"** → `/download`
     (umami `trial-start-hero`).
   - Secondary button **"Buy now — $49 ~~$79~~"** → `#pricing`
     (umami `buy-now-hero`, preserved).
   - Replace the `.hero-guarantee` line with trust microcopy:
     **"No card required · Full features · Works offline"**.
3. **Pricing section** ("One price. One time."): keep the $49 card unchanged. Add one
   line near the CTA: **"Not sure yet? Start a free 7-day trial first — no card
   needed."** → `/download` (umami `trial-start-pricing`). Keep the existing 45-day
   guarantee line here.
4. **Final CTA band (bottom):** primary becomes **"Start free trial"** → `/download`
   (umami `trial-start-footer`), with **"or buy now — $49"** as a secondary text link
   → `#pricing`.
5. **FAQ:** add one entry **"Is there a free trial?"** with the approved answer:
   > Yes — 7 days with every feature unlocked. No credit card, just your email. Works
   > fully offline. Buy a license anytime after to keep going.
   Also add the matching JSON-LD `FAQPage` `Question`/`Answer` entry to the existing
   FAQ schema block (`index.html:60-204`). Add ONLY the new trial Q&A to both places.
   Note: the visible FAQ and the JSON-LD are already not 1:1 today (visible has more
   entries than the schema) — do NOT attempt to reconcile the pre-existing gap; that is
   out of scope and would balloon the diff.

### 2. `download.html`

1. **Subtitle** → *"Free to download. Start a 7-day free trial — full features, no card.
   Just enter your email when you open the app."*
2. **3-step strip** above the platform cards:
   **1.** Download & install · **2.** Open it, enter your email · **3.** 7 days, full
   features, no card. (Styled with existing dark/emerald theme; reuse card/badge styles.)
3. **Windows download button:** bump `releases/0.2.0/ListingGems_0.2.0_x64-setup.exe` →
   `releases/0.3.1/ListingGems_0.3.1_x64-setup.exe` (confirmed live in R2,
   `content-type: application/x-msdownload`, 14.5 MB). Update the `.file-size` note to
   ~15 MB.
4. **`.activation-note`** rewrite → *"After your trial, buy a license for $49 to keep
   going — one-time, no subscription."* (link to `index.html#pricing`). Remove the
   misleading "requires a license key to unlock all features." line.
   **KEEP the `#purchaseBanner` block** (`download.html:166-168`, "Open ListingGems
   after installing and paste your key to activate.") — that is post-purchase flow copy,
   shown only when redirected from Creem, and is still correct. The "remove license-key
   copy" cleanup applies ONLY to the always-visible subtitle / activation-note / meta,
   NOT the purchase banner.
5. **Meta description** (`download.html:9`) update to mention the free trial (currently
   "Free download — activate with your license key after purchase.").

### 3. Styling

- Reuse existing classes: `btn-primary`, `nav-cta`, `price-old-hero`, `price-old`,
  `hero-cta-group`, `platform-card`.
- Add minimal **secondary-button** styling (outline / muted emerald) consistent with the
  dark theme (zinc-800/900 bg, emerald accent) for the new "Buy now" secondary buttons.
  No new colors or framework.

## Out of scope (YAGNI)

- No change to the in-app trial flow, Worker, or `LicenseModal`.
- No new Windows build (0.3.1 is already shipped to R2).
- No A/B testing harness — straight copy/layout change.
- No changes to `features.html`, comparison pages, or blog (the homepage + download page
  are the conversion path; comparison pages can adopt trial copy in a later pass if
  desired, but not required here).
- No change to the 45-day guarantee policy itself (only its placement).

## Acceptance criteria

- Every primary CTA on `index.html` (nav, hero, final band) reads "Start free trial" /
  "Start your free 7-day trial" and links to `/download`; a secondary "Buy" option is
  present at each.
- Pricing section retains the $49 buy flow and gains a trial nudge + keeps the 45-day
  guarantee.
- New trial FAQ appears both visibly and in the FAQ JSON-LD.
- `download.html` reads as a trial on-ramp (subtitle + 3 steps + corrected activation
  note) and the **Windows button points to 0.3.1**.
- No stale "requires a license key to unlock all features" copy remains.
- `node build.js` runs clean and re-inlines the updated `partials/nav.html` into all
  pages (idempotent: a second run produces no diff).

## Verification

- Visual: load `index.html` and `download.html` locally (or via the site preview),
  confirm CTAs, copy, and the Windows link.
- `curl -sI https://dl.listinggems.com/releases/0.3.1/ListingGems_0.3.1_x64-setup.exe`
  returns 200 (already verified 2026-06-05).
- Confirm umami event names are unique and consistent.
