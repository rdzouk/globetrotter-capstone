import { lazy, Suspense, useEffect, useState } from "react";
import { Link, useLocation, useParams, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  CalendarPlus,
  Images,
  MapPin,
  Phone,
  Send,
  Star,
} from "lucide-react";
import { api } from "./api";
import { useApp, useResource } from "./state";
import { FriendButton } from "./Friends";
import {
  categories,
  Empty,
  ErrorMessage,
  Label,
  Loading,
  PlaceCard,
  PlaceImage,
  ResourceError,
  SaveButton,
  DestinationActions,
} from "./components";

const MapView = lazy(() => import("./MapView"));
const PlacePhotos = lazy(() => import('./CommunityPlaces').then(module => ({ default: module.PlacePhotos })));

export default function PlaceDetail({ onPlan }) {
  const { id } = useParams();
  const { places, session, translate, number, date, language } = useApp();
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const reviews = useResource(`/destinations/${id}/reviews`);
  const comments = useResource(`/destinations/${id}/comments`);
  const nearby = useResource(`/destinations/${id}/nearby?limit=3`);
  const tab = ['about', 'reviews', 'comments', 'photos', 'map'].includes(params.get('tab')) ? params.get('tab') : 'about';
  function setTab(value) { setParams(current => { const next = new URLSearchParams(current); next.set('tab', value); return next; }, { replace: true }); }
  const listedPlace = (places.data || []).find((item) => item.id === Number(id));
  const archivedPlace = useResource(!places.loading && !places.error && !listedPlace ? `/destinations/${id}` : null);
  const place = listedPlace || archivedPlace.data;
  const neighborhood = useResource(
    place?.neighborhood
      ? `/neighborhoods/${encodeURIComponent(place.neighborhood)}`
      : null,
  );
  useEffect(() => {
    const target = location.hash.slice(1);
    if (!target || places.loading) return;
    const element = document.getElementById(target);
    element?.scrollIntoView({ block: 'center', behavior: 'instant' });
    if (target === 'comment-form') element?.querySelector('textarea')?.focus({ preventScroll: true });
  }, [location.hash, tab, comments.data, reviews.data, places.loading]);
  if (places.loading || archivedPlace.loading) return <Loading />;
  if (places.error) return <ResourceError resource={places} />;
  if (!place)
    return (
      <Empty
        title="Place not found"
        message="This place may no longer be available."
      >
        <Link className="button" to="/">
          {translate("Explore places")}
        </Link>
      </Empty>
    );
  return (
    <>
      <Link className="back-link" to="/">
        <ArrowLeft size={17} />
        {translate("Back to exploring")}
      </Link>
      <div className="detail-heading">
        <div>
          <p className="eyebrow">
            {translate(categories[place.category] || place.category)} /{" "}
            {place.neighborhood}
          </p>
          <h1>{place.name}</h1>
          {place.added_by && <p className="community-attribution"><span>{translate('Community place')}</span>{translate('Added by {name}', { name: place.added_by.name })}</p>}
          <p className="place-location">
            <MapPin size={16} />
            {place.address}
          </p>
        </div>
        <div className="detail-actions">
          <DestinationActions place={place} />
          <SaveButton place={place} />
          <button className="button" disabled={place.active === false} onClick={() => onPlan(place)}>
            <CalendarPlus size={18} />
            {translate("Plan a visit")}
          </button>
        </div>
      </div>
      {place.active === false && <p className="archived-notice" role="status">{translate('This destination is archived and unavailable for new plans.')}</p>}
      <div className="detail-photo">
        <PlaceImage place={place} />
        <button type="button" className="button secondary more-photos" onClick={() => { setTab('photos'); document.getElementById('detail-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}><Images size={18} />{translate('More photos')}</button>
        <div className="photo-caption">
          <span className="rating">
            <Star size={16} fill="currentColor" />
            {number(place.rating || 0, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
          </span>
          <span>{translate("{count} ratings", { count: number(place.rating_count || 0) })}</span>
          <span>{place.neighborhood}</span>
        </div>
      </div>
      <div className="detail-layout">
        <div>
          <div
            className="detail-tabs"
            role="tablist"
            aria-label={translate("Place information")}
          >
            {[
              ["about", "Overview"],
              ["reviews", "Reviews ({count})"],
              ["comments", "Conversation"],
              ["photos", "Photos"],
              ["map", "Location"],
            ].map(([value, label]) => (
              <button
                key={value}
                id={`tab-${value}`}
                role="tab"
                aria-selected={tab === value}
                aria-controls="detail-panel"
                tabIndex={tab === value ? 0 : -1}
                className={tab === value ? "active" : ""}
                onClick={() => setTab(value)}
                onKeyDown={(event) => {
                  const tabs = ["about", "reviews", "comments", "photos", "map"];
                  if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
                    event.preventDefault();
                    const next =
                      tabs[
                        (tabs.indexOf(tab) +
                          (event.key === "ArrowRight" ? 1 : tabs.length - 1)) %
                          tabs.length
                      ];
                    setTab(next);
                    document.getElementById(`tab-${next}`)?.focus();
                  }
                }}
              >
                {translate(label, { count: number(reviews.data?.length || 0) })}
              </button>
            ))}
          </div>
          <section
            className="detail-panel"
            id="detail-panel"
            role="tabpanel"
            aria-labelledby={`tab-${tab}`}
          >
            {tab === "about" && (
              <>
                <h2>{translate("A closer look")}</h2>
                <p className="detail-description">{language === 'fr' && place.description_fr ? place.description_fr : translate(place.description)}</p>
                <div className="tag-list">
                  {place.tags?.map((tag) => (
                    <span key={tag}>{translate(tag.replaceAll("-", " "))}</span>
                  ))}
                </div>
                {neighborhood.data && (
                  <div className="neighborhood-note">
                    <h3>{translate("Around {neighborhood}", { neighborhood: place.neighborhood })}</h3>
                    <p>{translate(neighborhood.data.blurb)}</p>
                    <Link
                      className="text-button"
                      to={`/?neighborhood=${encodeURIComponent(place.neighborhood)}`}
                    >
                      {translate("{count} places in this neighborhood", { count: number(neighborhood.data.place_count) })}
                    </Link>
                  </div>
                )}
              </>
            )}
            {tab === "reviews" &&
              (reviews.loading ? (
                <Loading />
              ) : reviews.error ? (
                <ResourceError resource={reviews} />
              ) : reviews.data?.length ? (
                <div className="community-list">
                  {reviews.data.map((review) => (
                    <article
                      className="community-entry"
                      key={review.itinerary_id}
                      id={`review-${review.itinerary_id}`}
                    >
                      <div>
                        <span className="avatar small">{(review.reviewer_name || translate("Traveler")).charAt(0)}</span><strong>{review.reviewer_name || translate("Traveler")}</strong>
                        <span className="rating">
                          <Star size={15} fill="currentColor" />
                          {number(review.rating)}/5
                        </span>
                      </div>
                      <p>{review.comment}</p>
                      <footer className="review-author"><span>{translate("Review by {name}", { name: review.reviewer_name || translate("Traveler") })}</span><time dateTime={review.visited_date}>{translate("Visited {date}", { date: date(review.visited_date) })}</time></footer>
                    </article>
                  ))}
                </div>
              ) : (
                <Empty
                  title="The first word is yours"
                  message="No visit reviews yet."
                />
              ))}
            {tab === "comments" && (
              <>
                {session.token ? (
                  <CommentForm placeId={id} onSaved={comments.reload} />
                ) : (
                  <p>
                    <Link to="/login" state={{ from: `/places/${id}?tab=comments#comment-form` }}>
                      {translate("Sign in to join the conversation.")}
                    </Link>
                  </p>
                )}
                {comments.loading ? (
                  <Loading />
                ) : comments.error ? (
                  <ResourceError resource={comments} />
                ) : comments.data?.length ? (
                  comments.data.map((comment) => (
                    <Comment
                      key={comment.id}
                      comment={comment}
                      placeId={id}
                      onSaved={comments.reload}
                      canReply={Boolean(session.token)}
                    />
                  ))
                ) : (
                  <p className="muted">{translate("No comments yet.")}</p>
                )}
              </>
            )}
            {tab === "photos" && <Suspense fallback={<Loading />}><PlacePhotos place={place} /></Suspense>}
            {tab === "map" && (
              <Suspense fallback={<Loading />}>
                <MapView places={[place]} onPlan={onPlan} />
              </Suspense>
            )}
          </section>
        </div>
        <aside className="place-facts">
          <h2>{translate("Good to know")}</h2>
          <div>
            <MapPin size={19} />
            <p>
              <strong>{translate("Find it here")}</strong>
              <span>{place.address}</span>
            </p>
          </div>
          {place.phone && (
            <div>
              <Phone size={18} />
              <p>
                <strong>{translate("Get in touch")}</strong>
                <a href={`tel:${place.phone.replace(/[^+\d]/g, "")}`}>
                  {place.phone}
                </a>
              </p>
            </div>
          )}
          <div>
            <Star size={18} />
            <p>
              <strong>{translate("Local rating")}</strong>
              <span>
                {translate("{rating} out of 5 / {count} ratings", { rating: number(place.rating || 0, { minimumFractionDigits: 1, maximumFractionDigits: 1 }), count: number(place.rating_count || 0) })}
              </span>
            </p>
          </div>
          <Link
            className="button secondary"
            to={`/map?place=${place.id}`}
          >
            <MapPin size={16} />
            {translate("View on map")}
          </Link>
        </aside>
      </div>
      <section className="nearby-section">
        <div className="results-bar">
          <h2>{translate("While you're in the neighborhood")}</h2>
        </div>
        {nearby.loading ? (
          <Loading />
        ) : nearby.error ? (
          <ResourceError resource={nearby} />
        ) : nearby.data?.length ? (
          <div className="places-grid">
            {nearby.data.map((item) => (
              <PlaceCard key={item.id} place={item} onPlan={onPlan} />
            ))}
          </div>
        ) : (
          <p className="muted">{translate("No other listed places nearby.")}</p>
        )}
      </section>
    </>
  );
}

function Comment({ comment, placeId, onSaved, canReply, isReply = false }) {
  const { translate, date, number } = useApp();
  const [reply, setReply] = useState(false);
  return (
    <article className="comment" id={`comment-${comment.id}`}>
      <div className="comment-meta">
        <span className="avatar small">
          {(comment.user_name || "T").charAt(0)}
        </span>
        <strong>{comment.user_name || translate("Traveler")}</strong>
        <time dateTime={comment.created_at}>{date(comment.created_at, { hour: '2-digit', minute: '2-digit' })}</time>
      </div>
      <FriendButton userId={comment.user_id} name={comment.user_name || translate('Traveler')} />
      <p>{comment.message}</p>
      <small className="comment-author">{translate(isReply ? "Reply by {name}" : "Comment by {name}", { name: comment.user_name || translate("Traveler") })}</small>
      {comment.review && <div className="comment-visit-review"><span className="rating"><Star size={14} fill="currentColor" />{number(comment.review.rating)}/5</span><strong>{translate("Review by {name}", { name: comment.user_name || translate("Traveler") })}</strong><p>{comment.review.comment}</p><time dateTime={comment.review.visited_date}>{translate("Visited {date}", { date: date(comment.review.visited_date) })}</time></div>}
      {canReply && (
        <button className="text-button" onClick={() => setReply(!reply)}>
          {translate(reply ? "Cancel reply" : "Reply")}
        </button>
      )}
      {reply && (
        <CommentForm
          placeId={placeId}
          parentId={comment.id}
          onSaved={() => {
            onSaved();
            setReply(false);
          }}
        />
      )}
      {comment.replies?.map((item) => (
        <div className="comment-reply" key={item.id}>
          <Comment
            comment={item}
            placeId={placeId}
            onSaved={onSaved}
            canReply={false}
            isReply
          />
        </div>
      ))}
    </article>
  );
}
function CommentForm({ placeId, parentId, onSaved }) {
  const { translate } = useApp();
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event) {
    event.preventDefault();
    if (!message.trim()) {
      setError("Please enter a message.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api(`/destinations/${placeId}/comments`, {
        method: "POST",
        body: {
          message: message.trim(),
          ...(parentId ? { parent_comment_id: parentId } : {}),
        },
      });
      setMessage("");
      onSaved();
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form id={parentId ? `reply-form-${parentId}` : 'comment-form'} className="comment-form form-stack" onSubmit={submit}>
      <Label>
        {parentId ? "Your reply" : "Join the conversation"}
        <textarea
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          rows={3}
          required
          maxLength={4000}
          placeholder={translate("Share a thought about this place...")}
        />
      </Label>
      <ErrorMessage>{error}</ErrorMessage>
      <button className="button" disabled={busy}>
        <Send size={16} />
        {translate(busy ? "Sending..." : parentId ? "Send reply" : "Post comment")}
      </button>
    </form>
  );
}
