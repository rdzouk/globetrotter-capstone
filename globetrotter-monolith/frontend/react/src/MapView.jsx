import { Component, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarPlus, Expand, LocateFixed, MapPin, Navigation, RefreshCw, Square, Star, X } from 'lucide-react';
import { Map, MapControls, MapMarker, MapPopup, MapRoute, MarkerContent, useMap } from './components/ui/map';
import { DestinationActions, Empty, ErrorMessage, Label, Loading, PlaceImage, ResourceError } from './components';
import { useApp, useResource } from './state';
import { estimateFare, estimateFareRange, withinYaounde } from './utils';
import './mapcn.css';
import './map.css';

function coordinateBounds(coordinates) {
  return coordinates.reduce((bounds, [longitude, latitude]) => [[Math.min(bounds[0][0], longitude), Math.min(bounds[0][1], latitude)], [Math.max(bounds[1][0], longitude), Math.max(bounds[1][1], latitude)]], [[180, 90], [-180, -90]]);
}

function MapEvents({ coordinatesKey, route, onReady, onError, pickingOrigin, onPickOrigin }) {
  const { map, isLoaded } = useMap();
  const fittedRoute = useRef(null);
  const pickOriginRef = useRef(onPickOrigin);
  pickOriginRef.current = onPickOrigin;
  useEffect(() => {
    if (!map || !pickingOrigin) return;
    const canvas = map.getCanvas();
    const previousCursor = canvas.style.cursor;
    canvas.style.cursor = 'crosshair';
    const pick = event => {
      if (event.originalEvent.target.closest('button, .maplibregl-popup')) return;
      pickOriginRef.current(event.lngLat.lng, event.lngLat.lat);
    };
    map.on('click', pick);
    return () => { map.off('click', pick); canvas.style.cursor = previousCursor; };
  }, [map, pickingOrigin]);
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

function PickerEvents({ point, onChange, onReady, onError }) {
  const { map, isLoaded } = useMap();
  const pickRef = useRef(onChange);
  pickRef.current = onChange;
  useEffect(() => { onReady(isLoaded); }, [isLoaded, onReady]);
  useEffect(() => {
    if (!map) return;
    const select = event => {
      if (event.originalEvent.target.closest('button, .maplibregl-ctrl')) return;
      pickRef.current({ lat: event.lngLat.lat.toFixed(6), lng: event.lngLat.lng.toFixed(6) });
    };
    const fail = () => onError('The basemap could not finish loading. Check your connection or try again.');
    const clear = () => onError('');
    map.getCanvas().style.cursor = 'crosshair';
    map.on('click', select);
    map.on('error', fail);
    map.on('idle', clear);
    return () => { map.off('click', select); map.off('error', fail); map.off('idle', clear); };
  }, [map, onError]);
  useEffect(() => {
    if (map && point && !map.getBounds().contains([point.lng, point.lat])) map.easeTo({ center: [point.lng, point.lat], zoom: 14, duration: 300 });
  }, [map, point?.lat, point?.lng]);
  return null;
}

export function LocationPicker({ value, onChange }) {
  const { theme, language, translate } = useApp();
  const [ready, setReady] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState('');
  const [locating, setLocating] = useState(false);
  const alive = useRef(true);
  const point = value.lat !== '' && value.lng !== '' && Number.isFinite(Number(value.lat)) && Number.isFinite(Number(value.lng)) && Math.abs(Number(value.lat)) <= 90 && Math.abs(Number(value.lng)) <= 180 ? { lat: Number(value.lat), lng: Number(value.lng) } : null;
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  function locate() {
    if (!navigator.geolocation || !window.isSecureContext) { setError('Location requires HTTPS or localhost.'); return; }
    setLocating(true);
    setError('');
    navigator.geolocation.getCurrentPosition(position => {
      if (!alive.current) return;
      onChange({ lat: position.coords.latitude.toFixed(6), lng: position.coords.longitude.toFixed(6) });
      setLocating(false);
    }, () => {
      if (!alive.current) return;
      setError('Your location is unavailable. Please try again.');
      setLocating(false);
    }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 });
  }
  return <div className="place-location-picker" data-map-ready={ready}>
    <div className="picker-actions"><button type="button" className="text-button" disabled={locating} onClick={locate}><LocateFixed size={17} />{translate('Use current location')}</button><button type="button" className="icon-button" title={translate('Clear location')} aria-label={translate('Clear location')} disabled={!point} onClick={() => onChange({ lat: '', lng: '' })}><X size={17} /></button></div>
    <ErrorMessage>{error}</ErrorMessage>
    <div className="mapcn-scope location-picker-canvas"><MapBoundary key={attempt} translate={translate} onRetry={() => { setReady(false); setError(''); setAttempt(current => current + 1); }}><Map key={language} center={point ? [point.lng, point.lat] : [11.52, 3.87]} zoom={13} theme={theme} className="city-map" locale={{ 'Map.Title': translate('Place location'), 'AttributionControl.ToggleAttribution': translate('Toggle attribution') }} canvasContextAttributes={{ preserveDrawingBuffer: import.meta.env.DEV }}><PickerEvents point={point} onChange={onChange} onReady={setReady} onError={setError} /><MapControls position="top-right" showZoom showCompass labels={{ zoomIn: translate('Zoom in'), zoomOut: translate('Zoom out'), compass: translate('Reset bearing to north') }} />{point && <MapMarker longitude={point.lng} latitude={point.lat} draggable onDragEnd={({ lng, lat }) => onChange({ lng: lng.toFixed(6), lat: lat.toFixed(6) })}><MarkerContent><span className="manual-origin-marker" role="img" aria-label={translate('Selected place location')}><MapPin size={20} /></span></MarkerContent></MapMarker>}</Map></MapBoundary></div>
  </div>;
}

