// Shared across every page: API base URL config, nav login/logout state,
// geolocation state, and the booking modal used from the Destinations
// and Recommendations pages.

// IMPORTANT: the backend now runs as a separate service (see ../backend/).
// If you're opening these HTML files directly or serving them from a
// different port/origin than Flask, point this at wherever `python app.py`
// is actually running.
const API_BASE_URL = window.GT_API_BASE_URL || 'http://localhost:5000';

// ---- Geolocation (shared across pages that show a map) ----
// gtUserLocation is populated once the browser grants permission; pages
// with a map read this to draw a "you are here" marker + route line.
let gtUserLocation = null; // { lat, lng }
let gtWatchId = null;

function gtHaversineKm(lat1, lng1, lat2, lng2) {
  const r = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(a));
}

// Starts a LIVE watch on the browser's location — the marker/estimates
// using gtUserLocation will keep updating as the device moves, not just
// once. Call gtStopLiveLocation() to stop (e.g. when leaving the page).
function gtStartLiveLocation(onUpdate) {
  if (!navigator.geolocation) {
    alert('Your browser does not support geolocation.');
    return;
  }
  if (gtWatchId !== null) return; // already watching
  gtWatchId = navigator.geolocation.watchPosition(
    (pos) => {
      gtUserLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      if (onUpdate) onUpdate(gtUserLocation);
    },
    (err) => {
      alert('Could not get your location: ' + err.message);
    },
    { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
  );
}

function gtStopLiveLocation() {
  if (gtWatchId !== null && navigator.geolocation) {
    navigator.geolocation.clearWatch(gtWatchId);
    gtWatchId = null;
  }
}

// ---- Transport estimates ----
// These are rough, distance-based estimates — NOT live pricing from any
// ride-hailing API. Formulas are simple heuristics for Yaoundé's typical
// fares, clearly labeled as estimates in the UI.
const GT_TRANSPORT_MODES = {
  taxi:  { label: '🚕 Shared taxi', baseFare: 200, perKm: 150, speedKmh: 18 },
  moto:  { label: '🏍️ Moto-taxi',   baseFare: 150, perKm: 100, speedKmh: 22 },
  yango: { label: '📱 Yango',        baseFare: 400, perKm: 220, speedKmh: 20 },
  own:   { label: '🚗 Own vehicle',  baseFare: 0,   perKm: 0,   speedKmh: 25 },
};

function gtEstimateTransport(distanceKm) {
  return Object.entries(GT_TRANSPORT_MODES).map(([key, mode]) => {
    const fare = Math.round(mode.baseFare + mode.perKm * distanceKm);
    const minutes = Math.round((distanceKm / mode.speedKmh) * 60);
    return { key, label: mode.label, fare, minutes };
  });
}

function renderNavAuth() {
  const el = document.getElementById('nav-auth');
  if (!el) return;
  const token = localStorage.getItem('gt_token');
  const name = localStorage.getItem('gt_name');
  if (token) {
    el.innerHTML = `<span class="muted">Hi, ${name}</span> <a href="#" id="logout-link">Log out</a>`;
    document.getElementById('logout-link').addEventListener('click', (e) => {
      e.preventDefault();
      localStorage.removeItem('gt_token');
      localStorage.removeItem('gt_name');
      window.location.reload();
    });
  } else {
    el.innerHTML = `<a href="/login" data-i18n="login_link">${gtT('login_link')}</a> <a href="/register" data-i18n="register_link">${gtT('register_link')}</a>`;
  }
}

let _bookDestLat = null;
let _bookDestLng = null;

function openBookModal(destinationId, destinationName, lat, lng) {
  const token = localStorage.getItem('gt_token');
  if (!token) {
    window.location.href = '/login';
    return;
  }
  _bookDestLat = lat;
  _bookDestLng = lng;
  document.getElementById('book-destination-id').value = destinationId;
  document.getElementById('book-modal-title').textContent = 'Plan a trip to ' + destinationName;
  document.getElementById('book-message').textContent = '';
  document.getElementById('book-form').reset();
  document.getElementById('book-destination-id').value = destinationId;
  document.getElementById('book-modal').classList.remove('hidden');
  updateTransportEstimate();
}

function closeBookModal() {
  document.getElementById('book-modal').classList.add('hidden');
}

function updateTransportEstimate() {
  const el = document.getElementById('transport-estimate');
  if (!el) return;
  if (!gtUserLocation || _bookDestLat == null || _bookDestLng == null) {
    el.innerHTML = '<p class="muted" style="font-size:0.8rem;">Enable location on the map to see estimated fares.</p>';
    return;
  }
  const distanceKm = gtHaversineKm(gtUserLocation.lat, gtUserLocation.lng, _bookDestLat, _bookDestLng);
  const estimates = gtEstimateTransport(distanceKm);
  el.innerHTML = `
    <p class="muted" style="font-size:0.8rem;">~${distanceKm.toFixed(1)} km from your current location. Estimated (not live pricing):</p>
    <div class="transport-grid">
      ${estimates.map(e => `
        <div class="transport-option">
          <div>${e.label}</div>
          <div>${e.fare} FCFA · ${e.minutes} min</div>
        </div>
      `).join('')}
    </div>
  `;
}

document.addEventListener('DOMContentLoaded', () => {
  renderNavAuth();

  const transportSelect = document.getElementById('book-transport');
  if (transportSelect) {
    transportSelect.addEventListener('change', updateTransportEstimate);
  }

  const bookForm = document.getElementById('book-form');
  if (bookForm) {
    bookForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const token = localStorage.getItem('gt_token');
      const msg = document.getElementById('book-message');
      if (!token) {
        window.location.href = '/login';
        return;
      }
      const payload = {
        destination_id: parseInt(document.getElementById('book-destination-id').value, 10),
        start_date: document.getElementById('book-start').value,
        end_date: document.getElementById('book-end').value,
        time_slot: document.getElementById('book-time-slot').value,
        transport_mode: document.getElementById('book-transport').value,
        notes: document.getElementById('book-notes').value
      };
      try {
        const res = await fetch(`${API_BASE_URL}/itineraries`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!res.ok) {
          msg.textContent = (data.errors && data.errors.join(', ')) || data.error || 'Could not save itinerary';
          msg.className = 'error';
          return;
        }
        closeBookModal();
        document.dispatchEvent(new CustomEvent('gt:itinerary-created'));
        alert('Itinerary saved! Check "My Itineraries" to see it.');
      } catch (err) {
        msg.textContent = 'Network error: ' + err;
        msg.className = 'error';
      }
    });
  }
});
