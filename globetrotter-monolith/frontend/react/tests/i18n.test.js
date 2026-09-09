import test from 'node:test';
import assert from 'node:assert/strict';
import { formatLocalDate, formatNumber, localeFor, translateText } from '../src/i18n.js';
import { destinationFrench, neighborhoodFrench } from '../src/contentTranslations.js';

test('language switching uses explicit catalogues and interpolated values', () => {
  assert.equal(translateText('fr', 'Sign in'), 'Connexion');
  assert.equal(translateText('en', 'Sign in'), 'Sign in');
  assert.equal(translateText('en', '{name}: {count}', { name: 'Camille', count: 3 }), 'Camille: 3');
  assert.equal(translateText('fr', null), null);
});

test('dates and numbers follow the selected language rather than browser defaults', () => {
  assert.equal(localeFor('fr'), 'fr-FR');
  assert.equal(formatNumber('fr', 4.3, { minimumFractionDigits: 1 }), '4,3');
  assert.equal(formatNumber('en', 4.3), '4.3');
  assert.match(formatLocalDate('fr', '2026-01-12'), /janv/);
  assert.match(formatLocalDate('en', '2026-01-12'), /Jan/);
  assert.equal(formatLocalDate('fr', 'not-a-date'), '');
});

test('the full current destination and neighborhood catalogues have French text', () => {
  assert.equal(Object.keys(destinationFrench).length, 108);
  assert.equal(Object.keys(neighborhoodFrench).length, 34);
  for (const [source, target] of Object.entries(destinationFrench)) {
    assert.notEqual(source, target);
    assert.equal(translateText('fr', source), target);
    assert.equal(translateText('en', source), source);
  }
  assert.equal(translateText('fr', 'outdoor'), 'en plein air');
});