/**
 * Server-side copy for the new-chat-message notification, in the five supported locales.
 * Same convention as ../notifications/bookingMessages.ts (Cloud Functions cannot import the
 * client i18n bundle; Italian is authoritative).
 */

import { resolveLocale, type AppLocale } from "../notifications/bookingMessages";

const TITLES: Record<AppLocale, { named: (name: string) => string; anonymous: string }> = {
  it: { named: (n) => `Nuovo messaggio da ${n}`, anonymous: "Nuovo messaggio" },
  en: { named: (n) => `New message from ${n}`, anonymous: "New message" },
  es: { named: (n) => `Nuevo mensaje de ${n}`, anonymous: "Nuevo mensaje" },
  fr: { named: (n) => `Nouveau message de ${n}`, anonymous: "Nouveau message" },
  de: { named: (n) => `Neue Nachricht von ${n}`, anonymous: "Neue Nachricht" },
};

/** Max body length of a notification preview. */
export const NOTIFICATION_PREVIEW_LENGTH = 120;

/** One-line, length-capped preview of a message. */
export function previewText(text: string, max: number): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  return oneLine.length > max ? `${oneLine.slice(0, max - 1)}…` : oneLine;
}

export function buildChatNotification(
  locale: unknown,
  senderName: string | null | undefined,
  text: string
): { title: string; body: string } {
  const copy = TITLES[resolveLocale(locale)];
  const name = senderName?.trim();
  return {
    title: name ? copy.named(name) : copy.anonymous,
    body: previewText(text, NOTIFICATION_PREVIEW_LENGTH),
  };
}
