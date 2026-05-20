# Mobile hamburger menu + shared nav/footer partials

**Date:** 2026-05-20
**Repo:** `listinggems-site` (Cloudflare Pages)
**Status:** Approved design, ready for implementation

## Problem

On viewports ≤768px, the site nav hides `.nav-links` (Features / Compare / Blog / Download) entirely, leaving only the logo and the Buy Now CTA. Mobile visitors have no way to reach any internal page from the top of any page.

A secondary problem surfaced while planning the fix: the `<nav>` block is duplicated across 12 HTML pages, and the `.footer-links` block is duplicated across all main pages. Adding hamburger markup to every page would multiply this duplication. The duplication should be eliminated first.

## Goals

1. Mobile visitors (≤768px) can reach every top-level page from any page via a hamburger menu.
2. Nav markup lives in one file (`partials/nav.html`) and is inlined into every page.
3. The shared `.footer-links` block lives in one file (`partials/footer-links.html`) and is inlined into every page.
4. The per-page `.footer-cta` headline/CTA stays per-page (copy varies).
5. Pages remain valid, openable HTML — no client-side fetch flash, no build-step dependency for local preview after build has run.
6. Cloudflare Pages deploys with a single build command.

## Non-goals

- Replacing the entire site with a static site generator. Build script stays a single ~60-line Node file with zero npm dependencies.
- Migrating the `.footer-cta` headline/CTA into the partial. Per-page copy differences (e.g., index.html says "Stop paying monthly to remove backgrounds" while features.html says "Ready to upgrade your listing photos?") are intentional and stay.
- Redesigning the desktop nav. Desktop behavior is unchanged.

## Architecture

### Build approach: in-place managed regions

A small Node script (`build.js`) walks every `*.html` in the repo and replaces content between paired comment markers with the contents of a partial file. Source pages remain valid HTML so they open correctly in a browser without a build step.

**Marker format:**

```html
<!-- @begin nav -->
...current nav contents (overwritten on each build)...
<!-- @end nav -->
```

```html
<!-- @begin footer-links -->
...current footer-links contents (overwritten on each build)...
<!-- @end footer-links -->
```

**Build script behavior:**

- Reads `partials/nav.html` and `partials/footer-links.html` into strings.
- Walks every `.html` file under the repo root (excluding `partials/`, `node_modules/`, `.git/`, and `updates/` — the updater manifest files).
- For each marker pair found, replaces everything between (exclusive of the marker lines themselves) with the partial contents.
- Writes the result back to the same file.
- Idempotent: re-running on already-built pages produces no diff.
- Logs which files were modified and which marker pairs were missing.

**Cloudflare Pages build command:** `node build.js`
**Build output directory:** root (unchanged — `build.js` modifies in place)

### Why this approach (vs. alternatives)

| Approach | Rejected because |
|---|---|
| Client-side fetch + inject | Empty-nav flash on slow connections; nav links missing from initial HTML hurts SEO. |
| Web Component `<site-nav>` | Same flash problem; Shadow DOM complicates reuse of `site.css`. |
| Separate `dist/` build output | Requires reconfiguring Cloudflare Pages; harder to preview pages locally with file:// or simple HTTP. |
| Jekyll / Eleventy / etc. | Pulls in a real toolchain for a problem solvable in 60 lines of Node. |

In-place managed regions keep the repo flat, every page openable without a build, and partials trivial to edit.

## Partials

### `partials/nav.html`

Single source of truth for the nav block. Used by all pages. Key design points:

- **URLs are site-root-absolute and extensionless** to match the canonical URLs (every page has `<link rel="canonical" href="https://listinggems.com/features">` etc.) and `sitemap.xml`. Cloudflare Pages serves both `/features` and `/features.html` for the same file, but the rest of the site has already standardized on the extensionless form for canonical SEO. Examples: `/features`, `/blog/`, `/photoroom-alternative`, `/download`, `/contact`, `/privacy`, `/terms`, `/changelog`, `/#pricing` (anchor on landing). The logo links to `/`.
- **No per-page `active` class in markup.** A small script (in `assets/site.js`) adds `.active` to whichever link matches `location.pathname` on load.
- **Hamburger button + mobile overlay panel** are part of the partial.
- **`<script src="/assets/site.js" defer></script>` is included in the partial** so every page automatically loads it without per-page edits.

