import test from 'node:test';
import assert from 'node:assert/strict';
import { estimateFare, estimateFareRange, withinYaounde, filterPlaces, localDate, placeImage, weekDays } from '../src/utils.js';

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

test('images follow seeded filenames and revisions for every destination ID', () => {
  for (let destinationId = 1; destinationId <= 108; destinationId += 1) {
    const source = `/images/places/${destinationId}.jpg?v=photo-revision`;
    assert.equal(placeImage({ id: destinationId, image_url: source }), source);
    assert.equal(placeImage({ id: destinationId }), `/images/places/${destinationId}.jpg`);
  }
  assert.equal(placeImage({ id: 44, image_url: '/static/images/places/44.png?v=new' }), '/images/places/44.png?v=new');
  assert.equal(placeImage({ id: 108, content_version: 1, image_url: '/images/places/108.jpg?v=new' }), '/images/places/108.jpg?v=new');
  assert.equal(placeImage({ id: 1, content_version: 1, image_url: '' }), '');
  assert.equal(placeImage({ id: 1, content_version: 1, image_url: 'javascript:alert(1)' }), '');
});

test('fare estimates convert driving meters to kilometers and round to whole FCFA', () => {
  assert.equal(estimateFare(1200, 200, 150), 380);
  assert.equal(estimateFare(1200, 150, 100), 270);
  assert.equal(estimateFare(1200, 400, 220), 664);
  assert.equal(estimateFare(1250, 200, 150), 388);
  assert.equal(estimateFare(10000, 200, 150), 1700);
  assert.equal(estimateFare(1200, 300, 250), 600);
  assert.equal(estimateFare(0, 200, 150), 200);
  assert.equal(estimateFare(0, 0, 0), 0);
});

test('fare estimates reject missing, negative, nonnumeric and nonfinite values', () => {
  for (const invalid of [undefined, null, '', '1200', -1, NaN, Infinity, -Infinity]) {
    assert.equal(estimateFare(invalid, 200, 150), null);
    assert.equal(estimateFare(1200, invalid, 150), null);
    assert.equal(estimateFare(1200, 200, invalid), null);
  }
  assert.equal(estimateFare(Number.MAX_VALUE, Number.MAX_VALUE, Number.MAX_VALUE), null);
});

test('researched fare ranges preserve uncertainty and do not turn flat references into meter prices', () => {
  const policy = { active: true, model: 'distance', base_min: 350, base_max: 500, per_km_min: 150, per_km_max: 300 };
  assert.deepEqual(estimateFareRange(1200, policy), { low: 530, high: 860 });
  assert.equal(estimateFareRange(1200, { ...policy, model: 'reference' }), null);
  assert.equal(estimateFareRange(1200, { ...policy, model: 'quote' }), null);
  assert.equal(estimateFareRange(1200, { ...policy, active: false }), null);
  assert.equal(estimateFareRange(1200, { ...policy, base_min: 700 }), null);
  assert.equal(withinYaounde([11.51, 3.88], [11.49, 3.91], 1200), true);
  assert.equal(withinYaounde([9.7, 4.05], [11.49, 3.91], 250000), false);
});