// Shared across every page: nav login/logout state, and the booking modal
// used from the Destinations and Recommendations pages.

function renderNavAuth() {
  const el = document.getElementById('nav-auth');
  if (!el) return;
  const token = localStorage.getItem('gt_token');
  const username = localStorage.getItem('gt_username');
  if (token) {
    el.innerHTML = `<span class="muted">Hi, ${username}</span> <a href="#" id="logout-link">Log out</a>`;
    document.getElementById('logout-link').addEventListener('click', (e) => {
      e.preventDefault();
      localStorage.removeItem('gt_token');
      localStorage.removeItem('gt_username');
      window.location.reload();
    });
  } else {
    el.innerHTML = `<a href="/login">Log in</a> <a href="/register">Register</a>`;
  }
}

function openBookModal(destinationId, destinationName) {
  const token = localStorage.getItem('gt_token');
  if (!token) {
    window.location.href = '/login';
    return;
  }
  document.getElementById('book-destination-id').value = destinationId;
  document.getElementById('book-modal-title').textContent = 'Plan a trip to ' + destinationName;
  document.getElementById('book-message').textContent = '';
  document.getElementById('book-form').reset();
  document.getElementById('book-destination-id').value = destinationId;
  document.getElementById('book-modal').classList.remove('hidden');
}

function closeBookModal() {
  document.getElementById('book-modal').classList.add('hidden');
}

document.addEventListener('DOMContentLoaded', () => {
  renderNavAuth();

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
        notes: document.getElementById('book-notes').value
      };
      try {
        const res = await fetch('/itineraries', {
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
