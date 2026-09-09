import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { parse } from '@babel/parser';
import { frenchCatalogue } from '../src/i18n.js';

test('application JSX routes text through the bilingual catalogue', () => {
  const source = new URL('../src/', import.meta.url);
  const failures = [];
  const brandText = new Set(['GlobeTrotter', 'globetrotter', 'globe', 'trotter', 'EN', 'FR']);
  function checkKey(text, file) {
    if (text && /[A-Za-z]/.test(text) && !brandText.has(text) && !Object.hasOwn(frenchCatalogue, text)) failures.push(`${file}: missing translation for ${JSON.stringify(text)}`);
  }
  function walk(node, parent, file) {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'CallExpression' && (node.callee?.name === 'translate' || node.callee?.property?.name === 'translate') && node.arguments[0]?.type === 'StringLiteral') checkKey(node.arguments[0].value, file);
    if (node.type === 'JSXElement') {
      const name = node.openingElement.name.name;
      for (const attribute of node.openingElement.attributes) {
        if (attribute.type !== 'JSXAttribute' || attribute.value?.type !== 'StringLiteral') continue;
        const property = attribute.name.name;
        if (['PageHeading', 'Empty', 'Modal'].includes(name) && ['title', 'description', 'message', 'eyebrow'].includes(property)) checkKey(attribute.value.value, file);
        else if (['aria-label', 'placeholder', 'title', 'alt'].includes(property) && /[A-Za-z]/.test(attribute.value.value)) failures.push(`${file}: literal ${property}=${JSON.stringify(attribute.value.value)}`);
      }
    }
    if (node.type === 'JSXText') {
      const text = node.value.replace(/\s+/g, ' ').trim();
      if (/[A-Za-z]/.test(text) && !brandText.has(text)) {
        if (parent?.openingElement?.name?.name === 'Label') checkKey(text, file);
        else failures.push(`${file}: untranslated JSX text ${JSON.stringify(text)}`);
      }
    }
    for (const [key, value] of Object.entries(node)) {
      if (key === 'loc' || key === 'comments' || key === 'tokens') continue;
      if (Array.isArray(value)) value.forEach(child => walk(child, node, file));
      else if (value && typeof value === 'object') walk(value, node, file);
    }
  }
  for (const file of readdirSync(source).filter(file => file.endsWith('.jsx'))) {
    walk(parse(readFileSync(new URL(file, source), 'utf8'), { sourceType: 'module', plugins: ['jsx'] }), null, file);
  }
  assert.deepEqual([...new Set(failures)], []);
});