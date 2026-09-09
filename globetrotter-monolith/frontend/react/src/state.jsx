import { createContext, useContext, useEffect, useReducer, useState } from 'react';
import { api } from './api';
import { french } from './translations';

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
  const [session, setSession] = useState(() => ({ token: localStorage.getItem('gt_token'), name: localStorage.getItem('gt_name') || '' }));
  const [language, setLanguage] = useState(() => localStorage.getItem('gt_lang') === 'fr' ? 'fr' : 'en');
  const [theme, setTheme] = useState(() => localStorage.getItem('gt_theme') === 'dark' ? 'dark' : 'light');
  const [toast, setToast] = useState(null);
  const [tripVersion, updateTrips] = useReducer(value => value + 1, 0);
  const places = useResource('/destinations');
  const favorites = useResource(session.token ? '/favorites' : null);
  const favoriteIds = new Set((favorites.data || []).map(place => place.id));
  const [savingFavorites, setSavingFavorites] = useState(new Set());

  useEffect(() => {
    localStorage.setItem('gt_lang', language);
    document.documentElement.lang = language;
  }, [language]);
  useEffect(() => {
    localStorage.setItem('gt_theme', theme);
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  const translate = text => language === 'fr' ? french[text] || text : text;

  useEffect(() => {
    const expire = () => {
      setSession({ token: null, name: '' });
      setToast({ message: 'Your session has expired. Please sign in again.', error: true });
    };
    window.addEventListener('gt:session-expired', expire);
    return () => window.removeEventListener('gt:session-expired', expire);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(timer);
  }, [toast]);

  function signIn(data) {
    localStorage.setItem('gt_token', data.token);
    localStorage.setItem('gt_name', data.name || '');
    setSession({ token: data.token, name: data.name || '' });
  }
  function signOut() {
    localStorage.removeItem('gt_token');
    localStorage.removeItem('gt_name');
    setSession({ token: null, name: '' });
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
  return <AppContext.Provider value={{ session, signIn, signOut, updateName, places, favorites, favoriteIds, savingFavorites, toggleFavorite, toast, setToast, tripVersion, updateTrips, language, setLanguage, theme, setTheme, translate }}>{children}</AppContext.Provider>;
}

export function useApp() { return useContext(AppContext); }