import { useDeferredValue, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bookmark, CalendarDays, Check, ChevronLeft, ChevronRight, ExternalLink, Pencil, Plus } from 'lucide-react';
import { api } from './api';
import { useApp, useResource } from './state';
import { Empty, ErrorMessage, Label, Loading, Modal, PageHeading, PlaceImage, ResourceError } from './components';
import { localDate } from './utils';

const categories = [['music', 'Music'], ['exhibition', 'Exhibitions'], ['festival', 'Festivals'], ['sport', 'Sports'], ['workshop', 'Workshops'], ['other', 'Other']];
const cameroonDate = value => new Date(new Date(value).getTime() + 3600000).toISOString().slice(0, 16);

function EventEditor({ event, onClose, onSaved }) {
  const { places, translate } = useApp();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(action) {
    action.preventDefault();
    const values = Object.fromEntries(new FormData(action.currentTarget));
    setBusy(true); setError('');
    try {
      await api(event?.id ? `/admin/events/${event.id}` : '/admin/events', { method: event?.id ? 'PUT' : 'POST', body: {
        ...values, version: event?.version, destination_id: Number(values.destination_id),
        starts_at: `${values.starts_at}:00+01:00`, ends_at: `${values.ends_at}:00+01:00`,
        price_fcfa: values.price_fcfa === '' ? null : Number(values.price_fcfa),
      } });
      onSaved();
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }
  return <Modal title={event?.id ? 'Edit event' : 'New event'} onClose={onClose} dismissable={!busy}><form className="form-stack" onSubmit={submit}>
    <Label>Event title (English)<input name="title" required maxLength={160} defaultValue={event?.title || ''} /></Label>
    <Label>Event title (French)<input name="title_fr" required maxLength={160} defaultValue={event?.title_fr || ''} /></Label>
    <Label>Event description (English)<textarea name="description" required maxLength={4000} rows={3} defaultValue={event?.description || ''} /></Label>
    <Label>Event description (French)<textarea name="description_fr" required maxLength={4000} rows={3} defaultValue={event?.description_fr || ''} /></Label>
    <Label>Event venue<select name="destination_id" required defaultValue={event?.destination_id || ''}><option value="">{translate('Choose a place')}</option>{(places.data || []).map(place => <option key={place.id} value={place.id}>{place.name}</option>)}</select></Label>
    <div className="form-grid"><Label>Starts (Cameroon time)<input name="starts_at" type="datetime-local" required defaultValue={event?.starts_at ? cameroonDate(event.starts_at) : ''} /></Label><Label>Ends (Cameroon time)<input name="ends_at" type="datetime-local" required defaultValue={event?.ends_at ? cameroonDate(event.ends_at) : ''} /></Label></div>
    <div className="form-grid"><Label>Event category<select name="category" defaultValue={event?.category || 'music'}>{categories.map(([value, label]) => <option key={value} value={value}>{translate(label)}</option>)}</select></Label><Label>Entry price (FCFA)<input type="number" min="0" max="10000000" step="1" name="price_fcfa" defaultValue={event?.price_fcfa ?? ''} /></Label></div>
    <Label>Event source link<input name="source_url" type="url" required pattern="https://.*" maxLength={500} defaultValue={event?.source_url || ''} /></Label>
    <Label>Publication status<select name="status" defaultValue={event?.status || 'draft'}>{[['draft', 'Draft'], ['published', 'Published'], ['cancelled', 'Cancelled']].map(([value, label]) => <option key={value} value={value}>{translate(label)}</option>)}</select></Label>
    <ErrorMessage>{error}</ErrorMessage><button className="button" disabled={busy}><Check size={18} />{translate(busy ? 'Saving...' : 'Save event')}</button>
  </form></Modal>;
}

export default function Events() {
  const { session, translate, language, number, date } = useApp();
  const [mode, setMode] = useState('upcoming');
  const [category, setCategory] = useState('');
  const [search, setSearch] = useState('');
  const query = useDeferredValue(search);
  const [from, setFrom] = useState(() => cameroonDate(new Date()).slice(0, 10));
  const [to, setTo] = useState('');
  const [offset, setOffset] = useState(0);
  const [editor, setEditor] = useState(null);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState('');
  const params = new URLSearchParams({ from, category, q: query, offset: String(offset), ...(to ? { to } : {}), ...(mode === 'saved' ? { saved: '1' } : {}), ...(mode === 'manage' ? { manage: '1' } : {}) });
  const resource = useResource(`/events?${params}`);
  function weekend() {
    const today = new Date(`${cameroonDate(new Date()).slice(0, 10)}T12:00:00`);
    const day = today.getDay();
    today.setDate(today.getDate() + (day === 0 ? -1 : (6 - day + 7) % 7));
    setFrom(localDate(today)); today.setDate(today.getDate() + 1); setTo(localDate(today)); setOffset(0);
  }
  async function interest(event) {
    setBusy(event.id); setError('');
    try { await api(`/events/${event.id}/interest`, { method: event.interested ? 'DELETE' : 'PUT' }); resource.reload(); }
    catch (failure) { setError(failure.message); }
    finally { setBusy(null); }
  }
  return <>
    <PageHeading title="Events in Yaounde">{session.role === 'admin' && <button className="button" onClick={() => setEditor({})}><Plus size={18} />{translate('New event')}</button>}</PageHeading>
    <div className="segmented feature-tabs" role="group" aria-label={translate('Event views')}>{[['upcoming', 'Upcoming events'], ['saved', 'Saved events'], ...(session.role === 'admin' ? [['manage', 'Manage events']] : [])].map(([value, label]) => <button key={value} className={mode === value ? 'active' : ''} aria-pressed={mode === value} onClick={() => { setMode(value); setOffset(0); }}>{translate(label)}</button>)}</div>
    <div className="event-filters"><Label>Search events<input type="search" value={search} maxLength={120} onChange={event => { setSearch(event.target.value); setOffset(0); }} /></Label><Label>Event category<select value={category} onChange={event => { setCategory(event.target.value); setOffset(0); }}><option value="">{translate('All categories')}</option>{categories.map(([value, label]) => <option key={value} value={value}>{translate(label)}</option>)}</select></Label>{mode !== 'manage' && <><Label>From date<input type="date" value={from} onChange={event => { if (event.target.value) { setFrom(event.target.value); setOffset(0); } }} /></Label><Label>To date<input type="date" value={to} min={from} onChange={event => { setTo(event.target.value); setOffset(0); }} /></Label><button className="button secondary" onClick={weekend}><CalendarDays size={18} />{translate('This weekend')}</button></>}</div>
    <ErrorMessage>{error}</ErrorMessage>
    {resource.error ? <ResourceError resource={resource} /> : resource.loading ? <Loading /> : !resource.data?.items.length ? <Empty title="No events found" message="No published events match these dates." /> : <div className="events-grid">{resource.data.items.map(event => <article className="event-card" key={event.id}>
      <Link to={`/places/${event.destination_id}`}><PlaceImage place={event.destination} className="event-photo" /></Link>
      <div className="event-content"><span className="eyebrow">{translate(categories.find(([value]) => value === event.category)?.[1] || 'Other')}</span><h2>{language === 'fr' ? event.title_fr : event.title}</h2>
        <p className="muted">{date(event.starts_at, { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Douala' })} / {date(event.ends_at, { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Douala' })}</p><p><Link to={`/places/${event.destination_id}`}>{event.destination.name}</Link></p>
        <p className="event-description">{language === 'fr' ? event.description_fr : event.description}</p><strong>{event.price_fcfa === null ? translate('Price not announced') : event.price_fcfa === 0 ? translate('Free entry') : translate('{amount} FCFA', { amount: number(event.price_fcfa) })}</strong>
        {event.status !== 'published' && <p className="status-label">{translate(event.status === 'draft' ? 'Draft' : 'Cancelled')}</p>}
        <div className="plan-actions"><a className="button secondary" href={event.source_url} target="_blank" rel="noopener noreferrer"><ExternalLink size={17} />{translate('Event source')}</a>{event.status !== 'draft' && <button className="icon-button" aria-pressed={event.interested} disabled={busy === event.id || (event.status === 'cancelled' && !event.interested)} aria-label={translate(event.interested ? 'Unsave event' : 'Save event')} title={translate(event.interested ? 'Unsave event' : 'Save event')} onClick={() => interest(event)}><Bookmark size={20} fill={event.interested ? 'currentColor' : 'none'} /></button>}{session.role === 'admin' && <button className="icon-button" title={translate('Edit event')} aria-label={translate('Edit event')} onClick={() => setEditor(event)}><Pencil size={18} /></button>}</div>
      </div>
    </article>)}</div>}
    {(offset > 0 || resource.data?.has_more) && <div className="feature-pagination"><button className="button secondary" disabled={!offset} onClick={() => setOffset(current => Math.max(0, current - 24))}><ChevronLeft size={18} />{translate('Previous events')}</button><button className="button secondary" disabled={!resource.data?.has_more} onClick={() => setOffset(current => current + 24)}>{translate('Next events')}<ChevronRight size={18} /></button></div>}
    {editor && <EventEditor event={editor} onClose={() => setEditor(null)} onSaved={() => { setEditor(null); resource.reload(); }} />}
  </>;
}