# Homepage Free-Trial-Primary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the free 7-day trial the primary call-to-action across the ListingGems marketing homepage and reframe the download page as the trial on-ramp, while keeping "Buy now — $49" available as a secondary option.

**Architecture:** This is a static HTML/CSS site (Cloudflare Pages) with a zero-dependency Node partial-inliner (`build.js`) that re-inlines `partials/nav.html` and `partials/footer-links.html` into every page between `@begin`/`@end` markers. Shared styles live in `assets/site.css`; `index.html` and `download.html` also have page-local `<style>` blocks. There is no test runner — verification is `node build.js` (must be idempotent) plus `grep` assertions that the expected copy, links, and umami events are present.

**Tech Stack:** Static HTML, CSS (light theme: `--bg-main:#f8fafb`, white cards, `--emerald-deep:#047857` accent — NOT a dark theme), Node 18+ stdlib (`build.js`), Cloudflare Pages, R2.

**Spec:** `docs/superpowers/specs/2026-06-05-homepage-free-trial-primary-design.md`

**Do NOT commit anything** — the requester will review the working tree before any commit. The "Commit" steps below are replaced by "leave staged/unstaged for review."

---

## Pre-flight: baseline

- [ ] **Step 0.1: Confirm a clean baseline build is idempotent**

Run:
```bash
cd ~/proekti/listinggems-site && node build.js && git status --short
```
Expected: command runs without error; `git status --short` shows only the untracked `.wrangler/` and `releases/` dirs (pre-existing local artifacts — DO NOT touch them) and no modified tracked files. If tracked files show as modified before you've made any edit, STOP — the working tree is not clean.

---

## Task 1: Nav partial — trial-primary CTA (site-wide)

The nav is a **shared partial**. Edit `partials/nav.html`, then `node build.js` re-inlines it into every page. Do NOT edit the inlined nav blocks in `index.html`/`download.html` directly.

**Files:**
- Modify: `partials/nav.html:21-24` (desktop CTA) and `partials/nav.html:42-43` (mobile panel)
- Modify: `assets/site.css` (add `.nav-cta-secondary` style after line 85)
- Regenerate: all pages via `node build.js`

- [ ] **Step 1.1: Replace the desktop nav CTA (primary trial + secondary buy)**

In `partials/nav.html`, replace lines 21-24:
```html
    <div class="nav-right">
      <a href="/#pricing" class="nav-cta" data-umami-event="buy-now-nav">
        Buy Now &mdash; $49 <span class="price-old">$79</span>
      </a>
```
with:
```html
    <div class="nav-right">
      <a href="/#pricing" class="nav-cta-secondary" data-umami-event="buy-now-nav">Buy $49</a>
      <a href="/download" class="nav-cta" data-umami-event="trial-start-nav">Start free trial</a>
```
(Primary emerald button = trial; muted secondary = buy. Trial sits rightmost so it reads as the primary action next to the hamburger.)

- [ ] **Step 1.2: Add a trial link to the mobile nav panel**

In `partials/nav.html`, after line 43 (`<a href="/blog/" ...>Blog</a>` / the `Download` line), the mobile panel currently ends with the Download link. Replace line 43:
```html
    <a href="/download" data-umami-event="nav-download-mobile">Download</a>
```
with:
```html
    <a href="/download" data-umami-event="trial-start-nav-mobile">Start free trial</a>
    <a href="/#pricing" data-umami-event="buy-now-nav-mobile">Buy &mdash; $49</a>
```

- [ ] **Step 1.3: Add the secondary nav button style**

In `assets/site.css`, immediately after line 85 (`.nav-cta .price-old { ... }`), add:
```css
.nav-cta-secondary {
  display: inline-flex;
  align-items: center;
  padding: 8px 16px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  text-decoration: none;
  white-space: nowrap;
  color: var(--emerald-deep);
  background: var(--emerald-glow);
  border: 1px solid rgba(5, 150, 105, 0.25);
  transition: background 0.2s, transform 0.15s;
}
.nav-cta-secondary:hover { background: rgba(5, 150, 105, 0.14); transform: translateY(-1px); }
```

