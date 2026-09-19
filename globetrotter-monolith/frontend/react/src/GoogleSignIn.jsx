import { useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { api } from './api';
import { ErrorMessage, Loading } from './components';
import { useApp, useResource } from './state';

let googleScript;

function loadGoogle() {
  if (window.google?.accounts?.id) return Promise.resolve(window.google);
  if (googleScript) return googleScript;
  googleScript = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    const timer = setTimeout(() => { script.remove(); googleScript = null; reject(new Error('Google sign-in could not load. Please try again.')); }, 15000);
    script.onload = () => {
      clearTimeout(timer);
      if (window.google?.accounts?.id) resolve(window.google);
      else { script.remove(); googleScript = null; reject(new Error('Google sign-in could not load. Please try again.')); }
    };
    script.onerror = () => { clearTimeout(timer); script.remove(); googleScript = null; reject(new Error('Google sign-in could not load. Please try again.')); };
    document.head.appendChild(script);
  });
  return googleScript;
}

export default function GoogleSignIn({ register, onSuccess }) {
  const { language, theme, translate } = useApp();
  const config = useResource('/auth/google/config');
  const container = useRef(null);
  const callback = useRef(onSuccess);
  const submitting = useRef(false);
  callback.current = onSuccess;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!config.data?.client_id) return;
    let active = true;
    const node = container.current;
    loadGoogle().then(google => {
      if (!active || !node) return;
      google.accounts.id.initialize({
        client_id: config.data.client_id,
        nonce: config.data.nonce,
        auto_select: false,
        use_fedcm_for_button: true,
        button_auto_select: false,
        callback: async result => {
          if (!active || submitting.current) return;
          submitting.current = true;
          setBusy(true);
          setError('');
          try {
            const user = await api('/auth/google', { method: 'POST', body: { credential: result.credential } });
            if (active) callback.current(user);
          } catch (failure) { if (active) { setError(failure.message); config.reload(); } }
          finally { submitting.current = false; if (active) setBusy(false); }
        },
      });
      node.replaceChildren();
      google.accounts.id.renderButton(node, { type: 'standard', theme: theme === 'dark' ? 'filled_black' : 'outline', size: 'large', text: register ? 'signup_with' : 'signin_with', shape: 'rectangular', locale: language, width: Math.min(400, Math.floor(node.clientWidth || 300)) });
    }).catch(failure => { if (active) setError(failure.message); });
    return () => { active = false; node?.replaceChildren(); };
  }, [config.data, language, theme, register]);
  return <div className="google-signin" aria-busy={busy}>
    {config.loading ? <Loading /> : config.error ? <><ErrorMessage>{config.error}</ErrorMessage><button className="button secondary" onClick={config.reload}><RefreshCw size={16} />{translate('Try again')}</button></> : !config.data?.client_id ? <><button className="button secondary google-unavailable" disabled>{translate(register ? 'Sign up with Google' : 'Continue with Google')}</button><p className="muted">{translate('Google sign-in is not configured yet.')}</p></> : null}
    <div ref={container} className="google-button" hidden={!config.data?.client_id || busy} />
    {busy && <p role="status">{translate('Verifying your Google account...')}</p>}
    <ErrorMessage>{error}</ErrorMessage>
    {error && <button className="text-button" onClick={config.reload}>{translate('Try again')}</button>}
  </div>;
}