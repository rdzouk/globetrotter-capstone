import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, MessageCircle, MessagesSquare, Star } from 'lucide-react';
import { useApp, useResource } from './state';
import { Empty, Loading, ResourceError } from './components';

export default function ProfileActivity() {
  const { translate, date, number } = useApp();
  const activity = useResource('/profile/activity');
  const [tab, setTab] = useState('replies');
  const items = activity.data?.[tab] || [];
  return <section className="profile-activity" aria-labelledby="activity-heading">
    <div className="results-bar"><h2 id="activity-heading">{translate('My activity')}</h2><Link className="text-button" to="/chat">{translate('Community chat')}<ArrowUpRight size={16} /></Link></div>
    <div className="activity-tabs segmented" role="group" aria-label={translate('My activity')}>{[['replies', 'Replies to me', MessagesSquare], ['reviews', 'My reviews', Star], ['comments', 'My comments', MessageCircle]].map(([value, label, Icon]) => <button key={value} className={tab === value ? 'active' : ''} aria-pressed={tab === value} onClick={() => setTab(value)}><Icon size={16} />{translate(label)}{activity.data && <span>{number(activity.data[value]?.length || 0)}</span>}</button>)}</div>
    {activity.loading ? <Loading /> : activity.error ? <ResourceError resource={activity} /> : !items.length ? <Empty title={tab === 'replies' ? 'No replies yet.' : 'No activity yet.'} message="" /> : <div className="activity-list">{items.map(item => <article key={item.id} className="activity-entry">
      <div className="activity-meta"><Link to={`/places/${item.place_id || item.destination_id}?tab=${tab === 'reviews' ? 'reviews' : 'comments'}`}>{item.destination_name}</Link><time dateTime={item.created_at || item.review?.visited_date}>{date(item.created_at || item.review?.visited_date)}</time></div>
      {tab === 'replies' && <><strong>{translate('{name} replied to your comment', { name: item.user_name || translate('Traveler') })}</strong><blockquote><small>{translate('Your comment')}</small><p>{item.parent_message}</p></blockquote></>}
      {item.review && <span className="rating"><Star size={15} fill="currentColor" />{number(item.review.rating)}/5</span>}
      <p>{item.review?.comment || item.message}</p>
      <Link className="text-button" to={`/places/${item.place_id || item.destination_id}?tab=${tab === 'reviews' ? 'reviews' : 'comments'}#${tab === 'reviews' ? `review-${item.id}` : `comment-${item.id}`}`}>{translate('View conversation')}<ArrowUpRight size={14} /></Link>
    </article>)}</div>}
  </section>;
}