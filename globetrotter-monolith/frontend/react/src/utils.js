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

export function placeImage(place) {
  if (Number.isInteger(place.id) && place.id > 0 && place.id <= 107) return `/images/places/${place.id}.jpg`;
  const source = place.image_url || '';
  if (source.startsWith('/static/images/')) return source.replace('/static/', '/');
  return /^https?:\/\//.test(source) || source.startsWith('/images/') ? source : '';
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