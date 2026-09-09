import { test, expect } from '@playwright/test';
import { localDate } from '../src/utils.js';

const destinations = [
  { id: 1, name: 'Tassa', category: 'restaurant', neighborhood: 'Bastos', address: 'Bastos, Yaounde', lat: 3.885, lng: 11.512, rating: 4.3, rating_count: 189, price_level: 2, tags: ['restaurant', 'outdoor'], description: 'Bright garden cafe-restaurant in Bastos with a glass roof, coffee bar, and occasional live jazz nights.', phone: '+237 600000000' },
  { id: 44, name: 'Mont Febe', category: 'nature', neighborhood: 'Mont Febe', address: 'Yaounde', lat: 3.91, lng: 11.49, rating: 4.8, rating_count: 50, price_level: 1, tags: ['nature', 'outdoor'], description: 'Small, highly-rated Odza hotel known for cleanliness and a warm welcome.' },
];

async function mockApi(page, authenticated = true) {
  const state = { favorites: [], trips: [], comments: [], feedback: [], messages: [], calls: [], activity: { reviews: [], comments: [], replies: [] }, profile: { id: 1, name: 'Test Traveler', email: 'traveler@example.test', phone: null, preferences: ['outdoor'] } };
  await page.addInitScript(({ authenticated }) => {
    if (!localStorage.getItem('gt_lang')) localStorage.setItem('gt_lang', 'en');
    if (!localStorage.getItem('gt_theme')) localStorage.setItem('gt_theme', 'light');
    if (authenticated) { localStorage.setItem('gt_token', 'test-session'); localStorage.setItem('gt_name', 'Test Traveler'); }
  }, { authenticated });
  await page.route('**/api/**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace('/api', '');
    const method = request.method();
    const body = request.postDataJSON();
    state.calls.push({ path, method, body, authorization: request.headers().authorization });
    const respond = (data, status = 200) => route.fulfill({ status, json: data });
    if (path === '/destinations') return respond(destinations);
    if (path === '/auth/google/config') return respond({ client_id: null });
    if (path === '/auth/google') return respond({ id: 1, token: 'test-session', name: state.profile.name }, 201);
    if (path === '/login') return body.password === 'wrong' ? respond({ error: 'invalid credentials' }, 401) : respond({ token: 'test-session', name: state.profile.name });
    if (path === '/register') return respond({ id: 1, name: body.name }, 201);
    if (path === '/profile') { if (method === 'PATCH') Object.assign(state.profile, body); return respond(state.profile); }
    if (path === '/profile/activity') return respond(state.activity);
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
    if (path === '/recommendations') return respond(destinations);
    if (path === '/favorites') {
      if (method === 'POST') state.favorites.push(body.destination_id);
      return respond(destinations.filter(place => state.favorites.includes(place.id)), method === 'POST' ? 201 : 200);
    }
    if (/^\/favorites\/\d+$/.test(path)) { state.favorites = state.favorites.filter(id => id !== Number(path.split('/').pop())); return respond({ removed: true }); }
    if (path === '/itineraries') {
      if (method === 'POST') { const trip = { id: state.trips.length + 1, ...body, visited: false }; state.trips.push(trip); return respond(trip, 201); }
      return respond(state.trips);
    }
    if (/^\/itineraries\/\d+\/visit$/.test(path)) { const trip = state.trips.find(item => item.id === Number(path.split('/')[2])); Object.assign(trip, { visited: true, review: body }); return respond(trip); }
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

test('browse, filter, preserve query, and recover from an empty search', async ({ page }) => {
  await mockApi(page, false);
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
  await expect(page).toHaveURL(/\/login$/);
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

test('map markers, live location, directions, and booking work together', async ({ page, context }) => {
  await mockApi(page);
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: 3.88, longitude: 11.51 });
  await page.route('https://basemaps.cartocdn.com/gl/**/style.json', route => route.fulfill({ json: { version: 8, sources: {}, layers: [{ id: 'test-background', type: 'background', paint: { 'background-color': route.request().url().includes('dark-matter') ? '#202625' : '#dfece5' } }] } }));
  await page.route('https://router.project-osrm.org/**', route => route.fulfill({ json: { routes: [{ distance: 1200, duration: 300, geometry: { coordinates: [[11.51, 3.88], [11.512, 3.885]] } }] } }));
  await page.goto('/map');
  await expect(page.locator('.map-section')).toHaveAttribute('data-map-ready', 'true', { timeout: 15000 });
  await expect(page.locator('.place-marker')).toHaveCount(2);
  await page.getByRole('button', { name: 'Show Tassa on map', exact: true }).click();
  await expect(page.locator('.map-popup')).toContainText('Tassa');
  await page.getByRole('button', { name: 'Directions', exact: true }).click();
  await expect(page.locator('.route-summary')).toContainText('1.2 km / about 5 min driving');
  await expect(page.getByRole('button', { name: 'Stop live location' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('img', { name: 'Your location', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Switch to dark mode' }).click();
  await expect(page.locator('.map-section')).toHaveAttribute('data-map-theme', 'dark');
  await expect(page.locator('.map-section')).toHaveAttribute('data-map-ready', 'true');
  await expect(page.locator('.route-summary')).toContainText('1.2 km');
  await page.getByRole('button', { name: 'Plan a visit', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Stop live location' }).click();
  await expect(page.getByRole('button', { name: 'My location', exact: true })).toHaveAttribute('aria-pressed', 'false');
  await page.getByRole('button', { name: 'Clear route' }).click();
  await expect(page.locator('.route-summary')).toHaveCount(0);
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
  expect(await page.getByRole('dialog').evaluate(dialog => { const bounds = dialog.getBoundingClientRect(); return bounds.left >= 0 && bounds.right <= innerWidth && bounds.top >= 0 && bounds.bottom <= innerHeight; })).toBe(true);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.goto('/favorites.html');
  await expect(page).toHaveURL(/\/favorites$/);
});

test('theme persists and system mode follows device changes', async ({ page }) => {
  await mockApi(page, false);
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
    Object.defineProperty(navigator, 'geolocation', { value: { watchPosition: (success, failure) => { failure({ code: 1 }); return 1; }, clearWatch: () => {} } });
  });
  await page.goto('/map');
  await expect(page.locator('.map-section')).toHaveAttribute('data-map-ready', 'true', { timeout: 15000 });
  await page.getByRole('button', { name: 'My location', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Location access was denied');
  await expect(page.getByRole('button', { name: 'My location', exact: true })).toHaveAttribute('aria-pressed', 'false');
  await page.getByRole('combobox', { name: 'Find a place on the map' }).selectOption('1');
  await expect(page.locator('.map-popup')).toContainText('Tassa');
});

async function selectLanguage(page, value) {
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

test('destination share, map, comment, and directions shortcuts target the exact place', async ({ page, context }) => {
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
  await page.getByRole('button', { name: 'Share Tassa', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Share link' })).toHaveValue(/\/places\/1$/);
  await page.getByRole('button', { name: 'Copy link' }).click();
  await expect(page.getByRole('button', { name: 'Link copied.' })).toBeVisible();
  expect(await page.evaluate(() => window.copiedShareLink)).toMatch(/\/places\/1$/);
  await page.keyboard.press('Escape');
  await page.getByRole('link', { name: 'Show Tassa on map', exact: true }).click();
  await expect(page).toHaveURL(/\/map\?place=1$/);
  await expect(page.locator('.map-popup')).toContainText('Tassa', { timeout: 15000 });
  await page.goto('/?category=restaurant');
  await page.getByRole('link', { name: 'Directions to Tassa', exact: true }).click();
  await expect(page.locator('.route-summary')).toContainText('1.2 km', { timeout: 15000 });
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
  await expect(page.getByRole('heading', { name: 'La ville en conversation' })).toBeVisible();
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