- [ ] **Step 1.4: Rebuild and verify the partial inlined into all pages**

Run:
```bash
cd ~/proekti/listinggems-site && node build.js && grep -c "trial-start-nav\"" index.html download.html features.html about.html
```
Expected: each listed file reports `1` (the desktop trial CTA was inlined into every page). If `index.html` shows `0`, the build did not run or the marker block is malformed.

- [ ] **Step 1.5: Verify idempotency**

Run:
```bash
cd ~/proekti/listinggems-site && node build.js && git diff --stat
```
Expected: a second `node build.js` produces NO further changes beyond Step 1.4 (idempotent). `git diff --stat` should list the page files changed once, not growing on rerun.

---

## Task 2: Hero — trial-primary + trust microcopy

**Files:**
- Modify: `index.html:1162-1166` (hero CTA group + guarantee line)
- Modify: `index.html` inline `<style>` — add `.btn-secondary` after `.btn-primary:hover` (line 472), and `.hero-trust` style

- [ ] **Step 2.1: Replace the hero CTA group + guarantee line**

In `index.html`, replace lines 1162-1166:
```html
        <div class="hero-cta-group animate-in delay-3">
          <a href="#pricing" class="btn-primary" data-umami-event="buy-now-hero">Buy Now &mdash; $49</a>
          <span class="price-old-hero">$79</span>
        </div>
        <p class="hero-guarantee animate-in delay-3"><a href="/refund" data-umami-event="guarantee-hero">45-day money-back guarantee</a> &middot; No questions asked</p>
```
with:
```html
        <div class="hero-cta-group animate-in delay-3">
          <a href="/download" class="btn-primary" data-umami-event="trial-start-hero">Start your free 7-day trial</a>
          <a href="#pricing" class="btn-secondary" data-umami-event="buy-now-hero">Buy now &mdash; $49 <span class="price-old-hero">$79</span></a>
        </div>
        <p class="hero-trust animate-in delay-3">No card required &middot; Full features &middot; Works offline</p>
```

- [ ] **Step 2.2: Add `.btn-secondary` and `.hero-trust` styles**

In `index.html`, immediately after line 472 (the closing `}` of `.btn-primary:hover`), add:
```css
    .btn-secondary {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      background: transparent;
      color: var(--emerald-deep);
      padding: 14px 28px;
      border-radius: 10px;
      font-size: 16px;
      font-weight: 700;
      text-decoration: none;
      border: 1.5px solid var(--emerald-deep);
      cursor: pointer;
      transition: background 0.2s, transform 0.15s;
    }
    .btn-secondary:hover {
      background: var(--emerald-glow);
      transform: translateY(-2px);
    }
    .btn-secondary .price-old-hero { font-size: 14px; }
    .hero-trust {
      font-size: 13px;
      color: var(--text-muted);
      font-weight: 600;
    }
```

- [ ] **Step 2.3: Verify hero copy and links**

Run:
```bash
cd ~/proekti/listinggems-site && grep -n "Start your free 7-day trial" index.html && grep -n "trial-start-hero" index.html && grep -n "hero-trust" index.html
```
Expected: the trial CTA text, the `trial-start-hero` event, and the `.hero-trust` line all appear. Confirm the old `hero-guarantee` line is gone: `grep -c "hero-guarantee" index.html` should print `0`.

---

## Task 3: Pricing section — trial nudge (keep buy + guarantee)

**Files:**
- Modify: `index.html:1531-1532`

- [ ] **Step 3.1: Add a trial nudge below the pricing CTA**

