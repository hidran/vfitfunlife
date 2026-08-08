/**
 * Server-side notification copy for booking transitions, in all five supported locales.
 *
 * This is deliberately separate from `src/i18n/messages/` — that is a client bundle and
 * Cloud Functions cannot import it. Italian is authoritative (the Torino pilot); the other
 * locales are translations of it.
 *
 * Spec: docs/superpowers/specs/2026-08-08-booking-manual-payment-design.md §9
 */

export const SUPPORTED_LOCALES = ["it", "en", "es", "fr", "de"] as const;
export type AppLocale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: AppLocale = "it";

export type BookingMessageEvent =
  | "accepted"
  | "declined"
  | "cancelled_by_client"
  | "cancelled_by_trainer"
  | "completed"
  | "payment_confirmed"
  | "payment_client_confirmed"
  | "payment_disputed"
  | "completion_reminder";

export interface MessageContext {
  serviceName?: string;
  trainerName?: string;
  clientName?: string;
  amount?: number;
}

export interface RenderedMessage {
  title: string;
  body: string;
}

type Template = (ctx: MessageContext) => RenderedMessage;

/** Neutral fallbacks so a missing context field never renders "undefined" to a user. */
function svc(ctx: MessageContext, fallback: string): string {
  return ctx.serviceName?.trim() || fallback;
}

function money(amount: number | undefined): string {
  if (typeof amount !== "number" || !Number.isFinite(amount)) return "—";
  return `${amount.toFixed(2).replace(/\.00$/, "")} €`;
}

