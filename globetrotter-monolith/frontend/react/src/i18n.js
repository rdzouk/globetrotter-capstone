import { french } from './translations.js';
import { destinationFrench, neighborhoodFrench, tagFrench } from './contentTranslations.js';

export const frenchCatalogue = { ...tagFrench, ...destinationFrench, ...neighborhoodFrench, ...french };

export function localeFor(language) {
  return language === 'fr' ? 'fr-FR' : 'en-GB';
}

export function translateText(language, text, values = {}) {
  if (typeof text !== 'string') return text;
  const template = language === 'fr' ? frenchCatalogue[text] ?? text.split('\n').map(line => frenchCatalogue[line] ?? line).join('\n') : text;
  return template.replace(/\{(\w+)\}/g, (match, key) => values[key] === undefined ? match : String(values[key]));
}

export function formatNumber(language, value, options = {}) {
  return new Intl.NumberFormat(localeFor(language), options).format(value);
}

export function formatLocalDate(language, value, options = {}) {
  if (!value) return '';
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00`) : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(localeFor(language), { day: 'numeric', month: 'short', year: 'numeric', ...options }).format(date);
}

export function validationMessage(language, input) {
  const validity = input.validity;
  if (validity.valueMissing) return translateText(language, 'Please complete this field.');
  if (validity.typeMismatch && input.type === 'email') return translateText(language, 'Please enter a valid email address.');
  if (validity.patternMismatch) return translateText(language, 'Please use the requested format.');
  if (validity.tooShort) return translateText(language, 'Please enter at least {count} characters.', { count: input.minLength });
  if (validity.tooLong) return translateText(language, 'Please enter no more than {count} characters.', { count: input.maxLength });
  if (validity.rangeUnderflow) return translateText(language, 'Please choose a value on or after {value}.', { value: input.min });
  if (validity.rangeOverflow) return translateText(language, 'Please choose a value on or before {value}.', { value: input.max });
  return translateText(language, 'Please enter a valid value.');
}