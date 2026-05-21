#!/usr/bin/env node
/**
 * ListingGems static-site partial inliner.
 *
 * Walks every *.html file under the repo root and replaces the contents
 * between paired marker comments with the contents of a partial file:
 *
 *   <!-- @begin nav -->
 *   ...replaced on each build...
 *   <!-- @end nav -->
 *
 * Source pages remain valid HTML so they open without a build step.
 * Idempotent: re-running on already-built pages produces no diff.
 *
 * Zero npm dependencies (Node stdlib only).
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const PARTIALS_DIR = path.join(ROOT, 'partials');

const EXCLUDED_DIRS = new Set(['node_modules', '.git', 'partials', 'updates', 'dist']);
// Files (relative to repo root, using forward slashes) excluded individually.
const EXCLUDED_FILES = new Set(['blog/_template.html']);

const PARTIALS = [
  { name: 'nav', file: 'nav.html' },
  { name: 'footer-links', file: 'footer-links.html' },
];

function normalizePartial(raw) {
  // Trim leading/trailing whitespace, then add a single trailing newline.
  // Avoids noisy diffs from editor auto-formatters.
  return raw.replace(/^\s+|\s+$/g, '') + '\n';
}

function loadPartials() {
  const loaded = {};
  for (const p of PARTIALS) {
    const fp = path.join(PARTIALS_DIR, p.file);
    loaded[p.name] = normalizePartial(fs.readFileSync(fp, 'utf8'));
  }
  return loaded;
}

function walk(dir, out) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith('.') && entry.name !== '.') {
      // Skip dotfiles/dotdirs (.git etc.) — also covered by EXCLUDED_DIRS.
      if (EXCLUDED_DIRS.has(entry.name)) continue;
    }
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (EXCLUDED_DIRS.has(entry.name)) continue;
      walk(fullPath, out);
    } else if (entry.isFile() && entry.name.endsWith('.html')) {
      const rel = path.relative(ROOT, fullPath).split(path.sep).join('/');
      if (EXCLUDED_FILES.has(rel)) continue;
      out.push(fullPath);
    }
  }
  return out;
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function applyPartials(content, partials) {
  let out = content;
  let foundAny = false;
  for (const p of PARTIALS) {
    const name = p.name;
    const re = new RegExp(
      '<!--\\s*@begin\\s+' + escapeRegex(name) + '\\s*-->[\\s\\S]*?<!--\\s*@end\\s+' + escapeRegex(name) + '\\s*-->',
      'g'
    );
    if (re.test(out)) {
      foundAny = true;
      // Reset regex state (test() with /g advances lastIndex).
      re.lastIndex = 0;
      const replacement =
        '<!-- @begin ' + name + ' -->\n' + partials[name] + '<!-- @end ' + name + ' -->';
      out = out.replace(re, replacement);
    }
  }
  return { content: out, foundAny };
}

function main() {
  const partials = loadPartials();
  const files = walk(ROOT, []);
  let updated = 0;
  let skipped = 0;

  for (const file of files) {
    const original = fs.readFileSync(file, 'utf8');
    const { content, foundAny } = applyPartials(original, partials);
    const rel = path.relative(ROOT, file).split(path.sep).join('/');
    if (!foundAny) {
      console.log('skipped (no markers): ' + rel);
      skipped++;
      continue;
    }
    if (content !== original) {
      fs.writeFileSync(file, content);
      console.log('updated: ' + rel);
      updated++;
    }
  }

  console.log('\n' + updated + ' files updated, ' + skipped + ' skipped');
}

main();
