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
  | "rescheduled"
  | "completed"
  | "payment_confirmed"
  | "payment_client_confirmed"
  | "payment_disputed"
  | "completion_reminder"
  | "new_request"
  | "reminder_24h"
  | "reminder_2h"
  /** The trainer put a session in the client's calendar (createBookingAsTrainer). */
  | "scheduled_by_trainer";

export interface MessageContext {
  serviceName?: string;
  trainerName?: string;
  clientName?: string;
  amount?: number;
  /** Free-text cancellation reason, shown to the other side when present. */
  reason?: string;
  /** Client cancelled inside the late-cancellation window (pilot: informational only). */
  late?: boolean;
  /** Venue bookings only; trainer sessions have no venue and fall back to the trainer. */
  venueName?: string;
  /** Session start, rendered in Europe/Rome time in the recipient's locale. */
  startsAt?: Date;
  /** XP the client earns by confirming the service was received. */
  xp?: number;
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

/** " (lun 5 ott, 10:00)" in the recipient's language, or "" when the start is unknown. */
function when(ctx: MessageContext, locale: AppLocale): string {
  const d = ctx.startsAt;
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return "";
  const formatted = new Intl.DateTimeFormat(locale, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Rome",
  }).format(d);
  return ` (${formatted})`;
}

/** The late-cancellation sentence when the client cancelled late, else "". */
function late(ctx: MessageContext, sentence: string): string {
  return ctx.late ? sentence : "";
}

/** " Motivo: …" suffix, or "" when no reason was given. */
function reason(ctx: MessageContext, label: string): string {
  const r = ctx.reason?.trim();
  return r ? ` ${label} ${r}` : "";
}

/** Where the session happens: the venue when there is one, else who it is with. */
function place(ctx: MessageContext, atVenue: string, withTrainer: string): string {
  const venue = ctx.venueName?.trim();
  if (venue) return ` ${atVenue} ${venue}`;
  const trainer = ctx.trainerName?.trim();
  return trainer ? ` ${withTrainer} ${trainer}` : "";
}

