import { Component, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarPlus, Expand, LocateFixed, MapPin, Navigation, RefreshCw, Star, X } from 'lucide-react';
import { Map, MapControls, MapMarker, MapPopup, MapRoute, MarkerContent, useMap } from './components/ui/map';
import { DestinationActions, Empty, ErrorMessage, PlaceImage } from './components';
import { useApp } from './state';
import './mapcn.css';
import './map.css';

function coordinateBounds(coordinates) {
  return coordinates.reduce((bounds, [longitude, latitude]) => [[Math.min(bounds[0][0], longitude), Math.min(bounds[0][1], latitude)], [Math.max(bounds[1][0], longitude), Math.max(bounds[1][1], latitude)]], [[180, 90], [-180, -90]]);
}

function MapEvents({ coordinatesKey, location, route, onReady, onError }) {
  const { map, isLoaded } = useMap();
  const fittedRoute = useRef(null);
  const centeredLocation = useRef(false);
  useEffect(() => {
    if (!map) return;
    const coordinates = JSON.parse(coordinatesKey);
    if (coordinates.length) map.fitBounds(coordinateBounds(coordinates), { padding: 55, maxZoom: 15, duration: 0 });
  }, [map, coordinatesKey]);
  useEffect(() => {
    onReady(isLoaded);
  }, [isLoaded, onReady]);
  useEffect(() => {
    if (!map) return;
    const report = () => onError('The basemap could not finish loading. Check your connection or try again.');
    const clear = () => onError('');
    map.on('error', report);
    map.on('idle', clear);
    return () => { map.off('error', report); map.off('idle', clear); };
  }, [map, onError]);
  useEffect(() => {
    if (!map || !location || centeredLocation.current || route) return;
    map.easeTo({ center: location, zoom: 14, duration: 500 });
    centeredLocation.current = true;
  }, [map, location, route]);
  useEffect(() => {
    if (!map || !isLoaded || !route || fittedRoute.current === route) return;
    map.fitBounds(coordinateBounds(route.geometry.coordinates), { padding: 55, maxZoom: 15, duration: 500 });
    fittedRoute.current = route;
  }, [map, isLoaded, route]);
  return null;
}

class MapBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed ? <Empty title="Map unavailable" message="This map requires WebGL. Try a current browser with hardware acceleration enabled."><button className="button secondary" onClick={this.props.onRetry}><RefreshCw size={17} />{this.props.translate('Try again')}</button></Empty> : this.props.children;
  }
}

