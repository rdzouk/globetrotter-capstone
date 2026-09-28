import { useRef, useState } from 'react';
import { Plus, Receipt, Trash2 } from 'lucide-react';
import { api } from './api';
import { useApp } from './state';
import { ErrorMessage, Label, Modal } from './components';

const categories = [['transport', 'Transport'], ['food', 'Food'], ['entry', 'Entry fees'], ['stay', 'Accommodation'], ['other', 'Other']];

function ExpenseForm({ details, onClose, onSaved }) {
  const { translate } = useApp();
  const clientId = useRef(crypto.randomUUID());
  const members = details.members.filter(member => member.status !== 'invited');
  const [participants, setParticipants] = useState(members.map(member => member.user_id));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    setBusy(true); setError('');
    try {
      await api(`/shared-trips/${details.trip.id}/expenses`, { method: 'POST', body: { ...values, client_id: clientId.current, amount_fcfa: Number(values.amount_fcfa), participants } });
      onSaved();
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }
  return <Modal title="Add expense" onClose={onClose} dismissable={!busy}><form className="form-stack" onSubmit={submit}>
    <Label>Expense title<input name="title" required maxLength={120} /></Label>
    <div className="form-grid"><Label>Amount (FCFA)<input name="amount_fcfa" type="number" required min="1" max="10000000" step="1" /></Label><Label>Expense category<select name="category">{categories.map(([value, label]) => <option key={value} value={value}>{translate(label)}</option>)}</select></Label></div>
    <p className="muted">{translate('Paid by {name}', { name: members.find(member => member.user_id === details.viewer_id)?.name || '' })}</p>
    <fieldset className="expense-participants"><legend>{translate('Split equally between')}</legend>{members.map(member => <label key={member.user_id}><input type="checkbox" checked={participants.includes(member.user_id)} onChange={event => setParticipants(current => event.target.checked ? [...current, member.user_id] : current.filter(userId => userId !== member.user_id))} />{member.name}</label>)}</fieldset>
    <ErrorMessage>{error}</ErrorMessage><button className="button" disabled={busy || !participants.length}><Receipt size={18} />{translate(busy ? 'Saving...' : 'Save expense')}</button>
  </form></Modal>;
}

export default function TripBudget({ details, onChange }) {
  const { translate, number } = useApp();
  const { trip, budget } = details;
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const money = amount => translate('{amount} FCFA', { amount: number(amount) });
  const estimated = (trip.transport_cost_fcfa || 0) + trip.stops.reduce((total, stop) => total + (stop.cost_fcfa || 0), 0);
  const completeEstimate = trip.transport_cost_fcfa !== null && trip.stops.every(stop => stop.cost_fcfa !== null);
  async function remove() {
    setBusy(true); setError('');
    try { await api(`/shared-trips/${trip.id}/expenses/${deleting.id}`, { method: 'DELETE' }); setDeleting(null); onChange(); }
    catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }
  return <section className="feature-band">
    <div className="feature-section-heading"><h2>{translate('Trip budget')}</h2><button className="button secondary" onClick={() => setAdding(true)}><Plus size={18} />{translate('Add expense')}</button></div>
    <dl className="budget-totals"><div><dt>{translate('Budget')}</dt><dd>{trip.budget_fcfa === null ? translate('Not set') : money(trip.budget_fcfa)}</dd></div><div><dt>{translate(completeEstimate ? 'Estimated cost' : 'Known estimated costs')}</dt><dd>{money(estimated)}</dd></div><div><dt>{translate('Actual spending')}</dt><dd>{money(budget.total_fcfa)}</dd></div><div><dt>{translate('Remaining')}</dt><dd className={budget.remaining_fcfa < 0 ? 'is-negative' : ''}>{budget.remaining_fcfa === null ? translate('Not set') : money(budget.remaining_fcfa)}</dd></div></dl>
    {!budget.expenses.length && <p className="muted">{translate('No expenses yet.')}</p>}
    <div className="feature-list">{budget.expenses.map(expense => <article className="feature-row" key={expense.id}><Receipt size={20} /><div className="feature-row-main"><strong>{expense.title}</strong><span className="muted">{translate(categories.find(([value]) => value === expense.category)?.[1] || 'Other')} / {translate('Paid by {name}', { name: expense.name })}</span></div><strong className="money-value">{money(expense.amount_fcfa)}</strong>{(expense.user_id === details.viewer_id || trip.user_id === details.viewer_id) && <button className="icon-button" title={translate('Delete expense')} aria-label={translate('Delete expense')} onClick={() => { setError(''); setDeleting(expense); }}><Trash2 size={18} /></button>}</article>)}</div>
    {budget.balances.length > 1 && <section className="feature-band"><h3>{translate('Shared balances')}</h3><div className="feature-list">{budget.balances.map(balance => <div className="feature-row" key={balance.user_id}><div className="feature-row-main"><strong>{balance.name}</strong><span className="muted">{translate('Share: {amount} FCFA', { amount: number(balance.share_fcfa) })}</span></div><strong className={balance.balance_fcfa < 0 ? 'is-negative' : 'money-value'}>{money(balance.balance_fcfa)}</strong></div>)}</div><h3 className="feature-subheading">{translate('Suggested repayments')}</h3>{budget.settlements.length ? budget.settlements.map(payment => <p key={`${payment.from_user_id}-${payment.to_user_id}`}>{translate('{from} pays {to}: {amount} FCFA', { from: payment.from_name, to: payment.to_name, amount: number(payment.amount_fcfa) })}</p>) : <p className="muted">{translate('Everyone is even.')}</p>}</section>}
    {adding && <ExpenseForm details={details} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); onChange(); }} />}
    {deleting && <Modal title="Delete expense?" onClose={() => setDeleting(null)} dismissable={!busy}><div className="form-stack"><p>{deleting.title}</p><ErrorMessage>{error}</ErrorMessage><button className="button" disabled={busy} onClick={remove}><Trash2 size={18} />{translate('Delete expense')}</button></div></Modal>}
  </section>;
}