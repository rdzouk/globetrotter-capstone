import { clear, createStore, del, get, keys, set } from 'idb-keyval';

let store;
const packStore = () => store ||= createStore('globetrotter-offline-v1', 'packs');

async function sessionKey(token) {
  if (!token || !globalThis.crypto?.subtle) throw new Error('Offline storage requires a signed-in session and HTTPS.');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`globetrotter-offline-v1:${token}`));
  return { owner: [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join(''), key: await crypto.subtle.importKey('raw', digest, 'AES-GCM', false, ['encrypt', 'decrypt']) };
}

export function offlineSnapshot(trip, now = new Date()) {
  return {
    version: 1, saved_at: now.toISOString(), expires_at: new Date(now.getTime() + 7 * 86400000).toISOString(),
    trip: { id: trip.id, title: trip.title, trip_date: trip.trip_date, start_time: trip.start_time, notes: trip.notes,
      stops: trip.stops.map(stop => ({ destination_id: stop.destination_id, visit_minutes: stop.visit_minutes,
        place: { name: stop.destination.name, address: stop.destination.address, lat: stop.destination.lat, lng: stop.destination.lng,
          phone: stop.destination.phone, description: stop.destination.description, description_fr: stop.destination.description_fr } })),
    },
  };
}

export async function encryptPack(token, snapshot) {
  const { key, owner } = await sessionKey(token);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(snapshot)));
  return { owner, iv, ciphertext };
}

export async function decryptPack(token, encrypted) {
  const { key, owner } = await sessionKey(token);
  if (encrypted.owner !== owner) throw new Error('Offline pack unavailable.');
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: encrypted.iv }, key, encrypted.ciphertext);
  const snapshot = JSON.parse(new TextDecoder().decode(plaintext));
  if (snapshot.version !== 1 || !snapshot.trip?.stops || !Number.isFinite(Date.parse(snapshot.expires_at))) throw new Error('Offline pack unavailable.');
  return snapshot;
}

export async function saveOfflinePack(token, snapshot) {
  const encrypted = await encryptPack(token, snapshot);
  const identifier = `${encrypted.owner}:${snapshot.trip.id}`;
  if (encrypted.ciphertext.byteLength > 5 * 1024 * 1024) throw new Error('This offline pack is too large.');
  const existing = (await keys(packStore())).filter(key => key.startsWith(`${encrypted.owner}:`));
  if (existing.length >= 20 && !existing.includes(identifier)) throw new Error('Remove an offline pack before saving another.');
  if (localStorage.getItem('gt_token') !== token) throw new Error('Your session has expired. Please sign in again.');
  await set(identifier, encrypted, packStore());
  if (localStorage.getItem('gt_token') !== token) { await del(identifier, packStore()); throw new Error('Your session has expired. Please sign in again.'); }
  window.dispatchEvent(new Event('gt:offline-packs'));
}

export async function loadOfflinePacks(token) {
  const { owner } = await sessionKey(token);
  const identifiers = (await keys(packStore())).filter(key => key.startsWith(`${owner}:`));
  const packs = [];
  for (const identifier of identifiers) {
    const encrypted = await get(identifier, packStore());
    if (!encrypted) continue;
    const snapshot = await decryptPack(token, encrypted);
    if (Date.parse(snapshot.expires_at) <= Date.now()) { await del(identifier, packStore()); continue; }
    packs.push(snapshot);
  }
  return packs.sort((first, second) => first.trip.trip_date.localeCompare(second.trip.trip_date));
}

export async function removeOfflinePack(token, tripId) {
  const { owner } = await sessionKey(token);
  await del(`${owner}:${tripId}`, packStore());
  window.dispatchEvent(new Event('gt:offline-packs'));
}

export async function clearOfflinePacks() {
  if (typeof indexedDB !== 'undefined') await clear(packStore());
}