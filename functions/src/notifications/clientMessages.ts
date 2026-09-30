/**
 * Server-side copy for "add a client by email" (addClientByEmail), in all five locales.
 *
 * - `CLIENT_ADDED_MESSAGES`: push + in-app notice to an existing user that a trainer added
 *   them to their clients — rendered in the CLIENT's preferredLanguage.
 * - `CLIENT_INVITE_EMAILS`: the invitation sent to an address with no account yet — rendered
 *   in the TRAINER's preferredLanguage (we know nothing about the recipient).
 * - `CLIENT_ACCOUNT_EMAILS`: the trainer CREATED the account (createClientAccount); the email
 *   carries the link that confirms it by setting a password — rendered in the new account's
 *   preferredLanguage, which is the trainer's.
 *
 * Italian is authoritative; the others are translations of it (same rule as bookingMessages).
 */

import { resolveLocale, type AppLocale, type RenderedMessage } from "./bookingMessages";

/** Neutral fallback so a trainer without a name never renders as "undefined". */
function trainer(name: string | null | undefined, fallback: string): string {
  return name?.trim() || fallback;
}

type AddedTemplate = (trainerName: string | null | undefined) => RenderedMessage;

export const CLIENT_ADDED_MESSAGES: Record<AppLocale, AddedTemplate> = {
  it: (n) => ({
    title: "Sei tra i clienti di un trainer",
    body: `${trainer(n, "Il tuo trainer")} ti ha aggiunto ai suoi clienti e può fissarti delle sessioni.`,
  }),
  en: (n) => ({
    title: "A trainer added you as a client",
    body: `${trainer(n, "Your trainer")} added you to their clients and can now schedule sessions for you.`,
  }),
  es: (n) => ({
    title: "Un entrenador te ha añadido como cliente",
    body: `${trainer(n, "Tu entrenador")} te ha añadido a sus clientes y ahora puede programarte sesiones.`,
  }),
  fr: (n) => ({
    title: "Un coach vous a ajouté à ses clients",
    body: `${trainer(n, "Votre coach")} vous a ajouté à ses clients et peut désormais vous planifier des séances.`,
  }),
  de: (n) => ({
    title: "Ein Trainer hat dich als Kunden hinzugefügt",
    body: `${trainer(n, "Dein Trainer")} hat dich zu seinen Kunden hinzugefügt ` +
      "und kann jetzt Termine für dich eintragen.",
  }),
};

export interface InviteEmail {
  subject: string;
  body: string;
  actionLabel: string;
}

type InviteTemplate = (trainerName: string | null | undefined) => InviteEmail;

export const CLIENT_INVITE_EMAILS: Record<AppLocale, InviteTemplate> = {
  it: (n) => ({
    subject: `${trainer(n, "Un trainer")} ti invita su VFit`,
    body: `${trainer(n, "Un trainer")} vuole seguirti su VFit, l'app per prenotare le tue sessioni. ` +
      "Crea il tuo account con questo indirizzo email: appena ti registri potrà fissarti gli appuntamenti.",
    actionLabel: "Crea il tuo account",
  }),
  en: (n) => ({
    subject: `${trainer(n, "A trainer")} invites you to VFit`,
    body: `${trainer(n, "A trainer")} would like to coach you on VFit, the app for booking your sessions. ` +
      "Create your account with this email address: as soon as you sign up they can schedule your sessions.",
    actionLabel: "Create your account",
  }),
  es: (n) => ({
    subject: `${trainer(n, "Un entrenador")} te invita a VFit`,
    body: `${trainer(n, "Un entrenador")} quiere entrenarte en VFit, la app para reservar tus sesiones. ` +
      "Crea tu cuenta con esta dirección de email: en cuanto te registres podrá programarte las citas.",
    actionLabel: "Crea tu cuenta",
  }),
  fr: (n) => ({
    subject: `${trainer(n, "Un coach")} vous invite sur VFit`,
    body: `${trainer(n, "Un coach")} souhaite vous accompagner sur VFit, l'application pour réserver vos séances. ` +
      "Créez votre compte avec cette adresse e-mail : dès votre inscription, il pourra vous planifier des séances.",
    actionLabel: "Créer votre compte",
  }),
  de: (n) => ({
    subject: `${trainer(n, "Ein Trainer")} lädt dich zu VFit ein`,
    body: `${trainer(n, "Ein Trainer")} möchte dich auf VFit betreuen, der App zum Buchen deiner Einheiten. ` +
      "Erstelle dein Konto mit dieser E-Mail-Adresse: Sobald du registriert bist, kann er Termine für dich eintragen.",
    actionLabel: "Konto erstellen",
  }),
};