In `index.html`, replace lines 1531-1532:
```html
      <a href="https://www.creem.io/payment/prod_3h9qK2NG9j7ZDaIalnQc7V" class="btn-primary pricing-cta" data-umami-event="buy-now-pricing">Buy Now &mdash; Risk Free</a>
      <p class="pricing-guarantee"><a href="/refund" data-umami-event="guarantee-pricing">45-day money-back guarantee</a> &middot; No questions asked</p>
```
with:
```html
      <a href="https://www.creem.io/payment/prod_3h9qK2NG9j7ZDaIalnQc7V" class="btn-primary pricing-cta" data-umami-event="buy-now-pricing">Buy Now &mdash; Risk Free</a>
      <p class="pricing-guarantee"><a href="/refund" data-umami-event="guarantee-pricing">45-day money-back guarantee</a> &middot; No questions asked</p>
      <p class="pricing-guarantee">Not sure yet? <a href="/download" data-umami-event="trial-start-pricing">Start a free 7-day trial first</a> &mdash; no card needed.</p>
```
(Reuses the existing `.pricing-guarantee` style; the guarantee line stays.)

- [ ] **Step 3.2: Verify**

Run:
```bash
cd ~/proekti/listinggems-site && grep -n "trial-start-pricing" index.html && grep -c "guarantee-pricing" index.html
```
Expected: `trial-start-pricing` present once; `guarantee-pricing` still present (`1`) — buy + guarantee NOT removed.

---

## Task 4: Footer CTA band — trial-primary

**Files:**
- Modify: `index.html:1627-1630`

- [ ] **Step 4.1: Replace the footer CTA buttons**

In `index.html`, replace lines 1627-1630:
```html
    <div class="hero-cta-group" style="justify-content: center;">
      <a href="#pricing" class="btn-primary" data-umami-event="buy-now-footer">Buy Now &mdash; $49</a>
      <span class="price-old-hero">$79</span>
    </div>
```
with:
```html
    <div class="hero-cta-group" style="justify-content: center;">
      <a href="/download" class="btn-primary" data-umami-event="trial-start-footer">Start free trial</a>
      <a href="#pricing" class="btn-secondary" data-umami-event="buy-now-footer">or buy now &mdash; $49</a>
    </div>
```

- [ ] **Step 4.2: Verify**

Run:
```bash
cd ~/proekti/listinggems-site && grep -n "trial-start-footer" index.html
```
Expected: one match.

---

## Task 5: FAQ — visible entry + JSON-LD

**Files:**
- Modify: `index.html:1544` area (insert new visible FAQ item as the FIRST item)
- Modify: `index.html:65-73` area (insert new JSON-LD Question as the FIRST `mainEntity`)

Add ONLY the new trial Q&A. Do NOT attempt to reconcile the pre-existing mismatch between the visible FAQ (more items) and the JSON-LD (fewer items) — out of scope.

- [ ] **Step 5.1: Insert the visible FAQ item (first in the list)**

In `index.html`, immediately AFTER line 1541 (`<div class="faq-list">`) and BEFORE line 1542 (the first `<div class="faq-item">`), insert:
```html
      <div class="faq-item">
        <button class="faq-question">Is there a free trial? <span class="faq-toggle">+</span></button>
        <div class="faq-answer"><p>Yes &mdash; 7 days with every feature unlocked. No credit card, just your email. Works fully offline. Buy a license anytime after to keep going.</p></div>
      </div>
```

- [ ] **Step 5.2: Insert the matching JSON-LD Question (first in mainEntity)**

In `index.html`, immediately AFTER line 65 (`"mainEntity": [`) and BEFORE line 66 (the first `{`), insert:
```json
      {
        "@type": "Question",
        "name": "Is there a free trial?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Yes — 7 days with every feature unlocked. No credit card, just your email. Works fully offline. Buy a license anytime after to keep going."
        }
      },
```

- [ ] **Step 5.3: Verify FAQ + valid JSON-LD**

