import { lazy, Suspense, useDeferredValue, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Search, SlidersHorizontal, LayoutGrid, Map, Compass, Utensils, Trees, BedDouble, Landmark, Dumbbell, Heart, Sparkles, ArrowUpRight } from 'lucide-react';
import { useApp, useResource } from './state';
import { categories, Empty, Loading, PageHeading, PlaceCard, ResourceError } from './components';
import { filterPlaces } from './utils';

const MapView = lazy(() => import('./MapView'));
const quickCategories = [['', 'All places', Compass], ['restaurant', 'Eat & drink', Utensils], ['nature', 'Outdoors', Trees], ['hotel', 'Stay', BedDouble], ['landmark', 'Culture', Landmark], ['sports', 'Get active', Dumbbell]];

export default function Explore({ mode = 'explore', onPlan }) {
  const { places, favorites, translate } = useApp();
  const recommendations = useResource(mode === 'recommendations' ? '/recommendations?limit=60' : null);
  const resource = mode === 'favorites' ? favorites : mode === 'recommendations' ? recommendations : places;
  const [params, setParams] = useSearchParams();
  const [showFilters, setShowFilters] = useState(false);
  const [visibleCount, setVisibleCount] = useState(12);
  const query = params.get('q') || '';
  const deferredQuery = useDeferredValue(query);
  const category = params.get('category') || '';
  const neighborhood = params.get('neighborhood') || '';
  const tag = params.get('tag') || '';
  const sort = params.get('sort') || (mode === 'recommendations' ? 'recommended' : 'rating');
  const mapMode = mode === 'map' || params.get('view') === 'map';
  const data = resource.data || [];
  const filtered = filterPlaces(data, { query: deferredQuery, category, neighborhood, tag, sort });
  const neighborhoods = [...new Set((places.data || []).map(place => place.neighborhood).filter(Boolean))].sort();
  const tags = [...new Set(data.flatMap(place => place.tags || []))].sort();
  const activeFilters = [category, neighborhood, tag].filter(Boolean).length;
  function setFilter(key, value) {
    setParams(current => { const next = new URLSearchParams(current); if (value) next.set(key, value); else next.delete(key); return next; }, { replace: true });
    setVisibleCount(12);
  }
  const title = mode === 'favorites' ? 'Your saved places' : mode === 'recommendations' ? 'A little more you' : mode === 'map' ? 'The city, mapped out' : 'Explore Yaounde';
  const description = mode === 'favorites' ? 'Good places worth coming back to.' : mode === 'recommendations' ? 'Places inspired by your interests and past adventures.' : 'Familiar streets. Unexpected discoveries. Find your next favorite place.';

  return <>
    <PageHeading eyebrow={mode === 'favorites' ? 'YOUR COLLECTION' : mode === 'recommendations' ? 'PICKED FOR YOU' : 'CAMEROON / THE CITY OF SEVEN HILLS'} title={title} description={description}>
      {mode === 'explore' && <Link to="/planner" className="button secondary">Plan my week<ArrowUpRight size={17} /></Link>}
      {mode === 'recommendations' && <Link to="/profile" className="button secondary"><Sparkles size={17} />My interests</Link>}
      {mode === 'favorites' && <Heart size={30} className="accent-icon" />}
    </PageHeading>
    <section className="explore-controls" aria-label="Find places">
      <div className="search-row"><div className="search-input"><Search size={20} /><input aria-label="Search places" value={query} onChange={event => setFilter('q', event.target.value)} placeholder="Where do you want to go?" />{query && <button className="text-button" onClick={() => setFilter('q', '')}>Clear</button>}</div><button className={`button secondary filter-toggle ${showFilters ? 'selected' : ''}`} aria-expanded={showFilters} aria-controls="place-filters" onClick={() => setShowFilters(!showFilters)}><SlidersHorizontal size={18} />Filters{activeFilters > 0 && <span className="count-dot">{activeFilters}</span>}</button></div>
      <div className="category-tabs" role="group" aria-label="Place categories">{quickCategories.map(([value, label, Icon]) => <button key={value} className={category === value ? 'active' : ''} aria-pressed={category === value} onClick={() => setFilter('category', value)}><Icon size={19} />{label}</button>)}<select aria-label="All categories" value={category} onChange={event => setFilter('category', event.target.value)}><option value="">More categories</option>{Object.entries(categories).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
      {showFilters && <div id="place-filters" className="expanded-filters"><label>Neighborhood<select value={neighborhood} onChange={event => setFilter('neighborhood', event.target.value)}><option value="">Every neighborhood</option>{neighborhoods.map(value => <option key={value}>{value}</option>)}</select></label><label>Atmosphere<select value={tag} onChange={event => setFilter('tag', event.target.value)}><option value="">Every atmosphere</option>{tags.map(value => <option key={value} value={value}>{value.replaceAll('-', ' ')}</option>)}</select></label><button className="text-button" onClick={() => { setParams({}); setVisibleCount(12); }}>Reset filters</button></div>}
    </section>
    {resource.loading ? <Loading cards /> : resource.error ? <ResourceError resource={resource} /> : <>
      <div className="results-bar">
        <div><h2>{translate(query ? 'Search results' : category ? categories[category] : mode === 'favorites' ? 'Saved for later' : mode === 'recommendations' ? 'Your next discoveries' : 'Find your kind of place')}</h2><span>{filtered.length} {filtered.length === 1 ? 'place' : 'places'}{neighborhood ? ` in ${neighborhood}` : ' to explore'}</span></div>
        <div className="results-tools">
          <select aria-label="Sort places" value={sort} onChange={event => setFilter('sort', event.target.value)}>
            {mode === 'recommendations' && <option value="recommended">Recommended</option>}
            <option value="rating">{translate('Top rated')}</option><option value="name">{translate('Name A-Z')}</option><option value="price">{translate('Price: low to high')}</option>
          </select>
          {mode !== 'map' && <div className="segmented" role="group" aria-label="Display mode"><button className={!mapMode ? 'active' : ''} title="Grid view" aria-label="Grid view" aria-pressed={!mapMode} onClick={() => setFilter('view', '')}><LayoutGrid size={18} /></button><button className={mapMode ? 'active' : ''} title="Map view" aria-label="Map view" aria-pressed={mapMode} onClick={() => setFilter('view', 'map')}><Map size={18} /></button></div>}
        </div>
      </div>
      {!filtered.length ? <Empty title={mode === 'favorites' && !data.length ? 'Your collection starts here' : 'No places found'} message={mode === 'favorites' && !data.length ? 'A new favorite is just around the corner.' : 'Try another search or clear your filters.'}><Link to="/" className="button secondary"><Compass size={17} />Explore places</Link></Empty> : mapMode ? <Suspense fallback={<Loading />}><MapView places={filtered} onPlan={onPlan} /></Suspense> : <><div className="places-grid" style={{ opacity: query !== deferredQuery ? 0.65 : 1 }}>{filtered.slice(0, visibleCount).map(place => <PlaceCard key={place.id} place={place} onPlan={onPlan} />)}</div>{visibleCount < filtered.length && <div className="load-more"><button className="button secondary" onClick={() => setVisibleCount(current => current + 12)}>Show more places<ArrowUpRight size={16} /></button><p>{Math.min(visibleCount, filtered.length)} of {filtered.length} places</p></div>}</>}
    </>}
  </>;
}