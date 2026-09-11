import { useEffect, useId, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, Heart, MapPin, Star, X, RefreshCw, SearchX, LoaderCircle, CalendarPlus, ImageOff, Share2, MessageCircle, Navigation, Copy, Check } from 'lucide-react';
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
export function ErrorMessage({ children }) {
  const { translate } = useApp();
  return children ? <div className="error-message" role="alert">{translate(children)}</div> : null;
}
export function Loading({ cards = false }) {
  const { translate } = useApp();
  return cards ? <div className="places-grid" aria-label={translate('Loading places')} aria-busy="true">{Array.from({ length: 6 }, (_, index) => <div key={index} className="skeleton-card"><div /><span /><span /></div>)}</div> : <div className="loading-state" role="status"><LoaderCircle className="spin" size={24} />{translate('Loading...')}</div>;
}
export function Empty({ title = 'No places found', message = 'Try another search or clear your filters.', children }) {
  const { translate } = useApp();
  return <div className="empty-state"><SearchX size={36} strokeWidth={1.4} /><h2>{translate(title)}</h2><p>{translate(message)}</p>{children}</div>;
}
export function ResourceError({ resource }) {
  const { translate } = useApp();
  return <div className="empty-state"><h2>{translate('Something went wrong')}</h2><ErrorMessage>{resource.error}</ErrorMessage><button className="button secondary" onClick={resource.reload}><RefreshCw size={16} />{translate('Try again')}</button></div>;
}
export function PageHeading({ eyebrow, title, description, children }) {
  const { translate } = useApp();
  return <div className="page-heading"><div>{eyebrow && <p className="eyebrow">{translate(eyebrow)}</p>}<h1>{translate(title)}</h1>{description && <p className="page-description">{translate(description)}</p>}</div>{children && <div className="heading-actions">{children}</div>}</div>;
}
export function PlaceImage({ place, className = '', ...props }) {
  const { translate } = useApp();
  const [failed, setFailed] = useState(false);
  const image = placeImage(place);
  return failed || !image ? <div className={`image-fallback ${className}`} role="img" aria-label={translate('Photo unavailable for {name}', { name: place.name })}><ImageOff size={28} /><span>{place.name}</span></div> : <img src={image} alt={place.name} onError={() => setFailed(true)} className={className} {...props} />;
}
export function SaveButton({ place }) {
  const { session, favoriteIds, savingFavorites, toggleFavorite, favorites, translate } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const saved = favoriteIds.has(place.id);
  return <button className={`icon-button save-button ${saved ? 'saved' : ''}`} title={translate(saved ? 'Remove saved place' : 'Save place')} aria-label={translate(saved ? 'Unsave {name}' : 'Save {name}', { name: place.name })} aria-pressed={saved} disabled={savingFavorites.has(place.id) || favorites.loading} onClick={() => session.token ? toggleFavorite(place) : navigate('/login', { state: { from: location.pathname + location.search } })}><Heart size={19} fill={saved ? 'currentColor' : 'none'} /></button>;
}

export function DestinationActions({ place, directions = true }) {
  const { translate } = useApp();
  const [sharing, setSharing] = useState(false);
  async function share() {
    const url = new URL(`/places/${place.id}`, window.location.origin).href;
    if (navigator.share) {
      try { await navigator.share({ title: place.name, text: translate('Visit {name} in {neighborhood}.', { name: place.name, neighborhood: place.neighborhood || 'Yaounde' }), url }); return; }
      catch (error) { if (error.name === 'AbortError') return; }
    }
    setSharing(true);
  }
  return <div className="destination-actions" role="group" aria-label={place.name}>
    <button type="button" className="icon-button" title={translate('Share')} aria-label={translate('Share {name}', { name: place.name })} onClick={share}><Share2 size={18} /></button>
    <Link className="icon-button" title={translate('Show on map')} aria-label={translate('Show {name} on map', { name: place.name })} to={`/map?place=${place.id}`}><MapPin size={18} /></Link>
    <Link className="icon-button" title={translate('Comment')} aria-label={translate('Comment on {name}', { name: place.name })} to={`/places/${place.id}?tab=comments#comment-form`}><MessageCircle size={18} /></Link>
    {directions && <Link className="icon-button" title={translate('Go to this place')} aria-label={translate('Directions to {name}', { name: place.name })} to={`/map?place=${place.id}&directions=1`}><Navigation size={18} /></Link>}
    {sharing && <ShareModal place={place} onClose={() => setSharing(false)} />}
  </div>;
}

