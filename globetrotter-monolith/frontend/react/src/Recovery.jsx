import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, KeyRound, Mail, Send } from 'lucide-react';
import { api } from './api';
import { useApp, useResource } from './state';
import { ErrorMessage, Label, Loading, PageHeading, ResourceError } from './components';

export default function Recovery({ reset = false }) {
  const { translate, signOut } = useApp();
  const location = useLocation();
  const navigate = useNavigate();
  const channels = useResource(reset ? null : '/auth/recovery/config');
  const [token] = useState(() => new URLSearchParams(location.hash.slice(1)).get('token') || '');
  const [channel, setChannel] = useState('email');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (reset && location.hash) navigate(location.pathname, { replace: true });
  }, [reset, location.hash, location.pathname, navigate]);
  async function submit(event) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    setError('');
    if (reset && values.password !== values.confirm) { setError('The passwords do not match.'); return; }
    setBusy(true);
    try {
      await api(reset ? '/auth/recovery/reset' : '/auth/recovery', { method: 'POST', body: reset ? { token, password: values.password } : { channel, identifier: values.identifier } });
      if (reset) signOut();
      setDone(true);
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }
  const unavailable = !reset && channels.data && !channels.data[channel];
  return <section className="recovery-form">
    <PageHeading title={done ? reset ? 'Password changed' : 'Check your messages' : reset ? 'Choose a new password' : 'Recover your account'} description={done ? reset ? 'Password changed. Sign in with your new password.' : 'If a matching password account exists, a reset link will arrive shortly. Check your spam folder too.' : undefined} />
    {!reset && channels.loading ? <Loading /> : !reset && channels.error ? <ResourceError resource={channels} /> : !done && <form className="form-stack" onSubmit={submit}>
      {reset ? <>
        <Label>New password<input name="password" type="password" autoComplete="new-password" minLength={12} maxLength={128} required /></Label>
        <Label>Confirm password<input name="confirm" type="password" autoComplete="new-password" minLength={12} maxLength={128} required /></Label>
        {!token && <ErrorMessage>{translate('This reset link is invalid or expired. Request a new one.')}</ErrorMessage>}
      </> : <>
        <div className="segmented auth-method" role="group" aria-label={translate('Recovery method')}>{[['email', 'Email address'], ['phone', 'Phone number']].map(([value, label]) => <button type="button" key={value} aria-pressed={channel === value} className={channel === value ? 'active' : ''} onClick={() => { setChannel(value); setError(''); }}>{translate(label)}</button>)}</div>
        <Label>{channel === 'email' ? 'Email address' : 'Phone number'}<input key={channel} name="identifier" type={channel === 'email' ? 'email' : 'tel'} autoComplete={channel === 'email' ? 'email' : 'tel'} maxLength={320} required /></Label>
        {unavailable && <ErrorMessage>{translate('This recovery delivery method is not configured yet.')}</ErrorMessage>}
      </>}
      <ErrorMessage>{error}</ErrorMessage>
      <button className="button" disabled={busy || unavailable || (reset && !token)}>{reset ? <KeyRound size={18} /> : <Send size={18} />}{translate(busy ? 'Please wait...' : reset ? 'Reset password' : 'Send reset link')}</button>
    </form>}
    {reset && !done && <Link className="text-button" to="/forgot-password"><Mail size={17} />{translate('Request a new reset link')}</Link>}
    <Link className="text-button recovery-back" to="/login"><ArrowLeft size={17} />{translate('Back to sign in')}</Link>
  </section>;
}