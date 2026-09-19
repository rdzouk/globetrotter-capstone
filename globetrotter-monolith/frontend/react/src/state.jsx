import { createContext, useContext, useEffect, useReducer, useState } from 'react';
import { api } from './api';
import { formatLocalDate, formatNumber, localeFor, translateText } from './i18n';
import { applyTheme, getThemePreference, resolveTheme } from './theme';

const AppContext = createContext(null);

export function useResource(path) {
  const [version, reload] = useReducer(value => value + 1, 0);
  const [state, setState] = useState({ data: null, loading: Boolean(path), error: '', path });
  useEffect(() => {
    if (!path) {
      setState({ data: null, loading: false, error: '', path });
      return;
    }
    const controller = new AbortController();
    setState(current => ({ data: current.path === path ? current.data : null, loading: true, error: '', path }));
    api(path, { signal: controller.signal })
      .then(data => { if (!controller.signal.aborted) setState({ data, loading: false, error: '', path }); })
      .catch(error => { if (!controller.signal.aborted) setState({ data: null, loading: false, error: error.message, path }); });
    return () => controller.abort();
  }, [path, version]);
  return { ...(state.path === path ? state : { data: null, loading: Boolean(path), error: '' }), reload };
}

export function AppProvider({ children }) {
  const [session, setSession] = useState(() => ({ token: localStorage.getItem('gt_token'), name: localStorage.getItem('gt_name') || '', verified: false }));
  const [sessionError, setSessionError] = useState('');
  const [sessionVersion, retrySession] = useReducer(value => value + 1, 0);
  const [language, setLanguage] = useState(() => localStorage.getItem('gt_lang') === 'fr' ? 'fr' : 'en');
  const [themePreference, setTheme] = useState(getThemePreference);
  const [systemDark, setSystemDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches);
  const theme = resolveTheme(themePreference, systemDark);
  const [toast, setToast] = useState(null);
  const [tripVersion, updateTrips] = useReducer(value => value + 1, 0);
  const places = useResource(session.verified ? '/destinations' : null);
  const favorites = useResource(session.verified ? '/favorites' : null);
  const friends = useResource(session.verified ? '/friends' : null);
  const currentUser = useResource(session.verified ? '/profile' : null);
  const favoriteIds = new Set((favorites.data || []).map(place => place.id));
  const [savingFavorites, setSavingFavorites] = useState(new Set());

  useEffect(() => {
    localStorage.setItem('gt_lang', language);
    document.documentElement.lang = language;
  }, [language]);
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const update = event => setSystemDark(event.matches);
    media.addEventListener('change', update);
    const sync = event => { if (event.key === 'gt_theme') setTheme(getThemePreference()); };
    window.addEventListener('storage', sync);
    return () => { media.removeEventListener('change', update); window.removeEventListener('storage', sync); };
  }, []);
  useEffect(() => {
    localStorage.setItem('gt_theme', themePreference);
    applyTheme(theme);
  }, [theme, themePreference]);
  const translate = (text, values) => translateText(language, text, values);
  const number = (value, options) => formatNumber(language, value, options);
  const date = (value, options) => formatLocalDate(language, value, options);
  const locale = localeFor(language);

  useEffect(() => {
    const expire = () => {
      setSession({ token: null, name: '', verified: false });
      setToast({ message: 'Your session has expired. Please sign in again.', error: true });
    };
    const syncSession = event => {
      if (event.key === 'gt_token' || event.key === null) setSession({ token: localStorage.getItem('gt_token'), name: localStorage.getItem('gt_name') || '', verified: false });
    };
    window.addEventListener('gt:session-expired', expire);
    window.addEventListener('storage', syncSession);
    return () => { window.removeEventListener('gt:session-expired', expire); window.removeEventListener('storage', syncSession); };
  }, []);
  useEffect(() => {
    setSessionError('');
    if (!session.token || session.verified) return;
    const controller = new AbortController();
    api('/profile', { signal: controller.signal })
      .then(profile => {
        if (!controller.signal.aborted) setSession(current => ({ ...current, name: profile.name, role: profile.role || 'user', verified: true }));
      })
      .catch(error => { if (!controller.signal.aborted) setSessionError(error.message); });
    return () => controller.abort();
  }, [session.token, session.verified, sessionVersion]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(timer);
  }, [toast]);

  function signIn(data) {
    localStorage.setItem('gt_token', data.token);
    localStorage.setItem('gt_name', data.name || '');
    setSession({ token: data.token, name: data.name || '', role: data.role || 'user', verified: true });
  }
  function signOut() {
    localStorage.removeItem('gt_token');
    localStorage.removeItem('gt_name');
    setSession({ token: null, name: '', verified: false });
  }
  function updateName(name) {
    localStorage.setItem('gt_name', name);
    setSession(current => ({ ...current, name }));
  }
  async function toggleFavorite(place) {
    if (savingFavorites.has(place.id)) return;
    setSavingFavorites(current => new Set([...current, place.id]));
    try {
      if (favoriteIds.has(place.id)) await api(`/favorites/${place.id}`, { method: 'DELETE' });
      else await api('/favorites', { method: 'POST', body: { destination_id: place.id } });
      favorites.reload();
      setToast({ message: favoriteIds.has(place.id) ? 'Place removed from saved places.' : 'Place saved for later.' });
    } catch (error) {
      setToast({ message: error.message, error: true });
    } finally {
      setSavingFavorites(current => new Set([...current].filter(id => id !== place.id)));
    }
  }
  return <AppContext.Provider value={{ session, sessionError, retrySession, signIn, signOut, updateName, places, favorites, friends, currentUser, favoriteIds, savingFavorites, toggleFavorite, toast, setToast, tripVersion, updateTrips, language, setLanguage, theme, themePreference, setTheme, translate, number, date, locale }}>{children}</AppContext.Provider>;
}

export function useApp() { return useContext(AppContext); }