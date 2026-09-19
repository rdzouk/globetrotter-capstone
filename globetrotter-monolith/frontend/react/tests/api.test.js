import test from 'node:test';
import assert from 'node:assert/strict';
import { api } from '../src/api.js';

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