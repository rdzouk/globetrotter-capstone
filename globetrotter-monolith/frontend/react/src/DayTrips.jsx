import { useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowDown, ArrowLeft, ArrowUp, CalendarDays, Check, MapPin, Pencil, Plus, RefreshCw, ThumbsUp, Trash2, UserPlus, Users } from 'lucide-react';
import { api } from './api';
import { useApp, useResource } from './state';
import { Empty, ErrorMessage, Label, Loading, Modal, PageHeading, PlaceImage, ResourceError } from './components';
import { localDate } from './utils';
import TripBudget from './TripBudget';
import { SaveOfflineButton } from './OfflinePacks';

function TripEditor({ trip, onClose, onSaved }) {
  const { places, translate } = useApp();
  const clientId = useRef(crypto.randomUUID());
  const [stops, setStops] = useState(() => (trip?.stops || [{}, {}]).map(stop => ({ key: crypto.randomUUID(), destination_id: stop.destination_id || '', visit_minutes: stop.visit_minutes || 60, cost_fcfa: stop.cost_fcfa ?? '' })));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const availablePlaces = [...new Map([...(places.data || []), ...(trip?.stops || []).map(stop => stop.destination).filter(Boolean)].map(place => [place.id, place])).values()];
  function change(index, changes) { setStops(current => current.map((stop, position) => position === index ? { ...stop, ...changes } : stop)); }
  function move(index, direction) {
    setStops(current => { const next = [...current]; [next[index], next[index + direction]] = [next[index + direction], next[index]]; return next; });
  }
  async function submit(event) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    const optionalAmount = value => value === '' ? null : Number(value);
    setBusy(true); setError('');
    try {
      const saved = await api(trip?.id ? `/day-trips/${trip.id}` : '/day-trips', { method: trip?.id ? 'PUT' : 'POST', body: {
        ...values, client_id: clientId.current, ...(trip?.id ? { version: trip.version } : {}),
        budget_fcfa: optionalAmount(values.budget_fcfa), transport_cost_fcfa: optionalAmount(values.transport_cost_fcfa),
        stops: stops.map(stop => ({ destination_id: Number(stop.destination_id), visit_minutes: Number(stop.visit_minutes), cost_fcfa: optionalAmount(stop.cost_fcfa) })),
      } });
      onSaved(saved);
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }
  return <Modal title={trip?.id ? 'Edit day trip' : 'New day trip'} onClose={onClose} dismissable={!busy}>
    <form className="form-stack" onSubmit={submit}>
      <Label>Trip name<input name="title" required maxLength={120} defaultValue={trip?.title || ''} /></Label>
      <div className="form-grid"><Label>Trip date<input name="trip_date" type="date" required defaultValue={trip?.trip_date || localDate()} /></Label><Label>Start time<input name="start_time" type="time" required defaultValue={trip?.start_time || '09:00'} /></Label></div>
      <div className="form-grid"><Label>Budget (FCFA)<input name="budget_fcfa" type="number" min="0" max="10000000" step="1" defaultValue={trip?.budget_fcfa ?? ''} /></Label><Label>Estimated transport (FCFA)<input name="transport_cost_fcfa" type="number" min="0" max="10000000" step="1" defaultValue={trip?.transport_cost_fcfa ?? ''} /></Label></div>
      <div className="stop-editor-list">{stops.map((stop, index) => <fieldset key={stop.key} className="stop-editor">
        <legend>{translate('Stop {number}', { number: index + 1 })}</legend>
        <Label>Place<select required value={stop.destination_id} onChange={event => change(index, { destination_id: event.target.value })}><option value="">{translate('Choose a place')}</option>{availablePlaces.map(place => <option key={place.id} value={place.id} disabled={stops.some((other, position) => position !== index && Number(other.destination_id) === place.id)}>{place.name}</option>)}</select></Label>
        <div className="form-grid"><Label>Visit duration (minutes)<input type="number" required min="5" max="720" step="1" value={stop.visit_minutes} onChange={event => change(index, { visit_minutes: event.target.value })} /></Label><Label>Estimated stop cost (FCFA)<input type="number" min="0" max="10000000" step="1" value={stop.cost_fcfa} onChange={event => change(index, { cost_fcfa: event.target.value })} /></Label></div>
        <div className="plan-actions"><button type="button" className="icon-button" disabled={index === 0} onClick={() => move(index, -1)} title={translate('Move stop up')} aria-label={translate('Move stop up')}><ArrowUp size={18} /></button><button type="button" className="icon-button" disabled={index === stops.length - 1} onClick={() => move(index, 1)} title={translate('Move stop down')} aria-label={translate('Move stop down')}><ArrowDown size={18} /></button><button type="button" className="icon-button" disabled={stops.length <= 2} onClick={() => setStops(current => current.filter((_, position) => position !== index))} title={translate('Remove stop')} aria-label={translate('Remove stop')}><Trash2 size={18} /></button></div>
      </fieldset>)}</div>
      <button type="button" className="button secondary" disabled={stops.length >= 12} onClick={() => setStops(current => [...current, { key: crypto.randomUUID(), destination_id: '', visit_minutes: 60, cost_fcfa: '' }])}><Plus size={18} />{translate('Add stop')}</button>
      <Label>Notes<textarea name="notes" rows={3} maxLength={4000} defaultValue={trip?.notes || ''} /></Label>
      <ErrorMessage>{error}</ErrorMessage><button className="button" disabled={busy || places.loading}><Check size={18} />{translate(busy ? 'Saving...' : 'Save day trip')}</button>
    </form>
  </Modal>;
}