function ShareModal({ place, onClose }) {
  const { translate } = useApp();
  const input = useRef(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const url = new URL(`/places/${place.id}`, window.location.origin).href;
  async function copy() {
    setError('');
    try {
      if (!navigator.clipboard?.writeText) throw new Error();
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      input.current.select();
      try { if (!document.execCommand('copy')) throw new Error(); setCopied(true); }
      catch { setError('Could not copy the link.'); }
    }
  }
  return <Modal title="Share this place" onClose={onClose}><div className="form-stack"><strong>{place.name}</strong><Label>Share link<input ref={input} type="url" value={url} readOnly onFocus={event => event.target.select()} /></Label><ErrorMessage>{error}</ErrorMessage><button className="button" onClick={copy}>{copied ? <Check size={18} /> : <Copy size={18} />}{translate(copied ? 'Link copied.' : 'Copy link')}</button></div></Modal>;
}

export function PlaceCard({ place, onPlan, compact = false }) {
  const { translate, number, language } = useApp();
  return <article className={`place-card ${compact ? 'compact' : ''}`}>
    <div className="place-photo"><Link to={`/places/${place.id}`} tabIndex={-1} aria-hidden="true"><PlaceImage place={place} loading="lazy" /></Link><span className="category-label">{translate(categories[place.category] || place.category)}</span><SaveButton place={place} /></div>
    <div className="place-body"><div className="place-title-row"><h2><Link to={`/places/${place.id}`}>{place.name}</Link></h2><span className="rating"><Star size={14} fill="currentColor" />{number(place.rating || 0, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</span></div>
      <p className="place-location"><MapPin size={14} />{place.neighborhood || 'Yaounde'}<span className="price">{'$'.repeat(Math.min(4, Math.max(0, place.price_level || 0)))}</span></p>
      <p className="place-description">{language === 'fr' && place.description_fr ? place.description_fr : translate(place.description)}</p>
      <DestinationActions place={place} />
      <div className="place-footer"><span className="place-tag">{translate((place.tags?.find(tag => tag !== place.category) || 'local favorite').replaceAll('-', ' '))}</span><button className="text-button" onClick={() => onPlan(place)}>{translate('Plan a visit')}<ArrowRight size={16} /></button></div>
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
  return <dialog ref={ref} className="modal" aria-labelledby={titleId} onCancel={event => { event.preventDefault(); onClose(); }} onClick={event => { if (event.target === event.currentTarget) onClose(); }}><div className="modal-content"><div className="modal-heading"><h2 id={titleId}>{translate(title)}</h2><button className="icon-button" onClick={onClose} title={translate('Close')} aria-label={translate('Close dialog')}><X size={22} /></button></div>{children}</div></dialog>;
}
export function BookingModal({ place, trip = null, onClose }) {
  const { setToast, updateTrips, translate } = useApp();
  const [start, setStart] = useState(trip?.start_date || localDate());
  const [end, setEnd] = useState(trip?.end_date || localDate());
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    setBusy(true);
    setError('');
    try {
      await api(trip ? `/itineraries/${trip.id}` : '/itineraries', { method: trip ? 'PATCH' : 'POST', body: { ...values, destination_id: place.id } });
      updateTrips();
      setToast({ message: trip ? 'Plan updated.' : 'Visit added to your trips.' });
      onClose();
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }
  return <Modal title={trip ? 'Edit plan' : 'Plan a visit'} onClose={() => { if (!busy) onClose(); }}>
    <div className="booking-place"><PlaceImage place={place} /><div><strong>{place.name}</strong><p>{place.neighborhood}</p></div></div>
    <form onSubmit={submit} className="form-stack">
      <div className="form-grid"><Label>Start date<input required type="date" name="start_date" min={trip ? undefined : localDate()} value={start} onChange={event => { setStart(event.target.value); if (end < event.target.value) setEnd(event.target.value); }} /></Label><Label>End date<input required type="date" name="end_date" min={start} value={end} onChange={event => setEnd(event.target.value)} /></Label></div>
      <div className="form-grid"><Label>Time slot<input name="time_slot" defaultValue={trip?.time_slot || ''} placeholder="09:00-11:00" pattern="(?:[01][0-9]|2[0-3]):[0-5][0-9]-(?:[01][0-9]|2[0-3]):[0-5][0-9]" /></Label><Label>Transport<select name="transport_mode" defaultValue={trip?.transport_mode || ''}>{[['', 'Not decided'], ['taxi', 'Shared taxi'], ['moto', 'Moto-taxi'], ['yango', 'Yango'], ['own', 'Own vehicle']].map(([value, label]) => <option key={value} value={value}>{translate(label)}</option>)}</select></Label></div>
      <Label>Notes<textarea name="notes" defaultValue={trip?.notes || ''} rows={3} placeholder={translate('Anything to remember?')} maxLength={4000} /></Label>
      <ErrorMessage>{error}</ErrorMessage><button className="button" disabled={busy}><CalendarPlus size={18} />{translate(busy ? 'Saving...' : trip ? 'Save changes' : 'Add to my trips')}</button>
    </form>
  </Modal>;
}
export function RatingInput({ value, onChange }) {
  const { translate } = useApp();
  const groupId = useId();
  return <fieldset className="rating-field"><legend>{translate('Rating')}</legend><div className="rating-input">{[1, 2, 3, 4, 5].map(rating => <label key={rating} title={translate('{count} stars', { count: rating })}><input type="radio" name={groupId} value={rating} checked={value === rating} onChange={() => onChange(rating)} required aria-label={translate('{count} stars', { count: rating })} /><Star size={28} fill={rating <= value ? 'currentColor' : 'none'} /></label>)}</div></fieldset>;
}
export function InterestPicker({ value, onChange }) {
  const { translate } = useApp();
  return <fieldset className="interest-field"><legend>{translate('Your interests')}</legend><div className="interest-options">{interests.map(interest => <label key={interest}><input type="checkbox" checked={value.includes(interest)} onChange={event => onChange(event.target.checked ? [...value, interest] : value.filter(item => item !== interest))} /><span>{translate(interest.replaceAll('-', ' '))}</span></label>)}</div></fieldset>;
}