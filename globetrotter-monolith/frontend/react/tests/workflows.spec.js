import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { localDate } from '../src/utils.js';

const destinations = [
  { id: 1, name: 'Tassa', category: 'restaurant', neighborhood: 'Bastos', address: 'Bastos, Yaounde', lat: 3.885, lng: 11.512, rating: 4.3, rating_count: 189, price_level: 2, tags: ['restaurant', 'outdoor'], description: 'Bright garden cafe-restaurant in Bastos with a glass roof, coffee bar, and occasional live jazz nights.', phone: '+237 600000000' },
  { id: 44, name: 'Mont Febe', category: 'nature', neighborhood: 'Mont Febe', address: 'Yaounde', lat: 3.91, lng: 11.49, rating: 4.8, rating_count: 50, price_level: 1, tags: ['nature', 'outdoor'], description: 'Small, highly-rated Odza hotel known for cleanliness and a warm welcome.' },
];

const farePolicies = [
  { id: 'yaounde-shared', city: 'Yaounde', mode: 'taxi', model: 'reference', basis: 'passenger', base_min: 350, base_max: 400, per_km_min: 0, per_km_max: 0, source_name: 'Tariff reference', source_url: 'https://example.test/tariffs', source_date: '2024-02-26', checked_at: '2026-09-11', notes_en: 'Reported day and night ceilings.', notes_fr: 'Plafonds de jour et de nuit.', source_type: 'reported_tariff', active: true, version: 0 },
  { id: 'yaounde-private', city: 'Yaounde', mode: 'private', model: 'distance', basis: 'vehicle', base_min: 350, base_max: 500, per_km_min: 150, per_km_max: 300, source_name: 'Numbeo (crowdsourced)', source_url: 'https://www.numbeo.com/taxi-fare/in/Yaounde-Cameroon', source_date: '2026-06-19', checked_at: '2026-09-11', notes_en: 'Planning range, not a quote.', notes_fr: 'Fourchette indicative, pas un devis.', source_type: 'crowdsourced', active: true, version: 0 },
  { id: 'yaounde-moto', city: 'Yaounde', mode: 'moto', model: 'quote', basis: 'passenger', base_min: 0, base_max: 0, per_km_min: 0, per_km_max: 0, source_name: 'Yango Cameroon', source_url: 'https://yango.com/en_cm/', source_date: null, checked_at: '2026-09-11', notes_en: 'Ask the provider.', notes_fr: 'Demandez au prestataire.', source_type: 'provider', active: true, version: 0 },
];

// A first map visit compiles the lazy MapLibre chunk, which is slow on a cold dev server.
const MAP_READY = { timeout: 30000 };

async function mockApi(page, authenticated = true) {
  const state = { destinations: structuredClone(destinations), photos: [], photoUploads: {}, favorites: [], trips: [], comments: [], feedback: [], messages: [], friends: [], directMessages: {}, audioUploads: {}, calls: [], activity: { reviews: [], comments: [], replies: [] }, profile: { id: 1, name: 'Test Traveler', email: 'traveler@example.test', phone: null, preferences: ['outdoor'] } };
  async function addPhoto(destinationId, upload, caption = '') {
    const photo = { id: Math.max(0, ...state.photos.map(entry => entry.id)) + 1, destination_id: destinationId, user_id: state.profile.id, user_name: state.profile.name, caption, created_at: new Date().toISOString() };
    photo.image_url = `/destinations/${destinationId}/photos/${photo.id}/image`;
    state.photos.push(photo);
    state.photoUploads[photo.image_url] = { contentType: upload.type, body: Buffer.from(await upload.arrayBuffer()) };
    return photo;
  }
  await page.addInitScript(({ authenticated }) => {
    if (!localStorage.getItem('gt_lang')) localStorage.setItem('gt_lang', 'en');
    if (!localStorage.getItem('gt_theme')) localStorage.setItem('gt_theme', 'light');
    if (authenticated) { localStorage.setItem('gt_token', 'test-session'); localStorage.setItem('gt_name', 'Test Traveler'); }
  }, { authenticated });
  await page.route('**/api/**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace('/api', '');
    const method = request.method();
    const contentType = request.headers()['content-type'] || '';
    const body = contentType.startsWith('multipart/form-data') ? Object.fromEntries(await new Response(request.postDataBuffer(), { headers: { 'Content-Type': contentType } }).formData()) : request.postDataJSON();
    state.calls.push({ path, method, body, authorization: request.headers().authorization });
    const respond = (data, status = 200) => route.fulfill({ status, json: data });
    if (path === '/destinations') {
      if (method === 'POST') {
        const place = { ...JSON.parse(body.details), id: 200 + state.destinations.length, active: true, rating: 0, rating_count: 0, image_url: '', added_by: { id: state.profile.id, name: state.profile.name } };
        const photo = await addPhoto(place.id, body.photo);
        place.cover_photo_url = photo.image_url;
        state.destinations.push(place);
        return respond(place, 201);
      }
      return respond(state.destinations);
    }
    if (/^\/destinations\/\d+$/.test(path)) return respond(state.destinations.find(place => place.id === Number(path.split('/')[2])));
    if (/^\/destinations\/\d+\/photos$/.test(path)) {
      const destinationId = Number(path.split('/')[2]);
      if (method === 'POST') return respond(await addPhoto(destinationId, body.photo, body.caption), 201);
      const photos = state.photos.filter(photo => photo.destination_id === destinationId);
      return respond({ photos, count: photos.length, next_before: null });
    }
    if (/^\/destinations\/\d+\/photos\/\d+\/image$/.test(path)) return state.photoUploads[path] ? route.fulfill(state.photoUploads[path]) : respond({ error: 'Photo unavailable.' }, 404);
    if (/^\/destinations\/\d+\/photos\/\d+$/.test(path) && method === 'DELETE') {
      const photoId = Number(path.split('/')[4]);
      state.photos = state.photos.filter(photo => photo.id !== photoId);
      delete state.photoUploads[`${path}/image`];
      return respond({ removed: true });
    }
    if (path === '/fares') return respond(farePolicies);
    if (path === '/auth/google/config') return respond({ client_id: null });
    if (path === '/auth/google') return respond({ id: 1, token: 'test-session', name: state.profile.name }, 201);
    if (path === '/login') return body.password === 'wrong' ? respond({ error: 'invalid credentials' }, 401) : respond({ token: 'test-session', name: state.profile.name });
    if (path === '/register') return respond({ id: 1, name: body.name }, 201);
    if (path === '/profile') { if (method === 'PATCH') Object.assign(state.profile, body); return respond(state.profile); }
    if (path === '/profile/activity') return respond(state.activity);
    if (path === '/friends') {
      if (method === 'POST') {
        const existing = state.friends.find(friend => friend.user_id === body.user_id);
        if (existing) return respond(existing);
        const friend = { id: Math.max(0, ...state.friends.map(friend => friend.id)) + 1, user_id: body.user_id, name: state.comments.find(comment => comment.user_id === body.user_id)?.user_name || 'Camille', status: 'outgoing' };
        state.friends.push(friend);
        return respond(friend, 201);
      }
      return respond(state.friends);
    }
    if (/^\/friends\/\d+$/.test(path)) {
      const friend = state.friends.find(friend => friend.id === Number(path.split('/')[2]));
      if (method === 'DELETE') { state.friends = state.friends.filter(entry => entry !== friend); return respond({ removed: true }); }
      friend.status = 'accepted';
      return respond(friend);
    }
    if (/^\/friends\/\d+\/messages$/.test(path)) {
      const friendshipId = Number(path.split('/')[2]);
      const messages = state.directMessages[friendshipId] ||= [];
      if (method === 'POST') {
        const existing = messages.find(message => message.client_id === body.client_id);
        if (existing) return respond(existing);
        const message = { id: messages.length + 1, user_id: state.profile.id, user_name: state.profile.name, message: body.message || '', client_id: body.client_id, created_at: new Date().toISOString(), deleted: false };
        if (body.audio) {
          message.audio_url = `${path}/${message.id}/audio`;
          message.duration = 1;
          state.audioUploads[message.audio_url] = { contentType: body.audio.type, body: Buffer.from(await body.audio.arrayBuffer()) };
        }
        messages.push(message);
        return respond(message, 201);
      }
      return respond({ messages, has_more: false });
    }
    if (/^\/friends\/\d+\/messages\/\d+\/audio$/.test(path)) return route.fulfill(state.audioUploads[path]);
    if (/^\/friends\/\d+\/messages\/\d+$/.test(path) && method === 'DELETE') {
      const message = state.directMessages[Number(path.split('/')[2])].find(entry => entry.id === Number(path.split('/')[4]));
      Object.assign(message, { deleted: true, message: '', audio_url: null });
      return respond(message);
    }
    if (path === '/chat/messages') {
      if (method === 'POST') {
        const message = { id: Math.max(0, ...state.messages.map(item => item.id)) + 1, user_id: state.profile.id, user_name: state.profile.name, message: body.message, client_id: body.client_id, created_at: new Date().toISOString(), deleted: false, reply_to: state.messages.find(item => item.id === body.reply_to_id) || null };
        state.messages.push(message);
        return respond(message, 201);
      }
      const before = Number(new URL(request.url()).searchParams.get('before_id'));
      return respond({ messages: state.messages.filter(message => !before || message.id < before), has_more: false });
    }
    if (/^\/chat\/messages\/\d+$/.test(path) && method === 'DELETE') {
      const message = state.messages.find(item => item.id === Number(path.split('/').pop()));
      Object.assign(message, { deleted: true, message: '' });
      return respond(message);
    }
    if (path === '/recommendations') return respond(state.destinations);
    if (path === '/favorites') {
      if (method === 'POST') state.favorites.push(body.destination_id);
      return respond(state.destinations.filter(place => state.favorites.includes(place.id)), method === 'POST' ? 201 : 200);
    }
    if (/^\/favorites\/\d+$/.test(path)) { state.favorites = state.favorites.filter(id => id !== Number(path.split('/').pop())); return respond({ removed: true }); }
    if (path === '/itineraries') {
      if (method === 'POST') { const trip = { id: state.trips.length + 1, ...body, visited: false }; state.trips.push(trip); return respond(trip, 201); }
      return respond(state.trips);
    }
    if (/^\/itineraries\/\d+\/visit$/.test(path)) { const trip = state.trips.find(item => item.id === Number(path.split('/')[2])); Object.assign(trip, { visited: true, review: body }); return respond(trip); }
    if (/^\/itineraries\/\d+$/.test(path)) {
      const trip = state.trips.find(item => item.id === Number(path.split('/')[2]));
      if (method === 'DELETE') { state.trips = state.trips.filter(item => item !== trip); return respond({ removed: true }); }
      Object.assign(trip, body);
      return respond(trip);
    }
    if (path.endsWith('/reviews')) return respond(state.trips.filter(trip => trip.visited).map(trip => ({ ...trip.review, itinerary_id: trip.id, reviewer_name: state.profile.name })));
    if (path.endsWith('/comments')) {
      if (method === 'POST') {
        const comment = { id: Date.now(), user_name: state.profile.name, message: body.message, replies: [], created_at: new Date().toISOString() };
        if (body.parent_comment_id) state.comments.find(item => item.id === body.parent_comment_id).replies.push(comment);
        else state.comments.push(comment);
        return respond(comment, 201);
      }
      return respond(state.comments);
    }
    if (path.endsWith('/nearby')) return respond([]);
    if (path.startsWith('/neighborhoods/')) return respond({ blurb: 'A neighborhood in Yaounde.', place_count: 1, nearby_neighborhoods: [] });
    if (path === '/feedback') { if (method === 'POST') state.feedback.push({ id: state.feedback.length + 1, user_name: state.profile.name, ...body }); return respond(state.feedback, method === 'POST' ? 201 : 200); }
    return respond({ error: 'unhandled test route' }, 404);
  });
  return state;
}

