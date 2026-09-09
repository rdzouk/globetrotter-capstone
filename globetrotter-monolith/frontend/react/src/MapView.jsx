import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { MapContainer, TileLayer, CircleMarker, Popup, useMap, Polyline } from 'react-leaflet';
import { LocateFixed, Navigation } from 'lucide-react';
import 'leaflet/dist/leaflet.css';
import { ErrorMessage } from './components';

function FitPlaces({ places }) {
  const map = useMap();
  useEffect(() => {
    const validPlaces = places.filter(place => typeof place.lat === 'number' && typeof place.lng === 'number');
    if (validPlaces.length) map.fitBounds(validPlaces.map(place => [place.lat, place.lng]), { padding: [35, 35], maxZoom: 14 });
  }, [map, places]);
  return null;
}

export default function MapView({ places, onPlan }) {
  const [location, setLocation] = useState(null);
  const [watching, setWatching] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);
  const [route, setRoute] = useState(null);
  const [routeBusy, setRouteBusy] = useState(false);
  const validPlaces = places.filter(place => typeof place.lat === 'number' && typeof place.lng === 'number');
  useEffect(() => {
    if (!watching) return;
    if (!navigator.geolocation) { setError('Location is unavailable in this browser.'); setWatching(false); return; }
    const watch = navigator.geolocation.watchPosition(position => {
      setLocation([position.coords.latitude, position.coords.longitude]);
      setError('');
    }, failure => { setError(failure.message); setWatching(false); }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 });
    return () => navigator.geolocation.clearWatch(watch);
  }, [watching]);
  useEffect(() => {
    if (!location || !selected) { setRoute(null); return; }
    const controller = new AbortController();
    setRoute(null);
    setRouteBusy(true);
    fetch(`https://router.project-osrm.org/route/v1/driving/${location[1]},${location[0]};${selected.lng},${selected.lat}?overview=full&geometries=geojson`, { signal: controller.signal })
      .then(response => { if (!response.ok) throw new Error('Route unavailable.'); return response.json(); })
      .then(data => {
        if (!data.routes?.length) throw new Error('No driving route found.');
        setRoute(data.routes[0]);
        setError('');
      }).catch(failure => { if (!controller.signal.aborted) setError(failure.message); })
      .finally(() => { if (!controller.signal.aborted) setRouteBusy(false); });
    return () => controller.abort();
  }, [location, selected]);
  return <div className="map-section">
    <div className="map-toolbar"><span>{validPlaces.length} places on the map</span><button className={`button secondary ${watching ? 'selected' : ''}`} aria-pressed={watching} onClick={() => setWatching(!watching)}><LocateFixed size={17} />{watching ? 'Stop live location' : 'My location'}</button></div>
    <ErrorMessage>{error}</ErrorMessage>
    <div className="map-canvas">
      <MapContainer center={[3.87, 11.52]} zoom={12} scrollWheelZoom className="leaflet-map">
        <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <FitPlaces places={places} />
        {validPlaces.map(place => <CircleMarker key={place.id} center={[place.lat, place.lng]} radius={9} pathOptions={{ color: '#ffffff', weight: 2, fillColor: '#17624d', fillOpacity: 1 }}><Popup><div className="map-popup"><Link to={`/places/${place.id}`}>{place.name}</Link><p>{place.neighborhood}</p><button className="button" onClick={() => onPlan(place)}>Plan a visit</button><button className="text-button" onClick={() => { setSelected(place); if (!location) setWatching(true); }}><Navigation size={15} />Directions</button></div></Popup></CircleMarker>)}
        {location && <CircleMarker center={location} radius={9} pathOptions={{ color: '#fff', weight: 3, fillColor: '#2879ca', fillOpacity: 1 }}><Popup>Your location</Popup></CircleMarker>}
        {route && <Polyline positions={route.geometry.coordinates.map(coordinate => [coordinate[1], coordinate[0]])} pathOptions={{ color: '#2879ca', weight: 5 }} />}
      </MapContainer>
    </div>
    {routeBusy && <p role="status">Finding a driving route...</p>}
    {route && selected && <div className="route-summary"><strong>{selected.name}</strong><span>{(route.distance / 1000).toFixed(1)} km / about {Math.round(route.duration / 60)} min driving</span><small>Estimated fares: shared taxi {Math.round(200 + route.distance / 1000 * 150)} FCFA / moto {Math.round(150 + route.distance / 1000 * 100)} FCFA / Yango {Math.round(400 + route.distance / 1000 * 220)} FCFA. Not live pricing.</small></div>}
  </div>;
}