export default function MapView({ places, onPlan, selectedPlaceId = null, requestDirections = false }) {
  const { theme, language, translate, number } = useApp();
  const mapRef = useRef(null);
  const [location, setLocation] = useState(null);
  const [watching, setWatching] = useState(false);
  const [locationError, setLocationError] = useState('');
  const [mapError, setMapError] = useState('');
  const [routeError, setRouteError] = useState('');
  const [selected, setSelected] = useState(null);
  const [destination, setDestination] = useState(null);
  const [route, setRoute] = useState(null);
  const [routeBusy, setRouteBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const handledLink = useRef('');
  const validPlaces = places.filter(place => Number.isFinite(place.lat) && Number.isFinite(place.lng) && Math.abs(place.lat) <= 90 && Math.abs(place.lng) <= 180);
  const coordinatesKey = JSON.stringify(validPlaces.map(place => [place.lng, place.lat]));
  const selectedPlace = validPlaces.find(place => place.id === selected);
  const linkedPlace = validPlaces.find(place => place.id === selectedPlaceId);

  useEffect(() => {
    if (!ready || !linkedPlace) return;
    const key = `${linkedPlace.id}:${requestDirections}`;
    if (handledLink.current === key) return;
    handledLink.current = key;
    setSelected(linkedPlace.id);
    mapRef.current?.easeTo({ center: [linkedPlace.lng, linkedPlace.lat], zoom: 15, duration: 400 });
    if (requestDirections) {
      setDestination({ id: linkedPlace.id, name: linkedPlace.name, lng: linkedPlace.lng, lat: linkedPlace.lat });
      if (!location) setWatching(true);
    }
  }, [ready, linkedPlace, requestDirections, location]);

  useEffect(() => {
    if (!watching) return;
    if (!navigator.geolocation) { setLocationError('Location is unavailable in this browser.'); setWatching(false); return; }
    const watch = navigator.geolocation.watchPosition(position => {
      setLocation([position.coords.longitude, position.coords.latitude]);
      setLocationError('');
    }, failure => {
      setLocationError(failure.code === 1 ? 'Location access was denied. Allow location in your browser to get directions.' : 'Your location is unavailable. Please try again.');
      setWatching(false);
    }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 });
    return () => navigator.geolocation.clearWatch(watch);
  }, [watching]);
  useEffect(() => {
    if (!location || !destination) { setRoute(null); setRouteBusy(false); return; }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort('timeout'), 15000);
    setRoute(null);
    setRouteBusy(true);
    setRouteError('');
    fetch(`https://router.project-osrm.org/route/v1/driving/${location[0]},${location[1]};${destination.lng},${destination.lat}?overview=full&geometries=geojson`, { signal: controller.signal })
      .then(response => { if (!response.ok) throw new Error('Directions are unavailable right now. Please try again.'); return response.json(); })
      .then(data => {
        if (!data.routes?.[0]?.geometry?.coordinates?.length) throw new Error('No driving route found for these locations.');
        if (controller.signal.aborted) return;
        setRoute(data.routes[0]);
      }).catch(failure => {
        if (controller.signal.reason === 'timeout') setRouteError('Directions took too long. Please try again.');
        else if (!controller.signal.aborted) setRouteError(failure.message || 'Directions are unavailable.');
      }).finally(() => {
        clearTimeout(timeout);
        if (!controller.signal.aborted || controller.signal.reason === 'timeout') setRouteBusy(false);
      });
    return () => { clearTimeout(timeout); controller.abort(); };
  }, [location, destination]);

  function retryMap() { setReady(false); setMapError(''); setAttempt(value => value + 1); }
  function fitAll() {
    const coordinates = JSON.parse(coordinatesKey);
    if (coordinates.length) mapRef.current?.fitBounds(coordinateBounds(coordinates), { padding: 55, maxZoom: 15, duration: 400 });
  }
  function showPlace(place) {
    setSelected(place.id);
    mapRef.current?.easeTo({ center: [place.lng, place.lat], zoom: 15, duration: 400 });
  }
  function directions(place) {
    setDestination({ id: place.id, name: place.name, lng: place.lng, lat: place.lat });
    if (!location) { setLocationError(''); setWatching(true); }
  }

  return <section className="map-section" aria-label={translate('Yaounde interactive map')} data-map-ready={ready} data-map-theme={theme}>
    <div className="map-toolbar">
      <select aria-label={translate('Find a place on the map')} value={selectedPlace?.id || ''} onChange={event => { const place = validPlaces.find(item => item.id === Number(event.target.value)); if (place) showPlace(place); else setSelected(null); }}><option value="">{translate('{count} places on the map', { count: number(validPlaces.length) })}</option>{validPlaces.map(place => <option key={place.id} value={place.id}>{place.name}</option>)}</select>
      <div className="map-actions"><button className="icon-button" title={translate('Fit all places')} aria-label={translate('Fit all places')} onClick={fitAll}><Expand size={18} /></button><button className={`button secondary ${watching ? 'selected' : ''}`} aria-pressed={watching} onClick={() => { setLocationError(''); setWatching(!watching); }}><LocateFixed size={17} />{translate(watching ? 'Stop live location' : 'My location')}</button></div>
    </div>
    <ErrorMessage>{locationError || routeError}</ErrorMessage>
    {mapError && <div className="map-warning" role="status"><span>{translate(mapError)}</span><button className="text-button" onClick={retryMap}><RefreshCw size={16} />{translate('Retry map')}</button></div>}
    <div className="map-canvas">
      <MapBoundary key={attempt} onRetry={retryMap} translate={translate}>
        <Map key={language} ref={mapRef} center={selectedPlace ? [selectedPlace.lng, selectedPlace.lat] : [11.52, 3.87]} zoom={selectedPlace ? 15 : 12} theme={theme} locale={{ 'Map.Title': translate('Map'), 'AttributionControl.ToggleAttribution': translate('Toggle attribution') }} className="city-map" canvasContextAttributes={{ preserveDrawingBuffer: import.meta.env.DEV }}>
          <MapEvents coordinatesKey={coordinatesKey} location={location} route={route} onReady={setReady} onError={setMapError} />
          <MapControls position="top-right" showZoom showCompass labels={{ zoomIn: translate('Zoom in'), zoomOut: translate('Zoom out'), compass: translate('Reset bearing to north') }} />
          {validPlaces.map(place => <MapMarker key={place.id} longitude={place.lng} latitude={place.lat} anchor="center"><MarkerContent><button className={`place-marker ${selected === place.id ? 'is-selected' : ''}`} title={place.name} aria-label={translate('Show {name} on map', { name: place.name })} aria-pressed={selected === place.id} onClick={() => showPlace(place)}><MapPin size={18} /></button></MarkerContent></MapMarker>)}
          {location && <MapMarker longitude={location[0]} latitude={location[1]} anchor="center"><MarkerContent><span className="user-location-marker" role="img" aria-label={translate('Your location')} /></MarkerContent></MapMarker>}
          {selectedPlace && <MapPopup key={selectedPlace.id} longitude={selectedPlace.lng} latitude={selectedPlace.lat} onClose={() => setSelected(null)} closeButton closeLabel={translate('Close popup')} closeOnClick={false} offset={24} className="place-map-popup"><div className="map-popup"><PlaceImage place={selectedPlace} /><div className="map-popup-body"><Link to={`/places/${selectedPlace.id}`}>{selectedPlace.name}</Link><p>{selectedPlace.neighborhood}<span className="rating"><Star size={13} fill="currentColor" />{number(selectedPlace.rating || 0, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</span></p><DestinationActions place={selectedPlace} directions={false} /><div className="map-popup-actions"><button className="button" onClick={() => onPlan(selectedPlace)}><CalendarPlus size={16} />{translate('Plan a visit')}</button><button className="button secondary" onClick={() => directions(selectedPlace)}><Navigation size={16} />{translate('Directions')}</button></div></div></div></MapPopup>}
          {route && <MapRoute id="visit-directions" coordinates={route.geometry.coordinates} color={theme === 'dark' ? '#8abcee' : '#2376b6'} width={5} opacity={0.95} interactive={false} />}
        </Map>
      </MapBoundary>
    </div>
    {routeBusy && <p role="status">{translate('Finding a driving route...')}</p>}
    {route && destination && <div className="route-summary" role="status">
      <div><Navigation size={19} /><strong>{destination.name}</strong><button className="icon-button" title={translate('Clear route')} aria-label={translate('Clear route')} onClick={() => { setDestination(null); setRouteError(''); }}><X size={18} /></button></div>
      <span>{translate('{distance} km / about {minutes} min driving', { distance: number(route.distance / 1000, { minimumFractionDigits: 1, maximumFractionDigits: 1 }), minutes: number(Math.round(route.duration / 60)) })}</span>
      <small>{translate('Estimated fares: shared taxi {taxi} FCFA / moto {moto} FCFA / Yango {yango} FCFA. Not live pricing.', { taxi: number(Math.round(200 + route.distance / 1000 * 150)), moto: number(Math.round(150 + route.distance / 1000 * 100)), yango: number(Math.round(400 + route.distance / 1000 * 220)) })}</small>
    </div>}
  </section>;
}