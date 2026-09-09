import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveTheme } from '../src/theme.js';

test('explicit themes override the system preference', () => {
  assert.equal(resolveTheme('light', true), 'light');
  assert.equal(resolveTheme('dark', false), 'dark');
});
test('system and unknown preferences follow the device theme', () => {
  assert.equal(resolveTheme('system', true), 'dark');
  assert.equal(resolveTheme('system', false), 'light');
  assert.equal(resolveTheme(null, true), 'dark');
});