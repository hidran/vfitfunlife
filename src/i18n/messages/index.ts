import { DEFAULT_LOCALE, type AppLocale } from '@/types/locale';
import { deMessages } from './de';
import { enMessages } from './en';
import { esMessages } from './es';
import { frMessages } from './fr';
import { itMessages, type MessageKey, type Messages } from './it';

export const messagesByLocale: Record<AppLocale, Messages> = {
  it: itMessages,
  en: enMessages,
  es: esMessages,
  fr: frMessages,
  de: deMessages,
};

export type { MessageKey };

export function getMessage(locale: AppLocale, key: MessageKey): string {
  return messagesByLocale[locale][key] ?? messagesByLocale[DEFAULT_LOCALE][key] ?? key;
}
