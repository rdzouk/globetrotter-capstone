// Lightweight i18n: English/French toggle, persisted in localStorage.
// Every element with data-i18n="key" gets its text replaced on load
// and whenever the language is switched. Placeholder text uses
// data-i18n-placeholder instead.

const GT_TRANSLATIONS = {
  en: {
    nav_destinations: 'Destinations',
    nav_recommendations: 'Recommendations',
    nav_itineraries: 'My Itineraries',
    nav_planner: 'Planner',
    nav_feedback: 'Feedback',
    label_start_date: 'Start date',
    label_end_date: 'End date',
    label_time_slot: 'Time slot (optional)',
    label_transport: 'Getting there',
    label_notes: 'Notes',
    btn_cancel: 'Cancel',
    btn_save_itinerary: 'Save itinerary',
    login_link: 'Log in',
    register_link: 'Register',
  },
  fr: {
    nav_destinations: 'Destinations',
    nav_recommendations: 'Recommandations',
    nav_itineraries: 'Mes itinéraires',
    nav_planner: 'Planificateur',
    nav_feedback: 'Avis sur l\'appli',
    label_start_date: 'Date de début',
    label_end_date: 'Date de fin',
    label_time_slot: 'Créneau horaire (optionnel)',
    label_transport: 'Comment y aller',
    label_notes: 'Notes',
    btn_cancel: 'Annuler',
    btn_save_itinerary: 'Enregistrer l\'itinéraire',
    login_link: 'Connexion',
    register_link: 'Inscription',
  },
};

function gtLang() {
  return localStorage.getItem('gt_lang') || 'en';
}

function gtT(key) {
  const lang = gtLang();
  return (GT_TRANSLATIONS[lang] && GT_TRANSLATIONS[lang][key]) || GT_TRANSLATIONS.en[key] || key;
}

function applyTranslations() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    el.textContent = gtT(el.dataset.i18n);
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    el.placeholder = gtT(el.dataset.i18nPlaceholder);
  });
  const toggle = document.getElementById('lang-toggle');
  if (toggle) toggle.textContent = gtLang().toUpperCase();
  document.documentElement.lang = gtLang();
}

function setLang(lang) {
  localStorage.setItem('gt_lang', lang);
  applyTranslations();
}

// ---- Theme (light/dark) ----

function gtTheme() {
  return localStorage.getItem('gt_theme') || 'light';
}

function applyTheme() {
  const theme = gtTheme();
  document.documentElement.setAttribute('data-theme', theme);
  const toggle = document.getElementById('theme-toggle');
  if (toggle) toggle.textContent = theme === 'dark' ? '☀️' : '🌙';
}

function setTheme(theme) {
  localStorage.setItem('gt_theme', theme);
  applyTheme();
}

document.addEventListener('DOMContentLoaded', () => {
  applyTranslations();
  applyTheme();

  const langToggle = document.getElementById('lang-toggle');
  if (langToggle) {
    langToggle.addEventListener('click', () => setLang(gtLang() === 'en' ? 'fr' : 'en'));
  }
  const themeToggle = document.getElementById('theme-toggle');
  if (themeToggle) {
    themeToggle.addEventListener('click', () => setTheme(gtTheme() === 'dark' ? 'light' : 'dark'));
  }
});