test('login gates the app, preserves the requested page, and blocks access after sign-out', async ({ page }, testInfo) => {
  const state = await mockApi(page, false);
  for (const path of ['/', '/map?place=1&directions=1', '/places/1?tab=comments#comment-form', '/feedback', '/planner', '/chat', '/?category=restaurant']) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('heading', { name: 'Good to see you again.' })).toBeVisible();
    await expect(page.locator('.place-card, .map-section')).toHaveCount(0);
    await expect(page.locator('.sidebar, .bottom-nav')).toHaveCount(0);
  }
  expect(state.calls.every(call => call.path === '/auth/google/config')).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('login.png'), fullPage: true });
  const originalViewport = page.viewportSize();
  await page.setViewportSize({ width: 320, height: 780 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('login-320.png'), fullPage: true });
  await page.setViewportSize(originalViewport);
  await page.getByRole('textbox', { name: 'Email address', exact: true }).fill('traveler@example.test');
  await page.getByLabel('Password', { exact: true }).fill('test-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/\?category=restaurant$/);
  await expect(page.locator('.place-card')).toHaveCount(1);
  await page.goto('/profile');
  await page.locator('main').getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('heading', { name: 'Good to see you again.' })).toBeVisible();
});

test('saved sessions must be verified and can recover from verification errors', async ({ page }) => {
  const state = await mockApi(page);
  let unavailable = true;
  await page.route('**/api/profile', route => unavailable ? route.fulfill({ status: 503, json: { error: 'Temporarily unavailable' } }) : route.fallback());
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Unable to verify your session' })).toBeVisible();
  await expect(page.locator('.place-card, .sidebar')).toHaveCount(0);
  expect(state.calls.filter(call => call.path === '/destinations')).toHaveLength(0);
  unavailable = false;
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.locator('.place-card')).toHaveCount(2);
  await page.route('**/api/profile', route => route.fulfill({ status: 401, json: { error: 'Invalid token' } }));
  await page.reload();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.locator('.place-card, .sidebar')).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('gt_token'))).toBeNull();
});

test('travel loading handles slow requests, errors, and retries', async ({ page }, testInfo) => {
  await mockApi(page);
  await page.clock.install();
  let releaseRequest;
  let unavailable = true;
  const pending = new Promise(resolve => { releaseRequest = resolve; });
  await page.route('**/api/destinations', async route => {
    if (!unavailable) return route.fallback();
    await pending;
    return route.fulfill({ status: 503, json: { error: 'Temporarily unavailable' } });
  });
  await page.goto('/');
  const loading = page.getByRole('status', { name: 'Loading places' });
  try {
    await expect(loading).toBeVisible();
    await expect(loading.getByRole('heading', { name: 'Your next stop is loading' })).toBeVisible();
    const traveler = loading.locator('.journey-traveler');
    await expect(traveler).toHaveCSS('animation-name', 'journey-flight');
    const initialTransform = await traveler.evaluate(element => getComputedStyle(element).transform);
    await expect.poll(() => traveler.evaluate(element => getComputedStyle(element).transform)).not.toBe(initialTransform);
    await expect(loading).toHaveCSS('opacity', '1');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('travel-loading.png'), scale: 'css' });
    await page.clock.fastForward(8000);
    await expect(loading.getByRole('heading', { name: 'Taking the scenic route' })).toBeVisible();
    const bottomNav = page.locator('.bottom-nav');
    if (await bottomNav.isVisible()) {
      const loadingBounds = await loading.boundingBox();
      expect(loadingBounds.y + loadingBounds.height).toBeLessThanOrEqual((await bottomNav.boundingBox()).y);
    }
  } finally { releaseRequest(); }
  await expect(page.getByRole('heading', { name: 'A little detour' })).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('Temporarily unavailable');
  await expect(page.locator('.journey-error')).toHaveCSS('opacity', '1');
  await expect(page.locator('.journey-error .journey-traveler > svg')).toHaveCSS('fill', 'none');
  await page.screenshot({ path: testInfo.outputPath('travel-error.png'), fullPage: true, scale: 'css' });
  unavailable = false;
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.locator('.place-card')).toHaveCount(2);
  await expect(loading).toHaveCount(0);
});

test('travel loading respects reduced motion and French dark mode', async ({ page }, testInfo) => {
  await mockApi(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => { localStorage.setItem('gt_lang', 'fr'); localStorage.setItem('gt_theme', 'dark'); });
  let releaseRequest;
  const pending = new Promise(resolve => { releaseRequest = resolve; });
  await page.route('**/api/destinations', async route => { await pending; return route.fallback(); });
  await page.goto('/places/1');
  try {
    await expect(page.locator('.topbar')).toBeVisible();
    const loading = page.locator('.journey-state[role="status"]');
    await expect(loading.getByRole('heading', { name: 'Votre prochaine escale se pr\u00e9pare' })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(loading).toHaveCSS('animation-name', 'none');
    await expect(loading.locator('.journey-traveler')).toHaveCSS('animation-name', 'none');
    await expect(loading.locator('.journey-destination')).toHaveCSS('animation-name', 'none');
    await expect(loading.locator('.journey-dots > span').first()).toHaveCSS('animation-name', 'none');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('travel-loading-reduced-dark-fr.png'), fullPage: true, scale: 'css' });
    await page.setViewportSize({ width: 320, height: 780 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('travel-loading-320.png'), fullPage: true, scale: 'css' });
  } finally { releaseRequest(); }
  await expect(page.getByRole('heading', { name: 'Tassa', exact: true })).toBeVisible();
  await expect(page.locator('.journey-state[role="status"]')).toHaveCount(0);
});