**Structure:**

```html
<nav>
  <div class="container">
    <div class="nav-left">
      <a href="/" class="nav-logo">
        <img src="/logo.png" alt="ListingGems" class="nav-logo-img">
        <span class="nav-logo-text">Listing<span class="nav-logo-accent">Gems</span></span>
      </a>
      <div class="nav-links">
        <a href="/features">Features</a>
        <div class="nav-dropdown">
          <button class="nav-dropdown-toggle" type="button">Compare</button>
          <div class="nav-dropdown-menu">
            <a href="/photoroom-alternative">Photoroom alternative<span class="small">$49 once vs $13&ndash;35/month</span></a>
            <a href="/removebg-alternative">remove.bg alternative<span class="small">Unlimited vs per-credit pricing</span></a>
          </div>
        </div>
        <a href="/blog/" data-umami-event="nav-blog">Blog</a>
        <a href="/download" data-umami-event="nav-download">Download</a>
      </div>
    </div>
    <div class="nav-right">
      <a href="/#pricing" class="nav-cta" data-umami-event="buy-now-nav">
        Buy Now &mdash; $49 <span class="price-old">$79</span>
      </a>
      <button class="nav-toggle" type="button" aria-label="Open menu" aria-expanded="false" aria-controls="mobile-menu">
        <span class="nav-toggle-bar"></span>
        <span class="nav-toggle-bar"></span>
        <span class="nav-toggle-bar"></span>
      </button>
    </div>
  </div>
  <div id="mobile-menu" class="nav-mobile-panel" aria-hidden="true">
    <a href="/features">Features</a>
    <a href="/photoroom-alternative">
      Photoroom alternative
      <span class="small">$49 once vs $13&ndash;35/month</span>
    </a>
    <a href="/removebg-alternative">
      remove.bg alternative
      <span class="small">Unlimited vs per-credit pricing</span>
    </a>
    <a href="/blog/" data-umami-event="nav-blog-mobile">Blog</a>
    <a href="/download" data-umami-event="nav-download-mobile">Download</a>
  </div>
</nav>
<!-- site.js is loaded once per page via the nav partial; keeping it adjacent to the markup it controls keeps the partial self-contained. defer ensures it runs after parse. -->
<script src="/assets/site.js" defer></script>
```

Notes on the markup:

- The `nav-right` wrapper is new — currently the Buy Now CTA is a direct child of `nav .container`. Wrapping lets us group CTA + hamburger together on the right side of the bar.
- The compare dropdown stays in the desktop `.nav-links` (existing hover behavior preserved). On mobile, the two compare links appear as flat entries inside `.nav-mobile-panel` instead of a nested dropdown.
- All `data-umami-event` attributes are preserved. The mobile compare/blog/download links use `-mobile` suffixed event names so we can measure mobile menu engagement.

### `partials/footer-links.html`

```html
<div class="footer-links">
  <span>&copy; 2026 ListingGems</span>
  <a href="/features">Features</a>
  <a href="/photoroom-alternative">Photoroom alternative</a>
  <a href="/removebg-alternative">remove.bg alternative</a>
  <a href="/blog/" data-umami-event="footer-blog">Blog</a>
  <a href="/privacy">Privacy</a>
  <a href="/terms">Terms</a>
  <a href="/contact">Contact</a>
  <a href="/download">Download</a>
  <a href="/changelog">Changelog</a>
</div>
```

Identical to the current `.footer-links` block on every page, but with site-root-absolute URLs for consistency.

## CSS additions (`assets/site.css`)

### Hamburger button

```css
.nav-right { display: flex; align-items: center; gap: 12px; }

.nav-toggle {
  display: none;          /* hidden by default; shown at ≤768px */
  width: 44px;
  height: 44px;
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 10px;
  position: relative;
}
.nav-toggle-bar {
  display: block;
  width: 24px;
  height: 2px;
  background: var(--text-primary);
  margin: 5px 0;
  transition: transform 0.2s, opacity 0.2s;
  border-radius: 2px;
}
body.nav-open .nav-toggle-bar:nth-child(1) { transform: translateY(7px) rotate(45deg); }
body.nav-open .nav-toggle-bar:nth-child(2) { opacity: 0; }
body.nav-open .nav-toggle-bar:nth-child(3) { transform: translateY(-7px) rotate(-45deg); }
```

