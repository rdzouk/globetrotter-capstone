import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, CalendarDays, Check, CheckCheck, MessageCircle, RefreshCw, UserPlus } from 'lucide-react';
import { api } from './api';
import { useApp } from './state';
import { Empty, ErrorMessage, Loading, PageHeading, ResourceError } from './components';

const labels = {
  friend_request: '{name} sent you a friend request',
  message: 'New message from {name}',
  reply: '{name} replied to your comment',
  visit_reminder: 'Upcoming visit: {title}',
  trip_reminder: 'Upcoming trip: {title}',
  trip_invitation: '{name} invited you to {title}',
};
const icons = { friend_request: UserPlus, message: MessageCircle, reply: MessageCircle, visit_reminder: CalendarDays, trip_reminder: CalendarDays, trip_invitation: UserPlus };

export function NotificationBell() {
  const { notifications, translate, number } = useApp();
  const count = notifications.data?.unread_count || 0;
  return <Link to="/notifications" className="icon-button notification-bell" aria-label={translate('Notifications')} title={translate('{count} unread notifications', { count: number(count) })}>
    <Bell size={20} />{count > 0 && <span className="notification-count">{number(Math.min(count, 99))}</span>}
  </Link>;
}

export default function Notifications() {
  const { notifications, translate, date } = useApp();
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function markRead(ids) {
    if (busy || !ids.length) return;
    setBusy(true);
    setError('');
    try { await api('/notifications/read', { method: 'POST', body: { ids } }); notifications.reload(); }
    catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }
  const items = notifications.data?.items || [];
  const visible = items.filter(item => !unreadOnly || !item.read);
  return <>
    <PageHeading title="Notifications">
      <button className="icon-button" onClick={notifications.reload} title={translate('Refresh notifications')} aria-label={translate('Refresh notifications')}><RefreshCw size={18} /></button>
      <button className="button secondary" disabled={busy || !items.some(item => !item.read)} onClick={() => markRead(items.filter(item => !item.read).map(item => item.id))}><CheckCheck size={18} />{translate('Mark all read')}</button>
    </PageHeading>
    <div className="segmented feature-tabs" role="group" aria-label={translate('Notification filters')}>
      <button className={!unreadOnly ? 'active' : ''} aria-pressed={!unreadOnly} onClick={() => setUnreadOnly(false)}>{translate('All activity')}</button>
      <button className={unreadOnly ? 'active' : ''} aria-pressed={unreadOnly} onClick={() => setUnreadOnly(true)}>{translate('Unread')}</button>
    </div>
    <ErrorMessage>{error}</ErrorMessage>
    {notifications.error ? <ResourceError resource={notifications} /> : notifications.loading && !notifications.data ? <Loading /> : !visible.length ? <Empty title="You're all caught up" message="No notifications to show." /> :
      <div className="feature-list">{visible.map(item => {
        const Icon = icons[item.kind] || Bell;
        return <article key={item.id} className={`feature-row notification-row${item.read ? '' : ' is-unread'}`}>
          <Icon size={21} aria-hidden="true" />
          <Link className="feature-row-main" to={item.href} onClick={() => { if (!item.read) markRead([item.id]); }}>
            <strong>{translate(labels[item.kind] || 'Notifications', { name: item.actor_name, title: item.title })}</strong>
            <span className="muted">{date(item.date || item.created_at)}</span>
          </Link>
          {!item.read && <button className="icon-button" disabled={busy} onClick={() => markRead([item.id])} title={translate('Mark read')} aria-label={translate('Mark read')}><Check size={18} /></button>}
        </article>;
      })}</div>}
  </>;
}