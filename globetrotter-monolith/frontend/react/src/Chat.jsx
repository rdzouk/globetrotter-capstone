import { useEffect, useLayoutEffect, useReducer, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Hash, MessageCircle, RefreshCw, Reply, Send, Trash2, X } from 'lucide-react';
import { api } from './api';
import { Empty, ErrorMessage, Label, Loading, Modal, PageHeading } from './components';
import { useApp, useResource } from './state';

function mergeMessages(current, incoming) {
  const byId = new Map(current.map(message => [message.id, message]));
  for (const message of incoming) {
    const existing = byId.get(message.id);
    byId.set(message.id, existing?.deleted ? { ...message, message: '', deleted: true } : message);
  }
  return [...byId.values()].sort((first, second) => first.id - second.id);
}

export default function Chat() {
  const { translate, date, number, setToast } = useApp();
  const profile = useResource('/profile');
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [hasMore, setHasMore] = useState(false);
  const [olderBusy, setOlderBusy] = useState(false);
  const [draft, setDraft] = useState('');
  const [reply, setReply] = useState(null);
  const [sendError, setSendError] = useState('');
  const [sending, setSending] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [revision, refresh] = useReducer(value => value + 1, 0);
  const initialized = useRef(false);
  const feed = useRef(null);
  const composer = useRef(null);
  const followLatest = useRef(true);
  const previousHeight = useRef(null);
  const pending = useRef(null);

  useEffect(() => {
    const controller = new AbortController();
    let timer;
    let active = true;
    async function update() {
      if (!active) return;
      try {
        if (!document.hidden) {
          const result = await api('/chat/messages?limit=100', { signal: controller.signal });
          if (!active) return;
          setMessages(current => mergeMessages(current, result.messages));
          if (!initialized.current) { setHasMore(result.has_more); initialized.current = true; }
          setError('');
          setLoading(false);
        }
      } catch (failure) {
        if (!active) return;
        setError(failure.message);
        setLoading(false);
      }
      if (active) timer = setTimeout(update, 5000);
    }
    update();
    return () => { active = false; clearTimeout(timer); controller.abort(); };
  }, [revision]);

  useLayoutEffect(() => {
    if (!feed.current) return;
    if (previousHeight.current !== null) {
      feed.current.scrollTop += feed.current.scrollHeight - previousHeight.current;
      previousHeight.current = null;
    } else if (followLatest.current) feed.current.scrollTop = feed.current.scrollHeight;
  }, [messages]);

  async function loadOlder() {
    if (!messages.length || olderBusy) return;
    setOlderBusy(true);
    try {
      const result = await api(`/chat/messages?before_id=${messages[0].id}&limit=50`);
      previousHeight.current = feed.current?.scrollHeight ?? null;
      setMessages(current => mergeMessages(current, result.messages));
      setHasMore(result.has_more);
      setError('');
    } catch (failure) { setError(failure.message); }
    finally { setOlderBusy(false); }
  }

  async function send(event) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || sending) return;
    if (!pending.current || pending.current.message !== text || pending.current.reply_to_id !== reply?.id) {
      pending.current = { message: text, client_id: crypto.randomUUID(), ...(reply ? { reply_to_id: reply.id } : {}) };
    }
    setSending(true);
    setSendError('');
    try {
      const saved = await api('/chat/messages', { method: 'POST', body: pending.current });
      followLatest.current = true;
      setMessages(current => mergeMessages(current, [saved]));
      pending.current = null;
      setDraft('');
      setReply(null);
      composer.current?.focus();
    } catch (failure) { setSendError(failure.message); }
    finally { setSending(false); }
  }

  async function remove() {
    setDeleteBusy(true);
    try {
      const removed = await api(`/chat/messages/${deleting.id}`, { method: 'DELETE' });
      setMessages(current => mergeMessages(current.map(message => message.reply_to?.id === removed.id ? { ...message, reply_to: { ...message.reply_to, message: '', deleted: true } } : message), [removed]));
      if (reply?.id === removed.id) setReply(null);
      setDeleting(null);
      setToast({ message: 'Message deleted.' });
    } catch (failure) { setSendError(failure.message); setDeleting(null); }
    finally { setDeleteBusy(false); }
  }

  return <>
    <PageHeading eyebrow="COMMUNITY" title="The city, in conversation"><Link className="button secondary" to="/profile">{translate('My activity')}<ArrowUpRight size={16} /></Link></PageHeading>
    <section className="chat-room" aria-label={translate('Community chat')}>
      <header className="chat-room-heading"><div><Hash size={21} /><h2>{translate('General')}</h2></div><button className="icon-button" title={translate('Refresh messages')} aria-label={translate('Refresh messages')} onClick={refresh}><RefreshCw size={18} /></button></header>
      <ErrorMessage>{error}</ErrorMessage>
      <div ref={feed} className="chat-feed" role="region" aria-label={translate('Latest messages')} onScroll={() => { const node = feed.current; followLatest.current = node.scrollHeight - node.scrollTop - node.clientHeight < 100; }}>
        {hasMore && <button className="text-button chat-load" disabled={olderBusy} onClick={loadOlder}>{translate(olderBusy ? 'Loading...' : 'Load earlier messages')}</button>}
        {loading ? <Loading /> : !messages.length ? <Empty title="No messages yet." message="" /> : messages.map(message => <article key={message.id} className={`chat-message ${message.user_id === profile.data?.id ? 'own-message' : ''}`} id={`message-${message.id}`}>
          <span className="avatar small">{(message.user_name || translate('Traveler')).charAt(0)}</span>
          <div className="chat-message-content"><div className="chat-message-meta"><strong>{message.user_name || translate('Traveler')}</strong><time dateTime={message.created_at}>{date(message.created_at, { hour: '2-digit', minute: '2-digit' })}</time></div>
            {message.reply_to && <blockquote><strong>{translate('Replying to {name}', { name: message.reply_to.user_name || translate('Traveler') })}</strong><p>{message.reply_to.deleted ? translate('Message deleted.') : message.reply_to.message}</p></blockquote>}
            <p className={message.deleted ? 'deleted-message' : ''}>{message.deleted ? translate('Message deleted.') : message.message}</p>
            {!message.deleted && <div className="chat-message-actions"><button className="text-button" onClick={() => { setReply(message); composer.current?.focus(); }}><Reply size={14} />{translate('Reply')}</button>{message.user_id === profile.data?.id && <button className="icon-button" title={translate('Delete message')} aria-label={translate('Delete message')} onClick={() => setDeleting(message)}><Trash2 size={15} /></button>}</div>}
          </div>
        </article>)}
      </div>
      <form className="chat-composer" onSubmit={send}>
        {reply && <div className="chat-reply-target"><MessageCircle size={17} /><span>{translate('Replying to {name}', { name: reply.user_name })}</span><button type="button" className="icon-button" title={translate('Cancel reply')} aria-label={translate('Cancel reply')} onClick={() => setReply(null)}><X size={17} /></button></div>}
        <ErrorMessage>{sendError}</ErrorMessage>
        <Label>Message the community<textarea ref={composer} value={draft} onChange={event => setDraft(event.target.value)} placeholder={translate('Write a message...')} rows={2} maxLength={2000} required disabled={sending} /></Label>
        <div className="chat-compose-actions"><span>{number(draft.length)} / {number(2000)}</span><button className="button" disabled={sending || !draft.trim()}><Send size={17} />{translate(sending ? 'Sending...' : 'Send message')}</button></div>
      </form>
    </section>
    {deleting && <Modal title="Delete message?" onClose={() => { if (!deleteBusy) setDeleting(null); }}><div className="form-stack"><p>{translate('This message will be removed from the conversation.')}</p><button className="button" disabled={deleteBusy} onClick={remove}><Trash2 size={17} />{translate(deleteBusy ? 'Please wait...' : 'Delete message')}</button></div></Modal>}
  </>;
}