### Mobile overlay panel

```css
.nav-mobile-panel {
  display: none;          /* shown at ≤768px when .nav-open */
  position: fixed;
  top: 60px;              /* below the 60px nav bar */
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(255, 255, 255, 0.98);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  flex-direction: column;
  padding: 16px 0;
  overflow-y: auto;
}
.nav-mobile-panel a {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 16px 24px;
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
  text-decoration: none;
  border-bottom: 1px solid var(--border);
}
.nav-mobile-panel a:last-child { border-bottom: none; }
.nav-mobile-panel a .small {
  font-size: 13px;
  font-weight: 400;
  color: var(--text-muted);
}
.nav-mobile-panel a:hover,
.nav-mobile-panel a:focus { background: var(--bg-elevated); }
```

### Responsive — extend the existing `@media (max-width: 768px)` block

```css
@media (max-width: 768px) {
  .nav-links { display: none; }
  .nav-cta .price-old { display: none; }
  .nav-toggle { display: block; }
  body.nav-open .nav-mobile-panel { display: flex; }
  body.nav-open { overflow: hidden; }                 /* lock background scroll */
}
```

JS owns `aria-hidden` and `aria-expanded` toggling; CSS only controls visibility. Since `display: none` removes the panel from the tab order on desktop and when closed on mobile, no separate focus-blocking rule is needed for the panel itself.

### Active link

```css
.nav-links a.active,
.nav-mobile-panel a.active {
  color: var(--emerald-deep);
}
```

### Footer CSS extraction

`features.html` currently inlines `.footer-cta`, `.footer-cta::before`, `.footer-cta h2`, `.footer-cta .sub`, `.btn-primary`, `.hero-cta-group`, `.price-old-hero`, `.footer-links`, and `.footer-links a` styles. These appear in the page's `<style>` block. Move them to `site.css`. Check the other pages and remove any duplicate inlined copies that match these selectors verbatim.

## JavaScript (`assets/site.js`, new file)

~80 lines, no dependencies, loaded with `defer` from the nav partial.

Responsibilities:

1. **Active link highlighting.** On `DOMContentLoaded`, iterate `nav a[href]` and add `.active` to any link whose pathname matches the current page. The match logic:
   - **Exact match** on `location.pathname` after stripping a trailing `index.html` from both sides and stripping `.html` extensions from both sides (since the site mixes extensionless canonical links with `.html` actual files).
   - The blog index link (`/blog/`) is also marked active for any path under `/blog/...`. This is a deliberate exception so blog article pages light up "Blog" in the nav.
   - Only one link should end up active per page. If multiple would match, prefer the most specific (longest non-prefix path).

2. **Hamburger toggle.** Click handler on `.nav-toggle`:
   - Toggle `nav-open` class on `body`.
   - Set `aria-expanded` on the toggle button ("true"/"false").
   - Set `aria-hidden` on the panel (inverse of `aria-expanded`).
   - Update the toggle's `aria-label` ("Open menu" → "Close menu").

3. **Focus management.**
   - When opening: store the currently-focused element, then move focus to the first link inside the panel.
   - When closing: restore focus to the `.nav-toggle` button (matches WAI-ARIA pattern for disclosure widgets).
   - **Focus trap while open:** when Tab/Shift-Tab would move focus outside the panel, wrap to the other end. Implementation: listen for `keydown` on the panel, check `event.key === 'Tab'`, and if the focused element is the first/last focusable child, prevent default and focus the other end.

4. **Auto-close on link click.** Click handler on `.nav-mobile-panel a` removes `nav-open`. (Most links navigate away, but same-page anchors like `/#pricing` from the landing page need this.)

5. **Escape key.** When `nav-open` is set, Escape closes the menu and restores focus to the toggle.

6. **Resize.** On resize past 768px, remove `nav-open` to prevent the menu being stuck open after rotating from portrait to landscape on a tablet. Restoring focus on resize is not required.

Behavior is idempotent — `site.js` can be included multiple times without breaking (uses a sentinel flag like `window.__listingGemsNav`).

## `build.js` (new file)