export default function MapView({ places, onPlan, selectedPlaceId = null, requestDirections = false }) {
  const { theme, language, translate, number, date } = useApp();
  const farePolicies = useResource('/fares');
  const mapRef = useRef(null);
  const [location, setLocation] = useState(null);
  const [originMode, setOriginMode] = useState('device');
  const [manualLocation, setManualLocation] = useState(null);
  const [manualName, setManualName] = useState('');
  const [latitudeInput, setLatitudeInput] = useState('');
  const [longitudeInput, setLongitudeInput] = useState('');
  const [pickingOrigin, setPickingOrigin] = useState(false);
  const origin = originMode === 'manual' ? manualLocation : location;
  const [accuracy, setAccuracy] = useState(null);
  const [watching, setWatching] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locationRequest, setLocationRequest] = useState(0);
  const centeredRequest = useRef(0);
  const [locationError, setLocationError] = useState('');
  const [mapError, setMapError] = useState('');
  const [routeError, setRouteError] = useState('');
  const [selected, setSelected] = useState(null);
  const [destination, setDestination] = useState(null);
  const [route, setRoute] = useState(null);
  const [routeBusy, setRouteBusy] = useState(false);
  const [routeAttempt, setRouteAttempt] = useState(0);
  const [transport, setTransport] = useState('taxi');
  const [baseFare, setBaseFare] = useState('');
  const [perKilometer, setPerKilometer] = useState('');
  const [ready, setReady] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const handledLink = useRef('');
  const validPlaces = places.filter(place => Number.isFinite(place.lat) && Number.isFinite(place.lng) && Math.abs(place.lat) <= 90 && Math.abs(place.lng) <= 180);
  const coordinatesKey = JSON.stringify(validPlaces.map(place => [place.lng, place.lat]));
  const selectedPlace = validPlaces.find(place => place.id === selected);
  const linkedPlace = validPlaces.find(place => place.id === selectedPlaceId);
  const fare = estimateFare(route?.distance, baseFare === '' ? NaN : Number(baseFare), perKilometer === '' ? NaN : Number(perKilometer));
  const policy = farePolicies.data?.find(item => item.mode === transport);
  const inResearchArea = withinYaounde(origin, destination ? [destination.lng, destination.lat] : null, route?.distance);
  const range = inResearchArea ? estimateFareRange(route?.distance, policy) : null;
  const oldSource = policy?.source_date && Date.now() - new Date(`${policy.source_date}T00:00:00Z`).getTime() > 365 * 86400000;

  useEffect(() => {
    if (!ready || !linkedPlace) return;
    const key = `${linkedPlace.id}:${requestDirections}`;
    if (handledLink.current === key) return;
    handledLink.current = key;
    setSelected(linkedPlace.id);
    mapRef.current?.easeTo({ center: [linkedPlace.lng, linkedPlace.lat], zoom: 15, duration: 400 });
    if (requestDirections) {
      setDestination({ id: linkedPlace.id, name: linkedPlace.name, lng: linkedPlace.lng, lat: linkedPlace.lat });
      if (!location && originMode === 'device') setWatching(true);
    }
  }, [ready, linkedPlace, requestDirections, location, originMode]);

  useEffect(() => {
    if (!watching) return;
    if (!window.isSecureContext || !navigator.geolocation) {
      setLocationError(!window.isSecureContext ? 'Location requires HTTPS or localhost.' : 'Location is unavailable in this browser.');
      setWatching(false);
      setLocating(false);
      return;
    }
    let active = true;
    setLocating(true);
    const fail = failure => {
      if (!active) return;
      setLocationError(failure.code === 1 ? 'Location access was denied. Allow location in your browser to get directions.' : failure.code === 3 ? 'Locating took too long. Please try again outdoors or near a window.' : 'Your location is unavailable. Please try again.');
      setWatching(false);
      setLocating(false);
    };
    const watch = navigator.geolocation.watchPosition(position => {
      if (!active) return;
      const { longitude, latitude, accuracy: reportedAccuracy } = position.coords;
      if (!Number.isFinite(longitude) || !Number.isFinite(latitude) || Math.abs(longitude) > 180 || Math.abs(latitude) > 90) { fail({ code: 2 }); return; }
      setLocation(current => current?.[0] === longitude && current?.[1] === latitude ? current : [longitude, latitude]);
      setAccuracy(Number.isFinite(reportedAccuracy) && reportedAccuracy >= 0 ? reportedAccuracy : null);
      setLocationError('');
      setLocating(false);
    }, fail, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
    return () => { active = false; navigator.geolocation.clearWatch(watch); };
  }, [watching]);
  useEffect(() => {
    if (!ready || !location || locating || originMode !== 'device' || locationRequest === centeredRequest.current) return;
    mapRef.current?.easeTo({ center: location, zoom: 15, duration: 500 });
    centeredRequest.current = locationRequest;
  }, [ready, location, locating, locationRequest, originMode]);
  useEffect(() => {
    if (!origin || !destination) { setRoute(null); setRouteBusy(false); return; }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort('timeout'), 15000);
    setRoute(null);
    setRouteBusy(true);
    setRouteError('');
    fetch(`https://router.project-osrm.org/route/v1/driving/${origin[0]},${origin[1]};${destination.lng},${destination.lat}?overview=full&geometries=geojson`, { signal: controller.signal })
      .then(response => { if (!response.ok) throw new Error('Directions are unavailable right now. Please try again.'); return response.json(); })
      .then(data => {
        const candidate = data.routes?.[0];
        if (!candidate || !Number.isFinite(candidate.distance) || candidate.distance < 0 || !Number.isFinite(candidate.duration) || candidate.duration < 0 || !Array.isArray(candidate.geometry?.coordinates) || candidate.geometry.coordinates.length < 2 || candidate.geometry.coordinates.some(coordinate => !Array.isArray(coordinate) || !Number.isFinite(coordinate[0]) || !Number.isFinite(coordinate[1]) || Math.abs(coordinate[0]) > 180 || Math.abs(coordinate[1]) > 90)) throw new Error('No driving route found for these locations.');
        if (controller.signal.aborted) return;
        setRoute(candidate);
      }).catch(failure => {
        if (controller.signal.reason === 'timeout') setRouteError('Directions took too long. Please try again.');
        else if (!controller.signal.aborted) setRouteError(failure.message || 'Directions are unavailable.');
      }).finally(() => {
        clearTimeout(timeout);
        if (!controller.signal.aborted || controller.signal.reason === 'timeout') setRouteBusy(false);
      });
    return () => { clearTimeout(timeout); controller.abort(); };
  }, [origin, destination, routeAttempt]);

  function retryMap() { setReady(false); setMapError(''); setAttempt(value => value + 1); }
  function locateMe() {
    setOriginMode('device');
    setPickingOrigin(false);
    setLocationError('');
    if (!watching) setLocating(true);
    setWatching(true);
    setLocationRequest(value => value + 1);
  }
  function manualMode() {
    setOriginMode('manual');
    setWatching(false);
    setLocating(false);
    setLocationError('');
    setRouteError('');
  }
  function chooseManual(longitude, latitude, name = '') {
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude) || Math.abs(longitude) > 180 || Math.abs(latitude) > 90) { setLocationError('Enter valid latitude and longitude coordinates.'); return; }
    manualMode();
    setManualLocation([longitude, latitude]);
    setLatitudeInput(String(Number(latitude.toFixed(6))));
    setLongitudeInput(String(Number(longitude.toFixed(6))));
    setManualName(name);
    setPickingOrigin(false);
    mapRef.current?.easeTo({ center: [longitude, latitude], zoom: 14, duration: 400 });
  }
  function fitAll() {
    const coordinates = JSON.parse(coordinatesKey);
    if (coordinates.length) mapRef.current?.fitBounds(coordinateBounds(coordinates), { padding: 55, maxZoom: 15, duration: 400 });
  }
  function showPlace(place) {
    setSelected(place.id);
    mapRef.current?.easeTo({ center: [place.lng, place.lat], zoom: 15, duration: 400 });
  }
  function directions(place) {
    if (originMode === 'manual' && !manualLocation) { setLocationError('Choose a manual starting point first.'); return; }
    setDestination({ id: place.id, name: place.name, lng: place.lng, lat: place.lat });
    if (originMode === 'device' && !location) { setLocationError(''); setWatching(true); }
  }

  return <section className="map-section" aria-label={translate('Yaounde interactive map')} data-map-ready={ready} data-map-theme={theme}>
    <div className="map-toolbar">
      <div className="map-place-picker"><select aria-label={translate('Find a place on the map')} value={selectedPlace?.id || ''} onChange={event => { const place = validPlaces.find(item => item.id === Number(event.target.value)); if (place) showPlace(place); else setSelected(null); }}><option value="">{translate('{count} places on the map', { count: number(validPlaces.length) })}</option>{validPlaces.map(place => <option key={place.id} value={place.id}>{place.name}</option>)}</select><button className="button secondary" disabled={!selectedPlace || routeBusy} onClick={() => directions(selectedPlace)}><Navigation size={17} />{translate('Estimate trip')}</button></div>
      <div className="map-actions"><button className="icon-button" title={translate('Fit all places')} aria-label={translate('Fit all places')} onClick={fitAll}><Expand size={18} /></button><button className={`button secondary locate-button ${watching ? 'selected' : ''}`} disabled={locating} aria-busy={locating} onClick={locateMe}><LocateFixed size={17} />{translate(locating ? 'Locating...' : 'Locate me')}</button><button className="icon-button" disabled={!watching} title={translate('Stop live location')} aria-label={translate('Stop live location')} onClick={() => { setWatching(false); setLocating(false); }}><Square size={16} /></button></div>
    </div>
    <div className="origin-controls">
      <div className="segmented" role="group" aria-label={translate('Starting point')}><button className={originMode === 'device' ? 'active' : ''} type="button" aria-pressed={originMode === 'device'} onClick={locateMe}><LocateFixed size={16} />{translate('Device location')}</button><button className={originMode === 'manual' ? 'active' : ''} type="button" aria-pressed={originMode === 'manual'} onClick={manualMode}><MapPin size={16} />{translate('Manual origin')}</button></div>
      {originMode === 'manual' && <>
        <div className="manual-place-row"><Label>Starting landmark<select value="" onChange={event => { const place = validPlaces.find(item => item.id === Number(event.target.value)); if (place) chooseManual(place.lng, place.lat, place.name); }}><option value="">{translate('Choose a starting landmark')}</option>{validPlaces.map(place => <option key={place.id} value={place.id}>{place.name}</option>)}</select></Label><button type="button" className={`button secondary${pickingOrigin ? ' selected' : ''}`} aria-pressed={pickingOrigin} onClick={() => { setPickingOrigin(!pickingOrigin); setSelected(null); }}><MapPin size={17} />{translate(pickingOrigin ? 'Cancel map selection' : 'Choose on map')}</button></div>
        <form className="manual-coordinates" onSubmit={event => { event.preventDefault(); chooseManual(longitudeInput === '' ? NaN : Number(longitudeInput), latitudeInput === '' ? NaN : Number(latitudeInput)); }}><Label>Latitude<input type="number" step="any" min="-90" max="90" required value={latitudeInput} onChange={event => setLatitudeInput(event.target.value)} /></Label><Label>Longitude<input type="number" step="any" min="-180" max="180" required value={longitudeInput} onChange={event => setLongitudeInput(event.target.value)} /></Label><button className="button secondary"><MapPin size={17} />{translate('Set origin')}</button></form>
      </>}
    </div>
    <ErrorMessage>{locationError || routeError}</ErrorMessage>
    {routeError && destination && <button className="text-button route-retry" onClick={() => setRouteAttempt(value => value + 1)}><RefreshCw size={16} />{translate('Retry directions')}</button>}
    {origin && <div className={`location-summary${originMode === 'manual' ? ' manual' : ''}`} role="status"><strong>{translate(originMode === 'manual' ? 'Manual starting point' : watching ? 'Live location' : 'Last known location')}</strong>{originMode === 'manual' && manualName && <span>{manualName}</span>}<span>{translate('Latitude {latitude}, longitude {longitude}', { latitude: number(origin[1], { minimumFractionDigits: 5, maximumFractionDigits: 5, useGrouping: false }), longitude: number(origin[0], { minimumFractionDigits: 5, maximumFractionDigits: 5, useGrouping: false }) })}</span>{originMode === 'device' && accuracy !== null && <span>{translate('Accuracy: about {meters} m', { meters: number(Math.ceil(accuracy)) })}</span>}</div>}
    {mapError && <div className="map-warning" role="status"><span>{translate(mapError)}</span><button className="text-button" onClick={retryMap}><RefreshCw size={16} />{translate('Retry map')}</button></div>}
    <div className="map-canvas">
      <MapBoundary key={attempt} onRetry={retryMap} translate={translate}>
        <Map key={language} ref={mapRef} center={selectedPlace ? [selectedPlace.lng, selectedPlace.lat] : [11.52, 3.87]} zoom={selectedPlace ? 15 : 12} theme={theme} locale={{ 'Map.Title': translate('Map'), 'AttributionControl.ToggleAttribution': translate('Toggle attribution') }} className="city-map" canvasContextAttributes={{ preserveDrawingBuffer: import.meta.env.DEV }}>
          <MapEvents coordinatesKey={coordinatesKey} route={route} onReady={setReady} onError={setMapError} pickingOrigin={pickingOrigin} onPickOrigin={chooseManual} />
          <MapControls position="top-right" showZoom showCompass labels={{ zoomIn: translate('Zoom in'), zoomOut: translate('Zoom out'), compass: translate('Reset bearing to north') }} />
          {validPlaces.map(place => <MapMarker key={place.id} longitude={place.lng} latitude={place.lat} anchor="center"><MarkerContent><button className={`place-marker ${selected === place.id ? 'is-selected' : ''}`} title={place.name} aria-label={translate('Show {name} on map', { name: place.name })} aria-pressed={selected === place.id} onClick={() => showPlace(place)}><MapPin size={18} /></button></MarkerContent></MapMarker>)}
          {origin && <MapMarker longitude={origin[0]} latitude={origin[1]} anchor="center" draggable={originMode === 'manual'} onDragEnd={({ lng, lat }) => chooseManual(lng, lat)}><MarkerContent><span className={originMode === 'manual' ? 'manual-origin-marker' : 'user-location-marker'} role="img" aria-label={translate(originMode === 'manual' ? 'Manual starting point' : 'Your location')}>{originMode === 'manual' && <MapPin size={18} />}</span></MarkerContent></MapMarker>}
          {selectedPlace && <MapPopup key={selectedPlace.id} longitude={selectedPlace.lng} latitude={selectedPlace.lat} onClose={() => setSelected(null)} closeButton closeLabel={translate('Close popup')} closeOnClick={false} offset={24} className="place-map-popup"><div className="map-popup"><PlaceImage place={selectedPlace} /><div className="map-popup-body"><Link to={`/places/${selectedPlace.id}`}>{selectedPlace.name}</Link><p>{selectedPlace.neighborhood}<span className="rating"><Star size={13} fill="currentColor" />{number(selectedPlace.rating || 0, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</span></p><DestinationActions place={selectedPlace} directions={false} /><div className="map-popup-actions"><button className="button" onClick={() => onPlan(selectedPlace)}><CalendarPlus size={16} />{translate('Plan a visit')}</button><button className="button secondary" onClick={() => directions(selectedPlace)}><Navigation size={16} />{translate('Directions')}</button></div></div></div></MapPopup>}
          {route && <MapRoute id="visit-directions" coordinates={route.geometry.coordinates} color={theme === 'dark' ? '#8abcee' : '#2376b6'} width={5} opacity={0.95} interactive={false} />}
        </Map>
      </MapBoundary>
    </div>
    {routeBusy && <p role="status">{translate('Finding a driving route...')}</p>}
    {route && destination && <section className="route-summary" aria-label={translate('Trip estimate')}>
      <div className="route-heading"><Navigation size={19} /><strong>{destination.name}</strong><button className="icon-button" title={translate('Refresh estimate')} aria-label={translate('Refresh estimate')} onClick={() => setRouteAttempt(value => value + 1)}><RefreshCw size={17} /></button><button className="icon-button" title={translate('Clear route')} aria-label={translate('Clear route')} onClick={() => { setDestination(null); setRouteError(''); }}><X size={18} /></button></div>
      <p className="route-distance" role="status">{translate('{distance} km / about {minutes} min driving', { distance: number(route.distance / 1000, { minimumFractionDigits: 1, maximumFractionDigits: 1 }), minutes: number(Math.ceil(route.duration / 60)) })}</p>
      <small>{translate('Driving time excludes live traffic.')}</small>
      <h3>{translate('Cameroon fare estimate')}</h3>
      <Label>Transport<select value={transport} onChange={event => setTransport(event.target.value)}>{[['taxi', 'Shared taxi'], ['private', 'Private car'], ['moto', 'Moto-taxi']].map(([value, label]) => <option key={value} value={value}>{translate(label)}</option>)}</select></Label>
      {farePolicies.loading ? <Loading compact /> : farePolicies.error ? <ResourceError resource={farePolicies} /> : !inResearchArea ? <p role="status">{translate('No researched fare is available for this route. Request a provider quote.')}</p> : !policy ? <p role="status">{translate('No published rate for this mode.')}</p> : <>
        <div className="fare-total"><span>{translate(policy.model === 'reference' ? 'Published reference ceilings' : 'Estimated fare range')}</span><output aria-label={translate('Estimated fare range')} aria-live="polite">{range ? translate('{low} - {high} FCFA', { low: number(range.low), high: number(range.high) }) : policy.model === 'reference' ? translate('{low} - {high} FCFA', { low: number(policy.base_min), high: number(policy.base_max) }) : translate('Quote required')}</output></div>
        <span className="fare-basis">{translate(policy.basis === 'passenger' ? 'Per passenger' : 'Per vehicle')}{policy.model === 'distance' && ` / ${translate('Low confidence')}`}</span>
        <p className="fare-breakdown">{language === 'fr' ? policy.notes_fr : policy.notes_en}</p>
        <div className="fare-source"><a href={policy.source_url} target="_blank" rel="noopener noreferrer">{policy.source_name}</a><span>{translate('Source date: {date}', { date: policy.source_date ? date(policy.source_date) : translate('Not published') })}</span><span>{translate('Checked: {date}', { date: date(policy.checked_at) })}</span></div>
        {oldSource && <p className="fare-stale" role="status">{translate('This source is over a year old. Reconfirm prices before travel.')}</p>}
      </>}
      <details className="custom-fare"><summary>{translate('Custom kilometer calculation')}</summary><div className="fare-controls">
        <Label>Base fare (FCFA)<input type="number" min="0" step="1" inputMode="decimal" value={baseFare} onChange={event => setBaseFare(event.target.value)} /></Label>
        <Label>Rate per km (FCFA)<input type="number" min="0" step="1" inputMode="decimal" value={perKilometer} onChange={event => setPerKilometer(event.target.value)} /></Label>
      </div><div className="fare-total"><span>{translate('Custom estimate')}</span><output aria-label={translate('Custom estimate')} aria-live="polite">{fare === null ? translate('Unavailable') : translate('{amount} FCFA', { amount: number(fare) })}</output></div>{fare !== null && <p className="fare-breakdown">{translate('{base} FCFA + {distance} km x {rate} FCFA/km', { base: number(Number(baseFare)), distance: number(route.distance / 1000, { maximumFractionDigits: 3 }), rate: number(Number(perKilometer)) })}</p>}<small>{translate('User-entered rates, not a provider quote.')}</small></details>
      <small>{translate('Confirm the fare, route access and availability before travel.')}</small>
    </section>}
  </section>;
}