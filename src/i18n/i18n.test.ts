import { afterEach, describe, expect, it } from 'vitest';
import { chooseLanguage, fmt, setLanguage } from './index';
import { es } from './es';
import taos from '../vehicle/data/taos-trendline-mx-2025.json';
import { NUMERIC_FIELDS } from '../vehicle/types';

afterEach(() => setLanguage('en'));

describe('language preference', () => {
  it.each([
    ['en', ['es-MX'], 'en'],
    ['es', ['en-US'], 'es'],
    [null, ['fr', 'es-AR', 'en'], 'es'],
    [null, ['en-GB', 'es'], 'en'],
    [null, ['ES-mx'], 'es'],
    ['broken', ['es-MX'], 'es'],
    [null, ['fr', 'de'], 'en'],
    [null, [], 'en'],
  ] as const)('saved %s, browser %j → %s', (saved, preferred, expected) => {
    expect(chooseLanguage(saved, preferred)).toBe(expected);
  });
});

it.each(['en', 'es'] as const)('formats measurements with fixed precision and no grouping in %s', (language) => {
  setLanguage(language);
  expect(fmt(4467, 0)).toBe('4467');
  expect(fmt(12.5, 1)).toBe('12.5');
  expect(fmt(10.7, 2)).toBe('10.70');
  expect(fmt(-2.25, 1)).toBe('-2.3');
  expect(fmt(-0, 1)).toBe('0.0');
  expect(fmt(-0.01, 1)).toBe('-0.0');
});

it('preserves numeric tokens in every translated vehicle source note', () => {
  const numbers = (note: string): string[] => (note.match(/\d+(?:\.\d+)?/g) ?? []).sort();
  for (const field of [...NUMERIC_FIELDS, 'turningCircle'] as const) {
    expect(numbers(es[`taos-trendline-mx-2025.${field}`]), field).toEqual(numbers(taos[field].source.note));
  }
});
