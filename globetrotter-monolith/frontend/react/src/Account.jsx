import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, Check, Eye, EyeOff, LogOut, Send, UserRound } from 'lucide-react';
import { api } from './api';
import { useApp, useResource } from './state';
import { Empty, ErrorMessage, InterestPicker, Label, Loading, PageHeading, RatingInput, ResourceError } from './components';

export function AuthPage({ register = false }) {
  const { session, signIn, setToast } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const [method, setMethod] = useState('email');
  const [showPassword, setShowPassword] = useState(false);
  const [preferences, setPreferences] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const from = location.state?.from;
  const returnTo = typeof from === 'string' && from.startsWith('/') && !from.startsWith('//') && !/^\/(login|register)/.test(from) ? from : '/';
  if (session.token) return <Navigate to={returnTo} replace />;
  async function submit(event) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    setBusy(true);
    setError('');
    try {
      if (register) {
        await api('/register', { method: 'POST', body: { ...values, preferences } });
        setToast({ message: 'Account created. Sign in to start exploring.' });
        navigate('/login', { replace: true, state: { from: returnTo } });
      } else {
        signIn(await api('/login', { method: 'POST', body: values }));
        navigate(returnTo, { replace: true });
      }
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }
  return <div className="auth-layout"><div className="auth-form"><PageHeading eyebrow="A WORLD CLOSER TO HOME" title={register ? 'Make room for discovery.' : 'Good to see you again.'} description={register ? 'Your next favorite place is waiting.' : 'Your places, your plans, your GlobeTrotter.'} /><form className="form-stack" onSubmit={submit}>{register && <Label>Full name<input name="name" autoComplete="name" required maxLength={100} /></Label>}<div className="segmented auth-method" role="group" aria-label="Sign in method">{['email', 'phone'].map(value => <button key={value} type="button" className={method === value ? 'active' : ''} aria-pressed={method === value} onClick={() => setMethod(value)}>{value === 'email' ? 'Email address' : 'Phone number'}</button>)}</div><Label>{method === 'email' ? 'Email address' : 'Phone number'}<input key={method} type={method === 'email' ? 'email' : 'tel'} name={method} autoComplete={method === 'email' ? 'email' : 'tel'} required placeholder={method === 'email' ? 'you@example.com' : '+237 ...'} /></Label><Label>Password<div className="password-input"><input type={showPassword ? 'text' : 'password'} name="password" autoComplete={register ? 'new-password' : 'current-password'} required minLength={register ? 4 : 1} /><button type="button" className="icon-button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? 'Hide password' : 'Show password'} title={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></Label>{register && <InterestPicker value={preferences} onChange={setPreferences} />}<ErrorMessage>{error}</ErrorMessage><button className="button" disabled={busy}>{busy ? 'Please wait...' : register ? 'Create account' : 'Sign in'}<ArrowRight size={18} /></button><p className="auth-switch">{register ? 'Already part of the journey?' : 'New around here?'} <Link to={register ? '/login' : '/register'} state={{ from: returnTo }}>{register ? 'Sign in' : 'Create an account'}</Link></p></form></div><aside className="auth-photo"><img src="/images/places/47.jpg" alt="A place to discover in Yaounde" /><div><span>GLOBETROTTER / YAOUNDE</span><h2>Stay curious.<br />Go somewhere new.</h2><Link to="/">Explore the city<ArrowRight size={18} /></Link></div></aside></div>;
}

export function Profile() {
  const profile = useResource('/profile');
  if (profile.loading) return <Loading />;
  if (profile.error) return <ResourceError resource={profile} />;
  return <ProfileForm key={profile.data.id} profile={profile.data} />;
}
function ProfileForm({ profile }) {
  const { updateName, setToast, signOut } = useApp();
  const navigate = useNavigate();
  const [name, setName] = useState(profile.name);
  const [preferences, setPreferences] = useState(profile.preferences || []);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const data = await api('/profile', { method: 'PATCH', body: { name: name.trim(), preferences } });
      updateName(data.name);
      setToast({ message: 'Profile updated.' });
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }
  return <><PageHeading eyebrow="YOUR GLOBETROTTER" title="Make it personal" description="A few details. A world of possibilities." /><div className="settings-layout"><div className="profile-summary"><div className="avatar large">{name.charAt(0).toUpperCase() || <UserRound />}</div><h2>{profile.name}</h2><p>{profile.email || profile.phone}</p><button className="button secondary" onClick={() => { signOut(); navigate('/'); }}><LogOut size={17} />Sign out</button></div><form className="form-stack settings-form" onSubmit={submit}><h2>Account details</h2><Label>Full name<input required value={name} maxLength={100} onChange={event => setName(event.target.value)} autoComplete="name" /></Label>{profile.email && <Label>Email address<input value={profile.email} readOnly type="email" /></Label>}{profile.phone && <Label>Phone number<input value={profile.phone} readOnly type="tel" /></Label>}<InterestPicker value={preferences} onChange={setPreferences} /><ErrorMessage>{error}</ErrorMessage><button className="button" disabled={busy}><Check size={18} />{busy ? 'Saving...' : 'Save changes'}</button></form></div></>;
}

export function Feedback() {
  const feedback = useResource('/feedback');
  const { session, setToast } = useApp();
  const [rating, setRating] = useState(0);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const message = new FormData(form).get('message').trim();
    if (!message) { setError('Please enter a message.'); return; }
    setBusy(true);
    setError('');
    try {
      await api('/feedback', { method: 'POST', body: { message, rating } });
      form.reset();
      setRating(0);
      feedback.reload();
      setToast({ message: 'Thank you for sharing your feedback.' });
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }
  return <><PageHeading eyebrow="A BETTER JOURNEY, TOGETHER" title="We're listening" description="What made your day? What could be better?" /><div className="feedback-layout"><section>{session.token ? <form className="form-stack" onSubmit={submit}><h2>Share your experience</h2><RatingInput value={rating} onChange={setRating} /><Label>Your feedback<textarea required name="message" maxLength={2000} rows={6} placeholder="What's on your mind?" /></Label><ErrorMessage>{error}</ErrorMessage><button className="button" disabled={busy}><Send size={17} />{busy ? 'Sending...' : 'Send feedback'}</button></form> : <Empty title="Join the conversation" message="Your experience matters."><Link className="button" to="/login" state={{ from: '/feedback' }}>Sign in<ArrowRight size={17} /></Link></Empty>}</section><section><h2>From the community</h2>{feedback.loading ? <Loading /> : feedback.error ? <ResourceError resource={feedback} /> : !feedback.data?.length ? <p className="muted">No feedback yet.</p> : <div className="community-list">{[...feedback.data].reverse().map(item => <article key={item.id} className="community-entry"><div><span className="avatar small">{(item.user_name || 'T').charAt(0)}</span><strong>{item.user_name || 'Traveler'}</strong>{item.rating && <span className="rating">{item.rating}/5</span>}</div><p>{item.message}</p></article>)}</div>}</section></div></>;
}