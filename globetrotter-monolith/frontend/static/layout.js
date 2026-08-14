/**
 * Injects the shared navbar and booking modal into every page.
 *
 * This is a static-site replacement for what used to be Jinja's
 * {% extends "base.html" %} template inheritance. Since Netlify (and
 * static hosts generally) can't run server-side templating, each page
 * is a plain, self-contained HTML file with two empty placeholder
 * divs — id="navbar-placeholder" and id="modal-placeholder" — and
 * this script fills them in synchronously.
 *
 * Load order matters: this file must be the FIRST <script src> in
 * the body, before i18n.js and app.js, so the elements they look for
 * (#nav-auth, #book-form, etc.) already exist by the time those run.
 * Regular (non-async, non-defer) <script src> tags execute in
 * document order, so as long as the placeholder divs appear earlier
 * in the HTML than this script tag, this works with zero flicker.
 */

document.getElementById('navbar-placeholder').outerHTML = `
  <a href="#main-content" class="skip-link">Skip to main content</a>
  <nav class="navbar">
    <a href="index.html" class="brand">🌍 GlobeTrotter</a>
    <div class="nav-links">
      <a href="index.html" data-i18n="nav_destinations">Destinations</a>
      <a href="map.html" data-i18n="nav_map">Map</a>
      <a href="recommendations.html" data-i18n="nav_recommendations">Recommendations</a>
      <a href="favorites.html" data-i18n="nav_favorites">Favorites</a>
      <a href="itineraries.html" data-i18n="nav_itineraries">My Itineraries</a>
      <a href="planner.html" data-i18n="nav_planner">Planner</a>
      <a href="feedback.html" data-i18n="nav_feedback">Feedback</a>
      <a href="profile.html" data-i18n="nav_profile">Profile</a>
      <button id="lang-toggle" class="icon-btn" title="Switch language">EN</button>
      <button id="theme-toggle" class="icon-btn" title="Toggle dark mode">🌙</button>
      <span id="nav-auth"></span>
    </div>
  </nav>
`;

document.getElementById('modal-placeholder').outerHTML = `
  <div id="book-modal" class="modal hidden">
    <div class="modal-box">
      <h2 id="book-modal-title">Plan a trip</h2>
      <form id="book-form">
        <input type="hidden" id="book-destination-id">
        <label data-i18n="label_start_date">Start date</label>
        <input type="date" id="book-start" required>
        <label data-i18n="label_end_date">End date</label>
        <input type="date" id="book-end" required>
        <label data-i18n="label_time_slot">Time slot (optional)</label>
        <input type="text" id="book-time-slot" placeholder="e.g. 09:00-11:00">
        <label data-i18n="label_transport">Getting there</label>
        <select id="book-transport">
          <option value="">Not sure yet</option>
          <option value="taxi">🚕 Shared taxi</option>
          <option value="moto">🏍️ Moto-taxi (bike)</option>
          <option value="yango">📱 Yango / ride-hailing</option>
          <option value="own">🚗 Own vehicle</option>
        </select>
        <div id="transport-estimate" class="transport-estimate"></div>
        <label data-i18n="label_notes">Notes</label>
        <textarea id="book-notes" rows="3" placeholder="Optional notes"></textarea>
        <div class="modal-actions">
          <button type="button" onclick="closeBookModal()" class="secondary" data-i18n="btn_cancel">Cancel</button>
          <button type="submit" data-i18n="btn_save_itinerary">Save itinerary</button>
        </div>
        <p id="book-message"></p>
      </form>
    </div>
  </div>
`;
