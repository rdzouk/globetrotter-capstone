import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Ban, Check, Flag, RefreshCw, ShieldCheck, Trash2 } from 'lucide-react';
import { api } from './api';
import { useApp, useResource } from './state';
import { Empty, ErrorMessage, Label, Loading, Modal, PageHeading, ResourceError } from './components';
import { AuthenticatedImage } from './Media';
import { VoicePlayback } from './VoiceNote';

const reasons = [['spam', 'Spam'], ['harassment', 'Harassment'], ['inappropriate', 'Inappropriate content'], ['privacy', 'Privacy concern'], ['other', 'Other']];
const types = { chat: 'Community message', message: 'Private message', comment: 'Comment', photo: 'Photo' };

export function SafetyActions({ kind, targetId, userId, name }) {
  const { currentUser, refreshPrivacy, setToast, translate } = useApp();
  const [mode, setMode] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (!userId || !currentUser.data || currentUser.data.id === userId) return null;
  async function report(event) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    setBusy(true); setError('');
    try { await api('/reports', { method: 'POST', body: { ...values, target_type: kind, target_id: targetId } }); setMode(null); setToast({ message: 'Report submitted.' }); }
    catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }
  async function block() {
    setBusy(true); setError('');
    try { await api(`/blocks/${userId}`, { method: 'PUT' }); setMode(null); refreshPrivacy(); setToast({ message: 'Traveler blocked.' }); }
    catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }
  return <span className="safety-actions">
    {kind && <button type="button" className="icon-button" title={translate('Report content')} aria-label={translate('Report content by {name}', { name })} onClick={() => { setError(''); setMode('report'); }}><Flag size={16} /></button>}
    <button type="button" className="icon-button" title={translate('Block traveler')} aria-label={translate('Block {name}', { name })} onClick={() => { setError(''); setMode('block'); }}><Ban size={16} /></button>
    {mode === 'report' && <Modal title="Report content" onClose={() => setMode(null)} dismissable={!busy}><form className="form-stack" onSubmit={report}>
      <p>{translate('The selected item and any attached media will be shared with moderators.')}</p>
      <Label>Report reason<select name="reason" required defaultValue=""><option value="">{translate('Choose a reason')}</option>{reasons.map(([value, label]) => <option key={value} value={value}>{translate(label)}</option>)}</select></Label>
      <Label>Additional details<textarea name="details" maxLength={1000} rows={3} /></Label><ErrorMessage>{error}</ErrorMessage><button className="button" disabled={busy}><Flag size={18} />{translate(busy ? 'Sending...' : 'Submit report')}</button>
    </form></Modal>}
    {mode === 'block' && <Modal title="Block traveler?" onClose={() => setMode(null)} dismissable={!busy}><div className="form-stack"><strong>{name}</strong><p>{translate('This removes your friendship and private conversation, and prevents new private contact.')}</p><ErrorMessage>{error}</ErrorMessage><button className="button" disabled={busy} onClick={block}><Ban size={18} />{translate('Block traveler')}</button></div></Modal>}
  </span>;
}

export default function Safety() {
  const { blocks, refreshPrivacy, translate } = useApp();
  const [selected, setSelected] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function unblock() {
    setBusy(true); setError('');
    try { await api(`/blocks/${selected.user_id}`, { method: 'DELETE' }); setSelected(null); refreshPrivacy(); }
    catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }
  return <><PageHeading title="Blocked travelers"><button className="icon-button" onClick={blocks.reload} title={translate('Refresh blocked travelers')} aria-label={translate('Refresh blocked travelers')}><RefreshCw size={18} /></button></PageHeading>
    {blocks.error ? <ResourceError resource={blocks} /> : blocks.loading ? <Loading /> : !blocks.data?.length ? <Empty title="No blocked travelers" message="Your blocked travelers will appear here." /> : <div className="feature-list">{blocks.data.map(person => <article className="feature-row" key={person.user_id}><Ban size={20} /><strong className="feature-row-main">{person.name}</strong><button className="button secondary" onClick={() => { setError(''); setSelected(person); }}>{translate('Unblock')}</button></article>)}</div>}
    {selected && <Modal title="Unblock traveler?" onClose={() => setSelected(null)} dismissable={!busy}><div className="form-stack"><strong>{selected.name}</strong><p>{translate('Unblocking does not restore a friendship or deleted conversation.')}</p><ErrorMessage>{error}</ErrorMessage><button className="button" disabled={busy} onClick={unblock}><Check size={18} />{translate('Unblock')}</button></div></Modal>}
  </>;
}

