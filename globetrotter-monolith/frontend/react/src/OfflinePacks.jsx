import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Check, Download, LogOut, RefreshCw, Trash2, WifiOff } from 'lucide-react';
import { api } from './api';
import { useApp } from './state';
import { Empty, ErrorMessage, Loading, Modal, PageHeading } from './components';
import { loadOfflinePacks, offlineSnapshot, removeOfflinePack, saveOfflinePack } from './offline';
import { placeImage } from './utils';

async function thumbnail(place) {
  try {
    const source = placeImage(place);
    const signal = AbortSignal.timeout(8000);
    const blob = place.cover_photo_url ? await api(place.cover_photo_url, { responseType: 'blob', signal }) : source?.startsWith('/images/') ? await fetch(source, { signal }).then(response => response.ok ? response.blob() : null) : null;
    if (!blob || blob.size > 9 * 1024 * 1024) return null;
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement('canvas');
    canvas.width = 320; canvas.height = Math.max(1, Math.round(320 * bitmap.height / bitmap.width));
    if (canvas.height > 1000) { bitmap.close(); return null; }
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    return canvas.toDataURL('image/jpeg', 0.7);
  } catch { return null; }
}

export function SaveOfflineButton({ trip }) {
  const { session, translate } = useApp();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  async function save() {
    setBusy(true); setError('');
    try {
      const snapshot = offlineSnapshot(trip);
      const photos = await Promise.all(trip.stops.map(stop => thumbnail(stop.destination)));
      snapshot.trip.stops.forEach((stop, index) => { stop.photo = photos[index]; });
      await saveOfflinePack(session.token, snapshot);
      setSaved(true); setConfirm(false);
    } catch (failure) { setError(failure.message || 'Offline storage is unavailable on this device.'); }
    finally { setBusy(false); }
  }
  return <><button className="button secondary" onClick={() => setConfirm(true)}>{saved ? <Check size={18} /> : <Download size={18} />}{translate(saved ? 'Update offline pack' : 'Save offline')}</button>
    {confirm && <Modal title="Save this trip offline?" onClose={() => setConfirm(false)} dismissable={!busy}><div className="form-stack"><p>{translate('Trip notes and place details will be stored on this device for seven days, until you sign out.')}</p><ErrorMessage>{error}</ErrorMessage><button className="button" disabled={busy} onClick={save}><Download size={18} />{translate(busy ? 'Saving...' : 'Save offline')}</button></div></Modal>}
  </>;
}

export default function OfflinePacks() {
  const { session, signOut, translate, language, date, number } = useApp();
  const [state, setState] = useState({ loading: true, packs: [], error: '' });
  const [revision, setRevision] = useState(0);
  const [selected, setSelected] = useState(null);
  const [deleting, setDeleting] = useState(null);
  useEffect(() => {
    let active = true;
    setState({ loading: true, packs: [], error: '' });
    loadOfflinePacks(session.token).then(packs => { if (active) setState({ loading: false, packs, error: '' }); }).catch(() => { if (active) setState({ loading: false, packs: [], error: 'Offline storage is unavailable on this device.' }); });
    return () => { active = false; };
  }, [session.token, revision]);
  const pack = state.packs.find(item => item.trip.id === selected);
  async function remove() {
    try { await removeOfflinePack(session.token, deleting.trip.id); setDeleting(null); setSelected(null); setRevision(current => current + 1); }
    catch { setState(current => ({ ...current, error: 'Offline storage is unavailable on this device.' })); }
  }
  return <div className="offline-content">
    <Link className="text-button feature-back" to="/day-trips"><ArrowLeft size={18} />{translate('Back to trips')}</Link>
    <PageHeading title="Offline trip packs"><button className="icon-button" onClick={() => setRevision(current => current + 1)} title={translate('Refresh offline packs')} aria-label={translate('Refresh offline packs')}><RefreshCw size={18} /></button><button className="icon-button" onClick={signOut} title={translate('Sign out')} aria-label={translate('Sign out')}><LogOut size={18} /></button></PageHeading>
    <ErrorMessage>{state.error}</ErrorMessage>
    {state.loading ? <Loading compact /> : pack ? <>
      <button className="text-button feature-back" onClick={() => setSelected(null)}><ArrowLeft size={17} />{translate('All offline packs')}</button><h2>{pack.trip.title}</h2><p className="muted">{date(pack.trip.trip_date)} / {pack.trip.start_time}</p><p className="muted">{translate('Saved {date}', { date: date(pack.saved_at) })} / {translate('Expires {date}', { date: date(pack.expires_at) })}</p>
      <ol className="trip-stop-list">{pack.trip.stops.map(stop => <li key={stop.destination_id} className="offline-stop"><div className="feature-row">{stop.photo && <img src={stop.photo} className="feature-thumbnail" alt={stop.place.name} />}<div className="feature-row-main"><h3>{stop.place.name}</h3><p>{stop.place.address}</p><span className="muted">{translate('{count} minutes', { count: number(stop.visit_minutes) })}</span></div></div><p>{language === 'fr' && stop.place.description_fr ? stop.place.description_fr : translate(stop.place.description)}</p><p className="muted">{translate('Coordinates')}: {stop.place.lat}, {stop.place.lng}</p>{stop.place.phone && <p>{stop.place.phone}</p>}</li>)}</ol>{pack.trip.notes && <p className="trip-notes">{pack.trip.notes}</p>}
    </> : !state.packs.length ? <Empty title="No offline packs" message="No saved trip packs are available on this device." /> : <div className="feature-list">{state.packs.map(item => <article className="feature-row" key={item.trip.id}><WifiOff size={20} /><button className="feature-row-main offline-pack-title" onClick={() => setSelected(item.trip.id)}><strong>{item.trip.title}</strong><span className="muted">{date(item.trip.trip_date)}</span><span className="muted">{translate('Expires {date}', { date: date(item.expires_at) })}</span></button><button className="icon-button" onClick={() => setDeleting(item)} title={translate('Delete offline pack')} aria-label={translate('Delete offline pack')}><Trash2 size={18} /></button></article>)}</div>}
    {deleting && <Modal title="Delete offline pack?" onClose={() => setDeleting(null)}><div className="form-stack"><p>{deleting.trip.title}</p><ErrorMessage>{state.error}</ErrorMessage><button className="button" onClick={remove}><Trash2 size={18} />{translate('Delete offline pack')}</button></div></Modal>}
  </div>;
}