type AccountTemplate = (trainerName: string | null | undefined, clientName: string) => InviteEmail;

/** Plain-text body: the email layout puts the action button right after it. */
export const CLIENT_ACCOUNT_EMAILS: Record<AppLocale, AccountTemplate> = {
  it: (n, c) => ({
    subject: `${trainer(n, "Il tuo trainer")} ti ha aggiunto come cliente su VFit`,
    body: `Ciao ${c}, ${trainer(n, "il tuo trainer")} ti ha aggiunto come cliente su VFit, ` +
      "l'app per prenotare e seguire le tue sessioni. Conferma il tuo account e scegli una password " +
      "con il pulsante qui sotto. Puoi anche accedere con Google usando questo indirizzo email. " +
      "Il link scade dopo un'ora: se è scaduto, usa \"Password dimenticata\" con questo indirizzo.",
    actionLabel: "Conferma il tuo account",
  }),
  en: (n, c) => ({
    subject: `${trainer(n, "Your trainer")} added you as a client on VFit`,
    body: `Hi ${c}, ${trainer(n, "your trainer")} added you as a client on VFit, ` +
      "the app for booking and following your sessions. Confirm your account and choose a password " +
      "with the button below. You can also sign in with Google using this email address. " +
      "The link expires after one hour: if it has, use \"Forgot password\" with this address.",
    actionLabel: "Confirm your account",
  }),
  es: (n, c) => ({
    subject: `${trainer(n, "Tu entrenador")} te ha añadido como cliente en VFit`,
    body: `Hola ${c}, ${trainer(n, "tu entrenador")} te ha añadido como cliente en VFit, ` +
      "la app para reservar y seguir tus sesiones. Confirma tu cuenta y elige una contraseña " +
      "con el botón de abajo. También puedes acceder con Google usando esta dirección de email. " +
      "El enlace caduca en una hora: si ha caducado, usa \"¿Olvidaste tu contraseña?\" con esta dirección.",
    actionLabel: "Confirma tu cuenta",
  }),
  fr: (n, c) => ({
    subject: `${trainer(n, "Votre coach")} vous a ajouté comme client sur VFit`,
    body: `Bonjour ${c}, ${trainer(n, "votre coach")} vous a ajouté comme client sur VFit, ` +
      "l'application pour réserver et suivre vos séances. Confirmez votre compte et choisissez un mot de passe " +
      "avec le bouton ci-dessous. Vous pouvez aussi vous connecter avec Google en utilisant cette adresse e-mail. " +
      "Le lien expire au bout d'une heure : s'il a expiré, utilisez « Mot de passe oublié » avec cette adresse.",
    actionLabel: "Confirmer votre compte",
  }),
  de: (n, c) => ({
    subject: `${trainer(n, "Dein Trainer")} hat dich als Kunden auf VFit hinzugefügt`,
    body: `Hallo ${c}, ${trainer(n, "dein Trainer")} hat dich als Kunden auf VFit hinzugefügt, ` +
      "der App zum Buchen und Verfolgen deiner Einheiten. Bestätige dein Konto und wähle ein Passwort " +
      "über die Schaltfläche unten. Du kannst dich auch mit Google über diese E-Mail-Adresse anmelden. " +
      "Der Link läuft nach einer Stunde ab: Falls er abgelaufen ist, nutze „Passwort vergessen“ mit dieser Adresse.",
    actionLabel: "Konto bestätigen",
  }),
};

export function buildClientAddedMessage(locale: unknown, trainerName: string | null | undefined): RenderedMessage {
  return CLIENT_ADDED_MESSAGES[resolveLocale(locale)](trainerName);
}

export function buildClientInviteEmail(locale: unknown, trainerName: string | null | undefined): InviteEmail {
  return CLIENT_INVITE_EMAILS[resolveLocale(locale)](trainerName);
}

export function buildClientAccountEmail(
  locale: unknown,
  trainerName: string | null | undefined,
  clientName: string,
): InviteEmail {
  return CLIENT_ACCOUNT_EMAILS[resolveLocale(locale)](trainerName, clientName);
}
