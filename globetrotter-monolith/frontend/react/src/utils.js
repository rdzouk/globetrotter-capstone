export function filterPlaces(places, { query = '', category = '', neighborhood = '', tag = '', sort = 'rating' } = {}) {
  const search = query.trim().toLocaleLowerCase();
  const filtered = places.filter(place =>
    (!search || [place.name, place.neighborhood, place.description, place.searchText, place.address, ...(place.tags || [])].join(' ').toLocaleLowerCase().includes(search)) &&
    (!category || place.category === category) &&
    (!neighborhood || place.neighborhood === neighborhood) &&
    (!tag || place.tags?.includes(tag)),
  );
  return sort === 'recommended' ? filtered : filtered.sort((first, second) => sort === 'name' ? first.name.localeCompare(second.name) : sort === 'price' ? (first.price_level ?? 9) - (second.price_level ?? 9) : (second.rating || 0) - (first.rating || 0));
}

export function localDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function formatDate(value) {
  return new Date(`${value}T12:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export function estimateFare(distanceMeters, baseFare, perKilometer) {
  if (![distanceMeters, baseFare, perKilometer].every(value => Number.isFinite(value) && value >= 0)) return null;
  const total = baseFare + distanceMeters / 1000 * perKilometer;
  return Number.isFinite(total) ? Math.round(total) : null;
}

export function estimateFareRange(distanceMeters, policy) {
  if (!policy?.active || policy.model !== 'distance' || policy.base_min > policy.base_max || policy.per_km_min > policy.per_km_max) return null;
  const low = estimateFare(distanceMeters, policy.base_min, policy.per_km_min);
  const high = estimateFare(distanceMeters, policy.base_max, policy.per_km_max);
  return low === null || high === null ? null : { low, high };
}

export function withinYaounde(origin, destination, distanceMeters) {
  return Number.isFinite(distanceMeters) && distanceMeters >= 0 && distanceMeters <= 50000 && [origin, destination].every(coordinates => Array.isArray(coordinates) && coordinates[0] >= 11.35 && coordinates[0] <= 11.7 && coordinates[1] >= 3.7 && coordinates[1] <= 4.05);
}

export function placeImage(place) {
  const source = place.image_url || '';
  if (source.startsWith('/static/images/')) return source.replace('/static/', '/');
  if (source.startsWith('/images/') || /^https:\/\//.test(source)) return source;
  if (place.content_version > 0) return '';
  if (Number.isInteger(place.id) && place.id > 0) return `/images/places/${place.id}.jpg`;
  return /^http:\/\//.test(source) ? source : '';
}

export function weekDays(value) {
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() - (date.getDay() + 6) % 7);
  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(date);
    day.setDate(date.getDate() + index);
    return localDate(day);
  });
}