export default function DayTrips() {
  const { translate, date, number, friends, places, currentUser, notifications } = useApp();
  const [params, setParams] = useSearchParams();
  const selected = Number(params.get('trip')) || null;
  const resource = useResource(selected ? `/shared-trips/${selected}` : '/shared-trips');
  const [editor, setEditor] = useState(null);
  const [tab, setTab] = useState('itinerary');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState(null);
  const details = selected ? resource.data : null;
  const trip = details?.trip;
  const owner = Boolean(trip && details.viewer_id === trip.user_id);
  async function perform(path, method, body) {
    setBusy(true); setError('');
    try { await api(path, { method, ...(body === undefined ? {} : { body }) }); resource.reload(); notifications.reload(); return true; }
    catch (failure) { setError(failure.message); return false; }
    finally { setBusy(false); }
  }
  async function submitSuggestion(event) {
    event.preventDefault();
    const form = event.currentTarget;
    if (await perform(`/shared-trips/${selected}/suggestions`, 'POST', { destination_id: Number(new FormData(form).get('destination_id')) })) form.reset();
  }
  async function invite(event) {
    event.preventDefault();
    const form = event.currentTarget;
    if (await perform(`/shared-trips/${selected}/members`, 'POST', { user_id: Number(new FormData(form).get('user_id')) })) form.reset();
  }
  function saved(value) { setEditor(null); setParams({ trip: String(value.id) }); resource.reload(); notifications.reload(); }
  return <>
    {selected && <Link className="text-button feature-back" to="/day-trips"><ArrowLeft size={17} />{translate('All day trips')}</Link>}
    <PageHeading title={trip?.title || 'Day trips'}>
      <button className="icon-button" onClick={resource.reload} aria-label={translate('Refresh trips')} title={translate('Refresh trips')}><RefreshCw size={18} /></button>
      {!selected && <button className="button" onClick={() => setEditor({})}><Plus size={18} />{translate('New day trip')}</button>}
      {!selected && <Link className="button secondary" to="/offline-packs">{translate('Offline trip packs')}</Link>}
      {trip && <SaveOfflineButton key={trip.id} trip={trip} />}
      {owner && <><button className="icon-button" onClick={() => setEditor(trip)} aria-label={translate('Edit day trip')} title={translate('Edit day trip')}><Pencil size={18} /></button><button className="icon-button" aria-label={translate('Delete day trip')} title={translate('Delete day trip')} onClick={() => setConfirm({ title: 'Delete day trip?', action: async () => { if (await perform(`/day-trips/${trip.id}`, 'DELETE', { version: trip.version })) { setParams({}); return true; } return false; } })}><Trash2 size={18} /></button></>}
    </PageHeading>
    {!confirm && <ErrorMessage>{error}</ErrorMessage>}
    {resource.error ? <ResourceError resource={resource} /> : resource.loading && !resource.data ? <Loading /> : !selected ? <>
      {!resource.data?.length ? <Empty title="No day trips yet" message="Your planned days will appear here." /> : <div className="feature-list">{resource.data.map(item => <article className="feature-row day-trip-row" key={item.id}>
        {item.stops?.[0]?.destination && <PlaceImage place={item.stops[0].destination} className="feature-thumbnail" />}
        <div className="feature-row-main"><h2>{item.status === 'invited' ? item.title : <Link to={`/day-trips?trip=${item.id}`}>{item.title}</Link>}</h2><span className="muted">{date(item.trip_date)} / {item.owner_name}</span><span className="status-label">{translate(item.status === 'invited' ? 'Trip invitation' : item.status === 'owner' ? 'Organizer' : 'Shared trip')}</span></div>
        {item.status === 'invited' && <div className="plan-actions"><button className="button secondary" disabled={busy || !currentUser.data?.id} onClick={() => perform(`/shared-trips/${item.id}/members/${currentUser.data.id}`, 'PATCH', { accepted: true })}><Check size={17} />{translate('Accept invitation')}</button><button className="icon-button" disabled={busy || !currentUser.data?.id} title={translate('Decline invitation')} aria-label={translate('Decline invitation')} onClick={() => setConfirm({ title: 'Decline invitation?', action: () => perform(`/shared-trips/${item.id}/members/${currentUser.data.id}`, 'DELETE') })}><Trash2 size={18} /></button></div>}
      </article>)}</div>}
    </> : trip && <>
      <p className="feature-meta"><CalendarDays size={17} />{date(trip.trip_date)} / {trip.start_time}<Users size={17} />{translate('{count} travelers', { count: number(details.members.filter(member => member.status !== 'invited').length) })}</p>
      <div className="segmented feature-tabs" role="group" aria-label={translate('Trip sections')}>{[['itinerary', 'Itinerary'], ['travelers', 'Travelers'], ['budget', 'Budget']].map(([value, label]) => <button key={value} className={tab === value ? 'active' : ''} aria-pressed={tab === value} onClick={() => setTab(value)}>{translate(label)}</button>)}</div>
      {tab === 'itinerary' && <section className="feature-band"><ol className="trip-stop-list">{trip.stops.map(stop => <li className="feature-row" key={stop.destination_id}>
        <PlaceImage className="feature-thumbnail" place={stop.destination} /><div className="feature-row-main"><Link to={`/places/${stop.destination_id}`}><strong>{stop.destination.name}</strong></Link><span className="muted">{translate('{count} minutes', { count: number(stop.visit_minutes) })} / {stop.cost_fcfa === null ? translate('Cost not set') : translate('{amount} FCFA', { amount: number(stop.cost_fcfa) })}</span></div><Link className="icon-button" to={`/map?place=${stop.destination_id}`} title={translate('Show on map')} aria-label={translate('Show on map')}><MapPin size={18} /></Link>
      </li>)}</ol>{trip.notes && <p className="trip-notes">{trip.notes}</p>}</section>}
      {tab === 'travelers' && <>
        <section className="feature-band"><h2>{translate('Travelers')}</h2><div className="feature-list">{details.members.map(member => <div className="feature-row" key={member.user_id}><div className="feature-row-main"><strong>{member.name}</strong><span className="muted">{translate(member.status === 'owner' ? 'Organizer' : member.status === 'invited' ? 'Invited' : 'Member')}</span></div>{member.status !== 'owner' && (owner || member.user_id === details.viewer_id) && <button className="icon-button" title={translate(member.user_id === details.viewer_id ? 'Leave trip' : 'Remove traveler')} aria-label={translate(member.user_id === details.viewer_id ? 'Leave trip' : 'Remove traveler')} onClick={() => setConfirm({ title: member.user_id === details.viewer_id ? 'Leave trip?' : 'Remove traveler?', action: async () => { const done = await perform(`/shared-trips/${trip.id}/members/${member.user_id}`, 'DELETE'); if (done && member.user_id === details.viewer_id) setParams({}); return done; } })}><Trash2 size={18} /></button>}</div>)}</div>
          {owner && <form className="feature-inline-form" onSubmit={invite}><Label>Invite a friend<select name="user_id" required defaultValue=""><option value="">{translate('Choose a friend')}</option>{(friends.data || []).filter(friend => friend.status === 'accepted' && !details.members.some(member => member.user_id === friend.user_id)).map(friend => <option key={friend.user_id} value={friend.user_id}>{friend.name}</option>)}</select></Label><button className="button secondary" disabled={busy}><UserPlus size={18} />{translate('Invite')}</button></form>}
        </section>
        <section className="feature-band"><h2>{translate('Place suggestions')}</h2><form className="feature-inline-form" onSubmit={submitSuggestion}><Label>Suggested place<select name="destination_id" required defaultValue=""><option value="">{translate('Choose a place')}</option>{(places.data || []).filter(place => !trip.stops.some(stop => stop.destination_id === place.id)).map(place => <option key={place.id} value={place.id}>{place.name}</option>)}</select></Label><button className="button secondary" disabled={busy}><Plus size={18} />{translate('Suggest place')}</button></form>
          {!details.suggestions.length && <p className="muted">{translate('No suggestions yet.')}</p>}
          <div className="feature-list">{details.suggestions.map(suggestion => <article className="feature-row" key={suggestion.id}><PlaceImage place={suggestion.destination} className="feature-thumbnail" /><div className="feature-row-main"><Link to={`/places/${suggestion.destination.id}`}><strong>{suggestion.destination.name}</strong></Link><span className="muted">{suggestion.name}</span></div><button className={`button secondary ${suggestion.voted ? 'selected' : ''}`} aria-pressed={suggestion.voted} aria-label={translate('Vote for {name}', { name: suggestion.destination.name })} disabled={busy} onClick={() => perform(`/shared-trips/${trip.id}/suggestions/${suggestion.id}`, 'PUT', { vote: !suggestion.voted })}><ThumbsUp size={18} />{number(suggestion.votes)}</button>{owner && <button className="icon-button" disabled={trip.stops.length >= 12 || trip.stops.some(stop => stop.destination_id === suggestion.destination.id)} title={translate('Add to itinerary')} aria-label={translate('Add to itinerary')} onClick={() => setEditor({ ...trip, stops: [...trip.stops, { destination_id: suggestion.destination.id, destination: suggestion.destination, visit_minutes: 60, cost_fcfa: null }] })}><Plus size={18} /></button>}{(owner || suggestion.user_id === details.viewer_id) && <button className="icon-button" title={translate('Remove suggestion')} aria-label={translate('Remove suggestion')} onClick={() => setConfirm({ title: 'Remove suggestion?', action: () => perform(`/shared-trips/${trip.id}/suggestions/${suggestion.id}`, 'DELETE') })}><Trash2 size={18} /></button>}</article>)}</div>
        </section>
      </>}
      {tab === 'budget' && <TripBudget details={details} onChange={resource.reload} />}
    </>}
    {editor && <TripEditor trip={editor.id ? editor : null} onClose={() => { setEditor(null); resource.reload(); }} onSaved={saved} />}
    {confirm && <Modal title={confirm.title} onClose={() => setConfirm(null)} dismissable={!busy}><div className="form-stack"><ErrorMessage>{error}</ErrorMessage><div className="plan-actions"><button className="button secondary" disabled={busy} onClick={() => setConfirm(null)}>{translate('Cancel')}</button><button className="button" disabled={busy} onClick={async () => { if (await confirm.action()) setConfirm(null); }}>{translate('Confirm')}</button></div></div></Modal>}
  </>;
}