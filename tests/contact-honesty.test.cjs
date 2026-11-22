'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { sanitise } = require('../scripts/contact-honesty.js');

test('removes unverified tel anchors', () => {
  assert.doesNotMatch(sanitise('<a href="tel:+447700900111">07700 900111</a>'), /href="tel:/);
});
test('masks unverified displayed numbers', () => {
  assert.doesNotMatch(sanitise('<div>07809 444321</div>'), /07809 444321/);
});
test('keeps verified matching click to call', () => {
  assert.match(sanitise('<a href="tel:+447700900111">07700 900111</a>', '07700 900111'), /tel:\+447700900111/);
});
test('corrects stale visible number for verified dial target', () => {
  assert.match(sanitise('<a href="tel:+447700900111">07911 123456</a>', '07700 900111'), /07700900111/);
});
test('rejects malformed purportedly verified UK numbers', () => {
  assert.throws(() => sanitise('hi', '1800bad'), /Invalid verified UK phone/);
});
test('nulls unverified JSON-LD telephone', () => {
  assert.match(sanitise('{"telephone":"07809 444321"}'), /"telephone":null/);
});
test('removes unverified data-phone attributes even when already masked', () => {
  assert.doesNotMatch(sanitise('<div data-phone="07809 444321">Call</div>'), /data-phone/);
});
test('leaves unrelated page content unchanged', () => {
  assert.equal(sanitise('<h1>Welcome</h1><p>Plumbing</p>'), '<h1>Welcome</h1><p>Plumbing</p>');
});