```text
- Read partials/nav.html and partials/footer-links.html.
- Normalize partial contents: trim leading/trailing whitespace, then re-add a single
  trailing newline. This avoids noisy diffs from editor auto-formatters.
- Walk repo root recursively for *.html, excluding:
  - node_modules/
  - .git/
  - partials/
  - updates/   (non-HTML release manifests)
  - dist/      (just in case)
- For each file:
  - For each partial:
    - Find /<!-- @begin NAME -->[\s\S]*?<!-- @end NAME -->/g  (g flag is required
      to replace all occurrences if the same marker pair somehow appears twice;
      we still expect exactly one pair per partial per file).
    - Replace match with:
        <!-- @begin NAME -->\n + partial contents + \n<!-- @end NAME -->
  - If neither marker pair found, log "skipped (no markers)".
  - If content changed, write file back.
- Print summary: "X files updated, Y skipped".
- Exit 0 always (unless I/O error).
```

Zero npm dependencies (only `fs`, `path` from Node stdlib). No `package.json` required (but adding one with `"private": true` is fine).

**`blog/_template.html` is excluded** alongside `partials/` — it's a scaffolding file for new blog posts, not a live URL. When a new blog post is created by copying the template, the resulting `*.html` will have the markers and `build.js` will fill them in.

## Migration plan (one-time, per page)

For each of the 12 pages that contain a `<nav>` block:

1. Replace the entire `<nav>...</nav>` block (and any `<script src="..."></script>` that loaded nav-related JS) with:
   ```html
   <!-- @begin nav -->
   <!-- @end nav -->
   ```
2. Replace the entire `<div class="footer-links">...</div>` block with:
   ```html
   <!-- @begin footer-links -->
   <!-- @end footer-links -->
   ```
3. If the page (like `features.html`) inlines footer-related CSS, remove the duplicated selectors from its `<style>` block since they now live in `site.css`.

After the markers are in place, run `node build.js` once to fill them in. Subsequent edits to partials require re-running the build.

## Pages affected

```
index.html
features.html
download.html
contact.html
photoroom-alternative.html
removebg-alternative.html
changelog.html
privacy.html
terms.html
blog/index.html
blog/why-marketplaces-ban-stock-photos.html
```

`blog/_template.html` is a scaffolding file (excluded from the build walk). Update it manually so future blog posts created from it inherit the marker comments.

## Testing checklist

- [ ] Desktop (>768px): nav looks and behaves identically to before; Compare hover dropdown still works.
- [ ] Mobile (≤768px): hamburger visible on right, Buy Now visible on right, logo on left.
- [ ] Tap hamburger: overlay slides/fades in covering everything below the nav bar; icon morphs to X.
- [ ] Tap any overlay link: menu closes, navigation occurs (or for `#pricing`, scrolls).
- [ ] Tap hamburger again: menu closes; icon morphs back.
- [ ] Press Escape with menu open: menu closes.
- [ ] Open menu in portrait, rotate to landscape past 768px: menu auto-closes.
- [ ] Body scroll is locked while menu is open.
- [ ] Active link is highlighted on every page (visit each page, check the active state).
- [ ] All `data-umami-event` attributes preserved on desktop links; mobile links use `-mobile` suffix.
- [ ] `node build.js` is idempotent (running twice produces no diff).
- [ ] Cloudflare Pages preview deploy passes.
- [ ] No JS errors in browser console on any page.
- [ ] Accessibility: tab into hamburger, press Enter to open, arrow/tab through links, Escape to close. `aria-expanded` and `aria-hidden` reflect state.

## Risks / open questions

- **Risk: partial markers accidentally removed by hand-editing.** Mitigation: `build.js` logs "skipped (no markers)" for any page missing them, surfacing the issue immediately.
- **Risk: Cloudflare Pages build step doesn't pick up the build command on existing project.** Mitigation: confirm in CF dashboard that build command is `node build.js`. Alternative: commit pre-built pages so build is optional.
- **Open question: does the existing CF Pages project have a build command configured?** Currently no `package.json`, so likely none. We add `node build.js` to the build settings.

## Out of scope (deferred)

- Migrating `.footer-cta` headline + CTA into a partial. Per-page copy is intentional.
- Restructuring blog post pages beyond nav/footer-links replacement.
- Adding a sticky CTA on mobile scroll, or any other mobile-specific conversion changes.
- Animating the overlay entrance (the current design is a hard show/hide).