Run:
```bash
cd ~/proekti/listinggems-site && grep -c "Is there a free trial?" index.html
```
Expected: `2` (one visible, one in JSON-LD).

Then validate the JSON-LD parses (the inserted comma must not break it):
```bash
cd ~/proekti/listinggems-site && node -e "const fs=require('fs');const h=fs.readFileSync('index.html','utf8');const m=h.match(/<script type=\"application\/ld\+json\">([\s\S]*?)<\/script>/);JSON.parse(m[1]);console.log('FAQ JSON-LD OK')"
```
Expected: prints `FAQ JSON-LD OK`. If it throws, the inserted JSON has a trailing/missing comma — fix it.

---

## Task 6: Download page — trial on-ramp + Windows link bump

**Files:**
- Modify: `download.html:9` (meta description)
- Modify: `download.html:171` (subtitle)
- Modify: `download.html` (insert 3-step strip before `.platforms`, ~line 173) + its CSS in the page `<style>`
- Modify: `download.html:181` (Windows download URL) and `download.html:185` (file size)
- Modify: `download.html:227-229` (activation-note)
- KEEP: `download.html:166-168` purchaseBanner unchanged

- [ ] **Step 6.1: Update meta description**

In `download.html`, replace line 9:
```html
  <meta name="description" content="Download ListingGems for Windows or Linux. Free download — activate with your license key after purchase.">
```
with:
```html
  <meta name="description" content="Download ListingGems for Windows or Linux. Start a free 7-day trial — full features, no credit card. Just enter your email when you open the app.">
```

- [ ] **Step 6.2: Update the subtitle**

In `download.html`, replace line 171:
```html
    <p class="subtitle">Free to download. Activate with your license key to unlock all features.</p>
```
with:
```html
    <p class="subtitle">Free to download. Start a 7-day free trial &mdash; full features, no card. Just enter your email when you open the app.</p>
```

- [ ] **Step 6.3: Add the 3-step strip CSS**

In `download.html`, inside the page `<style>` block, immediately after line 70 (`.file-size { ... }`), add:
```css
    /* Trial steps */
    .trial-steps {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 16px;
      margin-bottom: 36px;
    }
    .trial-step {
      background: var(--bg-main);
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 20px 18px;
      text-align: center;
    }
    .trial-step .num {
      display: inline-flex; align-items: center; justify-content: center;
      width: 28px; height: 28px; margin-bottom: 10px;
      background: var(--emerald-deep); color: white;
      border-radius: 50%; font-size: 14px; font-weight: 700;
    }
    .trial-step p { font-size: 14px; color: var(--text-secondary); margin: 0; }
    @media (max-width: 600px) {
      .trial-steps { grid-template-columns: 1fr; }
    }
```

- [ ] **Step 6.4: Insert the 3-step strip markup before the platform cards**

In `download.html`, immediately BEFORE the `<div class="platforms">` line (line 173), insert:
```html
    <div class="trial-steps">
      <div class="trial-step"><span class="num">1</span><p>Download &amp; install</p></div>
      <div class="trial-step"><span class="num">2</span><p>Open it, enter your email</p></div>
      <div class="trial-step"><span class="num">3</span><p>7 days, full features, no card</p></div>
    </div>

```

- [ ] **Step 6.5: Bump the Windows download to 0.3.1**

In `download.html`, in the Windows platform-card (around line 181), replace:
```html
        <a href="https://dl.listinggems.com/releases/0.2.0/ListingGems_0.2.0_x64-setup.exe" class="download-btn" data-umami-event="download-windows">
```
with:
```html
        <a href="https://dl.listinggems.com/releases/0.3.1/ListingGems_0.3.1_x64-setup.exe" class="download-btn" data-umami-event="download-windows">
```
And update the Windows `.file-size` (around line 185) from:
```html
        <div class="file-size">~14 MB</div>
```
to:
```html
        <div class="file-size">~15 MB</div>
```
(Verified live: `https://dl.listinggems.com/releases/0.3.1/ListingGems_0.3.1_x64-setup.exe` returns 200, 14.5 MB.)

