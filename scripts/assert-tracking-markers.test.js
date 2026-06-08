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

console.log('OK: assert-tracking-markers regex tests passed');