/** " +50 XP" style suffix sentence, or "" when no XP is on offer. */
function xpLine(ctx: MessageContext, render: (xp: number) => string): string {
  return typeof ctx.xp === "number" && ctx.xp > 0 ? ` ${render(ctx.xp)}` : "";
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
      title: "Prenotazione annullata",
      body: `La prenotazione per ${svc(c, "la sessione")} è stata annullata dal cliente.` +
        late(c, " Annullamento tardivo: meno di 24 ore dall'inizio."),
    }),
    cancelled_by_trainer: (c) => ({
      title: "Prenotazione annullata",
      body: `La prenotazione per ${svc(c, "la sessione")} è stata annullata dal trainer.${reason(c, "Motivo:")}`,
    }),
    rescheduled: (c) => ({
      title: "Prenotazione spostata",
      body: `La sessione di ${svc(c, "allenamento")} è stata spostata. Trovi il nuovo orario nell'app.`,
    }),
    completed: (c) => ({
      title: "Sessione completata",
      body: `La sessione di ${svc(c, "allenamento")} è stata segnata come svolta.`,
    }),
    payment_confirmed: (c) => ({
      title: "Conferma il servizio ricevuto",
      body: `Il trainer ha registrato il pagamento di ${money(c.amount)} per ${svc(c, "la sessione")}. ` +
        `Conferma di aver ricevuto il servizio.${xpLine(c, (xp) => `Guadagni +${xp} XP.`)}`,
    }),
    payment_client_confirmed: (c) => ({
      title: "Servizio confermato",
      body: `Il cliente ha confermato di aver ricevuto ${svc(c, "la sessione")} e il pagamento.`,
    }),
    payment_disputed: (c) => ({
      title: "Pagamento contestato",
      body: `Il cliente ha contestato il pagamento per ${svc(c, "la sessione")}. Lo staff verificherà.`,
    }),
    completion_reminder: (c) => ({
      title: "Sessione svolta?",
      body: `Segna come svolta la sessione di ${svc(c, "allenamento")} e registra il pagamento.`,
    }),
    new_request: (c) => ({
      title: "Nuova richiesta di prenotazione",
      body: `${c.clientName?.trim() || "Un cliente"} ha richiesto ${svc(c, "una sessione")}${when(c, "it")}.` +
        " Accetta o rifiuta dall'app.",
    }),
    reminder_24h: (c) => ({
      title: "Promemoria prenotazione",
      body: `Ricorda: domani hai ${svc(c, "una sessione")}${place(c, "presso", "con")}.`,
    }),
    reminder_2h: (c) => ({
      title: "Tra poco!",
      body: `${svc(c, "La tua sessione")} inizia tra 2 ore${place(c, "presso", "con")}.`,
    }),
    scheduled_by_trainer: (c) => ({
      title: "Nuova sessione in calendario",
      body: `${c.trainerName?.trim() || "Il tuo trainer"} ha fissato ${svc(c, "una sessione")}${when(c, "it")}.` +
        " La trovi tra le tue prenotazioni.",
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
      body: `The booking for ${svc(c, "the session")} was cancelled by the client.` +
        late(c, " Late cancellation: less than 24 hours before the start."),
    }),
    cancelled_by_trainer: (c) => ({
      title: "Booking cancelled",
      body: `The booking for ${svc(c, "the session")} was cancelled by the trainer.${reason(c, "Reason:")}`,
    }),
    rescheduled: (c) => ({
      title: "Booking moved",
      body: `Your ${svc(c, "training")} session has been moved. The new time is in the app.`,
    }),
    completed: (c) => ({
      title: "Session completed",
      body: `Your ${svc(c, "training")} session has been marked as done.`,
    }),
    payment_confirmed: (c) => ({
      title: "Confirm you received the service",
      body: `Your trainer recorded a payment of ${money(c.amount)} for ${svc(c, "the session")}. ` +
        `Confirm you received the service.${xpLine(c, (xp) => `You earn +${xp} XP.`)}`,
    }),
    payment_client_confirmed: (c) => ({
      title: "Service confirmed",
      body: `The client confirmed they received ${svc(c, "the session")} and the payment.`,
    }),
    payment_disputed: (c) => ({
      title: "Payment disputed",
      body: `The client disputed the payment for ${svc(c, "the session")}. Our team will review it.`,
    }),
    completion_reminder: (c) => ({
      title: "Session done?",
      body: `Mark your ${svc(c, "training")} session as done and record the payment.`,
    }),
    new_request: (c) => ({
      title: "New booking request",
      body: `${c.clientName?.trim() || "A client"} requested ${svc(c, "a session")}${when(c, "en")}.` +
        " Accept or decline it in the app.",
    }),
    reminder_24h: (c) => ({
      title: "Booking reminder",
      body: `Reminder: tomorrow you have ${svc(c, "a session")}${place(c, "at", "with")}.`,
    }),
    reminder_2h: (c) => ({
      title: "Starting soon!",
      body: `${svc(c, "Your session")} starts in 2 hours${place(c, "at", "with")}.`,
    }),
    scheduled_by_trainer: (c) => ({
      title: "New session booked",
      body: `${c.trainerName?.trim() || "Your trainer"} booked ${svc(c, "a session")}${when(c, "en")} for you.` +
        " You'll find it in your bookings.",
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
      body: `La reserva de ${svc(c, "la sesión")} ha sido cancelada por el cliente.` +
        late(c, " Cancelación tardía: menos de 24 horas antes del inicio."),
    }),
    cancelled_by_trainer: (c) => ({
      title: "Reserva cancelada",
      body: `La reserva de ${svc(c, "la sesión")} ha sido cancelada por el entrenador.${reason(c, "Motivo:")}`,
    }),
    rescheduled: (c) => ({
      title: "Reserva cambiada",
      body: `La sesión de ${svc(c, "entrenamiento")} se ha cambiado de hora. Tienes el nuevo horario en la app.`,
    }),
    completed: (c) => ({
      title: "Sesión completada",
      body: `La sesión de ${svc(c, "entrenamiento")} se ha marcado como realizada.`,
    }),
    payment_confirmed: (c) => ({
      title: "Confirma el servicio recibido",
      body: `Tu entrenador ha registrado un pago de ${money(c.amount)} por ${svc(c, "la sesión")}. ` +
        `Confirma que has recibido el servicio.${xpLine(c, (xp) => `Ganas +${xp} XP.`)}`,
    }),
    payment_client_confirmed: (c) => ({
      title: "Servicio confirmado",
      body: `El cliente ha confirmado que ha recibido ${svc(c, "la sesión")} y el pago.`,
    }),
    payment_disputed: (c) => ({
      title: "Pago cuestionado",
      body: `El cliente ha cuestionado el pago de ${svc(c, "la sesión")}. El equipo lo revisará.`,
    }),
    completion_reminder: (c) => ({
      title: "¿Sesión realizada?",
      body: `Marca la sesión de ${svc(c, "entrenamiento")} como realizada y registra el pago.`,
    }),
    new_request: (c) => ({
      title: "Nueva solicitud de reserva",
      body: `${c.clientName?.trim() || "Un cliente"} ha solicitado ${svc(c, "una sesión")}${when(c, "es")}.` +
        " Acéptala o recházala en la app.",
    }),
    reminder_24h: (c) => ({
      title: "Recordatorio de reserva",
      body: `Recuerda: mañana tienes ${svc(c, "una sesión")}${place(c, "en", "con")}.`,
    }),
    reminder_2h: (c) => ({
      title: "¡Falta poco!",
      body: `${svc(c, "Tu sesión")} empieza en 2 horas${place(c, "en", "con")}.`,
    }),
    scheduled_by_trainer: (c) => ({
      title: "Nueva sesión en tu calendario",
      body: `${c.trainerName?.trim() || "Tu entrenador"} ha programado ${svc(c, "una sesión")}${when(c, "es")}.` +
        " La encontrarás en tus reservas.",
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
      body: `La réservation pour ${svc(c, "la séance")} a été annulée par le client.` +
        late(c, " Annulation tardive : moins de 24 heures avant le début."),
    }),
    cancelled_by_trainer: (c) => ({
      title: "Réservation annulée",
      body: `La réservation pour ${svc(c, "la séance")} a été annulée par le coach.${reason(c, "Motif :")}`,
    }),
    rescheduled: (c) => ({
      title: "Réservation déplacée",
      body: `La séance de ${svc(c, "training")} a été déplacée. Le nouvel horaire est dans l'app.`,
    }),
    completed: (c) => ({
      title: "Séance terminée",
      body: `La séance de ${svc(c, "training")} a été marquée comme effectuée.`,
    }),
    payment_confirmed: (c) => ({
      title: "Confirmez la prestation reçue",
      body: `Votre coach a enregistré un paiement de ${money(c.amount)} pour ${svc(c, "la séance")}. ` +
        `Confirmez avoir reçu la prestation.${xpLine(c, (xp) => `Vous gagnez +${xp} XP.`)}`,
    }),
    payment_client_confirmed: (c) => ({
      title: "Prestation confirmée",
      body: `Le client a confirmé avoir reçu ${svc(c, "la séance")} et le paiement.`,
    }),
    payment_disputed: (c) => ({
      title: "Paiement contesté",
      body: `Le client a contesté le paiement pour ${svc(c, "la séance")}. Notre équipe va vérifier.`,
    }),
    completion_reminder: (c) => ({
      title: "Séance effectuée ?",
      body: `Marquez la séance de ${svc(c, "training")} comme effectuée et enregistrez le paiement.`,
    }),
    new_request: (c) => ({
      title: "Nouvelle demande de réservation",
      body: `${c.clientName?.trim() || "Un client"} a demandé ${svc(c, "une séance")}${when(c, "fr")}.` +
        " Acceptez-la ou refusez-la dans l'app.",
    }),
    reminder_24h: (c) => ({
      title: "Rappel de réservation",
      body: `Rappel : demain vous avez ${svc(c, "une séance")}${place(c, "à", "avec")}.`,
    }),
    reminder_2h: (c) => ({
      title: "C'est bientôt !",
      body: `${svc(c, "Votre séance")} commence dans 2 heures${place(c, "à", "avec")}.`,
    }),
    scheduled_by_trainer: (c) => ({
      title: "Nouvelle séance au calendrier",
      body: `${c.trainerName?.trim() || "Votre coach"} a planifié ${svc(c, "une séance")}${when(c, "fr")}.` +
        " Vous la trouverez dans vos réservations.",
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
      body: `Die Buchung für ${svc(c, "die Einheit")} wurde vom Kunden storniert.` +
        late(c, " Kurzfristige Stornierung: weniger als 24 Stunden vor Beginn."),
    }),
    cancelled_by_trainer: (c) => ({
      title: "Buchung storniert",
      body: `Die Buchung für ${svc(c, "die Einheit")} wurde vom Trainer storniert.${reason(c, "Grund:")}`,
    }),
    rescheduled: (c) => ({
      title: "Buchung verschoben",
      body: `Die ${svc(c, "Trainings")}-Einheit wurde verschoben. Die neue Uhrzeit steht in der App.`,
    }),
    completed: (c) => ({
      title: "Einheit abgeschlossen",
      body: `Die ${svc(c, "Trainings")}-Einheit wurde als durchgeführt markiert.`,
    }),
    payment_confirmed: (c) => ({
      title: "Erhaltene Leistung bestätigen",
      body: `Dein Trainer hat eine Zahlung von ${money(c.amount)} für ${svc(c, "die Einheit")} erfasst. ` +
        `Bestätige, dass du die Leistung erhalten hast.${xpLine(c, (xp) => `Du erhältst +${xp} XP.`)}`,
    }),
    payment_client_confirmed: (c) => ({
      title: "Leistung bestätigt",
      body: `Der Kunde hat bestätigt, ${svc(c, "die Einheit")} erhalten und bezahlt zu haben.`,
    }),
    payment_disputed: (c) => ({
      title: "Zahlung beanstandet",
      body: `Der Kunde hat die Zahlung für ${svc(c, "die Einheit")} beanstandet. Das Team prüft das.`,
    }),
    completion_reminder: (c) => ({
      title: "Einheit durchgeführt?",
      body: `Markiere die ${svc(c, "Trainings")}-Einheit als durchgeführt und erfasse die Zahlung.`,
    }),
    new_request: (c) => ({
      title: "Neue Buchungsanfrage",
      body: `${c.clientName?.trim() || "Ein Kunde"} hat angefragt: ${svc(c, "eine Einheit")}${when(c, "de")}.` +
        " Nimm sie in der App an oder lehne sie ab.",
    }),
    reminder_24h: (c) => ({
      title: "Buchungserinnerung",
      body: `Erinnerung: Morgen hast du ${svc(c, "eine Einheit")}${place(c, "in", "mit")}.`,
    }),
    reminder_2h: (c) => ({
      title: "Gleich geht's los!",
      body: `${svc(c, "Deine Einheit")} beginnt in 2 Stunden${place(c, "in", "mit")}.`,
    }),
    scheduled_by_trainer: (c) => ({
      title: "Neue Einheit im Kalender",
      body: `${c.trainerName?.trim() || "Dein Trainer"} hat ${svc(c, "eine Einheit")}${when(c, "de")}` +
        " für dich eingetragen. Du findest sie in deinen Buchungen.",
    }),
  },
};

/** Narrows arbitrary stored input to a supported locale, defaulting to Italian. */
export function resolveLocale(input: unknown): AppLocale {
  if (typeof input !== "string") return DEFAULT_LOCALE;
  return (SUPPORTED_LOCALES as readonly string[]).includes(input) ?
    (input as AppLocale) :
    DEFAULT_LOCALE;
}

export function buildMessage(
  event: BookingMessageEvent,
  locale: unknown,
  ctx: MessageContext = {}
): RenderedMessage {
  return BOOKING_MESSAGES[resolveLocale(locale)][event](ctx);
}
