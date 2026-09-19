import { useEffect, useReducer, useState } from 'react';
import { ImageOff, LoaderCircle, RefreshCw } from 'lucide-react';
import { api } from './api';
import { useApp } from './state';

export function useMediaUrl(path) {
  const [revision, reload] = useReducer(value => value + 1, 0);
  const [result, setResult] = useState({ path: null, url: '', error: '', loading: false });
  useEffect(() => {
    if (!path) return;
    const controller = new AbortController();
    let objectUrl;
    setResult({ path, url: '', error: '', loading: true });
    api(path, { responseType: 'blob', signal: controller.signal })
      .then(blob => {
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob);
        setResult({ path, url: objectUrl, error: '', loading: false });
      })
      .catch(error => { if (!controller.signal.aborted) setResult({ path, url: '', error: error.message, loading: false }); });
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [path, revision]);
  return { ...(result.path === path ? result : { url: '', error: '', loading: Boolean(path) }), reload };
}

export function AuthenticatedImage({ path, alt, className = '', retry = true, ...props }) {
  const { translate } = useApp();
  const media = useMediaUrl(path);
  if (media.url) return <img src={media.url} alt={alt} className={className} {...props} />;
  return <div className={`image-fallback ${className}`} role="img" aria-label={alt}>{media.loading ? <LoaderCircle className="spin" size={24} /> : <><ImageOff size={26} />{retry && <button type="button" className="icon-button" title={translate('Try again')} aria-label={translate('Try again')} onClick={media.reload}><RefreshCw size={17} /></button>}</>}</div>;
}