export function ModerationQueue() {
  const { translate, date } = useApp();
  const [status, setStatus] = useState('open');
  const [before, setBefore] = useState(null);
  const [selected, setSelected] = useState(null);
  const [action, setAction] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const resource = useResource(`/admin/reports?status=${status}${before ? `&before_id=${before}` : ''}`);
  async function resolve() {
    setBusy(true); setError('');
    try { await api(`/admin/reports/${selected.id}`, { method: 'PATCH', body: { action } }); setSelected(null); setAction(null); resource.reload(); }
    catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }
  return <section className="feature-band"><div className="feature-section-heading"><h2>{translate('Moderation queue')}</h2><button className="icon-button" onClick={resource.reload} aria-label={translate('Refresh reports')} title={translate('Refresh reports')}><RefreshCw size={18} /></button></div>
    <div className="feature-inline-form"><Label>Report status<select value={status} onChange={event => { setStatus(event.target.value); setBefore(null); }}>{[['open', 'Open reports'], ['removed', 'Content removed'], ['dismissed', 'Dismissed']].map(([value, label]) => <option key={value} value={value}>{translate(label)}</option>)}</select></Label><Link className="button secondary" to="/events">{translate('Manage events')}</Link></div>
    {resource.error ? <ResourceError resource={resource} /> : resource.loading ? <Loading /> : !resource.data?.items.length ? <Empty title="No reports" message="No reports match this status." /> : <div className="feature-list">{resource.data.items.map(report => <article className="feature-row" key={report.id}><Flag size={20} /><div className="feature-row-main"><strong>{translate(types[report.target_type])} / {report.snapshot.name}</strong><span className="muted">{translate(reasons.find(([value]) => value === report.reason)?.[1] || 'Other')} / {date(report.created_at)}</span></div><button className="button secondary" onClick={() => { setError(''); setAction(null); setSelected(report); }}><ShieldCheck size={18} />{translate('Review report')}</button></article>)}</div>}
    <div className="feature-pagination">{before && <button className="button secondary" onClick={() => setBefore(null)}>{translate('Latest reports')}</button>}{resource.data?.next_before && <button className="button secondary" onClick={() => setBefore(resource.data.next_before)}>{translate('Earlier reports')}</button>}</div>
    {selected && <Modal title="Review report" onClose={() => setSelected(null)} dismissable={!busy}><div className="form-stack">
      <strong>{selected.snapshot.name}</strong><p className="report-content">{selected.snapshot.message}</p>
      {selected.media_type?.startsWith('image/') && <AuthenticatedImage path={selected.media_url} alt={translate('Reported photo')} className="report-image" />}
      {selected.media_type?.startsWith('audio/') && <VoicePlayback path={selected.media_url} />}
      <p>{translate(reasons.find(([value]) => value === selected.reason)?.[1] || 'Other')}</p>{selected.details && <p className="report-content">{selected.details}</p>}<ErrorMessage>{error}</ErrorMessage>
      {selected.status === 'open' && (action ? <><p>{translate(action === 'remove' ? 'Remove the reported content?' : 'Dismiss this report?')}</p><div className="plan-actions"><button className="button secondary" disabled={busy} onClick={() => setAction(null)}>{translate('Cancel')}</button><button className="button" disabled={busy} onClick={resolve}>{translate('Confirm')}</button></div></> : <div className="plan-actions"><button className="button secondary" onClick={() => setAction('dismiss')}><Check size={18} />{translate('Dismiss report')}</button><button className="button" onClick={() => setAction('remove')}><Trash2 size={18} />{translate('Remove content')}</button></div>)}
    </div></Modal>}
  </section>;
}