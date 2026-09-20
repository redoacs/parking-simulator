import { en, type Messages } from './en';
import { es } from './es';

export type Language = 'en' | 'es';
export const LANGUAGE_KEY = 'parking-simulator.language';
export const LANGUAGE_TAGS = { en: 'en-US', es: 'es-MX' } as const;
let language: Language = 'en';
const listeners = new Set<() => void>();
const numberFormats = new Map<string, Intl.NumberFormat>();

export function chooseLanguage(saved: string | null, preferred: readonly string[]): Language {
  if (saved === 'en' || saved === 'es') return saved;
  for (const tag of preferred) {
    const base = tag.toLowerCase().split('-')[0];
    if (base === 'en' || base === 'es') return base;
  }
  return 'en';
}

export function getLanguage(): Language {
  return language;
}

export function t(): Messages {
  return language === 'es' ? es : en;
}

export function setLanguage(next: Language): void {
  if (next === language) return;
  language = next;
  for (const refresh of listeners) refresh();
}

export function onLanguageChange(refresh: () => void): void {
  listeners.add(refresh);
}

export function initLanguage(): void {
  let saved: string | null = null;
  try {
    saved = localStorage.getItem(LANGUAGE_KEY);
  } catch {
    // Storage may be denied; browser preferences still work.
  }
  setLanguage(chooseLanguage(saved, navigator.languages));
}

export function selectLanguage(next: Language): void {
  setLanguage(next);
  try {
    localStorage.setItem(LANGUAGE_KEY, next);
  } catch {
    // A blocked preference store must not prevent switching in this page.
  }
}

export function fmt(value: number, digits: number): string {
  const key = `${language}:${digits}`;
  let formatter = numberFormats.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat(LANGUAGE_TAGS[language], {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
      useGrouping: false,
    });
    numberFormats.set(key, formatter);
  }
  return formatter.format(value);
}