export const BOOKING_MESSAGES: Record<AppLocale, Record<BookingMessageEvent, Template>> = {
  it: {
    accepted: (c) => ({
      title: "Prenotazione accettata",
      body: `Il trainer ha accettato la tua richiesta per ${svc(c, "la sessione")}.`,
    }),
    declined: (c) => ({
      title: "Prenotazione rifiutata",
      body: `Il trainer non può accettare la tua richiesta per ${svc(c, "la sessione")}.`,
    }),
    cancelled_by_client: (c) => ({
      title: "Prenotazione cancellata",
      body: `La prenotazione per ${svc(c, "la sessione")} è stata cancellata dal cliente.`,
    }),
    cancelled_by_trainer: (c) => ({
      title: "Prenotazione cancellata",
      body: `La prenotazione per ${svc(c, "la sessione")} è stata cancellata dal trainer.`,
    }),
    completed: (c) => ({
      title: "Sessione completata",
      body: `La sessione di ${svc(c, "allenamento")} è stata segnata come svolta.`,
    }),
    payment_confirmed: (c) => ({
      title: "Conferma il pagamento",
      body: `Il trainer ha confermato il pagamento di ${money(c.amount)} per ${svc(c, "la sessione")}. Confermi?`,
    }),
    payment_client_confirmed: (c) => ({
      title: "Pagamento confermato",
      body: `Il cliente ha confermato il pagamento per ${svc(c, "la sessione")}.`,
    }),
    payment_disputed: (c) => ({
      title: "Pagamento contestato",
      body: `Il cliente ha contestato il pagamento per ${svc(c, "la sessione")}. Lo staff verificherà.`,
    }),
    completion_reminder: (c) => ({
      title: "Sessione svolta?",
      body: `Segna come svolta la sessione di ${svc(c, "allenamento")} e registra il pagamento.`,
    }),
  },

  en: {
    accepted: (c) => ({
      title: "Booking accepted",
      body: `Your trainer accepted your request for ${svc(c, "the session")}.`,
    }),
    declined: (c) => ({
      title: "Booking declined",
      body: `Your trainer can't take your request for ${svc(c, "the session")}.`,
    }),
    cancelled_by_client: (c) => ({
      title: "Booking cancelled",
      body: `The booking for ${svc(c, "the session")} was cancelled by the client.`,
    }),
    cancelled_by_trainer: (c) => ({
      title: "Booking cancelled",
      body: `The booking for ${svc(c, "the session")} was cancelled by the trainer.`,
    }),
    completed: (c) => ({
      title: "Session completed",
      body: `Your ${svc(c, "training")} session has been marked as done.`,
    }),
    payment_confirmed: (c) => ({
      title: "Confirm the payment",
      body: `Your trainer recorded a payment of ${money(c.amount)} for ${svc(c, "the session")}. Confirm?`,
    }),
    payment_client_confirmed: (c) => ({
      title: "Payment confirmed",
      body: `The client confirmed the payment for ${svc(c, "the session")}.`,
    }),
    payment_disputed: (c) => ({
      title: "Payment disputed",
      body: `The client disputed the payment for ${svc(c, "the session")}. Our team will review it.`,
    }),
    completion_reminder: (c) => ({
      title: "Session done?",
      body: `Mark your ${svc(c, "training")} session as done and record the payment.`,
    }),
  },

  es: {
    accepted: (c) => ({
      title: "Reserva aceptada",
      body: `Tu entrenador ha aceptado tu solicitud de ${svc(c, "la sesión")}.`,
    }),
    declined: (c) => ({
      title: "Reserva rechazada",
      body: `Tu entrenador no puede aceptar tu solicitud de ${svc(c, "la sesión")}.`,
    }),
    cancelled_by_client: (c) => ({
      title: "Reserva cancelada",
      body: `La reserva de ${svc(c, "la sesión")} ha sido cancelada por el cliente.`,
    }),
    cancelled_by_trainer: (c) => ({
      title: "Reserva cancelada",
      body: `La reserva de ${svc(c, "la sesión")} ha sido cancelada por el entrenador.`,
    }),
    completed: (c) => ({
      title: "Sesión completada",
      body: `La sesión de ${svc(c, "entrenamiento")} se ha marcado como realizada.`,
    }),
    payment_confirmed: (c) => ({
      title: "Confirma el pago",
      body: `Tu entrenador ha registrado un pago de ${money(c.amount)} por ${svc(c, "la sesión")}. ¿Lo confirmas?`,
    }),
    payment_client_confirmed: (c) => ({
      title: "Pago confirmado",
      body: `El cliente ha confirmado el pago de ${svc(c, "la sesión")}.`,
    }),
    payment_disputed: (c) => ({
      title: "Pago cuestionado",
      body: `El cliente ha cuestionado el pago de ${svc(c, "la sesión")}. El equipo lo revisará.`,
    }),
    completion_reminder: (c) => ({
      title: "¿Sesión realizada?",
      body: `Marca la sesión de ${svc(c, "entrenamiento")} como realizada y registra el pago.`,
    }),
  },

  fr: {
    accepted: (c) => ({
      title: "Réservation acceptée",
      body: `Votre coach a accepté votre demande pour ${svc(c, "la séance")}.`,
    }),
    declined: (c) => ({
      title: "Réservation refusée",
      body: `Votre coach ne peut pas accepter votre demande pour ${svc(c, "la séance")}.`,
    }),
    cancelled_by_client: (c) => ({
      title: "Réservation annulée",
      body: `La réservation pour ${svc(c, "la séance")} a été annulée par le client.`,
    }),
    cancelled_by_trainer: (c) => ({
      title: "Réservation annulée",
      body: `La réservation pour ${svc(c, "la séance")} a été annulée par le coach.`,
    }),
    completed: (c) => ({
      title: "Séance terminée",
      body: `La séance de ${svc(c, "training")} a été marquée comme effectuée.`,
    }),
    payment_confirmed: (c) => ({
      title: "Confirmez le paiement",
      body: `Votre coach a enregistré un paiement de ${money(c.amount)} pour ${svc(c, "la séance")}. Confirmez-vous ?`,
    }),
    payment_client_confirmed: (c) => ({
      title: "Paiement confirmé",
      body: `Le client a confirmé le paiement pour ${svc(c, "la séance")}.`,
    }),
    payment_disputed: (c) => ({
      title: "Paiement contesté",
      body: `Le client a contesté le paiement pour ${svc(c, "la séance")}. Notre équipe va vérifier.`,
    }),
    completion_reminder: (c) => ({
      title: "Séance effectuée ?",
      body: `Marquez la séance de ${svc(c, "training")} comme effectuée et enregistrez le paiement.`,
    }),
  },

  de: {
    accepted: (c) => ({
      title: "Buchung angenommen",
      body: `Dein Trainer hat deine Anfrage für ${svc(c, "die Einheit")} angenommen.`,
    }),
    declined: (c) => ({
      title: "Buchung abgelehnt",
      body: `Dein Trainer kann deine Anfrage für ${svc(c, "die Einheit")} nicht annehmen.`,
    }),
    cancelled_by_client: (c) => ({
      title: "Buchung storniert",
      body: `Die Buchung für ${svc(c, "die Einheit")} wurde vom Kunden storniert.`,
    }),
    cancelled_by_trainer: (c) => ({
      title: "Buchung storniert",
      body: `Die Buchung für ${svc(c, "die Einheit")} wurde vom Trainer storniert.`,
    }),
    completed: (c) => ({
      title: "Einheit abgeschlossen",
      body: `Die ${svc(c, "Trainings")}-Einheit wurde als durchgeführt markiert.`,
    }),
    payment_confirmed: (c) => ({
      title: "Zahlung bestätigen",
      body: `Dein Trainer hat eine Zahlung von ${money(c.amount)} für ${svc(c, "die Einheit")} erfasst. Bestätigen?`,
    }),
    payment_client_confirmed: (c) => ({
      title: "Zahlung bestätigt",
      body: `Der Kunde hat die Zahlung für ${svc(c, "die Einheit")} bestätigt.`,
    }),
    payment_disputed: (c) => ({
      title: "Zahlung beanstandet",
      body: `Der Kunde hat die Zahlung für ${svc(c, "die Einheit")} beanstandet. Das Team prüft das.`,
    }),
    completion_reminder: (c) => ({
      title: "Einheit durchgeführt?",
      body: `Markiere die ${svc(c, "Trainings")}-Einheit als durchgeführt und erfasse die Zahlung.`,
    }),
  },
};

/** Narrows arbitrary stored input to a supported locale, defaulting to Italian. */
export function resolveLocale(input: unknown): AppLocale {
  if (typeof input !== "string") return DEFAULT_LOCALE;
  return (SUPPORTED_LOCALES as readonly string[]).includes(input)
    ? (input as AppLocale)
    : DEFAULT_LOCALE;
}

export function buildMessage(
  event: BookingMessageEvent,
  locale: unknown,
  ctx: MessageContext = {}
): RenderedMessage {
  return BOOKING_MESSAGES[resolveLocale(locale)][event](ctx);
}
