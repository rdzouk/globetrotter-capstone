import { useState } from 'react';
import { ChevronLeft, ChevronRight, Pencil, Plus, RefreshCw, Save, Search, ShieldCheck } from 'lucide-react';
import { api } from './api';
import { useApp, useResource } from './state';
import { translateText } from './i18n';
import { localDate, placeImage } from './utils';
import { categories, Empty, ErrorMessage, Label, Loading, Modal, PageHeading, PlaceImage, ResourceError } from './components';
import './admin.css';

export default function Admin() {
  const { session } = useApp();
  return session.role === 'admin' ? <AdminWorkspace /> : <Empty title="Access restricted" message="Administrator access is required." />;
}

function AdminWorkspace() {
  const { translate, number } = useApp();
  const overview = useResource('/admin/overview');
  const [tab, setTab] = useState('destinations');
  return <section className="admin-workspace">
    <PageHeading title="Administration" eyebrow="GLOBETROTTER"><ShieldCheck size={28} /></PageHeading>
    {overview.error ? <ResourceError resource={overview} /> : overview.loading ? <Loading /> : <>
      <dl className="admin-stats">{[['destinations', 'Destinations'], ['users', 'Accounts'], ['plans', 'Plans'], ['messages', 'Messages']].map(([key, label]) => <div key={key}><dt>{translate(label)}</dt><dd>{number(overview.data.counts[key])}</dd></div>)}</dl>
      <div className="admin-delivery"><span>{translate('Recovery delivery')}</span><span>{translate('Email address')}: {translate(overview.data.recovery.email ? 'Configured' : 'Not configured')}</span><span>{translate('Phone number')}: {translate(overview.data.recovery.phone ? 'Configured' : 'Not configured')}</span></div>
    </>}
    <div className="admin-tabs" role="tablist" aria-label={translate('Administration sections')}>{[['destinations', 'Destinations'], ['fares', 'Fare policies'], ['audit', 'Audit log']].map(([value, label]) => <button key={value} role="tab" id={`admin-tab-${value}`} aria-selected={tab === value} aria-controls="admin-panel" onClick={() => setTab(value)}>{translate(label)}</button>)}</div>
    <div id="admin-panel" role="tabpanel" aria-labelledby={`admin-tab-${tab}`}>{tab === 'destinations' ? <DestinationManager onChanged={overview.reload} /> : tab === 'fares' ? <FareManager /> : <AuditLog />}</div>
  </section>;
}

