import { lazy, Suspense, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, CalendarPlus, MapPin, Phone, Send, Star } from 'lucide-react';
import { api } from './api';
import { useApp, useResource } from './state';
import { categories, Empty, ErrorMessage, Label, Loading, PlaceCard, PlaceImage, ResourceError, SaveButton } from './components';
import { formatDate } from './utils';

const MapView = lazy(() => import('./MapView'));

export default function PlaceDetail({ onPlan }) {
  const { id } = useParams();
  const { places, session } = useApp();
  const reviews = useResource(`/destinations/${id}/reviews`);
  const comments = useResource(`/destinations/${id}/comments`);
  const nearby = useResource(`/destinations/${id}/nearby?limit=3`);
  const [tab, setTab] = useState('about');
  const place = (places.data || []).find(item => item.id === Number(id));
  const neighborhood = useResource(place?.neighborhood ? `/neighborhoods/${encodeURIComponent(place.neighborhood)}` : null);
  if (places.loading) return <Loading />;
  if (places.error) return <ResourceError resource={places} />;
  if (!place) return <Empty title="Place not found" message="This place may no longer be available."><Link className="button" to="/">Explore places</Link></Empty>;
  return <><Link className="back-link" to="/"><ArrowLeft size={17} />Back to exploring</Link><div className="detail-heading"><div><p className="eyebrow">{categories[place.category] || place.category} / {place.neighborhood}</p><h1>{place.name}</h1><p className="place-location"><MapPin size={16} />{place.address}</p></div><div className="detail-actions"><SaveButton place={place} /><button className="button" onClick={() => onPlan(place)}><CalendarPlus size={18} />Plan a visit</button></div></div><div className="detail-photo"><PlaceImage place={place} /><div className="photo-caption"><span className="rating"><Star size={16} fill="currentColor" />{Number(place.rating || 0).toFixed(1)}</span><span>{place.rating_count || 0} ratings</span><span>{place.neighborhood}</span></div></div><div className="detail-layout"><div><div className="detail-tabs" role="tablist" aria-label="Place information">{[['about', 'Overview'], ['reviews', `Reviews (${reviews.data?.length || 0})`], ['comments', 'Conversation'], ['map', 'Location']].map(([value, label]) => <button key={value} id={`tab-${value}`} role="tab" aria-selected={tab === value} aria-controls="detail-panel" tabIndex={tab === value ? 0 : -1} className={tab === value ? 'active' : ''} onClick={() => setTab(value)} onKeyDown={event => { const tabs = ['about', 'reviews', 'comments', 'map']; if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') { event.preventDefault(); const next = tabs[(tabs.indexOf(tab) + (event.key === 'ArrowRight' ? 1 : 3)) % 4]; setTab(next); document.getElementById(`tab-${next}`)?.focus(); } }}>{label}</button>)}</div><section className="detail-panel" id="detail-panel" role="tabpanel" aria-labelledby={`tab-${tab}`}>{tab === 'about' && <><h2>A closer look</h2><p className="detail-description">{place.description}</p><div className="tag-list">{place.tags?.map(tag => <span key={tag}>{tag.replaceAll('-', ' ')}</span>)}</div>{neighborhood.data && <div className="neighborhood-note"><h3>Around {place.neighborhood}</h3><p>{neighborhood.data.blurb}</p><Link className="text-button" to={`/?neighborhood=${encodeURIComponent(place.neighborhood)}`}>{neighborhood.data.place_count} places in this neighborhood</Link></div>}</>}{tab === 'reviews' && (reviews.loading ? <Loading /> : reviews.error ? <ResourceError resource={reviews} /> : reviews.data?.length ? <div className="community-list">{reviews.data.map(review => <article className="community-entry" key={review.itinerary_id}><div><strong>{review.reviewer_name}</strong><span className="rating"><Star size={15} fill="currentColor" />{review.rating}/5</span></div><p>{review.comment}</p><small>Visited {formatDate(review.visited_date)}</small></article>)}</div> : <Empty title="The first word is yours" message="No visit reviews yet." />)}{tab === 'comments' && <>{session.token ? <CommentForm placeId={id} onSaved={comments.reload} /> : <p><Link to="/login" state={{ from: `/places/${id}` }}>Sign in</Link> to join the conversation.</p>}{comments.loading ? <Loading /> : comments.error ? <ResourceError resource={comments} /> : comments.data?.length ? comments.data.map(comment => <Comment key={comment.id} comment={comment} placeId={id} onSaved={comments.reload} canReply={Boolean(session.token)} />) : <p className="muted">No comments yet.</p>}</>}{tab === 'map' && <Suspense fallback={<Loading />}><MapView places={[place]} onPlan={onPlan} /></Suspense>}</section></div><aside className="place-facts"><h2>Good to know</h2><div><MapPin size={19} /><p><strong>Find it here</strong><span>{place.address}</span></p></div>{place.phone && <div><Phone size={18} /><p><strong>Get in touch</strong><a href={`tel:${place.phone.replace(/[^+\d]/g, '')}`}>{place.phone}</a></p></div>}<div><Star size={18} /><p><strong>Local rating</strong><span>{Number(place.rating || 0).toFixed(1)} out of 5 / {place.rating_count || 0} ratings</span></p></div><Link className="button secondary" to={`/map?q=${encodeURIComponent(place.name)}`}><MapPin size={16} />View on map</Link></aside></div><section className="nearby-section"><div className="results-bar"><h2>While you're in the neighborhood</h2></div>{nearby.loading ? <Loading /> : nearby.error ? <ResourceError resource={nearby} /> : nearby.data?.length ? <div className="places-grid">{nearby.data.map(item => <PlaceCard key={item.id} place={item} onPlan={onPlan} />)}</div> : <p className="muted">No other listed places nearby.</p>}</section></>;
}

function Comment({ comment, placeId, onSaved, canReply }) {
  const [reply, setReply] = useState(false);
  return <article className="comment"><div className="comment-meta"><span className="avatar small">{(comment.user_name || 'T').charAt(0)}</span><strong>{comment.user_name}</strong><time>{new Date(comment.created_at).toLocaleDateString()}</time></div><p>{comment.message}</p>{canReply && <button className="text-button" onClick={() => setReply(!reply)}>{reply ? 'Cancel reply' : 'Reply'}</button>}{reply && <CommentForm placeId={placeId} parentId={comment.id} onSaved={() => { onSaved(); setReply(false); }} />}{comment.replies?.map(item => <div className="comment-reply" key={item.id}><Comment comment={item} placeId={placeId} onSaved={onSaved} canReply={false} /></div>)}</article>;
}
function CommentForm({ placeId, parentId, onSaved }) {
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event) {
    event.preventDefault();
    if (!message.trim()) { setError('Please enter a message.'); return; }
    setBusy(true);
    setError('');
    try {
      await api(`/destinations/${placeId}/comments`, { method: 'POST', body: { message: message.trim(), ...(parentId ? { parent_comment_id: parentId } : {}) } });
      setMessage('');
      onSaved();
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }
  return <form className="comment-form form-stack" onSubmit={submit}><Label>{parentId ? 'Your reply' : 'Join the conversation'}<textarea value={message} onChange={event => setMessage(event.target.value)} rows={3} required maxLength={4000} placeholder="Share a thought about this place..." /></Label><ErrorMessage>{error}</ErrorMessage><button className="button" disabled={busy}><Send size={16} />{busy ? 'Sending...' : parentId ? 'Send reply' : 'Post comment'}</button></form>;
}