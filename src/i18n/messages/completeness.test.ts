import { describe, it, expect } from 'vitest';
import { itMessages } from './it';
import { enMessages } from './en';
import { esMessages } from './es';
import { frMessages } from './fr';
import { deMessages } from './de';

const itKeys = Object.keys(itMessages).sort();
const locales = { en: enMessages, es: esMessages, fr: frMessages, de: deMessages } as const;

describe('i18n catalog completeness', () => {
  for (const [name, messages] of Object.entries(locales)) {
    it(`${name} has exactly the same keys as it`, () => {
      const keys = Object.keys(messages).sort();
      expect(keys).toEqual(itKeys);
    });
  }
});
