// ListingGems shared site script.
// Idempotent: safe to load multiple times via the nav partial.
(function () {
  if (window.__listingGemsNav) return;
  window.__listingGemsNav = true;

  // Strip trailing index.html and .html extension for comparison.
  function normalizePath(p) {
    if (!p) return '/';
    return p.replace(/\/index\.html$/, '/').replace(/\.html$/, '') || '/';
  }

  function setActiveLink() {
    var current = normalizePath(location.pathname);
    // Skip the logo (always "/") and the CTA — neither should ever be styled as "active".
    var links = document.querySelectorAll('nav a[href]:not(.nav-logo):not(.nav-cta)');
    var best = null;
    var bestLen = -1;
    links.forEach(function (a) {
      var href = a.getAttribute('href');
      if (!href || href.charAt(0) === '#') return;
      var url;
      try { url = new URL(href, location.origin); } catch (e) { return; }
      var target = normalizePath(url.pathname);
      var match = false;
      if (target === current) {
        match = true;
      } else if (target === '/blog/' && current.indexOf('/blog/') === 0) {
        match = true;
      }
      if (match && target.length > bestLen) {
        best = a;
        bestLen = target.length;
      }
    });
    // If multiple identical-length matches occur, mark all the most-specific ones
    // (covers desktop + mobile copies of the same link).
    if (best) {
      var bestPath = normalizePath(new URL(best.getAttribute('href'), location.origin).pathname);
      links.forEach(function (a) {
        var href = a.getAttribute('href');
        if (!href || href.charAt(0) === '#') return;
        var url;
        try { url = new URL(href, location.origin); } catch (e) { return; }
        if (normalizePath(url.pathname) === bestPath) {
          a.classList.add('active');
        }
      });
    }
  }

  var lastFocused = null;

  function focusableInPanel(panel) {
    return Array.prototype.slice.call(panel.querySelectorAll('a[href], button:not([disabled])'));
  }

  function openMenu(toggle, panel) {
    lastFocused = document.activeElement;
    document.body.classList.add('nav-open');
    toggle.setAttribute('aria-expanded', 'true');
    toggle.setAttribute('aria-label', 'Close menu');
    panel.setAttribute('aria-hidden', 'false');
    var items = focusableInPanel(panel);
    if (items.length) items[0].focus();
  }

  function closeMenu(toggle, panel, restoreFocus) {
    document.body.classList.remove('nav-open');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', 'Open menu');
    panel.setAttribute('aria-hidden', 'true');
    if (restoreFocus) {
      (lastFocused && lastFocused.focus ? lastFocused : toggle).focus();
    }
  }

  function setupHamburger() {
    var toggle = document.querySelector('.nav-toggle');
    var panel = document.getElementById('mobile-menu');
    if (!toggle || !panel) return;

    toggle.addEventListener('click', function () {
      if (document.body.classList.contains('nav-open')) {
        closeMenu(toggle, panel, true);
      } else {
        openMenu(toggle, panel);
      }
    });

    panel.addEventListener('click', function (e) {
      var a = e.target.closest('a');
      if (a) closeMenu(toggle, panel, false);
    });

    panel.addEventListener('keydown', function (e) {
      if (e.key !== 'Tab') return;
      var items = focusableInPanel(panel);
      if (!items.length) return;
      var first = items[0];
      var last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && document.body.classList.contains('nav-open')) {
        closeMenu(toggle, panel, true);
      }
    });

    window.addEventListener('resize', function () {
      if (window.innerWidth > 768 && document.body.classList.contains('nav-open')) {
        closeMenu(toggle, panel, false);
      }
    });
  }

  function setupFaq() {
    document.querySelectorAll('.faq-question').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var item = btn.parentElement;
        var wasOpen = item.classList.contains('open');
        document.querySelectorAll('.faq-item.open').forEach(function (i) { i.classList.remove('open'); });
        if (!wasOpen) item.classList.add('open');
      });
    });
  }

  function init() {
    setActiveLink();
    setupHamburger();
    setupFaq();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

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

  // True only after initPixel() ran — which only happens once consent is granted.
  function pixelReady() {
    return window.__lgPixelInit === true && !!window.fbq;
  }

  function trackStartTrial() {
    // Only fires if the Pixel was initialized (i.e., consent was granted).
    if (pixelReady()) {
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

  function start() { wireBanner(); wireDownloadTracking(); resolveConsent(); }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
