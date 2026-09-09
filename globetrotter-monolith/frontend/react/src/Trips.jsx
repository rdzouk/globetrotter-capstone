import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, Check, ChevronLeft, ChevronRight, Clock3, Compass, MapPin, Plus, Star } from 'lucide-react';
import { api } from './api';
import { useApp, useResource } from './state';
import { Empty, ErrorMessage, Label, Loading, Modal, PageHeading, PlaceImage, RatingInput, ResourceError } from './components';
import { formatDate, localDate, weekDays } from './utils';

export default function Trips({ planner = false, onPlan }) {
  const { places, tripVersion } = useApp();
  const trips = useResource(`/itineraries?revision=${tripVersion}`);
  const [filter, setFilter] = useState('upcoming');
  const [week, setWeek] = useState(localDate());
  const [review, setReview] = useState(null);
  const today = localDate();
  const days = weekDays(week);
  const byId = new Map((places.data || []).map(place => [place.id, place]));
  const all = [...(trips.data || [])].sort((first, second) => first.start_date.localeCompare(second.start_date));
  const upcoming = all.filter(trip => !trip.visited && trip.end_date >= today);
  const visited = all.filter(trip => trip.visited);
  const past = all.filter(trip => !trip.visited && trip.end_date < today);
  const filtered = filter === 'upcoming' ? upcoming : filter === 'visited' ? visited : filter === 'past' ? past : all;
  function moveWeek(direction) {
    const date = new Date(`${week}T12:00:00`);
    date.setDate(date.getDate() + direction * 7);
    setWeek(localDate(date));
  }
  function renderTrip(trip, small = false) {
    const place = byId.get(trip.destination_id);
    return <article key={trip.id} className={`trip-card ${small ? 'planner-trip' : ''}`}>{!small && place && <Link to={`/places/${place.id}`} className="trip-image"><PlaceImage place={place} loading="lazy" /></Link>}<div className="trip-content"><span className={`status-label ${trip.visited ? 'visited' : trip.end_date < today ? 'past' : ''}`}>{trip.visited ? 'Visited' : trip.end_date < today ? 'Past visit' : 'Upcoming'}</span><h2>{place ? <Link to={`/places/${place.id}`}>{place.name}</Link> : `Place #${trip.destination_id}`}</h2>{!small && <p className="place-location"><MapPin size={14} />{place?.neighborhood || 'Yaounde'}</p>}<p className="trip-date"><CalendarDays size={15} />{formatDate(trip.start_date)}{trip.start_date !== trip.end_date && ` - ${formatDate(trip.end_date)}`}</p>{trip.time_slot && <p className="trip-date"><Clock3 size={15} />{trip.time_slot}</p>}{trip.transport_mode && <p className="muted">{({ taxi: 'Shared taxi', moto: 'Moto-taxi', yango: 'Yango', own: 'Own vehicle' })[trip.transport_mode] || trip.transport_mode}</p>}{trip.notes && <p className="trip-notes">{trip.notes}</p>}{trip.review ? <div className="trip-review"><span className="rating"><Star size={15} fill="currentColor" />{trip.review.rating}/5</span><p>{trip.review.comment}</p></div> : <button className="text-button" onClick={() => setReview(trip)}><Check size={16} />Mark visited & review</button>}{place && trip.end_date < today && <button className="text-button" onClick={() => onPlan(place)}><Plus size={16} />Plan another visit</button>}</div></article>;
  }
  return <><PageHeading eyebrow="LESS ROUTINE, MORE DISCOVERY" title={planner ? 'Your week, well spent' : 'Your next chapter'} description={planner ? 'A little space for the things you love.' : 'Plans to look forward to. Places to remember.'}><Link to="/" className="button"><Plus size={18} />Plan a visit</Link></PageHeading><div className="trip-stats"><div><span>UPCOMING</span><strong>{upcoming.length.toString().padStart(2, '0')}</strong></div><div><span>PLACES VISITED</span><strong>{visited.length.toString().padStart(2, '0')}</strong></div><div><span>ALL PLANS</span><strong>{all.length.toString().padStart(2, '0')}</strong></div></div><div className="trip-tabs"><div className="segmented"><Link to="/itineraries" className={!planner ? 'active' : ''}>My trips</Link><Link to="/planner" className={planner ? 'active' : ''}><CalendarDays size={16} />Weekly planner</Link></div>{planner ? <div className="week-controls"><button className="icon-button" title="Previous week" aria-label="Previous week" onClick={() => moveWeek(-1)}><ChevronLeft size={20} /></button><button className="text-button" onClick={() => setWeek(today)}>Today</button><button className="icon-button" title="Next week" aria-label="Next week" onClick={() => moveWeek(1)}><ChevronRight size={20} /></button><input type="date" value={week} onChange={event => { if (event.target.value) setWeek(event.target.value); }} aria-label="Planner week" /></div> : <select aria-label="Trip status" value={filter} onChange={event => setFilter(event.target.value)}><option value="upcoming">Upcoming</option><option value="visited">Visited</option><option value="past">Past visits</option><option value="all">All trips</option></select>}</div>{trips.loading || places.loading ? <Loading /> : trips.error || places.error ? <ResourceError resource={trips.error ? trips : places} /> : planner ? <div className="week-grid">{days.map(day => <section key={day} className={`week-day ${day === today ? 'today' : ''}`}><header><span>{new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short' })}</span><strong>{new Date(`${day}T12:00:00`).getDate()}</strong></header><div>{all.filter(trip => trip.start_date <= day && trip.end_date >= day).map(trip => renderTrip(trip, true))}</div><Link to="/" className="add-day" aria-label={`Find a place for ${formatDate(day)}`}><Plus size={17} /></Link></section>)}</div> : filtered.length ? <div className="trips-list">{filtered.map(trip => renderTrip(trip))}</div> : <Empty title="Something to look forward to" message="Your next adventure starts with a place."><Link className="button secondary" to="/"><Compass size={17} />Explore Yaounde</Link></Empty>}{review && <ReviewModal trip={review} onClose={() => setReview(null)} onSaved={trips.reload} />}</>;
}

function ReviewModal({ trip, onClose, onSaved }) {
  const { setToast } = useApp();
  const [rating, setRating] = useState(0);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api(`/itineraries/${trip.id}/visit`, { method: 'PATCH', body: { ...Object.fromEntries(new FormData(event.currentTarget)), rating } });
      onSaved();
      setToast({ message: 'Visit recorded. Thanks for your review.' });
      onClose();
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }
  return <Modal title="How was your visit?" onClose={onClose}><form className="form-stack" onSubmit={submit}><RatingInput value={rating} onChange={setRating} /><Label>Date visited<input name="visited_date" type="date" required defaultValue={localDate()} max={localDate()} /></Label><Label>Your review<textarea name="comment" maxLength={1000} rows={4} placeholder="What stood out?" /></Label><ErrorMessage>{error}</ErrorMessage><button className="button" disabled={busy}><Check size={17} />{busy ? 'Saving...' : 'Save review'}</button></form></Modal>;
}