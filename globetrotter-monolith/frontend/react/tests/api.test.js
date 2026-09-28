import test from 'node:test';
import assert from 'node:assert/strict';
import { api } from '../src/api.js';
import { decryptPack, encryptPack, offlineSnapshot } from '../src/offline.js';

test('offline packs encrypt selected details and reject another session', async () => {
  const trip = { id: 1, title: 'Private outing', trip_date: '2026-10-03', start_time: '09:00', notes: 'Our plans',
    budget: { secret: true }, members: [{ name: 'Private member' }],
    stops: [{ destination_id: 1, visit_minutes: 60, cost_fcfa: 100, destination: { name: 'Tassa', address: 'Bastos', lat: 3.8, lng: 11.5, description: 'A cafe' } }] };
  const snapshot = offlineSnapshot(trip, new Date('2026-10-01T10:00:00Z'));
  assert.equal(snapshot.expires_at, '2026-10-08T10:00:00.000Z');
  assert.equal(snapshot.trip.members, undefined);
  assert.equal(snapshot.trip.budget, undefined);
  assert.equal(snapshot.trip.stops[0].cost_fcfa, undefined);
  const encrypted = await encryptPack('session-one', snapshot);
  assert.equal(new TextDecoder().decode(encrypted.ciphertext).includes('Private outing'), false);
  assert.deepEqual(await decryptPack('session-one', encrypted), JSON.parse(JSON.stringify(snapshot)));
  await assert.rejects(() => decryptPack('session-two', encrypted));
  const corrupted = { ...encrypted, ciphertext: encrypted.ciphertext.slice(0) };
  new Uint8Array(corrupted.ciphertext)[0] ^= 1;
  await assert.rejects(() => decryptPack('session-one', corrupted));
});

test('API preserves JSON requests, multipart boundaries and authenticated media', async () => {
  const originalFetch = globalThis.fetch;
  const originalStorage = globalThis.localStorage;
  const calls = [];
  globalThis.localStorage = { getItem: () => 'test-session' };
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return new Response(JSON.stringify({ saved: true }), { status: 200 });
  };
  try {
    await api('/friends', { method: 'POST', body: { user_id: 2 } });
    assert.equal(calls[0].options.body, '{"user_id":2}');
    assert.equal(calls[0].options.headers['Content-Type'], 'application/json');
    const upload = new FormData();
    upload.append('audio', new Blob(['voice'], { type: 'audio/webm' }), 'note.webm');
    await api('/friends/1/messages', { method: 'POST', body: upload });
    assert.equal(calls[1].options.body, upload);
    assert.equal(calls[1].options.headers['Content-Type'], undefined);
    assert.equal(calls[1].options.headers.Authorization, 'Bearer test-session');
    const media = await api('/friends/1/messages/1/audio', { responseType: 'blob' });
    assert.ok(media instanceof Blob);
    assert.equal(calls[2].options.responseType, undefined);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = originalStorage;
  }
});