export const API_BASE = (import.meta.env?.VITE_API_BASE_URL || '/api').replace(/\/$/, '');

export async function api(path, options = {}) {
  const token = localStorage.getItem('gt_token');
  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new Error('Cannot reach GlobeTrotter. Check your connection and try again.');
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 429) throw new Error('Too many requests. Please wait a moment and try again.');
    if (response.status === 401 && path !== '/login' && token && localStorage.getItem('gt_token') === token) {
      localStorage.removeItem('gt_token');
      localStorage.removeItem('gt_name');
      window.dispatchEvent(new Event('gt:session-expired'));
    }
    throw new Error(data.errors?.join('\n') || data.error || 'Request failed. Please try again.');
  }
  return data;
}