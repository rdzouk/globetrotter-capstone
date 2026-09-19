import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Camera, MapPin, Plus, Trash2, Upload } from 'lucide-react';
import { api } from './api';
import { categories, Empty, ErrorMessage, Label, Loading, Modal, PageHeading, ResourceError } from './components';
import { AuthenticatedImage } from './Media';
import { useApp, useResource } from './state';

const LocationPicker = lazy(() => import('./MapView').then(module => ({ default: module.LocationPicker })));

function PhotoField({ file, onChange }) {
  const { translate } = useApp();
  const [preview, setPreview] = useState('');
  const [error, setError] = useState('');
  const input = useRef(null);
  useEffect(() => {
    if (!file) { setPreview(''); if (input.current) input.current.value = ''; return; }
    const objectUrl = URL.createObjectURL(file);
    setPreview(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);
  function choose(event) {
    const selected = event.target.files?.[0] || null;
    if (selected && (!['image/jpeg', 'image/png', 'image/webp'].includes(selected.type) || selected.size > 8 * 1024 * 1024)) {
      setError(selected.size > 8 * 1024 * 1024 ? 'Photos must be 8 MB or smaller.' : 'Choose a JPEG, PNG or WebP photo.');
      event.target.value = '';
      onChange(null);
      return;
    }
    setError('');
    onChange(selected);
  }
  return <div className="photo-field"><Label>Place photo<input ref={input} type="file" accept="image/jpeg,image/png,image/webp" required onChange={choose} /></Label><ErrorMessage>{error}</ErrorMessage>{preview && <img className="upload-preview" src={preview} alt={translate('Selected photo preview')} />}</div>;
}

export default function AddPlace() {
  const { translate, places, setToast } = useApp();
  const navigate = useNavigate();
  const [coordinates, setCoordinates] = useState({ lat: '', lng: '' });
  const [photo, setPhoto] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [clientId] = useState(() => crypto.randomUUID());
  async function submit(event) {
    event.preventDefault();
    if (!photo || busy) return;
    const values = Object.fromEntries(new FormData(event.currentTarget));
    const details = {
      name: values.name, category: values.category, neighborhood: values.neighborhood,
      address: values.address, description: values.description, lat: Number(coordinates.lat), lng: Number(coordinates.lng),
      phone: values.phone || null, price_level: values.price_level ? Number(values.price_level) : null,
      tags: values.tags.split(',').map(tag => tag.trim()).filter(Boolean),
    };
    const body = new FormData();
    body.append('details', JSON.stringify(details));
    body.append('client_id', clientId);
    body.append('photo', photo);
    setBusy(true);
    setError('');
    try {
      const saved = await api('/destinations', { method: 'POST', body });
      places.reload();
      setToast({ message: 'Your place has been added.' });
      navigate(`/places/${saved.id}`);
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }
  return <>
    <Link className="back-link" to="/"><ArrowLeft size={17} />{translate('Back to exploring')}</Link>
    <PageHeading eyebrow="COMMUNITY" title="Add a place" />
    <form className="contribution-form" onSubmit={submit}>
      <div className="contribution-details form-stack">
        <h2>{translate('Place details')}</h2>
        <Label>Place name<input name="name" required maxLength={200} autoComplete="off" /></Label>
        <div className="form-grid"><Label>Category<select name="category" defaultValue="" required><option value="" disabled>{translate('Choose a category')}</option>{Object.entries(categories).map(([value, label]) => <option key={value} value={value}>{translate(label)}</option>)}</select></Label><Label>Neighborhood<input name="neighborhood" required maxLength={100} list="existing-neighborhoods" /></Label></div>
        <datalist id="existing-neighborhoods">{[...new Set((places.data || []).map(place => place.neighborhood))].sort().map(name => <option key={name} value={name} />)}</datalist>
        <Label>Address<input name="address" required maxLength={300} /></Label>
        <Label>Description<textarea name="description" required maxLength={6000} rows={4} /></Label>
        <div className="form-grid"><Label>Place phone<input name="phone" type="tel" maxLength={32} /></Label><Label>Price level<select name="price_level" defaultValue=""><option value="">{translate('Unknown')}</option>{[1, 2, 3, 4].map(level => <option key={level} value={level}>{'$'.repeat(level)}</option>)}</select></Label></div>
        <Label>Tags<input name="tags" maxLength={800} /></Label>
        <PhotoField file={photo} onChange={setPhoto} />
      </div>
      <section className="contribution-location" aria-label={translate('Place location')}>
        <h2><MapPin size={20} />{translate('Location')}</h2>
        <Suspense fallback={<Loading />}><LocationPicker value={coordinates} onChange={setCoordinates} /></Suspense>
        <div className="form-grid coordinates-fields"><Label>Latitude<input type="number" required min={-90} max={90} step="any" value={coordinates.lat} onChange={event => setCoordinates(current => ({ ...current, lat: event.target.value }))} /></Label><Label>Longitude<input type="number" required min={-180} max={180} step="any" value={coordinates.lng} onChange={event => setCoordinates(current => ({ ...current, lng: event.target.value }))} /></Label></div>
      </section>
      <div className="contribution-submit"><ErrorMessage>{error}</ErrorMessage><div className="plan-actions"><button className="button" disabled={busy || !photo}><Plus size={18} />{translate(busy ? 'Saving...' : 'Add place')}</button><Link className="button secondary" to="/">{translate('Cancel')}</Link></div></div>
    </form>
  </>;
}

export function PlacePhotos({ place }) {
  const { currentUser, session, places, translate, date, number, setToast } = useApp();
  const gallery = useResource(`/destinations/${place.id}/photos`);
  const [photo, setPhoto] = useState(null);
  const [caption, setCaption] = useState('');
  const [uploadId, setUploadId] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [older, setOlder] = useState([]);
  const [nextBefore, setNextBefore] = useState(undefined);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [viewing, setViewing] = useState(null);
  const [removing, setRemoving] = useState(null);
  const photos = [...(gallery.data?.photos || []), ...older];
  const cursor = nextBefore === undefined ? gallery.data?.next_before : nextBefore;

  function reload() { setOlder([]); setNextBefore(undefined); gallery.reload(); places.reload(); }
  async function upload(event) {
    event.preventDefault();
    if (!photo || busy) return;
    const body = new FormData();
    body.append('photo', photo);
    body.append('caption', caption);
    body.append('client_id', uploadId);
    setBusy(true);
    setError('');
    try {
      await api(`/destinations/${place.id}/photos`, { method: 'POST', body });
      setPhoto(null);
      setCaption('');
      setUploadId(crypto.randomUUID());
      reload();
      setToast({ message: 'Photo added.' });
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }
  async function loadOlder() {
    setLoadingOlder(true);
    setError('');
    try {
      const result = await api(`/destinations/${place.id}/photos?before_id=${cursor}`);
      setOlder(current => [...current, ...result.photos.filter(entry => !photos.some(existing => existing.id === entry.id))]);
      setNextBefore(result.next_before);
    } catch (failure) { setError(failure.message); }
    finally { setLoadingOlder(false); }
  }
  async function remove() {
    setBusy(true);
    setError('');
    try {
      await api(`/destinations/${place.id}/photos/${removing.id}`, { method: 'DELETE' });
      setRemoving(null);
      reload();
      setToast({ message: 'Photo deleted.' });
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }
  return <section className="place-gallery" aria-label={translate('Community photos')}>
    <div className="gallery-heading"><h2>{translate('Community photos')}</h2><span>{number(gallery.data?.count || 0)}</span></div>
    {place.active !== false && <form className="photo-upload-form form-stack" onSubmit={upload}><PhotoField file={photo} onChange={selected => { setPhoto(selected); setUploadId(crypto.randomUUID()); }} /><Label>Photo caption<input value={caption} onChange={event => setCaption(event.target.value)} maxLength={300} /></Label><button className="button secondary" disabled={busy || !photo}><Upload size={17} />{translate(busy ? 'Uploading...' : 'Add photo')}</button></form>}
    <ErrorMessage>{error}</ErrorMessage>
    {gallery.loading && !gallery.data ? <Loading /> : gallery.error ? <ResourceError resource={gallery} /> : photos.length ? <div className="community-photo-grid">{photos.map(entry => <figure className="community-photo" key={entry.id}>
      <button type="button" className="photo-open" title={translate('View photo')} aria-label={translate('View photo by {name}', { name: entry.user_name })} onClick={() => setViewing(entry)}><AuthenticatedImage path={entry.image_url} alt={entry.caption || translate('Photo of {name}', { name: place.name })} loading="lazy" retry={false} /></button>
      <figcaption><div><strong>{translate('Photo by {name}', { name: entry.user_name })}</strong><time dateTime={entry.created_at}>{date(entry.created_at)}</time></div>{entry.caption && <p>{entry.caption}</p>}{(entry.user_id === currentUser.data?.id || session.role === 'admin') && <button type="button" className="icon-button" disabled={busy} title={translate('Delete photo')} aria-label={translate('Delete photo')} onClick={() => setRemoving(entry)}><Trash2 size={16} /></button>}</figcaption>
    </figure>)}</div> : <Empty title="No community photos yet." message="" />}
    {cursor && <button type="button" className="button secondary gallery-more" disabled={loadingOlder} onClick={loadOlder}><Camera size={17} />{translate('Load more photos')}</button>}
    {viewing && <Modal title="Place photo" onClose={() => setViewing(null)}><AuthenticatedImage path={viewing.image_url} alt={viewing.caption || place.name} className="gallery-full-image" /><p className="photo-attribution">{translate('Photo by {name}', { name: viewing.user_name })}</p>{viewing.caption && <p>{viewing.caption}</p>}</Modal>}
    {removing && <Modal title="Delete photo?" dismissable={!busy} onClose={() => setRemoving(null)}><div className="form-stack"><p>{translate('This photo will be removed from the place gallery.')}</p><ErrorMessage>{error}</ErrorMessage><button className="button" disabled={busy} onClick={remove}><Trash2 size={17} />{translate('Delete photo')}</button></div></Modal>}
  </section>;
}