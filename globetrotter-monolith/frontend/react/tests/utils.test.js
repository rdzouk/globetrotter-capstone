import test from 'node:test';
import assert from 'node:assert/strict';
import { filterPlaces, localDate, placeImage, weekDays } from '../src/utils.js';

const places = [
  { id: 1, name: 'Garden', category: 'restaurant', neighborhood: 'Bastos', rating: 4, price_level: 2, tags: ['outdoor'] },
  { id: 2, name: 'Museum', category: 'landmark', neighborhood: 'Centre', rating: 5, price_level: 1, tags: ['culture'] },
];
test('search combines filters without mutating API data', () => {
  assert.deepEqual(filterPlaces(places, { query: ' BASTOS ', category: 'restaurant', tag: 'outdoor' }).map(place => place.id), [1]);
  assert.equal(filterPlaces(places, { neighborhood: 'Centre', category: 'restaurant' }).length, 0);
  assert.deepEqual(filterPlaces(places).map(place => place.id), [2, 1]);
  assert.equal(places[0].id, 1);
});
test('name and price sort are supported', () => {
  assert.equal(filterPlaces(places, { sort: 'name' })[0].name, 'Garden');
  assert.equal(filterPlaces(places, { sort: 'price' })[0].id, 2);
  assert.deepEqual(filterPlaces(places, { sort: 'recommended' }).map(place => place.id), [1, 2]);
});
test('planner handles week and year boundaries in local time', () => {
  assert.equal(localDate(new Date(2026, 0, 2, 0, 30)), '2026-01-02');
  assert.deepEqual(weekDays('2026-01-01'), ['2025-12-29', '2025-12-30', '2025-12-31', '2026-01-01', '2026-01-02', '2026-01-03', '2026-01-04']);
});
test('images reuse local assets and reject unsafe URLs', () => {
  assert.equal(placeImage({ id: 1 }), '/images/places/1.jpg');
  assert.equal(placeImage({ image_url: '/static/images/places/custom.jpg' }), '/images/places/custom.jpg');
  assert.equal(placeImage({ image_url: 'javascript:alert(1)' }), '');
});