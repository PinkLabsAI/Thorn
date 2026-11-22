import test from 'node:test';
import assert from 'node:assert/strict';
import { logoFor } from '../src/logos.js';

test('a site is matched by its whole address first, then by its name', () => {
  assert.equal(logoFor('https://web.dev/articles'), 'webdotdev');
  assert.equal(logoFor('https://docs.rs/tauri'), 'docsdotrs');
  assert.equal(logoFor('https://www.github.com/'), 'github');
  assert.equal(logoFor('https://developer.mozilla.org/en-US/'), 'mozilla');
});

test('a site with no logo gives null', () => {
  assert.equal(logoFor('https://html.spec.whatwg.org/'), null);
  assert.equal(logoFor('http://localhost:1420/'), null);
});
