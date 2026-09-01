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

// ---- Favorites (heart icon state, shared across pages) ----
let gtFavoriteIds = new Set();
let gtFavoritesLoaded = false;

async function gtLoadFavoriteIds() {
  const token = localStorage.getItem('gt_token');
  if (!token) { gtFavoriteIds = new Set(); gtFavoritesLoaded = true; return; }
  try {
    const res = await fetch(`${API_BASE_URL}/favorites`, { headers: { 'Authorization': 'Bearer ' + token } });
    if (res.ok) {
      const favs = await res.json();
      gtFavoriteIds = new Set(favs.map(f => f.id));
    }
  } catch (err) {
    // Non-critical — hearts just default to un-favorited if this fails.
  } finally {
    gtFavoritesLoaded = true;
  }
}

function gtHeartHtml(destinationId) {
  const filled = gtFavoriteIds.has(destinationId);
  return `<button class="heart-btn ${filled ? 'filled' : ''}" onclick="gtToggleFavorite(${destinationId}, this); event.stopPropagation();" title="${filled ? 'Remove from favorites' : 'Add to favorites'}">${filled ? '❤️' : '🤍'}</button>`;
}

async function gtToggleFavorite(destinationId, btn) {
  const token = localStorage.getItem('gt_token');
  if (!token) {
    window.location.href = '/login';
    return;
  }
  const currentlyFavorited = gtFavoriteIds.has(destinationId);
  try {
    if (currentlyFavorited) {
      await fetch(`${API_BASE_URL}/favorites/${destinationId}`, {
        method: 'DELETE', headers: { 'Authorization': 'Bearer ' + token }
      });
      gtFavoriteIds.delete(destinationId);
    } else {
      await fetch(`${API_BASE_URL}/favorites`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify({ destination_id: destinationId })
      });
      gtFavoriteIds.add(destinationId);
    }
    if (btn) {
      const nowFilled = gtFavoriteIds.has(destinationId);
      btn.classList.toggle('filled', nowFilled);
      btn.textContent = nowFilled ? '❤️' : '🤍';
      btn.title = nowFilled ? 'Remove from favorites' : 'Add to favorites';
    }
    document.dispatchEvent(new CustomEvent('gt:favorites-changed'));
  } catch (err) {
    alert('Could not update favorites: ' + err);
  }
}

// ---- "Has this trip passed?" helper for the itineraries page ----
function gtHasPassed(endDateStr) {
  const today = new Date().toISOString().slice(0, 10);
  return endDateStr < today;
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
      window.location.href = 'login.html';
    });
  } else {
    el.innerHTML = `<a href="login.html" data-i18n="login_link">${gtT('login_link')}</a> <a href="register.html" data-i18n="register_link">${gtT('register_link')}</a>`;
  }
}

function gtGetCurrentPageName() {
  const path = window.location.pathname.replace(/\\/+$|index\.html$/g, '').split('/').pop() || 'index.html';
  return path || 'index.html';
}

function gtIsLoggedIn() {
  return Boolean(localStorage.getItem('gt_token'));
}

function gtRedirectToLoginIfNeeded() {
  const page = gtGetCurrentPageName();
  const publicPages = ['login.html', 'register.html', 'offline.html'];
  const isPublicPage = publicPages.includes(page) || page === '';

  if (page === 'login.html' && gtIsLoggedIn()) {
    window.location.href = 'index.html';
    return;
  }

  if (!gtIsLoggedIn() && !isPublicPage) {
    window.location.href = 'login.html';
  }
}

function gtEscapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  }[char]));
}

function gtRenderCommentThread(comments, level = 0) {
  if (!comments || !comments.length) {
    return '<p class="muted">No comments yet. Be the first to share a thought.</p>';
  }

  return comments.map((comment) => {
    const avatar = (comment.user_name || 'T').trim().charAt(0).toUpperCase() || 'T';
    const replies = comment.replies && comment.replies.length ? gtRenderCommentThread(comment.replies, level + 1) : '';
    const indent = Math.min(level * 22, 60);
    const messageHtml = gtEscapeHtml(comment.message).replace(/\n/g, '<br>');

    return `
      <div class="comment-thread" style="margin-left:${indent}px;">
        <div class="comment-card">
          <div class="comment-header">
            <div class="comment-user">
              <span class="comment-avatar">${avatar}</span>
              <strong>${gtEscapeHtml(comment.user_name || 'Traveler')}</strong>
            </div>
            <span class="comment-time">${new Date(comment.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
          </div>
          <p>${messageHtml}</p>
          <button type="button" class="secondary small comment-reply-btn" data-comment-id="${comment.id}">Reply</button>
          <div id="comment-reply-box-${comment.id}" class="comment-reply-box hidden">
            <textarea id="comment-reply-text-${comment.id}" rows="2" placeholder="Write a reply..."></textarea>
            <div class="comment-form-actions">
              <button type="button" class="secondary small emoji-button" data-emoji-target="comment-reply-text-${comment.id}" aria-label="Insert emoji">😊</button>
              <div id="emoji-picker-reply-${comment.id}" class="emoji-picker hidden">
                <button type="button" data-emoji-insert="comment-reply-text-${comment.id}" data-emoji="🙂">🙂</button>
                <button type="button" data-emoji-insert="comment-reply-text-${comment.id}" data-emoji="👏">👏</button>
                <button type="button" data-emoji-insert="comment-reply-text-${comment.id}" data-emoji="😍">😍</button>
                <button type="button" data-emoji-insert="comment-reply-text-${comment.id}" data-emoji="🔥">🔥</button>
                <button type="button" data-emoji-insert="comment-reply-text-${comment.id}" data-emoji="🌍">🌍</button>
                <button type="button" data-emoji-insert="comment-reply-text-${comment.id}" data-emoji="❤️">❤️</button>
              </div>
              <button type="button" class="small" data-submit-reply="${comment.id}">Send</button>
            </div>
          </div>
        </div>
        ${replies ? `<div class="comment-replies">${replies}</div>` : ''}
      </div>
    `;
  }).join('');
}

function gtInsertEmoji(targetId, emoji) {
  const textArea = document.getElementById(targetId);
  if (!textArea) return;
  const start = textArea.selectionStart;
  const end = textArea.selectionEnd;
  textArea.setRangeText(emoji, start, end, 'end');
  textArea.focus();
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
  gtRedirectToLoginIfNeeded();
  renderNavAuth();
  gtLoadFavoriteIds();

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
