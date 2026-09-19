import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Clock, MessageCircle, RefreshCw, Search, UserPlus, UserRoundMinus, X } from 'lucide-react';
import { api } from './api';
import { ErrorMessage, Loading, Modal } from './components';
import { useApp } from './state';

export function FriendButton({ userId, name }) {
  const { currentUser, friends, translate, setToast } = useApp();
  const [busy, setBusy] = useState(false);
  if (!userId || !currentUser.data || currentUser.data.id === userId) return null;
  const friend = friends.data?.find(entry => entry.user_id === userId);
  if (friend?.status === 'accepted') return <Link className="text-button friend-action" to={`/chat?view=friends&friend=${friend.id}`} aria-label={translate('Message {name}', { name })}><MessageCircle size={15} />{translate('Message')}</Link>;
  if (friend?.status === 'incoming') return <Link className="text-button friend-action" to="/chat?view=friends"><UserPlus size={15} />{translate('Respond to request')}</Link>;
  async function add() {
    setBusy(true);
    try {
      await api('/friends', { method: 'POST', body: { user_id: userId } });
      friends.reload();
      setToast({ message: 'Friend request sent.' });
    } catch (failure) { setToast({ message: failure.message, error: true }); }
    finally { setBusy(false); }
  }
  return <button type="button" className="text-button friend-action" disabled={busy || friends.loading || friend?.status === 'outgoing'} onClick={add} aria-label={translate(friend?.status === 'outgoing' ? 'Request sent to {name}' : 'Add {name} as a friend', { name })}>{friend?.status === 'outgoing' ? <Clock size={15} /> : <UserPlus size={15} />}{translate(friend?.status === 'outgoing' ? 'Request sent' : 'Add friend')}</button>;
}

export function FriendDirectory({ selectedId, onSelect, onRemoved }) {
  const { friends, translate, number } = useApp();
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(null);
  const [removing, setRemoving] = useState(null);
  const [error, setError] = useState('');
  const matches = (friends.data || []).filter(friend => friend.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  const accepted = matches.filter(friend => friend.status === 'accepted');
  const requests = matches.filter(friend => friend.status !== 'accepted');
  async function update(friend, action) {
    setBusy(friend.id);
    setError('');
    try {
      await api(`/friends/${friend.id}`, { method: action === 'accept' ? 'PATCH' : 'DELETE', ...(action === 'accept' ? { body: { action } } : {}) });
      if (action === 'remove') onRemoved(friend.id);
      setRemoving(null);
      friends.reload();
    } catch (failure) { setError(failure.message); }
    finally { setBusy(null); }
  }
  return <aside className="friend-directory" aria-label={translate('Friends')}>
    <header className="friend-directory-heading"><h2>{translate('Friends')} <span>{number((friends.data || []).filter(friend => friend.status === 'accepted').length)}</span></h2><button className="icon-button" aria-label={translate('Refresh friends')} title={translate('Refresh friends')} onClick={friends.reload}><RefreshCw size={17} /></button></header>
    <label className="friend-search"><Search size={16} /><input type="search" aria-label={translate('Search friends')} placeholder={translate('Search friends')} value={search} onChange={event => setSearch(event.target.value)} /></label>
    <ErrorMessage>{error || friends.error}</ErrorMessage>
    {friends.loading && !friends.data ? <Loading /> : <>
      <div className="friend-list">{accepted.map(friend => <div key={friend.id} className={`friend-list-item ${friend.id === selectedId ? 'selected' : ''}`}><button className="friend-row" onClick={() => onSelect(friend.id)} aria-pressed={friend.id === selectedId}><span className="avatar small">{friend.name.charAt(0)}</span><strong>{friend.name}</strong></button><button className="icon-button" aria-label={translate('Remove {name} as a friend', { name: friend.name })} title={translate('Remove friend')} onClick={() => setRemoving(friend)}><UserRoundMinus size={16} /></button></div>)}</div>
      {!accepted.length && <p className="muted friend-empty">{translate(search ? 'No matching friends.' : 'No friends yet.')}</p>}
      <h3 className="friend-requests-heading">{translate('Friend requests')}</h3>
      {!requests.length && <p className="muted friend-empty">{translate('No friend requests.')}</p>}
      {requests.map(friend => <div key={friend.id} className="friend-request"><span className="avatar small">{friend.name.charAt(0)}</span><div><strong>{friend.name}</strong><small>{translate(friend.status === 'incoming' ? 'Incoming request' : 'Request sent')}</small></div><div className="friend-request-actions">{friend.status === 'incoming' && <button className="icon-button" disabled={busy === friend.id} title={translate('Accept request')} aria-label={translate('Accept {name}', { name: friend.name })} onClick={() => update(friend, 'accept')}><Check size={18} /></button>}<button className="icon-button" disabled={busy === friend.id} title={translate(friend.status === 'incoming' ? 'Decline request' : 'Cancel request')} aria-label={translate(friend.status === 'incoming' ? 'Decline {name}' : 'Cancel request to {name}', { name: friend.name })} onClick={() => update(friend, 'remove')}><X size={18} /></button></div></div>)}
    </>}
    {removing && <Modal title="Remove friend?" dismissable={busy === null} onClose={() => setRemoving(null)}><div className="form-stack"><strong>{removing.name}</strong><p>{translate('This removes the friendship and its private conversation for both people.')}</p><ErrorMessage>{error}</ErrorMessage><button className="button" disabled={busy !== null} onClick={() => update(removing, 'remove')}><UserRoundMinus size={17} />{translate('Remove friend')}</button></div></Modal>}
  </aside>;
}