function DestinationManager({ onChanged }) {
  const resource = useResource('/admin/destinations');
  const { translate, places, favorites, setToast } = useApp();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const [editing, setEditing] = useState(null);
  const rows = (resource.data || []).filter(place => `${place.name} ${place.neighborhood}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()) && (status === 'all' || (status === 'published' ? place.active : !place.active)));
  function saved() {
    setEditing(null);
    resource.reload();
    places.reload();
    favorites.reload();
    onChanged();
    setToast({ message: 'Destination saved.' });
  }
  return <>
    <div className="admin-toolbar"><label className="search-input"><Search size={18} /><input aria-label={translate('Search destinations')} value={query} onChange={event => setQuery(event.target.value)} /></label><select aria-label={translate('Publication status')} value={status} onChange={event => setStatus(event.target.value)}>{[['all', 'All places'], ['published', 'Published'], ['archived', 'Archived']].map(([value, label]) => <option key={value} value={value}>{translate(label)}</option>)}</select><button className="button" onClick={() => setEditing({})}><Plus size={17} />{translate('Add destination')}</button><button className="icon-button" title={translate('Refresh')} aria-label={translate('Refresh destinations')} onClick={resource.reload}><RefreshCw size={18} /></button></div>
    {resource.loading ? <Loading /> : resource.error ? <ResourceError resource={resource} /> : rows.length ? <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>{translate('Destination')}</th><th className="admin-secondary">{translate('Neighborhood')}</th><th>{translate('Status')}</th><th><span className="sr-only">{translate('Actions')}</span></th></tr></thead><tbody>{rows.map(place => <tr key={place.id}><td><div className="admin-place"><PlaceImage place={place} loading="lazy" /><div><strong>{place.name}</strong><small>{translate(categories[place.category] || place.category)}</small></div></div></td><td className="admin-secondary">{place.neighborhood}</td><td><span className={`publication-status ${place.active ? 'published' : ''}`}>{translate(place.active ? 'Published' : 'Archived')}</span></td><td><button className="icon-button" title={translate('Edit {name}', { name: place.name })} aria-label={translate('Edit {name}', { name: place.name })} onClick={() => setEditing(place)}><Pencil size={17} /></button></td></tr>)}</tbody></table></div> : <Empty title="No places found" message="Try another search or clear your filters." />}
    {editing && <DestinationEditor key={`${editing.id || 'new'}:${editing.content_version || 0}`} place={editing} onClose={() => setEditing(null)} onSaved={saved} onReload={async () => { const latest = await api('/admin/destinations'); const record = latest.find(item => item.id === editing.id); if (record) setEditing(record); }} />}
  </>;
}

function DestinationEditor({ place, onClose, onSaved, onReload }) {
  const { translate } = useApp();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [image, setImage] = useState(place.id ? placeImage(place) : '');
  async function submit(event) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    const body = { ...values, lat: Number(values.lat), lng: Number(values.lng), rating: Number(values.rating), rating_count: Number(values.rating_count), price_level: values.price_level ? Number(values.price_level) : null, phone: values.phone.trim() || null, tags: [...new Set(values.tags.split(',').map(tag => tag.trim()).filter(Boolean))], active: values.active === 'on', image_url: image, version: place.content_version || 0 };
    setBusy(true);
    setError('');
    try { await api(place.id ? `/admin/destinations/${place.id}` : '/admin/destinations', { method: place.id ? 'PATCH' : 'POST', body }); onSaved(); }
    catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }
  return <Modal title={place.id ? 'Edit destination' : 'Add destination'} onClose={onClose} dismissable={!busy}><form className="form-stack admin-editor" onSubmit={submit}>
    <div className="form-grid"><Label>Place name<input name="name" defaultValue={place.name || ''} required maxLength={200} /></Label><Label>Category<select name="category" defaultValue={place.category || 'restaurant'}>{Object.entries(categories).map(([value, label]) => <option key={value} value={value}>{translate(label)}</option>)}</select></Label></div>
    <div className="form-grid"><Label>Neighborhood<input name="neighborhood" defaultValue={place.neighborhood || ''} required maxLength={100} /></Label><Label>Address<input name="address" defaultValue={place.address || ''} required maxLength={300} /></Label></div>
    <div className="form-grid"><Label>Latitude<input name="lat" type="number" min="-90" max="90" step="any" defaultValue={place.lat ?? ''} required /></Label><Label>Longitude<input name="lng" type="number" min="-180" max="180" step="any" defaultValue={place.lng ?? ''} required /></Label></div>
    <Label>Description (English)<textarea name="description" defaultValue={place.description || ''} rows={4} required maxLength={6000} /></Label>
    <Label>Description (French)<textarea name="description_fr" defaultValue={place.description_fr || (place.description ? translateText('fr', place.description) : '')} rows={4} required maxLength={6000} /></Label>
    <div className="form-grid"><Label>Place phone<input name="phone" type="tel" defaultValue={place.phone || ''} maxLength={32} /></Label><Label>Tags<input name="tags" defaultValue={(place.tags || []).join(', ')} maxLength={820} /></Label></div>
    <div className="form-grid"><Label>Rating<input name="rating" type="number" min="0" max="5" step="0.1" defaultValue={place.rating || 0} required /></Label><Label>Rating count<input name="rating_count" type="number" min="0" max="1000000" defaultValue={place.rating_count || 0} required /></Label></div>
    <Label>Price level<select name="price_level" defaultValue={place.price_level || ''}><option value="">{translate('Unknown')}</option>{[1, 2, 3, 4].map(value => <option key={value} value={value}>{value}</option>)}</select></Label>
    <Label>Photo URL<input name="image_url" value={image} onChange={event => setImage(event.target.value)} maxLength={500} /></Label>
    {image && <PlaceImage key={image} className="admin-image-preview" place={{ ...place, name: place.name || translate('Destination preview'), image_url: image, content_version: 1 }} />}
    <label className="admin-checkbox"><input type="checkbox" name="active" defaultChecked={place.active ?? false} />{translate('Published')}</label>
    <ErrorMessage>{error}</ErrorMessage>
    {error === 'This record changed. Reload it before saving.' && <button type="button" className="button secondary" onClick={async () => { try { await onReload(); } catch (failure) { setError(failure.message); } }}><RefreshCw size={17} />{translate('Discard draft and reload')}</button>}
    <button className="button" disabled={busy}><Save size={18} />{translate(busy ? 'Saving...' : 'Save changes')}</button>
  </form></Modal>;
}

function FareManager() {
  const resource = useResource('/admin/fares');
  const { translate, setToast } = useApp();
  const [editing, setEditing] = useState(null);
  return <>
    <div className="admin-toolbar"><h2>{translate('Fare policies')}</h2><button className="icon-button" title={translate('Refresh')} aria-label={translate('Refresh fare policies')} onClick={resource.reload}><RefreshCw size={18} /></button></div>
    {resource.loading ? <Loading /> : resource.error ? <ResourceError resource={resource} /> : <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>{translate('Transport')}</th><th>{translate('Source')}</th><th>{translate('Status')}</th><th><span className="sr-only">{translate('Actions')}</span></th></tr></thead><tbody>{resource.data.map(policy => <tr key={policy.id}><td>{translate({ taxi: 'Shared taxi', private: 'Private car', moto: 'Moto-taxi' }[policy.mode])}<small>{policy.city}</small></td><td><a href={policy.source_url} target="_blank" rel="noopener noreferrer">{policy.source_name}</a></td><td>{translate(policy.active ? 'Published' : 'Archived')}</td><td><button className="icon-button" title={translate('Edit fare policy')} aria-label={translate('Edit {name}', { name: translate({ taxi: 'Shared taxi', private: 'Private car', moto: 'Moto-taxi' }[policy.mode]) })} onClick={() => setEditing(policy)}><Pencil size={17} /></button></td></tr>)}</tbody></table></div>}
    {editing && <FareEditor key={`${editing.id}:${editing.version}`} policy={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); resource.reload(); setToast({ message: 'Fare policy saved.' }); }} onReload={async () => { const latest = await api('/admin/fares'); setEditing(latest.find(item => item.id === editing.id)); }} />}
  </>;
}

function FareEditor({ policy, onClose, onSaved, onReload }) {
  const { translate } = useApp();
  const [model, setModel] = useState(policy.model);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    const body = { ...policy, ...values, model, active: values.active === 'on', source_date: values.source_date || null };
    for (const field of ['base_min', 'base_max', 'per_km_min', 'per_km_max']) body[field] = model === 'quote' || (model !== 'distance' && field.startsWith('per_km')) ? 0 : Number(values[field]);
    setBusy(true);
    setError('');
    try { await api(`/admin/fares/${policy.id}`, { method: 'PUT', body }); onSaved(); }
    catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }
  return <Modal title="Edit fare policy" onClose={onClose} dismissable={!busy}><form className="form-stack admin-editor" onSubmit={submit}>
    <div className="form-grid"><Label>Pricing model<select value={model} onChange={event => setModel(event.target.value)}>{[['reference', 'Published reference ceilings'], ['distance', 'Distance estimate'], ['quote', 'Quote required']].map(([value, label]) => <option key={value} value={value}>{translate(label)}</option>)}</select></Label><Label>Pricing basis<select name="basis" defaultValue={policy.basis}><option value="passenger">{translate('Per passenger')}</option><option value="vehicle">{translate('Per vehicle')}</option></select></Label></div>
    <div className="form-grid">{[['base_min', 'Lower base (FCFA)'], ['base_max', 'Upper base (FCFA)'], ['per_km_min', 'Lower rate per km (FCFA)'], ['per_km_max', 'Upper rate per km (FCFA)']].map(([field, label]) => <Label key={field}>{label}<input name={field} type="number" min="0" max="1000000" step="any" defaultValue={policy[field]} disabled={model === 'quote' || (model !== 'distance' && field.startsWith('per_km'))} required /></Label>)}</div>
    <Label>Source name<input name="source_name" defaultValue={policy.source_name} maxLength={500} required /></Label>
    <Label>Source URL<input name="source_url" type="url" defaultValue={policy.source_url} maxLength={500} required /></Label>
    <Label>Source type<select name="source_type" defaultValue={policy.source_type}>{[['reported_tariff', 'Reported tariff'], ['crowdsourced', 'Crowdsourced'], ['provider', 'Provider'], ['field_research', 'Field research']].map(([value, label]) => <option key={value} value={value}>{translate(label)}</option>)}</select></Label>
    <div className="form-grid"><Label>Source date<input name="source_date" type="date" defaultValue={policy.source_date || ''} max={localDate()} /></Label><Label>Date checked<input name="checked_at" type="date" defaultValue={policy.checked_at} max={localDate()} required /></Label></div>
    <Label>Pricing notes (English)<textarea name="notes_en" defaultValue={policy.notes_en} maxLength={1000} rows={4} required /></Label>
    <Label>Pricing notes (French)<textarea name="notes_fr" defaultValue={policy.notes_fr} maxLength={1000} rows={4} required /></Label>
    <label className="admin-checkbox"><input name="active" type="checkbox" defaultChecked={policy.active} />{translate('Published')}</label>
    <ErrorMessage>{error}</ErrorMessage>
    {error === 'This record changed. Reload it before saving.' && <button type="button" className="button secondary" onClick={async () => { try { await onReload(); } catch (failure) { setError(failure.message); } }}><RefreshCw size={17} />{translate('Discard draft and reload')}</button>}
    <button className="button" disabled={busy}><Save size={18} />{translate(busy ? 'Saving...' : 'Save changes')}</button>
  </form></Modal>;
}

function AuditLog() {
  const { translate, date } = useApp();
  const [before, setBefore] = useState(null);
  const resource = useResource(`/admin/audit${before ? `?before=${before}` : ''}`);
  const names = { destination_created: 'Destination created', destination_updated: 'Destination updated', fare_updated: 'Fare policy updated', role_changed: 'Role changed', password_reset: 'Password reset' };
  return <>
    <div className="admin-toolbar"><h2>{translate('Audit log')}</h2><button className="icon-button" title={translate('Refresh')} aria-label={translate('Refresh audit log')} onClick={resource.reload}><RefreshCw size={18} /></button></div>
    {resource.loading ? <Loading /> : resource.error ? <ResourceError resource={resource} /> : resource.data.records.length ? <><div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>{translate('Event')}</th><th>{translate('Actor')}</th><th>{translate('Date')}</th></tr></thead><tbody>{resource.data.records.map(record => { let entity = ''; try { entity = JSON.parse(record.detail).entity || ''; } catch {} return <tr key={record.id}><td>{translate(names[record.event] || record.event)}{entity && <small>{entity}</small>}</td><td>{record.actor || translate('Former user')}</td><td>{date(record.created_at, { hour: '2-digit', minute: '2-digit' })}</td></tr>; })}</tbody></table></div><div className="admin-toolbar"><button className="button secondary" disabled={!before} onClick={() => setBefore(null)}><ChevronLeft size={17} />{translate('Latest entries')}</button><button className="button secondary" disabled={!resource.data.next_before} onClick={() => setBefore(resource.data.next_before)}>{translate('Older entries')}<ChevronRight size={17} /></button></div></> : <Empty title="No audit entries" message="Changes will appear here after they are saved." />}
  </>;
}