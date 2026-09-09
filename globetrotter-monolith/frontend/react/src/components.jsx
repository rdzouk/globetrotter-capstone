import { useEffect, useId, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, Heart, MapPin, Star, X, RefreshCw, SearchX, LoaderCircle, CalendarPlus, ImageOff } from 'lucide-react';
import { useApp } from './state';
import { api } from './api';
import { localDate, placeImage } from './utils';

export const categories = {
  restaurant: 'Restaurants', hotel: 'Hotels', nature: 'Nature', landmark: 'Landmarks', attraction: 'Attractions',
  sports: 'Sports', spa: 'Wellness', nightlife: 'Nightlife', entertainment: 'Entertainment', hospital: 'Hospitals',
  school: 'Schools', lake: 'Lakes', worship: 'Worship', market: 'Markets', government: 'Government', transport: 'Transport',
};
export const interests = ['restaurant', 'nature', 'culture', 'sports', 'spa', 'nightlife', 'outdoor', 'family-friendly', 'affordable', 'live-music', 'fancy', 'casual'];
export function Label({ children, ...props }) {
  const { translate } = useApp();
  return <label className="field" {...props}>{Array.isArray(children) ? children.map(child => typeof child === 'string' ? translate(child) : child) : typeof children === 'string' ? translate(children) : children}</label>;
}
export function ErrorMessage({ children }) { return children ? <div className="error-message" role="alert">{children}</div> : null; }
export function Loading({ cards = false }) {
  return cards ? <div className="places-grid" aria-label="Loading places" aria-busy="true">{Array.from({ length: 6 }, (_, index) => <div key={index} className="skeleton-card"><div /><span /><span /></div>)}</div> : <div className="loading-state" role="status"><LoaderCircle className="spin" size={24} />Loading...</div>;
}
export function Empty({ title = 'No places found', message = 'Try another search or clear your filters.', children }) {
  return <div className="empty-state"><SearchX size={36} strokeWidth={1.4} /><h2>{title}</h2><p>{message}</p>{children}</div>;
}
export function ResourceError({ resource }) {
  return <div className="empty-state"><h2>Something went wrong</h2><ErrorMessage>{resource.error}</ErrorMessage><button className="button secondary" onClick={resource.reload}><RefreshCw size={16} />Try again</button></div>;
}
export function PageHeading({ eyebrow, title, description, children }) {
  const { translate } = useApp();
  return <div className="page-heading"><div>{eyebrow && <p className="eyebrow">{translate(eyebrow)}</p>}<h1>{translate(title)}</h1>{description && <p className="page-description">{translate(description)}</p>}</div>{children && <div className="heading-actions">{children}</div>}</div>;
}
export function PlaceImage({ place, className = '', ...props }) {
  const [failed, setFailed] = useState(false);
  const image = placeImage(place);
  return failed || !image ? <div className={`image-fallback ${className}`} role="img" aria-label={`Photo unavailable for ${place.name}`}><ImageOff size={28} /><span>{place.name}</span></div> : <img src={image} alt={place.name} onError={() => setFailed(true)} className={className} {...props} />;
}
export function SaveButton({ place }) {
  const { session, favoriteIds, savingFavorites, toggleFavorite, favorites } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const saved = favoriteIds.has(place.id);
  return <button className={`icon-button save-button ${saved ? 'saved' : ''}`} title={saved ? 'Remove saved place' : 'Save place'} aria-label={`${saved ? 'Unsave' : 'Save'} ${place.name}`} aria-pressed={saved} disabled={savingFavorites.has(place.id) || favorites.loading} onClick={() => session.token ? toggleFavorite(place) : navigate('/login', { state: { from: location.pathname + location.search } })}><Heart size={19} fill={saved ? 'currentColor' : 'none'} /></button>;
}
export function PlaceCard({ place, onPlan, compact = false }) {
  const { translate } = useApp();
  return <article className={`place-card ${compact ? 'compact' : ''}`}>
    <div className="place-photo"><Link to={`/places/${place.id}`} tabIndex={-1} aria-hidden="true"><PlaceImage place={place} loading="lazy" /></Link><span className="category-label">{translate(categories[place.category] || place.category)}</span><SaveButton place={place} /></div>
    <div className="place-body"><div className="place-title-row"><h2><Link to={`/places/${place.id}`}>{place.name}</Link></h2><span className="rating"><Star size={14} fill="currentColor" />{Number(place.rating || 0).toFixed(1)}</span></div>
      <p className="place-location"><MapPin size={14} />{place.neighborhood || 'Yaounde'}<span className="price">{'$'.repeat(Math.min(4, Math.max(0, place.price_level || 0)))}</span></p>
      <p className="place-description">{place.description}</p>
      <div className="place-footer"><span className="place-tag">{(place.tags?.find(tag => tag !== place.category) || 'local favorite').replaceAll('-', ' ')}</span><button className="text-button" onClick={() => onPlan(place)}>{translate('Plan a visit')}<ArrowRight size={16} /></button></div>
    </div>
  </article>;
}
export function Modal({ title, children, onClose }) {
  const { translate } = useApp();
  const ref = useRef(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.showModal();
    return () => { dialog.close(); document.body.style.overflow = overflow; previous?.focus(); };
  }, []);
  return <dialog ref={ref} className="modal" aria-labelledby={titleId} onCancel={event => { event.preventDefault(); onClose(); }} onClick={event => { if (event.target === event.currentTarget) onClose(); }}><div className="modal-content"><div className="modal-heading"><h2 id={titleId}>{translate(title)}</h2><button className="icon-button" onClick={onClose} title={translate('Close')} aria-label="Close dialog"><X size={22} /></button></div>{children}</div></dialog>;
}
export function BookingModal({ place, onClose }) {
  const { setToast, updateTrips } = useApp();
  const [start, setStart] = useState(localDate());
  const [end, setEnd] = useState(localDate());
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    setBusy(true);
    setError('');
    try {
      await api('/itineraries', { method: 'POST', body: { ...values, destination_id: place.id } });
      updateTrips();
      setToast({ message: 'Visit added to your trips.' });
      onClose();
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }
  return <Modal title="Plan a visit" onClose={onClose}><div className="booking-place"><PlaceImage place={place} /><div><strong>{place.name}</strong><p>{place.neighborhood}</p></div></div><form onSubmit={submit} className="form-stack"><div className="form-grid"><Label>Start date<input required type="date" name="start_date" min={localDate()} value={start} onChange={event => { setStart(event.target.value); if (end < event.target.value) setEnd(event.target.value); }} /></Label><Label>End date<input required type="date" name="end_date" min={start} value={end} onChange={event => setEnd(event.target.value)} /></Label></div><div className="form-grid"><Label>Time slot<input name="time_slot" placeholder="09:00-11:00" pattern="[0-2][0-9]:[0-5][0-9]-[0-2][0-9]:[0-5][0-9]" /></Label><Label>Transport<select name="transport_mode"><option value="">Not decided</option><option value="taxi">Shared taxi</option><option value="moto">Moto-taxi</option><option value="yango">Yango</option><option value="own">Own vehicle</option></select></Label></div><Label>Notes<textarea name="notes" rows={3} placeholder="Anything to remember?" maxLength={4000} /></Label><ErrorMessage>{error}</ErrorMessage><button className="button" disabled={busy}><CalendarPlus size={18} />{busy ? 'Saving...' : 'Add to my trips'}</button></form></Modal>;
}
export function RatingInput({ value, onChange }) {
  const groupId = useId();
  return <fieldset className="rating-field"><legend>Rating</legend><div className="rating-input">{[1, 2, 3, 4, 5].map(rating => <label key={rating} title={`${rating} stars`}><input type="radio" name={groupId} value={rating} checked={value === rating} onChange={() => onChange(rating)} required aria-label={`${rating} stars`} /><Star size={28} fill={rating <= value ? 'currentColor' : 'none'} /></label>)}</div></fieldset>;
}
export function InterestPicker({ value, onChange }) {
  return <fieldset className="interest-field"><legend>Your interests</legend><div className="interest-options">{interests.map(interest => <label key={interest}><input type="checkbox" checked={value.includes(interest)} onChange={event => onChange(event.target.checked ? [...value, interest] : value.filter(item => item !== interest))} /><span>{interest.replaceAll('-', ' ')}</span></label>)}</div></fieldset>;
}