test('travel loading stays compact inside sign-in controls', async ({ page }) => {
  await mockApi(page, false);
  let releaseRequest;
  const pending = new Promise(resolve => { releaseRequest = resolve; });
  await page.route('**/api/auth/google/config', async route => { await pending; return route.fallback(); });
  await page.goto('/login');
  try {
    const loading = page.locator('.google-signin').getByRole('status');
    await expect(loading).toContainText('Loading...');
    await expect(loading.locator('.journey-scene')).toHaveCount(0);
    expect((await loading.boundingBox()).height).toBeLessThanOrEqual(64);
    await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeEnabled();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  } finally { releaseRequest(); }
  await expect(page.getByRole('button', { name: 'Continue with Google', exact: true })).toBeVisible();
});

test('browse, filter, preserve query, and recover from an empty search', async ({ page }) => {
  await mockApi(page);
  await page.goto('/');
  await expect(page.locator('.place-card')).toHaveCount(2);
  await page.getByRole('button', { name: 'Eat & drink', exact: true }).click();
  await expect(page.locator('.place-card')).toHaveCount(1);
  await expect(page).toHaveURL(/category=restaurant/);
  await page.reload();
  await expect(page.locator('.place-title-row')).toContainText('Tassa');
  await page.getByRole('textbox', { name: 'Search places' }).fill('not a real place');
  await expect(page.getByRole('heading', { name: 'No places found' })).toBeVisible();
  await page.getByRole('button', { name: 'Clear', exact: true }).click();
  await expect(page.locator('.place-card')).toHaveCount(1);
  await page.getByRole('button', { name: 'Save Tassa', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Unsave Tassa', exact: true })).toHaveAttribute('aria-pressed', 'true');
});

test('save a place, plan a trip, view the week, and review a visit', async ({ page }) => {
  const state = await mockApi(page);
  await page.goto('/?category=restaurant');
  await page.getByRole('button', { name: 'Save Tassa', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Unsave Tassa', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Plan a visit', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByLabel('Time slot', { exact: true }).fill('09:00-11:00');
  await page.getByRole('combobox', { name: 'Transport', exact: true }).selectOption('taxi');
  await page.getByLabel('Notes', { exact: true }).fill('Bring a camera.');
  await page.getByRole('button', { name: 'Add to my trips' }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  expect(state.trips[0]).toMatchObject({ destination_id: 1, start_date: localDate(), end_date: localDate(), time_slot: '09:00-11:00', transport_mode: 'taxi', notes: 'Bring a camera.' });
  expect(state.calls.find(call => call.path === '/itineraries' && call.method === 'POST').authorization).toBe('Bearer test-session');
  await page.goto('/planner');
  await expect(page.locator('.planner-trip')).toHaveCount(1);
  await page.goto('/itineraries');
  await page.getByRole('button', { name: 'Mark visited & review' }).click();
  await page.getByRole('radio', { name: '5 stars', exact: true }).check();
  await page.getByLabel('Your review', { exact: true }).fill('A lovely afternoon.');
  await page.getByRole('button', { name: 'Save review' }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.getByRole('combobox', { name: 'Trip status' }).selectOption('visited');
  await expect(page.locator('.trip-card')).toContainText('A lovely afternoon.');
  await page.goto('/favorites');
  await expect(page.locator('.place-card')).toHaveCount(1);
  await page.getByRole('button', { name: 'Unsave Tassa', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your collection starts here' })).toBeVisible();
});

test('plans can be edited and cancelled from trips and the weekly planner', async ({ page }) => {
  const state = await mockApi(page);
  state.trips.push({ id: 1, destination_id: 1, start_date: localDate(), end_date: localDate(), time_slot: '09:00-11:00', transport_mode: 'taxi', notes: 'Original', visited: false });
  await page.goto('/itineraries');
  await page.getByRole('button', { name: 'Edit plan', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Notes', exact: true })).toHaveValue('Original');
  await page.getByRole('textbox', { name: 'Notes', exact: true }).fill('Meet at the entrance');
  await page.getByLabel('Time slot', { exact: true }).fill('10:00-12:00');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page.locator('.trip-card')).toContainText('Meet at the entrance');
  await page.goto('/planner');
  await expect(page.locator('.planner-trip')).toContainText('10:00-12:00');
  await page.getByRole('button', { name: 'Cancel plan', exact: true }).click();
  await page.getByRole('button', { name: 'Keep plan', exact: true }).click();
  expect(state.trips).toHaveLength(1);
  await page.getByRole('button', { name: 'Cancel plan', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel plan', exact: true }).click();
  await expect(page.locator('.planner-trip')).toHaveCount(0);
  expect(state.trips).toHaveLength(0);
});

test('administrators manage destinations, fare sources and audit history while ordinary users are blocked', async ({ page }, testInfo) => {
  const state = await mockApi(page);
  const records = destinations.map(place => ({ ...place, active: true, content_version: 0, image_url: `/images/places/${place.id}.jpg`, description_fr: 'Un lieu a decouvrir.' }));
  const policies = structuredClone(farePolicies);
  const audit = [];
  let conflict = false;
  await page.route('**/api/destinations', route => route.fulfill({ json: records.filter(place => place.active) }));
  await page.route('**/api/admin/**', route => {
    const path = new URL(route.request().url()).pathname;
    const body = route.request().postDataJSON();
    if (path.endsWith('/overview')) return route.fulfill({ json: { counts: { destinations: records.length, users: 1, plans: 0, messages: 0 }, recovery: { email: false, phone: false } } });
    if (path.endsWith('/destinations')) {
      if (body) { const record = { ...body, id: 50, content_version: 1 }; records.push(record); return route.fulfill({ status: 201, json: record }); }
      return route.fulfill({ json: records });
    }
    if (/\/destinations\/\d+$/.test(path)) {
      if (conflict) { conflict = false; return route.fulfill({ status: 409, json: { error: 'This record changed. Reload it before saving.' } }); }
      const record = records.find(item => item.id === Number(path.split('/').pop()));
      Object.assign(record, body, { content_version: record.content_version + 1 });
      audit.push({ id: audit.length + 1, event: 'destination_updated', actor: 'Test Traveler', detail: JSON.stringify({ entity: `destination:${record.id}` }), created_at: '2026-09-11T10:00:00Z' });
      return route.fulfill({ json: record });
    }
    if (path.endsWith('/fares')) return route.fulfill({ json: policies });
    if (path.includes('/fares/')) { const policy = policies.find(item => item.id === path.split('/').pop()); Object.assign(policy, body, { version: policy.version + 1 }); return route.fulfill({ json: policy }); }
    if (path.endsWith('/audit')) return route.fulfill({ json: { records: audit, next_before: null } });
    return route.fulfill({ status: 404, json: {} });
  });
  await page.goto('/admin');
  // First hit compiles the lazy admin chunk, which is slow on a cold dev server.
  await expect(page.getByRole('heading', { name: 'Access restricted' })).toBeVisible({ timeout: 15000 });
  state.profile.role = 'admin';
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Administration', exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('admin-destinations.png'), fullPage: true });
  await page.getByRole('button', { name: 'Edit Tassa', exact: true }).click();
  await page.getByRole('textbox', { name: 'Description (French)', exact: true }).fill('Description mise a jour.');
  await page.getByRole('checkbox', { name: 'Published', exact: true }).uncheck();
  await page.screenshot({ path: testInfo.outputPath('admin-editor.png'), fullPage: true });
  conflict = true;
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('This record changed.');
  await page.getByRole('button', { name: 'Discard draft and reload' }).click();
  await page.getByRole('checkbox', { name: 'Published', exact: true }).uncheck();
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page.getByRole('row').filter({ hasText: 'Tassa' })).toContainText('Archived');
  await page.getByRole('button', { name: 'Edit Tassa', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Published', exact: true }).check();
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.getByRole('button', { name: 'Add destination', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: 'Published', exact: true })).not.toBeChecked();
  await page.getByRole('textbox', { name: 'Place name', exact: true }).fill('New garden');
  await page.getByRole('textbox', { name: 'Neighborhood', exact: true }).fill('Bastos');
  await page.getByRole('textbox', { name: 'Address', exact: true }).fill('Bastos, Yaounde');
  await page.getByRole('spinbutton', { name: 'Latitude', exact: true }).fill('3.88');
  await page.getByRole('spinbutton', { name: 'Longitude', exact: true }).fill('11.51');
  await page.getByRole('textbox', { name: 'Description (English)', exact: true }).fill('A quiet garden.');
  await page.getByRole('textbox', { name: 'Description (French)', exact: true }).fill('Un jardin calme.');
  await page.getByRole('textbox', { name: 'Photo URL', exact: true }).fill('/images/places/1.jpg');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page.getByRole('row').filter({ hasText: 'New garden' })).toContainText('Archived');
  expect(records.at(-1)).toMatchObject({ description_fr: 'Un jardin calme.', active: false });
  await page.getByRole('tab', { name: 'Fare policies', exact: true }).click();
  await page.getByRole('button', { name: 'Edit Private car', exact: true }).click();
  await page.getByRole('spinbutton', { name: 'Lower rate per km (FCFA)', exact: true }).fill('200');
  await page.screenshot({ path: testInfo.outputPath('admin-fare-editor.png'), fullPage: true });
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  expect(policies[1].per_km_min).toBe(200);
  await page.getByRole('tab', { name: 'Audit log', exact: true }).click();
  await expect(page.getByRole('cell', { name: /Destination updated/ })).toHaveCount(2);
  await page.screenshot({ path: testInfo.outputPath('administration.png'), fullPage: true });
  await page.setViewportSize({ width: 320, height: 780 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await selectLanguage(page, 'fr');
  expect(await page.locator('.admin-stats dt').evaluateAll(labels => labels.every(label => label.scrollWidth <= label.clientWidth))).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('administration-fr-320.png'), fullPage: true });
});

test('account recovery supports email and phone and clears reset tokens from the URL', async ({ page }) => {
  await mockApi(page, false);
  const requests = [];
  await page.route('**/api/auth/recovery**', route => {
    const body = route.request().postDataJSON();
    if (body) requests.push(body);
    return route.fulfill({ json: route.request().url().endsWith('/config') ? { email: true, phone: true } : { message: 'ok' } });
  });
  await page.goto('/login');
  await page.getByRole('link', { name: 'Forgot password?' }).click();
  await page.getByRole('button', { name: 'Phone number', exact: true }).click();
  await page.getByRole('textbox', { name: 'Phone number', exact: true }).fill('+237699112233');
  await page.getByRole('button', { name: 'Send reset link' }).click();
  await expect(page.getByRole('heading', { name: 'Check your messages' })).toBeVisible();
  expect(requests[0]).toEqual({ channel: 'phone', identifier: '+237699112233' });
  const resetToken = 'a'.repeat(43);
  await page.goto(`/reset-password#token=${resetToken}`);
  await expect(page).toHaveURL(/\/reset-password$/);
  await page.getByLabel('New password', { exact: true }).fill('a-new-long-password');
  await page.getByLabel('Confirm password', { exact: true }).fill('different-password');
  await page.getByRole('button', { name: 'Reset password', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('The passwords do not match.');
  await page.getByLabel('Confirm password', { exact: true }).fill('a-new-long-password');
  await page.getByRole('button', { name: 'Reset password', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Password changed', exact: true })).toBeVisible();
  expect(requests[1]).toEqual({ token: resetToken, password: 'a-new-long-password' });
  await page.getByRole('link', { name: 'Back to sign in' }).click();
  await expect(page).toHaveURL(/\/login$/);
});

test('registration and login support phone identity and error recovery', async ({ page }) => {
  const state = await mockApi(page, false);
  await page.goto('/register');
  await page.getByLabel('Full name', { exact: true }).fill('New Traveler');
  await page.getByRole('button', { name: 'Phone number', exact: true }).click();
  await page.getByRole('textbox', { name: 'Phone number', exact: true }).fill('+237 612345678');
  await page.getByLabel('Password', { exact: true }).fill('test-password');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  expect(state.calls.find(call => call.path === '/register').body).toMatchObject({ name: 'New Traveler', phone: '+237 612345678', preferences: [] });
  await page.getByRole('button', { name: 'Phone number', exact: true }).click();
  await page.getByRole('textbox', { name: 'Phone number', exact: true }).fill('+237 612345678');
  await page.getByLabel('Password', { exact: true }).fill('wrong');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('invalid credentials');
  await page.getByLabel('Password', { exact: true }).fill('test-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Explore Yaounde' })).toBeVisible();
});

test('comments, replies, feedback, and profile changes keep their API contracts', async ({ page }) => {
  const state = await mockApi(page);
  await page.goto('/places/1');
  await page.getByRole('tab', { name: 'Conversation' }).click();
  await page.getByLabel('Join the conversation', { exact: true }).fill('Is the garden open?');
  await page.getByRole('button', { name: 'Post comment' }).click();
  await expect(page.locator('.comment').first()).toContainText('Is the garden open?');
  await page.getByRole('button', { name: 'Reply', exact: true }).click();
  await page.getByLabel('Your reply', { exact: true }).fill('Yes, this afternoon.');
  await page.getByRole('button', { name: 'Send reply' }).click();
  await expect(page.locator('.comment-reply')).toContainText('Yes, this afternoon.');
  await expect(page.locator('.comment-reply').getByRole('button', { name: 'Reply', exact: true })).toHaveCount(0);
  await page.goto('/feedback');
  await page.getByRole('radio', { name: '4 stars', exact: true }).check();
  await page.getByLabel('Your feedback', { exact: true }).fill('The mobile planner is useful.');
  await page.getByRole('button', { name: 'Send feedback' }).click();
  await expect(page.locator('.community-entry')).toContainText('The mobile planner is useful.');
  await page.goto('/profile');
  await page.getByLabel('Full name', { exact: true }).fill('Updated Traveler');
  await page.getByRole('checkbox', { name: 'nature', exact: true }).check();
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('status')).toContainText('Profile updated.');
  expect(state.profile).toMatchObject({ name: 'Updated Traveler', preferences: ['outdoor', 'nature'] });
});

test('API errors are recoverable and expired sessions redirect to login', async ({ page }) => {
  await mockApi(page);
  let failed = true;
  await page.route('**/api/destinations', route => failed ? route.fulfill({ status: 503, json: { error: 'Temporarily unavailable' } }) : route.fallback());
  await page.goto('/');
  await expect(page.getByRole('alert')).toContainText('Temporarily unavailable');
  failed = false;
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.locator('.place-card')).toHaveCount(2);
  await page.route('**/api/profile', route => route.fulfill({ status: 401, json: { error: 'Token expired' } }));
  await page.goto('/profile');
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('heading', { name: 'Good to see you again.' })).toBeVisible();
});

test('recommended order is preserved until the user changes sorting', async ({ page }) => {
  await mockApi(page);
  await page.goto('/recommendations');
  await expect(page.getByRole('combobox', { name: 'Sort places' })).toHaveValue('recommended');
  await expect(page.locator('.place-title-row h2').first()).toHaveText('Tassa');
  await page.getByRole('combobox', { name: 'Sort places' }).selectOption('rating');
  await expect(page.locator('.place-title-row h2').first()).toHaveText('Mont Febe');
});

test('map markers, live location, directions, and booking work together', async ({ page, context }, testInfo) => {
  await mockApi(page);
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: 3.88, longitude: 11.51, accuracy: 12 });
  await page.route('https://basemaps.cartocdn.com/gl/**/style.json', route => route.fulfill({ json: { version: 8, sources: {}, layers: [{ id: 'test-background', type: 'background', paint: { 'background-color': route.request().url().includes('dark-matter') ? '#202625' : '#dfece5' } }] } }));
  await page.route('https://router.project-osrm.org/**', route => route.fulfill({ json: { routes: [{ distance: 1200, duration: 300, geometry: { coordinates: [[11.51, 3.88], [11.512, 3.885]] } }] } }));
  await page.goto('/map');
  await expect(page.locator('.map-section')).toHaveAttribute('data-map-ready', 'true', MAP_READY);
  await expect(page.locator('.place-marker')).toHaveCount(2);
  await page.getByRole('button', { name: 'Locate me', exact: true }).click();
  await expect(page.locator('.location-summary')).toContainText('Latitude 3.88000, longitude 11.51000');
  await expect(page.locator('.location-summary')).toContainText('Accuracy: about 12 m');
  await expect(page.getByRole('img', { name: 'Your location', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Fit all places', exact: true }).click();
  await page.getByRole('button', { name: 'Locate me', exact: true }).click();
  await expect(page.getByRole('img', { name: 'Your location', exact: true })).toBeVisible();
  await expect.poll(() => page.locator('.user-location-marker').evaluate(marker => {
    const position = marker.getBoundingClientRect();
    const canvas = marker.closest('.map-canvas').getBoundingClientRect();
    return Math.abs(position.left + position.width / 2 - canvas.left - canvas.width / 2) < 3 && Math.abs(position.top + position.height / 2 - canvas.top - canvas.height / 2) < 3;
  })).toBe(true);
  await page.getByRole('button', { name: 'Show Tassa on map', exact: true }).click();
  await expect(page.locator('.map-popup')).toContainText('Tassa');
  await page.getByRole('button', { name: 'Directions', exact: true }).click();
  await expect(page.locator('.route-summary')).toContainText('1.2 km / about 5 min driving');
  await expect(page.getByRole('status', { name: 'Estimated fare range', exact: true })).toHaveText('350 - 400 FCFA');
  await expect(page.locator('.route-summary')).toContainText('Per passenger');
  await page.getByText('Custom kilometer calculation', { exact: true }).click();
  await page.getByRole('spinbutton', { name: 'Rate per km (FCFA)', exact: true }).fill('250');
  await page.getByRole('spinbutton', { name: 'Base fare (FCFA)', exact: true }).fill('300');
  await expect(page.getByRole('status', { name: 'Custom estimate', exact: true })).toHaveText('600 FCFA');
  await page.locator('.route-summary').getByRole('combobox', { name: 'Transport', exact: true }).selectOption('moto');
  await expect(page.getByRole('status', { name: 'Estimated fare range', exact: true })).toHaveText('Quote required');
  await page.locator('.route-summary').getByRole('combobox', { name: 'Transport', exact: true }).selectOption('private');
  await expect(page.getByRole('status', { name: 'Estimated fare range', exact: true })).toHaveText('530 - 860 FCFA');
  await expect(page.locator('.route-summary')).toContainText('Per vehicle');
  await page.getByRole('spinbutton', { name: 'Rate per km (FCFA)', exact: true }).fill('');
  await expect(page.getByRole('status', { name: 'Custom estimate', exact: true })).toHaveText('Unavailable');
  await page.getByRole('spinbutton', { name: 'Rate per km (FCFA)', exact: true }).fill('220');
  await expect(page.locator('.route-summary').getByRole('link', { name: 'Numbeo (crowdsourced)' })).toHaveAttribute('href', /numbeo/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('map-estimate.png'), fullPage: true });
  await selectLanguage(page, 'fr');
  await expect(page.getByRole('button', { name: 'Me localiser', exact: true })).toBeVisible();
  await expect(page.getByRole('status', { name: 'Fourchette estim\u00e9e', exact: true })).toHaveText('530 - 860 FCFA');
  const originalViewport = page.viewportSize();
  await page.setViewportSize({ width: 320, height: 780 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await expect(page.locator('.map-section')).toHaveAttribute('data-map-ready', 'true');
  await expect.poll(() => page.locator('.place-map-popup').evaluate(popup => {
    const bounds = popup.getBoundingClientRect();
    const canvas = popup.closest('.map-canvas').getBoundingClientRect();
    return bounds.left >= canvas.left && bounds.right <= canvas.right && bounds.top >= canvas.top && bounds.bottom <= canvas.bottom;
  })).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('map-estimate-fr-320.png'), fullPage: true });
  await page.setViewportSize(originalViewport);
  await selectLanguage(page, 'en');
  await expect(page.getByRole('button', { name: 'Stop live location' })).toBeEnabled();
  await expect(page.getByRole('img', { name: 'Your location', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Switch to dark mode' }).click();
  await expect(page.locator('.map-section')).toHaveAttribute('data-map-theme', 'dark');
  await expect(page.locator('.map-section')).toHaveAttribute('data-map-ready', 'true');
  await expect(page.locator('.route-summary')).toContainText('1.2 km');
  await page.getByRole('button', { name: 'Plan a visit', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Stop live location' }).click();
  await expect(page.getByRole('button', { name: 'Stop live location' })).toBeDisabled();
  await expect(page.locator('.location-summary')).toContainText('Last known location');
  await page.getByRole('button', { name: 'Clear route' }).click();
  await expect(page.locator('.route-summary')).toHaveCount(0);
});

test('manual origins route from landmarks and coordinates without asking for GPS', async ({ page }) => {
  await mockApi(page);
  await page.addInitScript(() => { window.locationRequests = 0; Object.defineProperty(navigator, 'geolocation', { value: { watchPosition: () => { window.locationRequests += 1; return 1; }, clearWatch: () => {} } }); });
  await page.route('https://basemaps.cartocdn.com/gl/**/style.json', route => route.fulfill({ json: { version: 8, sources: {}, layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#dfece5' } }] } }));
  const routes = [];
  await page.route('https://router.project-osrm.org/**', route => { routes.push(route.request().url()); return route.fulfill({ json: { routes: [{ distance: 1200, duration: 300, geometry: { coordinates: [[11.49, 3.91], [11.512, 3.885]] } }] } }); });
  await page.goto('/map?place=1');
  await expect(page.locator('.map-section')).toHaveAttribute('data-map-ready', 'true', MAP_READY);
  await page.getByRole('button', { name: 'Manual origin', exact: true }).click();
  await page.getByRole('button', { name: 'Estimate trip', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Choose a manual starting point first.');
  expect(routes).toHaveLength(0);
  await page.getByRole('combobox', { name: 'Starting landmark', exact: true }).selectOption('44');
  await page.getByRole('button', { name: 'Estimate trip', exact: true }).click();
  await expect(page.locator('.route-summary')).toBeVisible();
  expect(routes[0]).toContain('/11.49,3.91;11.512,3.885?');
  await expect(page.locator('.location-summary')).toContainText('Manual starting point');
  await expect(page.locator('.location-summary')).not.toContainText('Accuracy');
  await page.getByRole('spinbutton', { name: 'Latitude', exact: true }).fill('3.88');
  await page.getByRole('spinbutton', { name: 'Longitude', exact: true }).fill('11.51');
  await page.getByRole('button', { name: 'Set origin', exact: true }).click();
  await expect.poll(() => routes.at(-1)).toContain('/11.51,3.88;11.512,3.885?');
  expect(await page.evaluate(() => window.locationRequests)).toBe(0);
  await page.getByRole('button', { name: 'Choose on map', exact: true }).click();
  await page.locator('.maplibregl-canvas').click({ position: { x: 75, y: 95 } });
  await expect(page.getByRole('button', { name: 'Choose on map', exact: true })).toHaveAttribute('aria-pressed', 'false');
  expect(await page.evaluate(() => window.locationRequests)).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

test('trip estimates retry failed routes and never quote invalid route data', async ({ page, context }) => {
  await mockApi(page);
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: 3.88, longitude: 11.51 });
  await page.route('https://basemaps.cartocdn.com/gl/**/style.json', route => route.fulfill({ json: { version: 8, sources: {}, layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#dfece5' } }] } }));
  let routeState = 'unavailable';
  await page.route('https://router.project-osrm.org/**', route => {
    expect(route.request().url()).toContain('/11.51,3.88;11.512,3.885?');
    return routeState === 'unavailable' ? route.fulfill({ status: 503, json: {} }) : route.fulfill({ json: { routes: [{ distance: routeState === 'invalid' ? -100 : 1200, duration: 300, geometry: { coordinates: [[11.51, 3.88], [11.512, 3.885]] } }] } });
  });
  await page.goto('/map?place=1');
  await expect(page.locator('.map-section')).toHaveAttribute('data-map-ready', 'true', MAP_READY);
  await page.getByRole('button', { name: 'Estimate trip', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Directions are unavailable right now.');
  await expect(page.locator('.route-summary')).toHaveCount(0);
  routeState = 'invalid';
  await page.getByRole('button', { name: 'Retry directions', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('No driving route found');
  await expect(page.locator('.route-summary')).toHaveCount(0);
  routeState = 'valid';
  await page.getByRole('button', { name: 'Retry directions', exact: true }).click();
  await expect(page.getByRole('status', { name: 'Estimated fare range', exact: true })).toHaveText('350 - 400 FCFA');
});

test('layout, dialogs, preferences, and old links work on both device sizes', async ({ page }, testInfo) => {
  await mockApi(page);
  await page.goto('/index.html');
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator('.place-card')).toHaveCount(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  const originalViewport = page.viewportSize();
  await page.setViewportSize({ width: 320, height: 780 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.setViewportSize(originalViewport);
  await page.screenshot({ path: testInfo.outputPath('explore.png'), fullPage: true });
  if (testInfo.project.name === 'phone') {
    await expect(page.getByRole('navigation', { name: 'Mobile navigation' })).toBeVisible();
    await page.getByRole('button', { name: 'Open navigation' }).click();
    await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Explore', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Open navigation' })).toHaveAttribute('aria-expanded', 'false');
    await page.getByRole('button', { name: 'Open navigation' }).click();
    await page.setViewportSize({ width: 900, height: 700 });
    await expect(page.locator('.main-shell')).not.toHaveAttribute('inert');
    await page.setViewportSize(originalViewport);
    await page.getByRole('button', { name: 'Open navigation' }).click();
  }
  await page.getByRole('combobox', { name: 'Language', exact: true }).selectOption('fr');
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
  await expect(page.getByRole('navigation', { name: 'Navigation principale' }).getByText('Explorer', { exact: true })).toBeVisible();
  await page.getByRole('combobox', { name: 'Langue', exact: true }).selectOption('en');
  if (testInfo.project.name === 'phone') await page.locator('.mobile-menu-close').click();
  await page.getByRole('button', { name: 'Switch to dark mode' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('button', { name: 'Switch to light mode' }).click();
  await page.getByRole('button', { name: 'Plan a visit', exact: true }).first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveAttribute('data-settled', 'true');
  expect(await page.getByRole('dialog').evaluate(dialog => { const bounds = dialog.getBoundingClientRect(); return bounds.left >= 0 && bounds.right <= innerWidth && bounds.top >= 0 && bounds.bottom <= innerHeight; })).toBe(true);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.goto('/favorites.html');
  await expect(page).toHaveURL(/\/favorites$/);
});

test('sheet gestures track the drag, spring back from a short pull, and dismiss on a flick', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'phone', 'Sheets are presented as draggable panels on the phone layout.');
  await mockApi(page);
  await page.goto('/?category=restaurant');
  await page.getByRole('button', { name: 'Plan a visit', exact: true }).first().click();
  const sheet = page.getByRole('dialog');
  await expect(sheet).toHaveAttribute('data-settled', 'true');
  await page.screenshot({ path: testInfo.outputPath('sheet-presented.png') });
  const grip = await page.locator('.sheet-grabber').boundingBox();
  const centre = { x: grip.x + grip.width / 2, y: grip.y + grip.height / 2 };
  const offset = () => sheet.evaluate(dialog => new DOMMatrixReadOnly(getComputedStyle(dialog).transform).m42);

  await page.mouse.move(centre.x, centre.y);
  await page.mouse.down();
  for (const distance of [10, 20, 30]) { await page.mouse.move(centre.x, centre.y + distance); await page.waitForTimeout(50); }
  expect(await offset()).toBeGreaterThan(15);
  await page.screenshot({ path: testInfo.outputPath('sheet-dragged.png') });
  await page.mouse.up();
  await expect.poll(offset).toBeLessThan(1);
  await expect(sheet).toBeVisible();

  await page.mouse.move(centre.x, centre.y);
  await page.mouse.down();
  for (const distance of [60, 120, 180, 240, 300]) await page.mouse.move(centre.x, centre.y + distance);
  await page.mouse.up();
  await expect(sheet).not.toBeVisible();
});

test('theme persists and system mode follows device changes', async ({ page }) => {
  await mockApi(page);
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');
  await page.getByRole('button', { name: 'Switch to dark mode' }).click();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.getByRole('button', { name: 'Switch to dark mode' })).toHaveAttribute('aria-pressed', 'true');
  if (await page.getByRole('navigation', { name: 'Mobile navigation' }).isVisible()) {
    const colors = await page.evaluate(() => ({ header: getComputedStyle(document.querySelector('.topbar')).backgroundColor, navigation: getComputedStyle(document.querySelector('.bottom-nav')).backgroundColor }));
    expect(colors.navigation).toBe(colors.header);
  }
  await page.getByRole('button', { name: 'Use system theme' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('button', { name: 'Switch to light mode' }).click();
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});

test('map location denial is recoverable without losing place access', async ({ page }) => {
  await mockApi(page);
  await page.route('https://basemaps.cartocdn.com/gl/**/style.json', route => route.fulfill({ json: { version: 8, sources: {}, layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#dfece5' } }] } }));
  await page.addInitScript(() => {
    let attempts = 0;
    window.clearedLocationWatches = [];
    Object.defineProperty(navigator, 'geolocation', { value: { watchPosition: (success, failure) => {
      attempts += 1;
      if (attempts === 1) failure({ code: 1 });
      else success({ coords: { longitude: 11.51, latitude: 3.88, accuracy: 25 } });
      return attempts;
    }, clearWatch: watch => window.clearedLocationWatches.push(watch) } });
  });
  await page.goto('/map');
  await expect(page.locator('.map-section')).toHaveAttribute('data-map-ready', 'true', MAP_READY);
  await page.getByRole('button', { name: 'Locate me', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Location access was denied');
  await expect(page.getByRole('img', { name: 'Your location', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Stop live location' })).toBeDisabled();
  await page.getByRole('combobox', { name: 'Find a place on the map' }).selectOption('1');
  await expect(page.locator('.map-popup')).toContainText('Tassa');
  await page.getByRole('button', { name: 'Locate me', exact: true }).click();
  await expect(page.locator('.location-summary')).toContainText('Accuracy: about 25 m');
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.getByRole('button', { name: 'Stop live location' }).click();
  await expect(page.locator('.location-summary')).toContainText('Last known location');
  expect(await page.evaluate(() => window.clearedLocationWatches)).toEqual([1, 2]);
});

async function selectLanguage(page, value) {
  await expect(page.locator('.topbar')).toBeVisible();
  const menu = page.getByRole('button', { name: /^(Open navigation|Ouvrir le menu)$/ });
  if (await menu.isVisible()) await menu.click();
  await page.locator('.language-control select').selectOption(value);
  const close = page.locator('.mobile-menu-close');
  if (await close.isVisible()) await close.click();
}

test('French and English switch all screen labels, content, dates, and drafts', async ({ page }) => {
  await mockApi(page);
  await page.goto('/?category=restaurant');
  await selectLanguage(page, 'fr');
  await expect(page.getByRole('heading', { name: 'Explorer Yaound\u00e9' })).toBeVisible();
  await expect(page.locator('.place-description')).toContainText('Caf\u00e9-restaurant lumineux');
  await expect(page.locator('.place-card .rating')).toContainText('4,3');
  await expect(page.getByRole('textbox', { name: 'Rechercher des lieux' })).toHaveAttribute('placeholder', 'O\u00f9 voulez-vous aller ?');
  await expect(page.getByRole('button', { name: 'Partager Tassa' })).toBeVisible();
  await page.getByRole('link', { name: 'Commenter Tassa' }).click();
  await expect(page.getByRole('tab', { name: 'Conversation' })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('textbox', { name: 'Rejoindre la conversation' }).fill('Mon message original');
  await selectLanguage(page, 'en');
  await expect(page.getByRole('textbox', { name: 'Join the conversation' })).toHaveValue('Mon message original');
  await expect(page.getByRole('button', { name: 'Post comment' })).toBeVisible();
  await selectLanguage(page, 'fr');
  await page.goto('/profile');
  await expect(page.getByRole('heading', { name: 'Un compte qui vous ressemble' })).toBeVisible();
  await expect(page.getByRole('button', { name: /R\u00e9ponses re\u00e7ues/ })).toBeVisible();
  await page.goto('/planner');
  await expect(page.getByRole('heading', { name: 'Une semaine bien remplie' })).toBeVisible();
  await expect(page.locator('.week-day').first()).toContainText('lun.');
  await page.goto('/feedback');
  await expect(page.getByRole('heading', { name: 'Nous vous \u00e9coutons' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Envoyer mon avis' })).toBeVisible();
});

test('destination share, map, comment, and directions shortcuts target the exact place', async ({ page, context }, testInfo) => {
  await mockApi(page);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'share', { value: undefined });
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: async text => { window.copiedShareLink = text; } } });
  });
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: 3.88, longitude: 11.51 });
  await page.route('https://basemaps.cartocdn.com/gl/**/style.json', route => route.fulfill({ json: { version: 8, sources: {}, layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#dfece5' } }] } }));
  await page.route('https://router.project-osrm.org/**', route => route.fulfill({ json: { routes: [{ distance: 1200, duration: 300, geometry: { coordinates: [[11.51, 3.88], [11.512, 3.885]] } }] } }));
  await page.goto('/?category=restaurant');
  await expect(page.getByRole('button', { name: 'Share Tassa', exact: true })).toHaveText('Share');
  await page.getByRole('button', { name: 'Share Tassa', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('dialog').getByRole('img', { name: 'Tassa', exact: true })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Share link' })).toHaveValue(/\/places\/1$/);
  await page.screenshot({ path: testInfo.outputPath('share-place.png'), fullPage: true });
  await page.getByRole('button', { name: 'Copy link' }).click();
  await expect(page.getByRole('button', { name: 'Link copied.' })).toBeVisible();
  expect(await page.evaluate(() => window.copiedShareLink)).toMatch(/\/places\/1$/);
  await page.keyboard.press('Escape');
  await page.getByRole('link', { name: 'Show Tassa on map', exact: true }).click();
  await expect(page).toHaveURL(/\/map\?place=1$/);
  await expect(page.locator('.map-popup')).toContainText('Tassa', { timeout: 15000 });
  await expect(page.locator('.map-popup').getByRole('button', { name: 'Share Tassa', exact: true })).toHaveText('Share');
  await page.screenshot({ path: testInfo.outputPath('share-map-popup.png'), fullPage: true });
  await page.locator('.map-popup').getByRole('button', { name: 'Share Tassa', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Share link' })).toHaveValue(/\/places\/1$/);
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.goto('/?category=restaurant');
  await page.getByRole('link', { name: 'Directions to Tassa', exact: true }).click();
  await expect(page.locator('.route-summary')).toContainText('1.2 km', { timeout: 15000 });
});

test('a shared place link opens the exact place after recipient sign-in', async ({ page }) => {
  await mockApi(page, false);
  await page.goto('/places/44');
  await expect(page).toHaveURL(/\/login$/);
  await page.getByRole('textbox', { name: 'Email address', exact: true }).fill('traveler@example.test');
  await page.getByLabel('Password', { exact: true }).fill('test-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/places\/44$/);
  await expect(page.getByRole('heading', { name: 'Mont Febe', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Share Mont Febe', exact: true }).first()).toHaveText('Share');
});

test('native place sharing handles completion, cancellation and copy-link fallback', async ({ page }, testInfo) => {
  await mockApi(page);
  await page.addInitScript(() => {
    window.shareOutcome = 'success';
    Object.defineProperty(navigator, 'share', { configurable: true, value: async data => {
      window.nativeSharedPlace = data;
      if (window.shareOutcome === 'cancel') throw new DOMException('Cancelled', 'AbortError');
      if (window.shareOutcome === 'failure') throw new DOMException('Unavailable', 'NotAllowedError');
    } });
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => { throw new DOMException('Denied', 'NotAllowedError'); } } });
    document.execCommand = () => false;
  });
  await page.goto('/places/1');
  const shareButton = page.locator('.detail-actions').getByRole('button', { name: 'Share Tassa', exact: true });
  await shareButton.click();
  expect(await page.evaluate(() => window.nativeSharedPlace)).toEqual({ title: 'Tassa', text: 'Visit Tassa in Bastos.', url: new URL('/places/1', page.url()).href });
  await expect(shareButton).toBeEnabled();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.evaluate(() => { window.shareOutcome = 'cancel'; });
  await shareButton.click();
  await expect(shareButton).toBeEnabled();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.evaluate(() => { window.shareOutcome = 'failure'; });
  await shareButton.click();
  await expect(page.getByRole('dialog', { name: 'Share this place' })).toBeVisible();
  await page.getByRole('button', { name: 'Copy link', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('Could not copy the link.');
  const link = page.getByRole('textbox', { name: 'Share link', exact: true });
  await expect(link).toHaveValue(/\/places\/1$/);
  expect(await link.evaluate(input => input.selectionStart === 0 && input.selectionEnd === input.value.length)).toBe(true);
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await selectLanguage(page, 'fr');
  await page.setViewportSize({ width: 320, height: 780 });
  await page.locator('.detail-actions').getByRole('button', { name: 'Partager Tassa', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('share-place-fr-320.png'), fullPage: true });
});

test('Google sign-up uses configured identity service and preserves return destination', async ({ page }) => {
  const state = await mockApi(page, false);
  await page.route('**/api/auth/google/config', route => route.fulfill({ json: { client_id: 'test-client.apps.googleusercontent.com', nonce: 'test-nonce' } }));
  await page.route('https://accounts.google.com/gsi/client', route => route.fulfill({ contentType: 'application/javascript', body: `window.google = { accounts: { id: { initialize(options) { window.googleTestOptions = options; }, renderButton(container, options) { const button = document.createElement('button'); button.textContent = options.locale === 'fr' ? 'Continuer avec Google' : 'Continue with Google'; button.onclick = () => window.googleTestOptions.callback({ credential: 'test-google-credential' }); container.appendChild(button); } } } };` }));
  await page.goto('/register');
  await page.getByRole('button', { name: 'Continue with Google', exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  expect(state.calls.find(call => call.path === '/auth/google').body).toEqual({ credential: 'test-google-credential' });
  expect(await page.evaluate(() => window.googleTestOptions.nonce)).toBe('test-nonce');
  expect(await page.evaluate(() => window.googleTestOptions.use_fedcm_for_button)).toBe(true);
  expect(await page.evaluate(() => window.googleTestOptions.auto_select)).toBe(false);
});

test('Google login retries verification and returns to the requested friend conversation', async ({ page }) => {
  const state = await mockApi(page, false);
  state.friends.push({ id: 1, user_id: 2, name: 'Camille', status: 'accepted' });
  let attempts = 0;
  let nonceVersion = 0;
  await page.route('**/api/auth/google/config', route => route.fulfill({ json: { client_id: 'test-client.apps.googleusercontent.com', nonce: `test-nonce-${++nonceVersion}` } }));
  await page.route('**/api/auth/google', route => {
    attempts += 1;
    return attempts === 1 ? route.fulfill({ status: 400, json: { error: 'Google sign-in verification failed. Please try again.' } }) : route.fulfill({ json: { token: 'test-session', name: state.profile.name, id: state.profile.id } });
  });
  await page.route('https://accounts.google.com/gsi/client', route => route.fulfill({ contentType: 'application/javascript', body: `window.google = { accounts: { id: { initialize(options) { window.googleTestOptions = options; }, renderButton(container) { const button = document.createElement('button'); button.textContent = 'Continue with Google'; button.onclick = () => { window.googleTestOptions.callback({ credential: 'test-google-credential' }); window.googleTestOptions.callback({ credential: 'duplicate-google-credential' }); }; container.appendChild(button); } } } };` }));
  await page.goto('/chat?view=friends&friend=1');
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('button', { name: 'Continue with Google', exact: true })).toBeEnabled();
  const initialNonce = await page.evaluate(() => window.googleTestOptions.nonce);
  await page.getByRole('button', { name: 'Continue with Google', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Google sign-in verification failed.');
  await expect.poll(() => page.evaluate(() => window.googleTestOptions.nonce)).not.toBe(initialNonce);
  expect(attempts).toBe(1);
  await page.getByRole('button', { name: 'Continue with Google', exact: true }).click();
  await expect(page).toHaveURL(/\/chat\?view=friends&friend=1$/);
  await expect(page.getByRole('heading', { name: 'Camille', exact: true })).toBeVisible();
  expect(attempts).toBe(2);
});

test('community chat sends, replies, and deletes only the current user message', async ({ page }, testInfo) => {
  const state = await mockApi(page);
  state.messages.push({ id: 1, user_id: 2, user_name: 'Camille', message: 'Bonjour Yaounde', created_at: '2026-09-09T10:00:00+00:00', deleted: false, reply_to: null });
  await page.goto('/chat');
  await expect(page.locator('.chat-message')).toContainText('Camille');
  await expect(page.getByRole('button', { name: 'Delete message', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Reply', exact: true }).click();
  await page.getByRole('textbox', { name: 'Message the community' }).fill('Welcome to the city.');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.locator('.own-message')).toContainText('Welcome to the city.');
  await expect(page.locator('.own-message blockquote')).toContainText('Camille');
  expect(state.calls.find(call => call.path === '/chat/messages' && call.method === 'POST').body.reply_to_id).toBe(1);
  await page.getByRole('button', { name: 'Delete message', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete message', exact: true }).click();
  await expect(page.locator('.own-message')).toContainText('Message deleted.');
  await selectLanguage(page, 'fr');
  await expect(page.getByRole('heading', { name: 'Messages', exact: true })).toBeVisible();
  await expect(page.getByRole('textbox', { name: '\u00c9crire \u00e0 la communaut\u00e9' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  const composerFits = await page.evaluate(() => {
    const navigation = document.querySelector('.bottom-nav');
    const bottom = getComputedStyle(navigation).display === 'none' ? innerHeight : navigation.getBoundingClientRect().top;
    return document.querySelector('.chat-compose-actions button').getBoundingClientRect().bottom <= bottom;
  });
  expect(composerFits).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('chat-french.png'), fullPage: true });
});

test('friends from place comments support requests, private text and voice notes', async ({ page, context }, testInfo) => {
  const state = await mockApi(page);
  state.comments.push({ id: 1, user_id: 2, user_name: 'Camille', message: 'Lovely garden.', created_at: '2026-09-19T10:00:00Z', replies: [] });
  state.friends.push({ id: 1, user_id: 3, name: 'Nadia', status: 'incoming' });
  await context.grantPermissions(['microphone']);
  await page.addInitScript(() => {
    const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    window.testMicrophoneTracks = [];
    navigator.mediaDevices.getUserMedia = async constraints => {
      const stream = await original(constraints);
      window.testMicrophoneTracks.push(...stream.getTracks());
      return stream;
    };
  });
  await page.goto('/places/1?tab=comments');
  await page.getByRole('button', { name: 'Add Camille as a friend', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Request sent to Camille' })).toBeDisabled();
  await page.goto('/chat?view=friends');
  await page.getByRole('button', { name: 'Accept Nadia', exact: true }).click();
  await page.locator('.friend-row').filter({ hasText: 'Nadia' }).click();
  await expect(page.getByRole('region', { name: 'Private conversation' })).toBeVisible();
  await page.getByRole('textbox', { name: 'Message your friend', exact: true }).fill('Meet at Tassa?');
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
  await expect(page.locator('.chat-message')).toContainText('Meet at Tassa?');
  await page.getByRole('button', { name: 'Record voice note', exact: true }).click();
  await expect(page.locator('.recording-controls')).toContainText('0:01');
  await page.getByRole('button', { name: 'Stop recording', exact: true }).click();
  await expect(page.getByLabel('Voice note preview')).toHaveAttribute('src', /^blob:/);
  await page.screenshot({ path: testInfo.outputPath('voice-preview.png'), fullPage: true });
  await page.getByRole('button', { name: 'Send voice note', exact: true }).click();
  await page.getByRole('button', { name: /Play voice note/ }).click();
  await expect(page.getByLabel('Voice note', { exact: true })).toHaveAttribute('src', /^blob:/);
  const upload = state.calls.find(call => call.body?.audio);
  expect(upload.authorization).toBe('Bearer test-session');
  expect(upload.body.audio.size).toBeGreaterThan(0);
  expect(state.messages).toHaveLength(0);
  expect(state.directMessages[1]).toHaveLength(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  const chatLayout = await page.evaluate(() => {
    const navigation = document.querySelector('.bottom-nav');
    return {
      feedHeight: document.querySelector('.chat-feed').clientHeight,
      sendBottom: document.querySelector('.chat-compose-actions button').getBoundingClientRect().bottom,
      availableBottom: navigation?.getClientRects().length ? navigation.getBoundingClientRect().top : window.innerHeight,
    };
  });
  expect(chatLayout.feedHeight).toBeGreaterThanOrEqual(120);
  expect(chatLayout.sendBottom).toBeLessThanOrEqual(chatLayout.availableBottom);
  await page.screenshot({ path: testInfo.outputPath('private-chat.png'), fullPage: true });
  await page.getByRole('button', { name: 'Record voice note', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Stop recording', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Back to friends', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.testMicrophoneTracks.every(track => track.readyState === 'ended'))).toBe(true);
  await page.locator('.friend-row').filter({ hasText: 'Nadia' }).click();
  await page.evaluate(() => { navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('Denied', 'NotAllowedError'); }; });
  await page.getByRole('button', { name: 'Record voice note', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Microphone permission was denied.');
});

test('community places select map locations and show attributed user photo galleries', async ({ page }, testInfo) => {
  const state = await mockApi(page);
  const photoFile = { name: 'terrace.jpg', mimeType: 'image/jpeg', buffer: readFileSync(new URL('../../static/images/places/99.jpg', import.meta.url)) };
  await page.route('https://basemaps.cartocdn.com/gl/**/style.json', route => route.fulfill({ json: { version: 8, sources: {}, layers: [{ id: 'test-background', type: 'background', paint: { 'background-color': '#dfece5' } }] } }));
  await page.goto('/');
  await page.getByRole('link', { name: 'Add a place', exact: true }).click();
  await page.getByRole('textbox', { name: 'Place name', exact: true }).fill('Community garden');
  await page.getByRole('combobox', { name: 'Category', exact: true }).selectOption('nature');
  await page.getByLabel('Neighborhood', { exact: true }).fill('Bastos');
  await page.getByRole('textbox', { name: 'Address', exact: true }).fill('Bastos, Yaounde');
  await page.getByRole('textbox', { name: 'Description', exact: true }).fill('A garden contributed by a traveler.');
  await expect(page.locator('.place-location-picker')).toHaveAttribute('data-map-ready', 'true', MAP_READY);
  await expect(page.getByRole('spinbutton', { name: 'Latitude', exact: true })).toHaveValue('');
  const canvas = page.locator('.location-picker-canvas canvas');
  const bounds = await canvas.boundingBox();
  await canvas.click({ position: { x: bounds.width * 0.4, y: bounds.height * 0.5 } });
  await expect(page.getByRole('spinbutton', { name: 'Latitude', exact: true })).not.toHaveValue('');
  const originalLatitude = await page.getByRole('spinbutton', { name: 'Latitude', exact: true }).inputValue();
  const marker = await page.getByRole('img', { name: 'Selected place location' }).boundingBox();
  await page.mouse.move(marker.x + marker.width / 2, marker.y + marker.height / 2);
  await page.mouse.down();
  await page.mouse.move(marker.x + marker.width / 2 + 25, marker.y + marker.height / 2 + 35, { steps: 8 });
  await page.mouse.up();
  await expect(page.getByRole('spinbutton', { name: 'Latitude', exact: true })).not.toHaveValue(originalLatitude);
  const selectedCoordinates = { lat: Number(await page.getByRole('spinbutton', { name: 'Latitude', exact: true }).inputValue()), lng: Number(await page.getByRole('spinbutton', { name: 'Longitude', exact: true }).inputValue()) };
  const pixels = await canvas.evaluate(element => {
    const context = element.getContext('webgl2');
    const pixel = new Uint8Array(4);
    context.readPixels(Math.floor(element.width / 2), Math.floor(element.height / 2), 1, 1, context.RGBA, context.UNSIGNED_BYTE, pixel);
    return [...pixel];
  });
  expect(pixels[3]).toBe(255);
  expect(pixels.slice(0, 3).some(channel => channel > 0)).toBe(true);
  await page.getByLabel('Place photo', { exact: true }).setInputFiles(photoFile);
  await expect(page.getByRole('img', { name: 'Selected photo preview' })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('add-place.png'), fullPage: true });
  await page.getByRole('button', { name: 'Add place', exact: true }).click();
  await expect(page).toHaveURL(/\/places\/202$/);
  await expect(page.locator('.detail-heading')).toContainText('Added by Test Traveler');
  await expect.poll(() => page.locator('.detail-photo > img').evaluate(image => image.complete && image.naturalWidth > 0)).toBe(true);
  const submission = state.calls.find(call => call.path === '/destinations' && call.method === 'POST');
  expect(submission.authorization).toBe('Bearer test-session');
  expect(JSON.parse(submission.body.details)).toMatchObject(selectedCoordinates);
  await page.getByRole('button', { name: 'More photos', exact: true }).click();
  await expect(page.locator('.community-photo')).toContainText('Photo by Test Traveler');
  await page.screenshot({ path: testInfo.outputPath('community-place.png'), fullPage: true });
  await page.goto('/places/1');
  await page.getByRole('button', { name: 'More photos', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'No community photos yet.' })).toBeVisible();
  await page.getByLabel('Place photo', { exact: true }).setInputFiles(photoFile);
  await page.getByRole('textbox', { name: 'Photo caption', exact: true }).fill('The terrace in the afternoon');
  await page.getByRole('button', { name: 'Add photo', exact: true }).click();
  await expect(page.locator('.community-photo')).toContainText('The terrace in the afternoon');
  state.photos.push({ id: 99, destination_id: 1, user_id: 2, user_name: 'Camille', caption: 'A visitor view', image_url: '/destinations/1/photos/99/image', created_at: new Date().toISOString() });
  state.photoUploads['/destinations/1/photos/99/image'] = { contentType: 'image/jpeg', body: photoFile.buffer };
  await page.reload();
  await expect(page.locator('.community-photo')).toHaveCount(2);
  await expect(page.locator('.community-photo').filter({ hasText: 'Photo by Camille' }).getByRole('button', { name: 'Delete photo' })).toHaveCount(0);
  await page.getByRole('button', { name: 'View photo by Camille' }).click();
  await expect(page.getByRole('dialog').getByRole('img', { name: 'A visitor view', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.getByRole('button', { name: 'Delete photo', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete photo', exact: true }).click();
  await expect(page.locator('.community-photo')).toHaveCount(1);
  await selectLanguage(page, 'fr');
  await expect(page.getByRole('heading', { name: 'Photos des membres', exact: true })).toBeVisible();
  await page.setViewportSize({ width: 320, height: 780 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('community-gallery-fr-320.png'), fullPage: true });
});

test('profile activity shows review authors and replies under the original comment', async ({ page }, testInfo) => {
  const state = await mockApi(page);
  state.activity.replies.push({ id: 3, place_id: 1, user_name: 'Camille', destination_name: 'Tassa', parent_message: 'Is the terrace open?', message: 'Yes, until 22:00.', created_at: '2026-09-09T11:00:00+00:00' });
  state.comments.push({ id: 1, user_name: 'Test Traveler', message: 'Is the terrace open?', created_at: '2026-09-09T10:00:00+00:00', review: { rating: 5, comment: 'Great visit', visited_date: '2026-09-09' }, replies: [{ id: 3, user_name: 'Camille', message: 'Yes, until 22:00.', created_at: '2026-09-09T11:00:00+00:00', replies: [] }] });
  await page.goto('/profile');
  await expect(page.locator('.activity-entry')).toContainText('Camille replied to your comment');
  await expect(page.locator('.activity-entry blockquote')).toContainText('Is the terrace open?');
  await page.screenshot({ path: testInfo.outputPath('profile-activity.png'), fullPage: true });
  await page.getByRole('link', { name: 'View conversation' }).click();
  await expect(page.locator('.comment-visit-review')).toContainText('Review by Test Traveler');
  await expect(page.locator('.comment-reply')).toContainText('Reply by Camille');
});