- [ ] **Step 6.6: Rewrite the activation note (keep purchaseBanner)**

In `download.html`, replace the activation-note block (lines 227-229):
```html
    <div class="activation-note">
      <p>ListingGems requires a license key to unlock all features.</p>
      <p>Don't have a key yet? <a href="index.html#pricing">Purchase for $49</a> &mdash; one-time, no subscription.</p>
    </div>
```
with:
```html
    <div class="activation-note">
      <p>Your 7-day trial unlocks every feature &mdash; no card needed.</p>
      <p>After your trial, <a href="index.html#pricing">buy a license for $49</a> to keep going &mdash; one-time, no subscription.</p>
    </div>
```
Do NOT touch the `#purchaseBanner` block at lines 166-168 — it is correct post-purchase copy.

- [ ] **Step 6.7: Verify download page**

Run:
```bash
cd ~/proekti/listinggems-site && grep -c "releases/0.2.0" download.html && grep -c "releases/0.3.1" download.html && grep -c "trial-steps" download.html && grep -c "requires a license key to unlock all features" download.html && grep -c "paste your key to activate" download.html
```
Expected output, in order: `0` (no stale Windows link), `1` (Windows now 0.3.1), `1` (steps strip present), `0` (misleading line gone), `1` (purchaseBanner KEPT).

---

## Task 7: Final build + whole-tree verification

- [ ] **Step 7.1: Run the build once more and confirm idempotency**

Run:
```bash
cd ~/proekti/listinggems-site && node build.js && node build.js && echo "BUILD OK"
```
Expected: prints `BUILD OK` with no errors; running twice in a row leaves identical output.

- [ ] **Step 7.2: Confirm all new umami events are present and unique**

Run:
```bash
cd ~/proekti/listinggems-site && for e in trial-start-nav trial-start-nav-mobile trial-start-hero trial-start-pricing trial-start-footer; do printf "%s: " "$e"; grep -rho "$e" *.html | wc -l; done
```
Expected: every event count ≥ 1. (`trial-start-nav` will be >1 because the nav partial is inlined into every page — that's expected and correct.)

- [ ] **Step 7.3: Show the full working-tree diff for review (do NOT commit)**

Run:
```bash
cd ~/proekti/listinggems-site && git status --short && git --no-pager diff --stat
```
Expected: modified tracked files are `partials/nav.html`, `assets/site.css`, `index.html`, `download.html`, and the other pages re-inlined by the build (`features.html`, `about.html`, `contact.html`, `changelog.html`, `photoroom-alternative.html`, `removebg-alternative.html`, `refund.html`, `privacy.html`, `terms.html`, `blog/*`) — only their nav blocks changed. Leave everything uncommitted for the requester to review.

---

## Notes for the implementer

- **Line numbers are approximate; match on the quoted text.** Task 1's `node build.js`
  re-inlines the nav into `index.html`, which shifts the line numbers used in Tasks 2–5.
  Always locate each edit by the exact quoted `old` snippet (which is unique in the
  file), not by the line number. Do Task 1 first, then re-derive positions for later
  tasks from the snippets.
- **Light theme, not dark.** The marketing site uses a light theme (`--bg-main:#f8fafb`, white cards). Ignore any "dark/zinc" wording — that's the desktop app, not this site. All new CSS above already uses the site's light-theme variables.
- **Nav/footer are shared partials.** Only edit `partials/nav.html` (and, if ever needed, `partials/footer-links.html`), then `node build.js`. Never hand-edit the inlined `@begin nav`/`@begin footer-links` blocks in page files.
- **Windows auto-updater is out of scope** and currently blocked on a missing `.sig` (see spec "Known gap"). This plan only bumps the download *button*, which is what new trial users need.
- **No commits.** Per the requester, leave all changes in the working tree for review.
