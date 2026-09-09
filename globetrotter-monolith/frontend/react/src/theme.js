export function resolveTheme(preference, systemDark = false) {
  return preference === 'dark' || (preference !== 'light' && systemDark) ? 'dark' : 'light';
}

export function getThemePreference() {
  const saved = localStorage.getItem('gt_theme');
  return saved === 'light' || saved === 'dark' ? saved : 'system';
}

export function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = theme === 'dark' ? '#202625' : '#f6f8f7';
}